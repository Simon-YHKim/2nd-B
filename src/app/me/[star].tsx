import { PhonePressable as Pressable, PhoneScrollView as ScrollView, PhoneView as View } from "@/components/phone/PhoneUIKit";
// 별 하나의 요약 — 홈에서 별을 누르면 여기로 온다. (Simon 결정 4 = B)
//
// *"그 별의 요약 → 거기서 인터뷰"*. 바로 대화를 열지 않는 이유는, 지금까지 뭘
// 했는지 볼 자리가 없으면 사용자가 **매번 처음부터 시작하는 기분**이 되기 때문이다.
// 그리고 화면 하나에 메시지 하나라는 규율과도 맞는다 -- 여기는 "이 별은 지금
// 이만큼"이고, 대화는 다음 화면이다.
//
// ⚠ 지어내지 않는다. 기록이 없으면 "아직 없다"고 말하고 끝낸다. 추정치를 만들어
// 보여주는 것이 이 저장소가 반복해서 걸렸던 병이다.
//
// 아직 살지 않은 시기(스물다섯 살의 "30대 이후")는 **잠긴다.** 살지 않은 때를
// 물어보는 것은 지어내라는 말이다.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, useFocusEffect } from "expo-router";
import Svg from "react-native-svg";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { DEFAULT_AVATAR_SPEC, type AvatarSpec } from "@/lib/avatar";
import { countFilledDetails, PROFILE_DETAIL_FIELDS, profileChoiceLabelKey, type ProfileDetails } from "@/lib/persona/profile-details";
import { fetchAvatarSpec } from "@/lib/supabase/avatar-spec";
import { fetchDisplayName } from "@/lib/supabase/display-name";
import { loadProfileIdentity } from "@/screens/deepspace/dds-profile-identity";
import { fetchProfileDetails } from "@/lib/supabase/profile-details";
import { fetchStatusMessage } from "@/lib/supabase/status-message";
import { getSupabaseClient } from "@/lib/supabase/client";
import { m3 } from "@/lib/theme/m3";
import { spacing } from "@/lib/theme/tokens";
import {
  getSevenStar,
  isSevenStarId,
  isUnlived,
  type SevenStarId,
} from "@/lib/persona/seven-stars";
import { loadCoverage } from "@/lib/interview/coverage-store";
import {
  DRILL_LAYERS,
  type DrillLayer,
  type LifePeriod,
} from "@/lib/interview/probe";
import { coveredDrillLayers, meStarStaticParams } from "@/lib/nav/me-star-route";
import { RedirectHome } from "@/lib/nav/go-home";
import { useAppRouter, useScreenParams } from "@/lib/nav/phone-embed";
import { a11yValue } from "@/lib/a11y/accessibility-value";
import { loadSevenLevels } from "@/lib/persona/load-seven-levels";
import { starEntryStatus, type StarEntryStatus } from "@/lib/persona/star-entry-tracks";

interface Summary {
  /** 이 별에서 판 칸 수 (0~5). 인터뷰가 없는 별은 null. */
  cells: number | null;
  /** 이 별과 연결된 기록 수. */
  records: number;
  /** 실제 답변이 있어 켜진 드릴 층. */
  covered: DrillLayer[];
}

async function loadSummary(userId: string, period: LifePeriod | null): Promise<Summary> {
  if (period === null) return { cells: null, records: 0, covered: [] };
  let cells = 0;
  let covered: DrillLayer[] = [];
  try {
    const cov = await loadCoverage(userId);
    covered = coveredDrillLayers(cov[period]);
    cells = covered.length;
  } catch {
    cells = 0;
    covered = [];
  }
  let records = 0;
  try {
    const { count } = await getSupabaseClient()
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("audit_period", period);
    records = count ?? 0;
  } catch {
    records = 0;
  }
  return { cells, records, covered };
}

