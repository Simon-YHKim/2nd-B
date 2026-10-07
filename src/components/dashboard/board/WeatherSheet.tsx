import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ScreenModal } from "@/components/ui/ScreenModal";
import { PixelRoundRect } from "@/components/pixel/PixelRoundRect";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { phoneIos } from "@/lib/theme/phone-ios";
import { IosButton, IosText } from "./IosParts";

/** Consent is explicit; closing/backing out never writes a grant. */
export function WeatherSheet({ mode, busy, failed, onEnable, onClose, onTerms }: {
  mode: "consent" | "settings" | "source" | null; busy: boolean; failed: boolean;
  onEnable: () => void; onClose: () => void; onTerms: () => void;
}) {
  const { t } = useTranslation("ops");
  const openSettings = () => {
    // Browsers have no standard URL for site permissions. Their site-controls
    // panel is described in the short permission sentence; do not invent a URL.
    if (Platform.OS === "web") onClose();
    else void Linking.openSettings().catch(() => undefined);
  };
  return <ScreenModal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.host}>
      <Pressable style={styles.dismiss} accessibilityRole="button" accessibilityLabel={t("phone.board.weather.cancel")} onPress={onClose} />
      <PixelRoundRect fill={phoneIos.cell} style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <IosText variant="body">{t("phone.board.weather.title")}</IosText>
            <Pressable onPress={onClose} style={styles.icon} accessibilityRole="button" accessibilityLabel={t("phone.board.weather.cancel")}>
              <PixelGlyph name="close" size={20} color={phoneIos.blue} />
            </Pressable>
          </View>
          {mode === "source" ? <>
            <IosText variant="body">{t("phone.board.weather.source")}</IosText>
            <IosButton label="MET Norway" onPress={() => void Linking.openURL("https://api.met.no/doc/License").catch(() => undefined)} />
            <IosButton label="CC BY 4.0" onPress={() => void Linking.openURL("https://creativecommons.org/licenses/by/4.0/").catch(() => undefined)} />
          </> : mode === "settings" ? <>
            <IosText variant="body">{t(Platform.OS === "web" ? "phone.board.weather.webSettingsBody" : "phone.board.weather.settingsBody")}</IosText>
            <IosButton label={t(Platform.OS === "web" ? "phone.board.weather.done" : "phone.board.weather.settings")} onPress={openSettings} primary />
          </> : <>
            <IosText variant="body">{t("phone.board.weather.body")}</IosText>
            <IosButton label={t("phone.board.weather.terms")} onPress={onTerms} />
            {failed ? <IosText variant="caption" accessibilityRole="alert">{t("phone.board.weather.failed")}</IosText> : null}
            <View style={styles.buttons}>
              <IosButton label={t("phone.board.weather.cancel")} onPress={onClose} />
              <IosButton label={t("phone.board.weather.enable")} onPress={onEnable} disabled={busy} primary />
            </View>
          </>}
        </ScrollView>
      </PixelRoundRect>
    </View>
  </ScreenModal>;
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: "flex-end" },
  dismiss: { flex: 1 },
  sheet: { maxHeight: "80%", borderRadius: 0, borderWidth: 2, borderColor: phoneIos.separator },
  content: { padding: 20, paddingBottom: 36, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  icon: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
});
