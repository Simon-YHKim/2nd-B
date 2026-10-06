// /account-deleted - the one place a deletion receipt is shown (0217, Simon
// decision Q-261004-42 = A; docs/design/deletion-receipt-server-261006.md 3.4).
//
// The receipt is the SERVER's record, fetched by its number. The number comes
// from the deletion this device just ran (an in-memory handoff, never a URL),
// from a `#r=<number>` link fragment (read once, then removed from the address
// bar), or from the lookup form. Nothing about the receipt is held in app
// memory or device storage, so no other screen and no other account is ever
// handed it.
//
// Visibility is decided on every render by deletion-receipt-view.ts:
//   - auth still resolving or an owner transition held -> wait;
//   - session state UNKNOWN (sessionUnavailable) -> a retry, no lookup;
//   - ANY account signed in -> no receipt, only a way back into the app (the
//     account this device just deleted is told when its sign-out failed);
//   - signed out -> the receipt for the number, or a form to enter one.
import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { AccountDeletionNoticePanel } from "@/components/account/AccountDeletionNotice";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { PixelGateShell } from "@/components/pixel";
import { Text } from "@/components/ui/Text";
import {
  fetchAccountDeletionReceipt,
  knownSignedOut,
  normalizeReceiptId,
  receiptIdFromFragment,
  type ReceiptLookup,
} from "@/lib/account/deletion-receipt";
import {
  clearDeletionReceiptHandoff,
  deletionReceiptHandoffSnapshot,
  noteDeletionReceiptSignOut,
  subscribeDeletionReceiptHandoff,
} from "@/lib/account/deletion-receipt-handoff";
import { receiptScreenView } from "@/lib/account/deletion-receipt-view";
import {
  accountTransitionPendingFromSnapshot,
  accountTransitionSnapshot,
  subscribeAccountTransition,
} from "@/lib/auth/account-epoch";
import { useAuth } from "@/lib/auth/AuthContext";
import { captureSignOutExpectation, signOutExpected } from "@/lib/supabase/auth";
import { m3 } from "@/lib/theme/m3";
import { ForceDark } from "@/lib/theme/ThemeContext";

/** Read a `#r=<number>` fragment once and take it out of the address bar (web only). */
function takeFragmentReceiptId(): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const id = receiptIdFromFragment(window.location.hash);
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    return id;
  } catch {
    return null;
  }
}

function ReceiptLookupForm({ onOpen }: { onOpen: (opId: string) => void }) {
  const { t } = useTranslation("consent");
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const submit = () => {
    const id = normalizeReceiptId(value);
    if (id === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onOpen(id);
  };
  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={m3TextStyle("titleLarge")}>{t("account.deletionReceipt.lookupTitle")}</Text>
      <Text style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.lookupBody")}</Text>
      <TextInput
        testID="account-deletion-receipt-input"
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t("account.deletionReceipt.receiptNumber")}
        placeholder={t("account.deletionReceipt.receiptNumber")}
        placeholderTextColor={m3.color.onSurfaceVariant}
        returnKeyType="go"
        onSubmitEditing={submit}
        style={styles.input}
      />
      {invalid ? (
        <Text accessibilityLiveRegion="polite" style={m3TextStyle("bodySmall")}>{t("account.deletionReceipt.lookupInvalid")}</Text>
      ) : null}
      <MdButton testID="account-deletion-receipt-open" label={t("account.deletionReceipt.lookupCta")} onPress={submit} />
    </View>
  );
}

