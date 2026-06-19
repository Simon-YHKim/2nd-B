/**
 * STEP 4 — the deep-space dock views, translated from design/prototype.dc.html:
 *   CaptureView (담기) · ChatView (세컨비) · LensView (나, empty/error/filled) ·
 *   IdenView (IDEN).
 *
 * Demo data is the design's dummy content; real store/query wiring is marked
 * TODO. Copy lives in the `home` i18n namespace (ds.*) — no hardcoded Korean.
 * Cyan/soul gradients use the sanctioned deepSpaceGradients via react-native-svg
 * (DESIGN.md adoption 2026-06-17). Unique SVG gradient ids via useId() so web
 * (document-global svg ids) never clashes across instances.
 */
import { useId, useState } from "react";
import { type DimensionValue, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { deepSpace, deepSpaceGradients, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";

// ── shared gradient primitives ───────────────────────────────────────────────

function GradientFill({ colors, radius = 0 }: { colors: readonly string[]; radius?: number }) {
  const id = "ds-grad-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          {colors.map((c, i) => (
            <Stop key={i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

function GradientButton({
  label,
  colors = deepSpaceGradients.cta,
  onPress,
  full,
}: {
  label: string;
  colors?: readonly string[];
  onPress?: () => void;
  full?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.gButton, full && styles.gButtonFull, pressed && styles.pressed]}
    >
      <GradientFill colors={colors} radius={12} />
      <Text style={styles.gButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function TraitBar({ label, value, up }: { label: string; value: number; up?: boolean }) {
  return (
    <View style={styles.traitRow}>
      <View style={styles.traitHead}>
        <Text style={styles.traitLabel}>{label}</Text>
        <Text style={[styles.traitValue, up && styles.traitValueUp]}>
          {value}
          {up ? " ↑" : ""}
        </Text>
      </View>
      <View style={styles.traitTrack}>
        <View style={[styles.traitFill, { width: `${value}%` as DimensionValue }]}>
          <GradientFill colors={up ? deepSpaceGradients.ctaPositive : deepSpaceGradients.progress} radius={4} />
        </View>
      </View>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

// ── 담기 / Capture ───────────────────────────────────────────────────────────

export function CaptureView() {
  const { t, i18n } = useTranslation("home");
  const { userId, isMinor } = useAuth();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const locale = i18n.language === "ko" ? "ko" : "en";
  const canSave = userId != null && draft.trim().length > 0 && !saving;

  async function saveFirstPiece() {
    if (!userId || !canSave) return;
    setSaving(true);
    setError(false);
    try {
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: draft.trim(),
        topic: locale === "ko" ? "첫 기록" : "First note",
        tags: ["first-piece"],
        withFollowup: false,
        minor: isMinor === true,
      });
      setSaved(true);
      setDraft("");
    } catch (e) {
      setError(true);
      if (typeof console !== "undefined") console.warn("[deepspace-capture] save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.pixelTitle}>{t("ds.capture.title")}</Text>
      <TextInput
        value={draft}
        onChangeText={(next) => {
          setDraft(next);
          if (saved) setSaved(false);
          if (error) setError(false);
        }}
        multiline
        textAlignVertical="top"
        placeholder={t("ds.capture.placeholder")}
        placeholderTextColor={withAlpha(deepSpace.text, 0.45)}
        style={styles.inputBoxText}
        accessibilityLabel={t("ds.capture.title")}
      />
      <View style={styles.chipRow}>
        <Chip label={t("ds.capture.chipText")} />
        <Chip label={t("ds.capture.chipLink")} />
        <Chip label={t("ds.capture.chipVoice")} />
      </View>
      <GradientButton
        label={
          saving
            ? locale === "ko" ? "저장 중" : "Saving"
            : saved
              ? locale === "ko" ? "저장 완료" : "Saved"
              : locale === "ko" ? "첫 기록 저장" : "Save first note"
        }
        onPress={saveFirstPiece}
        full
      />
      {saved ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/records")} style={styles.ghostBtn}>
          <Text style={styles.ghostLabel}>{locale === "ko" ? "기록 보관소에서 보기" : "Open records"}</Text>
        </Pressable>
      ) : null}
      {error ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{locale === "ko" ? "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." : "Could not save. Try again in a moment."}</Text>
        </View>
      ) : (
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{t("ds.capture.tip")}</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── 세컨비 / Chat ────────────────────────────────────────────────────────────

export function ChatView() {
  const { t } = useTranslation("home");
  return (
    <ScrollView contentContainerStyle={[styles.body, styles.chatBody]}>
      {/* TODO: wire to the real SecondB chat (src/lib/chat → gemini.ts, C9→C3). */}
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{t("ds.chat.user")}</Text>
      </View>
      <View style={styles.aiBubble}>
        <Text style={styles.aiText}>{t("ds.chat.ai")}</Text>
      </View>
      <View style={styles.evidenceRow}>
        <Chip label={t("ds.chat.evidence")} />
        <Chip label={t("ds.chat.rhythm")} />
      </View>
      <View style={styles.chipRow}>
        <Chip label={t("ds.chat.suggestRest")} />
        <Chip label={t("ds.chat.suggestImagine")} />
      </View>
    </ScrollView>
  );
}

// ── 나 / Lens (지금의 나) ─────────────────────────────────────────────────────

type LensState = "filled" | "empty" | "error";

function StateToggle({ value, onChange }: { value: LensState; onChange: (s: LensState) => void }) {
  const { t } = useTranslation("home");
  const opts: { key: LensState; label: string }[] = [
    { key: "filled", label: t("ds.lens.toggleFilled") },
    { key: "empty", label: t("ds.lens.toggleEmpty") },
    { key: "error", label: t("ds.lens.toggleError") },
  ];
  return (
    <View style={styles.toggleRow}>
      {opts.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.key }}
          accessibilityLabel={o.label}
          style={[styles.toggleBtn, value === o.key && styles.toggleBtnOn]}
        >
          <Text style={styles.toggleLabel}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LensView() {
  const { t } = useTranslation("home");
  const [state, setState] = useState<LensState>("filled");
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <StateToggle value={state} onChange={setState} />
      {state === "empty" ? (
        <View style={styles.centerState}>
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
          </Svg>
          <Text style={styles.stateTitle}>{t("ds.lens.emptyTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.emptyBody")}</Text>
          <GradientButton label={t("ds.lens.emptyCta")} />
        </View>
      ) : state === "error" ? (
        <View style={styles.centerState}>
          <Svg width={32} height={32} viewBox="0 0 24 24" opacity={0.7}>
            <Path d="M12 3l9 16H3z" fill="none" stroke={deepSpace.accentSoft} strokeWidth={2} strokeLinejoin="round" />
            <Path d="M12 9v5M12 16.5v.5" stroke={deepSpace.accentSoft} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Text style={styles.stateTitle}>{t("ds.lens.errorTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.errorBody")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("ds.lens.errorCta")} style={styles.ghostBtn}>
            <Text style={styles.ghostLabel}>{t("ds.lens.errorCta")}</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {/* TODO: replace dummy Big Five with persona/bfi.ts results. */}
          <View style={styles.filledHead}>
            <Text style={styles.pixelTitle}>{t("ds.lens.filledTitle")}</Text>
            <Text style={styles.level}>{t("ds.lens.level")}</Text>
          </View>
          <View style={styles.traits}>
            <TraitBar label={t("ds.lens.traitOpenness")} value={72} />
            <TraitBar label={t("ds.lens.traitConscientiousness")} value={58} />
            <TraitBar label={t("ds.lens.traitExtraversion")} value={41} up />
            <TraitBar label={t("ds.lens.traitAgreeableness")} value={67} />
            <TraitBar label={t("ds.lens.traitNeuroticism")} value={39} />
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightText}>{t("ds.lens.insight")}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── IDEN ─────────────────────────────────────────────────────────────────────

export function IdenView() {
  const { t } = useTranslation("home");
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* TODO: render from the real IdenDoc (src/lib/iden). */}
      <View style={styles.idCard}>
        <Text style={styles.idName}>simon.iden</Text>
        <View style={styles.idBadges}>
          <View style={styles.idBadge}>
            <Text style={styles.idBadgeText}>v2.1</Text>
          </View>
          <View style={[styles.idBadge, styles.idBadgeSigned]}>
            <Text style={styles.idBadgeSignedText}>{t("ds.iden.signed")}</Text>
          </View>
        </View>
      </View>
      <View style={styles.idenRowNorth}>
        <Text style={styles.idenKey}>NORTH_STAR</Text>
        <Text style={styles.idenNorthValue}>{t("ds.iden.northStar")}</Text>
      </View>
      <View style={styles.idenRowFive}>
        <Text style={styles.idenKeyCyan}>BIG_FIVE</Text>
        <Text style={styles.idenFiveValue}>O72 C58 E41 A67 N39</Text>
      </View>
      <GradientButton label={t("ds.iden.send")} colors={deepSpaceGradients.idenSend} full />
    </ScrollView>
  );
}

// ── shared star-lens header (eyebrow + title + tag) ──────────────────────────

function LensHead({ title, tag, eyebrow }: { title: string; tag: string; eyebrow: string }) {
  return (
    <View style={styles.lensHead}>
      <View style={styles.lensHeadTop}>
        <Text style={styles.pixelTitle}>{title}</Text>
        <Text style={styles.lensTag}>{tag}</Text>
      </View>
      <Text style={styles.lensEyebrow}>{eyebrow}</Text>
    </View>
  );
}

// 5-dot brightness indicator (filled dots cyan, empty dots faint cyan).
function DotMeter({ filled, total = 5 }: { filled: number; total?: number }) {
  return (
    <View style={styles.dotRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.dot, i < filled ? styles.dotOn : styles.dotOff]} />
      ))}
    </View>
  );
}

// ── 회상 / Recall (NARRATIVE) ────────────────────────────────────────────────

export function RecallLensView() {
  const { t } = useTranslation("home");
  // TODO: wire to real life-period coverage (src/lib/persona/interview coverage).
  const periods = [
    { name: t("ds.recall.p1Name"), age: t("ds.recall.p1Age"), dots: 3 },
    { name: t("ds.recall.p2Name"), age: t("ds.recall.p2Age"), dots: 4 },
    { name: t("ds.recall.p3Name"), age: t("ds.recall.p3Age"), dots: 2 },
    { name: t("ds.recall.p4Name"), age: t("ds.recall.p4Age"), dots: 3 },
    { name: t("ds.recall.p5Name"), age: t("ds.recall.p5Age"), dots: 1 },
    { name: t("ds.recall.p6Name"), age: t("ds.recall.p6Age"), dots: 4 },
    { name: t("ds.recall.p7Name"), age: t("ds.recall.p7Age"), dots: 3 },
    { name: t("ds.recall.p8Name"), age: t("ds.recall.p8Age"), dots: 5 },
  ];
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.recall.title")} tag={t("ds.recall.tag")} eyebrow={t("ds.recall.eyebrow")} />
      <Text style={styles.pixelHint}>{t("ds.recall.hint")}</Text>
      <View style={styles.grid2}>
        {periods.map((p) => (
          <Pressable
            key={p.name}
            accessibilityRole="button"
            accessibilityLabel={`${p.name} ${p.age}`}
            style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
          >
            <Text style={styles.gridName}>{p.name}</Text>
            <Text style={styles.gridAge}>{p.age}</Text>
            <DotMeter filled={p.dots} />
          </Pressable>
        ))}
      </View>
      <Text style={styles.footerLine}>{t("ds.recall.footer")}</Text>
    </ScrollView>
  );
}

// ── 보여지는 나 / Seen (SELF·OTHER) ──────────────────────────────────────────

function CompareRow({ label, self, other, delta }: { label: string; self: number; other: number; delta: string }) {
  return (
    <View style={styles.compareRow}>
      <View style={styles.traitHead}>
        <Text style={styles.traitLabel}>{label}</Text>
        <Text style={styles.compareDelta}>{delta}</Text>
      </View>
      <View style={[styles.compareTrack, styles.compareTrackSelf]}>
        <View style={[styles.compareFillSelf, { width: `${self}%` as DimensionValue }]} />
      </View>
      <View style={[styles.compareTrack, styles.compareTrackOther]}>
        <View style={[styles.compareFillOther, { width: `${other}%` as DimensionValue }]} />
      </View>
    </View>
  );
}

export function SeenLensView() {
  const { t } = useTranslation("home");
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* TODO: wire to self vs peer-review scores (src/lib/persona). */}
      <LensHead title={t("ds.seen.title")} tag={t("ds.seen.tag")} eyebrow={t("ds.seen.eyebrow")} />
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDotSelf]} />
          <Text style={styles.legendLabel}>{t("ds.seen.legendSelf")}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDotOther]} />
          <Text style={styles.legendLabel}>{t("ds.seen.legendOther")}</Text>
        </View>
      </View>
      <View style={styles.compareList}>
        <CompareRow label={t("ds.seen.traitExtraversion")} self={61} other={79} delta={t("ds.seen.diffExtraversion")} />
        <CompareRow label={t("ds.seen.traitConscientiousness")} self={74} other={78} delta={t("ds.seen.diffConscientiousness")} />
        <CompareRow label={t("ds.seen.traitAgreeableness")} self={68} other={61} delta={t("ds.seen.diffAgreeableness")} />
      </View>
      <View style={styles.soulCard}>
        <Text style={styles.soulCardText}>{t("ds.seen.conclusion")}</Text>
      </View>
      <View style={styles.btnRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("ds.seen.survey")} style={styles.ghostBtnFlex}>
          <Text style={styles.ghostLabel}>{t("ds.seen.survey")}</Text>
        </Pressable>
        <View style={styles.btnFlex}>
          <GradientButton label={t("ds.seen.share")} colors={deepSpaceGradients.idenSend} full />
        </View>
      </View>
    </ScrollView>
  );
}

