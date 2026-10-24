import { NativeModules, Platform } from "react-native";
import { onAccountOwnerChange } from "../auth/account-epoch";
import contract from "./share-media-contract.json";
import type { SharedMediaKind } from "./share-media-intent";

interface MediaModule {
  take(token: string, kind: SharedMediaKind): Promise<unknown>;
  discard(token: string): void;
  discardAll(): void;
}

export function nativeMedia(): MediaModule | null {
  if (Platform.OS !== "android") return null;
  const candidate = NativeModules[contract.module] as Partial<MediaModule> | undefined;
  return candidate && typeof candidate.take === "function" && typeof candidate.discard === "function" &&
    typeof candidate.discardAll === "function" ? candidate as MediaModule : null;
}

// Loaded by the root before auth resolution, including when an auth gate stops
// the capture route from mounting. Initial null -> restored owner preserves a
// cold-start SEND. Departing an owner clears all pending handles and copies.
onAccountOwnerChange(({ previousOwner }) => {
  if (previousOwner !== null) nativeMedia()?.discardAll();
});
