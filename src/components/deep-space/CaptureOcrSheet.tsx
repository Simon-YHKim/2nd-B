// 메모 OCR popup (Simon 2026-09-30): the picked image on top, a text box with
// what was read below it, then "메모에 넣기" and 닫기.
//
// Presentation only. The host (CaptureView) picks the image, runs the existing
// OCR path (lib/wiki/capture-image.ts ocrImageAsset -> callLlm "capture_ocr")
// and owns every piece of state; the rules live in lib/capture/ocr-sheet.ts.
//
// A bottom sheet on a dithered scrim (PIXEL-CLAY rule 4: no translucent
// scrims), opened from a button in the memo panel, not stacked on a node.
// animationType "none": nothing moves, so reduced motion has nothing to cut.
// Android back and the scrim close it (onRequestClose), per the
// ANDROID_QA_GUIDELINES back-button rule.

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

import { ServiceConsentLink } from "@/components/consent/ServiceConsentLink";
import { MdButton, m3TextStyle } from "@/components/m3";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { PlainText as Text } from "@/components/ui/PlainText";
import type { OcrFailure, OcrSheetPhase } from "@/lib/capture/ocr-sheet";
import { m3 } from "@/lib/theme/m3";

export function CaptureOcrSheet({
  visible,
  imageUri,
  phase,
  text,
  failure,
  insertLabel,
  onChangeText,
  onRetry,
  onRepick,
  onInsert,
  onClose,
}: {
  visible: boolean;
  imageUri: string | null;
  phase: OcrSheetPhase;
  text: string;
  failure: OcrFailure | null;
  /** "메모에 넣기", or the 무엇을 variant when the 4W1H toggle is on. */
  insertLabel: string;
  onChangeText: (next: string) => void;
  onRetry: () => void;
  onRepick: () => void;
  onInsert: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["home", "capture", "consent"]);
  const reading = phase === "reading";
  const canInsert = phase === "ready" && text.trim().length > 0;
  const failureText =
    failure?.kind === "consent"
      ? t(`consent:serviceControl.${failure.code}`)
      : failure?.kind === "message"
        ? t(`capture:alerts.${failure.copy}.message`)
        : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("ds.capture.ocrClose")}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <PixelScrim />
          </View>
        </Pressable>
        <View style={styles.sheet} accessibilityViewIsModal>
          <PixelSurface variant="bevel" contentStyle={styles.sheetContent}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[m3TextStyle("titleMedium"), styles.title]}>
                {t("ds.capture.ocrTitle")}
              </Text>
              <PixelPressable
                variant="frame"
                onPress={onClose}
                accessibilityLabel={t("ds.capture.ocrClose")}
                rootStyle={styles.closeRoot}
                contentStyle={styles.closeContent}
              >
                <PixelGlyph name="close" color={m3.color.primary} size={20} />
              </PixelPressable>
            </View>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.imageFrame}>
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.image}
                    contentFit="contain"
                    cachePolicy="memory"
                    accessibilityLabel={t("ds.capture.ocrImage")}
                  />
                ) : null}
              </View>
              <Text style={[m3TextStyle("labelLarge"), styles.label]}>{t("ds.capture.ocrResult")}</Text>
              <View>
                <TextInput
                  value={text}
                  onChangeText={onChangeText}
                  editable={!reading}
                  multiline
                  textAlignVertical="top"
                  placeholder={reading ? t("ds.capture.ocrReading") : t("ds.capture.ocrResultHint")}
                  placeholderTextColor={m3.color.onSurfaceVariant}
                  style={styles.textBox}
                  accessibilityLabel={t("ds.capture.ocrResult")}
                  accessibilityState={{ busy: reading, disabled: reading }}
                />
                {reading ? (
                  <View pointerEvents="none" style={styles.readingBadge}>
                    <ActivityIndicator color={m3.color.primary} />
                  </View>
                ) : null}
              </View>
              {failureText ? (
                <Text
                  style={[m3TextStyle("bodyMedium"), styles.error]}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  {failureText}
                </Text>
              ) : null}
              {failure?.kind === "consent" ? <ServiceConsentLink /> : null}
              {failure?.kind === "message" ? (
                <View style={styles.row}>
                  {failure.retry ? (
                    <MdButton
                      variant="outlined"
                      label={t("ds.capture.ocrRetry")}
                      onPress={onRetry}
                      style={styles.rowButton}
                    />
                  ) : null}
                  <MdButton
                    variant="outlined"
                    label={t("ds.capture.ocrRepick")}
                    onPress={onRepick}
                    style={styles.rowButton}
                  />
                </View>
              ) : null}
            </ScrollView>
            <View style={styles.row}>
              <MdButton
                variant="text"
                label={t("ds.capture.ocrClose")}
                onPress={onClose}
                style={styles.rowButton}
              />
              <MdButton
                variant="filled"
                label={insertLabel}
                disabled={!canInsert}
                onPress={onInsert}
                style={styles.rowButton}
              />
            </View>
          </PixelSurface>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { width: "100%", maxWidth: 560, alignSelf: "center", maxHeight: "92%" },
  sheetContent: { gap: m3.spacing.s4, padding: m3.spacing.s4, maxHeight: "100%" },
  header: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  title: { flex: 1, color: m3.color.onSurface },
  closeRoot: { width: m3.minTouch, minHeight: m3.minTouch },
  closeContent: { minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { gap: m3.spacing.s3 },
  imageFrame: {
    height: 200,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  image: { width: "100%", height: "100%" },
  label: { color: m3.color.onSurfaceVariant },
  textBox: {
    minHeight: 140,
    maxHeight: 260,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    borderRadius: m3.shape.none,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: m3.color.surfaceContainerHighest,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: 15,
    lineHeight: 22,
  },
  readingBadge: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  error: { color: m3.color.error },
  row: { flexDirection: "row", gap: m3.spacing.s3, justifyContent: "flex-end", flexWrap: "wrap" },
  rowButton: { flexGrow: 1 },
});
