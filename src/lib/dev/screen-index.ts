// 개발자 화면 목록 — 앱 안에서 모든 화면에 직접 들어가 보기 위한 레지스트리.
//
// 왜 있나 (Simon 2026-08-19, 결정 콘솔 V2 의견):
//   "남은 화면 및 링크가 없는 것은 내가 앱에서 볼 수 있도록 별도 경로를 만들자.
//    설정 탭에 개발자용 화면으로 진입할 수 있는 버튼이 있었으면 좋겠고, 이곳에서
//    진입 버튼들을 만들어서 화면들을 보고 기능이 되는지를 확인할 수 있으면 좋겠어."
//
// 이 앱에는 **production 사용자 동선에 두면 안 되는 화면이 실제로 있다.** `/canon` ·
// `/deepspace-flowmap` · `/deepspace-hub` · `/deepspace-preview` 는 개발·디자인 검수용이고,
// `/peer/[token]` · `/community/join/[token]` · `/oauth-callback` 은 외부 딥링크/콜백으로만
// 들어와야 한다. 이들을 전부 "입구 없음" 한 단어로 부르면 살아 있는 계약과 죽은 화면을
// 구분할 수 없다. 그래서 축을 둘로 가른다:
//
//   · `entry`  — **진입 출처 축.** 이 라우트에 어떻게 도달하는가
//     (일반 앱 내 이동 / 외부 딥링크 계약 / 옛 링크 호환 / Design Lab).
//   · `render` — **UI 모드별 렌더 축.** mount 됐을 때 실제로 무엇을 그리는가
//     (실화면 / 항상 redirect / 딥스페이스·legacy 가 갈리는 분기).
//
// 둘은 직교한다. /jarvis 는 옛 링크로만 들어오고(entry) 항상 /secondb 로 넘긴다(render).
// /discover 는 일반 진입인데(entry) legacy 스킨에서만 /insights 로 넘긴다(render).
//
// **이 목록은 손으로 관리하지만 낡지 않는다.**
// `__tests__/screen-index.test.ts` 가 `src/app` 의 실제 라우트 파일 목록과
// 1:1 로 대조한다. 화면을 추가하고 여기 안 적으면 CI 가 막는다. 반대로 여기
// 적힌 라우트의 파일이 없어져도 막는다. 그래서 "개발용이라 낡아도 된다"가
// 성립하지 않는다. 두 축의 선언도 같은 테스트가 라우트 소스를 읽어 대조한다.
//
// 라우트 표기는 **expo-router 파일 경로**가 아니라 **실제 URL** 이다:
//   index          -> /
//   (auth)/sign-in -> /sign-in      (그룹 세그먼트는 URL 에서 사라진다)
//   star/[domain]  -> /star/career  (동적 구간은 아래에서 견본값을 준다)

/** 라우트 파일 경로(`src/app` 기준, 확장자 없음). 테스트가 이걸로 파일 존재를 확인한다. */
export type RouteFile = string;

/** 진입 출처 축 — 정상 앱 진입이 아닌 화면만 명시한다. */
export type SpecialScreenEntry =
  /** 외부 딥링크/콜백 계약. mount 만으로 조회·가입·세션 변경이 시작될 수 있다. */
  | { kind: "deep-link"; contract: "invite" | "peer-response" | "oauth-callback" }
  /** 저장된 옛 링크 호환 전용. 앱 안 일반 메뉴에는 진입점이 없다. */
  | { kind: "legacy-link" }
  /** 개발용 디자인 검수 컬렉션. production 동선에 없다. */
  | { kind: "dev"; collection: "design-lab" };

/** `entry` 를 생략한 화면은 기존 앱 안의 정상 진입을 그대로 뜻한다. */
export type ScreenEntry = { kind: "standard" } | SpecialScreenEntry;

/** UI 모드 한쪽에서의 렌더 결과. */
export type ModeRender =
  | { kind: "screen" }
  | { kind: "redirect"; to: string }
  /** 개발 빌드에서만 실화면, production 빌드는 redirect (예: /trinity). */
  | { kind: "dev-gated-screen"; productionRedirect: string };

