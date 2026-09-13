// 프로필 프로브가 실패했을 때의 두 규칙 (vibe r260914 R3-A).
//
// 1. 실패한 프로브는 **로딩이 아니다.** T1a 에뮬레이터 검증(항목 2)에서 /account ·
//    /data 가 실패 뒤 로딩 캡션만 남기고 멈췄다 — 서버 오류 · DNS 실패 · 8초
//    타임아웃 셋 다, 네트워크를 되살려도. 화면이 "아직 모름" 과 "기다리는 중" 을
//    한 갈래로 묶은 탓이다. profileGate 가 그 둘을 가른다.
// 2. `JWT issued at future` 만 짧게 기다렸다 **한도 안에서** 다시 묻는다. 그 밖의
//    실패를 자동으로 되풀이하면 로더만 길어진다(같은 검증의 DNS·TCP 경로).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CLOCK_SKEW_RETRY_DELAYS_MS,
  PROFILE_PROBE_TIMEOUT_MS,
  isClockSkewProbeError,
  probeWithClockSkewRetry,
  profileGate,
  type ProfileGateSnapshot,
  type ProfileProbe,
  type ProfileProbeAttempt,
} from "../profile-probe";

const FAILED: ProfileProbe = { hasProfile: false, isMinor: null, age: null, probeFailed: true };
const ANSWERED: ProfileProbe = { hasProfile: true, isMinor: false, age: 30 };

describe("profileGate - 실패한 프로브는 다시 시도할 수 있는 오류다", () => {
  const signedIn: ProfileGateSnapshot = {
    loading: false,
    userId: "user-a",
    hasProfile: false,
    profileProbeFailed: false,
  };

  test("프로브 실패는 profile-error 다 (로딩 캡션만 남던 상태)", () => {
    expect(profileGate({ ...signedIn, hasProfile: false, profileProbeFailed: true })).toBe("profile-error");
  });

  test("실패 표시는 hasProfile 값보다 먼저 읽는다", () => {
    for (const hasProfile of [null, false, true]) {
      expect(profileGate({ ...signedIn, hasProfile, profileProbeFailed: true })).toBe("profile-error");
    }
  });

  test("답을 기다리는 동안만 profile-loading 이다", () => {
    expect(profileGate({ ...signedIn, hasProfile: null })).toBe("profile-loading");
  });

  test("서버가 '프로필 없음' 이라고 답했을 때만 profile-incomplete 다", () => {
    // 실패를 여기로 보내면 가입을 마친 사람을 생년월일·동의 재입력으로 내쫓는다(F4).
    expect(profileGate({ ...signedIn, hasProfile: false })).toBe("profile-incomplete");
  });

  test("세션 확인과 로그아웃이 프로필 판정보다 먼저다", () => {
    expect(profileGate({ ...signedIn, loading: true, profileProbeFailed: true })).toBe("auth-loading");
    expect(profileGate({ ...signedIn, userId: null, profileProbeFailed: true })).toBe("signed-out");
  });

  test("프로필이 확인돼야 ready 다", () => {
    expect(profileGate({ ...signedIn, hasProfile: true })).toBe("ready");
  });
});

describe("isClockSkewProbeError", () => {
  test("PostgREST 의 iat 거절 문구를 알아본다", () => {
    expect(isClockSkewProbeError("JWT issued at future")).toBe(true);
    expect(isClockSkewProbeError("jwt issued at future")).toBe(true);
  });

  test("시계와 무관한 실패는 자동 재시도 대상이 아니다", () => {
    for (const message of [
      "JWT expired",
      "fetch failed: java.net.UnknownHostException",
      "Network request failed",
      "",
      undefined,
      null,
    ]) {
      expect(isClockSkewProbeError(message)).toBe(false);
    }
  });
});

