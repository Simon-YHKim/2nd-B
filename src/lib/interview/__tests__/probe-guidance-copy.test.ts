import en from "../../../../locales/en/safety.json";
import ko from "../../../../locales/ko/safety.json";
import { AVAILABLE_UI_LOCALES } from "../../i18n/locales";
import { emergencyGuidance } from "../../safety/emergency-routing";
import { CRISIS_DIRECTORY_URL } from "../../safety/help-directory";
import { HOTLINES } from "../../safety/lexicon";
import type { ContactId, Correction, ProbeGuidance } from "../probe-guidance";
import { resolveProbeGuidanceCopy, type ProbeGuidanceCopy, type ProbeGuidanceBlockId } from "../probe-guidance-copy";

type Ready = Extract<ProbeGuidanceCopy, { kind: "ready" }>;
const contacts: ContactId[] = ["KR_109", "KR_1388", "GLOBAL_988", "KR_119", "KR_112"];
const corrections: Correction[] = ["country-condition-added", "unsupported-country-removed", "emergency-priority", "unverified-number-removed"];
const invalid = { kind: "invalid", code: "invalid-guidance" };
const contractFailure = { kind: "invalid", code: "copy-contract" };
const guidance = (ids: readonly ContactId[], changes: readonly Correction[] = []): ProbeGuidance => ({
  kind: "contacts", contacts: ids, physicalUrgency: ids.includes("KR_119"), corrections: changes,
});
const resolveUnknown = (value: unknown) => resolveProbeGuidanceCopy(value as ProbeGuidance, "en");
function ready(value: ProbeGuidanceCopy): Ready {
  expect(value.kind).toBe("ready");
  if (value.kind !== "ready") throw new Error("Expected approved copy");
  return value;
}
function displayed(value: Ready): string {
  return [value.title, ...value.blocks.map(({ body }) => body), value.dismissLabel,
    ...(value.directory ? [value.directory.label, value.directory.hint, value.directory.href] : [])].join("\n");
}

// D3 approved literals, independent of locale templates and resolver formatting.
const expected: Record<"en" | "ko", Record<ProbeGuidanceBlockId, string>> = {
  en: {
    "physical-emergency": "If you are in physical danger now, contact your local emergency service. In South Korea, call 119. If you can, ask someone nearby for help.",
    "immediate-threat": "If someone is threatening you now, move to a safe place if you can and contact your local emergency service. In South Korea, call 112.",
    "kr-support": "In South Korea, you can call 109 for support.",
    "kr-youth-support": "In South Korea, young people can call 1388 or 109 for support.",
    "us-support": "In the US, you can call or text 988 for support. For other countries, use the helpline directory.",
    unresolved: "The contact details could not be verified. If you are in physical danger now, contact your local emergency service. For other support, use the helpline directory.",
  },
  ko: {
    "physical-emergency": "지금 신체에 위험이 있다면 현지 긴급전화로 연락해 주세요. 한국에 계시면 119입니다. 가능하면 가까운 사람에게 도움을 요청해 주세요.",
    "immediate-threat": "누군가 지금 위협하고 있다면 가능한 경우 안전한 곳으로 이동해 현지 긴급전화로 연락해 주세요. 한국에 계시면 112입니다.",
    "kr-support": "한국에서 대화 지원이 필요하면 109로 연락할 수 있습니다.",
    "kr-youth-support": "한국에서는 청소년전화 1388 또는 109로 연락할 수 있습니다.",
    "us-support": "미국에서는 988로 전화하거나 문자를 보낼 수 있습니다. 다른 나라의 연락처는 도움 전화 찾기에서 확인하세요.",
    unresolved: "연락처를 확인하지 못했습니다. 지금 신체에 위험이 있으면 현지 긴급전화로 연락해 주세요. 다른 도움이 필요하면 도움 전화 찾기에서 확인하세요.",
  },
};

test.each(["en", "ko"] as const)("%s returns all six exact approved bodies and existing emergency bodies", (locale) => {
  const cases: [ContactId, ProbeGuidanceBlockId][] = [["KR_119", "physical-emergency"], ["KR_112", "immediate-threat"],
    ["KR_109", "kr-support"], ["KR_1388", "kr-youth-support"], ["GLOBAL_988", "us-support"]];
  for (const [id, blockId] of cases) {
    const result = ready(resolveProbeGuidanceCopy(guidance([id]), locale));
    expect(result.blocks).toEqual([{ id: blockId, body: expected[locale][blockId] }]);
    expect(result.blocks[0].body).toContain(HOTLINES[id].number);
    if (id === "KR_119" || id === "KR_112") expect(result.blocks[0].body).toBe(emergencyGuidance(id, locale)!.text);
    if (id === "KR_1388") expect(result.blocks[0].body).toContain(HOTLINES.KR_109.number);
    expect(result.title).toBe(locale === "ko" ? "연락 안내" : "Contact information");
    expect(result.dismissLabel).toBe(locale === "ko" ? "닫기" : "Close");
    expect(result.directory).toEqual(id === "GLOBAL_988" ? {
      label: locale === "ko" ? "도움 전화 찾기" : "Find a helpline",
      hint: locale === "ko" ? "findahelpline.com을 브라우저로 엽니다" : "Opens findahelpline.com in your browser",
      href: CRISIS_DIRECTORY_URL,
    } : undefined);
  }
  const result = ready(resolveProbeGuidanceCopy({ kind: "unresolved", reason: "unsupported-contact" }, locale));
  expect(result.blocks).toEqual([{ id: "unresolved", body: expected[locale].unresolved }]);
});

