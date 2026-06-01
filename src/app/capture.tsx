// /capture v2 — multi-mode "자재 반입" screen.
//
// 5 input modes per user directive (2026-05-27):
//   ✍️  Memo    — free-form note (default)
//   🔗  Link    — URL + auto-scrape title (kept the v1 clipper detection)
//   📋  Clip    — paste markdown from Obsidian Web Clipper or similar
//   📸  OCR     — pick image (library/camera) → Gemini multimodal OCR
//   📄  File    — pick PDF/DOCX/.txt → upload + index
//
// Common UI:
//   - Top toggle: 일상 Wiki / Pro Wiki (the wiki_track tag).
//   - Mode tabs row.
//   - Mode-specific input area.
//   - "분류 결과" — after LLM classify (suggested tags + suggested track).
//     Editable chips, track toggle stays user-final.
//   - Submit: persists via captureFromMarkdown + tag updates.

import { useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { PremiumCard, PremiumButton } from "@/components/premium";
import { ShardArt } from "@/components/art/IslandArt";
import { Input } from "@/components/ui/Input";
import { radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { detectClipperKind } from "@/lib/wiki/clipper-kind";
import { pickAndOcrImage } from "@/lib/wiki/capture-image";
import { pickFile, type PickedFile } from "@/lib/wiki/capture-file";
import { classifyClipper, type WikiTrack } from "@/lib/wiki/classify-clipper";
import { proposeClipperTemplate, type ProposedClipperTemplate } from "@/lib/wiki/propose-template";
import { saveTemplate } from "@/lib/wiki/template-queries";
import type { SourceKind } from "@/lib/wiki/types";
import { classifyLinkOrClip, firstUrlIn } from "@/lib/wiki/link-or-clip";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { createRecord } from "@/lib/records/create";
import { computeStreak } from "@/lib/journal/streak";
import { dailyPrompt } from "@/lib/journal/daily-prompts";
import { listRecentRecords, countRecordsByKind } from "@/lib/records/create";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import type { HotlineId } from "@/lib/safety/lexicon";
// Journal-mode (일기) entitlement: Lv3 unlock + free-tier use limit, ported
// from the retired /journal screen so the /journal→/capture redirect (Phase 3)
// doesn't bypass progression gating.
import { useProgression } from "@/lib/progression/useProgression";
import { checkGate } from "@/lib/progression/gates";
import { checkUsage } from "@/lib/progression/entitlements";

// Unified 담기 (menu restructure Phase 2): the journal (오늘의 조각) and the
// capture modes live on one screen. "일기" writes to `records` (createRecord —
// streak / reflection / optional Advisor); the rest write to `sources`
// (captureFromMarkdown). Reads were already unified via mergeEvidence.
type Mode = "journal" | "memo" | "linkclip" | "ocr" | "file";

const CAPTURE_MODES: Mode[] = ["journal", "memo", "linkclip", "ocr", "file"];

const MODE_LABEL: Record<Mode, { en: string; ko: string }> = {
  journal: { en: "Journal", ko: "일기" },
  memo: { en: "Memo", ko: "메모" },
  linkclip: { en: "Link/Clip", ko: "링크/스크랩" },
  ocr: { en: "OCR", ko: "이미지" },
  file: { en: "File", ko: "문서" },
};

const TRACK_OPTIONS: { id: WikiTrack; en: string; ko: string }[] = [
  { id: "daily", en: "Daily Wiki", ko: "일상 Wiki" },
  { id: "pro", en: "Pro Wiki", ko: "Pro Wiki" },
];

const MODE_HELP: Record<Mode, { en: string; ko: string }> = {
  journal: {
    en: "Today's piece: a reflection saved to your records, with an optional Advisor reply.",
    ko: "오늘의 조각: 기록에 저장되는 성찰. 원하면 AI 조언도 받을 수 있어요.",
  },
  memo: {
    en: "Jot a short note. Tags and track get added automatically when you toss it.",
    ko: "한 줄 메모. 던지면 일꾼 세포가 알아서 분류·태그를 달아요.",
  },
  linkclip: {
    en: "Paste a URL, or paste the markdown your Web Clipper gave you. We'll detect which.",
    ko: "URL을 붙이거나, Web Clipper가 만든 마크다운을 붙여 넣으세요. 알아서 구분해요.",
  },
  ocr: {
    en: "Pick an image or use the camera. The workers will read the text out.",
    ko: "이미지를 고르세요. 일꾼 세포가 그 위 글자를 읽어 옵니다.",
  },
  file: {
    en: "Pick a PDF / DOCX / .txt. Text is extracted and indexed.",
    ko: "PDF · DOCX · .txt를 고르세요. 텍스트가 추출되어 색인됩니다.",
  },
};

function ModeGlyph({ mode, color }: { mode: Mode; color: string }) {
  const sw = 1.8;
  switch (mode) {
    case "journal":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph}>
          <Path d="M14 4 A8 8 0 1 0 14 20 A6 6 0 1 1 14 4 Z" fill={color} />
        </Svg>
      );
    case "memo":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph}>
          <Path d="M7 17 L8 13 L16 5 L19 8 L11 16 Z" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Line x1="13.5" y1="7.5" x2="16.5" y2="10.5" stroke={color} strokeWidth={sw} />
          <Line x1="6" y1="20" x2="18" y2="20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
    case "linkclip":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph}>
          <Path d="M9.5 14.5 L14.5 9.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M10 8 L8.5 8 C6.5 8 5 9.5 5 11.5 C5 13.5 6.5 15 8.5 15 L10 15" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
          <Path d="M14 9 L15.5 9 C17.5 9 19 10.5 19 12.5 C19 14.5 17.5 16 15.5 16 L14 16" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "ocr":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph}>
          <Rect x="5" y="8" width="14" height="10" rx="1.5" stroke={color} strokeWidth={sw} fill="none" />
          <Path d="M9 8 L10 6 L14 6 L15 8" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Circle cx="12" cy="13" r="2.4" stroke={color} strokeWidth={sw} fill="none" />
          <Path d="M4 5 L4 3 L7 3 M17 3 L20 3 L20 5 M4 19 L4 21 L7 21 M17 21 L20 21 L20 19" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case "file":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" style={styles.modeGlyph}>
          <Path d="M7 4 L14 4 L18 8 L18 20 L7 20 Z" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Path d="M14 4 L14 8 L18 8" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
          <Line x1="9" y1="12" x2="15" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="9" y1="15" x2="14" y2="15" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );
  }
}

