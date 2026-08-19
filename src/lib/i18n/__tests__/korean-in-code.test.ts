// 코드에 박힌 한국어 — **무엇이 카피이고 무엇이 규칙인지** 고정한다.
//
// ## 왜 이 가드가 필요했나
//
// "코드에 박힌 한국어 2,553줄" 이라는 숫자가 돌아다녔고, 그 숫자가 B4 를
// "거대한 번역 작업" 처럼 보이게 했다. **그 숫자는 틀렸다.** 두 가지를 잘못 셌다:
//
//   1. `case "home": // 별자리` 같은 **꼬리 주석**을 코드로 셌다
//   2. **매칭 규칙**과 UI 카피를 구분하지 않았다
//
// 문자열 리터럴만, 주석을 빼고 다시 세면 EN 경로가 없는 파일은 29개다. 그리고 그
// 대부분은 번역하면 **앱이 고장 나는** 것들이다:
//
//   detect-domain.ts     한국어 도메인 키워드 목록 → 번역하면 분류가 죽는다
//   finance-csv.ts       한국 은행 CSV 컬럼명    → 번역하면 가져오기가 죽는다
//   lexicon.ts           금지어 패턴            → 번역하면 안전 검사가 죽는다
//   crisis-eval-corpus   위기 평가 픽스처        → 번역하면 평가가 무의미해진다
//
// 그래서 이 가드는 "한국어를 없애라" 가 아니라 **"한국어가 왜 여기 있는지 적어라"** 다.
// 새 파일이 EN 경로 없이 한국어 문자열을 들이면, 이유를 달아 아래 표에 올리거나
// i18n 으로 빼야 한다.
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();

/** 이 목록 밖은 검사하지 않는다 — 성격상 한국어가 맞거나, 사용자에게 안 보인다. */
const NOT_PRODUCT_SURFACE = [
  /^src\/lib\/legal\//, // 한국 관할 법률 원문
  /^src\/lib\/dev\//, // 개발자 도구
  /^src\/app\/dev-screens/,
  /^src\/app\/canon/,
  /^src\/app\/deepspace-/,
  /^src\/app\/(graph|trends|trinity)\./,
  /HubDockScreen/,
  /FlowMapScreen/,
  /ComponentsPreview/,
  /__tests__/,
];

/**
 * EN 경로 없이 한국어 문자열을 갖는 것이 **옳은** 파일과 그 이유.
 *
 * 새로 추가하려면 이유를 적어라. 이유를 못 대면 그건 i18n 으로 빼야 할 카피다.
 */
const KOREAN_BY_DESIGN: Record<string, string> = {
  // ── 매칭 규칙: 번역하면 기능이 죽는다 ──
  "src/lib/records/detect-domain.ts": "도메인 분류용 한국어 키워드 목록",
  "src/lib/safety/lexicon.ts": "금지어 패턴 (안전 분류기 입력)",
  "src/lib/safety/anthro.ts": "의인화 금지 패턴",
  "src/lib/safety/crisis-eval-corpus.ts": "위기 분류 평가 픽스처 — 번역하면 평가가 무의미",
  "src/lib/import/finance-csv.ts": "한국 은행 CSV 컬럼명",
  "src/lib/import/detect.ts": "가져오기 형식 판별 패턴",
  "src/lib/import/kakao.ts": "카카오톡 내보내기 파싱 패턴",
  "src/lib/import/hints.ts": "가져오기 판별 힌트",
  "src/lib/import/youtube.ts": "유튜브 제목 패턴",
  "src/lib/graph/pattern-data-color.ts": "한국어 키워드 → 색 매핑",
  "src/lib/community/chat.ts": "방 이름 생성용 한국어 낱말 풀",
  "src/lib/i18n/josa.ts": "조사 판정 상수 — 한국어 문법 그 자체",
  "src/lib/i18n/keep-all.ts": "한국어 줄바꿈 규칙",
  "src/lib/persona/address.ts": "호칭 '님'/'당신' — 한국어에서만 쓰는 설계",

  // ── LLM 프롬프트: UI 가 아니다. 문구를 바꾸면 모델 동작이 바뀐다 ──
  "src/lib/ops/recommend.ts": "LLM 시스템 프롬프트",
  "src/lib/ops/daily-brief.ts": "LLM 시스템 프롬프트",
  "src/lib/persona/profile-details.ts": "LLM 프롬프트용 필드 설명",

  // ── 개념 이름: 데이터에 가깝다 ──
  "src/lib/persona/domain-stars.ts": "생활 도메인 이름 (개념 정본)",
  "src/lib/persona/stars.ts": "심리 구인 이름 (개념 정본)",

  // ── 한국어 폴백: 화면은 이미 i18n 을 쓰고, 이건 인자 없을 때의 기본값 ──
  "src/screens/deepspace/records-timeline.ts": "라벨 폴백 — 화면은 dsTimeLabels(t) 로 i18n 을 넘긴다",
  "src/screens/deepspace/wiki-graph-view.ts": "라벨 폴백",
  "src/lib/ops/grounding.ts": "요약 문자열 폴백",
  "src/lib/reasoning/remaining-copy.ts": "한도 표기 폴백",
  "src/lib/finance/ledger.ts": "분류 기본값 '기타'",
  "src/lib/google/tasks.ts": "가져오기 출처 라벨",
  "src/lib/import/ledger-ratify.ts": "가져오기 출처 라벨",
  "src/lib/relation/import-signals.ts": "카카오 별칭 안내 (한국 기능 전용)",
  "src/lib/share/insight-card.ts": "공유 카드 기본 문구",

  // ── dev 전용 셸 (사용자에게 안 보임) ──
  "src/components/deepspace/DeepSpaceHubDock.tsx": "dev 전용 허브 독",
  "src/components/deepspace/shell/PhoneShell.tsx": "dev 전용 폰 셸",
  "src/components/deepspace/SecondbHead.tsx": "dev 전용 셸 라벨",
};

