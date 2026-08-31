// 개발자 화면 목록 — 앱 안에서 모든 화면에 직접 들어가 보기 위한 레지스트리.
//
// 왜 있나 (Simon 2026-08-19, 결정 콘솔 V2 의견):
//   "남은 화면 및 링크가 없는 것은 내가 앱에서 볼 수 있도록 별도 경로를 만들자.
//    설정 탭에 개발자용 화면으로 진입할 수 있는 버튼이 있었으면 좋겠고, 이곳에서
//    진입 버튼들을 만들어서 화면들을 보고 기능이 되는지를 확인할 수 있으면 좋겠어."
//
// 이 앱에는 **정상 경로로는 못 가는 화면이 실제로 있다.** `/canon` ·
// `/deepspace-flowmap` · `/deepspace-hub` · `/deepspace-preview` 는 `src/` 전체에
// 들어오는 링크가 0건이고(직접 URL 입력으로만 열린다), `/peer/[token]` ·
// `/community/join/[token]` 은 딥링크로만 도달한다. 그런 화면이 살아 있는지
// 확인할 방법이 지금까지 없었다.
//
// **이 목록은 손으로 관리하지만 낡지 않는다.**
// `__tests__/screen-index.test.ts` 가 `src/app` 의 실제 라우트 파일 목록과
// 1:1 로 대조한다. 화면을 추가하고 여기 안 적으면 CI 가 막는다. 반대로 여기
// 적힌 라우트의 파일이 없어져도 막는다. 그래서 "개발용이라 낡아도 된다"가
// 성립하지 않는다.
//
// 라우트 표기는 **expo-router 파일 경로**가 아니라 **실제 URL** 이다:
//   index          -> /
//   (auth)/sign-in -> /sign-in      (그룹 세그먼트는 URL 에서 사라진다)
//   star/[domain]  -> /star/career  (동적 구간은 아래에서 견본값을 준다)

/** 라우트 파일 경로(`src/app` 기준, 확장자 없음). 테스트가 이걸로 파일 존재를 확인한다. */
export type RouteFile = string;

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
  /** 정상 경로로 들어오는 링크가 앱 안에 없다. 이 목록이 유일한 입구다. */
  orphan?: true;
  /** 화면이 아니라 다른 라우트로 넘기기만 한다. */
  stub?: true;
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
      { file: "journal", href: "/journal", label: "저널", stub: true, note: "/capture 로 넘긴다" },
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
      { file: "jarvis", href: "/jarvis", label: "자비스 (은퇴)", stub: true, orphan: true, note: "/secondb 로 넘긴다" },
      { file: "interview", href: "/interview", label: "심층 인터뷰", auth: true },
      { file: "imagine", href: "/imagine", label: "공상하기" },
      { file: "research", href: "/research", label: "연결 찾기", auth: true },
      { file: "reasoning", href: "/reasoning", label: "리즈닝", auth: true },
      { file: "review", href: "/review", label: "제안 확인 (propose→ratify)" },
      { file: "ratifications", href: "/ratifications", label: "확인 이력", auth: true },
    ],
  },
  {
    title: "검사 · 페르소나",
    screens: [
      { file: "persona", href: "/persona", label: "페르소나", auth: true },
      { file: "big-five", href: "/big-five", label: "Big Five", auth: true },
      { file: "ipip-neo", href: "/ipip-neo", label: "IPIP-NEO-120", auth: true },
      { file: "rlss", href: "/rlss", label: "삶의 만족도 (RLSS)", auth: true },
      { file: "values", href: "/values", label: "가치관", auth: true },
      { file: "strengths", href: "/strengths", label: "강점", auth: true },
      { file: "motivation", href: "/motivation", label: "동기", auth: true },
      { file: "esm", href: "/esm", label: "순간 기록 (ESM)", auth: true },
      { file: "mbti", href: "/mbti", label: "MBTI (은퇴)", stub: true, note: "/persona 로 넘긴다" },
      { file: "iden", href: "/iden", label: "IDEN 포터블 정체성", auth: true },
      { file: "seen", href: "/seen", label: "보여지는 나" },
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
      { file: "ttfv", href: "/ttfv", label: "첫날 한 컷", auth: true },
      { file: "insights", href: "/insights", label: "인사이트", auth: true },
      { file: "discover", href: "/discover", label: "발견", stub: true, note: "/insights 로 넘긴다" },
      { file: "reminders", href: "/reminders", label: "예약 리마인더" },
      { file: "inbox", href: "/inbox", label: "알림함", auth: true },
      { file: "museum", href: "/museum", label: "AI 뮤지엄" },
      { file: "trinity", href: "/trinity", label: "브레인 트리니티 (레거시)", auth: true, note: "개발 빌드가 아니면 /core-brain 으로 넘어간다" },
    ],
  },
  {
    title: "커뮤니티 · 지인",
    screens: [
      { file: "community", href: "/community", label: "커뮤니티", auth: true },
      { file: "community/[room]", href: "/community/sample", label: "커뮤니티 방", auth: true, sample: true, note: "실제 방 id 가 아니라서 목록으로 되돌아간다" },
      { file: "community/join/[token]", href: "/community/join/sample", label: "초대 링크 받기", auth: true, sample: true, orphan: true, note: "원래는 딥링크로만 도달한다" },
      { file: "peer-invites", href: "/peer-invites", label: "지인에게 물어보기", auth: true },
      { file: "peer/[token]", href: "/peer/sample", label: "지인 응답 (무계정)", sample: true, orphan: true, note: "원래는 초대 링크로만 도달한다. 로그인 없이 열리는 유일한 화면" },
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
      { file: "(auth)/oauth-callback", href: "/oauth-callback", label: "OAuth 콜백", orphan: true, note: "소셜 로그인이 되돌아오는 자리. 직접 열면 할 일이 없다" },
    ],
  },
  {
    title: "개발자 전용",
    screens: [
      { file: "dev-screens", href: "/dev-screens", label: "화면 전체 목록", dev: true, note: "이 화면. 설정 → 개발자 에서 들어온다" },
      { file: "canon", href: "/canon", label: "프로토 캐논", dev: true, orphan: true },
      { file: "deepspace-hub", href: "/deepspace-hub", label: "딥스페이스 허브", dev: true, orphan: true },
      { file: "deepspace-home", href: "/deepspace-home", label: "딥스페이스 홈 시안", dev: true },
      { file: "deepspace-preview", href: "/deepspace-preview", label: "딥스페이스 미리보기", dev: true, orphan: true },
      { file: "deepspace-flowmap", href: "/deepspace-flowmap", label: "화면 흐름도", dev: true, orphan: true },
      { file: "graph", href: "/graph", label: "내 두뇌 지도 (레거시)", dev: true },
      { file: "trends", href: "/trends", label: "밝기 추이", dev: true },
    ],
  },
];

/** 모든 화면을 한 줄로. 테스트와 화면 상단 요약이 쓴다. */
export function devScreens(): DevScreen[] {
  return DEV_SCREEN_GROUPS.flatMap((g) => g.screens);
}

/** 정상 경로로 들어오는 링크가 없는 화면 — 이 목록이 존재하는 이유. */
export function orphanScreens(): DevScreen[] {
  return devScreens().filter((s) => s.orphan);
}
