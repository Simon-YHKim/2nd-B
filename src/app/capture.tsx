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

import { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { PremiumAppShell } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { PremiumCard, PremiumButton } from "@/components/premium";
import { ShardArt } from "@/components/art/IslandArt";
import { Input } from "@/components/ui/Input";
import { radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { AppNav } from "@/components/ui/AppNav";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { detectClipperKind } from "@/lib/wiki/clipper-kind";
import { pickAndOcrImage } from "@/lib/wiki/capture-image";
import { pickFile, type PickedFile } from "@/lib/wiki/capture-file";
import { classifyCapture, type WikiTrack } from "@/lib/wiki/classify-track";
import { classifyLinkOrClip, firstUrlIn } from "@/lib/wiki/link-or-clip";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";

// Link and Clip(스크랩) were merged into one "링크/스크랩" mode (2026-05-31
// user directive): paste a URL or paste clipper markdown — we detect which.
type Mode = "memo" | "linkclip" | "ocr" | "file";

const MODE_LABEL: Record<Mode, { en: string; ko: string; icon: string }> = {
  memo: { en: "Memo", ko: "메모", icon: "✍️" },
  linkclip: { en: "Link/Clip", ko: "링크/스크랩", icon: "🔗" },
  ocr: { en: "OCR", ko: "이미지", icon: "📸" },
  file: { en: "File", ko: "문서", icon: "📄" },
};

const MODE_HELP: Record<Mode, { en: string; ko: string }> = {
  memo: {
    en: "Jot a short note. Tags and track get added automatically when you toss it.",
    ko: "한 줄 메모. 던지면 일꾼 세포가 알아서 분류·태그를 달아요.",
  },
  linkclip: {
    en: "Paste a URL, or paste the markdown your Web Clipper gave you — we detect which.",
    ko: "URL을 붙이거나, Web Clipper가 만든 마크다운을 붙여 넣으세요. 알아서 구분해요.",
  },
  ocr: {
    en: "Pick an image (or use the camera) — the cells will read the text out.",
    ko: "이미지를 고르세요. 일꾼 세포가 그 위 글자를 읽어 옵니다.",
  },
  file: {
    en: "Pick a PDF / DOCX / .txt — text is extracted and indexed.",
    ko: "PDF · DOCX · .txt를 고르세요. 텍스트가 추출되어 색인됩니다.",
  },
};

export default function Capture() {
  const { i18n } = useTranslation("capture");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [mode, setMode] = useState<Mode>("memo");
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

  if (loading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  // Link/Clip unified box lives in `body`. If it's a bare URL we detect the
  // clipper kind from it; otherwise it's pasted markdown.
  const linkClipKind = useMemo(() => classifyLinkOrClip(body), [body]);
  const detectedKind = useMemo(
    () => (linkClipKind === "url" ? detectClipperKind(body.trim()) : "inbox"),
    [linkClipKind, body],
  );

  function reset() {
    setBody("");
    setPickedFile(null);
    setOcrPreview(null);
    setTagsEditable([]);
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
    (mode === "memo" && body.trim().length > 0) ||
    (mode === "linkclip" && body.trim().length > 0) ||
    (mode === "ocr" && body.trim().length > 0) ||
    (mode === "file" && (!!pickedFile || body.trim().length > 0))
  );

  async function handleSubmit() {
    if (!userId) return;
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

      // Auto-classify on toss (2026-05-31 directive): no separate button.
      // If the user already curated hashtags, keep theirs; otherwise ask the
      // cells to suggest. Classification failure never blocks the save.
      let finalTags = tagsEditable;
      let suggestedTrack: WikiTrack = track;
      if (tagsEditable.length === 0 && finalBody.length > 0) {
        try {
          const c = await classifyCapture(userId, finalBody, locale);
          finalTags = c.tags;
          suggestedTrack = c.track;
        } catch (e) {
          if (typeof console !== "undefined") console.warn("[capture] auto-classify failed", (e as Error).message);
        }
      }

      const result = await captureFromMarkdown({
        userId,
        rawMd: finalBody,
        fallbackUrl,
        kindOverride: mode === "ocr" ? "self_knowledge" : null,
        userTags: finalTags,
        track: suggestedTrack,
      });

      reset();
      // 루루 carries the shard home; an imported link gets the "success" beat.
      companion.fire(isBareLink ? "linkImported" : "captureSaved");
      // Inline success panel (journal-capture pack §3/§7) replaces the alert.
      setSavedTitle(result.source.title);
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "저장 실패" : "Save failed",
        (e as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text variant="caption" color="brand">2nd-Brain</Text>
            <Text variant="heading">
              {locale === "ko" ? "조각 담기" : "Capture a piece"}
            </Text>
            <Text variant="body" color="textMuted">
              {locale === "ko"
                ? "메모·링크·파일·사진을 던지면 조각으로 보관하고 자동으로 분류·태그해요."
                : "Toss a memo, link, file, or photo — we'll keep it as a piece and sort + tag it."}
            </Text>
          </View>

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

          {/* Track toggle: 일상 / Pro */}
          <View style={styles.trackCard}>
            <Text variant="caption" color="brand" style={styles.eyebrow}>
              {locale === "ko" ? "어디로 갈까요?" : "Which wiki?"}
            </Text>
            <View style={styles.trackRow}>
              <Pressable
                style={[styles.trackChip, track === "daily" && styles.trackChipActive]}
                onPress={() => setTrack("daily")}
                hitSlop={4}
              >
                <Text style={[styles.trackChipText, track === "daily" && styles.trackChipTextActive]}>
                  {locale === "ko" ? "🏠 일상 Wiki" : "🏠 Daily Wiki"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.trackChip, track === "pro" && styles.trackChipActive]}
                onPress={() => setTrack("pro")}
                hitSlop={4}
              >
                <Text style={[styles.trackChipText, track === "pro" && styles.trackChipTextActive]}>
                  {locale === "ko" ? "💼 Pro Wiki" : "💼 Pro Wiki"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Mode tabs */}
          <View style={styles.modeRow}>
            {(["memo", "linkclip", "ocr", "file"] as Mode[]).map((m) => (
              <Pressable
                key={m}
                style={[styles.modeTab, mode === m && styles.modeTabActive]}
                onPress={() => {
                  setMode(m);
                  // Clear all per-mode input so a URL box never "bleeds" into
                  // the memo/file box (2026-05-31 directive: inputs feel shared).
                  reset();
                }}
                hitSlop={2}
              >
                <Text style={styles.modeIcon}>{MODE_LABEL[m].icon}</Text>
                <Text style={[styles.modeLabel, mode === m && styles.modeLabelActive]}>
                  {MODE_LABEL[m][locale]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text variant="subtle" color="textMuted" style={styles.modeHelp}>
            {MODE_HELP[mode][locale]}
          </Text>

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
                label={locale === "ko" ? "📷 카메라" : "📷 Camera"}
                variant="secondary"
                onPress={() => runOcr("camera")}
              />
              <Button
                label={locale === "ko" ? "🖼️ 갤러리" : "🖼️ Library"}
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
                label={locale === "ko" ? "📂 파일 선택" : "📂 Pick file"}
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
                  {locale === "ko" ? "텍스트 추출됨 — 본문에 채워졌어요" : "Text extracted — filled into body"}
                </Text>
              ) : (
                <Text variant="subtle" color="textSubtle" style={{ marginTop: 6 }}>
                  {locale === "ko" ? "바이너리 파일 — 메타데이터만 저장" : "Binary — metadata only"}
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
                    : "Leave empty and we'll tag it on toss — or add your own with +.")
                : (locale === "ko" ? "태그를 누르면 삭제됩니다." : "Tap a tag to remove.")}
            </Text>
          </View>

          <View style={styles.submitRow}>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.tossBtn,
                !canSubmit && styles.tossBtnDisabled,
                pressed && canSubmit && styles.tossBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            >
              <Text style={styles.tossBtnText}>
                {submitting
                  ? (locale === "ko" ? "던지는 중…" : "Tossing…")
                  : (locale === "ko" ? "영차영차 던지기" : "Send to the cells")}
              </Text>
            </Pressable>
          </View>
          <AppNav locale={locale} />
        </ScrollView>
      </KeyboardAvoidingView>
      {/* 루루 appears briefly to carry the new shard (companion pack §3) */}
      {companion.moment ? (
        <CompanionMoment moment={companion.moment} style={styles.captureFlash} />
      ) : null}
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
  savedPanel: {
    backgroundColor: "rgba(114,242,199,0.06)",
    borderColor: "rgba(114,242,199,0.22)",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  scroll: { paddingBottom: spacing.xl, gap: spacing.md },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  trackCard: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  eyebrow: { letterSpacing: 1, fontWeight: "700" },
  trackRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  trackChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: "transparent",
    alignItems: "center",
  },
  trackChipActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  trackChipText: { color: semantic.textMuted, fontSize: typography.sizes.sm, fontWeight: "600" },
  trackChipTextActive: { color: semantic.background, fontWeight: "700" },
  modeRow: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: semantic.surfaceAlt,
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
  modeIcon: { fontSize: 22 },
  modeLabel: { color: semantic.textMuted, fontSize: typography.sizes.xs, fontWeight: "600" },
  modeLabelActive: { color: semantic.background, fontWeight: "700" },
  modeHelp: { lineHeight: 18, marginTop: -spacing.xs },
  fieldGroup: { gap: spacing.xs },
  textarea: {
    minHeight: 160,
    paddingTop: spacing.md,
    fontFamily: fontFamilies.mono,
    fontSize: typography.sizes.sm,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  previewCard: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 4,
  },
  imagePreview: { width: "100%", height: 200, borderRadius: radii.sm, marginTop: spacing.xs },
  classifiedCard: {
    backgroundColor: semantic.surfaceAlt,
    borderLeftColor: semantic.brand,
    borderLeftWidth: 3,
    borderRadius: radii.sm,
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
    backgroundColor: semantic.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  tossBtnPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  tossBtnDisabled: { opacity: 0.4 },
  tossBtnText: { color: semantic.background, fontSize: typography.sizes.md, fontWeight: "700" },
});
