// 앱 밖에서 (rev2 Screen-Spec 37 "widget"): the outside-the-app surface — a
// preview/explainer of the home-screen widgets, lock-screen complication, and
// push notifications, plus real entry points (담기 시연 → /capture, 알림 설정 →
// /settings). Honesty: the widget/lock/notification cards are clearly-labeled
// PREVIEWS of external surfaces, not the user's live data, so no fabricated
// star level or metric is asserted (same real-or-neutral discipline as the
// values/data/career screens). The actual native widget/lock-screen build is a
// separate platform track; this in-app screen clones the reference's
// composition, design, color, and intent.
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import Svg, { Rect } from "react-native-svg";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { SecondbHead } from "@/components/deepspace/SecondbHead";
import { useAuth } from "@/lib/auth/AuthContext";
import { m3 } from "@/lib/theme/m3";
import { flattenAlpha, withAlpha } from "@/lib/theme/tokens";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";

// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
function PlusGlyph({ color, size = 22 }: { color: string; size?: number }) {
  return <PixelGlyph name="add" color={color} size={size} />;
}
function MicGlyph({ color, size = 22 }: { color: string; size?: number }) {
  return <PixelGlyph name="mic" color={color} size={size} />;
}

/**
 * 오늘의 별 발광 — 동심원 셋이었다.
 *
 * 규칙 1(정수 rect)·4(정적 불투명도 금지)를 함께 지키려면 **동심 사각 셋**에
 * 미리 합성한 색을 쓴다. 알파로 겹쳐 만들던 번짐을 색 층으로 바꾼 것이고,
 * 그게 픽셀아트가 발광을 표현하는 방식이다.
 * 바닥은 이 위젯이 앉은 `MdCard variant="filled"` 의 배경색이다.
 */
const STAR_GLOW_GROUND = m3.color.surfaceContainerHighest;
const STAR_GLOW = [
  { inset: 6, fill: flattenAlpha(m3.color.primary, 0.18, STAR_GLOW_GROUND) },
  { inset: 17, fill: flattenAlpha(m3.color.primary, 0.45, STAR_GLOW_GROUND) },
  { inset: 25, fill: m3.color.primary },
];

