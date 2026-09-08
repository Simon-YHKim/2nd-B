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
import * as ts from "typescript";

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
  // 렌즈 `scoring` 은 화면 카피가 아니라 **관문 ③ 의 명세**다 — "이 렌즈의 적중을
  // LLM 없이 어떻게 재는가". registry.test.ts 가 이 문자열을 읽어 검사하고,
  // 사람이 읽는 자리는 CLAUDE.md 지 UI 가 아니다. i18n 으로 빼면 명세와 검사가
  // 갈라진다.
  "src/lib/lenses/registry.ts": "렌즈 명세 (관문 ③ 채점 정의) — UI 카피 아님",

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
  // 정적 웹 셸의 <title>·description·og 태그. 하이드레이션 전에 그려지고
  // static export 는 모든 라우트에 같은 셸 하나를 쓰므로 t() 를 부를 자리가
  // 없다. 셸이 이미 lang="ko" 로 한국어 우선을 선언하고 있고, 문구는
  // docs/store-copy/drafts.json 의 검토된 ko 초안과 같은 말이다.
  // 문구 자체는 +html.tsx 에서 site-meta 로 옮겼다 — 같은 이름을 정적 <head> 와
  // 런타임 document.title 두 곳이 쓰는데 어긋나면 안 되기 때문이다. 그래서
  // 면제도 한국어가 실제로 사는 곳으로 따라 옮긴다. +html.tsx 를 면제로 남겨두면
  // 나중에 거기 새로 들어온 한국어가 공짜로 통과한다.
  "src/lib/site-meta.ts": "정적 웹 셸의 공유 메타 (하이드레이션 전, lang=ko)",

  // ── dev 전용 셸 (사용자에게 안 보임) ──
  "src/components/deepspace/DeepSpaceHubDock.tsx": "dev 전용 허브 독",
  "src/components/deepspace/shell/PhoneShell.tsx": "dev 전용 폰 셸",
  "src/components/deepspace/SecondbHead.tsx": "dev 전용 셸 라벨",
};

