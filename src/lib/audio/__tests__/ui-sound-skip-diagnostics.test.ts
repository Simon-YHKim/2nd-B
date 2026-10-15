import { readFileSync } from 'fs';
import { resolve } from 'path';

// 2026-10-06 x86_64 emulator (16a000bf): screen cues (pocket phone, the existing telescope ratchet) never
// reached the native player while the opening and the root GlobalCueHost played. A dropped cue used to be
// silent in every sense. These one-time warnings make the reason visible in logcat; keep them.

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');

test('the screen gate names which flag closed it, once, only while the screen is focused', () => {
  const gate = read('use-ui-sound-lifecycle.ts');
  expect(gate).toContain('if (!open && navFocused && !warned.current) {');
  expect(gate).toContain('console.warn("[ui-sound] cue skipped by the screen gate", { ...gate.current });');
});

test('the native hook says when a cue had no attached player or was queued before load', () => {
  const hook = read('use-ui-sound.ts');
  expect(hook).toContain('console.warn("[ui-sound] cue skipped: player not attached");');
  expect(hook).toContain('console.warn("[ui-sound] cue queued before its player loaded");');
  // The queue still plays once loaded; the warning does not drop the cue.
  expect(hook.indexOf('control.current.play();')).toBeGreaterThan(hook.indexOf('cue queued before its player loaded'));
});
