import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as account from "@/lib/auth/account-epoch";
import type { AvatarSpec } from "@/lib/avatar";

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
type Slot = { value?: unknown; deps?: unknown[] };
const source = readFileSync(resolve(__dirname, "../ChatMessageAvatar.tsx"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

// The recipe is deliberately not a randomized fallback: identity is preserved.
const recipe: AvatarSpec = {
  v: 64, seed: "saved-owner", type: "human", skin: "#c98e5e", hairColor: "#2b211b", eye: "#3a2a1e",
  cloth: "#696949", cloth2: "#d97757", fur: "#cbb8d6", hair: "sidepart", acc: "none", face: "glasses",
  expr: "smile", species: "raccoon", job: null, garmentId: null, wearUniform: true,
};

function runtime() {
  let cursor = 0; let dirty = false; let mounted = true; let lateUpdates = 0;
  let focusCallback: (() => (() => void) | void) | undefined;
  let focusCleanup: (() => void) | undefined;
  let focused = true;
  let owner: string | null = null;
  let value: AvatarSpec | null = null;
  const slots: Slot[] = [];
  const pendingEffects: (() => void)[] = [];
  const requests: { owner: string; resolve: (spec: AvatarSpec | null) => void; reject: (error: Error) => void }[] = [];
  const fetchAvatarSpec = jest.fn((userId: string) => new Promise<AvatarSpec | null>((resolve, reject) => requests.push({ owner: userId, resolve, reject })));
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  const hooks = {
    useState: (initial: unknown) => {
      const slot = slots[cursor] ?? (slots[cursor] = { value: initial }); cursor += 1;
      return [slot.value, (next: unknown) => {
        if (!mounted) lateUpdates += 1;
        if (!Object.is(slot.value, next)) { slot.value = next; dirty = true; }
      }];
    },
    useRef: (initial: unknown) => {
      const slot = slots[cursor] ?? (slots[cursor] = { value: { current: initial } }); cursor += 1; return slot.value;
    },
    useCallback: (callback: unknown, deps: unknown[]) => {
      const slot = slots[cursor] ?? (slots[cursor] = {}); cursor += 1;
      if (!same(slot.deps, deps)) { slot.value = callback; slot.deps = deps; }
      return slot.value;
    },
  };
  const jsx = (type: string, props: Props): Tree => ({ type, props });
  const modules: Record<string, unknown> = {
    react: hooks,
    "react/jsx-runtime": { jsx },
    "react-native": { StyleSheet: { create: (styles: unknown) => styles } },
    "expo-router": { useFocusEffect: (callback: typeof focusCallback) => {
      if (focusCallback === callback) return;
      focusCallback = callback;
      pendingEffects.push(() => { focusCleanup?.(); focusCleanup = focused ? callback?.() || undefined : undefined; });
    } },
    "@/components/phone/PhoneUIKit": { PhoneView: "View" },
    "@/components/avatar/AvatarPreview": { AvatarPreview: "AvatarPreview" },
    "@/components/character/HustleKPortrait": { HustleKPortrait: "HustleKPortrait" },
    "@/components/pixel/PixelGlyph": { PixelGlyph: "PixelGlyph" },
    "@/lib/supabase/avatar-spec": { fetchAvatarSpec },
    "@/lib/auth/account-epoch": account,
    "@/lib/theme/tokens": { deepSpace: { textMid: "ink", card: "surface" } },
  };
  const exported: {
    ChatMessageAvatar?: (props: Props) => Tree;
    useChatUserAvatar?: (owner: string | null) => AvatarSpec | null;
  } = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in modules)) throw new Error("Unexpected dependency: " + name);
    return modules[name];
  }, exported);
  function render() { cursor = 0; dirty = false; value = exported.useChatUserAvatar!(owner); }
  function flush() {
    for (let guard = 0; guard < 12; guard += 1) {
      while (pendingEffects.length) pendingEffects.shift()!();
      if (!dirty) return;
      render();
    }
    throw new Error("Effect/render loop");
  }
  return {
    fetchAvatarSpec, requests,
    portrait: (props: Props) => exported.ChatMessageAvatar!(props),
    get value() { return value; },
    get lateUpdates() { return lateUpdates; },
    mount(next: string | null) { owner = next; render(); flush(); },
    update(next: string | null) { owner = next; render(); flush(); },
    setFocus(next: boolean) {
      if (focused === next) return;
      focused = next;
      focusCleanup?.(); focusCleanup = next ? focusCallback?.() || undefined : undefined;
      flush();
    },
    async settle() { await Promise.resolve(); await Promise.resolve(); flush(); },
    unmount() { focusCleanup?.(); mounted = false; },
  };
}

