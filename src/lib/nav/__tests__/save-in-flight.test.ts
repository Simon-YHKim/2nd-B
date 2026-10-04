// 저장이 응답을 기다리는 동안 goHome 이 아무것도 하지 않는가 (PR #2044 게이트 NAV-R3-01).
// 그리고 그 막기가 저장한 화면이 포커스된 동안에만 걸리는가 (게이트 NAV-S6-01).
//
// 저장 중 명단은 순수 모듈 상태라 가짜 타이머로 잰다. /esm 과 로그인 폼의 배선은
// 렌더 테스트가 막혀 있어(RN 0.85) 소스 계약으로 본다.
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
/** 저장한 화면이 지금 포커스된 화면이다(대부분의 시험). */
const focused = () => true;

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
    const end = beginSaveInFlight(focused);
    expect(isSaveInFlight()).toBe(true);
    end();
    expect(isSaveInFlight()).toBe(false);
  });

  it("겹친 저장은 둘 다 내려야 0 이다", () => {
    const a = beginSaveInFlight(focused);
    const b = beginSaveInFlight(focused);
    a();
    expect(isSaveInFlight()).toBe(true);
    b();
    expect(isSaveInFlight()).toBe(false);
  });

  it("같은 해제를 두 번 불러도 한 번만 센다 - 다른 저장을 풀지 않는다", () => {
    const a = beginSaveInFlight(focused);
    const b = beginSaveInFlight(focused);
    a();
    a();
    expect(isSaveInFlight()).toBe(true);
    b();
    expect(isSaveInFlight()).toBe(false);
  });

  it("내려서 0 이 되면 자동 해제 타이머도 남지 않는다", () => {
    const end = beginSaveInFlight(focused);
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
    beginSaveInFlight(focused); // 내리지 않는다 - 응답이 오지 않은 저장
    jest.advanceTimersByTime(SAVE_IN_FLIGHT_LIMIT_MS - 1);
    expect(isSaveInFlight()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isSaveInFlight()).toBe(false);
  });

  it("시간은 마지막으로 올린 때부터 다시 잰다", () => {
    beginSaveInFlight(focused);
    jest.advanceTimersByTime(10_000);
    beginSaveInFlight(focused);
    jest.advanceTimersByTime(SAVE_IN_FLIGHT_LIMIT_MS - 1); // 첫 저장으로부터는 29.999초
    expect(isSaveInFlight()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isSaveInFlight()).toBe(false);
  });

  it("자동 해제 뒤 늦게 온 해제는 새로 올린 저장을 풀지 않는다", () => {
    const late = beginSaveInFlight(focused);
    jest.advanceTimersByTime(SAVE_IN_FLIGHT_LIMIT_MS);
    expect(isSaveInFlight()).toBe(false);
    const fresh = beginSaveInFlight(focused);
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
    const end = beginSaveInFlight(focused);
    goHome();
    expect(mockDismissTo).not.toHaveBeenCalled();
    end();
    goHome();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });

  it("응답이 오지 않아도 20초가 지나면 다시 간다", () => {
    beginSaveInFlight(focused);
    jest.advanceTimersByTime(SAVE_IN_FLIGHT_LIMIT_MS - 1);
    goHome();
    expect(mockDismissTo).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    goHome();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });
});

// 고치기 전(cf00ee68): 수가 전역이라 /esm 을 저장 중에 뒤로(허용된 길)로 떠난 뒤
// 다른 화면의 <RedirectHome /> 이 포커스 효과에서 goHome 을 **한 번** 부르면 그 한
// 번이 삼켜졌다. RedirectHome 은 다시 부르지 않으므로 빈 화면이 포커스가 바뀔 때까지
// 남았다. 아래 시험의 goHome() 한 번이 그 포커스 효과의 한 번이다.
describe("떠난 화면의 저장은 다른 화면의 홈 이동을 막지 않는다 (게이트 NAV-S6-01)", () => {
  it("저장한 화면이 포커스를 잃으면(뒤로 떠남) 한 번의 goHome 이 그대로 간다", () => {
    let esmFocused = true;
    beginSaveInFlight(() => esmFocused); // 응답은 아직 오지 않았다
    goHome();
    expect(mockDismissTo).not.toHaveBeenCalled(); // 대조: 포커스된 동안은 막는다
    esmFocused = false; // 뒤로 - /esm 칸이 사라졌다
    goHome(); // RedirectHome 의 포커스 효과
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });

  it("포커스는 부를 때마다 다시 읽는다 - 돌아오면 다시 막는다", () => {
    let esmFocused = false;
    beginSaveInFlight(() => esmFocused);
    expect(isSaveInFlight()).toBe(false);
    esmFocused = true;
    expect(isSaveInFlight()).toBe(true);
  });

  it("겹친 저장 가운데 포커스된 화면의 저장이 하나라도 있으면 막는다", () => {
    beginSaveInFlight(() => false);
    expect(isSaveInFlight()).toBe(false);
    beginSaveInFlight(focused);
    expect(isSaveInFlight()).toBe(true);
  });

  it("판정이 던지면 그 저장은 막지 않는다 - 사라진 화면에는 지킬 것이 없다", () => {
    beginSaveInFlight(() => {
      throw new Error("gone");
    });
    goHome();
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
  });
});

