import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text as RNText, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";

import { colors } from "@/theme/tokens";
import { ddsStyles as styles } from "./dds-styles";
import { Text } from "@/components/ui/Text";
import { DeepSpaceLoader, SecondbStatusHeader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAuth } from "@/lib/auth/AuthContext";
import { fetchPrivacyPrefs, savePrivacyPrefs } from "@/lib/supabase/privacy";
import { recordHealthImportConsent } from "@/lib/supabase/consent";
import { healthImportAllowed, ingestHealthSamples } from "@/lib/health/ingest";
import { mockSamplesForRange } from "@/lib/health/sources/mock";
import { availableHealthSources } from "@/lib/health/registry";
import { deleteSource, listSources, updateSourceTags } from "@/lib/wiki/queries";
import { generateSourcePage } from "@/lib/wiki/phase2";
import { runPhase1 } from "@/lib/wiki/phase1";
import { suggestedTags } from "@/lib/wiki/suggest-tags";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { pickImportFiles } from "@/lib/wiki/capture-file";
import { splitImportNotes, previewTitle } from "@/lib/wiki/import-notes";
import type { SourceRow } from "@/lib/wiki/types";
import { FilterChip } from "./dds-wiki-records-screens";

function GraphLoading() {
  return (
    <View style={styles.center}>
      <DeepSpaceLoader variant="dots" />
    </View>
  );
}

