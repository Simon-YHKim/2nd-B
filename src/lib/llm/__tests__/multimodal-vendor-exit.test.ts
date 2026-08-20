// The Gemini exit, from the multimodal side (REQ-260821-01).
//
// OCR and voice memos are the only two purposes that carry a BINARY payload, so
// they can only run on a vendor whose proxy forwards one. Until 2026-08-21 that
// was gemini-proxy and nothing else, which is why routing pinned them there and
// why transcribeAudio invoked "gemini-proxy" as a literal.
//
// Simon retired Gemini on 2026-08-21 and Google stops accepting Standard keys in
// September, so the pin had to stop being a fact about capability and become a
// choice. openai-proxy grew both paths; this suite pins the two properties that
// make the switch safe:
//
//   1. merging this changes NOTHING - the default is still Gemini, because an
//      edge function does not carry new code until it is redeployed. Flipping
//      the default in the same change that adds the server path is the
//      0127/0130 deploy-before-flip trap.
//   2. one lever moves BOTH surfaces. If OCR and voice could be pointed at
//      different vendors by accident, the exit would be half-done and the half
//      left behind would die on Google's calendar, not on ours.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MULTIMODAL_PURPOSES,
  GEMINI_PINNED_PURPOSES,
  multimodalVendor,
  proxyFnForVendor,
  resolveVendorForPurpose,
} from "../routing";

const ENV_KEY = "EXPO_PUBLIC_MULTIMODAL_VENDOR";
const original = process.env[ENV_KEY];

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

