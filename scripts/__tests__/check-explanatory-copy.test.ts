// check:explanatory-copy is warning-only by decision (Q-261014-89 가): these
// tests pin that a hit is reported, that unchanged and out-of-scope strings are
// not, and that the exit code stays 0 either way. The comparison feeds the two
// JSON bundles directly; base selection runs against a fake git, and only the
// base-file reader touches a real (temporary, plumbing-built) repository.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type BaseGit,
  changedStrings,
  chooseBase,
  exclusionReason,
  explanatoryHits,
  findExplanatoryCopy,
  formatWarning,
  readBaseLocaleFiles,
  reportExplanatoryCopy,
  reportSkip,
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
    expect(exclusionReason("capture.json", "share.exportConsentHint", "여기에서 볼 수 있습니다.")).toBe("consent");
    expect(exclusionReason("capture.json", "share.privacyNote", "여기에서 볼 수 있습니다.")).toBe("privacy");
    expect(exclusionReason("capture.json", "share.body", "약관에 따라 여기에서 볼 수 있습니다.")).toBe("legal-content");
  });

  // #2516 review r1: the census rules were tied to files and keys that already
  // existed. A new notice namespace in any other file must be out as well.
  test.each([
    ["wiki.json", "privacy.body", "privacy"],
    ["capture.json", "share.privacyHelper", "privacy"],
    ["wiki.json", "legal.footer", "legal"],
    ["ops.json", "plans.legalRefund", "legal"],
    ["wiki.json", "terms.body", "legal"],
    ["wiki.json", "export.disclosure", "legal"],
    ["home.json", "safety.helper", "safety"],
    ["home.json", "card.safetyLine", "safety"],
    ["wiki.json", "consent.body", "consent"],
    ["home.json", "sync.needsConsent", "consent"],
    ["capture.json", "aiNotice.body", "ai-disclosure"],
    ["wiki.json", "summary.aiLine", "ai-disclosure"],
    ["home.json", "aiCopyTail", "ai-disclosure"],
    ["wiki.json", "card.aiApprox", "ai-disclosure"],
    ["home.json", "health.minorLocked", "age"],
    ["wiki.json", "share.adultOnly", "age"],
  ])("%s %s is out of scope (%s) whatever the file", (file, key, why) => {
    expect(exclusionReason(file, key, "저장한 기록은 여기에서 볼 수 있습니다.")).toBe(why);
  });

  test("keeps ordinary UI copy in scope", () => {
    expect(exclusionReason("capture.json", "journal.fields.bodyPlaceholder", "여기에서 볼 수 있습니다.")).toBeNull();
    // `ai` alone is not a disclosure: aiMuseum is a setting.
    expect(exclusionReason("settings.json", "aiMuseum.helper", "여기에서 볼 수 있습니다.")).toBeNull();
    expect(exclusionReason("wiki.json", "notice.body", "여기에서 볼 수 있습니다.")).toBeNull();
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

  test("keeps a file name with a newline, comma, colon or :: inside the annotation's file property", () => {
    const line = formatWarning({ file: "a\nb,c:d::e.json", key: "k", value: "값", hits: ["can_do"], line: 3 });
    expect(line).not.toMatch(/[\r\n]/);
    const [, command] = line.split("::", 2);
    expect(command).toBe(`warning file=locales/ko/a%0Ab%2Cc%3Ad%3A%3Ae.json,line=3,title=설명형 문구 후보`);
  });
});

