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
// T1 stage A (2026-08-31) moved where an UNSET switch lands. Until then every
// switch in routing.ts fell through to "gemini"; now every one falls through
// to RETIRED_DEFAULT ("openai"). The "default" block below proves that new
// landing and keeps one explicit-"gemini" case, because "gemini" is still an
// accepted operator value: that is the one-variable rollback, and it has to
// stay provable until gemini-proxy is deleted from the console. The isolation
// tests pin whichever switch they are exercising to a vendor that is NOT the
// default ("claude"), so "switch A did not reach group B" is still a
// discriminating assertion rather than two defaults happening to agree.
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

describe("the default is the retired-vendor landing (T1 stage A)", () => {
  test("unset lands every backbone purpose on openai", () => {
    setEnv(ENV.backbone, undefined);
    expect(backboneVendor()).toBe("openai");
    for (const p of BACKBONE) expect(resolveVendorForPurpose(p, false)).toBe("openai");
  });

  test("explicit gemini still resolves gemini for every backbone purpose (one-variable rollback)", () => {
    // "gemini" stays an accepted operator value until gemini-proxy is deleted
    // from the console. It just never happens by default any more.
    setEnv(ENV.backbone, "gemini");
    expect(backboneVendor()).toBe("gemini");
    for (const p of BACKBONE) expect(resolveVendorForPurpose(p, false)).toBe("gemini");
  });

  test("an unrecognized value falls back to openai rather than to nothing", () => {
    // "grok" and "xai" left this list on 2026-08-21: xai is a real vendor now,
    // and "grok" is accepted as its alias precisely so an operator typing the
    // product name does not get a silent fallback to the default.
    for (const junk of ["", "  ", "anthropic", "openai!", "x-ai"]) {
      setEnv(ENV.backbone, junk);
      expect(backboneVendor()).toBe("openai");
    }
  });

  test("the value is read case-insensitively and trimmed, like its neighbours", () => {
    setEnv(ENV.backbone, "  OpenAI  ");
    expect(backboneVendor()).toBe("openai");
    // openai is also the unset landing now, so the line above alone would pass
    // for a switch that ignored its input entirely. A non-default vendor is
    // what proves the trim and the lowercase actually ran.
    setEnv(ENV.backbone, "  Claude  ");
    expect(backboneVendor()).toBe("claude");
  });
});

describe("the switch moves exactly the backbone", () => {
  test("set explicitly, all nine move together", () => {
    setEnv(ENV.backbone, "openai");
    for (const p of BACKBONE) expect(resolveVendorForPurpose(p, false)).toBe("openai");
    // openai is the default since T1 stage A, so the loop above no longer
    // shows the switch doing anything. A non-default vendor does.
    setEnv(ENV.backbone, "claude");
    for (const p of BACKBONE) expect(resolveVendorForPurpose(p, false)).toBe("claude");
  });

  test("it does not touch the reasoning seats", () => {
    // Backbone pinned to a NON-default vendor: since T1 stage A both the
    // backbone and the Phase-1 seat rule land on openai when unset, so
    // backbone=openai could no longer show whether the switch leaked.
    setEnv(ENV.backbone, "claude");
    setEnv(ENV.seats, undefined);
    setEnv(ENV.phase, "1");
    for (const seat of Object.keys(PHASE2_VENDOR) as PromptPurpose[]) {
      expect(resolveVendorForPurpose(seat, false)).toBe("openai");
    }
  });

  test("it does not touch chat or the multimodal pair", () => {
    setEnv(ENV.backbone, "claude");
    setEnv(ENV.chat, undefined);
    setEnv(ENV.multimodal, undefined);
    // Each of these groups has its own knob, and each knob's unset landing is
    // openai since T1 stage A. The backbone value must not be what shows up.
    expect(resolveVendorForPurpose("secondb_chat", false)).toBe("openai");
    expect(resolveVendorForPurpose("capture_ocr", false)).toBe("openai");
    expect(resolveVendorForPurpose("capture_voice", false)).toBe("openai");
  });

  test("the seat switch still does not reach the backbone", () => {
    // This was already true and must stay true: an operator moving the
    // reasoning seats must not silently route a per-capture classifier
    // through a reasoning proxy. Seats pinned to a non-default vendor for the
    // same reason as above; the backbone must land on its own unset default.
    setEnv(ENV.seats, "claude");
    setEnv(ENV.backbone, undefined);
    for (const p of BACKBONE) expect(resolveVendorForPurpose(p, false)).toBe("openai");
  });

  test("an image still beats every switch", () => {
    setEnv(ENV.backbone, "claude");
    setEnv(ENV.multimodal, undefined);
    // A text-only proxy cannot serve a binary at all, so this is a capability
    // constraint before it is a preference. The multimodal knob's unset
    // landing is openai since T1 stage A; the backbone value must not win.
    expect(resolveVendorForPurpose("imagine", true)).toBe("openai");
    // And it is the multimodal KNOB that wins, not a hardcoded openai: an
    // explicit gemini there still carries the image (rollback property).
    setEnv(ENV.multimodal, "gemini");
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