/** UI 모드별 렌더 축 — 실화면이 아닌 라우트만 명시한다. */
export type SpecialRenderBehavior =
  /** 어느 모드에서든 다른 라우트로 넘기기만 한다. 은퇴 화면의 호환 경로. */
  | { kind: "redirect"; to: string; lifecycle: "retired" }
  /** 딥스페이스(기본)와 legacy(EXPO_PUBLIC_UI=legacy)가 서로 다른 것을 그린다. */
  | { kind: "ui-mode-split"; deepspace: ModeRender; legacy: ModeRender };

/** `render` 를 생략한 화면은 어느 모드에서든 실화면을 그린다. */
export type RenderBehavior = { kind: "screen" } | SpecialRenderBehavior;

const STANDARD_SCREEN_ENTRY = { kind: "standard" } as const satisfies ScreenEntry;
const SCREEN_RENDER = { kind: "screen" } as const satisfies RenderBehavior;

export interface DevScreen {
  /** `src/app` 아래 파일 경로. 예: "(auth)/sign-in", "star/[domain]", "index" */
  file: RouteFile;
  /** 실제로 눌렀을 때 가는 URL. 동적 구간에는 견본값이 들어 있다. */
  href: string;
  /** 한국어 이름. 캐논에 제목이 있으면 그걸 썼다. */
  label: string;
  /** 로그인이 필요하다 (파일에 `<Redirect href="/sign-in" />` 가 있다). */
  auth?: true;
  /** 개발 빌드에서만 열린다 (`<DevOnlyRoute>` 뒤). */
  dev?: true;
  /** 동적 구간이 있어 견본값으로 들어간다. 진짜 데이터가 아니면 빈 상태가 보인다. */
  sample?: true;
  /** 진입 출처 축. 생략하면 `standard`. */
  entry?: SpecialScreenEntry;
  /** UI 모드별 렌더 축. 생략하면 어느 모드에서든 실화면. */
  render?: SpecialRenderBehavior;
  /** 한 줄 메모. 왜 비어 보이는지, 무엇을 확인해야 하는지. */
  note?: string;
}

export interface DevScreenGroup {
  title: string;
  screens: DevScreen[];
}

