import { readFileSync } from "node:fs";
import path from "node:path";
import { createUiSoundPlayer } from "../ui-sound-player";

function mediaFixture() {
  return {
    volume: 1,
    playbackRate: 1,
    currentTime: 5,
    play: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    pause: jest.fn(),
    removeAttribute: jest.fn(),
    load: jest.fn(),
  };
}

describe("local UI sound playback", () => {
  const options = { volume: 0.045, playbackRate: 0.55, minIntervalMs: 160 };
  let warning: jest.SpyInstance;

  beforeEach(() => {
    warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  test("navigation owns and handles the actual pending play rejection", async () => {
    const media = mediaFixture();
    let rejectPlayback!: (error: Error) => void;
    media.play.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejectPlayback = reject;
    }));
    media.pause.mockImplementation(() => rejectPlayback(Object.assign(
      new Error("The play() request was interrupted by a call to pause()."),
      { name: "AbortError" },
    )));
    const player = createUiSoundPlayer(media, options);

    const playback = player.play();
    player.dispose();

    await expect(playback).resolves.toBeUndefined();
    expect(warning).not.toHaveBeenCalled();
    expect(media.pause).toHaveBeenCalledTimes(1);
    expect(media.removeAttribute).toHaveBeenCalledWith("src");
    expect(media.load).toHaveBeenCalledTimes(1);
    player.dispose();
    await player.play();
    expect(media.pause).toHaveBeenCalledTimes(1);
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  test.each(["AbortError", "NotAllowedError"])("%s is an expected quiet playback failure", async (name) => {
    const media = mediaFixture();
    media.play.mockRejectedValue(Object.assign(new Error("Playback unavailable"), { name }));
    await createUiSoundPlayer(media, options).play();
    expect(warning).not.toHaveBeenCalled();
  });

  test("unexpected media errors remain observable", async () => {
    const media = mediaFixture();
    const error = Object.assign(new Error("Unsupported source"), { name: "NotSupportedError" });
    media.play.mockRejectedValue(error);
    await createUiSoundPlayer(media, options).play();
    expect(warning).toHaveBeenCalledWith("[ui-sound] Playback failed", error);
  });

  test("an unsettled play cannot be interrupted by a second tick", async () => {
    const media = mediaFixture();
    let resolvePlayback!: () => void;
    media.play.mockImplementation(() => new Promise<void>((resolve) => { resolvePlayback = resolve; }));
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    const player = createUiSoundPlayer(media, options);
    const playback = player.play();
    media.currentTime = 0.1;
    now.mockReturnValue(2_000);
    await player.play();
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(media.currentTime).toBe(0.1);
    resolvePlayback();
    await playback;
  });

  test("a cancelled old play cannot clear the newer pending play", async () => {
    const media = mediaFixture();
    const finish: Array<() => void> = [];
    media.play.mockImplementation(() => new Promise<void>((resolve) => { finish.push(resolve); }));
    const player = createUiSoundPlayer(media, { ...options, minIntervalMs: 0 });
    const old = player.play(); player.stop(); const current = player.play();
    finish[0](); await old; await player.play();
    expect(media.play).toHaveBeenCalledTimes(2);
    finish[1](); await current;
    expect(warning).not.toHaveBeenCalled();
  });

  test("preserves the chosen volume, pitch and tick rate", async () => {
    const media = mediaFixture();
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    const player = createUiSoundPlayer(media, options);
    expect(media.volume).toBe(0.045);
    expect(media.playbackRate).toBe(0.55);
    await player.play();
    expect(media.currentTime).toBe(0);
    now.mockReturnValue(1_159);
    await player.play();
    expect(media.play).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_160);
    await player.play();
    expect(media.play).toHaveBeenCalledTimes(2);
  });

  test("dialogue defaults to the original pitch", () => {
    const media = mediaFixture();
    createUiSoundPlayer(media, { volume: 0.08, minIntervalMs: 72 });
    expect(media.volume).toBe(0.08);
    expect(media.playbackRate).toBe(1);
  });

  test("both callers resolve the lifecycle-owned platform hook", () => {
    const root = path.resolve(__dirname, "../../../..");
    for (const component of ["TelescopeControls", "ConstellationHome"]) {
      const source = readFileSync(path.join(root, `src/components/deep-space/${component}.tsx`), "utf8");
      expect(source).toMatch(/from ["']@\/lib\/audio\/use-ui-sound["']/);
      expect(source).not.toContain("useAudioPlayer");
    }
    const web = readFileSync(path.join(root, "src/lib/audio/use-ui-sound.web.ts"), "utf8");
    expect(web).toContain("new Audio(");
    expect(web).toContain("player.dispose()");
    expect(web).not.toContain("unhandledrejection");
    const native = readFileSync(path.join(root, "src/lib/audio/use-ui-sound.ts"), "utf8");
    expect(native).toContain("keepAudioSessionActive: false");
    // Native readiness, source replacement and release order run against the
    // installed SDK hook in ui-sound-hooks.test.ts.
  });
});
