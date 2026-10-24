// Q-261014-84 가 · 85 나: Korean screen facts use ~습니다; questions,
// suggestions and the user's own replies keep 해요체. This is a separate
// failing gate, not the warning-only explanatory-copy checklist (Q-89).
// Scope/limits and the reasons for each exception: docs/COPY-ENDINGS-CHECK.md.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type CopyEntry = { file: string; key: string; value: string };
export type EndingHit = CopyEntry & { ending: string };
export type EndingScan = { scanned: number; excluded: number; hits: EndingHit[] };

// These are semantic roles, not whole-file exemptions. Pin the reviewed value
// too: repurposing an answer key for an app status must not silently pass.
const USER_COPY: Readonly<Record<string, readonly [value: string, reason: string]>> = {
  "consent.json:recordRead.notNow": ["지금은 안 할게요", "T10 Q-71 consent refusal button, spoken by the user; legal draft 2026-10-13"],
  "auth.json:residenceCountry.notListed": ["내 거주 국가가 목록에 없어요", "ResidenceCountryField option spoken by the user"],
  "formats.json:add.placeholder": ["예: 팟캐스트에서 출연자와 핵심 주장을 정리하고 싶어요", "AddFormatFlow example of the user's input"],
  "home.json:ds.possible.a1Body": ["생각한 것을 직접 만드는 일을 하고 싶어요", "DeepSpaceViews sample aspiration, in the user's voice"],
  "home.json:ds.possible.a2Body": ["많은 사람보다 가까운 몇 명과 오래 지내고 싶어요", "DeepSpaceViews sample aspiration, in the user's voice"],
  "home.json:ds.possible.a3Body": ["나만의 기준으로 결정하고 싶어요", "DeepSpaceViews sample aspiration, in the user's voice"],
  "interview.json:drill.enough": ["여기까지 할래요", "interview answer chip"],
  "interview.json:drill.dontKnow": ["모르겠어요", "interview answer chip"],
  "interview.json:drill.concrete": ["사실만 이야기할래요", "interview answer chip"],
  "ops.json:phone.board.queue.done": ["했어요", "BoardParts done choice, spoken by the user"],
  "ops.json:phone.board.custom.skip": ["괜찮아요", "custom-board skip choice, spoken by the user"],
  "ops.json:copy.consentOnce": ["처음 한 번만. 캘린더 접근을 허용할게요.", "user's permission choice; do not rewrite consent for style"],
  "peer.json:shareMessage": ["내가 어떤 사람으로 보이는지 궁금해요. 1분 정도 걸리는 질문 다섯 개에 답해 주세요.", "peer-invites Share message written in the sender's voice"],
};

// Q-84 census explicitly defers these 17 consent strings to the next consent
// version. Keep that existing text, not an exemption for any future consent key.
const DEFERRED_CONSENT: Readonly<Record<string, string>> = {
  intro: "AI 기능에 내 내용을 사용하는 동의를 확인하거나 철회할 수 있어요. 기록과 다른 개인정보 설정은 그대로 유지돼요.",
  loadError: "지금은 동의 설정을 불러올 수 없어요. 변경이 확인되지 않았으니 잠시 후 다시 시도해 주세요.",
  saveError: "변경 결과를 확인하지 못했어요. 현재 상태를 확인한 뒤 다시 시도해 주세요.",
  conflict: "동의 상태가 바뀌었어요. 다시 불러온 뒤 내용을 확인해 주세요.",
  saved: "동의를 기록했어요.",
  withdrawn: "AI 처리 동의를 철회했어요.",
  "states.granted": "현재 동의가 기록되어 있어요",
  "states.revoked": "AI 처리 동의가 철회되어 있어요",
  "states.blocked": "이 계정은 AI 처리를 이용할 수 없어요.",
  collect: "새 동의를 확인하는 동안 기존 이용은 유지돼요. 여기서 철회하면 이후 AI 요청은 중단돼요.",
  updateRequired: "동의하려면 앱을 업데이트하고 현재 문서를 확인해 주세요. 동의 철회는 여기서 할 수 있어요.",
  ineligible: "지금은 이 계정의 동의를 갱신할 수 없어요. 계정 정보를 확인하거나 지원에 문의해 주세요.",
  withdrawHelp: "철회하면 다시 동의할 때까지 대화·분석·음성 받아쓰기·기록 색인을 포함한 새 AI 요청이 중단돼요. 기록은 삭제되지 않아요.",
  limits: "이미 제공자에게 보낸 내용은 회수할 수 없어요. 이 설정은 완료된 결과나 기존 기록을 삭제하지 않아요.",
  consent_required: "AI 처리를 위한 동의 확인이 필요해요. 동의 설정을 확인한 뒤 요청을 다시 보내 주세요.",
  consent_check_unavailable: "AI 처리 동의를 확인하지 못했어요. 동의 상태를 확인한 뒤 다시 시도해 주세요.",
  blockedHelp: "다른 동의 선택은 그대로 적용돼요. AI 처리를 이용할 수 없다면 개인정보 설정을 확인해 주세요.",
};

