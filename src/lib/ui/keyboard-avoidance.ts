// 키보드 피하기 규칙 — 순수 계산부.
//
// 화면은 `KeyboardAvoidingArea`(./keyboard.tsx) 하나로 키보드를 피한다. 이 파일은
// 그 컴포넌트가 플랫폼마다 무엇을 하는지와 Android 에서 얼마나 띄우는지를 RN 없이
// 계산한다. 이 저장소의 Jest(node)는 RN 컴포넌트를 렌더하지 못하므로, 행동은 여기서
// 숫자로 검증한다.
//
// 왜 Android 를 RN KeyboardAvoidingView 에 맡기지 않는가 (2026-10-05 실측):
//
// 1. 예전 Android 분기는 `behavior` 를 비워 두고 `softwareKeyboardLayoutMode:
//    "resize"`(adjustResize)가 창을 줄여 주기를 기다렸다. RN 0.85 + Expo 56 은 창을
//    edge-to-edge 로 띄운다 — RN `ReactActivityDelegate.onCreate` 와 Expo
//    `EdgeToEdgePackage` 가 `WindowCompat.setDecorFitsSystemWindows(window, false)` 를
//    부르고, targetSdk 36 + Android 16 은 그 해제를 아예 허용하지 않는다. 그 상태에서
//    adjustResize 는 창을 줄이지 않는다(인셋만 넘긴다). 그래서 0.10.0 vc59 API 36
//    에뮬레이터에서 /secondb 입력창이 키보드 밑에 그대로 깔렸다.
// 2. RN `KeyboardAvoidingView` 의 `padding` 계산은 `frame.y + frame.height - (screenY
//    - keyboardVerticalOffset)` 인데 `frame.y` 는 **부모 기준** 좌표다. 화면 셸
//    (상태 표시줄 여백 + 창 테두리 + 상단 바) 안에 들어간 뷰는 부모의 절대 위치만큼
//    덜 띄운다. /secondb 에서는 그 차이(약 56dp)가 입력창 높이보다 커서 `padding`
//    으로 바꿔도 입력창이 여전히 가려진다.
//
// 그래서 Android 는 뷰의 **절대** 아래 끝(`measure` 의 pageY + height, RN 루트 기준 =
// edge-to-edge 창 기준)과 키보드 윗변(`keyboardDidShow` 의 endCoordinates.screenY)을
// 직접 비교해 겹친 만큼만 아래 여백을 준다. 창이 실제로 줄어드는 기기라면 겹침이 0 이
// 되어 두 번 띄우지 않는다.

/** 플랫폼별 처리 방식. iOS 는 예전 그대로, 웹은 아무것도 하지 않는다. */
export type KeyboardAvoidanceMode = "ios-padding" | "android-measured" | "none";

export function keyboardAvoidanceMode(os: string): KeyboardAvoidanceMode {
  if (os === "ios") return "ios-padding";
  if (os === "android") return "android-measured";
  return "none";
}

/**
 * iOS 가 RN `KeyboardAvoidingView` 에 넘기는 값. 예전 `Platform.OS === "ios" ?
 * "padding" : undefined` 의 iOS 쪽과 같다 — iOS 동작은 바꾸지 않는다.
 */
export const IOS_KEYBOARD_BEHAVIOR = "padding" as const;

export interface MeasuredFrame {
  /** RN 루트 기준 세로 위치(`measure` 콜백의 pageY). */
  pageY: number;
  /** 뷰의 바깥 높이(`measure` 콜백의 height). */
  height: number;
}

/**
 * 뷰 아래쪽이 키보드에 가려진 높이(dp). 이만큼 아래 여백을 주면 뷰의 마지막 자식이
 * 키보드 바로 위에 선다.
 *
 * - 키보드가 없거나(`keyboardTop` null) 값이 숫자가 아니면 0.
 * - 뷰가 키보드 위에 있으면 0 — 창이 이미 줄어든 경우 두 번 띄우지 않는다.
 * - 뷰 높이를 넘지 않는다 — 여백이 뷰보다 커지면 자식이 음수 높이가 된다.
 */
export function keyboardOverlap(frame: MeasuredFrame | null, keyboardTop: number | null): number {
  if (frame == null || keyboardTop == null) return 0;
  const { pageY, height } = frame;
  if (!Number.isFinite(pageY) || !Number.isFinite(height) || !Number.isFinite(keyboardTop)) return 0;
  if (height <= 0) return 0;
  const overlap = Math.ceil(pageY + height - keyboardTop);
  return Math.min(Math.max(0, overlap), Math.floor(height));
}

/**
 * 다음 여백. `mayGrow` 가 참일 때(키보드 이벤트로 잴 때, 또는 키보드가 뜬 뒤 아직 한 번도
 * 제대로 재지 못했을 때)만 늘릴 수 있고, 그 밖의 레이아웃 변화로 다시 잴 때는 줄이기만 한다.
 *
 * 이유: 높이가 내용에 맞춰지는 뷰라면 여백을 주는 순간 뷰가 그만큼 길어지고, 그
 * 레이아웃으로 다시 재면 겹침이 또 늘어난다(끝없이 커진다). 줄이기만 허용하면 그
 * 고리가 끊기면서도, 창이 실제로 줄어든 기기에서 겹침이 0 으로 내려가는 보정은 남는다.
 */
export function nextKeyboardPadding(current: number, measured: number, mayGrow: boolean): number {
  const safe = Number.isFinite(measured) ? Math.max(0, measured) : 0;
  return mayGrow ? safe : Math.min(current, safe);
}
