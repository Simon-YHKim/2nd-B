export type TelescopeMotionTrack = {
  stops: readonly number[];
  x: readonly number[];
  y: readonly number[];
  zoom: readonly number[];
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Samples the same camera keyframes used by the sky, for the passive jog/dial HUD. */
export function sampleTelescopeMotion(track: TelescopeMotionTrack, progress: number, previousProgress: number) {
  const value = clamp01(progress);
  const last = track.stops.length - 1;
  let segment = 0;
  while (segment < last - 1 && value >= track.stops[segment + 1]) segment++;
  const span = track.stops[segment + 1] - track.stops[segment];
  const fraction = span > 0 ? clamp01((value - track.stops[segment]) / span) : 1;
  const zoom = track.zoom[segment] + (track.zoom[segment + 1] - track.zoom[segment]) * fraction;
  const dx = track.x[segment + 1] - track.x[segment];
  const dy = track.y[segment + 1] - track.y[segment];
  const distance = Math.hypot(dx, dy);
  const reverse = progress < previousProgress ? -1 : 1;
  // The stick returns to neutral at each camera phase boundary; no new easing curve.
  const strength = Math.min(1, fraction * 5, (1 - fraction) * 5);
  return {
    zoom,
    // A telescope jog points opposite the world's screen translation.
    x: distance < 0.5 ? 0 : Math.round(-dx / distance * reverse * 18 * strength) || 0,
    y: distance < 0.5 ? 0 : Math.round(-dy / distance * reverse * 18 * strength) || 0,
  };
}
