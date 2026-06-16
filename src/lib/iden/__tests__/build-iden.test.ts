import { parse } from "yaml";
import { composeIdenDoc, type VaultCounts } from "../build-iden";
import { renderIdenHtml } from "../render-html";
import { serializeIden } from "../serialize";
import type { PersonaCard } from "../../persona/build";
import type { MbtiScores } from "../../persona/assessment-shapes";

const FORBIDDEN = ["mental health", "therapy", "counsel", "diagnos", "treatment", "healing", "정신건강", "심리치료", "심리상담", "치유"];

const COUNTS: VaultCounts = { sources: 48, records: 30, concepts: 12 };

function persona(over: Partial<PersonaCard> = {}): PersonaCard {
  const tc = { source: "questionnaire", confidence: "high", observationCount: 1 } as const;
  return {
    version: 1,
    traits: { openness: 0.82, conscientiousness: 0.68, extraversion: 0.35, agreeableness: 0.74, neuroticism: 0.41 },
    traitsSource: "bfi",
    traitConfidence: { openness: tc, conscientiousness: tc, extraversion: tc, agreeableness: tc, neuroticism: tc },
    mbti: { type: "INFP", scores: {} as unknown as MbtiScores },
    attachment: { style: "secure", anxiety: 2, avoidance: 2 },
    values: ["sdt:autonomy", "big_five:openness", "via:character_strength"],
    patterns: { summary: "A reflective self-documenter." },
    markdownExport: "",
    ...over,
  };
}

function field(doc: ReturnType<typeof composeIdenDoc>, key: string) {
  return doc.fields.find((f) => f.key === key);
}

