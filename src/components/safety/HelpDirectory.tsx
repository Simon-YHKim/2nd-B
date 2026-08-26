// Always-on help directory (Simon 2026-08-16, L1 + L2).
//
// This exists because the classifier-driven version was rejected, and the reason
// is the whole design. A harm-detection lexicon was drafted, attacked twice, and
// failed both times: the Korean matcher has no word boundaries, so "많이 맞" also
// matches "해풍 맞고 자란 시금치" and "집에 가기가 무서" also matches "성적표 나오는
// 날이라 집에 가기가 무서워 ㅋㅋ". Strip every false positive and what survives is
// vocabulary only someone already able to name their situation would type.
//
// A list the user opens on purpose has a false-positive rate of zero. It reaches
// fewer people than a working classifier would, and it reaches them without ever
// telling a teenager writing a joke that the app thinks something is wrong. Given
// the choice between those two failure modes, this one does not make anybody stop
// writing.
//
// Rules this screen keeps:
//  - Nothing here is triggered. It is always present, identical for every account.
//  - No clinical vocabulary (CI-enforced elsewhere; the labels here are checked
//    by hotline-lane-separation.test.ts because lexicon.ts is scan-exempt).
//  - "신고" is never the first word. The frame is "somewhere you can get help".
//  - Numbers are KR-specific, so they render only for the KR-facing locale.
import { View, StyleSheet, Pressable, Linking } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { HOTLINES, type HotlineId } from "@/lib/safety/lexicon";
import { semantic, spacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

/**
 * Order is deliberate: counselling first, emergency last. Someone scanning this
 * list under stress reads the top item, and the top item should be a
 * conversation rather than a dispatch.
 */
const ROWS: { id: HotlineId; whenKey: string }[] = [
  { id: "KR_1388", whenKey: "when1388" },
  { id: "KR_109", whenKey: "when109" },
  { id: "KR_117", whenKey: "when117" },
  { id: "KR_1366", whenKey: "when1366" },
  { id: "KR_119", whenKey: "when119" },
  { id: "KR_112", whenKey: "when112" },
];

export function HelpDirectory() {
  const { t, i18n } = useTranslation("support");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;

  // These are Korean numbers. Showing them to someone in another country would
  // hand them a line that does not answer, which is worse than showing nothing.
  if (!ko) return null;

  const call = (number: string) => {
    void Linking.openURL(`tel:${number.replace(/\D/g, "")}`).catch(() => {
      // Web with no tel: handler. The number is on screen either way, which is
      // the part that matters.
    });
  };

  return (
    <View style={styles.wrap}>
      <Text variant="caption" color="textSubtle" style={styles.head}>
        {t("help.title")}
      </Text>
      <Text variant="caption" color="textSubtle" style={styles.lead}>
        {t("help.lead")}
      </Text>

      {ROWS.map((row, i) => {
        const h = HOTLINES[row.id];
        return (
          <Pressable
            key={row.id}
            onPress={() => call(h.number)}
            style={[styles.row, i < ROWS.length - 1 && styles.rowDivider]}
            accessibilityRole="button"
            accessibilityLabel={`${h.label} ${h.number}`}
            accessibilityHint={t("help.callHint")}
          >
            <View style={styles.rowText}>
              <Text variant="body" color="text">{h.label}</Text>
              <Text variant="caption" color="textSubtle" style={styles.when}>
                {t(`help.${row.whenKey}`)}
              </Text>
            </View>
            <Text variant="body" color="brand" style={styles.number}>{h.number}</Text>
          </Pressable>
        );
      })}

      <Text variant="caption" color="textSubtle" style={styles.foot}>
        {t("help.foot")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: semantic.border,
    // PIXEL-CLAY 절대 규칙 2 — 라운드 0. 화면 실측에서 40개 라우트를 통틀어
    // **둥근 모서리가 여기 하나만** 남아 있었다(`/support`). 이 컴포넌트가
    // 이식 목록 밖(`components/safety/*`)이라 소스 가드가 못 봤다.
    borderRadius: m3.shape.none,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  head: { marginBottom: spacing.xs },
  lead: { marginBottom: spacing.sm, lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: semantic.border },
  rowText: { flex: 1 },
  when: { marginTop: 2, lineHeight: 16 },
  number: { fontVariant: ["tabular-nums"] },
  foot: { marginTop: spacing.sm, lineHeight: 18 },
});
