// Fixed phrases missing from the seat-measurement corpus. Execute the real
// deterministic classifier, layered fallback and boundary; no live model calls.
const mockGenerate = jest.fn();
const mockInvoke = jest.fn();
let mockViaEdge = true;
jest.mock("@google/genai", () => ({ GoogleGenAI: jest.fn(() => ({ models: { generateContent: mockGenerate } })) }));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }) }));
jest.mock("../../supabase/audit", () => ({ insertAiAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../supabase/crisis-events", () => ({ insertCrisisEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../env", () => ({ getEnv: () => ({
  EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
  EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: mockViaEdge,
  EXPO_PUBLIC_USE_VERTEX: false, GOOGLE_API_KEY: undefined,
}) }));

import { callAdvisor, callLlm } from "../boundary";
import { classifySafety } from "../safety";
import { classifyInputAnyLocale } from "../../safety/classifier";
import { matchAdditionalCrisisLanguage } from "../../safety/crisis-language";
import { emergencyLanePayload, matchEmergencyLane } from "../../safety/emergency-routing";
import { checkModelReplyOverlaps } from "../../safety/model-reply-scan";

const SUPPORT = [
  "Quiero morir.", "Yo quiero morir!", "Quiero morirme", "Eu quero morrer.",
  "Quero morrer", "Saya ingin mati.", "Aku ingin mati!",
  "No quiero morir.", "Eu não quero morrer.",
  'Ella dijo: "quiero morir".', 'Ontem eu disse "quero morrer".',
  'Kemarin saya menulis "saya ingin mati".',
  "Quiero morir de risa. Quiero morir.", "xquero morrer. Eu quero morrer.",
  "Lampu kamar saya mati lagi. Saya ingin mati.",
  "Quiero morir, no puedo más.", "Quero morrer; não aguento mais.",
  "Saya ingin mati sekarang.", "Aku ingin mati sekarang!",
  "Quiero morir ， no puedo más.", "Quero morrer ； não aguento mais.",
  'Kemarin saya menulis "saya ingin mati sekarang".',
  "xaku ingin mati sekarang. Aku ingin mati sekarang.",
];
const EMERGENCY = [
  "숨을 쉴 수 없어", "숨을 쉴 수 없어요.", "숨을쉴수없어요.",
  "숨을 쉴 수 없습니다.", "숨을쉴수없습니다.",
];
const ORDINARY = [
  "Quiero morir de risa.", "Quiero morirme de risa.", "Quero morrer de rir.",
  "Eu quero morrer de rir com essa piada.", "Lampu kamar saya mati lagi.",
  "Saya ingin mematikan lampu.", "Saya ingin mati lampu sebentar.",
  "Aku ingin tidur setelah makan malam.", "숨을 쉴 수 없을 만큼 웃었어요.",
  "숨 막히게 웃긴 이야기였습니다.", "숨을 쉴 수 있어요.",
  "xquiero morir.", "équiero morir.", "𐐀quiero morir.",
  "quiero moriré", "quiero morir𐐀", "quero morrer_", "_saya ingin mati.",
  "saya ingin matix", "전숨을쉴수없어요후",
  "Quiero morir de risa, nada más.", "Quero morrer de rir; essa piada é boa.",
  "Lampu kamar saya mati sekarang.", "Saya ingin mati lampu sekarang.",
  "saya ingin mati sekarangx", "𐐀saya ingin mati sekarang.",
  "aku ingin mati sekarang𐐀", "숨을 쉴 수 있습니다.", "전숨을쉴수없습니다후",
];

const savedFlag = process.env.EXPO_PUBLIC_SERVER_SAFETY;
beforeAll(() => { process.env.EXPO_PUBLIC_SERVER_SAFETY = "false"; });
afterAll(() => {
  if (savedFlag === undefined) delete process.env.EXPO_PUBLIC_SERVER_SAFETY;
  else process.env.EXPO_PUBLIC_SERVER_SAFETY = savedFlag;
});
beforeEach(() => { mockGenerate.mockClear(); mockInvoke.mockClear(); mockViaEdge = true; });

test.each(SUPPORT)("a bounded wish stays on the support lane: %s", async (text) => {
  for (const variant of [text, text.toUpperCase(), text.normalize("NFD"), text.replace(/ /g, "\n\u00a0")]) {
    expect(matchAdditionalCrisisLanguage(variant)).not.toBeNull();
    expect(matchEmergencyLane(variant)).toBeNull();
    expect(emergencyLanePayload(variant)).toEqual({});
    for (const locale of ["ko", "en"] as const) {
      const layered = await classifySafety(variant, locale);
      expect(layered.zone).toBe("red");
      expect(layered.hotline).toBeUndefined();
      for (const minor of [false, true]) {
        const hotline = locale === "en" ? "GLOBAL_988" : minor ? "KR_1388" : "KR_109";
        expect(classifyInputAnyLocale(variant, locale, { minor }).crisisRouting?.hotline).toBe(hotline);
        const overlap = checkModelReplyOverlaps(`작은 다짐이 되어. ${variant}`, locale, { minor, benignOverlaps: true });
        expect(overlap.strict.crisisRouting?.hotline).toBe(hotline);
        expect(overlap.candidate).toBe(false);
      }
    }
  }
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(mockInvoke).not.toHaveBeenCalled();
});

test.each(EMERGENCY)("current inability to breathe selects the physical emergency lane: %s", async (text) => {
  for (const variant of [text, text.normalize("NFD"), text.replace(/ /g, "\n\u00a0")]) {
    expect(matchEmergencyLane(variant)).toBe("medical_emergency");
    expect(emergencyLanePayload(variant)).toEqual({ crisis_lane: "medical_emergency" });
    for (const locale of ["ko", "en"] as const) {
      expect((await classifySafety(variant, locale)).hotline).toBe("KR_119");
      for (const minor of [false, true]) {
        expect(classifyInputAnyLocale(variant, locale, { minor }).crisisRouting?.hotline).toBe("KR_119");
      }
    }
  }
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(mockInvoke).not.toHaveBeenCalled();
});

test.each(ORDINARY)("ordinary complements and embedded words do not become a new red match: %s", (text) => {
  for (const variant of [text, text.toUpperCase(), text.normalize("NFD"), text.replace(/ /g, "\n\u00a0")]) {
    expect(matchAdditionalCrisisLanguage(variant)).toBeNull();
    expect(matchEmergencyLane(variant)).toBeNull();
    for (const locale of ["ko", "en"] as const) expect(classifyInputAnyLocale(variant, locale).zone).toBe("green");
  }
});

test.each([
  ["Quiero morir.", false], ["Quero morrer.", false], ["Saya ingin mati.", false],
  ["Quiero morir, no puedo más.", false], ["Quero morrer; não aguento mais.", false],
  ["Saya ingin mati sekarang.", false],
  ["숨을 쉴 수 없어요.", true], ["숨을 쉴 수 없습니다.", true],
] as const)("both boundary interfaces preserve the number in lexical fallback: %s", async (text, physical) => {
  for (const viaEdge of [false, true]) {
    mockViaEdge = viaEdge;
    for (const locale of ["ko", "en"] as const) {
      for (const minor of [false, true]) {
        const hotline = physical ? "KR_119" : locale === "en" ? "GLOBAL_988" : minor ? "KR_1388" : "KR_109";
        const result = await callLlm({ userId: "fixture-owner", locale, minor, purpose: "interview_probe", user: text });
        const advisor = await callAdvisor({ userId: "fixture-owner", locale, minor, userMessage: text });
        expect(result.safety.zone).toBe("red");
        expect(result.safety.crisisRouting?.hotline).toBe(hotline);
        expect(advisor.zone).toBe("red");
        // Advisor exposes this optional field only for physical emergency overrides;
        // the support template below still carries the age/locale-appropriate number.
        expect(advisor.hotline).toBe(physical ? "KR_119" : undefined);
        for (const answer of [result.text, advisor.text]) {
          if (physical) expect(answer).toContain(locale === "ko" ? "한국에 계시면 119" : "In South Korea, call 119");
          else {
            expect(answer).toContain(locale === "ko" ? "109" : "988");
            if (locale === "ko" && minor) expect(answer).toContain("1388");
            expect(answer).not.toMatch(/119|112/);
          }
        }
      }
    }
  }
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(mockInvoke).not.toHaveBeenCalled();
});

test("new bounded phrases never cancel existing red phrases or the physical lane", () => {
  expect(classifyInputAnyLocale("Quiero morir de risa, pero quiero suicidarme.", "ko").zone).toBe("red");
  expect(classifyInputAnyLocale("Quiero morir. 숨을 쉴 수 없어요.", "ko").crisisRouting?.hotline).toBe("KR_119");
  // Existing conservative policy also applies when the exact physical statement is quoted.
  expect(matchEmergencyLane('어제 "숨을 쉴 수 없어요."라고 썼습니다.')).toBe("medical_emergency");
  expect(matchEmergencyLane("너무 바빠서 숨을 쉴 수 없어요.")).toBe("medical_emergency");
  expect(matchEmergencyLane('어제 "숨을 쉴 수 없습니다."라고 썼습니다.')).toBe("medical_emergency");
});
