// 인앱 핸드폰의 '픽셀 아이폰' 색 (Simon 2026-10-07: "인앱 핸드폰에서 디스플레이 하는 UI들은 픽셀 클레이 디자인
// 규칙을 따르지 않고, 아이폰같은 UI로 … 픽셀 스러움은 살린채로" · 색 = "ios 기본 스타일").
//
// 폰이 직접 그리는 화면(상태바 · 하루 관리판 · 독 · 앱 바둑판 · 알림 · 폰 안 간단 화면)만 이 토큰을 쓴다. 폰 안에 띄우는
// 앱 화면과 폰 밖 화면은 m3 · tokens 그대로다. 값은 iOS 밝은 기본 시스템 색을 투명도 없이 미리 합성한 단색이다
// (PIXEL-CLAY 규칙 4: 정적 투명도 금지).
export const phoneIos = {
  /** 묶음 목록 바탕 (systemGroupedBackground). */
  grouped: "#f2f2f7",
  /** 칸 · 위젯 바탕 (secondarySystemGroupedBackground). */
  cell: "#ffffff",
  /** 본문 글자 (label). */
  label: "#000000",
  /** 보조 글자 (secondaryLabel 60% 를 흰 바탕에 합성). */
  label2: "#8a8a8e",
  /** 구분선 (separator 를 흰 바탕에 합성). */
  separator: "#c6c6c8",
  /** 회색 칸 · 버튼 바탕 (systemGray5). */
  fill: "#e5e5ea",
  /** 옅은 회색 (systemGray3). */
  gray3: "#c7c7cc",
  blue: "#007aff",
  /** 눌린 파랑 버튼. */
  bluePressed: "#0062cc",
  /** 파랑 위 글자. */
  onBlue: "#ffffff",
  green: "#34c759",
  red: "#ff3b30",
  orange: "#ff9500",
  /** AI 의 해석 · 제안 (systemTeal). 흰 바탕 글자로는 aiText 를 쓴다(대비). */
  teal: "#30b0c7",
  aiText: "#1d8ea4",
  /** AI 말풍선 바탕 (teal 을 흰 바탕에 옅게 합성). */
  aiFill: "#d6f1f6",
  /** 벽지 색 띠(위에서 아래로). 그라데이션 대신 밴딩. */
  wallpaper: ["#7ec8f8", "#8fb9f5", "#a2a8f0", "#b49ce8", "#c591de"] as const,
  /** 벽지 위 글자(앱 이름 · 상태바). */
  onWallpaper: "#ffffff",
  statusInk: "#000000",
  /** 독 바탕(디더를 얹는다). */
  dock: "#ece8f3",
  /** 쪽 점. */
  dotOn: "#ffffff",
  dotOff: "#d9d6f0",
} as const;
