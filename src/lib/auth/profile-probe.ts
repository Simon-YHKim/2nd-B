export interface ProfileProbe {
  hasProfile: boolean;
  isMinor: boolean | null;
  /** 만 나이. 프로브가 이미 `birth_date` 를 읽어 `isMinor` 를 만들고 있었고,
   *  그걸 boolean 으로 좁히기 전 값이다. 인터뷰가 **살아온 시기**를 계산하려면
   *  성인/미성년 이상이 필요하다(`interview/periods.ts`).
   *  프로브 실패나 `birth_date` 이상이면 null -- 그때는 추측하지 않는다. */
  age?: number | null;
  /** True when this probe FAILED (DB error / timeout) rather than answered.
   *  hasProfile:false then means "unknown", not "confirmed missing" — screens
   *  that eject to /complete-profile on false must hold and retry instead of
   *  stranding a real account on a network blip (flow-map /secondb). */
  probeFailed?: boolean;
}

export function preserveKnownMinorForMissingProfile(probe: ProfileProbe, previous: ProfileProbe | null): ProfileProbe {
  if (probe.hasProfile || previous?.isMinor === null || previous?.isMinor === undefined) return probe;
  return { ...probe, isMinor: previous.isMinor };
}

/** 프로필 프로브 한 번의 상한. 부트스트랩의 세션 읽기도 같은 값을 쓴다(AuthContext). */
export const PROFILE_PROBE_TIMEOUT_MS = 8000;

// ── 화면 게이트 ─────────────────────────────────────────────────────────────

export type ProfileGate =
  | "auth-loading"
  | "signed-out"
  | "profile-error"
  | "profile-loading"
  | "profile-incomplete"
  | "ready";

export interface ProfileGateSnapshot {
  loading: boolean;
  userId: string | null;
  hasProfile: boolean | null;
  profileProbeFailed: boolean;
}

/**
 * 인증 스냅샷을 화면이 그릴 상태 하나로 바꾼다.
 *
 * 실패한 프로브는 **profile-error** 다. 화면은 오류 문구와 다시 시도
 * (`AuthContext.refresh`)를 보인다(`components/deep-space/ProfileProbeRetry.tsx`).
 *
 * - 로딩이 아니다. 로딩과 한 갈래로 묶었더니 다시 물을 사람이 없는 화면이 끝없이
 *   기다렸다. T1a 에뮬레이터 검증(vibe r260913 항목 2)에서 /account · /data 가
 *   서버 오류 · DNS 실패 · 8초 타임아웃 셋 다 로딩 캡션만 남기고 멈췄다.
 * - 프로필 없음도 아니다. 그리로 보내면 가입을 마친 사람이 네트워크 한 번 끊겼다고
 *   생년월일·동의를 다시 입력하게 된다(F4).
 */
export function profileGate(snapshot: ProfileGateSnapshot): ProfileGate {
  if (snapshot.loading) return "auth-loading";
  if (!snapshot.userId) return "signed-out";
  if (snapshot.profileProbeFailed) return "profile-error";
  if (snapshot.hasProfile === null) return "profile-loading";
  if (snapshot.hasProfile === false) return "profile-incomplete";
  return "ready";
}

/**
 * 프로필 판정 없이 열어 두는 라우트 묶음(첫 경로 조각). 가입을 마치는 자리 `(auth)`(로그인 ·
 * 가입 · 완료 프로필 · 비밀번호 재설정)와 기능 경로가 없는 읽기 전용 소개 `onboarding` 이다.
 * 전역 C10 리다이렉트(app/_layout.tsx IntroGate)의 예외와 같다.
 */
export const PROFILE_GATE_EXEMPT_SEGMENTS: readonly string[] = ["(auth)", "onboarding"];

/**
 * 이 라우트의 화면 대신 공용 다시 시도를 그려야 하는가. 프로브가 실패한(모름) 동안의
 * 라우트 층 판정이다.
 *
 * 화면마다 profileGate 를 받게 하는 것만으로는 모자랐다. 실패 화면의 도크가 /records ·
 * /settings · /import-hub 처럼 userId 만 보는 화면으로 이어졌고, 전역 C10 리다이렉트는 서버가
 * "프로필 없음" 이라고 답한 경우만 봐서 실패 상태를 통과시켰다. 그 길로 연령 · 동의가 확인되지
 * 않은 세션이 기능 화면에 들어갔다(vibe r260914 게이트 발견). 그래서 판정을 라우트 층으로
 * 올렸다. IntroGate 가 트리 전체를, ThemedStack 의 ProfileProbeScope 가 장면 하나하나를 붙든다.
 *
 * `routeSegment` 는 첫 경로 조각이다. IntroGate 는 `useSegments()[0]`("/" 는 undefined)을,
 * 장면은 라우트 이름의 첫 조각("index" · "records" · "(auth)")을 넘긴다.
 */
