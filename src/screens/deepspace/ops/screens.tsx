// The 6 Ops/assistant domain screens (Claude Design ops-assistant.dc.html).
// Each assembles the shared kit (components/deepspace/ops) and renders/operates
// the already-built backing data libs. deepSpace.* tokens only, no auto-execution
// (every write is behind a user tap). Strings come from the bilingual ops copy.

import { useEffect, useMemo, useState, type DependencyList } from "react";
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text as RNText, TextInput, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
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
  OpsReminderRow,
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
import { buildChecklistShareText, buildGoogleCalendarUrl, type OpsEventInput } from "@/lib/ops/push";
import { searchBooks, type BookResult } from "@/lib/reading/books";
import { addToShelf, listShelf, readingProgress, type Shelf } from "@/lib/reading/shelf";
import {
  domainProgress,
  listMilestones,
  milestoneOverdue,
  type Milestone,
} from "@/lib/ops/milestones";
import { listEntriesForMonth, monthBucket, summarizeMonth } from "@/lib/finance/ledger";
import { fetchPushActivity, summarizeGithubActivity, type PushActivity } from "@/lib/projects/github";
import { searchFoods, type FoodNutrition } from "@/lib/nutrition/foods";
import {
  buildWeekGrid,
  listWeek,
  MEAL_SLOTS,
  setMeal,
  weekStartKey,
  type DayPlan,
  type MealEntry,
  type MealSlot,
} from "@/lib/nutrition/meal-plan";
import { listActiveRoutines, type OpsRoutine } from "@/lib/ops/routines";
import { remindersSupported } from "@/lib/ops/reminders";
import { getGithubUsername, setGithubUsername } from "@/lib/projects/github-link";
import { monthDelta, prevMonthKey } from "@/lib/finance/trend";
import { trendChip } from "@/lib/ops/grounding";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { status, data, reload: () => setNonce((n) => n + 1) };
}

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

// --- (1) Ops home / recommendations ------------------------------------

export function OpsHomeScreen() {
  const c = useOpsCopy();
  const { userId } = useAuth();
  const { i18n } = useTranslation();
  const locale = systemLocaleFor(i18n.language);
  const [group, setGroup] = useState<OpsGroupId>("body");
  const domain = domainsForGroup(group)[0];
  const [pushRec, setPushRec] = useState<OpsRecommendation | null>(null);

  const recs = useAsync<OpsRecommendation[]>(
    () =>
      userId
        ? recommendForDomain({ userId, locale, domainId: domain, domainLabel: EN_DOMAIN_LABEL[domain] })
        : Promise.resolve([]),
    [userId, domain, locale],
  );

  const tabs: DomainTab[] = OPS_GROUP_IDS.map((g) => ({ id: g, label: g, color: domainColor(g) }));

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
        icon: "🗓",
        label: c.googleCalendar,
        sub: c.googleCalendarSub,
        recommended: true,
        onPress: () => void Linking.openURL(gUrl),
      });
    }
    opts.push({
      key: "share",
      icon: "☑",
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
        onConfirm={() => setPushRec(null)}
        onClose={() => setPushRec(null)}
      />
    </OpsFrame>
  );
}

// --- (2) Reading · books -----------------------------------------------

