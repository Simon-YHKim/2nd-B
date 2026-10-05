// /esm (check-in): a successful save cleared the picks with setScaleValue(null)
// and setSelectedTags([]). The insert is awaited, and the picks stay pressable
// while it is out, so a pick made in that window was wiped when the earlier
// save answered, even though nothing had saved it (QA 261004). Only what the
// save sent may be cleared. And the "saved" note belongs to the picks on
// screen: a save that answers after a later pick did not save that pick, so
// the note stays off (QA 261004 gate ESM-STATUS / F2052-01).
//
// Executed, not grepped: the real `handleSubmit`, `toggleTag` and `saved`
// derivation are lifted out of the real source by AST and run with their
// closure values supplied, while the test plays the user changing a pick
// before the insert answers. If one stops existing, the lift throws and this
// suite goes RED.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../..");
const SCREEN = "src/app/esm.tsx";

const source = readFileSync(resolve(ROOT, SCREEN), "utf8").replace(/\r\n/g, "\n");
const AST = ts.createSourceFile(SCREEN, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function liftFunction(name: string): string {
  let found: string | null = null;
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(AST);
    node.forEachChild(walk);
  };
  walk(AST);
  if (found === null) throw new Error(`no function ${name} in ${SCREEN}`);
  return found as string;
}

const HANDLE_SUBMIT = liftFunction("handleSubmit");
const TOGGLE_TAG = liftFunction("toggleTag");

/** The initializer of `const saved = ...` in the component. */
const SAVED = (() => {
  let found: string | null = null;
  const walk = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "saved" && node.initializer) {
      found = node.initializer.getText(AST);
    }
    node.forEachChild(walk);
  };
  walk(AST);
  if (found === null) throw new Error(`no const saved in ${SCREEN}`);
  return found as string;
})();