export function profileProbeHoldsRoute(
  snapshot: ProfileGateSnapshot,
  routeSegment: string | undefined,
): boolean {
  if (routeSegment !== undefined && PROFILE_GATE_EXEMPT_SEGMENTS.includes(routeSegment)) return false;
  return profileGate(snapshot) === "profile-error";
}

// ── 시계 차이 자동 재시도 ───────────────────────────────────────────────────

/**
 * PostgREST 가 토큰의 iat(발급 시각)를 자기 시계보다 미래로 볼 때 내는 거절인가.
 *
 * T1a 에서 로그인 3초 뒤 첫 프로브가 이 문구로 실패했고
 * (`logcat/02-1.txt:514,543` — 22:00:33.715 로그인 → 22:00:36.763 실패), 그 뒤 홈이
 * 로딩에 멈춰 온보딩이 뜨지 않았다.
 *
 * PostgREST v14 문서(references/auth, Time-Based claims validation)는 exp · iat ·
 * nbf 검증에 30초 시계 오차를 허용한다. 그러니 이 거절은 발급한 쪽 시계가 검사한 쪽
 * 시계보다 그 허용치 넘게 앞서 있었다는 뜻이다. iat 는 인증 서버가 찍고 API 서버가
 * 검사하므로 기기 시계는 이 비교에 들어가지 않는다 — 문서에서 끌어낸 추론이고,
 * 이 저장소에서 두 서버 시계를 잰 적은 없다.
 *
 * 다른 실패(네트워크 · DNS · 타임아웃 · `JWT expired`)는 시계와 무관하다. 그걸
 * 자동으로 되풀이하면 로더만 길어진다.
 */
export function isClockSkewProbeError(message: string | null | undefined): boolean {
  return typeof message === "string" && /issued at future/i.test(message);
}

export interface ProfileProbeAttempt {
  probe: ProfileProbe;
  /** 서버가 이 시도를 `JWT issued at future` 로 거절했다. 타임아웃 폴백은 false 다. */
  clockSkew: boolean;
}

/**
 * 시계 차이로 거절됐을 때 다시 묻기 전에 기다리는 시간. **재시도는 최대 2회.**
 *
 * - 기다리면 풀리는 이유: iat 는 고정이고 실제 시간은 흐른다. 허용치를 넘은 만큼을
 *   1초에 1초씩 따라잡는다. 막 찍은 토큰이 경계를 조금 넘은 경우라면 몇 초면 된다.
 * - 한도를 두는 이유: 앞선 차이가 분 단위면 사람이 기다려 줄 시간 안에는 안 풀린다.
 *   그때는 화면의 다시 시도가 남는다. 한도 없이 되풀이하면 끝나지 않는 로더가 된다.
 * - 3초 · 5초인 이유: 합이 8초 = PROFILE_PROBE_TIMEOUT_MS. 이 경로가 로더에 더하는
 *   시간이 느린 프로브 한 번이 이미 쓸 수 있는 시간을 넘지 않게 했다. 두 번째 간격을
 *   더 길게 둔 것은 마지막 시도 전에 차이가 따라잡힐 시간을 더 주기 위해서다.
 */
export const CLOCK_SKEW_RETRY_DELAYS_MS: readonly number[] = [3_000, 5_000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 프로브를 한 번 돌리고, 시계 차이로 거절됐을 때만 CLOCK_SKEW_RETRY_DELAYS_MS 만큼
 * 기다렸다 다시 돌린다. 시도는 많아야 1 + 2 회다.
 *
 * `isCurrent` 가 false 가 되면(더 새 인증 이벤트나 refresh() 가 세대를 올렸다)
 * 기다리기 전이든 뒤든 멈추고 마지막 결과를 돌려준다. 그 결과는 호출자의 세대 검사가
 * 어차피 버린다 — 낡은 확인이 새 확인 옆에서 요청을 더 보내지 않게 하는 것이 목적이다.
 */
export async function probeWithClockSkewRetry({
  attempt,
  isCurrent,
  sleep = wait,
}: {
  attempt: () => Promise<ProfileProbeAttempt>;
  isCurrent: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ProfileProbe> {
  let result = await attempt();
  for (const delayMs of CLOCK_SKEW_RETRY_DELAYS_MS) {
    if (!result.clockSkew || !isCurrent()) break;
    await sleep(delayMs);
    if (!isCurrent()) break;
    result = await attempt();
  }
  return result.probe;
}