describe("composeIdenDoc", () => {
  it("maps BFI traits to a both-column radar; neuroticism surfaces as Sensitivity", () => {
    const doc = composeIdenDoc(persona(), { counts: COUNTS, generated: "2026-06-16" });
    const traits = field(doc, "traits");
    expect(traits).toMatchObject({ viz: "radar", placement: "both", source: { kind: "measured", instrument: "BFI-44" } });
    expect(traits && "data" in traits ? traits.data : {}).toMatchObject({ Openness: 0.82, Sensitivity: 0.41 });
    expect(JSON.stringify(traits)).not.toContain("Neuroticism");
  });

  it("derives pattern tags from top positive traits (>=0.6), excluding Sensitivity, max 3", () => {
    const tags = field(composeIdenDoc(persona(), { counts: COUNTS }), "patterns");
    expect(tags?.viz).toBe("tags");
    const data = tags && "data" in tags ? (tags.data as string[]) : [];
    expect(data).toHaveLength(3);
    expect(data).toEqual(expect.arrayContaining(["Inquisitive", "Diligent", "Warm"]));
    expect(data).not.toContain("Outgoing"); // extraversion 0.35 is below threshold
  });

  it("emits MBTI type and ECR-S attachment as honest badges", () => {
    const doc = composeIdenDoc(persona(), { counts: COUNTS });
    expect(field(doc, "type")).toMatchObject({ viz: "badge", source: { kind: "assessment" }, data: "INFP" });
    expect(field(doc, "attachment")).toMatchObject({ viz: "badge", source: { kind: "instrument", instrument: "ECR-S" }, data: "Secure" });
  });

  it("turns top value frameworks into short driver labels", () => {
    const drivers = field(composeIdenDoc(persona(), { counts: COUNTS }), "drivers");
    expect(drivers?.viz).toBe("list");
    expect(drivers && "data" in drivers ? drivers.data : []).toEqual(["Autonomy", "Openness", "Character strength"]);
  });

  it("always emits cores (English node names) and contents counts", () => {
    const doc = composeIdenDoc(persona(), { counts: COUNTS, topics: ["habits", "psychology"] });
    expect(field(doc, "cores")).toMatchObject({
      viz: "node-graph",
      source: { kind: "derived" },
      data: { center: "Soul", nodes: ["Growth", "Wisdom", "Bond", "Muse", "Record"] },
    });
    const contents = field(doc, "contents");
    expect(contents).toMatchObject({ viz: "donut", source: { kind: "count" }, data: { Sources: 48, Records: 30, Concepts: 12 } });
    expect(contents && "topics" in contents ? contents.topics : []).toEqual(["habits", "psychology"]);
  });

  it("includes the AI summary only when a real narrative is given", () => {
    const withSummary = composeIdenDoc(persona(), { counts: COUNTS, summary: "A reflective self-documenter." });
    expect(withSummary.summary).toEqual({ text: "A reflective self-documenter.", source: { kind: "ai_summary" } });
    expect(composeIdenDoc(persona(), { counts: COUNTS, summary: null }).summary).toBeUndefined();
    expect(composeIdenDoc(persona(), { counts: COUNTS, summary: "   " }).summary).toBeUndefined();
  });

  it("labels heuristic traits as derived, and drops them entirely with no evidence", () => {
    const tcNone = { source: "default", confidence: "low", observationCount: 0 } as const;
    const tcSome = { source: "journal_text", confidence: "medium", observationCount: 8 } as const;

    const heuristic = composeIdenDoc(
      persona({ traitsSource: "heuristic", traitConfidence: { openness: tcSome, conscientiousness: tcSome, extraversion: tcSome, agreeableness: tcSome, neuroticism: tcSome } }),
      { counts: COUNTS },
    );
    expect(field(heuristic, "traits")).toMatchObject({ source: { kind: "derived" } });

    const noEvidence = composeIdenDoc(
      persona({ traitsSource: "heuristic", traitConfidence: { openness: tcNone, conscientiousness: tcNone, extraversion: tcNone, agreeableness: tcNone, neuroticism: tcNone } }),
      { counts: COUNTS },
    );
    expect(field(noEvidence, "traits")).toBeUndefined();
    expect(field(noEvidence, "patterns")).toBeUndefined();
  });

  it("falls back safely with no persona: only cores + contents, neutral identity", () => {
    const doc = composeIdenDoc(null, { counts: { sources: 0, records: 0, concepts: 0 } });
    expect(doc.fields.map((f) => f.key)).toEqual(["cores", "contents"]);
    expect(doc.name).toBe("You");
    expect(doc.oneLiner).toBe("Building a record of myself, to think with.");
  });

  it("localizes labels and values for KO while keeping cores node names English (C7)", () => {
    const doc = composeIdenDoc(persona(), { counts: COUNTS, locale: "ko" });
    expect(field(doc, "traits")?.label).toBe("특성");
    expect(field(doc, "attachment")?.data).toBe("안정형");
    const traits = field(doc, "traits");
    expect(traits && "data" in traits ? Object.keys(traits.data) : []).toEqual(["개방성", "성실성", "외향성", "친화성", "민감성"]);
    const contents = field(doc, "contents");
    expect(contents && "data" in contents ? Object.keys(contents.data) : []).toEqual(["소스", "기록", "개념"]);
    // node-graph names must stay English for the renderer's color map
    expect(field(doc, "cores")).toMatchObject({ data: { nodes: ["Growth", "Wisdom", "Bond", "Muse", "Record"] } });
  });

  it("produces a doc that both consumers accept (serialize round-trips, render names)", () => {
    const doc = composeIdenDoc(persona(), { counts: COUNTS, name: "Simon", oneLiner: "INFP, mediator.", summary: "Reflective.", generated: "2026-06-16" });
    const iden = serializeIden(doc, { request: "plan my week" });
    const fm = iden.match(/^---\n([\s\S]*?)\n---\n/);
    const parsed = parse(fm![1]) as Record<string, any>;
    expect(parsed.name).toBe("Simon");
    expect(parsed.identity.fields.find((f: any) => f.key === "contents").data).toEqual({ Sources: 48, Records: 30, Concepts: 12 });

    const html = renderIdenHtml(doc);
    expect(html).toContain("Simon");
    expect(html).toContain("Sensitivity");
  });

  it("stays lexicon-clean with no em dash across both renders", () => {
    const doc = composeIdenDoc(persona(), { counts: COUNTS, locale: "ko" });
    const blob = (serializeIden(doc) + renderIdenHtml(doc, { locale: "ko" })).toLowerCase();
    expect(blob).not.toContain("—");
    for (const term of FORBIDDEN) expect(blob).not.toContain(term.toLowerCase());
  });
});
