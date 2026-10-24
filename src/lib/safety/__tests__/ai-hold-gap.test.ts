import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { buildSeenRows, seenGapLines } from "../../persona/seen-rows";

const path = resolve(__dirname, "../../../components/deep-space/DeepSpaceViews.tsx");
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration: ts.FunctionDeclaration | undefined;
function visit(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "synthesizeGap") declaration = node;
  ts.forEachChild(node, visit);
}
visit(source);
if (!declaration) throw new Error("Missing synthesizeGap");
const code = ts.transpileModule(declaration.getText(source) + "\nreturn synthesizeGap;", {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;
const scores = { openness: 4, conscientiousness: 4, extraversion: 4, agreeableness: 4, neuroticism: 4 };
const aggregate = [{ trait: "extraversion", avg_score: 3, informant_count: 3 }];

function harness() {
  const db = {};
  const deps = {
    userId: "owner", synthBusy: false, locale: "en", informantCount: 3, aggregate,
    rows: buildSeenRows(scores, aggregate, "en"), buildSeenRows, seenGapLines,
    getSupabaseClient: () => db,
    loadLatestBfi: jest.fn().mockResolvedValue(null),
    callLlm: jest.fn().mockResolvedValue({ text: "Fresh gap" }),
    setSynth: jest.fn(), setSynthBusy: jest.fn(),
  };
  const run = new Function(...Object.keys(deps), code)(...Object.values(deps)) as () => Promise<void>;
  return { ...deps, db, run };
}

test("a displayed BFI that is held before synthesize sends no cached scores or model request", async () => {
  const run = harness();
  await run.run();
  expect(run.loadLatestBfi).toHaveBeenCalledWith(run.db, "owner", true);
  expect(run.callLlm).not.toHaveBeenCalled();
  expect(run.setSynth).toHaveBeenCalledWith(null);
  expect(run.setSynthBusy).toHaveBeenLastCalledWith(false);
});

test("an eligible BFI uses fresh scores and a failed read never falls back to the screen", async () => {
  const run = harness();
  const fresh = { ...scores, extraversion: 2 };
  run.loadLatestBfi.mockResolvedValueOnce(fresh);
  await run.run();
  expect(run.callLlm).toHaveBeenCalledTimes(1);
  expect(run.callLlm.mock.calls[0][0].system).toContain(seenGapLines(buildSeenRows(fresh, aggregate, "en")));
  expect(run.callLlm.mock.calls[0][0].system).not.toContain(seenGapLines(run.rows));
  run.callLlm.mockClear(); run.loadLatestBfi.mockRejectedValueOnce(new Error("unavailable"));
  await run.run();
  expect(run.callLlm).not.toHaveBeenCalled();
});
