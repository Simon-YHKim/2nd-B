// /esm (check-in): a successful save cleared the picks with setScaleValue(null)
// and setSelectedTags([]). The insert is awaited, and the picks stay pressable
// while it is out, so a pick made in that window was wiped when the earlier
// save answered, even though nothing had saved it (QA 261004). Only what the
// save sent may be cleared.
//
// Executed, not grepped: the real `handleSubmit` is lifted out of the real
// source by AST and run with its closure values supplied, while the test plays
// the user changing a pick before the insert answers. If the function stops
// existing, `lift` throws and this suite goes RED.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../..");
const SCREEN = "src/app/esm.tsx";

const source = readFileSync(resolve(ROOT, SCREEN), "utf8").replace(/\r\n/g, "\n");
const AST = ts.createSourceFile(SCREEN, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const HANDLE_SUBMIT = (() => {
  let found: string | null = null;
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "handleSubmit") found = node.getText(AST);
    node.forEachChild(walk);
  };
  walk(AST);
  if (found === null) throw new Error(`no function handleSubmit in ${SCREEN}`);
  return found as string;
})();

type Kind = "context" | "energy";
interface Screen {
  kind: Kind;
  scaleValue: number | null;
  selectedTags: string[];
  saved: boolean;
  toasts: unknown[];
}
type Update<T> = T | ((current: T) => T);

function apply<T>(current: T, next: Update<T>): T {
  return typeof next === "function" ? (next as (c: T) => T)(current) : next;
}

/** Press "save" with the screen as it is now, and hand back a way to answer the insert. */
function press(screen: Screen) {
  let answer!: (result: { error: unknown }) => void;
  const inserted: unknown[] = [];
  const js = ts.transpileModule(`${HANDLE_SUBMIT}\nreturn handleSubmit;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  // The closure the real component gives handleSubmit, frozen at the press.
  const bindings: Record<string, unknown> = {
    userId: "owner-a",
    canSubmit: screen.kind === "energy" ? screen.scaleValue !== null : screen.selectedTags.length > 0,
    saving: false,
    savingRef: { current: false },
    kind: screen.kind,
    scaleValue: screen.scaleValue,
    selectedTags: screen.selectedTags,
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
    setSaved: (next: Update<boolean>) => { screen.saved = apply(screen.saved, next); },
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
  return { kind: "context", scaleValue: null, selectedTags: [], saved: false, toasts: [], ...over };
}

describe("/esm clears only the picks a save actually sent", () => {
  test("the lifted handleSubmit is the real one", () => {
    expect(HANDLE_SUBMIT).toContain('from("esm_responses").insert(');
    expect(HANDLE_SUBMIT).toContain("setSaved(true);");
  });

  test("tags picked while the insert was out stay on screen", async () => {
    const s = screen({ selectedTags: ["alone"] });
    const save = press(s);
    expect(save.inserted).toEqual([{ user_id: "owner-a", prompt_kind: "context", scale_value: null, context_tags: ["alone"] }]);
    // The user adds a tag before the insert answers (toggleTag in the screen).
    s.selectedTags = [...s.selectedTags, "outside"];
    s.saved = false;
    await save.answer();
    expect(s.selectedTags).toEqual(["alone", "outside"]);
  });

  test("an energy value picked while the insert was out stays on screen", async () => {
    const s = screen({ kind: "energy", scaleValue: 3 });
    const save = press(s);
    s.scaleValue = 5;
    await save.answer();
    expect(s.scaleValue).toBe(5);
  });

  test("unchanged picks are cleared after a save, as before", async () => {
    const tags = screen({ selectedTags: ["alone", "outside"] });
    const tagSave = press(tags);
    await tagSave.answer();
    expect(tags.selectedTags).toEqual([]);
    expect(tags.saved).toBe(true);

    // The same set in another order is what was sent.
    const reordered = screen({ selectedTags: ["alone", "outside"] });
    const reorderedSave = press(reordered);
    reordered.selectedTags = ["outside", "alone"];
    await reorderedSave.answer();
    expect(reordered.selectedTags).toEqual([]);

    const energy = screen({ kind: "energy", scaleValue: 4 });
    const energySave = press(energy);
    await energySave.answer();
    expect(energy.scaleValue).toBeNull();
  });

  test("a failed save clears nothing", async () => {
    const s = screen({ selectedTags: ["alone"] });
    const save = press(s);
    await save.answer(new Error("offline"));
    expect(s.selectedTags).toEqual(["alone"]);
    expect(s.saved).toBe(false);
    expect(s.toasts).toHaveLength(1);
  });
});
