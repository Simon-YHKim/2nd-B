import { interviewEvidenceExcerpt, loadRoleCards, parseRoleCards, ratifyRoleCard, roleEvidenceIds, roleInputFromInterviews } from "../role-cards";
import type { PersonaCard } from "../build";
import type { SevenStarId } from "../seven-stars";
import type { LadderLevel } from "../brightness";
import { noteResolvedOwner } from "../../auth/account-epoch";
import { rpcWithCapturedSession } from "../../supabase/captured-session-client";
import type { RoleCard } from "../role-cards";

let mockStoredPatterns: Record<string, unknown> = {};
let mockOnWrite: (() => void) | undefined;
jest.mock("../../supabase/captured-session-client", () => ({ rpcWithCapturedSession: jest.fn().mockResolvedValue({ error: null }) }));
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" }, access_token: "u1-test-token" } }, error: null }) },
    from: () => {
      let pending: Record<string, unknown> | null = null;
      let writing = false;
      return {
        select() { return this; },
        eq() { return this; },
        update(payload: { patterns: Record<string, unknown> }) {
          pending = payload.patterns;
          writing = true;
          return this;
        },
        async maybeSingle() {
          if (writing) {
            mockStoredPatterns = pending ?? {};
            mockOnWrite?.();
            return { data: { user_id: "u1" }, error: null };
          }
          return { data: { patterns: mockStoredPatterns }, error: null };
        },
      };
    },
  }),
}));

const levels = Object.fromEntries(
  ["profile", "infancy", "school", "twenties", "later", "work", "now"].map((id) => [id, 3]),
) as Record<SevenStarId, LadderLevel>;
const persona = {
  traitConfidence: {
    openness: { source: "journal_text", confidence: "low", observationCount: 2 },
    conscientiousness: { source: "default", confidence: "low", observationCount: 0 },
  },
} as unknown as PersonaCard;

describe("life-star role-card input", () => {
  it("keeps later interview answers within the bounded evidence input", () => {
    const excerpt = interviewEvidenceExcerpt("Opening. " + "x".repeat(2000) + " My later answer matters.");
    expect(excerpt).toContain("Opening.");
    expect(excerpt).toContain("My later answer matters.");
    expect(excerpt.length).toBeLessThanOrEqual(290);
  });
  it("uses only saved interviews from current life stars", () => {
    const input = roleInputFromInterviews([
      { id: "a", audit_period: "school", body: "학교에서 친구들과 함께 만들었다", tags: ["interview"] },
      { id: "b", audit_period: "work", body: "일하며 문제를 풀었다", tags: ["interview"] },
      { id: "c", audit_period: "career", body: "옛 도메인", tags: ["interview"] },
      { id: "d", audit_period: "now", body: "인터뷰 아님", tags: [] },
    ], levels, persona, []);
    expect(input.sourceKind).toBe("life_star");
    expect(input.domainSummaries.map((summary) => summary.domain)).toEqual(["school", "work"]);
    expect(input.domainSummaries[0].excerpts).toContain("학교에서 친구들과 함께 만들었다");
    expect(input.constructEstimates).toEqual([{ construct: "openness", level: 2 }]);
  });

  it("rejects malformed or invented persisted role evidence", () => {
    const valid = {
      id: "builder", label: "만드는 사람", summary: "요약", status: "proposed",
      evidenceRefs: ["record:11111111-1111-4111-8111-111111111111"],
      evidence: { domains: ["work"], constructs: ["openness"] }, claimStrength: 2,
    };
    expect(parseRoleCards(JSON.stringify([valid]))).toHaveLength(1);
    expect(parseRoleCards(JSON.stringify([{ ...valid, evidenceRefs: ["record:invented"] }]))).toEqual([]);
    expect(parseRoleCards(JSON.stringify([{ ...valid, evidence: { domains: ["career"], constructs: ["openness"] } }]))).toEqual([]);
  });

  it("keeps interview-only evidence tentative instead of blocking every proposal", () => {
    const input = roleInputFromInterviews([
      { id: "a", audit_period: "now", body: "나는 새로운 일을 시작했다", tags: ["interview"] },
    ], levels, { traitConfidence: {} } as PersonaCard, []);
    expect(input.constructEstimates).toEqual([
      { construct: "self-reported narrative (same-source)", level: 2 },
    ]);
  });

  it("fetches only distinct evidence cited by approved cards", () => {
    const ref = "record:11111111-1111-4111-8111-111111111111";
    const evidence = { domains: ["work" as SevenStarId], constructs: ["openness"] };
    const base = { id: "builder", label: "Builder", summary: "Builds", strengths: [], advice: "", evidence, claimStrength: 2 as const, evidenceRefs: [ref] };
    expect(roleEvidenceIds([
      { ...base, status: "proposed" },
      { ...base, id: "approved", status: "ratified", evidenceRefs: [ref, ref, "record:invented"] },
    ])).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });
});

