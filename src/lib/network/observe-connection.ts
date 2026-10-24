import { AppState, Platform } from "react-native";
import {
  startConnectionMonitor,
  type ConnectionMonitorDependencies,
  type ConnectionStatus,
} from "./connection-monitor";

/** Older installed binaries have no ExpoNetwork module. They stay unknown until rebuilt. */
function availableNetwork(): ConnectionMonitorDependencies["network"] {
  if (Platform.OS === "web" && typeof window === "undefined") return null;
  try {
    // Lazy so an absent native module cannot crash the root during evaluation.
    // Only the two connection APIs are used; no IP lookup, permission prompt or server probe.
    const network = require("expo-network") as ConnectionMonitorDependencies["network"];
    return network && typeof network.getNetworkStateAsync === "function"
      && typeof network.addNetworkStateListener === "function" ? network : null;
  } catch {
    return null;
  }
}

export function observeConnection(publish: (status: ConnectionStatus) => void): () => void {
  return startConnectionMonitor({ network: availableNetwork(), appState: AppState }, publish);
}
