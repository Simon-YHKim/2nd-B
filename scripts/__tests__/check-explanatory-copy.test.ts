// check:explanatory-copy is warning-only by decision (Q-261014-89 가): these
// tests pin that a hit is reported, that unchanged and out-of-scope strings are
// not, and that the exit code stays 0 either way. The git part of the script is
// a thin reader; everything below feeds the two JSON bundles directly.

import {
  changedStrings,
  exclusionReason,
  explanatoryHits,
  findExplanatoryCopy,
  formatWarning,
  reportExplanatoryCopy,
} from "../check-explanatory-copy";

const lookupOf = (entries: Record<string, string>) => new Map(Object.entries(entries));
const hits = (key: string, value: string, lookup: Record<string, string> = {}) =>
  explanatoryHits(key.split("."), value, lookupOf(lookup));

describe("explanatoryHits", () => {
  test("flags the census patterns", () => {
    expect(hits("empty.body", "저장한 기록은 여기에서 볼 수 있습니다.")).toEqual(["ui_describe", "can_do"]);
    expect(hits("a.body", "기록을 한눈에 보기 위해 모았습니다.")).toEqual(["purpose_benefit"]);
    expect(hits("a.body", "언제든 바꿀 수 있어요. 걱정하지 마세요.")).toEqual(["can_do", "reassurance"]);
    expect(hits("a.body", "허슬케이는 남긴 기록을 읽고 답해요.")).toEqual(["meta_ai"]);
  });

  test("flags a sentence-style hint that repeats its sibling label", () => {
    expect(hits("records.hint", "기록 보관소를 엽니다.", { "records.title": "기록 보관소" })).toEqual(["restate_label"]);
    expect(hits("records.openHint", "기록 보관소 열기를 누릅니다.", { "records.open": "기록 보관소 열기" })).toContain(
      "restate_label",
    );
  });

  test("flags a helper key longer than 40 code points", () => {
    const long = "오늘 남긴 문장과 사진과 링크가 날짜 순서대로 한 줄씩 차곡차곡 쌓여 갑니다";
    expect(Array.from(long).length).toBeGreaterThan(40);
    expect(hits("journal.helper", long)).toEqual(["long_helper"]);
    expect(hits("journal.title", long)).toEqual([]);
  });

  test("leaves plain copy alone", () => {
    expect(hits("ds.head.capture.tip", "짧게 적어도 됩니다.")).toEqual([]);
    expect(hits("saved.title", "별가루를 저장했습니다")).toEqual([]);
    expect(hits("records.hint", "기록을 엽니다.", { "records.title": "기록 보관소" })).toEqual([]);
  });

  test("does not run the regex patterns on strings under 10 characters", () => {
    expect(hits("cta", "버튼 누르기")).toEqual([]);
    expect(hits("cta", "{{n}}개 볼 수 있어요")).toEqual([]);
  });
});

describe("exclusionReason", () => {
  test("skips consent, safety, privacy, legal and AI-disclosure strings", () => {
    expect(exclusionReason("consent.json", "any.key", "여기에서 볼 수 있습니다.")).toBe("file:consent.json");
    expect(exclusionReason("safety.json", "crisis.body", "여기에서 볼 수 있습니다.")).toBe("file:safety.json");
    expect(exclusionReason("secondb.json", "aiNotice.body", "여기에서 볼 수 있습니다.")).toBe("ai-disclosure");
    expect(exclusionReason("deepspace.json", "privacy.retention", "여기에서 볼 수 있습니다.")).toBe("privacy");
    expect(exclusionReason("settings.json", "subscription.refund.body", "여기에서 볼 수 있습니다.")).toBe("legal");
    expect(exclusionReason("capture.json", "share.exportConsentHint", "여기에서 볼 수 있습니다.")).toBe("consent-key");
    expect(exclusionReason("capture.json", "share.privacyNote", "여기에서 볼 수 있습니다.")).toBe("consent-key");
    expect(exclusionReason("capture.json", "share.body", "약관에 따라 여기에서 볼 수 있습니다.")).toBe("legal-content");
  });

  test("keeps ordinary UI copy in scope", () => {
    expect(exclusionReason("capture.json", "journal.fields.bodyPlaceholder", "여기에서 볼 수 있습니다.")).toBeNull();
    // A key rule belongs to its own file only.
    expect(exclusionReason("capture.json", "aiNotice.body", "여기에서 볼 수 있습니다.")).toBeNull();
  });
});

