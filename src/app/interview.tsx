// 심층 인터뷰 — 5층 드릴다운 대화. (Simon 결정 2026-08-23: 배치안 ①)
//
// ── 무엇이 바뀌었나 ─────────────────────────────────────────────────────
// 이 화면은 **고정 5문항 리커트 스크리너**였다. 캐논에서 온 다섯 질문을 탭으로
// 답하고, 채점 없이 텍스트 한 덩어리로 저장한 뒤 `/big-five` 로 넘겼다.
// 이름은 "심층 인터뷰"인데 깊이가 없었고, 다섯 문항이 전부 외향/내향 한 축이었다.
//
// 정작 깊게 파는 엔진(`lib/interview/probe.ts`)은 **화면이 없어서** 자기 테스트
// 밖 호출부가 0건이었다. Simon 이 그 둘을 잇기로 했다 -- 라우트·진입점·저장 태그가
// 이미 여기 있고, 그래야 이름이 내용과 맞는다.
//
// 옛 스크리너는 되살릴 것이 아니다. 지우는 것이 곧 이 결정의 내용이다.
//
// ── 한 턴이 도는 방식 ───────────────────────────────────────────────────
//
//   nextMove(coverage, period, 이번 대화의 답변들, now)
//     ├─ loopCheck : 같은 자리를 돌고 있다 -> LLM 을 부르지 않고 되묻는다
//     ├─ scaffold  : 고정 발판을 즉시 표시한다. LLM·audit·network 없음
//     └─ drill     : nextProbe(...) -> LLM 이 다음 질문 한 줄
//                    실제 답변을 받으면 그 층의 coverage 를 올린다
//
// 되묻기 판정의 재료는 **이번 대화의 사용자 답변들**이다. DB 를 읽지 않는다 --
// "매번 같은 결론으로 돌아온다"는 바로 이 대화 안에서 관측되는 것이고, 그게
// `detectLoops` 가 재는 것과 정확히 같다.
//
// ── C9 (안전) ───────────────────────────────────────────────────────────
// 옛 화면은 자유서술이 없어서 C9 가 이 경로에 아예 없었다. 이제 있다.
// 모든 답을 화면에서 dual-locale 분류한다. red 는 coverage/LLM 전에 경계 모듈의
// source-aware crisis route로 두 원장을 쓴 뒤 핫라인을 띄운다.
//
// ── 저장 ────────────────────────────────────────────────────────────────
// 태그(`interview`/`recall`/`screener`)와 `kind`, `auditPeriod` 는 그대로 둔다.
// `assess/registry.ts` 의 `interview` 항목이 그 태그로 완료를 판정하고,
// 옛 스크리너로 남긴 기록과 같은 서랍에 들어가야 한다.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState, PremiumModal, PremiumToast } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PastMeErasView } from "@/components/deep-space/DeepSpaceViews";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import type { HotlineId } from "@/lib/safety/lexicon";
import { classifyInputAnyLocale } from "@/lib/safety/classifier";
import { startInterviewCrisisRouting } from "@/lib/llm/boundary";
import { useAuth } from "@/lib/auth/AuthContext";
import { livedPeriods, resolveInterviewRoutePeriod } from "@/lib/interview/periods";
import { DrillProgress } from "@/components/ui/DrillProgress";
import { isNonAnswer, scaffoldQuestion, shouldScaffold, MAX_SCAFFOLDS_PER_LAYER } from "@/lib/interview/stuck";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { createRecord } from "@/lib/records/create";
import { addCoverage, loadCoverage } from "@/lib/interview/coverage-store";
import { loadSevenLevels } from "@/lib/persona/load-seven-levels";
import { recordSevenTiers } from "@/lib/persona/seven-tier-history";
import { m3 } from "@/lib/theme/m3";
import { spacing } from "@/lib/theme/tokens";
import {
  LAYER_LABEL,
  PERIOD_LABEL,
  seedQuestion,
  emptyCoverage,
  DRILL_LAYERS,
  LIFE_PERIODS,
  incrementCoverage,
  decrementCoverage,
  nextMove,
  nextProbe,
  type Coverage,
  type DrillLayer,
  type InterviewTurn,
  type LifePeriod,
} from "@/lib/interview/probe";
import { LOOP_CHECK_KEYS, type ReflectionEntry } from "@/lib/interview/loop-check";

// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
// 원래 이 자리에 문자열 SVG 레지스트리가 있었다(저장소에서 열하나 번째).
function Glyph({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  return <PixelGlyph name={canonGlyph(name)} color={color} size={size} />;
}

// 한 세션의 턴 상한. 드릴은 원래 "축이 목표 등급에 닿을 때까지"인데
// (`drill-stop.ts`), 등급 추정은 이 화면이 하지 않는다 -- 지금 추정치를 지어내지
// 않는다는 것이 이 화면의 기존 약속이고, 그건 유지한다. 그래서 여기서는 **비용과
// 피로**로만 끊는다. 사용자는 언제든 "여기까지"로 먼저 끝낼 수 있다.
const MAX_TURNS = 12;
const PROFILE_RETRY_INITIAL_MS = 2_000;
const PROFILE_RETRY_MAX_MS = 30_000;

function InterviewFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation("interview");
  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={t("title")}
      onBack={() => router.back()}
    >
      {children}
    </DeepSpaceScreen>
  );
}

export default function InterviewRoute() {
  const { t } = useTranslation("interview");
  const { t: homeT } = useTranslation("home");
  const { period: periodParam } = useLocalSearchParams<{ period?: string }>();
  const { userId, loading, hasProfile, profileProbeFailed, age, refresh } = useAuth();

  useEffect(() => {
    // 첫 프로필 프로브 실패는 "프로필 없음"이 아니라 "아직 모름"이다. 아래
    // 게이트가 화면을 안전하게 붙드는 동안, 겹치는 요청 없이 백오프로 재조회한다.
    if (loading || !userId || hasProfile !== false || !profileProbeFailed) return;
    let active = true;
    let retryDelayMs = PROFILE_RETRY_INITIAL_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (!active) return;
      timer = setTimeout(() => {
        void refresh()
          .catch(() => undefined)
          .finally(() => {
            retryDelayMs = Math.min(retryDelayMs * 2, PROFILE_RETRY_MAX_MS);
            scheduleRetry();
          });
      }, retryDelayMs);
    };
    scheduleRetry();
    return () => {
      active = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [hasProfile, loading, profileProbeFailed, refresh, userId]);

  // 프로필 프로브가 끝나기 전의 age=null을 "나이를 모름"으로 해석하면 잠긴 미래
  // 시기가 잠깐 세션으로 마운트될 수 있다. 인증과 프로필 상태를 먼저 확정한다.
  if (loading) {
    return (
      <InterviewFrame>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </InterviewFrame>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  // 실패한 프로브의 hasProfile=false는 "프로필 없음"이 아니라 "아직 모름"이다.
  // 기존 DeepSpace 인증 게이트처럼 완료 프로필로 내보내지 않고 다음 프로브를 기다린다.
  if (profileProbeFailed || hasProfile === null) {
    return (
      <InterviewFrame>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </InterviewFrame>
    );
  }
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const resolution = resolveInterviewRoutePeriod(periodParam, age);
  if (resolution.kind === "missing" || resolution.kind === "invalid") {
    return (
      <InterviewFrame>
        <PastMeErasView />
      </InterviewFrame>
    );
  }
  if (resolution.kind === "locked") {
    return (
      <InterviewFrame>
        <View style={[styles.center, styles.routeState]}>
          <MdCard variant="outlined" style={styles.lockedCard}>
            <Text style={[m3TextStyle("titleMedium"), styles.saveTitle]}>
              {homeT(`ds.star.${resolution.period}`)}
            </Text>
            <Text style={[m3TextStyle("bodyMedium"), styles.note]}>
              {homeT("ds.star.lockedBody")}
            </Text>
          </MdCard>
        </View>
      </InterviewFrame>
    );
  }

  // URL의 시기가 바뀌면 세션 전체를 갈아 끼운다. turns/coverage/started가 다른
  // 시기의 대화와 섞이지 않고, 저장 시기 역시 이 prop 하나로 고정된다.
  return <InterviewSession key={resolution.period} period={resolution.period} />;
}

function InterviewSession({ period }: { period: LifePeriod }) {
  const { t, i18n } = useTranslation("interview");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "ko" | "en";
  // 기록에 남기는 시기도 같은 id 로 쓴다. `records.audit_period` 는 CHECK 없는 자유
  // 텍스트고 **지금 읽는 코드가 없다**(완료 판정은 태그가 한다). 옛 행은 `20s`·`teens`
  // 를 담고 있어 어휘가 섞이지만, 40대 인터뷰를 `current` 로 접어 넣는 쪽이 틀린
  // 기록을 남기므로 그쪽을 고르지 않았다.
  const auditPeriod: string = period;

  const { userId, isMinor, age } = useAuth();
  const kbHeight = useKeyboard();

  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [coverage, setCoverage] = useState<Coverage>(emptyCoverage);
  /** 이 세션을 시작할 때 이미 저장돼 있던 행렬. 저장할 때 **이번에 판 만큼만**
   *  더하기 위해 남겨둔다(0143). ref 인 이유는 렌더를 유발할 값이 아니라서다. */
  const baseCoverage = useRef<Coverage>(emptyCoverage());
  /** 현재 층에서 연속으로 못 답한 횟수. 답하면 0 으로 돌아간다. */
  const [stuckStreak, setStuckStreak] = useState(0);
  /** 발판을 두 번 줘도 막혀서 이번 대화에서는 더 묻지 않기로 한 층들.
   *
   *  칸을 안 채우는 것만으로는 부족했다(실측) -- "가장 먼저 비어 있는 칸" 규칙이
   *  바로 그 칸을 다시 집어서 같은 질문이 계속 나갔다. 밝기는 정직하게 비워두고,
   *  묻기만 멈춘다. */
  const [abandoned, setAbandoned] = useState<DrillLayer[]>([]);
  /** 이 사용자에게 해당되는 시기. 진행 행렬의 열이 된다. */
  const coveredPeriods = useMemo(() => livedPeriods(age), [age]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingLayer, setPendingLayer] = useState<DrillLayer | null>(null);
  /** 이번 질문에 딸린 **말문 후보**. 누르면 보내지 않고 입력창을 채운다. */
  const [openers, setOpeners] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const [failModal, setFailModal] = useState(false);
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "KR_109",
  });
  const crisisRouting = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  const hotlineFor = useCallback(
    (): HotlineId => (locale === "ko" ? (isMinor ? "KR_1388" : "KR_109") : "GLOBAL_988"),
    [locale, isMinor],
  );

  // 실제 CTA 번역은 utility의 정규식과 따로 진화할 수 있다. 화면이 내보낸 exact
  // 문구는 언제나 비-답변으로 인정하고, 자유 입력은 보수적인 공용 판정을 유지한다.
  const isBlockedAnswer = useCallback(
    (text: string): boolean => text === t("drill.dontKnow") || isNonAnswer(text, locale),
    [locale, t],
  );

  // 이번 대화의 사용자 답변 -> 되묻기 판정의 재료. theme 를 시기로 두면
  // "같은 시기를 새 말 없이 계속 맴돈다" 가 잡힌다.
  const entriesOf = useCallback(
    (list: InterviewTurn[]): ReflectionEntry[] =>
      list
        .filter((turn) => turn.role === "user")
        // ⚠ **"모르겠다"는 성찰 기록이 아니다** (실측 2026-08-24).
        //
        // 이걸 안 걸러내면 같은 표현으로 세 번 못 답했을 때 `detectLoops` 가
        // 새로움 0 을 보고 **되묻기**를 띄운다 -- "같은 결론으로 자꾸 돌아오시나요?"
        // 못 답한 사람에게 곱씹는다고 말하는 셈이라 정반대의 대응이다.
        // 커버리지를 안 올리는 것과 같은 이유다: 답이 아닌 것을 답으로 세지 않는다.
        .filter((turn) => !isBlockedAnswer(turn.text))
        .map((turn, i) => ({
          id: `t${i}`,
          createdAt: new Date().toISOString(),
          theme: turn.period ?? period,
          text: turn.text,
        })),
    [period, isBlockedAnswer],
  );

  const ask = useCallback(
    async (
      history: InterviewTurn[],
      cov: Coverage,
      /** 직전 턴에서 못 답한 층과 그 층에서의 연속 횟수. */
      stuck: { layer: DrillLayer; streak: number } | null = null,
      giveUp: DrillLayer[] = [],
      /** 방금 크레딧을 준 층. 모델이 거부하면 이 칸을 되돌린다. */
      credited: DrillLayer | null = null,
    ) => {
      if (!userId) return;
      setBusy(true);
      setNotice(null);
      try {
        const move = nextMove(cov, period, entriesOf(history), new Date(), stuck, giveUp);
        if (move.kind === "loopCheck") {
          // LLM 을 부르지 않는다. 질문이 이미 정해져 있고(리서치 원문), 여기서
          // 더 캐묻는 것이 문제이므로 방향을 바꾸는 것 자체가 답이다.
          const key = move.questionKey;
          setTurns([
            ...history,
            { role: "interviewer", text: t(`loopCheck.${key}`), period },
          ]);
          setPendingLayer(null);
          // 되묻기에는 말문 후보를 달지 않는다 — 그건 새 질문이 아니라 확인이다.
          setOpeners([]);
          setNotice(t("drill.loopNote"));
          return;
        }
        // 발판은 이미 결정된 고정 문장이다. `nextProbe` 로 보내면 같은 한 번의 탭이
        // LLM·audit·network 를 만들고, 모델의 문장이 고정 발판을 덮을 수 있다.
        // 못 답한 칸은 그대로 비운 채 같은 층의 발판을 즉시 보여준다.
        if (move.kind === "scaffold") {
          setTurns([
            ...history,
            {
              role: "interviewer",
              text: scaffoldQuestion(move.layer, locale, stuck?.streak ?? 1),
              layer: move.layer,
              period,
            },
          ]);
          setPendingLayer(move.layer);
          setOpeners([]);
          setNotice(t("drill.scaffoldNote"));
          return;
        }
        // ⚠ 층은 **언제나** `move.layer` 를 넘긴다. `nextMove` 가 포기 목록까지 보고
        // 고른 층을 후속 질문 경계가 다시 고르면 방금 포기한 칸으로 되돌아갈 수 있다.
        const probe = await nextProbe(
          userId, locale, period, history, cov, isMinor === true,
          0, move.layer,
        );
        if (probe.zone === "red") {
          // C9: 텍스트가 아니라 핫라인. 대화는 여기서 멈춘다.
          setCrisis({ visible: true, hotline: hotlineFor() });
          return;
        }
        // ⚠ 모델의 **거부권**. 직전 답이 그 층에 안 닿았다고 하면 방금 준 크레딧을
        // 물린다. 반대는 없다 — 모델이 "닿았다"고 해도 그것만으로 칸을 채우지 않는다.
        // (`isNonAnswer` 가 이미 결정론적 바닥이고, 모델은 그 위에서 깎기만 한다.)
        //
        // 이렇게 두는 이유: 밝기가 **부풀면** 거짓말이 되고 **덜 차면** 그냥 덜 찬
        // 것이다. 그래서 모델에게 줄 수 있는 권한은 여기까지다. "이게 지금
        // 드릴다운이야??" 같은 메타 항의를 잡는 것이 이 경로다.
        if (credited && probe.answeredLayer === null) {
          const undone = decrementCoverage(cov, period, credited);
          const streak = (stuck?.streak ?? 0) + 1;
          setCoverage(undone);
          setStuckStreak(streak);
          if (shouldScaffold(streak)) {
            setTurns([
              ...history,
              { role: "interviewer", text: scaffoldQuestion(credited, locale, streak), layer: credited, period },
            ]);
            setPendingLayer(credited);
            setNotice(t("drill.scaffoldNote"));
            return;
          }
          // 발판을 다 썼다. 모델이 낸 질문을 그대로 쓰되 그 층은 포기한다.
          setAbandoned((prev) => (prev.includes(credited) ? prev : [...prev, credited]));
          setStuckStreak(0);
        }
        setTurns([...history, { role: "interviewer", text: probe.question, layer: probe.layer, period }]);
        setPendingLayer(probe.layer);
        setOpeners(probe.openers);
      } catch {
        setNotice(t("drill.failed"));
      } finally {
        setBusy(false);
      }
    },
    [userId, period, locale, isMinor, entriesOf, hotlineFor, t],
  );

  // 첫 질문은 **LLM 을 부르지 않는다.**
  //
  // 엔진의 시스템 프롬프트는 "사용자의 마지막 답에 직접 이어붙인다"가 규칙인데,
  // 히스토리가 비어 있으면 이어붙일 것이 없다. 실제로 그랬다 -- 첫 질문이
  // "방금 말한 것 중에서 …" 로 나왔다. 아직 아무 말도 안 했는데 앞말을 가리키니
  // 대화가 어긋난 데서 시작한다.
  //
  // 그래서 문을 여는 한 줄은 우리가 갖는다. 비용도 한 턴 아끼고, 무엇보다
  // **말할 거리를 먼저 주는 쪽**이 이 층(L1 사실)이 원하는 것이다.
  const started = useRef(false);
  useEffect(() => {
    if (!userId || started.current) return;
    started.current = true;
    // 시기별 씨앗 질문. 엔진이 시기마다 하나씩 갖고 있는데(`seedQuestion`) 호출부가
    // 0건이었다. 예전 일반 문구(`drill.opening`)는 "어느 시기를 해볼까요?" 라고
    // 되묻는 것이었는데, 시기는 이제 `/audit` 에서 고르고 오므로 질문이 중복된다.
    // 여전히 **모델을 부르지 않는다** -- 고정 표에서 꺼낸다.
    setTurns([{ role: "interviewer", text: seedQuestion(period, locale), layer: "fact", period }]);
    setPendingLayer("fact");
    // 지난 세션까지 판 자리를 이어받는다. 안 그러면 매번 처음부터 다시 파고,
    // 등급은 한 세션 안에서만 오르내린다(그게 지금까지의 상태였다).
    void loadCoverage(userId).then((stored) => {
      baseCoverage.current = stored;
      setCoverage(stored);
    });
  }, [userId, period, locale]);

  useEffect(() => {
    if (turns.length > 0) scrollRef.current?.scrollToEnd({ animated: true });
  }, [turns.length]);

  const userTurns = turns.filter((turn) => turn.role === "user").length;

  // `override` 는 답변 칩이 쓴다. 칩을 누르면 `setDraft` 후 `send()` 를 부르는 대신
  // 곧바로 그 말을 보낸다 — 상태 갱신은 다음 렌더에나 반영돼서, 그 사이에 보내면
  // 직전 draft(대개 빈 문자열)가 나간다.
  async function send(override?: string) {
    if (!userId) return;
    const text = (override ?? draft).trim();
    if (text.length === 0) {
      setNotice(t("drill.emptyAnswer"));
      return;
    }
    // C9: `isNonAnswer`보다 먼저 양쪽 언어를 분류한다. "죽고 싶어요. 모르겠어요"
    // 같은 입력을 단순 막힘으로 보고 로컬 발판으로 보내면 crisis 경로를 건너뛴다.
    // red는 기존 routeCrisis를 거쳐 필수 audit/event 원장을 쓴 뒤 핫라인으로 끝낸다.
    // coverage·nextMove·nextProbe는 건드리지 않는다.
    const safety = classifyInputAnyLocale(text, locale, { minor: isMinor === true });
    if (safety.zone === "red") {
      const route = startInterviewCrisisRouting(
        crisisRouting,
        { text, locale, userId, minor: isMinor === true },
        () => {
          setBusy(true);
          setCrisis({ visible: true, hotline: hotlineFor() });
        },
        () => setBusy(false),
      );
      if (route.started) {
        void route.done.catch(() => setNotice(t("drill.failed")));
      }
      return;
    }
    // 답변이 붙는 층은 **직전 질문이 겨냥한 층**이다. 되묻기였다면 층이 없다 --
    // 그건 깊이를 판 것이 아니라 방향을 바꾼 것이므로 coverage 를 올리지 않는다.
    const answered: InterviewTurn = { role: "user", text, layer: pendingLayer ?? undefined, period };
    const nextTurns = [...turns, answered];

    // ⚠ **"모르겠다"는 칸을 채우지 않는다** (Simon 실측, 2026-08-24).
    //
    // 예전에는 비어 있지 않은 답이면 무조건 `incrementCoverage` 를 불렀다. 그래서
    // "잘 모르겠는데" 가 의미(L3) 칸을 채우고, 채워졌으니 믿음(L4)으로 내려갔다.
    // **못 판 것을 판 것으로 셀다.** 그 칸 수가 그대로 `narrativeStarLevel` 의
    // 입력이라 등급까지 오염됐다 -- 7렌즈 감사에서 걸린 바로 그 병이다.
    //
    // 판정은 결정론적이고(`stuck.ts`) 보수적이다 -- 사용자가 스스로 포기를
    // 말했을 때만 안 셀다. 밝기가 LLM 의 기분에 달려서는 안 되기 때문이다.
    const blocked = pendingLayer !== null && isBlockedAnswer(text);
    const nextCoverage =
      pendingLayer && !blocked ? incrementCoverage(coverage, period, pendingLayer) : coverage;
    const nextStreak = blocked ? stuckStreak + 1 : 0;
    const stuck = blocked && pendingLayer ? { layer: pendingLayer, streak: nextStreak } : null;
    // 발판을 두 번 줘도 막햘다. 이 층은 이번 대화에서 더 묻지 않는다 -- 칸은
    // 비운 채로. 안 그러면 비어 있다는 이유로 같은 층이 계속 다시 골라진다.
    const nextAbandoned =
      pendingLayer && nextStreak > MAX_SCAFFOLDS_PER_LAYER && !abandoned.includes(pendingLayer)
        ? [...abandoned, pendingLayer]
        : abandoned;

    setTurns(nextTurns);
    setCoverage(nextCoverage);
    // 포기했으면 연속 카운터도 초기화한다 -- 다음 층은 새로 시작하는 것이 맞다.
    setStuckStreak(nextAbandoned !== abandoned ? 0 : nextStreak);
    setAbandoned(nextAbandoned);
    setDraft("");
    setOpeners([]);
    setPendingLayer(null);
    if (nextTurns.filter((turn) => turn.role === "user").length >= MAX_TURNS) {
      setDone(true);
      return;
    }
    await ask(nextTurns, nextCoverage, stuck, nextAbandoned, blocked ? null : pendingLayer);
  }

  async function keepIt() {
    if (!userId || saving) return;
    setSaving(true);
    let navigating = false;
    try {
      const qLabel = locale === "ko" ? "질문" : "Q";
      const aLabel = locale === "ko" ? "답변" : "A";
      const transcript = turns
        .map((turn) => `${turn.role === "interviewer" ? qLabel : aLabel}: ${turn.text}`)
        .join("\n\n");
      await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "audit_response",
        body: transcript,
        topic: locale === "ko" ? "회상 인터뷰" : "Recall interview",
        summary:
          locale === "ko"
            ? `${userTurns}턴 회상 인터뷰`
            : `${userTurns}-turn recall interview`,
        // 옛 스크리너와 같은 태그. assess/registry.ts 가 이걸로 완료를 판정한다.
        tags: ["interview", "recall", "screener"],
        auditPeriod,
        withFollowup: false,
      });
      // 판 자리를 남긴다. **내용과 같은 동의 경로**다 -- 사용자가 담기로 했을
      // 때만 쓴다. 칸 수에는 답변 원문이 없지만, 그렇다고 담지 않기로 한 대화가
      // 별을 밝히는 것은 이 저장소의 규율과 어긋난다.
      const delta = emptyCoverage();
      for (const p of LIFE_PERIODS) {
        for (const l of DRILL_LAYERS) {
          delta[p][l] = Math.max(0, coverage[p][l] - baseCoverage.current[p][l]);
        }
      }
      await addCoverage(userId, delta);
      // 판 만큼 별이 밝아졌다면 그 변화를 원장에 남긴다. 남겨야 8주 그래프에
      // 선이 생긴다 -- 지금 등급만 있으면 "밝아지고 있다"를 보여줄 수가 없다.
      // 실패해도 조용하다(recordSevenTiers 가 삼킨다). 저장은 이미 끝났고,
      // 기록 실패로 성공한 인터뷰를 실패로 보이게 할 이유가 없다.
      void loadSevenLevels(userId).then((s) => recordSevenTiers(userId, s.starLevels));
      setToast({ tone: "success", message: t("drill.saved") });
      navigating = true;
      setTimeout(() => router.replace(`/me/${period}`), 700);
    } catch {
      setFailModal(true);
    } finally {
      if (!navigating) setSaving(false);
    }
  }

  return (
    <InterviewFrame>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, { paddingBottom: kbHeight + spacing.sm }]}
      >
        {done ? (
          <>
            <Text style={[m3TextStyle("titleLarge"), styles.saveTitle]}>{t("drill.saveTitle")}</Text>
            <Text style={[m3TextStyle("bodyMedium"), styles.saveBody]}>{t("drill.closing")}</Text>
            {/* 이만큼 팠다 -- 담을지 정하는 자리에서 보여준다.
             *
             *  대화 중에는 안 띄운다: 화면 하나에 메시지 하나라는 규율도 있고,
             *  무엇보다 **말하는 동안 채점표를 보여주면 칸을 채우려고 말하게 된다.**
             *  대화가 끝난 뒤에 보여주는 것이 정직한 순서다.
             *
             *  열은 사용자가 **살아온 시기**만(`periodIdsForAge`). LIFE_PERIODS 를
             *  그대로 그리면 스물다섯 살에게 70대 열이 보인다. */}
            <DrillProgress
              coverage={coverage}
              locale={locale}
              periods={coveredPeriods}
              activePeriod={period}
            />
            <MdCard variant="outlined" style={styles.noteCard}>
              <Text style={[m3TextStyle("bodySmall"), styles.note]}>{t("drill.saveBody")}</Text>
            </MdCard>
            <View style={styles.actions}>
              <MdButton
                label={t("approve")}
                variant="filled"
                loading={saving}
                onPress={() => void keepIt()}
                icon={<Glyph name="check" color={m3.color.onPrimary} size={18} />}
                style={styles.actionButton}
              />
            </View>
          </>
        ) : (
          <>
            {/* 세션 01 실증: 시작 규칙을 먼저 선언하면 답을 꾸미려는 압력이
                줄어든다. "모르겠다도 데이터" -- isNonAnswer 가 처리만 하고
                말은 안 하던 것을 여기서 말한다. */}
            <Text style={[m3TextStyle("bodySmall"), styles.introNote]}>{t("drill.intro")}</Text>
            {turns.map((turn, i) =>
              turn.role === "interviewer" ? (
                <View key={i} style={styles.askRow}>
                  <SecondbHead size={32} track={false} />
                  <Text style={[m3TextStyle("bodyLarge"), styles.askText]}>{turn.text}</Text>
                </View>
              ) : (
                <View key={i} style={styles.mineWrap}>
                  <MdCard variant="outlined" style={styles.mine}>
                    <Text style={[m3TextStyle("bodyMedium"), styles.mineText]}>{turn.text}</Text>
                  </MdCard>
                </View>
              ),
            )}

            {busy ? (
              <Text style={[m3TextStyle("bodySmall"), styles.thinking]}>{t("drill.thinking")}</Text>
            ) : null}
            {notice ? (
              <Text style={[m3TextStyle("bodySmall"), styles.notice]}>{notice}</Text>
            ) : null}

            {pendingLayer ? (
              <Text style={[m3TextStyle("labelMedium"), styles.turnLabel]}>
                {t("drill.turnLabel", {
                  n: userTurns + 1,
                  layer: `${PERIOD_LABEL[locale][period]} · ${LAYER_LABEL[locale][pendingLayer]}`,
                })}
              </Text>
            ) : null}

            {/* **"모르겠어요" 를 누를 수 있게 한다.**
                화면은 이미 `drill.intro` 로 "모르겠다도 데이터"라고 말하고 있었지만,
                그걸 하려면 사용자가 직접 타이핑해야 했다. 말과 자리가 어긋나 있었다.
                누르면 그대로 보내고 `isNonAnswer` 가 받는다 — 칸은 안 채우고 같은
                층에서 발판을 놓는다(#1357/#1358). 밝기는 정직하게 유지된다.
                ⚠ 알약(pill)이 아니라 사각이다. PIXEL-CLAY 는 라운드 0 이다. */}
            {pendingLayer && !busy ? (
              <View style={styles.answerChips}>
                {/* ⚠ 말문 후보는 **보내지 않고 입력창을 채운다.**
                    모델이 쓴 문장이 그대로 기록으로 남으면, 이 제품이 모으려는
                    "그 사람이 실제로 한 말" 이 아니라 "모델이 그럴듯하게 지어낸 말"
                    이 위키에 쌓인다. 고쳐 쓰라고 놓는 첫머리다. */}
                {openers.map((o) => (
                  <Pressable
                    key={o}
                    onPress={() => setDraft(o)}
                    style={styles.answerChip}
                    accessibilityRole="button"
                    accessibilityLabel={o}
                    accessibilityHint={t("drill.openerHint")}
                  >
                    <Text style={[m3TextStyle("labelMedium"), styles.answerChipText]}>{o}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => void send(t("drill.dontKnow"))}
                  style={styles.answerChip}
                  accessibilityRole="button"
                  accessibilityLabel={t("drill.dontKnow")}
                >
                  <Text style={[m3TextStyle("labelMedium"), styles.answerChipText]}>
                    {t("drill.dontKnow")}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t("drill.placeholder")}
              placeholderTextColor={m3.color.onSurfaceVariant}
              multiline
              editable={!busy}
              style={[m3TextStyle("bodyMedium"), styles.input]}
              accessibilityLabel={t("drill.placeholder")}
            />

            <View style={styles.actions}>
              <MdButton
                label={t("drill.send")}
                variant="filled"
                disabled={busy}
                onPress={() => void send()}
                icon={<Glyph name="send" color={m3.color.onPrimary} size={18} />}
                style={styles.actionButton}
              />
              {userTurns > 0 ? (
                <Pressable
                  onPress={() => setDone(true)}
                  style={[styles.answerChip, styles.actionButton]}
                  accessibilityRole="button"
                  accessibilityLabel={t("drill.enough")}
                >
                  {/* MdButton은 web에서 label을 line-clamp해 exact painted-text
                      evidence가 읽지 못한다. 이 safe action은 직접 보이는 글자를 둔다. */}
                  <Text style={[m3TextStyle("labelLarge"), styles.answerChipText]}>
                    {t("drill.enough")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}

      <PremiumModal
        visible={failModal}
        onClose={() => setFailModal(false)}
        accessibilityLabel={t("notice")}
      >
        <Text style={[m3TextStyle("titleMedium"), styles.saveTitle]}>{t("reflectError")}</Text>
        <Text style={[m3TextStyle("bodyMedium"), styles.saveBody]}>{t("reflectErrorBody")}</Text>
        {/* 다시 누르면 무엇이 일어나는지 먼저 말한다 -- 실패 뒤에 버튼만 있으면
            사용자는 대화가 날아갔는지 아닌지를 모른다. */}
        <Text style={[m3TextStyle("bodySmall"), styles.note]}>{t("retryHint")}</Text>
        <View style={styles.actions}>
          <MdButton label={t("dismiss")} variant="outlined" onPress={() => setFailModal(false)} />
          <MdButton
            label={t("tryAgain")}
            variant="filled"
            onPress={() => {
              setFailModal(false);
              void keepIt();
            }}
          />
        </View>
      </PremiumModal>

      <CrisisRouter
        visible={crisis.visible}
        hotline={crisis.hotline}
        onClose={() => setCrisis((c) => ({ ...c, visible: false }))}
      />
    </InterviewFrame>
  );
}

// 되묻기 문구 키가 실재하는지 타입 수준에서 붙잡아 둔다. `t()` 는 문자열을 받으므로
// 키가 사라져도 런타임까지 조용하다.
const _loopKeys: readonly string[] = LOOP_CHECK_KEYS;
void _loopKeys;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  routeState: { padding: spacing.md },
  lockedCard: { width: "100%", maxWidth: 480, padding: spacing.md, gap: spacing.xs },
  body: { padding: spacing.md, gap: spacing.sm },
  askRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  askText: { flex: 1, color: m3.color.onSurface },
  mineWrap: { alignItems: "flex-end" },
  mine: { maxWidth: "88%", padding: spacing.sm },
  mineText: { color: m3.color.onSurfaceVariant },
  thinking: { color: m3.color.onSurfaceVariant },
  introNote: { color: m3.color.onSurfaceVariant, marginBottom: spacing.sm, textAlign: "center" },
  notice: { color: m3.color.tertiary },
  turnLabel: { color: m3.color.onSurfaceVariant, marginTop: spacing.xs },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: m3.color.outline,
    borderRadius: m3.shape.none,
    padding: spacing.sm,
    color: m3.color.onSurface,
    textAlignVertical: "top",
  },
  // 답변 칩. **사각이다** -- PIXEL-CLAY 절대 규칙 1(곡선 없음)·라운드 0.
  // 터치타깃은 아래 `actions` 와 같은 이유로 48dp 를 못박는다.
  answerChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.xs },
  answerChip: {
    borderWidth: 1,
    borderColor: m3.color.outline,
    borderRadius: m3.shape.none,
    paddingHorizontal: spacing.sm,
    minHeight: 48,
    justifyContent: "center",
  },
  answerChipText: { color: m3.color.onSurfaceVariant },
  // 터치타깃 최소 48dp. MdButton 이 스스로 보장하더라도 이 화면에서 못박아 둔다 --
  // 대화 화면이라 버튼이 키보드 위에 붙고, 거기서 작으면 그대로 오탭이 된다.
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs, minHeight: 48 },
  actionButton: { minHeight: 48, justifyContent: "center" },
  saveTitle: { color: m3.color.onSurface },
  saveBody: { color: m3.color.onSurfaceVariant },
  noteCard: { padding: spacing.sm },
  note: { color: m3.color.onSurfaceVariant },
  toastWrap: { position: "absolute", left: 0, right: 0, bottom: spacing.lg, alignItems: "center" },
});
