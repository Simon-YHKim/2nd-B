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

  test("the home reward action is fail-closed for age, tier and ad config", () => {
    const home = readRepoFile("src/components/deep-space/ConstellationHome.tsx");
    const guard = '{isMinor === false && progression.tier === "free" && rewardedAdsConfigured() ? (';
    const rewardLabel = "광고 보고 ${REWARD_PER_WATCH}회 받기";
    const guardIndex = home.indexOf(guard);
    const rewardIndex = home.indexOf(rewardLabel);
    const guardEndIndex = home.indexOf(") : null}", rewardIndex);

    expect(home).toContain("const { userId, isMinor } = useAuth();");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(rewardIndex).toBeGreaterThan(guardIndex);
    expect(rewardIndex - guardIndex).toBeLessThan(500);
    expect(guardEndIndex).toBeGreaterThan(rewardIndex);
  });

  test("reward CTAs open THE limit sheet, never the dead /records detour (spec F, 계약 14)", () => {
    for (const file of ["src/components/deep-space/ConstellationHome.tsx", "src/app/reasoning.tsx"]) {
      const source = readRepoFile(file);
      expect(source).toContain("<ReasoningLimitSheet");
      expect(source).not.toContain('"/records"');
      expect(source).not.toContain("광고로 1회 받기");
    }
  });

  test("the source-item loader honors the inline body fallback (2026-07-18 QA)", () => {
    // capture.ts stashes the body in frontmatter._body_fallback when the
    // Storage upload didn't land. The batch loader reading storage_path
    // unconditionally 400'd and killed the whole auto run — the fallback
    // check must come before the storage read.
    const reasoning = readRepoFile("src/app/reasoning.tsx");
    const fallbackIndex = reasoning.indexOf("_body_fallback");
    const downloadIndex = reasoning.indexOf("downloadRawClipping(source.storage_path)");
    expect(fallbackIndex).toBeGreaterThan(-1);
    expect(downloadIndex).toBeGreaterThan(fallbackIndex);
  });

  test("the reasoning surface holds unknown profiles and unknown age", () => {
    const reasoning = readRepoFile("src/app/reasoning.tsx");

    expect(reasoning).toContain("hasProfile,");
    expect(reasoning).toContain("profileProbeFailed,");
    expect(reasoning).toContain(
      "if (hasProfile === false && profileProbeFailed) return <InlineLoader />;",
    );
    expect(reasoning).toContain(
      "if (hasProfile !== true || isMinor == null) return <InlineLoader />;",
    );
    expect(reasoning).toContain(
      '{isMinor === false && progression.tier === "free" && rewardedAdsConfigured() ? (',
    );
    expect(reasoning).not.toContain("{isMinor !== true ? (");
  });
});