function TrackGlyph({ id, color }: { id: WikiTrack; color: string }) {
  const sw = 1.8;
  if (id === "daily") {
    return (
      <Svg width={16} height={16} viewBox="0 0 16 16" style={styles.trackGlyph}>
        <Path d="M3 7.4 L8 3.2 L13 7.4" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M5 7.2 L5 13 L11 13 L11 7.2" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" style={styles.trackGlyph}>
      <Path d="M5.3 6.1 L5.3 4.8 C5.3 4.1 5.8 3.6 6.5 3.6 L9.5 3.6 C10.2 3.6 10.7 4.1 10.7 4.8 L10.7 6.1" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
      <Rect x="3" y="6" width="10" height="6.8" rx="1.2" stroke={color} strokeWidth={sw} fill="none" />
      <Line x1="3" y1="9.1" x2="13" y2="9.1" stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}

export default function Capture() {
  const { i18n } = useTranslation("capture");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [mode, setMode] = useState<Mode>("journal");
  const [track, setTrack] = useState<WikiTrack>("daily");
  const [body, setBody] = useState("");
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [ocrPreview, setOcrPreview] = useState<{ uri: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [tagsEditable, setTagsEditable] = useState<string[]>([]);
  // 루루 brief event moment on capture (companion pack §3: captureSaved → lulu).
  const companion = useCompanionMoment();
  // Title of the just-saved piece — drives the inline success panel.
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  // G3: AI-proposed new clipper format flow (opt-in, offered after an inbox capture).
  const [proposalCtx, setProposalCtx] = useState<{ content: string; url: string | null } | null>(null);
  const [proposal, setProposal] = useState<ProposedClipperTemplate | null>(null);
  const [proposing, setProposing] = useState(false);
  const [formatSavedMsg, setFormatSavedMsg] = useState<string | null>(null);

  // Journal-mode (일기) state — ported from /journal. Writes to records.
  const progression = useProgression();
  const [journalCount, setJournalCount] = useState(0);
  const [topic, setTopic] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [askAdvisor, setAskAdvisor] = useState(false);
  const [recentDates, setRecentDates] = useState<string[]>([]);
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "GLOBAL_988",
  });
  const streak = useMemo(() => computeStreak(recentDates), [recentDates]);

  // Load recent record dates (journal streak) + journal use count (free-tier
  // limit) once we have a user.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void Promise.all([
      listRecentRecords(userId),
      countRecordsByKind(userId, "journal"),
    ])
      .then(([rows, jc]) => {
        if (cancelled) return;
        setRecentDates((rows as { created_at: string }[]).map((r) => r.created_at));
        setJournalCount(jc);
      })
      .catch((e) => {
        if (typeof console !== "undefined") console.warn("[capture] streak load failed", (e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Link/Clip unified box lives in `body`. If it's a bare URL we detect the
  // clipper kind from it; otherwise it's pasted markdown. These useMemo hooks
  // MUST stay above the early returns below: a hook after a conditional return
  // violates rules-of-hooks, and a userId/loading flip on a later render would
  // skip them and blank the screen (React #300). rules-of-hooks now guards this.
  const linkClipKind = useMemo(() => classifyLinkOrClip(body), [body]);
  const detectedKind = useMemo(
    () => (linkClipKind === "url" ? detectClipperKind(body.trim()) : "inbox"),
    [linkClipKind, body],
  );

  if (loading) return null;
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }

  // 일기(journal) entitlement — unlocks at Lv3, then the free tier allows a
  // fixed number of entries. Other modes write to `sources` and were never
  // gated, so this only constrains the journal mode.
  const journalGate = checkGate("journal", progression.totalXp);
  const journalUsage = checkUsage("journal", progression.tier, journalCount);

  function reset() {
    setBody("");
    setPickedFile(null);
    setOcrPreview(null);
    setTagsEditable([]);
    setTopic("");
    setConclusion("");
    setShowExtras(false);
    setAskAdvisor(false);
    setProposalCtx(null);
    setProposal(null);
    setFormatSavedMsg(null);
  }

  async function runOcr(source: "library" | "camera") {
    if (!userId) return;
    try {
      const r = await pickAndOcrImage(userId, locale, source);
      if (!r) return;
      setOcrPreview({ uri: r.uri });
      setBody(r.markdown);
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "이미지 읽기 실패" : "OCR failed",
        (e as Error).message,
      );
    }
  }

  async function runFilePick() {
    try {
      const f = await pickFile();
      if (!f) return;
      setPickedFile(f);
      if (f.textContent) setBody(f.textContent);
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "파일 열기 실패" : "File pick failed",
        (e as Error).message,
      );
    }
  }

  function removeTag(t: string) {
    setTagsEditable((prev) => prev.filter((x) => x !== t));
  }

  function addTagFromInput(input: string) {
    const norm = input.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-");
    if (norm.length === 0 || tagsEditable.includes(norm)) return;
    setTagsEditable((prev) => [...prev, norm].slice(0, 10));
  }

  const canSubmit = !!userId && !submitting && (
    (mode === "journal" && journalGate.unlocked && journalUsage.allowed && body.trim().length > 0) ||
    (mode === "memo" && body.trim().length > 0) ||
    (mode === "linkclip" && body.trim().length > 0) ||
    (mode === "ocr" && body.trim().length > 0) ||
    (mode === "file" && (!!pickedFile || body.trim().length > 0))
  );

  // 일기(journal) mode writes to `records` via createRecord: streak, optional
  // topic/conclusion, and an opt-in Advisor reply. Crisis routing is honoured.
  async function handleJournalSubmit() {
    if (!userId || !body.trim()) return;
    setSubmitting(true);
    try {
      const res = await createRecord({
        userId,
        locale,
        kind: "journal",
        body: body.trim(),
        topic: topic.trim().length > 0 ? topic.trim() : undefined,
        tags: tagsEditable.length > 0 ? tagsEditable : undefined,
        conclusion: conclusion.trim().length > 0 ? conclusion.trim() : undefined,
        withFollowup: askAdvisor,
      });
      if (res.followup?.zone === "red") {
        setCrisis({ visible: true, hotline: locale === "ko" ? "KR_1393" : "GLOBAL_988" });
      }
      const savedTopic = topic.trim();
      reset();
      companion.fire("journalSaved");
      setSavedTitle(savedTopic.length > 0 ? savedTopic : (locale === "ko" ? "오늘의 조각" : "Today's piece"));
      // Refresh streak + journal use count (free-tier limit) + XP (the entry
      // earns progression, mirroring the retired /journal screen).
      void progression.refresh();
      void Promise.all([
        listRecentRecords(userId),
        countRecordsByKind(userId, "journal"),
      ])
        .then(([rows, jc]) => {
          setRecentDates((rows as { created_at: string }[]).map((r) => r.created_at));
          setJournalCount(jc);
        })
        .catch(() => {});
    } catch (e) {
      Alert.alert(locale === "ko" ? "저장 실패" : "Save failed", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!userId) return;
    if (mode === "journal") return handleJournalSubmit();
    setSubmitting(true);
    try {
      // Compose the body that captureFromMarkdown will index.
      // memo / ocr already have body. linkclip: a bare URL becomes a titled
      // stub; pasted markdown is used as-is. file falls back to filename.
      const isBareLink = mode === "linkclip" && linkClipKind === "url";
      // fallbackUrl: the bare URL, or the first URL found inside clipped md.
      const fallbackUrl =
        mode === "linkclip"
          ? (isBareLink ? body.trim() : firstUrlIn(body))
          : null;

      let finalBody = body.trim();
      if (isBareLink) {
        finalBody = `# ${body.trim()}\n\n${body.trim()}`;
      }
      if (mode === "file" && pickedFile && finalBody.length === 0) {
        finalBody = `# ${pickedFile.name}\n\nFile attachment — ${pickedFile.mimeType}, ${pickedFile.size} bytes.`;
      }

      // AI clipper classification on toss (2026-06-01 directive): one call
      // reads the content, picks the clipper kind, and fills the semantic
      // frontmatter (target-category / simon-relevance / actionable-takeaway /
      // kind-specific props). User-curated hashtags win; failure never blocks
      // the save (degrades to the URL-derived kind + no extra frontmatter).
      let finalTags = tagsEditable;
      let suggestedTrack: WikiTrack = track;
      // OCR is user-authored knowledge → keep self_knowledge; else let the AI pick.
      let kindOverride: SourceKind | null = mode === "ocr" ? "self_knowledge" : null;
      let extraFrontmatter: Record<string, unknown> | undefined;
      let simonRelevance: number | null = null;
      if (finalBody.length > 0) {
        try {
          const cls = await classifyClipper(userId, finalBody, fallbackUrl, locale);
          if (tagsEditable.length === 0) finalTags = cls.tags;
          suggestedTrack = cls.track;
          if (mode !== "ocr") kindOverride = cls.kind;
          extraFrontmatter = {
            ...cls.props,
            "target-category": cls.targetCategory,
            "actionable-takeaway": cls.actionableTakeaway,
            summary: cls.summary,
          };
          simonRelevance = cls.simonRelevance;
        } catch (e) {
          if (typeof console !== "undefined") console.warn("[capture] auto-classify failed", (e as Error).message);
        }
      }

      const result = await captureFromMarkdown({
        userId,
        rawMd: finalBody,
        fallbackUrl,
        kindOverride,
        userTags: finalTags,
        track: suggestedTrack,
        extraFrontmatter,
        simonRelevance,
      });

      reset();
      // 루루 carries the shard home; an imported link gets the "success" beat.
      companion.fire(isBareLink ? "linkImported" : "captureSaved");
      // Inline success panel (journal-capture pack §3/§7) replaces the alert.
      setSavedTitle(result.source.title);
      // G3: a capture that landed as "inbox" (no specific format fit) is the
      // signal to offer an AI-proposed new format. Gate on body length so
      // trivial memos don't prompt. Opt-in: nothing runs until the user taps.
      if (result.source.kind === "inbox" && finalBody.trim().length >= 120) {
        setProposalCtx({ content: finalBody, url: fallbackUrl });
      }
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "저장 실패" : "Save failed",
        (e as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  // G3: AI proposes a new clipper format for material that fit no existing one.
  // Opt-in — only runs when the user taps. Never blocks; a null proposal (mock
  // mode, bad reply, or C-vocabulary filtered) just tells the user there's none.
  async function runPropose() {
    if (!userId || !proposalCtx || proposing) return;
    setProposing(true);
    try {
      const p = await proposeClipperTemplate(userId, proposalCtx.content, proposalCtx.url, locale);
      if (!p) {
        setProposalCtx(null);
        Alert.alert(
          locale === "ko" ? "형식 제안 없음" : "No format to suggest",
          locale === "ko" ? "이 자료에 맞는 새 형식을 만들지 못했어요." : "Couldn't draft a new format for this one.",
        );
        return;
      }
      setProposal(p);
    } catch (e) {
      Alert.alert(locale === "ko" ? "제안 실패" : "Proposal failed", (e as Error).message);
    } finally {
      setProposing(false);
    }
  }

  // Save the proposed format to the user's own library; `share` opts it in to
  // the community (clipper_templates.is_shared, so every user can read it).
  async function saveProposed(share: boolean) {
    if (!userId || !proposal) return;
    try {
      await saveTemplate({
        ownerId: userId,
        slug: proposal.slug,
        baseKind: proposal.baseKind,
        name: proposal.name,
        what: proposal.what,
        defaultTags: proposal.defaultTags,
        targetCategory: proposal.targetCategory,
        aiProperties: proposal.aiProperties,
        shared: share,
      });
      setProposal(null);
      setProposalCtx(null);
      setFormatSavedMsg(
        share
          ? locale === "ko"
            ? "새 형식을 저장하고 마을에 공유했어요."
            : "Saved your new format and shared it with the village."
          : locale === "ko"
            ? "새 형식을 내 형식으로 저장했어요."
            : "Saved as your personal format.",
      );
    } catch (e) {
      Alert.alert(locale === "ko" ? "형식 저장 실패" : "Save format failed", (e as Error).message);
    }
  }

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SceneHero
            eyebrow={locale === "ko" ? "01. 조각 담기" : "01. Capture"}
            title={locale === "ko" ? "떠오른 조각을 마을로" : "Send a piece into the village"}
            subtitle={locale === "ko" ? "일기 · 메모 · 링크 · 파일 · 사진" : "Journal · memo · link · file · photo"}
            island="records"
            worker="lulu"
            speech={
              savedTitle
                ? locale === "ko"
                  ? "새 조각을 챙겼어요. 그래프에서 바로 확인할 수 있어요."
                  : "I carried the new piece home. You can see it on the graph."
                : locale === "ko"
                  ? "아직 거칠어도 괜찮아요. 제가 조각으로 정리해둘게요."
                  : "It can be rough. I'll carry it home as a piece."
            }          />

          {/* Import success → graph link (journal-capture pack §3/§7) */}
          {savedTitle ? (
            <PremiumCard glow style={styles.savedPanel}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <ShardArt id="capture_mint" size={48} />
                <View style={{ flex: 1 }}>
                  <Text variant="body" color="brand" style={{ fontWeight: "600" }}>
                    {locale === "ko" ? "루루가 새 조각을 가져왔어요" : "Lulu brought a new piece"}
                  </Text>
                  <Text variant="subtle" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
                    {savedTitle}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                <PremiumButton label={locale === "ko" ? "그래프 보기" : "See the graph"} variant="secondary" onPress={() => router.push("/")} style={{ flex: 1 }} />
                <PremiumButton label={locale === "ko" ? "또 담기" : "Capture more"} variant="ghost" onPress={() => setSavedTitle(null)} style={{ flex: 1 }} />
              </View>
            </PremiumCard>
          ) : null}

          {/* G3: after an "inbox" capture (no format fit), offer an AI-proposed
              new clipper format. Opt-in: nothing runs until the user taps. */}
          {proposalCtx || proposal || formatSavedMsg ? (
            <PremiumCard style={styles.proposalPanel}>
              {formatSavedMsg ? (
                <Text variant="body" color="brand">{formatSavedMsg}</Text>
              ) : proposal ? (
                <View style={{ gap: spacing.xs }}>
                  <Text variant="caption" color="brand" style={styles.eyebrow}>
                    {locale === "ko" ? "새 형식 제안" : "Proposed new format"}
                  </Text>
                  <Text variant="body" style={{ fontWeight: "600" }}>
                    {(locale === "ko" ? proposal.name.ko : proposal.name.en) || proposal.name.en || proposal.name.ko}
                  </Text>
                  <Text variant="subtle" color="textMuted">
                    {(locale === "ko" ? proposal.what.ko : proposal.what.en) || proposal.what.en}
                  </Text>
                  <Text variant="subtle" color="textSubtle">
                    {locale === "ko" ? `기준 종류: ${proposal.baseKind}` : `Base kind: ${proposal.baseKind}`}
                  </Text>
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                    <PremiumButton
                      label={locale === "ko" ? "내 형식으로 저장" : "Save as mine"}
                      variant="secondary"
                      onPress={() => saveProposed(false)}
                      style={{ flex: 1 }}
                    />
                    <PremiumButton
                      label={locale === "ko" ? "저장하고 공유" : "Save & share"}
                      variant="primary"
                      onPress={() => saveProposed(true)}
                      style={{ flex: 1 }}
                    />
                  </View>
                  <Pressable onPress={() => { setProposal(null); setProposalCtx(null); }} hitSlop={4} style={{ marginTop: 4 }}>
                    <Text variant="caption" color="textSubtle">{locale === "ko" ? "안 만들래요" : "Not now"}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  <Text variant="subtle" color="textMuted">
                    {locale === "ko"
                      ? "이 자료에 딱 맞는 형식이 없네요. AI가 새 형식을 제안할까요?"
                      : "No format fit this well. Want the AI to propose a new one?"}
                  </Text>
                  <PremiumButton
                    label={
                      proposing
                        ? (locale === "ko" ? "제안 만드는 중..." : "Drafting...")
                        : (locale === "ko" ? "새 형식 제안받기" : "Propose a new format")
                    }
                    variant="secondary"
                    onPress={runPropose}
                  />
                </View>
              )}
            </PremiumCard>
          ) : null}

          {/* Entry to the format-manager (/formats): list, share, edit, or delete
              the clipper formats — including any just proposed above. */}
          <Pressable
            onPress={() => router.push("/formats")}
            hitSlop={6}
            style={styles.manageFormatsLink}
            accessibilityRole="button"
            accessibilityLabel={locale === "ko" ? "내 형식 관리" : "Manage my formats"}
          >
            <Text variant="caption" color="brand">
              {locale === "ko" ? "내 형식 관리하기" : "Manage my formats"}
            </Text>
          </Pressable>

          {/* Track toggle: 일상 / Pro — only for capture modes (not journal). */}
          {mode !== "journal" ? (
          <View style={styles.trackCard}>
            <Text variant="caption" color="brand" style={styles.eyebrow}>
              {locale === "ko" ? "어디로 갈까요?" : "Which wiki?"}
            </Text>
            <View style={styles.trackRow}>
              {TRACK_OPTIONS.map((option) => {
                const active = track === option.id;
                const color = active ? semantic.background : semantic.textMuted;
                return (
                  <Pressable
                    key={option.id}
                    style={[styles.trackChip, active && styles.trackChipActive]}
                    onPress={() => setTrack(option.id)}
                    hitSlop={4}
                  >
                    <TrackGlyph id={option.id} color={color} />
                    <Text style={[styles.trackChipText, active && styles.trackChipTextActive]}>
                      {option[locale]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          ) : null}

          {/* Mode tabs */}
          <View style={styles.modeRow}>
            {CAPTURE_MODES.map((m) => {
              const active = mode === m;
              const color = active ? semantic.background : semantic.textMuted;
              return (
                <Pressable
                  key={m}
                  style={[styles.modeTab, active && styles.modeTabActive]}
                  onPress={() => {
                    setMode(m);
                    // Clear all per-mode input so a URL box never "bleeds" into
                    // the memo/file box (2026-05-31 directive: inputs feel shared).
                    reset();
                  }}
                  hitSlop={2}
                >
                  <ModeGlyph mode={m} color={color} />
                  <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
                    {MODE_LABEL[m][locale]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text variant="subtle" color="textMuted" style={styles.modeHelp}>
            {MODE_HELP[mode][locale]}
          </Text>

          {/* Journal (일기) gate — Lv3 unlock then free-tier use limit, ported
              from the retired /journal screen so the redirect can't bypass it. */}
          {mode === "journal" && progression.loading ? (
            <View style={styles.gateCard}>
              <ActivityIndicator color={semantic.brand} />
            </View>
          ) : null}
          {mode === "journal" && !progression.loading && !journalGate.unlocked ? (
            <View style={styles.gateCard}>
              <Text variant="subtle" color="brand" style={styles.gateEyebrow}>
                {locale === "ko" ? "일기 잠김" : "Journal locked"}
              </Text>
              <Text variant="body" style={{ marginTop: spacing.xs }}>
                {locale === "ko"
                  ? `입문 퀘스트(과거의 나)를 완료하면 Lv${journalGate.requiredLevel}에 도달하고 일기가 열려요.`
                  : `Finish the onboarding quest (past me) to reach Lv${journalGate.requiredLevel} and unlock journaling.`}
              </Text>
              <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
                {locale === "ko"
                  ? `현재 Lv${journalGate.currentLevel} / 필요 Lv${journalGate.requiredLevel}`
                  : `Current Lv${journalGate.currentLevel} / Lv${journalGate.requiredLevel} required`}
              </Text>
              <View style={{ marginTop: spacing.md }}>
                <Button
                  label={locale === "ko" ? "과거의 나 시작하기" : "Start the past me"}
                  variant="secondary"
                  onPress={() => router.push("/audit")}
                />
              </View>
            </View>
          ) : null}
          {mode === "journal" && !progression.loading && journalGate.unlocked && !journalUsage.allowed ? (
            <View style={styles.limitCard}>
              <Text variant="subtle" color="warning" style={styles.gateEyebrow}>
                {locale === "ko" ? "무료 한도 도달" : "Free limit reached"}
              </Text>
              <Text variant="body" style={{ marginTop: spacing.xs }}>
                {locale === "ko"
                  ? `무료 일기 ${journalUsage.limit}회를 모두 사용했어요. Soma 구독부터 일기를 무제한으로 쓸 수 있어요.`
                  : `You have used all ${journalUsage.limit} free journal entries. The Soma plan and up unlock unlimited journaling.`}
              </Text>
              <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
                {locale === "ko" ? "구독 화면은 곧 추가됩니다." : "The subscription screen is coming soon."}
              </Text>
            </View>
          ) : null}

          {/* Journal (일기) mode — streak, reflection prompt, topic, body,
              optional conclusion, opt-in Advisor. Writes to records. Only shown
              when unlocked and within the free-tier limit. */}
          {mode === "journal" && !progression.loading && journalGate.unlocked && journalUsage.allowed ? (
            <View style={styles.fieldGroup}>
              {streak.current > 0 ? (
                <View style={styles.streakRow}>
                  <View style={[styles.streakDot, streak.capturedToday && styles.streakDotOn]} />
                  <Text variant="subtle" color="textMuted">
                    {locale === "ko"
                      ? `${streak.current}일 연속 기록${streak.capturedToday ? "" : " (오늘은 아직)"}`
                      : `${streak.current}-day streak${streak.capturedToday ? "" : " (none today yet)"}`}
                  </Text>
                </View>
              ) : null}
              <View style={styles.dailyPromptCard}>
                <Text variant="caption" color="brand" style={{ letterSpacing: 1.2 }}>
                  {locale === "ko" ? "오늘의 성찰 질문" : "Today's reflection prompt"}
                </Text>
                <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs, lineHeight: 22 }} selectable>
                  {dailyPrompt(locale)}
                </Text>
                {topic.length === 0 ? (
                  <Pressable onPress={() => setTopic(dailyPrompt(locale))} hitSlop={4} style={{ marginTop: spacing.xs }}>
                    <Text variant="caption" color="brand">
                      {locale === "ko" ? "이 질문을 주제로" : "Use this as topic"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Input
                value={topic}
                onChangeText={setTopic}
                placeholder={locale === "ko" ? "주제 (선택): 한 줄로" : "Topic (optional): one line"}
                autoCapitalize="sentences"
              />
              <Input
                value={body}
                onChangeText={setBody}
                placeholder={
                  locale === "ko"
                    ? "오늘 떠오른 생각이나 느낌을 적어주세요. 한 문장이어도 충분해요."
                    : "What's on your mind today? One sentence is enough."
                }
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                style={styles.textarea}
              />
              <Pressable onPress={() => setShowExtras((v) => !v)} hitSlop={4}>
                <Text variant="caption" color="brand">
                  {showExtras
                    ? (locale === "ko" ? "결론 칸 닫기" : "Hide conclusion field")
                    : (locale === "ko" ? "결론 한 줄로 (선택)" : "Add a one-line conclusion (optional)")}
                </Text>
              </Pressable>
              {showExtras ? (
                <Input
                  value={conclusion}
                  onChangeText={setConclusion}
                  placeholder={locale === "ko" ? "결론: 오늘의 한 줄 깨달음" : "Conclusion: today's takeaway"}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              ) : null}
              <Pressable onPress={() => setAskAdvisor((v) => !v)} hitSlop={4} style={styles.advisorRow}>
                <View style={[styles.advisorCheck, askAdvisor && styles.advisorCheckOn]}>
                  {askAdvisor ? <Text variant="caption" color="background">✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="subtle" color={askAdvisor ? "brand" : "textMuted"}>
                    {locale === "ko" ? "이 기록에 AI 조언 받기" : "Ask Advisor on this entry"}
                  </Text>
                  <Text variant="subtle" color="textSubtle">
                    {locale === "ko" ? "기본은 꺼짐. 되묻고 싶을 때만 켜세요." : "Off by default. Turn on only when you want a reflection back."}
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : null}

          {/* Mode-specific inputs. Each mode renders ONLY its own field block
              inside a bordered group so the URL/body boxes never read as one
              shared field across modes (2026-05-31 directive). */}
          {mode === "linkclip" ? (
            <View style={styles.fieldGroup}>
              <Text variant="caption" color="textMuted">
                {locale === "ko" ? "링크 또는 스크랩" : "Link or clip"}
              </Text>
              <Input
                value={body}
                onChangeText={setBody}
                placeholder={
                  locale === "ko"
                    ? "https://… 또는 클리퍼 마크다운을 붙여 넣으세요"
                    : "https://… or paste clipper markdown"
                }
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                style={styles.textarea}
              />
              {linkClipKind === "url" ? (
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko" ? `링크 자동 인식: ${detectedKind}` : `Link detected: ${detectedKind}`}
                </Text>
              ) : linkClipKind === "markdown" ? (
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko" ? "스크랩으로 저장돼요" : "Saved as a clip"}
                </Text>
              ) : null}
            </View>
          ) : null}

          {(mode === "memo" || mode === "ocr") ? (
            <View style={styles.fieldGroup}>
              <Text variant="caption" color="textMuted">
                {mode === "ocr"
                  ? (locale === "ko" ? "추출된 텍스트 (수정 가능)" : "Extracted text (editable)")
                  : (locale === "ko" ? "본문" : "Body")}
              </Text>
              <Input
                value={body}
                onChangeText={setBody}
                placeholder={
                  mode === "ocr"
                    ? (locale === "ko" ? "이미지를 고르면 여기에 추출된 글이 나와요." : "Pick an image to OCR text here.")
                    : (locale === "ko" ? "자유롭게 적거나 붙여 넣으세요…" : "Write or paste freely…")
                }
                multiline
                numberOfLines={mode === "memo" ? 6 : 12}
                textAlignVertical="top"
                style={styles.textarea}
              />
            </View>
          ) : null}

          {mode === "ocr" ? (
            <View style={styles.actionRow}>
              <Button
                label={locale === "ko" ? "카메라" : "Camera"}
                variant="secondary"
                onPress={() => runOcr("camera")}
              />
              <Button
                label={locale === "ko" ? "갤러리" : "Library"}
                variant="secondary"
                onPress={() => runOcr("library")}
              />
            </View>
          ) : null}

          {mode === "ocr" && ocrPreview ? (
            <View style={styles.previewCard}>
              <Text variant="caption" color="brand">{locale === "ko" ? "미리보기" : "Preview"}</Text>
              <Image source={{ uri: ocrPreview.uri }} style={styles.imagePreview} resizeMode="contain" />
            </View>
          ) : null}

          {mode === "file" ? (
            <View style={styles.actionRow}>
              <Button
                label={locale === "ko" ? "파일 선택" : "Pick file"}
                variant="secondary"
                onPress={runFilePick}
              />
            </View>
          ) : null}

          {mode === "file" && pickedFile ? (
            <View style={styles.previewCard}>
              <Text variant="caption" color="brand">{locale === "ko" ? "선택된 파일" : "Selected file"}</Text>
              <Text variant="subtle" color="textMuted">{pickedFile.name}</Text>
              <Text variant="subtle" color="textSubtle">
                {pickedFile.mimeType} · {(pickedFile.size / 1024).toFixed(1)} KB
              </Text>
              {pickedFile.textContent ? (
                <Text variant="subtle" color="textMuted" style={{ marginTop: 6 }}>
                  {locale === "ko" ? "텍스트 추출됨: 본문에 채워졌어요" : "Text extracted: filled into body"}
                </Text>
              ) : (
                <Text variant="subtle" color="textSubtle" style={{ marginTop: 6 }}>
                  {locale === "ko" ? "바이너리 파일: 메타데이터만 저장" : "Binary: metadata only"}
                </Text>
              )}
            </View>
          ) : null}

          {/* Hashtags — always visible (2026-05-31 directive). No separate
              auto-classify button: tossing auto-classifies if these are empty.
              Add tags one at a time via the + chip. */}
          <View style={styles.classifiedCard}>
            <Text variant="caption" color="brand">
              {locale === "ko" ? "해시태그" : "Hashtags"}
            </Text>
            <View style={styles.tagRow}>
              {tagsEditable.map((t) => (
                <Pressable key={t} onPress={() => removeTag(t)} style={styles.tagChip} hitSlop={2}>
                  <Text style={styles.tagChipText}>#{t} ✕</Text>
                </Pressable>
              ))}
              <HashtagAdder onAdd={addTagFromInput} locale={locale} />
            </View>
            <Text variant="subtle" color="textSubtle" style={{ marginTop: 6 }}>
              {tagsEditable.length === 0
                ? (locale === "ko"
                    ? "비워 두면 던질 때 자동으로 달아줘요. +로 직접 추가할 수도 있어요."
                    : "Leave empty and we'll tag it on toss, or add your own with +.")
                : (locale === "ko" ? "태그를 누르면 삭제됩니다." : "Tap a tag to remove.")}
            </Text>
          </View>

          <View style={styles.submitRow}>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={
                !canSubmit
                  ? [styles.tossBtn, styles.tossBtnDisabled]
                  : ({ pressed }) => [styles.tossBtn, pressed && styles.tossBtnPressed]
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            >
              <Text style={[styles.tossBtnText, !canSubmit && styles.tossBtnTextDisabled]}>
                {submitting
                  ? (locale === "ko" ? "던지는 중…" : "Tossing…")
                  : (locale === "ko" ? "영차영차 던지기" : "Send to the cells")}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* 루루 appears briefly to carry the new shard (companion pack §3) */}
      {companion.moment ? (
        <CompanionMoment moment={companion.moment} style={styles.captureFlash} />
      ) : null}
      {/* Crisis routing for journal-mode entries (C9). */}
      <CrisisRouter
        visible={crisis.visible}
        hotline={crisis.hotline}
        onClose={() => setCrisis((c) => ({ ...c, visible: false }))}
      />
    </PremiumAppShell>
  );
}

// Hashtag adder: a "+" chip that expands into a small inline input, so tags
// are entered one at a time at the hashtag location rather than in one big
// shared box (2026-05-31 directive). Confirming a tag keeps the input open
// for the next one; blur/empty-submit collapses it back to the "+" chip.
function HashtagAdder({ onAdd, locale }: { onAdd: (s: string) => void; locale: "en" | "ko" }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");

  function commit() {
    const next = v.trim();
    if (next.length > 0) {
      onAdd(next);
      setV("");
      // keep open so the user can add another hashtag in one flow
    } else {
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.tagAddChip}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={locale === "ko" ? "해시태그 추가" : "Add hashtag"}
      >
        <Text style={styles.tagAddChipText}>+</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.tagAddInputWrap}>
      <Text style={styles.tagAddHash}>#</Text>
      <Input
        value={v}
        onChangeText={setV}
        placeholder={locale === "ko" ? "태그" : "tag"}
        onSubmitEditing={commit}
        onBlur={() => { if (v.trim().length === 0) setOpen(false); }}
        autoFocus
        style={styles.tagAddInput}
        returnKeyType="done"
        blurOnSubmit={false}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  captureFlash: { position: "absolute", bottom: 40, right: 20 },
  // Journal-mode (일기) bits, ported from /journal.
  streakRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  streakDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: "transparent",
  },
  streakDotOn: {
    borderColor: semantic.brand,
    backgroundColor: semantic.brand,
    shadowColor: semantic.brand,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  dailyPromptCard: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: semantic.brand,
  },
  advisorRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.xs },
  advisorCheck: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  advisorCheckOn: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  // 일기 gate cards (Lv3 lock / free-tier limit), ported from /journal.
  gateEyebrow: { fontWeight: "700", letterSpacing: 1 },
  gateCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: semantic.brand,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  limitCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.warning,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: semantic.warning,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  savedPanel: {
    backgroundColor: "rgba(114,242,199,0.06)",
    borderColor: "rgba(114,242,199,0.22)",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  proposalPanel: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftColor: semantic.brand,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  scroll: { paddingBottom: spacing.xl, gap: spacing.md },
  manageFormatsLink: { alignSelf: "flex-end", paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  trackCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  eyebrow: { letterSpacing: 1, fontWeight: "700" },
  trackRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  trackChip: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: "transparent",
    alignItems: "center",
  },
  trackChipActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  trackGlyph: { width: 16, height: 16 },
  trackChipText: { color: semantic.textMuted, fontSize: typography.sizes.sm, fontWeight: "600" },
  trackChipTextActive: { color: semantic.background, fontWeight: "700" },
  modeRow: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.xs,
  },
  modeTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    alignItems: "center",
    gap: 2,
  },
  modeTabActive: { backgroundColor: semantic.brand },
  modeGlyph: { width: 24, height: 24 },
  modeLabel: { color: semantic.textMuted, fontSize: typography.sizes.xs, fontWeight: "600" },
  modeLabelActive: { color: semantic.background, fontWeight: "700" },
  modeHelp: { lineHeight: 18, marginTop: -spacing.xs },
  fieldGroup: {
    gap: spacing.xs,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  textarea: {
    minHeight: 160,
    paddingTop: spacing.md,
    fontFamily: fontFamilies.mono,
    fontSize: typography.sizes.sm,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  previewCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 4,
  },
  imagePreview: { width: "100%", height: 200, borderRadius: radii.sm, marginTop: spacing.xs },
  classifiedCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftColor: semantic.brand,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  tagChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.brand,
    backgroundColor: "rgba(47,151,252,0.08)",
  },
  tagChipText: { color: semantic.brand, fontSize: typography.sizes.xs, fontWeight: "600" },
  // "+" chip that opens the inline hashtag input (sits in the tag row).
  tagAddChip: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.brand,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  tagAddChipText: { color: semantic.brand, fontSize: typography.sizes.md, fontWeight: "700", lineHeight: 18 },
  tagAddInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: semantic.brand,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
    minWidth: 96,
  },
  tagAddHash: { color: semantic.brand, fontSize: typography.sizes.sm, fontWeight: "700" },
  tagAddInput: { flex: 1, fontSize: typography.sizes.sm, paddingVertical: 2, minWidth: 64 },
  submitRow: { gap: spacing.sm, marginTop: spacing.sm },
  // 영차영차 던지기 — solid primary with a clear pressed beat (scale, no
  // bounce per DESIGN.md) so the toss actually feels like it lands.
  tossBtn: {
    alignSelf: "stretch",
    backgroundColor: semantic.brand,
    borderWidth: 1,
    borderColor: semantic.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: semantic.brand,
    shadowOpacity: 0.36,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  tossBtnPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  tossBtnDisabled: {
    backgroundColor: "rgba(13,21,48,0.86)",
    borderColor: "rgba(141,152,184,0.36)",
    shadowOpacity: 0,
  },
  tossBtnText: { color: semantic.background, fontSize: typography.sizes.md, fontWeight: "700" },
  tossBtnTextDisabled: { color: "rgba(232,236,248,0.72)" },
});
