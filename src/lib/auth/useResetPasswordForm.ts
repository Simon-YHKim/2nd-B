// Shared stateful logic for the reset-password screen, extracted so the legacy
// (cosmic) and deep-space presentations render IDENTICAL behavior from one
// source. Faithful lift of ResetPasswordLegacy (src/app/(auth)/reset-password.tsx):
// it owns the new/confirm password state, the helper-key derivation, the
// updatePassword submit + UX states (complete / error toast), and the native
// recovery deep-link consumption (consumeAuthCallbackUrl) that establishes the
// recovery session so userId flips the form on.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { clearInitialURL, useLinkingURL } from "expo-linking";
import { useLocalSearchParams } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import {
  clearRecoveryPending,
  persistRecoveryPending,
} from "@/lib/auth/recovery-proof-store";
import {
  consumeAuthCallbackUrl,
  isPasswordRecoveryCallbackUrl,
  passwordUpdateFailure,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  verifyPasswordResetCode,
} from "@/lib/supabase/auth";
import {
  enqueueRecoveryOperation,
  resetActionAvailability,
  resetExitLocked,
  resetHelperKey,
  resetStep,
  type ResetStep,
} from "@/lib/auth/reset-password-helpers";

export type ResetToastTone = "info" | "success" | "danger";
export type ResetToast = { message: string; tone: ResetToastTone };

export { resetHelperKey };
export type { ResetStep };

const RESEND_COOLDOWN_SECONDS = 60;

export interface UseResetPasswordForm {
  // session/routing signals
  loading: boolean;
  userId: string | null;
  /** True only for a PASSWORD_RECOVERY/native callback owned by userId. */
  recoveryActive: boolean;
  /** A verify/callback is creating the recovery session or auth is catching up. */
  recoveryPending: boolean;
  /** Single contract consumed by every route-exit surface. */
  exitLocked: boolean;
  /** Which phase the screen shows: request -> verify -> password -> done. */
  step: ResetStep;
  // request + verify state (flow request #5: the in-screen code path)
  email: string;
  setEmail: (value: string) => void;
  canSendCode: boolean;
  sendSubmitting: boolean;
  /** Seconds until the code can be re-sent (0 = allowed now). */
  resendSeconds: number;
  handleSendCode: () => Promise<void>;
  code: string;
  setCode: (value: string) => void;
  canVerify: boolean;
  verifying: boolean;
  handleVerifyCode: () => Promise<void>;
  // form state
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  submitting: boolean;
  cancelling: boolean;
  cancelled: boolean;
  complete: boolean;
  toast: ResetToast | null;
  /** i18n key for the helper line (helper / too-short / mismatch). */
  helperKey: string;
  canSubmit: boolean;
  // handlers
  handleSubmit: () => Promise<void>;
  handleCancelRecovery: () => Promise<void>;
}