// ── 리듬 / Rhythm (ESM) ──────────────────────────────────────────────────────

export function RhythmLensView() {
  const { t } = useTranslation("home");
  // TODO: wire to ESM mood samples (src/app/esm data).
  const bars = [
    { day: t("ds.rhythm.mon"), h: 54 },
    { day: t("ds.rhythm.tue"), h: 42 },
    { day: t("ds.rhythm.wed"), h: 66 },
    { day: t("ds.rhythm.thu"), h: 50 },
    { day: t("ds.rhythm.fri"), h: 72 },
    { day: t("ds.rhythm.sat"), h: 96, peak: true },
    { day: t("ds.rhythm.sun"), h: 80 },
  ];
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.rhythm.title")} tag={t("ds.rhythm.tag")} eyebrow={t("ds.rhythm.eyebrow")} />
      <View style={styles.chartCard}>
        <Text style={styles.pixelHint}>{t("ds.rhythm.subhead")}</Text>
        <View style={styles.chartRow}>
          {bars.map((b) => (
            <View key={b.day} style={styles.chartCol}>
              <View style={styles.chartBarTrack}>
                <View style={[styles.chartBar, { height: `${b.h}%` as DimensionValue }]}>
                  <GradientFill colors={b.peak ? deepSpaceGradients.cta : deepSpaceGradients.progress} radius={4} />
                </View>
              </View>
              <Text style={[styles.chartDay, b.peak && styles.chartDayPeak]}>{b.day}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.insightCard}>
        <Text style={styles.insightText}>{t("ds.rhythm.caption")}</Text>
      </View>
      <GradientButton label={t("ds.rhythm.logNow")} full />
    </ScrollView>
  );
}

// ── 미래의 나 / Possible (ASPIRATION) ────────────────────────────────────────

export function PossibleLensView() {
  const { t } = useTranslation("home");
  // TODO: wire to aspiration drafts (src/app/imagine store).
  const cards = [
    { name: t("ds.possible.a1Name"), body: t("ds.possible.a1Body") },
    { name: t("ds.possible.a2Name"), body: t("ds.possible.a2Body") },
    { name: t("ds.possible.a3Name"), body: t("ds.possible.a3Body") },
  ];
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.possible.title")} tag={t("ds.possible.tag")} eyebrow={t("ds.possible.eyebrow")} />
      <View style={styles.dashedList}>
        {cards.map((c) => (
          <Pressable
            key={c.name}
            accessibilityRole="button"
            accessibilityLabel={c.name}
            style={({ pressed }) => [styles.dashedCard, pressed && styles.pressed]}
          >
            <Text style={styles.dashedName}>{c.name}</Text>
            <Text style={styles.dashedBody}>{c.body}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.footerLine}>{t("ds.possible.footer")}</Text>
      <View style={styles.btnRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("ds.possible.rewrite")} style={styles.ghostBtnFlex}>
          <Text style={styles.ghostLabel}>{t("ds.possible.rewrite")}</Text>
        </Pressable>
        <View style={styles.btnFlex}>
          <GradientButton label={t("ds.possible.add")} full />
        </View>
      </View>
    </ScrollView>
  );
}

// ── 관계·지식 / Relational (RELATIONS) ───────────────────────────────────────

export function RelationalLensView() {
  const { t } = useTranslation("home");
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* TODO: wire to relations/knowledge graph (src/app/attachment + wiki). */}
      <LensHead title={t("ds.relational.title")} tag={t("ds.relational.tag")} eyebrow={t("ds.relational.eyebrow")} />
      <Text style={[styles.pixelHint, styles.sectionGap]}>{t("ds.relational.peopleHead")}</Text>
      <View style={styles.chipRowTight}>
        <Chip label={t("ds.relational.person1")} />
        <Chip label={t("ds.relational.person2")} />
        <Chip label={t("ds.relational.person3")} />
        <Chip label={t("ds.relational.personMore")} />
      </View>
      <Text style={[styles.pixelHint, styles.sectionGap]}>{t("ds.relational.knowledgeHead")}</Text>
      <View style={styles.chipRowTight}>
        <Chip label={t("ds.relational.topic1")} />
        <Chip label={t("ds.relational.topic2")} />
        <Chip label={t("ds.relational.topic3")} />
      </View>
      <View style={styles.insightCard}>
        <Text style={styles.insightText}>{t("ds.relational.conclusion")}</Text>
      </View>
      <GradientButton label={t("ds.relational.addData")} full />
    </ScrollView>
  );
}