describe("chooseBase", () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567";
  const fakeGit = (over: Partial<BaseGit> & { present?: Set<string> } = {}) => {
    const present = over.present ?? new Set<string>();
    const fetched: string[] = [];
    const git: BaseGit = {
      hasCommit: (sha) => present.has(sha),
      fetchCommit: (sha) => {
        fetched.push(sha);
      },
      mergeBase: () => "a".repeat(40),
      originMain: () => "b".repeat(40),
      ...over,
    };
    return { git, fetched };
  };

  test("uses the pinned PR base when it is readable, without fetching", () => {
    const { git, fetched } = fakeGit({ present: new Set([SHA]) });
    expect(chooseBase(SHA, git)).toEqual({ sha: SHA, label: "PR base 01234567" });
    expect(fetched).toEqual([]);
  });

  test("fetches a pinned PR base the shallow checkout lacks", () => {
    const present = new Set<string>();
    const calls: string[] = [];
    const { git } = fakeGit({
      present,
      fetchCommit: (sha) => {
        calls.push(sha);
        present.add(sha);
      },
    });
    expect(chooseBase(SHA, git)).toEqual({ sha: SHA, label: "PR base 01234567" });
    expect(calls).toEqual([SHA]);
  });

  test("fails when the pinned PR base cannot be read, even after fetching", () => {
    const { git, fetched } = fakeGit();
    expect(() => chooseBase(SHA, git)).toThrow(/not a readable commit/);
    expect(fetched).toEqual([SHA]);
  });

  test("fails when the fetch itself fails", () => {
    const { git } = fakeGit({
      fetchCommit: () => {
        throw new Error("fetch failed");
      },
    });
    expect(() => chooseBase(SHA, git)).toThrow("fetch failed");
  });

  test.each([
    ["short", "0123456"],
    ["uppercase", SHA.toUpperCase()],
    ["a ref name", "origin/main"],
    ["an option", "--upload-pack=x"],
    ["a newline", `${SHA}\nHEAD`],
  ])("rejects %s before calling git", (_label, value) => {
    const { git, fetched } = fakeGit({ present: new Set([value]) });
    expect(() => chooseBase(value, git)).toThrow(/40-character/);
    expect(fetched).toEqual([]);
  });

  test("without a pinned base: merge-base, then origin/main, then skip", () => {
    expect(chooseBase(undefined, fakeGit().git)).toEqual({ sha: "a".repeat(40), label: "merge-base aaaaaaaa" });
    expect(chooseBase("", fakeGit({ mergeBase: () => null }).git)).toEqual({
      sha: "b".repeat(40),
      label: "origin/main bbbbbbbb (no merge-base)",
    });
    expect(chooseBase(undefined, fakeGit({ mergeBase: () => null, originMain: () => null }).git)).toEqual({
      skip: "no origin/main and no EXPLANATORY_COPY_BASE, so there is nothing to compare with",
    });
  });

  test("a skip prints one line and exits 0, as an annotation inside GitHub Actions", () => {
    const local: string[] = [];
    expect(reportSkip("no base", false, (l) => local.push(l))).toBe(0);
    expect(local).toEqual(["explanatory-copy SKIP  no base (warning only, exit 0)"]);
    const actions: string[] = [];
    expect(reportSkip("no base", true, (l) => actions.push(l))).toBe(0);
    expect(actions).toEqual(["::warning title=explanatory-copy SKIP::explanatory-copy SKIP  no base (warning only, exit 0)"]);
  });
});

describe("readBaseLocaleFiles", () => {
  // The tree is built with plumbing, so no file with these names has to exist
  // on disk (Windows cannot hold a newline or a colon in a file name).
  const files: Record<string, string> = {
    "locales/ko/plain.json": '{"a":"평범"}',
    "locales/ko/a\nb.json": '{"a":"줄바꿈"}',
    "locales/ko/c,d:e::f.json": '{"a":"쉼표 콜론"}',
    "locales/ko/sub/nested.json": '{"a":"하위 폴더"}',
    "locales/en/plain.json": '{"a":"english"}',
  };
  let repo = "";
  let base = "";
  const git = (args: string[], input?: string) =>
    execFileSync("git", ["-c", "core.protectNTFS=false", ...args], { cwd: repo, input, encoding: "utf8" }).trim();

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "explcopy-"));
    git(["init", "-q"]);
    for (const [path, content] of Object.entries(files)) {
      const oid = git(["hash-object", "-w", "--stdin"], content);
      git(["update-index", "--add", "--cacheinfo", "100644", oid, path]);
    }
    const tree = git(["write-tree"]);
    base = git(["-c", "user.name=t", "-c", "user.email=t@example.com", "commit-tree", tree, "-m", "base"]);
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  test("reads each top-level ko file by its own name, whatever characters the name holds", () => {
    const read = readBaseLocaleFiles(repo, base);
    expect([...read.keys()].sort()).toEqual(["a\nb.json", "c,d:e::f.json", "plain.json"]);
    expect(read.get("a\nb.json")).toBe(files["locales/ko/a\nb.json"]);
    expect(read.get("c,d:e::f.json")).toBe(files["locales/ko/c,d:e::f.json"]);
    expect(read.get("plain.json")).toBe(files["locales/ko/plain.json"]);
  });
});
