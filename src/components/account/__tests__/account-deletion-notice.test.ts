import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// Actual TSX/functions with a small synchronous hook host only. This is not a
// React scheduler, RN/browser renderer, or accessibility-tree test. No Auth,
// account API, storage, or network implementation is loaded: the panel is
// display-only and takes everything it shows through props (0217 - the receipt
// is the server's record; deletion-receipt-view.ts builds the notice).
type Props = Record<string, unknown>;
type Node = { type?: unknown; props?: Props };
type Notice = {
  opId: string | null;
  erasedAtIso: string | null;
  expiresAtIso: string | null;
  sweeps: {
    profileErased: boolean | null;
    deletionFenced: boolean | null;
    rawClippingsErased: boolean | null;
    rawClippingsEmptyAtCheck: boolean | null;
  } | null;
  unrecorded: boolean;
  localPurge: "complete" | "retry-scheduled" | "unconfirmed" | null;
  localSignOut: "complete" | "unconfirmed" | null;
};
const root = resolve(__dirname, "../../../..");
const OP = "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11";
const notice = (overrides: Partial<Notice> = {}): Notice => ({
  opId: OP,
  erasedAtIso: "2026-10-07T01:02:03.000Z",
  expiresAtIso: "2027-10-07T01:02:03.000Z",
  sweeps: {
    profileErased: true,
    deletionFenced: true,
    rawClippingsErased: false,
    rawClippingsEmptyAtCheck: false,
  },
  unrecorded: false,
  localPurge: "retry-scheduled",
  localSignOut: "complete",
  ...overrides,
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

function mountPanel(initial: Notice) {
  let current = initial;
  let cursor = 0;
  const state: unknown[] = [];
  const onClose = jest.fn();
  const hooks = {
    useState: (value: unknown) => {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = value;
      return [state[slot], (next: unknown) => { state[slot] = typeof next === "function" ? (next as (value: unknown) => unknown)(state[slot]) : next; }];
    },
  };
  const modules: Record<string, unknown> = {
    react: hooks, "react-i18next": { useTranslation: () => ({ t: translate, i18n: { language: "ko" } }) },
    "react-native": { View: "View", Pressable: "Pressable", StyleSheet: { create: (styles: unknown) => styles } },
    "@/components/ui/Text": { Text: "Text" },
    "@/components/m3": { MdButton: "MdButton", MdCard: "MdCard", m3TextStyle: () => ({}) },
    "@/lib/theme/m3": { m3: { spacing: { s2: 4, s3: 6, s4: 8 }, minTouch: 44 } },
    "@/lib/theme/ThemeContext": { ForceDark: "ForceDark" },
  };
  const module = { exports: {} as {
    AccountDeletionNoticePanel(props: { notice: Notice; onClose: () => void }): unknown;
  } };
  const source = readFileSync(resolve(__dirname, "../AccountDeletionNotice.tsx"), "utf8");
  new Function("require", "module", "exports", compile(source))((id: string) => {
    if (id === "react/jsx-runtime") return require(id);
    if (id in modules) return modules[id];
    throw new Error(`Unexpected notice dependency: ${id}`);
  }, module, module.exports);
  const render = () => {
    cursor = 0;
    return walk(module.exports.AccountDeletionNoticePanel({ notice: current, onClose }));
  };
  return {
    onClose, render,
    update: (value: Notice) => { current = value; return render(); },
    press: (testID: string) => { const button = render().find(node => node.props?.testID === testID); expect(button).toBeDefined(); (button!.props!.onPress as () => void)(); },
  };
}
const textKeys = (nodes: Node[]) => nodes.filter(node => node.type === "Text").map(node => node.props?.children);

test("the panel reads no store: everything it shows comes in as props", () => {
  const source = readFileSync(resolve(__dirname, "../AccountDeletionNotice.tsx"), "utf8");
  expect(source).not.toMatch(/useSyncExternalStore|deletion-completion|deletion-receipt-handoff/);
});

test("shows the receipt number with how long it can be looked up", () => {
  const screen = mountPanel(notice());
  const nodes = screen.render();
  expect(textKeys(nodes)).toEqual(expect.arrayContaining([
    "account.deletionReceipt.title", "account.deletionReceipt.receiptNumber", OP,
    "account.deletionReceipt.receiptNumberHint", "account.deletionReceipt.erasedAt",
  ]));
  expect(nodes.find(node => node.props?.testID === "account-deletion-receipt-number")?.props?.selectable).toBe(true);
  expect(textKeys(nodes)).not.toContain("account.deletionReceipt.noNumber");
});

test("a receipt the server cannot be read for right now still shows its number (gate DLR-A1-07)", () => {
  const screen = readFileSync(resolve(__dirname, "../AccountDeletionReceiptScreen.tsx"), "utf8").replace(/\r\n/g, "\n");
  const start = screen.indexOf('case "rate-limited":');
  const branch = screen.slice(start, screen.indexOf("break;", start));
  expect(branch).toContain('case "unavailable":');
  expect(branch).toMatch(/\{opId !== null \? \(/);
  expect(branch).toContain('t("account.deletionReceipt.receiptNumber")');
  expect(branch).toMatch(/<Text selectable testID="account-deletion-receipt-pending-number"[^>]*>\{opId\}<\/Text>/);
  // Shown only after the retry text and before the retry button, inside the same branch.
  expect(branch.indexOf("{opId}")).toBeLessThan(branch.indexOf('t("account.deletionReceipt.retry")'));
});

test("an old-flow deletion says it has no number instead of inventing one", () => {
  const screen = mountPanel(notice({ opId: null, erasedAtIso: null, expiresAtIso: null }));
  expect(textKeys(screen.render())).toContain("account.deletionReceipt.noNumber");
  expect(textKeys(screen.render())).not.toContain("account.deletionReceipt.receiptNumber");
});

test("details start collapsed and expose each remote observation without claiming universal erasure", () => {
  const screen = mountPanel(notice());
  expect(textKeys(screen.render())).not.toContain("account.deletionReceipt.profile");
  screen.press("account-deletion-details");
  expect(screen.render().find(node => node.props?.testID === "account-deletion-details")?.props?.accessibilityState).toEqual({ expanded: true });
  expect(screen.render().find(node => node.props?.testID === "account-deletion-details")?.props?.["aria-expanded"]).toBe(true);
  expect(textKeys(screen.render())).toEqual(expect.arrayContaining([
    "account.deletionReceipt.profile", "account.deletionReceipt.rawClippings", "account.deletionReceipt.observedAbsent",
    "account.deletionReceipt.deletionFence", "account.deletionReceipt.rawClippingsEmptyAtCheck",
    "account.deletionReceipt.proofConfirmed", "account.deletionReceipt.proofReportedFalse",
    "account.deletionReceipt.reportedUnfinished", "account.deletionReceipt.scope", "account.deletionReceipt.subscription", "account.deletionReceipt.support",
  ]));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render())).not.toContain("account.deletionReceipt.profile");
});

test("the fixed dark card keeps its text in the existing ForceDark subtree", () => {
  const screen = mountPanel(notice());
  expect(screen.render()[0].type).toBe("ForceDark");
  expect(screen.render()[1].type).toBe("MdCard");
});

test.each([[true, "observedAbsent"], [false, "reportedUnfinished"], [null, "notReported"]] as const)("preserves three-valued remote results: %s", (value, key) => {
  const screen = mountPanel(notice({ sweeps: {
    profileErased: value, deletionFenced: true, rawClippingsErased: value, rawClippingsEmptyAtCheck: true,
  } }));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render()).filter(text => text === `account.deletionReceipt.${key}`)).toHaveLength(2);
});

