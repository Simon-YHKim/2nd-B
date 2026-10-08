// 인앱 핸드폰의 '픽셀 아이폰' 색 (Simon 2026-10-07: "인앱 핸드폰에서 디스플레이 하는 UI들은 픽셀 클레이 디자인
// 규칙을 따르지 않고, 아이폰같은 UI로 … 픽셀 스러움은 살린채로" · 색 = "ios 기본 스타일").
//
// Simon 2026-10-08: 개인 비서를 포함해 폰에서 진입하는 모든 화면에 적용한다.
// PhoneDesignProvider 안에서만 변환하며 폰 밖 화면의 m3 · tokens는 유지한다. 값은 투명도 없는 단색이다
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
  /** 날씨 그림: 해의 빛 (systemYellow). */
  yellow: "#ffcc00",
  /** 날씨 그림: 구름 (systemGray2). */
  gray2: "#aeaeb2",
  /** 날씨 그림: 눈 (iOS 하늘색). */
  lightBlue: "#5ac8fa",
  /** AI 의 해석 · 제안 (systemTeal). 흰 바탕 글자로는 aiText 를 쓴다(대비). */
  teal: "#30b0c7",
  aiText: "#1d8ea4",
  /** AI 말풍선 바탕 (teal 을 흰 바탕에 옅게 합성). */
  aiFill: "#d6f1f6",
  /** 홈 핸드폰과 같은 밤하늘 · 별자리 · 지평선 팔레트. */
  wallpaper: ["#0d1424", "#172541", "#304f83", "#577cc5", "#48c9f8", "#9defff", "#8d74e8"] as const,
  iconIndigo: "#5856d6",
  iconPink: "#ff2d55",
  iconDark: "#17202e",
  /** 벽지 위 글자(앱 이름 · 상태바). */
  onWallpaper: "#ffffff",
  statusInk: "#000000",
  /** 독 바탕(디더를 얹는다). */
  dock: "#ece8f3",
  /** 쪽 점. */
  dotOn: "#ffffff",
  dotOff: "#d9d6f0",
} as const;
