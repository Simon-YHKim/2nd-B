// rev2 M3 clones of 27-inbox (알림) + 29-import (외부 가져오기). Both render as
// windowed sub-screens (radius-24 card over the shared sky) with an MdTopAppBar,
// transcribed 1:1 from the reference-app screens (sb-flows.jsx InboxScreen /
// sb-more.jsx ImportScreen). Inbox KO copy is sourced from the canon flows pack
// (canonFlows.inboxItems) with app-side EN mirrors; import copy stays inline
// ko/en ternary — either way no new i18n keys are added (C7 parity stays
// safe). All colors route through m3.* tokens (no hex literals). The real
// file-import pipeline (pickImportFiles → captureFromMarkdown) and the health
// opt-in/ingest wiring are preserved behind the reference layout.

import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SvgXml } from "react-native-svg";

import { m3 } from "@/lib/theme/m3";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { DeepSpaceLoader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAuth } from "@/lib/auth/AuthContext";
import { fetchPrivacyPrefs, savePrivacyPrefs } from "@/lib/supabase/privacy";
import { listInferredLinkDetails } from "@/lib/wiki/queries";
import { listPeerInvites } from "@/lib/peer/invite";
import { recordHealthImportConsent } from "@/lib/supabase/consent";
import { healthImportAllowed, ingestHealthSamples } from "@/lib/health/ingest";
import { availableHealthSources } from "@/lib/health/registry";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { pickImportFiles } from "@/lib/wiki/capture-file";
import { splitImportNotes } from "@/lib/wiki/import-notes";
import {
  addImportHistory,
  getImportHistory,
  removeImportHistory,
  type ImportHistoryEntry,
} from "@/lib/import/history";
import { deleteSourcesByIds } from "@/lib/records/delete-bulk";

// Material-symbol stroke glyphs, transcribed to match the reference icons. Same
// SvgXml approach as the connect/datareview CloneIcon kit.
const GLYPH: Record<string, string> = {
  sparkle: '<path d="M12 3l1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3L12 3Z"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9.5h16M8 3v4M16 3v4"/>',
  forum: '<path d="M3 5.5h11v7H8l-3.5 3z"/><path d="M8.5 13v1.4a2 2 0 0 0 2 2h5.7l3.3 2.6v-7.6a2 2 0 0 0-2-2H16"/>',
  box: '<path d="M4 8.5 12 5l8 3.5V17l-8 3.5L4 17z"/><path d="M4 8.5 12 12l8-3.5M12 12v8.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
  arrow_forward: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 12.5 5a3.5 3.5 0 0 1 5 5L16 11.5"/><path d="M13 17.5 11.5 19a3.5 3.5 0 0 1-5-5L8 12.5"/>',
  cloud_upload: '<path d="M7 18a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.2A3.4 3.4 0 0 1 17 18H7Z"/><path d="M12 20v-7M9.5 15 12 12.5 14.5 15"/>',
  attach_file: '<path d="M16 7 8.5 14.5a2.5 2.5 0 0 0 3.5 3.5L19 11a4.5 4.5 0 0 0-6.4-6.4L5.5 11.6a6.5 6.5 0 0 0 9.2 9.2L20 15.5"/>',
  memory: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="4" height="4"/><path d="M9.5 4v3M14.5 4v3M9.5 17v3M14.5 17v3M4 9.5h3M4 14.5h3M17 9.5h3M17 14.5h3"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  bubble: '<circle cx="9" cy="10" r="4"/><circle cx="16.5" cy="8" r="2.4"/><circle cx="15.5" cy="15.5" r="3"/>',
  description: '<path d="M14 3v5h5"/><path d="M14 3H6v18h12V8z"/><path d="M9 12h6M9 15.5h6"/>',
  event: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9.5h16M8 3v4M16 3v4"/><rect x="7" y="12.5" width="4" height="3.5" rx="0.8"/>',
  favorite: '<path d="M12 20s-7-4.5-9-9a4.5 4.5 0 0 1 9-2 4.5 4.5 0 0 1 9 2c-2 4.5-9 9-9 9Z"/>',
  trash: '<path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12"/>',
};

