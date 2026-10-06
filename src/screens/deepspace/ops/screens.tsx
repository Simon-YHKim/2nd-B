// The 6 Ops/assistant domain screens (Claude Design ops-assistant.dc.html).
// Each assembles the shared kit (components/deepspace/ops) and renders/operates
// the already-built backing data libs. deepSpace.* tokens only, no auto-execution
// (every write is behind a user tap). Strings come from the bilingual ops copy.

import { useEffect, useMemo, useRef, useState, type DependencyList } from "react";
import { Linking, Modal, Pressable, Share, StyleSheet, TextInput, View } from "react-native";
import { PlainText as RNText } from "@/components/ui/PlainText";

import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DateField, MdButton, MdCard } from "@/components/m3";
import { DeepSpaceLoader } from "@/components/deepspace/DeepSpaceLoader";
import { deepSpace, deepSpaceRadii, deepSpaceSpacing, flattenAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { m3 } from "@/lib/theme/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTranslation } from "react-i18next";
import { systemLocaleFor } from "@/lib/i18n/locales";
import {
  domainColor,
  domainColorFor,
  MetaChip,
  OpsDomainPicker,
  OpsFrame,
  OpsPushSheet,
  OpsRecommendationCard,
  OpsState,
  OpsStatusChip,
  ProgressBar,
  useOpsCopy,
  type DomainTab,
  type OpsChipTone,
  type PushOption,
} from "@/components/deepspace/ops";
import {
  OPS_GROUP_IDS,
  domainsForGroup,
  type OpsDomainId,
  type OpsGroupId,
} from "@/lib/ops/domains";
import { recommendForDomain, type OpsRecommendation } from "@/lib/ops/recommend";
import { fetchPrivacyPrefs } from "@/lib/supabase/privacy";
import { buildChecklistShareText, buildGoogleCalendarUrl, type OpsEventInput } from "@/lib/ops/push";
import { searchBooks, type BookResult } from "@/lib/reading/books";
import {
  addToShelf,
  listShelf,
  manualBook,
  parsePageDraft,
  readingProgress,
  removeFromShelf,
  setShelfStatus,
  shelfVolumeIds,
  updateShelfEntry,
  type Shelf,
} from "@/lib/reading/shelf";
import {
  createMilestone,
  deleteMilestone,
  domainProgress,
  listMilestones,
  milestoneOverdue,
  updateMilestone,
  type Milestone,
} from "@/lib/ops/milestones";
import { createLedgerEntry, deleteLedgerEntry, listEntriesForMonth, localDayKey, MAX_LEDGER_KRW, monthBucket, parseLedgerAmount, summarizeMonth } from "@/lib/finance/ledger";
import { fetchPushActivity, summarizeGithubActivity, type PushActivity } from "@/lib/projects/github";
import { searchFoods, type FoodNutrition } from "@/lib/nutrition/foods";
import {
  buildWeekGrid,
  clearMeal,
  listWeek,
  MEAL_SLOTS,
  setMeal,
  weekStartKey,
  type DayPlan,
  type MealEntry,
  type MealSlot,
} from "@/lib/nutrition/meal-plan";
import { listActiveRoutines, type OpsRoutine } from "@/lib/ops/routines";
import {
  disableReminder,
  enableReminder,
  getReminderStates,
  getScheduledRoutineIds,
  remindersSupported,
} from "@/lib/ops/reminders";
import { getGithubUsername, setGithubUsername } from "@/lib/projects/github-link";
import { monthDelta, prevMonthKey } from "@/lib/finance/trend";
import { trendChip } from "@/lib/ops/grounding";
import { RECORD_SAVE_CUE, milestoneDoneCueAllowed } from "@/lib/audio/app-cues";
import { useUiSound } from "@/lib/audio/use-ui-sound";
import {
  bookSearchFailed,
  bookSearchSettled,
  DELETE_ARM_MS,
  editorAfterDelete,
  mealClearArmKey,
  mealSaveAction,
  mealWriteLock,
  MILESTONE_NEXT,
  milestoneChip,
  pageWriteLock,
  runExclusive,
  sheetAfterWrite,
  shelfView,
  tapDelete,
  type BookSearchView,
  type MilestoneChipKey,
} from "./tool-logic";

// ── 이 화면들의 바탕 (PIXEL-CLAY 절대 규칙 4) ────────────────────────
//
// ⚠ **바탕 선언**: ops 화면들은 딥스페이스 스테이지 위에 앉는다 — 스테이지가
//   `m3.accent.stageFloor` 를 0.92 로 깔고 그 아래가 `deepSpace.bgEdge` 다.
//   바탕이 틀리면 알파를 그냥 두는 것보다 나쁘니 옮기는 사람은 여기부터 다시 잴 것.
//
// ⚠ 이 선언은 **파일 머리**에 있어야 한다. 스타일시트 블록이 여러 개라, 한 블록
//   앞에 두면 그보다 앞선 블록이 선언 전에 쓴다(TS2448).
const OPS_GROUND = flattenAlpha(m3.accent.stageFloor, 0.92, deepSpace.bgEdge);
const opsAlpha = (c: string, a: number): string => flattenAlpha(c, a, OPS_GROUND);

/** 비활성 `추가` 버튼 — 원래 `opacity: 0.4` 가 하던 일. 바탕과 글자가 **한 벌**이다. */
const ADD_OFF_BG = flattenAlpha(deepSpace.accent, 0.4, OPS_GROUND);
const ADD_OFF_FG = flattenAlpha(deepSpace.bg, 0.4, ADD_OFF_BG);


// --- tiny async helper -------------------------------------------------

type Status = "loading" | "ready" | "error";
interface Async<T> {
  status: Status;
  data: T | null;
  reload: () => void;
}

function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): Async<T> {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<T | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    fn()
      .then((d) => {
        if (alive) {
          setData(d);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
    // fn stays out of this list on purpose: every caller passes what fn reads as deps.
  }, [...deps, nonce]);
  return { status, data, reload: () => setNonce((n) => n + 1) };
}

// Localized labels for the OPS_GROUP_IDS domain-picker tabs (routine groups).
// Without this the picker rendered the raw group ids ("body"/"learning"/...) as
// tab labels to BOTH locales via OpsDomainPicker.
const OPS_GROUP_LABEL: Record<"en" | "ko", Record<OpsGroupId, string>> = {
  en: { body: "Body", learning: "Learning", worklife: "Work", living: "Living", creative: "Creative" },
  ko: { body: "몸", learning: "배움", worklife: "일", living: "생활", creative: "창작" },
};

const EN_DOMAIN_LABEL: Record<OpsDomainId, string> = {
  exercise_routine: "Exercise routine",
  exercise_ideas: "Exercise ideas",
  health_routine: "Health routine",
  weekly_meals: "Weekly meals",
  simple_meals: "Simple meals",
  reading_list: "Reading list",
  learning_goals: "Learning goals",
  language_practice: "Language practice",
  career_check: "Career check",
  money_check: "Money check",
  daily_focus: "Daily focus",
  home_reset: "Home reset",
  news_digest: "News digest",
  side_project: "Side project",
};

// Per-day commit counts for the last `days` days ending today (UTC date prefix,
// matching the github helper's own windowing). Oldest first so the grid reads
// left→right. Pure — derives from the pushes the screen already has.
function buildCommitHeatmap(
  pushes: ReadonlyArray<PushActivity>,
  days = 14,
  now: Date = new Date(),
): Array<{ day: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of pushes) {
    const key = p.atIso.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + p.commitCount);
  }
  const out: Array<{ day: string; count: number }> = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ day: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

// --- (1) Ops home / recommendations ------------------------------------

// A write that failed. OpsState (variant="error") is for a failed READ -- it replaces the
// whole body, which is right when there is nothing to show. A failed WRITE is different:
// the list is still there and still valid, only the thing the user just did did not
// happen. So this sits inline, above the list, and does not take the data away.
function SaveErrorBanner({ text }: { text: string }) {
  return (
    <View style={styles.saveErrBanner}>
      <Text variant="caption" style={styles.saveErrText} accessibilityRole="alert" accessibilityLiveRegion="polite">
        {text}
      </Text>
    </View>
  );
}

// --- hand-entry tool helpers (QA round 2, 2026-10-05) ---------------------------

/** R2C-10: the tool screens showed the assistant's "NEW / No suggestions yet" card
 *  while loading, with the suggestion screen's body text. A wait is the shared loader. */
function ToolLoading() {
  const { t } = useTranslation("ops");
  return <DeepSpaceLoader variant="dots" caption={t("toolScreens.loading")} />;
}

/**
 * R2C-16 / R2C-07: a delete takes two taps on the same row (tapDelete), and an armed
 * row lets go on its own after DELETE_ARM_MS. The ledger's ✕ used to delete on the
 * first tap, and the shelf, goals and meals had no delete at all.
 */
function useTwoTapDelete(onCommit: (id: string) => void): { armedId: string | null; press: (id: string) => void } {
  const [armedId, setArmedId] = useState<string | null>(null);
  useEffect(() => {
    if (armedId === null) return undefined;
    const timer = setTimeout(() => setArmedId(null), DELETE_ARM_MS);
    return () => clearTimeout(timer);
  }, [armedId]);
  const press = (id: string) => {
    const tap = tapDelete(armedId, id);
    setArmedId(tap.armedId);
    if (tap.commit) onCommit(id);
  };
  return { armedId, press };
}

function DeleteChip({ armed, name, onPress, disabled }: { armed: boolean; name: string; onPress: () => void; disabled?: boolean }) {
  const { t } = useTranslation("ops");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={armed ? t("toolScreens.delete.confirmA11y", { name }) : t("toolScreens.delete.a11y", { name })}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
    >
      <OpsStatusChip tone={armed ? "danger" : "muted"} label={armed ? t("toolScreens.delete.confirm") : t("toolScreens.delete.arm")} />
    </Pressable>
  );
}

