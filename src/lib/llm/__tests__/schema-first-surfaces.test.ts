// Schema-first migration (2026-07-26): the five surfaces that still shipped
// prompt-instructed JSON + regex parsing (import_ingest, clipper_classify,
// clipper_template_propose, ops_recommend, ops_daily_brief) now pass a
// responseSchema. These tests pin (a) root-OBJECT conformance of the exported
// schemas against the actual gateway guard, and (b) that the untouched
// bracket-slice parser accepts BOTH the new {"items":[...]} envelope and the
// legacy bare-array reply, so cached/legacy outputs keep parsing.

import { assertRootObjectSchema } from "../gemini";
import { INGEST_SCHEMA } from "../../wiki/import-external";
import { buildClipperSchema } from "../../wiki/classify-clipper";
import { PROPOSE_TEMPLATE_SCHEMA } from "../../wiki/propose-template";
import { OPS_RECOMMEND_SCHEMA } from "../../ops/recommend";
import { BRIEF_SCHEMA } from "../../ops/daily-brief";
import { parseOpsRecommendations } from "../../ops/recommend-parse";

describe("schema-first surfaces conform to the root-OBJECT convention", () => {
  it("INGEST_SCHEMA", () => {
    expect(() =>
      assertRootObjectSchema(INGEST_SCHEMA as unknown as Record<string, unknown>),
    ).not.toThrow();
  });

  it("PROPOSE_TEMPLATE_SCHEMA, OPS_RECOMMEND_SCHEMA, BRIEF_SCHEMA", () => {
    for (const schema of [PROPOSE_TEMPLATE_SCHEMA, OPS_RECOMMEND_SCHEMA, BRIEF_SCHEMA]) {
      expect(() =>
        assertRootObjectSchema(schema as unknown as Record<string, unknown>),
      ).not.toThrow();
    }
  });

  it("buildClipperSchema — with and without props", () => {
    expect(() => assertRootObjectSchema(buildClipperSchema([]))).not.toThrow();
    const withProps = buildClipperSchema([
      { name: "stack-impact", type: "text", describe: { en: "x", ko: "y" } },
      { name: "steps", type: "multitext", describe: { en: "x", ko: "y" } },
      { name: "stars", type: "number", describe: { en: "x", ko: "y" } },
    ]);
    expect(() => assertRootObjectSchema(withProps)).not.toThrow();
    const props = (withProps.properties as Record<string, unknown>).props as {
      properties: Record<string, { type: string }>;
    };
    expect(props.properties["stack-impact"]).toEqual({ type: "STRING" });
    expect(props.properties["steps"]).toEqual({ type: "ARRAY", items: { type: "STRING" } });
    expect(props.properties["stars"]).toEqual({ type: "NUMBER" });
  });

  it("buildClipperSchema omits an empty props object (Gemini rejects empty OBJECT nodes)", () => {
    const bare = buildClipperSchema([]);
    expect((bare.properties as Record<string, unknown>).props).toBeUndefined();
  });
});

describe("parseOpsRecommendations accepts envelope and legacy replies", () => {
  const rec = { title: "Walk", reason: "You noted low energy." };

  it("parses the schema-era {\"items\":[...]} envelope", () => {
    const out = parseOpsRecommendations(JSON.stringify({ items: [rec] }));
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("Walk");
  });

  it("still parses the legacy bare array", () => {
    const out = parseOpsRecommendations(JSON.stringify([rec]));
    expect(out).toHaveLength(1);
  });

  it("envelope with nested checklist arrays stays intact", () => {
    const out = parseOpsRecommendations(
      JSON.stringify({ items: [{ ...rec, checklist: ["shoes", "route"] }] }),
    );
    expect(out[0]!.checklist).toEqual(["shoes", "route"]);
  });
});
