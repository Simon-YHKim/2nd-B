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
import { useEffect, useId, useState, type ReactNode } from "react";
import { type DimensionValue, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { deepSpace, deepSpaceGradients, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadLatestBfi } from "@/lib/persona/build";
import { observableSelf, type ObservableTrait } from "@/lib/persona/observable-self";

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
  // No `data` prop (undefined) = design preview / reuse path: keep sample copy.
  // A provided value drives real states: loading -> spinner copy, hasError ->
  // retry, null -> empty (no self-knowledge yet), object -> the real IdenDoc.
  const demo = data === undefined;
  if (!demo && loading) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.centerState}>
          <Text style={styles.stateBody}>{isKo ? "IDEN을 모으는 중이에요" : "Gathering your IDEN"}</Text>
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
          <Text style={styles.stateTitle}>{isKo ? "아직 모을 IDEN이 없어요" : "No IDEN to gather yet"}</Text>
          <Text style={styles.stateBody}>
            {isKo
              ? "도구 하나만 마쳐도 나를 담은 IDEN이 만들어져요."
              : "Finish one tool and your IDEN starts to take shape."}
          </Text>
          <GradientButton
            label={isKo ? "조각 담기 시작" : "Start gathering"}
            onPress={onSend}
          />
        </View>
      </ScrollView>
    );
  }
  const shown: IdenViewData = data ?? {
    name: "simon.iden",
    version: "2.1",
    northStar: t("ds.iden.northStar"),
    bigFive: "O72 C58 E41 A67 N39",
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
  // TODO(data): not reachable from any live route/dock yet; per-period recall
  // coverage (interview-coverage by life period) is non-trivial and unwired, so
  // this renders an honest empty state instead of fabricated dot meters.
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.recall.title")} tag={t("ds.recall.tag")} eyebrow={t("ds.recall.eyebrow")} />
      <View style={styles.centerState}>
        <Svg width={34} height={34} viewBox="0 0 24 24">
          <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
        </Svg>
        <Text style={styles.stateTitle}>{isKo ? "아직 회상으로 채운 시기가 없어요" : "No eras recalled yet"}</Text>
        <Text style={styles.stateBody}>
          {isKo
            ? "지나온 시기를 하나씩 떠올려 적으면, 어느 시절이 지금의 나를 만들었는지 여기 모여요."
            : "Recall your past eras one by one, and which years shaped you gathers here."}
        </Text>
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
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
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

  async function requestPeerReview() {
    try {
      await Share.share({
        message: isKo
          ? "내가 나를 보는 모습과 남이 보는 모습이 얼마나 다른지 같이 봐줄래요? 2nd-Brain에서 peer review를 부탁해요."
          : "Would you help me see the gap between how I see myself and how others see me? Sharing a peer review request from 2nd-Brain.",
      });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[deepspace-seen] share failed", (e as Error).message);
    }
  }

  // 보여지는 나 needs peer-review responses to compare self vs other. No
  // peer-review data source exists yet (no table / lib path collects it), so
  // there are no real numbers to show: render the honest empty state plus the
  // existing survey/share CTAs, never fabricated self/other bars.
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
          <Text style={styles.obsTitle}>{isKo ? "밖에서 가장 잘 보이는 나" : "Most visible from outside"}</Text>
          <Text style={styles.obsNote}>
            {isKo
              ? "남이 실제로 어떻게 보는지가 아니라, 내 Big Five 자기보고에서 밖으로 가장 잘 드러나는 특질이에요."
              : "Not what others actually think; the traits from your own Big Five that read most from outside."}
          </Text>
          {observable.map((o) => (
            <View key={o.trait} style={styles.obsRow}>
              <Text style={styles.obsLabel}>{o.label}</Text>
              <View style={styles.obsTrack}>
                <View style={[styles.obsFill, { width: `${o.percent}%` }]} />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.centerState}>
        <Svg width={34} height={34} viewBox="0 0 24 24">
          <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
        </Svg>
        <Text style={styles.stateTitle}>{isKo ? "아직 비교할 peer 응답이 없어요" : "No peer responses to compare yet"}</Text>
        <Text style={styles.stateBody}>
          {isKo
            ? "가까운 사람에게 짧은 설문을 보내면, 내가 보는 나와 남이 보는 나를 나란히 볼 수 있어요."
            : "Send a short survey to someone close, and you'll see the me you see beside the me others see."}
        </Text>
      </View>
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
          <GradientButton label={t("ds.seen.share")} colors={deepSpaceGradients.idenSend} full onPress={requestPeerReview} />
        </View>
      </View>
    </ScrollView>
  );
}

// ── 리듬 / Rhythm (ESM) ──────────────────────────────────────────────────────

export function RhythmLensView({ isKo, onLogNow }: { isKo?: boolean; onLogNow?: () => void } = {}) {
  const { t } = useTranslation("home");
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
        <Text style={styles.stateTitle}>{isKo ? "아직 리듬을 그릴 기록이 없어요" : "No rhythm to chart yet"}</Text>
        <Text style={styles.stateBody}>
          {isKo
            ? "기분을 며칠 기록하면, 내가 가장 나다운 시간이 여기 리듬으로 보여요."
            : "Log your mood for a few days, and when you feel most yourself shows up as a rhythm here."}
        </Text>
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
          <Text style={styles.stateTitle}>{isKo ? "아직 그려둔 미래의 나가 없어요" : "No future self sketched yet"}</Text>
          <Text style={styles.stateBody}>
            {isKo
              ? "세컨비와 공상 모드로 이야기하면, 데이터가 되기 전의 내 모습을 여기 담을 수 있어요."
              : "Talk with SecondB in divergent mode, and the you before the data fills in lands here."}
          </Text>
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
                style={({ pressed }) => [styles.dashedCard, selected === i && styles.dashedCardOn, pressed && styles.pressed]}
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

// ── 관계·지식 / Relational (RELATIONS) ───────────────────────────────────────

export function RelationalLensView({ isKo, onAddData }: { isKo?: boolean; onAddData?: () => void } = {}) {
  const { t } = useTranslation("home");
  // TODO(data): not reachable from any live route/dock yet; the people +
  // knowledge graph (relations-graph + wiki concepts) is non-trivial and
  // unwired, so this renders an honest empty state instead of fabricated chips.
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <LensHead title={t("ds.relational.title")} tag={t("ds.relational.tag")} eyebrow={t("ds.relational.eyebrow")} />
      <View style={styles.centerState}>
        <Svg width={34} height={34} viewBox="0 0 24 24">
          <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
        </Svg>
        <Text style={styles.stateTitle}>{isKo ? "아직 이어진 사람과 지식이 없어요" : "No people or knowledge linked yet"}</Text>
        <Text style={styles.stateBody}>
          {isKo
            ? "기록에 사람과 관심사가 쌓이면, 관계와 지식 속의 내 모습이 여기 보여요."
            : "As people and interests build up in your records, the you inside relationships and knowledge shows here."}
        </Text>
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
          <Text style={styles.stateBody}>{isKo ? "조각을 세는 중이에요" : "Counting your pieces"}</Text>
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
          <Text style={styles.stateTitle}>{isKo ? "이 영역엔 아직 쌓인 게 없어요" : "Nothing built up here yet"}</Text>
          <Text style={styles.stateBody}>
            {isKo
              ? "기록을 남기면 어떤 영역을 가장 많이 키워왔는지 여기 보여요."
              : "Add records and you'll see which areas you've grown the most."}
          </Text>
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
                  count={isKo ? `${d.count}개` : `${d.count} pieces`}
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
  obsPanel: { gap: 8, marginBottom: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: withAlpha(deepSpace.accentSoft, 0.3), backgroundColor: withAlpha(deepSpace.accentSoft, 0.06) },
  obsTitle: { color: deepSpace.accentBright, fontSize: 13, fontFamily: fontFamilies.pixelKo },
  obsNote: { color: withAlpha(deepSpace.text, 0.55), fontSize: 11, lineHeight: 16, fontFamily: fontFamilies.readable, marginBottom: 4 },
  obsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  obsLabel: { color: withAlpha(deepSpace.text, 0.85), fontSize: 12, width: 64, fontFamily: fontFamilies.readable },
  obsTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: withAlpha(deepSpace.text, 0.12), overflow: "hidden" },
  obsFill: { height: "100%", borderRadius: 3, backgroundColor: deepSpace.accentSoft },
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
  dashedCardOn: { borderColor: deepSpace.accent, backgroundColor: withAlpha(deepSpace.accent, 0.08) },
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