// ⚠ 이 컴포넌트는 **어떤 라우트도 렌더하지 않는다** (2026-08-18 실측).
//
// /ops 는 dds-ops-screen.tsx 의 DeepSpaceOpsScreen 을 렌더한다. 이 파일의
// 나머지 화면들(ReadingScreen·MilestonesScreen·LedgerScreen·SideProjectScreen·
// MealsScreen·RemindersScreen)은 각자 라우트가 쓰지만, 이 허브만 고아다.
//
// 2026-08-18 에 여기에 도구 격자를 붙였다가 그대로 죽은 코드가 됐다(#1237).
// 소스에서 grep 하면 있는 것처럼 보이지만 화면에는 없다 - 렌더 체인을 따라가지
// 않으면 반복되는 실수다. **허브를 고치려면 DeepSpaceOpsScreen 을 고쳐야 한다.**
//
// ⚠ 2026-09-08 정정 — 위 문장이 가리키는 파일이 틀려 있었다. 원래
// "DeepSpaceDesignScreens.tsx 의 DeepSpaceOpsScreen" 이라고 적혀 있었는데,
// `src/app/ops.tsx` 는 `@/screens/deepspace/dds-ops-screen` 에서 가져온다.
// DeepSpaceDesignScreens.tsx:2691 에도 같은 이름의 476줄짜리 사본이 있지만
// **아무 라우트도 그걸 렌더하지 않는다.** 즉 이 주석은 죽은 화면을 설명하면서
// 독자를 **또 다른 죽은 화면으로** 보내고 있었다 - 스스로 경고하는 바로 그
// 실수를("렌더 체인을 따라가지 않으면") 저지른 셈이다.
export function OpsHomeScreen() {
  const c = useOpsCopy();
  const { userId, isMinor } = useAuth();
  const { i18n } = useTranslation();
  const locale = systemLocaleFor(i18n.language);
  const [group, setGroup] = useState<OpsGroupId>("body");
  const domain = domainsForGroup(group)[0];
  const [pushRec, setPushRec] = useState<OpsRecommendation | null>(null);
  // D-2: this home list auto-runs recommendForDomain on mount, so load the
  // `recommendations` privacy pref and pass it through. The engine gate is
  // fail-closed, so until this resolves (undefined) it returns [] and shows the
  // empty state — privacy-by-default, and no wiki snapshot is sent ungated.
  const [recPref, setRecPref] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void fetchPrivacyPrefs(userId).then((p) => {
      if (alive) setRecPref(p.recommendations === true);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const recs = useAsync<OpsRecommendation[]>(
    () =>
      userId
        ? recommendForDomain({
            userId,
            locale,
            domainId: domain,
            domainLabel: EN_DOMAIN_LABEL[domain],
            minor: isMinor === true,
            recommendationsPref: recPref,
          })
        : Promise.resolve([]),
    [userId, domain, locale, recPref, isMinor],
  );

  const tabs: DomainTab[] = OPS_GROUP_IDS.map((g) => ({
    id: g,
    label: OPS_GROUP_LABEL[i18n.language?.toLowerCase().startsWith("ko") ? "ko" : "en"][g],
    color: domainColor(g),
  }));

  const eventFor = (r: OpsRecommendation): OpsEventInput => ({
    title: r.title,
    description: r.reason,
    startsAtIso: r.startsAtIso ?? new Date().toISOString(),
    durationMinutes: r.durationMinutes,
    recurrence: r.recurrence,
  });

  const pushOptions = (r: OpsRecommendation): PushOption[] => {
    const opts: PushOption[] = [];
    const gUrl = buildGoogleCalendarUrl(eventFor(r));
    if (gUrl) {
      opts.push({
        key: "google",
        label: c.googleCalendar,
        sub: c.googleCalendarSub,
        recommended: true,
        onPress: () => void Linking.openURL(gUrl),
      });
    }
    opts.push({
      key: "share",
      label: c.shareChecklist,
      sub: c.shareChecklistSub,
      onPress: () => void Share.share({ message: buildChecklistShareText(r.title, r.checklist ?? [r.reason]) }),
    });
    return opts;
  };

  return (
    <OpsFrame title={c.todaysRoutine} bubble={c.todaysRoutine} tip={c.receivedOnly}>
      <OpsDomainPicker tabs={tabs} selected={group} onSelect={(g) => setGroup(g as OpsGroupId)} />
      {recs.status === "loading" ? (
        <OpsState variant="empty" title="…" body={c.emptyBody} />
      ) : recs.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={recs.reload} />
      ) : (recs.data?.length ?? 0) === 0 ? (
        <OpsState variant="empty" title={c.emptyTitle} body={c.emptyBody} />
      ) : (
        recs.data?.map((r, i) => (
          <OpsRecommendationCard
            key={`${r.title}-${i}`}
            title={r.title}
            reason={r.reason}
            accent={domainColorFor(domain)}
            chips={[r.recurrence ?? "", r.durationMinutes ? `${r.durationMinutes}m` : ""].filter(Boolean)}
            primaryLabel={c.send}
            onPrimary={() => setPushRec(r)}
            secondaryLabel={c.share}
            onSecondary={() => void Share.share({ message: `${r.title}\n${r.reason}` })}
            disclaimer={c.notMedical}
          />
        ))
      )}
      <OpsPushSheet
        visible={pushRec !== null}
        title={c.whereToSend}
        subtitle={pushRec?.title}
        options={pushRec ? pushOptions(pushRec) : []}
        confirmLabel={c.allowAndContinue}
        closeLabel={c.cancel}
        onConfirm={() => setPushRec(null)}
        onClose={() => setPushRec(null)}
      />
    </OpsFrame>
  );
}

// --- (2) Reading · books -----------------------------------------------

export function ReadingScreen() {
  const c = useOpsCopy();
  const { t } = useTranslation("ops");
  const { userId } = useAuth();
  // A failed WRITE. The empty catches below used to claim it was "surfaced on reload",
  // but reload() sits INSIDE the try -- so on the failure path it never ran, and the tap
  // just silently did nothing.
  const [saveErr, setSaveErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  // R2C-02: "not searched yet", "nothing matched" and "the search failed" are three
  // different answers. The old catch set the results to [] and the screen fell onto
  // the assistant's "No suggestions yet" card, so a refused search looked like nothing.
  const [search, setSearch] = useState<BookSearchView>({ kind: "idle" });
  const searchSeq = useRef(0);
  // R2C-08: the "0 / 200" under NOW READING could not be changed.
  // `session` is new on every opening of the editor (gate BL-09): a save closes only the
  // opening it started from, never one opened after it.
  const [pageEdit, setPageEdit] = useState<{ session: number; id: string; cur: string; total: string } | null>(null);
  const pageEditSeq = useRef(0);
  const [pageErr, setPageErr] = useState(false);
  // One page-count save per book at a time (gate BL-09), under the book's shared lock
  // (pageWriteLock). `pageWrites` counts this screen's own saves in flight; while any
  // runs, the editor takes no input and no second submit.
  const [pageWrites, setPageWrites] = useState(0);
  const pageSaving = pageWrites > 0;
  const shelf = useAsync<Shelf>(
    () => (userId ? listShelf(userId) : Promise.resolve({ want: [], reading: [], done: [] })),
    [userId],
  );
  const view = shelfView(shelf.data);
  const reading = view.hero;
  const onShelf = shelfVolumeIds(shelf.data);

  const onSearch = async (query: string = q) => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    const seq = ++searchSeq.current;
    setSearch({ kind: "searching", q: trimmed });
    try {
      const items = await searchBooks(trimmed);
      if (seq === searchSeq.current) setSearch(bookSearchSettled(trimmed, items));
    } catch (e) {
      if (seq === searchSeq.current) setSearch(bookSearchFailed(trimmed, e));
    }
  };
  const onAdd = async (b: BookResult) => {
    if (!userId || busy) return;
    setBusy(true);
    setSaveErr(false);
    try {
      await addToShelf(userId, b, "want");
      shelf.reload();
    } catch {
      // The write failed. Say so: reload() lives inside the try above, so on this path
      // it never ran and nothing surfaced anywhere.
      setSaveErr(true);
    } finally {
      setBusy(false);
    }
  };
  // med#21: the shelf had no way to MOVE a book between statuses, so the
  // NOW-READING hero (and its progress bar) was permanently empty render code.
  const onMove = async (entryId: string, status: "reading" | "done") => {
    if (!userId) return;
    setSaveErr(false);
    try {
      await setShelfStatus(userId, entryId, status);
      shelf.reload();
    } catch {
      setSaveErr(true);
    }
  };
  // R2C-07: a book put on the shelf by mistake could never be taken off.
  const onRemove = async (entryId: string) => {
    if (!userId) return;
    setSaveErr(false);
    try {
      await removeFromShelf(userId, entryId);
      // Gate CD-R2-01: read the editor as it is now. Another book's page editor can open while
      // this delete is in flight, and its draft must survive this.
      setPageEdit((open) => editorAfterDelete(open, entryId));
      shelf.reload();
    } catch {
      setSaveErr(true);
    }
  };
  const del = useTwoTapDelete((id) => void onRemove(id));
  // Gate BL-09: two saves used to go out side by side (20, then 30 before the first
  // answered) and whichever UPDATE landed last won, so the book could end at 20. The save
  // now runs under the book's lock, the editor is off while it runs, and when it settles
  // only the opening it started from closes. A failed save keeps the editor and its draft.
  const onSavePages = async () => {
    if (!userId || !pageEdit || pageSaving) return;
    const edit = pageEdit;
    const pages = parsePageDraft(edit.cur, edit.total);
    if (!pages) {
      setPageErr(true);
      return;
    }
    setPageErr(false);
    const outcome = await runExclusive(pageWriteLock(userId, edit.id), async () => {
      setPageWrites((n) => n + 1);
      setSaveErr(false);
      try {
        await updateShelfEntry(userId, edit.id, pages);
      } finally {
        setPageWrites((n) => n - 1);
      }
    });
    if (outcome === "busy") return;
    if (outcome === "done") {
      setPageEdit((open) => sheetAfterWrite(open, edit.session));
      shelf.reload();
    } else setSaveErr(true);
  };

  const manual = search.kind === "none" || search.kind === "failed" ? manualBook(search.q) : null;

  return (
    <OpsFrame title={c.myShelf} bubble={c.whatReading} tip={c.add}>
      {saveErr ? <SaveErrorBanner text={c.saveFailed} /> : null}
      <View style={styles.searchRow}>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void onSearch()}
          placeholder={c.searchBooks}
          placeholderTextColor={deepSpace.textLo}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel={c.searchBooks}
        />
      </View>

      {search.kind === "searching" ? (
        <Text variant="subtle" style={styles.toolNote}>{t("toolScreens.reading.searching")}</Text>
      ) : search.kind === "results" ? (
        <View style={styles.section}>
          <Text variant="caption" pixelEn style={styles.pixelLabel}>{c.searchBooks}</Text>
          {search.items.map((b) =>
            onShelf.has(b.id) ? (
              <View key={b.id} style={styles.bookRow}>
                <Text variant="body" style={styles.bookTitle}>{b.title}</Text>
                <Text variant="caption" style={styles.bookOnShelf}>{t("toolScreens.reading.onShelf")}</Text>
              </View>
            ) : (
              <Pressable key={b.id} accessibilityRole="button" onPress={() => void onAdd(b)} disabled={busy} hitSlop={6} style={styles.bookRow}>
                <Text variant="body" style={styles.bookTitle}>{b.title}</Text>
                <Text variant="caption" style={styles.bookAdd}>＋ {c.add}</Text>
              </Pressable>
            ),
          )}
        </View>
      ) : search.kind === "none" || search.kind === "failed" ? (
        <View style={styles.section}>
          {search.kind === "none" ? (
            <Text variant="subtle" style={styles.toolNote}>{t("toolScreens.reading.noResults", { q: search.q })}</Text>
          ) : (
            <OpsState
              variant={search.rate ? "rate" : "error"}
              title={search.rate ? t("toolScreens.reading.rateTitle") : t("toolScreens.reading.failedTitle")}
              body={search.rate ? t("toolScreens.reading.rateBody") : t("toolScreens.reading.failedBody")}
              ctaLabel={c.retry}
              onCta={() => void onSearch(search.q)}
            />
          )}
          {/* The search is a third-party API that can refuse every request, and it was the
              only way onto the shelf. Adding by the typed title keeps the shelf usable. */}
          {manual ? (
            onShelf.has(manual.id) ? (
              <View style={styles.bookRow}>
                <Text variant="body" style={styles.bookTitle}>{manual.title}</Text>
                <Text variant="caption" style={styles.bookOnShelf}>{t("toolScreens.reading.onShelf")}</Text>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => void onAdd(manual)} disabled={busy} hitSlop={6} style={styles.bookRow}>
                <Text variant="body" style={styles.bookTitle}>
                  {t("toolScreens.reading.addByTitle", { title: manual.title })}
                </Text>
                <Text variant="caption" style={styles.bookAdd}>＋ {c.add}</Text>
              </Pressable>
            )
          ) : null}
        </View>
      ) : null}

      {reading ? (
        <View style={styles.hero}>
          <View style={styles.cover}>
            <Text variant="caption" style={styles.coverText}>{reading.title}</Text>
          </View>
          <View style={styles.heroBody}>
            <Text variant="caption" pixelEn style={styles.pixelLabel}>{c.nowReading}</Text>
            <Text variant="heading" style={styles.heroTitle}>{reading.title}</Text>
            <Text variant="body" style={styles.heroAuthor}>{reading.authors.join(", ")}</Text>
            <View style={{ marginTop: 10 }}>
              <ProgressBar value={readingProgress(reading.current_page, reading.total_pages)} />
            </View>
            {pageEdit?.id === reading.id ? (
              <>
                {/* Gate BL-09: while a save runs, both fields, the keyboard's done and the
                    save chip take nothing, so no newer draft can be typed and then lost
                    under the save that is still out. */}
                <View style={styles.pageEdit}>
                  <TextInput
                    value={pageEdit.cur}
                    editable={!pageSaving}
                    onChangeText={(v) => {
                      if (pageSaving) return;
                      setPageEdit((p) => (p ? { ...p, cur: v } : p));
                    }}
                    placeholder={t("toolScreens.reading.currentPage")}
                    placeholderTextColor={deepSpace.textLo}
                    style={styles.searchInput}
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (!pageSaving) void onSavePages();
                    }}
                    accessibilityLabel={t("toolScreens.reading.currentPage")}
                    accessibilityState={{ disabled: pageSaving }}
                  />
                  <Text variant="subtle" style={styles.heroMeta}>/</Text>
                  <TextInput
                    value={pageEdit.total}
                    editable={!pageSaving}
                    onChangeText={(v) => {
                      if (pageSaving) return;
                      setPageEdit((p) => (p ? { ...p, total: v } : p));
                    }}
                    placeholder={t("toolScreens.reading.totalPages")}
                    placeholderTextColor={deepSpace.textLo}
                    style={styles.searchInput}
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (!pageSaving) void onSavePages();
                    }}
                    accessibilityLabel={t("toolScreens.reading.totalPages")}
                    accessibilityState={{ disabled: pageSaving }}
                  />
                </View>
                {pageErr ? (
                  <Text variant="caption" style={styles.fieldErr} accessibilityLiveRegion="polite">
                    {t("toolScreens.reading.pagesInvalid")}
                  </Text>
                ) : null}
                <View style={styles.chipRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: pageSaving }}
                    disabled={pageSaving}
                    onPress={() => void onSavePages()}
                    hitSlop={8}
                  >
                    <OpsStatusChip tone={pageSaving ? "muted" : "positive"} label={t("toolScreens.reading.savePages")} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setPageEdit(null);
                      setPageErr(false);
                    }}
                    hitSlop={8}
                  >
                    <OpsStatusChip tone="muted" label={c.cancel} />
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("toolScreens.reading.editPages")}
                // Gate BL-09: no new opening while a save is out. Its draft would start from
                // the page count the save is about to replace.
                accessibilityState={{ disabled: pageSaving }}
                disabled={pageSaving}
                onPress={() => {
                  pageEditSeq.current += 1;
                  setPageEdit({
                    session: pageEditSeq.current,
                    id: reading.id,
                    cur: String(reading.current_page),
                    total: reading.total_pages ? String(reading.total_pages) : "",
                  });
                }}
                hitSlop={6}
              >
                <Text variant="subtle" style={styles.heroMeta}>
                  {reading.current_page} / {reading.total_pages ?? "?"} · {t("toolScreens.reading.editPages")}
                </Text>
              </Pressable>
            )}
            <View style={styles.chipRow}>
              <Pressable accessibilityRole="button" onPress={() => void onMove(reading.id, "done")} hitSlop={8}>
                <OpsStatusChip tone="muted" label={c.finishedReading} />
              </Pressable>
              <DeleteChip armed={del.armedId === reading.id} name={reading.title} onPress={() => del.press(reading.id)} />
            </View>
          </View>
        </View>
      ) : null}

      {shelf.status === "loading" && shelf.data === null ? (
        <ToolLoading />
      ) : shelf.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={shelf.reload} />
      ) : view.empty ? (
        search.kind === "idle" ? (
          <OpsState variant="empty" title={t("toolScreens.reading.emptyTitle")} body={t("toolScreens.reading.emptyBody")} />
        ) : null
      ) : (
        <>
          {view.alsoReading.length > 0 ? (
            <View style={styles.section}>
              <Text variant="caption" pixelEn style={styles.pixelLabel}>{t("toolScreens.reading.alsoReading")}</Text>
              {view.alsoReading.map((b) => (
                <View key={b.id} style={styles.bookRow}>
                  <Text variant="body" style={styles.bookTitle}>{b.title}</Text>
                  <Pressable accessibilityRole="button" onPress={() => void onMove(b.id, "done")} hitSlop={8}>
                    <OpsStatusChip tone="muted" label={c.finishedReading} />
                  </Pressable>
                  <DeleteChip armed={del.armedId === b.id} name={b.title} onPress={() => del.press(b.id)} />
                </View>
              ))}
            </View>
          ) : null}
          {view.want.length > 0 ? (
            <View style={styles.section}>
              <Text variant="caption" pixelEn style={styles.pixelLabel}>{c.wantToRead}</Text>
              {view.want.map((b) => (
                <View key={b.id} style={styles.bookRow}>
                  <Text variant="body" style={styles.bookTitle}>{b.title}</Text>
                  <Pressable accessibilityRole="button" onPress={() => void onMove(b.id, "reading")} hitSlop={8}>
                    <OpsStatusChip tone="positive" label={c.startReading} />
                  </Pressable>
                  <DeleteChip armed={del.armedId === b.id} name={b.title} onPress={() => del.press(b.id)} />
                </View>
              ))}
            </View>
          ) : null}
          {/* R2C-08: "Finished" used to make a book vanish (done was never drawn). */}
          {view.done.length > 0 ? (
            <View style={styles.section}>
              <Text variant="caption" pixelEn style={styles.pixelLabel}>{t("toolScreens.reading.finished")}</Text>
              {view.done.map((b) => (
                <View key={b.id} style={styles.bookRow}>
                  <Text variant="body" style={styles.bookDone}>{b.title}</Text>
                  <Pressable accessibilityRole="button" onPress={() => void onMove(b.id, "reading")} hitSlop={8}>
                    <OpsStatusChip tone="info" label={t("toolScreens.reading.readAgain")} />
                  </Pressable>
                  <DeleteChip armed={del.armedId === b.id} name={b.title} onPress={() => del.press(b.id)} />
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </OpsFrame>
  );
}

// --- (3) Milestones · career / learning --------------------------------

const MILESTONE_DOMAINS: OpsDomainId[] = ["learning_goals", "career_check"];

export function MilestonesScreen() {
  const c = useOpsCopy();
  const { t } = useTranslation("ops");
  const { userId } = useAuth();
  const playDoneCue = useUiSound(RECORD_SAVE_CUE.source, RECORD_SAVE_CUE);
  // A failed WRITE. The empty catches below used to claim it was "surfaced on reload",
  // but reload() sits INSIDE the try -- so on the failure path it never ran, and the tap
  // just silently did nothing.
  const [saveErr, setSaveErr] = useState(false);
  const [domain, setDomain] = useState<OpsDomainId>("learning_goals");
  const [busy, setBusy] = useState(false);
  // Named goals: the add input's draft + the inline rename target.
  const [draft, setDraft] = useState("");
  // Due date (ISO "YYYY-MM-DD", "" = none). target_date + the Overdue chip already
  // existed, but nothing could set the date, so Overdue could never fire.
  const [dueDraft, setDueDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string; due: string } | null>(null);
  const ms = useAsync<Milestone[]>(
    () => (userId ? listMilestones(userId, domain) : Promise.resolve([])),
    [userId, domain],
  );
  const list = ms.data ?? [];
  const prog = domainProgress(list);

  // R2C-09: the chip shows the status and only the status. It used to answer "overdue"
  // first, so on an overdue goal the todo → doing tap was saved but nothing changed on
  // screen. Overdue now lives on the due-date line below.
  const chipLabel: Record<MilestoneChipKey, string> = { planning: c.planning, inProgress: c.inProgress, done: c.done };
  const chipFor = (m: Milestone): { tone: OpsChipTone; label: string; nextLabel: string } => {
    const chip = milestoneChip(m.status);
    return { tone: chip.tone, label: chipLabel[chip.key], nextLabel: chipLabel[milestoneChip(MILESTONE_NEXT[m.status]).key] };
  };

  // [데이터 추가]: the user NAMES the goal. The old handler hardcoded
  // "새 목표"/"New goal" and no rename existed anywhere, so every goal in the
  // list was an indistinguishable "새 목표" (audit: /milestones stub).
  const onAdd = async () => {
    const title = draft.trim();
    if (!userId || busy || title.length === 0) return;
    setBusy(true);
    setSaveErr(false);
    try {
      await createMilestone(userId, domain, { title, target_date: dueDraft || null });
      setDraft("");
      setDueDraft("");
      ms.reload();
    } catch {
      // The write failed. Say so: reload() lives inside the try above, so on this path
      // it never ran and nothing surfaced anywhere.
      setSaveErr(true);
    } finally {
      setBusy(false);
    }
  };

  // Inline rename (tap a goal's title to edit it).
  const onRename = async () => {
    if (!userId || busy || !editing) return;
    const title = editing.title.trim();
    if (title.length === 0) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setSaveErr(false);
    try {
      await updateMilestone(userId, editing.id, { title, target_date: editing.due || null });
      setEditing(null);
      ms.reload();
    } catch {
      setSaveErr(true);
    } finally {
      setBusy(false);
    }
  };

  // Advance one milestone's status (todo → doing → done → todo) on chip tap.
  const onAdvance = async (m: Milestone) => {
    if (!userId || busy) return;
    setBusy(true);
    setSaveErr(false);
    try {
      await updateMilestone(userId, m.id, { status: MILESTONE_NEXT[m.status] });
      // 완료 소리(Q-261006-15, 저장 소리 재사용)는 쓰기가 성공한 뒤, '완료'로 바뀔 때만.
      if (milestoneDoneCueAllowed({ from: m.status, to: MILESTONE_NEXT[m.status] })) playDoneCue();
      ms.reload();
    } catch {
      // The write failed. Say so: reload() lives inside the try above, so on this path
      // it never ran and nothing surfaced anywhere.
      setSaveErr(true);
    } finally {
      setBusy(false);
    }
  };

  // R2C-07: a goal made by mistake could never be removed (deleteMilestone had no caller).
  const onDelete = async (id: string) => {
    if (!userId || busy) return;
    setBusy(true);
    setSaveErr(false);
    try {
      await deleteMilestone(userId, id);
      // Gate CD-R1-01: close only the deleted goal's editor. While the delete is in flight
      // another goal's title can open its editor, and that draft must survive this.
      setEditing((open) => editorAfterDelete(open, id));
      ms.reload();
    } catch {
      setSaveErr(true);
    } finally {
      setBusy(false);
    }
  };
  const delGoal = useTwoTapDelete((id) => void onDelete(id));

  const tabs: DomainTab[] = MILESTONE_DOMAINS.map((d) => ({
    id: d,
    label: t(`domains.${d}`),
    color: domainColorFor(d),
  }));

  return (
    <OpsFrame title={c.goals} bubble={c.goals} tip={c.nextStep}>
      {saveErr ? <SaveErrorBanner text={c.saveFailed} /> : null}
      <OpsDomainPicker tabs={tabs} selected={domain} onSelect={(d) => setDomain(d as OpsDomainId)} />
      <View style={styles.progressHeader}>
        <Text variant="caption" style={styles.progressLabel}>
          {prog.done} / {prog.total}
        </Text>
        <ProgressBar value={prog.pct} color={deepSpace.accentDim} />
      </View>
      <View style={styles.searchRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void onAdd()}
          placeholder={c.goalTitlePlaceholder}
          placeholderTextColor={deepSpace.textLo}
          style={styles.searchInput}
          returnKeyType="done"
        />
      </View>
      <DateField
        value={dueDraft}
        onChange={setDueDraft}
        label={c.dueDate}
        containerStyle={styles.dueField}
      />
      <Pressable accessibilityRole="button" onPress={onAdd} hitSlop={6} disabled={busy || draft.trim().length === 0} style={styles.addRow}>
        <Text variant="caption" style={styles.addRowText}>＋ {c.emptyCta}</Text>
      </Pressable>
      {ms.status === "loading" ? (
        <ToolLoading />
      ) : ms.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={ms.reload} />
      ) : list.length === 0 ? (
        <OpsState variant="empty" title={t("toolScreens.goals.emptyTitle")} body={t("toolScreens.goals.emptyBody")} />
      ) : (
        list.map((m) => {
          const chip = chipFor(m);
          const overdue = milestoneOverdue(m);
          return (
            <View key={m.id} style={styles.msRow}>
              <View style={styles.msTop}>
                {editing?.id === m.id ? (
                  <>
                    <TextInput
                      value={editing.title}
                      onChangeText={(v) => setEditing((e) => (e ? { ...e, title: v } : e))}
                      style={[styles.searchInput, styles.msTitleInput]}
                      placeholderTextColor={deepSpace.textLo}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => void onRename()}
                    />
                    <Pressable accessibilityRole="button" onPress={() => void onRename()} hitSlop={8} disabled={busy}>
                      <OpsStatusChip tone="positive" label={c.save} />
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setEditing(null)} hitSlop={8} disabled={busy}>
                      <OpsStatusChip tone="muted" label={c.cancel} />
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={c.goalRename}
                      onPress={() => setEditing({ id: m.id, title: m.title, due: m.target_date ?? "" })}
                      hitSlop={6}
                      style={styles.msTitlePress}
                    >
                      <Text variant="heading" style={styles.msTitle}>{m.title}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("toolScreens.goals.chipA11y", { state: chip.label, next: chip.nextLabel })}
                      onPress={() => onAdvance(m)}
                      hitSlop={8}
                      disabled={busy}
                    >
                      <OpsStatusChip tone={chip.tone} label={chip.label} />
                    </Pressable>
                  </>
                )}
              </View>
              {editing?.id === m.id ? (
                <View style={styles.msDueEdit}>
                  <DateField
                    value={editing.due}
                    onChange={(d) => setEditing((e) => (e ? { ...e, due: d } : e))}
                    label={c.dueDate}
                    containerStyle={styles.msDueField}
                  />
                  {editing.due ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={c.dueClear}
                      onPress={() => setEditing((e) => (e ? { ...e, due: "" } : e))}
                      hitSlop={8}
                      disabled={busy}
                    >
                      <OpsStatusChip tone="muted" label={c.dueClear} />
                    </Pressable>
                  ) : null}
                  <DeleteChip armed={delGoal.armedId === m.id} name={m.title} onPress={() => delGoal.press(m.id)} disabled={busy} />
                </View>
              ) : m.target_date ? (
                <Text variant="caption" style={[styles.msDue, overdue && styles.msDueOver]}>
                  {c.dueDate} · {m.target_date}
                  {overdue ? ` · ${c.overdue}` : ""}
                </Text>
              ) : null}
              {m.note ? <Text variant="body" style={styles.msNote}>{m.note}</Text> : null}
            </View>
          );
        })
      )}
    </OpsFrame>
  );
}

