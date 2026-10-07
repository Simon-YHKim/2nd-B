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