describe("/esm 배선 (소스 계약)", () => {
  const esm = read("src/app/esm.tsx");

  it("저장은 첫 await 전에 이 화면의 포커스와 함께 올리고 finally 에서 내린다", () => {
    const body = esm.slice(esm.indexOf("async function handleSubmit()"));
    const begin = body.indexOf("const endSave = beginSaveInFlight(() => navigation.isFocused());");
    const firstAwait = body.indexOf("await ");
    const finallyAt = body.indexOf("} finally {");
    const end = body.indexOf("endSave();", finallyAt);
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(firstAwait);
    expect(body.indexOf("endSaveRef.current = endSave;")).toBeGreaterThan(begin);
    expect(body.indexOf("endSaveRef.current = endSave;")).toBeLessThan(firstAwait);
    expect(finallyAt).toBeGreaterThan(firstAwait);
    expect(end).toBeGreaterThan(finallyAt);
  });

  it("화면이 사라지면 남은 저장을 내린다 - 훅은 이른 return 앞에 있다", () => {
    const unmount = esm.indexOf("useEffect(() => () => endSaveRef.current?.(), []);");
    expect(esm).toContain("const navigation = useNavigation();");
    expect(unmount).toBeGreaterThan(-1);
    expect(unmount).toBeLessThan(esm.indexOf("if (authLoading) {"));
  });

  it("홈 버튼은 저장 중에 disabled 이고 busy 를 알린다", () => {
    const button = esm.match(/<PremiumButton\s+label=\{t\("actions\.backHome"\)\}[\s\S]*?\/>/)?.[0] ?? "";
    expect(button).toContain("onPress={goHome}");
    expect(button).toContain("disabled={saving}");
    expect(button).toContain("accessibilityState={{ busy: saving }}");
  });
});

// 같은 이유의 다른 자리 (게이트 NAV-R3-01 동형, 로그인 요청 중 Back). 로그인 폼의
// 하드웨어 뒤로가 요청 중에 goHome 하면 이 칸이 걷히고 실패 안내가 사라진 훅으로 갔다.
// 여기서는 goHome 이 아니라 **그 핸들러만** 멈춘다: 성공 뒤의 goHome 과
// <RedirectHome /> 은 막히면 안 된다(그 막힘이 NAV-S6-01 이다).
describe("로그인 요청 중 하드웨어 뒤로 (소스 계약)", () => {
  const hook = read("src/lib/auth/useSignInForm.ts");
  const submit = hook.slice(hook.indexOf("const handleSubmit = useCallback(async () => {"));
  const submitBody = submit.slice(0, submit.indexOf("}, [email, password, refresh, t]);"));

  it("뒤로 핸들러는 요청 중에 goHome 을 부르지 않고 입력만 소비한다", () => {
    const handler = hook.slice(hook.indexOf("const onBackPress = () => {"), hook.indexOf('BackHandler.addEventListener("hardwareBackPress"'));
    expect(handler).toContain("if (!backHeldRef.current) goHome();");
    expect(handler).toContain("return true;");
  });

  it("요청은 첫 await 전에 잡고 finally 에서 놓는다", () => {
    const hold = submitBody.indexOf("backHeldRef.current = true;");
    const firstAwait = submitBody.indexOf("await ");
    const finallyAt = submitBody.indexOf("} finally {");
    expect(hold).toBeGreaterThan(-1);
    expect(hold).toBeLessThan(firstAwait);
    expect(submitBody.indexOf("backHeldRef.current = false;", finallyAt)).toBeGreaterThan(finallyAt);
  });

  it("응답이 오지 않아도 오래 걸린다는 안내가 뜰 때 놓는다 - 영구히 막지 않는다", () => {
    const timer = hook.slice(hook.indexOf("const timer = setTimeout(() => {"), hook.indexOf("}, SIGN_IN_LONG_WAIT_MS);"));
    expect(timer).toContain("backHeldRef.current = false;");
    expect(timer).toContain("setSignInTakingLong(true);");
  });

  it("성공 뒤의 goHome 은 잡힌 상태를 보지 않는다", () => {
    const success = submitBody.slice(0, submitBody.indexOf("} catch (e) {"));
    expect(success).toContain("goHome();");
    expect(success).not.toContain("backHeldRef.current)");
  });
});
