// React side of ./share-delivery.ts (Android share -> /capture, signed in only).
//
//   useShareDeliverySettle  root layout, outside every gate: decides each share
//                           once the account state is known.
//   useNativeShareGate      capture screen: may it read the shared params?
//   useStripRefusedShare    capture screen: drops a refused share from its route.

import { useNavigation } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";

import { useAuth } from "@/lib/auth/AuthContext";
import {
  avatarFirstRunDecision,
  avatarFirstRunSnapshot,
  subscribeAvatarFirstRun,
} from "@/lib/avatar/first-run-store";

import {
  SHARE_DELIVERY_PARAM,
  nativeShareGate,
  settleShareDeliveries,
  shareDeliveryState,
  subscribeShareDeliveries,
  type NativeShareGate,
  type ShareDeliveryAuth,
  type ShareDeliveryState,
} from "./share-delivery";

export function useShareDeliveryState(): ShareDeliveryState {
  return useSyncExternalStore(subscribeShareDeliveries, shareDeliveryState, shareDeliveryState);
}

function useShareDeliveryAuth(): ShareDeliveryAuth {
  const {
    loading,
    userId,
    hasProfile,
    profileProbeFailed,
    recoveryReady,
    recoveryUserId,
    recoveryPendingGlobal,
    storageRecoveryRequired,
  } = useAuth();
  const avatar = useSyncExternalStore(subscribeAvatarFirstRun, avatarFirstRunSnapshot, avatarFirstRunSnapshot);
  return {
    loading,
    userId,
    hasProfile,
    profileProbeFailed,
    recoveryReady,
    recoveryUserId,
    recoveryPendingGlobal,
    storageRecoveryRequired,
    avatarSetup: avatarFirstRunDecision(userId, hasProfile, "capture", avatar),
  };
}

/** Root layout: settles waiting shares whenever a share arrives or the account state moves. */
export function useShareDeliverySettle(): void {
  const snapshot = useShareDeliveryState();
  const {
    loading,
    userId,
    hasProfile,
    profileProbeFailed,
    recoveryReady,
    recoveryUserId,
    recoveryPendingGlobal,
    storageRecoveryRequired,
    avatarSetup,
  } = useShareDeliveryAuth();
  useEffect(() => {
    settleShareDeliveries({
      loading,
      userId,
      hasProfile,
      profileProbeFailed,
      recoveryReady,
      recoveryUserId,
      recoveryPendingGlobal,
      storageRecoveryRequired,
      avatarSetup,
    });
  }, [
    snapshot,
    loading,
    userId,
    hasProfile,
    profileProbeFailed,
    recoveryReady,
    recoveryUserId,
    recoveryPendingGlobal,
    storageRecoveryRequired,
    avatarSetup,
  ]);
}

/** Capture screen: what it may do with the shared params its route carries. */
export function useNativeShareGate(rawDeliveryParam: unknown): NativeShareGate {
  const snapshot = useShareDeliveryState();
  const auth = useShareDeliveryAuth();
  return nativeShareGate(snapshot, rawDeliveryParam, auth);
}

interface ParamsNavigation {
  setParams(params: Record<string, undefined>): void;
}

/**
 * Removes a refused share from this screen's own route without reading it.
 * `navigation.setParams` (not router.setParams) so it never touches another
 * route when this screen is not the focused one.
 */
export function useStripRefusedShare(strip: boolean): void {
  const navigation = useNavigation() as unknown as ParamsNavigation;
  useEffect(() => {
    if (!strip) return;
    navigation.setParams({
      url: undefined,
      text: undefined,
      title: undefined,
      [SHARE_DELIVERY_PARAM]: undefined,
    });
  }, [navigation, strip]);
}