export const DEV_SCREEN_GROUPS: readonly DevScreenGroup[] = [
  {
    title: "홈 · 별자리",
    screens: [
      { file: "index", href: "/", label: "별자리 홈", auth: true },
      { file: "core-brain", href: "/core-brain", label: "북극성", auth: true },
      { file: "northstar", href: "/northstar", label: "북극성 문장", auth: true },
      { file: "star/[domain]", href: "/star/career", label: "도메인 별 (커리어)", auth: true, sample: true, note: "career · finance · growth · relation · health · recreation · collect. 2026-08-24 부터 홈 별자리에서는 안 열린다 — 생활 도메인은 세컨비 대시보드로 갔다" },
      { file: "me/[star]", href: "/me/school", label: "별 요약", auth: true, sample: true, note: "profile · infancy · school · twenties · later · work · now. 홈에서 별을 누르면 여기로 온다(Simon 결정 4 = B)" },
      { file: "career-drilldown", href: "/career-drilldown", label: "별 파고들기", auth: true },
      { file: "brightness", href: "/brightness", label: "밝기 변화 8주", auth: true },
      { file: "beyond", href: "/beyond", label: "앱 밖에서", auth: true },
    ],
  },
  {
    title: "담기 · 기록",
    screens: [
      { file: "capture", href: "/capture", label: "담기", auth: true },
      { file: "capture-full", href: "/capture-full", label: "담기 전체 (메모·링크·클립·OCR·파일)" },
      { file: "records", href: "/records", label: "별가루 목록", auth: true },
      { file: "record/[id]", href: "/record/sample", label: "별가루 상세", auth: true, sample: true, note: "실제 id 가 아니라서 '없음' 상태가 보인다" },
      { file: "wiki", href: "/wiki", label: "위키 둘러보기", auth: true },
      { file: "attachment", href: "/attachment", label: "애착 유형", auth: true },
      {
        file: "journal",
        href: "/journal",
        label: "저널 (은퇴)",
        entry: { kind: "legacy-link" },
        render: { kind: "redirect", to: "/capture", lifecycle: "retired" },
        note: "저장된 옛 링크 호환 전용. 일기는 /capture 의 '일기' 모드로 들어갔다",
      },
      { file: "formats", href: "/formats", label: "클리퍼 형식 관리", auth: true, note: "관리 화면은 /formats?view=manager" },
      { file: "share-card", href: "/share-card", label: "공유 카드", auth: true },
      { file: "srs", href: "/srs", label: "언어 복습 (SRS)" },
      { file: "reading", href: "/reading", label: "읽기 · 배움 선반" },
    ],
  },
  {
    title: "세컨비 · 대화",
    screens: [
      { file: "secondb", href: "/secondb", label: "세컨비 대화", auth: true },
      {
        file: "jarvis",
        href: "/jarvis",
        label: "자비스 (은퇴)",
        entry: { kind: "legacy-link" },
        render: { kind: "redirect", to: "/secondb", lifecycle: "retired" },
        note: "저장된 옛 링크를 위해 /secondb redirect 만 유지한다 (쿼리 파라미터 보존). 일반 메뉴에 다시 노출하지 않는다",
      },
      { file: "interview", href: "/interview", label: "심층 인터뷰", auth: true },
      // 고아 아님(2026-09-01 재검증): /ops 도구 격자와 /growth 버튼에서 들어온다.
      // 09-01 감사 1차의 '고아' 판정은 grep 함정(MSYS 경로 변환)이 만든 오판이었다.
      {
        file: "imagine",
        href: "/imagine",
        label: "공상하기",
        render: { kind: "ui-mode-split", deepspace: { kind: "screen" }, legacy: { kind: "redirect", to: "/secondb" } },
        note: "진입: /ops 도구 격자 · /growth. legacy 는 /secondb 의 Divergent 모드로 넘긴다",
      },
      { file: "research", href: "/research", label: "연결 찾기", auth: true },
      { file: "reasoning", href: "/reasoning", label: "리즈닝", auth: true },
      { file: "review", href: "/review", label: "제안 확인 (propose→ratify)" },
      { file: "ratifications", href: "/ratifications", label: "확인 이력", auth: true },
    ],
  },
  {
    title: "검사 · 페르소나",
    screens: [
      {
        file: "persona",
        href: "/persona",
        label: "페르소나",
        auth: true,
        render: { kind: "ui-mode-split", deepspace: { kind: "redirect", to: "/core-brain" }, legacy: { kind: "screen" } },
        note: "딥스페이스(기본)에서 '나를 보는 자리'의 정본은 /core-brain 이라 그리로 넘긴다. legacy 는 실화면",
      },
      { file: "big-five", href: "/big-five", label: "Big Five", auth: true },
      { file: "ipip-neo", href: "/ipip-neo", label: "IPIP-NEO-120", auth: true },
      { file: "rlss", href: "/rlss", label: "삶의 만족도 (RLSS)", auth: true },
      { file: "values", href: "/values", label: "가치관", auth: true },
      { file: "strengths", href: "/strengths", label: "강점", auth: true },
      { file: "motivation", href: "/motivation", label: "동기", auth: true },
      { file: "esm", href: "/esm", label: "순간 기록 (ESM)", auth: true },
      {
        file: "mbti",
        href: "/mbti",
        label: "MBTI (은퇴)",
        entry: { kind: "legacy-link" },
        render: { kind: "redirect", to: "/persona", lifecycle: "retired" },
        note: "저장된 옛 링크 호환 전용. /persona 가 스킨 분기를 소유해서 딥스페이스에선 두 홉으로 /core-brain 까지 간다",
      },
      { file: "iden", href: "/iden", label: "IDEN 포터블 정체성", auth: true },
      {
        file: "seen",
        href: "/seen",
        label: "보여지는 나",
        render: { kind: "ui-mode-split", deepspace: { kind: "screen" }, legacy: { kind: "redirect", to: "/persona" } },
        note: "legacy 는 독립 스킨이 없어 /persona 의 종합으로 넘긴다. 진입: 프로필 허브 분석 그룹",
      },
      { file: "audit", href: "/audit", label: "과거의 나", auth: true },
    ],
  },
  {
    title: "생활 도메인",
    screens: [
      { file: "career", href: "/career", label: "커리어 타임라인", auth: true },
      { file: "career-input", href: "/career-input", label: "성과 입력", auth: true },
      { file: "milestones", href: "/milestones", label: "목표 · 마일스톤" },
      { file: "ledger", href: "/ledger", label: "돈 점검" },
      { file: "growth", href: "/growth", label: "나의 변화" },
      { file: "rest", href: "/rest", label: "취미 · 여가", auth: true },
      { file: "meals", href: "/meals", label: "주간 식사" },
      { file: "side-project", href: "/side-project", label: "사이드 프로젝트" },
      { file: "people", href: "/people", label: "사람 기록", auth: true },
      { file: "call-reflection", href: "/call-reflection", label: "통화 회고", auth: true },
    ],
  },
  {
    title: "개인 비서",
    screens: [
      { file: "ops", href: "/ops", label: "오늘의 비서", auth: true },
      { file: "focus", href: "/focus", label: "일일 집중" },
      { file: "digest", href: "/digest", label: "오늘의 정리", auth: true, note: "이름이 어긋나 있다 — 캐논 screens.json 은 이 화면을 '주간 다이제스트' 라고 부르지만 화면 자체는 일일 리뷰다 (digest.tsx:1). LLM 좌석 digest_weekly 는 또 다른 것" },
      { file: "ttfv", href: "/ttfv", label: "첫날 한 컷" },
      { file: "insights", href: "/insights", label: "인사이트", auth: true },
      // ⚠ stub 아님(2026-09-01 감사 정정): legacy 스킨에서만 /insights 로 넘기고,
      // 프로덕션(딥스페이스 기본)은 실화면이다. 진입은 /insights 의 '발견' 카드.
      {
        file: "discover",
        href: "/discover",
        label: "발견",
        render: { kind: "ui-mode-split", deepspace: { kind: "screen" }, legacy: { kind: "redirect", to: "/insights" } },
        note: "legacy 에서만 /insights 로 넘긴다. 프로덕션은 실화면 (진입: /insights 카드)",
      },
      { file: "reminders", href: "/reminders", label: "예약 리마인더" },
      { file: "inbox", href: "/inbox", label: "알림함", auth: true },
      { file: "museum", href: "/museum", label: "AI 뮤지엄" },
      {
        file: "trinity",
        href: "/trinity",
        label: "브레인 트리니티 (레거시)",
        auth: true,
        render: {
          kind: "ui-mode-split",
          deepspace: { kind: "dev-gated-screen", productionRedirect: "/core-brain" },
          legacy: { kind: "screen" },
        },
        note: "딥스페이스 production 빌드는 /core-brain 으로 넘어가고, 개발 빌드는 M3 리메이크를 참조용으로 연다. legacy 는 실화면",
      },
    ],
  },
  {
    title: "커뮤니티 · 지인",
    screens: [
      { file: "community", href: "/community", label: "커뮤니티", auth: true },
      { file: "community/[room]", href: "/community/sample", label: "커뮤니티 방", auth: true, sample: true, note: "실제 방 id 가 아니라서 목록으로 되돌아간다" },
      {
        file: "community/join/[token]",
        href: "/community/join/sample",
        label: "초대 링크 받기",
        auth: true,
        sample: true,
        entry: { kind: "deep-link", contract: "invite" },
        note: "외부 초대 링크 전용. 유효한 링크를 열면 방 가입을 즉시 시도하므로 이 목록에서는 실행하지 않는다",
      },
      { file: "peer-invites", href: "/peer-invites", label: "지인에게 물어보기", auth: true },
      {
        file: "peer/[token]",
        href: "/peer/sample",
        label: "지인 응답 (무계정)",
        sample: true,
        entry: { kind: "deep-link", contract: "peer-response" },
        note: "외부 초대 링크 전용 무계정 응답. 열면 edge load 호출이 생기므로 이 목록에서는 실행하지 않는다. 로그인 없이 열리는 유일한 화면",
      },
    ],
  },
  {
    title: "가져오기 · 연동",
    screens: [
      { file: "import", href: "/import", label: "외부 가져오기", auth: true },
      { file: "import-hub", href: "/import-hub", label: "가져오기 허브" },
      { file: "integrations", href: "/integrations", label: "데이터 연동" },
    ],
  },
  {
    title: "설정 · 계정",
    screens: [
      { file: "settings", href: "/settings", label: "설정", auth: true },
      { file: "account", href: "/account", label: "계정", auth: true },
      { file: "profile", href: "/profile", label: "프로필", auth: true },
      { file: "profile-details", href: "/profile-details", label: "내 생활 정보", auth: true },
      { file: "change-password", href: "/change-password", label: "비밀번호 변경", auth: true },
      { file: "theme", href: "/theme", label: "테마", auth: true },
      { file: "data", href: "/data", label: "데이터 관리", auth: true },
      { file: "permissions", href: "/permissions", label: "권한 관리" },
      { file: "privacy", href: "/privacy", label: "개인정보 한눈에", auth: true },
      { file: "notices", href: "/notices", label: "공지", auth: true },
      { file: "support", href: "/support", label: "지원", auth: true },
      { file: "manual", href: "/manual", label: "사용 매뉴얼" },
      { file: "onboarding", href: "/onboarding", label: "첫 실행 온보딩" },
    ],
  },
  {
    title: "결제 · 법률",
    screens: [
      { file: "plans", href: "/plans", label: "요금제" },
      { file: "subscription", href: "/subscription", label: "구독 관리", auth: true },
      { file: "(auth)/terms", href: "/terms", label: "이용약관" },
      { file: "(auth)/privacy-policy", href: "/privacy-policy", label: "개인정보 처리방침" },
      { file: "(auth)/refund", href: "/refund", label: "환불 정책" },
      { file: "(auth)/consent-notice", href: "/consent-notice", label: "동의 항목 안내" },
    ],
  },
  {
    title: "가입 · 로그인",
    screens: [
      { file: "(auth)/sign-in", href: "/sign-in", label: "로그인" },
      { file: "(auth)/sign-up", href: "/sign-up", label: "회원가입" },
      { file: "(auth)/reset-password", href: "/reset-password", label: "비밀번호 재설정" },
      { file: "(auth)/complete-profile", href: "/complete-profile", label: "프로필 완성", auth: true },
      {
        file: "(auth)/oauth-callback",
        href: "/oauth-callback",
        label: "OAuth 콜백",
        entry: { kind: "deep-link", contract: "oauth-callback" },
        note: "OAuth 공급자가 되돌아오는 endpoint. 세션을 만지므로 직접 탐색하거나 이 목록에서 실행하지 않는다",
      },
    ],
  },
  {
    title: "개발자 전용",
    screens: [
      { file: "dev-screens", href: "/dev-screens", label: "화면 전체 목록", dev: true, note: "이 화면. 설정 → 개발자 에서 들어온다" },
      {
        file: "canon",
        href: "/canon",
        label: "프로토 캐논",
        dev: true,
        entry: { kind: "dev", collection: "design-lab" },
        note: "캐논 JSON 과 앱 연결 상태를 읽기 전용으로 확인한다",
      },
      {
        file: "deepspace-hub",
        href: "/deepspace-hub",
        label: "딥스페이스 허브",
        dev: true,
        entry: { kind: "dev", collection: "design-lab" },
        note: "개발용 화면 허브. flow map 안에서는 연결되지만 production 사용자 동선에는 없다",
      },
      { file: "deepspace-home", href: "/deepspace-home", label: "딥스페이스 홈 시안", dev: true, note: "08-24 '일곱 한 벌' 이전 별 모델 스냅샷. 현행 홈 검증 대용 금지 (HANDOFF 2026-07-07 교훈)" },
      {
        file: "deepspace-preview",
        href: "/deepspace-preview",
        label: "딥스페이스 미리보기",
        dev: true,
        entry: { kind: "dev", collection: "design-lab" },
        note: "컴포넌트와 상태를 실제 기기에서 시각 검수한다",
      },
      {
        file: "deepspace-flowmap",
        href: "/deepspace-flowmap",
        label: "화면 흐름도",
        dev: true,
        entry: { kind: "dev", collection: "design-lab" },
        note: "개발용 경로 연결을 확인한다. 데모 시작은 메모리 task 와 8초 timer 를 만든다",
      },
      { file: "graph", href: "/graph", label: "내 두뇌 지도 (레거시)", dev: true },
      { file: "trends", href: "/trends", label: "밝기 추이", dev: true },
    ],
  },
];

