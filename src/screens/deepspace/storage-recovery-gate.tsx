import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PixelGateShell, PixelPressable, PixelSurface } from "@/components/pixel";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { useAuth } from "@/lib/auth/AuthContext";
import { m3 } from "@/lib/theme/m3";

/** Explicit two-step consent gate for sentinel-proven native key loss. It is
 * intentionally a full-screen replacement: no sign-in/recovery action may run
 * while the durable auth state is unreadable. */
export function EncryptedStorageRecoveryGate() {
  const { t } = useTranslation(["auth"]);
  const { recoverEncryptedStorage } = useAuth();
  const [reviewing, setReviewing] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    if (working) return;
    setWorking(true);
    setFailed(false);
    const recovered = await recoverEncryptedStorage({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    });
    if (!recovered) {
      setFailed(true);
      setWorking(false);
    }
  };

  return (
    <PixelGateShell contentContainerStyle={styles.shell}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={styles.content}
      >
        <PixelSurface
          variant="frame"
          background={m3.color.errorContainer}
          style={styles.glyphFrame}
          contentStyle={styles.glyphContent}
        >
          <PixelGlyph name="warning" color={m3.color.onErrorContainer} size={48} />
        </PixelSurface>

        <Text style={styles.title}>
          {t(reviewing ? "auth:storageRecovery.confirmTitle" : "auth:storageRecovery.title")}
        </Text>
        <Text style={styles.body}>
          {t(reviewing ? "auth:storageRecovery.confirmBody" : "auth:storageRecovery.body")}
        </Text>
        <PixelSurface
          variant="inset"
          background={m3.color.errorContainer}
          contentStyle={styles.warningSurface}
        >
          <Text style={styles.warning}>{t("auth:storageRecovery.warning")}</Text>
        </PixelSurface>

        {failed ? (
          <Text accessibilityRole="alert" style={styles.failed}>
            {t("auth:storageRecovery.failed")}
          </Text>
        ) : null}

        {reviewing ? (
          <View style={styles.actions}>
            <PixelPressable
              variant="frame"
              disabled={working}
              onPress={() => setReviewing(false)}
              accessibilityLabel={t("auth:storageRecovery.backAction")}
              fullWidth
              contentStyle={styles.actionContent}
            >
              <Text style={styles.secondaryLabel}>{t("auth:storageRecovery.backAction")}</Text>
            </PixelPressable>
            <PixelPressable
              variant={working ? "inset" : "bevel"}
              disabled={working}
              onPress={() => void confirm()}
              accessibilityLabel={t("auth:storageRecovery.confirmAction")}
              accessibilityState={{ busy: working }}
              background={working ? m3.color.surfaceContainerHighest : m3.color.error}
              fullWidth
              contentStyle={styles.actionContent}
            >
              <Text style={working ? styles.secondaryLabel : styles.dangerLabel}>
                {t(working ? "auth:storageRecovery.working" : "auth:storageRecovery.confirmAction")}
              </Text>
            </PixelPressable>
          </View>
        ) : (
          <PixelPressable
            variant="bevel"
            onPress={() => {
              setFailed(false);
              setReviewing(true);
            }}
            accessibilityLabel={t("auth:storageRecovery.reviewAction")}
            background={m3.color.primary}
            fullWidth
            contentStyle={styles.actionContent}
          >
            <Text style={styles.primaryLabel}>{t("auth:storageRecovery.reviewAction")}</Text>
          </PixelPressable>
        )}
      </View>
    </PixelGateShell>
  );
}

const styles = StyleSheet.create({
  shell: {
    justifyContent: "center",
    ...(Platform.OS === "web"
      ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const }
      : {}),
  },
  content: { alignItems: "center", gap: m3.spacing.s4 },
  glyphFrame: { width: 80, height: 80 },
  glyphContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: {
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.headlineSmall.size,
    lineHeight: m3.type.headlineSmall.line,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
    textAlign: "center",
  },
  warningSurface: { minHeight: m3.minTouch, justifyContent: "center" },
  warning: {
    color: m3.color.onErrorContainer,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    textAlign: "center",
  },
  failed: {
    color: m3.color.error,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    textAlign: "center",
  },
  actions: { alignSelf: "stretch", gap: m3.spacing.s3 },
  actionContent: { minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  primaryLabel: {
    color: m3.color.onPrimary,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
    textAlign: "center",
  },
  dangerLabel: {
    color: m3.color.onError,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryLabel: {
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
    textAlign: "center",
  },
});
