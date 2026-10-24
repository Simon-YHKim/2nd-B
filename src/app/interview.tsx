import { PhonePressable as Pressable, PhoneScrollView as ScrollView, PhoneTextInput as TextInput, PhoneView as View } from "@/components/phone/PhoneUIKit";
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
// 표식(`interview`/`recall`/`screener`/`entry-ui:<locale>`)과 `kind`, `auditPeriod` 는
// 그대로 둔다. `assess/registry.ts` 의 `interview` 항목이 그 표식으로 완료를 판정하고,
// 옛 스크리너로 남긴 기록과 같은 서랍에 들어가야 한다. 0218(Q-261004-39 = A) 부터
// 표식은 사용자 태그 칸(`tags`)이 아니라 앱 표식 칸(`records.system_tags`)에 쓴다 —
// /discover · /research 가 `interview` 를 사용자의 주제로 보여 주지 않게.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState, PremiumModal, PremiumToast } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { ProfileProbeRetryScreen } from "@/components/deep-space/ProfileProbeRetry";
import { PastMeErasView } from "@/components/deep-space/DeepSpaceViews";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { InterviewGuidanceRow } from "@/components/interview/InterviewGuidanceRow";
import { resolveProbeGuidanceCopy } from "@/lib/interview/probe-guidance-copy";
import type { ScrollRevealRequest } from "@/lib/nav/scroll-memory";
import type { HotlineId } from "@/lib/safety/lexicon";
import { classifyInputAnyLocale } from "@/lib/safety/classifier";
import { publishCrisisNotice } from "@/lib/safety/crisis-notice";
import { startInterviewCrisisRouting } from "@/lib/llm/boundary";
import { useAuth } from "@/lib/auth/AuthContext";
import { accountTransitionSnapshot, captureAccountOwnerLease, subscribeAccountTransition, type AccountOwnerLease } from "@/lib/auth/account-epoch";
import { useAppRouter, useScreenParams } from "@/lib/nav/phone-embed";
import { useGoHomeStop } from "@/lib/nav/go-home";
import { livedPeriods, resolveInterviewRoutePeriod } from "@/lib/interview/periods";
import { DrillProgress } from "@/components/ui/DrillProgress";
import { isNonAnswer, scaffoldQuestion, failedAttemptMove } from "@/lib/interview/stuck";
import { answerDisposition, canCreditAnswer, confirmedAnswer, currentScene } from "@/lib/interview/continuity";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { createRecord } from "@/lib/records/create";
import { recallInterviewSystemTags } from "@/lib/records/system-tags";
import { addCoverage, loadCoverage } from "@/lib/interview/coverage-store";
import { loadSevenLevels } from "@/lib/persona/load-seven-levels";
import { starEntryStatus, type StarEntryStatus } from "@/lib/persona/star-entry-tracks";
import { recordSevenTiers } from "@/lib/persona/seven-tier-history";
import { m3 } from "@/lib/theme/m3";
import { spacing } from "@/lib/theme/tokens";
import {
  seedQuestion,
  emptyCoverage,
  DRILL_LAYERS,
  LIFE_PERIODS,
  incrementCoverage,
  nextMove,
  nextProbe,
  sceneStatus,
  failedAttempts,
  acceptQuestion,
  choiceAvailability,
  type SceneChoiceReason,
  type AcceptedQuestion,
  type Coverage,
  type DrillLayer,
  type InterviewTurn,
  type LifePeriod,
  type ProbeResult,
} from "@/lib/interview/probe";
import { LOOP_CHECK_KEYS, type ReflectionEntry } from "@/lib/interview/loop-check";
import { INTERVIEW_PURPOSE, localPromptsExhausted, readDayLimitRefusal } from "@/lib/interview/session-end";
import { interviewAnswerLabel, storedTurns, storyTitle } from "@/lib/interview/saved-story";
import { isUneditedOpener, type OpenerSelection } from "@/lib/interview/opener-selection";
import { RECORD_SAVE_CUE, saveCueAllowed } from "@/lib/audio/app-cues";
import { isRecordingAudioMode } from "@/lib/audio/audio-session";
import { useUiSound } from "@/lib/audio/use-ui-sound";

// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
// 원래 이 자리에 문자열 SVG 레지스트리가 있었다(저장소에서 열하나 번째).
function Glyph({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  return <PixelGlyph name={canonGlyph(name)} color={color} size={size} />;
}

// 턴 상한은 없다 (Simon 결정 2026-10-05). 여기 있던 `MAX_TURNS = 12` 는 답이 12개가
// 되면 대화를 끊었다. 깊은 이야기가 언제 끝날지는 화면이 정할 수 없다.
// 대화는 사용자가 끝내거나, 한 장면을 다 팠거나, 서버가 오늘 몫이 찼다고 거절할 때
// 끝난다. 마지막 것도 오류가 아니라 끝맺음이다. 이유와 응답 모양은
// `lib/interview/session-end.ts` 에 있다. 비용은 그 서버 한도가 막는다.

function InterviewFrame({ children }: { children: ReactNode }) {
  // Phone-aware: inside the dashboard phone, back steps the phone's stack.
  const router = useAppRouter();
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
  // Inside the dashboard phone these come from the phone route
  // (/interview?period=now), not from /dashboard's query.
  const { period: periodParam, origin: originParam } = useScreenParams<{
    period?: string | string[];
    origin?: string | string[];
  }>();
  const growthOrigin = (Array.isArray(originParam) ? originParam[0] : originParam) === "domain-growth";
  const { userId, loading, hasProfile, profileProbeFailed, age } = useAuth();
  // 이 화면은 프로필을 스스로 다시 묻지 않는다. 여기 있던 백오프 루프(2초에서 30초 상한,
  // 성공할 때까지)는 refresh() 안의 한도 재시도(profile-probe.ts, 시계 차이 최대 2회)를
  // 매번 새로 시작해 총 시도 수를 끝없이 만들었다(vibe r260914 게이트 발견). 자동 재시도는
  // 그 한도 하나가 갖고, 그 뒤는 사람이 누르는 다시 시도다.

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
  // 완료 프로필로 내보내지 않는다. 로더에 가두지도 않는다 - 오류 문구와 다시 시도를
  // 보인다. 같은 모양(실패와 대기를 한 갈래로 묶은 것)이 /account · /data 에서 끝나지
  // 않는 로딩이 됐다(T1a 항목 2).
  // InterviewFrame 은 도크를 단다. 모름에서는 기능 라우트로 가는 도크를 두지 않는다.
  if (profileProbeFailed) return <ProfileProbeRetryScreen title={t("title")} />;
  if (hasProfile === null) {
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
  return (
    <TrackGatedInterview
      key={`${resolution.period}:${growthOrigin ? "domain-growth" : "default"}`}
      period={resolution.period}
      growthOrigin={growthOrigin}
      userId={userId}
      age={age}
    />
  );
}

function TrackGatedInterview({
  period,
  growthOrigin,
  userId,
  age,
}: {
  period: LifePeriod;
  growthOrigin: boolean;
  userId: string;
  age: number | null;
}) {
  const { t, i18n } = useTranslation("interview");
  const { isMinor } = useAuth();
  const ownerSnapshot = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const { t: homeT } = useTranslation("home");
  const [entry, setEntry] = useState<StarEntryStatus | null>(null);

  useEffect(() => {
    let alive = true;
    setEntry(null);
    void loadSevenLevels(userId).then(({ starLevels }) => {
      if (alive) setEntry(starEntryStatus(period, starLevels, age));
    });
    return () => { alive = false; };
  }, [userId, period, age]);

  if (!entry) {
    return <InterviewFrame><View style={styles.center}><PremiumLoadingState message={t("loading")} /></View></InterviewFrame>;
  }
  if (entry.kind !== "available") {
    return (
      <InterviewFrame>
        <View style={[styles.center, styles.routeState]}>
          <MdCard variant="outlined" style={styles.lockedCard}>
            <Text style={[m3TextStyle("titleMedium"), styles.saveTitle]}>{homeT(`ds.star.${period}`)}</Text>
            <Text style={[m3TextStyle("bodyMedium"), styles.note]}>
              {entry.kind === "unlived"
                ? homeT("ds.star.lockedBody")
                : homeT("ds.home.star.entryAfter", { star: homeT(`ds.star.${entry.prerequisite}`) })}
            </Text>
          </MdCard>
        </View>
      </InterviewFrame>
    );
  }
  // A context change replaces every session ref and flow together, including ABA.
  return <InterviewSession key={JSON.stringify([userId, period, i18n.language, isMinor, growthOrigin, ownerSnapshot])}
    period={period} growthOrigin={growthOrigin} />;
}

interface InterviewGuidanceDelivery {
  readonly requestId: number;
  readonly guidance: NonNullable<ProbeResult["guidance"]>;
  readonly owner: AccountOwnerLease;
  readonly instance: number;
  readonly locale: string;
  readonly token: object;
  readonly ready: boolean;
}

export interface SceneFrame {
  turns: InterviewTurn[]; coverage: Coverage; pendingLayer: DrillLayer | null; openers: string[];
  abandoned: DrillLayer[]; concreteOnly: boolean; stuckStreak: number; draft: string;
  openerSelection?: OpenerSelection;
  /** A completed scene's more question returns after its first safe adjudication. */
  returnToChoice?: boolean;
}
interface FlowStamp {
  owner: AccountOwnerLease; instance: number; context: object; revision: number; epoch: number; history: InterviewTurn[];
}
interface OrdinaryAction extends FlowStamp {
  token: object; snapshot: SceneFrame; draftRevision: number;
}
export type InterviewChoice = ({ kind: "sceneChoice"; reason: SceneChoiceReason }
  | { kind: "stuckChoice"; layer: DrillLayer; attempts: 2 }) & {
  generation: object; snapshot: SceneFrame; action: OrdinaryAction | null;
};
type AskOutcome = "question" | "scene-choice" | "stuck-choice" | "limited" | "failed" | "stale" | "crisis" | "finished";
type AskRequest = { kind: "answer"; index: number; layer: DrillLayer | null }
  | { kind: "question-only"; actionKind: "more" | "skip-layer"; choice: InterviewChoice; target: DrillLayer; proposedAbandoned: DrillLayer[] };
interface SaveIntent extends FlowStamp {
  token: object; frame: SceneFrame; delta: Coverage; endedAtStart: boolean;
  input: Parameters<typeof createRecord>[0]; period: LifePeriod; growthOrigin: boolean;
}
export type SaveReceipt = { phase: "idle" } | ({ intent: SaveIntent; continuation: "live" | "interrupted" } & (
  | { phase: "recordPending"; record: "inFlight" | "unknown" }
  | { phase: "coveragePending"; recordId: string; coverage: "ready" | "inFlight" | "retryable" | "unknown"; attemptToken?: object }
  | { phase: "committed"; recordId: string; coverage: "upsert" | "zero-delta"; effectsStarted: boolean }
));
export interface InterviewFlow {
  revision: number; action: OrdinaryAction | null; choice: InterviewChoice | null;
  receipt: SaveReceipt; crisisLatched: boolean; crisisEpoch: number;
  returnToChoice?: boolean;
}
type ViewState = { mode: "inactive" | "crisis-ended" | "legacy-ended" | "choosing" | "active" };
function projectMode(current: boolean, crisis: boolean, ended: boolean, done: boolean, choice: InterviewChoice | null): ViewState {
  if (!current) return { mode: "inactive" };
  if (crisis) return { mode: "crisis-ended" };
  if (ended || done) return { mode: "legacy-ended" };
  return { mode: choice ? "choosing" : "active" };
}

function InterviewSession({ period, growthOrigin }: { period: LifePeriod; growthOrigin: boolean }) {
  // Phone-aware: inside the dashboard phone, the post-save return to the star
  // summary replaces the phone's screen instead of the app's route.
  const router = useAppRouter();
  const { t, i18n } = useTranslation("interview");
  const { t: homeT } = useTranslation("home");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "ko" | "en";
  // 기록에 남기는 시기도 같은 id 로 쓴다. Growth 렌즈가 이 값을 생애 장의 정본으로
  // 읽고, 값이 없는 일반 성장 기록만 created_at 연대로 되돌아간다. 옛 행의
  // `20s`·`teens` 값은 렌즈 쪽 호환표가 새 id로 읽는다.
  const auditPeriod: string = period;

  const { userId, isMinor, age } = useAuth();
  const kbHeight = useKeyboard();

  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  // A local question change and a send can arrive from the same old render.
  // Claim the new question synchronously, then reconcile at the commit.
  const turnsOwnerRef = useRef(turns);
  useLayoutEffect(() => { turnsOwnerRef.current = turns; }, [turns]);
  const [coverage, setCoverage] = useState<Coverage>(emptyCoverage);
  /** 이 세션을 시작할 때 이미 저장돼 있던 행렬. 저장할 때 **이번에 판 만큼만**
   *  더하기 위해 남겨둔다(0143). ref 인 이유는 렌더를 유발할 값이 아니라서다. */
  const baseCoverage = useRef<Coverage>(emptyCoverage());
  /** 현재 층에서 연속으로 못 답한 횟수. 답하면 0 으로 돌아간다. */
  const [stuckStreak, setStuckStreak] = useState(0);
  /** 두 번 시도한 뒤 사용자가 건너뛰기로 골라, 이 장면에서 더 묻지 않을 층들.
   *
   *  칸을 안 채우는 것만으로는 부족했다(실측) -- "가장 먼저 비어 있는 칸" 규칙이
   *  바로 그 칸을 다시 집어서 같은 질문이 계속 나갔다. 밝기는 정직하게 비워두고,
   *  묻기만 멈춘다. */
  const [abandoned, setAbandoned] = useState<DrillLayer[]>([]);
  /** 이 사용자에게 해당되는 시기. 진행 행렬의 열이 된다. */
  const coveredPeriods = useMemo(() => livedPeriods(age), [age]);
  const [draft, setDraft] = useState("");
  const draftEditRevision = useRef(0);
  const openerSelection = useRef<OpenerSelection | undefined>(undefined);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pendingLayer, setPendingLayer] = useState<DrillLayer | null>(null);
  /** 이번 질문에 딸린 **말문 후보**. 누르면 보내지 않고 입력창을 채운다. */
  const [openers, setOpeners] = useState<string[]>([]);
  const [doneState, setDone] = useState(false);
  const ended = useRef(false);
  const mounted = useRef(true);
  const interviewInstance = useRef(0);
  const probeRequest = useRef(0);
  const sessionOwner = useRef(userId ? captureAccountOwnerLease(userId) : null);
  const contextKey = JSON.stringify([userId, period, locale, i18n.language, isMinor, growthOrigin]);
  const contextRef = useRef({ key: contextKey });
  if (contextRef.current.key !== contextKey) contextRef.current = { key: contextKey };
  const sessionContext = useRef(contextRef.current);
  const [guidanceDelivery, setGuidanceDelivery] = useState<InterviewGuidanceDelivery | null>(null);
  const guidanceRef = useRef<InterviewGuidanceDelivery | null>(null);
  const lastGuidanceRequest = useRef(0);
  const guidanceScroll = useRef<{ pending: object | null; accepted: object | null }>({ pending: null, accepted: null });
  const ownerSnapshot = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const isGuidanceCurrent = useCallback((delivery: InterviewGuidanceDelivery) => delivery.owner.isCurrent()
    && mounted.current && interviewInstance.current === delivery.instance && guidanceRef.current?.token === delivery.token
    && sessionContext.current === contextRef.current, []);
  const guidanceDisplay = (() => {
    if (!guidanceDelivery || !isGuidanceCurrent(guidanceDelivery)) return null;
    try {
      const copy = resolveProbeGuidanceCopy(guidanceDelivery.guidance, guidanceDelivery.locale);
      return copy.kind === "ready" ? { delivery: guidanceDelivery, copy } : null;
    } catch { return null; }
  })();
  const markGuidanceReady = useCallback(() => {
    if (!guidanceDisplay || !isGuidanceCurrent(guidanceDisplay.delivery) || guidanceDisplay.delivery.ready) return;
    const ready = { ...guidanceDisplay.delivery, ready: true };
    guidanceRef.current = ready;
    setGuidanceDelivery(previous => isGuidanceCurrent(ready) && previous?.token === ready.token ? ready : previous);
  }, [guidanceDisplay, isGuidanceCurrent]);
  const dismissGuidance = useCallback(() => {
    if (!guidanceDisplay || !isGuidanceCurrent(guidanceDisplay.delivery)) return;
    const token = guidanceDisplay.delivery.token;
    guidanceRef.current = null;
    guidanceScroll.current.pending = null;
    setGuidanceDelivery(previous => previous?.token === token ? null : previous);
  }, [guidanceDisplay, isGuidanceCurrent]);
  const cancelGuidanceReveal = useCallback(() => {
    if (guidanceDisplay && isGuidanceCurrent(guidanceDisplay.delivery)) guidanceScroll.current.pending = null;
  }, [guidanceDisplay, isGuidanceCurrent]);
  const priorityReveal: ScrollRevealRequest | null = guidanceDisplay ? {
    token: guidanceDisplay.delivery.token, target: { x: 0, y: 0 }, ready: guidanceDisplay.delivery.ready,
    isCurrent: () => isGuidanceCurrent(guidanceDisplay.delivery),
    onRevealed: cancelGuidanceReveal,
  } : null;
  useLayoutEffect(() => {
    const delivery = guidanceRef.current;
    if (delivery && !isGuidanceCurrent(delivery)) {
      guidanceRef.current = null; guidanceScroll.current = { pending: null, accepted: null };
      lastGuidanceRequest.current = 0;
      setGuidanceDelivery(previous => previous?.token === delivery.token ? null : previous);
    }
  }, [ownerSnapshot, isGuidanceCurrent]);
  const [concreteOnly, setConcreteOnly] = useState(false);
  const [coverageReady, setCoverageReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const playSaveCue = useUiSound(RECORD_SAVE_CUE.source, RECORD_SAVE_CUE);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const [failModal, setFailModal] = useState(false);
  /** 저장 화면의 표("이만큼 팠다")는 접어 둔다 (Simon 결정 Q-261013-52). */
  const [tableOpen, setTableOpen] = useState(false);
  const crisisRouting = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const flowRef = useRef<InterviewFlow>({ revision: 0, action: null, choice: null,
    receipt: { phase: "idle" }, crisisLatched: false, crisisEpoch: 0 });
  const [choice, setChoice] = useState<InterviewChoice | null>(null);
  const [saveReceipt, setSaveReceipt] = useState<SaveReceipt>({ phase: "idle" });

  function sessionCurrent() {
    return Boolean(sessionOwner.current?.isCurrent()) && mounted.current && sessionContext.current === contextRef.current;
  }
  function frameSnapshot(): SceneFrame {
    return { turns, coverage, pendingLayer, openers, abandoned, concreteOnly, stuckStreak, draft,
      openerSelection: openerSelection.current,
      returnToChoice: flowRef.current.returnToChoice };
  }
  function stampCurrent(stamp: FlowStamp, revision = stamp.revision) {
    return stamp.owner.isCurrent() && sessionCurrent() && interviewInstance.current === stamp.instance
      && contextRef.current === stamp.context && flowRef.current.revision === revision
      && turnsOwnerRef.current === stamp.history
      && flowRef.current.crisisEpoch === stamp.epoch && !flowRef.current.crisisLatched;
  }
  function actionCurrent(action: OrdinaryAction) {
    return stampCurrent(action) && flowRef.current.action?.token === action.token && !ended.current;
  }
  function beginAction(snapshot = frameSnapshot()): OrdinaryAction | null {
    const flow = flowRef.current;
    if (!sessionCurrent() || ended.current || flow.crisisLatched || flow.action || flow.receipt.phase !== "idle"
      || turnsOwnerRef.current !== turns) return null;
    const owner = userId ? captureAccountOwnerLease(userId) : null;
    if (!owner) return null;
    const action: OrdinaryAction = { owner, instance: interviewInstance.current, context: contextRef.current,
      revision: ++flow.revision, epoch: flow.crisisEpoch, history: snapshot.turns, token: {}, snapshot, draftRevision: draftEditRevision.current };
    flow.action = action;
    return action;
  }
  function releaseAction(action: OrdinaryAction) {
    if (!actionCurrent(action)) return;
    flowRef.current.action = null;
    sending.current = false;
    const revision = action.revision;
    setBusy(previous => stampCurrent(action, revision) && !ended.current ? false : previous);
  }
  function commitFrame(action: OrdinaryAction, frame: SceneFrame, nextChoice: InterviewChoice | null = null) {
    if (!actionCurrent(action)) return false;
    const revision = ++flowRef.current.revision;
    action.revision = revision;
    action.history = frame.turns;
    turnsOwnerRef.current = frame.turns;
    flowRef.current.choice = nextChoice;
    flowRef.current.returnToChoice = frame.returnToChoice;
    const current = () => stampCurrent(action, revision) && !ended.current;
    if (draftEditRevision.current === action.draftRevision) {
      openerSelection.current = isUneditedOpener(frame.openerSelection, frame.draft, frame.turns, frame.openers)
        ? frame.openerSelection : undefined;
    }
    setTurns(previous => current() ? frame.turns : previous);
    setCoverage(previous => current() ? frame.coverage : previous);
    setPendingLayer(previous => current() ? frame.pendingLayer : previous);
    setOpeners(previous => current() ? frame.openers : previous);
    setAbandoned(previous => current() ? frame.abandoned : previous);
    setConcreteOnly(previous => current() ? frame.concreteOnly : previous);
    setStuckStreak(previous => current() ? frame.stuckStreak : previous);
    setChoice(previous => current() ? nextChoice : previous);
    setDraft(previous => current() && draftEditRevision.current === action.draftRevision ? frame.draft : previous);
    return true;
  }
  function showChoice(action: OrdinaryAction, frame: SceneFrame,
    decision: { kind: "sceneChoice"; reason: SceneChoiceReason } | { kind: "stuckChoice"; layer: DrillLayer; attempts: 2 }): AskOutcome {
    const snapshot = { ...frame, pendingLayer: null, openers: [], returnToChoice: false };
    const next: InterviewChoice = { ...decision, generation: {}, snapshot, action: null };
    commitFrame(action, snapshot, next);
    return decision.kind === "sceneChoice" ? "scene-choice" : "stuck-choice";
  }
  function acceptIntoFrame(action: OrdinaryAction, frame: SceneFrame, accepted: AcceptedQuestion): AskOutcome {
    if (accepted.kind !== "question") return showChoice(action, frame, { kind: "sceneChoice", reason:
      accepted.kind === "noEligible" ? "no-eligible" : accepted.kind === "questionExhausted" ? "question-exhausted" : "local-prompts-exhausted" });
    commitFrame(action, { ...frame, turns: [...frame.turns, { role: "interviewer", text: accepted.question,
      layer: accepted.pendingLayer, period }], pendingLayer: accepted.pendingLayer, openers: accepted.openers,
      stuckStreak: failedAttempts(frame.turns, accepted.pendingLayer, locale) });
    return "question";
  }
  function latchCrisis() {
    flowRef.current.crisisLatched = true;
    flowRef.current.crisisEpoch += 1;
    const receipt = flowRef.current.receipt;
    if (receipt.phase !== "idle") receipt.continuation = "interrupted";
  }
  function availableChoices(selected = flowRef.current.choice) {
    return choiceAvailability({ kind: selected?.kind ?? "sceneChoice",
      reason: selected?.kind === "sceneChoice" ? selected.reason : undefined,
      eligible: selected ? sceneStatus(selected.snapshot.turns, period, locale, selected.snapshot.abandoned, selected.snapshot.concreteOnly).eligible : [],
      hasUserTurns: Boolean(selected?.snapshot.turns.some(turn => turn.role === "user")),
      locked: !sessionCurrent() || ended.current || flowRef.current.crisisLatched || Boolean(flowRef.current.action)
        || flowRef.current.receipt.phase !== "idle" });
  }
  const view = projectMode(sessionCurrent(), flowRef.current.crisisLatched, ended.current, doneState, choice);
  const done = view.mode === "legacy-ended";
  const choices = availableChoices(choice);
  const inputLocked = view.mode !== "active" || busy || saving || saveReceipt.phase !== "idle" || !coverageReady;

  // 위 칸의 홈 이동(RedirectHome · 탭 루트 하드웨어 뒤로)은 걷히면 잃는 것이 있는
  // 동안 여기서 멈춘다(게이트 NAV-S7-01). 대화(turns)와 쓰던 답(draft)은 이 화면의
  // 상태이고 '담기'를 눌러야 저장된다. 나가 있는 질문 요청 · 저장 요청, 그리고
  // 안전 안내 창은 AppCrisisHost가 화면 이동 뒤에도 이어서 보여 준다.
  useGoHomeStop(
    () => busy || saving || draft.trim() !== "" || turns.some((turn) => turn.role === "user"),
  );

  const finish = useCallback(() => {
    ended.current = true;
    setBusy(false);
    setDone(true);
    setPendingLayer(null);
    setOpeners([]);
  }, []);

  useEffect(() => {
    interviewInstance.current += 1;
    ended.current = false;
    mounted.current = true;
    return () => {
      ended.current = true; mounted.current = false;
      guidanceRef.current = null; guidanceScroll.current = { pending: null, accepted: null };
    };
  }, []);

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

  // 모델에 보내지 않고 화면이 발판으로 받는 답인가. `send()` 가 이걸로 막힘을 정하고,
  // 건너뛰기 가드도 **같은 판정**으로 그런 답을 답으로 세지 않는다(session-end.ts).
  // 둘이 갈라지면 "모르겠어요 → 건너뛰기" 교대가 다시 끝없이 길어진다(F2049-02).
  const isLocalNonAnswer = useCallback(
    (text: string, layer: DrillLayer | null | undefined): boolean =>
      layer != null && (isBlockedAnswer(text) || !canCreditAnswer(text, layer, locale)),
    [isBlockedAnswer, locale],
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

  async function ask(
    history: InterviewTurn[], cov: Coverage,
    stuck: { layer: DrillLayer; streak: number } | null = null,
    giveUp: DrillLayer[] = [], credited: DrillLayer | null = null,
    suppliedAction?: OrdinaryAction, suppliedRequest?: AskRequest,
  ): Promise<AskOutcome> {
    const action = suppliedAction ?? beginAction();
    if (!action) return "stale";
    const request: AskRequest = suppliedRequest ?? { kind: "answer", index: history.length - 1, layer: credited };
    const owner = action.owner;
    const instance = action.instance;
    guidanceScroll.current.accepted = null;
    let requestId: number | undefined;
    let redSeen = false;
    let redPublicationAttempted = false;
    let settled = false;
    const isCurrentRequest = () => actionCurrent(action)
      && (requestId === undefined || probeRequest.current === requestId);
    const canAcceptGuidance = () => isCurrentRequest() && !redSeen && !settled;
    const deliverRed = (hotline: HotlineId | undefined) => {
      if (settled || !owner.isCurrent()) return;
      redSeen = true;
      if (redPublicationAttempted) return;
      redPublicationAttempted = true;
      latchCrisis();
      try { if (!publishCrisisNotice(owner, hotline ?? hotlineFor())) return; }
      catch { /* Notice subscribers cannot reopen the ordinary continuation. */ }
      if (owner.isCurrent() && mounted.current && interviewInstance.current === instance && !ended.current) finish();
    };
    setBusy(true);
    setNotice(null);
    const frame: SceneFrame = { ...action.snapshot, turns: history, coverage: cov, abandoned: giveUp,
      draft: request.kind === "answer" ? "" : action.snapshot.draft,
      returnToChoice: request.kind === "question-only" ? request.actionKind === "more" : action.snapshot.returnToChoice };
    const returnAfterMore = (): AskOutcome | null => {
      if (!frame.returnToChoice) return null;
      frame.returnToChoice = false;
      const status = sceneStatus(frame.turns, period, locale, frame.abandoned, frame.concreteOnly);
      return status.kind === "incomplete" ? null : showChoice(action, frame,
        { kind: "sceneChoice", reason: status.kind === "noEligible" ? "no-eligible" : status.reason });
    };
    const local = (target: DrillLayer, candidate?: ProbeResult, localQuestion?: string, scaffoldStreak?: number) =>
      acceptQuestion({ candidate, target,
        eligible: sceneStatus(frame.turns, period, locale, frame.abandoned, frame.concreteOnly).eligible,
        policy: frame.concreteOnly ? "local-fact" : "assigned-target", history: frame.turns, locale,
        localGuard: localPromptsExhausted(frame.turns, turn => isLocalNonAnswer(turn.text, turn.layer)),
        localQuestion, scaffoldStreak });
    try {
      if (!isCurrentRequest()) return "stale";
      const move = nextMove(cov, period, entriesOf(history), new Date(), stuck, giveUp, {
        history, locale, concreteOnly: frame.concreteOnly,
        bypassCompletionOnce: request.kind === "question-only" && request.actionKind === "more",
      });
      if (request.kind === "answer" && stuck) {
        frame.stuckStreak = failedAttempts(history, stuck.layer, locale);
        const failure = failedAttemptMove(stuck.layer, frame.stuckStreak);
        if (failure?.kind === "stuckChoice") return showChoice(action, frame, failure);
        const completedMore = returnAfterMore();
        if (completedMore) return completedMore;
        return acceptIntoFrame(action, frame, local(stuck.layer, undefined, scaffoldQuestion(stuck.layer, locale, 1), 1));
      }
      // Question-only never adjudicates an old answer. Concrete more is entirely local.
      const target = request.kind === "question-only" ? request.target
        : move.kind === "drill" || move.kind === "scaffold" ? move.layer : credited ?? "fact";
      if (request.kind === "question-only" && frame.concreteOnly) return acceptIntoFrame(action, frame, local("fact"));
      requestId = ++probeRequest.current;
      const probe = await nextProbe(userId!, locale, period, history, cov, isMinor === true,
        0, target, deliverRed, { isMinor, isCurrent: canAcceptGuidance }, { includeQuestionSource: true });
      if (!owner.isCurrent()) return "stale";
      if (probe.zone === "red") { deliverRed(probe.hotline); return "crisis"; }
      if (redSeen || flowRef.current.crisisLatched) return "crisis";
      if (!isCurrentRequest()) return ended.current ? "finished" : "stale";
      if (probe.guidance && canAcceptGuidance() && lastGuidanceRequest.current !== requestId) {
        let ready = false;
        try { ready = resolveProbeGuidanceCopy(probe.guidance, locale).kind === "ready"; } catch { /* No raw fallback. */ }
        if (ready && canAcceptGuidance()) {
          const delivery: InterviewGuidanceDelivery = { requestId, guidance: probe.guidance, owner,
            instance, locale, token: {}, ready: false };
          lastGuidanceRequest.current = requestId;
          guidanceRef.current = delivery;
          guidanceScroll.current = { pending: delivery.token, accepted: delivery.token };
          setGuidanceDelivery(previous => isGuidanceCurrent(delivery) ? delivery : previous);
        }
      }
      if (!canAcceptGuidance()) return "stale";
      if (request.kind === "answer") {
        const lastAnswer = history[request.index];
        const confirmed = credited && lastAnswer ? confirmedAnswer(lastAnswer.text, credited, locale, probe.answeredLayer) : false;
        const otherLayer = credited && probe.answeredLayer != null && probe.answeredLayer !== credited;
        frame.turns = history.map((turn, index) => index === request.index && turn.role === "user"
          ? { ...turn, answered: otherLayer ? null : Boolean(confirmed) } : turn);
        // Stage credit with this frame; commitFrame applies it behind the same revision fence.
        const setCoverage = (next: Coverage) => { frame.coverage = next; };
        if (credited && confirmed) setCoverage(incrementCoverage(cov, period, credited));
        if (credited) frame.stuckStreak = failedAttempts(frame.turns, credited, locale);
        if (credited && !otherLayer && !confirmed) {
          const failure = failedAttemptMove(credited, frame.stuckStreak);
          if (failure?.kind === "stuckChoice") return showChoice(action, frame, failure);
        }
        const completedMore = returnAfterMore();
        if (completedMore) return completedMore;
        if (credited && otherLayer) return acceptIntoFrame(action, frame, local(credited));
        if (credited && !confirmed) {
          return acceptIntoFrame(action, frame, local(credited, undefined, scaffoldQuestion(credited, locale, 1), 1));
        }
        const status = sceneStatus(frame.turns, period, locale, frame.abandoned, frame.concreteOnly);
        if (status.kind === "noEligible") return showChoice(action, frame, { kind: "sceneChoice", reason: "no-eligible" });
        if (status.kind === "complete") return showChoice(action, frame, { kind: "sceneChoice", reason: status.reason });
        return acceptIntoFrame(action, frame, local(status.target, probe));
      }
      return acceptIntoFrame(action, frame, local(request.target, probe));
    } catch (error) {
      if (!isCurrentRequest() || redSeen) return ended.current ? "finished" : "stale";
      const limited = await readDayLimitRefusal(error, INTERVIEW_PURPOSE);
      if (!isCurrentRequest() || redSeen) return ended.current ? "finished" : "stale";
      if (request.kind === "question-only") {
        commitFrame(action, request.choice.snapshot, { ...request.choice, action: null });
      } else if (limited) {
        commitFrame(action, action.snapshot);
        const revision = action.revision;
        setDraft(previous => stampCurrent(action, revision) && !ended.current
          && draftEditRevision.current === action.draftRevision ? action.snapshot.draft : previous);
      } else {
        commitFrame(action, { ...frame, turns: history.map((turn, index) => index === request.index && turn.role === "user"
          ? { ...turn, answered: undefined, unsettled: true } : turn), pendingLayer: credited });
      }
      const revision = action.revision;
      setNotice(previous => stampCurrent(action, revision) && !ended.current ? t(limited ? "drill.dayLimit" : "drill.failed") : previous);
      return limited ? "limited" : "failed";
    } finally {
      settled = true;
      releaseAction(action);
    }
  }

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
    const initialTurns: InterviewTurn[] = [{ role: "interviewer", text: seedQuestion(period, locale), layer: "fact", period, sceneStart: true }];
    turnsOwnerRef.current = initialTurns;
    setTurns(initialTurns);
    setPendingLayer("fact");
    // 지난 세션까지 판 자리를 이어받는다. 안 그러면 매번 처음부터 다시 파고,
    // 등급은 한 세션 안에서만 오르내린다(그게 지금까지의 상태였다).
    const owner = captureAccountOwnerLease(userId);
    const instance = interviewInstance.current;
    const context = contextRef.current;
    const current = () => Boolean(owner?.isCurrent()) && mounted.current && interviewInstance.current === instance
      && contextRef.current === context && !flowRef.current.crisisLatched;
    void loadCoverage(userId).then((stored) => {
      if (!current()) return;
      baseCoverage.current = stored;
      setCoverage(previous => current() ? stored : previous);
      setCoverageReady(previous => current() ? true : previous);
    });
  }, [userId, period, locale]);

  const scrollToLatest = useCallback(() => {
    if (turns.length > 0 && !guidanceScroll.current.pending && !guidanceScroll.current.accepted) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [turns.length]);
  useEffect(scrollToLatest, [scrollToLatest]);

  const userTurns = turns.filter((turn) => turn.role === "user").length;

  function editDraft(value: string) {
    if (flowRef.current.receipt.phase !== "idle" || flowRef.current.choice || ended.current || !sessionCurrent()) return;
    openerSelection.current = undefined;
    draftEditRevision.current += 1;
    setDraft(value);
  }

  function selectOpener(index: number) {
    if (!pendingLayer || busy || sending.current || flowRef.current.action || turnsOwnerRef.current !== turns
      || flowRef.current.receipt.phase !== "idle" || flowRef.current.choice || ended.current || !sessionCurrent()) return;
    const text = openers[index];
    if (typeof text !== "string") return;
    const selection = { questionIndex: turns.length - 1, questionText: turns.at(-1)?.text ?? "", openerIndex: index, text };
    if (!isUneditedOpener(selection, text, turns, openers)) return;
    editDraft(text);
    openerSelection.current = selection;
  }

  // `override` 는 답변 칩이 쓴다. 칩을 누르면 `setDraft` 후 `send()` 를 부르는 대신
  // 곧바로 그 말을 보낸다 — 상태 갱신은 다음 렌더에나 반영돼서, 그 사이에 보내면
  // 직전 draft(대개 빈 문자열)가 나간다.
  async function send(override?: string) {
    if (!userId || !sessionCurrent()) return;
    const text = (override ?? draft).trim();
    const ordinaryLocked = ended.current || busy || sending.current || !coverageReady || flowRef.current.action || flowRef.current.choice
      || flowRef.current.receipt.phase !== "idle" || turnsOwnerRef.current !== turns;
    if (text.length === 0) {
      if (!ordinaryLocked) setNotice(t("drill.emptyAnswer"));
      return;
    }
    // C9: `isNonAnswer`보다 먼저 양쪽 언어를 분류한다. "죽고 싶어요. 모르겠어요"
    // 같은 입력을 단순 막힘으로 보고 로컬 발판으로 보내면 crisis 경로를 건너뛴다.
    // red는 기존 routeCrisis를 거쳐 필수 audit/event 원장을 쓴 뒤 핫라인으로 끝낸다.
    // coverage·nextMove·nextProbe는 건드리지 않는다.
    const safety = classifyInputAnyLocale(text, locale, { minor: isMinor === true });
    if (safety.zone === "red") {
      if (flowRef.current.crisisLatched) return;
      const owner = captureAccountOwnerLease(userId);
      if (!owner) return;
      const route = startInterviewCrisisRouting(
        crisisRouting,
        { text, locale, userId, minor: isMinor === true },
        () => {
          // The answer stays outside the saved transcript until the separate
          // crisis-save AI hold is wired; this route must not add AI egress.
          latchCrisis();
          finish();
          publishCrisisNotice(owner, safety.crisisRouting?.hotline ?? hotlineFor());
        },
        () => {},
      );
      if (route.started) {
        // The guidance is already visible even if a safety-ledger write fails.
        void route.done.catch(() => {
          if (owner.isCurrent() && mounted.current) setNotice(t("drill.failed"));
        });
      }
      return;
    }
    if (ordinaryLocked) return;
    const disposition = answerDisposition(text, locale);
    if (disposition === "stop") {
      setTurns([...turns, { role: "user", text, period, answered: false }]);
      setDraft("");
      finish();
      return;
    }
    if (disposition === "skip") {
      changeAngle("skip");
      return;
    }
    const action = beginAction({ ...frameSnapshot(), draft: override ?? draft,
      ...(override !== undefined ? { openerSelection: undefined } : {}) });
    if (!action) return;
    const blocked = isLocalNonAnswer(text, pendingLayer);
    const answered: InterviewTurn = { role: "user", text, layer: pendingLayer ?? undefined, period,
      // The input must still be the exact selected candidate, before send's trim.
      ...(override === undefined && isUneditedOpener(openerSelection.current, draft, turns, openers) ? { fromOpener: true } : {}),
      ...(blocked ? { answered: false } : {}) };
    const nextTurns = [...turns, answered];
    const nextCoverage = coverage;
    const streak = pendingLayer ? failedAttempts(nextTurns, pendingLayer, locale) : 0;
    commitFrame(action, { ...action.snapshot, turns: nextTurns, pendingLayer: null, openers: [], draft: "" });
    const revision = action.revision;
    setDraft(previous => stampCurrent(action, revision) && !ended.current
      && draftEditRevision.current === action.draftRevision ? "" : previous);
    sending.current = true;
    await ask(nextTurns, nextCoverage, blocked && pendingLayer ? { layer: pendingLayer, streak } : null,
      abandoned, blocked ? null : pendingLayer, action, { kind: "answer", index: nextTurns.length - 1, layer: pendingLayer });
  }

  function startNewScene(selected?: InterviewChoice) {
    if (selected && (flowRef.current.choice?.generation !== selected.generation || !availableChoices(selected).newScene)) return;
    if (!selected && flowRef.current.choice) return;
    const action = beginAction(selected?.snapshot);
    if (!action) return;
    try {
      const frame = action.snapshot;
      if (localPromptsExhausted(frame.turns, turn => isLocalNonAnswer(turn.text, turn.layer))) {
        showChoice(action, frame, { kind: "sceneChoice", reason: "local-prompts-exhausted" }); return;
      }
      commitFrame(action, { ...frame, turns: [...frame.turns, { role: "interviewer", text: t("drill.anotherScene"),
        layer: "fact", period, sceneStart: true }], pendingLayer: "fact", concreteOnly: false,
        abandoned: [], stuckStreak: 0, openers: [], draft: "", returnToChoice: false });
      const revision = action.revision;
      setDraft(previous => stampCurrent(action, revision) && !ended.current ? "" : previous);
      setNotice(previous => stampCurrent(action, revision) && !ended.current ? null : previous);
    } finally { releaseAction(action); }
  }

  function changeAngle(choice: "skip" | "concrete") {
    if (choice === "skip") { startNewScene(); return; }
    if (flowRef.current.choice) return;
    const action = beginAction();
    if (!action) return;
    try {
      const frame = { ...action.snapshot, concreteOnly: true };
      const status = sceneStatus(frame.turns, period, locale, frame.abandoned, true);
      if (status.kind === "noEligible") { showChoice(action, frame, { kind: "sceneChoice", reason: "no-eligible" }); return; }
      if (status.kind === "complete") { showChoice(action, frame, { kind: "sceneChoice", reason: status.reason }); return; }
      const text = t("drill.concreteQuestion");
      if (frame.pendingLayer === "fact" && currentScene(frame.turns).some(turn => turn.role === "interviewer" && turn.text === text)) {
        commitFrame(action, frame); return;
      }
      acceptIntoFrame(action, frame, acceptQuestion({ target: "fact", eligible: status.eligible, policy: "local-fact",
        history: frame.turns, locale, localQuestion: text,
        localGuard: localPromptsExhausted(frame.turns, turn => isLocalNonAnswer(turn.text, turn.layer)) }));
    } finally { releaseAction(action); }
  }

  async function chooseNext(kind: "more" | "skip-layer", selected: InterviewChoice) {
    if (flowRef.current.choice?.generation !== selected.generation) return;
    const available = availableChoices(selected);
    if (kind === "more" ? !available.more : !available.skipLayer) return;
    const action = beginAction(selected.snapshot);
    if (!action) return;
    const proposedAbandoned = kind === "skip-layer" && selected.kind === "stuckChoice"
      ? [...new Set([...selected.snapshot.abandoned, selected.layer])] : selected.snapshot.abandoned;
    const frame = { ...selected.snapshot, abandoned: proposedAbandoned };
    const status = sceneStatus(frame.turns, period, locale, proposedAbandoned, frame.concreteOnly);
    if (status.kind === "noEligible" || (status.kind === "complete" && kind !== "more")) {
      showChoice(action, frame, { kind: "sceneChoice", reason: status.kind === "noEligible" ? "no-eligible" : status.reason });
      releaseAction(action); return;
    }
    const running = { ...selected, action };
    flowRef.current.choice = running;
    const revision = action.revision;
    setChoice(previous => stampCurrent(action, revision) && !ended.current ? running : previous);
    await ask(frame.turns, frame.coverage, null, proposedAbandoned, null, action,
      { kind: "question-only", actionKind: kind, choice: selected, target: status.target, proposedAbandoned });
  }

  function canContinueSave(intent: SaveIntent): boolean {
    const receipt = flowRef.current.receipt;
    if (receipt.phase === "idle" || receipt.intent.token !== intent.token || receipt.continuation === "interrupted") return false;
    if (!stampCurrent(intent) || (!intent.endedAtStart && ended.current)) {
      receipt.continuation = "interrupted";
      return false;
    }
    return true;
  }
  // Late ACKs are facts about this intent, even after it loses UI authority.
  function writeReceipt(receipt: SaveReceipt) {
    flowRef.current.receipt = receipt;
    if (receipt.phase === "idle" || !canContinueSave(receipt.intent)) return;
    setSaveReceipt(previous => flowRef.current.receipt === receipt && canContinueSave(receipt.intent) ? receipt : previous);
  }
  function showSaveFailure(intent: SaveIntent) {
    if (!canContinueSave(intent)) return;
    setSaving(previous => canContinueSave(intent) ? false : previous);
    setFailModal(previous => canContinueSave(intent) ? true : previous);
  }
  function completeSave(intent: SaveIntent) {
    const receipt = flowRef.current.receipt;
    if (receipt.phase !== "committed" || receipt.effectsStarted || !canContinueSave(intent)) return;
    receipt.effectsStarted = true;
    setToast(previous => canContinueSave(intent) ? { tone: "success", message: t("drill.saved") } : previous);
    if (!canContinueSave(intent)) return;
    if (saveCueAllowed({ crisis: false, recording: isRecordingAudioMode() })) playSaveCue();
    if (!canContinueSave(intent)) return;
    void loadSevenLevels(intent.input.userId).then((s) => {
      if (canContinueSave(intent)) return recordSevenTiers(intent.input.userId, s.starLevels);
    }).catch(() => {});
    if (!canContinueSave(intent)) return;
    setTimeout(() => {
      if (!canContinueSave(intent)) return;
      const { period, growthOrigin } = intent;
      if (growthOrigin) router.replace("/star/growth");
      else router.replace(`/me/${period}`);
    }, 700);
  }
  async function saveCoverage(intent: SaveIntent) {
    const receipt = flowRef.current.receipt;
    if (receipt.phase !== "coveragePending" || !["ready", "retryable"].includes(receipt.coverage) || !canContinueSave(intent)) return;
    const attemptToken = {};
    const pending: SaveReceipt = { ...receipt, coverage: "inFlight", attemptToken };
    writeReceipt(pending);
    if (!canContinueSave(intent)) return;
    setSaving(previous => canContinueSave(intent) ? true : previous);
    if (!canContinueSave(intent)) return;
    const result = await addCoverage(intent.input.userId, intent.delta, () => canContinueSave(intent));
    const current = flowRef.current.receipt;
    if (current.phase !== "coveragePending" || current.intent.token !== intent.token || current.attemptToken !== attemptToken) return;
    canContinueSave(intent);
    if (result.kind === "acknowledged") {
      writeReceipt({ phase: "committed", intent, continuation: current.continuation,
        recordId: current.recordId, coverage: result.receipt, effectsStarted: false });
      completeSave(intent);
    } else if (result.kind === "stale") {
      current.continuation = "interrupted";
    } else {
      writeReceipt({ ...current, coverage: result.kind === "notApplied" ? "retryable" : "unknown" });
      showSaveFailure(intent);
    }
  }
  function retryCoverage() {
    const receipt = flowRef.current.receipt;
    if (receipt.phase !== "coveragePending" || receipt.coverage !== "retryable" || !canContinueSave(receipt.intent)) return;
    setFailModal(false);
    void saveCoverage(receipt.intent);
  }
  async function keepIt(selected?: InterviewChoice) {
    const flow = flowRef.current;
    if (flow.receipt.phase !== "idle") { canContinueSave(flow.receipt.intent); return; }
    if (!userId || !sessionCurrent() || flow.crisisLatched || (flow.action && !ended.current) || flow.receipt.phase !== "idle" || !coverageReady
      || turnsOwnerRef.current !== turns || !turns.some(turn => turn.role === "user")) return;
    if (!ended.current && (!selected || flow.choice?.generation !== selected.generation || !availableChoices(selected).save)) return;
    const owner = captureAccountOwnerLease(userId);
    if (!owner) return;
      const qLabel = locale === "ko" ? "질문" : "Q";
      // 마지막 답까지만 담는다 -- "여기까지"로 끝내면 답 없는 질문이 끝에 붙어 있다(Z63).
      const transcript = storedTurns(turns)
        .map((turn) => `${turn.role === "interviewer" ? qLabel : interviewAnswerLabel(turn.fromOpener, locale)}: ${turn.text}`)
        .join("\n\n");
      // withFollowup:false performs a local C9 check, not a semantic scan.
      // Its red result still needs guidance even after leaving this route.
      const input: SaveIntent["input"] = {
        userId,
        locale,
        minor: isMinor === true,
        kind: "audit_response",
        body: transcript,
        topic: locale === "ko" ? "회상 인터뷰" : "Recall interview",
        // 목록에 보이는 제목. 모든 이야기가 답한 횟수만 다른 같은 줄이라 열어 봐야
        // 구분됐다(Z61 · Simon 결정 Q-261013-51: 별 이름 + 첫 답의 앞부분).
        // 저장본이 "답변"으로 적는 턴 그대로다 -- 무슨 뜻의 말인지는 여기서 가리지 않는다.
        summary: storyTitle(
          homeT(`ds.star.${period}`),
          turns.filter((turn) => turn.role === "user").map((turn) => turn.text),
        ),
        // 옛 스크리너와 같은 표식. assess/registry.ts 가 이걸로 완료를 판정한다.
        // 앱 표식 칸(0218)에 쓴다 — 사용자 태그와 섞이지 않게.
        systemTags: recallInterviewSystemTags(locale),
        auditPeriod,
        domainIntent: growthOrigin ? "growth" : undefined,
        withFollowup: false,
      };
      const delta = emptyCoverage();
      for (const p of LIFE_PERIODS) for (const l of DRILL_LAYERS) {
        delta[p][l] = Math.max(0, coverage[p][l] - baseCoverage.current[p][l]);
      }
    const intent: SaveIntent = { owner, instance: interviewInstance.current, context: contextRef.current,
      revision: ++flow.revision, epoch: flow.crisisEpoch, history: turns, token: {}, frame: frameSnapshot(), delta,
      endedAtStart: ended.current, input, period, growthOrigin };
    writeReceipt({ phase: "recordPending", intent, record: "inFlight", continuation: "live" });
    if (!canContinueSave(intent)) return;
    setSaving(previous => canContinueSave(intent) ? true : previous);
    try {
      if (!canContinueSave(intent)) return;
      const saved = await createRecord(intent.input);
      // Fence synchronous subscribers before publication; the root store owns the lease check.
      if (saved?.followup?.zone === "red") latchCrisis();
      const recordId = typeof saved?.id === "string" && saved.id.trim() ? saved.id : null;
      canContinueSave(intent);
      const current = flowRef.current.receipt;
      if (current.phase === "idle" || current.intent.token !== intent.token) return;
      writeReceipt(recordId
        ? { phase: "coveragePending", intent, continuation: current.continuation, recordId, coverage: "ready" }
        : { phase: "recordPending", intent, continuation: current.continuation, record: "unknown" });
      if (!saved) { showSaveFailure(intent); return; }
      if (saved.followup?.zone === "red") {
        publishCrisisNotice(owner, saved.crisisHotline ?? hotlineFor());
        if (owner.isCurrent() && mounted.current && interviewInstance.current === intent.instance) finish();
        return;
      }
      if (!canContinueSave(intent)) return;
      if (!recordId) { showSaveFailure(intent); return; }
      await saveCoverage(intent);
    } catch {
      const current = flowRef.current.receipt;
      if (current.phase === "recordPending" && current.intent.token === intent.token) {
        canContinueSave(intent);
        writeReceipt({ ...current, record: "unknown" });
        showSaveFailure(intent);
      }
    }
  }

  const receipt = flowRef.current.receipt;
  const saveLive = receipt.phase !== "idle" && canContinueSave(receipt.intent);
  const saveBusy = saveLive && (receipt.phase === "recordPending" && receipt.record === "inFlight"
    || receipt.phase === "coveragePending" && receipt.coverage === "inFlight");
  const retryable = saveLive && receipt.phase === "coveragePending" && receipt.coverage === "retryable";
  const saveFailureKey = receipt.phase === "recordPending" ? "drill.recordSaveUnknown"
    : retryable ? "drill.coverageSaveFailed" : "drill.coverageSaveUnknown";

  return (
    <InterviewFrame>
      <ScrollView
        ref={scrollRef}
        priorityReveal={priorityReveal}
        onScrollBeginDrag={cancelGuidanceReveal}
        contentContainerStyle={[styles.body, { paddingBottom: kbHeight + spacing.sm }]}
      >
        {guidanceDisplay ? (
          <View onLayout={markGuidanceReady}>
            <InterviewGuidanceRow copy={guidanceDisplay.copy} onDismiss={dismissGuidance} />
          </View>
        ) : null}
        {done ? (
          <>
            <Text style={[m3TextStyle("titleLarge"), styles.saveTitle]}>{t("drill.saveTitle")}</Text>
            <Text style={[m3TextStyle("bodyMedium"), styles.saveBody]}>
              {t("drill.closing")}
            </Text>
            {/* 이만큼 팠다 -- 담을지 정하는 자리에서 보여준다.
             *
             *  대화 중에는 안 띄운다: 화면 하나에 메시지 하나라는 규율도 있고,
             *  무엇보다 **말하는 동안 채점표를 보여주면 칸을 채우려고 말하게 된다.**
             *  대화가 끝난 뒤에 보여주는 것이 정직한 순서다.
             *
             *  열은 사용자가 **살아온 시기**만(`periodIdsForAge`). LIFE_PERIODS 를
             *  그대로 그리면 스물다섯 살에게 70대 열이 보인다.
             *
             *  표는 접어 둔다 (Z64 · Simon 결정 Q-261013-52). 처음 쓰는 사람에게 L1 ~ L5
             *  표는 뜻이 전해지지 않았다. 오늘 한 것 한 줄이 먼저고, 그 줄을 누르면 편다. */}
            <Pressable
              onPress={() => setTableOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: tableOpen }}
              // 웹은 `accessibilityState.expanded` 를 옮겨 주지 않는다(PixelPressable 과 같은 까닭).
              aria-expanded={tableOpen}
              style={styles.saveMeta}
            >
              <Text style={[m3TextStyle("bodyMedium"), styles.saveMetaText]}>
                {t("drill.saveMeta", { star: homeT(`ds.star.${period}`), n: userTurns })}
              </Text>
              <Glyph name={tableOpen ? "expand_less" : "expand_more"} color={m3.color.onSurfaceVariant} />
            </Pressable>
            {tableOpen ? (
              <DrillProgress
                coverage={coverage}
                locale={locale}
                periods={coveredPeriods}
                activePeriod={period}
              />
            ) : null}
            <MdCard variant="outlined" style={styles.noteCard}>
              <Text style={[m3TextStyle("bodySmall"), styles.note]}>{t("drill.saveBody")}</Text>
            </MdCard>
            <View style={styles.actions}>
              <MdButton
                label={t("approve")}
                variant="filled"
                loading={saveBusy}
                disabled={busy || userTurns === 0 || receipt.phase !== "idle"}
                onPress={() => void keepIt()}
                icon={<Glyph name="check" color={m3.color.onPrimary} size={18} />}
                style={styles.actionButton}
              />
            </View>
          </>
        ) : (view.mode === "active" || view.mode === "choosing" ? (
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

            {view.mode === "choosing" && choice ? (
              <View style={styles.choicePanel}>
                <Text style={[m3TextStyle("titleMedium"), styles.saveTitle]}>{t(choice.kind === "stuckChoice"
                  ? "drill.changeSceneChoice" : choice.reason === "local-prompts-exhausted" ? "drill.localPromptsExhausted"
                    : choice.reason === "no-eligible" || choice.reason === "question-exhausted" ? "drill.questionsExhausted" : "drill.sceneChoice")}</Text>
                {choice.kind === "sceneChoice" ? (
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: !choices.more }} disabled={!choices.more}
                    style={styles.answerChip} onPress={() => void chooseNext("more", choice)}>
                    <Text style={[m3TextStyle("labelLarge"), styles.answerChipText]}>{t("drill.continueScene")}</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: !choices.newScene }} disabled={!choices.newScene}
                  style={styles.answerChip} onPress={() => startNewScene(choice)}>
                  <Text style={[m3TextStyle("labelLarge"), styles.answerChipText]}>{t("drill.newScene")}</Text>
                </Pressable>
                {choice.kind === "sceneChoice" ? (
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: !choices.save }} disabled={!choices.save}
                    style={styles.answerChip} onPress={() => void keepIt(choice)}>
                    <Text style={[m3TextStyle("labelLarge"), styles.answerChipText]}>{t("drill.saveAndFinish")}</Text>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: !choices.skipLayer }} disabled={!choices.skipLayer}
                    style={styles.answerChip} onPress={() => void chooseNext("skip-layer", choice)}>
                    <Text style={[m3TextStyle("labelLarge"), styles.answerChipText]}>{t("drill.skipLayer")}</Text>
                  </Pressable>
                )}
                {saveBusy ? <PremiumLoadingState message={t("loading")} /> : null}
              </View>
            ) : null}

            {pendingLayer ? (
              <Text style={[m3TextStyle("labelMedium"), styles.turnLabel]}>
                {t("drill.turnLabel", {
                  n: userTurns + 1,
                })}
              </Text>
            ) : null}

            {/* **"모르겠어요" 를 누를 수 있게 한다.**
                화면은 이미 `drill.intro` 로 "모르겠다도 데이터"라고 말하고 있었지만,
                그걸 하려면 사용자가 직접 타이핑해야 했다. 말과 자리가 어긋나 있었다.
                누르면 그대로 보내고 `isNonAnswer` 가 받는다 — 칸은 안 채우고 같은
                층에서 발판을 놓는다(#1357/#1358). 밝기는 정직하게 유지된다.
                ⚠ 알약(pill)이 아니라 사각이다. PIXEL-CLAY 는 라운드 0 이다. */}
            {pendingLayer && !inputLocked ? (
              <View style={styles.answerChips}>
                {/* ⚠ 말문 후보는 **보내지 않고 입력창을 채운다.**
                    모델이 쓴 문장이 그대로 기록으로 남으면, 이 제품이 모으려는
                    "그 사람이 실제로 한 말" 이 아니라 "모델이 그럴듯하게 지어낸 말"
                    이 위키에 쌓인다. 고쳐 쓰라고 놓는 첫머리다. */}
                {openers.map((o, index) => (
                  <Pressable
                    key={o}
                    onPress={() => selectOpener(index)}
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
                <Pressable onPress={() => changeAngle("skip")} style={styles.answerChip}
                  accessibilityRole="button" accessibilityLabel={t("drill.skip")}>
                  <Text style={[m3TextStyle("labelMedium"), styles.answerChipText]}>{t("drill.skip")}</Text>
                </Pressable>
                {!concreteOnly ? (
                  <Pressable onPress={() => changeAngle("concrete")} style={styles.answerChip}
                    accessibilityRole="button" accessibilityLabel={t("drill.concrete")}>
                    <Text style={[m3TextStyle("labelMedium"), styles.answerChipText]}>{t("drill.concrete")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Text style={[m3TextStyle("bodySmall"), styles.processingNotice]}>
              {t("drill.processingNotice")}
            </Text>
            <TextInput
              value={draft}
              onChangeText={editDraft}
              placeholder={t("drill.placeholder")}
              placeholderTextColor={m3.color.onSurfaceVariant}
              multiline
              editable={!inputLocked}
              style={[m3TextStyle("bodyMedium"), styles.input]}
              accessibilityLabel={t("drill.placeholder")}
            />

            <View style={styles.actions}>
              <MdButton
                label={t("drill.send")}
                variant="filled"
                disabled={inputLocked}
                onPress={() => void send()}
                icon={<Glyph name="send" color={m3.color.onPrimary} size={18} />}
                style={styles.actionButton}
              />
              {started.current ? (
                <Pressable
                  onPress={finish}
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
        ) : null)}
      </ScrollView>

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}

      <PremiumModal
        visible={failModal && saveLive}
        onClose={() => setFailModal(false)}
        accessibilityLabel={t("notice")}
      >
        <Text style={[m3TextStyle("titleMedium"), styles.saveTitle]}>{t("reflectError")}</Text>
        <Text style={[m3TextStyle("bodyMedium"), styles.saveBody]}>{t(saveFailureKey)}</Text>
        {/* 다시 누르면 무엇이 일어나는지 먼저 말한다 -- 실패 뒤에 버튼만 있으면
            사용자는 대화가 날아갔는지 아닌지를 모른다. */}
        {retryable ? <Text style={[m3TextStyle("bodySmall"), styles.note]}>{t("retryHint")}</Text> : null}
        <View style={styles.actions}>
          <MdButton label={t("dismiss")} variant="outlined" onPress={() => setFailModal(false)} />
          {retryable ? <MdButton
            label={t("tryAgain")}
            variant="filled"
            onPress={retryCoverage}
          /> : null}
        </View>
      </PremiumModal>

    </InterviewFrame>
  );
}

// 되묻기 문구 키가 실재하는지 타입 수준에서 붙잡아 둔다. `t()` 는 문자열을 받으므로
// 키가 사라져도 런타임까지 조용하다.
const _loopKeys: readonly string[] = LOOP_CHECK_KEYS;
void _loopKeys;

const styles = StyleSheet.create({
  choicePanel: { gap: spacing.sm },
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
  processingNotice: { color: m3.color.onSurfaceVariant, marginBottom: spacing.xs },
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
  saveMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 48,
  },
  saveMetaText: { flex: 1, color: m3.color.onSurface },
  saveTitle: { color: m3.color.onSurface },
  saveBody: { color: m3.color.onSurfaceVariant },
  noteCard: { padding: spacing.sm },
  note: { color: m3.color.onSurfaceVariant },
  toastWrap: { position: "absolute", left: 0, right: 0, bottom: spacing.lg, alignItems: "center" },
});