const BS = String.fromCharCode(92);

/** 주석을 건너뛰고 문자열/템플릿 리터럴만 모은다. 정규식 없이 한 글자씩 읽는다. */
function stringLiterals(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      let buf = "";
      i++;
      while (i < n) {
        const ch = src[i];
        if (ch === BS) { buf += src[i + 1] ?? ""; i += 2; continue; }
        if (ch === q) { i++; break; }
        buf += ch;
        i++;
      }
      out.push(buf);
      continue;
    }
    i++;
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p.slice(ROOT.length + 1).split(sep).join("/"));
  }
  return out;
}

/** 이 파일이 영어 경로를 갖고 있는가 (i18n 을 쓰거나 로케일 표를 들고 있는가). */
function hasEnglishPath(src: string): boolean {
  return /useTranslation|i18next|AvailableUiLocale|\ben:\s*[{"]|locale\s*===|isKo/.test(src);
}

describe("코드에 박힌 한국어", () => {
  const offenders: { file: string; count: number; sample: string }[] = [];

  for (const file of sourceFiles(join(ROOT, "src"))) {
    if (NOT_PRODUCT_SURFACE.some((re) => re.test(file))) continue;
    if (file in KOREAN_BY_DESIGN) continue;
    const src = readFileSync(join(ROOT, file), "utf8");
    if (hasEnglishPath(src)) continue;
    const ko = stringLiterals(src).filter((l) => /[가-힣]/.test(l));
    if (ko.length > 0) offenders.push({ file, count: ko.length, sample: ko[0].slice(0, 40) });
  }

  it("영어 경로 없이 한국어를 들이는 새 파일이 없다", () => {
    // 실패했다면 둘 중 하나다:
    //   1. 사용자에게 보이는 카피다        -> i18n 으로 뺀다 (`t("...")`)
    //   2. 규칙·프롬프트·폴백이라 한국어가 맞다 -> KOREAN_BY_DESIGN 에 이유와 함께 올린다
    expect(offenders).toEqual([]);
  });

  it("면제 목록의 모든 항목이 이유를 달고 있다", () => {
    for (const [file, why] of Object.entries(KOREAN_BY_DESIGN)) {
      expect({ file, hasReason: why.trim().length > 4 }).toEqual({ file, hasReason: true });
    }
  });

  it("면제 목록에 사라진 파일이 남아 있지 않다", () => {
    // 낡은 면제는 다음에 같은 경로를 쓴 새 파일을 공짜로 통과시킨다.
    const all = new Set(sourceFiles(join(ROOT, "src")));
    const stale = Object.keys(KOREAN_BY_DESIGN).filter((f) => !all.has(f));
    expect(stale).toEqual([]);
  });
});