// 프로필 별은 설명 대신 그 사람의 프로필을 바로 보여준다(Simon 2026-10-06):
// 아바타 · 이름 · 요약 한 줄, 그리고 버튼 하나(채운 칸이 없으면 설정, 있으면 수정).
// 이름과 생활 정보는 "있다/없다"를 가르는 근거라 읽기 실패를 빈 값으로 바꾸지 않는다
// (실패면 설정/수정을 고르지 않고 중립 라벨로 연다). 아바타는 그림일 뿐이라 못 읽으면
// 기본 아바타로 그린다.
type ProfileCard =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; name: string | null; statusMessage: string | null; details: ProfileDetails; avatar: AvatarSpec | null };

async function loadProfileCard(userId: string): Promise<ProfileCard> {
  try {
    const [name, details, avatar, statusMessage] = await Promise.all([
      fetchDisplayName(userId),
      fetchProfileDetails(userId),
      fetchAvatarSpec(userId).catch(() => null),
      fetchStatusMessage(userId).catch(() => null),
    ]);
    // 저장된 이름이 없으면 /profile 과 같은 이름(로그인 이메일 앞부분)을 보여 준다(2026-10-07).
    const shown = name?.trim() ? name : await loadProfileIdentity(userId).catch(() => null);
    return { status: "ready", name: shown, statusMessage, details, avatar };
  } catch {
    return { status: "error" };
  }
}

