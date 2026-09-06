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
//   1. the default moved exactly once, on purpose. Until T1 stage A
//      (2026-08-31) unset meant Gemini: an edge function does not carry new
//      code until it is redeployed, and flipping the default in the same change
//      that adds the server path is the 0127/0130 deploy-before-flip trap.
//      openai-proxy has carried both seats in production since v109
//      (2026-08-24), so unset now lands on openai (RETIRED_DEFAULT). "gemini"
//      stays an ACCEPTED explicit value - the one-variable rollback - until
//      gemini-proxy is deleted; it just never happens by default any more.
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

describe("unset lands on the retired default, never on a dead proxy", () => {
  test("unset means openai since T1 stage A (2026-08-31)", () => {
    setVendor(undefined);
    expect(multimodalVendor()).toBe("openai");
  });

  // "grok" is no longer junk anywhere - it is the xai alias. It stays out of
  // the multimodal switch for a different reason: that proxy carries no binary.
  test.each(["", "   ", "anthropic", "OPENAI_PROXY", "true", "xai", "grok"])(
    "an unrecognised value (%p) falls back to openai rather than to nothing",
    (v) => {
      setVendor(v);
      expect(multimodalVendor()).toBe("openai");
    },
  );

  test("OCR and voice route to openai-proxy by default", () => {
    setVendor(undefined);
    for (const p of ["capture_ocr", "capture_voice"] as const) {
      expect(proxyFnForVendor(resolveVendorForPurpose(p, false))).toBe("openai-proxy");
    }
    expect(proxyFnForVendor(resolveVendorForPurpose("interview_probe", true))).toBe("openai-proxy");
  });

  test("explicit gemini is still the one-variable rollback to gemini-proxy", () => {
    // The rollback property of T1 stage A: "gemini" is no longer a default
    // anywhere, but it stays an accepted operator value until gemini-proxy is
    // actually deleted. Pinned here so the final deletion PR has to come back
    // and change this test, not discover the gap in production.
    setVendor("gemini");
    expect(multimodalVendor()).toBe("gemini");
    for (const p of ["capture_ocr", "capture_voice"] as const) {
      expect(resolveVendorForPurpose(p, false)).toBe("gemini");
      expect(proxyFnForVendor(resolveVendorForPurpose(p, false))).toBe("gemini-proxy");
    }
    expect(proxyFnForVendor(resolveVendorForPurpose("interview_probe", true))).toBe("gemini-proxy");
  });
});

describe("one lever moves every binary-carrying surface", () => {
  test.each(["openai", "OpenAI", "  openai  "])("%p flips them together", (v) => {
    // Start from the OTHER vendor, so this proves the lever moves both
    // surfaces rather than restating the default (openai since T1 stage A).
    setVendor("gemini");
    for (const p of ["capture_ocr", "capture_voice"] as const) {
      expect(resolveVendorForPurpose(p, false)).toBe("gemini");
    }
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
    // Scoped to transcribeAudio on purpose — the rest of boundary.ts picks
    // every proxy through proxyFnForVendor too. (This comment used to say ONE
    // hardcoded "gemini-proxy" remained for the outage failover; #1361 made
    // that a switch and T1 stage A made its unset value "none", so no proxy
    // name is hardcoded anywhere in this file's code any more — the
    // gemini-residue ratchet pins that at zero.)
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
  // The seam moved from boundary.ts into routing.ts (legacyReasoningProvider,
  // the last rung of resolveVendorForPurpose) — the invariant follows the code.
  const routing = readFileSync(join(__dirname, "..", "routing.ts"), "utf8");

  test("EXPO_PUBLIC_REASONING_PROVIDER=openai is no longer a silent no-op", () => {
    // It used to read `raw === "claude" ? "claude" : "gemini"`, so setting the
    // variable to openai left the app on Gemini with no error anywhere - the
    // exact failure that would have made the September exit look done when it
    // was not.
    // The literal moved into normalizeVendor() when xai joined, so the check
    // is now that the seam DEFERS to that one normalizer rather than keeping a
    // second copy of the vendor list that could drift from it. Since T1 stage A
    // (2026-08-31) its fallback is RETIRED_DEFAULT, not a "gemini" literal, and
    // RETIRED_DEFAULT is openai - so an unset seam no longer lands on a proxy
    // that is being decommissioned.
    const seamStart = routing.indexOf("export function legacyReasoningProvider");
    expect(seamStart).toBeGreaterThan(-1);
    const seam = routing.slice(seamStart, routing.indexOf("}", seamStart) + 1);
    expect(seam).toMatch(/return normalizeVendor\(raw\) \?\? RETIRED_DEFAULT;/);
    expect(seam).not.toMatch(/return raw === "claude" \? "claude" : "gemini";/);
    expect(seam).not.toMatch(/\?\? "gemini"/);
    expect(routing).toMatch(/^const RETIRED_DEFAULT: LlmVendor = "openai";$/m);
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
    // Chat and transcription must go through ONE spend bump and ONE audit row.
    //
    // Counted over the file minus the embed route (2026-08-24), not over the
    // whole file. op:'embed' returns early and is a different operation with a
    // different batch shape, so it has its own bump and its own row - exactly
    // as gemini-proxy's embed route does. Counting globally would have made
    // "2" look like the fork this test exists to prevent, and the honest fix
    // is to say which half is being counted rather than to raise the number.
    const embedStart = proxy.indexOf("body?.op === 'embed'");
    const embedEnd = proxy.indexOf("const userText");
    expect(embedStart).toBeGreaterThan(-1);
    expect(embedEnd).toBeGreaterThan(embedStart);
    const embedRoute = proxy.slice(embedStart, embedEnd);
    const rest = proxy.slice(0, embedStart) + proxy.slice(embedEnd);

    expect((rest.match(/from\('ai_audit_log'\)\.insert/g) ?? []).length).toBe(1);
    expect((rest.match(/rpc\('bump_gemini_spend'/g) ?? []).length).toBe(1);
    // And the embed route pays exactly once too - it must not skip the counter.
    expect((embedRoute.match(/from\('ai_audit_log'\)\.insert/g) ?? []).length).toBe(1);
    expect((embedRoute.match(/rpc\('bump_gemini_spend'/g) ?? []).length).toBe(1);
  });
});
