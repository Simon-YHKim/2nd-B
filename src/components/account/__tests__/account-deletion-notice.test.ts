import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// Actual TSX/functions with a small synchronous hook host and fake store only.
// This is not a React scheduler, RN/browser renderer, or accessibility-tree test.
// No Auth, account API, storage, or network implementation is loaded.
type Props = Record<string, unknown>;
type Node = { type?: unknown; props?: Props };
type Notice = {
  receipt: { deleted: true; profileErased: boolean | null; rawClippingsErased: boolean | null };
  localPurge: "complete" | "retry-scheduled" | "unconfirmed";
  localSignOut: "pending" | "complete" | "unconfirmed";
};
const root = resolve(__dirname, "../../../..");
const notice = (overrides: Partial<Notice> = {}): Notice => ({
  receipt: { deleted: true, profileErased: true, rawClippingsErased: false },
  localPurge: "retry-scheduled", localSignOut: "complete", ...overrides,
});
const walk = (tree: unknown): Node[] => {
  if (Array.isArray(tree)) return tree.flatMap(walk);
  if (!tree || typeof tree !== "object") return [];
  const node = tree as Node;
  return [node, ...walk(node.props?.children)];
};
const compile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const translate = (key: string) => key;

function routeRenderer(path: string, functionName: string) {
  const source = readFileSync(resolve(root, path), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === functionName)!;
  const code = compile(`export ${declaration.getText(ast).replace(/^export\s+/, "")}`);
  let current: Notice | null = notice();
  let form = { loading: false, userId: "still-present-owner" as string | null };
  const hook = jest.fn(() => current);
  const scope: Record<string, unknown> = {
    useTranslation: () => ({ t: translate, i18n: { language: "ko" } }),
    useSignInForm: () => form, useRef: () => ({ current: null }), useKeyboard: () => 0,
    // 이 하네스가 쓰이던 시점 이후 deep-space 로그인 화면이 useAuth 를 부른다
    // (세션 확인 실패를 "로그아웃"으로 오해하지 않기 위한 경계). 스텁이 없으면
    // 대상 결함이 아니라 ReferenceError 가 난다.
    useAuth: () => ({ sessionUnavailable: false, refresh: () => undefined }),
    useState: (initial: unknown) => [initial, () => undefined],
    // deep-space 로그인 화면의 로딩 가지가 쓰는 픽셀 셸 조각들. 이 하네스가
    // 만들어진 뒤에 들어온 것들이라 스텁이 없었다.
    PixelGateShell: "PixelGateShell", PixelSurface: "PixelSurface",
    SecondbHead: "SecondbHead", Text: "Text",
    useAccountDeletionNotice: hook, AccountDeletionNoticePanel: "AccountDeletionNoticePanel",
    AuthShell: "AuthShell", View: "View", ScrollView: "ScrollView", InlineLoader: "InlineLoader",
    Redirect: "Redirect", styles: { root: {}, scroll: {} }, Platform: { OS: "web" },
  };
  const module = { exports: {} as Record<string, () => unknown> };
  new Function("require", "module", "exports", ...Object.keys(scope), code)(
    (id: string) => { if (id === "react/jsx-runtime") return require(id); throw new Error(`Unexpected route dependency: ${id}`); },
    module, module.exports, ...Object.values(scope),
  );
  return {
    hook,
    render: (nextNotice: Notice | null, nextForm = form) => {
      current = nextNotice; form = nextForm;
      return walk(module.exports[functionName]());
    },
  };
}

test.each([
  // ⚠ 레거시 셸(SignInLegacy)은 이 목록에서 뺐다. 배선해 보니 바이트 고정 가드
  // 둘이 걸렸다 - "leaves AccountLegacy and its styles byte-for-byte unchanged"
  // 와 "preserves the legacy sign-in renderer/styles". 그 가드들은 PIXEL-CLAY
  // 이주가 롤백 스킨을 건드리지 않았음을 증명하려고 있는 것이라, 거기에 새 배선을
  // 얹는 것은 그 불변식을 깨는 일이다. 롤백 스킨은 지금 동작 그대로 둔다.
  //
  // 로딩 표시는 셸마다 다르므로 파일별로 기대를 받는다.
  // 이 테스트가 쓰이던 시점에는 이 함수가 dds-auth-screens.tsx 에 있었다.
  // 이주가 dds-sign-in-screen.tsx 로 옮겼고 앞 파일은 재수출만 한다.
  ["src/screens/deepspace/dds-sign-in-screen.tsx", "DeepSpaceSignInDesignScreen", "PixelGateShell"],
])("receipt outranks both guest guards without weakening normal routing: %s", (path, name, loader) => {
  const screen = routeRenderer(path, name);
  for (const loading of [true, false]) {
    const nodes = screen.render(notice(), { loading, userId: "still-present-owner" });
    expect(nodes.some(node => node.type === "AccountDeletionNoticePanel")).toBe(true);
    expect(nodes.some(node => node.type === "Redirect" || node.type === loader)).toBe(false);
  }
  expect(screen.render(notice(), { loading: false, userId: null }).some(node => node.type === "AccountDeletionNoticePanel")).toBe(true);
  expect(screen.render(null, { loading: true, userId: null }).some(node => node.type === loader)).toBe(true);
  expect(screen.render(null, { loading: false, userId: "another-owner" }).some(node => node.type === "Redirect" && node.props?.href === "/")).toBe(true);
  expect(screen.hook).toHaveBeenCalledTimes(5);
});

