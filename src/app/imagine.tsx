// "공상 작업실" / Imagine workshop — placeholder route per the 2026-05-29
// handoff §7-3. UI scaffolding + Vela accent + asset slots are landed
// here so the next session can hook up the actual generation pipeline
// (Gemini → "공상 카드" → /core-brain link) without rewriting layout.
//
// What's wired:
//   - Vela header + sprite slot (64×64 reserved)
//   - prompt box (no submit handler yet — surfaces a "Phase 3" notice)
//   - output card scaffold matching the handoff's 7-line structure
//     (제목 / 세계관 / 장면 3개 / 사물 / 캐릭터 / 다음 한 걸음 / 태그)
//
// What's deferred (asset / pipeline):
//   - Vela 64×64 idle sprite asset → see velaSpriteSlot below
//   - Scene illustration thumbnails (3× 88×88) → see sceneSlot below
//   - Save-to-graph action + frontmatter.wiki_track="daily" wiring
//   - Vela voice line + character animation on submit

import { useState } from "react";
import { ScrollView, StyleSheet, View, TextInput, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { CHARACTERS } from "@/lib/characters";

export default function Imagine() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [draft, setDraft] = useState("");
  const vela = CHARACTERS.vela;

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Vela header — sprite slot reserved at 64×64.
            Asset TODO: drop in /assets/characters/vela-idle@2x.png. */}
        <View style={styles.header}>
          <View style={styles.velaSpriteSlot}>
            {/* Placeholder pixel block — Dream Pink body + signal-mint core */}
            <View style={styles.velaPlaceholderBody} />
            <View style={styles.velaPlaceholderCore} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand" style={{ letterSpacing: 1.5 }}>
              {locale === "ko" ? "공상 작업실" : "Imagine workshop"}
            </Text>
            <Text variant="heading">
              {locale === "ko" ? "그 생각, 펼쳐볼까요?" : "Want to lay that out?"}
            </Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs }}>
              {locale === "ko" ? `${vela.name.ko} · ${vela.role.ko}` : `${vela.name.en} · ${vela.role.en}`}
            </Text>
          </View>
        </View>

        <View style={styles.promptCard}>
          <Text variant="body" style={{ color: cosmic.dreamPink, marginBottom: spacing.xs }}>
            {locale === "ko"
              ? "아직 말이 안 되어도 괜찮아요. 떠오른 장면을 하나 던져주세요."
              : "It doesn't have to make sense yet. Just toss a scene you saw in your head."}
          </Text>
          <TextInput
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder={locale === "ko" ? "예: 밤빛 골목에서 등불이 한 개씩 켜진다…" : "e.g. lanterns light up one by one in a night alley…"}
            placeholderTextColor={cosmic.mistGray}
            style={styles.promptInput}
          />
          <Button
            label={
              locale === "ko"
                ? "장면으로 펼치기 (곧 연결돼요)"
                : "Lay it out as scenes (wiring soon)"
            }
            variant="primary"
            // Always disabled in Phase 1 — the button is here so the
            // layout doesn't shift when Phase 3 wires generation.
            disabled
            onPress={() => undefined}
          />
          <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            {locale === "ko"
              ? "Phase 3에서 실제 펼침이 연결돼요. 지금은 자리만 잡아둔 상태예요."
              : "Generation pipeline lands in Phase 3 — this is the scaffold for now."}
          </Text>
        </View>

        {/* Output card scaffold — empty state.
            Handoff §7-3 final card structure:
              1) 공상 제목      2) 한 줄 세계관   3) 장면 3개
              4) 등장 사물      5) 어울리는 캐릭터 6) 오늘의 다음 한 걸음
              7) 마을 그래프 태그 */}
        <View style={styles.outputCard}>
          <Text variant="caption" color="textMuted">
            {locale === "ko" ? "공상 카드가 여기 펼쳐져요" : "Your imagine card will appear here"}
          </Text>
          <View style={styles.sceneRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.sceneSlot}>
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko" ? `장면 ${i + 1}` : `Scene ${i + 1}`}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.metaRow}>
            <MetaSlot label={locale === "ko" ? "등장 사물" : "Objects"} />
            <MetaSlot label={locale === "ko" ? "어울리는 캐릭터" : "Characters"} />
          </View>
          <View style={styles.nextStepSlot}>
            <Text variant="subtle" color="textSubtle">
              {locale === "ko" ? "오늘의 다음 한 걸음" : "Next step you can take today"}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function MetaSlot({ label }: { label: string }) {
  return (
    <View style={styles.metaSlot}>
      <Text variant="subtle" color="textSubtle">{label}</Text>
    </View>
  );
}

const VELA_PINK = cosmic.dreamPink;

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  // Vela 64×64 sprite slot — pixel placeholder until asset arrives.
  velaSpriteSlot: {
    width: 64, height: 64,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,159,214,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,159,214,0.42)",
    alignItems: "center", justifyContent: "center",
  },
  velaPlaceholderBody: {
    position: "absolute",
    width: 28, height: 24, top: 16, left: 18,
    backgroundColor: VELA_PINK,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: cosmic.space950,
  },
  velaPlaceholderCore: {
    width: 4, height: 4,
    backgroundColor: cosmic.signalMint,
    marginTop: 22,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  promptCard: {
    backgroundColor: "rgba(255,159,214,0.06)",
    borderColor: "rgba(255,159,214,0.18)",
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  promptInput: {
    minHeight: 110,
    color: cosmic.moonWhite,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    textAlignVertical: "top",
    fontSize: 15,
  },
  outputCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sceneRow: { flexDirection: "row", gap: spacing.sm },
  // Each scene slot is 88×88. Asset TODO: scene thumbnails / illustrations.
  sceneSlot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.md,
    backgroundColor: "rgba(167,139,250,0.08)",
    borderColor: "rgba(167,139,250,0.18)",
    borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  metaRow: { flexDirection: "row", gap: spacing.sm },
  metaSlot: {
    flex: 1,
    minHeight: 64,
    borderRadius: radii.md,
    backgroundColor: "rgba(141,152,184,0.06)",
    borderColor: semantic.border,
    borderWidth: 1,
    padding: spacing.md,
  },
  nextStepSlot: {
    minHeight: 72,
    borderRadius: radii.md,
    backgroundColor: "rgba(114,242,199,0.06)",
    borderColor: "rgba(114,242,199,0.22)",
    borderWidth: 1,
    padding: spacing.md,
  },
});
