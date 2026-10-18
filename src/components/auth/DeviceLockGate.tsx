import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState, BackHandler, Keyboard, Platform, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRootNavigationState } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GateCover } from "@/components/ui/GateCover";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { semantic, spacing } from "@/lib/theme/tokens";
import { createDeviceLock } from "@/lib/auth/device-lock";
import { DeviceLockCoveredContext, crisisLockPrioritySnapshot, subscribeCrisisLockPriority } from "@/lib/auth/device-lock-context";
import { authenticateDevice, cancelDeviceAuthentication, deviceHasScreenLock } from "@/lib/auth/native-device-auth";
import { accountTransitionSnapshot, accountTransitionPendingFromSnapshot, currentAccountOwner, subscribeAccountTransition } from "@/lib/auth/account-epoch";
import { getCrisisNotice, subscribeCrisisNotice } from "@/lib/safety/crisis-notice";

export function DeviceLockGate({ children }: { children: ReactNode }) {
  return Platform.OS === "web" ? <>{children}</> : <NativeDeviceLockGate>{children}</NativeDeviceLockGate>;
}

function NativeDeviceLockGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const insets = useSafeAreaInsets();
  const labels = useRef({ title: "", fallback: "", cancel: "" });
  labels.current = { title: t("deviceLock.title"), fallback: t("deviceLock.fallback"), cancel: t("actions.cancel") };
  const [lock] = useState(() => createDeviceLock({
    now: () => Date.now(), active: AppState.currentState === "active",
    authenticate: () => authenticateDevice(labels.current), cancel: cancelDeviceAuthentication,
    screenLock: deviceHasScreenLock,
    scope: () => {
      // Review #2619 r2: an effect or button callback created before a sign-out can
      // still run after it. No published owner means nothing to unlock: no prompt.
      if (currentAccountOwner() === null) return null;
      const snapshot = accountTransitionSnapshot();
      return accountTransitionPendingFromSnapshot(snapshot) ? null : snapshot;
    },
  }));
  const state = useSyncExternalStore(lock.subscribe, lock.getSnapshot, lock.getSnapshot);
  const scope = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const notice = useSyncExternalStore(subscribeCrisisNotice, getCrisisNotice, () => null);
  const priority = useSyncExternalStore(subscribeCrisisLockPriority, crisisLockPrioritySnapshot, () => false);
  const observedScope = useRef(scope);
  const held = accountTransitionPendingFromSnapshot(scope) || observedScope.current !== scope;
  // Q-261018-47: the OS is asked only for a signed-in session. Every owner change
  // (sign-in, sign-out, switch) moves the transition snapshot above, so this is
  // re-read on the same render.
  const signedIn = currentAccountOwner() !== null;
  // Review #2619 r1 · r2: after a sign-out (including one from another device) the
  // previous owner's scenes stay mounted until navigation removes them. Keep them
  // covered, with no prompt, while the root navigator's focused scene is not the
  // sign-in group. Segments are not proof (account-epoch shouldReleaseAccountTransition):
  // the old stack can outlive the path change. Sign-in focused on top lifts the cover
  // even if a screen's <Redirect> left the home underneath, so nobody is trapped; the
  // previous owner is forgotten only once sign-in is the sole root scene, so going back
  // to a retained scene before that covers it again. A run that was never signed in
  // has nothing to hide, so a signed-out cold start stays open.
  const rootState = useRootNavigationState() as
    | { index?: number; routes?: readonly { name?: string }[] }
    | undefined;
  const rootRoutes = rootState?.routes ?? [];
  const focusedIndex = typeof rootState?.index === "number" ? rootState.index : rootRoutes.length - 1;
  const signInShown = rootRoutes[focusedIndex]?.name === "(auth)";
  const onlySignInLeft = rootRoutes.length === 1 && rootRoutes[0]?.name === "(auth)";
  const hadOwner = useRef(false);
  const retainedAfterSignOut = !signedIn && hadOwner.current && !signInShown;
  const covered = held || retainedAfterSignOut || (signedIn && state.covered);
  useLayoutEffect(() => {
    if (signedIn) hadOwner.current = true;
    else if (onlySignInLeft) hadOwner.current = false;
  }, [signedIn, onlySignInLeft]);

  useLayoutEffect(() => {
    observedScope.current = scope;
    lock.reset();
  }, [scope, lock]);
  useLayoutEffect(() => {
    const sub = AppState.addEventListener("change", next => lock.setActive(next === "active"));
    // Reconcile a transition between initial render and listener attachment.
    lock.setActive(AppState.currentState === "active");
    const unsubscribe = subscribeAccountTransition(() => lock.reset());
    return () => { sub.remove(); unsubscribe(); lock.reset(); };
  }, [lock]);
  useLayoutEffect(() => {
    if (!covered) return;
    // Keyboard.dismiss also blurs the currently focused native TextInput.
    Keyboard.dismiss();
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => back.remove();
  }, [covered]);
  useLayoutEffect(() => {
    if ((notice || priority) && state.pending) lock.reset();
  }, [notice, priority, state.pending, lock]);
  useEffect(() => {
    if (signedIn && !held && !notice && !priority && state.needsAuthentication && !state.pending && !state.error) void lock.unlock();
  }, [signedIn, held, notice, priority, state.needsAuthentication, state.pending, state.error, state.covered, lock]);

  const message = state.error === "not_enrolled" ? "deviceLock.setup" :
    state.error === "unavailable" ? "deviceLock.unavailable" :
    state.error && state.error !== "cancelled" ? "deviceLock.failed" : "deviceLock.title";
  return (
    <DeviceLockCoveredContext.Provider value={covered}>
      <GateCover cover={covered ? (
        <View style={[styles.cover, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
          accessibilityViewIsModal testID="device-lock-cover">
          <Text variant="heading">{t(message)}</Text>
          <Button label={t(state.pending ? "deviceLock.checking" : "deviceLock.unlock")}
            disabled={!signedIn || state.pending || held || Boolean(notice) || priority} onPress={() => { void lock.unlock(); }} />
        </View>
      ) : null}>
        {children}
      </GateCover>
    </DeviceLockCoveredContext.Provider>
  );
}

const styles = StyleSheet.create({
  cover: { flex: 1, backgroundColor: semantic.background, justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.lg },
});
