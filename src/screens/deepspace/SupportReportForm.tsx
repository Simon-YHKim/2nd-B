import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import { PhonePressable as Pressable, PhoneScrollView as ScrollView, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import { captureLiveOwnerCheck } from "@/lib/auth/live-owner-guard";
import { appVersion } from "@/lib/build-info";
import { renderedUiLanguage } from "@/lib/i18n/ui-language";
import { useHardwareBack } from "@/lib/nav/phone-embed";
import { KeyboardAvoidingArea, useKeyboard } from "@/lib/ui/keyboard";
import { semantic, spacing } from "@/lib/theme/tokens";
import { createReportSender, inAppReportsEnabled, REPORT_MAX_LENGTH, type ReportKind, type ReportState } from "@/lib/support/report";
import { submitSupportReport } from "@/lib/support/report-rpc";

export function SupportReportForm({ kind, onBack }: { kind: ReportKind; onBack: () => void }) {
  const { userId } = useAuth();
  // A changed account gets a fresh form and fresh owner fence, never A's text.
  return userId ? <OwnedReportForm key={userId} ownerId={userId} kind={kind} onBack={onBack} /> : null;
}

function OwnedReportForm({ ownerId, kind, onBack }: { ownerId: string; kind: ReportKind; onBack: () => void }) {
  const { t, i18n } = useTranslation("support");
  const [body, setBody] = useState("");
  const [consent, setConsent] = useState(false);
  const [details, setDetails] = useState(false);
  const [state, setState] = useState<ReportState>({ phase: "editing" });
  const keyboardHeight = useKeyboard();
  const [metadata] = useState(() => ({ app_version: appVersion() ?? "unknown", screen_path: "/support" as const, locale: renderedUiLanguage(i18n) }));
  const senderRef = useRef<ReturnType<typeof createReportSender> | null>(null);
  useEffect(() => {
    const assertOwner = captureLiveOwnerCheck(ownerId);
    const sender = createReportSender({
      enabled: inAppReportsEnabled, assertOwner, uuid: Crypto.randomUUID,
      online: async () => {
        const network = await Network.getNetworkStateAsync();
        return network.isConnected !== false && network.isInternetReachable !== false;
      },
      send: (request, signal) => submitSupportReport(request, signal, assertOwner),
      changed: setState,
    });
    senderRef.current = sender;
    return () => { sender.dispose(); senderRef.current = null; };
  }, [ownerId]);
  useHardwareBack(useCallback(() => { onBack(); return true; }, [onBack]));
  const busy = state.phase === "sending";
  const locked = busy || senderRef.current?.locked === true;
  const submit = () => {
    const sender = senderRef.current;
    if (sender) void sender.submit(body, consent, kind, metadata);
  };
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={t(kind === "bug" ? "report.bugTitle" : "report.inquiryTitle")} onBack={onBack}>
      <KeyboardAvoidingArea style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + keyboardHeight }]}>
          {state.phase === "sent" ? <>
            <Text accessibilityLiveRegion="polite">{t("report.sent")}</Text>
            <Text selectable>{t("report.receipt", { receipt: state.receipt })}</Text>
            <Button label={t("report.done")} onPress={onBack} />
          </> : <>
            <Text>{t("report.body")}</Text>
            <Input multiline value={body} onChangeText={setBody} maxLength={REPORT_MAX_LENGTH} editable={!locked}
              accessibilityLabel={t("report.body")} placeholder={t("report.placeholder")} style={styles.input} />
            <Text variant="caption">{body.length} / {REPORT_MAX_LENGTH}</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={styles.row}>
              <Text>{t("report.details")} {details ? "⌄" : "›"}</Text>
            </Pressable>
            {details ? <View style={styles.details}>
              <Text>{t("report.scope")}</Text>
              <Text>{t("report.retention")}</Text>
              <Text>{t("report.optional")}</Text>
              <Text>{t("report.metadata", { version: metadata.app_version, path: metadata.screen_path, locale: metadata.locale })}</Text>
            </View> : null}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled: locked }} disabled={locked}
              onPress={() => setConsent(!consent)} style={styles.row}>
              <Text>{consent ? "☑" : "☐"} {t("report.consent")}</Text>
            </Pressable>
            {state.phase === "failed" ? <Text accessibilityLiveRegion="polite">{t(`report.${state.reason}`)}</Text> : null}
            <Button label={t(busy ? "report.sending" : state.phase === "failed" ? "report.retry" : "report.send")}
              disabled={busy || !consent || !body.trim()} onPress={submit} />
          </>}
        </ScrollView>
      </KeyboardAvoidingArea>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  input: { minHeight: 160 },
  row: { minHeight: 48, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: semantic.border },
  details: { gap: spacing.sm },
});
