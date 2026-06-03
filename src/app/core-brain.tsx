// 나의 중심 / Core Brain screen (core-brain pack v2). Internal concept
// stays "Core Brain"; user-facing name is "나의 중심". Reuses buildPersona
// + buildCenterCards (the §7-2 cards) and a real records fetch for the
// evidence drawer. Per the pack's data_contract we never fabricate
// unsupported summaries — sections fall back to a collecting/empty state.
//
// Section order (pack §2): Header · hero orb · 요즘 가장 밝은 연결 ·
// 밝아진 동네 · 자주 보이는 나의 모습 · 이걸 만든 조각들 · 다음 한 걸음 ·
// 세컨비에게 이 중심으로 묻기.

import { useEffect, useState, type ReactNode } from "react";
import { View, StyleSheet, ScrollView, Modal, Pressable } from "react-native";
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
import { toEvidenceShard, evidenceTypeLabel, type EvidenceShard, type RawRecordRow } from "@/lib/persona/evidence";
import { buildSelfPortrait } from "@/lib/persona/self-portrait";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { IslandArt } from "@/components/art/IslandArt";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";

export default function CoreBrain() {
  const { i18n } = useTranslation();
  const { userId, loading, hasProfile } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [evidence, setEvidence] = useState<EvidenceShard[]>([]);
  const [building, setBuilding] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { moment: companionMoment, fire: fireCompanion } = useCompanionMoment();

  useEffect(() => {
    // buildPersona() calls Gemini — don't fire it for a no-profile OAuth session
    // (gated here because the effect runs before the render redirect). C10 + consent.
    if (!userId || hasProfile === false) return;
    let cancelled = false;
    setBuilding(true);
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from("records")
          .select("id, kind, topic, created_at, tags")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(24);
        const rows = (data ?? []) as RawRecordRow[];
        const ev = rows.map((r) => toEvidenceShard(r, locale));
        const p = ev.length > 0 ? await buildPersona(userId, locale) : null;
        if (!cancelled) {
          setEvidence(ev);
          setPersona(p);
          // 아치 lights up when the center surfaces a fresh connection (companion pack §3).
          if (p) fireCompanion("connectionFound");
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[core-brain] load failed", (e as Error).message);
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, hasProfile, locale, fireCompanion]);

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
              onPress={() => router.push("/journal")}
            />
            <Button
              label={locale === "ko" ? "세컨비와 시작하기" : "Start with SecondB"}
              variant="secondary"
              onPress={() => router.push("/jarvis")}
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
          eyebrow={locale === "ko" ? "02. 나의 중심" : "02. Core brain"}
          title={locale === "ko" ? "내 조각들이 중심으로 모여요" : "Your pieces gather into a center"}
          subtitle={locale === "ko" ? "요즘 나의 연결 상태" : "How you're connecting lately"}
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={CORE_VILLAGE_UI.speech[locale]}
          primaryAction={{
            label: locale === "ko" ? "세컨비에게 묻기" : "Ask SecondB",
            onPress: () => router.push({ pathname: "/jarvis", params: { fromNode: locale === "ko" ? "나의 중심" : "my center" } }),
          }}        />
        <View style={styles.statRow}>
          <StatTile value={evidence.length} label={locale === "ko" ? "조각" : "pieces"} accent={cosmic.pixelLamp} />
          <StatTile value={`${filledFields}/5`} label={locale === "ko" ? "나의 모습" : "self-portrait"} accent={cosmic.soulViolet} />
          <StatTile value={persona?.values.length ?? 0} label={locale === "ko" ? "동네" : "areas"} accent={cosmic.signalMint} />
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
              <Pressable
                key={field.id}
                style={styles.fieldRow}
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
              </Pressable>
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
          <Pressable onPress={() => setDrawerOpen(true)} style={styles.evidenceBtn} accessibilityRole="button">
            <Text variant="body" color="brand">
              {locale === "ko" ? `참고한 조각 ${evidence.length}개 보기` : `See ${evidence.length} pieces`}
            </Text>
          </Pressable>
        </Section>

        {/* 7) 다음 한 걸음 */}
        <Section title={locale === "ko" ? "다음 한 걸음" : "Next step"} accent={cosmic.signalMint}>
          <Text variant="body" color="textMuted" style={{ marginBottom: spacing.sm }}>
            {locale === "ko"
              ? "이 중심을 다음 한 걸음으로 줄여볼게요."
              : "Let's narrow this center into one next step."}
          </Text>
          <Button
            label={locale === "ko" ? "공상 모드로 펼치기" : "Open in Divergent mode"}
            variant="secondary"
            onPress={() => router.push({ pathname: "/jarvis", params: { mode: "divergent" } })}
          />
        </Section>

        {/* 8) 세컨비에게 이 중심으로 묻기 */}
        <PremiumCTA
          label={locale === "ko" ? "세컨비에게 이 중심으로 묻기" : "Ask SecondB about this center"}
          variant="secondary"
          onPress={() => router.push({ pathname: "/jarvis", params: { fromNode: locale === "ko" ? "나의 중심" : "my center" } })}
        />
      </ScrollView>

      {/* Evidence drawer (§5) */}
      <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDrawerOpen(false)}>
          <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
            <View style={styles.drawerHandle} />
            <Text variant="heading">{locale === "ko" ? "이걸 만든 조각들" : "The pieces behind this"}</Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: 4 }}>
              {locale === "ko"
                ? "세컨비와 나의 중심이 참고한 기록이에요."
                : "The records SecondB and your center drew on."}
            </Text>
            <ScrollView style={{ marginTop: spacing.md }} contentContainerStyle={{ gap: spacing.sm }}>
              {evidence.map((ev) => (
                <Pressable
                  key={ev.id}
                  style={styles.evRow}
                  onPress={() => {
                    setDrawerOpen(false);
                    router.push({ pathname: "/record/[id]", params: { id: ev.id } });
                  }}
                >
                  <View style={styles.evDot} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>{ev.title}</Text>
                    <Text variant="subtle" color="textSubtle">
                      {evidenceLabel(ev, locale)}
                    </Text>
                  </View>
                </Pressable>
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
    <View style={[styles.section, { borderLeftColor: accent }]}>
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
    borderLeftWidth: 3,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fieldList: { gap: spacing.xs },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  fieldLabel: { letterSpacing: 0 },
  fieldDot: { width: 8, height: 8, borderRadius: 4 },
  evidenceBtn: { paddingVertical: spacing.xs },
  emptyActions: { gap: spacing.md, marginTop: spacing.xl, width: "100%", maxWidth: 320 },
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.78)", justifyContent: "flex-end" },
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
