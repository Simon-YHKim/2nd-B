// H4 (Simon 2026-08-16, K1): the transcribe LIVE path had NO tests, and the
// source said so about itself -- "the live branch follows the same inline-data
// client pattern as the image path in callLlm but has NOT been run on a real
// recording yet". Voice capture and call reflection both ride this function, so
// "untested" meant the app's only audio feature could be broken in production
// while CI stayed green.
//
// What these tests can and cannot prove. They cannot prove the vendor returns a
// good transcript -- that needs a live key and a real voice. They CAN prove every
// part that fails silently: that real audio bytes survive the base64 round trip,
// that the request is assembled in the shape each backend expects, that the audio
// lands on the proxy the multimodal switch names, and that a crisis-bearing
// transcript is intercepted rather than handed back. Those are the failure modes
// that would otherwise be discovered by a user.
//
// Which proxy carries the audio is EXPO_PUBLIC_MULTIMODAL_VENDOR (routing.ts
// multimodalVendor()). Since T1 stage A (2026-08-31) an UNSET switch resolves to
// openai-proxy; "gemini" is still accepted explicitly and routes to gemini-proxy,
// which is the one-variable rollback. Both are pinned below so a default flip in
// either direction shows up here instead of on a user's voice memo.
//
// The audio here is synthesised, not a fixture: a real RIFF/WAVE container with
// real PCM samples, generated in-process. That keeps the suite hermetic while
// still exercising the byte path with something a decoder would accept, rather
// than a string pretending to be audio.

const mockInvoke = jest.fn();
const mockGenerateContent = jest.fn();
const mockClassifySafety = jest.fn();
const mockInsertAudit = jest.fn().mockResolvedValue(undefined);

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));

jest.mock("../safety", () => {
  const actual = jest.requireActual("../safety");
  return { ...actual, classifySafety: (...args: unknown[]) => mockClassifySafety(...args) };
});

// Audit rows go through the outbox, not straight to Supabase, so that is the
// seam to observe. Mocking insertAiAuditLog instead would watch a function this
// path never calls directly and pass while auditing nothing.
jest.mock("../audit-write-outbox", () => ({
  enqueueAuditWrite: (submission: unknown) => mockInsertAudit(submission),
}));
jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

/** Every ai_audit_log payload handed to the outbox during a test. */
function auditPayloads(): Array<Record<string, unknown>> {
  return mockInsertAudit.mock.calls
    .map((c) => c[0] as { kind?: string; payload?: Record<string, unknown> })
    .filter((s) => s?.kind === "ai_audit_log")
    .map((s) => s.payload ?? {});
}

let envMode: "live" | "mock" = "live";
let viaEdge = true;
jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: envMode,
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: viaEdge,
    EXPO_PUBLIC_USE_VERTEX: false,
    EXPO_PUBLIC_GEMINI_API_KEY: "",
  }),
}));

jest.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: (...a: unknown[]) => mockGenerateContent(...a) };
  },
}));

import { transcribeAudio } from "../boundary";

/**
 * A real 16-bit mono PCM WAV, synthesised. Not a fixture and not a stub string:
 * a decoder would accept these bytes, so the base64 path is exercised with
 * something audio-shaped rather than "AAAA".
 */
function synthWavBase64(seconds = 0.25, sampleRate = 8000, hz = 440): string {
  const n = Math.floor(seconds * sampleRate);
  const dataBytes = n * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // format = PCM
  buf.writeUInt16LE(1, 22); // channels
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * hz * i) / sampleRate) * 12000);
    buf.writeInt16LE(v, 44 + i * 2);
  }
  return buf.toString("base64");
}

const AUDIO = synthWavBase64();
const BASE = { userId: "u-1", locale: "ko" as const, base64: AUDIO, mimeType: "audio/wav" };

// multimodalVendor() reads process.env directly, not getEnv(), so the mocked
// env above does not reach it. Start every test from the UNSET posture and put
// the shell's value back afterwards so this suite cannot leak into another.
const MULTIMODAL_KEY = "EXPO_PUBLIC_MULTIMODAL_VENDOR";
const originalMultimodal = process.env[MULTIMODAL_KEY];

beforeEach(() => {
  jest.clearAllMocks();
  envMode = "live";
  viaEdge = true;
  delete process.env[MULTIMODAL_KEY];
  mockClassifySafety.mockResolvedValue({ zone: "green", triggers: [], confidence: 0.1, cssrsLevel: 0 });
});

afterAll(() => {
  if (originalMultimodal === undefined) delete process.env[MULTIMODAL_KEY];
  else process.env[MULTIMODAL_KEY] = originalMultimodal;
});

