jest.mock("../weather-location-gate", () => ({ WEATHER_LOCATION_ENABLED: true }));
const permission = jest.fn();
const request = jest.fn();
const recent = jest.fn();
const current = jest.fn();
jest.mock("../location-sdk", () => ({ loadExpoLocation: () => ({
  getForegroundPermissionsAsync: permission, requestForegroundPermissionsAsync: request,
  getLastKnownPositionAsync: recent, getCurrentPositionAsync: current, Accuracy: { Low: 2 },
}) }));
import { weatherLocationStatus, requestWeatherLocation, readWeatherPlace } from "../weather-location";

beforeEach(() => { jest.resetAllMocks(); });
test.each([
  [{ granted: true }, "granted"],
  [{ granted: false, status: "denied", canAskAgain: true }, "denied"],
  [{ granted: false, status: "denied", canAskAgain: false }, "blocked"],
  [{ granted: false, status: "undetermined" }, "undetermined"],
])("SDK permission maps honestly: %j", async (value, status) => {
  permission.mockResolvedValue(value);
  expect(await weatherLocationStatus()).toBe(status);
  expect(request).not.toHaveBeenCalled();
});
test("only an explicit request prompts", async () => {
  request.mockResolvedValue({ granted: true });
  expect(await requestWeatherLocation()).toBe("granted");
  expect(request).toHaveBeenCalledTimes(1);
});
test.each(["denied", "undetermined"])("%s never reads a position", async (status) => {
  permission.mockResolvedValue({ granted: false, status });
  expect(await readWeatherPlace()).toBeNull();
  expect(recent).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled();
});
test("only the rounded pair leaves the SDK boundary", async () => {
  permission.mockResolvedValue({ granted: true });
  recent.mockResolvedValue(null);
  current.mockResolvedValue({ coords: { latitude: 37.566535, longitude: 126.977969, altitude: 90, accuracy: 1 } });
  expect(await readWeatherPlace()).toEqual({ latitude: 37.57, longitude: 126.98 });
  expect(current).toHaveBeenCalledWith({ accuracy: 2 });
});
test("a recent coarse fix avoids a new GPS request", async () => {
  permission.mockResolvedValue({ granted: true });
  recent.mockResolvedValue({ coords: { latitude: -33.8688, longitude: 151.2093 } });
  expect(await readWeatherPlace()).toEqual({ latitude: -33.87, longitude: 151.21 });
  expect(current).not.toHaveBeenCalled();
});

test("an already cancelled weather visit never reaches the location SDK", async () => {
  permission.mockResolvedValue({ granted: true });
  recent.mockResolvedValue(null);
  current.mockResolvedValue({ coords: { latitude: 0, longitude: 0 } });
  const controller = new AbortController();
  controller.abort();
  expect(await readWeatherPlace(controller.signal)).toBeNull();
  expect(permission).not.toHaveBeenCalled();
  expect(recent).not.toHaveBeenCalled();
  expect(current).not.toHaveBeenCalled();
});

test.each(["permission", "recent", "current"] as const)("cancelling while %s is pending starts no later GPS request and discards its result", async (stage) => {
  permission.mockResolvedValue({ granted: true });
  recent.mockResolvedValue(null);
  const position = { coords: { latitude: 37.566535, longitude: 126.977969 } };
  current.mockResolvedValue(position);
  let finish!: (value: unknown) => void;
  const deferred = new Promise((resolve) => { finish = resolve; });
  ({ permission, recent, current })[stage].mockReturnValueOnce(deferred);
  const controller = new AbortController();
  const pending = readWeatherPlace(controller.signal);
  for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
  controller.abort();
  finish(stage === "permission" ? { granted: true } : stage === "recent" ? null : position);
  expect(await pending).toBeNull();
  expect(current).toHaveBeenCalledTimes(stage === "current" ? 1 : 0);
  if (stage === "permission") expect(recent).not.toHaveBeenCalled();
});