export default function BeyondScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading } = useAuth();

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const previewTag = t("beyond.preview");

  return (
    <DeepSpaceScreen
      active="account"
      header="none"
      variant="windowed"
      title={t("beyond.title")}
      onBack={() => router.back()}
    >
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <RNText style={[m3TextStyle("headlineSmall"), s.headline]}>{t("beyond.title")}</RNText>
        <RNText style={[m3TextStyle("bodyMedium"), s.lead]}>
          {t("beyond.lead")}
        </RNText>

        {/* ── 홈 화면 위젯 ─────────────────────────────────────────────── */}
        <RNText style={[m3TextStyle("titleSmall"), s.sectionLabel]}>{t("beyond.widgetsSection")}</RNText>
        <View style={s.widgetRow}>
          {/* 오늘의 별 — illustrative preview, no asserted level */}
          <MdCard variant="filled" style={[s.widgetCard, s.starWidget]}>
            <View style={s.widgetHead}>
              <RNText style={s.widgetKicker}>{t("beyond.todaysStar")}</RNText>
              <View style={s.tag}><RNText style={s.tagTxt}>{previewTag}</RNText></View>
            </View>
            <View style={s.starGlowWrap}>
              <Svg width={64} height={64} viewBox="0 0 64 64">
                {STAR_GLOW.map((g) => (
                  <Rect key={g.inset} x={g.inset} y={g.inset} width={64 - g.inset * 2} height={64 - g.inset * 2} fill={g.fill} />
                ))}
              </Svg>
            </View>
            <RNText style={s.widgetStarName}>{t("beyond.brightestStar")}</RNText>
            <RNText style={s.widgetStarSub}>{t("beyond.tapToOpen")}</RNText>
          </MdCard>

          {/* 지금 떠오른 거 담기 — real capture entry */}
          <MdCard variant="filled" style={s.widgetCard}>
            <View style={s.captureHead}>
              <SecondbHead size={26} track={false} />
              <RNText style={s.captureTitle}>{t("beyond.captureTitle")}</RNText>
            </View>
            <View style={s.captureBtns}>
              <Pressable
                style={[s.captureBtn, s.captureBtnPrimary]}
                onPress={() => router.push("/capture")}
                accessibilityRole="button"
                accessibilityLabel={t("beyond.capture")}
              >
                <PlusGlyph color={m3.color.onPrimary} />
              </Pressable>
              <Pressable
                style={[s.captureBtn, s.captureBtnGhost]}
                // med#24: the label promises voice capture — open the composer
                // in the voice recorder pane, not the same plain capture as +.
                onPress={() => router.push({ pathname: "/capture-full", params: { mode: "voice" } })}
                accessibilityRole="button"
                accessibilityLabel={t("beyond.captureByVoice")}
              >
                <MicGlyph color={m3.color.onSurfaceVariant} />
              </Pressable>
            </View>
          </MdCard>
        </View>

        {/* ── 잠금화면 ─────────────────────────────────────────────────── */}
        <RNText style={[m3TextStyle("titleSmall"), s.sectionLabel]}>{t("beyond.lockSection")}</RNText>
        <MdCard variant="outlined" style={s.lockCard}>
          <View style={s.lockTag}><RNText style={s.tagTxt}>{previewTag}</RNText></View>
          <RNText style={s.lockTime}>9:41</RNText>
          <View style={s.notifCard}>
            <SecondbHead size={28} track={false} />
            <View style={s.notifBody}>
              <RNText style={s.notifTitle}>2nd-Brain</RNText>
              <RNText style={s.notifText}>{t("beyond.lockNotif")}</RNText>
            </View>
          </View>
        </MdCard>

        {/* ── 푸시 알림 ────────────────────────────────────────────────── */}
        <RNText style={[m3TextStyle("titleSmall"), s.sectionLabel]}>{t("beyond.pushSection")}</RNText>
        <MdCard variant="filled" style={s.notifPreview}>
          <SecondbHead size={30} track={false} />
          <View style={s.notifBody}>
            <RNText style={s.notifHead}>{t("beyond.pushHead")}</RNText>
            <RNText style={s.notifText}>
              {t("beyond.pushBody")}
            </RNText>
          </View>
          {/* med#25: the widget + lockscreen mocks carry a 미리보기 tag but this
              one didn't — an example notification with no tag reads as real. */}
          <View style={s.lockTag}><RNText style={s.tagTxt}>{previewTag}</RNText></View>
        </MdCard>

        <View style={s.actions}>
          <MdButton
            variant="tonal"
            label={t("beyond.notifSettings")}
            onPress={() => router.push("/settings")}
            style={s.actionBtn}
          />
        </View>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  headline: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  lead: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4, marginBottom: 8 },
  sectionLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 20, marginBottom: 10 },

  widgetRow: { flexDirection: "row", gap: 10 },
  widgetCard: { flex: 1, padding: 14, borderRadius: m3.shape.none, gap: 8 },
  starWidget: { alignItems: "center" },
  widgetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  widgetKicker: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1, color: withAlpha(m3.color.onSurface, 0.8) },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: m3.shape.none, backgroundColor: withAlpha(m3.color.onSurface, 0.1) },
  tagTxt: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 0.6, color: m3.color.onSurfaceVariant },
  starGlowWrap: { alignItems: "center", justifyContent: "center", marginVertical: 4 },
  widgetStarName: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700", fontSize: 15, textAlign: "center" },
  widgetStarSub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, fontSize: 12, textAlign: "center" },

  captureHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  captureTitle: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "600", fontSize: 12 },
  captureBtns: { flexDirection: "row", gap: 8, marginTop: 6 },
  captureBtn: { flex: 1, height: 44, borderRadius: m3.shape.none, alignItems: "center", justifyContent: "center" },
  captureBtnPrimary: { backgroundColor: m3.color.primary },
  captureBtnGhost: { borderWidth: 1, borderColor: m3.color.outlineVariant },

  lockCard: { alignItems: "center", paddingVertical: 20, borderRadius: m3.shape.none, gap: 4 },
  lockTag: { position: "absolute", top: 10, right: 10, paddingHorizontal: 7, paddingVertical: 2, borderRadius: m3.shape.none, backgroundColor: withAlpha(m3.color.onSurface, 0.1) },
  lockTime: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "300", fontSize: 45, letterSpacing: 1 },
  notifCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 12, padding: 12, borderRadius: m3.shape.none, backgroundColor: withAlpha(m3.color.onSurface, 0.06), alignSelf: "stretch" },
  notifBody: { flex: 1, gap: 2 },
  notifTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700", fontSize: 12 },
  notifText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, fontSize: 12, lineHeight: 18 },

  notifPreview: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: m3.shape.none },
  notifHead: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700", fontSize: 12 },

  actions: { marginTop: 20 },
  actionBtn: { alignSelf: "stretch" },
});
