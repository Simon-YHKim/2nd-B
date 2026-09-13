import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// 보상형 적립이 실패해도 아무도 말하지 않는 마지막 자리를 닫는다.
//
// #1668 이 시트 계약을 고쳐 호출자가 "capped"/"unconfirmed" 를 돌려줄 수 있게
// 했지만, 추론 크레딧 경로는 여전히 보고할 실패가 없었다. addRewardCredits 가
// 자기 오류를 console.warn 으로 삼키고 void 를 돌려주기 때문이다. 그래서
// dds-plans-screen 의 onRewardEarned 은 실패를 알 방법 자체가 없고,
// ReasoningLimitSheet 의 onWatch 도 마찬가지다.
//
// ⚠ 이 함수의 문서 계약은 "Fails gracefully (warn, no throw)" 다. 그 계약은
// 그대로 둔다 - 던지게 바꾸면 두 호출자가 다 깨진다. 대신 결과를 돌려준다.
const rpc = jest.fn();
const from = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from, rpc }),
}));

import { addRewardCredits } from "../usage";
import { REWARD_MONTHLY_CAP, REWARD_PER_WATCH } from "../tiers";

const OWNER = "11111111-2222-3333-4444-555555555555";
const SRC = (path: string) => readFileSync(resolve(__dirname, "../../..", path), "utf8");

interface RewardSnapshot {
  monthBucket: string;
  rewardEarned: number;
}

function pureFunction<T>(source: string, name: string): T {
  const ast = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  if (!declaration) throw new Error(`${name} 선언을 찾지 못했다`);
  const js = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(`${js}\nreturn ${name};`)() as T;
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  delete process.env.EXPO_PUBLIC_REWARD_SSV;
});

