// 저장이 응답을 기다리는 동안 goHome 이 아무것도 하지 않는가 (PR #2044 게이트 NAV-R3-01).
//
// 저장 중 수는 순수 모듈 상태라 가짜 타이머로 잰다. /esm 의 배선은 렌더 테스트가
// 막혀 있어(RN 0.85) 소스 계약으로 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { goHome } from "../go-home";
import {
  SAVE_IN_FLIGHT_LIMIT_MS,
  beginSaveInFlight,
  isSaveInFlight,
  resetSaveInFlightForTests,
} from "../save-in-flight";

const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args) },
  useFocusEffect: jest.fn(),
  useRoute: () => ({ key: "unset" }),
  useNavigationContainerRef: () => ({ isReady: () => false }),
}));

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

beforeEach(() => {
  jest.useFakeTimers();
  resetSaveInFlightForTests();
  mockDismissTo.mockClear();
});
afterEach(() => {
  resetSaveInFlightForTests();
  jest.useRealTimers();
});

describe("저장 중 수", () => {
  it("처음에는 0 이다", () => {
    expect(isSaveInFlight()).toBe(false);
  });

  it("올리면 저장 중이고, 돌려받은 함수로 내리면 0 이다", () => {
    const end = beginSaveInFlight();
    expect(isSaveInFlight()).toBe(true);
    end();
    expect(isSaveInFlight()).toBe(false);
  });

  it("겹친 저장은 둘 다 내려야 0 이다", () => {
    const a = beginSaveInFlight();
    const b = beginSaveInFlight();
    a();
    expect(isSaveInFlight()).toBe(true);
    b();
    expect(isSaveInFlight()).toBe(false);
  });

  it("같은 해제를 두 번 불러도 한 번만 센다 - 다른 저장을 풀지 않는다", () => {
    const a = beginSaveInFlight();
    const b = beginSaveInFlight();
    a();
    a();
    expect(isSaveInFlight()).toBe(true);
    b();
    expect(isSaveInFlight()).toBe(false);
  });

  it("내려서 0 이 되면 자동 해제 타이머도 남지 않는다", () => {
    const end = beginSaveInFlight();
    expect(jest.getTimerCount()).toBe(1);
    end();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("20초 자동 해제", () => {
  it("한도는 20초다", () => {
    expect(SAVE_IN_FLIGHT_LIMIT_MS).toBe(20_000);
  });

  it("응답이 끝내 오지 않아도 마지막으로 올린 뒤 20초에 0 이 된다", () => {
    beginSaveInFlight(); // 내리지 않는다 - 응답이 오지 않은 저장
    jest.advanceTimersByTime(SAVE_IN_FLIGHT_LIMIT_MS - 1);
    expect(isSaveInFlight()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isSaveInFlight()).toBe(false);
  });

  it("시간은 마지막으로 올린 때부터 다시 잰다", () => {
    beginSaveInFlight();
    jest.advanceTimersByTime(10_000);
    beginSaveInFlight();
    jest.advanceTimersByTime(SAVE_IN_FLIGHT_LIMIT_MS - 1); // 첫 저장으로부터는 29.999초
    expect(isSaveInFlight()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isSaveInFlight()).toBe(false);
  });

  it("자동 해제 뒤 늦게 온 해제는 새로 올린 저장을 풀지 않는다", () => {
    const late = beginSaveInFlight();
    jest.advanceTimersByTime(SAVE_IN_FLIGHT_LIMIT_MS);
    expect(isSaveInFlight()).toBe(false);
    const fresh = beginSaveInFlight();
    late();
    expect(isSaveInFlight()).toBe(true);
    fresh();
    expect(isSaveInFlight()).toBe(false);
  });
});

describe("goHome 은 저장 중에 아무것도 하지 않는다", () => {
  it("저장이 없으면 dismissTo(\"/\") 로 간다 (대조)", () => {
    goHome();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith("/");
  });

  it("저장 중에는 부르지 않고, 내린 뒤에는 다시 간다", () => {
    const end = beginSaveInFlight();
    goHome();
    expect(mockDismissTo).not.toHaveBeenCalled();
    end();
    goHome();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });

  it("응답이 오지 않아도 20초가 지나면 다시 간다", () => {
    beginSaveInFlight();
    jest.advanceTimersByTime(SAVE_IN_FLIGHT_LIMIT_MS - 1);
    goHome();
    expect(mockDismissTo).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    goHome();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });
});

describe("/esm 배선 (소스 계약)", () => {
  const esm = read("src/app/esm.tsx");

  it("저장은 첫 await 전에 올리고 finally 에서 내린다", () => {
    const body = esm.slice(esm.indexOf("async function handleSubmit()"));
    const begin = body.indexOf("const endSave = beginSaveInFlight();");
    const firstAwait = body.indexOf("await ");
    const finallyAt = body.indexOf("} finally {");
    const end = body.indexOf("endSave();", finallyAt);
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(firstAwait);
    expect(finallyAt).toBeGreaterThan(firstAwait);
    expect(end).toBeGreaterThan(finallyAt);
  });

  it("홈 버튼은 저장 중에 disabled 이고 busy 를 알린다", () => {
    const button = esm.match(/<PremiumButton\s+label=\{t\("actions\.backHome"\)\}[\s\S]*?\/>/)?.[0] ?? "";
    expect(button).toContain("onPress={goHome}");
    expect(button).toContain("disabled={saving}");
    expect(button).toContain("accessibilityState={{ busy: saving }}");
  });
});