function mountPanel(initial: Notice) {
  let current: Notice | null = initial;
  let cursor = 0;
  const state: unknown[] = [];
  const listeners = new Set<() => void>();
  const cleanups: Array<() => void> = [];
  let notifications = 0;
  const dismiss = jest.fn();
  const get = () => current;
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const hooks = {
    useState: (value: unknown) => {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = value;
      return [state[slot], (next: unknown) => { state[slot] = typeof next === "function" ? (next as (value: unknown) => unknown)(state[slot]) : next; }];
    },
    useSyncExternalStore: (sub: typeof subscribe, snapshot: typeof get, server: typeof get) => {
      expect(sub).toBe(subscribe); expect(snapshot).toBe(get); expect(server).toBe(get);
      if (!cleanups.length) cleanups.push(sub(() => { notifications++; }));
      return snapshot();
    },
  };
  const modules: Record<string, unknown> = {
    react: hooks, "react-i18next": { useTranslation: () => ({ t: translate }) },
    "react-native": { View: "View", Pressable: "Pressable", StyleSheet: { create: (styles: unknown) => styles } },
    "@/components/ui/Text": { Text: "Text" },
    "@/components/m3": { MdButton: "MdButton", MdCard: "MdCard", m3TextStyle: () => ({}) },
    "@/lib/theme/m3": { m3: { spacing: { s2: 4, s3: 6, s4: 8 }, minTouch: 44 } },
    "@/lib/theme/ThemeContext": { ForceDark: "ForceDark" },
    "@/lib/account/deletion-completion": { getAccountDeletionNotice: get, subscribeAccountDeletionNotice: subscribe, dismissAccountDeletionNotice: dismiss },
  };
  const module = { exports: {} as {
    useAccountDeletionNotice(): Notice | null;
    AccountDeletionNoticePanel(props: { notice: Notice }): unknown;
  } };
  const source = readFileSync(resolve(__dirname, "../AccountDeletionNotice.tsx"), "utf8");
  new Function("require", "module", "exports", compile(source))((id: string) => {
    if (id === "react/jsx-runtime") return require(id);
    if (id in modules) return modules[id];
    throw new Error(`Unexpected notice dependency: ${id}`);
  }, module, module.exports);
  const render = () => {
    cursor = 0;
    const value = module.exports.useAccountDeletionNotice();
    return value ? walk(module.exports.AccountDeletionNoticePanel({ notice: value })) : [];
  };
  return {
    dismiss, render,
    update: (value: Notice | null) => { current = value; listeners.forEach(listener => listener()); return render(); },
    press: (testID: string) => { const button = render().find(node => node.props?.testID === testID); expect(button).toBeDefined(); (button!.props!.onPress as () => void)(); },
    notifications: () => notifications,
    unmount: () => cleanups.forEach(cleanup => cleanup()), listeners,
  };
}
const textKeys = (nodes: Node[]) => nodes.filter(node => node.type === "Text").map(node => node.props?.children);

test("details start collapsed and expose each remote observation without claiming universal erasure", () => {
  const screen = mountPanel(notice());
  expect(textKeys(screen.render())).toContain("account.deletionReceipt.title");
  expect(textKeys(screen.render())).not.toContain("account.deletionReceipt.profile");
  screen.press("account-deletion-details");
  expect(screen.render().find(node => node.props?.testID === "account-deletion-details")?.props?.accessibilityState).toEqual({ expanded: true });
  expect(screen.render().find(node => node.props?.testID === "account-deletion-details")?.props?.["aria-expanded"]).toBe(true);
  expect(textKeys(screen.render())).toEqual(expect.arrayContaining([
    "account.deletionReceipt.profile", "account.deletionReceipt.rawClippings", "account.deletionReceipt.observedAbsent",
    "account.deletionReceipt.notConfirmed", "account.deletionReceipt.scope", "account.deletionReceipt.subscription", "account.deletionReceipt.support",
  ]));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render())).not.toContain("account.deletionReceipt.profile");
  screen.unmount();
});

