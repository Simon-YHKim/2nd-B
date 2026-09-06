/**
 * STEP 4 — the deep-space dock views, translated from legacy/design/prototype.dc.html:
 *   CaptureView (담기) · ChatView (세컨비) · LensView (나, empty/error/filled) ·
 *   IdenView (IDEN).
 *
 * The lens/iden/values/possible views render REAL data passed by their caller
 * screens (loading/empty/error/filled from props); with no prop they fall back
 * to the design's sample content for the Soul Core preview path. Recall/Rhythm/
 * Relational are not yet wired to a live route, so they show honest empty states
 * (see each view's TODO). Copy lives in the `home` i18n namespace (ds.*).
 * Cyan/soul gradients use the sanctioned deepSpaceGradients via react-native-svg
 * (DESIGN.md adoption 2026-06-17). Unique SVG gradient ids via useId() so web
 * (document-global svg ids) never clashes across instances.
 */
import { forwardRef, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, type DimensionValue, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { canonCaptureModes } from "@/lib/canon";
import { deepSpace, deepSpaceGradients, flattenAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { PixelGlyph, PixelGlyphRects } from "@/components/pixel/PixelGlyph";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { canonGlyph, type AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import { type HotlineId } from "@/lib/safety/lexicon";
import { MdButton, MdCard, ProgressLinear, m3TextStyle } from "@/components/m3";
import { composeFourWBody, EMPTY_FOURW, fourWHasContent, type FourWFields } from "@/lib/capture/fourw";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadLatestBfi } from "@/lib/persona/build";
import { getDomainStar, type DomainId } from "@/lib/persona/domain-stars";
import { STYLE_LABEL, type AttachmentStyle } from "@/lib/persona/attachment";
import type { BfiMeans } from "@/lib/persona/observable-self";
import { buildSeenRows, seenGapLines, type SeenRow } from "@/lib/persona/seen-rows";
import { SEVEN_STARS, isUnlived } from "@/lib/persona/seven-stars";
import { loadSeenAggregate, type SeenAggregateRow } from "@/lib/peer/invite";
import { callLlm } from "@/lib/llm/boundary";
import { IMAGINE_SEEDS, type ImagineSeedIcon } from "./imagine-seeds";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `deepSpace.card` — 이 화면들의 내용은 거의 전부 딥스페이스 카드 위에 얹힌다.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const dsAlpha = (c: string, a: number): string => flattenAlpha(c, a, deepSpace.card);

// ── shared gradient primitives ───────────────────────────────────────────────

function GradientFill({ colors, radius = 0, diagonal = false }: { colors: readonly string[]; radius?: number; diagonal?: boolean }) {
  const id = "ds-grad-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  // diagonal=true → 135° run (top-left → bottom-right), matching the rev2
  // reference cards' `linear-gradient(135deg, …)`. Default stays horizontal.
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2={diagonal ? "1" : "0"}>
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
    // visuals on the wrapper View — Fabric Android drops function-form
    // Pressable styles (#680); the Pressable is a bare touch surface.
    <View style={[styles.gButton, full && styles.gButtonFull]}>
      <GradientFill colors={colors} radius={12} />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.gButtonPress}
      >
        <Text style={styles.gButtonLabel}>{label}</Text>
      </Pressable>
    </View>
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

function CaptureIcon({ name, color, size = 18 }: { name: AnyGlyphName; color: string; size?: number }) {
  return <PixelGlyph name={name} color={color} size={size} />;
}

// A W4H1 field: leading icon + label, then a filled input box (reference Field
// in sb-screens-core.jsx). All colors route through m3.* (this screen is on the
// migrated M3 track — no cosmic tokens, no hex literals).
const CaptureField = forwardRef<TextInput, {
  icon: AnyGlyphName;
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  // Android keyboard flow (ANDROID_QA_GUIDELINES §2): single-line fields relay
  // focus to the next via returnKeyType="next" + onSubmitEditing.
  returnKeyType?: "next" | "done";
  onSubmitEditing?: () => void;
  required?: boolean;
}>(function CaptureField(
  { icon, label, hint, value, onChange, multiline = false, returnKeyType, onSubmitEditing, required },
  ref,
) {
  return (
    <View>
      <View style={styles.capFieldHead}>
        <CaptureIcon name={icon} color={m3.color.onSurfaceVariant} size={15} />
        <Text style={styles.capFieldLabel}>{label}</Text>
        {required ? <Text style={styles.capFieldRequired}>*</Text> : null}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        placeholder={hint}
        placeholderTextColor={m3.color.onSurfaceVariant}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        returnKeyType={returnKeyType}
        blurOnSubmit={returnKeyType === "next" ? false : undefined}
        onSubmitEditing={onSubmitEditing}
        style={[styles.capFieldInput, multiline && styles.capFieldInputTall]}
        accessibilityLabel={label}
      />
    </View>
  );
});

type CaptureMode = "text" | "link" | "photo" | "voice" | "todo";
// Mode ids + icons sourced from the design canon (src/lib/canon → public/proto/data);
// labels stay on the i18n path (t("ds.capture.modes." + id)) below.
//
// ⚠ 아이콘 **이름은 캐논이 주고 그림은 코드가 갖는다.** 캐논이 아직 안 그린
// 이름을 부르면 예외가 아니라 **빈 아이콘**이 뜬다 — 그래서 이름을 확인하고
// 없으면 눈에 보이는 대체 표시로 떨어진다. 어느 이름이 대체로 떨어지는지는
// `canon-icon-names.test.ts` 가 세어서 박아둔다(줄기만 하고 늘지는 않는다).
const CAPTURE_MODE_ROW: { id: CaptureMode; icon: AnyGlyphName }[] =
  canonCaptureModes.map((m) => ({ id: m.id as CaptureMode, icon: canonGlyph(m.icon) }));

type CaptureTextFormat = "free" | "fourw";

/** PIXEL-CLAY tile whose outer View owner supplies layout on Android Fabric. */
function CaptureTile({
  label,
  icon,
  selected,
  disabled = false,
  horizontal = false,
  accessibilityHint,
  role,
  onPress,
}: {
  label: string;
  icon?: AnyGlyphName;
  selected: boolean;
  disabled?: boolean;
  horizontal?: boolean;
  accessibilityHint?: string;
  role: "button" | "radio" | "tab";
  onPress: () => void;
}) {
  const [held, setHeld] = useState(false);
  const active = selected && !disabled;
  const color = active ? m3.color.onPrimary : m3.color.onSurfaceVariant;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setHeld(true)}
      onPressOut={() => setHeld(false)}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled,
        selected: role === "button" ? undefined : selected,
        checked: role === "radio" ? selected : undefined,
      }}
      aria-selected={role === "button" ? undefined : selected}
      style={styles.capTileHit}
    >
      <View style={held && !disabled ? styles.capTileSunk : styles.capTileRest}>
        <PixelSurface
          variant={active ? "inset" : "bevel"}
          pressed={held && !disabled}
          background={active ? m3.color.primary : m3.color.surfaceContainerHigh}
          style={styles.capTileSurface}
          contentStyle={[styles.capTileContent, horizontal && styles.capTileContentHorizontal]}
        >
          {icon ? <CaptureIcon name={icon} color={color} size={horizontal ? 16 : 18} /> : null}
          <Text style={[styles.capTileLabel, { color }]} numberOfLines={1}>
            {label}
          </Text>
        </PixelSurface>
      </View>
    </Pressable>
  );
}