export default function StarSummaryRoute() {
  // Phone-aware: inside the dashboard phone, the interview opens in the phone,
  // back steps the phone, and `star` comes from the phone route (/me/now).
  const router = useAppRouter();
  const { t } = useTranslation(["home", "deepspace", "profile"]);
  const { star } = useScreenParams<{ star?: string }>();
  const { userId, loading, age } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entry, setEntry] = useState<StarEntryStatus | null>(null);
  const [profile, setProfile] = useState<ProfileCard>({ status: "loading" });
  // 아바타는 아래 요약 상자와 같은 폭으로 그린다(Simon 2026-10-07). 폭은 재야 안다.
  const [avatarWidth, setAvatarWidth] = useState(0);

  const id: SevenStarId | null =
    typeof star === "string" && isSevenStarId(star) ? star : null;
  const meta = id ? getSevenStar(id) : null;
  const locked = id ? isUnlived(id, age) : false;

  const load = useCallback(async () => {
    if (!userId || !meta) return;
    const [nextSummary, { starLevels }] = await Promise.all([
      loadSummary(userId, meta.period),
      loadSevenLevels(userId),
    ]);
    setSummary(nextSummary);
    setEntry(starEntryStatus(meta.id, starLevels, age));
  }, [userId, meta, age]);

  useEffect(() => {
    void load();
  }, [load]);

  // 프로필 별만. 수정 화면에서 돌아올 때도 다시 읽어 방금 고친 내용이 보이게 한다.
  const isProfileStar = meta?.period === null;
  useFocusEffect(useCallback(() => {
    if (!userId || !isProfileStar) return;
    let live = true;
    setProfile({ status: "loading" });
    void loadProfileCard(userId).then((next) => { if (live) setProfile(next); });
    return () => { live = false; };
  }, [userId, isProfileStar]));

  if (loading) return <PremiumLoadingState />;
  if (!userId) return <Redirect href="/sign-in" />;
  // 모르는 별 이름이면 홈으로. 옛 링크가 남아 있을 수 있다. 아래에 있는 홈으로
  // 돌아간다 - 새 홈을 쌓지 않는다(QA 261004 D-01).
  if (!id || !meta) return <RedirectHome />;

  const name = t(`ds.star.${meta.key}`);
  const range = meta.ageBand
    ? meta.ageBand.to === null
      ? t("ds.audit.rangeFrom", { from: meta.ageBand.from })
      : meta.ageBand.from === 0
        ? t("ds.audit.rangeUnder", { to: meta.ageBand.to + 1 })
        : t("ds.audit.rangeSpan", { from: meta.ageBand.from, to: meta.ageBand.to })
    : "";
  const profileName = profile.status === "ready" ? profile.name?.trim() : "";
  // 채운 칸 전부. 상자는 다섯 줄 높이에서 멈추고 그 안에서 스크롤한다 - 말줄임으로 자르지 않는다.
  const profileParts = profile.status === "ready" ? PROFILE_DETAIL_FIELDS.flatMap((field) => {
    const value = profile.details[field.key]?.trim();
    if (!value || value === "undisclosed") return [];
    return [{ key: field.key, value: field.kind === "choice" ? t(`deepspace:profileDetails.${profileChoiceLabelKey(field.key, value)}`) : value }];
  }) : [];
  // 요약은 한 줄에 한 조각, 최대 세 줄. 읽기 실패면 아무것도 쓰지 않는다.
  const profileLines = profile.status === "loading"
    ? [t("ds.star.loading")]
    : profile.status === "error"
      ? []
      : profileParts.length > 0
        ? profileParts.map((part) => part.value)
        : [t("ds.star.profileEmpty")];
  const profileCta = profile.status === "ready"
    ? t(countFilledDetails(profile.details) > 0 ? "ds.star.editProfile" : "ds.star.setupProfile")
    : t("ds.star.openProfile");

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={name} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.body}>
        {/* 레퍼런스는 별 이름 위에 화면 이름을 둔다 — 어느 별에 있든 "여기가 요약
            자리"라는 것이 먼저 읽혀야 하기 때문이다(design/pixel_clay_260825
            captures/me-star.png). */}
        {isProfileStar ? (
          // 프로필 별(Simon 2026-10-07): 왼쪽 위 제목, 오른쪽 위 연필(설정/수정),
          // 첫째 줄 큰 아바타, 둘째 줄 요약 세 줄.
          <>
            <View style={styles.profileHeader}>
              <Text style={[m3TextStyle("headlineSmall"), styles.title, styles.profileTitle]}>{name}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={profileCta}
                onPress={() => router.push("/profile-details")}
                style={styles.editButton}
              >
                <PixelGlyph name="edit" size={24} color={m3.color.primary} />
              </Pressable>
            </View>
            <View
              style={styles.profileAvatarRow}
              onLayout={({ nativeEvent }) => {
                const next = Math.min(208, Math.floor(nativeEvent.layout.width));
                setAvatarWidth((current) => (current === next ? current : next));
              }}
            >
              {avatarWidth > 0 ? (
                <AvatarPreview spec={profile.status === "ready" ? profile.avatar ?? DEFAULT_AVATAR_SPEC : DEFAULT_AVATAR_SPEC} size={avatarWidth} />
              ) : null}
              {profileName ? <Text style={[m3TextStyle("titleMedium"), styles.title]}>{profileName}</Text> : null}
              {profile.status === "ready" && profile.statusMessage ? <Text style={[m3TextStyle("bodyMedium"), styles.profileStatus]}>{profile.statusMessage}</Text> : null}
            </View>
            {profileLines.length > 0 ? (
              <MdCard variant="outlined" style={styles.card}>
                <ScrollView style={styles.profileSummary} nestedScrollEnabled showsVerticalScrollIndicator>
                  {profileLines.map((line, index) => (
                    <View key={index} style={styles.profileFact}>
                      {profileParts[index] ? <Text style={[m3TextStyle("bodySmall"), styles.factLabel]}>{t(`deepspace:profileDetails.${profileParts[index].key}Label`)}</Text> : null}
                      <Text style={[m3TextStyle("bodyLarge"), profileParts.length > 0 ? styles.factValue : styles.muted]}>{line}</Text>
                    </View>
                  ))}
                </ScrollView>
              </MdCard>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => router.push("/profile-import")} style={styles.importRow}>
              <PixelGlyph name="add" size={24} color={m3.color.primary} />
              <View style={styles.heroCopy}>
                <Text style={[m3TextStyle("titleSmall"), styles.title]}>{t("profile:contextImport.title")}</Text>
                <Text style={[m3TextStyle("bodySmall"), styles.muted]}>{t("profile:contextImport.subtitle")}</Text>
              </View>
              <PixelGlyph name="chevron_right" size={20} color={m3.color.primary} />
            </Pressable>
            <MdButton label={t("profile:contextImport.history")} variant="text" onPress={() => router.push({ pathname: "/profile-import", params: { mode: "history" } })} />
          </>
        ) : (
          <>
            <Text style={[m3TextStyle("labelMedium"), styles.pageLabel]}>{t("ds.star.pageLabel")}</Text>
            <View style={styles.hero}>
              <Svg width={52} height={52} viewBox="0 0 52 52">
                <PixelStarSvg cx={26} cy={26} r={12} fill={m3.color.primary} />
              </Svg>
              <View style={styles.heroCopy}>
                <Text style={[m3TextStyle("headlineSmall"), styles.title]}>{name}</Text>
                {range.length > 0 ? (
                  <Text style={[m3TextStyle("bodyMedium"), styles.range]}>{range}</Text>
                ) : null}
              </View>
            </View>
          </>
        )}

        {locked ? (
          // 아직 오지 않은 시기. 들어가지 못하게 하고 이유를 말한다.
          <MdCard variant="outlined" style={styles.card}>
            <Text style={[m3TextStyle("bodyMedium"), styles.muted]}>{t("ds.star.lockedBody")}</Text>
          </MdCard>
        ) : meta.period === null ? (
          // 프로필 — 인터뷰가 아니라 항목을 채우는 자리다. 수정은 위 연필이 한다. 아직 아무것도
          // 채우지 않았으면 설정 버튼을 한 번 더 크게 둔다(Simon 2026-10-06 "없으면 설정").
          profile.status === "ready" && countFilledDetails(profile.details) === 0 ? (
            <MdButton
              label={t("ds.star.setupProfile")}
              variant="filled"
              onPress={() => router.push("/profile-details")}
              style={styles.cta}
            />
          ) : null
        ) : (
          <>
            {entry?.kind === "previous" ? (
              <MdCard variant="outlined" style={styles.card}>
                <Text style={[m3TextStyle("bodyMedium"), styles.muted]}>
                  {t("ds.home.star.entryAfter", { star: t(`ds.star.${entry.prerequisite}`) })}
                </Text>
              </MdCard>
            ) : null}
            <MdCard variant="outlined" style={styles.card}>
              {summary === null ? (
                <Text style={[m3TextStyle("bodyMedium"), styles.muted]}>{t("ds.star.loading")}</Text>
              ) : summary.cells === 0 && summary.records === 0 ? (
                // 지어내지 않는다. 없으면 없다고 한다.
                <Text style={[m3TextStyle("bodyMedium"), styles.muted]}>{t("ds.star.emptyBody")}</Text>
              ) : (
                <>
                  {/* 밝기의 규칙을 숫자 옆에 붙여 말한다. 이 한 줄이 없으면 "3/5"
                      가 점수처럼 읽히는데, 이 앱에서 밝기는 평가가 아니라 판 양이다. */}
                  <Text style={[m3TextStyle("bodyMedium"), styles.line]}>
                    {t("ds.star.meter", { n: summary.cells ?? 0, total: DRILL_LAYERS.length })}
                  </Text>
                  <Text style={[m3TextStyle("bodySmall"), styles.muted]}>
                    {t("ds.star.dug", { n: summary.cells ?? 0, total: DRILL_LAYERS.length })}
                  </Text>
                  <View
                    style={styles.gauge}
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel={t("ds.star.meter", {
                      n: summary.covered.length,
                      total: DRILL_LAYERS.length,
                    })}
                    {...a11yValue({
                      min: 0,
                      max: DRILL_LAYERS.length,
                      now: summary.covered.length,
                      text: t("ds.star.dug", {
                        n: summary.covered.length,
                        total: DRILL_LAYERS.length,
                      }),
                    })}
                  >
                    {DRILL_LAYERS.map((layer) => {
                      const isCovered = summary.covered.includes(layer);
                      return (
                        <View key={layer} style={styles.gaugeItem}>
                          <View
                            style={[
                              styles.gaugeSegment,
                              isCovered ? styles.gaugeSegmentOn : styles.gaugeSegmentOff,
                            ]}
                          />
                          <Text
                            style={[
                              m3TextStyle("labelSmall"),
                              isCovered ? styles.layerOn : styles.layerOff,
                            ]}
                          >
                            {/* Layer name only. The interview's "L1 · Fact" labels put an
                                L number on each cell, and in this app L1~L5 is the
                                brightness ladder: a fifth covered cell read as "L5"
                                while coverage tops out at L4 (QA 261004 W-08/D-10). */}
                            {t(`ds.star.layer.${layer}`)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={[m3TextStyle("labelSmall"), styles.sectionLabel]}>
                    {t("ds.star.recordsLabel")}
                  </Text>
                  <Text style={[m3TextStyle("bodySmall"), styles.muted]}>
                    {t("ds.star.records", { count: summary.records })}
                  </Text>
                </>
              )}
            </MdCard>

            {entry?.kind !== "previous" ? (
              <MdButton
                label={summary && (summary.cells ?? 0) > 0 ? t("ds.star.continue") : t("ds.star.start")}
                variant="filled"
                disabled={entry === null}
                onPress={() =>
                  router.push({ pathname: "/interview", params: { period: meta.period ?? "now" } })
                }
                style={styles.cta}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.sm },
  pageLabel: { color: m3.color.onSurfaceVariant, marginBottom: spacing.xs },
  sectionLabel: { color: m3.color.onSurfaceVariant, marginTop: spacing.sm },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  profileTitle: { flex: 1 },
  editButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  profileAvatarRow: { alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  profileStatus: { color: m3.color.onSurfaceVariant, textAlign: "center", maxWidth: 360 },
  profileFact: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  factLabel: { color: m3.color.onSurfaceVariant, width: 90 },
  factValue: { color: m3.color.onSurface, flex: 1 },
  importRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: m3.color.outlineVariant, backgroundColor: m3.color.surfaceContainerLow, minHeight: 76 },
  // 다섯 줄(bodyLarge 줄 높이 x 5)을 넘으면 상자 안에서 스크롤한다.
  profileSummary: { maxHeight: m3.type.bodyLarge.line * 5 },
  heroCopy: { flex: 1 },
  title: { color: m3.color.onSurface },
  range: { color: m3.color.onSurfaceVariant, marginBottom: spacing.sm },
  card: { marginTop: spacing.sm },
  line: { color: m3.color.onSurface },
  muted: { color: m3.color.onSurfaceVariant },
  gauge: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.md },
  gaugeItem: { flex: 1, gap: spacing.xs },
  gaugeSegment: { height: 18, borderWidth: 1, borderRadius: m3.shape.none },
  gaugeSegmentOn: { backgroundColor: m3.color.primary, borderColor: m3.color.primary },
  gaugeSegmentOff: {
    backgroundColor: m3.color.surfaceContainerHighest,
    borderColor: m3.color.outlineVariant,
  },
  layerOn: { color: m3.color.onSurface },
  layerOff: { color: m3.color.onSurfaceVariant },
  cta: { marginTop: spacing.lg },
});

/** GitHub Pages 정적 export에서도 `/me/<star>` direct hit가 404가 되지 않게 한다. */
export function generateStaticParams(): { star: string }[] {
  return meStarStaticParams();
}
