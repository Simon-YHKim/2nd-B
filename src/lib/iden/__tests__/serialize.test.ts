import { parse } from "yaml";
import { REQUEST_MARK, serializeIden } from "../serialize";
import { SAMPLE_IDEN } from "../sample";
import type { IdenDoc } from "../types";

const FORBIDDEN = [
  "mental health",
  "therapy",
  "counsel",
  "diagnos",
  "treatment",
  "healing",
  "정신건강",
  "심리치료",
  "심리상담",
  "치유",
];

/** Pull the YAML machine block out of the `.iden` text and parse it. */
function machine(out: string): Record<string, any> {
  const m = out.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error("no machine block found");
  return parse(m[1]) as Record<string, any>;
}

describe("serializeIden", () => {
  const out = serializeIden(SAMPLE_IDEN, { request: "Help me plan my week." });

  it("emits a machine block, then a prose body, then the request last", () => {
    expect(out.startsWith("---\n")).toBe(true);
    const bodyAt = out.indexOf("# Simon - IDEN");
    const reqAt = out.indexOf(REQUEST_MARK);
    const fieldsAt = out.indexOf("key: traits");
    // order: machine block (fields) -> human body -> request marker
    expect(fieldsAt).toBeGreaterThan(0);
    expect(bodyAt).toBeGreaterThan(fieldsAt);
    expect(reqAt).toBeGreaterThan(bodyAt);
  });

  it("produces a YAML machine block that round-trips through a parser", () => {
    const doc = machine(out);
    expect(doc.name).toBe("Simon");
    expect(doc.identity.one_liner).toBe("INFP, mediator. Driven by autonomy.");
    expect(doc.identity.fields).toHaveLength(7);

    const traits = doc.identity.fields.find((f: any) => f.key === "traits");
    expect(traits).toMatchObject({
      viz: "radar",
      placement: "both",
      source: { kind: "measured", instrument: "BFI-44" },
      data: { Openness: 0.82, Extraversion: 0.35, Sensitivity: 0.41 },
    });

    const drivers = doc.identity.fields.find((f: any) => f.key === "drivers");
    expect(drivers.data).toEqual(["Autonomy", "Growth", "Authenticity"]);

    const type = doc.identity.fields.find((f: any) => f.key === "type");
    expect(type.data).toBe("INFP");
  });

  it("keeps node-graph, donut topics, and badge shapes intact", () => {
    const doc = machine(out);
    const cores = doc.identity.fields.find((f: any) => f.key === "cores");
    expect(cores.data).toEqual({ center: "Soul", nodes: ["Growth", "Wisdom", "Bond", "Muse", "Record"] });

    const contents = doc.identity.fields.find((f: any) => f.key === "contents");
    expect(contents.data).toEqual({ Sources: 48, Records: 30, Concepts: 12 });
    expect(contents.topics).toEqual(["habits", "psychology", "writing"]);
  });

  it("preserves version and date as strings (no numeric/date coercion)", () => {
    const doc = machine(out);
    expect(typeof doc.iden).toBe("string");
    expect(doc.iden).toBe("0.1");
    expect(typeof doc.generated).toBe("string");
    expect(doc.generated).toBe("2026-06-16");
  });

  it("tallies provenance by source kind", () => {
    const doc = machine(out);
    expect(doc.provenance_summary).toEqual({
      measured: 2,
      assessment: 1,
      instrument: 1,
      self_report: 1,
      derived: 1,
      count: 1,
    });
  });

  it("carries the AI summary and rules in the block, separated by source", () => {
    const doc = machine(out);
    expect(doc.summary.source).toEqual({ kind: "ai_summary" });
    expect(doc.summary.text).toContain("A consistent self-documenter");
    expect(doc.rules[0]).toContain("Answer grounded in this file");
    expect(doc.rules).toHaveLength(3);
  });

  it("appends the live request last (query-at-end)", () => {
    expect(out.trimEnd().endsWith("Help me plan my week.")).toBe(true);
    expect(out.indexOf("Help me plan my week.")).toBeGreaterThan(out.indexOf(REQUEST_MARK));
  });

  it("emits a request placeholder when no request is given", () => {
    const bare = serializeIden(SAMPLE_IDEN);
    expect(bare).toContain(REQUEST_MARK);
    expect(bare).toContain("<the actual task the user is handing to the AI>");
  });

  it("omits summary and rules when the doc has none, staying valid YAML", () => {
    const minimal: IdenDoc = { ...SAMPLE_IDEN, summary: undefined, rules: undefined };
    const text = serializeIden(minimal);
    expect(text).not.toContain("\nsummary:");
    expect(text).not.toContain("\nrules:");
    const doc = machine(text);
    expect(doc.summary).toBeUndefined();
    expect(doc.rules).toBeUndefined();
    expect(doc.identity.fields).toHaveLength(7);
  });

  it("serializes schema-driven extras: a stat field with a unit", () => {
    const doc: IdenDoc = {
      iden: "0.1",
      name: "Test",
      generated: "2026-06-16",
      oneLiner: "tester",
      fields: [{ key: "streak", label: "Streak", viz: "stat", source: { kind: "count" }, data: 30, unit: "days" }],
    };
    const parsed = machine(serializeIden(doc));
    const streak = parsed.identity.fields[0];
    expect(streak.data).toBe(30);
    expect(streak.unit).toBe("days");
  });

  it("quotes and escapes unsafe scalars so they round-trip exactly", () => {
    const doc: IdenDoc = {
      iden: "0.1",
      name: 'He said: "hi", <ok>',
      generated: "2026-06-16",
      oneLiner: "key: value, and more",
      fields: [
        { key: "tags", label: "Tags", viz: "tags", source: { kind: "self_report" }, data: ["a, b", "true", "42"] },
      ],
    };
    const text = serializeIden(doc);
    expect(text).toContain('\\"'); // a quote was escaped, not left raw
    const parsed = machine(text);
    expect(parsed.name).toBe('He said: "hi", <ok>');
    expect(parsed.identity.one_liner).toBe("key: value, and more");
    // comma-containing and type-looking tags survive as their original strings
    expect(parsed.identity.fields[0].data).toEqual(["a, b", "true", "42"]);
  });

  it("is deterministic for the same input", () => {
    expect(serializeIden(SAMPLE_IDEN, { request: "x" })).toBe(serializeIden(SAMPLE_IDEN, { request: "x" }));
  });

  it("stays lexicon-clean with no em dash", () => {
    expect(out).not.toContain("—");
    const lower = out.toLowerCase();
    for (const term of FORBIDDEN) expect(lower).not.toContain(term.toLowerCase());
  });
});