describe("probeWithClockSkewRetry - 한도 있는 자동 재시도", () => {
  const skew = (): ProfileProbeAttempt => ({ probe: FAILED, clockSkew: true });
  const otherFailure = (): ProfileProbeAttempt => ({ probe: FAILED, clockSkew: false });
  const answered = (): ProfileProbeAttempt => ({ probe: ANSWERED, clockSkew: false });

  function scripted(results: ProfileProbeAttempt[]) {
    return jest.fn(async (): Promise<ProfileProbeAttempt> => {
      const next = results.shift();
      if (!next) throw new Error("attempt ran more often than the script allows");
      return next;
    });
  }
  const noWait = () => jest.fn(async (_ms: number): Promise<void> => undefined);

  test("시계 차이 실패가 이어지면 첫 시도 + 재시도 2회에서 멈춘다", async () => {
    const attempt = scripted([skew(), skew(), skew(), skew(), skew()]);
    const sleep = noWait();

    const probe = await probeWithClockSkewRetry({ attempt, isCurrent: () => true, sleep });

    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([...CLOCK_SKEW_RETRY_DELAYS_MS]);
    expect(probe).toBe(FAILED);
  });

  test("재시도에서 서버가 답하면 그 답을 돌려준다", async () => {
    const attempt = scripted([skew(), answered()]);
    const sleep = noWait();

    const probe = await probeWithClockSkewRetry({ attempt, isCurrent: () => true, sleep });

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([CLOCK_SKEW_RETRY_DELAYS_MS[0]]);
    expect(probe).toBe(ANSWERED);
  });

  test("시계와 무관한 실패는 기다리지 않고 바로 돌려준다", async () => {
    const attempt = scripted([otherFailure(), answered()]);
    const sleep = noWait();

    const probe = await probeWithClockSkewRetry({ attempt, isCurrent: () => true, sleep });

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(probe).toBe(FAILED);
  });

  test("첫 시도에 답하면 기다리지 않는다", async () => {
    const attempt = scripted([answered()]);
    const sleep = noWait();

    expect(await probeWithClockSkewRetry({ attempt, isCurrent: () => true, sleep })).toBe(ANSWERED);
    expect(sleep).not.toHaveBeenCalled();
  });

  test("기다리는 사이 더 새 확인이 시작되면 다시 묻지 않는다", async () => {
    let current = true;
    const attempt = scripted([skew(), answered()]);
    const sleep = jest.fn(async (_ms: number): Promise<void> => {
      current = false; // 인증 이벤트나 refresh() 가 세대를 올렸다
    });

    const probe = await probeWithClockSkewRetry({ attempt, isCurrent: () => current, sleep });

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(probe).toBe(FAILED);
  });

  test("이미 낡은 확인이면 기다리지도 않는다", async () => {
    const attempt = scripted([skew(), answered()]);
    const sleep = noWait();

    await probeWithClockSkewRetry({ attempt, isCurrent: () => false, sleep });

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test("한도: 재시도 2회, 늘어나는 대기는 프로브 타임아웃 한 번 분량을 넘지 않는다", () => {
    expect(CLOCK_SKEW_RETRY_DELAYS_MS).toHaveLength(2);
    for (const ms of CLOCK_SKEW_RETRY_DELAYS_MS) expect(ms).toBeGreaterThan(0);
    const added = CLOCK_SKEW_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);
    expect(added).toBeLessThanOrEqual(PROFILE_PROBE_TIMEOUT_MS);
  });
});

describe("AuthContext 배선 - 프로브를 부르는 세 자리가 모두 한도 있는 재시도를 지난다", () => {
  // 컴포넌트 렌더 테스트가 막혀 있어(RN 0.85 upstream) 배선은 소스로 확인한다.
  // 세 자리 = 같은 사용자 재확인 · 첫 확인 · refresh(). 한 자리라도 fetchProfileAttempt 를
  // 직접 부르면 그 자리에서 난 `JWT issued at future` 는 재시도 없이 실패로 굳는다.
  const AUTH = readFileSync(join(__dirname, "..", "AuthContext.tsx"), "utf8");

  test("fetchProfileAttempt 는 probeProfile 안에서만 부른다", () => {
    // 선언 한 번 + probeProfile 안의 호출 한 번
    expect(AUTH.match(/fetchProfileAttempt\(/g)).toHaveLength(2);
    expect(AUTH).toMatch(/withTimeout<ProfileProbeAttempt>\(fetchProfileAttempt\(userId\)/);
  });

  test("세 확인 자리가 probeProfile 을 부른다", () => {
    expect(AUTH.match(/await probeProfile\(/g)).toHaveLength(3);
  });

  test("시계 차이 표시는 서버 오류 문구에서만 나온다 - 타임아웃 폴백은 아니다", () => {
    expect(AUTH.match(/clockSkew: isClockSkewProbeError\(/g)).toHaveLength(1);
    expect(AUTH).toContain("clockSkew: isClockSkewProbeError(error.message)");
  });
});