export function AccountDeletionReceiptScreen() {
  const { t } = useTranslation(["consent", "auth"]);
  const { userId, loading, sessionUnavailable, refresh } = useAuth();
  const transitionSnapshot = useSyncExternalStore(
    subscribeAccountTransition,
    accountTransitionSnapshot,
    accountTransitionSnapshot,
  );
  const handoff = useSyncExternalStore(
    subscribeDeletionReceiptHandoff,
    deletionReceiptHandoffSnapshot,
    deletionReceiptHandoffSnapshot,
  );
  const [opId, setOpId] = useState<string | null>(() => deletionReceiptHandoffSnapshot()?.opId ?? takeFragmentReceiptId());
  const [lookup, setLookup] = useState<{ id: string; result: ReceiptLookup } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const transitionPending = accountTransitionPendingFromSnapshot(transitionSnapshot);
  const signedOut = knownSignedOut({ loading, userId, sessionUnavailable, transitionPending });

  useEffect(() => {
    if (!signedOut || opId === null) return;
    let cancelled = false;
    void fetchAccountDeletionReceipt(opId).then((result) => {
      if (!cancelled) setLookup({ id: opId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [signedOut, opId, attempt]);

  const view = receiptScreenView({
    authLoading: loading,
    userId,
    sessionUnavailable,
    transitionPending,
    opId,
    handoff,
    lookup: lookup !== null && lookup.id === opId ? lookup.result : null,
  });

  // Closing the result ends this device's one-time note.
  const close = () => {
    clearDeletionReceiptHandoff();
    router.replace("/sign-in");
  };
  const open = (id: string) => {
    setLookup(null);
    setOpId(id);
  };
  const retry = () => {
    setLookup(null);
    setAttempt((value) => value + 1);
  };
  const retrySignOut = () => {
    if (handoff === null || signOutBusy) return;
    const { owner, opId: handoffOpId } = handoff;
    setSignOutBusy(true);
    void (async () => {
      try {
        const expectation = await captureSignOutExpectation();
        if (expectation.userId !== owner) return;
        await signOutExpected(expectation);
        noteDeletionReceiptSignOut(owner, handoffOpId, "complete");
      } catch {
        noteDeletionReceiptSignOut(owner, handoffOpId, "unconfirmed");
      } finally {
        setSignOutBusy(false);
      }
    })();
  };

  let body: ReactElement;
  switch (view.kind) {
    case "receipt":
      return (
        <PixelGateShell>
          <AccountDeletionNoticePanel notice={view.notice} onClose={close} />
        </PixelGateShell>
      );
    case "session-unknown":
      body = (
        <>
          <Text accessibilityLiveRegion="polite" style={m3TextStyle("bodyMedium")}>{t("auth:common.sessionUnavailable")}</Text>
          <MdButton label={t("account.deletionReceipt.retry")} onPress={() => void refresh()} />
        </>
      );
      break;
    case "signout-unconfirmed":
      body = (
        <>
          <Text accessibilityLiveRegion="polite" style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.localSignOut.unconfirmed")}</Text>
          <MdButton label={t("account.deletionReceipt.retry")} disabled={signOutBusy} onPress={retrySignOut} />
          <MdButton variant="text" label={t("account.deletionReceipt.goHome")} onPress={() => router.replace("/")} />
        </>
      );
      break;
    case "signed-in":
      body = (
        <>
          <Text style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.signedIn")}</Text>
          <MdButton label={t("account.deletionReceipt.goHome")} onPress={() => router.replace("/")} />
        </>
      );
      break;
    case "lookup":
      body = <ReceiptLookupForm onOpen={open} />;
      break;
    case "not-found":
      body = (
        <>
          <Text accessibilityLiveRegion="polite" style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.notFound")}</Text>
          <ReceiptLookupForm onOpen={open} />
        </>
      );
      break;
    case "rate-limited":
    case "unavailable":
      body = (
        <>
          <Text accessibilityLiveRegion="polite" style={m3TextStyle("bodyMedium")}>
            {t(view.kind === "rate-limited" ? "account.deletionReceipt.rateLimited" : "account.deletionReceipt.unavailable")}
          </Text>
          <MdButton label={t("account.deletionReceipt.retry")} onPress={retry} />
        </>
      );
      break;
    default:
      body = <Text accessibilityLiveRegion="polite" style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.loading")}</Text>;
  }
  return (
    <PixelGateShell>
      <ForceDark>
        <MdCard variant="outlined" style={styles.card}>
          {body}
          {view.kind !== "signed-in" && view.kind !== "signout-unconfirmed" ? (
            <MdButton variant="text" label={t("account.deletionReceipt.dismiss")} onPress={close} />
          ) : null}
        </MdCard>
      </ForceDark>
    </PixelGateShell>
  );
}

const styles = StyleSheet.create({
  card: { gap: m3.spacing.s3, minWidth: 0 },
  form: { gap: m3.spacing.s3, minWidth: 0 },
  input: {
    minHeight: m3.minTouch,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
    borderWidth: 1,
    borderColor: m3.color.outline,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
  },
});
