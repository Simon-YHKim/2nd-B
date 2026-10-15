import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { isProfileContextImportSource, SourceImportManagedError } from "../../lib/wiki/profile-context-source";

// Execute the real orchestration declarations without importing the native screen shell.
const path = join(__dirname, "..", "reasoning.tsx");
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = ["loadSafeBatchText", "produceProposals", "applyReasoningProposal"].map((name) => {
  const declaration = source.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Missing reasoning function: ${name}`);
  return declaration.getText(source);
}).join("\n");
const code = ts.transpileModule(functions + "\nreturn { produceProposals, applyReasoningProposal };", {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;

function harness() {
  const getSource = jest.fn();
  const downloadRawClipping = jest.fn().mockResolvedValue("Ordinary source body.");
  const callLlm = jest.fn().mockResolvedValue({ text: "{}", safety: { zone: "green" } });
  const updateSourceTags = jest.fn();
  const generateSourcePage = jest.fn();
  const deps = {
    getSource, downloadRawClipping, callLlm, updateSourceTags, generateSourcePage,
    isProfileContextImportSource, SourceImportManagedError,
    throwIfCancelled: () => undefined,
    classifyInputAnyLocale: () => ({ zone: "green" }),
    isAiExcludedSource: () => false,
    sanitizeUntrusted: (value: string) => value,
    parseConnections: () => [], fallbackDomain: () => "collect",
    INJECTION_GUARD: { en: "guard", ko: "guard" }, CONNECTION_SCHEMA: {},
    REASONING_RATIFIED_TAG: "reasoning:ratified",
    domainTagFor: (domain: string) => `domain:${domain}`,
    stripDomainTags: (tags: string[]) => tags,
  };
  const runtime = new Function(...Object.keys(deps), code)(...Object.values(deps)) as {
    produceProposals(input: unknown, runId: string): Promise<unknown[]>;
    applyReasoningProposal(userId: string, proposal: unknown): Promise<void>;
  };
  return { ...deps, ...runtime };
}

const sourceItem = { key: "source:s1", refKind: "source", refId: "s1", title: "Selected source", tags: [] };
const input = (items: unknown[]) => ({ userId: "owner-a", locale: "en", minor: false, items });

describe("profile import reasoning guard", () => {
  test("direct source requests stop before the LLM, body download, or proposal generation", async () => {
    const run = harness();
    run.getSource.mockResolvedValue({ frontmatter: { profile_context_import_id: "batch-1", _body_fallback: "Imported private story." } });
    await expect(run.produceProposals(input([sourceItem]), "run-1")).rejects.toBeInstanceOf(SourceImportManagedError);
    expect(run.getSource).toHaveBeenCalledWith("owner-a", "s1");
    expect(run.callLlm).not.toHaveBeenCalled();
    expect(run.downloadRawClipping).not.toHaveBeenCalled();
  });

  test("a mixed batch cannot partially generate results before the import guard runs", async () => {
    const run = harness();
    run.getSource.mockResolvedValue({ frontmatter: { profile_context_import_id: "batch-1" } });
    const record = { key: "record:r1", refKind: "record", refId: "r1", title: "Ordinary note", body: "My note", tags: [] };
    await expect(run.produceProposals(input([record, sourceItem]), "run-1")).rejects.toBeInstanceOf(SourceImportManagedError);
    expect(run.callLlm).not.toHaveBeenCalled();
  });

  test("an older stored proposal cannot change import tags or regenerate its page", async () => {
    const run = harness();
    run.getSource.mockResolvedValue({ frontmatter: { profile_context_import_id: "batch-1" }, tags: [] });
    await expect(run.applyReasoningProposal("owner-a", { ...sourceItem, domain: "collect" })).rejects.toBeInstanceOf(SourceImportManagedError);
    expect(run.updateSourceTags).not.toHaveBeenCalled();
    expect(run.generateSourcePage).not.toHaveBeenCalled();
  });

  test("ordinary sources still produce reviewed domain proposals", async () => {
    const run = harness();
    run.getSource.mockResolvedValue({ title: "Ordinary source", storage_path: "owner-a/source.md", frontmatter: {} });
    await expect(run.produceProposals(input([sourceItem]), "run-1")).resolves.toEqual([
      { ...sourceItem, domain: "collect", runId: "run-1", ordinal: 0 },
    ]);
    expect(run.callLlm).toHaveBeenCalledTimes(1);
    expect(run.downloadRawClipping).toHaveBeenCalledWith("owner-a/source.md");
  });
});
