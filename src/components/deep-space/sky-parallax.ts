// 망원경 시차 (Simon 2026-10-07, localhost 홈): "카메라 각도가 바뀌면, 카메라에 맞춰서 원근감 있게
// 뒷배경도 약간씩 움직이면 좋을듯해."
//
// 별자리(앞)는 카메라와 1:1 로 움직인다. 뒷배경은 깊이만큼 덜 움직인다 - 먼 별밭은 적게, 가까운
// 신경망 무늬는 조금 더. 배경은 여백(SKY_PARALLAX_MARGIN)만큼 크게 그리고 그 안에서만 밀어서
// 화면 가장자리가 비지 않는다. 이동은 정수 픽셀로 떨어뜨려 픽셀 그림을 흐리지 않는다.

/** 배경을 화면보다 이만큼(사방) 크게 그린다. 시차 이동은 이 안에서만 일어난다. */
export const SKY_PARALLAX_MARGIN = 24;

/** 깊이: 카메라 이동의 몇 배만큼 따라가나. 앞(별자리)이 1 이다. */
export const SKY_DEPTH = { starfield: 0.07, neural: 0.14 } as const;

export interface SkyCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface SkyShift {
  x: number;
  y: number;
  scale: number;
}

const clamp = (v: number) => Math.max(-SKY_PARALLAX_MARGIN, Math.min(SKY_PARALLAX_MARGIN, v));

/** 카메라가 원점·배율 1 이면 (0, 0, 1). 움직임 줄이기에서는 늘 그 값이다. */
export function skyParallax(camera: SkyCamera, depth: number, reducedMotion: boolean): SkyShift {
  if (reducedMotion) return { x: 0, y: 0, scale: 1 };
  const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  // Math.round(-0) 이 -0 을 남기지 않게 + 0.
  return {
    x: Math.round(clamp(-camera.x * zoom * depth)) + 0,
    y: Math.round(clamp(-camera.y * zoom * depth)) + 0,
    // 확대만 따라간다. 1 아래로 줄이면 여백 밖이 드러난다.
    scale: 1 + Math.max(0, zoom - 1) * depth * 0.5,
  };
}
