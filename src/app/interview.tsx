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
//     └─ drill     : nextProbe(...) -> LLM 이 다음 질문 한 줄
//                    답변을 받으면 그 층의 coverage 를 올린다
//
// 되묻기 판정의 재료는 **이번 대화의 사용자 답변들**이다. DB 를 읽지 않는다 --
// "매번 같은 결론으로 돌아온다"는 바로 이 대화 안에서 관측되는 것이고, 그게
// `detectLoops` 가 재는 것과 정확히 같다.
//
// ── C9 (안전) ───────────────────────────────────────────────────────────
// 옛 화면은 자유서술이 없어서 C9 가 이 경로에 아예 없었다. 이제 있다.
// 분류는 `callLlm`(경계 모듈) 안에서 돌고 `ProbeResult.zone` 으로 나온다.
// 이 화면의 책임은 **red 를 만나면 텍스트가 아니라 핫라인을 띄우는 것**이다 --
// `/secondb` 의 음성 경로와 같은 처리다.
//
// ── 저장 ────────────────────────────────────────────────────────────────
// 태그(`interview`/`recall`/`screener`)와 `kind`, `auditPeriod` 는 그대로 둔다.
// `assess/registry.ts` 의 `interview` 항목이 그 태그로 완료를 판정하고,
// 옛 스크리너로 남긴 기록과 같은 서랍에 들어가야 한다.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState, PremiumModal, PremiumToast } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import type { HotlineId } from "@/lib/safety/lexicon";
import { useAuth } from "@/lib/auth/AuthContext";
import { parsePeriodParam } from "@/lib/interview/periods";
import { isNonAnswer, MAX_SCAFFOLDS_PER_LAYER } from "@/lib/interview/stuck";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { createRecord } from "@/lib/records/create";
import { m3 } from "@/lib/theme/m3";
import { spacing } from "@/lib/theme/tokens";
import {
  LAYER_LABEL,
  PERIOD_LABEL,
  seedQuestion,
  emptyCoverage,
  incrementCoverage,
  nextMove,
  nextProbe,
  type Coverage,
  type DrillLayer,
  type InterviewTurn,
  type LifePeriod,
} from "@/lib/interview/probe";
import { LOOP_CHECK_KEYS, type ReflectionEntry } from "@/lib/interview/loop-check";

const ICON: Record<string, string> = {
  check: '<path d="M20 6L9 17l-5-5"/>',
  send: '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
};