function Glyph({ name, color, size = 20 }: { name: keyof typeof GLYPH; color: string; size?: number }) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

function Loading() {
  return (
    <View style={s.loading}>
      <DeepSpaceLoader variant="dots" />
    </View>
  );
}

// ── 27-inbox / reference InboxScreen (sb-flows.jsx) ─────────────────────────
// A windowed 알림 list: filled cards with a tinted icon box, title + timestamp,
// body, and a text CTA. Each card routes to the real surface behind it.
// The inbox shows real notifications once a signal source is wired. Until then it
// renders an honest empty state instead of the reference's 5 canned pixel-contract
// cards (those were placeholders presented as real state to zero-data users).

export function DeepSpaceInboxScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();

  const title = t("ds.inbox.title");
  if (authLoading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title} onBack={() => router.back()}>
        <Loading />
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return <DeepSpaceInboxBody userId={userId} title={title} />;
}

type InboxItem = {
  icon: keyof typeof GLYPH;
  accent: string;
  title: string;
  body: string;
  time: string;
  route: string;
  cta: string;
};

// The notification list is REAL now: it aggregates the two in-app event
// sources that already exist — pending link proposals (propose→ratify, the
// /digest queue) and responded peer invites. Before this, `items` was a
// hardcoded empty array: honest-looking, but the pipeline behind the bell was
// simply not wired (audit: /inbox stub).
function DeepSpaceInboxBody({ userId, title }: { userId: string; title: string }) {
  const { t } = useTranslation("deepspace");
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      listInferredLinkDetails(userId).catch(() => []),
      listPeerInvites(userId).catch(() => []),
    ]).then(([links, invites]) => {
      if (!alive) return;
      const next: InboxItem[] = [];
      if (links.length > 0) {
        next.push({
          icon: "link",
          accent: m3.color.primary,
          title: t("ds.inbox.proposalsTitle"),
          body: t("ds.inbox.proposalsBody", { n: links.length }),
          time: "",
          route: "/digest",
          cta: t("ds.inbox.proposalsCta"),
        });
      }
      const responded = invites.filter(
        (i) => i.responded_at != null && (i.status === "accepted" || i.status === "declined"),
      );
      if (responded.length > 0) {
        next.push({
          icon: "forum",
          accent: m3.color.tertiary,
          title: t("ds.inbox.peerTitle"),
          body: t("ds.inbox.peerBody", { n: responded.length }),
          time: "",
          route: "/peer-invites",
          cta: t("ds.inbox.peerCta"),
        });
      }
      setItems(next);
    });
    return () => {
      alive = false;
    };
  }, [userId, t]);

  if (items === null) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title} onBack={() => router.back()}>
        <Loading />
      </DeepSpaceScreen>
    );
  }

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <RNText style={[m3TextStyle("headlineSmall"), s.pageTitle]}>{title}</RNText>
        <View style={s.stack10}>
          {items.map((it, i) => (
            <MdCard
              key={i}
              variant="filled"
              onPress={() => router.push(it.route as never)}
              accessibilityLabel={it.title}
              style={s.notifCard}
            >
              <View style={s.notifRow}>
                <View style={s.notifIcon}>
                  <Glyph name={it.icon} color={it.accent} size={22} />
                </View>
                <View style={s.flex1}>
                  <View style={s.notifHead}>
                    <RNText style={[m3TextStyle("titleSmall"), s.notifTitle]}>{it.title}</RNText>
                    <RNText style={[m3TextStyle("labelSmall"), s.notifTime]}>{it.time}</RNText>
                  </View>
                  <RNText style={[m3TextStyle("bodySmall"), s.notifBody]}>{it.body}</RNText>
                  <MdButton
                    label={it.cta}
                    variant="text"
                    icon={<Glyph name="arrow_forward" color={m3.color.primary} size={16} />}
                    onPress={() => router.push(it.route as never)}
                    style={s.notifCta}
                    accessibilityLabel={it.cta}
                  />
                </View>
              </View>
            </MdCard>
          ))}
          {items.length === 0 ? (
            <RNText style={[m3TextStyle("bodyMedium"), s.notifBody]}>
              {t("ds.inbox.empty")}
            </RNText>
          ) : null}
        </View>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

