import { readFileSync } from "node:fs";
import ts from "typescript";
import { hookHarness } from "@/lib/nav/__tests__/hook-harness";
import * as account from "@/lib/auth/account-epoch";
import type { ReminderEnableResult } from "@/lib/ops/reminders";

type Tree = { type: unknown; props: Record<string, unknown> };
const source = readFileSync("src/screens/deepspace/ops/screens.tsx", "utf8");
const ast = ts.createSourceFile("screens.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["reminderSchedule", "ReminderCard", "ReminderPermissionSettings", "RemindersScreen"];
const functions = names.map(name => {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing actual function ${name}`);
  return node.getText(ast).replace(/^export /, "");
}).join("\n");
const code = ts.transpileModule(functions, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

function nodes(tree: unknown, type: unknown): Tree[] {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Tree;
  return [...(node.type === type ? [node] : []), ...nodes(node.props.children, type)];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount() {
  const hooks = hookHarness();
  const enable = jest.fn<Promise<ReminderEnableResult>, unknown[]>(async () => "denied");
  const disable = jest.fn(async () => undefined);
  const openSettings = jest.fn(async () => undefined);
  const routines = [{ id: "routine-a", title: "Private title", reminder_time: "09:00", recurrence: "daily" }];
  let userId = "account-a";
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const scope = {
    exports: {},
    ...hooks.hooks,
    ...account,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      throw new Error(`Unexpected import ${name}`);
    },
    usePhoneDesign: () => false,
    clayReminderStyles: {}, phoneReminderStyles: {},
    useOpsCopy: () => new Proxy({}, { get: (_target, key) => String(key) }),
    useTranslation: () => ({ t: (key: string) => key }),
    useAuth: () => ({ userId }),
    remindersSupported: () => true,
    useAsync: () => ({ data: routines, status: "success", reload: jest.fn() }),
    Platform: { OS: "android" },
    sweepResidualReminderNotifications: async () => undefined,
    getReminderStates: async () => ({}),
    getScheduledRoutineIds: async () => new Set(),
    enableReminderWithResult: enable, disableReminder: disable,
    Linking: { openSettings }, router: { push: jest.fn() },
    ...Object.fromEntries(["OpsFrame", "MdButton", "ChatRemindersList", "OpsState", "MdCard", "View", "Text", "OpsPhoneSwitch", "Pressable"]
      .map(name => [name, name])),
  };
  const actual = new Function(...Object.keys(scope), `${code}\nreturn { ${names.join(", ")} };`)(...Object.values(scope));
  let tree: Tree;
  const render = () => { tree = hooks.render(() => actual.RemindersScreen()); };
  const row = () => nodes(tree, actual.ReminderCard)[0];
  render();
  return {
    enable, disable, openSettings, render,
    row,
    press: () => (row().props.onToggle as () => void)(),
    card: () => actual.ReminderCard(row().props) as Tree,
    settingsLabel: () => {
      const button = nodes(actual.ReminderCard(row().props), actual.ReminderPermissionSettings)[0];
      return button ? actual.ReminderPermissionSettings(button.props).props.label : undefined;
    },
    async flush() { for (let n = 0; n < 12; n++) await Promise.resolve(); render(); },
    switchOwner(owner: string) { account.noteResolvedOwner(owner); account.clearAccountTransition(account.currentAccountEpoch()); userId = owner; render(); },
    unmount: hooks.unmount,
  };
}

beforeEach(() => { account.__resetAccountEpochForTests(); account.noteResolvedOwner("account-a"); });

test("denied permission stays off and shows the approved explanation and explicit Settings action", async () => {
  const host = mount(); await host.flush(); host.press(); await host.flush();
  expect(host.row().props.vm).toMatchObject({ on: false, feedback: "secondb:planSuggestion.reminderDenied" });
  expect(nodes(host.card(), "Text").some(node => node.props.children === "secondb:planSuggestion.reminderDenied" && node.props.accessibilityRole === "alert")).toBe(true);
  // The reminder button keeps 「설정 열기」 (Q-261018-51 shortened only the chat notice button).
  expect(host.settingsLabel()).toBe("chatSaveNoticeOpenLabel");
  expect(host.openSettings).not.toHaveBeenCalled();
  (host.row().props.onPermissionSettings as () => void)(); await host.flush();
  expect(host.openSettings).toHaveBeenCalledTimes(1);
  host.unmount();
});

test.each(["error", "unavailable"] as const)("%s does not claim permission was denied or offer OS settings", async result => {
  const host = mount(); await host.flush(); host.enable.mockResolvedValueOnce(result);
  host.press(); await host.flush();
  expect(host.row().props.vm).toMatchObject({ on: false, feedback: result === "error" ? "common:errors.unknown" : "notOnThisDevice" });
  expect(host.row().props.onPermissionSettings).toBeUndefined();
  host.unmount();
});

test("two taps from one render invoke one operation; retry success removes the old denial", async () => {
  const host = mount(); await host.flush();
  const response = deferred<ReminderEnableResult>(); host.enable.mockReturnValueOnce(response.promise);
  const press = host.row().props.onToggle as () => void;
  press(); press(); expect(host.enable).toHaveBeenCalledTimes(1);
  response.resolve("denied"); await host.flush();
  host.enable.mockResolvedValueOnce("enabled"); host.press(); await host.flush();
  expect(host.row().props.vm).toMatchObject({ on: true, feedback: undefined });
  expect(host.row().props.onPermissionSettings).toBeUndefined();
  host.unmount();
});

test("a failed disable keeps the active schedule visible and reports an error", async () => {
  const host = mount(); await host.flush();
  host.enable.mockResolvedValueOnce("enabled"); host.press(); await host.flush();
  host.disable.mockRejectedValueOnce(new Error("native cancel failed")); host.press(); await host.flush();
  expect(host.disable).toHaveBeenCalledWith("account-a", "routine-a", { strict: true });
  expect(host.row().props.vm).toMatchObject({ on: true, feedback: "common:errors.unknown" });
  host.unmount();
});

test("account pre-transition and ABA hide previous denial and discard delayed responses and Settings callbacks", async () => {
  const host = mount(); await host.flush(); host.press(); await host.flush();
  const settings = host.row().props.onPermissionSettings as () => void;
  const response = deferred<ReminderEnableResult>(); host.enable.mockReturnValueOnce(response.promise);
  host.press();
  account.beginAccountOwnerTransition("account-b"); host.render(); settings();
  host.switchOwner("account-b"); host.switchOwner("account-a");
  response.resolve("denied"); await host.flush();
  expect(host.row().props.vm).toMatchObject({ feedback: undefined });
  expect(host.openSettings).not.toHaveBeenCalled();
  host.unmount();
});

test("Settings failure becomes a visible error without claiming the permission changed", async () => {
  const host = mount(); await host.flush(); host.press(); await host.flush();
  host.openSettings.mockRejectedValueOnce(new Error("no settings activity"));
  (host.row().props.onPermissionSettings as () => void)(); await host.flush();
  expect(host.row().props.vm).toMatchObject({ on: false, feedback: "common:errors.unknown" });
  host.unmount();
});

test("unmount discards a delayed permission response", async () => {
  const host = mount(); await host.flush();
  const response = deferred<ReminderEnableResult>(); host.enable.mockReturnValueOnce(response.promise);
  host.press(); host.unmount(); response.resolve("denied"); await host.flush();
  expect(host.row().props.vm).toMatchObject({ on: false, feedback: undefined });
});

test("a queued Settings tap does not open the OS after unmount", async () => {
  const host = mount(); await host.flush(); host.press(); await host.flush();
  (host.row().props.onPermissionSettings as () => void)();
  host.unmount(); await host.flush();
  expect(host.openSettings).not.toHaveBeenCalled();
});
