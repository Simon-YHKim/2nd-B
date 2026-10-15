// check:explanatory-copy -- WARNS when a branch adds or changes a Korean UI
// string that reads like explanatory copy. It never fails on what it finds.
//
// WHY. Simon decided (2026-10-07) that screens should not explain themselves in
// prose, and STYLE.md 「설명 문구 줄이기」 (2026-10-14, Q-261014-87) is the
// checklist. Q-261014-89 (가) decided how CI helps: NOT as a failure condition.
// Only the ko strings this branch added or changed are checked, a hit is printed
// as a GitHub Actions `::warning` annotation, and the exit code stays 0. The
// patterns are blunt (STYLE.md item 8: copy whose intent a test or comment
// records is not cut on a pattern alone), so a person decides, not this script.
//
// THE BASE. In a pull request CI passes the PR's base commit as
// EXPLANATORY_COPY_BASE (ci.yml). It must be a 40-character SHA and readable,
// fetched if the shallow checkout lacks it; otherwise the run fails, because a
// warning-only check that silently stops running looks exactly like a clean
// one. Without that variable the base is merge-base(HEAD, origin/main), then
// origin/main itself; when neither exists (a clone without origin/main) the
// check prints one SKIP line and exits 0, so local `npm run verify` does not
// break on a missing remote ref. Unreadable JSON is still a failure.
//
// WHERE THE RULES COME FROM. The seven patterns, the 10-character floor, the
// 40-character helper limit and the per-file exclusions are ported one for one
// from the 2026-10-14 census script (ux-review/census.py) that measured the
// existing ko bundle. Change them here and in the same way, or the warning stops
// meaning what the census measured. The namespace rule below is the one
// addition: it makes the exclusions hold for keys the census never saw.
//
// OUT OF SCOPE (never warned): consent.json and safety.json whole, and the keys
// for privacy, legal and payment notices, age gates, consent and AI disclosure,
// in any file. Those are versioned, reviewed or legally required, and STYLE.md
// item 1 keeps them out of the checklist.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LOCALE_DIR = "locales/ko";
const STYLE_POINTER = "STYLE.md 「설명 문구 줄이기」";

// ---------------------------------------------------------------- exclusions
// 1) Whole files: consent (bound to CONSENT_VERSION) and safety (human-reviewed
//    crisis copy).
const FILE_EXCL: Readonly<Record<string, string>> = {
  "consent.json": "file:consent.json",
  "safety.json": "file:safety.json",
};

// 2) Key paths: privacy, terms, payment notices, age gates, AI disclosure.
const KEY_EXCL: ReadonlyArray<readonly [file: string, key: RegExp, why: string]> = [
  ["deepspace.json", /^privacy\./, "privacy"],
  ["deepspace.json", /^privacyHealth\./, "privacy"],
  ["deepspace.json", /^auth\.(legalConsent|business\.)/, "legal"],
  ["deepspace.json", /^ds\.plans\.(legal|minorPurchaseNotice|terms\.)/, "legal"],
  ["deepspace.json", /^ds\.reward(Chat)?\.privacy$/, "privacy"],
  ["settings.json", /^subscription\.(cancel|refund|notice|policy|viewPolicy|autoPay)/, "legal"],
  ["settings.json", /^dataWizard\.full\.retained$/, "privacy"],
  ["secondb.json", /^(aiNotice|aiLine|aiCopyTail|chatSaveNotice)/, "ai-disclosure"],
  ["secondb.json", /^planSuggestion\.(exportConsent|validation\.exportConsent)$/, "consent"],
  ["peer.json", /^(ack|privacy|tooYoung|minorRow|guardianRow|withdraw|birthYearHint)/, "privacy"],
  ["import.json", /^(markdownRetention|retention)\./, "privacy"],
  ["import.json", /^hub\.(consent|needsConsent|tier_critical)/, "consent"],
  ["ops.json", /^consent\./, "consent"],
  ["ops.json", /^phone\.(dataConsent|controlNote)$/, "consent"],
  ["ops.json", /^phone\.board\.transcribe\.(adultOnly|ownTalkOnly)$/, "legal"],
  ["core-brain.json", /^aiApprox$/, "ai-disclosure"],
  ["community.json", /^(adultOnly|safetyFoot)$/, "safety"],
  ["capture.json", /^callReflection\.(blockedBody|fair)/, "legal"],
  ["support.json", /^help\./, "safety"],
  ["auth.json", /^(signUp\.ageNotice|residenceCountry\.|completeProfile\.subtitle$)/, "legal"],
  ["profile.json", /^contextImport\.(saveConsent|privacy)$/, "consent"],
  // Second pass of the census (privacy, age and payment notices it caught).
  ["auth.json", /^(signUp\.checkAge|errors\.ageGate)/, "legal"],
  ["capture.json", /^(ocrReview\.disclosure|journal\.privacyFootnote)$/, "privacy"],
  ["deepspace.json", /^(auth\.ageNotice|connect\.consent|people\.privacyNote|shareCard\.introPrivacy)$/, "privacy"],
  ["deepspace.json", /^ds\.plans\.disclosure/, "legal"],
  ["deepspace.json", /^ds\.import\.consent/, "consent"],
  ["deepspace.json", /minorlocked$/i, "legal"],
  [
    "ops.json",
    /^(copy\.consentOnce|phone\.board\.locked\.aiConsent|phone\.status\.consented|phone\.board\.shelf\.reasons\.adultOnly|phone\.board\.weather\.sourceTerms)$/,
    "consent",
  ],
  ["peer.json", /^alreadyNote$/, "privacy"],
];

