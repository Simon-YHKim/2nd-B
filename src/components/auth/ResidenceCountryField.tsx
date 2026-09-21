import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { useTranslation } from "react-i18next";

import { PixelPressable, PixelSurface } from "@/components/pixel";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import {
  residenceCountryName,
  residenceCountryOptions,
  type ResidenceCountryOption,
} from "@/lib/auth/residence-country-options";
import {
  RESIDENCE_COUNTRY_NOT_LISTED,
  RESIDENCE_COUNTRY_NOT_LISTED_MIN_AGE,
  type ResidenceCountrySelection,
} from "@/lib/auth/residence-jurisdiction";
import { m3 } from "@/lib/theme/m3";

export interface ResidenceCountryFieldProps {
  value: ResidenceCountrySelection | null;
  onChange: (value: ResidenceCountrySelection) => void;
  minAge: number;
  disabled?: boolean;
}

export function ResidenceCountryField({
  value,
  onChange,
  minAge,
  disabled = false,
}: ResidenceCountryFieldProps) {
  const { t, i18n } = useTranslation("auth");
  const [open, setOpen] = useState(false);
  const options = useMemo(() => residenceCountryOptions(i18n.language), [i18n.language]);
  const selectedLabel =
    value === RESIDENCE_COUNTRY_NOT_LISTED
      ? t("residenceCountry.notListed")
      : value
        ? residenceCountryName(value, i18n.language)
        : null;

  function select(next: ResidenceCountrySelection): void {
    onChange(next);
    setOpen(false);
  }

  function renderOption({ item }: ListRenderItemInfo<ResidenceCountryOption>) {
    const selected = value === item.code;
    return (
      <PixelPressable
        variant={selected ? "inset" : "frame"}
        onPress={() => select(item.code)}
        accessibilityRole="radio"
        accessibilityLabel={`${item.label}, ${item.code}`}
        accessibilityState={{ selected }}
        fullWidth
        rootStyle={styles.optionRoot}
        contentStyle={styles.optionContent}
      >
        <Text style={[styles.optionLabel, selected && styles.selectedText]}>{item.label}</Text>
        <Text style={styles.countryCode}>{item.code}</Text>
      </PixelPressable>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{t("residenceCountry.label")}</Text>
      <Text style={styles.helper}>{t("residenceCountry.helper")}</Text>
      <PixelPressable
        variant={value ? "inset" : "frame"}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityLabel={t("residenceCountry.label")}
        accessibilityHint={t("residenceCountry.openHint")}
        accessibilityState={{ expanded: open }}
        fullWidth
        contentStyle={styles.triggerContent}
      >
        <Text style={[styles.triggerText, !selectedLabel && styles.placeholder]}>
          {selectedLabel ?? t("residenceCountry.select")}
        </Text>
        <PixelGlyph name="expandMore" color={m3.color.primary} size={24} />
      </PixelPressable>
      <Text
        accessibilityRole={value ? "text" : "alert"}
        style={[styles.helper, !value && styles.required]}
      >
        {value
          ? t("residenceCountry.selected", { country: selectedLabel, minAge })
          : t("residenceCountry.required")}
      </Text>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessible={false}
          style={styles.backdrop}
          onPress={() => setOpen(false)}
        >
          <PixelScrim />
          <Pressable
            accessible={false}
            accessibilityViewIsModal
            style={styles.dialogPressable}
            onPress={(event) => event.stopPropagation()}
          >
            <PixelSurface
              variant="bevel"
              style={styles.dialogSurface}
              contentStyle={styles.dialogContent}
            >
              <View style={styles.dialogHeader}>
                <View style={styles.dialogHeadingCopy}>
                  <Text accessibilityRole="header" style={styles.dialogTitle}>
                    {t("residenceCountry.sheetTitle")}
                  </Text>
                  <Text style={styles.helper}>{t("residenceCountry.sheetHint")}</Text>
                </View>
                <PixelPressable
                  variant="frame"
                  onPress={() => setOpen(false)}
                  accessibilityLabel={t("residenceCountry.close")}
                  rootStyle={styles.closeRoot}
                  contentStyle={styles.closeContent}
                >
                  <PixelGlyph name="close" color={m3.color.primary} size={20} />
                </PixelPressable>
              </View>

              <FlatList
                data={options}
                renderItem={renderOption}
                keyExtractor={(item) => item.code}
                initialNumToRender={14}
                maxToRenderPerBatch={14}
                windowSize={7}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                contentContainerStyle={styles.listContent}
              />

              <PixelPressable
                variant={value === RESIDENCE_COUNTRY_NOT_LISTED ? "inset" : "frame"}
                onPress={() => select(RESIDENCE_COUNTRY_NOT_LISTED)}
                accessibilityRole="radio"
                accessibilityLabel={t("residenceCountry.notListed")}
                accessibilityHint={t("residenceCountry.notListedHint", {
                  minAge: RESIDENCE_COUNTRY_NOT_LISTED_MIN_AGE,
                })}
                accessibilityState={{ selected: value === RESIDENCE_COUNTRY_NOT_LISTED }}
                fullWidth
                contentStyle={styles.notListedContent}
              >
                <Text style={styles.optionLabel}>{t("residenceCountry.notListed")}</Text>
                <Text style={styles.helper}>
                  {t("residenceCountry.notListedHint", {
                    minAge: RESIDENCE_COUNTRY_NOT_LISTED_MIN_AGE,
                  })}
                </Text>
              </PixelPressable>
            </PixelSurface>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: m3.spacing.s2 },
  label: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
  },
  helper: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
  },
  required: { color: m3.color.error },
  triggerContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s3,
  },
  triggerText: {
    flex: 1,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
  },
  placeholder: { color: m3.color.onSurfaceVariant },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: m3.spacing.s3,
  },
  dialogPressable: { width: "100%", maxWidth: 520, maxHeight: "92%" },
  dialogSurface: { alignSelf: "stretch", maxHeight: "100%" },
  dialogContent: { gap: m3.spacing.s3, padding: m3.spacing.s3, maxHeight: "100%" },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: m3.spacing.s2,
  },
  dialogHeadingCopy: { flex: 1, gap: m3.spacing.s1 },
  dialogTitle: {
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.titleLarge.size,
    lineHeight: m3.type.titleLarge.line,
    fontWeight: "700",
  },
  closeRoot: { width: m3.minTouch, minHeight: m3.minTouch },
  closeContent: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    padding: m3.spacing.s2,
  },
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: m3.spacing.s1, paddingBottom: m3.spacing.s1 },
  optionRoot: { alignSelf: "stretch" },
  optionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
  },
  optionLabel: {
    flex: 1,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
  },
  selectedText: { color: m3.color.primary, fontWeight: "700" },
  countryCode: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
  },
  notListedContent: { minHeight: m3.minTouch, gap: m3.spacing.s1 },
});
