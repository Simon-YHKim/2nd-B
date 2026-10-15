import {
  buildPersonaSynthesisPrompt,
  parsePersonaSynthesis,
  PERSONA_SYNTHESIS_MAX,
  synthesizePersonas,
  type PersonaSynthesisInput,
} from "../persona-synthesis";
import { callLlm } from "../../llm/boundary";

// Only synthesizePersonas (the describe block at the bottom) reaches callLlm;
// the prompt/parser tests above are pure and never touch it.
jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
const mockCall = callLlm as unknown as jest.Mock;

const input: PersonaSynthesisInput = {
  domainSummaries: [
    { domain: "career", level: 4, itemCount: 20 },
    { domain: "finance", level: 3, itemCount: 8 },
  ],
  constructEstimates: [
    { construct: "conscientiousness", level: 2 },
    { construct: "openness", level: 4 },
  ],
};

const rawJson = (personas: unknown[]): string => JSON.stringify({ personas });

describe("buildPersonaSynthesisPrompt", () => {
  it("EN: enforces grounding, JSON-only, lists citable evidence", () => {
    const { system, user } = buildPersonaSynthesisPrompt(input, "en");
    expect(system).toMatch(/at least one provided domain AND at least one construct/i);
    expect(system.toLowerCase()).toContain("json");
    expect(system).toMatch(/never use clinical/i);
    expect(system).toContain("career");
    expect(system).toContain("conscientiousness");
    expect(user).toContain("career: L4");
    expect(user).toContain("finance: L3");
  });

  it("KO: enforces the >=1 domain + >=1 construct rule", () => {
    const { system } = buildPersonaSynthesisPrompt(input, "ko");
    expect(system).toContain("도메인 1개 이상");
    expect(system).toContain("구인 1개 이상");
  });
});

describe("parsePersonaSynthesis", () => {
  it("accepts current life-star evidence and rejects retired lifestyle domains", () => {
    const lifeInput: PersonaSynthesisInput = {
      sourceKind: "life_star",
      domainSummaries: [{ domain: "work", level: 3, itemCount: 2, excerpts: ["일하며 함께 만들었다"] }],
      constructEstimates: [{ construct: "openness", level: 2 }],
    };
    const prompt = buildPersonaSynthesisPrompt(lifeInput, "ko");
    expect(prompt.user).toContain("일하며 함께 만들었다");
    expect(prompt.system).toContain("삶의 별");
    const parsed = parsePersonaSynthesis(rawJson([
      { label: "만드는 사람", summary: "기록에서 보이는 역할", evidence: { domains: ["work", "career"], constructs: ["openness"] } },
    ]), lifeInput);
    expect(parsed[0].evidence.domains).toEqual(["work"]);
    expect(parsed[0].claimStrength).toBe(2);
  });

  it("keeps grounded personas and computes claimStrength = min cited level", () => {
    const out = parsePersonaSynthesis(
      rawJson([
        { label: "The Builder", evidence: { domains: ["career"], constructs: ["openness"] }, summary: "Builds." },
        { label: "The Planner", evidence: { domains: ["career"], constructs: ["conscientiousness"] }, summary: "Plans." },
      ]),
      input,
    );
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.label === "The Builder")!.claimStrength).toBe(4); // min(4,4)
    expect(out.find((p) => p.label === "The Planner")!.claimStrength).toBe(2); // min(4,2)
    expect(out[0].label).toBe("The Builder"); // strongest first
  });

  it("drops ungrounded personas (missing domain OR construct)", () => {
    const out = parsePersonaSynthesis(
      rawJson([
        { label: "NoDomain", evidence: { domains: [], constructs: ["openness"] }, summary: "x" },
        { label: "NoConstruct", evidence: { domains: ["career"], constructs: [] }, summary: "x" },
      ]),
      input,
    );
    expect(out).toHaveLength(0);
  });

  it("filters hallucinated evidence not present in the input", () => {
    // health is not an input domain → filtered → domains empty → dropped
    expect(
      parsePersonaSynthesis(
        rawJson([{ label: "H", evidence: { domains: ["health"], constructs: ["openness"] }, summary: "x" }]),
        input,
      ),
    ).toHaveLength(0);
    // career kept, health dropped; openness kept, neuroticism dropped
    const out = parsePersonaSynthesis(
      rawJson([
        {
          label: "Mix",
          evidence: { domains: ["career", "health"], constructs: ["openness", "neuroticism"] },
          summary: "x",
        },
      ]),
      input,
    );
    expect(out).toHaveLength(1);
    expect(out[0].evidence.domains).toEqual(["career"]);
    expect(out[0].evidence.constructs).toEqual(["openness"]);
  });

  it("drops personas carrying clinical/medical wording (lexicon gate)", () => {
    const out = parsePersonaSynthesis(
      rawJson([
        {
          label: "Clinical",
          evidence: { domains: ["career"], constructs: ["openness"] },
          summary: "Needs therapy and treatment.",
        },
      ]),
      input,
    );
    expect(out).toHaveLength(0);
  });

  it("caps the result at PERSONA_SYNTHESIS_MAX (3)", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({
      label: `P${n}`,
      evidence: { domains: ["career"], constructs: ["openness"] },
      summary: `s${n}`,
    }));
    expect(parsePersonaSynthesis(rawJson(five), input)).toHaveLength(PERSONA_SYNTHESIS_MAX);
    expect(PERSONA_SYNTHESIS_MAX).toBe(3);
  });

  it("returns [] for non-JSON / empty replies (mock-safe)", () => {
    expect(parsePersonaSynthesis("not json at all", input)).toEqual([]);
    expect(parsePersonaSynthesis("", input)).toEqual([]);
  });

  it("slugifies the persona id from id or label", () => {
    const out = parsePersonaSynthesis(
      rawJson([
        { id: "The Careful Planner!", label: "X", evidence: { domains: ["career"], constructs: ["openness"] }, summary: "s" },
      ]),
      input,
    );
    expect(out[0].id).toBe("the-careful-planner");
  });
});

