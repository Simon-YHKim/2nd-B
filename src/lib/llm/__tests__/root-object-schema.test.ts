// C1-gateway enforcement of the root-OBJECT responseSchema convention.
// The edge converter passes array roots through (normalize-response-schema
// test documents that), and OpenAI rejects them upstream — so the gateway is
// the only place the convention can fail fast, before a Phase-2 re-seat turns
// a Gemini-only-safe schema into a prod incident.

import { assertRootObjectSchema } from "../boundary";

describe("assertRootObjectSchema", () => {
  it("accepts OBJECT roots in either dialect casing", () => {
    expect(() => assertRootObjectSchema({ type: "OBJECT", properties: {} })).not.toThrow();
    expect(() => assertRootObjectSchema({ type: "object", properties: {} })).not.toThrow();
  });

  it("accepts an absent schema (freeform surfaces)", () => {
    expect(() => assertRootObjectSchema(undefined)).not.toThrow();
  });

  it("rejects ARRAY roots (OpenAI response_format rejects them upstream)", () => {
    expect(() => assertRootObjectSchema({ type: "ARRAY", items: { type: "STRING" } })).toThrow(
      /root must be type OBJECT/,
    );
  });

  it("rejects scalar and union roots", () => {
    expect(() => assertRootObjectSchema({ type: "STRING" })).toThrow(/root must be type OBJECT/);
    expect(() => assertRootObjectSchema({ type: ["OBJECT", "NULL"] })).toThrow(
      /root must be type OBJECT/,
    );
  });
});
