// The 6 Ops/assistant domain screens (Claude Design ops-assistant.dc.html).
// Each assembles the shared kit (components/deepspace/ops) and renders/operates
// the already-built backing data libs. deepSpace.* tokens only, no auto-execution
// (every write is behind a user tap). Strings come from the bilingual ops copy.

import { useEffect, useMemo, useState, type DependencyList } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";

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
            <Text style={styles.coverText}>{reading.title}</Text>
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.pixelLabel}>{c.nowReading}</Text>
            <Text style={styles.heroTitle}>{reading.title}</Text>
            <Text style={styles.heroAuthor}>{reading.authors.join(", ")}</Text>
            <View style={{ marginTop: 10 }}>
              <ProgressBar value={readingProgress(reading.current_page, reading.total_pages)} />
            </View>
            <Text style={styles.heroMeta}>
              {reading.current_page} / {reading.total_pages ?? "?"}
            </Text>
          </View>
        </View>
      ) : null}

      {results.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.pixelLabel}>{c.searchBooks}</Text>
          {results.map((b) => (
            <Pressable key={b.id} onPress={() => onAdd(b)} hitSlop={6} style={styles.bookRow}>
              <Text style={styles.bookTitle}>{b.title}</Text>
              <Text style={styles.bookAdd}>＋ {c.add}</Text>
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
          <Text style={styles.pixelLabel}>{c.wantToRead}</Text>
          {shelf.data?.want.map((b) => (
            <View key={b.id} style={styles.bookRow}>
              <Text style={styles.bookTitle}>{b.title}</Text>
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
        <Text style={styles.progressLabel}>
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
                <Text style={styles.msTitle}>{m.title}</Text>
                <OpsStatusChip tone={chip.tone} label={chip.label} />
              </View>
              {m.note ? <Text style={styles.msNote}>{m.note}</Text> : null}
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
  const month = monthBucket(new Date());
  const entries = useAsync(
    () => (userId ? listEntriesForMonth(userId, month) : Promise.resolve([])),
    [userId, month],
  );
  const summary = useMemo(() => summarizeMonth(entries.data ?? [], month), [entries.data, month]);
  const maxCat = summary.byCategory[0]?.total ?? 1;

  return (
    <OpsFrame title={c.monthCheck} bubble={`${c.left} ${summary.net.toLocaleString()}`} tip={c.record}>
      <View style={styles.ledgerCard}>
        <View style={styles.ledgerRow}>
          <Text style={styles.ledgerStat}>
            {c.income} {summary.income.toLocaleString()}
          </Text>
          <Text style={styles.ledgerStat}>
            {c.expense} {summary.expense.toLocaleString()}
          </Text>
          <Text style={[styles.ledgerStat, { color: deepSpace.mint }]}>
            {c.left} {summary.net.toLocaleString()}
          </Text>
        </View>
      </View>

      {entries.status === "error" ? (
        <OpsState variant="error" title={c.errorTitle} body={c.errorBody} ctaLabel={c.retry} onCta={entries.reload} />
      ) : summary.byCategory.length === 0 ? (
        <OpsState variant="empty" title={c.emptyTitle} body={c.record} />
      ) : (
        <View style={styles.section}>
          <Text style={styles.pixelLabel}>{c.byCategory}</Text>
          {summary.byCategory.map((cat) => (
            <View key={cat.category} style={{ marginBottom: 10 }}>
              <View style={styles.catRow}>
                <Text style={styles.catName}>{cat.category}</Text>
                <Text style={styles.catName}>{cat.total.toLocaleString()}</Text>
              </View>
              <ProgressBar value={cat.total / maxCat} />
            </View>
          ))}
        </View>
      )}
      <Text style={styles.fxNote}>{c.fxNote}</Text>
    </OpsFrame>
  );
}

// --- (5) Side project · github -----------------------------------------

export function SideProjectScreen() {
  const c = useOpsCopy();
  const [username, setUsername] = useState("");
  const [pushes, setPushes] = useState<PushActivity[] | null>(null);
  const [errored, setErrored] = useState(false);

  const onConnect = async () => {
    setErrored(false);
    try {
      setPushes(await fetchPushActivity(username));
    } catch {
      setErrored(true);
      setPushes(null);
    }
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
            <Text style={styles.pixelLabel}>{c.thisWeek}</Text>
            <Text style={styles.ghBig}>
              {summary.commits} <Text style={styles.ghBigUnit}>{c.commits}</Text>
            </Text>
            <View style={styles.ghChips}>
              <MetaChip label={`${summary.activeDays}d`} />
              <MetaChip label={`${summary.repos.length} repos`} />
            </View>
          </View>
          {summary.repos.map((repo) => (
            <View key={repo} style={styles.repoRow}>
              <View style={[styles.dotSm, { backgroundColor: deepSpace.soul }]} />
              <Text style={styles.repoName}>{repo}</Text>
            </View>
          ))}
        </>
      )}
    </OpsFrame>
  );
}

// --- (6) Meals · foods -------------------------------------------------

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export function MealsScreen() {
  const c = useOpsCopy();
  const [ideas, setIdeas] = useState<FoodNutrition[] | null>(null);
  const [q, setQ] = useState("");

  const onIdeas = async () => {
    try {
      setIdeas(await searchFoods(q));
    } catch {
      setIdeas([]);
    }
  };

  return (
    <OpsFrame title={c.weeklyMeals} bubble={c.weeklyMeals} tip={c.whatToEatNow}>
      <Pressable onPress={onIdeas} hitSlop={6} style={styles.quickMode}>
        <Text style={styles.quickIcon}>⚡</Text>
        <Text style={styles.quickText}>{c.whatToEatNow}</Text>
        <Text style={styles.quickTag}>{c.quickMode} ›</Text>
      </Pressable>

      <View style={styles.grid}>
        <View style={styles.gridHeaderRow}>
          <View style={styles.gridDayCell} />
          <Text style={styles.gridHeadCell}>{c.breakfast}</Text>
          <Text style={styles.gridHeadCell}>{c.lunch}</Text>
          <Text style={styles.gridHeadCell}>{c.dinner}</Text>
        </View>
        {DAYS.slice(0, 4).map((d) => (
          <View key={d} style={styles.gridRow}>
            <Text style={styles.gridDay}>{d}</Text>
            {[0, 1, 2].map((slot) => (
              <View key={slot} style={styles.gridCell}>
                <Text style={styles.gridPlus}>＋</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {ideas && ideas.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.pixelLabel}>{c.mealIdeas}</Text>
          {ideas.map((f) => (
            <View key={f.name} style={styles.bookRow}>
              <Text style={styles.bookTitle}>{f.name}</Text>
              {f.kcal !== undefined ? <MetaChip label={`${f.kcal} kcal`} /> : null}
            </View>
          ))}
          <Text style={styles.fxNote}>{c.nutritionNote}</Text>
        </View>
      ) : ideas ? (
        <OpsState variant="empty" title={c.mealIdeas} body={c.nutritionNote} />
      ) : null}
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
  pixelLabel: { fontFamily: fontFamilies.pixelEn, fontSize: 8, letterSpacing: 1, color: deepSpace.textLo },
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
  coverText: { fontFamily: fontFamilies.pixelKo, fontSize: 8, color: deepSpace.textLo },
  heroBody: { flex: 1 },
  heroTitle: { fontFamily: fontFamilies.pixelKo, fontSize: 15, color: deepSpace.textHi, marginTop: 4 },
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
  bookAdd: { fontFamily: fontFamilies.pixelKo, fontSize: 12, color: deepSpace.mint },

  progressHeader: { gap: 6 },
  progressLabel: { fontSize: 12, color: deepSpace.textMuted, fontFamily: fontFamilies.pixelKo },

  msRow: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.md,
    backgroundColor: deepSpace.card,
    gap: 6,
  },
  msTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  msTitle: { flex: 1, fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.textHi },
  msNote: { fontSize: 12, color: deepSpace.textLo },

  ledgerCard: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: deepSpaceRadii.lg,
    backgroundColor: deepSpace.card,
  },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between" },
  ledgerStat: { fontSize: 12, color: deepSpace.textMid },
  catRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  catName: { fontSize: 13, color: deepSpace.textMid },
  fxNote: { fontSize: 12, color: deepSpace.textLo, lineHeight: 17 },

  ghCard: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: deepSpaceRadii.lg,
    backgroundColor: deepSpace.card,
    gap: 8,
  },
  ghBig: { fontFamily: fontFamilies.pixelKo, fontSize: 22, color: deepSpace.textHi },
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
  repoName: { flex: 1, fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.textHi },

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
  gridDay: { width: 28, fontSize: 12, color: deepSpace.textMid, fontFamily: fontFamilies.pixelKo },
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
});