/** 모든 화면을 한 줄로. 테스트와 화면 상단 요약이 쓴다. */
export function devScreens(): DevScreen[] {
  return DEV_SCREEN_GROUPS.flatMap((g) => g.screens);
}

/** 생략된 entry 를 명시적인 정상 앱 진입으로 해석한다. */
export function screenEntry(screen: DevScreen): ScreenEntry {
  return screen.entry ?? STANDARD_SCREEN_ENTRY;
}

/** 생략된 render 를 명시적인 "어느 모드에서든 실화면" 으로 해석한다. */
export function screenRender(screen: DevScreen): RenderBehavior {
  return screen.render ?? SCREEN_RENDER;
}

/** production 메뉴가 아니라 개발용 디자인 검수 컬렉션에서만 여는 네 화면. */
export function designLabScreens(): DevScreen[] {
  return devScreens().filter((screen) => {
    const entry = screenEntry(screen);
    return entry.kind === "dev" && entry.collection === "design-lab";
  });
}

/**
 * 외부 딥링크/콜백은 route mount 자체가 조회·가입·세션 변경을 시작할 수 있다.
 * 개발 목록은 계약만 보여주고 실행하지 않는다. standard, 옛 링크 호환 redirect,
 * Design Lab 은 기존처럼 안전하게 열 수 있다.
 */
