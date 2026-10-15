// A-Z first-use check, round 4 (Z79). Writing on the short capture screen vanished
// after a visit to another tab: the screen held it in component state only.
import fs from "node:fs";
import path from "node:path";

import { beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner, __resetAccountEpochForTests } from "../../auth/account-epoch";
import { EMPTY_FOURW } from "../fourw";
import { forgetCaptureViewDraft, keepCaptureViewDraft, readCaptureViewDraft, type CaptureViewDraft } from "../view-draft";

const EMPTY: CaptureViewDraft = { mode: "text", fourwOn: false, text: "", fourw: EMPTY_FOURW, todos: ["", ""] };

beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("qa-a"); });

test("what was typed is there again when the screen mounts a second time", () => {
  keepCaptureViewDraft("qa-a", { ...EMPTY, text: "half a thought" });
  expect(readCaptureViewDraft("qa-a")).toEqual({ ...EMPTY, text: "half a thought" });
});

test("the format it was written in comes back with it", () => {
  const todo: CaptureViewDraft = { ...EMPTY, mode: "todo", todos: ["call the dentist", ""] };
  keepCaptureViewDraft("qa-a", todo);
  expect(readCaptureViewDraft("qa-a")).toEqual(todo);
  const fourw: CaptureViewDraft = { ...EMPTY, fourwOn: true, fourw: { ...EMPTY_FOURW, where: "the library" } };
  keepCaptureViewDraft("qa-a", fourw);
  expect(readCaptureViewDraft("qa-a")).toEqual(fourw);
});

test("nothing typed keeps nothing, so a chosen format alone does not stick", () => {
  keepCaptureViewDraft("qa-a", { ...EMPTY, text: "x" });
  keepCaptureViewDraft("qa-a", { ...EMPTY, mode: "link", text: "   " });
  expect(readCaptureViewDraft("qa-a")).toBeUndefined();
});

test("a saved note is forgotten", () => {
  keepCaptureViewDraft("qa-a", { ...EMPTY, text: "saved a moment later" });
  forgetCaptureViewDraft("qa-a");
  expect(readCaptureViewDraft("qa-a")).toBeUndefined();
});

test("another account never sees it, and a stale owner can neither read nor write", () => {
  keepCaptureViewDraft("qa-a", { ...EMPTY, text: "mine" });
  expect(readCaptureViewDraft("qa-b")).toBeUndefined();
  beginAccountOwnerTransition("qa-b");
  noteResolvedOwner("qa-b"); clearAccountTransition(currentAccountEpoch());
  expect(readCaptureViewDraft("qa-b")).toBeUndefined();
  keepCaptureViewDraft("qa-a", { ...EMPTY, text: "late write from the old screen" });
  expect(readCaptureViewDraft("qa-b")).toBeUndefined();
});

test("signed out there is nothing to keep", () => {
  keepCaptureViewDraft(null, { ...EMPTY, text: "nobody" });
  expect(readCaptureViewDraft(null)).toBeUndefined();
});

describe("the screen is wired to it", () => {
  const screen = fs.readFileSync(path.join(process.cwd(), "src/components/deep-space/DeepSpaceViews.tsx"), "utf8");
  const start = screen.indexOf("export function CaptureView(");
  const view = screen.slice(start, screen.indexOf("\nexport function ", start + 1));

  test("the fields start from what was kept", () => {
    expect(view).toContain("const [kept] = useState(() => readCaptureViewDraft(userId));");
    expect(view).toContain('useState<CaptureMode>(kept?.mode ?? "text")');
    expect(view).toContain("useState(kept?.fourwOn ?? false)");
    expect(view).toContain("useState<FourWFields>(kept?.fourw ?? EMPTY_FOURW)");
    expect(view).toContain('useState(kept?.text ?? "")');
    expect(view).toContain('useState<string[]>(kept?.todos ?? ["", ""])');
  });

  test("every change is kept, and a successful save forgets it before the fields clear", () => {
    expect(view).toContain("keepCaptureViewDraft(userId, { mode, fourwOn, text, fourw, todos });");
    expect(view).toContain("}, [userId, mode, fourwOn, text, fourw, todos]);");
    const forget = view.indexOf("forgetCaptureViewDraft(userId);");
    expect(forget).toBeGreaterThan(view.indexOf("await createRecord({"));
    expect(forget).toBeLessThan(view.indexOf('setText("");'));
    expect(view.indexOf("} catch (e) {", forget)).toBeGreaterThan(forget);
  });

  test("it stays in session memory: the module touches no storage", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/capture/view-draft.ts"), "utf8");
    expect(source).not.toMatch(/AsyncStorage|localStorage|encrypted-native-storage|SecureStore/);
    expect(source).toContain('from "../nav/view-memory"');
  });
});