function DockShell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title ?? ""} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {subtitle ? <Text variant="subtle" style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

function Shell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <DeepSpaceScreen active="lens" title={title ?? ""} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {subtitle ? <Text variant="subtle" style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

function Card({ children, style }: { children: ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }

// Anti-slop: source kinds are marked by a tinted dot (shared tlDot), not emoji.
const SOURCE_KIND_TINT: Record<string, string> = {
  inbox: colors.cyanSoft,
  article: colors.cyan,
  video: colors.soul,
  paper: colors.mint,
  reddit: colors.amber,
  code: colors.cyanBright,
  ai_tool: colors.soul,
  self_knowledge: colors.mint,
};

function TrashGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M4 7h16M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6" stroke={colors.clay} strokeWidth={1.7} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function sourceTitle(s: SourceRow, fallback: string): string {
  const title = s.title?.trim();
  return title && title.length > 0 ? title : fallback;
}

export function DeepSpaceInboxScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggestBusyId, setSuggestBusyId] = useState<string | null>(null);

  const load = useMemo(
    () => async (uid: string) => {
      const rows = await listSources(uid, { ingested: false, limit: 50 });
      setSources(rows);
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    load(userId)
      .catch(() => {
        if (alive) setSources([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, load]);

  async function promote(s: SourceRow) {
    if (!userId) return;
    setBusyId(s.id);
    try {
      await generateSourcePage(userId, s.id);
      await load(userId);
    } catch {
      // best-effort; the row stays in the queue to retry
    } finally {
      setBusyId(null);
    }
  }

  async function discard(s: SourceRow) {
    if (!userId) return;
    setBusyId(s.id);
    try {
      await deleteSource(userId, s.id);
      await load(userId);
    } catch {
      // best-effort
    } finally {
      setBusyId(null);
    }
  }

  // Accept one AI-suggested tag onto the source before promotion.
  async function acceptTag(s: SourceRow, tag: string) {
    if (!userId || s.tags.includes(tag)) return;
    setBusyId(s.id);
    try {
      await updateSourceTags(userId, s.id, [...s.tags, tag]);
      await load(userId);
    } catch {
      // best-effort; the tag just doesn't stick
    } finally {
      setBusyId(null);
    }
  }

  // On-demand Phase 1 (C1/C3/C9 inside) so the suggestion chips have something
  // to show when nothing was extracted at capture time.
  async function getSuggestions(s: SourceRow) {
    if (!userId) return;
    setSuggestBusyId(s.id);
    try {
      await runPhase1({ userId, sourceId: s.id, locale, minor: isMinor === true });
      await load(userId);
    } catch {
      // best-effort; the button can be tapped again
    } finally {
      setSuggestBusyId(null);
    }
  }

  if (authLoading) {
    return <DockShell title={t("inbox.title")}><GraphLoading /></DockShell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const pending = sources.length;
  const [current, ...queue] = sources;
  const suggestions = current ? suggestedTags(current) : [];

  return (
    <DockShell title={t("inbox.title")}>
      <SecondbStatusHeader
        text={pending > 0 ? t("inbox.headerPending", { count: pending }) : t("inbox.headerEmpty")}
        tip={t("inbox.tip")}
      />
      {loading ? (
        <GraphLoading />
      ) : pending === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text variant="body" style={styles.wikiBody}>{t("inbox.emptyDone")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text variant="caption" style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text variant="body" style={styles.lead}>{t("inbox.remaining", { count: pending })}</Text>
          <Card style={styles.triageCard}>
            <View style={styles.triageMeta}>
              <View style={[styles.tlDot, { backgroundColor: SOURCE_KIND_TINT[current.kind] ?? colors.cyanDim }]} />
              <Text variant="caption" pixelEn style={styles.metaLabel}>{current.kind}</Text>
            </View>
            <Text variant="body" style={styles.triageBody} numberOfLines={3}>{sourceTitle(current, t("inbox.untitled"))}</Text>
            {current.tags.length > 0 ? (
              <View style={styles.filterRow}>
                {current.tags.slice(0, 6).map((tag) => (
                  <FilterChip key={tag} label={`#${tag}`} active />
                ))}
              </View>
            ) : null}
            {suggestions.length > 0 ? (
              <>
                <Text variant="subtle" style={styles.footerLeft}>{t("inbox.suggestedLabel")}</Text>
                <View style={styles.filterRow}>
                  {suggestions.map((tag) => (
                    <FilterChip
                      key={tag}
                      label={`+ ${tag}`}
                      onPress={() => void acceptTag(current, tag)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => void getSuggestions(current)}
                disabled={busyId !== null || suggestBusyId !== null}
                style={styles.smallBtnGhost}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.getSuggestions")}
              >
                <Text variant="caption" style={styles.smallBtnGhostText}>
                  {suggestBusyId === current.id ? t("inbox.gettingSuggestions") : t("inbox.getSuggestions")}
                </Text>
              </Pressable>
            )}
            <View style={styles.ctaRow}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => void discard(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.a11yDiscard")}
              >
                <TrashGlyph />
              </Pressable>
              <Pressable
                style={styles.primary}
                onPress={() => void promote(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.a11yArchive")}
              >
                <Text variant="caption" style={styles.primaryText}>{busyId === current.id ? t("inbox.archiving") : t("inbox.archive")}</Text>
              </Pressable>
            </View>
          </Card>
          {queue.length > 0 ? (
            <>
              <Text variant="caption" pixelEn style={styles.tlLabel}>{t("inbox.nextUp")}</Text>
              <View style={{ gap: 7 }}>
                {queue.slice(0, 8).map((s, i) => (
                  <View key={s.id} style={[styles.queueItem, i > 0 && styles.queueItemDim]}>
                    <View style={[styles.tlDot, { backgroundColor: SOURCE_KIND_TINT[s.kind] ?? colors.cyanDim }]} />
                    <Text variant="body" style={styles.queueText} numberOfLines={1}>{sourceTitle(s, t("inbox.untitled"))}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </DockShell>
  );
}

interface ImportResult {
  imported: number;
  deduped: number;
  failed: number;
}

export function DeepSpaceImportScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading, isMinor } = useAuth();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Phase B Slice 1: app-level health_import opt-in state. Off for everyone by
  // default; minors are hard-locked off (healthImportAllowed never passes).
  const [healthPref, setHealthPref] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthDone, setHealthDone] = useState(false);

  const notes = useMemo(() => splitImportNotes(text), [text]);

  useEffect(() => {
    if (!userId) return;
    void fetchPrivacyPrefs(userId).then((p) => setHealthPref(p.health_import === true));
  }, [userId]);

  const canHealth = healthImportAllowed(isMinor, healthPref);

  // Opt in: persist the pref AND write an explicit sensitive-data consent record
  // (consent_records, the existing ledger) before any ingest can run. Minors
  // can never reach this - the row shows healthMinorLocked instead.
  async function handleHealthConsent() {
    if (!userId || healthBusy || isMinor === true) return;
    setHealthBusy(true);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(userId)), health_import: true };
      await savePrivacyPrefs(userId, prefs);
      // The guard above already excludes minors, so opt-in here is always adult.
      await recordHealthImportConsent({
        userId,
        ageBand: "adult",
        minorTier: "adult",
        locale: i18n.language?.startsWith("ko") ? "ko" : "en",
      });
      setHealthPref(true);
    } catch {
      // Best-effort; the row stays in the opt-in state so the user can retry.
    } finally {
      setHealthBusy(false);
    }
  }

  // Ingest today's activity through the single choke point (gate enforced inside
  // ingestHealthSamples). Slice 1 uses the deterministic mock as the data; the
  // manual/native sources land later behind the same call.
  async function handleHealthIngest() {
    if (!userId || healthBusy || !canHealth) return;
    setHealthBusy(true);
    setHealthDone(false);
    try {
      const now = new Date().toISOString();
      const range = { startIso: now, endIso: now };
      // Slice 2: prefer a real OS source (Health Connect / HealthKit) when it can
      // run on this device; fall back to the deterministic mock on web / Expo Go /
      // jest. Both funnel through the same ingestHealthSamples choke point, so the
      // consent gate + minor hard-lock stay identical.
      const native = availableHealthSources().find(
        (s) => s.id === "health_connect" || s.id === "healthkit",
      );
      const samples =
        native && (await native.requestPermission()) === "granted"
          ? await native.read(range)
          : mockSamplesForRange(range);
      await ingestHealthSamples(userId, samples, { isMinor, pref: healthPref });
      setHealthDone(true);
    } catch {
      // Gate rejection or write error: leave the affordance for retry.
    } finally {
      setHealthBusy(false);
    }
  }

  async function handlePickFiles() {
    if (importing || picking) return;
    setPicking(true);
    try {
      // Obsidian has no API - "connecting" it means importing its .md files.
      // Picked file text drops into the same paste box so the review/import
      // flow below handles it. Multiple files join with a --- separator so
      // splitImportNotes keeps them as distinct notes.
      const files = await pickImportFiles();
      if (files.length > 0) {
        const joined = files.map((f) => f.text).join("\n\n---\n\n");
        setText((prev) => (prev.trim() ? `${prev.trim()}\n\n---\n\n${joined}` : joined));
        setResult(null);
      }
    } catch {
      // Picker cancel/permission errors are non-fatal; the box is unchanged.
    } finally {
      setPicking(false);
    }
  }

  async function handleImport() {
    if (!userId || notes.length === 0 || importing) return;
    setImporting(true);
    setResult(null);
    const tally: ImportResult = { imported: 0, deduped: 0, failed: 0 };
    for (const note of notes) {
      try {
        // Same pipeline the clipper uses; user-authored notes are self_knowledge.
        // No LLM here - imported sources land in the inbox for Phase 1/2 later ($0).
        const r = await captureFromMarkdown({ userId, rawMd: note, kindOverride: "self_knowledge" });
        if (r.deduped === "exact_duplicate") tally.deduped += 1;
        else tally.imported += 1;
      } catch {
        tally.failed += 1;
      }
    }
    setResult(tally);
    if (tally.imported > 0 || tally.deduped > 0) setText("");
    setImporting(false);
  }

  if (authLoading) {
    return <Shell title={t("import.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <Shell title={t("import.title")}>
      <SecondbStatusHeader text={t("import.status")} tip={t("import.tip")} />
      <Text variant="body" style={styles.lead}>{t("import.lead")}</Text>

      <Card>
        <Text variant="caption" pixelEn style={styles.reviewLabel}>{t("import.pasteLabel")}</Text>
        <TextInput
          style={[styles.input, { minHeight: 132, textAlignVertical: "top" }]}
          value={text}
          onChangeText={setText}
          placeholder={t("import.placeholder")}
          placeholderTextColor={colors.textLo}
          multiline
          editable={!importing}
          accessibilityLabel={t("import.pasteLabel")}
        />
        {notes.length > 0 ? (
          <>
            <Text variant="caption" pixelEn style={styles.tlLabel}>{t("import.detected", { count: notes.length })}</Text>
            {notes.slice(0, 8).map((note, i) => (
              <View key={i} style={styles.mapRow}>
                <RNText style={styles.mapArrow}>•</RNText>
                <Text variant="body" style={styles.mapTo} numberOfLines={1}>{previewTitle(note, t("import.untitled"))}</Text>
              </View>
            ))}
            {notes.length > 8 ? <Text variant="subtle" style={styles.footerLeft}>{t("import.andMore", { count: notes.length - 8 })}</Text> : null}
          </>
        ) : (
          <Text variant="subtle" style={styles.footerLeft}>{t("import.empty")}</Text>
        )}
      </Card>

      {result !== null ? (
        <View style={styles.insightViolet}>
          <Text variant="body" style={styles.insightVioletText}>{t("import.resultDone", { count: result.imported })}</Text>
          {result.deduped > 0 || result.failed > 0 ? (
            <View style={styles.evRow}>
              {result.deduped > 0 ? <Text variant="subtle" style={styles.evChip}>{t("import.resultDuplicate", { count: result.deduped })}</Text> : null}
              {result.failed > 0 ? <Text variant="subtle" style={styles.evChip}>{t("import.resultFailed", { count: result.failed })}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.ctaRow}>
        <Pressable
          style={styles.secondary}
          onPress={() => { setText(""); setResult(null); }}
          disabled={importing || text.length === 0}
          accessibilityRole="button"
          accessibilityLabel={t("import.clear")}
        >
          <Text variant="caption" style={styles.secondaryText}>{t("import.clear")}</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, styles.primaryWide, (notes.length === 0 || importing) && { opacity: 0.6 }]}
          onPress={() => void handleImport()}
          disabled={notes.length === 0 || importing}
          accessibilityRole="button"
          accessibilityLabel={t("import.importCount", { count: notes.length })}
        >
          <Text variant="caption" style={styles.primaryText}>{importing ? t("import.importing") : t("import.importCount", { count: notes.length })}</Text>
        </Pressable>
      </View>

      <Text variant="caption" pixelEn style={styles.tlLabel}>{t("import.connectorsLabel")}</Text>
      <View style={{ gap: 8 }}>
        <View style={[styles.sourceRow, styles.sourceRowDim]}><View style={[styles.tlDot, { backgroundColor: colors.cyanDim }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceNameDim}>Notion</Text><Text variant="subtle" style={styles.sourceDesc}>{t("import.notionDesc")}</Text></View><Text variant="subtle" style={styles.sourceSoon}>{t("import.soon")}</Text></View>
        <Pressable
          style={styles.sourceRow}
          onPress={() => void handlePickFiles()}
          disabled={picking || importing}
          accessibilityRole="button"
          accessibilityLabel={t("import.pickFiles")}
        ><View style={[styles.tlDot, { backgroundColor: colors.soul }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceName}>Obsidian</Text><Text variant="subtle" style={styles.sourceDesc}>{t("import.obsidianDesc")}</Text></View><Text variant="caption" style={styles.sourceCta}>{picking ? t("import.picking") : t("import.pickFiles")}</Text></Pressable>
        {isMinor === true ? (
          <View style={[styles.sourceRow, styles.sourceRowDim]}><View style={[styles.tlDot, { backgroundColor: colors.mint }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceNameDim}>{t("import.healthName")}</Text><Text variant="subtle" style={styles.sourceDesc}>{t("import.healthDesc")}</Text></View><Text variant="subtle" style={styles.sourceSoon}>{t("import.healthMinorLocked")}</Text></View>
        ) : !canHealth ? (
          <Pressable
            style={styles.sourceRow}
            onPress={() => void handleHealthConsent()}
            disabled={healthBusy}
            accessibilityRole="button"
            accessibilityLabel={t("import.healthConsentNeeded")}
            accessibilityHint={t("import.healthConnectHint")}
          ><View style={[styles.tlDot, { backgroundColor: colors.mint }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceName}>{t("import.healthName")}</Text><Text variant="subtle" style={styles.sourceDesc}>{t("import.healthDesc")}</Text></View><Text variant="caption" style={styles.sourceCta}>{healthBusy ? t("import.importing") : t("import.healthConsentNeeded")}</Text></Pressable>
        ) : (
          <Pressable
            style={styles.sourceRow}
            onPress={() => void handleHealthIngest()}
            disabled={healthBusy}
            accessibilityRole="button"
            accessibilityLabel={t("import.healthIngest")}
            accessibilityHint={t("import.healthIngestHint")}
          ><View style={[styles.tlDot, { backgroundColor: colors.mint }]} /><View style={{ flex: 1 }}><Text variant="caption" style={styles.sourceName}>{t("import.healthName")}</Text><Text variant="subtle" style={styles.sourceDesc}>{healthDone ? t("import.healthIngested") : t("import.healthDesc")}</Text></View><Text variant="caption" style={styles.sourceCta}>{healthBusy ? t("import.importing") : t("import.healthIngest")}</Text></Pressable>
        )}
      </View>
    </Shell>
  );
}