test.each([[true, "proofConfirmed"], [false, "proofReportedFalse"], [null, "notReported"]] as const)("shows three-valued completion proof: %s", (value, key) => {
  const screen = mountPanel(notice({ sweeps: {
    profileErased: true, deletionFenced: value, rawClippingsErased: false, rawClippingsEmptyAtCheck: value,
  } }));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render()).filter(text => text === `account.deletionReceipt.${key}`)).toHaveLength(2);
});

test("a receipt the server confirmed without its cleanup record says so", () => {
  const screen = mountPanel(notice({ unrecorded: true, sweeps: null }));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render())).toContain("account.deletionReceipt.unrecorded");
  expect(textKeys(screen.render())).not.toContain("account.deletionReceipt.profile");
});

test.each(["complete", "retry-scheduled", "unconfirmed"] as const)("local purge status is separate from confirmed account deletion: %s", localPurge => {
  const screen = mountPanel(notice({ localPurge }));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render())).toContain(`account.deletionReceipt.localPurge.${localPurge}`);
  expect(textKeys(screen.render())).toContain("account.deletionReceipt.title");
});

test("a receipt opened by number on another device shows no local results", () => {
  const screen = mountPanel(notice({ localPurge: null, localSignOut: null }));
  screen.press("account-deletion-details");
  const keys = textKeys(screen.render());
  expect(keys.some(key => typeof key === "string" && key.startsWith("account.deletionReceipt.localPurge."))).toBe(false);
  expect(keys.some(key => typeof key === "string" && key.startsWith("account.deletionReceipt.localSignOut."))).toBe(false);
});

