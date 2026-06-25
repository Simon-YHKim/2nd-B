import {
  buildPersonaSynthesisPrompt,
  parsePersonaSynthesis,
  PERSONA_SYNTHESIS_MAX,
  type PersonaSynthesisInput,
} from "../persona-synthesis";

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
