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
import { hasNorthstarAiProvenance, northstarAiTag } from "../northstar-provenance";
import { editedBodyPatch } from "../../records/piece-title";

const ROOT = resolve(__dirname, "../../../..");
const screen = readFileSync(resolve(ROOT, "src/app/northstar.tsx"), "utf8");
const ast = ts.createSourceFile("northstar.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string, tree = ast): string {
  let result: string | undefined;
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(tree);
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer && ts.isCallExpression(node.initializer)) {
      result = `const ${name} = ${node.initializer.arguments[0].getText(tree)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!result) throw new Error(`Missing handler ${name}`);
  return result;
}

function receiveSaved(): string {
  let result: string | undefined;
  function visit(node: ts.Node): void {
    if (ts.isArrowFunction(node) && node.parameters[0]?.name.getText(ast) === "s" && node.body.getText(ast).includes("s.sentence")) {
      result = `const receive = ${node.getText(ast)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!result) throw new Error("Missing saved northstar callback");
  return result;
}

function editor(initial = "") {
  const context = {
    userId: "owner", locale: "en", isMinor: false, saving: false, draft: initial, alive: true,
    selectedSuggestion: { current: null as { ownerId: string; text: string } | null },
    setDraft: (text: string) => { context.draft = text; },
    saveNorthstar, setSaving: jest.fn(), setSaveErr: jest.fn(), setCrisis: jest.fn(),
    reactExpression: jest.fn(), requestGlobalCue: jest.fn(), router: { back: jest.fn() },
  };
  const code = ts.transpileModule([
    handler("editDraft"), handler("selectSuggestion"), handler("save"), receiveSaved(),
    "({ editDraft, selectSuggestion, save, receive });",
  ].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions = runInNewContext(code, context) as {
    editDraft: (value: string) => void; selectSuggestion: (value: string) => void; save: () => Promise<void>;
    receive: (state: Awaited<ReturnType<typeof fetchCurrentNorthstar>>) => void;
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
  expect(out.saved.systemTags).toEqual([northstarAiTag(SENTENCE)]);
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
  expect((await storedShare()).saved.systemTags).toEqual([northstarAiTag(SENTENCE)]);
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

test.each([undefined, [], ["unrelated"], [NORTHSTAR_AI_TAG]])("old/unmarked rows have no AI attribution: %j", async (system_tags) => {
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

test.each(["unchanged", "edited", "edited then restored"])("reopening a marked sentence: %s", async (mode) => {
  const first = editor(); first.selectSuggestion(SENTENCE); await first.save();
  const { state } = await storedShare();
  const reopened = editor(); reopened.receive(state);
  if (mode !== "unchanged") reopened.editDraft(`${SENTENCE}!`);
  if (mode === "edited then restored") reopened.editDraft(SENTENCE);
  await reopened.save();
  expect((await storedShare()).state.aiSuggested).toBe(mode === "unchanged");
});

test("reopening an unmarked row does not arm provenance", async () => {
  const h = editor(); h.receive({ sentence: SENTENCE, savedAt: "then", aiSuggested: false });
  await h.save();
  expect((await storedShare()).state.aiSuggested).toBe(false);
});

test.each(["I learn.", "나를 알아갑니다.", "🧭 café", "e\u0301", "é"])("body fingerprint fits 0218 and rejects any changed code unit: %s", (body) => {
  const tag = northstarAiTag(body);
  expect(tag).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
  expect(tag).toHaveLength(41);
  expect(hasNorthstarAiProvenance({ body, system_tags: [tag] })).toBe(true);
  for (let i = 0; i < body.length; i++) {
    const changed = body.slice(0, i) + String.fromCharCode(body.charCodeAt(i) ^ 1) + body.slice(i + 1);
    expect(hasNorthstarAiProvenance({ body: changed, system_tags: [tag] })).toBe(false);
  }
  expect(hasNorthstarAiProvenance({ body: ` ${body}`, system_tags: [tag] })).toBe(false);
  expect(hasNorthstarAiProvenance({ body, tags: [tag] })).toBe(false);
});

test("record-detail body edit followed by sharing drops both text and image attribution", async () => {
  const first = editor(); first.selectSuggestion(SENTENCE); await first.save();
  const { saved } = await storedShare();
  const row = { body: saved.body, system_tags: saved.systemTags, created_at: "then" };
  const detailSource = readFileSync(resolve(ROOT, "src/screens/deepspace/dds-record-detail-screen.tsx"), "utf8");
  const tree = ts.createSourceFile("detail.tsx", detailSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const update = jest.fn(async (_owner: string, _id: string, patch: { body?: string }) => Object.assign(row, patch));
  const submit = runInNewContext(ts.transpileModule(`${handler("submitEdit", tree)}\nsubmitEdit;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    locksRef: { current: {} }, primary: { status: "ready", identity: "record:r1", piece: { origin: "record", body: row.body } },
    identity: "record:r1", userId: "owner", recordId: "r1", bodyDraft: `${SENTENCE}!`,
    setEditing: jest.fn(), setEditBusy: jest.fn(), setActionError: jest.fn(), updateReadyPiece: jest.fn(),
    updateRecord: update, editedBodyPatch, isCurrent: () => true, setBodyDraft: jest.fn(), announceActionError: jest.fn(),
  }) as () => Promise<void>;
  await submit();
  expect(update).toHaveBeenCalledWith("owner", "r1", expect.objectContaining({ body: `${SENTENCE}!` }));
  mockRows = [row];
  const state = await fetchCurrentNorthstar("owner");
  expect(state.aiSuggested).toBe(false);
  const options = { variant: "A" as const, insight: state.sentence!, handle: "me", aiCopyTail: state.aiSuggested ? "TAIL" : undefined };
  expect(captureCardProps(options).aiCopyTail).toBeUndefined();
  expect(fallbackShareText(options)).not.toContain("TAIL");
});
