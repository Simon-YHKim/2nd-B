// 소울 코어 / Core Brain screen (core-brain pack v2). Internal concept
// stays "Core Brain"; user-facing name is "소울 코어". Reuses buildPersona
// + buildCenterCards (the §7-2 cards) and a real records fetch for the
// evidence drawer. Per the pack's data_contract we never fabricate
// unsupported summaries — sections fall back to a collecting/empty state.
//
// Section order (pack §2): Header · hero orb · 요즘 가장 밝은 연결 ·
// 밝아진 동네 · 자주 보이는 나의 모습 · 이걸 만든 조각들 · 다음 한 걸음 ·
// 세컨비에게 이 중심으로 묻기.

import { useEffect, useState, type ReactNode } from "react";
import { View, StyleSheet, ScrollView, Modal, Pressable, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import {
  PremiumAppShell,
  PremiumCTA,
  PremiumLoadingState,
  SceneHero,
  StatTile,
} from "@/components/premium";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { buildPersona, type PersonaCard } from "@/lib/persona/build";
import { buildCenterCards } from "@/lib/persona/center";
import { mergeEvidence, evidenceTypeLabel, type EvidenceShard, type RawRecordRow, type RawSourceRow } from "@/lib/persona/evidence";
import { buildSelfPortrait } from "@/lib/persona/self-portrait";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { IslandArt } from "@/components/art/IslandArt";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";

async function loadCoreBrainEvidence(userId: string, locale: "en" | "ko"): Promise<EvidenceShard[]> {
  const supabase = getSupabaseClient();
  // Core must count ALL saved pieces the user sees in /records, not just
  // `records`: non-journal Capture/Import/Wiki land in `sources`. Reading
  // only records gives source-only users a false "center is still small"
  // empty state (data-truth gate). Mirrors /records' merged read.
  const [recRes, srcRes] = await Promise.all([
    supabase
      .from("records")
      .select("id, kind, topic, created_at, tags")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(24),
    supabase
      .from("sources")
      .select("id, kind, title, captured_at, tags")
      .eq("user_id", userId)
      .order("captured_at", { ascending: false })
      .limit(24),
  ]);
  // A transient RLS/timeout/token-refresh error returns data null without
  // throwing — surface it as an error state instead of a false empty one.
  if (recRes.error) {
    if (typeof console !== "undefined") console.warn("[core-brain] records query failed", recRes.error);
    throw recRes.error;
  }
  const recRows = (recRes.data ?? []) as RawRecordRow[];
  // Sources are best-effort: a sources failure degrades to records-only, never blanks Core.
  let srcRows: RawSourceRow[] = [];
  if (srcRes.error) {
    if (typeof console !== "undefined") console.warn("[core-brain] sources query failed; records only", srcRes.error);
  } else {
    srcRows = (srcRes.data ?? []) as RawSourceRow[];
  }
  return mergeEvidence(recRows, srcRows, locale);
}

export default function CoreBrain() {
  const { i18n } = useTranslation();
  const { userId, loading, hasProfile, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [evidence, setEvidence] = useState<EvidenceShard[]>([]);
  const [building, setBuilding] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [evidenceReloadKey, setEvidenceReloadKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { moment: companionMoment, fire: fireCompanion } = useCompanionMoment();

  useEffect(() => {
    // buildPersona() calls Gemini — don't fire it for a no-profile OAuth session
    // (gated here because the effect runs before the render redirect). C10 + consent.
    if (!userId || hasProfile === false) return;
    let cancelled = false;
    setBuilding(true);
    setLoadError(false);
    (async () => {
      try {
        const ev = await loadCoreBrainEvidence(userId, locale);
        const p = ev.length > 0 ? await buildPersona(userId, locale, isMinor === true) : null;
        if (!cancelled) {
          setEvidence(ev);
          setPersona(p);
          // 아치 lights up when the center surfaces a fresh connection (companion pack §3).
          if (p) fireCompanion("connectionFound");
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[core-brain] load failed", (e as Error).message);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, hasProfile, isMinor, locale, fireCompanion, reloadKey]);
  // Re-focus refreshes only cheap DB evidence. The initial/manual path above is
  // the only path that may run buildPersona(), because buildPersona calls Gemini.
  useFocusRefetch(() => setEvidenceReloadKey((k) => k + 1), Boolean(userId && hasProfile !== false));

  useEffect(() => {
    if (evidenceReloadKey === 0 || !userId || hasProfile === false) return;
    let cancelled = false;
    (async () => {
      try {
        const ev = await loadCoreBrainEvidence(userId, locale);
        if (!cancelled) {
          setEvidence(ev);
          setLoadError(false);
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[core-brain] evidence refresh failed", (e as Error).message);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, hasProfile, locale, evidenceReloadKey]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "중심을 살펴보는 중이에요…" : "Looking at your center…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  if (building) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "중심을 살펴보는 중이에요…" : "Looking at your center…"} />
        </View>
      </PremiumAppShell>
    );
  }

  // Load error — a records query error must NOT masquerade as the empty state,
  // or a user who has pieces sees "your center is still small" on a transient
  // RLS/timeout/token-refresh failure. Offer a retry instead.
  if (loadError) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <IslandArt id="core" size={140} />
          <Text variant="heading" style={{ marginTop: spacing.lg, textAlign: "center" }}>
            {locale === "ko" ? "중심을 잠깐 못 불러왔어요" : "We couldn't load your center just now"}
          </Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            {locale === "ko"
              ? "연결이 잠깐 흔들렸어요. 조각은 그대로 있으니 다시 시도해 주세요."
              : "The connection wobbled for a moment. Your pieces are safe, so please try again."}
          </Text>
          <View style={styles.emptyActions}>
            <Button
              label={locale === "ko" ? "다시 시도하기" : "Try again"}
              variant="primary"
              onPress={() => setReloadKey((k) => k + 1)}
            />
            <Button
              label={locale === "ko" ? "세컨비와 시작하기" : "Start with SecondB"}
              variant="secondary"
              onPress={() => router.push("/secondb")}
            />
          </View>
        </View>
      </PremiumAppShell>
    );
  }

  // Empty state (§7) — never fabricate a summary with no pieces.
  if (evidence.length === 0) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <IslandArt id="core" size={140} />
          <Text variant="heading" style={{ marginTop: spacing.lg, textAlign: "center" }}>
            {locale === "ko" ? "아직 중심이 작아요" : "Your center is still small"}
          </Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            {locale === "ko"
              ? "오늘의 조각을 하나 남기면 세컨비가 연결을 찾아볼 수 있어요."
              : "Leave one piece today and SecondB can start finding the connections."}
          </Text>
          <View style={styles.emptyActions}>
            <Button
              label={locale === "ko" ? "오늘의 조각 남기기" : "Leave today's piece"}
              variant="primary"
              onPress={() => router.push("/capture")}
            />
            <Button
              label={locale === "ko" ? "세컨비와 시작하기" : "Start with SecondB"}
              variant="secondary"
              onPress={() => router.push("/secondb")}
            />
          </View>
        </View>
      </PremiumAppShell>
    );
  }

  const cards = persona ? buildCenterCards(persona, locale) : [];
  const direction = cards.find((c) => c.id === "direction");
  const neighborhood = cards.find((c) => c.id === "neighborhood");
  const pieces = cards.find((c) => c.id === "pieces");

  // 나의 모습 — the 5-field self-portrait (who / forWhom / goal / do / fuel).
  // Data contract: only measured fields are filled; the rest stay collecting
  // and point the user at the one place that would fill them. Never fabricated.
  const portrait = buildSelfPortrait({ persona }, locale);

  const filledFields = portrait.filter((f) => f.status === "filled").length;

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={locale === "ko" ? "02. 소울 코어" : "02. Soul Core"}
          title={locale === "ko" ? "내 조각들이 중심으로 모여요" : "Your pieces gather into a center"}
          subtitle={locale === "ko" ? "요즘 나의 연결 상태" : "How you're connecting lately"}
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={CORE_VILLAGE_UI.speech[locale]}
          primaryAction={{
            label: locale === "ko" ? "세컨비에게 묻기" : "Ask SecondB",
            onPress: () => router.push({ pathname: "/secondb", params: { fromNode: locale === "ko" ? "소울 코어" : "my center" } }),
          }}
        />
        <View style={styles.statRow}>
          <StatTile value={evidence.length} label={locale === "ko" ? "조각" : "pieces"} accent={cosmic.pixelLamp} />
          <StatTile value={`${filledFields}/5`} label={locale === "ko" ? "나의 모습" : "self-portrait"} accent={cosmic.soulViolet} />
          <StatTile value={persona?.values.length ?? 0} label={locale === "ko" ? "동네" : "areas"} accent={cosmic.signalMint} />
          <StatTile
            value={`${Math.round((persona?.soulCoreBrightness ?? 0.2) * 100)}%`}
            label={locale === "ko" ? "밝기" : "brightness"}
            accent={cosmic.soulViolet}
          />
        </View>

        {/* 3) 요즘 가장 밝은 연결 */}
        {direction ? (
          <Section title={locale === "ko" ? "요즘 가장 밝은 연결" : "Brightest connection now"} accent={direction.accent}>
            <Text variant="body">{direction.body}</Text>
          </Section>
        ) : null}

        {/* 4) 밝아진 동네 / 영역 */}
        {neighborhood ? (
          <Section title={locale === "ko" ? "밝아진 동네" : "The lit-up neighborhood"} accent={neighborhood.accent}>
            <Text variant="body">{neighborhood.body}</Text>
          </Section>
        ) : null}

        {/* 5) 자주 보이는 나의 모습 — 5-field self-portrait (data contract) */}
        <Section title={locale === "ko" ? "자주 보이는 나의 모습" : "A side of me I keep seeing"} accent={cosmic.soulViolet}>
          <View style={styles.fieldList}>
            {portrait.map((field) => (
              <TouchableOpacity
                key={field.id}
                style={styles.fieldRow}
                activeOpacity={0.7}
                onPress={() => router.push(field.route as never)}
                accessibilityRole="button"
                accessibilityLabel={field.label}
              >
                <View
                  style={[styles.fieldDot, { backgroundColor: field.status === "filled" ? cosmic.signalMint : semantic.border }]}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color="textMuted" style={styles.fieldLabel}>{field.label}</Text>
                  {field.status === "filled" ? (
                    <Text variant="body">{field.value}</Text>
                  ) : (
                    <Text variant="subtle" color="textSubtle">{field.hint}</Text>
                  )}
                </View>
                {field.status === "collecting" ? (
                  <Text variant="caption" color="brand">{locale === "ko" ? "채우기" : "Fill"}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
          <Button
            label={locale === "ko" ? "살펴보기" : "Look around"}
            variant="secondary"
            onPress={() => router.push("/persona")}
          />
        </Section>

        {/* 6) 이걸 만든 조각들 — evidence */}
        <Section title={locale === "ko" ? "이걸 만든 조각들" : "The pieces behind this"} accent={cosmic.pixelLamp}>
          {pieces ? <Text variant="body" style={{ marginBottom: spacing.sm }}>{pieces.body}</Text> : null}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setDrawerOpen(true)}
            style={styles.evidenceBtn}
            accessibilityRole="button"
            accessibilityLabel={
              locale === "ko"
                ? `참고한 조각 ${evidence.length}개 보기`
                : `See ${evidence.length} evidence pieces`
            }
          >
            <Text variant="body" color="brand">
              {locale === "ko" ? `참고한 조각 ${evidence.length}개 보기` : `See ${evidence.length} pieces`}
            </Text>
          </TouchableOpacity>
        </Section>

        {/* 7) 다음 한 걸음 */}
        <Section title={locale === "ko" ? "다음 한 걸음" : "Next step"} accent={cosmic.signalMint}>
          <Text variant="body" color="textMuted" style={{ marginBottom: spacing.sm }}>
            {locale === "ko"
              ? "이 중심을 다음 한 걸음으로 줄여볼게요."
              : "Let's narrow this center into one next step."}
          </Text>
          <Button
            label={locale === "ko" ? "새 관점으로 펼치기" : "Open a new angle"}
            variant="secondary"
            onPress={() => router.push({ pathname: "/secondb", params: { mode: "divergent" } })}
          />
        </Section>

        {/* 8) 세컨비에게 이 중심으로 묻기 */}
        <PremiumCTA
          label={locale === "ko" ? "세컨비에게 이 중심으로 묻기" : "Ask SecondB about this center"}
          variant="secondary"
          onPress={() => router.push({ pathname: "/secondb", params: { fromNode: locale === "ko" ? "소울 코어" : "my center" } })}
        />
      </ScrollView>

      {/* Evidence drawer (§5) */}
      <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setDrawerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={locale === "ko" ? "참고 조각 닫기" : "Close evidence drawer"}
        >
          <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
            <View style={styles.drawerHandle} />
            <Text variant="heading">{locale === "ko" ? "이걸 만든 조각들" : "The pieces behind this"}</Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: 4 }}>
              {locale === "ko"
                ? "세컨비와 소울 코어이 참고한 기록이에요."
                : "The records SecondB and your center drew on."}
            </Text>
            <ScrollView style={{ marginTop: spacing.md }} contentContainerStyle={{ gap: spacing.sm }}>
              {evidence.map((ev) => (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.evRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    setDrawerOpen(false);
                    router.push({ pathname: "/record/[id]", params: { id: ev.id } });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={locale === "ko" ? `${ev.title} 기록 열기` : `Open record ${ev.title}`}
                  accessibilityHint={evidenceLabel(ev, locale)}
                >
                  <View style={styles.evDot} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>{ev.title}</Text>
                    <Text variant="subtle" color="textSubtle">
                      {evidenceLabel(ev, locale)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Button
              label={locale === "ko" ? "모든 기록 보기" : "See all records"}
              variant="secondary"
              onPress={() => {
                setDrawerOpen(false);
                router.push("/records");
              }}
            />
            <Button label={locale === "ko" ? "닫기" : "Close"} variant="secondary" onPress={() => setDrawerOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
      {/* 아치 appears briefly when a fresh connection surfaces (companion pack §3) */}
      {companionMoment ? (
        <CompanionMoment moment={companionMoment} style={styles.companionFlash} />
      ) : null}
    </PremiumAppShell>
  );
}

function evidenceLabel(ev: EvidenceShard, locale: "en" | "ko"): string {
  return [ev.dateLabel, evidenceTypeLabel(ev.type, locale)].filter(Boolean).join(" · ");
}

function Section({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <View style={[styles.section, { borderStartColor: accent }]}>
      <Text variant="caption" color="textMuted" style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: 110 },
  companionFlash: { position: "absolute", bottom: 40, right: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  hero: { alignItems: "center" },
  statRow: { flexDirection: "row", justifyContent: "space-around", gap: spacing.sm },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderStartWidth: 3,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fieldList: { gap: spacing.xs },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  fieldLabel: { letterSpacing: 0 },
  fieldDot: { width: 8, height: 8, borderRadius: 4 },
  evidenceBtn: { paddingVertical: spacing.xs, minHeight: 44, justifyContent: "center" },
  emptyActions: { gap: spacing.md, marginTop: spacing.xl, width: "100%", maxWidth: 320 },
  backdrop: { flex: 1, backgroundColor: semantic.backdrop, justifyContent: "flex-end" },
  drawer: {
    backgroundColor: semantic.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderColor: semantic.border,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "70%",
  },
  drawerHandle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: semantic.border, marginBottom: spacing.sm },
  sectionTitle: { letterSpacing: 0, marginBottom: spacing.xs },
  evRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  evDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand },
});
