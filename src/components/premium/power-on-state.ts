export const POWER_ON_STORAGE_KEY = "secondb_power_on_overlay_v1";

export type PowerOnStartState = {
  visible: boolean;
  shouldAnimate: boolean;
};

export function powerOnStartState({
  alreadyPlayed,
  reducedMotion,
}: {
  alreadyPlayed: boolean;
  reducedMotion: boolean;
}): PowerOnStartState {
  if (alreadyPlayed || reducedMotion) {
    return { visible: false, shouldAnimate: false };
  }

  return { visible: true, shouldAnimate: true };
}
