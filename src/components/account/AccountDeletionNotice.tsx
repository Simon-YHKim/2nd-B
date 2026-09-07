import { useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { Text } from "@/components/ui/Text";
import {
  dismissAccountDeletionNotice,
  getAccountDeletionNotice,
  subscribeAccountDeletionNotice,
  type AccountDeletionNotice,
} from "@/lib/account/deletion-completion";
import { m3 } from "@/lib/theme/m3";
import { ForceDark } from "@/lib/theme/ThemeContext";

/** The store owns account/epoch validity. Reading a notice never consumes it. */
export function useAccountDeletionNotice(): AccountDeletionNotice | null {
  return useSyncExternalStore(
    subscribeAccountDeletionNotice,
    getAccountDeletionNotice,
    getAccountDeletionNotice,
  );
}

// ⚠ 여기 문구 하나가 서버보다 부드럽다. main 의 영수증에서 세 값의 뜻은
// (delete-bulk.ts): true = 확인됨 · false = 서버가 "끝내지 못했다"고 보고함 ·
// null = 아무 말 없음. 그런데 false 가 "Absence could not be confirmed"(확인하지
// 못했다)로 읽힌다 - 확인에 실패한 것과 서버가 안 됐다고 말한 것은 사용자에게
// 다른 사실이다.
//
// 이 회차에서 고치지 않는다. 고치려면 5개 언어에 안전 문구를 새로 쓰는 일이고,
// 그건 이 배선과 함께 서두를 일이 아니다. R31-ACCOUNT-01 로 남긴다.
const observationKey = (value: boolean | null) =>
  value === true ? "observedAbsent" : value === false ? "notConfirmed" : "notReported";

/** Display-only completion receipt. No deletion, remote retry, or persistent data. */
export function AccountDeletionNoticePanel({ notice }: { notice: AccountDeletionNotice }) {
  const { t } = useTranslation("consent");
  const [expanded, setExpanded] = useState(false);
  const pending = notice.localSignOut === "pending";
  const dismiss = () => {
    // A callback retained from an older render must not dismiss a later notice.
    if (!pending && getAccountDeletionNotice() === notice) dismissAccountDeletionNotice();
  };
  return (
    <ForceDark>
    <MdCard variant="outlined" style={styles.card}>
      <Text accessibilityRole="header" style={m3TextStyle("titleLarge")}>{t("account.deletionReceipt.title")}</Text>
      <Text style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.body")}</Text>
      <View accessibilityLiveRegion="polite">
        <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.localSignOut.${notice.localSignOut}`)}</Text>
      </View>
      <Pressable
        testID="account-deletion-details"
        accessibilityRole="button"
        accessibilityLabel={t(expanded ? "account.deletionReceipt.hideDetails" : "account.deletionReceipt.showDetails")}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded(value => !value)}
        style={styles.disclosure}
      >
        <Text style={m3TextStyle("labelLarge")}>{t(expanded ? "account.deletionReceipt.hideDetails" : "account.deletionReceipt.showDetails")}</Text>
      </Pressable>
      {expanded ? <View style={styles.details}>
        <Text style={m3TextStyle("bodySmall")}>{t("account.deletionReceipt.scope")}</Text>
        <View style={styles.row}>
          <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.profile")}</Text>
          <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.${observationKey(notice.receipt.profileErased)}`)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.rawClippings")}</Text>
          <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.${observationKey(notice.receipt.rawClippingsErased)}`)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.localTitle")}</Text>
          <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.localPurge.${notice.localPurge}`)}</Text>
        </View>
        <Text style={m3TextStyle("bodySmall")}>{t("account.deletionReceipt.subscription")}</Text>
        <Text selectable style={m3TextStyle("bodySmall")}>{t("account.deletionReceipt.support")}</Text>
      </View> : null}
      <MdButton
        testID="account-deletion-dismiss"
        label={t("account.deletionReceipt.dismiss")}
        accessibilityHint={t(pending ? "account.deletionReceipt.dismissPendingHint" : "account.deletionReceipt.dismissHint")}
        disabled={pending}
        onPress={dismiss}
      />
    </MdCard>
    </ForceDark>
  );
}

const styles = StyleSheet.create({
  card: { gap: m3.spacing.s3, minWidth: 0 },
  details: { gap: m3.spacing.s4, minWidth: 0 },
  row: { gap: m3.spacing.s2, minWidth: 0 },
  disclosure: { minHeight: m3.minTouch, justifyContent: "center", paddingVertical: m3.spacing.s2 },
});