test.each([...AVAILABLE_UI_LOCALES, "ko-KR", "ko-custom", "KO", "korean", "en-KR", "", null, undefined])(
  "none and both explicit unresolved reasons use only the system locale policy (%s)", (locale) => {
    expect(resolveProbeGuidanceCopy({ kind: "none" }, locale)).toEqual({ kind: "none" });
    const language = locale === "ko" || locale?.startsWith("ko-") ? "ko" : "en";
    for (const reason of ["unsupported-contact", "conflicting-intent"] as const) {
      const result = ready(resolveProbeGuidanceCopy({ kind: "unresolved", reason }, locale));
      expect(result.blocks).toEqual([{ id: "unresolved", body: expected[language].unresolved }]);
      expect(result.directory?.href).toBe("https://findahelpline.com");
      expect(result.blocks[0].body).not.toMatch(/109|1388|988|911|119|112/);
    }
  },
);

test("all 5120 metadata combinations preserve order, countries, purpose and complete payload bounds", () => {
  let cases = 0, accepted = 0;
  const maximum = { ko: 0, en: 0 };
  for (let subset = 0; subset < 32; subset++) {
    const ids = contacts.filter((_, i) => subset & (1 << i));
    const order: ProbeGuidanceBlockId[] = [];
    if (ids.includes("KR_119")) order.push("physical-emergency");
    if (ids.includes("KR_112")) order.push("immediate-threat");
    if (ids.includes("KR_1388")) order.push("kr-youth-support");
    else if (ids.includes("KR_109")) order.push("kr-support");
    if (ids.includes("GLOBAL_988")) order.push("us-support");
    for (const locale of AVAILABLE_UI_LOCALES) for (const physicalUrgency of [false, true]) {
      for (let flags = 0; flags < 16; flags++) {
        cases++;
        const result = resolveProbeGuidanceCopy({ kind: "contacts", contacts: ids, physicalUrgency,
          corrections: corrections.filter((_, i) => flags & (1 << i)) }, locale);
        if (!ids.length || physicalUrgency !== ids.includes("KR_119")) { expect(result).toEqual(invalid); continue; }
        if (order.length > 3) { expect(result).toEqual(contractFailure); continue; }
        accepted++;
        const output = ready(result), language = locale === "ko" ? "ko" : "en";
        expect(output.blocks).toEqual(order.map((id) => ({ id, body: expected[language][id] })));
        expect(Boolean(output.directory)).toBe(ids.includes("GLOBAL_988"));
        expect(Object.keys(output).sort()).toEqual((output.directory
          ? ["kind", "title", "blocks", "dismissLabel", "directory"] : ["kind", "title", "blocks", "dismissLabel"]).sort());
        expect(output.blocks.every((block) => Object.keys(block).sort().join() === "body,id")).toBe(true);
        const complete = displayed(output), size = Array.from(complete).length;
        expect(output.blocks.length).toBeLessThanOrEqual(3);
        expect(size).toBeLessThanOrEqual(768);
        expect(complete).not.toMatch(/\{\{|\}\}|tel:|911|1393|1577-0199/);
        maximum[language] = Math.max(maximum[language], size);
      }
    }
  }
  expect(cases).toBe(5120);
  expect(accepted).toBe(2240);
  // Recorded from the complete actual output, including the URL and separators.
  expect(maximum.ko).toBeGreaterThan(0);
  expect(maximum.en).toBeGreaterThan(maximum.ko);
});

function permutations<T>(items: T[]): T[][] {
  return items.length ? items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map((tail) => [item, ...tail])) : [[]];
}
test("every contact subset permutation and duplicates retain the same ordered bodies", () => {
  for (let subset = 1; subset < 32; subset++) {
    const ids = contacts.filter((_, i) => subset & (1 << i));
    const expectedResult = resolveProbeGuidanceCopy(guidance(ids), "en");
    for (const order of permutations(ids)) {
      expect(resolveProbeGuidanceCopy(guidance(order), "en")).toEqual(expectedResult);
      expect(resolveProbeGuidanceCopy(guidance([...order, ...order], [...corrections, ...corrections]), "en")).toEqual(expectedResult);
    }
  }
});

