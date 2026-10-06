import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { Text } from "@/components/ui/Text";
import type { AccountDeletionReceiptNotice } from "@/lib/account/deletion-receipt-view";
import { m3 } from "@/lib/theme/m3";
import { ForceDark } from "@/lib/theme/ThemeContext";

// 세 값은 세 가지 다른 사실이다 (delete-bulk.ts AccountDeletionReceipt):
//   true  = 확인됨
//   false = 서버가 그 정리를 끝내지 못했다고 **보고**함
//   null  = 서버가 아무 말도 안 함 (옛 배포는 필드 자체가 없다)
// 받는 사람이 **다음에 할 행동이 다르다** - 서버가 못 끝냈다고 말했으면
// 문의할 일이고, 아무 말도 안 했으면 확인할 일이다. 그래서 세 키를 가른다.
//
// R31-ACCOUNT-01 닫힘: false 가 "Absence could not be confirmed" 로 읽힐 때는
// 서버가 실제로 말한 것보다 부드러워서, 무응답(null)과 같은 문장으로 읽혔다.
// 이 세 값이 고르는 문구 자체는 deletion-receipt-copy.test.ts 가 덮는다.
const observationKey = (value: boolean | null) =>
  value === true ? "observedAbsent" : value === false ? "reportedUnfinished" : "notReported";
const proofKey = (value: boolean | null) =>
  value === true ? "proofConfirmed" : value === false ? "proofReportedFalse" : "notReported";

function dateText(iso: string | null, language: string): string | null {
  if (iso === null) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  try {
    return new Date(time).toLocaleDateString(language, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Display-only deletion receipt. No deletion, remote retry, or persistent data. */
export function AccountDeletionNoticePanel({
  notice,
  onClose,
}: {
  notice: AccountDeletionReceiptNotice;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("consent");
  const [expanded, setExpanded] = useState(false);
  const language = typeof i18n?.language === "string" ? i18n.language : "en";
  const erasedAt = dateText(notice.erasedAtIso, language);
  const expiresAt = dateText(notice.expiresAtIso, language);
  return (
    <ForceDark>
    <MdCard variant="outlined" style={styles.card}>
      <Text accessibilityRole="header" style={m3TextStyle("titleLarge")}>{t("account.deletionReceipt.title")}</Text>
      <Text style={m3TextStyle("bodyMedium")}>{t("account.deletionReceipt.body")}</Text>
      {notice.opId !== null ? (
        <View style={styles.row}>
          <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.receiptNumber")}</Text>
          <Text selectable testID="account-deletion-receipt-number" style={m3TextStyle("bodyMedium")}>{notice.opId}</Text>
          {expiresAt !== null ? (
            <Text style={m3TextStyle("bodySmall")}>{t("account.deletionReceipt.receiptNumberHint", { date: expiresAt })}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={m3TextStyle("bodySmall")}>{t("account.deletionReceipt.noNumber")}</Text>
      )}
      {erasedAt !== null ? (
        <View style={styles.row}>
          <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.erasedAt")}</Text>
          <Text style={m3TextStyle("bodyMedium")}>{erasedAt}</Text>
        </View>
      ) : null}
      {notice.localSignOut !== null ? (
        <View accessibilityLiveRegion="polite">
          <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.localSignOut.${notice.localSignOut}`)}</Text>
        </View>
      ) : null}
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
        {notice.unrecorded ? (
          <Text style={m3TextStyle("bodySmall")}>{t("account.deletionReceipt.unrecorded")}</Text>
        ) : null}
        {notice.sweeps !== null ? <>
          <View style={styles.row}>
            <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.profile")}</Text>
            <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.${observationKey(notice.sweeps.profileErased)}`)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.deletionFence")}</Text>
            <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.${proofKey(notice.sweeps.deletionFenced)}`)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.rawClippingsEmptyAtCheck")}</Text>
            <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.${proofKey(notice.sweeps.rawClippingsEmptyAtCheck)}`)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.rawClippings")}</Text>
            <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.${observationKey(notice.sweeps.rawClippingsErased)}`)}</Text>
          </View>
        </> : null}
        {notice.localPurge !== null ? (
          <View style={styles.row}>
            <Text style={m3TextStyle("titleSmall")}>{t("account.deletionReceipt.localTitle")}</Text>
            <Text style={m3TextStyle("bodyMedium")}>{t(`account.deletionReceipt.localPurge.${notice.localPurge}`)}</Text>
          </View>
        ) : null}
        <Text style={m3TextStyle("bodySmall")}>{t("account.deletionReceipt.subscription")}</Text>
        <Text selectable style={m3TextStyle("bodySmall")}>{t("account.deletionReceipt.support")}</Text>
      </View> : null}
      <MdButton
        testID="account-deletion-dismiss"
        label={t("account.deletionReceipt.dismiss")}
        accessibilityHint={t("account.deletionReceipt.dismissHint")}
        onPress={onClose}
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
