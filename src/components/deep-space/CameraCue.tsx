import { useEffect } from 'react';
import { useUiSound } from '@/lib/audio/use-ui-sound';
import type { CameraPhase } from '@/lib/motion/camera-sequence';

const SWEEP = require('../../../assets/audio/telescope-zoom.mp3');
const CUES = {
  aim: { source: require('../../../assets/audio/camera-aim.mp3'), volume: 0.2, playbackRate: 1 },
  zoom: { source: SWEEP, volume: 0.12, playbackRate: 0.95 },
  focus: { source: require('../../../assets/audio/camera-focus.mp3'), volume: 0.2, playbackRate: 1 },
  ready: { source: require('../../../assets/audio/jrpg-text-blip.mp3'), volume: 0.16, playbackRate: 1.25 },
  return: { source: SWEEP, volume: 0.12, playbackRate: 1.3 },
  shutter: { source: require('../../../assets/audio/camera-shutter.mp3'), volume: 0.22, playbackRate: 1 },
} satisfies Record<CameraPhase, { source: number; volume: number; playbackRate: number }>;

/** Keyed by phase so cancellation releases the previous player and pending seek. */
export function CameraCue({ phase }: { phase: CameraPhase }) {
  const cue = CUES[phase];
  const play = useUiSound(cue.source, { ...cue, minIntervalMs: 0 });
  useEffect(() => { play(); }, [play]);
  return null;
}