/** 실제 문자열과 템플릿 조각만 모은다. 정규식의 따옴표와 주석은 문자열이 아니다. */
function stringLiterals(src: string, file = "copy.tsx"): string[] {
  const out: string[] = [];
  const source = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      out.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
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

describe("한국어 문자열 추출", () => {
  it("정규식의 따옴표와 주석을 카피로 읽지 않는다", () => {
    const source = [
      "const rule = /[\"'](?:기록|메모)/u;",
      "// '한국어 주석'",
      "const label = '확인'; /* \"주석\" */",
    ].join("\n");
    expect(stringLiterals(source)).toEqual(["확인"]);
  });

  it("템플릿의 앞뒤와 보간식 안의 실제 문자열을 모두 읽는다", () => {
    expect(stringLiterals('const label = `안녕 ${name ?? "사용자"}, 다시 와요`;'))
      .toEqual(["안녕 ", "사용자", ", 다시 와요"]);
  });

  it("JSX 속성과 유니코드 이스케이프의 실제 문자열을 읽는다", () => {
    expect(stringLiterals('const view = <Button title="저장" label={"\\uD655인"} />;'))
      .toEqual(["저장", "확인"]);
  });
});

/**
 * 영어 경로를 *가진* 파일에 남아 있는 한국어 문자열의 현재 수.
 *
 * `hasEnglishPath` 는 원래 이 파일들을 통째로 건너뛰었다. 성질은 문자열 단위인데
 * ("이 카피가 번들에서 오는가") 면제가 파일 단위여서, `useTranslation` 을 한 번만
 * 써도 그 파일의 한국어 전부가 공짜로 통과했다 — 실측 124파일 2,705건이 그렇게
 * 통과 중이었다. 한 번에 고칠 수 있는 크기가 아니라서 래칫으로 바꾼다.
 *
 * 규칙: **늘면 실패, 줄어도 실패**(숫자를 내리라는 뜻). 새로 섞이는 파일도 실패한다.
 * 여기 있는 숫자는 목표가 아니라 빚이고, 0 이 되면 항목을 지운다.
 *
 * ⚠ 이 목록은 `KOREAN_BY_DESIGN` 과 다르다. 저기는 "한국어가 맞다"이고
 * 여기는 "아직 못 뺐다"이다. 프롬프트·검사문항·별칭처럼 번역하면 안 되는 것은
 * 여기가 아니라 저기로 올린다.
 */
const MIXED_FILE_DEBT: Record<string, number> = {
  "src/app/(auth)/sign-up.tsx": 1,
  "src/app/attachment.tsx": 15,
  "src/app/audit.tsx": 12,
  "src/app/call-reflection.tsx": 9,
  "src/app/capture.tsx": 14,
  "src/app/career-drilldown.tsx": 47,
  "src/app/career.tsx": 9,
  "src/app/core-brain.tsx": 9,
  "src/app/iden.tsx": 7,
  "src/app/inbox.tsx": 30,
  "src/app/index.tsx": 17,
  "src/app/interview.tsx": 4,
  "src/app/ipip-neo.tsx": 16,
  "src/app/manual.tsx": 42,
  "src/app/motivation.tsx": 6,
  "src/app/notices.tsx": 38,
  "src/app/onboarding.tsx": 1,
  "src/app/peer-invites.tsx": 1,
  "src/app/persona.tsx": 32,
  "src/app/processing-log.tsx": 24,
  "src/app/reasoning.tsx": 56,
  "src/app/review.tsx": 8,
  "src/app/rlss.tsx": 10,
  "src/app/secondb.tsx": 10,
  "src/app/settings.tsx": 11,
  "src/app/star/[domain].tsx": 20,
  "src/app/strengths.tsx": 20,
  "src/app/values.tsx": 20,
  "src/app/wiki.tsx": 9,
  "src/components/deep-space/AutoReasoningIntroSheet.tsx": 6,
  "src/components/deep-space/AxisCheck.tsx": 13,
  "src/components/deep-space/ConstellationHome.tsx": 16,
  "src/components/deep-space/DeepSpaceViews.tsx": 3,
  "src/components/deep-space/DomainStarLens.tsx": 54,
  "src/components/deepspace/BackgroundTaskDock.tsx": 4,
  "src/components/deepspace/CompletionToast.tsx": 4,
  "src/components/deepspace/DeepSpaceLoader.tsx": 7,
  "src/components/deepspace/ops/copy.ts": 105,
  "src/components/graph/CharacterPathLayer.tsx": 1,
  "src/components/graph/NavGraph.tsx": 31,
  "src/components/m3/date-picker/DatePicker.tsx": 38,
  "src/components/persona/FacetBreakdown.tsx": 1,
  "src/components/persona/TraitRadar.tsx": 3,
  "src/components/premium/graph-bits.tsx": 2,
  "src/components/premium/tab-bar.tsx": 4,
  "src/components/quant/LikertChoiceGroup.tsx": 3,
  "src/components/quant/QuantIntroModal.tsx": 2,
  "src/components/ui/BackArrow.tsx": 31,
  "src/components/ui/DrillProgress.tsx": 10,
  "src/lib/audit/axis-checks.ts": 24,
  "src/lib/audit/axis-estimate.ts": 8,
  "src/lib/audit/frameworkLabels.ts": 18,
  "src/lib/audit/questions.ts": 25,
  "src/lib/capture/fourw.ts": 5,
  "src/lib/capture/life-area-intent.ts": 22,
  "src/lib/capture/structured.ts": 4,
  "src/lib/career/achievement-form.ts": 12,
  "src/lib/characters.ts": 12,
  "src/lib/chat/conversation.ts": 24,
  "src/lib/chat/keep-exchange.ts": 3,
  "src/lib/chat/personas.ts": 12,
  "src/lib/chat/rag.ts": 1,
  "src/lib/entitlements/reasoning-cap.ts": 4,
  "src/lib/graph/relatedness.ts": 72,
  "src/lib/i18n/locales.ts": 1,
  "src/lib/iden/build-iden.ts": 21,
  "src/lib/iden/load-persisted-iden.ts": 12,
  "src/lib/iden/render-html.ts": 8,
  "src/lib/import/proposals.ts": 19,
  "src/lib/interview/probe.ts": 56,
  "src/lib/interview/stuck.ts": 10,
  "src/lib/journal/daily-prompts.ts": 15,
  "src/lib/knowledge/retrieve.ts": 30,
  "src/lib/llm/boundary.ts": 49,
  "src/lib/llm/safety.ts": 4,
  "src/lib/llm/untrusted.ts": 1,
  "src/lib/notices/adapt.ts": 2,
  "src/lib/persona/assessment-summary.ts": 13,
  "src/lib/persona/attachment.ts": 32,
  "src/lib/persona/bfi.ts": 93,
  "src/lib/persona/big-five-screen.ts": 11,
  "src/lib/persona/build.ts": 44,
  "src/lib/persona/center.ts": 20,
  "src/lib/persona/evidence.ts": 6,
  "src/lib/persona/ipip-neo.ts": 150,
  "src/lib/persona/mbti.ts": 80,
  "src/lib/persona/motivation-survey.ts": 22,
  "src/lib/persona/northstar.ts": 6,
  "src/lib/persona/persona-synthesis.ts": 8,
  "src/lib/persona/proposal-display.ts": 11,
  "src/lib/persona/propose-self-model.ts": 9,
  "src/lib/persona/reflection-scaffold.ts": 4,
  "src/lib/persona/rlss.ts": 15,
  "src/lib/persona/self-portrait.ts": 11,
  "src/lib/persona/seven-proposal-context.ts": 3,
  "src/lib/persona/strengths-survey.ts": 25,
  "src/lib/persona/tier-history.ts": 4,
  "src/lib/persona/trait-radar-geometry.ts": 5,
  "src/lib/persona/values-survey.ts": 30,
  "src/lib/records/create.ts": 6,
  "src/lib/records/records-graph.ts": 2,
  "src/lib/relation/star-alias.ts": 230,
  "src/lib/village-ui.ts": 13,
  "src/lib/wiki/capture-image.ts": 3,
  "src/lib/wiki/classify-clipper.ts": 13,
  "src/lib/wiki/clipper-templates.ts": 23,
  "src/lib/wiki/context-pack.ts": 24,
  "src/lib/wiki/export.ts": 25,
  "src/lib/wiki/import-external.ts": 21,
  "src/lib/wiki/phase1.ts": 7,
  "src/lib/wiki/propose-template.ts": 15,
  "src/lib/wiki/template-validate.ts": 2,
  "src/screens/deepspace/DeepSpaceDesignScreens.tsx": 69,
  "src/screens/deepspace/dds-manual-content.ts": 25,
  "src/screens/deepspace/dds-record-detail-screen.tsx": 4,
  "src/screens/deepspace/dds-wiki-records-screens.tsx": 4,
  "src/screens/deepspace/growth/WeeklyGrowthScreen.tsx": 14,
  "src/screens/deepspace/import/ImportHubScreen.tsx": 87,
  "src/screens/deepspace/museum/AiMuseumScreen.tsx": 86,
  "src/screens/deepspace/onboarding/TTFVScreen.tsx": 29,
  "src/screens/deepspace/ops/screens.tsx": 14,
};

describe("코드에 박힌 한국어", () => {
  const offenders: { file: string; count: number; sample: string }[] = [];
  const newlyMixed: { file: string; count: number; sample: string }[] = [];
  const grew: { file: string; was: number; now: number }[] = [];
  const shrank: { file: string; was: number; now: number }[] = [];

  for (const file of sourceFiles(join(ROOT, "src"))) {
    if (NOT_PRODUCT_SURFACE.some((re) => re.test(file))) continue;
    if (file in KOREAN_BY_DESIGN) continue;
    const src = readFileSync(join(ROOT, file), "utf8");
    const ko = stringLiterals(src, file).filter((l) => /[가-힣]/.test(l));
    if (ko.length === 0) continue;
    if (hasEnglishPath(src)) {
      const was = MIXED_FILE_DEBT[file];
      if (was === undefined) newlyMixed.push({ file, count: ko.length, sample: ko[0].slice(0, 40) });
      else if (ko.length > was) grew.push({ file, was, now: ko.length });
      else if (ko.length < was) shrank.push({ file, was, now: ko.length });
      continue;
    }
    offenders.push({ file, count: ko.length, sample: ko[0].slice(0, 40) });
  }

  it("i18n 을 쓰는 파일이 한국어를 새로 들이지 않는다", () => {
    // 이 파일은 이미 t() 를 쓰고 있는데 카피를 코드에 박았다. 번들로 빼거나,
    // 번역하면 안 되는 것이면 KOREAN_BY_DESIGN 에 이유와 함께 올린다.
    expect(newlyMixed).toEqual([]);
  });

  it("남은 빚이 늘지 않는다", () => {
    expect(grew).toEqual([]);
  });

  it("빚을 갚았으면 숫자도 내린다", () => {
    // 래칫은 양방향이다. 안 내리면 다음 사람이 그만큼 다시 넣어도 안 걸린다.
    expect(shrank).toEqual([]);
  });

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
