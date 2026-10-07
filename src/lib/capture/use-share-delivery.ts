// React side of ./share-delivery.ts (Android share -> /capture, signed in only).
//
//   useShareDeliverySettle  root layout, outside every gate: decides each share
//                           once the account state is known.
//   useNativeShareGate      capture screen: may it read the shared params?
//   useStripRefusedShare    capture screen: drops a refused share from its route
//                           and raises the one-line notice for it, once.

import { useNavigation } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";

import { accountTransitionSnapshot, subscribeAccountTransition } from "@/lib/auth/account-epoch";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  avatarFirstRunDecision,
  avatarFirstRunSnapshot,
  subscribeAvatarFirstRun,
} from "@/lib/avatar/first-run-store";

import {
  SHARE_DELIVERY_PARAM,
  nativeShareGate,
  refuseShareDelivery,
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

/**
 * Root layout: settles waiting shares whenever a share arrives or the account
 * state moves, including the end of an account switch (the settle holds while
 * one is under way).
 */
export function useShareDeliverySettle(): void {
  const snapshot = useShareDeliveryState();
  const transition = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
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
    transition,
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

/** The shareDelivery param as one string, so an array param is a stable effect dependency. */
function deliveryRouteValue(rawDeliveryParam: unknown): string {
  return typeof rawDeliveryParam === "string" ? rawDeliveryParam : JSON.stringify(rawDeliveryParam ?? null);
}

/**
 * Removes a refused share from this screen's own route without reading it, and
 * raises the one-line notice for it unless it was already answered
 * (refuseShareDelivery: once per delivery, so a rerender cannot repeat it).
 * `navigation.setParams` (not router.setParams) so it never touches another
 * route when this screen is not the focused one.
 */
export function useStripRefusedShare(strip: boolean, rawDeliveryParam: unknown): void {
  const navigation = useNavigation() as unknown as ParamsNavigation;
  const routeValue = deliveryRouteValue(rawDeliveryParam);
  useEffect(() => {
    if (!strip) return;
    refuseShareDelivery(routeValue);
    navigation.setParams({
      url: undefined,
      text: undefined,
      title: undefined,
      [SHARE_DELIVERY_PARAM]: undefined,
    });
  }, [navigation, strip, routeValue]);
}