describe("changedStrings", () => {
  test("returns only new strings and strings whose value changed", () => {
    const base = { a: "그대로", b: { c: "예전 문장", d: ["하나", "둘"] } };
    const head = { a: "그대로", b: { c: "새 문장", d: ["하나", "셋"], e: "새 키" } };
    expect(changedStrings(base, head).map((e) => e.key)).toEqual(["b.c", "b.d.1", "b.e"]);
  });

  test("treats every string of a file missing at base as new", () => {
    expect(changedStrings(null, { a: "가", b: { c: "나" } }).map((e) => e.key)).toEqual(["a", "b.c"]);
  });
});

describe("findExplanatoryCopy and reportExplanatoryCopy", () => {
  const explanatory = "저장한 기록은 여기에서 볼 수 있습니다.";

  test("an unchanged explanatory string gives no warning", () => {
    const bundle = { empty: { body: explanatory } };
    const scan = findExplanatoryCopy([{ file: "capture.json", base: bundle, head: bundle }]);
    expect(scan).toEqual({ changed: 0, excluded: 0, warnings: [] });
  });

  test("a changed explanatory string gives one warning with its line", () => {
    const base = { empty: { title: "빈 화면", body: "아직 기록이 없습니다." } };
    const head = { empty: { title: "빈 화면", body: explanatory } };
    const headText = JSON.stringify(head, null, 2) + "\n";
    const scan = findExplanatoryCopy([{ file: "capture.json", base, head, headText }]);
    expect(scan.changed).toBe(1);
    expect(scan.warnings).toEqual([
      { file: "capture.json", key: "empty.body", value: explanatory, hits: ["ui_describe", "can_do"], line: 4 },
    ]);
  });

  test("a changed out-of-scope string is counted but not warned", () => {
    const scan = findExplanatoryCopy([
      { file: "consent.json", base: { a: "예전" }, head: { a: explanatory } },
      { file: "secondb.json", base: {}, head: { aiNotice: { body: explanatory } } },
    ]);
    expect(scan).toEqual({ changed: 2, excluded: 2, warnings: [] });
  });

  test("prints a GitHub warning annotation ending with the STYLE.md pointer, and exits 0", () => {
    const lines: string[] = [];
    const code = reportExplanatoryCopy(
      [{ file: "capture.json", base: { empty: { body: "아직 없습니다." } }, head: { empty: { body: explanatory } } }],
      "merge-base test",
      (line) => lines.push(line),
    );
    expect(code).toBe(0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^::warning file=locales\/ko\/capture\.json,title=/);
    expect(lines[0]).toContain("empty.body");
    expect(lines[0]).toContain("can_do");
    expect(lines[0].endsWith("STYLE.md 「설명 문구 줄이기」를 보고 정합니다.")).toBe(true);
    expect(lines[1]).toMatch(/^explanatory-copy WARN {2}1 changed ko string\(s\).*1 look explanatory \(warning only, exit 0\)/);
  });

  test("reports PASS and exits 0 when nothing changed", () => {
    const lines: string[] = [];
    const bundle = { empty: { body: explanatory } };
    expect(reportExplanatoryCopy([{ file: "capture.json", base: bundle, head: bundle }], "x", (l) => lines.push(l))).toBe(0);
    expect(lines).toEqual(["explanatory-copy PASS  0 changed ko string(s) since x, 0 out of scope, 0 look explanatory"]);
  });

  test("escapes newlines, percent signs and property separators in the annotation", () => {
    const line = formatWarning({ file: "a,b.json", key: "k", value: "첫 줄\n100% 둘째 줄", hits: ["can_do"], line: 3 });
    expect(line.startsWith("::warning file=locales/ko/a%2Cb.json,line=3,title=")).toBe(true);
    expect(line).toContain("첫 줄%0A100%25 둘째 줄");
    expect(line.split("::")).toHaveLength(3);
  });
});
