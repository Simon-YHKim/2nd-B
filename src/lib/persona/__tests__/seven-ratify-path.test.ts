// 새 일곱 별의 L5 경로가 **끝까지 이어져 있는가** — 그리고 옛 경로와 섞이지 않는가.
//
// 이 경로는 다섯 부품으로 돼 있다: 타입 자리(proposal.ts) → 프롬프트 라벨
// (propose-self-model.ts) → 재료(seven-proposal-context.ts) → 화면 분기
// (DeepSpaceReviewScreen) → 원장 쓰기(recordSevenTiers + seven: 접두사).
// 하나라도 빠지면 "비준했는데 별이 안 밝아지는" 조용한 반쪽이 된다 — #1377 의
// 리프트가 그렇게 사라졌던 전례가 있어서, 이 파일이 이음매를 전부 짚는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

type InsertBehavior = "success" | "resolved-error" | "throw";
let insertBehavior: InsertBehavior = "success";
const insert = jest.fn(async () => {
  if (insertBehavior === "throw") throw new Error("offline");
  return {
    data: null,
    error: insertBehavior === "resolved-error" ? { message: "write denied" } : null,
  };
});

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      insert,
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: [], error: null }),
        };
        return chain;
      },
    }),
  }),
}));

jest.mock("../../analytics", () => ({
  captureEvent: jest.fn(),
  starLit: (props: unknown) => ({ name: "star_lit", props }),
  activationMilestone: (props: unknown) => ({ name: "activation_milestone", props }),
}));

jest.mock("react-native", () => ({
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}));
jest.mock("@/components/ui/Text", () => ({ Text: "Text" }));
jest.mock("@/components/ui/Button", () => ({ Button: "Button" }));
jest.mock("@/components/pixel/PixelDither", () => ({ PixelScrim: "PixelScrim" }));

import { buildSelfModelProposalPrompt } from "../propose-self-model";
import { recordStarTiers } from "../record-star-tiers";
import { recordSevenTiers } from "../seven-tier-history";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const SCREEN = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
const LEGACY_SCREEN = read("src/app/review.tsx");
const SHEET = read("src/components/persona/RatifySheet.tsx");

describe("프롬프트가 시기 별을 시기 별이라고 부른다", () => {
  it("sevenStar 라벨이 life-period 다 (폴백으로 새면 철학 문장으로 오라벨된다)", () => {
    const { system } = buildSelfModelProposalPrompt(
      { kind: "sevenStar", star: "school" },
      "before",
      "evidence",
      "en",
    );
    expect(system).toContain('life-period star "school"');
    expect(system).not.toContain("philosophy sentence");
  });

  it("옛 축 라벨은 그대로다 (병렬 유지)", () => {
    const { system } = buildSelfModelProposalPrompt(
      { kind: "star", star: "now" },
      "before",
      "evidence",
      "en",
    );
    expect(system).toContain('self-understanding star "now"');
  });
});

