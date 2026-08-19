// M3 타입 역할 -> 실제로 로드된 Galmuri 얼굴 (PIXEL-CLAY 2단계, 2026-08-20).
//
// 1단계까지 이 파일은 Roboto 3종을 **굵기로** 골랐다(`robotoFor`). 그 구조가
// 2단계에서 두 번 틀린다:
//
//  1. **굵기가 얼굴을 정하지 않는다. 크기가 정한다.** Galmuri 는 비트맵 픽셀
//     폰트라 자기 고유 크기의 정수배에서만 선명하다 - Galmuri9 는 10px,
//     Galmuri11 은 12px, Galmuri14 는 15px 이 x1 이다. 24px 을 Galmuri14 로
//     그리면 1.6배라 글리프가 반픽셀에 앉는다. 그래서 매핑의 축이 크기다.
//  2. **`m3.font.*` 를 안 읽고 있었다.** 이 파일이 Roboto 이름을 리터럴로 들고
//     있어서, 토큰만 바꾸면 화면은 하나도 안 바뀌는 상태였다(m3TextStyle 호출
//     193곳 전부). 이제 토큰에서 읽는다.
//
// 굵기는 **Galmuri11 에만 있다** - `galmuri` 패키지가 파는 Bold 는 Galmuri11-Bold
// 하나뿐이다. RN 은 얼굴이 없는 굵기를 요청받으면 안드로이드에서 가짜 굵기를
// 만들거나 시스템 폰트로 떨어지고, 픽셀 폰트에서는 둘 다 격자를 깬다. 그래서
// 이 파일은 **fontFamily 만 돌려주고 fontWeight 은 아예 내보내지 않는다.**
// 굵기는 얼굴 이름 안에 들어 있다.
import { m3, type M3TypeRole } from "@/lib/theme/m3";

/** 얼굴이 x1 로 선명한 크기(px). upem/100 과 같다. */
export const NATIVE_PX = {
  Galmuri9: 10,
  Galmuri11: 12,
  Galmuri14: 15,
  GalmuriMono11: 12,
} as const;

export type GalmuriFace = keyof typeof NATIVE_PX;

// 크기 -> 얼굴. `m3Type` 이 쓰는 여섯 크기가 전부 여기 있고, 각각 그 얼굴의
// 정수배다. 30px 은 Galmuri14 x2 와 Galmuri9 x3 둘 다 되는데 디스플레이 자리라
// Galmuri14 를 쓴다.
const FACE_FOR_SIZE: Readonly<Record<number, GalmuriFace>> = {
  10: "Galmuri9", // x1
  12: "Galmuri11", // x1
  15: "Galmuri14", // x1
  24: "Galmuri11", // x2
  30: "Galmuri14", // x2
  45: "Galmuri14", // x3
};

// 굵은 얼굴이 실제로 번들에 있는 서체. 키는 `src/theme/typography.ts` 의
// `fontAssets` 키와 문자 그대로 같아야 한다.
const BOLD_FACE: Partial<Record<GalmuriFace, string>> = {
  Galmuri11: "Galmuri11Bold",
};

/**
 * 이 크기를 선명하게 그리는 얼굴. 격자 밖 크기는 `m3.font.brand`(Galmuri11)로
 * 떨어진다 - 흐려지지만 **문자는 보인다**. 시스템 폰트로 떨어지는 것보다 낫고,
 * 격자를 벗어난 것이 화면에 드러나야 P5 에서 고칠 수 있다.
 */
export function faceForSize(size: number): GalmuriFace {
  return FACE_FOR_SIZE[size] ?? (m3.font.brand as GalmuriFace);
}

/** 크기와 굵기에 맞는, **실제로 로드된** 얼굴 이름. */
export function galmuriFor(size: number, weight: "400" | "500" | "700"): string {
  const face = faceForSize(size);
  // 500 은 Galmuri 에 없다. 400 으로 읽는다 - 가짜 중간굵기를 만드는 것보다 낫다.
  if (weight !== "700") return face;
  return BOLD_FACE[face] ?? face;
}

/**
 * 크롬 얼굴(네비 라벨처럼 굵기만 필요한 자리). 2단계 전 이름은 `robotoFor` 였다.
 * 크기를 안 받으므로 UI 기본 얼굴(`m3.font.brand`)의 굵기 변형을 준다.
 */
export function chromeFaceFor(weight: "400" | "500" | "700"): string {
  return galmuriFor(NATIVE_PX[m3.font.brand as GalmuriFace] ?? 12, weight);
}

/**
 * RN Text style for an M3 type role. Text 스타일 배열에 펼쳐 쓴다:
 * `style={[m3TextStyle("labelLarge"), { color }]}`. 색은 호출부가 토큰으로 준다.
 *
 * `fontWeight` 을 내보내지 않는 것은 의도다 - 위 헤더 참조.
 */
export function m3TextStyle(role: M3TypeRole) {
  const t = m3.type[role];
  return {
    fontFamily: galmuriFor(t.size, t.weight),
    fontSize: t.size,
    lineHeight: t.line,
    letterSpacing: t.tracking,
  };
}
