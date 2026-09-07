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

// 세 값은 세 가지 다른 사실이다 (delete-bulk.ts:200-221):
//   true  = 확인됨
//   false = 서버가 그 정리를 끝내지 못했다고 **보고**함
//   null  = 서버가 아무 말도 안 함 (옛 배포는 필드 자체가 없다)
// 받는 사람이 **다음에 할 행동이 다르다** - 서버가 못 끝냈다고 말했으면
// 문의할 일이고, 아무 말도 안 했으면 확인할 일이다. 그래서 세 키를 가른다.
//
// R31-ACCOUNT-01 닫힘: false 가 "Absence could not be confirmed" 로 읽힐 때는
// 서버가 실제로 말한 것보다 부드러워서, 무응답(null)과 같은 문장으로 읽혔다.
// 옆 하네스(account-deletion-notice.test.ts)는 키 집합과 일부 문구
// (title·notReported·scope·support)를 못박고 es/pt/id === en 도 고정하지만,
// **이 세 값이 고르는 문구 자체**는 못박지 않았다 - 그래서 한국어만 바꾸는
// 변이가 그 하네스를 통째로 통과한다. 그 층은 deletion-receipt-copy.test.ts 가 덮는다.
const observationKey = (value: boolean | null) =>
  value === true ? "observedAbsent" : value === false ? "reportedUnfinished" : "notReported";

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
