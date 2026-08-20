// REQ-260821-01, the part the other three switches did not cover.
//
// The Gemini exit had four groups of purposes and only three switches. The
// reasoning seats move with EXPO_PUBLIC_LLM_VENDOR, chat with
// EXPO_PUBLIC_CHAT_VENDOR, OCR and voice with EXPO_PUBLIC_MULTIMODAL_VENDOR.
// Nine purposes were in none of those groups and reached the vendor through a
// hardcoded return, so no variable could move them at all.
//
// That is a deadline bug, not a style one: Google stops accepting Standard keys
// in September. Flipping the other three would have left eight live call sites
// still dialling a dead key, and the symptom would have read as a vendor
// outage rather than as a seat nobody moved.
//
// The assertion that carries the most weight here is the LAST one: every
// purpose in the union must have some variable that moves it off Gemini. It is
// written as a sweep over the union rather than a list, so a purpose added
// later cannot quietly re-open the same hole.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { backboneVendor, resolveVendorForPurpose, phase2EffortFor, PHASE2_VENDOR } from "../routing";
import type { PromptPurpose } from "../types";

const ENV = {
  backbone: "EXPO_PUBLIC_BACKBONE_VENDOR",
  seats: "EXPO_PUBLIC_LLM_VENDOR",
  chat: "EXPO_PUBLIC_CHAT_VENDOR",
  multimodal: "EXPO_PUBLIC_MULTIMODAL_VENDOR",
  phase: "EXPO_PUBLIC_LLM_PHASE",
} as const;

const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of Object.values(ENV)) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of Object.values(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

// The nine that had no switch. Written out because the point of the change is
// exactly this set; the sweep at the bottom is what keeps it honest over time.
const BACKBONE: PromptPurpose[] = [
  "audit_qa",
  "capture_classify",
  "clipper_classify",
  "clipper_template_propose",
  "imagine",
  "import_ingest",
  "interview_probe",
  "reasoning_connect",
  "source_ingest",
];

const ROOT = process.cwd();
// Migrations and edge sources are CRLF in this repo; locales are LF. Anchored
// regexes below would silently miss on the carriage returns.
const CR = String.fromCharCode(13);
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");
const PROXY = read("supabase/functions/openai-proxy/index.ts");

function proxyMap(name: string): Record<string, string> {
  const block = PROXY.match(new RegExp(`const ${name}: Record<string, string> = \\{([\\s\\S]*?)\\n\\};`));
  if (!block) throw new Error(`openai-proxy 에서 ${name} 을 못 찾았다`);
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/^\s*([a-z_]+):\s*'([^']+)'/gm)) out[m[1]] = m[2];
  return out;
}

describe("the default is unchanged", () => {
  test("unset keeps every backbone purpose on Gemini", () => {
    setEnv(ENV.backbone, undefined);
    expect(backboneVendor()).toBe("gemini");
    for (const p of BACKBONE) expect(resolveVendorForPurpose(p, false)).toBe("gemini");
  });

  test("an unrecognized value falls back to Gemini rather than to nothing", () => {
    for (const junk of ["", "  ", "grok", "xai", "openai!"]) {
      setEnv(ENV.backbone, junk);
      expect(backboneVendor()).toBe("gemini");
    }
  });

  test("the value is read case-insensitively and trimmed, like its neighbours", () => {
    setEnv(ENV.backbone, "  OpenAI  ");
    expect(backboneVendor()).toBe("openai");
  });
});

describe("the switch moves exactly the backbone", () => {
  test("set to openai, all nine move", () => {
    setEnv(ENV.backbone, "openai");
    for (const p of BACKBONE) expect(resolveVendorForPurpose(p, false)).toBe("openai");
  });

  test("it does not touch the reasoning seats", () => {
    setEnv(ENV.backbone, "openai");
    setEnv(ENV.seats, undefined);
    setEnv(ENV.phase, "1");
    for (const seat of Object.keys(PHASE2_VENDOR) as PromptPurpose[]) {
      expect(resolveVendorForPurpose(seat, false)).toBe("gemini");
    }
  });

  test("it does not touch chat or the multimodal pair", () => {
    setEnv(ENV.backbone, "openai");
    setEnv(ENV.chat, undefined);
    setEnv(ENV.multimodal, undefined);
    expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini");
    expect(resolveVendorForPurpose("capture_ocr", false)).toBe("gemini");
    expect(resolveVendorForPurpose("capture_voice", false)).toBe("gemini");
  });

  test("the seat switch still does not reach the backbone", () => {
    // This was already true and must stay true: an operator moving the
    // reasoning seats must not silently route a per-capture classifier
    // through a reasoning proxy.
    setEnv(ENV.seats, "openai");
    setEnv(ENV.backbone, undefined);
    for (const p of BACKBONE) expect(resolveVendorForPurpose(p, false)).toBe("gemini");
  });

  test("an image still beats every switch", () => {
    setEnv(ENV.backbone, "openai");
    setEnv(ENV.multimodal, undefined);
    // A text-only proxy cannot serve a binary at all, so this is a capability
    // constraint before it is a preference.
    expect(resolveVendorForPurpose("imagine", true)).toBe("gemini");
  });
});

describe("the flip has somewhere to land", () => {
  test("openai-proxy seats all nine", () => {
    // Without this the switch is a way to break the app: the function answers
    // 400 purpose_not_seated before doing anything else.
    const seats = proxyMap("PURPOSE_MODEL");
    for (const p of BACKBONE) expect(Object.keys(seats)).toContain(p);
  });

  test("the high-volume classifiers are seated cheap, not on the frontier", () => {
    const seats = proxyMap("PURPOSE_MODEL");
    expect(seats.capture_classify).toMatch(/-nano$/);
    expect(seats.clipper_classify).toMatch(/-nano$/);
    for (const p of ["audit_qa", "source_ingest", "import_ingest", "clipper_template_propose", "interview_probe"]) {
      expect(seats[p]).toMatch(/-mini$/);
    }
  });

  test("every backbone purpose carries an effort and a server ceiling", () => {
    // Off Gemini the tier is gone, so without an effort boundary.ts falls back
    // to DEFAULT_EFFORT ("high") and a classifier reasons hard per capture.
    const ceilings = proxyMap("PURPOSE_EFFORT_MAX");
    for (const p of BACKBONE) {
      expect(phase2EffortFor(p)).toBeTruthy();
      expect(ceilings[p]).toBeTruthy();
    }
    expect(ceilings.capture_classify).toBe("none");
    expect(ceilings.clipper_classify).toBe("none");
  });
});

describe("no purpose is left without a way off Gemini", () => {
  test("sweeping the whole union finds no unreachable purpose", () => {
    const src = read("src/lib/llm/types.ts");
    const block = src.match(/export type PromptPurpose =([\s\S]*?);\n/);
    if (!block) throw new Error("PromptPurpose 를 못 찾았다");
    // Only the union arms, so prose inside comments cannot invent a purpose.
    const purposes = [...block[1].matchAll(/^\s*\|\s*"([a-z_]+)"/gm)].map((m) => m[1] as PromptPurpose);
    expect(purposes.length).toBeGreaterThan(20);

    setEnv(ENV.backbone, "openai");
    setEnv(ENV.seats, "openai");
    setEnv(ENV.chat, "openai");
    setEnv(ENV.multimodal, "openai");

    const stranded = purposes.filter((p) => resolveVendorForPurpose(p, false) === "gemini");
    expect(stranded).toEqual([]);
  });
});