test.each(["complete", "unconfirmed"] as const)("only close is offered and it asks nothing of the server: %s", localSignOut => {
  const screen = mountPanel(notice({ localSignOut }));
  expect(textKeys(screen.render())).toContain(`account.deletionReceipt.localSignOut.${localSignOut}`);
  const buttons = screen.render().filter(node => node.type === "MdButton");
  expect(buttons).toHaveLength(1);
  screen.press("account-deletion-dismiss");
  expect(screen.onClose).toHaveBeenCalledTimes(1);
});

test("five locales preserve subtree parity and three explicit English mirrors", () => {
  const subtree = (locale: string) => JSON.parse(readFileSync(resolve(root, `locales/${locale}/consent.json`), "utf8")).account.deletionReceipt;
  const keys = (value: Record<string, unknown>, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object" ? keys(child as Record<string, unknown>, `${prefix}${key}.`) : `${prefix}${key}`).sort();
  const en = subtree("en"); const ko = subtree("ko");
  expect(en.title).toBe("Account deletion confirmed"); expect(ko.title).toBe("계정 삭제를 확인했습니다");
  expect(keys(ko)).toEqual(keys(en));
  for (const locale of ["es", "id", "pt"]) expect(subtree(locale)).toEqual(en);
  expect(en.scope).toContain("at the time");
  expect(en.scope).toContain("Missing results do not confirm that a check occurred");
  expect(en.notReported).toBe("No usable result was returned for this check.");
  expect(ko.notReported).toBe("확인 가능한 결과가 응답에 없습니다.");
  expect(en.proofConfirmed).toBe("Confirmed by the server.");
  expect(ko.proofConfirmed).toBe("서버가 확인했습니다.");
  expect(en.proofReportedFalse).toBe("The server explicitly reported that this proof was not established.");
  expect(ko.proofReportedFalse).toBe("서버가 이 증명이 성립하지 않았다고 명시적으로 보고했습니다.");
  expect(en.localPurge["retry-scheduled"]).toContain("could not be confirmed");
  expect(en.localPurge["retry-scheduled"]).toContain("next app start");
  expect(ko.localPurge["retry-scheduled"]).toContain("다음 앱 시작");
  expect(en.localPurge["retry-scheduled"]).not.toContain("remains");
  expect(ko.localPurge["retry-scheduled"]).not.toContain("남아 있"); // both registers (10-02 B안)
  expect(en.support).toContain("kim0405@hayangzip.com");
  expect(ko.support).toContain("kim0405@hayangzip.com");
  // The receipt keys the 0217 screens read, with the date placeholder the hint needs.
  expect(en.receiptNumberHint).toContain("{{date}}");
  expect(ko.receiptNumberHint).toContain("{{date}}");
  // The retired sign-out "pending" state has no copy left to render.
  expect(en.localSignOut).not.toHaveProperty("pending");
  expect(en).not.toHaveProperty("dismissPendingHint");
});