// --- (4) Ledger · money ------------------------------------------------

export function LedgerScreen() {
  const c = useOpsCopy();
  const { userId } = useAuth();
  // A failed WRITE. The empty catches below used to claim it was "surfaced on reload",
  // but reload() sits INSIDE the try -- so on the failure path it never ran, and the tap
  // just silently did nothing.
  const [saveErr, setSaveErr] = useState(false);
  const { t, i18n } = useTranslation("ops");
  const ko = i18n.language?.toLowerCase().startsWith("ko");
  const month = monthBucket(new Date());
  const prevMonth = prevMonthKey(month);
  const entries = useAsync(
    () => (userId ? listEntriesForMonth(userId, month) : Promise.resolve([])),
    [userId, month],
  );
  // B grounding: month-over-month spending trend.
  const prevEntries = useAsync(
    () => (userId ? listEntriesForMonth(userId, prevMonth) : Promise.resolve([])),
    [userId, prevMonth],
  );
  const summary = useMemo(() => summarizeMonth(entries.data ?? [], month), [entries.data, month]);
  const prevSummary = useMemo(
    () => summarizeMonth(prevEntries.data ?? [], prevMonth),
    [prevEntries.data, prevMonth],
  );
  const trend = trendChip(monthDelta(summary.expense, prevSummary.expense), !!ko);
  const maxCat = summary.byCategory[0]?.total ?? 1;
  const [busy, setBusy] = useState(false);

  // The real entry form. This screen used to have only a ＋ button that inserted a
  // placeholder row (amount 0, category "기타") the user could never edit -- so it could
  // not be used as a ledger at all: no way to enter an amount, no way to delete a wrong
  // row. The lib always supported both (createLedgerEntry takes a real amount/category,
  // deleteLedgerEntry exists); only the UI was missing.
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  // Booking day. createLedgerEntry always accepted occurred_on and only fell back
  // to today, but the form never sent one -- so yesterday's coffee could not be
  // recorded. Defaults to today and is clamped to the month this screen shows
  // (see the picker below): the list/summary are strictly `month`, so a date
  // outside it would insert a row the user can never see.
  const [occurredOn, setOccurredOn] = useState(localDayKey());
  // R2C-16: the amount had no ceiling. 25 digits went out as `1e+25` (HTTP 400, and the
  // retry sent the same 400); 16-18 digits were stored rounded. parseLedgerAmount keeps
  // digits only and refuses anything above MAX_LEDGER_KRW, so the add button stays off
  // and the reason is shown under the field instead of a generic "try again".
  const amountParsed = parseLedgerAmount(amount);
  const amountNum = amountParsed.kind === "ok" ? amountParsed.value : 0;
  const amountTooLarge = amountParsed.kind === "tooLarge";
  const canAdd = !busy && amountParsed.kind === "ok";

  const onAddEntry = async () => {
    if (!userId || !canAdd) return;
    setBusy(true);
    setSaveErr(false);
    try {
      await createLedgerEntry(userId, {
        occurred_on: occurredOn,
        kind,
        amount_krw: amountNum,
        category: category.trim() || (ko ? "기타" : "Other"),
      });
      setAmount("");
      setCategory("");
      setOccurredOn(localDayKey());
      entries.reload();
    } catch {
      setSaveErr(true);
    } finally {
      setBusy(false);
    }
  };

  const onDeleteEntry = async (id: string) => {
    if (!userId || busy) return;
    setBusy(true);
    setSaveErr(false);
    try {
      await deleteLedgerEntry(userId, id);
      entries.reload();
    } catch {
      setSaveErr(true);
    } finally {
      setBusy(false);
    }
  };
  // R2C-16: ✕ deleted the row on the first tap, with no confirm and no undo. The first
  // tap now only arms the row; the second tap on the same row deletes it.
  const delEntry = useTwoTapDelete((id) => void onDeleteEntry(id));

  return (
    <OpsFrame title={c.monthCheck} bubble={`${c.left} ${summary.net.toLocaleString()}`} tip={c.record}>
      {saveErr ? <SaveErrorBanner text={c.saveFailed} /> : null}
      <View style={styles.ledgerCard}>
        <View style={styles.ledgerRow}>
          <Text variant="body" style={styles.ledgerStat}>
            {c.income} {summary.income.toLocaleString()}
          </Text>
          <Text variant="body" style={styles.ledgerStat}>
            {c.expense} {summary.expense.toLocaleString()}
          </Text>
          <Text variant="body" style={[styles.ledgerStat, { color: deepSpace.mint }]}>
            {c.left} {summary.net.toLocaleString()}
          </Text>
        </View>
        {trend ? (
          <View style={styles.trendRow}>
            <MetaChip label={trend} color={deepSpace.warning} />
          </View>
        ) : null}
      </View>

      {/* entry form — real amount + category, not a placeholder row */}
      <View style={styles.ledgerForm}>
        <View style={styles.kindToggle}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: kind === "expense" }}
            onPress={() => setKind("expense")}
            style={[styles.kindBtn, kind === "expense" && styles.kindBtnOn]}
          >
            <Text variant="caption" style={[styles.kindTxt, kind === "expense" && styles.kindTxtOn]}>{c.expense}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: kind === "income" }}
            onPress={() => setKind("income")}
            style={[styles.kindBtn, kind === "income" && styles.kindBtnOn]}
          >
            <Text variant="caption" style={[styles.kindTxt, kind === "income" && styles.kindTxtOn]}>{c.income}</Text>
          </Pressable>
        </View>
        {/* Clamped to the month this screen shows: the list + summary are strictly
            `month`, so a row dated outside it would vanish on save. Cross-month
            backdating needs month navigation first. */}
        <DateField
          value={occurredOn}
          onChange={setOccurredOn}
          label={c.entryDate}
          minDate={`${month}-01`}
          maxDate={localDayKey()}
        />
        <View style={styles.searchRow}>
          {/* No maxLength here: it counts separators too, so 13 cut a pasted
              "1,000,000,000,000" to "1,000,000,000" and saved 1,000x less (gate S-01 /
              BL-01). parseLedgerAmount reads the whole string and is the only ceiling. */}
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder={c.amountPlaceholder}
            placeholderTextColor={deepSpace.textLo}
            style={[styles.searchInput, styles.amountInput]}
            keyboardType="number-pad"
            returnKeyType="next"
            accessibilityLabel={c.amountPlaceholder}
          />
          <TextInput
            value={category}
            onChangeText={setCategory}
            onSubmitEditing={() => void onAddEntry()}
            placeholder={c.categoryPlaceholder}
            placeholderTextColor={deepSpace.textLo}
            style={styles.searchInput}
            returnKeyType="done"
            accessibilityLabel={c.categoryPlaceholder}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => void onAddEntry()}
            disabled={!canAdd}
            style={[styles.addBtn, !canAdd && styles.addBtnOff]}
          >
            <Text variant="caption" style={[styles.addBtnTxt, !canAdd && styles.addBtnTxtOff]}>{c.addEntry}</Text>
          </Pressable>
        </View>
        {amountTooLarge ? (
          <Text variant="caption" style={styles.fieldErr} accessibilityLiveRegion="polite">
            {t("toolScreens.ledger.amountTooLarge", { max: MAX_LEDGER_KRW.toLocaleString() })}
          </Text>
        ) : null}
      </View>

      {entries.status === "loading" ? (
        <ToolLoading />
      ) : entries.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={entries.reload} />
      ) : summary.byCategory.length === 0 ? (
        <OpsState variant="empty" title={t("toolScreens.ledger.emptyTitle")} body={t("toolScreens.ledger.emptyBody")} />
      ) : (
        <View style={styles.section}>
          <Text variant="caption" pixelEn style={styles.pixelLabel}>{c.byCategory}</Text>
          {summary.byCategory.map((cat) => (
            <View key={cat.category} style={{ marginBottom: 10 }}>
              <View style={styles.catRow}>
                <Text variant="body" style={styles.catName}>{cat.category}</Text>
                <Text variant="body" style={styles.catName}>{cat.total.toLocaleString()}</Text>
              </View>
              <ProgressBar value={cat.total / maxCat} />
            </View>
          ))}
        </View>
      )}

      {/* individual entries, each deletable -- the other half of "can't use it as a
          ledger": before this there was no way to remove a wrong row. */}
      {(entries.data ?? []).length > 0 ? (
        <View style={styles.section}>
          <Text variant="caption" pixelEn style={styles.pixelLabel}>{c.entriesLabel}</Text>
          {(entries.data ?? []).map((e) => (
            <View key={e.id} style={styles.entryRow}>
              {/* MM-DD: rows are now backdatable, so the day has to be visible. */}
              <Text variant="body" style={styles.entryDay}>
                {e.occurred_on.slice(5)}
              </Text>
              <Text variant="body" style={styles.entryCat} numberOfLines={1}>
                {e.category}
              </Text>
              <Text variant="body" style={[styles.entryAmt, e.kind === "income" && { color: deepSpace.mint }]}>
                {e.kind === "expense" ? "-" : "+"}{e.amount_krw.toLocaleString()}
              </Text>
              {delEntry.armedId === e.id ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("toolScreens.delete.confirmA11y", { name: e.category })}
                  onPress={() => delEntry.press(e.id)}
                  disabled={busy}
                  hitSlop={8}
                >
                  <OpsStatusChip tone="danger" label={t("toolScreens.delete.confirm")} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${e.category} ${c.deleteEntry}`}
                  onPress={() => delEntry.press(e.id)}
                  disabled={busy}
                  hitSlop={8}
                  style={styles.entryDel}
                >
                  <RNText style={styles.entryDelTxt}>✕</RNText>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {/* R2C-11: this note used to claim other currencies were converted for you. The form
          takes won only, ops_ledger has no currency column and nothing calls
          lib/finance/fx.ts, so the note now states what the screen actually does. */}
      <Text variant="subtle" style={styles.footNote}>{t("toolScreens.ledger.currencyNote")}</Text>
    </OpsFrame>
  );
}

// --- (5) Side project · github -----------------------------------------

export function SideProjectScreen({ userId }: { userId: string }) {
  type GithubError = "rate" | "storage-read" | "storage-write" | null;

  const c = useOpsCopy();
  const [username, setUsername] = useState("");
  const [pushes, setPushes] = useState<PushActivity[] | null>(null);
  const [githubError, setGithubError] = useState<GithubError>(null);
  const [storageLoadAttempt, setStorageLoadAttempt] = useState(0);

  const connect = async (handle: string) => {
    setGithubError(null);
    try {
      setPushes(await fetchPushActivity(handle));
    } catch {
      setGithubError("rate");
      setPushes(null);
    }
  };

  // Owner-scoped persistence prevents one account from restoring another's handle.
  useEffect(() => {
    let alive = true;
    void getGithubUsername(userId).then((saved) => {
      if (alive && saved) {
        setUsername(saved);
        void connect(saved);
      }
    }).catch(() => {
      if (alive) {
        setGithubError("storage-read");
        setPushes(null);
      }
    });
    return () => {
      alive = false;
    };
  }, [userId, storageLoadAttempt]);

  const retryStorageRead = () => {
    setGithubError(null);
    setStorageLoadAttempt((attempt) => attempt + 1);
  };

  const onConnect = async () => {
    if (githubError === "storage-read") {
      retryStorageRead();
      return;
    }

    setGithubError(null);
    try {
      await setGithubUsername(userId, username);
    } catch {
      setGithubError("storage-write");
      setPushes(null);
      return;
    }
    await connect(username);
  };
  const summary = summarizeGithubActivity(pushes ?? []);
  // Commit heatmap: per-day commit counts for the last 14 days, computed from the
  // pushes the helper already returns (atIso + commitCount) — no new plumbing.
  const heatmap = useMemo(() => buildCommitHeatmap(pushes ?? []), [pushes]);

  return (
    <OpsFrame title={c.sideProject} bubble={c.sideProject} tip={c.unlinkedBody}>
      <View style={styles.searchRow}>
        <TextInput
          value={username}
          onChangeText={setUsername}
          onSubmitEditing={onConnect}
          placeholder={c.githubHandle}
          placeholderTextColor={deepSpace.textLo}
          style={styles.searchInput}
          autoCapitalize="none"
          returnKeyType="done"
        />
      </View>

      {githubError ? (
        <OpsState
          variant={githubError === "rate" ? "rate" : "error"}
          title={githubError === "storage-read" ? c.errorTitle : c.rateTitle}
          body={githubError === "rate" ? c.rateBody : githubError === "storage-write" ? c.saveFailed : c.errorBody}
          ctaLabel={c.retry}
          onCta={githubError === "storage-read" ? retryStorageRead : onConnect}
        />
      ) : pushes === null ? (
        <OpsState variant="unlinked" title={c.unlinkedTitle} body={c.unlinkedBody} ctaLabel={c.unlinkedCta} onCta={onConnect} />
      ) : (
        <>
          <View style={styles.ghCard}>
            <Text variant="caption" pixelEn style={styles.pixelLabel}>{c.thisWeek}</Text>
            <Text variant="heading" style={styles.ghBig}>
              {summary.commits} <Text variant="subtle" style={styles.ghBigUnit}>{c.commits}</Text>
            </Text>
            <View style={styles.ghChips}>
              <MetaChip label={`${summary.activeDays}d`} />
              <MetaChip label={`${summary.repos.length} ${c.repos}`} />
            </View>
            <View style={styles.heatRow}>
              {heatmap.map((d) => (
                <View
                  key={d.day}
                  style={[
                    styles.heatCell,
                    d.count === 0
                      ? styles.heatCell0
                      : d.count < 3
                        ? styles.heatCell1
                        : d.count < 6
                          ? styles.heatCell2
                          : styles.heatCell3,
                  ]}
                />
              ))}
            </View>
          </View>
          {summary.repos.map((repo) => (
            <View key={repo} style={styles.repoRow}>
              <View style={[styles.dotSm, { backgroundColor: deepSpace.soul }]} />
              <Text variant="heading" style={styles.repoName}>{repo}</Text>
            </View>
          ))}
        </>
      )}
    </OpsFrame>
  );
}

// --- (6) Meals · foods -------------------------------------------------

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Fixed meal ideas (ops bundle toolScreens.meals.ideas.*), after the PIXEL-CLAY sheet's list. */
const MEAL_IDEA_KEYS = ["i1", "i2", "i3", "i4", "i5", "i6"] as const;

type FoodLookup = { kind: "idle" } | { kind: "busy" } | { kind: "done"; items: FoodNutrition[] } | { kind: "failed" };
/** Session cache for food lookups, so reopening a cell never spends quota twice. */
const FOOD_LOOKUP_CACHE = new Map<string, FoodNutrition[]>();
const FOOD_LOOKUP_CACHE_MAX = 30;

export function MealsScreen() {
  const c = useOpsCopy();
  const { userId } = useAuth();
  // A failed WRITE. The empty catches below used to claim it was "surfaced on reload",
  // but reload() sits INSIDE the try -- so on the failure path it never ran, and the tap
  // just silently did nothing.
  const [saveErr, setSaveErr] = useState(false);
  const { t, i18n } = useTranslation("ops");
  const ko = i18n.language?.toLowerCase().startsWith("ko");
  const dayLabels = ko ? DAYS : DAYS_EN;
  const thisWeek = weekStartKey();

  const [weekStart, setWeekStart] = useState(thisWeek);
  // `day` and `current` ride along so the sheet can say which cell it is editing
  // (R2C-15) and so emptying a filled cell clears it instead of keeping it (R2C-07).
  // `session` is new on every open (gate BL-02 / BL-03): an armed clear and a late write
  // belong to the opening they started in, never to a later one.
  const [pending, setPending] = useState<{ session: number; date: string; slot: MealSlot; day: string; current: string | null } | null>(null);
  const sheetSeq = useRef(0);
  // One meal write per cell at a time (gate BL-03): save and clear take the cell's lock
  // (mealWriteLock), so a clear can no longer race an earlier save whose UPSERT lands after
  // the DELETE. The lock lives outside this component (gate r3), so the route and the
  // phone hub, or this screen remounted mid-write, share it. `mealWrites` counts this
  // screen's own writes in flight; while any runs, the sheet takes no input (gate BL-07).
  const [mealWrites, setMealWrites] = useState(0);
  const mealWriting = mealWrites > 0;
  const [draft, setDraft] = useState("");
  const [lookup, setLookup] = useState<FoodLookup>({ kind: "idle" });

  const week = useAsync<MealEntry[]>(
    () => (userId ? listWeek(userId, weekStart) : Promise.resolve([])),
    [userId, weekStart],
  );
  const grid: DayPlan[] = useMemo(() => buildWeekGrid(weekStart, week.data ?? []), [weekStart, week.data]);

  const shiftWeek = (deltaDays: number) => {
    const [y, m, d] = weekStart.split("-").map(Number);
    const next = new Date(y, m - 1, d + deltaDays);
    setWeekStart(weekStartKey(next));
  };

  // R2C-15: opening a cell used to search the food DB for a hardcoded "닭"/"chicken"
  // every time, spending the user's daily public-data quota for the same four chips.
  // Opening a cell now makes no request; the chips are a fixed idea list, and the food
  // DB is asked only when the user taps "look up" for what they typed.
  const openCell = (date: string, slot: MealSlot, current: MealEntry | null, day: string) => {
    sheetSeq.current += 1;
    setPending({ session: sheetSeq.current, date, slot, day, current: current?.title ?? null });
    setDraft(current?.title ?? "");
    setLookup({ kind: "idle" });
  };

  // The food DB (MFDS) is searched by its Korean food name (FOOD_NM_KR), so the lookup
  // is offered on the Korean screen only. Answers are kept for the session.
  const onLookUp = async () => {
    const query = draft.trim();
    if (!ko || query.length === 0) return;
    const cached = FOOD_LOOKUP_CACHE.get(query);
    if (cached) {
      setLookup({ kind: "done", items: cached });
      return;
    }
    setLookup({ kind: "busy" });
    try {
      const items = await searchFoods(query);
      if (FOOD_LOOKUP_CACHE.size >= FOOD_LOOKUP_CACHE_MAX) {
        const oldest = FOOD_LOOKUP_CACHE.keys().next().value;
        if (oldest !== undefined) FOOD_LOOKUP_CACHE.delete(oldest);
      }
      FOOD_LOOKUP_CACHE.set(query, items);
      setLookup({ kind: "done", items });
    } catch {
      setLookup({ kind: "failed" });
    }
  };

  // Save and clear both go through here (gate BL-03): one write per cell at a time under
  // the cell's shared lock, and the sheet is off while it runs. A write asked for meanwhile
  // is refused, not raced. When it settles, only the sheet it started from closes.
  const writeMeal = async (sheet: NonNullable<typeof pending>, write: () => Promise<unknown>) => {
    if (!userId) return;
    const outcome = await runExclusive(mealWriteLock(userId, sheet.date, sheet.slot), async () => {
      setMealWrites((n) => n + 1);
      setSaveErr(false);
      try {
        await write();
      } finally {
        setMealWrites((n) => n - 1);
      }
    });
    if (outcome === "busy") return;
    // A failed write says so (it used to be swallowed, with reload() never reached).
    if (outcome === "done") week.reload();
    else setSaveErr(true);
    setPending((open) => sheetAfterWrite(open, sheet.session));
  };

  const saveCell = async () => {
    if (!userId || !pending) {
      setPending(null);
      return;
    }
    // R2C-07: an emptied draft used to just close the sheet, so the old meal stayed.
    const action = mealSaveAction(draft, pending.current);
    if (action === "close") {
      setPending(null);
      return;
    }
    const sheet = pending;
    const title = draft.trim();
    await writeMeal(sheet, () =>
      action === "clear" ? clearMeal(userId, sheet.date, sheet.slot) : setMeal(userId, sheet.date, sheet.slot, title),
    );
  };

  // Gate BL-02: "clear this meal" took one tap. It now takes two in the same sheet opening
  // (mealClearArmKey); the arm never carries over to another cell or a reopened sheet.
  const clearArm = useTwoTapDelete((key) => {
    if (!userId || !pending || mealClearArmKey(pending) !== key) return;
    const sheet = pending;
    void writeMeal(sheet, () => clearMeal(userId, sheet.date, sheet.slot));
  });
  const clearArmed = pending !== null && clearArm.armedId === mealClearArmKey(pending);

  // Food names can repeat in the DB answer; a chip list keyed by name must not.
  const ideaChips: string[] =
    lookup.kind === "done" && lookup.items.length > 0
      ? [...new Set(lookup.items.map((f) => f.name))].slice(0, 4)
      : MEAL_IDEA_KEYS.map((k) => t(`toolScreens.meals.ideas.${k}`));

  return (
    <OpsFrame title={c.weeklyMeals} bubble={c.weeklyMeals} tip={c.whatToEatNow}>
      {saveErr ? <SaveErrorBanner text={c.saveFailed} /> : null}
      <View style={styles.weekNav}>
        <Pressable onPress={() => shiftWeek(-7)} hitSlop={10} style={styles.weekArrow} accessibilityRole="button" accessibilityLabel={c.prevWeek}>
          <RNText style={styles.weekArrowText}>‹</RNText>
        </Pressable>
        <Text variant="caption" style={[styles.weekLabel, weekStart === thisWeek ? styles.weekLabelNow : null]}>{weekStart}</Text>
        <Pressable onPress={() => shiftWeek(7)} hitSlop={10} style={styles.weekArrow} accessibilityRole="button" accessibilityLabel={c.nextWeek}>
          <RNText style={styles.weekArrowText}>›</RNText>
        </Pressable>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridHeaderRow}>
          <View style={styles.gridDayCell} />
          <Text variant="subtle" style={styles.gridHeadCell}>{c.breakfast}</Text>
          <Text variant="subtle" style={styles.gridHeadCell}>{c.lunch}</Text>
          <Text variant="subtle" style={styles.gridHeadCell}>{c.dinner}</Text>
        </View>
        {grid.map((day, i) => (
          <View key={day.date} style={styles.gridRow}>
            <Text variant="caption" style={styles.gridDay}>{dayLabels[i]}</Text>
            {MEAL_SLOTS.map((slot) => {
              const cell = day[slot];
              return (
                <Pressable
                  key={slot}
                  onPress={() => openCell(day.date, slot, cell, dayLabels[i] ?? "")}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.date} ${dayLabels[i]} ${c[slot]}: ${cell?.title ?? c.planMeal}`}
                  hitSlop={4}
                  style={[
                    styles.gridCell,
                    cell ? styles.gridCellFilled : null,
                    pending?.date === day.date && pending.slot === slot ? styles.gridCellOpen : null,
                  ]}
                >
                  <Text variant="subtle" style={cell ? styles.gridCellText : styles.gridPlus} numberOfLines={1}>
                    {cell ? cell.title : "＋"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Text variant="subtle" style={styles.footNote}>{c.nutritionNote}</Text>

      <Modal visible={pending !== null} transparent animationType="slide" onRequestClose={() => setPending(null)}>
        <Pressable style={styles.mealBackdrop} onPress={() => setPending(null)} />
        <View style={styles.mealSheet}>
          <View style={styles.sheetGrip} />
          <Text variant="heading" style={styles.mealSheetTitle}>{c.planMeal}</Text>
          {/* R2C-15: the sheet never said which day and meal it was editing. */}
          {pending ? (
            <Text variant="subtle" style={styles.mealSheetSub}>
              {t("toolScreens.meals.sheetSubtitle", { day: pending.day, date: pending.date, slot: c[pending.slot] })}
            </Text>
          ) : null}
          {/* Gate BL-07: while a meal write runs, the input, the idea chips and the keyboard's
              done take nothing. A second draft typed then used to be refused as busy, and the
              first write's completion closed the sheet over it, so it was lost unsaved. */}
          <View style={styles.searchRow}>
            <TextInput
              value={draft}
              editable={!mealWriting}
              onChangeText={(v) => {
                if (mealWriting) return;
                setDraft(v);
                if (lookup.kind !== "idle") setLookup({ kind: "idle" });
              }}
              placeholder={t("toolScreens.meals.placeholder")}
              placeholderTextColor={deepSpace.textLo}
              style={styles.searchInput}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!mealWriting) void saveCell();
              }}
              accessibilityLabel={c.whatToEatNow}
              accessibilityState={{ disabled: mealWriting }}
            />
            {ko && draft.trim().length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => void onLookUp()} disabled={lookup.kind === "busy"} hitSlop={6} style={styles.ideaChip}>
                <Text variant="body" style={styles.ideaChipText}>{t("toolScreens.meals.lookUp")}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text variant="caption" style={styles.mealIdeasLabel}>{c.mealIdeas}</Text>
          <View style={styles.ideaChips}>
            {ideaChips.map((name) => (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ disabled: mealWriting }}
                disabled={mealWriting}
                onPress={() => {
                  if (!mealWriting) setDraft(name);
                }}
                hitSlop={4}
                style={styles.ideaChip}
              >
                <Text variant="body" style={styles.ideaChipText}>{name}</Text>
              </Pressable>
            ))}
          </View>
          {lookup.kind === "busy" ? <Text variant="caption" style={styles.toolNote}>{t("toolScreens.loading")}</Text> : null}
          {lookup.kind === "failed" || (lookup.kind === "done" && lookup.items.length === 0) ? (
            <Text variant="caption" style={styles.toolNote} accessibilityLiveRegion="polite">
              {lookup.kind === "failed" ? t("toolScreens.meals.lookUpFailed") : t("toolScreens.meals.lookUpNone")}
            </Text>
          ) : null}
          {pending?.current ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: mealWriting }}
              disabled={mealWriting}
              onPress={() => clearArm.press(mealClearArmKey(pending))}
              hitSlop={6}
              style={[styles.mealClear, clearArmed && styles.mealClearArmed]}
            >
              <Text variant="caption" style={[styles.mealClearText, clearArmed && styles.mealClearTextArmed]}>
                {clearArmed ? t("toolScreens.delete.confirm") : t("toolScreens.meals.clear")}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: mealWriting }}
            disabled={mealWriting}
            onPress={() => void saveCell()}
            hitSlop={6}
            style={[styles.mealSave, mealWriting && styles.addBtnOff]}
          >
            <Text variant="caption" style={[styles.mealSaveText, mealWriting && styles.addBtnTxtOff]}>{c.save}</Text>
          </Pressable>
        </View>
      </Modal>
    </OpsFrame>
  );
}

