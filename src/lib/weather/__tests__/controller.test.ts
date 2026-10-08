import { createWeatherController, type WeatherPorts, type WeatherState } from "../controller";
import { WEATHER_CACHE_MS, WEATHER_CONSENT_REVISION, type WeatherConsent } from "../model";

const consent: WeatherConsent = { contract: WEATHER_CONSENT_REVISION, revision: 1, enabled: true, eligible: true, available: true };
function fixture(overrides: Partial<WeatherPorts> = {}) {
  const order: string[] = [];
  const ports: WeatherPorts = {
    enabled: true, isMinor: false, current: () => true, locallyAllowed: () => true,
    consent: jest.fn(async () => { order.push("consent"); return consent; }),
    save: jest.fn(async () => { order.push("save"); return consent; }),
    permission: jest.fn(async () => { order.push("permission"); return "granted"; }),
    requestPermission: jest.fn(async () => { order.push("prompt"); return "granted"; }),
    place: jest.fn(async () => { order.push("place"); return { latitude: 37.57, longitude: 126.98 }; }),
    weather: jest.fn(async () => { order.push("weather"); return { weather: { sky: "clear" as const, tempC: 18 }, expiresAt: Date.now() + WEATHER_CACHE_MS }; }),
    clear: jest.fn(), ...overrides,
  };
  const states: WeatherState[] = [];
  const controller = createWeatherController(ports, (state) => states.push(state));
  return { controller, ports, order, states };
}
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test("display expires at the original cache deadline, including a cached refresh", async () => {
  const expiresAt = Date.now() + WEATHER_CACHE_MS;
  const f = fixture({ weather: async () => ({ weather: { sky: "clear", tempC: 18 }, expiresAt }) });
  await f.controller.refresh();
  jest.advanceTimersByTime(20 * 60_000);
  await f.controller.refresh();
  expect(f.states.at(-1)?.weather).not.toBeNull();
  jest.advanceTimersByTime(10 * 60_000);
  expect(f.states.at(-1)?.weather).toBeNull();
  expect(f.ports.place).toHaveBeenCalledTimes(2); // Expiry does not silently read GPS again.
});

test("disposing a displayed forecast cancels its expiry timer", async () => {
  const f = fixture(); await f.controller.refresh(); f.controller.dispose();
  const count = f.states.length;
  jest.advanceTimersByTime(WEATHER_CACHE_MS);
  expect(f.states).toHaveLength(count);
});
test.each([true, null])("minor/unknown %s never reads permission, position or server", async (isMinor) => {
  const { controller, order } = fixture({ isMinor });
  await controller.refresh(); await controller.enable();
  expect(order).toEqual([]);
});
test("gate OFF never reaches any dependency", async () => {
  const { controller, order } = fixture({ enabled: false });
  await controller.enable(); await controller.refresh(); expect(order).toEqual([]);
});
test("grant is committed before the single OS prompt and location request", async () => {
  const f = fixture(); await f.controller.enable();
  expect(f.order).toEqual(["consent", "save", "prompt", "place", "weather"]);
  expect(f.states.at(-1)?.weather).toEqual({ sky: "clear", tempC: 18 });
});
test("existing consent only checks permission, never prompts", async () => {
  const f = fixture(); await f.controller.refresh();
  expect(f.order).toEqual(["consent", "permission", "place", "weather"]);
});
test("failed consent save cannot touch the SDK", async () => {
  const f = fixture({ save: jest.fn().mockRejectedValue(new Error("offline")) });
  await f.controller.enable();
  expect(f.ports.requestPermission).not.toHaveBeenCalled(); expect(f.ports.place).not.toHaveBeenCalled();
  expect(f.states.at(-1)?.failed).toBe(true);
});
test.each(["denied", "blocked"] as const)("%s stops before position", async (permission) => {
  const f = fixture({ permission: jest.fn().mockResolvedValue(permission) });
  await f.controller.refresh(); expect(f.ports.place).not.toHaveBeenCalled();
  expect(f.states.at(-1)?.permission).toBe(permission);
});
test.each(["withdraw", "suspend", "dispose", "cancel"] as const)("%s aborts the location continuation and fences a late GPS result", async (method) => {
  let resolve!: (value: { latitude: number; longitude: number }) => void;
  const position = new Promise<{ latitude: number; longitude: number }>((done) => { resolve = done; });
  let locationSignal: AbortSignal | undefined;
  const f = fixture({ place: (signal) => { locationSignal = signal; return position; } });
  const task = f.controller.refresh();
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  expect(locationSignal?.aborted).toBe(false);
  f.controller[method]();
  expect(locationSignal?.aborted).toBe(true);
  resolve({ latitude: 37.57, longitude: 126.98 }); await task;
  expect(f.ports.weather).not.toHaveBeenCalled();
});

test("closing the credit sheet preserves already displayed weather", async () => {
  const f = fixture(); await f.controller.refresh(); f.controller.cancel();
  expect(f.states.at(-1)?.weather).toEqual({ sky: "clear", tempC: 18 });
});
test("an account transition after reading GPS never sends the result", async () => {
  let current = true;
  const f = fixture({ current: () => current, place: async () => { current = false; return { latitude: 0, longitude: 0 }; } });
  await f.controller.refresh(); expect(f.ports.weather).not.toHaveBeenCalled();
});
test("a local withdrawal remains OFF if a failed server write left a stale grant", async () => {
  const f = fixture({ locallyAllowed: () => false }); await f.controller.refresh();
  expect(f.ports.permission).not.toHaveBeenCalled();
});

test("rapid taps share a single permission flow", async () => {
  const f = fixture(); await Promise.all([f.controller.enable(), f.controller.enable(), f.controller.refresh()]);
  expect(f.ports.save).toHaveBeenCalledTimes(1); expect(f.ports.requestPermission).toHaveBeenCalledTimes(1);
});

test("a location result after the total deadline cannot leave the device", async () => {
  jest.useFakeTimers();
  let finish!: (value: { latitude: number; longitude: number }) => void;
  let locationSignal: AbortSignal | undefined;
  const f = fixture({ place: (signal) => { locationSignal = signal; return new Promise((resolve) => { finish = resolve; }); } });
  const pending = f.controller.enable();
  for (let n = 0; n < 5; n++) await Promise.resolve();
  expect(locationSignal?.aborted).toBe(false);
  jest.advanceTimersByTime(30_001);
  expect(locationSignal?.aborted).toBe(true);
  finish({ latitude: 0, longitude: 0 }); await pending;
  expect(f.ports.weather).not.toHaveBeenCalled(); expect(f.states.at(-1)?.busy).toBe(false);
  jest.useRealTimers();
});