describe("화면 분기", () => {
  it("시기 별 후보를 로드하고 그린다", () => {
    expect(SCREEN).toContain("sevenRatifiableTargets(userId)");
    expect(SCREEN).toContain("generateSeven");
    // 이름은 홈과 같은 키에서 -- 화면마다 다른 이름 금지.
    expect(SCREEN).toContain("tHome(`ds.star.${getSevenStar(st.star).key}`)");
  });

  it("⚠ 비준 쓰기가 seven 경로로만 나간다", () => {
    // recordStarTiers 로 새 별을 적으면 접두사가 빠져 옛 축과 같은 칸에 들어가고,
    // activation_milestone 이 조용히 틀린 숫자로 나간다.
    expect(SCREEN).toMatch(
      /proposal\?\.target\.kind === "sevenStar"[\s\S]{0,900}?await recordSevenTiers\(userId, \{ \[proposal\.target\.star\]: r\.resultingLevel \}, "ratify", evidenceRefs\)/,
    );
    const sevenBranch = /if \(userId && proposal\?\.target\.kind === "sevenStar"\) \{[\s\S]*?\n        \}/.exec(SCREEN)?.[0] ?? "";
    expect(sevenBranch.length).toBeGreaterThan(0);
    // 주석은 걷는다 -- "recordStarTiers 재사용 금지" 라는 설명 문장 자체는 있어야
    // 하고(재발을 막는 건 그 설명이다), 막는 것은 **코드에서 부르는 것**이다.
    const code = sevenBranch
      .split("\n")
      .filter((line: string) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(code).not.toContain("recordStarTiers");
  });

  it("옛 축 분기는 그대로 산다 (검사 기반 비준을 걷어내지 않았다)", () => {
    expect(SCREEN).toContain("ratifiableTargets");
    expect(SCREEN).toMatch(/proposal\?\.target\.kind === "star"[\s\S]{0,600}?recordStarTiers\(/);
  });

  it("빈 상태는 두 후보군이 다 비었을 때만", () => {
    expect(SCREEN).toContain("targets.length === 0 && sevenTargets.length === 0");
  });

  it("근거 없는 정적 제안을 그리지 않고 저장 완료 뒤에만 성공을 알린다", () => {
    expect(SCREEN).not.toContain('t("review.section")');
    expect(SCREEN).not.toContain('t("review.body")');
    expect(SCREEN).toContain("runRatifyDecisionOnce(ratifyPendingRef");
    expect(SCREEN).toContain("persisted = await recordStarTiers");
    expect(SCREEN).toContain("persisted = await recordSevenTiers");
    expect(SCREEN).toMatch(/persisted[\s\S]{0,300}?reviewRatifiedMoved/);
    expect(SCREEN).toContain('t("career.saveFailed")');
  });

  it("pending 동안 새 제안·재열기·버튼·닫기를 막는 UI 계약을 건다", () => {
    expect(SCREEN).toContain("ratifyPendingRef.current");
    expect(SCREEN.match(/if \(ratifyPendingRef\.current\) return;/g)).toHaveLength(2);
    expect(
      SCREEN.match(/accessibilityState=\{\{ disabled: loading \|\| ratifyPending \|\| isMinor === null \}\}/g),
    ).toHaveLength(2);
    expect(SCREEN).toContain("pending={ratifyPending}");
    expect(SHEET).toContain("disabled={pending}");
    expect(SHEET).toContain("loading={pending}");
    expect(SHEET).toContain("onRequestClose={closeIfIdle}");
    expect(SCREEN).toContain("proposal !== null && !sheetOpen && !loading && !ratifyPending");
    expect(
      SCREEN.match(/if \(p\) \{\s+setCurrentLevel\([\s\S]{0,180}?setEvidenceRefs\([\s\S]{0,180}?setReceipts\([\s\S]{0,180}?setProposal\(p\)/g),
    ).toHaveLength(2);
  });
});

describe("동시 비준 gate", () => {
  it("첫 Promise가 settle하기 전 두 번째 작업을 시작하지 않고 이후 재시도를 연다", async () => {
    const { runRatifyDecisionOnce } = jest.requireActual(
      "@/components/persona/RatifySheet",
    ) as {
      runRatifyDecisionOnce?: <T>(
        ref: { current: boolean },
        operation: () => Promise<T>,
      ) => Promise<{ started: false } | { started: true; value: T }>;
    };
    expect(typeof runRatifyDecisionOnce).toBe("function");
    if (!runRatifyDecisionOnce) return;

    let resolveFirst!: (value: string) => void;
    const firstDeferred = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const ref = { current: false };
    const operation = jest.fn(() => firstDeferred);

    const first = runRatifyDecisionOnce(ref, operation);
    const second = await runRatifyDecisionOnce(ref, operation);
    expect(second).toEqual({ started: false });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(true);

    resolveFirst("saved");
    await expect(first).resolves.toEqual({ started: true, value: "saved" });
    expect(ref.current).toBe(false);
    await expect(runRatifyDecisionOnce(ref, async () => "retried")).resolves.toEqual({
      started: true,
      value: "retried",
    });
  });
  it("작업이 실패해도 gate를 풀어 같은 제안을 다시 저장할 수 있다", async () => {
    const { runRatifyDecisionOnce } = jest.requireActual(
      "@/components/persona/RatifySheet",
    ) as {
      runRatifyDecisionOnce: <T>(
        ref: { current: boolean },
        operation: () => Promise<T>,
      ) => Promise<{ started: false } | { started: true; value: T }>;
    };
    const ref = { current: false };

    await expect(
      runRatifyDecisionOnce(ref, async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(ref.current).toBe(false);
    await expect(runRatifyDecisionOnce(ref, async () => false)).resolves.toEqual({
      started: true,
      value: false,
    });
  });
});

describe("legacy /review 비준 결과", () => {
  it("writer가 실제 저장한 뒤에만 성공 처리하고 실패하면 제안을 보존한다", () => {
    expect(LEGACY_SCREEN).toContain("await runRatifyDecisionOnce(ratifyPendingRef");
    expect(LEGACY_SCREEN).toContain("persisted = await recordStarTiers");
    expect(LEGACY_SCREEN).toMatch(
      /if \(persisted\) \{[\s\S]{0,240}?setProposal\(null\)[\s\S]{0,240}?reactExpression\("wink"\)/,
    );
    expect(LEGACY_SCREEN).toMatch(
      /setResult\(\s*persisted\s*\?\s*copy\.ratified\(r\.resultingLevel\)\s*:\s*copy\.saveFailed/,
    );
  });

  it("pending 동안 중복 생성·재열기·sheet 닫기를 막는다", () => {
    expect(LEGACY_SCREEN).toContain("const ratifyPendingRef = useRef(false)");
    expect(LEGACY_SCREEN).toContain(
      "if (!userId || isMinor === null || loading || proposal !== null || ratifyPendingRef.current) return;",
    );
    expect(LEGACY_SCREEN).toContain("disabled={loading || ratifyPending || proposal !== null || isMinor === null}");
    expect(LEGACY_SCREEN).toContain("proposal !== null && !sheetOpen && !loading && !ratifyPending");
    expect(LEGACY_SCREEN).toContain("pending={ratifyPending}");
    expect(LEGACY_SCREEN).toContain("pendingLabel={copy.saving}");
    expect(LEGACY_SCREEN).toContain("if (!ratifyPendingRef.current) setSheetOpen(false)");
  });

  it("보존된 제안을 새 생성으로 덮지 않고 새 근거도 제안 성공 뒤에만 묶는다", () => {
    expect(LEGACY_SCREEN).toMatch(
      /const nextEvidenceRefs = ctx\.evidenceRefs;[\s\S]{0,520}?if \(p\) \{\s+setEvidenceRefs\(nextEvidenceRefs\);\s+setProposal\(p\)/,
    );
  });

  it("사용자나 연령 안전 프로필이 바뀌면 legacy 제안 session을 새로 연다", () => {
    expect(LEGACY_SCREEN).toContain(
      'const sessionKey = `${userId ?? "signed-out"}:${isMinor === null ? "pending" : isMinor ? "minor" : "adult"}`;',
    );
    expect(LEGACY_SCREEN).toContain(
      "<ReviewScreenLegacySession key={sessionKey} userId={userId} isMinor={isMinor} />",
    );
  });
});

describe("원장 writer 결과 계약", () => {
  beforeEach(() => {
    insertBehavior = "success";
    insert.mockClear();
  });

  it("성공, 반환 오류, throw를 boolean으로 구분한다", async () => {
    await expect(recordStarTiers("u1", { now: 5 })).resolves.toBe(true);
    await expect(recordSevenTiers("u1", { school: 5 }, "ratify")).resolves.toBe(true);

    insertBehavior = "resolved-error";
    await expect(recordStarTiers("u1", { now: 5 })).resolves.toBe(false);
    await expect(recordSevenTiers("u1", { school: 5 }, "ratify")).resolves.toBe(false);

    insertBehavior = "throw";
    await expect(recordStarTiers("u1", { now: 5 })).resolves.toBe(false);
    await expect(recordSevenTiers("u1", { school: 5 }, "ratify")).resolves.toBe(false);
  });

  it("userId가 없으면 쓰지 않고 false다", async () => {
    await expect(recordStarTiers("", { now: 5 })).resolves.toBe(false);
    await expect(recordSevenTiers("", { school: 5 }, "ratify")).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("쓸 행이 없으면 저장 성공으로 가장하지 않는다", async () => {
    await expect(recordStarTiers("u1", {})).resolves.toBe(false);
    await expect(recordSevenTiers("u1", {}, "ratify")).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("원장 쓰기가 인용을 나른다 (0060)", () => {
  const src = read("src/lib/persona/seven-tier-history.ts");

  it("citations 파라미터가 있고 sanitize 를 통과한다", () => {
    expect(src).toContain("citations?: readonly string[]");
    expect(src).toContain("sanitizeCitations(citations)");
    expect(src).toContain("evidence_citations: cleanCitations");
  });
});
