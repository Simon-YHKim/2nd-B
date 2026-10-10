/**
 * Deep-space home (index `/`) — the constellation inside the shared DeepSpaceScreen
 * chrome (status header + 5-tab dock), a 1:1 clone of E:/Legacy/2ndB/legacy/design/prototype.dc.html's
 * home. The dock maps to real routes; the 7 stars + 북극성 map to their engine
 * routes, so home navigation is real.
 *
 * Keeps the post-auth gate.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { profileGate } from "@/lib/auth/profile-probe";
import { type LadderLevel } from "@/lib/persona/brightness";
import { loadSevenLevels } from "@/lib/persona/load-seven-levels";
import { readStarLastSeen, writeStarLastSeen } from "@/lib/persona/star-last-seen";
import { STAR_BRIGHTEN_CUE, brightenCue } from "@/lib/audio/app-cues";
import { useUiSound } from "@/lib/audio/use-ui-sound";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { refocusFirstRunHomeVisit, useFirstRunHomeGate } from "@/lib/onboarding/account-first-run";
import { useCoachmarksGate } from "@/lib/onboarding/coachmarks-gate";
import { FIRST_RECORD_COACH_PARAM } from "@/lib/onboarding/first-record-coach";
import { DeepSpaceScreen } from "./DeepSpaceScreen";
import { ConstellationHome, type HomeStarId } from "./ConstellationHome";
import { HomeCoachmarks } from "./HomeCoachmarks";
import { ProfileProbeRetryScreen } from "./ProfileProbeRetry";

export function DeepSpaceShell() {
  const { userId, sessionId, hasProfile, loading, profileProbeFailed } = useAuth();
  const gate = profileGate({ loading, userId, hasProfile, profileProbeFailed });
  // First run (Q-261004-40 strict, 0219): the welcome, then the first-day review
  // ("첫 별 점등"), each open by themselves at most once per ACCOUNT. After the
  // profile gate, this home asks the server for the one grant before opening
  // either, and opens nothing when the server cannot answer
  // (lib/onboarding/account-first-run.ts). "wait" = still asking (loader).
  const firstRun = useFirstRunHomeGate(userId, gate === "ready", sessionId, true);

  // Live brightness for the home constellation: the no-LLM loadDomainLevels path
  // derives per-domain L1-L5 levels + the 북극성 aggregate from the user's real
  // records (grouped by their domain: tag), so the sky reflects how much of their
  // life they've mapped. Defaults to an honest empty sky (all L1) until it
  // resolves; failure leaves it empty (never blocks).
  const [northStarBrightness, setNorthStarBrightness] = useState(0.2);
  // 화면에 돌아올 때마다 올린다. 밝기 재조회의 방아쇠다.
  const [refreshTick, setRefreshTick] = useState(0);
  const [starLevels, setStarLevels] = useState<Partial<Record<HomeStarId, LadderLevel>>>({});
  // The seventh star is `profile`, which is NOT a data domain and so is not part
  // of loadDomainLevels' seven-table scan (nor of the 북극성 average — the canon
  // excludes it by id). It gets its own small read; a failure leaves it at L1,
  // which is the honest reading of "we could not see anything".

  // The home coachmark is the first step of a cross-route task coach. Its real
  // target is measured from the live SecondB head, then /capture owns steps 2-4.
  const coachmarksDue = useCoachmarksGate(
    userId,
    !loading && hasProfile === true && firstRun === "home",
    refreshTick,
  );
  const coachHeadTargetRef = useRef<View>(null);
  // 별이 밝아지는 소리(Q-261006-02). 읽은 밝기를 이 기기의 '마지막으로 본 밝기'와 비교한다.
  // 효과는 아래 읽기 effect 안에서 쓰므로 ref 로 넘긴다(소리 · 설정이 바뀌어도 다시 읽지 않게).
  const playBrighten = useUiSound(STAR_BRIGHTEN_CUE.source, STAR_BRIGHTEN_CUE);
  const reducedMotion = useReducedMotionPref();
  const brighten = useRef({ play: playBrighten, reducedMotion });
  brighten.current = { play: playBrighten, reducedMotion };
  useEffect(() => {
    // Wait for the auth session restore (`loading`) as well as the userId:
    // firing on userId alone raced the token attach at boot, so the Supabase
    // reads went out anon → RLS 401 (observed on recreation_items in the
    // authenticated capture pass) and the swallowed catch left the first paint
    // silently missing the relation/recreation brightness with no retry.
    // Depending on `loading` re-fires the load once the session is ready.
    if (loading || !userId) return;
    let alive = true;
    // 별 밝기와 북극성은 이제 **인터뷰가 판 칸**에서 온다(2026-08-24).
    // 도메인 등급은 대시보드가 계속 쓰므로 따로 읽는다 -- 둘은 다른 것이 됐다.
    loadSevenLevels(userId)
      .then(async (b) => {
        if (!alive) return;
        setStarLevels(b.starLevels);
        setNorthStarBrightness(b.northStarBrightness);
        const seen = await readStarLastSeen(userId);
        if (!alive) return;
        const cue = brightenCue(seen, b.starLevels, brighten.current.reducedMotion);
        if (cue.play) brighten.current.play();
        await writeStarLastSeen(userId, cue.next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loading, userId, refreshTick]);

  // 인터뷰를 마치고 돌아오면 다시 읽는다. 홈은 한 번 뜬 뒤 마운트된 채로 남아
  // 있어서, 이게 없으면 **방금 판 자리가 하늘에 안 뜬다** -- 앱을 껐다 켜야
  // 밝아지는 별은 판 보람이 없다.
  useFocusEffect(
    useCallback(() => {
      setRefreshTick((n) => n + 1);
    }, []),
  );

  // The home stays mounted while other screens open over it (see the refresh
  // above), so its mount is not the only home visit. Coming back to this screen,
  // or the app coming to the front while it is the screen in view, is a new
  // visit: a read that failed is tried again (design 5.2 step 2, at most three
  // failed reads a sign-in), and a first-run screen that has since become possible (a
  // welcome another tab held, a first-day grant handed back) is decided again
  // instead of staying held home for the rest of the mount (gate BA-03).
  const homeFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      homeFocusedRef.current = true;
      refocusFirstRunHomeVisit(userId);
      return () => {
        homeFocusedRef.current = false;
      };
    }, [userId]),
  );
  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && homeFocusedRef.current) refocusFirstRunHomeVisit(userId);
    });
    return () => subscription.remove();
  }, [userId]);
  if (gate === "auth-loading") return <InlineLoader />;
  // Login wall first (Simon 2026-07-15): a signed-out visitor hits /sign-in
  // before anything else; onboarding is now a post-login welcome. This reverses
  // the earlier "sell before signup" order so nothing renders pre-auth.
  if (gate === "signed-out") return <Redirect href="/sign-in" />;
  // F4: a TRANSIENT profile-probe failure (network blip) surfaces as
  // hasProfile===false with profileProbeFailed===true. Do NOT eject a real,
  // fully-registered user to /complete-profile (which would demand DOB + consent
  // re-entry) on a mere blip. Do not park them on a loader either: this screen has
  // no retry of its own, so the T1a emulator run (vibe r260913) watched home sit on
  // the loader after a `JWT issued at future` probe failure and onboarding never
  // came. Show the retryable error, with no dock.
  if (gate === "profile-error") return <ProfileProbeRetryScreen />;
  if (gate === "profile-incomplete") return <Redirect href="/complete-profile" />;
  // "profile-loading" keeps the old fall-through: AuthContext only publishes a
  // signed-in user with hasProfile === null while `loading` is still true.
  // Until the first-run decision is in, show the loader rather than the home:
  // rendering ConstellationHome (and coachmarks) for a frame and then bouncing to
  // a first-run screen is a home flash on the very first run.
  if (firstRun === "wait") return <InlineLoader />;
  if (firstRun === "/onboarding") return <Redirect href="/onboarding" />;
  if (firstRun === "/ttfv") return <Redirect href={{ pathname: "/ttfv", params: { auto: "" } }} />;



  return (
    <DeepSpaceScreen active="home" header="none">
      <ConstellationHome
        // 여행하기 on a domain star opens that domain's LENS (/star/<id>, the
        // rev2 11-star per-domain screen: briefing + 담기/기록 + timeline), NOT
        // the flat wiki list. 프로필 opens the profile hub; the 북극성 opens the
        // persona aggregate (/core-brain). Head-tap menu: 챗봇/비서 (sb-home).
        // 2026-08-24: 별을 누르면 **그 별의 요약**이 열린다(Simon 결정 4 = B).
        // 바로 대화를 열지 않는 이유는 지금까지 뭘 했는지 볼 자리가 없으면
        // 매번 처음부터 시작하는 기분이 되기 때문이다.
        // `/star/[domain]` 은 남는다 -- 생활 도메인 대시보드가 계속 쓴다.
        onStarTravel={(id) => router.push(`/me/${id}`)}
        // overlay=home: only this entry may let the home show through the
        // card (lib/nav/over-home.ts, QA 261004 D-05) - same as /dashboard.
        onPolarisPress={() => router.push({ pathname: "/core-brain", params: { overlay: "home" } })}
        // [Simon 결정 6 = B] 생활 여섯 영역(커리어·재정·성장·관계·건강·휴식)은
        // 더 이상 별이 아니다. 그 대시보드로 가는 입구가 **세컨비 머리**다 --
        // 별자리에서 머리를 터치하면 대화창이 그것을 펴 보인다.
        onChatPress={() => router.push("/secondb?panel=dashboard")}
        coachFirstRecord={coachmarksDue === true}
        coachmarksDue={coachmarksDue}
        coachHeadTargetRef={coachHeadTargetRef}
        onCoachHeadPress={() =>
          router.push({ pathname: "/capture", params: { coach: FIRST_RECORD_COACH_PARAM } })
        }
        onOpsPress={() => router.push("/ops")}
        onBellPress={() => {
          if (typeof document !== "undefined") (document.activeElement as HTMLElement | null)?.blur?.();
          router.push({ pathname: "/dashboard", params: { overlay: "home", app: "notifications" } });
        }}
        starLevels={starLevels}
        northStarBrightness={northStarBrightness}
      />
      {coachmarksDue === true ? (
        <HomeCoachmarks
          ownerId={userId!}
          targetRef={coachHeadTargetRef}
        />
      ) : null}
    </DeepSpaceScreen>
  );
}