export function useResetPasswordForm(): UseResetPasswordForm {
  const { t } = useTranslation("auth");
  const {
    userId,
    loading,
    recoveryUserId,
    recoverySessionId,
    recoveryPendingGlobal,
    activateRecoverySession,
    completeRecovery,
  } = useAuth();
  // Sign-in's "비밀번호를 잊었어요" hands the typed address over so the user
  // does not retype it; a direct visit starts blank.
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof emailParam === "string" ? emailParam : "");
  const [codeSent, setCodeSent] = useState(false);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [complete, setComplete] = useState(false);
  const [toast, setToast] = useState<ResetToast | null>(null);
  const [consumingRecoveryLink, setConsumingRecoveryLink] = useState(false);
  // Unlike the deprecated useURL(), useLinkingURL() seeds its state from the
  // native module synchronously. That keeps a cold-start recovery URL locked
  // before Android Back or an iOS gesture can win the first-frame race.
  const deepLinkUrl = useLinkingURL();
  const consumedUrlRef = useRef<string | null>(null);
  // Every session-changing operation shares this queue. React disabled state is
  // not a mutex: a link event can arrive before the state update is committed.
  const recoveryOperationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const recoveryConsumeGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const authSnapshotRef = useRef({ userId, recoveryUserId, recoverySessionId });
  const previousRecoveryOwnerRef = useRef(
    recoveryUserId && recoverySessionId ? `${recoveryUserId}:${recoverySessionId}` : null,
  );
  authSnapshotRef.current = { userId, recoveryUserId, recoverySessionId };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const recoveryActive =
    userId !== null &&
    recoveryUserId === userId &&
    recoverySessionId !== null;

  useEffect(() => {
    const recoveryOwner = recoveryUserId && recoverySessionId
      ? `${recoveryUserId}:${recoverySessionId}`
      : null;
    const previousOwner = previousRecoveryOwnerRef.current;
    if (previousOwner === recoveryOwner) return;
    previousRecoveryOwnerRef.current = recoveryOwner;
    const completedOwnerCleared =
      previousOwner !== null && recoveryOwner === null && complete;
    if (completedOwnerCleared) return;
    // A recovery link for B must never inherit A's typed password or done state.
    setPassword("");
    setConfirmPassword("");
    setComplete(false);
    setCancelled(false);
  }, [complete, recoverySessionId, recoveryUserId]);
  // useEffect starts native consumption after commit. Derive this first frame
  // synchronously so Back cannot win the race between URL render and the effect.
  const nativeRecoveryLinkWaiting =
    Platform.OS !== "web" &&
    deepLinkUrl !== null &&
    isPasswordRecoveryCallbackUrl(deepLinkUrl) &&
    consumedUrlRef.current !== deepLinkUrl;
  const recoveryPending =
    verifying ||
    consumingRecoveryLink ||
    cancelling ||
    recoveryPendingGlobal ||
    nativeRecoveryLinkWaiting ||
    (recoveryUserId !== null &&
      (recoveryUserId !== userId || recoverySessionId === null));
  const exitLocked = resetExitLocked({ recoveryPending, recoveryActive, complete });

  const helperKey = useMemo(() => resetHelperKey(password, confirmPassword), [confirmPassword, password]);

  // Resend cooldown ticker. Keyed on the boolean so the interval is created
  // once per countdown, not once per second; cleared on unmount
  // (ANDROID_QA_GUIDELINES — no leaked timers).
  const counting = resendSeconds > 0;
  useEffect(() => {
    if (!counting) return;
    const h = setInterval(() => setResendSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(h);
  }, [counting]);

  const handleSendCode = useCallback(async () => {
    const target = email.trim();
    if (
      !target.includes("@") ||
      sendSubmitting ||
      recoveryPending ||
      submitting ||
      resendSeconds > 0
    ) {
      return;
    }
    setSendSubmitting(true);
    try {
      await sendPasswordResetEmail(target);
      setCodeSent(true);
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
      setToast({ tone: "success", message: t("resetPassword.codeSentToast") });
    } catch (e) {
      // Same enumeration-safe wording either way (CSO R3): the toast never says
      // whether the address exists.
      setToast({ tone: "danger", message: t("errors.passwordResetFailed") });
      if (typeof console !== "undefined") console.warn("[auth] reset code send error", (e as Error).message);
    } finally {
      setSendSubmitting(false);
    }
  }, [email, recoveryPending, resendSeconds, sendSubmitting, submitting, t]);

  const handleVerifyCode = useCallback(async () => {
    const token = code.trim();
    if (
      token.length < 6 ||
      recoveryPending ||
      sendSubmitting ||
      consumingRecoveryLink ||
      submitting
    ) {
      return;
    }
    setVerifying(true);
    try {
      // verifyOtp emits PASSWORD_RECOVERY. Register its returned user as well
      // so the lock stays closed while AuthContext publishes the new session.
      await enqueueRecoveryOperation(
        recoveryOperationQueueRef,
        async () => {
          await persistRecoveryPending();
          try {
            const verified = await verifyPasswordResetCode(email, token);
            await activateRecoverySession(verified);
            await clearRecoveryPending();
          } catch (error) {
            await clearRecoveryPending().catch(() => undefined);
            throw error;
          }
        },
      );
    } catch (e) {
      setToast({ tone: "danger", message: t("resetPassword.codeInvalid") });
      if (typeof console !== "undefined") console.warn("[auth] reset code verify error", (e as Error).message);
    } finally {
      setVerifying(false);
    }
  }, [
    activateRecoverySession,
    code,
    consumingRecoveryLink,
    email,
    recoveryPending,
    sendSubmitting,
    submitting,
    t,
    verifying,
  ]);

  // Native: the recovery email's deep link carries the session tokens, but
  // detectSessionInUrl is web-only — without consuming the URL here the screen
  // always dead-ends at "expired". useLinkingURL covers both the cold-start initial URL
  // and a warm-app link event; AuthContext picks up the resulting session and
  // userId flips the form on. useLinkingURL is required for a synchronous
  // cold-start value; deprecated useURL would leave the first frame unlocked.
  useEffect(() => {
    if (
      Platform.OS === "web" ||
      !deepLinkUrl ||
      !isPasswordRecoveryCallbackUrl(deepLinkUrl)
    ) {
      return;
    }
    if (consumedUrlRef.current === deepLinkUrl) return;
    consumedUrlRef.current = deepLinkUrl;
    // The native module caches the cold-start URL across component remounts.
    // Claim it once before any await; this hook's current state keeps the value
    // while clearInitialURL prevents a replay after unmount/remount.
    clearInitialURL();
    const requestId = recoveryConsumeGenerationRef.current + 1;
    recoveryConsumeGenerationRef.current = requestId;
    setConsumingRecoveryLink(true);
    // The newest link owns the UI. Never carry A's password draft or completed
    // state into a B callback, even while auth-js is still exchanging B.
    setPassword("");
    setConfirmPassword("");
    setComplete(false);
    // Serialize A -> B URL changes. setSession/exchangeCode cannot be aborted;
    // running them concurrently could leave a stale ordinary session if the
    // newer callback failed after the older callback's activation was ignored.
    setCancelled(false);
    const task = enqueueRecoveryOperation(
      recoveryOperationQueueRef,
      async () => {
        await persistRecoveryPending();
        try {
          const callback = await consumeAuthCallbackUrl(deepLinkUrl);
          if (callback.type !== "recovery" || !callback.userId || !callback.sessionId) {
            throw new Error("Recovery callback returned no stable recovery session");
          }
          // Persist every session mutation, even when a newer URL already owns
          // the UI. Otherwise A may establish a recovery session, B may fail
          // before mutation, and A would survive with no proof to revoke.
          await activateRecoverySession({
            userId: callback.userId,
            sessionId: callback.sessionId,
          });
          await clearRecoveryPending();
          return requestId === recoveryConsumeGenerationRef.current;
        } catch (error) {
          // consumeAuthCallbackUrl may have completed setSession/PKCE exchange
          // before a later provenance or session_id check failed. Revoke the
          // current device session before releasing the provisional lock so an
          // unclassified callback can never escape as an ordinary login. If
          // sign-out fails, deliberately keep pending durable and fail closed.
          await signOut("local");
          await clearRecoveryPending();
          throw error;
        }
      },
    );
    void task
      .catch(async (e) => {
        if (
          mountedRef.current &&
          requestId === recoveryConsumeGenerationRef.current
        ) {
          // If B fails before changing the session, continuing under A would
          // mix B's error with A's account/draft. Latest intent wins: revoke A
          // locally and clear its proof before returning to the request step.
          const stale = authSnapshotRef.current;
          if (stale.recoveryUserId && stale.recoverySessionId) {
            const staleUserId = stale.recoveryUserId;
            const staleSessionId = stale.recoverySessionId;
            await enqueueRecoveryOperation(
              recoveryOperationQueueRef,
              async () => {
                const live = authSnapshotRef.current;
                if (
                  live.recoveryUserId === staleUserId &&
                  live.recoverySessionId === staleSessionId
                ) {
                  await signOut("local");
                  await completeRecovery(staleUserId, staleSessionId);
                }
              },
            ).catch(() => undefined);
          }
          setToast({ tone: "danger", message: t("errors.passwordResetFailed") });
        }
        if (typeof console !== "undefined") {
          console.warn("[auth] recovery link consume failed", (e as Error).message);
        }
      })
      .finally(() => {
        if (
          mountedRef.current &&
          requestId === recoveryConsumeGenerationRef.current
        ) {
          setConsumingRecoveryLink(false);
        }
      });
  }, [activateRecoverySession, completeRecovery, deepLinkUrl, t]);

  const handleSubmit = useCallback(async () => {
    const expectedRecoveryUserId = recoveryActive ? userId : null;
    const expectedRecoverySessionId = recoveryActive ? recoverySessionId : null;
    const callbackGenerationAtStart = recoveryConsumeGenerationRef.current;
    if (
      !expectedRecoveryUserId ||
      !expectedRecoverySessionId ||
      recoveryPending ||
      sendSubmitting ||
      password.length < 8 ||
      confirmPassword !== password ||
      submitting
    ) {
      return;
    }
    setSubmitting(true);
    try {
      // The leaked-password probe inside updatePassword is asynchronous. Bind
      // the eventual mutation to the recovery owner captured at submit entry,
      // then re-check the live Supabase session immediately before updateUser.
      const updated = await enqueueRecoveryOperation(
        recoveryOperationQueueRef,
        async () => {
          const live = authSnapshotRef.current;
          if (
            live.userId !== expectedRecoveryUserId ||
            live.recoveryUserId !== expectedRecoveryUserId ||
            live.recoverySessionId !== expectedRecoverySessionId
          ) {
            throw new Error("Password recovery owner changed before update");
          }
          return updatePassword(
            password,
            undefined,
            expectedRecoveryUserId,
            expectedRecoverySessionId,
          );
        },
      );
      // A newly arrived recovery link is queued behind this update. Do not let
      // A's completion clear B's forthcoming proof or show a stale done screen.
      if (
        callbackGenerationAtStart !== recoveryConsumeGenerationRef.current
      ) {
        return;
      }
      const live = authSnapshotRef.current;
      if (
        updated.userId !== expectedRecoveryUserId ||
        live.userId !== expectedRecoveryUserId ||
        live.recoveryUserId !== expectedRecoveryUserId ||
        live.recoverySessionId !== expectedRecoverySessionId
      ) {
        throw new Error("Password recovery owner changed during update");
      }
      setPassword("");
      setConfirmPassword("");
      await completeRecovery(expectedRecoveryUserId, expectedRecoverySessionId);
      setComplete(true);
      setToast({ tone: "success", message: t("resetPassword.successToast") });
    } catch (e) {
      // One generic toast used to swallow every failure, so a user could not
      // tell "link expired" from "the server wants your current password".
      // Branch on error_code: the missing and the wrong current-password cases
      // return identical message text and differ only by code.
      // Each t() call is written out in full on purpose: check:constraints pins
      // the literal t("errors.passwordUpdateFailed") in this file to keep the
      // generic fallback from being refactored away.
      const failure = passwordUpdateFailure(e);
      const message =
        failure === "breached_password"
          ? t("errors.breachedPassword")
          : failure === "current_password_required"
            ? t("errors.currentPasswordRequired")
          : failure === "current_password_invalid"
            ? t("errors.currentPasswordInvalid")
            : failure === "reauthentication_needed"
              ? t("errors.reauthRequired")
              : failure === "weak_password"
                ? t("errors.passwordTooShort")
                : t("errors.passwordUpdateFailed");
      setToast({ tone: "danger", message });
      if (typeof console !== "undefined") console.warn("[auth] password update error", failure);
    } finally {
      setSubmitting(false);
    }
  }, [
    completeRecovery,
    confirmPassword,
    password,
    recoveryActive,
    recoveryPending,
    recoverySessionId,
    sendSubmitting,
    submitting,
    t,
    userId,
  ]);

  const handleCancelRecovery = useCallback(async () => {
    const expectedRecoveryUserId = recoveryActive ? userId : null;
    const expectedRecoverySessionId = recoveryActive ? recoverySessionId : null;
    const callbackGenerationAtStart = recoveryConsumeGenerationRef.current;
    if (
      !expectedRecoveryUserId ||
      !expectedRecoverySessionId ||
      recoveryPending ||
      sendSubmitting ||
      submitting ||
      cancelling
    ) {
      return;
    }
    setCancelling(true);
    try {
      // Cancelling an active recovery must revoke the authenticated recovery
      // session, not merely navigate away from it.
      const signedOut = await enqueueRecoveryOperation(
        recoveryOperationQueueRef,
        async () => {
          const live = authSnapshotRef.current;
          if (
            live.userId !== expectedRecoveryUserId ||
            live.recoveryUserId !== expectedRecoveryUserId ||
            live.recoverySessionId !== expectedRecoverySessionId
          ) {
            return false;
          }
          // Recovery cancellation revokes only this device's session. It must
          // not silently sign the account out on every other trusted device.
          await signOut("local");
          return true;
        },
      );
      if (
        !signedOut ||
        callbackGenerationAtStart !== recoveryConsumeGenerationRef.current
      ) {
        return;
      }
      await completeRecovery(expectedRecoveryUserId, expectedRecoverySessionId);
      setCancelled(true);
    } catch (e) {
      setToast({ tone: "danger", message: t("errors.signOutFailed") });
      if (typeof console !== "undefined") {
        console.warn("[auth] recovery cancel sign-out failed", (e as Error).message);
      }
    } finally {
      setCancelling(false);
    }
  }, [
    cancelling,
    completeRecovery,
    recoveryActive,
    recoveryPending,
    recoverySessionId,
    sendSubmitting,
    submitting,
    t,
    userId,
  ]);

  const { canSendCode, canVerify, canSubmit } = resetActionAvailability({
    emailValid: email.trim().includes("@"),
    codeValid: code.trim().length >= 6,
    passwordsValid: password.length >= 8 && confirmPassword === password,
    recoveryActive,
    recoveryPending,
    sendSubmitting,
    submitting,
    resendSeconds,
  });
  const step = resetStep({ recoveryActive, complete, codeSent });

  return {
    loading,
    userId,
    recoveryActive,
    recoveryPending,
    exitLocked,
    step,
    email,
    setEmail,
    canSendCode,
    sendSubmitting,
    resendSeconds,
    handleSendCode,
    code,
    setCode,
    canVerify,
    verifying,
    handleVerifyCode,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    submitting,
    cancelling,
    cancelled,
    complete,
    toast,
    helperKey,
    canSubmit,
    handleSubmit,
    handleCancelRecovery,
  };
}
