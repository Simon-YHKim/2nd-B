import {
  CONNECTION_READ_TIMEOUT_MS,
  connectionStatus,
  startConnectionMonitor,
  type ConnectionMonitorDependencies,
  type ConnectionStatus,
  type NetworkSnapshot,
} from "../connection-monitor";

const offline: NetworkSnapshot = { type: "NONE", isConnected: false, isInternetReachable: false };
const online: NetworkSnapshot = { type: "WIFI", isConnected: true, isInternetReachable: true };
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(currentState: string | null = "active") {
  const published: ConnectionStatus[] = [];
  const requests: ReturnType<typeof pending<NetworkSnapshot>>[] = [];
  let emitNetwork!: (state: NetworkSnapshot) => void;
  let emitApp!: (state: string) => void;
  const removeNetwork = jest.fn();
  const removeApp = jest.fn();
  const network = {
    getNetworkStateAsync: jest.fn(() => {
      const request = pending<NetworkSnapshot>();
      requests.push(request);
      return request.promise;
    }),
    addNetworkStateListener: jest.fn((listener: typeof emitNetwork) => {
      emitNetwork = listener;
      return { remove: removeNetwork };
    }),
  };
  const appState = {
    currentState,
    addEventListener: jest.fn((_event: "change", listener: typeof emitApp) => {
      emitApp = listener;
      return { remove: removeApp };
    }),
  };
  const start = () => startConnectionMonitor({ network, appState }, (value) => published.push(value));
  return {
    start, network, appState, requests, published, removeNetwork, removeApp,
    networkEvent: (state: NetworkSnapshot) => emitNetwork(state),
    appEvent: (state: string) => emitApp(state),
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("connection status, not server health", () => {
  test.each<[NetworkSnapshot, ConnectionStatus]>([
    [{}, "unknown"],
    [{ type: "UNKNOWN" }, "unknown"],
    [{ type: "UNKNOWN", isConnected: false, isInternetReachable: false }, "unknown"],
    [{ type: "NONE" }, "unknown"],
    [offline, "disconnected"],
    [{ isConnected: false }, "disconnected"],
    [{ type: "WIFI", isConnected: true, isInternetReachable: false }, "disconnected"],
    [{ type: "WIFI", isConnected: true }, "connected"],
    [online, "connected"],
    [{ type: "UNKNOWN", isConnected: true, isInternetReachable: true }, "connected"],
  ])("%j becomes %s", (state, expected) => {
    expect(connectionStatus(state)).toBe(expected);
  });
});

test("initial known offline state shows the banner and a recovery event clears it", async () => {
  const h = setup(); const stop = h.start();
  await flush();
  h.requests[0].resolve(offline); await flush();
  expect(h.published).toEqual(["disconnected"]);
  h.networkEvent(online);
  expect(h.published).toEqual(["disconnected", "connected"]);
  expect(h.network.getNetworkStateAsync).toHaveBeenCalledTimes(1);
  stop();
  expect(h.removeNetwork).toHaveBeenCalledTimes(1);
  expect(h.removeApp).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test.each([online, offline])("new event wins over an older opposite query: %j", async (event) => {
  const h = setup(); const stop = h.start(); await flush();
  h.networkEvent(event);
  h.requests[0].resolve(event === online ? offline : online); await flush();
  expect(h.published).toEqual([connectionStatus(event)]);
  expect(jest.getTimerCount()).toBe(0);
  stop();
});

test("query rejection is unknown and does not claim the device is offline", async () => {
  const h = setup(); const stop = h.start(); await flush();
  h.requests[0].reject(new Error("native read failed")); await flush();
  expect(h.published).toEqual(["unknown"]);
  expect(jest.getTimerCount()).toBe(0);
  stop();
});

test("synchronous SDK failures are handled like rejected reads", async () => {
  const h = setup();
  h.network.getNetworkStateAsync.mockImplementation(() => { throw new Error("unavailable"); });
  const stop = h.start(); await flush();
  expect(h.published).toEqual(["unknown"]);
  stop();
});

test("a timed-out query cannot later replace a fresh connection event", async () => {
  const h = setup(); const stop = h.start(); await flush();
  jest.advanceTimersByTime(CONNECTION_READ_TIMEOUT_MS);
  expect(h.published).toEqual(["unknown"]);
  h.networkEvent(online);
  h.requests[0].resolve(offline); await flush();
  expect(h.published).toEqual(["unknown", "connected"]);
  stop();
});

test("returning to the app reads again without restarting the native subscription", async () => {
  const h = setup(); const stop = h.start(); await flush();
  h.requests[0].resolve(offline); await flush();
  h.appEvent("background");
  h.networkEvent(offline);
  h.appEvent("active"); await flush();
  h.requests[1].resolve(online); await flush();
  expect(h.published).toEqual(["disconnected", "unknown", "unknown", "connected"]);
  expect(h.network.addNetworkStateListener).toHaveBeenCalledTimes(1);
  expect(h.removeNetwork).not.toHaveBeenCalled();
  h.appEvent("active"); await flush();
  expect(h.requests).toHaveLength(2);
  stop();
});

test("two foreground reads resolving in reverse order leave the newest result", async () => {
  const h = setup(); const stop = h.start(); await flush();
  h.appEvent("inactive"); h.appEvent("active"); await flush();
  h.requests[1].resolve(online); await flush();
  h.requests[0].resolve(offline); await flush();
  expect(h.published).toEqual(["unknown", "unknown", "connected"]);
  stop();
});

test("the app can mount while backgrounded without running a query there", async () => {
  const h = setup("background"); const stop = h.start(); await flush();
  h.networkEvent(offline);
  expect(h.requests).toHaveLength(0);
  expect(h.published).toEqual([]);
  h.appEvent("active"); await flush();
  h.requests[0].resolve(online); await flush();
  expect(h.published).toEqual(["unknown", "connected"]);
  stop();
});

test("unmount releases both listeners and cancels pending query/timer publication", async () => {
  const h = setup(); const stop = h.start(); await flush();
  stop(); stop();
  h.requests[0].resolve(offline); await flush();
  h.networkEvent(offline); h.appEvent("active");
  jest.advanceTimersByTime(CONNECTION_READ_TIMEOUT_MS);
  expect(h.published).toEqual([]);
  expect(h.removeNetwork).toHaveBeenCalledTimes(1);
  expect(h.removeApp).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test("unmount before the query microtask does not start a native call", async () => {
  const h = setup(); const stop = h.start(); stop(); await flush();
  expect(h.requests).toHaveLength(0);
  expect(h.published).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
});

test("missing native module remains unknown without a timer or app listener", () => {
  const h = setup(); const publish = jest.fn();
  const deps: ConnectionMonitorDependencies = { network: null, appState: h.appState };
  startConnectionMonitor(deps, publish)();
  expect(publish).not.toHaveBeenCalled();
  expect(h.appState.addEventListener).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test("failed network listener setup does not publish a one-time offline result", async () => {
  const h = setup();
  h.network.addNetworkStateListener.mockImplementation(() => { throw new Error("unavailable"); });
  h.start()(); await flush();
  expect(h.requests).toHaveLength(0);
  expect(h.appState.addEventListener).not.toHaveBeenCalled();
  expect(h.published).toEqual([]);
});

test("failed app listener setup releases the already-created network subscription", () => {
  const h = setup();
  h.appState.addEventListener.mockImplementation(() => { throw new Error("unavailable"); });
  h.start()();
  h.networkEvent(offline);
  expect(h.removeNetwork).toHaveBeenCalledTimes(1);
  expect(h.published).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
});

test("a failing network remove still releases the app listener", () => {
  const h = setup();
  h.removeNetwork.mockImplementation(() => { throw new Error("already gone"); });
  const stop = h.start(); expect(stop).not.toThrow();
  expect(h.removeApp).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
