// Q-261005-02 = A (2026-10-05): one sound effects switch, on by default, that every
// effect player reads before it plays. Off must silence the UI cues, the ratchet
// loop and the opening, and stop the loop and the opening if they are already running.
import { createMotionSoundPlayer } from "../motion-sound-player";
import { createOpeningSoundPlayer, type OpeningSoundCue } from "../opening-sound-player";
import { areSoundEffectsOn, createNativeUiSoundPlayer, createUiSoundPlayer, onSoundEffectsChange, setSoundEffectsOn } from "../ui-sound-player";

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

afterEach(() => setSoundEffectsOn(true));

test("the switch starts on and notifies only real changes", () => {
  expect(areSoundEffectsOn()).toBe(true);
  const seen: boolean[] = [];
  const unsubscribe = onSoundEffectsChange(on => seen.push(on));
  setSoundEffectsOn(true);
  setSoundEffectsOn(false);
  setSoundEffectsOn(false);
  setSoundEffectsOn(true);
  unsubscribe();
  setSoundEffectsOn(false);
  expect(seen).toEqual([false, true]);
});

test("web and native UI cues stay silent while the switch is off", async () => {
  const media = { volume: 1, playbackRate: 1, currentTime: 0, play: jest.fn().mockResolvedValue(undefined), pause: jest.fn(), removeAttribute: jest.fn(), load: jest.fn() };
  const web = createUiSoundPlayer(media, { volume: 0.1, minIntervalMs: 0 });
  const driver = { rewind: jest.fn().mockResolvedValue(undefined), play: jest.fn(), pause: jest.fn() };
  const native = createNativeUiSoundPlayer(driver, 0);
  native.setReady(true);

  setSoundEffectsOn(false);
  await web.play();
  native.play(); await flush();
  expect(media.play).not.toHaveBeenCalled();
  expect(driver.play).not.toHaveBeenCalled();

  setSoundEffectsOn(true);
  await web.play();
  native.play(); await flush();
  expect(media.play).toHaveBeenCalledTimes(1);
  expect(driver.play).toHaveBeenCalledTimes(1);
});

test("the ratchet loop does not start while off, stops when switched off, and resumes when on", async () => {
  const driver = { rewind: jest.fn().mockResolvedValue(undefined), play: jest.fn().mockResolvedValue(undefined), pause: jest.fn() };
  const loop = createMotionSoundPlayer(driver);
  loop.setReady(true);

  setSoundEffectsOn(false);
  loop.setMoving(true); await flush();
  expect(driver.play).not.toHaveBeenCalled();

  setSoundEffectsOn(true); await flush();
  expect(driver.play).toHaveBeenCalledTimes(1);

  const pausesBefore = driver.pause.mock.calls.length;
  setSoundEffectsOn(false);
  expect(driver.pause.mock.calls.length).toBe(pausesBefore + 1);

  loop.dispose();
  setSoundEffectsOn(true); await flush();
  expect(driver.play).toHaveBeenCalledTimes(1);
});

test("the opening skips cues while off and stops when switched off mid-play", async () => {
  const voice = () => ({ rewind: jest.fn().mockResolvedValue(undefined), play: jest.fn(), pause: jest.fn() });
  const bank = { grassA: [voice()], grassB: [voice()], ratchet: [voice()], ping: [voice()] };
  const opening = createOpeningSoundPlayer(bank);
  const cue = (key: string): OpeningSoundCue => ({ sourceId: "grass", variantIndex: 0, volume: 0.2, atMs: 0, key });

  setSoundEffectsOn(false);
  opening.play(cue("off")); await flush();
  expect(bank.grassA[0].play).not.toHaveBeenCalled();

  setSoundEffectsOn(true);
  opening.play(cue("on")); await flush();
  expect(bank.grassA[0].play).toHaveBeenCalledTimes(1);

  const pausesBefore = bank.ping[0].pause.mock.calls.length;
  setSoundEffectsOn(false);
  expect(bank.ping[0].pause.mock.calls.length).toBe(pausesBefore + 1);

  opening.dispose();
  const afterDispose = bank.ping[0].pause.mock.calls.length;
  setSoundEffectsOn(true);
  setSoundEffectsOn(false);
  expect(bank.ping[0].pause.mock.calls.length).toBe(afterDispose);
});
