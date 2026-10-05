import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { PlainText as Text } from "@/components/ui/PlainText";
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

  function close(): void {
    setOpen(false);
  }

  function select(next: ResidenceCountrySelection): void {
    onChange(next);
    close();
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
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          {/* 스크림은 Pressable 이 아니라 응답자 View 다(PixelTimeSheet 와 같은 이유). RN-web 은
              Pressable 에 늘 tabIndex 0 을 주고 Modal 의 포커스 트랩이 첫 요소에 포커스를
              넣는다. 같은 구조였던 PixelTimeSheet 에서 이름 없는 전체 화면 칸이 첫 포커스를
              받고 Enter 한 번에 닫혔다(리뷰 실측). 이 View 는 탭 정지가 아니다.
              시트는 스크림의 자식이 아니라 형제라서 시트 안을 눌러도 닫히지 않는다. */}
          <View
            accessible={false}
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onResponderRelease={close}
          >
            <PixelScrim style={styles.scrimImage} />
          </View>
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            style={styles.dialog}
          >
            {/* 높이 상한은 dialog 의 maxHeight 하나다. shrink 가 그 상한을 PixelSurface 의
                면과 안쪽까지 넘겨서 목록만 줄어들고 스크롤된다. 머리줄과 '목록에 없어요'는
                줄지 않아 늘 보인다(R2C-03: 웹에서 면이 내용 높이로 자라 49개국이 화면 밖). */}
            <PixelSurface
              variant="bevel"
              shrink
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
                  onPress={close}
                  accessibilityLabel={t("residenceCountry.close")}
                  rootStyle={styles.closeRoot}
                  contentStyle={styles.closeContent}
                >
                  <PixelGlyph name="close" color={m3.color.primary} size={20} />
                </PixelPressable>
              </View>

              {/* 63행으로 닫힌 목록이라 처음부터 전부 그린다. initialNumToRender 안의 행은
                  창 밖으로 나가도 내려지지 않으므로 Tab 과 스크린 리더가 어느 나라에든 닿는다. */}
              <FlatList
                data={options}
                renderItem={renderOption}
                keyExtractor={(item) => item.code}
                initialNumToRender={options.length}
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
          </View>
        </View>
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
  // PixelTimeSheet 와 같은 크기 지정. 디더는 absoluteFill 만 주면 웹에서
  // 4x4 타일에 머물러 뒤 화면이 어두워지지 않는다.
  scrimImage: { width: "100%", height: "100%" },
  // 상한은 여기 하나다. 아래 층은 퍼센트를 잇지 않고 flexShrink 로 이 상한 안에 들어간다.
  dialog: { width: "100%", maxWidth: 520, maxHeight: "92%", zIndex: 301 },
  dialogSurface: { alignSelf: "stretch", flexShrink: 1, minHeight: 0 },
  dialogContent: { gap: m3.spacing.s3, padding: m3.spacing.s3 },
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
  list: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
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