describe("addRewardCredits 가 무슨 일이 있었는지 돌려준다", () => {
  test("상한 아래에서 적립되면 granted", async () => {
    rpc.mockResolvedValue({ data: REWARD_PER_WATCH, error: null });
    await expect(addRewardCredits(OWNER, REWARD_PER_WATCH)).resolves.toBe("granted");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  test("월 상한에 닿아 있으면 capped", async () => {
    rpc.mockResolvedValue({ data: REWARD_MONTHLY_CAP, error: null });
    await expect(addRewardCredits(OWNER, REWARD_PER_WATCH)).resolves.toBe("capped");
  });

  test("RPC 가 오류를 돌려주면 unconfirmed - 적립이 안 됐다고 단정하지 않는다", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(addRewardCredits(OWNER, REWARD_PER_WATCH)).resolves.toBe("unconfirmed");
  });

  test("RPC 가 숫자가 아닌 것을 돌려줘도 unconfirmed", async () => {
    rpc.mockResolvedValue({ data: "nope", error: null });
    await expect(addRewardCredits(OWNER, REWARD_PER_WATCH)).resolves.toBe("unconfirmed");
  });

  test("호출 자체가 던져도 던지지 않고 unconfirmed 로 돌려준다", async () => {
    rpc.mockRejectedValue(new Error("network"));
    await expect(addRewardCredits(OWNER, REWARD_PER_WATCH)).resolves.toBe("unconfirmed");
  });

  test("SSV 모드에서는 RPC 를 부르지 않고 processing - 비동기 서버 정산을 실패와 구분한다", async () => {
    process.env.EXPO_PUBLIC_REWARD_SSV = "true";
    await expect(addRewardCredits(OWNER, REWARD_PER_WATCH)).resolves.toBe("processing");
    expect(rpc).not.toHaveBeenCalled();
  });

  test("계약대로 절대 던지지 않는다", async () => {
    for (const response of [
      { data: null, error: { message: "x" } },
      { data: undefined, error: null },
      { data: 0, error: null },
    ]) {
      rpc.mockResolvedValue(response);
      await expect(addRewardCredits(OWNER, REWARD_PER_WATCH)).resolves.toEqual(expect.any(String));
    }
  });
});

describe("세 보상 표면이 전부 그 결과를 쓴다", () => {
  test("추론 한도 시트: 처리 중을 실패와 구분하고 재시청을 잠근다", () => {
    const source = SRC("components/deep-space/ReasoningLimitSheet.tsx");
    expect(source).toMatch(/const\s+\w+\s*=\s*await addRewardCredits\(/);
    expect(source).toMatch(/accessibilityLiveRegion="polite"/);
    expect(source).toContain("ds.reward.creditFailed");
    expect(source).toContain("ds.reward.creditProcessing");
    expect(source).toMatch(/const unresolved = grant === "processing" \|\| grant === "unconfirmed"/);
    expect(source).toMatch(/setGrantOutcome\(unresolved \? grant : null\)/);
    expect(source).toMatch(/!grantOutcome/);
  });

  test("추론 한도 시트: reopen 조회가 watch 직전 bucket+earned 증거를 통과할 때만 잠금을 푼다", () => {
    const source = SRC("components/deep-space/ReasoningLimitSheet.tsx");
    const baselineWrite = source.indexOf("pendingRewardBaselineRef.current = {");
    const watch = source.indexOf("await showRewardedAd", baselineWrite);

    expect(source).toMatch(/useRef<RewardEarnedBaseline \| null>\(null\)/);
    expect(baselineWrite).toBeGreaterThan(-1);
    expect(baselineWrite).toBeLessThan(watch);
    expect(source).toMatch(
      /hasRewardSettlementAdvanced\(next, pendingRewardBaselineRef\.current\)[\s\S]{0,320}setGrantOutcome\(null\)/,
    );
    expect(source).not.toMatch(/if \(visible\)[^{\n]*setGrantOutcome\(null\)/);
    expect(source).toMatch(/residual P2[\s\S]{0,160}receipt/i);
  });

  test.each([
    ["같은 달 증가", { monthBucket: "2026-09", rewardEarned: 4 }, { monthBucket: "2026-09", rewardEarned: 6 }, true],
    ["같은 달 동일", { monthBucket: "2026-09", rewardEarned: 4 }, { monthBucket: "2026-09", rewardEarned: 4 }, false],
    ["같은 달 감소", { monthBucket: "2026-09", rewardEarned: 4 }, { monthBucket: "2026-09", rewardEarned: 2 }, false],
    ["새 달 양수", { monthBucket: "2026-09", rewardEarned: 20 }, { monthBucket: "2026-10", rewardEarned: 2 }, true],
    ["새 달 0", { monthBucket: "2026-09", rewardEarned: 20 }, { monthBucket: "2026-10", rewardEarned: 0 }, false],
    ["새해 양수", { monthBucket: "2026-12", rewardEarned: 20 }, { monthBucket: "2027-01", rewardEarned: 2 }, true],
    ["낡은 달", { monthBucket: "2026-09", rewardEarned: 4 }, { monthBucket: "2026-08", rewardEarned: 20 }, false],
    ["비정규 새 달", { monthBucket: "2026-09", rewardEarned: 4 }, { monthBucket: "2026-10x", rewardEarned: 20 }, false],
    ["존재하지 않는 달", { monthBucket: "2026-09", rewardEarned: 4 }, { monthBucket: "2026-13", rewardEarned: 20 }, false],
  ] as const)("월 경계 정산 판정: %s", (_label, baseline, next, expected) => {
    const observed = pureFunction<(next: RewardSnapshot, baseline: RewardSnapshot) => boolean>(
      SRC("components/deep-space/ReasoningLimitSheet.tsx"),
      "hasRewardSettlementAdvanced",
    );
    expect(observed(next, baseline)).toBe(expected);
  });

  test("요금제 화면: 결과를 시트에 돌려준다", () => {
    const source = SRC("screens/deepspace/dds-plans-screen.tsx");
    expect(source).toMatch(/const\s+\w+\s*=\s*await addRewardCredits\(/);
    expect(source).toMatch(/return\s+\w+;/);
    // 시트가 결과를 읽으려면 onRewardEarned 이 그것을 돌려주는 타입이어야 한다.
    expect(source).toContain("RewardedEarnOutcome");
  });

  test("대화 화면은 이미 #1668 에서 같은 모양이 됐다", () => {
    const source = SRC("app/secondb.tsx");
    expect(source).toContain("RewardedEarnOutcome");
    expect(source).toMatch(/outcome = e instanceof ChatRewardCapReachedError \? "capped" : "unconfirmed";/);
    expect(source).toMatch(/EXPO_PUBLIC_REWARD_SSV[^\n]*=== "true" \? "processing" : "granted"/);
  });
});

describe("보상 결과 문구는 다섯 로케일에서 같은 계약을 갖는다", () => {
  test("ds.reward 의 상한·실패·처리 중 문구가 모두 있고 서로 다르다", () => {
    for (const code of ["en", "ko", "es", "pt", "id"]) {
      const bundle = JSON.parse(SRC(`../locales/${code}/deepspace.json`)) as {
        ds: { reward: Record<string, string> };
      };
      expect(typeof bundle.ds.reward.capReached).toBe("string");
      expect(typeof bundle.ds.reward.creditFailed).toBe("string");
      expect(typeof bundle.ds.reward.creditProcessing).toBe("string");
      expect(bundle.ds.reward.creditProcessing).not.toBe(bundle.ds.reward.creditFailed);
    }
  });
});
