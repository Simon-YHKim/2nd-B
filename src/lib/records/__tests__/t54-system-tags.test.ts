import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as markers from "../system-tags";
import { domainTagFor, stripDomainTags } from "../../persona/domain-stars";
import { userOrganizedTags } from "../../persona/load-domain-levels";

jest.mock("../../supabase/client", () => ({ getSupabaseClient: jest.fn() }));

const read = (path: string) => readFileSync(resolve(__dirname, "../../..", path), "utf8").replace(/\r\n/g, "\n");
function declaration(path: string, name: string, deps: Record<string, unknown>) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!fn) throw new Error(`missing ${name}`);
  const code = ts.transpileModule(fn.getText(source).replace(/^export /, "") + `\nreturn ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(deps), code)(...Object.values(deps));
}

describe("T54 readers keep provenance separate from user tags", () => {
  const screen = "screens/deepspace/dds-wiki-records-screens.tsx";
  const isUnfiled = declaration(screen, "isUnfiled", { ...markers, stripDomainTags });
  const recordType = declaration(screen, "recordType", { ...markers, URL_RE: /https?:\/\//, DUR_RE: /\(\d+:\d{2}\)/ });
  const presentationType = declaration("screens/deepspace/dds-record-detail-screen.tsx", "presentationType", markers);
  test.each(["voice", "link"])("new and legacy %s retain list and detail types", (tag) => {
    for (const row of [{ tags: [], system_tags: [tag] }, { tags: [tag], system_tags: [] }, { tags: [tag] }]) {
      expect(recordType({ kind: "note", ...row })).toBe(tag);
      expect(presentationType({ kind: "note", ...row })).toBe(tag);
    }
  });
  test("system-only ratification leaves the inbox for both records and sources", () => {
    for (const origin of ["record", "source"]) {
      expect(isUnfiled({ origin, tags: ["domain:growth"], system_tags: ["reasoning:ratified"] })).toBe(false);
      expect(isUnfiled({ origin, tags: ["domain:growth"], system_tags: ["memo"] })).toBe(true);
      expect(isUnfiled({ origin, tags: ["domain:growth", "memo"], system_tags: [] })).toBe(false);
      expect(isUnfiled({ origin, tags: ["reasoning:ratified"] })).toBe(false);
    }
    const source = read(screen);
    expect(source).toContain("scoped.filter(isUnfiled).length");
    expect(source).toContain('typeFilter === "unfiled") return scoped.filter(isUnfiled)');
    expect(source).toContain("unfiled={isUnfiled(item)}");
    expect(source).toContain("system_tags: s.system_tags");
  });
  test.each(["memo", "fourw", "todo", "link", "voice"])("%s alone never organizes brightness", (tag) => {
    expect(userOrganizedTags({ tags: ["domain:growth", tag], system_tags: [] })).toEqual([]);
    expect(userOrganizedTags({ tags: ["domain:growth"], system_tags: [tag] })).toEqual([]);
  });
  test("ratification in either column preserves the organized signal", () => {
    for (const row of [
      { tags: ["domain:growth"], system_tags: ["reasoning:ratified"] },
      { tags: ["domain:growth", "reasoning:ratified"], system_tags: [] },
      { tags: ["domain:growth", "reasoning:ratified"] },
    ]) expect(userOrganizedTags(row).length).toBeGreaterThan(0);
    expect(markers.systemTagsOf({ tags: ["interview"], system_tags: [] })).toEqual([]);
  });
  test("candidate exclusion recognizes legacy ratification even beside an empty system column", () => {
    for (const row of [
      { tags: ["reasoning:ratified"] },
      { tags: ["reasoning:ratified"], system_tags: [] },
      { tags: [], system_tags: ["reasoning:ratified"] },
    ]) expect(markers.isReasoningRatified(row)).toBe(true);
    expect(markers.isReasoningRatified({ tags: ["memo"], system_tags: [] })).toBe(false);
    expect(markers.isReasoningRatified({ tags: ["reasoning:ratified-extra"] })).toBe(false);
  });
  test("visible user tags stay independent of feature-only marker predicates", () => {
    expect(read(screen)).toContain("const tags = stripDomainTags(r.tags ?? []).slice(0, 2)");
    expect(read(screen)).toContain("tags: s.tags, system_tags: s.system_tags");
  });
  test("capture writers separate only the marker they create", () => {
    expect(read("components/deep-space/DeepSpaceViews.tsx")).toContain("systemTags: [tag]");
    const capture = read("app/capture.tsx");
    expect(capture).toContain("systemTags: [baseTag]");
    expect(capture).not.toMatch(/const tags = \[\s*baseTag,/);
    expect(capture).toContain('noteDraft.todoDone ? ["done"] : []');
    expect(capture).toContain("...(noteDraft.tags ?? [])");
    expect(read("app/call-reflection.tsx")).toContain('tags: ["call_reflection"],\n        systemTags: ["voice"]');
  });
  test("reasoning filters both mapped row types with the shared ratification predicate", () => {
    const source = read("app/reasoning.tsx");
    expect(source).toContain("system_tags: row.system_tags");
    expect(source).toContain("system_tags: source.system_tags");
    expect(source).toContain(".filter((item) => !isReasoningRatified(item))");
    expect(source).toContain('hasCaptureMarker(row, "voice")');
    expect(source).toContain('hasCaptureMarker(row, "todo")');
    expect(source).toContain('hasCaptureMarker(row, "fourw")');
  });
});

describe("T54 ratification uses one conditional PATCH", () => {
  test("invalid system arrays fail before writing, while a full already-ratified array remains valid", () => {
    for (const system_tags of [["a,b"], ['a"b'], ["a\\b"], ["{}"], ["한글"], [""], ["DOMAIN:growth"], [null], ["x".repeat(65)]]) {
      expect(() => markers.reasoningTagPatch([], { system_tags } as markers.SystemTaggedRow)).toThrow();
    }
    const system_tags = ["reasoning:ratified", ...Array.from({ length: 15 }, (_, i) => `m${i}`)];
    expect(markers.reasoningTagPatch([], { system_tags }).payload.system_tags).toEqual(system_tags);
  });
  function harness(table: "records" | "sources", result = { data: [{ id: "r1" }], error: null as unknown }) {
    const query: Record<string, jest.Mock> = {};
    for (const method of ["eq", "filter", "select"]) query[method] = jest.fn(() => query);
    query.then = jest.fn((resolve) => Promise.resolve(result).then(resolve));
    const update = jest.fn(() => query);
    const fn = declaration(table === "records" ? "lib/records/create.ts" : "lib/wiki/queries.ts", table === "records" ? "updateRecordTags" : "updateSourceTags", {
      ...markers, getSupabaseClient: () => ({ from: () => ({ update }) }),
    });
    return { fn, query, update };
  }
  test.each(["records", "sources"] as const)("%s preserves arbitrary user characters outside the equality filter", async (table) => {
    const { fn, query, update } = harness(table);
    const tags = ["domain:growth", "a,b", 'a"b', "a\\b", "{}", "NULL", "한글", "", "memo", "reasoning:ratified"];
    await fn("owner", "r1", tags, { system_tags: ["NULL", "interview"] });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ tags, system_tags: ["NULL", "interview", "reasoning:ratified"] });
    expect(query.filter).toHaveBeenCalledWith("system_tags", "eq", '{"NULL","interview"}');
    expect(query.eq.mock.calls).toEqual([["user_id", "owner"], ["id", "r1"]]);
    expect(query.select).toHaveBeenCalledWith("id");
  });
  test.each(["records", "sources"] as const)("%s handles empty arrays and retries without duplicates", async (table) => {
    const run = harness(table);
    await run.fn("owner", "r1", [], { system_tags: [] });
    expect(run.query.filter).toHaveBeenCalledWith("system_tags", "eq", "{}");
    await run.fn("owner", "r1", [], { system_tags: ["reasoning:ratified"] });
    expect(run.update).toHaveBeenLastCalledWith({ tags: [], system_tags: ["reasoning:ratified"] });
  });
  test.each(["records", "sources"] as const)("%s fails for missing column, overflow, zero rows, and server errors", async (table) => {
    const run = harness(table);
    await expect(run.fn("owner", "r1", [], {})).rejects.toThrow();
    await expect(run.fn("owner", "r1", [], { system_tags: Array.from({ length: 16 }, (_, i) => `m${i}`) })).rejects.toThrow();
    expect(run.update).not.toHaveBeenCalled();
    await expect(harness(table, { data: [], error: null }).fn("owner", "r1", [], { system_tags: [] })).rejects.toThrow();
    for (const code of ["42703", "PGRST204", "42501", "23514"]) {
      const failed = harness(table, { data: [], error: { code } });
      await expect(failed.fn("owner", "r1", [], { system_tags: [] })).rejects.toEqual({ code });
      expect(failed.update).toHaveBeenCalledTimes(1);
    }
  });
  test("the screen reads fresh rows, preserves legacy tags, and promotes only after PATCH success", async () => {
    const getRecordById = jest.fn().mockResolvedValue({ tags: ["domain:career", "memo"], system_tags: ["interview"] });
    const getSource = jest.fn().mockResolvedValue({ tags: ["domain:career", "reasoning:ratified", "한글"], system_tags: [], frontmatter: {} });
    const updateRecordTags = jest.fn();
    const updateSourceTags = jest.fn();
    const generateSourcePage = jest.fn();
    const apply = declaration("app/reasoning.tsx", "applyReasoningProposal", { ...markers, getRecordById, getSource, updateRecordTags, updateSourceTags, generateSourcePage, domainTagFor, stripDomainTags, REASONING_RATIFIED_TAG: "reasoning:ratified", isProfileContextImportSource: () => false });
    await apply("owner", { refKind: "record", refId: "r1", domain: "growth" });
    expect(updateRecordTags).toHaveBeenCalledWith("owner", "r1", ["domain:growth", "memo"], await getRecordById.mock.results[0].value);
    updateSourceTags.mockRejectedValueOnce(new Error("conflict"));
    await expect(apply("owner", { refKind: "source", refId: "s1", domain: "growth" })).rejects.toThrow("conflict");
    expect(generateSourcePage).not.toHaveBeenCalled();
    expect(updateSourceTags).toHaveBeenCalledWith("owner", "s1", ["domain:growth", "reasoning:ratified", "한글"], await getSource.mock.results[0].value);
  });
});