interface ImportResult {
  imported: number;
  deduped: number;
  failed: number;
}

type ImportMode = "file" | "account";

// ── 29-import / reference ImportScreen (sb-more.jsx) ─────────────────────────
// A windowed 외부 가져오기 hub: file/account mode toggle, a file drop zone, the
// 3-block 가져오기 전 약속 consent, and the 가져오기 이력 list. The 파일 선택
// button runs the real pick → captureFromMarkdown import; the Apple 건강 account
// row runs the real health opt-in/ingest (minors stay hard-locked).
export function DeepSpaceImportScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading, isMinor } = useAuth();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;

  const [mode, setMode] = useState<ImportMode>("file");
  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Health opt-in state. Off for everyone by default; minors are hard-locked off
  // (healthImportAllowed never passes).
  const [healthPref, setHealthPref] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthDone, setHealthDone] = useState(false);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  // Import history = the persistent device-local log (import-hub 철회 store), so
  // file imports here show up in the same withdrawal list. No seeded fake rows.
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [revokeErr, setRevokeErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void fetchPrivacyPrefs(userId).then((p) => setHealthPref(p.health_import === true));
  }, [userId]);

  useEffect(() => {
    void getImportHistory().then(setHistory);
  }, [userId]);

  const canHealth = healthImportAllowed(isMinor, healthPref);

  // Pick files then run the same import pipeline the clipper uses. No LLM here —
  // imported notes land in the inbox for Phase 1/2 later ($0).
  async function handlePickFiles() {
    if (!userId || picking || importing) return;
    setPicking(true);
    setResult(null);
    try {
      const files = await pickImportFiles();
      if (files.length === 0) return;
      const joined = files.map((f) => f.text).join("\n\n---\n\n");
      const notes = splitImportNotes(joined);
      if (notes.length === 0) return;
      setImporting(true);
      const tally: ImportResult = { imported: 0, deduped: 0, failed: 0 };
      // Ids of the source rows this import newly created — logged below so the
      // rows are revocable. Deduped notes reuse an existing (already-logged) row,
      // so they are not collected here.
      const createdIds: string[] = [];
      for (const note of notes) {
        try {
          const r = await captureFromMarkdown({ userId, rawMd: note, kindOverride: "self_knowledge" });
          if (r.deduped === "exact_duplicate") tally.deduped += 1;
          else {
            tally.imported += 1;
            createdIds.push(r.source.id);
          }
        } catch {
          tally.failed += 1;
        }
      }
      setResult(tally);
      // Record the import in the withdrawal log. Without this the file import
      // created source rows that the "철회 가능" consent card promised were
      // revocable, but nothing pointed at them — leaving them unrevokable.
      if (createdIds.length > 0) {
        await addImportHistory({
          id: `${Date.now()}`,
          sourceKey: "file",
          name: t("ds.import.fileSource"),
          atIso: new Date().toISOString(),
          summary: ko ? `별가루 ${tally.imported}개` : `${tally.imported} pieces`,
          sourceIds: createdIds,
        });
        setHistory(await getImportHistory());
      }
    } catch {
      // Picker cancel / permission errors are non-fatal.
    } finally {
      setImporting(false);
      setPicking(false);
    }
  }

  // 철회 = full removal: delete the imported source rows, THEN the log entry.
  // On delete failure keep the entry and surface an error so the withdrawal can
  // be retried — never drop the only pointer to rows that still exist.
  async function revokeImport(entry: ImportHistoryEntry) {
    if (!userId) return;
    setRevokeErr(null);
    if (entry.sourceIds.length > 0) {
      try {
        await deleteSourcesByIds(userId, entry.sourceIds);
      } catch {
        setRevokeErr(t("ds.import.revokeFailed"));
        return;
      }
    }
    await removeImportHistory(entry.id);
    setHistory(await getImportHistory());
  }

  // Opt in: persist the pref AND write an explicit sensitive-data consent record
  // before any ingest can run. Minors can never reach this.
  async function handleHealthConsent() {
    if (!userId || healthBusy || isMinor === true) return;
    setHealthBusy(true);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(userId)), health_import: true };
      await savePrivacyPrefs(userId, prefs);
      await recordHealthImportConsent({
        userId,
        ageBand: "adult",
        minorTier: "adult",
        locale: ko ? "ko" : "en",
      });
      setHealthPref(true);
    } catch {
      // Best-effort; the row stays in the opt-in state so the user can retry.
    } finally {
      setHealthBusy(false);
    }
  }

  // Ingest today's activity through the single choke point (gate enforced inside
  // ingestHealthSamples).
  //
  // HONESTY INVARIANT: if the real health source is missing or the user denies the OS
  // permission, we write NOTHING and say so. This used to silently fall back to
  // mockSamplesForRange() -- fabricated 9,000 steps / 7h sleep / 30min workout -- and
  // then report success. Those rows fed the health domain star's brightness
  // (lib/persona/load-domain-levels.ts) and auto-completed routines
  // (lib/health/ingest.ts -> applyHealthAutoComplete), with no `source === "mock"`
  // filter anywhere downstream. A user who denied permission got a brighter 건강 star
  // built from data they never produced. That is the exact opposite of 정직한 밝기, the
  // invariant this whole product rests on.
  async function handleHealthIngest() {
    if (!userId || healthBusy || !canHealth) return;
    setHealthBusy(true);
    setHealthDone(false);
    setHealthErr(null);
    try {
      const now = new Date().toISOString();
      const range = { startIso: now, endIso: now };
      const native = availableHealthSources().find((src) => src.id === "health_connect" || src.id === "healthkit");
      if (!native) {
        // Web, Expo Go, or a device without Health Connect / HealthKit.
        setHealthErr(t("ds.import.healthErrUnavailable"));
        return;
      }
      if ((await native.requestPermission()) !== "granted") {
        setHealthErr(t("ds.import.healthErrDenied"));
        return;
      }
      const samples = await native.read(range);
      if (samples.length === 0) {
        // Nothing to reflect is not a failure, but it is not "reflected" either.
        setHealthErr(t("ds.import.healthErrEmpty"));
        return;
      }
      await ingestHealthSamples(userId, samples, { isMinor, pref: healthPref });
      setHealthDone(true);
    } catch {
      // Gate rejection or write error: leave the affordance for retry.
      setHealthErr(t("ds.import.healthErrFailed"));
    } finally {
      setHealthBusy(false);
    }
  }

  const consents: { icon: keyof typeof GLYPH; label: string; note: string }[] = [
    { icon: "cloud_upload", label: t("ds.import.consentSourceLabel"), note: t("ds.import.consentSourceNote") },
    { icon: "memory", label: t("ds.import.consentDeviceLabel"), note: t("ds.import.consentDeviceNote") },
    { icon: "lock", label: t("ds.import.consentRevocableLabel"), note: t("ds.import.consentRevocableNote") },
  ];

  const accounts: { k: string; icon: keyof typeof GLYPH; health?: boolean }[] = [
    { k: "ChatGPT", icon: "bubble" },
    { k: "Notion", icon: "description" },
    { k: t("ds.import.providerGoogleCalendar"), icon: "event" },
    { k: t("ds.import.providerAppleHealth"), icon: "favorite", health: true },
  ];

  const healthCta = isMinor === true
    ? t("ds.import.healthCtaMinorLocked")
    : healthBusy
      ? t("ds.import.healthCtaSyncing")
      : healthDone
        ? t("ds.import.healthCtaReflected")
        : canHealth
          ? t("ds.import.healthCtaReflectToday")
          : t("ds.import.healthCtaConnect");

  const title = t("ds.import.title");
  if (authLoading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title} onBack={() => router.back()}>
        <Loading />
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <RNText style={[m3TextStyle("bodyMedium"), s.lead]}>
            {t("ds.import.leadStart")}
            <RNText style={s.leadStrong}>{t("ds.import.leadStrong")}</RNText>
            {t("ds.import.leadEnd")}
          </RNText>

          {/* mode toggle */}
          <View style={s.toggleRow}>
            {([["file", "cloud_upload", t("ds.import.toggleFile")], ["account", "link", t("ds.import.toggleAccount")]] as const).map(([id, icon, label]) => {
              const on = mode === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setMode(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                  style={[s.toggleBtn, on ? s.toggleBtnOn : s.toggleBtnOff]}
                >
                  <Glyph name={icon} color={on ? m3.color.onSecondaryContainer : m3.color.onSurfaceVariant} size={22} />
                  <RNText style={[m3TextStyle("titleSmall"), { color: on ? m3.color.onSecondaryContainer : m3.color.onSurface }]}>{label}</RNText>
                </Pressable>
              );
            })}
          </View>

          {/* source */}
          <RNText style={[m3TextStyle("titleSmall"), s.sectionLabel]}>{mode === "file" ? t("ds.import.sectionChooseFile") : t("ds.import.sectionAccounts")}</RNText>
          {mode === "file" ? (
            <View style={s.dropZone}>
              <Glyph name="cloud_upload" color={m3.color.onSurfaceVariant} size={40} />
              <RNText style={[m3TextStyle("bodyLarge"), s.dropTitle]}>{t("ds.import.dropTitle")}</RNText>
              <RNText style={[m3TextStyle("bodySmall"), s.dropExt]}>.json · .zip · .txt · .md · .csv</RNText>
              <MdButton
                label={picking ? t("ds.import.btnOpening") : importing ? t("ds.import.btnImporting") : t("ds.import.btnChooseFile")}
                variant="tonal"
                icon={<Glyph name="attach_file" color={m3.color.onSecondaryContainer} size={18} />}
                loading={picking || importing}
                onPress={() => void handlePickFiles()}
                style={s.dropBtn}
                accessibilityLabel={t("ds.import.btnChooseFile")}
              />
            </View>
          ) : (
            <View style={s.stack8}>
              {accounts.map((a) =>
                a.health ? (
                  <MdCard
                    key={a.k}
                    variant="outlined"
                    onPress={isMinor === true ? undefined : () => void (canHealth ? handleHealthIngest() : handleHealthConsent())}
                    accessibilityLabel={`${a.k} ${healthCta}`}
                    style={s.accountCard}
                  >
                    <View style={s.accountRow}>
                      <Glyph name={a.icon} color={m3.color.onSurfaceVariant} size={20} />
                      <RNText style={[m3TextStyle("bodyLarge"), s.accountName]}>{a.k}</RNText>
                      <RNText style={[m3TextStyle("labelMedium"), { color: isMinor === true ? m3.color.onSurfaceVariant : m3.color.primary }]}>{healthCta}</RNText>
                    </View>
                    {healthErr !== null ? (
                      <RNText
                        style={[m3TextStyle("bodySmall"), s.healthErr]}
                        accessibilityRole="alert"
                        accessibilityLiveRegion="polite"
                      >
                        {healthErr}
                      </RNText>
                    ) : null}
                  </MdCard>
                ) : (
                  <MdCard
                    key={a.k}
                    variant="outlined"
                    onPress={() => void handlePickFiles()}
                    accessibilityLabel={ko ? `${a.k} 내보내기 파일 가져오기` : `Import ${a.k} export file`}
                    style={s.accountCard}
                  >
                    <View style={s.accountRow}>
                      <Glyph name={a.icon} color={m3.color.onSurfaceVariant} size={20} />
                      <RNText style={[m3TextStyle("bodyLarge"), s.accountName]}>{a.k}</RNText>
                      <RNText style={[m3TextStyle("labelMedium"), { color: m3.color.primary }]}>{t("ds.import.accountImportFile")}</RNText>
                    </View>
                  </MdCard>
                ),
              )}
            </View>
          )}

          {result !== null ? (
            <MdCard variant="filled" style={s.resultCard}>
              <RNText style={[m3TextStyle("bodyMedium"), s.resultText]}>
                {ko ? `${result.imported}개를 정리함에 담았어요` : `Added ${result.imported} to your inbox`}
                {result.deduped > 0 ? (ko ? ` · 중복 ${result.deduped}개` : ` · ${result.deduped} duplicate`) : ""}
                {result.failed > 0 ? (ko ? ` · 실패 ${result.failed}개` : ` · ${result.failed} failed`) : ""}
              </RNText>
            </MdCard>
          ) : null}

          {/* 3-block consent */}
          <RNText style={[m3TextStyle("titleSmall"), s.sectionLabel]}>{t("ds.import.consentTitle")}</RNText>
          <MdCard variant="filled" style={s.consentCard}>
            {consents.map((c, i) => (
              <View key={c.label} style={[s.consentRow, i > 0 && s.divider]}>
                <Glyph name={c.icon} color={m3.color.tertiary} size={20} />
                <View style={s.flex1}>
                  <RNText style={[m3TextStyle("bodyLarge"), s.consentLabel]}>{c.label}</RNText>
                  <RNText style={[m3TextStyle("bodySmall"), s.consentNote]}>{c.note}</RNText>
                </View>
              </View>
            ))}
          </MdCard>

          {/* history */}
          {history.length > 0 ? (
            <>
              <RNText style={[m3TextStyle("titleSmall"), s.sectionLabel]}>{t("ds.import.historyTitle")}</RNText>
              {revokeErr ? <RNText style={[m3TextStyle("bodySmall"), s.revokeErr]}>{revokeErr}</RNText> : null}
              <View style={s.stack8}>
                {history.map((h) => (
                  <MdCard key={h.id} variant="outlined" style={s.historyCard}>
                    <View style={s.historyRow}>
                      <View style={s.flex1}>
                        <RNText style={[m3TextStyle("bodyLarge"), s.historyName]}>{h.name}</RNText>
                        <RNText style={[m3TextStyle("bodySmall"), s.historySub]}>{h.atIso.slice(0, 10)}{h.summary ? ` · ${h.summary}` : ""}</RNText>
                      </View>
                      <MdButton
                        label={t("ds.import.revoke")}
                        variant="text"
                        icon={<Glyph name="trash" color={m3.color.error} size={16} />}
                        onPress={() => void revokeImport(h)}
                        style={s.revokeBtn}
                        accessibilityLabel={ko ? `${h.name} 가져오기 철회` : `Revoke ${h.name} import`}
                      />
                    </View>
                  </MdCard>
                ))}
              </View>
            </>
          ) : null}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  loading: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  flex1: { flex: 1, minWidth: 0 },
  stack8: { gap: 8, marginTop: 4 },
  stack10: { gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: m3.color.outlineVariant },

  // ── inbox ──
  pageTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 8, marginBottom: 12 },
  notifCard: { padding: 14 },
  notifRow: { flexDirection: "row", gap: 12 },
  notifIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: m3.color.surfaceContainer },
  notifHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  notifTitle: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand },
  notifTime: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  notifBody: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4 },
  notifCta: { alignSelf: "flex-start", minHeight: 40, paddingHorizontal: 0, marginTop: 4 },

  // ── import ──
  lead: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4, marginBottom: 14 },
  leadStrong: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700" },
  sectionLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 22, marginBottom: 10 },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 6 },
  toggleBtnOn: { borderColor: m3.color.primary, backgroundColor: m3.color.secondaryContainer },
  toggleBtnOff: { borderColor: m3.color.outlineVariant, backgroundColor: m3.color.surfaceContainer },
  dropZone: { borderWidth: 1.5, borderStyle: "dashed", borderColor: m3.color.outline, borderRadius: 16, paddingVertical: 28, paddingHorizontal: 16, alignItems: "center", backgroundColor: m3.color.surfaceContainer },
  dropTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 8 },
  dropExt: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.mono, marginTop: 2 },
  dropBtn: { marginTop: 14, minHeight: 44 },
  accountCard: { padding: 13 },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  accountName: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand },
  resultCard: { padding: 14, marginTop: 14, backgroundColor: m3.color.secondaryContainer },
  resultText: { color: m3.color.onSecondaryContainer, fontFamily: m3.font.brand },
  consentCard: { padding: 4 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 },
  consentLabel: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  consentNote: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 2 },
  historyCard: { padding: 12 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  historyName: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  historySub: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 2 },
  revokeErr: { color: m3.color.error, fontFamily: m3.font.brand, marginTop: 4, marginBottom: 8 },
  healthErr: { color: m3.color.error, fontFamily: m3.font.brand, marginTop: 8 },
  revokeBtn: { minHeight: 40, paddingHorizontal: 12 },
});