export function canOpenFromDevRegistry(screen: DevScreen): boolean {
  return screenEntry(screen).kind !== "deep-link";
}

export interface EntryRoleCounts {
  total: number;
  /** 진입 축. standard + deepLink + legacyLink + designLab = total. */
  standard: number;
  deepLink: number;
  legacyLink: number;
  designLab: number;
  /** 렌더 축. 항상 redirect (은퇴 호환) / UI 모드 분기. */
  alwaysRedirect: number;
  modeSplit: number;
  /** 진입·렌더 축과 직교하는 DevOnlyRoute 접근 게이트 수. */
  devOnly: number;
  /** `<Redirect href="/sign-in" />` 를 가진 화면 수. */
  authRequired: number;
}

/** `/dev-screens` 상단과 CI 가 함께 쓰는 단일 집계. */
export function entryRoleCounts(screens: readonly DevScreen[] = devScreens()): EntryRoleCounts {
  const counts: EntryRoleCounts = {
    total: screens.length,
    standard: 0,
    deepLink: 0,
    legacyLink: 0,
    designLab: 0,
    alwaysRedirect: 0,
    modeSplit: 0,
    devOnly: 0,
    authRequired: 0,
  };

  for (const screen of screens) {
    const entry = screenEntry(screen);
    if (entry.kind === "standard") counts.standard += 1;
    if (entry.kind === "deep-link") counts.deepLink += 1;
    if (entry.kind === "legacy-link") counts.legacyLink += 1;
    if (entry.kind === "dev" && entry.collection === "design-lab") counts.designLab += 1;
    const render = screenRender(screen);
    if (render.kind === "redirect") counts.alwaysRedirect += 1;
    if (render.kind === "ui-mode-split") counts.modeSplit += 1;
    if (screen.dev) counts.devOnly += 1;
    if (screen.auth) counts.authRequired += 1;
  }

  return counts;
}
