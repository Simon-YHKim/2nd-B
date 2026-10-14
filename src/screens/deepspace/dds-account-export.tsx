// The account data export, as its own panel. It lived on the account screen and was reached from
// My data's card through /account?tool=export; Simon moved the tool itself into My data
// (Q-261014-61, 2026-10-14 20:33). The behaviour is the account screen's, unchanged: one press
// prepares the bundle, the server's cooldown is said as a wait and not as a failure, a bundle with
// missing items says so, and a result that arrives for another account or after leaving is dropped.
import { PhoneView as View } from "@/components/phone/PhoneUIKit";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Share, StyleSheet } from "react-native";
import { PlainText as RNText } from "@/components/ui/PlainText";
import { useTranslation } from "react-i18next";

import { m3TextStyle } from "@/components/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { useAuth } from "@/lib/auth/AuthContext";
import { m3 } from "@/lib/theme/m3";

import { accountExportDeps, exportAccountData } from "./dds-account-actions";

type ExportFeedback =
  | { kind: "done" | "partial"; failedItems: number }
  | { kind: "failed" }
  | { kind: "cooldown"; minutes: number }
  | null;

async function deliverAccountExport(json: string, filename: string): Promise<void> {
  if (Platform.OS !== "web") {
    await Share.share({ message: json, title: filename });
    return;
  }

  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("account export download is unavailable");
  }

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function warnExportFailed(): void {
  if (typeof console === "undefined") return;
  // Export errors may include backend details. Keep the log categorical so a platform logger can
  // never receive PII or a response payload.
  console.warn("[account] export failed");
}

export function AccountExportPanel() {
  const { t } = useTranslation(["consent"]);
  const { userId } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback>(null);

  const mountedRef = useRef(true);
  const activeUserRef = useRef(userId);
  const previousUserRef = useRef(userId);
  const authEpochRef = useRef(0);
  if (previousUserRef.current !== userId) {
    previousUserRef.current = userId;
    authEpochRef.current += 1;
  }
  activeUserRef.current = userId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A new owner never inherits the previous one's result or busy lock.
  useEffect(() => {
    setExporting(false);
    setExportFeedback(null);
  }, [userId]);

  const onExportData = useCallback(async () => {
    if (!userId || exporting) return;
    const requestedUser = userId;
    const requestedEpoch = authEpochRef.current;
    setExporting(true);
    setExportFeedback(null);
    const result = await exportAccountData({
      ...accountExportDeps,
      deliver: deliverAccountExport,
      expectedUserId: requestedUser,
      isActive: () =>
        mountedRef.current &&
        activeUserRef.current === requestedUser &&
        authEpochRef.current === requestedEpoch,
    });
    if (
      !mountedRef.current ||
      activeUserRef.current !== requestedUser ||
      authEpochRef.current !== requestedEpoch
    ) return;
    if (result.status === "cancelled") {
      setExporting(false);
      return;
    }
    if (result.status === "cooldown") {
      // Not a failure: the server allows one export per window and says how long
      // is left. Saying "failed" here makes people press again and hit it again.
      setExportFeedback({ kind: "cooldown", minutes: Math.max(1, Math.ceil(result.retryAfterSeconds / 60)) });
    } else if (result.status === "failed") {
      warnExportFailed();
      setExportFeedback({ kind: "failed" });
    } else {
      // A delivered bundle can still be missing tables or clipping files. Say so
      // here or the user reads "Export ready." and may then delete the account.
      const { failedItems } = result.summary;
      setExportFeedback({ kind: failedItems > 0 ? "partial" : "done", failedItems });
    }
    setExporting(false);
  }, [exporting, userId]);

  return (
    <View style={styles.panel}>
      {exportFeedback?.kind === "done" ? (
        <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.success]}>
          {t("consent:account.export.done")}
        </RNText>
      ) : null}
      {exportFeedback?.kind === "partial" ? (
        <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.error]}>
          {t("consent:account.export.donePartial", { count: exportFeedback.failedItems })}
        </RNText>
      ) : null}
      {exportFeedback?.kind === "failed" ? (
        <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.error]}>
          {t("consent:account.export.failed")}
        </RNText>
      ) : null}
      {exportFeedback?.kind === "cooldown" ? (
        <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.error]}>
          {t("consent:account.export.cooldown", { minutes: exportFeedback.minutes })}
        </RNText>
      ) : null}
      <PixelPressable
        variant={exporting ? "inset" : "frame"}
        disabled={exporting}
        onPress={() => void onExportData()}
        accessibilityLabel={t("consent:account.export.button")}
        accessibilityHint={t("consent:account.export.buttonHint")}
        accessibilityState={{ busy: exporting }}
        fullWidth
        contentStyle={styles.actionContent}
      >
        <PixelGlyph
          name={exporting ? "refresh" : "download"}
          color={exporting ? m3.disabled.onSurface : m3.color.primary}
          size={24}
        />
        <RNText style={[m3TextStyle("labelLarge"), exporting ? styles.disabledLabel : styles.actionLabel]}>
          {t("consent:account.export.button")}
        </RNText>
      </PixelPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: m3.spacing.s6 },
  success: { color: m3.color.primary },
  error: { color: m3.color.error },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
  },
  actionLabel: { color: m3.color.primary },
  disabledLabel: { color: m3.disabled.onSurface },
});