describe("transcribeAudio · synthesised audio survives the byte path", () => {
  it("produces a WAV that is actually decodable, not a placeholder string", () => {
    const raw = Buffer.from(AUDIO, "base64");
    expect(raw.subarray(0, 4).toString()).toBe("RIFF");
    expect(raw.subarray(8, 12).toString()).toBe("WAVE");
    // Header says how many PCM bytes follow; the buffer must actually carry them.
    const declared = raw.readUInt32LE(40);
    expect(raw.length).toBe(44 + declared);
    expect(declared).toBeGreaterThan(0);
  });

  it("forwards the audio to openai-proxy byte-identically when the multimodal switch is unset", async () => {
    mockInvoke.mockResolvedValue({ data: { text: "안녕하세요", audited: true }, error: null });
    await transcribeAudio(BASE);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mockInvoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    // Unset is openai since T1 stage A (2026-08-31); gemini-proxy is no longer
    // the fallback for the binary-carrying seats.
    expect(fn).toBe("openai-proxy");
    const audio = opts.body.audio as { mimeType: string; data: string };
    // The exact bytes matter: a truncating or re-encoding step here would still
    // "work" for a short clip and fail on a real recording.
    expect(audio.data).toBe(AUDIO);
    expect(audio.mimeType).toBe("audio/wav");
    expect(opts.body.purpose).toBe("voice_transcribe");
  });

  it("still forwards the same audio to gemini-proxy when EXPO_PUBLIC_MULTIMODAL_VENDOR=gemini (rollback)", async () => {
    // The one-variable rollback: an explicit "gemini" must keep landing on
    // gemini-proxy with the identical wire shape, or the exit cannot be undone
    // from the console.
    process.env[MULTIMODAL_KEY] = "gemini";
    mockInvoke.mockResolvedValue({ data: { text: "안녕하세요", audited: true }, error: null });
    await transcribeAudio(BASE);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mockInvoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fn).toBe("gemini-proxy");
    const audio = opts.body.audio as { mimeType: string; data: string };
    expect(audio.data).toBe(AUDIO);
    expect(audio.mimeType).toBe("audio/wav");
    expect(opts.body.purpose).toBe("voice_transcribe");
  });
});

describe("transcribeAudio · edge path", () => {
  it("returns the proxy transcript and audits it", async () => {
    mockInvoke.mockResolvedValue({ data: { text: "  받아쓴 내용  ", audited: false }, error: null });
    const r = await transcribeAudio(BASE);

    expect(r.text).toBe("받아쓴 내용"); // trimmed
    expect(r.safety.zone).toBe("green");
    const rows = auditPayloads();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].purpose).toBe("voice_transcribe");
  });

  it("propagates a proxy error instead of returning an empty transcript", async () => {
    // Swallowing this would hand the user a blank note and no reason for it.
    mockInvoke.mockResolvedValue({ data: null, error: new Error("proxy 500") });
    await expect(transcribeAudio(BASE)).rejects.toThrow("proxy 500");
  });

  it("does not call the direct client on the edge path", async () => {
    mockInvoke.mockResolvedValue({ data: { text: "ok", audited: true }, error: null });
    await transcribeAudio(BASE);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe("transcribeAudio · crisis output is intercepted, not returned", () => {
  it("swaps a red-zone transcript for the fixed template and audits the swap", async () => {
    // The transcript is what the model heard. If it carries crisis content, the
    // user must get the crisis response, not their own words read back.
    mockInvoke.mockResolvedValue({ data: { text: "죽고 싶어", audited: true }, error: null });
    mockClassifySafety.mockResolvedValue({ zone: "red", triggers: ["suicidal_ideation"], confidence: 0.9, cssrsLevel: 4 });

    const r = await transcribeAudio(BASE);

    expect(r.safety.zone).toBe("red");
    expect(r.text).not.toBe("죽고 싶어");
    expect(r.text.length).toBeGreaterThan(0);

    // The swap row must exist even though the proxy already audited the call:
    // the proxy recorded a green pre-swap row, so without this the interception
    // leaves no trace at all.
    const swapRow = auditPayloads().find(
      (a) => typeof a.modelUsed === "string" && (a.modelUsed as string).includes("+swap:"),
    );
    expect(swapRow).toBeDefined();
    expect(swapRow?.safetyZone).toBe("red");
  });
});

describe("transcribeAudio · mock mode", () => {
  it("never touches the network and still audits", async () => {
    envMode = "mock";
    const r = await transcribeAudio(BASE);

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(r.text.length).toBeGreaterThan(0);
    expect(auditPayloads().length).toBeGreaterThan(0);
  });
});
