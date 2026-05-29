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
import { View, StyleSheet, ScrollView, ActivityIndicator, Modal, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import { SvgXml } from "react-native-svg";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { buildPersona, type PersonaCard } from "@/lib/persona/build";
import { buildCenterCards } from "@/lib/persona/center";
import { toEvidenceShard, evidenceTypeLabel, type EvidenceShard, type RawRecordRow } from "@/lib/persona/evidence";
import { TYPE_NICKNAME } from "@/lib/persona/mbti";
import { STYLE_LABEL } from "@/lib/persona/attachment";
import { CORE_BRAIN_XML } from "@/components/art/coreBrainXml";

export default function CoreBrain() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [evidence, setEvidence] = useState<EvidenceShard[]>([]);
  const [building, setBuilding] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
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
  }, [userId, locale]);

  if (loading || building) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
          <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.md }}>
            {locale === "ko" ? "중심을 살펴보는 중이에요..." : "Looking at your center..."}
          </Text>
        </View>
      </Screen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // Empty state (§7) — never fabricate a summary with no pieces.
  if (evidence.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <SvgXml xml={CORE_BRAIN_XML.orb} width={140} height={140} />
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
      </Screen>
    );
  }

  const cards = persona ? buildCenterCards(persona, locale) : [];
  const direction = cards.find((c) => c.id === "direction");
  const neighborhood = cards.find((c) => c.id === "neighborhood");
  const pieces = cards.find((c) => c.id === "pieces");

  // 나의 모습 — only real, measured signals; collecting state otherwise.
  const personaBits: string[] = [];
  if (persona?.mbti) personaBits.push(`${persona.mbti.type} · ${TYPE_NICKNAME[locale][persona.mbti.type] ?? ""}`.trim());
  if (persona?.attachment) personaBits.push(STYLE_LABEL[locale][persona.attachment.style]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 1) Header */}
        <View>
          <Text variant="caption" color="brand" style={{ letterSpacing: 1.5 }}>
            {locale === "ko" ? "나의 중심" : "Center of me"}
          </Text>
          <Text variant="heading">{locale === "ko" ? "지금의 나" : "You, right now"}</Text>
          <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs }}>
            {locale === "ko" ? "요즘 자주 이어지는 조각들을 살펴봐요." : "A look at the pieces that keep connecting lately."}
          </Text>
        </View>

        {/* 2) Center hero orb */}
        <View style={styles.hero}>
          <SvgXml xml={CORE_BRAIN_XML.orb} width={200} height={200} />
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

        {/* 5) 자주 보이는 나의 모습 */}
        <Section title={locale === "ko" ? "자주 보이는 나의 모습" : "A side of me I keep seeing"} accent={cosmic.soulViolet}>
          {personaBits.length > 0 ? (
            <View style={styles.bitRow}>
              {personaBits.map((b) => (
                <View key={b} style={styles.bitChip}>
                  <Text variant="caption" color="brand">{b}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "아직 또렷한 모습은 모이는 중이에요. 평가를 하나 마치면 더 선명해져요."
                : "Still gathering a clear shape. Finishing one assessment sharpens it."}
            </Text>
          )}
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
            label={locale === "ko" ? "공상 작업실에서 펼치기" : "Open in the imagine workshop"}
            variant="secondary"
            onPress={() => router.push("/imagine")}
          />
        </Section>

        {/* 8) 세컨비에게 이 중심으로 묻기 */}
        <Pressable
          onPress={() => router.push({ pathname: "/jarvis", params: { fromNode: locale === "ko" ? "나의 중심" : "my center" } })}
          style={styles.askCta}
          accessibilityRole="button"
          accessibilityLabel={locale === "ko" ? "세컨비에게 이 중심으로 묻기" : "Ask SecondB about this center"}
        >
          <Text variant="body" color="background" style={{ fontWeight: "700" }}>
            {locale === "ko" ? "세컨비에게 이 중심으로 묻기" : "Ask SecondB about this center"}
          </Text>
        </Pressable>
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
                    router.push(ev.route as never);
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
            <Button label={locale === "ko" ? "닫기" : "Close"} variant="secondary" onPress={() => setDrawerOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function evidenceLabel(ev: EvidenceShard, locale: "en" | "ko"): string {
  return [ev.dateLabel, evidenceTypeLabel(ev.type, locale)].filter(Boolean).join(" · ");
}

function Section({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <View style={[styles.section, { borderLeftColor: accent }]}>
      <Text variant="caption" color="textMuted" style={{ letterSpacing: 1, marginBottom: spacing.xs }}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  hero: { alignItems: "center" },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bitRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bitChip: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  evidenceBtn: { paddingVertical: spacing.xs },
  askCta: {
    backgroundColor: semantic.brand,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
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
  evRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  evDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand },
});
