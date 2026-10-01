export type CameraPhase = 'aim' | 'zoom' | 'focus' | 'ready' | 'return' | 'shutter';
export type CameraStep = { phase: CameraPhase; to: number; duration: number };
export const CAMERA_APPROACH: readonly CameraStep[] = [
  { phase: 'aim', to: 0.4, duration: 420 },
  { phase: 'zoom', to: 0.8, duration: 500 },
  { phase: 'focus', to: 1, duration: 360 },
];
export const CAMERA_RETURN: readonly CameraStep[] = [{ phase: 'return', to: 0, duration: 640 }];
export const CAMERA_SHUTTER: readonly CameraStep[] = [{ phase: 'shutter', to: 1, duration: 420 }];

/** Completion-driven: no timers can outlive a cancelled camera or shutter. */
export function runCameraSequence(steps: readonly CameraStep[], callbacks: {
  animate: (step: CameraStep, complete: (finished: boolean) => void) => { stop: () => void };
  onStep: (phase: CameraPhase) => void;
  onDone: () => void;
}) {
  let live = true, index = 0;
  let animation: { stop: () => void } | undefined;
  const next = () => {
    if (!live) return;
    const step = steps[index++];
    if (!step) { live = false; callbacks.onDone(); return; }
    callbacks.onStep(step.phase);
    let completed = false;
    animation = callbacks.animate(step, finished => {
      if (!live || completed) return;
      completed = true;
      if (finished) next(); else live = false;
    });
  };
  next();
  return () => { if (live) { live = false; animation?.stop(); } };
}