export function ReadingScreen() {
  const c = useOpsCopy();
  const { userId } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<BookResult[]>([]);
  const shelf = useAsync<Shelf>(
    () => (userId ? listShelf(userId) : Promise.resolve({ want: [], reading: [], done: [] })),
    [userId],
  );
  const reading = shelf.data?.reading[0];

  const onSearch = async () => {
    try {
      setResults(await searchBooks(q));
    } catch {
      setResults([]);
    }
  };
  const onAdd = async (b: BookResult) => {
    if (!userId) return;
    try {
      await addToShelf(userId, b, "want");
      shelf.reload();
    } catch {
      /* ignore — surfaced by reload */
    }
  };

  return (
    <OpsFrame title={c.myShelf} bubble={c.whatReading} tip={c.add}>
      <View style={styles.searchRow}>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={onSearch}
          placeholder={c.searchBooks}
          placeholderTextColor={deepSpace.textLo}
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>

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
            <Text variant="subtle" style={styles.heroMeta}>
              {reading.current_page} / {reading.total_pages ?? "?"}
            </Text>
          </View>
        </View>
      ) : null}

      {results.length > 0 ? (
        <View style={styles.section}>
          <Text variant="caption" pixelEn style={styles.pixelLabel}>{c.searchBooks}</Text>
          {results.map((b) => (
            <Pressable key={b.id} onPress={() => onAdd(b)} hitSlop={6} style={styles.bookRow}>
              <Text variant="body" style={styles.bookTitle}>{b.title}</Text>
              <Text variant="caption" style={styles.bookAdd}>＋ {c.add}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {shelf.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={shelf.reload} />
      ) : !reading && (shelf.data?.want.length ?? 0) === 0 && results.length === 0 ? (
        <OpsState variant="empty" title={c.emptyTitle} body={c.whatReading} />
      ) : (shelf.data?.want.length ?? 0) > 0 ? (
        <View style={styles.section}>
          <Text variant="caption" pixelEn style={styles.pixelLabel}>{c.wantToRead}</Text>
          {shelf.data?.want.map((b) => (
            <View key={b.id} style={styles.bookRow}>
              <Text variant="body" style={styles.bookTitle}>{b.title}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </OpsFrame>
  );
}

// --- (3) Milestones · career / learning --------------------------------

const MILESTONE_DOMAINS: OpsDomainId[] = ["learning_goals", "career_check"];

export function MilestonesScreen() {
  const c = useOpsCopy();
  const { userId } = useAuth();
  const [domain, setDomain] = useState<OpsDomainId>("learning_goals");
  const ms = useAsync<Milestone[]>(
    () => (userId ? listMilestones(userId, domain) : Promise.resolve([])),
    [userId, domain],
  );
  const list = ms.data ?? [];
  const prog = domainProgress(list);

  const chipFor = (m: Milestone): { tone: OpsChipTone; label: string } => {
    if (milestoneOverdue(m)) return { tone: "danger", label: c.overdue };
    if (m.status === "doing") return { tone: "positive", label: c.inProgress };
    if (m.status === "done") return { tone: "muted", label: c.done };
    return { tone: "info", label: c.planning };
  };

  const tabs: DomainTab[] = MILESTONE_DOMAINS.map((d) => ({
    id: d,
    label: EN_DOMAIN_LABEL[d],
    color: domainColorFor(d),
  }));

  return (
    <OpsFrame title={c.goals} bubble={c.goals} tip={c.nextStep}>
      <OpsDomainPicker tabs={tabs} selected={domain} onSelect={(d) => setDomain(d as OpsDomainId)} />
      <View style={styles.progressHeader}>
        <Text variant="caption" style={styles.progressLabel}>
          {prog.done} / {prog.total}
        </Text>
        <ProgressBar value={prog.pct} color={deepSpace.accentDim} />
      </View>
      {ms.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={ms.reload} />
      ) : list.length === 0 ? (
        <OpsState variant="empty" title={c.emptyTitle} body={c.goals} />
      ) : (
        list.map((m) => {
          const chip = chipFor(m);
          return (
            <View key={m.id} style={styles.msRow}>
              <View style={styles.msTop}>
                <Text variant="heading" style={styles.msTitle}>{m.title}</Text>
                <OpsStatusChip tone={chip.tone} label={chip.label} />
              </View>
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
  const { i18n } = useTranslation();
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

  return (
    <OpsFrame title={c.monthCheck} bubble={`${c.left} ${summary.net.toLocaleString()}`} tip={c.record}>
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

      {entries.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={entries.reload} />
      ) : summary.byCategory.length === 0 ? (
        <OpsState variant="empty" title={c.emptyTitle} body={c.record} />
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
      <Text variant="subtle" style={styles.fxNote}>{c.fxNote}</Text>
    </OpsFrame>
  );
}

// --- (5) Side project · github -----------------------------------------

export function SideProjectScreen() {
  const c = useOpsCopy();
  const [username, setUsername] = useState("");
  const [pushes, setPushes] = useState<PushActivity[] | null>(null);
  const [errored, setErrored] = useState(false);

  const connect = async (handle: string) => {
    setErrored(false);
    try {
      setPushes(await fetchPushActivity(handle));
    } catch {
      setErrored(true);
      setPushes(null);
    }
  };

  // B: remember the GitHub connection (device-local) and reconnect on open.
  useEffect(() => {
    let alive = true;
    void getGithubUsername().then((saved) => {
      if (alive && saved) {
        setUsername(saved);
        void connect(saved);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = async () => {
    await setGithubUsername(username);
    await connect(username);
  };
  const summary = summarizeGithubActivity(pushes ?? []);

  return (
    <OpsFrame title={c.sideProject} bubble={c.sideProject} tip={c.unlinkedBody}>
      <View style={styles.searchRow}>
        <TextInput
          value={username}
          onChangeText={setUsername}
          onSubmitEditing={onConnect}
          placeholder="GitHub @username"
          placeholderTextColor={deepSpace.textLo}
          style={styles.searchInput}
          autoCapitalize="none"
          returnKeyType="done"
        />
      </View>

      {errored ? (
        <OpsState variant="rate" title={c.rateTitle} body={c.rateBody} ctaLabel={c.retry} onCta={onConnect} />
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
              <MetaChip label={`${summary.repos.length} repos`} />
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

export function MealsScreen() {
  const c = useOpsCopy();
  const { userId } = useAuth();
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko");
  const dayLabels = ko ? DAYS : DAYS_EN;
  const thisWeek = weekStartKey();

  const [weekStart, setWeekStart] = useState(thisWeek);
  const [pending, setPending] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [draft, setDraft] = useState("");
  const [ideas, setIdeas] = useState<FoodNutrition[]>([]);

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

  const openCell = async (date: string, slot: MealSlot, current: MealEntry | null) => {
    setPending({ date, slot });
    setDraft(current?.title ?? "");
    try {
      setIdeas(await searchFoods(ko ? "닭" : "chicken"));
    } catch {
      setIdeas([]);
    }
  };

  const saveCell = async () => {
    if (!userId || !pending || draft.trim().length === 0) {
      setPending(null);
      return;
    }
    try {
      await setMeal(userId, pending.date, pending.slot, draft.trim());
      week.reload();
    } catch {
      /* surfaced on reload */
    }
    setPending(null);
  };

  return (
    <OpsFrame title={c.weeklyMeals} bubble={c.weeklyMeals} tip={c.whatToEatNow}>
      <View style={styles.weekNav}>
        <Pressable onPress={() => shiftWeek(-7)} hitSlop={10} style={styles.weekArrow}>
          <RNText style={styles.weekArrowText}>‹</RNText>
        </Pressable>
        <Text variant="caption" style={[styles.weekLabel, weekStart === thisWeek ? styles.weekLabelNow : null]}>{weekStart}</Text>
        <Pressable onPress={() => shiftWeek(7)} hitSlop={10} style={styles.weekArrow}>
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
                  onPress={() => openCell(day.date, slot, cell)}
                  hitSlop={4}
                  style={[styles.gridCell, cell ? styles.gridCellFilled : null]}
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
      <Text variant="subtle" style={styles.fxNote}>{c.nutritionNote}</Text>

      <Modal visible={pending !== null} transparent animationType="slide" onRequestClose={() => setPending(null)}>
        <Pressable style={styles.mealBackdrop} onPress={() => setPending(null)} />
        <View style={styles.mealSheet}>
          <View style={styles.sheetGrip} />
          <Text variant="heading" style={styles.mealSheetTitle}>{c.planMeal}</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={c.mealIdeas}
            placeholderTextColor={deepSpace.textLo}
            style={styles.searchInput}
            returnKeyType="done"
            onSubmitEditing={saveCell}
          />
          {ideas.length > 0 ? (
            <View style={styles.ideaChips}>
              {ideas.slice(0, 4).map((f) => (
                <Pressable key={f.name} onPress={() => setDraft(f.name)} hitSlop={4} style={styles.ideaChip}>
                  <Text variant="body" style={styles.ideaChipText}>{f.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable onPress={saveCell} hitSlop={6} style={styles.mealSave}>
            <Text variant="caption" style={styles.mealSaveText}>{c.save}</Text>
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

export function RemindersScreen() {
  const c = useOpsCopy();
  const { userId } = useAuth();
  const supported = remindersSupported();
  const routines = useAsync<OpsRoutine[]>(
    () => (userId ? listActiveRoutines(userId) : Promise.resolve([])),
    [userId],
  );
  const withReminder = (routines.data ?? []).filter((r) => r.reminder_time);

  return (
    <OpsFrame title={c.scheduledReminders} bubble={c.scheduledReminders} tip={c.remindersTip}>
      {routines.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={routines.reload} />
      ) : withReminder.length === 0 ? (
        <OpsState variant="empty" title={c.emptyTitle} body={c.scheduledReminders} />
      ) : (
        withReminder.map((r) => (
          <OpsReminderRow
            key={r.id}
            title={r.title}
            schedule={reminderSchedule(r, c)}
            tone={supported ? "active" : "muted"}
            statusLabel={supported ? c.active : c.notOnThisDevice}
          />
        ))
      )}
    </OpsFrame>
  );
}

// --- screen-local styles (deepSpace tokens only) -----------------------

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", gap: deepSpaceSpacing.sm },
  searchInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: deepSpaceRadii.md,
    paddingHorizontal: deepSpaceSpacing.md,
    color: deepSpace.textHi,
    fontFamily: fontFamilies.sans,
    fontSize: 14,
  },
  section: { gap: 8 },
  pixelLabel: { fontSize: 8, letterSpacing: 1, color: deepSpace.textLo },
  dotSm: { width: 7, height: 7, borderRadius: 4 },

  hero: {
    flexDirection: "row",
    gap: 13,
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: deepSpaceRadii.lg,
    backgroundColor: deepSpace.card,
  },
  cover: {
    width: 62,
    height: 88,
    borderRadius: deepSpaceRadii.sm,
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
    borderRadius: deepSpaceRadii.md,
    backgroundColor: deepSpace.card,
  },
  bookTitle: { flex: 1, fontSize: 14, color: deepSpace.textHi },
  bookAdd: { fontSize: 12, color: deepSpace.mint },

  progressHeader: { gap: 6 },
  progressLabel: { fontSize: 12, color: deepSpace.textMuted },

  msRow: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.md,
    backgroundColor: deepSpace.card,
    gap: 6,
  },
  msTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  msTitle: { flex: 1, fontSize: 14, color: deepSpace.textHi },
  msNote: { fontSize: 12, color: deepSpace.textLo },

  ledgerCard: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: deepSpaceRadii.lg,
    backgroundColor: deepSpace.card,
  },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between" },
  trendRow: { flexDirection: "row", marginTop: deepSpaceSpacing.sm },
  ledgerStat: { fontSize: 12, color: deepSpace.textMid },
  catRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  catName: { fontSize: 13, color: deepSpace.textMid },
  fxNote: { fontSize: 12, color: deepSpace.textLo },

  ghCard: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: deepSpaceRadii.lg,
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
    borderRadius: deepSpaceRadii.md,
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
    borderRadius: deepSpaceRadii.md,
  },
  quickIcon: { fontSize: 15 },
  quickText: { flex: 1, fontFamily: fontFamilies.pixelKo, fontSize: 13, color: deepSpace.accentBright },
  quickTag: { fontSize: 12, color: deepSpace.mint },

  grid: { gap: 6 },
  gridHeaderRow: { flexDirection: "row", gap: 6 },
  gridRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  gridDayCell: { width: 28 },
  gridDay: { width: 28, fontSize: 12, color: deepSpace.textMid },
  gridHeadCell: { flex: 1, fontSize: 10, color: deepSpace.textLo, textAlign: "center" },
  gridCell: {
    flex: 1,
    height: 36,
    borderRadius: deepSpaceRadii.sm,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    alignItems: "center",
    justifyContent: "center",
  },
  gridPlus: { fontSize: 14, color: deepSpace.textLo },
  gridCellFilled: { borderColor: deepSpace.cardLineStrong, backgroundColor: deepSpace.cardPressed },
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
  sheetGrip: { width: 40, height: 4, borderRadius: 2, backgroundColor: deepSpace.cardLineStrong, alignSelf: "center" },
  mealSheetTitle: { fontSize: 15, color: deepSpace.textHi },
  ideaChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  ideaChip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.md,
    backgroundColor: deepSpace.card,
  },
  ideaChipText: { fontSize: 13, color: deepSpace.accentSoft },
  mealSave: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: deepSpaceRadii.md,
    backgroundColor: deepSpace.mint,
    marginTop: 4,
  },
  mealSaveText: { fontSize: 14, color: deepSpace.onMint },
});
