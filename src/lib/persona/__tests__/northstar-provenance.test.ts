import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const mockCreate = jest.fn().mockResolvedValue({ id: "saved", tags: [] });
const mockReads: string[] = [];
let mockRows: unknown[] = [];
let mockMissingColumn = false;
jest.mock("../../records/create", () => ({ createRecord: (args: unknown) => mockCreate(args) }));
jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: (columns: string) => {
        mockReads.push(columns);
        const query = {
          eq: () => query, contains: () => query, order: () => query,
          limit: async () => mockMissingColumn && columns.includes("system_tags")
            ? { data: null, error: { code: "42703", message: "column records.system_tags does not exist" } }
            : { data: mockRows, error: null },
        };
        return query;
      },
    }),
  }),
}));

import { fetchCurrentNorthstar, NORTHSTAR_AI_TAG, NORTHSTAR_TAG, saveNorthstar } from "../northstar";
import { captureCardProps, fallbackShareText } from "../../share/insight-card";

const ROOT = resolve(__dirname, "../../../..");
const screen = readFileSync(resolve(ROOT, "src/app/northstar.tsx"), "utf8");
const ast = ts.createSourceFile("northstar.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string): string {
  let result: string | undefined;
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(ast);
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer && ts.isCallExpression(node.initializer)) {
      result = `const ${name} = ${node.initializer.arguments[0].getText(ast)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!result) throw new Error(`Missing handler ${name}`);
  return result;
}

function editor(initial = "") {
  const context = {
    userId: "owner", locale: "en", isMinor: false, saving: false, draft: initial,
    selectedSuggestion: { current: null as { ownerId: string; text: string } | null },
    setDraft: (text: string) => { context.draft = text; },
    saveNorthstar, setSaving: jest.fn(), setSaveErr: jest.fn(), setCrisis: jest.fn(),
    reactExpression: jest.fn(), requestGlobalCue: jest.fn(), router: { back: jest.fn() },
  };
  const code = ts.transpileModule([
    handler("editDraft"), handler("selectSuggestion"), handler("save"),
    "({ editDraft, selectSuggestion, save });",
  ].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions = runInNewContext(code, context) as {
    editDraft: (value: string) => void; selectSuggestion: (value: string) => void; save: () => Promise<void>;
  };
  return { ...actions, context };
}

const SENTENCE = "I make room for learning.";
beforeEach(() => {
  mockCreate.mockClear(); mockReads.length = 0; mockRows = []; mockMissingColumn = false;
});

async function storedShare() {
  const saved = mockCreate.mock.calls.at(-1)![0] as { body: string; tags: string[]; systemTags: string[]; requireSystemTagsColumn: boolean };
  mockRows = [{ body: saved.body, created_at: "2026-10-19", system_tags: saved.systemTags }];
  const state = await fetchCurrentNorthstar("owner");
  const aiCopyTail = state.aiSuggested ? "AI-generated content (PolaScope)" : undefined;
  const options = { variant: "A" as const, insight: state.sentence!, handle: "me", aiCopyTail };
  return { saved, state, image: captureCardProps(options), text: fallbackShareText(options) };
}

test("chip, unchanged save, reload: both image props and shared text retain the disclosure", async () => {
  const h = editor(); h.selectSuggestion(SENTENCE); await h.save();
  const out = await storedShare();
  expect(out.saved.tags).toEqual([NORTHSTAR_TAG]);
  expect(out.saved.systemTags).toEqual([NORTHSTAR_AI_TAG]);
  expect(out.saved.requireSystemTagsColumn).toBe(true);
  expect(out.image.aiCopyTail).toBe("AI-generated content (PolaScope)");
  expect(out.text.endsWith(out.image.aiCopyTail!)).toBe(true);
  expect(h.context.selectedSuggestion.current).toBeNull();
});

test.each(["letter", "space", "edit then restore"])("chip then %s loses provenance", async (edit) => {
  const h = editor(); h.selectSuggestion(SENTENCE);
  h.editDraft(edit === "space" ? ` ${SENTENCE}` : `${SENTENCE}!`);
  if (edit === "edit then restore") h.editDraft(SENTENCE);
  await h.save();
  const out = await storedShare();
  expect(out.saved.systemTags).toEqual([]);
  expect(out.image.aiCopyTail).toBeUndefined();
  expect(out.text).not.toContain("AI-generated");
});

test.each(["typed", "loaded"])("%s matching text alone never arms provenance", async () => {
  const h = editor(SENTENCE); await h.save();
  expect((await storedShare()).saved.systemTags).toEqual([]);
});

test("a fresh chip selection after editing can earn provenance again", async () => {
  const h = editor(); h.selectSuggestion(SENTENCE); h.editDraft("My words"); h.selectSuggestion(SENTENCE); await h.save();
  expect((await storedShare()).saved.systemTags).toEqual([NORTHSTAR_AI_TAG]);
});

test("a selection from another account cannot mark the save", async () => {
  const h = editor(); h.selectSuggestion(SENTENCE); h.context.userId = "other"; await h.save();
  expect((await storedShare()).saved.systemTags).toEqual([]);
});

test.each([
  [SENTENCE, ` ${SENTENCE}`], [`${SENTENCE} `, SENTENCE], [SENTENCE, `${SENTENCE}!`], ["", ""],
])("save requires exact raw AND stored text: %j / %j", async (selectedSuggestion, sentence) => {
  await saveNorthstar({ userId: "owner", locale: "en", selectedSuggestion, sentence });
  expect(mockCreate.mock.calls[0][0].systemTags).toEqual([]);
});

test.each([undefined, [], ["unrelated"]])("old/unmarked rows have no AI attribution: %j", async (system_tags) => {
  mockRows = [{ body: SENTENCE, created_at: "then", system_tags, tags: [NORTHSTAR_AI_TAG] }];
  expect((await fetchCurrentNorthstar("owner")).aiSuggested).toBe(false);
});

test("a missing column reads legacy text but never borrows user tags", async () => {
  mockMissingColumn = true;
  mockRows = [{ body: SENTENCE, created_at: "then", tags: [NORTHSTAR_AI_TAG] }];
  expect(await fetchCurrentNorthstar("owner")).toEqual({ sentence: SENTENCE, savedAt: "then", aiSuggested: false });
  expect(mockReads).toEqual(["body, created_at, system_tags", "body, created_at"]);
});

test("editor binds text changes and chip taps to the provenance handlers", () => {
  expect(screen).toContain("onChangeText={editDraft}");
  expect(screen).toContain("onPress={() => selectSuggestion(s)}");
});
