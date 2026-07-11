/**
 * STEP 4 — the deep-space dock views, translated from design/prototype.dc.html:
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
import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { type DimensionValue, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Path, Rect, Stop, SvgXml } from "react-native-svg";

import { canonCaptureModes } from "@/lib/canon";
import { deepSpace, deepSpaceGradients, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { MdButton, MdCard, MdChip, ProgressLinear, m3TextStyle } from "@/components/m3";
import { composeFourWBody, EMPTY_FOURW, fourWHasContent, type FourWFields } from "@/lib/capture/fourw";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadLatestBfi } from "@/lib/persona/build";
import { getDomainStar, type DomainId } from "@/lib/persona/domain-stars";
import { STYLE_LABEL, type AttachmentStyle } from "@/lib/persona/attachment";
import { SecondbHead } from "@/components/deepspace/SecondbHead";
import { observableSelf, type ObservableTrait } from "@/lib/persona/observable-self";
import { loadSeenAggregate, type SeenAggregateRow } from "@/lib/peer/invite";
import { callGemini } from "@/lib/llm/gemini";
import { IMAGINE_SEEDS, type ImagineSeedIcon } from "./imagine-seeds";

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

// Material-Symbols glyphs the 담기 screen needs, transcribed 1:1 from the
// reference-app ICON_SVG (sb-data.jsx) — same stroke idiom as SbIcon (2dp
// currentColor, round caps). Kept local so the shell's SbIcon set stays lean.
const CAPTURE_ICON_INNER: Record<string, string> = {
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  link: '<path d="M9 15 15 9" transform="rotate(0 12 12)"/><path d="M8.5 12H6.5a3 3 0 1 1 0-6h3M15.5 6h2a3 3 0 1 1 0 6h-3" transform="rotate(45 12 12)"/>',
  photo_camera: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.4"/><circle cx="12" cy="13.7" r="3.3"/><path d="M8.5 7.5 10 4.5h4l1.5 3"/>',
  mic: '<rect x="9.4" y="3.5" width="5.2" height="11" rx="2.6"/><path d="M6 11.2a6 6 0 0 0 12 0M12 17.2V20.5"/>',
  check_circle: '<circle cx="12" cy="12" r="8.4"/><path d="m8.4 12 2.5 2.6 4.7-5.2"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  edit_note: '<path d="M4 7h12M4 12h7M4 17h5M14.5 16l4.2-4.2 2.5 2.5L17 18.5h-2.5z"/>',
  calendar_today: '<rect x="4" y="5.5" width="16" height="15" rx="2.2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
  north_east: '<path d="M7 17 17 7M9 7h8v8"/>',
  person: '<circle cx="12" cy="8" r="3.7"/><path d="M5.4 20c0-3.6 3-5.8 6.6-5.8s6.6 2.2 6.6 5.8"/>',
  bolt: '<path d="M13 3 5 13.2h5L10.5 21l8.5-10.8H13z"/>',
  auto_awesome: '<path d="M11 3c.4 3.2 2.3 5.1 5.5 5.5-3.2.4-5.1 2.3-5.5 5.5-.4-3.2-2.3-5.1-5.5-5.5C8.7 8.1 10.6 6.2 11 3Z"/><path d="M18 13c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5Z"/>',
  radio_unchecked: '<circle cx="12" cy="12" r="8"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  trending_up: '<path d="M4 16 10 10l3.5 3.5L20 7"/><path d="M15.5 7H20v4.5"/>',
  forum: '<path d="M3 5.5h11v7H8l-3.5 3z"/><path d="M8.5 13v1.4a2 2 0 0 0 2 2h5.7l3.3 2.6v-7.6a2 2 0 0 0-2-2H16"/>',
  chevron_right: '<path d="m9 6 6 6-6 6"/>',
  replay: '<path d="M5 12a7 7 0 1 0 2-4.9M7 3v4h4"/>',
};

function CaptureIcon({ name, color, size = 18 }: { name: keyof typeof CAPTURE_ICON_INNER; color: string; size?: number }) {
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${CAPTURE_ICON_INNER[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

// A W4H1 field: leading icon + label, then a filled input box (reference Field
// in sb-screens-core.jsx). All colors route through m3.* (this screen is on the
// migrated M3 track — no cosmic tokens, no hex literals).
const CaptureField = forwardRef<TextInput, {
  icon: keyof typeof CAPTURE_ICON_INNER;
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  // Android keyboard flow (ANDROID_QA_GUIDELINES §2): single-line fields relay
  // focus to the next via returnKeyType="next" + onSubmitEditing.
  returnKeyType?: "next" | "done";
  onSubmitEditing?: () => void;
}>(function CaptureField(
  { icon, label, hint, value, onChange, multiline = false, returnKeyType, onSubmitEditing },
  ref,
) {
  return (
    <View>
      <View style={styles.capFieldHead}>
        <CaptureIcon name={icon} color={m3.color.onSurfaceVariant} size={15} />
        <Text style={styles.capFieldLabel}>{label}</Text>
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
const CAPTURE_MODE_ROW: { id: CaptureMode; icon: keyof typeof CAPTURE_ICON_INNER }[] =
  canonCaptureModes.map((m) => ({ id: m.id as CaptureMode, icon: m.icon }));

export function CaptureView() {
  const { t, i18n } = useTranslation("home");
  const { userId, isMinor } = useAuth();
  const locale = i18n.language === "ko" ? "ko" : "en";
  // rev2 P4a (device QA 2026-07-02) + clone-audit 06-capture: the deep-space 담기
  // matches the reference — 5 format modes, and 글(text) opens the W4H1 form as
  // the default. All modes save through the same createRecord(kind:"note") path.
  const [mode, setMode] = useState<CaptureMode>("text");
  const [fourw, setFourw] = useState<FourWFields>(EMPTY_FOURW);
  const [text, setText] = useState(""); // link / photo caption / voice transcript
  const [todos, setTodos] = useState<string[]>(["", ""]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const cleanTodos = todos.map((v) => v.trim()).filter((v) => v.length > 0);
  const hasContent =
    mode === "text"
      ? fourWHasContent(fourw)
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
        body = composeFourWBody(fourw, locale);
        topic = fourw.what.trim().slice(0, 80);
        tag = "fourw";
      } else if (mode === "todo") {
        body = cleanTodos.map((v) => `- ${v}`).join("\n");
        topic = cleanTodos[0]?.slice(0, 80);
        tag = "todo";
      } else {
        body = text.trim();
        topic = body.slice(0, 80);
        tag = mode; // link / photo / voice
      }
      await createRecord({
        userId,
        locale,
        kind: "note",
        body,
        topic,
        tags: [tag],
        withFollowup: false,
        minor: isMinor === true,
      });
      setSaved(true);
      setFourw(EMPTY_FOURW);
      setText("");
      setTodos(["", ""]);
    } catch (e) {
      setError(true);
      if (typeof console !== "undefined") console.warn("[deepspace-capture] save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // 4W1H single-line fields relay focus what→when→where→who→how on Android.
  const whenRef = useRef<TextInput>(null);
  const whereRef = useRef<TextInput>(null);
  const whoRef = useRef<TextInput>(null);
  const howRef = useRef<TextInput>(null);

  const f = (key: string) => t("ds.capture." + key);
  const saveLabel = saving ? f("saving") : saved ? f("saved") : f("save");

  return (
    <ScrollView contentContainerStyle={styles.capBody} keyboardShouldPersistTaps="handled">
      <Text style={styles.capTitle}>{f("title")}</Text>
      <Text style={styles.capSubtitle}>{f("subtitle")}</Text>

      {/* format selector — 5 M3 filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.capChipScroll}
        contentContainerStyle={styles.capChipRow}
        keyboardShouldPersistTaps="handled"
      >
        {CAPTURE_MODE_ROW.map((m) => {
          const on = mode === m.id;
          const fg = on ? m3.color.onSecondaryContainer : m3.color.onSurfaceVariant;
          return (
            <MdChip
              key={m.id}
              kind="filter"
              selected={on}
              label={t("ds.capture.modes." + m.id)}
              icon={<CaptureIcon name={on ? "check" : m.icon} color={fg} size={18} />}
              onPress={() => {
                setMode(m.id);
                dirty();
              }}
            />
          );
        })}
      </ScrollView>

      {/* mode-specific input */}
      {mode === "text" ? (
        <View style={styles.capForm}>
          <CaptureField
            icon="edit_note"
            label={f("fields.what.label")}
            hint={f("fields.what.hint")}
            value={fourw.what}
            onChange={(v) => setField("what", v)}
            multiline
          />
          <View style={styles.capFieldRow}>
            <View style={styles.capFieldCol}>
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
            </View>
            <View style={styles.capFieldCol}>
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
            </View>
          </View>
          <CaptureField
            ref={whoRef}
            icon="person"
            label={f("fields.who.label")}
            hint={f("fields.who.hint")}
            value={fourw.who}
            onChange={(v) => setField("who", v)}
            returnKeyType="next"
            onSubmitEditing={() => howRef.current?.focus()}
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
            onPress={() => router.push({ pathname: "/capture-full", params: { text } })}
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
            onPress={() => router.push({ pathname: "/capture-full", params: { text } })}
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

      {/* auto-classify banner (tertiary tonal) */}
      <View style={styles.capBanner}>
        <CaptureIcon name="auto_awesome" color={m3.color.onTertiaryContainer} size={18} />
        <Text style={styles.capBannerText}>{f("banner")}</Text>
      </View>

      <MdButton
        variant="filled"
        icon={saving ? undefined : <CaptureIcon name="add" color={m3.color.onPrimary} size={18} />}
        label={saveLabel}
        loading={saving}
        disabled={!canSave}
        onPress={savePiece}
        style={styles.capSubmit}
      />

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

export function LensView({
  traits,
  hasError,
  onStart,
  onRetry,
}: { traits?: LensTraits | null; hasError?: boolean; onStart?: () => void; onRetry?: () => void } = {}) {
  const { t } = useTranslation("home");
  // No prop (undefined) = design preview / Soul Core reuse: keep the manual
  // state toggle + sample data. A provided `traits` drives the state from real
  // data: an object → filled with those scores, null → empty (no result yet).
  // `hasError` (fetch failed) takes priority over empty so the retry path shows.
  const demo = traits === undefined;
  const [demoState, setDemoState] = useState<LensState>("filled");
  const state: LensState = demo ? demoState : traits ? "filled" : hasError ? "error" : "empty";
  const shown = traits ?? DUMMY_LENS_TRAITS;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {demo ? <StateToggle value={demoState} onChange={setDemoState} /> : null}
      {state === "empty" ? (
        <View style={styles.centerState}>
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
          </Svg>
          <Text style={styles.stateTitle}>{t("ds.lens.emptyTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.emptyBody")}</Text>
          <GradientButton label={t("ds.lens.emptyCta")} onPress={onStart} />
        </View>
      ) : state === "error" ? (
        <View style={styles.centerState}>
          <Svg width={32} height={32} viewBox="0 0 24 24" opacity={0.7}>
            <Path d="M12 3l9 16H3z" fill="none" stroke={deepSpace.accentSoft} strokeWidth={2} strokeLinejoin="round" />
            <Path d="M12 9v5M12 16.5v.5" stroke={deepSpace.accentSoft} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Text style={styles.stateTitle}>{t("ds.lens.errorTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.errorBody")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("ds.lens.errorCta")} onPress={onRetry} style={styles.ghostBtn}>
            <Text style={styles.ghostLabel}>{t("ds.lens.errorCta")}</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <View style={styles.filledHead}>
            <Text style={styles.pixelTitle}>{t("ds.lens.filledTitle")}</Text>
            <Text style={styles.level}>{t("ds.lens.level")}</Text>
          </View>
          <View style={styles.traits}>
            <TraitBar label={t("ds.lens.traitOpenness")} value={shown.openness} />
            <TraitBar label={t("ds.lens.traitConscientiousness")} value={shown.conscientiousness} />
            <TraitBar label={t("ds.lens.traitExtraversion")} value={shown.extraversion} up={demo} />
            <TraitBar label={t("ds.lens.traitAgreeableness")} value={shown.agreeableness} />
            <TraitBar label={t("ds.lens.traitNeuroticism")} value={shown.neuroticism} />
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightText}>{t("ds.lens.insight")}</Text>
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
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={m3.color.primary} />
          </Svg>
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
          <Svg width={32} height={32} viewBox="0 0 24 24" opacity={0.7}>
            <Path d="M12 3l9 16H3z" fill="none" stroke={m3.color.onSurfaceVariant} strokeWidth={2} strokeLinejoin="round" />
            <Path d="M12 9v5M12 16.5v.5" stroke={m3.color.onSurfaceVariant} strokeWidth={2} strokeLinecap="round" />
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
        <Text style={[m3TextStyle("headlineSmall"), styles.bfHeadline]}>{t("ds.lens.headline")}</Text>
        <View style={styles.bfLevelChip}>
          <Text style={[m3TextStyle("labelSmall"), styles.bfLevelChipText]}>{t("ds.lens.level")}</Text>
        </View>
        <Text style={[m3TextStyle("labelSmall"), styles.bfConfidence]}>{t("ds.lens.confidence")}</Text>
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
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={m3.color.primary} />
          </Svg>
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
          <Svg width={32} height={32} viewBox="0 0 24 24" opacity={0.7}>
            <Path d="M12 3l9 16H3z" fill="none" stroke={m3.color.onSurfaceVariant} strokeWidth={2} strokeLinejoin="round" />
            <Path d="M12 9v5M12 16.5v.5" stroke={m3.color.onSurfaceVariant} strokeWidth={2} strokeLinecap="round" />
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
        <Text style={[m3TextStyle("headlineSmall"), styles.bfHeadline]}>{t("ds.attachment.headline")}</Text>
        <View style={styles.atLevelChip}>
          <Text style={[m3TextStyle("labelSmall"), styles.atLevelChipText]}>{t("ds.attachment.level")}</Text>
        </View>
      </View>
      <Text style={[m3TextStyle("bodyMedium"), styles.bfSubtitle]}>{t("ds.attachment.subtitle")}</Text>

      <MdCard variant="outlined" style={styles.atMapCard}>
        <View style={styles.atMap}>
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={withAlpha(m3.color.primaryContainer, 0.33)} />
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

      {/* 세컨비 insight — a single plain card (head + one message), matching the
          capture exactly: no confidence pill, evidence link, or ratify buttons
          on this screen. Detail lives behind the deeper ratify/interview flows. */}
      <View style={styles.atInsightCard}>
        <SecondbHead size={30} track={false} />
        <Text style={[m3TextStyle("bodyMedium"), styles.atInsightText]}>{t("ds.attachment.insight")}</Text>
      </View>

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
          <Svg width={32} height={32} viewBox="0 0 24 24" opacity={0.7}>
            <Path d="M12 3l9 16H3z" fill="none" stroke={deepSpace.accentSoft} strokeWidth={2} strokeLinejoin="round" />
            <Path d="M12 9v5M12 16.5v.5" stroke={deepSpace.accentSoft} strokeWidth={2} strokeLinecap="round" />
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
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
          </Svg>
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
        <Svg width={34} height={34} viewBox="0 0 24 24">
          <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
        </Svg>
        <Text style={styles.stateTitle}>{t("ds.recall.emptyTitle")}</Text>
        <Text style={styles.stateBody}>{t("ds.recall.emptyBody")}</Text>
      </View>
    </ScrollView>
  );
}

// ── 보여지는 나 / Seen (SELF·OTHER) ──────────────────────────────────────────

export function SeenLensView() {
  const { t, i18n } = useTranslation("home");
  const isKo = i18n.language === "ko";
  const locale = isKo ? "ko" : "en";
  const { userId } = useAuth();
  // SOKA-grounded "observable self": the part of the user's OWN Big Five that reads
  // most from outside (extraversion/conscientiousness/agreeableness). This is NOT a
  // claim about what specific others think -- that needs the peer-review data the
  // empty state below still asks for. It just gives the lens honest, grounded content
  // from data the user already has, instead of a bare empty screen.
  const [observable, setObservable] = useState<ObservableTrait[]>([]);
  // T5 F3: the combined other-view (t5_seen_aggregate, min-N 3). Empty until
  // enough informants answered; fail-soft to the honest empty state.
  const [aggregate, setAggregate] = useState<SeenAggregateRow[]>([]);
  // T5 F4: optional LLM synthesis of the self/other gap. Only NUMBERS go in
  // (never informant text); C1/C3/C9 ride callGemini as everywhere else, and
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
      .then((means) => {
        if (!cancelled) setObservable(observableSelf(means, locale));
      })
      .catch(() => {
        if (!cancelled) setObservable([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, locale]);

  // 보여지는 나 needs peer-review responses to compare self vs other. No
  // peer-review data source exists yet (no table / lib path collects it), so
  // there are no real numbers to show: render the honest empty state plus the
  // existing survey/share CTAs, never fabricated self/other bars.
  const otherPct = new Map(aggregate.map((r) => [r.trait, Math.round(((r.avg_score - 1) / 4) * 100)]));
  const informantCount = aggregate.length > 0 ? Math.max(...aggregate.map((r) => r.informant_count)) : 0;
  const hasGap = aggregate.length > 0 && observable.length > 0;

  async function synthesizeGap() {
    if (!userId || synthBusy) return;
    setSynthBusy(true);
    try {
      const lines = observable
        .filter((o) => otherPct.has(o.trait))
        .map((o) => o.label + ": self " + o.percent + "%, others " + otherPct.get(o.trait) + "%")
        .join("; ");
      const res = await callGemini({
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
      {observable.length > 0 ? (
        <View style={styles.obsPanel}>
          <Text style={styles.obsTitle}>{hasGap ? t("ds.seen.obsTitleGap") : t("ds.seen.obsTitleSolo")}</Text>
          <Text style={styles.obsNote}>{t("ds.seen.obsNote")}</Text>
          {hasGap ? (
            <Text style={styles.obsNote}>
              {t("ds.seen.combinedNote", { count: informantCount })}
            </Text>
          ) : null}
          {observable.map((o) => (
            <View key={o.trait} style={styles.obsRow}>
              <Text style={styles.obsLabel}>{o.label}</Text>
              <View style={styles.obsTrack}>
                <View style={[styles.obsFill, { width: `${o.percent}%` }]} />
              </View>
              {otherPct.has(o.trait) ? (
                <View style={[styles.obsTrack, styles.obsTrackOther]}>
                  <View style={[styles.obsFillOther, { width: `${otherPct.get(o.trait) ?? 0}%` }]} />
                </View>
              ) : null}
            </View>
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
        <Svg width={34} height={34} viewBox="0 0 24 24">
          <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
        </Svg>
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
        <Svg width={34} height={34} viewBox="0 0 24 24">
          <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
        </Svg>
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
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
          </Svg>
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
          {/* SCREEN_TREE_SPEC §7 /imagine: "이 공상을 첫 걸음으로 → /ops" (the routine is
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

// ── 공상하기 / Imagine — divergent seeds (sb-more ImagineScreen 1:1) ─────────
// Seed content lives in ./imagine-seeds (canon-testable .ts module).

// Inline Material-glyph approximations (the app has no icon font — TabIcon /
// ModeGlyph precedent). Small single-path marks, not pixel icon art.
function ImagineGlyph({ kind, color, size = 19 }: { kind: ImagineSeedIcon; color: string; size?: number }) {
  const paths: Record<ImagineSeedIcon, string> = {
    // open_in_full: outward diagonal arrows ("확장")
    expand: "M21 11V3h-8l3.29 3.29-10 10L3 13v8h8l-3.29-3.29 10-10L21 11z",
    // cached: circular arrows ("반전")
    cached:
      "M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z",
    // hub: center node + three spokes ("연결")
    hub: "M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM5 4a2 2 0 100 4 2 2 0 000-4zm14 0a2 2 0 100 4 2 2 0 000-4zm-7 12.5l-.9 3.1a2 2 0 102 0l-.9-3.1h-.2zM6.4 7.6l3.2 2.6.9-1.1-3.2-2.6-.9 1.1zm11.2 0l-.9-1.1-3.2 2.6.9 1.1 3.2-2.6z",
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={paths[kind]} fill={color} />
    </Svg>
  );
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
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path
              d="M9 21h6v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17a1 1 0 001 1h6a1 1 0 001-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"
              fill={m3.color.tertiary}
            />
          </Svg>
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
                android_ripple={{ color: withAlpha(m3.color.tertiary, 0.12) }}
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
                <Svg width={20} height={20} viewBox="0 0 24 24">
                  <Path
                    d={on ? "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" : "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"}
                    fill={m3.color.onSurfaceVariant}
                  />
                </Svg>
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
                style={({ pressed }) => [styles.imgStep, pressed && { opacity: 0.72 }]}
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
// over a left-rail timeline of 5 life eras. Each era is a filled MdCard with a
// brightness Dots row + "또렷함 L{n}" label + chevron; tapping opens the
// open-ended interview (reference go('interview')). Static by design — matches
// the reference (no fabricated per-user data). m3.* tokens only.
const AUDIT_ERAS: { key: string; eraKey: string; rangeKey: string; level: 1 | 2 | 3 | 4 | 5 }[] = [
  { key: "infancy", eraKey: "ds.audit.eraInfancy", rangeKey: "ds.audit.rangeInfancy", level: 1 },
  { key: "child", eraKey: "ds.audit.eraChild", rangeKey: "ds.audit.rangeChild", level: 2 },
  { key: "teen", eraKey: "ds.audit.eraTeen", rangeKey: "ds.audit.rangeTeen", level: 3 },
  { key: "young", eraKey: "ds.audit.eraYoung", rangeKey: "ds.audit.rangeYoung", level: 4 },
  { key: "now", eraKey: "ds.audit.eraNow", rangeKey: "ds.audit.rangeNow", level: 3 },
];

// Map each era to the interview's period-scoped question set (AuditPeriod:
// current | 20s | teens). Eras earlier than the teen set fall back to teens.
const ERA_PERIOD: Record<string, string> = { infancy: "teens", child: "teens", teen: "teens", young: "20s", now: "current" };

const AUDIT_DOTS = 5;
function AuditDots({ level }: { level: number }) {
  return (
    <View style={styles.auditDotRow}>
      {Array.from({ length: AUDIT_DOTS }).map((_, i) => (
        <View key={i} style={[styles.auditDot, i < level ? styles.auditDotOn : styles.auditDotOff]} />
      ))}
    </View>
  );
}

export function PastMeErasView({ isKo }: { isKo?: boolean } = {}) {
  const { t } = useTranslation("home");
  void isKo; // copy is t()-driven; prop kept for caller-convention parity
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.auditTitle}>{t("ds.audit.title")}</Text>
      <Text style={styles.auditSubtitle}>{t("ds.audit.subtitle")}</Text>
      <View style={styles.auditTimeline}>
        <View style={styles.auditRail} />
        <View style={styles.auditEraList}>
          {AUDIT_ERAS.map((e) => (
            <View key={e.key} style={styles.auditEraRow}>
              <View style={styles.auditNode} />
              <MdCard
                variant="filled"
                accessibilityLabel={t(e.eraKey)}
                onPress={() => router.push({ pathname: "/interview", params: { period: ERA_PERIOD[e.key] ?? "current" } })}
              >
                <View style={styles.auditCardRow}>
                  <View style={styles.auditEraCol}>
                    <Text style={styles.auditEraName}>{t(e.eraKey)}</Text>
                    <Text style={styles.auditEraRange}>{t(e.rangeKey)}</Text>
                  </View>
                  <View style={styles.auditEraMeta}>
                    <AuditDots level={e.level} />
                    <Text style={styles.auditVivid}>{t("ds.audit.vividness", { level: e.level })}</Text>
                  </View>
                  <Svg width={20} height={20} viewBox="0 0 24 24">
                    <Path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" fill={m3.color.onSurfaceVariant} />
                  </Svg>
                </View>
              </MdCard>
            </View>
          ))}
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
        <Svg width={34} height={34} viewBox="0 0 24 24">
          <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
        </Svg>
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
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
          </Svg>
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
          style={({ pressed }) => pressed && styles.pressed}
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
          style={({ pressed }) => pressed && styles.pressed}
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
  capBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  capTitle: { color: m3.color.onSurface, fontSize: 24, lineHeight: 30, fontFamily: m3.font.brand, fontWeight: "700" },
  capSubtitle: { color: m3.color.onSurfaceVariant, fontSize: 14, lineHeight: 20, fontFamily: m3.font.brand, marginTop: 4 },
  capChipScroll: { marginTop: 16, marginHorizontal: -16 },
  capChipRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  capForm: { gap: 14, marginTop: 16 },
  capFieldHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  capFieldLabel: { color: m3.color.onSurfaceVariant, fontSize: 12, lineHeight: 16, fontFamily: m3.font.brand, fontWeight: "500" },
  capFieldInput: {
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: m3.color.surfaceContainerHighest,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: 15,
  },
  capFieldInputTall: { minHeight: 96 },
  capMono: { fontFamily: m3.font.mono, fontSize: 13 },
  capFieldRow: { flexDirection: "row", gap: 12 },
  capFieldCol: { flex: 1 },
  capHint: { color: m3.color.onSurfaceVariant, fontSize: 12, lineHeight: 18, fontFamily: m3.font.brand },
  capTodoCol: { gap: 8, marginTop: 16 },
  capTodoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  capTodoInput: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand, fontSize: 15, padding: 0 },
  capTodoAdd: { alignSelf: "flex-start" },
  capBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: m3.color.tertiaryContainer,
  },
  capBannerText: { flex: 1, color: m3.color.onTertiaryContainer, fontSize: 12.5, lineHeight: 18, fontFamily: m3.font.brand },
  capSubmit: { alignSelf: "stretch", marginTop: 14 },
  capFullWidth: { alignSelf: "stretch", marginTop: 8 },
  capErrorCard: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: m3.color.errorContainer,
  },
  capErrorText: { color: m3.color.onErrorContainer, fontSize: 12.5, lineHeight: 18, fontFamily: m3.font.brand },

  // shared gradient button
  gButton: {
    overflow: "hidden",
    borderRadius: 12,
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
  fourwLabel: { color: withAlpha(deepSpace.text, 0.75), fontSize: 12, fontFamily: fontFamilies.readable, marginBottom: 4 },
  fourwLabelRequired: { color: deepSpace.textHi },
  fourwInput: { minHeight: 48, marginTop: 0 },
  fourwInputTall: { minHeight: 84 },
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
  stateTitle: { color: deepSpace.accentBright, fontSize: 15, fontFamily: fontFamilies.readable, fontWeight: "700" },
  stateBody: { color: withAlpha(deepSpace.text, 0.6), fontSize: 12, lineHeight: 19, textAlign: "center", fontFamily: fontFamilies.readable },
  obsPanel: { gap: 8, marginBottom: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: withAlpha(deepSpace.accentSoft, 0.3), backgroundColor: withAlpha(deepSpace.accentSoft, 0.06) },
  obsTitle: { color: deepSpace.accentBright, fontSize: 14, fontFamily: fontFamilies.readable, fontWeight: "600" },
  obsNote: { color: withAlpha(deepSpace.text, 0.55), fontSize: 11, lineHeight: 16, fontFamily: fontFamilies.readable, marginBottom: 4 },
  obsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  obsLabel: { color: withAlpha(deepSpace.text, 0.85), fontSize: 12, width: 64, fontFamily: fontFamilies.readable },
  obsTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: withAlpha(deepSpace.text, 0.12), overflow: "hidden" },
  obsFill: { height: "100%", borderRadius: 3, backgroundColor: deepSpace.accentSoft },
  // T5 F3: the combined other-view bar (violet family = legendDotOther).
  obsTrackOther: { marginTop: 3 },
  obsFillOther: { height: "100%", borderRadius: 4, backgroundColor: deepSpace.accentSoft },
  ghostBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  ghostLabel: { color: deepSpace.accentSoft, fontSize: 14, fontFamily: fontFamilies.readable, fontWeight: "600" },

  // lens — filled
  filledHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  level: { color: deepSpace.mint, fontSize: 11, fontFamily: m3.font.mono },
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

  // ── 검증 · Big Five (M3, clone-audit 14-bigfive) ──────────────────────────
  bfBody: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  bfHeadRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  bfHeadline: { color: m3.color.onSurface, fontFamily: m3.font.brand, flexShrink: 1 },
  bfLevelChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
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
  atLevelChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: m3.color.tertiaryContainer },
  atLevelChipText: { color: m3.color.onTertiaryContainer, fontFamily: m3.font.brand, fontWeight: "600" },
  atMapCard: { padding: 16 },
  atMap: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: m3.color.surfaceContainer,
  },
  atQuad: { position: "absolute", color: m3.color.onSurfaceVariant, opacity: 0.7, fontFamily: m3.font.brand },
  atQuadTop: { top: 8 },
  atQuadBottom: { bottom: 8 },
  atQuadLeft: { left: 10 },
  atQuadRight: { right: 10 },
  atAxisV: { position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, backgroundColor: m3.color.outlineVariant },
  atAxisH: { position: "absolute", top: "50%", left: 0, right: 0, height: 1, backgroundColor: m3.color.outlineVariant },
  atPointWrap: { position: "absolute", width: 30, height: 30, marginLeft: -15, marginTop: -15, alignItems: "center", justifyContent: "center" },
  atPointHalo: { position: "absolute", width: 30, height: 30, borderRadius: 15, backgroundColor: withAlpha(m3.color.primary, 0.2) },
  atPoint: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: m3.color.primary,
    shadowColor: m3.color.primary,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
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
    borderRadius: 13,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.3),
    backgroundColor: withAlpha(deepSpace.soul, 0.07),
    gap: 7,
  },
  idName: { color: deepSpace.accentBright, fontSize: 12, fontFamily: m3.font.mono },
  idBadges: { flexDirection: "row", gap: 5 },
  idBadge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5, backgroundColor: withAlpha(deepSpace.soul, 0.14) },
  idBadgeText: { color: withAlpha(deepSpace.soul, 0.8), fontSize: 9, fontFamily: m3.font.mono },
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
  idenKey: { color: withAlpha(deepSpace.soul, 0.65), fontSize: 9, fontFamily: m3.font.mono, letterSpacing: 0.8 },
  idenKeyCyan: { color: withAlpha(deepSpace.accentSoft, 0.6), fontSize: 9, fontFamily: m3.font.mono, letterSpacing: 0.8 },
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
  idenFiveValue: { color: deepSpace.accentSoft, fontSize: 10, marginTop: 6, fontFamily: m3.font.mono },

  // ── star-lens shared head ──────────────────────────────────────────────────
  lensHead: { gap: 6, marginBottom: 16 },
  lensHeadTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  lensTag: { marginLeft: "auto", color: withAlpha(deepSpace.accent, 0.55), fontSize: 9.5, fontFamily: m3.font.mono, letterSpacing: 0.8 },
  lensEyebrow: { color: deepSpace.textMid, fontSize: 12.5, lineHeight: 18, fontFamily: fontFamilies.readable },
  pixelHint: { color: withAlpha(deepSpace.accentSoft, 0.6), fontSize: 9.5, fontFamily: m3.font.mono, letterSpacing: 0.8, marginBottom: 12 },
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
  gridName: { color: deepSpace.accentBright, fontSize: 13, fontFamily: fontFamilies.readable, fontWeight: "600" },
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
  compareDelta: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: m3.font.mono },
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
  dashedCardOn: { borderColor: deepSpace.accent, backgroundColor: withAlpha(deepSpace.accent, 0.08) },
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  domainLabel: { color: deepSpace.accentBright, fontSize: 14, fontFamily: fontFamilies.readable, fontWeight: "600" },
  domainCount: { color: withAlpha(deepSpace.accentSoft, 0.6), fontSize: 11, fontFamily: m3.font.mono },

  // ── imagine (divergent seeds) — ref sb-more ImagineScreen tokens ────────────
  imgIntro: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  imgIntroRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 16 },
  imgIntroCol: { flex: 1, minWidth: 0 },
  imgIntroTitle: { fontSize: 16, lineHeight: 24, fontWeight: "500", color: m3.color.onSurface, fontFamily: fontFamilies.readable },
  imgIntroBody: { fontSize: 12, lineHeight: 16, color: m3.color.onSurfaceVariant, marginTop: 3, fontFamily: fontFamilies.readable },
  imgSection: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: m3.color.onSurfaceVariant, marginTop: 20, marginBottom: 10, fontFamily: fontFamilies.readable },
  imgSeedList: { gap: 10 },
  imgSeed: { borderRadius: 12, borderWidth: 1, borderColor: m3.color.outlineVariant, overflow: "hidden" },
  imgSeedOn: { borderWidth: 1.5, borderColor: m3.color.tertiary, backgroundColor: m3.color.surfaceContainerLow },
  imgSeedPress: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 14 },
  imgSeedIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: m3.color.tertiaryContainer },
  imgSeedCol: { flex: 1, minWidth: 0 },
  imgSeedAngle: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: m3.color.tertiary, fontFamily: fontFamilies.readable },
  imgSeedTitle: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: m3.color.onSurface, fontFamily: fontFamilies.readable },
  imgSeedBody: { fontSize: 12, lineHeight: 16, color: m3.color.onSurfaceVariant, marginTop: 4, fontFamily: fontFamilies.readable },
  imgStepList: { gap: 8 },
  imgStep: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: m3.color.outlineVariant },
  imgStepNum: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: m3.color.secondaryContainer },
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
  auditNode: { position: "absolute", left: -20, top: 17, width: 14, height: 14, borderRadius: 7, backgroundColor: m3.color.primary, borderWidth: 2, borderColor: m3.color.surface, zIndex: 1 },
  auditCardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  auditEraCol: { flex: 1, minWidth: 0 },
  auditEraName: { fontSize: 16, lineHeight: 24, fontWeight: "500", color: m3.color.onSurface, fontFamily: fontFamilies.readable },
  auditEraRange: { fontSize: 12, lineHeight: 16, color: m3.color.onSurfaceVariant, fontFamily: fontFamilies.readable },
  auditEraMeta: { alignItems: "flex-end" },
  auditDotRow: { flexDirection: "row", gap: 3 },
  auditDot: { width: 6, height: 6, borderRadius: 3 },
  auditDotOn: { backgroundColor: m3.color.primary },
  auditDotOff: { backgroundColor: m3.color.surfaceVariant },
  auditVivid: { fontSize: 11, lineHeight: 16, fontWeight: "500", color: m3.color.onSurfaceVariant, marginTop: 4, fontFamily: fontFamilies.readable },
  imgBtnFlex: { flex: 1 },

  // ── 북극성 종합 / me synthesis (10-me) ──────────────────────────────────────
  meBody: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 28 },
  // layer C hero — dominant, soul (violet) identity
  meHero: { position: "relative", borderRadius: 20, overflow: "hidden", padding: 16, marginBottom: 18 },
  meHeroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  meOrb: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(deepSpace.bgEdge, 0.45),
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.55),
  },
  meOrbCore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: deepSpace.soul,
    shadowColor: deepSpace.soul,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  meHeroCopy: { flex: 1, minWidth: 0 },
  meEyebrow: { color: withAlpha(deepSpace.textHi, 0.75), fontSize: 11, fontFamily: fontFamilies.readable, marginBottom: 4 },
  meHeadline: { color: deepSpace.textHi, fontSize: 19, lineHeight: 25, fontFamily: fontFamilies.readable, fontWeight: "700" },
  meHeroFoot: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 14 },
  meHeroMeta: { gap: 6 },
  meMetaLabel: { color: withAlpha(deepSpace.textHi, 0.8), fontSize: 11, fontFamily: fontFamilies.readable },
  meRefine: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  meRefineLabel: { color: deepSpace.textHi, fontSize: 12, fontWeight: "600", fontFamily: fontFamilies.readable },
  // section head shared by the domain grid + validation entry
  meSectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  meSectionTitle: { color: withAlpha(deepSpace.text, 0.85), fontSize: 13, fontFamily: fontFamilies.readable, fontWeight: "600" },
  meLink: { color: deepSpace.accentSoft, fontSize: 12, fontFamily: fontFamilies.readable, fontWeight: "600" },
  // layer A domain grid — receding cyan cards
  meGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 9, marginBottom: 18 },
  meCard: {
    width: "48.5%",
    minHeight: 92,
    borderRadius: 14,
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
    borderRadius: 4,
    backgroundColor: deepSpace.accent,
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  meCardLevel: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: m3.font.mono },
  meCardName: { color: deepSpace.accentBright, fontSize: 15, fontFamily: fontFamilies.readable, fontWeight: "600", marginTop: 10 },
  meDotRow: { flexDirection: "row", gap: 4 },
  meDot: { width: 6, height: 6, borderRadius: 3 },
  meDotOn: { backgroundColor: deepSpace.accent },
  meDotOff: { backgroundColor: withAlpha(deepSpace.accent, 0.25) },
  // layer B validation entry — soul-tinted (violet), signals the hidden layer
  meValidateCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: withAlpha(deepSpace.soul, 0.08),
    borderWidth: 1,
    borderColor: deepSpace.soulLine,
  },
  meValidateText: { color: withAlpha(deepSpace.textHi, 0.85), fontSize: 12.5, lineHeight: 19, fontFamily: fontFamilies.readable },
});
