import { composeStructured, parseStructured, renderStructuredForContext } from "../structured";

describe("structured form payloads (0066)", () => {
  test("compose drops empty fields and returns null when nothing is filled", () => {
    expect(composeStructured("fourw", { who: "  ", what: "" })).toBeNull();
    const p = composeStructured("fourw", { who: " 나 ", what: "회고 작성", when: "" });
    expect(p).toEqual({ form: "fourw", version: 1, fields: { who: "나", what: "회고 작성" } });
  });

  test("parse round-trips a composed payload and rejects junk", () => {
    const p = composeStructured("career_3c4p", { p_result: "완료율 52% -> 71%" });
    expect(parseStructured(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(parseStructured(null)).toBeNull();
    expect(parseStructured("fourw")).toBeNull();
    expect(parseStructured({ form: "unknown", version: 1, fields: { a: "b" } })).toBeNull();
    expect(parseStructured({ form: "fourw", version: 2, fields: { a: "b" } })).toBeNull();
    expect(parseStructured({ form: "fourw", version: 1, fields: {} })).toBeNull();
    expect(parseStructured({ form: "fourw", version: 1, fields: { a: 3 } })).toBeNull();
  });

  test("context rendering clips long values and keeps one line per field", () => {
    const p = composeStructured("career_3c4p", { o_goal: "x".repeat(200), x_subject: "동종 앱 3종" })!;
    const out = renderStructuredForContext(p, { valueCharLimit: 50 });
    const lines = out.split("\n");
    expect(lines[0]).toBe("[form:career_3c4p]");
    expect(lines).toHaveLength(3);
    expect(lines[1].length).toBeLessThanOrEqual("o_goal: ".length + 51);
    expect(out).toContain("x_subject: 동종 앱 3종");
  });
});