export function CaptureView() {
  const { t, i18n } = useTranslation(["home", "capture"]);
  const { userId, isMinor } = useAuth();
  const locale = i18n.language === "ko" ? "ko" : "en";
  // rev2 P4a (device QA 2026-07-02) + clone-audit 06-capture: the deep-space 담기
  // matches the reference — 5 format modes, and 글(text) opens the W4H1 form as
  // the default. All modes save through the same createRecord(kind:"note") path.
  const [mode, setMode] = useState<CaptureMode>("text");
  const [textFormat, setTextFormat] = useState<CaptureTextFormat>("fourw");
  const [fourw, setFourw] = useState<FourWFields>(EMPTY_FOURW);
  const [text, setText] = useState(""); // link / photo caption / voice transcript
  const [todos, setTodos] = useState<string[]>(["", ""]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  // Crisis safety net (parity with the journal path): createRecord runs the
  // local crisis lexicon on every note save; a red zone must surface the same
  // locale/minor-aware hotline here as everywhere else, not a silent "saved".
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "GLOBAL_988",
  });

  const cleanTodos = todos.map((v) => v.trim()).filter((v) => v.length > 0);
  const hasContent =
    mode === "text"
      ? textFormat === "fourw"
        ? fourWHasContent(fourw)
        : text.trim().length > 0
      : mode === "todo"
        ? cleanTodos.length > 0
        : text.trim().length > 0;
  const canSave = userId != null && hasContent && !saving;

  const dirty = () => {
    if (saved) setSaved(false);
    if (error) setError(false);
  };
  const setField = (key: keyof FourWFields, next: string) => {
    setFourw((prev) => ({ ...prev, [key]: next }));
    dirty();
  };
  const setTodoAt = (i: number, next: string) => {
    setTodos((prev) => prev.map((v, idx) => (idx === i ? next : v)));
    dirty();
  };

  async function savePiece() {
    if (!userId || !canSave) return;
    setSaving(true);
    setError(false);
    try {
      let body: string;
      let topic: string | undefined;
      let tag: string;
      if (mode === "text") {
        if (textFormat === "fourw") {
          body = composeFourWBody(fourw, locale);
          topic = fourw.what.trim().slice(0, 80);
          tag = "fourw";
        } else {
          body = text.trim();
          topic = body.slice(0, 80);
          tag = "memo";
        }
      } else if (mode === "todo") {
        body = cleanTodos.map((v) => `- ${v}`).join("\n");
        topic = cleanTodos[0]?.slice(0, 80);
        tag = "todo";
      } else {
        body = text.trim();
        topic = body.slice(0, 80);
        tag = mode; // link / photo / voice
      }
      const res = await createRecord({
        userId,
        locale,
        kind: "note",
        body,
        topic,
        tags: [tag],
        withFollowup: false,
        minor: isMinor === true,
      });
      // createRecord ran the local crisis lexicon on this note (withFollowup:false
      // → llmPathWillClassify=false). A red zone means the text tripped crisis
      // detection — surface the hotline exactly like the journal path
      // (capture.tsx handleJournalSubmit) instead of discarding the result.
      if (res.followup?.zone === "red") {
        setCrisis({ visible: true, hotline: locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988" });
      }
      setSaved(true);
      // WCAG 4.1.3 status message: the saved outcome is otherwise only a button
      // label/state change, silent to a screen reader. Announce it.
      AccessibilityInfo.announceForAccessibility(t("ds.capture.saved"));
      setFourw(EMPTY_FOURW);
      setText("");
      setTodos(["", ""]);
    } catch (e) {
      setError(true);
      AccessibilityInfo.announceForAccessibility(t("ds.capture.saveError"));
      if (typeof console !== "undefined") console.warn("[deepspace-capture] save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // W4H1 single-line fields relay focus when→where→who→what on Android.
  const whatRef = useRef<TextInput>(null);
  const whenRef = useRef<TextInput>(null);
  const whereRef = useRef<TextInput>(null);
  const whoRef = useRef<TextInput>(null);
  const howRef = useRef<TextInput>(null);

  const f = (key: string) => t("ds.capture." + key);
  const saveLabel = saving ? f("saving") : saved ? f("saved") : f("save");

  return (
    <ScrollView
      style={styles.capScroll}
      contentContainerStyle={styles.capBody}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {/* The reference uses five fixed square tiles, not a scrolling chip row. */}
      <View style={styles.capModeRow} accessibilityRole="tablist">
        {CAPTURE_MODE_ROW.map((m) => {
          const on = mode === m.id;
          return (
            <View key={m.id} style={styles.capModeCell}>
              <CaptureTile
                role="tab"
                selected={on}
                label={t("ds.capture.modes." + m.id)}
                icon={m.icon}
                onPress={() => {
                  setMode(m.id);
                  dirty();
                }}
              />
            </View>
          );
        })}
      </View>

      {/* mode-specific input */}
      {mode === "text" ? (
        <>
          <View style={styles.capFormatRow} accessibilityRole="radiogroup">
            <View style={styles.capFormatCell}>
              <CaptureTile
                role="radio"
                selected={textFormat === "free"}
                horizontal
                icon="edit_note"
                label={t("capture:modes.memo.label")}
                onPress={() => {
                  setTextFormat("free");
                  dirty();
                }}
              />
            </View>
            <View style={styles.capFormatCell}>
              <CaptureTile
                role="radio"
                selected={textFormat === "fourw"}
                horizontal
                icon="grid"
                label={t("capture:modes.fourw.label")}
                onPress={() => {
                  setTextFormat("fourw");
                  dirty();
                }}
              />
            </View>
          </View>
          {textFormat === "free" ? (
            <View style={styles.capForm}>
              <TextInput
                value={text}
                onChangeText={(next) => {
                  setText(next);
                  dirty();
                }}
                placeholder={f("fields.what.hint")}
                placeholderTextColor={m3.color.onSurfaceVariant}
                multiline
                textAlignVertical="top"
                style={[styles.capFieldInput, styles.capFreeInput]}
                accessibilityLabel={t("capture:modes.memo.label")}
              />
            </View>
          ) : (
            <View style={styles.capForm}>
              <CaptureField
                ref={whenRef}
                icon="calendar_today"
                label={f("fields.when.label")}
                hint={f("fields.when.hint")}
                value={fourw.when}
                onChange={(v) => setField("when", v)}
                returnKeyType="next"
                onSubmitEditing={() => whereRef.current?.focus()}
              />
              <CaptureField
                ref={whereRef}
                icon="north_east"
                label={f("fields.where.label")}
                hint={f("fields.where.hint")}
                value={fourw.where}
                onChange={(v) => setField("where", v)}
                returnKeyType="next"
                onSubmitEditing={() => whoRef.current?.focus()}
              />
              <CaptureField
                ref={whoRef}
                icon="person"
                label={f("fields.who.label")}
                hint={f("fields.who.hint")}
                value={fourw.who}
                onChange={(v) => setField("who", v)}
                returnKeyType="next"
                onSubmitEditing={() => whatRef.current?.focus()}
              />
              <CaptureField
                ref={whatRef}
                icon="edit_note"
                label={f("fields.what.label")}
                hint={f("fields.what.hint")}
                value={fourw.what}
                onChange={(v) => setField("what", v)}
                multiline
                required
              />
              <CaptureField
                ref={howRef}
                icon="bolt"
                label={f("fields.how.label")}
                hint={f("fields.how.hint")}
                value={fourw.how}
                onChange={(v) => setField("how", v)}
                returnKeyType="done"
              />
            </View>
          )}
        </>
      ) : mode === "link" ? (
        <View style={styles.capForm}>
          <Text style={styles.capHint}>{f("linkHint")}</Text>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              dirty();
            }}
            placeholder={f("linkPlaceholder")}
            placeholderTextColor={m3.color.onSurfaceVariant}
            autoCapitalize="none"
            keyboardType="url"
            style={[styles.capFieldInput, styles.capMono]}
            accessibilityLabel={t("ds.capture.modes.link")}
          />
        </View>
      ) : mode === "photo" ? (
        <View style={styles.capForm}>
          <MdButton
            variant="outlined"
            icon={<CaptureIcon name="photo_camera" color={m3.color.primary} size={18} />}
            label={f("photoOpen")}
            // med#3: open the FULL composer in photo (ocr) mode — this used to
            // land on the default journal/link pane with the label promising 사진.
            onPress={() => router.push({ pathname: "/capture-full", params: { text, mode: "ocr" } })}
            style={styles.capFullWidth}
          />
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              dirty();
            }}
            placeholder={f("photoCaption")}
            placeholderTextColor={m3.color.onSurfaceVariant}
            style={styles.capFieldInput}
            accessibilityLabel={f("photoCaption")}
          />
        </View>
      ) : mode === "voice" ? (
        <View style={styles.capForm}>
          <MdButton
            variant="outlined"
            icon={<CaptureIcon name="mic" color={m3.color.primary} size={18} />}
            label={f("voiceOpen")}
            // med#3: same — the voice label must open the voice recorder pane.
            onPress={() => router.push({ pathname: "/capture-full", params: { text, mode: "voice" } })}
            style={styles.capFullWidth}
          />
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              dirty();
            }}
            placeholder={f("voiceHint")}
            placeholderTextColor={m3.color.onSurfaceVariant}
            multiline
            textAlignVertical="top"
            style={[styles.capFieldInput, styles.capFieldInputTall]}
            accessibilityLabel={f("voiceHint")}
          />
        </View>
      ) : (
        <View style={styles.capTodoCol}>
          {todos.map((v, i) => (
            <View key={i} style={styles.capTodoRow}>
              <CaptureIcon name="radio_unchecked" color={m3.color.outline} size={20} />
              <TextInput
                value={v}
                onChangeText={(next) => setTodoAt(i, next)}
                placeholder={`${f("todoHint")} ${i + 1}`}
                placeholderTextColor={m3.color.onSurfaceVariant}
                style={styles.capTodoInput}
                accessibilityLabel={`${f("todoHint")} ${i + 1}`}
              />
            </View>
          ))}
          <MdButton
            variant="text"
            icon={<CaptureIcon name="add" color={m3.color.primary} size={18} />}
            label={f("todoAdd")}
            onPress={() => setTodos((prev) => [...prev, ""])}
            style={styles.capTodoAdd}
          />
        </View>
      )}

      <View style={styles.capSubmit}>
        <CaptureTile
          role="button"
          selected={canSave || saving || saved}
          disabled={!canSave}
          horizontal
          icon={saving ? undefined : "add"}
          label={saveLabel}
          accessibilityHint={!canSave && !saving ? f("saveHint") : undefined}
          onPress={savePiece}
        />
      </View>

      {saved ? (
        <MdButton
          variant="text"
          label={f("openRecords")}
          onPress={() => router.push("/records")}
          style={styles.capFullWidth}
        />
      ) : null}
      {error ? (
        <View style={styles.capErrorCard}>
          <Text style={styles.capErrorText}>{f("saveError")}</Text>
        </View>
      ) : null}

      <CrisisRouter
        visible={crisis.visible}
        hotline={crisis.hotline}
        onClose={() => setCrisis((c) => ({ ...c, visible: false }))}
      />
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

export type LensTraits = {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
};

// Sample Big Five (0-100) for the design-preview / Soul Core reuse path that
// renders <LensView/> with no real traits. The big-five route passes real,
// loadLatestBfi-derived values via the `traits` prop instead of this sample.
const DUMMY_LENS_TRAITS: LensTraits = {
  openness: 72,
  conscientiousness: 58,
  extraversion: 41,
  agreeableness: 67,
  neuroticism: 39,
};