function Glyph({ name, color, size = 20 }: { name: keyof typeof ICON; color: string; size?: number }) {
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${ICON[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

// 한 세션의 턴 상한. 드릴은 원래 "축이 목표 등급에 닿을 때까지"인데
// (`drill-stop.ts`), 등급 추정은 이 화면이 하지 않는다 -- 지금 추정치를 지어내지
// 않는다는 것이 이 화면의 기존 약속이고, 그건 유지한다. 그래서 여기서는 **비용과
// 피로**로만 끊는다. 사용자는 언제든 "여기까지"로 먼저 끝낼 수 있다.
const MAX_TURNS = 12;

export default function InterviewRoute() {
  const { t, i18n } = useTranslation("interview");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "ko" | "en";
  const { period: periodParam } = useLocalSearchParams<{ period?: string }>();
  // 라우트가 주는 시기. `/audit` 이 이제 사용자가 살아온 칸을 그대로 보내므로
  // 9개 전부를 받는다. 옛 링크(`?period=20s`)는 `parsePeriodParam` 이 계속 살린다.
  const period: LifePeriod = parsePeriodParam(periodParam);
  // 기록에 남기는 시기도 같은 id 로 쓴다. `records.audit_period` 는 CHECK 없는 자유
  // 텍스트고 **지금 읽는 코드가 없다**(완료 판정은 태그가 한다). 옛 행은 `20s`·`teens`
  // 를 담고 있어 어휘가 섞이지만, 40대 인터뷰를 `current` 로 접어 넣는 쪽이 틀린
  // 기록을 남기므로 그쪽을 고르지 않았다.
  const auditPeriod: string = period;

  const { userId, loading, isMinor, hasProfile } = useAuth();
  const kbHeight = useKeyboard();

  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [coverage, setCoverage] = useState<Coverage>(emptyCoverage);
  /** 현재 층에서 연속으로 못 답한 횟수. 답하면 0 으로 돌아간다. */
  const [stuckStreak, setStuckStreak] = useState(0);
  /** 발판을 두 번 줘도 막혀서 이번 대화에서는 더 묻지 않기로 한 층들.
   *
   *  칸을 안 채우는 것만으로는 부족했다(실측) -- "가장 먼저 비어 있는 칸" 규칙이
   *  바로 그 칸을 다시 집어서 같은 질문이 계속 나갔다. 밝기는 정직하게 비워두고,
   *  묻기만 멈춘다. */
  const [abandoned, setAbandoned] = useState<DrillLayer[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingLayer, setPendingLayer] = useState<DrillLayer | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const [failModal, setFailModal] = useState(false);
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "KR_109",
  });
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
        .filter((turn) => !isNonAnswer(turn.text, locale))
        .map((turn, i) => ({
          id: `t${i}`,
          createdAt: new Date().toISOString(),
          theme: turn.period ?? period,
          text: turn.text,
        })),
    [period, locale],
  );

  const ask = useCallback(
    async (
      history: InterviewTurn[],
      cov: Coverage,
      /** 직전 턴에서 못 답한 층과 그 층에서의 연속 횟수. */
      stuck: { layer: DrillLayer; streak: number } | null = null,
      giveUp: DrillLayer[] = [],
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
          setNotice(t("drill.loopNote"));
          return;
        }
        // 발판이면 내려가지 않고 **같은 층**을 더 쉬운 각도로 다시 묻는다.
        //
        // ⚠ 층은 **언제나** `move.layer` 를 넘긴다. 예전에는 발판일 때만 넘기고
        // 평소에는 `nextProbe` 가 스스로 다시 골랐는데, 그쪽은 포기 목록을 모른다.
        // 그래서 `nextMove` 가 "믿음으로 넘어가라"고 정해도 `nextProbe` 가 "가장 먼저
        // 비어 있는 칸" 규칙으로 방금 포기한 의미(L3)를 도로 집었다 -- 실측 2026-08-24.
        // 결정하는 곳은 하나여야 한다.
        const isScaffold = move.kind === "scaffold";
        const probe = await nextProbe(
          userId, locale, period, history, cov, isMinor === true,
          isScaffold && stuck ? stuck.streak : 0, move.layer,
        );
        if (probe.zone === "red") {
          // C9: 텍스트가 아니라 핫라인. 대화는 여기서 멈춘다.
          setCrisis({ visible: true, hotline: hotlineFor() });
          return;
        }
        setTurns([...history, { role: "interviewer", text: probe.question, layer: probe.layer, period }]);
        setPendingLayer(probe.layer);
        if (isScaffold) setNotice(t("drill.scaffoldNote"));
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
  }, [userId, period, locale]);

  useEffect(() => {
    if (turns.length > 0) scrollRef.current?.scrollToEnd({ animated: true });
  }, [turns.length]);

  function Frame({ children }: { children: ReactNode }) {
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

  if (loading) {
    return (
      <Frame>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </Frame>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const userTurns = turns.filter((turn) => turn.role === "user").length;

  async function send() {
    const text = draft.trim();
    if (text.length === 0) {
      setNotice(t("drill.emptyAnswer"));
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
    const blocked = pendingLayer !== null && isNonAnswer(text, locale);
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
    setPendingLayer(null);
    if (nextTurns.filter((turn) => turn.role === "user").length >= MAX_TURNS) {
      setDone(true);
      return;
    }
    await ask(nextTurns, nextCoverage, stuck, nextAbandoned);
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
      setToast({ tone: "success", message: t("drill.saved") });
      navigating = true;
      setTimeout(() => router.replace("/big-five"), 700);
    } catch {
      setFailModal(true);
    } finally {
      if (!navigating) setSaving(false);
    }
  }

  return (
    <Frame>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, { paddingBottom: kbHeight + spacing.sm }]}
      >
        {done ? (
          <>
            <Text style={[m3TextStyle("titleLarge"), styles.saveTitle]}>{t("drill.saveTitle")}</Text>
            <Text style={[m3TextStyle("bodyMedium"), styles.saveBody]}>{t("drill.closing")}</Text>
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
                <MdButton
                  label={t("drill.enough")}
                  variant="outlined"
                  onPress={() => setDone(true)}
                  style={styles.actionButton}
                />
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
    </Frame>
  );
}

// 되묻기 문구 키가 실재하는지 타입 수준에서 붙잡아 둔다. `t()` 는 문자열을 받으므로
// 키가 사라져도 런타임까지 조용하다.
const _loopKeys: readonly string[] = LOOP_CHECK_KEYS;
void _loopKeys;

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.md, gap: spacing.sm },
  askRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  askText: { flex: 1, color: m3.color.onSurface },
  mineWrap: { alignItems: "flex-end" },
  mine: { maxWidth: "88%", padding: spacing.sm },
  mineText: { color: m3.color.onSurfaceVariant },
  thinking: { color: m3.color.onSurfaceVariant },
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