const setVendor = (v: string | undefined) => {
  if (v === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = v;
};

describe("merging this does not move anybody", () => {
  test("unset still means Gemini", () => {
    setVendor(undefined);
    expect(multimodalVendor()).toBe("gemini");
  });

  test.each(["", "   ", "grok", "anthropic", "OPENAI_PROXY", "true"])(
    "an unrecognised value (%p) falls back to Gemini rather than to nothing",
    (v) => {
      setVendor(v);
      expect(multimodalVendor()).toBe("gemini");
    },
  );

  test("OCR and voice still route to gemini-proxy by default", () => {
    setVendor(undefined);
    for (const p of ["capture_ocr", "capture_voice"] as const) {
      expect(proxyFnForVendor(resolveVendorForPurpose(p, false))).toBe("gemini-proxy");
    }
    expect(proxyFnForVendor(resolveVendorForPurpose("interview_probe", true))).toBe("gemini-proxy");
  });
});

describe("one lever moves every binary-carrying surface", () => {
  test.each(["openai", "OpenAI", "  openai  "])("%p flips them together", (v) => {
    setVendor(v);
    expect(multimodalVendor()).toBe("openai");
    for (const p of ["capture_ocr", "capture_voice"] as const) {
      expect(resolveVendorForPurpose(p, false)).toBe("openai");
    }
    // Any image-bearing call, whatever its purpose, follows the same lever -
    // a text-only proxy cannot serve it at all.
    expect(resolveVendorForPurpose("interview_probe", true)).toBe("openai");
  });

  test("the capability constraint outranks every other switch", () => {
    // secondb_chat has its own vendor knob and the seats have theirs; neither
    // may send a binary to a proxy that cannot forward one.
    setVendor("openai");
    const prevChat = process.env.EXPO_PUBLIC_CHAT_VENDOR;
    process.env.EXPO_PUBLIC_CHAT_VENDOR = "claude";
    try {
      expect(resolveVendorForPurpose("secondb_chat", true)).toBe("openai");
    } finally {
      if (prevChat === undefined) delete process.env.EXPO_PUBLIC_CHAT_VENDOR;
      else process.env.EXPO_PUBLIC_CHAT_VENDOR = prevChat;
    }
  });

  test("the set still holds exactly the two binary purposes", () => {
    expect([...MULTIMODAL_PURPOSES].sort()).toEqual(["capture_ocr", "capture_voice"]);
    // The old name is an alias, not a copy: a future edit must not be able to
    // move one and leave the other behind.
    expect(GEMINI_PINNED_PURPOSES).toBe(MULTIMODAL_PURPOSES);
  });
});

describe("transcribeAudio no longer names a vendor", () => {
  const boundary = readFileSync(join(__dirname, "..", "boundary.ts"), "utf8");

  test("the edge path picks its function from the vendor", () => {
    expect(boundary).toMatch(/const audioFn = proxyFnForVendor\(multimodalVendor\(\)\);/);
    expect(boundary).toMatch(/functions\.invoke\(audioFn, \{/);
  });

  test("the transcribe path itself no longer hardcodes a proxy name", () => {
    // Scoped to transcribeAudio on purpose. ONE hardcoded "gemini-proxy"
    // remains elsewhere in this file and is meant to: the D-26 outage failover
    // in callLlm retries a failed vendor seat on the Phase 1 route.
    //
    // ⚠ That failover becomes a trap the moment gemini-proxy is decommissioned -
    // a failing OpenAI seat would then fail over to a function that no longer
    // exists. Deliberately left alone here, because the request is explicit
    // that Gemini references stay until the flip is verified in production;
    // it is written into the handoff as the console's follow-up.
    const start = boundary.indexOf("export async function transcribeAudio");
    expect(start).toBeGreaterThan(-1);
    // Bounded to this one function: slicing to EOF would pick up callAdvisor's
    // own failover and fail for a reason that has nothing to do with audio.
    const rest = boundary.slice(start + 1);
    const nextFn = rest.search(/\nexport (async )?function /);
    const body = (nextFn === -1 ? rest : rest.slice(0, nextFn)).replace(/\/\/[^\n]*/g, " ");
    expect(body).not.toMatch(/functions\.invoke\(\s*["']gemini-proxy["']/);
  });
});

describe("the reasoning seam can actually reach OpenAI", () => {
  const boundary = readFileSync(join(__dirname, "..", "boundary.ts"), "utf8");

  test("EXPO_PUBLIC_REASONING_PROVIDER=openai is no longer a silent no-op", () => {
    // It used to read `raw === "claude" ? "claude" : "gemini"`, so setting the
    // variable to openai left the app on Gemini with no error anywhere - the
    // exact failure that would have made the September exit look done when it
    // was not.
    expect(boundary).toMatch(/if \(raw === "claude" \|\| raw === "openai"\) return raw;/);
    expect(boundary).not.toMatch(/return raw === "claude" \? "claude" : "gemini";/);
  });
});

describe("openai-proxy can serve what the client will send it", () => {
  const proxy = readFileSync(
    join(__dirname, "..", "..", "..", "..", "supabase", "functions", "openai-proxy", "index.ts"),
    "utf8",
  );

  test("both wire labels are seated, or every call is 400 purpose_not_seated", () => {
    // capture_ocr is the PromptPurpose callLlm sends with an image;
    // voice_transcribe is the label transcribeAudio sends. They are NOT the
    // same string as the routing-side names, and the allowlist matches the wire.
    expect(proxy).toMatch(/^\s*capture_ocr: '/m);
    expect(proxy).toMatch(/^\s*voice_transcribe: '/m);
  });

  test("it validates binaries exactly as gemini-proxy did", () => {
    // Same caps and same mime allowlists: a payload the client considered valid
    // yesterday has to stay valid today.
    expect(proxy).toContain("MAX_IMAGE_BASE64_LEN = 2_700_000");
    expect(proxy).toContain("MAX_AUDIO_BASE64_LEN = 4_100_000");
    expect(proxy).toMatch(/image_mime_not_allowed/);
    expect(proxy).toMatch(/audio_mime_not_allowed/);
    expect(proxy).toMatch(/image_too_large/);
    expect(proxy).toMatch(/audio_too_large/);
  });

  test("audio goes to the transcription endpoint, not to chat completions", () => {
    expect(proxy).toContain("https://api.openai.com/v1/audio/transcriptions");
    expect(proxy).toMatch(/const isTranscription = audioPart !== null;/);
    // multipart: fetch must set its own boundary, so no content-type header.
    expect(proxy).toMatch(/NO content-type header/);
  });

  test("the transcription reply is read from {text}, not from choices", () => {
    // The chat extraction would yield '' for a perfectly good transcription,
    // and an empty transcript looks like a failed recording to the user.
    expect(proxy).toMatch(/isTranscription\s*\n?\s*\? \(typeof \(data as \{ text\?: unknown \}\)\?\.text === 'string'/);
  });

  test("refusal and truncation are chat-only concepts", () => {
    expect(proxy).toMatch(/const refused =\s*\n\s*!isTranscription &&/);
    expect(proxy).toMatch(/const truncated = !isTranscription &&/);
  });

  test("the transcription model id is env-settable, because it is unverified", () => {
    // Every other model id here is one the project has seen work. This one has
    // not been exercised, so it must be correctable without a redeploy.
    expect(proxy).toContain("OPENAI_TRANSCRIBE_MODEL");
    expect(proxy).toContain("CONFIRM THIS ID ON THE ACCOUNT");
  });

  test("the shared money and audit path is not forked", () => {
    // Both branches must go through one spend bump, one refund, one audit row.
    expect((proxy.match(/from\('ai_audit_log'\)\.insert/g) ?? []).length).toBe(1);
    expect((proxy.match(/rpc\('bump_gemini_spend'/g) ?? []).length).toBe(1);
  });
});
