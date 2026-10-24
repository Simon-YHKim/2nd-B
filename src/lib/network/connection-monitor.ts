/** OS/browser connection status only. A connection does not prove our server is reachable. */
export type ConnectionStatus = "unknown" | "connected" | "disconnected";

export interface NetworkSnapshot {
  type?: string;
  isConnected?: boolean;
  isInternetReachable?: boolean;
}

export interface ConnectionMonitorDependencies {
  network: {
    getNetworkStateAsync: () => Promise<NetworkSnapshot>;
    addNetworkStateListener: (listener: (state: NetworkSnapshot) => void) => { remove: () => void };
  } | null;
  appState: {
    currentState: string | null;
    addEventListener: (event: "change", listener: (state: string) => void) => { remove: () => void };
  };
}

export const CONNECTION_READ_TIMEOUT_MS = 4_000;

export function connectionStatus(state: NetworkSnapshot): ConnectionStatus {
  // Expo Android uses UNKNOWN + false when it cannot read the platform state.
  // Web reports UNKNOWN + true for a connection whose transport it cannot name.
  if (state.type === "UNKNOWN" && state.isConnected !== true && state.isInternetReachable !== true) {
    return "unknown";
  }
  if (state.isConnected === false || state.isInternetReachable === false) return "disconnected";
  if (state.isConnected === true || state.isInternetReachable === true) return "connected";
  return "unknown";
}

/** One subscription for the mounted frame, including while the app is away.
 * A fresh event or foreground read supersedes any older in-flight query.
 * Query failures/timeouts are unknown, never evidence of disconnection.
 */
export function startConnectionMonitor(
  dependencies: ConnectionMonitorDependencies,
  publish: (status: ConnectionStatus) => void,
): () => void {
  const { network, appState } = dependencies;
  if (!network) return () => undefined;
  let stopped = false;
  let active = appState.currentState !== "background" && appState.currentState !== "inactive";
  let generation = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    generation += 1;
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
    return generation;
  };
  const refresh = () => {
    const request = invalidate();
    timeout = setTimeout(() => {
      if (stopped || !active || request !== generation) return;
      invalidate();
      publish("unknown");
    }, CONNECTION_READ_TIMEOUT_MS);
    // The SDK can throw before returning a Promise (missing/retired native module).
    void Promise.resolve().then(() => {
      if (stopped || !active || request !== generation) return null;
      return network.getNetworkStateAsync();
    }).then((state) => {
      if (!state || stopped || !active || request !== generation) return;
      invalidate();
      publish(connectionStatus(state));
    }, () => {
      if (stopped || !active || request !== generation) return;
      invalidate();
      publish("unknown");
    });
  };
  let networkSubscription: { remove: () => void };
  try {
    networkSubscription = network.addNetworkStateListener((state) => {
      if (stopped) return;
      invalidate();
      if (active) publish(connectionStatus(state));
    });
  } catch {
    // Do not leave a one-time offline result stuck on screen without a listener.
    return () => undefined;
  }
  let appSubscription: { remove: () => void };
  try {
    appSubscription = appState.addEventListener("change", (state) => {
      if (stopped) return;
      const nextActive = state !== "background" && state !== "inactive";
      if (active === nextActive) return;
      active = nextActive;
      invalidate();
      publish("unknown");
      if (active) refresh();
    });
  } catch {
    stopped = true;
    invalidate();
    try { networkSubscription.remove(); } catch { /* The module can already be gone. */ }
    return () => undefined;
  }
  if (active) refresh();
  return () => {
    if (stopped) return;
    stopped = true;
    invalidate();
    try { networkSubscription.remove(); } catch { /* Continue releasing the app listener. */ }
    try { appSubscription.remove(); } catch { /* App teardown may already have removed it. */ }
  };
}