// 3) Namespaces, in any file and at any depth of the key path. The census only
//    had rule 2's list and a last-segment rule, so a new `privacy.*`, `legal.*`,
//    `safety.*`, `consent.*` or AI-disclosure key in another file would have been
//    warned (#2516 review r1). Each segment of the path is tested, so both
//    `privacy.body` and `share.privacyNote` are out. `aiNotice` style keys are
//    listed by name: a bare `ai` prefix would also take `aiMuseum`, a setting.
const NAMESPACE_EXCL: ReadonlyArray<readonly [segment: RegExp, why: string]> = [
  [/consent/i, "consent"],
  [/disclosure/i, "legal"],
  [/^privacy/i, "privacy"],
  [/^legal/i, "legal"],
  [/^terms$/i, "legal"],
  [/^safety/i, "safety"],
  [/^ai(Notice|Line|CopyTail|Approx|Disclosure)/, "ai-disclosure"],
  [/minorlocked$|^adultOnly$|^ageGate$|^ageNotice$/i, "age"],
];
// 4) Content: legal and crisis wording the key lists missed.
const CONTENT_EXCL = /동의합니다|동의해요|동의하게|약관|처리방침|청약철회|국외|법정대리인|사업자등록|통신판매|1388|자살/;

// ---------------------------------------------------------------- patterns
export const PATTERN_IDS = [
  "ui_describe",
  "can_do",
  "restate_label",
  "purpose_benefit",
  "reassurance",
  "meta_ai",
  "long_helper",
] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export const PATTERN_DESC: Readonly<Record<PatternId, string>> = {
  ui_describe: "화면 · 버튼 · 조작을 글로 설명",
  can_do: "'~할 수 있습니다/있어요' 능력 진술",
  restate_label: "제목 · 라벨을 힌트 · 설명이 되풀이",
  purpose_benefit: "목적 · 효용 정당화",
  reassurance: "안심시키는 군더더기",
  meta_ai: "AI · 캐릭터 · 앱 이름이 주어인 자기 설명",
  long_helper: "힌트 · 설명 키가 40자 초과",
};

const REGEX_PATTERNS: ReadonlyArray<readonly [PatternId, RegExp]> = [
  [
    "ui_describe",
    /버튼|누르면|눌러|누르세요|누른 뒤|탭하면|탭해|탭하여|탭하세요|터치하면|터치해|여기에서|여기서|이 화면|아래에서|아래의|아래 [가-힣]|위에서|위의 |오른쪽|왼쪽|길게 누르|스와이프|화면에서/,
  ],
  ["can_do", /수\s?있(습니다|어요|도록|게|으며|고|는|을|다)/],
  [
    "purpose_benefit",
    /위해|도록 도와|돕기|돕습니다|도와(드|줍|줘)|도움이 (됩|돼)|더 잘|더 쉽게|쉽게|간편하게|편리하게|한눈에|빠르게/,
  ],
  [
    "reassurance",
    /걱정하지|걱정 마|걱정 없이|안심|언제든|편하게|편히|부담 ?없이|천천히|괜찮아요|괜찮습니다|안전하게|마음 ?놓/,
  ],
  ["meta_ai", /(AI|세컨비|허슬케이|PolaScope)(이가|가|이|는|은)\s[^.?!]{0,40}?(니다|해요|어요|아요|드려요|줘요)/],
];