// Moved from persona-synthesis-crosscheck.test.ts when S0.5 (2026-10-07)
// deleted the cross-check with its only, unreachable caller. These are the
// orchestrator's own outcomes, which hold with or without a cross-check.
describe("synthesizePersonas", () => {
  const liveReply = (text: string) => ({ text, audit: { modelUsed: "live-test-model" } });
  const grounded = (labels: string[]) =>
    rawJson(
      labels.map((label) => ({
        label,
        summary: `${label} summary, long enough that the parser keeps it.`,
        evidence: { domains: ["career"], constructs: ["conscientiousness"] },
      })),
    );

  beforeEach(() => mockCall.mockReset());

  it("returns the parsed draft from exactly one persona_synthesis call", async () => {
    mockCall.mockResolvedValue(liveReply(grounded(["A", "B"])));
    const out = await synthesizePersonas("u1", input, "ko");
    expect(out.map((p) => p.label)).toEqual(["A", "B"]);
    // One call: no second round re-writes the draft any more.
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall.mock.calls[0][0].purpose).toBe("persona_synthesis");
  });

  it("an empty grounded result is an error, not an empty success", async () => {
    mockCall.mockResolvedValue(liveReply(rawJson([])));
    await expect(synthesizePersonas("u1", input, "ko")).rejects.toThrow("polaris_no_grounded_result");
  });

  it("a metered server result can use a newer snapshot than the preliminary client input", async () => {
    mockCall.mockResolvedValue(liveReply(rawJson([{
      label: "Builder",
      summary: "A role based on the server snapshot.",
      evidence: { domains: ["work"], constructs: ["self-reported narrative (same-source)"] },
    }])));
    // input predates the saved work interview. The caller reloads persisted
    // server cards after this response; an older local parser cannot undo it.
    await expect(synthesizePersonas("u1", input, "ko", false, "reserved-id")).resolves.toEqual([]);
  });
});