function publish(owner: string | null) {
  account.noteResolvedOwner(owner);
  account.clearAccountTransition(account.currentAccountEpoch());
}
beforeEach(() => account.__resetAccountEpochForTests());
afterEach(() => account.__resetAccountEpochForTests());

test("user message shows the saved recipe or an explicit anonymous glyph in a fixed accessible frame", () => {
  const host = runtime();
  const saved = host.portrait({ role: "user", userAvatar: recipe, label: "My profile" });
  expect(saved.props).toMatchObject({ testID: "chat-avatar-user", accessible: true, accessibilityRole: "image", accessibilityLabel: "My profile" });
  expect(saved.props.style).toMatchObject({ width: 36, height: 36, flexShrink: 0, overflow: "hidden" });
  const image = saved.props.children as Tree;
  expect(image).toMatchObject({ type: "AvatarPreview", props: { size: 36, crop: true } });
  expect(image.props.spec).toBe(recipe);
  const anonymous = host.portrait({ role: "user", userAvatar: null, label: "My profile" });
  expect(anonymous.props.children).toMatchObject({ type: "PixelGlyph", props: { name: "person", size: 28 } });
});

test("HustleK uses each message's supplied expression and defaults to neutral, never the user's recipe", () => {
  const host = runtime();
  for (const expression of ["A02", "B04", "C08"]) {
    const tree = host.portrait({ role: "secondb", userAvatar: recipe, expression, label: "HustleK" });
    expect(tree.props).toMatchObject({ testID: "chat-avatar-secondb", accessibilityLabel: "HustleK" });
    expect(tree.props.children).toEqual({ type: "HustleKPortrait", props: { expression, size: 36 } });
  }
  expect(host.portrait({ role: "secondb", userAvatar: null, label: "HustleK" }).props.children).toMatchObject({ props: { expression: "A01" } });
});

test("signed out or unpublished owners never fetch an avatar", () => {
  const host = runtime(); host.mount(null);
  expect(host.value).toBeNull(); expect(host.fetchAvatarSpec).not.toHaveBeenCalled();
  host.update("unpublished"); expect(host.fetchAvatarSpec).not.toHaveBeenCalled(); host.unmount();
});

test("one owner fetch is reused across renders and refreshed after returning from profile editing", async () => {
  publish("A"); const host = runtime(); host.mount("A");
  host.requests[0].resolve(recipe); await host.settle();
  expect(host.value).toBe(recipe);
  host.update("A"); expect(host.fetchAvatarSpec).toHaveBeenCalledTimes(1);
  host.setFocus(false); host.setFocus(true);
  const edited = { ...recipe, hair: "curly" };
  expect(host.fetchAvatarSpec).toHaveBeenCalledTimes(2);
  host.requests[1].resolve(edited); await host.settle();
  expect(host.value).toBe(edited); host.unmount();
});

test("changing owners immediately hides the old recipe and late old-owner results cannot overwrite the new avatar", async () => {
  publish("A"); const host = runtime(); host.mount("A");
  host.requests[0].resolve(recipe); await host.settle();
  host.setFocus(false); host.setFocus(true); // A refresh remains pending.
  publish("B"); host.update("B");
  expect(host.value).toBeNull();
  const second = { ...recipe, seed: "B" };
  host.requests[2].resolve(second); await host.settle();
  host.requests[1].resolve({ ...recipe, hair: "late-A" }); await host.settle();
  expect(host.value).toBe(second);
  publish(null); host.update(null); expect(host.value).toBeNull(); host.unmount();
});

test("an account epoch change rejects late data before the new owner reaches React", async () => {
  publish("A"); const host = runtime(); host.mount("A");
  account.beginAccountOwnerTransition("B");
  host.requests[0].resolve(recipe); await host.settle();
  expect(host.value).toBeNull(); host.unmount();
});

test("blur and unmount cancel pending commits, even when the same owner regains focus", async () => {
  publish("A"); const host = runtime(); host.mount("A");
  host.setFocus(false); host.setFocus(true);
  const current = { ...recipe, hair: "current" };
  host.requests[1].resolve(current); await host.settle();
  host.requests[0].resolve(recipe); await host.settle();
  expect(host.value).toBe(current);
  host.setFocus(false); host.setFocus(true); host.unmount();
  host.requests[2].resolve(recipe); await host.settle();
  expect(host.lateUpdates).toBe(0);
});

test("failed refresh retains this owner's portrait, but an explicit cleared recipe returns to the anonymous glyph", async () => {
  publish("A"); const host = runtime(); host.mount("A");
  host.requests[0].resolve(recipe); await host.settle();
  host.setFocus(false); host.setFocus(true);
  host.requests[1].reject(new Error("offline")); await host.settle();
  expect(host.value).toBe(recipe);
  host.setFocus(false); host.setFocus(true);
  host.requests[2].resolve(null); await host.settle();
  expect(host.value).toBeNull(); host.unmount();
});