const LONG_KEY = /(hint|help|helper|desc|description|body|subtitle|sub|lead|tip|note|caption|intro|explain|speech)$/i;
const LONG_LIMIT = 40;
const RESTATE_SUFFIX = /^(.+?)(Hint|Desc|Description|Body|Subtitle|Sub|Help|Note|Caption|Lead|Tip)$/;
const RESTATE_BARE = new Set(["hint", "desc", "description", "body", "subtitle", "sub", "help", "note", "caption", "lead", "tip"]);
const LABEL_SIBLINGS = ["title", "label", "name", "cta"] as const;
// The regex patterns skip strings under 10 characters (buttons and labels).
const MIN_LEN = 10;
const SENTENCE_END = /(니다|요)[.!]?\s*$/;
const PLACEHOLDER = /\{\{[^}]+\}\}/g;
const NORM_DROP = /[\s.,·…!?()"'“”‘’:;\-–/]+/g;

// Lengths are Unicode code points, as in the census (Python str length).
const cpLength = (s: string): number => Array.from(s).length;
const stripPlaceholders = (s: string): string => s.replace(PLACEHOLDER, "");
const normalize = (s: string): string => stripPlaceholders(s).replace(NORM_DROP, "");

export type StringEntry = { path: string[]; key: string; value: string };

/** Every string leaf of a locale bundle, with its dotted key (array items by index). */
export function flattenStrings(bundle: unknown): StringEntry[] {
  const out: StringEntry[] = [];
  const walk = (value: unknown, path: string[]): void => {
    if (typeof value === "string") out.push({ path, key: path.join("."), value });
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, [...path, String(i)]));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, [...path, k]);
    }
  };
  walk(bundle, []);
  return out;
}

/** Why a string is out of scope, or null when the checklist applies to it. */
export function exclusionReason(file: string, key: string, value: string): string | null {
  if (FILE_EXCL[file]) return FILE_EXCL[file];
  for (const [excludedFile, rx, why] of KEY_EXCL) {
    if (excludedFile === file && rx.test(key)) return why;
  }
  for (const segment of key.split(".")) {
    for (const [rx, why] of NAMESPACE_EXCL) if (rx.test(segment)) return why;
  }
  if (CONTENT_EXCL.test(value)) return "legal-content";
  return null;
}

/** The sibling title or label a sentence-style hint repeats, or null. */
function restatedLabel(path: string[], value: string, lookup: ReadonlyMap<string, string>): string | null {
  const last = path[path.length - 1] ?? "";
  const parent = path.slice(0, -1);
  const candidates: string[] = [];
  const m = RESTATE_SUFFIX.exec(last);
  if (m) candidates.push([...parent, m[1]].join("."));
  if (RESTATE_BARE.has(last.toLowerCase()) || m) {
    for (const sibling of LABEL_SIBLINGS) candidates.push([...parent, sibling].join("."));
  }
  // Only sentence-style hints count as repeating ("건강 · export 파일" style subtitles do not).
  if (!SENTENCE_END.test(value)) return null;
  const valueNorm = normalize(value);
  for (const candidate of candidates) {
    const label = lookup.get(candidate);
    if (typeof label !== "string") continue;
    const labelNorm = normalize(label);
    if (cpLength(labelNorm) >= 2 && labelNorm !== valueNorm && valueNorm.includes(labelNorm)) return candidate;
  }
  return null;
}

/** The explanatory patterns a string matches, in the census order. */
export function explanatoryHits(path: string[], value: string, lookup: ReadonlyMap<string, string>): PatternId[] {
  const hits = new Set<PatternId>();
  if (cpLength(stripPlaceholders(value).trim()) >= MIN_LEN) {
    for (const [id, rx] of REGEX_PATTERNS) if (rx.test(value)) hits.add(id);
  }
  if (restatedLabel(path, value, lookup)) hits.add("restate_label");
  const last = path[path.length - 1] ?? "";
  if (LONG_KEY.test(last) && cpLength(stripPlaceholders(value)) > LONG_LIMIT) hits.add("long_helper");
  return PATTERN_IDS.filter((id) => hits.has(id));
}