test.each([
  null, undefined, "Call 911", 911, [], {}, { kind: "unknown" },
  { kind: "none", raw: "Call 911 at https://example.invalid" },
  { kind: "unresolved", reason: "__proto__" }, { kind: "unresolved", reason: "unsupported-contact", raw: "911" },
  { ...guidance(["KR_109"]), contacts: "KR_109" },
  { ...guidance(["KR_109"]), physicalUrgency: "false" },
  { ...guidance(["KR_109"]), corrections: "country-condition-added" },
  { ...guidance(["KR_109"]), corrections: ["__proto__"] },
  { ...guidance(["KR_109"]), corrections: ["Call 911"] },
  { ...guidance(["KR_109"]), raw: "Call 911" },
  { ...guidance(["KR_109"]), url: "https://example.invalid" },
  { ...guidance(["KR_109"]), contacts: new Array(1) },
  { ...guidance(["KR_109"]), corrections: new Array(1) },
  Object.create({ kind: "none" }),
  JSON.parse('{"kind":"none","__proto__":"911"}'),
])("unknown runtime metadata fails without copy or raw fallback (%#)", (value) => {
  expect(resolveUnknown(value)).toEqual(invalid);
});
test.each(["KR_1393", "KR_1577_0199", "KR_117", "KR_1366", "911", 911, "__proto__", "constructor", "https://example.invalid", null, {}])(
  "unregistered contact %s cannot become displayed guidance", (id) => {
    expect(resolveUnknown({ ...guidance(["KR_109"]), contacts: [id] })).toEqual(invalid);
  },
);
test("accessors, symbol fields and unreadable metadata are rejected without invoking getters", () => {
  const getter = jest.fn(() => "none");
  expect(resolveUnknown(Object.defineProperty({}, "kind", { get: getter }))).toEqual(invalid);
  expect(getter).not.toHaveBeenCalled();
  expect(resolveUnknown({ kind: "none", [Symbol("raw")]: "911" })).toEqual(invalid);
  const list = ["KR_109"];
  Object.defineProperty(list, "0", { get: getter });
  expect(resolveUnknown({ ...guidance(["KR_109"]), contacts: list })).toEqual(invalid);
  expect(getter).not.toHaveBeenCalled();
  const revocable = Proxy.revocable({}, {}); revocable.revoke();
  expect(resolveUnknown(revocable.proxy)).toEqual(invalid);
});

test("the 768 boundary counts code points, complete metadata and every separator without truncation", () => {
  const original = en.interviewGuidance.title;
  const input = guidance(["GLOBAL_988"]);
  const fixedSize = Array.from(displayed(ready(resolveProbeGuidanceCopy(input, "en")))).length - Array.from(original).length;
  try {
    en.interviewGuidance.title = "🧭".repeat(768 - fixedSize);
    const atLimit = ready(resolveProbeGuidanceCopy(input, "en"));
    expect(Array.from(displayed(atLimit))).toHaveLength(768);
    expect(displayed(atLimit).length).toBeGreaterThan(768);
    expect(atLimit.title).toBe(en.interviewGuidance.title);
    en.interviewGuidance.title += "🧭";
    expect(resolveProbeGuidanceCopy(input, "en")).toEqual(contractFailure);
  } finally { en.interviewGuidance.title = original; }
});

test.each(["", " ", "{{unexpected}}", "{{supportNumber}}", "{" , "x".repeat(769)])(
  "broken fixed resources fail closed (%#)", (broken) => {
    for (const pack of [en, ko]) {
      const original = { ...pack.interviewGuidance }, originalRed = { ...pack.red };
      const locale = pack === ko ? "ko" : "en";
      try {
        for (const key of ["title", "directoryLabel", "unresolved"] as const) {
          pack.interviewGuidance[key] = broken;
          expect(resolveProbeGuidanceCopy({ kind: "unresolved", reason: "conflicting-intent" }, locale)).toEqual(contractFailure);
          pack.interviewGuidance[key] = original[key];
        }
        for (const key of ["dismiss", "directoryHint"] as const) {
          pack.red[key] = broken;
          expect(resolveProbeGuidanceCopy({ kind: "unresolved", reason: "conflicting-intent" }, locale)).toEqual(contractFailure);
          pack.red[key] = originalRed[key];
        }
      } finally { Object.assign(pack.interviewGuidance, original); Object.assign(pack.red, originalRed); }
    }
  },
);
test("unknown slots in a support template remain a contract failure", () => {
  const original = en.interviewGuidance.krSupport;
  try {
    en.interviewGuidance.krSupport = "In South Korea, call {{unknown}} or {{supportNumber}}.";
    expect(resolveProbeGuidanceCopy(guidance(["KR_109"]), "en")).toEqual(contractFailure);
  } finally { en.interviewGuidance.krSupport = original; }
});

test("actual resolver import needs no UI, native, i18next singleton or B1 parser runtime", () => {
  const forbidden = ["react", "react-native", "react-i18next", "i18next", "../../i18n", "../probe-guidance", "../probe-contact-intent", "@/components/safety/CrisisRouter"];
  for (const id of forbidden) jest.doMock(id, () => { throw new Error(`Unexpected runtime import: ${id}`); });
  try {
    jest.isolateModules(() => {
      const isolated = require("../probe-guidance-copy") as typeof import("../probe-guidance-copy");
      expect(isolated.resolveProbeGuidanceCopy(guidance(["KR_109"]), "en")).toEqual(resolveProbeGuidanceCopy(guidance(["KR_109"]), "en"));
    });
  } finally { for (const id of forbidden) jest.dontMock(id); }
});