describe("role-card approval storage", () => {
  beforeEach(() => {
    mockStoredPatterns = {}; mockOnWrite = undefined; noteResolvedOwner("u1");
    jest.mocked(rpcWithCapturedSession).mockReset().mockImplementation(async (name,args) => {
      if (name === "ratify_polaris_role_card") {
        const expected = args.p_card as RoleCard;
        const cards = parseRoleCards(mockStoredPatterns.role_cards_v1);
        const actual = cards.find((card) => card.id === expected.id);
        expect(actual).toEqual(expect.objectContaining({...expected,status:expect.any(String)}));
        mockStoredPatterns = {...mockStoredPatterns,role_cards_v1:JSON.stringify(cards.map((card) =>
          card.id === expected.id ? {...card,status:"ratified"} : card))};
        mockOnWrite?.();
      }
      return {error:null};
    });
  });

  it("keeps both explicit approvals when two views approve different cards", async () => {
    const base = {label:"Builder",summary:"Builds",status:"proposed",evidence:{domains:["work"],constructs:["openness"]},claimStrength:2,evidenceRefs:["record:11111111-1111-4111-8111-111111111111"]};
    mockStoredPatterns = {role_cards_v1: JSON.stringify([{...base,id:"builder"},{...base,id:"planner"}])};
    const seen = parseRoleCards(mockStoredPatterns.role_cards_v1);
    await Promise.all([ratifyRoleCard("u1",seen[0]),ratifyRoleCard("u1",seen[1])]);
    expect((await loadRoleCards("u1")).map((card) => card.status)).toEqual(["ratified","ratified"]);
  });

  it("persists one explicit approval without approving its sibling", async () => {
    const evidence = { domains: ["work"], constructs: ["openness"] };
    const cards = [
      { id: "builder", label: "Builder", summary: "Builds", evidence, claimStrength: 2, evidenceRefs: ["record:11111111-1111-4111-8111-111111111111"], status: "proposed" },
      { id: "planner", label: "Planner", summary: "Plans", evidence, claimStrength: 2, evidenceRefs: ["record:11111111-1111-4111-8111-111111111111"], status: "proposed" },
    ];
    mockStoredPatterns = { summary: "keep me", role_cards_v1: JSON.stringify(cards) };
    const approved = await ratifyRoleCard("u1", parseRoleCards(mockStoredPatterns.role_cards_v1)[0]);
    expect(approved.map((card) => card.status)).toEqual(["ratified", "proposed"]);
    expect((await loadRoleCards("u1")).map((card) => card.status)).toEqual(["ratified", "proposed"]);
    expect(mockStoredPatterns.summary).toBe("keep me");
    expect(rpcWithCapturedSession).toHaveBeenCalledWith("ratify_polaris_role_card",{p_user_id:"u1",p_card:cards[0]},"u1-test-token",expect.any(AbortSignal));
    expect(rpcWithCapturedSession).toHaveBeenCalledWith("award_xp",{p_action:"persona_created"},"u1-test-token",expect.any(AbortSignal));
  });

  it("never awards the next account when ownership changes during approval", async () => {
    mockStoredPatterns = {role_cards_v1: JSON.stringify([{id:"builder",label:"Builder",summary:"Builds",status:"proposed",evidence:{domains:["work"],constructs:["openness"]},claimStrength:2,evidenceRefs:["record:11111111-1111-4111-8111-111111111111"]}])};
    mockOnWrite = () => noteResolvedOwner("u2");
    await expect(ratifyRoleCard("u1",parseRoleCards(mockStoredPatterns.role_cards_v1)[0])).rejects.toThrow();
    expect(jest.mocked(rpcWithCapturedSession).mock.calls.map(([name]) => name)).toEqual(["ratify_polaris_role_card"]);
  });
});
