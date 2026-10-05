// /account-deleted - the one place a deletion receipt is shown.
//
// The receipt is the SERVER's record (0217), fetched by the number in this
// route's URL. Nothing about it is held in app memory or device storage, so no
// other screen, and no other account, can ever be handed it (Simon decision
// Q-261004-42 = A; the in-memory notice it replaces showed A's receipt on B's
// sign-in screen, PR #2054 gates DEL-N1-01 / DEL-N2-01).
//
// Visibility is decided on every render, synchronously:
//   - while auth is still resolving or an owner transition is held -> wait;
//   - while ANY account is signed in -> no receipt, only a way back into the app;
//   - signed out -> the receipt for the number in the URL, or a form to enter one.
// A receipt carries no account identifier, so "signed out" is the only
// condition a viewer has to meet: whoever holds the number may read it.
import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { AccountDeletionNoticePanel } from "@/components/account/AccountDeletionNotice";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { PixelGateShell } from "@/components/pixel";
import { Text } from "@/components/ui/Text";
import {
  ACCOUNT_DELETED_ROUTE,
  fetchAccountDeletionReceipt,
  normalizeReceiptId,
  parseAccountDeletedParams,
  type ReceiptLookup,
} from "@/lib/account/deletion-receipt";
import { receiptScreenView } from "@/lib/account/deletion-receipt-view";
import {
  accountTransitionPendingFromSnapshot,
  accountTransitionSnapshot,
  subscribeAccountTransition,
} from "@/lib/auth/account-epoch";
import { useAuth } from "@/lib/auth/AuthContext";
import { m3 } from "@/lib/theme/m3";
import { ForceDark } from "@/lib/theme/ThemeContext";

function ReceiptLookupForm({ initialInvalid }: { initialInvalid: boolean }) {
  const { t } = useTranslation("consent");
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(initialInvalid);
  const submit = () => {
    const id = normalizeReceiptId(value);
    if (id === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    router.replace(`${ACCOUNT_DELETED_ROUTE}?receipt=${id}`);
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
  const { t } = useTranslation("consent");
  const { userId, loading } = useAuth();
  const transitionSnapshot = useSyncExternalStore(
    subscribeAccountTransition,
    accountTransitionSnapshot,
    accountTransitionSnapshot,
  );
  const rawParams = useLocalSearchParams();
  const params = parseAccountDeletedParams(rawParams as Record<string, unknown>);
  const [lookup, setLookup] = useState<{ id: string; result: ReceiptLookup } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const transitionPending = accountTransitionPendingFromSnapshot(transitionSnapshot);
  const signedOut = !loading && !transitionPending && userId === null;
  const receiptId = params.receiptId;

  useEffect(() => {
    if (!signedOut || receiptId === null) return;
    let cancelled = false;
    void fetchAccountDeletionReceipt(receiptId).then((result) => {
      if (!cancelled) setLookup({ id: receiptId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [signedOut, receiptId, attempt]);

  const view = receiptScreenView({
    authLoading: loading,
    userId,
    transitionPending,
    params,
    lookup: lookup !== null && lookup.id === receiptId ? lookup.result : null,
  });

  const goSignIn = () => router.replace("/sign-in");
  let body: ReactElement;
  switch (view.kind) {
    case "receipt":
      return (
        <PixelGateShell>
          <AccountDeletionNoticePanel notice={view.notice} onClose={goSignIn} />
        </PixelGateShell>
      );
    case "signed-in":
      body = (
        <>
          <Text style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.signedIn")}</Text>
          <MdButton label={t("account.deletionReceipt.goHome")} onPress={() => router.replace("/")} />
        </>
      );
      break;
    case "lookup":
      body = <ReceiptLookupForm initialInvalid={false} />;
      break;
    case "not-found":
      body = (
        <>
          <Text accessibilityLiveRegion="polite" style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.notFound")}</Text>
          <ReceiptLookupForm initialInvalid={false} />
        </>
      );
      break;
    case "unavailable":
      body = (
        <>
          <Text accessibilityLiveRegion="polite" style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.unavailable")}</Text>
          <MdButton label={t("account.deletionReceipt.retry")} onPress={() => {
            setLookup(null);
            setAttempt((value) => value + 1);
          }} />
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
          {view.kind !== "signed-in" ? (
            <MdButton variant="text" label={t("account.deletionReceipt.dismiss")} onPress={goSignIn} />
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
