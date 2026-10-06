import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createOpeningAmbience } from '../opening-ambience';
import { setSoundEffectsOn } from '../ui-sound-player';

// 오프닝 배경음 (Simon Q-261006-07). 오프닝 시계의 위치부터 나고, 효과음이 멈추는 자리에서
// 같이 멈추며, 오프닝을 붙잡지 않는다.

const root = resolve(__dirname, '../../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');

function driver(loaded = true) {
  const calls: string[] = [];
  let release: (() => void) | null = null;
  return {
    calls,
    finishSeek: () => { release?.(); release = null; },
    d: {
      loaded: () => loaded,
      seekTo: (seconds: number) => { calls.push(`seek ${seconds}`); return new Promise<void>((r) => { release = r; }); },
      play: () => { calls.push('play'); },
      pause: () => { calls.push('pause'); },
    },
  };
}
const flush = () => new Promise((r) => setImmediate(r));

afterEach(() => setSoundEffectsOn(true));

test('starts from the opening clock position after the seek lands', async () => {
  const t = driver();
  const amb = createOpeningAmbience(t.d, 10120);
  amb.start(2500);
  expect(t.calls).toEqual(['seek 2.5']);
  t.finishSeek(); await flush();
  expect(t.calls).toEqual(['seek 2.5', 'play']);
});

test('a stop while the seek is pending wins: it never plays late', async () => {
  const t = driver();
  const amb = createOpeningAmbience(t.d, 10120);
  amb.start(0);
  amb.stop();
  t.finishSeek(); await flush();
  expect(t.calls).toEqual(['seek 0', 'pause']);
});

test('never holds or forces the opening: not loaded, sound effects off, or past the end stay silent', async () => {
  const notLoaded = driver(false);
  createOpeningAmbience(notLoaded.d, 10120).start(0);
  expect(notLoaded.calls).toEqual([]);
  const off = driver();
  setSoundEffectsOn(false);
  createOpeningAmbience(off.d, 10120).start(0);
  expect(off.calls).toEqual([]);
  setSoundEffectsOn(true);
  const late = driver();
  createOpeningAmbience(late.d, 10120).start(10120);
  expect(late.calls).toEqual([]);
});

test('a disposed bed ignores starts', async () => {
  const t = driver();
  const amb = createOpeningAmbience(t.d, 10120);
  amb.dispose();
  amb.start(0);
  expect(t.calls).toEqual(['pause']);
});

test('the opening screen starts the bed with the clock and stops it wherever the cues stop', () => {
  const screen = read('src/components/ui/LoadingScreen.tsx');
  // One stop for cues and bed, so all seven existing stop sites (skip, continue, asset error,
  // background, effect cleanup) silence both without being edited.
  expect(screen).toContain('soundRef.current = { ...sounds, stop: () => { sounds.stop(); ambience.stop(); } };');
  const start = screen.indexOf('if (!reducedMotion && soundRef.current.enabled) ambienceRef.current.start(clock.current.elapsed());');
  expect(start).toBeGreaterThan(screen.indexOf('clock.current.start();'));
  expect(start).toBeLessThan(screen.indexOf('const tick = (value: number) => {'));
  // The bed is not part of the sound-readiness wait that can hold the opening for 1.5 s.
  expect(screen).toContain('const playbackReady = aheadLoaded && (reducedMotion || !sounds.enabled || sounds.ready || soundWaitOver);');
  // Web stays silent; the approved opening package does not carry the bed.
  expect(read('src/lib/audio/use-opening-ambience.web.ts')).toContain('start: () => undefined');
  expect(read('assets/opening/hustlek-approved-261002/manifest.json')).not.toContain('opening-ambience');
  expect(read('src/lib/audio/use-opening-ambience.ts')).toContain('require("../../../assets/audio/opening-ambience.wav")');
});