/** Strings in `head` that are new or whose value differs from `base` (null base = new file). */
export function changedStrings(base: unknown | null, head: unknown): StringEntry[] {
  const before = new Map(flattenStrings(base ?? {}).map((e) => [e.key, e.value] as const));
  return flattenStrings(head).filter((e) => before.get(e.key) !== e.value);
}

export type LocaleFilePair = { file: string; base: unknown | null; head: unknown; headText?: string };
export type CopyWarning = { file: string; key: string; value: string; hits: PatternId[]; line?: number };
export type CopyScan = { changed: number; excluded: number; warnings: CopyWarning[] };

/** Changed, in-scope strings that match at least one pattern. */
export function findExplanatoryCopy(pairs: readonly LocaleFilePair[]): CopyScan {
  const scan: CopyScan = { changed: 0, excluded: 0, warnings: [] };
  for (const { file, base, head, headText } of pairs) {
    const lookup = new Map(flattenStrings(head).map((e) => [e.key, e.value] as const));
    for (const entry of changedStrings(base, head)) {
      scan.changed++;
      if (exclusionReason(file, entry.key, entry.value)) {
        scan.excluded++;
        continue;
      }
      const hits = explanatoryHits(entry.path, entry.value, lookup);
      if (hits.length === 0) continue;
      scan.warnings.push({ file, key: entry.key, value: entry.value, hits, line: lineOf(headText, entry) });
    }
  }
  return scan;
}

/** 1-based line of `"lastKey": "value"` in the file text, when it can be found. */
function lineOf(text: string | undefined, entry: StringEntry): number | undefined {
  if (!text) return undefined;
  const needle = `${JSON.stringify(entry.path[entry.path.length - 1])}: ${JSON.stringify(entry.value)}`;
  const at = text.indexOf(needle);
  return at < 0 ? undefined : text.slice(0, at).split("\n").length;
}

// GitHub Actions workflow-command escaping.
const escapeData = (s: string): string => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (s: string): string => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

/** One `::warning` annotation line; the message ends with the STYLE.md pointer. */
export function formatWarning(w: CopyWarning): string {
  const where = `file=${escapeProperty(`${LOCALE_DIR}/${w.file}`)}${w.line ? `,line=${w.line}` : ""}`;
  const patterns = w.hits.map((id) => `${id}(${PATTERN_DESC[id]})`).join(", ");
  const message = [
    `${w.file} ${w.key}: ${patterns}`,
    `「${w.value}」`,
    `실패가 아닌 경고입니다. 줄일지는 ${STYLE_POINTER}를 보고 정합니다.`,
  ].join("\n");
  return `::warning ${where},title=${escapeProperty("설명형 문구 후보")}::${escapeData(message)}`;
}

/** Prints the scan and returns the exit code, which is 0 whatever was found. */
export function reportExplanatoryCopy(pairs: readonly LocaleFilePair[], baseLabel: string, log: (line: string) => void): 0 {
  const scan = findExplanatoryCopy(pairs);
  for (const w of scan.warnings) log(formatWarning(w));
  const counts =
    `${scan.changed} changed ko string(s) since ${baseLabel}, ${scan.excluded} out of scope, ` +
    `${scan.warnings.length} look explanatory`;
  if (scan.warnings.length === 0) log(`explanatory-copy PASS  ${counts}`);
  else log(`explanatory-copy WARN  ${counts} (warning only, exit 0) - see ${STYLE_POINTER}`);
  return 0;
}


/** The one SKIP line printed when there is no base; an annotation inside GitHub Actions. */
export function reportSkip(reason: string, inActions: boolean, log: (line: string) => void): 0 {
  const line = `explanatory-copy SKIP  ${reason} (warning only, exit 0)`;
  log(inActions ? `::warning title=${escapeProperty("explanatory-copy SKIP")}::${escapeData(line)}` : line);
  return 0;
}

// ---------------------------------------------------------------- base
export type BaseGit = {
  /** True when `sha` names a commit this clone can read. */
  hasCommit(sha: string): boolean;
  /** Fetches that one commit from origin; throws on failure. */
  fetchCommit(sha: string): void;
  /** merge-base(HEAD, origin/main), or null when there is none. */
  mergeBase(): string | null;
  /** The origin/main commit, or null when the ref does not exist. */
  originMain(): string | null;
};
export type BaseChoice = { sha: string; label: string } | { skip: string };

