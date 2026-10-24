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
// 2026-10-12 (Simon, Q-261012-57 시안 B): 다섯 층은 세로 사다리 하나로 그린다.
// 머리줄은 프로필 별과 같은 규칙("별 요약" + 큰 글씨 별 이름)이고, 밝기를 설명하던
// 문장 둘과 "지금까지 저장한 내용" 은 화면에서 뺐다. 그 문장들은 낭독 이름으로만
// 남는다 - 그림이 말하게 하고 글로 다시 설명하지 않는다.
//
// 아직 살지 않은 시기(스물다섯 살의 "30대 이후")는 **잠긴다.** 살지 않은 때를
// 물어보는 것은 지어내라는 말이다.
import { useCallback, useRef, useState } from "react";
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
import { m3 } from "@/lib/theme/m3";
import { spacing } from "@/lib/theme/tokens";
import {
  getSevenStar,
  isSevenStarId,
  isUnlived,
  type SevenStarId,
} from "@/lib/persona/seven-stars";
import { DRILL_LAYERS } from "@/lib/interview/probe";
import { starLadderRungs } from "@/lib/interview/star-ladder";
import { meStarStaticParams } from "@/lib/nav/me-star-route";
import { RedirectHome } from "@/lib/nav/go-home";
import { useAppRouter, usePhoneEmbed, useScreenParams } from "@/lib/nav/phone-embed";
import { a11yValue } from "@/lib/a11y/accessibility-value";
import { withTimeout } from "@/lib/async/with-timeout";
import { loadStarSummary, STAR_SUMMARY_TIMEOUT_MS, starSummaryReadErrorKey, type StarSummary } from "@/lib/persona/load-star-summary";

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
  const [name, details, avatar, statusMessage] = await Promise.all([
    fetchDisplayName(userId),
    fetchProfileDetails(userId),
    fetchAvatarSpec(userId).catch(() => null),
    fetchStatusMessage(userId),
  ]);
  // 저장된 이름이 없으면 /profile 과 같은 이름(로그인 이메일 앞부분)을 보여 준다(2026-10-07).
  const shown = name?.trim() ? name : await loadProfileIdentity(userId).catch(() => null);
  return { status: "ready", name: shown, statusMessage, details, avatar };
}

type ReadState =
  | { identity: string; status: "loading" }
  | { identity: string; status: "error"; message: ReturnType<typeof starSummaryReadErrorKey> }
  | { identity: string; status: "ready"; summary: StarSummary | null; profile: ProfileCard | null };