/** Approved screen exceptions and reviewed non-app voices only. */
export function endingExclusion({ file, key, value }: CopyEntry): string | null {
  if (file === "profile.json" && key.startsWith("contextImport.")) return "Q-85: external AI import";
  if (file === "secondb.json" && (
    key.startsWith("planSuggestion.oneOff.") ||
    /^planSuggestion\.reminderSaved(NoReminder|ReminderDenied|ReminderFailed)$/.test(key)
  )) return "Q-85: reminder guidance";
  if (USER_COPY[`${file}:${key}`]?.[0] === value) return USER_COPY[`${file}:${key}`][1];
  if (file === "consent.json" && key.startsWith("serviceControl.") &&
    DEFERRED_CONSENT[key.slice("serviceControl.".length)] === value) return "Q-84: consent version deferred";
  return null;
}

// Finite, reviewable suffix families, not /요$/: 소요/필요/개요/가요 are nouns;
// ~세요/셔요/나요/까요 are requests or questions. This is not a morphological
// parser and does not claim to classify every Korean sentence.
const DECLARATIVE_ENDING = /(?:[아어여예에해돼워와줘져겨려러라커켜혀쳐춰봐]요|[가-힣](?:네요|군요|거든요|데요|고요|게요|래요))$/u;

/** Candidate declarative endings at sentence boundaries, including mid-value. */
export function declarativeEndings(value: string): string[] {
  // Quoted source/user language is not the app's own statement. Mask only
  // balanced quoted spans; an unmatched quote cannot hide the remaining text.
  const text = value.replace(/「[^「」]*」|『[^『』]*』|“[^“”]*”|‘[^‘’]*’|"[^"\n]*"|'[^'\n]*'/gu, " ");
  const hits: string[] = [];
  for (const match of text.matchAll(/([가-힣]+요)[ \t]*(?=([.!?！？。…]+|\r?\n|$))/gu)) {
    if (/[?？]/u.test(match[2])) continue;
    if (DECLARATIVE_ENDING.test(match[1])) hits.push(match[1]);
  }
  return hits;
}

function strings(value: unknown, path: string[] = []): Array<{ key: string; value: string }> {
  if (typeof value === "string") return [{ key: path.join("."), value }];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => strings(child, [...path, key]));
}

export function scanEndingBundles(bundles: ReadonlyArray<{ file: string; bundle: unknown }>): EndingScan {
  const result: EndingScan = { scanned: 0, excluded: 0, hits: [] };
  for (const { file, bundle } of bundles) {
    for (const { key, value } of strings(bundle)) {
      const entry = { file, key, value };
      result.scanned++;
      if (endingExclusion(entry)) {
        result.excluded++;
        continue;
      }
      // B안 permits suggestions. This one sentence is an invitation to resume,
      // not a claim about saved state. Check the preceding fact sentences too.
      const checked = file === "interview.json" && key === "drill.dayLimit"
        ? value.replace("지금까지 나눈 이야기를 저장하고 나중에 이어서 해요.", "")
        : value;
      for (const ending of declarativeEndings(checked)) result.hits.push({ ...entry, ending });
    }
  }
  return result;
}

/** Includes future nested locale bundles; malformed/absent input is a failure. */
export function readEndingBundles(dir: string, prefix = ""): Array<{ file: string; bundle: unknown }> {
  const bundles: Array<{ file: string; bundle: unknown }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = `${prefix}${entry.name}`;
    if (entry.isDirectory()) bundles.push(...readEndingBundles(join(dir, entry.name), `${file}/`));
    else if (entry.isFile() && entry.name.endsWith(".json")) {
      const bundle: unknown = JSON.parse(readFileSync(join(dir, entry.name), "utf8"));
      if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) throw new Error(`Invalid locale bundle: ${file}`);
      bundles.push({ file, bundle });
    }
  }
  return bundles;
}

export function checkCopyEndings(root: string, log: (line: string) => void): 0 | 1 {
  const bundles = readEndingBundles(join(root, "locales", "ko"));
  if (bundles.length === 0) throw new Error("No Korean locale bundles found");
  const scan = scanEndingBundles(bundles);
  for (const hit of scan.hits) {
    // JSON encoding prevents a translation's newline/control text from becoming
    // a GitHub workflow command. No automatic wording changes are made.
    log(`copy-endings FAIL ${JSON.stringify(`locales/ko/${hit.file}:${hit.key}`)}: ${JSON.stringify(hit.ending)}`);
  }
  log(`copy-endings ${scan.hits.length ? "FAIL" : "PASS"} ${bundles.length} ko bundles, ${scan.scanned} strings, ` +
    `${scan.excluded} scoped exclusions, ${scan.hits.length} declarative ending(s); see docs/COPY-ENDINGS-CHECK.md`);
  return scan.hits.length ? 1 : 0;
}

if (require.main === module) process.exitCode = checkCopyEndings(process.cwd(), (line) => console.log(line));