// --- Scheduled reminders (④) -------------------------------------------

function reminderSchedule(r: OpsRoutine, c: ReturnType<typeof useOpsCopy>): string {
  const word = r.recurrence === "daily" ? c.daily : r.recurrence === "weekly" ? c.weekly : c.once;
  return r.reminder_time ? `${word} ${r.reminder_time}` : word;
}

// Rich reminder row (sb-more RemindersScreen): leading icon box, title, a time
// pill + repeat, a source·star chip, and the on/off switch. deepSpace tokens only.
type ReminderVM = {
  key: string;
  title: string;
  when: string;
  repeat: string;
  src: string;
  star: string; // "" hides the "· {star} 별" suffix (real routines)
  on: boolean;
  interactive: boolean;
};

function ReminderCard({ vm, starWord, onToggle }: { vm: ReminderVM; starWord: string; onToggle?: () => void }) {
  const source = vm.star ? `${vm.src} · ${vm.star} ${starWord}` : vm.src;
  return (
    <MdCard variant="outlined" style={[remStyles.card, !vm.on && remStyles.cardOff]}>
      <View style={remStyles.row}>
        <View style={remStyles.iconBox}>
          <View style={remStyles.iconDots}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={remStyles.iconDot} />
            ))}
          </View>
        </View>
        <View style={remStyles.mid}>
          <Text variant="heading" style={remStyles.title}>{vm.title}</Text>
          <View style={remStyles.metaRow}>
            <View style={remStyles.timePill}>
              <Text variant="caption" style={remStyles.timePillText}>{vm.when}</Text>
            </View>
            <View style={remStyles.metaDot} />
            <Text variant="caption" style={remStyles.repeat}>{vm.repeat}</Text>
          </View>
          <View style={remStyles.srcChip}>
            <View style={remStyles.srcDot} />
            <Text variant="caption" style={remStyles.srcText}>{source}</Text>
          </View>
        </View>
        {onToggle ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: vm.on }}
            onPress={onToggle}
            hitSlop={10}
            style={[remStyles.toggle, vm.on ? remStyles.toggleOn : remStyles.toggleOff]}
          >
            <View style={[remStyles.knob, vm.on ? remStyles.knobOn : remStyles.knobOff]} />
          </Pressable>
        ) : null}
      </View>
    </MdCard>
  );
}

