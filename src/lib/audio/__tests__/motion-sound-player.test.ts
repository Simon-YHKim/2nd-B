import { createMotionSoundPlayer } from '../motion-sound-player';

function fixture() {
  const driver = { rewind: jest.fn().mockResolvedValue(undefined), play: jest.fn().mockResolvedValue(undefined), pause: jest.fn() };
  const player = createMotionSoundPlayer(driver);
  player.setReady(true);
  return { driver, player };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('a moving interval owns one continuous loop, not a fresh play on every frame', async () => {
  const { driver, player } = fixture();
  player.setMoving(true); await flush();
  for (let i = 0; i < 120; i++) player.setMoving(true);
  expect(driver.play).toHaveBeenCalledTimes(1);
  player.setMoving(false);
  expect(driver.pause).toHaveBeenCalledTimes(1);
  player.setMoving(true); await flush();
  expect(driver.play).toHaveBeenCalledTimes(2);
});

test('stop invalidates pending native seek and prevents late playback', async () => {
  const { driver, player } = fixture();
  let finish!: () => void;
  driver.rewind.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  player.setMoving(true); player.setMoving(false); finish(); await flush();
  expect(driver.play).not.toHaveBeenCalled();
});

test('late loading starts only if the camera is still moving', async () => {
  const { driver, player } = fixture();
  player.setReady(false); player.setMoving(true); await flush();
  expect(driver.play).not.toHaveBeenCalled();
  player.setMoving(false); player.setReady(true); await flush();
  expect(driver.play).not.toHaveBeenCalled();
  player.setMoving(true); await flush();
  expect(driver.play).toHaveBeenCalledTimes(1);
});

test('dispose cancels seeks permanently; stale completion cannot restart a new generation', async () => {
  const { driver, player } = fixture();
  const pending: (() => void)[] = [];
  driver.rewind.mockImplementation(() => new Promise<void>(resolve => pending.push(resolve)));
  player.setMoving(true); player.setMoving(false); player.setMoving(true);
  pending[0](); await flush(); expect(driver.play).not.toHaveBeenCalled();
  pending[1](); await flush(); expect(driver.play).toHaveBeenCalledTimes(1);
  player.dispose(); player.setMoving(true); player.setReady(true); await flush();
  expect(driver.play).toHaveBeenCalledTimes(1);
});

test('autoplay rejection is handled without a retry storm', async () => {
  const { driver, player } = fixture();
  driver.play.mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  player.setMoving(true); await flush(); player.setMoving(true); await flush();
  expect(driver.play).toHaveBeenCalledTimes(1);
});