export function LensView({
  traits,
  hasError,
  onStart,
  onRetry,
}: { traits?: LensTraits | null; hasError?: boolean; onStart?: () => void; onRetry?: () => void } = {}) {
  const { t } = useTranslation("home");
  // No prop (undefined) = design preview / Soul Core reuse: render sample data
  // without exposing internal state controls. A provided `traits` drives state from real
  // data: an object → filled with those scores, null → empty (no result yet).
  // `hasError` (fetch failed) takes priority over empty so the retry path shows.
  const demo = traits === undefined;
  const state: LensState = demo ? "filled" : traits ? "filled" : hasError ? "error" : "empty";
  const shown = traits ?? DUMMY_LENS_TRAITS;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {state === "empty" ? (
        <View style={styles.centerState}>
          <PixelGlyph name="star" color={deepSpace.accentSoft} size={34} />
          <Text style={styles.stateTitle}>{t("ds.lens.emptyTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.emptyBody")}</Text>
          <GradientButton label={t("ds.lens.emptyCta")} onPress={onStart} />
        </View>
      ) : state === "error" ? (
        <View style={styles.centerState}>
          {/* ⚠ 아이콘을 **미리 합성한 색**으로 흐리게 한다(규칙 4).
              예전에는 `<Svg opacity={0.7}>` 로 그림 자체를 반투명하게 만들었다. */}
          <Svg width={32} height={32} viewBox="0 0 24 24">
            <PixelGlyphRects name="warning" color={dsAlpha(deepSpace.accentSoft, 0.7)} />
          </Svg>
          <Text style={styles.stateTitle}>{t("ds.lens.errorTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.errorBody")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("ds.lens.errorCta")} onPress={onRetry} style={styles.ghostBtn}>
            <Text style={styles.ghostLabel}>{t("ds.lens.errorCta")}</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {/* No level chip here. It rendered a constant string from the locale
              file, so every account saw the same tier whether or not anything
              had been measured. Bind a real level or show nothing. */}
          <View style={styles.filledHead}>
            <Text style={styles.pixelTitle}>{t("ds.lens.filledTitle")}</Text>
          </View>
          <View style={styles.traits}>
            <TraitBar label={t("ds.lens.traitOpenness")} value={shown.openness} />
            <TraitBar label={t("ds.lens.traitConscientiousness")} value={shown.conscientiousness} />
            <TraitBar label={t("ds.lens.traitExtraversion")} value={shown.extraversion} up={demo} />
            <TraitBar label={t("ds.lens.traitAgreeableness")} value={shown.agreeableness} />
            <TraitBar label={t("ds.lens.traitNeuroticism")} value={shown.neuroticism} />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── 검증 · Big Five (M3 windowed, clone-audit 14-bigfive) ─────────────────────
// The layer-B validation lens rebuilt on the migrated Material 3 track (gap
// 14-bigfive: retire the cosmic LensView skin for /big-five). Filled state =
// the reference BigFiveScreen (sb-screens-know.jsx): headline + L4 chip +
// confidence, subtitle, five ProgressLinear trait rows (extraversion carries the
// tertiary/violet "recently changed" highlight + ↑ delta to match the shipped
// insight copy), the 세컨비 insight card, an other-frameworks card, and the
// retake / add-data action pair. Empty + error reuse the existing ds.lens copy.
// All colors route through m3.* tokens — no cosmic tokens, no hex literals.

// No static extraversion delta: the Big Five lens shows measured scores only.
// A real prev-vs-latest delta can be plumbed later (needs the prior BFI record).

function BigFiveTraitRow({
  label,
  value,
  delta,
}: {
  label: string;
  value: number;
  delta?: number;
}) {
  const changed = delta != null;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.bfTraitRow}>
      <View style={styles.bfTraitHead}>
        <Text style={[m3TextStyle("bodyMedium"), styles.bfTraitLabel]}>{label}</Text>
        <Text
          style={[
            m3TextStyle("bodyMedium"),
            styles.bfTraitValue,
            { color: changed ? m3.color.primary : m3.color.onSurfaceVariant },
          ]}
        >
          {value}
          {changed ? ` ↑${delta}` : ""}
        </Text>
      </View>
      <ProgressLinear
        value={pct / 100}
        color={changed ? m3.color.tertiary : m3.color.primary}
        accessibilityLabel={`${label} ${value}`}
      />
    </View>
  );
}

export function BigFiveLensM3({
  traits,
  hasError,
  onStart,
  onRetry,
  onAddData,
  onExtraFrameworks,
}: {
  traits?: LensTraits | null;
  hasError?: boolean;
  onStart?: () => void;
  onRetry?: () => void;
  onAddData?: () => void;
  onExtraFrameworks?: () => void;
} = {}) {
  const { t } = useTranslation("home");
  // A provided `traits` object → filled; null → empty (no BFI record yet);
  // `hasError` (fetch failed) takes priority over empty so retry shows.
  const state: LensState = traits ? "filled" : hasError ? "error" : "empty";
  const shown = traits ?? DUMMY_LENS_TRAITS;

  if (state === "empty") {
    return (
      <ScrollView contentContainerStyle={styles.bfBody}>
        <View style={styles.bfCenterState}>
          <PixelGlyph name="star" color={m3.color.primary} size={34} />
          <Text style={[m3TextStyle("titleMedium"), styles.bfStateTitle]}>{t("ds.lens.emptyTitle")}</Text>
          <Text style={[m3TextStyle("bodyMedium"), styles.bfStateBody]}>{t("ds.lens.emptyBody")}</Text>
          <MdButton
            label={t("ds.lens.emptyCta")}
            variant="filled"
            onPress={onStart}
            icon={<CaptureIcon name="add" color={m3.color.onPrimary} size={18} />}
          />
        </View>
      </ScrollView>
    );
  }

  if (state === "error") {
    return (
      <ScrollView contentContainerStyle={styles.bfBody}>
        <View style={styles.bfCenterState}>
          {/* ⚠ 위와 같은 이유 — 덴이 아니라 색을 흐리게 한다(규칙 4). */}
          <Svg width={32} height={32} viewBox="0 0 24 24">
            <PixelGlyphRects name="warning" color={dsAlpha(m3.color.onSurfaceVariant, 0.7)} />
          </Svg>
          <Text style={[m3TextStyle("titleMedium"), styles.bfStateTitle]}>{t("ds.lens.errorTitle")}</Text>
          <Text style={[m3TextStyle("bodyMedium"), styles.bfStateBody]}>{t("ds.lens.errorBody")}</Text>
          <MdButton label={t("ds.lens.errorCta")} variant="tonal" onPress={onRetry} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.bfBody}>
      <View style={styles.bfHeadRow}>
        {/* The level chip and the confidence percent were locale constants, not
            measurements — every account read "L4 / 64%" on an empty profile.
            Removed rather than rebound: the real level belongs to the lens
            rework, and a wrong number is worse than no number. */}
        <Text style={[m3TextStyle("headlineSmall"), styles.bfHeadline]}>{t("ds.lens.headline")}</Text>
      </View>
      <Text style={[m3TextStyle("bodyMedium"), styles.bfSubtitle]}>{t("ds.lens.subtitle")}</Text>

      <View style={styles.bfTraits}>
        <BigFiveTraitRow label={t("ds.lens.traitOpenness")} value={shown.openness} />
        <BigFiveTraitRow label={t("ds.lens.traitConscientiousness")} value={shown.conscientiousness} />
        <BigFiveTraitRow label={t("ds.lens.traitExtraversion")} value={shown.extraversion} />
        <BigFiveTraitRow label={t("ds.lens.traitAgreeableness")} value={shown.agreeableness} />
        <BigFiveTraitRow label={t("ds.lens.traitNeuroticism")} value={shown.neuroticism} />
      </View>

      <MdCard
        variant="filled"
        onPress={onExtraFrameworks}
        accessibilityLabel={t("ds.lens.extraFrameworks")}
        style={styles.bfExtraCard}
      >
        <View style={styles.bfExtraRow}>
          <CaptureIcon name="forum" color={m3.color.tertiary} size={20} />
          <Text style={[m3TextStyle("bodyMedium"), styles.bfExtraLabel]}>{t("ds.lens.extraFrameworks")}</Text>
          <CaptureIcon name="chevron_right" color={m3.color.onSurfaceVariant} size={20} />
        </View>
      </MdCard>

      <View style={styles.bfActions}>
        <MdButton
          label={t("ds.lens.retake")}
          variant="tonal"
          onPress={onStart}
          icon={<CaptureIcon name="replay" color={m3.color.onSecondaryContainer} size={18} />}
          style={styles.bfActionBtn}
        />
        <MdButton
          label={t("ds.lens.addData")}
          variant="filled"
          onPress={onAddData}
          icon={<CaptureIcon name="add" color={m3.color.onPrimary} size={18} />}
          style={styles.bfActionBtn}
        />
      </View>
    </ScrollView>
  );
}

// ── ATTACHMENT (애착 · ECR 검증틀) ─────────────────────────────────────────────
// The RESULT view for /attachment — the ECR "hidden grain" (layer B) seen as a
// 2-axis 회피×불안 map + the propose→ratify estimate. Cloned 1:1 from the
// reference AttachmentScreen (sb-flows.jsx) + RatifyBlock (sb-data.jsx). The ECR
// SURVEY (the record writer) lives behind the empty-state / retake CTA in
// attachment.tsx, exactly as BigFiveLensM3 sits over BigFiveSurvey. All colors
// route through m3.* (azure point/glow, violet L3 + confidence, secondary-
// container ratify surface); no cosmic tokens, no hex literals.

export type AttachmentLensResult = {
  /** Avoidance subscale mean on the 1-7 ECR scale. */
  avoidance: number;
  /** Anxiety subscale mean on the 1-7 ECR scale. */
  anxiety: number;
  style: AttachmentStyle;
};

// 1-7 ECR mean → 0-100 grid position (same (v-1)/6 anchor the map axes assume).
function ecrPct(mean: number): number {
  return Math.max(0, Math.min(100, ((mean - 1) / 6) * 100));
}

// Quadrant labels transcribed literally from the reference (안정 TL · 몰입 TR ·
// 회피 BL · 혼란 BR) — corner-anchored, not reinterpreted.
const ATTACHMENT_QUADRANTS: { key: string; v: "top" | "bottom"; h: "left" | "right" }[] = [
  { key: "secure", v: "top", h: "left" },
  { key: "preoccupied", v: "top", h: "right" },
  { key: "avoidant", v: "bottom", h: "left" },
  { key: "fearful", v: "bottom", h: "right" },
];

export function AttachmentLensM3({
  result,
  hasError,
  onStart,
  onInterview,
  onBigFive,
}: {
  result?: AttachmentLensResult | null;
  hasError?: boolean;
  onStart?: () => void;
  onInterview?: () => void;
  onBigFive?: () => void;
} = {}) {
  const { t, i18n } = useTranslation("home");
  const locale = i18n.language === "ko" ? "ko" : "en";
  const state: LensState = result ? "filled" : hasError ? "error" : "empty";
  const gradId = "at-map-" + useId().replace(/[^a-zA-Z0-9]/g, "");

  if (state === "empty") {
    return (
      <ScrollView contentContainerStyle={styles.bfBody}>
        <View style={styles.bfCenterState}>
          <PixelGlyph name="star" color={m3.color.primary} size={34} />
          <Text style={[m3TextStyle("titleMedium"), styles.bfStateTitle]}>{t("ds.attachment.emptyTitle")}</Text>
          <Text style={[m3TextStyle("bodyMedium"), styles.bfStateBody]}>{t("ds.attachment.emptyBody")}</Text>
          <MdButton
            label={t("ds.attachment.emptyCta")}
            variant="filled"
            onPress={onStart}
            icon={<CaptureIcon name="add" color={m3.color.onPrimary} size={18} />}
          />
        </View>
      </ScrollView>
    );
  }

  if (state === "error") {
    return (
      <ScrollView contentContainerStyle={styles.bfBody}>
        <View style={styles.bfCenterState}>
          {/* ⚠ 위와 같은 이유 — 덴이 아니라 색을 흐리게 한다(규칙 4). */}
          <Svg width={32} height={32} viewBox="0 0 24 24">
            <PixelGlyphRects name="warning" color={dsAlpha(m3.color.onSurfaceVariant, 0.7)} />
          </Svg>
          <Text style={[m3TextStyle("titleMedium"), styles.bfStateTitle]}>{t("ds.attachment.errorTitle")}</Text>
          <Text style={[m3TextStyle("bodyMedium"), styles.bfStateBody]}>{t("ds.attachment.errorBody")}</Text>
          <MdButton label={t("ds.attachment.errorCta")} variant="tonal" onPress={onStart} />
        </View>
      </ScrollView>
    );
  }

  const r = result as AttachmentLensResult;
  const avoid = Math.round(ecrPct(r.avoidance));
  const anx = Math.round(ecrPct(r.anxiety));

  return (
    <ScrollView contentContainerStyle={styles.bfBody}>
      <View style={styles.bfHeadRow}>
        {/* Same constant-level problem as the Big Five head. Chip removed. */}
        <Text style={[m3TextStyle("headlineSmall"), styles.bfHeadline]}>{t("ds.attachment.headline")}</Text>
      </View>
      <Text style={[m3TextStyle("bodyMedium"), styles.bfSubtitle]}>{t("ds.attachment.subtitle")}</Text>

      <MdCard variant="outlined" style={styles.atMapCard}>
        <View style={styles.atMap}>
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={dsAlpha(m3.color.primaryContainer, 0.33)} />
                <Stop offset="1" stopColor={m3.color.surfaceContainer} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId})`} />
          </Svg>
          {ATTACHMENT_QUADRANTS.map((q) => (
            <Text
              key={q.key}
              style={[
                m3TextStyle("labelMedium"),
                styles.atQuad,
                q.v === "top" ? styles.atQuadTop : styles.atQuadBottom,
                q.h === "left" ? styles.atQuadLeft : styles.atQuadRight,
              ]}
            >
              {t(`ds.attachment.quadrant_${q.key}`)}
            </Text>
          ))}
          <View style={styles.atAxisV} />
          <View style={styles.atAxisH} />
          <View style={[styles.atPointWrap, { left: `${avoid}%` as DimensionValue, top: `${anx}%` as DimensionValue }]}>
            <View style={styles.atPointHalo} />
            <View style={styles.atPoint} />
          </View>
          <Text style={styles.atAxisFooter}>{t("ds.attachment.axisFooter")}</Text>
        </View>
        <View style={styles.atResultRow}>
          <Text style={[m3TextStyle("titleMedium"), styles.atResultLabel]}>
            {t("ds.attachment.resultNear", { style: STYLE_LABEL[locale][r.style] })}
          </Text>
          <Text style={[m3TextStyle("bodySmall"), styles.atScore]}>{t("ds.attachment.scoreLine", { avoid, anx })}</Text>
        </View>
      </MdCard>

      {/* The 세컨비 insight card is gone with its string. It was a locale
          constant that cited evidence the account did not have ("최근 관계 기록
          12건이 이 추정을 받쳐요"), which is a fabricated citation shown to
          everyone. It comes back when a real per-user line exists to put here. */}

      <View style={styles.bfActions}>
        <MdButton
          label={t("ds.attachment.interview")}
          variant="tonal"
          onPress={onInterview}
          icon={<CaptureIcon name="forum" color={m3.color.onSecondaryContainer} size={18} />}
          style={styles.bfActionBtn}
        />
        <MdButton label={t("ds.attachment.bigfive")} variant="outlined" onPress={onBigFive} style={styles.bfActionBtn} />
      </View>
    </ScrollView>
  );
}

// ── IDEN ─────────────────────────────────────────────────────────────────────

export type IdenViewData = {
  /** Display name shown as the `*.iden` handle (e.g. "simon.iden"). */
  name: string;
  /** IDEN format version, e.g. "0.1". */
  version: string;
  /** One-line "who" (the IdenDoc oneLiner) shown as the north star. */
  northStar: string;
  /** Pre-formatted Big Five line, e.g. "O72 C58 E41 A67 N39"; null when no traits yet. */
  bigFive: string | null;
};

export function IdenView({
  data,
  loading,
  hasError,
  isKo,
  onSend,
  onRetry,
  footer,
}: {
  data?: IdenViewData | null;
  loading?: boolean;
  hasError?: boolean;
  isKo?: boolean;
  onSend?: () => void;
  onRetry?: () => void;
  /** rev2 P5a export controls (field toggles + JSON copy), rendered after send. */
  footer?: ReactNode;
} = {}) {
  const { t } = useTranslation("home");
  void isKo; // copy is now t()-driven; prop kept for caller-convention parity
  // No `data` prop (undefined) = design preview / reuse path: keep sample copy.
  // A provided value drives real states: loading -> spinner copy, hasError ->
  // retry, null -> empty (no self-knowledge yet), object -> the real IdenDoc.
  const demo = data === undefined;
  if (!demo && loading) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.centerState}>
          <Text style={styles.stateBody}>{t("ds.iden.loading")}</Text>
        </View>
      </ScrollView>
    );
  }
  if (!demo && hasError) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.centerState}>
          {/* ⚠ 아이콘을 **미리 합성한 색**으로 흐리게 한다(규칙 4).
              예전에는 `<Svg opacity={0.7}>` 로 그림 자체를 반투명하게 만들었다. */}
          <Svg width={32} height={32} viewBox="0 0 24 24">
            <PixelGlyphRects name="warning" color={dsAlpha(deepSpace.accentSoft, 0.7)} />
          </Svg>
          <Text style={styles.stateTitle}>{t("ds.lens.errorTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.errorBody")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("ds.lens.errorCta")} onPress={onRetry} style={styles.ghostBtn}>
            <Text style={styles.ghostLabel}>{t("ds.lens.errorCta")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }
  if (!demo && !data) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.centerState}>
          <PixelGlyph name="star" color={deepSpace.accentSoft} size={34} />
          <Text style={styles.stateTitle}>{t("ds.iden.emptyTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.iden.emptyBody")}</Text>
          <GradientButton
            label={t("ds.iden.emptyCta")}
            onPress={onSend}
          />
        </View>
      </ScrollView>
    );
  }
  // Honesty invariant: never render a fabricated Big Five line as if real. The
  // no-data fallback leaves bigFive null (the type's "no traits yet" state) so a
  // placeholder mount can't surface invented scores. (This IdenView is currently
  // unmounted — prod IDEN is IdenExportScreenDeepSpace in app/iden.tsx, which
  // renders the account's real values — so this hardens against a future remount.)
  const shown: IdenViewData = data ?? {
    name: "simon.iden",
    version: "2.1",
    northStar: t("ds.iden.northStar"),
    bigFive: null,
  };
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.idCard}>
        <Text style={styles.idName}>{shown.name}</Text>
        <View style={styles.idBadges}>
          <View style={styles.idBadge}>
            <Text style={styles.idBadgeText}>v{shown.version}</Text>
          </View>
          <View style={[styles.idBadge, styles.idBadgeSigned]}>
            <Text style={styles.idBadgeSignedText}>{t("ds.iden.signed")}</Text>
          </View>
        </View>
      </View>
      <View style={styles.idenRowNorth}>
        <Text style={styles.idenKey}>NORTH_STAR</Text>
        <Text style={styles.idenNorthValue}>{shown.northStar}</Text>
      </View>
      {shown.bigFive ? (
        <View style={styles.idenRowFive}>
          <Text style={styles.idenKeyCyan}>BIG_FIVE</Text>
          <Text style={styles.idenFiveValue}>{shown.bigFive}</Text>
        </View>
      ) : null}
      <GradientButton label={t("ds.iden.send")} colors={deepSpaceGradients.idenSend} full onPress={onSend} />
      {footer}
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

// ── 회상 / Recall (NARRATIVE) ────────────────────────────────────────────────

export function RecallLensView({ isKo }: { isKo?: boolean } = {}) {
  const { t } = useTranslation("home");
  void isKo; // copy is now t()-driven; prop kept for caller-convention parity
  // UNWIRED ON PURPOSE — era-recall now lives in /audit (PastMeErasView). This
  // variant is kept as a reference for a future per-period recall-coverage view
  // (interview-coverage by life period, still non-trivial + no data pipeline);
  // do NOT wire it to a route as-is — it would duplicate /audit. Renders an
  // honest empty state, never fabricated dot meters, if ever mounted.
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.recall.title")} tag={t("ds.recall.tag")} eyebrow={t("ds.recall.eyebrow")} />
      <View style={styles.centerState}>
        <PixelGlyph name="star" color={deepSpace.accentSoft} size={34} />
        <Text style={styles.stateTitle}>{t("ds.recall.emptyTitle")}</Text>
        <Text style={styles.stateBody}>{t("ds.recall.emptyBody")}</Text>
      </View>
    </ScrollView>
  );
}

// ── 보여지는 나 / Seen (SELF·OTHER) ──────────────────────────────────────────

/** One trait row: self bar, and the peers' bar when they actually answered it. */
function SeenBarRow({ row }: { row: SeenRow }) {
  return (
    <View style={styles.obsRow}>
      <Text style={styles.obsLabel}>{row.label}</Text>
      {row.selfPercent !== null ? (
        <View style={styles.obsTrack}>
          <View style={[styles.obsFill, { width: `${row.selfPercent}%` }]} />
        </View>
      ) : null}
      {row.otherPercent !== null ? (
        <View style={[styles.obsTrack, styles.obsTrackOther]}>
          <View style={[styles.obsFillOther, { width: `${row.otherPercent}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

export function SeenLensView() {
  const { t, i18n } = useTranslation("home");
  const isKo = i18n.language === "ko";
  const locale = isKo ? "ko" : "en";
  const { userId } = useAuth();
  // The user's OWN Big Five means, kept RAW. The rows this screen draws are built
  // by buildSeenRows (lib, unit-tested): it keeps the SOKA-grounded observable
  // three as their own section and adds a second section for traits that only the
  // peer aggregate carries (openness/neuroticism, live since the 5-question peer
  // survey). Keeping the means here rather than the derived三 is what lets the
  // second section show a self bar next to the peers' — the old code discarded the
  // means inside observableSelf() and the new traits had nothing to compare to.
  const [means, setMeans] = useState<BfiMeans | null>(null);
  // T5 F3: the combined other-view (t5_seen_aggregate, min-N 3). Empty until
  // enough informants answered; fail-soft to the honest empty state.
  const [aggregate, setAggregate] = useState<SeenAggregateRow[]>([]);
  // T5 F4: optional LLM synthesis of the self/other gap. Only NUMBERS go in
  // (never informant text); C1/C3/C9 ride callLlm as everywhere else, and
  // the informant-side LLM acks are structurally guaranteed by the 0064 CHECK
  // before any observation row can exist.
  const [synth, setSynth] = useState<string | null>(null);
  const [synthBusy, setSynthBusy] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadSeenAggregate()
      .then((rows) => {
        if (!cancelled) setAggregate(rows);
      })
      .catch(() => {
        if (!cancelled) setAggregate([]);
      });
    loadLatestBfi(getSupabaseClient(), userId)
      .then((loaded) => {
        if (!cancelled) setMeans(loaded);
      })
      .catch(() => {
        if (!cancelled) setMeans(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, locale]);

  // Rows come from the lib, not from a loop over the self-report: whatever the
  // peers actually answered gets drawn, and whatever they did not stays absent.
  // (Peer traits below min-N are not in `aggregate` at all — the RPC gates per
  // key since 0146, so a partial set is the normal answer, not a bug.)
  const rows = buildSeenRows(means, aggregate, locale);
  const { hasGap, informantCount } = rows;
  // No Big Five of their own: the panel is peer answers end to end.
  const peersLead = rows.observable.length === 0 && rows.peerOnly.length > 0;

  async function synthesizeGap() {
    if (!userId || synthBusy) return;
    setSynthBusy(true);
    try {
      const lines = seenGapLines(rows);
      const res = await callLlm({
        userId,
        locale,
        purpose: "gap_synthesize",
        system:
          locale === "ko"
            ? "당신은 자기이해 앱의 세컨비. 아래는 사용자의 자기보고와 지인 " + informantCount + "명의 합산 관찰(비식별 수치)이다. 두 그림의 간극을 2~3문장으로, 따뜻하고 검증적인 톤으로 짚어라. 진단이나 단정은 금지, 수치 나열 금지, 존중하는 제안 하나로 끝내라.\n" + lines
            : "You are SecondB in a self-understanding app. Below are the user's self-report and a combined, de-identified view from " + informantCount + " people who know them. Name the gap between the two pictures in 2-3 sentences, warm and non-judgmental. No verdicts, no number-listing; end with one respectful suggestion.\n" + lines,
        user: locale === "ko" ? "내가 보는 나와 남이 보는 나의 간극을 짚어줘." : "Read the gap between how I see myself and how others see me.",
      });
      setSynth(res.text);
    } catch {
      setSynth(null);
    } finally {
      setSynthBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
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
      {rows.observable.length > 0 || rows.peerOnly.length > 0 ? (
        <View style={styles.obsPanel}>
          {/* Title has to match what the panel actually holds. With no Big Five of
              their own the user sees ONLY peer answers, and calling that "the part
              of you most visible from outside" would attribute peer data to their
              self-report. peersLead covers that case. */}
          <Text style={styles.obsTitle}>
            {hasGap
              ? t("ds.seen.obsTitleGap")
              : peersLead
                ? t("ds.seen.peerOnlyTitle")
                : t("ds.seen.obsTitleSolo")}
          </Text>
          {rows.observable.length > 0 ? <Text style={styles.obsNote}>{t("ds.seen.obsNote")}</Text> : null}
          {peersLead ? <Text style={styles.obsNote}>{t("ds.seen.peerOnlyNote")}</Text> : null}
          {hasGap ? (
            <Text style={styles.obsNote}>
              {t("ds.seen.combinedNote", { count: informantCount })}
            </Text>
          ) : null}
          {rows.observable.map((r) => (
            <SeenBarRow key={r.trait} row={r} />
          ))}
          {/* Traits only the peers answered. Kept in their own section because the
              SOKA claim above ("reads most from outside") covers three traits, not
              five — folding these in would make that sentence untrue. When the
              peers ARE the whole panel the divider is noise, so it is skipped. */}
          {rows.peerOnly.length > 0 && !peersLead ? (
            <>
              <Text style={styles.obsSubTitle}>{t("ds.seen.peerOnlyTitle")}</Text>
              <Text style={styles.obsNote}>{t("ds.seen.peerOnlyNote")}</Text>
            </>
          ) : null}
          {rows.peerOnly.map((r) => (
            <SeenBarRow key={r.trait} row={r} />
          ))}
          {hasGap ? (
            synth ? (
              <Text style={styles.obsNote}>{synth}</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ds.seen.gapReadA11y")}
                onPress={() => void synthesizeGap()}
                disabled={synthBusy}
                style={styles.ghostBtn}
              >
                <Text style={styles.ghostLabel}>
                  {synthBusy ? t("ds.seen.gapReading") : t("ds.seen.gapReadCta")}
                </Text>
              </Pressable>
            )
          ) : null}
        </View>
      ) : null}
      {hasGap ? null : (
      <View style={styles.centerState}>
        <PixelGlyph name="star" color={deepSpace.accentSoft} size={34} />
        {/* Two honest empty states: when the aggregate IS in but the user has no
            Big Five self-report, saying "no peer responses" would misattribute the
            missing half (live QA 2026-07-03: 3 responses in, copy claimed none). */}
        <Text style={styles.stateTitle}>
          {aggregate.length > 0
            ? t("ds.seen.emptyTitleResponses", { count: informantCount })
            : t("ds.seen.emptyTitleNoPeers")}
        </Text>
        <Text style={styles.stateBody}>
          {aggregate.length > 0
            ? t("ds.seen.emptyBodyFinishBigFive")
            : t("ds.seen.emptyBodySendSurvey")}
        </Text>
      </View>
      )}
      <View style={styles.btnRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ds.seen.survey")}
          onPress={() => router.push("/interview")}
          style={styles.ghostBtnFlex}
        >
          <Text style={styles.ghostLabel}>{t("ds.seen.survey")}</Text>
        </Pressable>
        <View style={styles.btnFlex}>
          <GradientButton label={t("ds.seen.share")} colors={deepSpaceGradients.idenSend} full onPress={() => router.push("/peer-invites")} />
        </View>
      </View>
    </ScrollView>
  );
}

// ── 리듬 / Rhythm (ESM) ──────────────────────────────────────────────────────

export function RhythmLensView({ isKo, onLogNow }: { isKo?: boolean; onLogNow?: () => void } = {}) {
  const { t } = useTranslation("home");
  void isKo; // copy is now t()-driven; prop kept for caller-convention parity
  // TODO(data): not reachable from any live route/dock yet; the 7-day mood chart
  // needs per-day ESM samples (loadEsmCount only returns a total), so this
  // renders an honest empty state instead of fabricated bars.
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.rhythm.title")} tag={t("ds.rhythm.tag")} eyebrow={t("ds.rhythm.eyebrow")} />
      <View style={styles.centerState}>
        <PixelGlyph name="star" color={deepSpace.accentSoft} size={34} />
        <Text style={styles.stateTitle}>{t("ds.rhythm.emptyTitle")}</Text>
        <Text style={styles.stateBody}>{t("ds.rhythm.emptyBody")}</Text>
      </View>
      <GradientButton label={t("ds.rhythm.logNow")} full onPress={onLogNow} />
    </ScrollView>
  );
}

// ── 미래의 나 / Possible (ASPIRATION) ────────────────────────────────────────

/** One aspiration draft ("future self" card) — name + short body. */
export type AspirationDraft = { name: string; body: string };

export function PossibleLensView({
  drafts,
  isKo,
}: { drafts?: AspirationDraft[] | null; isKo?: boolean } = {}) {
  const { t } = useTranslation("home");
  void isKo; // copy is now t()-driven; prop kept for caller-convention parity
  // No `drafts` prop (undefined) = design preview: keep the sample cards. A
  // provided value drives real states: aspiration drafts the user wrote, or an
  // empty state when none exist (no fabricated aspirations).
  // TODO(data): no persisted aspiration-draft store exists yet (imagine.ts is
  // dormant plumbing; /imagine redirects to Divergent chat). Wire `drafts` here
  // once divergent-mode aspirations are persisted.
  const demo = drafts === undefined;
  const sample: AspirationDraft[] = [
    { name: t("ds.possible.a1Name"), body: t("ds.possible.a1Body") },
    { name: t("ds.possible.a2Name"), body: t("ds.possible.a2Body") },
    { name: t("ds.possible.a3Name"), body: t("ds.possible.a3Body") },
  ];
  const cards = demo ? sample : drafts ?? [];
  // Selecting a draft sets which aspiration the "first step → /ops" button
  // carries forward. Default to the first card so the CTA is never a no-op.
  const [selected, setSelected] = useState(0);
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.possible.title")} tag={t("ds.possible.tag")} eyebrow={t("ds.possible.eyebrow")} />
      {cards.length === 0 ? (
        <View style={styles.centerState}>
          <PixelGlyph name="star" color={deepSpace.accentSoft} size={34} />
          <Text style={styles.stateTitle}>{t("ds.possible.emptyTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.possible.emptyBody")}</Text>
        </View>
      ) : (
        <>
          <View style={styles.dashedList}>
            {cards.map((c, i) => (
              <Pressable
                key={c.name}
                accessibilityRole="button"
                accessibilityLabel={c.name}
                accessibilityState={{ selected: selected === i }}
                onPress={() => setSelected(i)}
                style={[styles.dashedCard, selected === i && styles.dashedCardOn]}
              >
                <Text style={styles.dashedName}>{c.name}</Text>
                <Text style={styles.dashedBody}>{c.body}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.footerLine}>{t("ds.possible.footer")}</Text>
        </>
      )}
      <View style={styles.btnRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ds.possible.rewrite")}
          onPress={() => router.push({ pathname: "/secondb", params: { mode: "divergent" } })}
          style={styles.ghostBtnFlex}
        >
          <Text style={styles.ghostLabel}>{t("ds.possible.rewrite")}</Text>
        </Pressable>
        <View style={styles.btnFlex}>
          {/* SCREEN_TREE_SPEC §7 /imagine: "이 상상을 첫 걸음으로 → /ops" (the routine is
              proposed/created on the ops side, never auto-applied from here). The
              selected draft rides along as a param so /ops proposes from it. */}
          <GradientButton
            label={t("ds.possible.add")}
            full
            onPress={() =>
              cards.length > 0
                ? router.push({ pathname: "/ops", params: { draft: cards[selected]?.name } })
                : router.push({ pathname: "/secondb", params: { mode: "divergent" } })
            }
          />
        </View>
      </View>
    </ScrollView>
  );
}

// ── 상상하기 / Imagine — divergent seeds (sb-more ImagineScreen 1:1) ─────────
// Seed content lives in ./imagine-seeds (canon-testable .ts module).

// Inline Material-glyph approximations (the app has no icon font — TabIcon /
// ModeGlyph precedent). Small single-path marks, not pixel icon art.
function ImagineGlyph({ kind, color, size = 19 }: { kind: ImagineSeedIcon; color: string; size?: number }) {
  // 세 모양 전부 정본에 이미 있다 — 곡선 path 를 따로 들고 있을 이유가 없었다.
  const glyph = { expand: `expand`, cached: `refresh`, hub: `hub` } as const;
  return <PixelGlyph name={glyph[kind]} color={color} size={size} />;
}

export function ImagineDivergentView({ isKo = true }: { isKo?: boolean } = {}) {
  const { t } = useTranslation("home");
  const [picked, setPicked] = useState<string | null>(null);
  const lang = isKo ? "ko" : "en";
  const seed = IMAGINE_SEEDS.find((s) => s.ko.angle === picked) ?? null;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* intro card — ref: linear-gradient(135deg, tertiary-container → surface-container-low). */}
      <View style={styles.imgIntro}>
        <GradientFill colors={[m3.color.tertiaryContainer, m3.color.surfaceContainerLow]} radius={12} diagonal />
        <View style={styles.imgIntroRow}>
          <PixelGlyph name="lightbulb" color={m3.color.tertiary} size={24} />
          <View style={styles.imgIntroCol}>
            <Text style={styles.imgIntroTitle}>{t("ds.imagine.title")}</Text>
            <Text style={styles.imgIntroBody}>{t("ds.imagine.introBody")}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.imgSection}>{t("ds.imagine.sectionAngles")}</Text>
      <View style={styles.imgSeedList}>
        {IMAGINE_SEEDS.map((s) => {
          const c = s[lang];
          const on = picked === s.ko.angle;
          return (
            // Fabric guard (MdChip LAYOUT NOTE): the outer View owns the
            // container visual (border/bg incl. the selected state); the inner
            // Pressable carries hit target + a11y + ripple only.
            <View key={s.ko.angle} style={[styles.imgSeed, on && styles.imgSeedOn]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={c.title}
                accessibilityState={{ selected: on }}
                android_ripple={{ color: dsAlpha(m3.color.tertiary, 0.12) }}
                onPress={() => setPicked(on ? null : s.ko.angle)}
                style={styles.imgSeedPress}
              >
                <View style={styles.imgSeedIcon}>
                  <ImagineGlyph kind={s.icon} color={m3.color.onTertiaryContainer} />
                </View>
                <View style={styles.imgSeedCol}>
                  <Text style={styles.imgSeedAngle}>{c.angle}</Text>
                  <Text style={styles.imgSeedTitle}>{c.title}</Text>
                  <Text style={styles.imgSeedBody}>{c.body}</Text>
                </View>
                <PixelGlyph name={on ? "expand_less" : "expand_more"} color={m3.color.onSurfaceVariant} size={20} />
              </Pressable>
            </View>
          );
        })}
      </View>

      {seed ? (
        <>
          <Text style={styles.imgSection}>{t("ds.imagine.sectionSteps")}</Text>
          <View style={styles.imgStepList}>
            {seed[lang].steps.map((step, i) => (
              <Pressable
                key={step}
                accessibilityRole="button"
                accessibilityLabel={step}
                onPress={() => router.push({ pathname: "/capture", params: { text: step } })}
                style={styles.imgStep}
                android_ripple={{ color: dsAlpha(deepSpace.accentSoft, 0.12) }}
              >
                <View style={styles.imgStepNum}>
                  <Text style={styles.imgStepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.imgStepText}>{step}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.imgBtnRow}>
            <MdButton
              variant="filled"
              label={t("ds.imagine.toCapture")}
              style={styles.imgBtnFlex}
              onPress={() =>
                // secondb.tsx twiby-branch precedent: /capture reads `text` as a draft prefill.
                router.push({ pathname: "/capture", params: { text: `${seed[lang].title} · ${seed[lang].body}` } })
              }
            />
            <MdButton
              variant="outlined"
              label={t("ds.imagine.more")}
              onPress={() => router.push({ pathname: "/secondb", params: { mode: "divergent" } })}
            />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

// ── 성장·과거의 나 / Past-me era timeline (clone-audit 17-audit) ──────────────
// Reference AuditScreen (sb-screens-know.jsx): a "과거의 나" headline + subtitle
// over a left-rail timeline of 5 life eras; tapping an era opens the open-ended
// interview (reference go('interview')). NAVIGATION-ONLY by constraint: the
// reference's per-era "또렷함 L{n}" dots were fixed constants shown to every
// user identically — fabricated brightness, which the 정직한 밝기 L1~L5 rule
// forbids (logic audit 2026-07-21, docs/handoff/logic_260721.md). No per-era
// coverage pipeline exists yet (see RecallLensView above), so the timeline
// shows no level at all; real levels may return WITH a real data source.
// 시기 목록은 **고정이 아니라 나이에서 만든다** (Simon 결정, 2026-08-24).
//
// 예전에는 여기 `AUDIT_ERAS` 상수 5개(유아기/아동기/청소년기/청년기/현재)가
// 있었고, `ERA_PERIOD` 가 그걸 엔진의 시기 3개로 접어 넣었다. 그 표가
// **유아기·아동기·청소년기를 전부 `teens` 하나로 뾭개서**, 서로 다른 세 칸을
// 눌러도 같은 인터뷰가 열렸다. 동시에 엔진의 `childhood`·`thirties` 는 어느
// 화면에서도 도달할 수 없어 25칸 중 10칸이 죽어 있었다.
//
// 이제는 `periodsForAge()` 가 사용자가 살아온 칸만 만들고, 그 id 가 그대로
// 인터뷰로 넘어간다. 중간 변환표는 없다 -- 사이에 표를 두는 것이 바로 그
// 뾭개짐을 만들었던 구조다.

/** 범위 줄. `current` 는 **빈 문자열**을 돌려준다 -- 이름이 이미 "지금"이라
 *  범위까지 "지금"이면 같은 말이 두 줄 쌓인다(실측으로 확인). */
/** 별 하나의 나이 범위 한 줄. 주제 별(직장·지금)은 나이가 없으므로 빈 문자열. */
function starRangeLabel(
  band: { from: number; to: number | null } | null,
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  if (!band) return "";
  if (band.to === null) return t("ds.audit.rangeFrom", { from: band.from });
  if (band.from === 0) return t("ds.audit.rangeUnder", { to: band.to + 1 });
  return t("ds.audit.rangeSpan", { from: band.from, to: band.to });
}

export function PastMeErasView({ isKo }: { isKo?: boolean } = {}) {
  const { t } = useTranslation("home");
  const { age } = useAuth();
  const { origin: originParam } = useLocalSearchParams<{ origin?: string | string[] }>();
  const growthOrigin = (Array.isArray(originParam) ? originParam[0] : originParam) === "domain-growth";
  void isKo; // copy is t()-driven; prop kept for caller-convention parity
  // 별 일곱 그대로. 인터뷰가 없는 프로필은 여기 목록에 안 낸다 -- 이 화면은
  // "어느 시기를 파러 갈까" 를 고르는 자리다.
  const stars = useMemo(() => SEVEN_STARS.filter((s) => s.period !== null), []);
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.auditTitle}>{t("ds.audit.title")}</Text>
      <Text style={styles.auditSubtitle}>{t("ds.audit.subtitle")}</Text>
      <View style={styles.auditTimeline}>
        <View style={styles.auditRail} />
        <View style={styles.auditEraList}>
          {stars.map((star) => {
            // 아직 안 온 시기는 잠근다. 살지 않은 때를 물어보는 것은
            // 지어내라는 말이다 -- 밝기의 정직성이 여기서도 우선이다.
            const locked = isUnlived(star.id, age);
            const range = starRangeLabel(star.ageBand, t);
            return (
              <View key={star.id} style={styles.auditEraRow}>
                <View style={styles.auditNode} />
                <MdCard
                  variant="filled"
                  accessibilityLabel={t(`ds.star.${star.key}`)}
                  onPress={
                    locked
                      ? undefined
                      : () => router.push({
                          pathname: "/interview",
                          params: growthOrigin
                            ? { period: star.period ?? "now", origin: "domain-growth" }
                            : { period: star.period ?? "now" },
                        })
                  }
                >
                  <View style={[styles.auditCardRow, locked ? { opacity: 0.45 } : null]}>
                    <View style={styles.auditEraCol}>
                      <Text style={styles.auditEraName}>{t(`ds.star.${star.key}`)}</Text>
                      <Text style={styles.auditEraRange}>
                        {locked ? t("ds.audit.notYet") : range}
                      </Text>
                    </View>
                    {locked ? null : (
                      <PixelGlyph name="chevron_right" color={m3.color.onSurfaceVariant} size={20} />
                    )}
                  </View>
                </MdCard>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

// ── 관계·지식 / Relational (RELATIONS) ───────────────────────────────────────

export function RelationalLensView({ isKo, onAddData }: { isKo?: boolean; onAddData?: () => void } = {}) {
  const { t } = useTranslation("home");
  void isKo; // copy is now t()-driven; prop kept for caller-convention parity
  // UNWIRED ON PURPOSE — relational insight is covered by /attachment (attachment
  // style) plus the people + wiki graphs. This variant is a reference for a
  // future dedicated relations-graph view (relations-graph + wiki concepts, no
  // data pipeline yet); do NOT wire it as-is — it would duplicate /attachment.
  // Renders an honest empty state, never fabricated chips, if ever mounted.
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.relational.title")} tag={t("ds.relational.tag")} eyebrow={t("ds.relational.eyebrow")} />
      <View style={styles.centerState}>
        <PixelGlyph name="star" color={deepSpace.accentSoft} size={34} />
        <Text style={styles.stateTitle}>{t("ds.relational.emptyTitle")}</Text>
        <Text style={styles.stateBody}>{t("ds.relational.emptyBody")}</Text>
      </View>
      <GradientButton label={t("ds.relational.addData")} full onPress={onAddData} />
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

/** One real domain (framework family) with its piece count, for ValuesLensView. */
export type ValuesDomain = { key: string; label: string; count: number };

export function ValuesLensView({
  domains,
  loading,
  hasError,
  isKo,
  onAddData,
  onRetry,
}: {
  domains?: ValuesDomain[] | null;
  loading?: boolean;
  hasError?: boolean;
  isKo?: boolean;
  onAddData?: () => void;
  onRetry?: () => void;
} = {}) {
  const { t } = useTranslation("home");
  void isKo; // copy is now t()-driven; prop kept for caller-convention parity
  // UNWIRED ON PURPOSE — the values spectrum ships in /values (AxisCheckScreen).
  // This lens variant is not wired to a route; doing so would duplicate /values.
  // It is kept because it accepts a real `domains` prop: if values ever move to
  // a data-driven spectrum, deriveValues gives a framework RANKING but no per-
  // framework SCORE yet, so a real ValuesDomain[] loader is still owed before
  // this could replace the canon preview honestly (no fabricated scores).
  // No `domains` prop (undefined) = design preview: keep the sample rows. A
  // provided value drives real states from the user's audit-response records,
  // grouped by framework family; counts scale the bars relative to the top one.
  const demo = domains === undefined;
  const real = domains ?? [];
  const max = real.reduce((m, d) => Math.max(m, d.count), 0);
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.values.title")} tag={t("ds.values.tag")} eyebrow={t("ds.values.eyebrow")} />
      {!demo && loading ? (
        <View style={styles.centerState}>
          <Text style={styles.stateBody}>{t("ds.values.loading")}</Text>
        </View>
      ) : !demo && hasError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>{t("ds.lens.errorTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.errorBody")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("ds.lens.errorCta")} onPress={onRetry} style={styles.ghostBtn}>
            <Text style={styles.ghostLabel}>{t("ds.lens.errorCta")}</Text>
          </Pressable>
        </View>
      ) : !demo && real.length === 0 ? (
        <View style={styles.centerState}>
          <PixelGlyph name="star" color={deepSpace.accentSoft} size={34} />
          <Text style={styles.stateTitle}>{t("ds.values.emptyTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.values.emptyBody")}</Text>
        </View>
      ) : (
        <>
          <View style={styles.domainList}>
            {demo ? (
              <>
                <DomainRow label={t("ds.values.domain1")} count={t("ds.values.domain1Count")} value={100} />
                <DomainRow label={t("ds.values.domain2")} count={t("ds.values.domain2Count")} value={69} />
                <DomainRow label={t("ds.values.domain3")} count={t("ds.values.domain3Count")} value={26} />
              </>
            ) : (
              real.map((d) => (
                <DomainRow
                  key={d.key}
                  label={d.label}
                  count={t("ds.values.pieceCount", { count: d.count })}
                  value={max > 0 ? Math.round((d.count / max) * 100) : 0}
                />
              ))
            )}
          </View>
          {demo ? (
            <View style={styles.insightCard}>
              <Text style={styles.insightText}>{t("ds.values.conclusion")}</Text>
            </View>
          ) : null}
        </>
      )}
      <GradientButton label={t("ds.values.addData")} full onPress={onAddData} />
    </ScrollView>
  );
}

// ── 북극성 종합 / Me synthesis (layer C) ──────────────────────────────────────
// The 10-me screen: the aggregate 북극성 hero (dominant, full glow) sits over the
// seven receding domain stars (layer A) and the hidden validation entry (layer B).
// Visual Tier rule: 북극성 is the one bright hero; the 7 domain cards recede
// (smaller, cyan-accent, no soul glow). Levels here are the L1~L5 brightness
// ladder (coverage-driven display) — filled dots = how much of that domain is in.
const ME_LADDER = 5;
// Capture reading order (10-me): 커리어 · 재정 · 관계 · 성장 · 건강 · 휴식 · 담아내기.
// (level below is the prototype's example fill; the live deck ignores it and
// reads real per-domain levels from loadDomainLevels via the domainLevels prop.)
const ME_DOMAIN_ROWS: { id: DomainId; level: 1 | 2 | 3 | 4 | 5 }[] = [
  { id: "career", level: 3 },
  { id: "finance", level: 2 },
  { id: "relation", level: 3 },
  { id: "growth", level: 3 },
  { id: "health", level: 2 },
  { id: "recreation", level: 2 },
  { id: "collect", level: 4 },
];

function BrightDots({ level }: { level: number }) {
  return (
    <View style={styles.meDotRow}>
      {Array.from({ length: ME_LADDER }).map((_, i) => (
        <View key={i} style={[styles.meDot, i < level ? styles.meDotOn : styles.meDotOff]} />
      ))}
    </View>
  );
}

export function MeSynthView({ isKo, domainLevels }: { isKo?: boolean; domainLevels?: Partial<Record<DomainId, number>> } = {}) {
  const { t, i18n } = useTranslation("home");
  const ko = isKo ?? i18n.language === "ko";
  const levelFor = (id: DomainId): number => domainLevels?.[id] ?? 1;
  // Synthesis confidence = how many domains are filled past the floor (real, not
  // the prototype's fixed 3/5). Fresh account → 0 (honest, nothing synthesized).
  const confidence = ME_DOMAIN_ROWS.reduce((n, r) => n + (levelFor(r.id) >= 2 ? 1 : 0), 0);
  return (
    <ScrollView contentContainerStyle={styles.meBody}>
      {/* layer C — 북극성 hero synthesis (dominant, soul glow) */}
      <View style={styles.meHero}>
        <GradientFill colors={deepSpaceGradients.idenSend} radius={20} />
        <View style={styles.meHeroTop}>
          <View style={styles.meOrb}>
            <View style={styles.meOrbCore} />
          </View>
          <View style={styles.meHeroCopy}>
            <Text style={styles.meEyebrow}>{t("ds.me.eyebrow")}</Text>
            <Text style={styles.meHeadline}>{t("ds.me.headline")}</Text>
          </View>
        </View>
        <View style={styles.meHeroFoot}>
          <View style={styles.meHeroMeta}>
            <Text style={styles.meMetaLabel}>{t("ds.me.synthMeta")}</Text>
            <BrightDots level={confidence} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("ds.me.refine")}
            onPress={() => router.push("/northstar")}
            style={styles.meRefine}
          >
            <CaptureIcon name="edit" color={deepSpace.textHi} size={14} />
            <Text style={styles.meRefineLabel}>{t("ds.me.refine")}</Text>
          </Pressable>
        </View>
      </View>

      {/* layer A — the seven life-domain stars (recede below 북극성) */}
      <View style={styles.meSectionHead}>
        <Text style={styles.meSectionTitle}>{t("ds.me.domainsTitle")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ds.me.toConstellation")}
          onPress={() => router.replace("/")}
          android_ripple={{ color: dsAlpha(deepSpace.accentSoft, 0.12) }}
        >
          <Text style={styles.meLink}>{t("ds.me.toConstellation")}</Text>
        </Pressable>
      </View>
      <View style={styles.meGrid}>
        {ME_DOMAIN_ROWS.map(({ id }) => {
          const star = getDomainStar(id);
          const name = ko ? star.nameKo : star.nameEn;
          const level = levelFor(id);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={name}
              onPress={() => router.push({ pathname: "/records", params: { tags: `domain:${id}` } })}
              style={styles.meCard}
            >
              <View style={styles.meCardTop}>
                <View style={styles.meCardDot} />
                <Text style={styles.meCardLevel}>{`L${level}`}</Text>
              </View>
              <Text style={styles.meCardName}>{name}</Text>
              <BrightDots level={level} />
            </Pressable>
          );
        })}
      </View>

      {/* layer B — hidden validation layer (밝기 정직성): 별빛 ≠ 확신 */}
      <View style={styles.meSectionHead}>
        <Text style={styles.meSectionTitle}>{t("ds.me.hiddenTitle")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ds.me.viewValidation")}
          onPress={() => router.push("/big-five")}
          android_ripple={{ color: dsAlpha(deepSpace.accentSoft, 0.12) }}
        >
          <Text style={styles.meLink}>{t("ds.me.viewValidation")}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("ds.me.viewValidation")}
        onPress={() => router.push("/big-five")}
        style={[styles.meValidateCard]}
      >
        <Text style={styles.meValidateText}>{t("ds.me.hiddenBody")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 28, gap: 0 },
  chatBody: { gap: 10 },
  pixelTitle: { color: deepSpace.accentBright, fontSize: 16, fontFamily: fontFamilies.readable, fontWeight: "700" },

  // ── 담기 / Capture (M3 track, clone-audit 06-capture) ──────────────────────
  capScroll: { flex: 1 },
  capBody: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 20 },
  capModeRow: { flexDirection: "row", gap: 4 },
  capModeCell: { flex: 1, minWidth: 0 },
  capFormatRow: { flexDirection: "row", gap: 4, marginTop: 8 },
  capFormatCell: { flex: 1, minWidth: 0 },
  capTileHit: { width: "100%", minHeight: 48 },
  capTileRest: { flex: 1 },
  capTileSunk: { flex: 1, transform: [{ translateY: m3.spacing.s1 }] },
  capTileSurface: { flex: 1 },
  capTileContent: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  capTileContentHorizontal: { flexDirection: "row", gap: 6 },
  capTileLabel: { ...m3TextStyle("labelMedium"), textAlign: "center" },
  capForm: { gap: 10, marginTop: 10 },
  capFieldHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  capFieldLabel: { color: m3.color.onSurfaceVariant, fontSize: 12, lineHeight: 16, fontFamily: m3.font.brand, fontWeight: "500" },
  capFieldRequired: { color: m3.color.primary, fontSize: 12, lineHeight: 16, marginLeft: 2, fontFamily: m3.font.brand, fontWeight: "700" },
  capFieldInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    borderRadius: m3.shape.none,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: m3.color.surfaceContainerHighest,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: 15,
  },
  capFieldInputTall: { minHeight: 96 },
  capFreeInput: { minHeight: 300 },
  capMono: { fontFamily: m3.font.mono, fontSize: 12 },
  capHint: { color: m3.color.onSurfaceVariant, fontSize: 12, lineHeight: 18, fontFamily: m3.font.brand },
  capTodoCol: { gap: 8, marginTop: 16 },
  capTodoRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    borderRadius: m3.shape.none,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  capTodoInput: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand, fontSize: 15, padding: 0 },
  capTodoAdd: { alignSelf: "flex-start" },
  capSubmit: { alignSelf: "stretch", marginTop: 12 },
  capFullWidth: { alignSelf: "stretch", marginTop: 8 },
  capErrorCard: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.errorContainer,
  },
  capErrorText: { color: m3.color.onErrorContainer, fontSize: 12, lineHeight: 18, fontFamily: m3.font.brand },

  // shared gradient button
  gButton: {
    overflow: "hidden",
    borderRadius: m3.shape.none,
    alignSelf: "flex-start",
    marginTop: 18,
  },
  // bare touch surface inside the gradient shell (#680 Fabric-safe)
  gButtonPress: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  gButtonFull: { alignSelf: "stretch" },
  // width+textAlign keep the label centered on Android regardless of how the
  // gradient absolute-fill affects the flex pass (device QA 2026-07-02).
  gButtonLabel: { color: deepSpace.bgEdge, fontSize: 14, fontFamily: fontFamilies.readable, fontWeight: "700", width: "100%", textAlign: "center" },
  // 담기 4W1H boxes (canon track, rev2 P4a).
  captureModeToggle: { marginTop: 14, alignSelf: "stretch" },
  fourwCol: { gap: 10, marginTop: 12 },
  fourwLabel: { color: dsAlpha(deepSpace.text, 0.75), fontSize: 12, fontFamily: fontFamilies.readable, marginBottom: 4 },
  fourwLabelRequired: { color: deepSpace.textHi },
  fourwInput: { minHeight: 48, marginTop: 0 },
  fourwInputTall: { minHeight: 84 },


  // chips
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  chipLabel: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: fontFamilies.readable },

  // capture
  inputBoxText: {
    marginTop: 14,
    minHeight: 132,
    padding: 14,
    borderRadius: m3.shape.none,
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
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: dsAlpha(deepSpace.soul, 0.3),
  },
  noteText: { color: dsAlpha(deepSpace.soul, 0.85), fontSize: 11.5, lineHeight: 18, fontFamily: fontFamilies.readable },

  // chat
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "82%",
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
    backgroundColor: dsAlpha(deepSpace.accent, 0.16),
  },
  userText: { color: deepSpace.textHi, fontSize: 12.5, lineHeight: 18, fontFamily: fontFamilies.readable },
  aiBubble: {
    alignSelf: "flex-start",
    maxWidth: "86%",
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderWidth: 1,
    borderColor: dsAlpha(deepSpace.soul, 0.25),
    backgroundColor: dsAlpha(deepSpace.soul, 0.1),
  },
  aiText: { color: deepSpace.textHi, fontSize: 12.5, lineHeight: 19, fontFamily: fontFamilies.readable },
  evidenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignSelf: "flex-start" },

  // lens — state toggle
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  toggleBtnOn: { backgroundColor: deepSpace.cardPressed, borderColor: deepSpace.accent },
  toggleLabel: { color: deepSpace.accentBright, fontSize: 11, fontFamily: fontFamilies.readable },

  // lens — empty / error
  centerState: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 12 },
  stateMark: { fontSize: 34, color: deepSpace.accentSoft },
  // ⚠ 흐림은 **색**으로 낸다(규칙 4). 예전에는 `opacity: 0.7` 이었다.
  stateMarkDim: { color: dsAlpha(deepSpace.accentSoft, 0.7) },
  stateTitle: { color: deepSpace.accentBright, fontSize: 15, fontFamily: fontFamilies.readable, fontWeight: "700" },
  stateBody: { color: dsAlpha(deepSpace.text, 0.6), fontSize: 12, lineHeight: 19, textAlign: "center", fontFamily: fontFamilies.readable },
  obsPanel: { gap: 8, marginBottom: 16, padding: 14, borderRadius: m3.shape.none, borderWidth: 1, borderColor: dsAlpha(deepSpace.accentSoft, 0.3), backgroundColor: dsAlpha(deepSpace.accentSoft, 0.06) },
  obsTitle: { color: deepSpace.accentBright, fontSize: 14, fontFamily: fontFamilies.readable, fontWeight: "600" },
  // Section divider for peer-only traits: same family as obsTitle but quieter, so
  // the SOKA three stay the lead and these read as an addition, not a rival claim.
  obsSubTitle: { color: dsAlpha(deepSpace.text, 0.8), fontSize: 12, fontFamily: fontFamilies.readable, fontWeight: "600", marginTop: 10 },
  obsNote: { color: dsAlpha(deepSpace.text, 0.55), fontSize: 11, lineHeight: 16, fontFamily: fontFamilies.readable, marginBottom: 4 },
  obsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  obsLabel: { color: dsAlpha(deepSpace.text, 0.85), fontSize: 12, width: 64, fontFamily: fontFamilies.readable },
  obsTrack: { flex: 1, height: 6, borderRadius: m3.shape.none, backgroundColor: dsAlpha(deepSpace.text, 0.12), overflow: "hidden" },
  obsFill: { height: "100%", borderRadius: m3.shape.none, backgroundColor: deepSpace.accentSoft },
  // T5 F3: the combined other-view bar (violet family = legendDotOther).
  obsTrackOther: { marginTop: 3 },
  obsFillOther: { height: "100%", borderRadius: m3.shape.none, backgroundColor: deepSpace.accentSoft },
  ghostBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  ghostLabel: { color: deepSpace.accentSoft, fontSize: 14, fontFamily: fontFamilies.readable, fontWeight: "600" },

  // lens — filled
  filledHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  level: { color: deepSpace.mint, fontSize: 12, fontFamily: m3.font.mono },
  traits: { marginTop: 16, gap: 11 },
  traitRow: { gap: 4 },
  traitHead: { flexDirection: "row", justifyContent: "space-between" },
  traitLabel: { color: dsAlpha(deepSpace.text, 0.7), fontSize: 11, fontFamily: fontFamilies.readable },
  traitValue: { color: dsAlpha(deepSpace.text, 0.7), fontSize: 11, fontFamily: fontFamilies.readable },
  traitValueUp: { color: deepSpace.mint },
  traitTrack: { height: 7, borderRadius: m3.shape.none, overflow: "hidden", backgroundColor: dsAlpha(deepSpace.accent, 0.12) },
  traitFill: { height: "100%", borderRadius: m3.shape.none, overflow: "hidden" },
  insightCard: {
    marginTop: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: dsAlpha(deepSpace.mint, 0.25),
    backgroundColor: dsAlpha(deepSpace.mint, 0.05),
  },
  insightText: { color: deepSpace.accentBright, fontSize: 11.5, lineHeight: 18, fontFamily: fontFamilies.readable },

  // ── 검증 · Big Five (M3, clone-audit 14-bigfive) ──────────────────────────
  bfBody: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  bfHeadRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  bfHeadline: { color: m3.color.onSurface, fontFamily: m3.font.brand, flexShrink: 1 },
  bfLevelChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.primaryContainer,
  },
  bfLevelChipText: { color: m3.color.onPrimaryContainer, fontFamily: m3.font.brand, fontWeight: "600" },
  bfConfidence: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  bfSubtitle: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4, marginBottom: 18 },
  bfTraits: { gap: 14 },
  bfTraitRow: { gap: 6 },
  bfTraitHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  bfTraitLabel: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  bfTraitValue: { fontFamily: m3.font.brand, fontWeight: "600" },
  bfExtraCard: { marginTop: 12, padding: 14 },
  bfExtraRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bfExtraLabel: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand },
  bfActions: { flexDirection: "row", gap: 8, marginTop: 18 },
  bfActionBtn: { flex: 1 },
  bfCenterState: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 12 },
  bfStateTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, textAlign: "center" },
  bfStateBody: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, textAlign: "center", marginBottom: 4 },
  // ── Attachment (애착 · ECR) result view ──
  atLevelChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: m3.shape.none, backgroundColor: m3.color.tertiaryContainer },
  atLevelChipText: { color: m3.color.onTertiaryContainer, fontFamily: m3.font.brand, fontWeight: "600" },
  atMapCard: { padding: 16 },
  atMap: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
    borderRadius: m3.shape.none,
    overflow: "hidden",
    backgroundColor: m3.color.surfaceContainer,
  },
  // ⚠ 사분면 라벨(안정·몰입·회피·혼란)은 **미리 합성한 색**이다
  //   (PIXEL-CLAY 규칙 4 — 정적 반투명 금지). 바탕은 바로 위 `atMap` 의
  //   `surfaceContainer` 다. 지도 배경을 바꾸면 이 값도 같이 다시 잴 것.
  //   실측으로 걸렸다: `/attachment` 화면의 A축이 6/30 이었고 그 넷이 전부 이거였다.
  atQuad: {
    position: "absolute",
    color: flattenAlpha(m3.color.onSurfaceVariant, 0.7, m3.color.surfaceContainer),
    fontFamily: m3.font.brand,
  },
  atQuadTop: { top: 8 },
  atQuadBottom: { bottom: 8 },
  atQuadLeft: { left: 10 },
  atQuadRight: { right: 10 },
  atAxisV: { position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, backgroundColor: m3.color.outlineVariant },
  atAxisH: { position: "absolute", top: "50%", left: 0, right: 0, height: 1, backgroundColor: m3.color.outlineVariant },
  atPointWrap: { position: "absolute", width: 30, height: 30, marginLeft: -15, marginTop: -15, alignItems: "center", justifyContent: "center" },
  atPointHalo: { position: "absolute", width: 30, height: 30, borderRadius: m3.shape.none, backgroundColor: dsAlpha(m3.color.primary, 0.2) },
  atPoint: {
    width: 18,
    height: 18,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.primary,
    shadowColor: m3.color.primary,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  atAxisFooter: { position: "absolute", bottom: 4, alignSelf: "center", fontSize: 10, color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  atResultRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" },
  atResultLabel: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  atScore: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  // 세컨비 insight — one plain card (head + message), per the capture.
  atInsightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: m3.shape.medium,
    backgroundColor: m3.color.secondaryContainer,
  },
  atInsightText: { flex: 1, color: m3.color.onSecondaryContainer, fontFamily: m3.font.brand },

  // iden
  idCard: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: dsAlpha(deepSpace.soul, 0.3),
    backgroundColor: dsAlpha(deepSpace.soul, 0.07),
    gap: 7,
  },
  idName: { color: deepSpace.accentBright, fontSize: 12, fontFamily: m3.font.mono },
  idBadges: { flexDirection: "row", gap: 5 },
  idBadge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: m3.shape.none, backgroundColor: dsAlpha(deepSpace.soul, 0.14) },
  idBadgeText: { color: dsAlpha(deepSpace.soul, 0.8), fontSize: 10, fontFamily: m3.font.mono },
  idBadgeSigned: { backgroundColor: dsAlpha(deepSpace.mint, 0.1) },
  idBadgeSignedText: { color: deepSpace.mint, fontSize: 9, fontFamily: fontFamilies.readable },
  idenRowNorth: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 2,
    borderLeftColor: deepSpace.soul,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: dsAlpha(deepSpace.soul, 0.06),
  },
  idenKey: { color: dsAlpha(deepSpace.soul, 0.65), fontSize: 10, fontFamily: m3.font.mono, letterSpacing: 0.8 },
  idenKeyCyan: { color: dsAlpha(deepSpace.accentSoft, 0.6), fontSize: 10, fontFamily: m3.font.mono, letterSpacing: 0.8 },
  idenNorthValue: { color: deepSpace.accentBright, fontSize: 11.5, lineHeight: 18, marginTop: 5, fontFamily: fontFamilies.readable },
  idenRowFive: {
    marginTop: 7,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 2,
    borderLeftColor: deepSpace.accent,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: deepSpace.card,
  },
  idenFiveValue: { color: deepSpace.accentSoft, fontSize: 10, marginTop: 6, fontFamily: m3.font.mono },

  // ── star-lens shared head ──────────────────────────────────────────────────
  lensHead: { gap: 6, marginBottom: 16 },
  lensHeadTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  lensTag: { marginLeft: "auto", color: dsAlpha(deepSpace.accent, 0.55), fontSize: 10, fontFamily: m3.font.mono, letterSpacing: 0.8 },
  lensEyebrow: { color: deepSpace.textMid, fontSize: 12.5, lineHeight: 18, fontFamily: fontFamilies.readable },
  pixelHint: { color: dsAlpha(deepSpace.accentSoft, 0.6), fontSize: 10, fontFamily: m3.font.mono, letterSpacing: 0.8, marginBottom: 12 },
  sectionGap: { marginTop: 18 },
  footerLine: { marginTop: 18, color: dsAlpha(deepSpace.accentSoft, 0.55), fontSize: 11, lineHeight: 17, textAlign: "center", fontFamily: fontFamilies.readable },

  // dot meter
  dotRow: { flexDirection: "row", gap: 4, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: m3.shape.none },
  dotOn: { backgroundColor: deepSpace.accent },
  dotOff: { backgroundColor: dsAlpha(deepSpace.accent, 0.25) },

  // recall grid
  grid2: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 9 },
  gridCard: {
    width: "48%",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  gridName: { color: deepSpace.accentBright, fontSize: 13, fontFamily: fontFamilies.readable, fontWeight: "600" },
  gridAge: { color: dsAlpha(deepSpace.accentSoft, 0.5), fontSize: 9.5, marginTop: 3, fontFamily: fontFamilies.readable },

  // seen - legend
  legendRow: { flexDirection: "row", gap: 14, marginBottom: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: m3.shape.none },
  legendDotSelf: { backgroundColor: deepSpace.accent },
  legendDotOther: { backgroundColor: deepSpace.soulDeep },
  legendLabel: { color: deepSpace.textMid, fontSize: 11, fontFamily: fontFamilies.readable },

  // seen - compare rows
  compareList: { gap: 18 },
  compareRow: { gap: 4 },
  compareDelta: { color: deepSpace.accentSoft, fontSize: 12, fontFamily: m3.font.mono },
  compareTrack: { height: 6, borderRadius: m3.shape.none, overflow: "hidden" },
  compareTrackSelf: { backgroundColor: dsAlpha(deepSpace.accent, 0.16), marginBottom: 4 },
  compareTrackOther: { backgroundColor: dsAlpha(deepSpace.soul, 0.16) },
  compareFillSelf: { height: "100%", borderRadius: m3.shape.none, backgroundColor: deepSpace.accent },
  compareFillOther: { height: "100%", borderRadius: m3.shape.none, backgroundColor: deepSpace.soulDeep },

  // soul-tinted conclusion card (non-positive: violet, not mint)
  soulCard: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: dsAlpha(deepSpace.soul, 0.28),
    backgroundColor: dsAlpha(deepSpace.soul, 0.06),
  },
  soulCardText: { color: deepSpace.textHi, fontSize: 12, lineHeight: 19, fontFamily: fontFamilies.readable },

  // two-button rows
  btnRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  btnFlex: { flex: 1 },
  ghostBtnFlex: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    alignItems: "center",
    justifyContent: "center",
  },

  // rhythm chart
  chartCard: {
    padding: 16,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  chartRow: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 6 },
  chartCol: { flex: 1, alignItems: "center", gap: 6 },
  chartBarTrack: { width: "100%", height: 100, justifyContent: "flex-end" },
  chartBar: { width: "100%", borderRadius: m3.shape.none, overflow: "hidden" },
  chartDay: { color: dsAlpha(deepSpace.accentSoft, 0.5), fontSize: 10, fontFamily: fontFamilies.readable },
  chartDayPeak: { color: deepSpace.accentBright },

  // possible - dashed cards
  dashedList: { gap: 13 },
  dashedCard: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: m3.shape.none,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: dsAlpha(deepSpace.accent, 0.4),
    backgroundColor: dsAlpha(deepSpace.accent, 0.03),
  },
  dashedCardOn: { borderColor: deepSpace.accent, backgroundColor: dsAlpha(deepSpace.accent, 0.08) },
  dashedName: { color: deepSpace.accentBright, fontSize: 14, fontFamily: fontFamilies.readable, fontWeight: "600", marginBottom: 5 },
  dashedBody: { color: deepSpace.textMid, fontSize: 12, lineHeight: 18, fontFamily: fontFamilies.readable },

  // relational
  chipRowTight: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // values - domain rows
  domainList: { gap: 13 },
  domainRow: {
    gap: 9,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  domainLabel: { color: deepSpace.accentBright, fontSize: 14, fontFamily: fontFamilies.readable, fontWeight: "600" },
  domainCount: { color: dsAlpha(deepSpace.accentSoft, 0.6), fontSize: 12, fontFamily: m3.font.mono },

  // ── imagine (divergent seeds) — ref sb-more ImagineScreen tokens ────────────
  imgIntro: { borderRadius: m3.shape.none, overflow: "hidden", marginTop: 4 },
  imgIntroRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 16 },
  imgIntroCol: { flex: 1, minWidth: 0 },
  imgIntroTitle: { fontSize: 16, lineHeight: 24, fontWeight: "500", color: m3.color.onSurface, fontFamily: fontFamilies.readable },
  imgIntroBody: { fontSize: 12, lineHeight: 16, color: m3.color.onSurfaceVariant, marginTop: 3, fontFamily: fontFamilies.readable },
  imgSection: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: m3.color.onSurfaceVariant, marginTop: 20, marginBottom: 10, fontFamily: fontFamilies.readable },
  imgSeedList: { gap: 10 },
  imgSeed: { borderRadius: m3.shape.none, borderWidth: 1, borderColor: m3.color.outlineVariant, overflow: "hidden" },
  imgSeedOn: { borderWidth: 1.5, borderColor: m3.color.tertiary, backgroundColor: m3.color.surfaceContainerLow },
  imgSeedPress: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 14 },
  imgSeedIcon: { width: 38, height: 38, borderRadius: m3.shape.none, alignItems: "center", justifyContent: "center", backgroundColor: m3.color.tertiaryContainer },
  imgSeedCol: { flex: 1, minWidth: 0 },
  imgSeedAngle: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: m3.color.tertiary, fontFamily: fontFamilies.readable },
  imgSeedTitle: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: m3.color.onSurface, fontFamily: fontFamilies.readable },
  imgSeedBody: { fontSize: 12, lineHeight: 16, color: m3.color.onSurfaceVariant, marginTop: 4, fontFamily: fontFamilies.readable },
  imgStepList: { gap: 8 },
  imgStep: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderRadius: m3.shape.none, borderWidth: 1, borderColor: m3.color.outlineVariant },
  imgStepNum: { width: 24, height: 24, borderRadius: m3.shape.none, alignItems: "center", justifyContent: "center", backgroundColor: m3.color.secondaryContainer },
  imgStepNumText: { fontFamily: m3.font.mono, fontSize: 12, fontWeight: "700", color: m3.color.onSecondaryContainer },
  imgStepText: { flex: 1, fontSize: 14, lineHeight: 20, color: m3.color.onSurface, fontFamily: fontFamilies.readable },
  imgBtnRow: { flexDirection: "row", gap: 8, marginTop: 16 },

  // ── 과거의 나 era timeline (clone-audit 17-audit) ──────────────────────────
  auditTitle: { fontSize: 24, lineHeight: 32, fontWeight: "500", color: m3.color.onSurface, marginTop: 8, marginBottom: 4, fontFamily: fontFamilies.readable },
  auditSubtitle: { fontSize: 14, lineHeight: 20, color: m3.color.onSurfaceVariant, marginBottom: 18, fontFamily: fontFamilies.readable },
  auditTimeline: { position: "relative", paddingLeft: 20 },
  auditRail: { position: "absolute", left: 5, top: 6, bottom: 6, width: 2, backgroundColor: m3.color.outlineVariant },
  auditEraList: { gap: 10 },
  auditEraRow: { position: "relative" },
  // rev2 AuditScreen era node: filled primary center + surface ring (bullseye),
  // matching sb-screens-know.jsx (bg primary, 2px surface border). The prior
  // dark-center hollow ring inverted the reference's bright core.
  auditNode: { position: "absolute", left: -20, top: 17, width: 14, height: 14, borderRadius: m3.shape.none, backgroundColor: m3.color.primary, borderWidth: 2, borderColor: m3.color.surface, zIndex: 1 },
  auditCardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  auditEraCol: { flex: 1, minWidth: 0 },
  auditEraName: { fontSize: 16, lineHeight: 24, fontWeight: "500", color: m3.color.onSurface, fontFamily: fontFamilies.readable },
  auditEraRange: { fontSize: 12, lineHeight: 16, color: m3.color.onSurfaceVariant, fontFamily: fontFamilies.readable },
  imgBtnFlex: { flex: 1 },

  // ── 북극성 종합 / me synthesis (10-me) ──────────────────────────────────────
  meBody: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 28 },
  // layer C hero — dominant, soul (violet) identity
  meHero: { position: "relative", borderRadius: m3.shape.none, overflow: "hidden", padding: 16, marginBottom: 18 },
  meHeroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  meOrb: {
    width: 46,
    height: 46,
    borderRadius: m3.shape.none,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: dsAlpha(deepSpace.bgEdge, 0.45),
    borderWidth: 1,
    borderColor: dsAlpha(deepSpace.soul, 0.55),
  },
  meOrbCore: {
    width: 16,
    height: 16,
    borderRadius: m3.shape.none,
    backgroundColor: deepSpace.soul,
    shadowColor: deepSpace.soul,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  meHeroCopy: { flex: 1, minWidth: 0 },
  meEyebrow: { color: dsAlpha(deepSpace.textHi, 0.75), fontSize: 11, fontFamily: fontFamilies.readable, marginBottom: 4 },
  meHeadline: { color: deepSpace.textHi, fontSize: 19, lineHeight: 25, fontFamily: fontFamilies.readable, fontWeight: "700" },
  meHeroFoot: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 14 },
  meHeroMeta: { gap: 6 },
  meMetaLabel: { color: dsAlpha(deepSpace.textHi, 0.8), fontSize: 11, fontFamily: fontFamilies.readable },
  meRefine: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  meRefineLabel: { color: deepSpace.textHi, fontSize: 12, fontWeight: "600", fontFamily: fontFamilies.readable },
  // section head shared by the domain grid + validation entry
  meSectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  meSectionTitle: { color: dsAlpha(deepSpace.text, 0.85), fontSize: 13, fontFamily: fontFamilies.readable, fontWeight: "600" },
  meLink: { color: deepSpace.accentSoft, fontSize: 12, fontFamily: fontFamilies.readable, fontWeight: "600" },
  // layer A domain grid — receding cyan cards
  meGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 9, marginBottom: 18 },
  meCard: {
    width: "48.5%",
    minHeight: 92,
    borderRadius: m3.shape.none,
    padding: 12,
    justifyContent: "space-between",
    backgroundColor: deepSpace.card,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  meCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meCardDot: {
    width: 7,
    height: 7,
    borderRadius: m3.shape.none,
    backgroundColor: deepSpace.accent,
    shadowColor: deepSpace.accent,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  meCardLevel: { color: deepSpace.accentSoft, fontSize: 12, fontFamily: m3.font.mono },
  meCardName: { color: deepSpace.accentBright, fontSize: 15, fontFamily: fontFamilies.readable, fontWeight: "600", marginTop: 10 },
  meDotRow: { flexDirection: "row", gap: 4 },
  meDot: { width: 6, height: 6, borderRadius: m3.shape.none },
  meDotOn: { backgroundColor: deepSpace.accent },
  meDotOff: { backgroundColor: dsAlpha(deepSpace.accent, 0.25) },
  // layer B validation entry — soul-tinted (violet), signals the hidden layer
  meValidateCard: {
    borderRadius: m3.shape.none,
    padding: 14,
    backgroundColor: dsAlpha(deepSpace.soul, 0.08),
    borderWidth: 1,
    borderColor: deepSpace.soulLine,
  },
  meValidateText: { color: dsAlpha(deepSpace.textHi, 0.85), fontSize: 12.5, lineHeight: 19, fontFamily: fontFamilies.readable },
});
