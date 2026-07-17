import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("reasoning execution isolation", () => {
  test("chat uses only its daily allowance", () => {
    const chat = readRepoFile("src/app/secondb.tsx");

    expect(chat).toContain("CHAT_DAILY_LIMIT");
    expect(chat).toContain('kind="chat"');
    for (const reasoningQuotaSymbol of [
      "remainingReasoning",
      "getReasoningUsage",
      "incrementReasoningUsage",
      "addRewardCredits",
      "usedDeepQuestions",
    ]) {
      expect(chat).not.toContain(reasoningQuotaSymbol);
    }
  });

  test("the home reward action is fail-closed for age", () => {
    const home = readRepoFile("src/components/deep-space/ConstellationHome.tsx");
    const guard = "{isMinor === false ? (";
    const rewardLabel = '"광고로 1회 받기"';
    const guardIndex = home.indexOf(guard);
    const rewardIndex = home.indexOf(rewardLabel);
    const guardEndIndex = home.indexOf(") : null}", rewardIndex);

    expect(home).toContain("const { userId, isMinor } = useAuth();");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(rewardIndex).toBeGreaterThan(guardIndex);
    expect(rewardIndex - guardIndex).toBeLessThan(400);
    expect(guardEndIndex).toBeGreaterThan(rewardIndex);
  });
});