export default function StarSummaryRoute() {
  // Phone-aware: inside the dashboard phone, the interview opens in the phone,
  // back steps the phone, and `star` comes from the phone route (/me/now).
  const router = useAppRouter();
  // Inside the dashboard phone, /records is the phone's own notes page, which does not narrow
  // to a star. There the count stays a plain line, as it was.
  const inPhone = usePhoneEmbed() !== null;
  const { t } = useTranslation(["home", "deepspace", "profile", "common"]);
  const { star } = useScreenParams<{ star?: string }>();
  const { userId, loading, age } = useAuth();
  const [read, setRead] = useState<ReadState>({ identity: "", status: "loading" });
  const [retry, setRetry] = useState(0);
  // 승인한 가져오기 시안의 208px 초상화. 좁은 창에서는 실제 가용 폭을 따른다.
  const [avatarWidth, setAvatarWidth] = useState(0);

  const id: SevenStarId | null =
    typeof star === "string" && isSevenStarId(star) ? star : null;
  const meta = id ? getSevenStar(id) : null;
  const locked = id ? isUnlived(id, age) : false;

  const isProfileStar = meta?.period === null;
  const identity = JSON.stringify([userId, id, age]);
  const activeIdentity = useRef(identity);
  activeIdentity.current = identity;
  const currentRead: ReadState = read.identity === identity ? read : { identity, status: "loading" };
  const summary = currentRead.status === "ready" ? currentRead.summary : null;
  const entry = summary?.entry ?? null;
  const profile: ProfileCard = currentRead.status === "ready" && currentRead.profile
    ? currentRead.profile
    : { status: currentRead.status === "error" ? "error" : "loading" };

  // Returning from an interview/profile edit also rereads. The request belongs to
  // this focus, account, star, age and retry; an older result never paints a new one.
  useFocusEffect(useCallback(() => {
    if (!userId || !meta || locked) return;
    let live = true;
    setRead({ identity, status: "loading" });
    const work = meta.period === null
      ? withTimeout(loadProfileCard(userId), STAR_SUMMARY_TIMEOUT_MS, "Profile summary")
        .then((card) => ({ summary: null, profile: card }))
      : loadStarSummary(userId, meta.id, meta.period, age)
        .then((next) => ({ summary: next, profile: null }));
    void work.then(
      (next) => { if (live && activeIdentity.current === identity) setRead({ identity, status: "ready", ...next }); },
      (error: unknown) => { if (live && activeIdentity.current === identity) setRead({ identity, status: "error", message: starSummaryReadErrorKey(error) }); },
    );
    return () => { live = false; };
  }, [userId, meta, locked, age, identity, retry]));

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
  // 요약은 한 줄에 한 조각. 실패 문장과 재시도는 아래 공용 카드에서 보여준다.
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
  // 사다리는 요약을 읽었으면 늘 그린다. 이야기가 없으면 다섯 줄이 모두 꺼진 채 "0/5층"이다
  // (Simon 2026-10-12, Q-261012-62). 지어내지 않는다: 꺼진 줄이 "아직 없다"를 말한다.
  // 앞의 별을 기다리는 빈 별은 시작할 수 없으니 그 이유 한 줄만 보인다(아직 오지 않은 시기와 같은 모양).
  const waitingEmpty = entry?.kind === "previous" && summary !== null && summary.cells === 0 && summary.records === 0;
  const ladder = !isProfileStar && !locked && summary !== null && !waitingEmpty
    ? starLadderRungs(summary.covered)
    : null;

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={t("ds.star.pageLabel")} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={[styles.body, isProfileStar ? styles.profileBody : styles.starBody]}>
        {/* 화면 이름("별 요약")은 머리줄이 말한다 - 어느 별에 있든 "여기가 요약 자리"
            라는 것이 먼저 읽힌다. 본문은 별 이름부터 시작한다(프로필 별과 같은 규칙). */}
        {isProfileStar ? (
          // Simon 승인 시안(2026-10-09): 제목/연필, 초상화, 이름/상태,
          // 좌우 정렬한 정보 표, 가져오기 카드, 이력 링크.
          <>
            <View style={styles.profileHeader}>
              <Text style={[m3TextStyle("headlineSmall"), styles.title, styles.profileTitle]}>{name}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={profileCta}
                onPress={() => router.push("/profile-details")}
                style={styles.editButton}
              >
                <PixelGlyph name="edit" size={20} color={m3.color.primary} />
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
            </View>
            <View style={styles.profileIdentity}>
              {profileName ? <Text style={[m3TextStyle("titleMedium"), styles.title]}>{profileName}</Text> : null}
              {profile.status === "ready" && profile.statusMessage ? <Text style={[m3TextStyle("bodySmall"), styles.profileStatus]}>{profile.statusMessage}</Text> : null}
            </View>
            {profileLines.length > 0 ? (
              <View style={styles.profilePanel}>
                <ScrollView style={styles.profileSummary} nestedScrollEnabled showsVerticalScrollIndicator>
                  {profileLines.map((line, index) => (
                    <View key={index} style={styles.profileFact}>
                      {profileParts[index] ? <Text style={[m3TextStyle("bodyMedium"), styles.factLabel]}>{t(`deepspace:profileDetails.${profileParts[index].key}Label`)}</Text> : null}
                      <Text style={[m3TextStyle("bodyMedium"), profileParts.length > 0 ? styles.factValue : styles.muted]}>{line}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => router.push("/profile-import")} style={styles.importRow}>
              <PixelGlyph name="upload" size={20} color={m3.color.primary} />
              <View style={styles.importCopy}>
                <Text style={[m3TextStyle("titleMedium"), styles.title]}>{t("profile:contextImport.title")}</Text>
                <Text style={[m3TextStyle("bodySmall"), styles.muted]}>{t("profile:contextImport.subtitle")}</Text>
              </View>
              <PixelGlyph name="chevron_right" size={20} color={m3.color.primary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/profile-import", params: { mode: "history" } })}
              style={styles.historyLink}
            >
              <Text style={[m3TextStyle("bodyMedium"), styles.historyLabel]}>{t("profile:contextImport.history")}</Text>
              <PixelGlyph name="history" size={20} color={m3.color.primary} />
            </Pressable>
          </>
        ) : (
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
            {/* 층 수는 여기 한 번. 단위가 "층"이라 점수가 아니라 이야기한 양으로 읽힌다. */}
            {ladder ? (
              <Text style={[m3TextStyle("labelLarge"), styles.title]}>
                {t("ds.star.count", { n: ladder.filter((rung) => rung.on).length, total: ladder.length })}
              </Text>
            ) : !locked && currentRead.status !== "ready" ? (
              <Text style={[m3TextStyle("labelLarge"), styles.title]} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">...</Text>
            ) : null}
          </View>
        )}

        {!locked && currentRead.status === "error" ? (
          <MdCard variant="outlined" style={styles.card}>
            <Text accessibilityRole="alert" style={[m3TextStyle("bodyMedium"), styles.muted]}>{t(currentRead.message)}</Text>
            <MdButton label={t("common:actions.retry")} variant="outlined" onPress={() => setRetry((value) => value + 1)} />
          </MdCard>
        ) : null}

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
            {ladder && summary ? (
              <>
                {/* 낭독에는 밝기의 규칙을 문장으로 남긴다: 이 앱에서 밝기는 평가가 아니라
                    이야기한 양이다. 눈에는 켜진 층 이름이 그 말을 한다. */}
                <View
                  style={styles.ladder}
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
                  {ladder.map(({ layer, on }) => (
                    <View key={layer} style={[styles.rung, on ? styles.rungOn : null]}>
                      <View style={[styles.rungMark, on ? styles.rungMarkOn : null]} />
                      <Text style={[m3TextStyle("headlineSmall"), on ? styles.layerOn : styles.layerOff]}>
                        {/* Layer name only, no number on the rung. In this app L1~L5 is the
                            brightness ladder: a numbered fifth rung read as "L5" while
                            coverage tops out at L4 (QA 261004 W-08/D-10). */}
                        {t(`ds.star.layer.${layer}`)}
                      </Text>
                    </View>
                  ))}
                </View>
                {summary.records > 0 ? (
                  inPhone ? (
                    <Text style={[m3TextStyle("bodySmall"), styles.muted]}>
                      {t("ds.star.records", { count: summary.records })}
                    </Text>
                  ) : (
                    // The count opens the wiki list on this star's stories (Z60, Simon 2026-10-13).
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("ds.star.records", { count: summary.records })}
                      onPress={() => router.push({ pathname: "/records", params: { period: meta.period ?? "" } })}
                      style={styles.recordsLink}
                    >
                      <Text style={[m3TextStyle("bodySmall"), styles.muted]}>
                        {t("ds.star.records", { count: summary.records })}
                      </Text>
                      <Text
                        style={[m3TextStyle("bodySmall"), styles.muted]}
                        aria-hidden
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        ›
                      </Text>
                    </Pressable>
                  )
                ) : null}
              </>
            ) : currentRead.status === "loading" ? (
              <MdCard variant="outlined" style={styles.card}>
                <Text style={[m3TextStyle("bodyMedium"), styles.muted]}>
                  {t("ds.star.loading")}
                </Text>
              </MdCard>
            ) : null}

            {summary ? <>
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
              ) : (
                // Z23: the home bubble sends a waiting star to the one before it. That one can be
                // waiting too, so the same way on is offered here instead of a dead end.
                <MdButton
                  label={t("ds.home.bubble.goToStar", { star: t(`ds.star.${entry.prerequisite}`) })}
                  variant="filled"
                  onPress={() => router.push(`/me/${entry.prerequisite}`)}
                  style={styles.cta}
                />
              )}
            </> : null}
          </>
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

// 줄 하나의 가장 낮은 높이(누르는 자리 크기와 같은 44)와 가장 높은 높이.
const RUNG_MIN = 44;
const RUNG_MAX = 96;
const RUNG_GAP = 8;

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.sm },
  profileBody: { paddingHorizontal: 14, paddingVertical: 18, gap: 0 },
  // 사다리가 화면의 남는 높이를 가져가도록 본문이 창 높이까지 자란다.
  starBody: { flexGrow: 1 },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  profileTitle: { flex: 1 },
  editButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  profileAvatarRow: { alignItems: "center", justifyContent: "center", height: 214 },
  profileIdentity: { alignItems: "center", marginTop: spacing.xs, marginBottom: 15 },
  profileStatus: { color: m3.color.onSurfaceVariant, textAlign: "center", maxWidth: 360 },
  profilePanel: { paddingVertical: 13, paddingHorizontal: 14, backgroundColor: m3.color.surfaceContainerLow, borderWidth: 2, borderTopColor: m3.color.surfaceBright, borderLeftColor: m3.color.surfaceBright, borderRightColor: m3.color.background, borderBottomColor: m3.color.background },
  profileFact: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 3 },
  factLabel: { color: m3.color.onSurfaceVariant, flexShrink: 0, maxWidth: "40%" },
  factValue: { color: m3.color.onSurface, flex: 1, textAlign: "right" },
  importRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.lg, marginTop: 17, borderWidth: 2, borderTopColor: m3.color.surfaceBright, borderLeftColor: m3.color.surfaceBright, borderRightColor: m3.color.background, borderBottomColor: m3.color.background, backgroundColor: m3.color.surfaceContainerLow, minHeight: 86 },
  importCopy: { flex: 1, gap: 6 },
  historyLink: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, marginTop: 6 },
  historyLabel: { color: m3.color.primary },
  // 다섯 줄(bodyLarge 줄 높이 x 5)을 넘으면 상자 안에서 스크롤한다.
  profileSummary: { maxHeight: m3.type.bodyLarge.line * 5 },
  heroCopy: { flex: 1 },
  title: { color: m3.color.onSurface },
  range: { color: m3.color.onSurfaceVariant, marginBottom: spacing.sm },
  card: { marginTop: spacing.sm },
  muted: { color: m3.color.onSurfaceVariant },
  recordsLink: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, minHeight: 44 },
  // 다섯 층 사다리. 높은 화면에서는 줄이 RUNG_MAX 까지 자라 아래 절반을 채우고,
  // 낮은 화면(대시보드 폰 안)에서는 RUNG_MIN 까지 줄어든 뒤 본문이 스크롤한다.
  ladder: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: RUNG_MIN * 5 + RUNG_GAP * 4,
    maxHeight: RUNG_MAX * 5 + RUNG_GAP * 4,
    gap: RUNG_GAP,
    marginTop: spacing.sm,
  },
  rung: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: RUNG_MIN,
    minHeight: RUNG_MIN,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingRight: spacing.md,
    borderWidth: 2,
    borderRadius: m3.shape.none,
    borderColor: m3.color.outlineVariant,
  },
  rungOn: { backgroundColor: m3.color.surfaceContainerLow },
  // 켜진 층의 표시. 안 한 층은 이 자리가 비어 테두리만 남는다.
  rungMark: { alignSelf: "stretch", width: 12, margin: 2 },
  rungMarkOn: { backgroundColor: m3.color.primary },
  layerOn: { color: m3.color.onSurface },
  layerOff: { color: m3.color.onSurfaceVariant },
  cta: { marginTop: spacing.lg },
});

/** GitHub Pages 정적 export에서도 `/me/<star>` direct hit가 404가 되지 않게 한다. */
export function generateStaticParams(): { star: string }[] {
  return meStarStaticParams();
}