const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * The commit to compare with. A non-empty `pinned` (EXPLANATORY_COPY_BASE, the
 * PR base CI passes) must be a full SHA that is readable after at most one
 * fetch, or this throws. Without it: merge-base, then origin/main, then skip.
 */
export function chooseBase(pinned: string | undefined, git: BaseGit): BaseChoice {
  const sha = pinned?.trim() ?? "";
  if (sha !== "") {
    if (!FULL_SHA.test(sha)) throw new Error(`EXPLANATORY_COPY_BASE is not a 40-character lowercase commit SHA: ${JSON.stringify(sha)}`);
    if (!git.hasCommit(sha)) git.fetchCommit(sha);
    if (!git.hasCommit(sha)) throw new Error(`EXPLANATORY_COPY_BASE ${sha} is not a readable commit after fetching it`);
    return { sha, label: `PR base ${sha.slice(0, 8)}` };
  }
  const mergeBase = git.mergeBase();
  if (mergeBase) return { sha: mergeBase, label: `merge-base ${mergeBase.slice(0, 8)}` };
  const tip = git.originMain();
  if (tip) return { sha: tip, label: `origin/main ${tip.slice(0, 8)} (no merge-base)` };
  return { skip: "no origin/main and no EXPLANATORY_COPY_BASE, so there is nothing to compare with" };
}

// ---------------------------------------------------------------- git (thin)
// Every call passes its arguments as argv, never through a shell or a
// newline-separated stdin protocol: a file name may hold a newline, a comma or
// a colon (#2516 review r1), and none of those may shift which content is read.
function git(root: string, args: string[]): Buffer {
  return execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
}

function gitOrNull(root: string, args: string[]): string | null {
  try {
    return git(root, args).toString("utf8").trim() || null;
  } catch {
    return null;
  }
}

export function repoBaseGit(root: string): BaseGit {
  return {
    hasCommit: (sha) => gitOrNull(root, ["cat-file", "-t", `${sha}^{commit}`]) === "commit",
    fetchCommit: (sha) => {
      git(root, ["fetch", "--no-tags", "--depth=1", "origin", sha]);
    },
    mergeBase: () => gitOrNull(root, ["merge-base", "HEAD", "origin/main"]),
    originMain: () => gitOrNull(root, ["rev-parse", "--verify", "--quiet", "origin/main^{commit}"]),
  };
}

/**
 * The top-level `locales/ko/*.json` blobs at `base`, by file name. The listing
 * is NUL-separated (`ls-tree -z`) and each blob is read by its object id, so a
 * file name is never parsed back out of git's output or put into a revision.
 */
export function readBaseLocaleFiles(root: string, base: string): Map<string, string> {
  const listing = git(root, ["ls-tree", "-z", "--full-name", base, "--", `${LOCALE_DIR}/`]).toString("utf8");
  const out = new Map<string, string>();
  for (const record of listing.split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    const [, type, oid] = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    if (type !== "blob" || !path.startsWith(`${LOCALE_DIR}/`)) continue;
    const name = path.slice(LOCALE_DIR.length + 1);
    if (name.includes("/") || !name.endsWith(".json")) continue;
    out.set(name, git(root, ["cat-file", "blob", oid]).toString("utf8"));
  }
  return out;
}

function main(): void {
  const root = process.cwd();
  const log = (line: string) => console.log(line);
  const base = chooseBase(process.env.EXPLANATORY_COPY_BASE, repoBaseGit(root));
  if ("skip" in base) {
    process.exitCode = reportSkip(base.skip, process.env.GITHUB_ACTIONS === "true", log);
    return;
  }
  const baseTexts = readBaseLocaleFiles(root, base.sha);
  const files = readdirSync(join(root, LOCALE_DIR))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const pairs: LocaleFilePair[] = files.map((file) => {
    const headText = readFileSync(join(root, LOCALE_DIR, file), "utf8");
    const baseText = baseTexts.get(file);
    return { file, base: baseText === undefined ? null : JSON.parse(baseText), head: JSON.parse(headText), headText };
  });
  process.exitCode = reportExplanatoryCopy(pairs, base.label, log);
}

if (require.main === module) main();
