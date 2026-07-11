// Pre-account capture (D-17 / D-25 Phase 2). A first-time visitor can jot a line
// BEFORE making an account; it is held device-local (no server, no LLM) via the
// preauth-pending queue and imported after sign-up. Honest copy makes the
// "this device, temporary" state explicit, and an honest near-full nudge replaces
// silent data loss. Lives in the (auth) group, which has no auth guard, so it is
// reachable unauthenticated. createRecord / Supabase are never touched here.

import { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { deepSpace, deepSpaceSpacing, deepSpaceRadii } from "@/lib/theme/tokens";
import {
  addPendingCapture,
  loadPendingCaptures,
  pendingStatus,
  PREAUTH_PENDING_MAX_CHARS,
  type PendingCapture,
} from "@/lib/capture/preauth-pending";

export default function Jot() {
  const { t } = useTranslation("capture");
  const [text, setText] = useState("");
  const kbHeight = useKeyboard();
  const [items, setItems] = useState<PendingCapture[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setItems(await loadPendingCaptures());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const status = pendingStatus(items.length);

  const onSave = useCallback(async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || saving) return;
    setSaving(true);
    try {
      const r = await addPendingCapture(trimmed);
      if (r.ok) setText("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [text, saving, refresh]);

  const canSave = text.trim().length > 0 && !status.full && !saving;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.body,
            Platform.OS === "android" && {
              paddingBottom: Math.max(deepSpaceSpacing.lg, kbHeight + 24),
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <SecondbHead size={48} mood="neutral" />
            <View style={styles.flex}>
              <Text variant="heading">{t("jot.title")}</Text>
              <Text variant="subtle" color="textMuted" style={styles.honest}>
                {t("jot.deviceNote")}
              </Text>
            </View>
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={PREAUTH_PENDING_MAX_CHARS}
            placeholder={t("jot.placeholder")}
            placeholderTextColor={deepSpace.textLo}
            style={styles.input}
            accessibilityLabel={t("jot.inputA11y")}
            editable={!status.full}
          />

          <Pressable
            hitSlop={14}
            onPress={() => void onSave()}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel={t("jot.save")}
            style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
          >
            <Text variant="body" style={styles.saveText}>
              {saving ? t("jot.saving") : t("jot.save")}
            </Text>
          </Pressable>

          {status.nearFull ? (
            <Text variant="subtle" color="textMuted" style={styles.warn} accessibilityRole="alert">
              {t("jot.nearFull")}
            </Text>
          ) : null}

          {items.length > 0 ? (
            <View style={styles.list}>
              <Text variant="caption" color="textSubtle">
                {t("jot.savedOnDevice", { n: items.length })}
              </Text>
              {items.map((it) => (
                <View key={it.localId} style={styles.row}>
                  <Text variant="body" numberOfLines={3}>
                    {it.text}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Pressable
            hitSlop={14}
            onPress={() => router.push("/sign-up")}
            accessibilityRole="button"
            accessibilityLabel={t("jot.createAccount")}
            style={styles.cta}
          >
            <Text variant="body" style={styles.ctaText}>
              {t("jot.createAccount")}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: deepSpace.bg },
  flex: { flex: 1 },
  body: { padding: deepSpaceSpacing.lg, gap: deepSpaceSpacing.md },
  header: { flexDirection: "row", gap: deepSpaceSpacing.sm, alignItems: "flex-start" },
  honest: { marginTop: 4 },
  input: {
    minHeight: 96,
    backgroundColor: deepSpace.card,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.md,
    padding: deepSpaceSpacing.md,
    color: deepSpace.textHi,
    fontSize: 15,
    textAlignVertical: "top",
  },
  saveBtn: {
    minHeight: 48,
    borderRadius: deepSpaceRadii.md,
    backgroundColor: deepSpace.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnOff: { opacity: 0.4 },
  saveText: { color: deepSpace.bg, fontWeight: "700" },
  warn: { marginTop: -4 },
  list: { gap: deepSpaceSpacing.xs },
  row: {
    backgroundColor: deepSpace.card,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.sm,
    padding: deepSpaceSpacing.sm,
  },
  cta: {
    minHeight: 48,
    borderRadius: deepSpaceRadii.md,
    borderWidth: 1,
    borderColor: deepSpace.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: deepSpaceSpacing.sm,
  },
  ctaText: { color: deepSpace.accentSoft, fontWeight: "700" },
});