function transpile(body: string): string {
  return ts.transpileModule(body, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

type Kind = "context" | "energy";
interface Screen {
  kind: Kind;
  scaleValue: number | null;
  selectedTags: string[];
  edit: number;
  savedEdit: number | null;
  toasts: unknown[];
}
type Update<T> = T | ((current: T) => T);

function apply<T>(current: T, next: Update<T>): T {
  return typeof next === "function" ? (next as (c: T) => T)(current) : next;
}

/** Whether the screen shows the saved note, by the component's own rule. */
function saved(screen: Screen): boolean {
  const derive = new Function("savedEdit", "edit", transpile(`return (${SAVED});`));
  return derive(screen.savedEdit, screen.edit) as boolean;
}

/** The user taps a context tag chip (the screen's real toggleTag). */
function toggle(screen: Screen, tag: string): void {
  const bindings: Record<string, unknown> = {
    setEdit: (next: Update<number>) => { screen.edit = apply(screen.edit, next); },
    setSelectedTags: (next: Update<string[]>) => { screen.selectedTags = apply(screen.selectedTags, next); },
  };
  const toggleTag = new Function(...Object.keys(bindings), transpile(`${TOGGLE_TAG}\nreturn toggleTag;`))(
    ...Object.values(bindings),
  ) as (tag: string) => void;
  toggleTag(tag);
}

/** Press "save" with the screen as it is now, and hand back a way to answer the insert. */
function press(screen: Screen) {
  let answer!: (result: { error: unknown }) => void;
  const inserted: unknown[] = [];
  const js = transpile(`${HANDLE_SUBMIT}\nreturn handleSubmit;`);
  // The closure the real component gives handleSubmit, frozen at the press.
  const bindings: Record<string, unknown> = {
    userId: "owner-a",
    canSubmit: screen.kind === "energy" ? screen.scaleValue !== null : screen.selectedTags.length > 0,
    saving: false,
    savingRef: { current: false },
    kind: screen.kind,
    scaleValue: screen.scaleValue,
    selectedTags: screen.selectedTags,
    edit: screen.edit,
    t: (key: string) => key,
    getSupabaseClient: () => ({
      from: () => ({
        insert: (row: unknown) => {
          inserted.push(row);
          return new Promise((resolveInsert) => { answer = resolveInsert; });
        },
      }),
    }),
    setSaving: () => undefined,
    setToast: (toast: unknown) => { screen.toasts.push(toast); },
    setSavedEdit: (next: Update<number | null>) => { screen.savedEdit = apply(screen.savedEdit, next); },
    setScaleValue: (next: Update<number | null>) => { screen.scaleValue = apply(screen.scaleValue, next); },
    setSelectedTags: (next: Update<string[]>) => { screen.selectedTags = apply(screen.selectedTags, next); },
  };
  const handleSubmit = new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as () => Promise<void>;
  const done = handleSubmit();
  return {
    inserted,
    async answer(error: unknown = null): Promise<void> {
      await new Promise((r) => setImmediate(r));
      answer({ error });
      await done;
    },
  };
}

function screen(over: Partial<Screen>): Screen {
  return { kind: "context", scaleValue: null, selectedTags: [], edit: 0, savedEdit: null, toasts: [], ...over };
}

describe("/esm clears only the picks a save actually sent", () => {
  test("the lifted handleSubmit is the real one", () => {
    expect(HANDLE_SUBMIT).toContain('from("esm_responses").insert(');
    expect(HANDLE_SUBMIT).toContain("setSavedEdit(edit);");
  });

  test("every pick or prompt change outside the save is a new edit", () => {
    // Inline handlers (prompt tab, energy dot) are not liftable one by one, so
    // the rule is read from the tree: whatever function changes a pick or the
    // prompt, other than handleSubmit's own clearing, also bumps `edit`.
    const callsTo = (node: ts.Node, names: readonly string[]): ts.CallExpression[] => {
      const out: ts.CallExpression[] = [];
      const walk = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.includes(n.expression.text)) out.push(n);
        n.forEachChild(walk);
      };
      walk(node);
      return out;
    };
    const enclosingFunction = (node: ts.Node): ts.FunctionLikeDeclaration => {
      for (let n = node.parent; n; n = n.parent) {
        if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return n;
      }
      throw new Error("pick change outside any function");
    };
    const editSites = new Set<ts.FunctionLikeDeclaration>();
    for (const call of callsTo(AST, ["setScaleValue", "setSelectedTags", "setKind"])) {
      const fn = enclosingFunction(call);
      if (ts.isFunctionDeclaration(fn) && fn.name?.text === "handleSubmit") continue;
      expect({ change: call.getText(AST), bumpsEdit: callsTo(fn, ["setEdit"]).length > 0 })
        .toEqual({ change: call.getText(AST), bumpsEdit: true });
      editSites.add(fn);
    }
    // toggleTag, the prompt tab and the energy dot: the walk found them all.
    expect(editSites.size).toBe(3);
  });

  test("tags picked while the insert was out stay on screen, and are not called saved", async () => {
    const s = screen({ selectedTags: ["alone"] });
    const save = press(s);
    expect(save.inserted).toEqual([{ user_id: "owner-a", prompt_kind: "context", scale_value: null, context_tags: ["alone"] }]);
    // The user adds a tag before the insert answers.
    toggle(s, "outside");
    await save.answer();
    expect(s.selectedTags).toEqual(["alone", "outside"]);
    expect(saved(s)).toBe(false);
  });

  test("an energy value picked while the insert was out stays on screen, and is not called saved", async () => {
    const s = screen({ kind: "energy", scaleValue: 3 });
    const save = press(s);
    // The energy dot's handler: setScaleValue(value) and a new edit.
    s.scaleValue = 5;
    s.edit += 1;
    await save.answer();
    expect(s.scaleValue).toBe(5);
    expect(saved(s)).toBe(false);
  });

  test("unchanged picks are cleared after a save, as before", async () => {
    const tags = screen({ selectedTags: ["alone", "outside"] });
    const tagSave = press(tags);
    await tagSave.answer();
    expect(tags.selectedTags).toEqual([]);
    expect(saved(tags)).toBe(true);

    // The same set in another order is what was sent.
    const reordered = screen({ selectedTags: ["alone", "outside"] });
    const reorderedSave = press(reordered);
    toggle(reordered, "alone");
    toggle(reordered, "alone");
    expect(reordered.selectedTags).toEqual(["outside", "alone"]);
    await reorderedSave.answer();
    expect(reordered.selectedTags).toEqual([]);

    const energy = screen({ kind: "energy", scaleValue: 4 });
    const energySave = press(energy);
    await energySave.answer();
    expect(energy.scaleValue).toBeNull();
    expect(saved(energy)).toBe(true);

    // A pick after the answer is a new edit, so the note goes off again.
    toggle(tags, "resting");
    expect(saved(tags)).toBe(false);
  });

  test("a failed save clears nothing", async () => {
    const s = screen({ selectedTags: ["alone"] });
    const save = press(s);
    await save.answer(new Error("offline"));
    expect(s.selectedTags).toEqual(["alone"]);
    expect(saved(s)).toBe(false);
    expect(s.toasts).toHaveLength(1);
  });
});