test("the fixed dark card keeps its text in the existing ForceDark subtree", () => {
  const screen = mountPanel(notice());
  expect(screen.render()[0].type).toBe("ForceDark");
  expect(screen.render()[1].type).toBe("MdCard");
  screen.unmount();
});

test.each([[true, "observedAbsent"], [false, "notConfirmed"], [null, "notReported"]] as const)("preserves three-valued remote results: %s", (value, key) => {
  const screen = mountPanel(notice({ receipt: { deleted: true, profileErased: value, rawClippingsErased: value } }));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render()).filter(text => text === `account.deletionReceipt.${key}`)).toHaveLength(2);
  screen.unmount();
});

test.each(["complete", "retry-scheduled", "unconfirmed"] as const)("local purge status is separate from confirmed account deletion: %s", localPurge => {
  const screen = mountPanel(notice({ localPurge }));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render())).toContain(`account.deletionReceipt.localPurge.${localPurge}`);
  expect(textKeys(screen.render())).toContain("account.deletionReceipt.title");
  screen.unmount();
});

test.each(["pending", "complete", "unconfirmed"] as const)("only dismiss is offered and pending sign-out cannot dismiss: %s", localSignOut => {
  const screen = mountPanel(notice({ localSignOut }));
  expect(textKeys(screen.render())).toContain(`account.deletionReceipt.localSignOut.${localSignOut}`);
  const buttons = screen.render().filter(node => node.type === "MdButton");
  expect(buttons).toHaveLength(1);
  expect(buttons[0].props?.disabled).toBe(localSignOut === "pending");
  screen.press("account-deletion-dismiss");
  expect(screen.dismiss).toHaveBeenCalledTimes(localSignOut === "pending" ? 0 : 1);
  screen.unmount();
});

test("external-store invalidation removes the panel and subscription cleanup is effective", () => {
  const screen = mountPanel(notice()); screen.render();
  expect(screen.listeners.size).toBe(1);
  expect(screen.update(null)).toEqual([]);
  expect(screen.notifications()).toBe(1);
  screen.unmount(); expect(screen.listeners.size).toBe(0);
});

test("a retained dismiss callback cannot clear a replacement or invalidated notice", () => {
  const screen = mountPanel(notice());
  const oldDismiss = screen.render().find(node => node.props?.testID === "account-deletion-dismiss")!.props!.onPress as () => void;
  screen.update(notice({ localSignOut: "pending" }));
  oldDismiss();
  expect(screen.dismiss).not.toHaveBeenCalled();
  screen.update(null);
  oldDismiss();
  expect(screen.dismiss).not.toHaveBeenCalled();
  screen.unmount();
});

test("five locales preserve subtree parity and three explicit English mirrors", () => {
  const subtree = (locale: string) => JSON.parse(readFileSync(resolve(root, `locales/${locale}/consent.json`), "utf8")).account.deletionReceipt;
  const keys = (value: Record<string, unknown>, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object" ? keys(child as Record<string, unknown>, `${prefix}${key}.`) : `${prefix}${key}`).sort();
  const en = subtree("en"); const ko = subtree("ko");
  expect(en.title).toBe("Account deletion confirmed"); expect(ko.title).toBe("계정 삭제를 확인했어요");
  expect(keys(ko)).toEqual(keys(en));
  for (const locale of ["es", "id", "pt"]) expect(subtree(locale)).toEqual(en);
  expect(en.scope).toContain("at the time");
  expect(en.scope).toContain("Missing results do not confirm that a check occurred");
  expect(en.notReported).toBe("No usable result was returned for this check.");
  expect(ko.notReported).toBe("확인 가능한 결과가 응답에 없어요.");
  expect(en.localPurge["retry-scheduled"]).toContain("could not be confirmed");
  expect(en.localPurge["retry-scheduled"]).toContain("next app start");
  expect(ko.localPurge["retry-scheduled"]).toContain("다음 앱 시작");
  expect(en.localPurge["retry-scheduled"]).not.toContain("remains");
  expect(ko.localPurge["retry-scheduled"]).not.toContain("남아 있어");
  expect(en.support).toContain("kim0405@hayangzip.com");
  expect(ko.support).toContain("kim0405@hayangzip.com");
});