// ── 일·성장 / Values (DOMAIN) ────────────────────────────────────────────────

function DomainRow({ label, count, value }: { label: string; count: string; value: number }) {
  return (
    <View style={styles.domainRow}>
      <View style={styles.traitHead}>
        <Text style={styles.domainLabel}>{label}</Text>
        <Text style={styles.domainCount}>{count}</Text>
      </View>
      <View style={styles.traitTrack}>
        <View style={[styles.traitFill, { width: `${value}%` as DimensionValue }]}>
          <GradientFill colors={deepSpaceGradients.progress} radius={4} />
        </View>
      </View>
    </View>
  );
}

export function ValuesLensView() {
  const { t } = useTranslation("home");
  // TODO: wire to domain piece counts (src/app/audit + records by domain).
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.values.title")} tag={t("ds.values.tag")} eyebrow={t("ds.values.eyebrow")} />
      <View style={styles.domainList}>
        <DomainRow label={t("ds.values.domain1")} count={t("ds.values.domain1Count")} value={100} />
        <DomainRow label={t("ds.values.domain2")} count={t("ds.values.domain2Count")} value={69} />
        <DomainRow label={t("ds.values.domain3")} count={t("ds.values.domain3Count")} value={26} />
      </View>
      <View style={styles.insightCard}>
        <Text style={styles.insightText}>{t("ds.values.conclusion")}</Text>
      </View>
      <GradientButton label={t("ds.values.addData")} full />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 28, gap: 0 },
  chatBody: { gap: 10 },
  pixelTitle: { color: deepSpace.accentBright, fontSize: 15, fontFamily: fontFamilies.pixelKo },

  // shared gradient button
  gButton: {
    overflow: "hidden",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: 18,
  },
  gButtonFull: { alignSelf: "stretch" },
  gButtonLabel: { color: deepSpace.bgEdge, fontSize: 13, fontFamily: fontFamilies.pixelKo, fontWeight: "700" },
  pressed: { opacity: 0.85 },

  // chips
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  chipLabel: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: fontFamilies.readable },

  // capture
  inputBoxText: {
    marginTop: 14,
    minHeight: 132,
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    color: deepSpace.textHi,
    fontSize: 13,
    lineHeight: 21,
    fontFamily: fontFamilies.readable,
  },
  noteCard: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.3),
  },
  noteText: { color: withAlpha(deepSpace.soul, 0.85), fontSize: 11.5, lineHeight: 18, fontFamily: fontFamilies.readable },

  // chat
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "82%",
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 13,
    backgroundColor: withAlpha(deepSpace.accent, 0.16),
  },
  userText: { color: deepSpace.textHi, fontSize: 12.5, lineHeight: 18, fontFamily: fontFamilies.readable },
  aiBubble: {
    alignSelf: "flex-start",
    maxWidth: "86%",
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 13,
    borderBottomRightRadius: 13,
    borderBottomLeftRadius: 13,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.25),
    backgroundColor: withAlpha(deepSpace.soul, 0.1),
  },
  aiText: { color: deepSpace.textHi, fontSize: 12.5, lineHeight: 19, fontFamily: fontFamilies.readable },
  evidenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignSelf: "flex-start" },

  // lens — state toggle
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  toggleBtnOn: { backgroundColor: deepSpace.cardPressed, borderColor: deepSpace.accent },
  toggleLabel: { color: deepSpace.accentBright, fontSize: 11, fontFamily: fontFamilies.readable },

  // lens — empty / error
  centerState: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 12 },
  stateMark: { fontSize: 34, color: deepSpace.accentSoft },
  stateMarkDim: { opacity: 0.7 },
  stateTitle: { color: deepSpace.accentBright, fontSize: 14, fontFamily: fontFamilies.pixelKo },
  stateBody: { color: withAlpha(deepSpace.text, 0.6), fontSize: 12, lineHeight: 19, textAlign: "center", fontFamily: fontFamilies.readable },
  ghostBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  ghostLabel: { color: deepSpace.accentSoft, fontSize: 13, fontFamily: fontFamilies.pixelKo },

  // lens — filled
  filledHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  level: { color: deepSpace.mint, fontSize: 10, fontFamily: fontFamilies.pixelEn },
  traits: { marginTop: 16, gap: 11 },
  traitRow: { gap: 4 },
  traitHead: { flexDirection: "row", justifyContent: "space-between" },
  traitLabel: { color: withAlpha(deepSpace.text, 0.7), fontSize: 11, fontFamily: fontFamilies.readable },
  traitValue: { color: withAlpha(deepSpace.text, 0.7), fontSize: 11, fontFamily: fontFamilies.readable },
  traitValueUp: { color: deepSpace.mint },
  traitTrack: { height: 7, borderRadius: 4, overflow: "hidden", backgroundColor: withAlpha(deepSpace.accent, 0.12) },
  traitFill: { height: "100%", borderRadius: 4, overflow: "hidden" },
  insightCard: {
    marginTop: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.mint, 0.25),
    backgroundColor: withAlpha(deepSpace.mint, 0.05),
  },
  insightText: { color: deepSpace.accentBright, fontSize: 11.5, lineHeight: 18, fontFamily: fontFamilies.readable },

  // iden
  idCard: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.3),
    backgroundColor: withAlpha(deepSpace.soul, 0.07),
    gap: 7,
  },
  idName: { color: deepSpace.accentBright, fontSize: 12, fontFamily: fontFamilies.mono },
  idBadges: { flexDirection: "row", gap: 5 },
  idBadge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5, backgroundColor: withAlpha(deepSpace.soul, 0.14) },
  idBadgeText: { color: withAlpha(deepSpace.soul, 0.8), fontSize: 9, fontFamily: fontFamilies.mono },
  idBadgeSigned: { backgroundColor: withAlpha(deepSpace.mint, 0.1) },
  idBadgeSignedText: { color: deepSpace.mint, fontSize: 9, fontFamily: fontFamilies.readable },
  idenRowNorth: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 2,
    borderLeftColor: deepSpace.soul,
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: withAlpha(deepSpace.soul, 0.06),
  },
  idenKey: { color: withAlpha(deepSpace.soul, 0.65), fontSize: 6, fontFamily: fontFamilies.pixelEn },
  idenKeyCyan: { color: withAlpha(deepSpace.accentSoft, 0.6), fontSize: 6, fontFamily: fontFamilies.pixelEn },
  idenNorthValue: { color: deepSpace.accentBright, fontSize: 11.5, lineHeight: 18, marginTop: 5, fontFamily: fontFamilies.readable },
  idenRowFive: {
    marginTop: 7,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 2,
    borderLeftColor: deepSpace.accent,
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: deepSpace.card,
  },
  idenFiveValue: { color: deepSpace.accentSoft, fontSize: 10, marginTop: 6, fontFamily: fontFamilies.mono },

  // ── star-lens shared head ──────────────────────────────────────────────────
  lensHead: { gap: 6, marginBottom: 16 },
  lensHeadTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  lensTag: { marginLeft: "auto", color: withAlpha(deepSpace.accent, 0.55), fontSize: 7, fontFamily: fontFamilies.pixelEn },
  lensEyebrow: { color: deepSpace.textMid, fontSize: 12.5, lineHeight: 18, fontFamily: fontFamilies.readable },
  pixelHint: { color: withAlpha(deepSpace.accentSoft, 0.6), fontSize: 7, fontFamily: fontFamilies.pixelEn, marginBottom: 12 },
  sectionGap: { marginTop: 18 },
  footerLine: { marginTop: 18, color: withAlpha(deepSpace.accentSoft, 0.55), fontSize: 11, lineHeight: 17, textAlign: "center", fontFamily: fontFamilies.readable },

  // dot meter
  dotRow: { flexDirection: "row", gap: 4, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOn: { backgroundColor: deepSpace.accent },
  dotOff: { backgroundColor: withAlpha(deepSpace.accent, 0.25) },

  // recall grid
  grid2: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 9 },
  gridCard: {
    width: "48%",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  gridName: { color: deepSpace.accentBright, fontSize: 12, fontFamily: fontFamilies.pixelKo },
  gridAge: { color: withAlpha(deepSpace.accentSoft, 0.5), fontSize: 9.5, marginTop: 3, fontFamily: fontFamilies.readable },

  // seen - legend
  legendRow: { flexDirection: "row", gap: 14, marginBottom: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendDotSelf: { backgroundColor: deepSpace.accent },
  legendDotOther: { backgroundColor: deepSpace.soulDeep },
  legendLabel: { color: deepSpace.textMid, fontSize: 11, fontFamily: fontFamilies.readable },

  // seen - compare rows
  compareList: { gap: 18 },
  compareRow: { gap: 4 },
  compareDelta: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: fontFamilies.mono },
  compareTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  compareTrackSelf: { backgroundColor: withAlpha(deepSpace.accent, 0.16), marginBottom: 4 },
  compareTrackOther: { backgroundColor: withAlpha(deepSpace.soul, 0.16) },
  compareFillSelf: { height: "100%", borderRadius: 3, backgroundColor: deepSpace.accent },
  compareFillOther: { height: "100%", borderRadius: 3, backgroundColor: deepSpace.soulDeep },

  // soul-tinted conclusion card (non-positive: violet, not mint)
  soulCard: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.28),
    backgroundColor: withAlpha(deepSpace.soul, 0.06),
  },
  soulCardText: { color: deepSpace.textHi, fontSize: 12, lineHeight: 19, fontFamily: fontFamilies.readable },

  // two-button rows
  btnRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  btnFlex: { flex: 1 },
  ghostBtnFlex: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    alignItems: "center",
    justifyContent: "center",
  },

  // rhythm chart
  chartCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  chartRow: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 6 },
  chartCol: { flex: 1, alignItems: "center", gap: 6 },
  chartBarTrack: { width: "100%", height: 100, justifyContent: "flex-end" },
  chartBar: { width: "100%", borderRadius: 4, overflow: "hidden" },
  chartDay: { color: withAlpha(deepSpace.accentSoft, 0.5), fontSize: 10, fontFamily: fontFamilies.readable },
  chartDayPeak: { color: deepSpace.accentBright },

  // possible - dashed cards
  dashedList: { gap: 13 },
  dashedCard: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: withAlpha(deepSpace.accent, 0.4),
    backgroundColor: withAlpha(deepSpace.accent, 0.03),
  },
  dashedName: { color: deepSpace.accentBright, fontSize: 13, fontFamily: fontFamilies.pixelKo, marginBottom: 5 },
  dashedBody: { color: deepSpace.textMid, fontSize: 12, lineHeight: 18, fontFamily: fontFamilies.readable },

  // relational
  chipRowTight: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // values - domain rows
  domainList: { gap: 13 },
  domainRow: {
    gap: 9,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  domainLabel: { color: deepSpace.accentBright, fontSize: 13, fontFamily: fontFamilies.pixelKo },
  domainCount: { color: withAlpha(deepSpace.accentSoft, 0.6), fontSize: 11, fontFamily: fontFamilies.mono },
});