export function RemindersScreen({ onOpenAssistant }: { onOpenAssistant?: () => void } = {}) {
  const c = useOpsCopy();
  const { userId } = useAuth();
  const supported = remindersSupported();
  const routines = useAsync<OpsRoutine[]>(
    () => (userId ? listActiveRoutines(userId) : Promise.resolve([])),
    [userId],
  );
  const withReminder = useMemo(
    () => (routines.data ?? []).filter((r) => r.reminder_time),
    [routines.data],
  );
  // (No fallback demo reminders — a zero-reminder account shows an honest empty
  // list + the "add from assistant" footer, never fake toggled demo rows.)

  // Per-routine on/off — PERSISTED device-local via lib/ops/reminders
  // (AsyncStorage disabled-set; reminders never leave the device, so their
  // on/off lives device-local, not in the owner-scoped ops_routines table).
  // Default = ON: every reminder is on unless explicitly toggled off.
  const [states, setStates] = useState<Record<string, boolean>>({});
  // Routines the user tried to enable but the OS permission was denied — they
  // render the row's "권한 필요" state instead of crashing or silently failing.
  const [denied, setDenied] = useState<Record<string, true>>({});

  // Hydrate on/off from the persisted flag AND the real OS schedule. ON now
  // means "an OS notification is actually scheduled" — the old flag-only state
  // showed ON by default for rows that had never been scheduled at all (the
  // audit's /reminders mismatch: a switch over notifications that don't exist).
  useEffect(() => {
    if (!userId) {
      setStates({});
      return;
    }
    let alive = true;
    void Promise.all([
      getReminderStates(userId, withReminder.map((r) => r.id)),
      getScheduledRoutineIds(userId),
    ]).then(([flags, scheduled]) => {
      if (!alive) return;
      const next: Record<string, boolean> = {};
      for (const r of withReminder) next[r.id] = flags[r.id] !== false && scheduled.has(r.id);
      setStates(next);
    });
    return () => {
      alive = false;
    };
  }, [userId, withReminder]);

  // Build the schedulable event for a routine (HH:MM local + recurrence). A
  // weekly routine is anchored to its weekday; a one-shot in the past rolls to
  // tomorrow so the OS scheduler never gets an unfireable date.
  const eventForRoutine = (r: OpsRoutine): OpsEventInput | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec(r.reminder_time ?? "");
    if (!m) return null;
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (r.recurrence === "weekly" && r.weekday != null) {
      d.setDate(d.getDate() + ((r.weekday - d.getDay() + 7) % 7));
    } else if (r.recurrence === "none" && d.getTime() <= Date.now()) {
      d.setDate(d.getDate() + 1);
    }
    return {
      title: r.title,
      description: r.reason ?? undefined,
      startsAtIso: d.toISOString(),
      ...(r.recurrence === "daily" || r.recurrence === "weekly" ? { recurrence: r.recurrence } : {}),
    };
  };

  const toggle = async (r: OpsRoutine) => {
    if (!userId) return;
    const id = r.id;
    const currentlyOn = states[id] === true;
    if (currentlyOn) {
      // Cancels the scheduled OS notification too (not just the flag).
      await disableReminder(userId, id);
      setStates((prev) => ({ ...prev, [id]: false }));
      setDenied((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    // Enabling: ask for the OS permission first (propose->ratify — the tap is
    // the user action), then actually SCHEDULE under the routine's identifier.
    // Denied → keep it off and show "권한 필요".
    const event = eventForRoutine(r);
    if (!event) return; // unparsable reminder_time: nothing real to schedule
    const ok = await enableReminder(userId, id, event);
    if (ok) {
      setStates((prev) => ({ ...prev, [id]: true }));
      setDenied((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      setDenied((prev) => ({ ...prev, [id]: true }));
    }
  };

  // Real routines when present; otherwise the sb-more demo reminders so the
  // list state renders (QA account has no scheduled routines).
  const hasReal = withReminder.length > 0;
  const rows: { vm: ReminderVM; onToggle?: () => void }[] = hasReal
    ? withReminder.map((r) => {
        const isDenied = !!denied[r.id];
        // ON = actually scheduled (states is hydrated against the OS schedule).
        const on = supported && !isDenied && states[r.id] === true;
        const repeat = r.recurrence === "daily" ? c.daily : r.recurrence === "weekly" ? c.weekly : c.once;
        return {
          vm: { key: r.id, title: r.title, when: reminderSchedule(r, c), repeat, src: c.assistantSource, star: "", on, interactive: supported },
          onToggle: supported ? () => void toggle(r) : undefined,
        };
      })
    : [];
  const onCount = rows.filter((r) => r.vm.on).length;
  const countLabel = c.remindersCountTemplate.replace("{n}", String(onCount));

  return (
    <OpsFrame
      title={c.scheduledReminders}
      bubble={c.scheduledReminders}
      tip={c.remindersTip}
      footer={
        <MdButton variant="tonal" label={c.addFromAssistant} onPress={onOpenAssistant ?? (() => router.push("/ops"))} />
      }
    >
      {routines.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={routines.reload} />
      ) : (
        <>
          {/* info header (sb-more): schedule icon + count + device-only note */}
          <MdCard variant="filled" style={remStyles.info}>
            <View style={remStyles.infoIcon}>
              <View style={remStyles.infoIconHand} />
            </View>
            <View style={remStyles.infoBody}>
              <Text variant="heading" style={remStyles.infoTitle}>{countLabel}</Text>
              <Text variant="caption" style={remStyles.infoNote}>{c.remindersDeviceNote}</Text>
            </View>
          </MdCard>

          <View style={remStyles.list}>
            {rows.map((r) => (
              <ReminderCard key={r.vm.key} vm={r.vm} starWord={c.starWord} onToggle={r.onToggle} />
            ))}
          </View>
        </>
      )}
    </OpsFrame>
  );
}

const remStyles = StyleSheet.create({
  info: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoIcon: {
    width: 24,
    height: 24,
    borderRadius: m3.shape.none,
    borderWidth: 1.5,
    borderColor: deepSpace.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  infoIconHand: { width: 2, height: 8, borderRadius: m3.shape.none, backgroundColor: deepSpace.accent },
  infoBody: { flex: 1 },
  infoTitle: { fontSize: 15, color: deepSpace.textHi },
  infoNote: { fontSize: 12, color: deepSpace.textMid, marginTop: 2 },

  list: { gap: 10, marginTop: 4 },
  card: { padding: 14 },
  cardOff: { opacity: 0.55 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: m3.shape.none,
    backgroundColor: opsAlpha(deepSpace.accent, 0.16),
    alignItems: "center",
    justifyContent: "center",
  },
  iconDots: { flexDirection: "row", gap: 3 },
  iconDot: { width: 5, height: 5, borderRadius: m3.shape.none, backgroundColor: deepSpace.accentSoft },
  mid: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, color: deepSpace.textHi },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  timePill: {
    borderRadius: m3.shape.none,
    paddingHorizontal: 9,
    paddingVertical: 3,
    backgroundColor: opsAlpha(deepSpace.accent, 0.16),
  },
  timePillText: { fontSize: 12, color: deepSpace.accentBright },
  metaDot: { width: 3, height: 3, borderRadius: m3.shape.none, backgroundColor: deepSpace.textLo },
  repeat: { fontSize: 12, color: deepSpace.textMid },
  srcChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: m3.shape.none,
    backgroundColor: deepSpace.cardPressed,
  },
  srcDot: { width: 6, height: 6, borderRadius: m3.shape.none, backgroundColor: deepSpace.soul },
  srcText: { fontSize: 11, color: deepSpace.textMid },
  toggle: { width: 44, height: 26, borderRadius: m3.shape.none, justifyContent: "center", paddingHorizontal: 3 },
  // Canon reminder toggles are blue/primary (accent), not mint — matches the
  // settings + iden M3 switches (design canon 09-settings / 23-iden / 26-reminders).
  toggleOn: { backgroundColor: deepSpace.accent, alignItems: "flex-end" },
  toggleOff: { backgroundColor: deepSpace.cardPressed, alignItems: "flex-start" },
  knob: { width: 20, height: 20, borderRadius: m3.shape.none },
  knobOn: { backgroundColor: deepSpace.onAccent },
  knobOff: { backgroundColor: deepSpace.textLo },
});

// --- screen-local styles (deepSpace tokens only) -----------------------

const styles = StyleSheet.create({
  saveErrBanner: {
    borderRadius: m3.shape.small,
    backgroundColor: opsAlpha(deepSpace.danger, 0.12),
    paddingVertical: deepSpaceSpacing.xs,
    paddingHorizontal: deepSpaceSpacing.sm,
    marginBottom: deepSpaceSpacing.xs,
  },
  saveErrText: { color: deepSpace.danger },
  searchRow: { flexDirection: "row", gap: deepSpaceSpacing.sm },
  // Shrinks to 64px inside the dashboard phone (~180px column at 320x568); 118px
  // otherwise. `flex: 0` would reach RN-web as CSS `0 1 0%` and ignore the width.
  amountInput: { flexGrow: 0, flexShrink: 1, flexBasis: 118, minWidth: 64 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: m3.shape.medium,
    paddingHorizontal: deepSpaceSpacing.md,
    color: deepSpace.textHi,
    fontFamily: fontFamilies.sans,
    fontSize: 14,
  },
  section: { gap: 8 },
  pixelLabel: { fontSize: 8, letterSpacing: 1, color: deepSpace.textLo },
  dotSm: { width: 7, height: 7, borderRadius: m3.shape.none },

  hero: {
    flexDirection: "row",
    gap: 13,
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: m3.shape.large,
    backgroundColor: deepSpace.card,
  },
  cover: {
    width: 62,
    height: 88,
    borderRadius: m3.shape.small,
    backgroundColor: deepSpace.bgMid,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    justifyContent: "flex-end",
    padding: 6,
  },
  coverText: { fontSize: 8, color: deepSpace.textLo },
  heroBody: { flex: 1 },
  heroTitle: { fontSize: 15, color: deepSpace.textHi, marginTop: 4 },
  heroAuthor: { fontSize: 12, color: deepSpace.textLo, marginTop: 3 },
  heroMeta: { fontSize: 12, color: deepSpace.textLo, marginTop: 5 },

  bookRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.medium,
    backgroundColor: deepSpace.card,
  },
  bookTitle: { flex: 1, fontSize: 14, color: deepSpace.textHi },
  bookDone: { flex: 1, fontSize: 14, color: deepSpace.textMid },
  bookAdd: { fontSize: 12, color: deepSpace.mint },
  bookOnShelf: { fontSize: 12, color: deepSpace.textLo },
  toolNote: { fontSize: 13, color: deepSpace.textMid },
  fieldErr: { fontSize: 12, color: deepSpace.danger },
  chipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  pageEdit: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },

  progressHeader: { gap: 6 },
  progressLabel: { fontSize: 12, color: deepSpace.textMuted },

  addRow: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    backgroundColor: deepSpace.card,
  },
  addRowText: { fontSize: 13, color: deepSpace.accentSoft },

  heatRow: { flexDirection: "row", gap: 3, marginTop: 2 },
  heatCell: { flex: 1, height: 12, borderRadius: m3.shape.small },
  heatCell0: { backgroundColor: deepSpace.card, borderWidth: 1, borderColor: deepSpace.cardLine },
  heatCell1: { backgroundColor: deepSpace.accentDim },
  heatCell2: { backgroundColor: deepSpace.accent },
  heatCell3: { backgroundColor: deepSpace.mint },

  msRow: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.medium,
    backgroundColor: deepSpace.card,
    gap: 6,
  },
  msTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  msTitle: { flex: 1, fontSize: 14, color: deepSpace.textHi },
  msTitlePress: { flex: 1 },
  msTitleInput: { flex: 1, minHeight: 40 },
  msNote: { fontSize: 12, color: deepSpace.textLo },
  msDue: { fontSize: 12, color: deepSpace.textLo },
  msDueOver: { color: deepSpace.danger },
  msDueEdit: { flexDirection: "row", alignItems: "center", gap: 8 },
  msDueField: { flex: 1 },
  dueField: { marginTop: deepSpaceSpacing.sm },

  ledgerCard: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: m3.shape.large,
    backgroundColor: deepSpace.card,
  },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  trendRow: { flexDirection: "row", marginTop: deepSpaceSpacing.sm },
  ledgerStat: { fontSize: 12, color: deepSpace.textMid, flexShrink: 1 },
  catRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  catName: { fontSize: 13, color: deepSpace.textMid },
  footNote: { fontSize: 12, color: deepSpace.textLo },
  ledgerForm: { gap: deepSpaceSpacing.sm, marginBottom: deepSpaceSpacing.sm },
  kindToggle: { flexDirection: "row", gap: deepSpaceSpacing.xs },
  kindBtn: {
    flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: m3.shape.medium,
  },
  kindBtnOn: { borderColor: deepSpace.accent, backgroundColor: opsAlpha(deepSpace.accent, 0.12) },
  kindTxt: { fontSize: 13, color: deepSpace.textLo },
  kindTxtOn: { color: deepSpace.accent },
  addBtn: {
    minHeight: 44, paddingHorizontal: deepSpaceSpacing.md, alignItems: "center", justifyContent: "center",
    borderRadius: m3.shape.medium, backgroundColor: deepSpace.accent,
  },
  // ⚠ 비활성은 **미리 합성한 색 한 쌍**이다(규칙 4). 바탕만 흐리게 하고 글자를
  //   그대로 두면 어두운 글자가 흐린 바탕 위에서 오히려 더 튄다.
  addBtnOff: { backgroundColor: ADD_OFF_BG },
  addBtnTxtOff: { color: ADD_OFF_FG },
  addBtnTxt: { fontSize: 14, color: deepSpace.bg, fontFamily: fontFamilies.sans },
  entryRow: {
    flexDirection: "row", alignItems: "center", gap: deepSpaceSpacing.sm,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: deepSpace.cardLine,
  },
  entryDay: { fontSize: 12, color: deepSpace.textLo, fontVariant: ["tabular-nums"] },
  entryCat: { flex: 1, fontSize: 13, color: deepSpace.textMid },
  entryAmt: { fontSize: 13, color: deepSpace.textHi, fontVariant: ["tabular-nums"] },
  entryDel: { padding: 4 },
  entryDelTxt: { fontSize: 15, color: deepSpace.textLo },

  ghCard: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: m3.shape.large,
    backgroundColor: deepSpace.card,
    gap: 8,
  },
  ghBig: { fontSize: 22, color: deepSpace.textHi },
  ghBigUnit: { fontSize: 12, color: deepSpace.textLo },
  ghChips: { flexDirection: "row", gap: 6 },
  repoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.medium,
    backgroundColor: deepSpace.card,
  },
  repoName: { flex: 1, fontSize: 14, color: deepSpace.textHi },

  quickMode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 48,
    paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    backgroundColor: deepSpace.mintBg,
    borderRadius: m3.shape.medium,
  },
  quickIcon: { fontSize: 15 },
  quickText: { flex: 1, fontFamily: fontFamilies.pixelKo, fontSize: 12, color: deepSpace.accentBright },
  quickTag: { fontSize: 12, color: deepSpace.mint },

  grid: { gap: 6 },
  gridHeaderRow: { flexDirection: "row", gap: 6 },
  gridRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  gridDayCell: { width: 28 },
  gridDay: { width: 28, fontSize: 12, color: deepSpace.textMid },
  gridHeadCell: { flex: 1, fontSize: 10, color: deepSpace.textLo, textAlign: "center" },
  gridCell: {
    flex: 1,
    minHeight: 44,
    borderRadius: m3.shape.small,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    alignItems: "center",
    justifyContent: "center",
  },
  gridPlus: { fontSize: 14, color: deepSpace.textLo },
  gridCellFilled: { borderColor: deepSpace.cardLineStrong, backgroundColor: deepSpace.cardPressed },
  gridCellOpen: { borderColor: deepSpace.accent },
  gridCellText: { fontSize: 9, color: deepSpace.accentSoft, paddingHorizontal: 3 },

  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: deepSpaceSpacing.md },
  weekArrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  weekArrowText: { fontSize: 22, color: deepSpace.accentBright },
  weekLabel: { fontSize: 13, color: deepSpace.textMuted },
  weekLabelNow: { color: deepSpace.mint },

  mealBackdrop: { flex: 1, backgroundColor: deepSpace.bgEdge, opacity: 0.6 },
  mealSheet: {
    backgroundColor: deepSpace.bgMid,
    borderTopWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderTopLeftRadius: deepSpaceRadii.phone,
    borderTopRightRadius: deepSpaceRadii.phone,
    padding: deepSpaceSpacing.lg,
    paddingBottom: deepSpaceSpacing.xl,
    gap: deepSpaceSpacing.sm,
  },
  sheetGrip: { width: 40, height: 4, borderRadius: m3.shape.none, backgroundColor: deepSpace.cardLineStrong, alignSelf: "center" },
  mealSheetTitle: { fontSize: 15, color: deepSpace.textHi },
  mealSheetSub: { fontSize: 12, color: deepSpace.textMid },
  mealIdeasLabel: { fontSize: 12, color: deepSpace.textLo, marginTop: 4 },
  mealClear: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
  },
  mealClearText: { fontSize: 14, color: deepSpace.textMid },
  // Armed: the next tap clears (gate BL-02). Same danger tone the delete chip uses.
  mealClearArmed: { borderColor: deepSpace.danger },
  mealClearTextArmed: { color: deepSpace.danger },
  ideaChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  ideaChip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.medium,
    backgroundColor: deepSpace.card,
  },
  ideaChipText: { fontSize: 13, color: deepSpace.accentSoft },
  mealSave: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: m3.shape.medium,
    backgroundColor: deepSpace.mint,
    marginTop: 4,
  },
  mealSaveText: { fontSize: 14, color: deepSpace.onMint },
});
