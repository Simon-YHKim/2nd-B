import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { receiptScreenView } from "@/lib/account/deletion-receipt-view";
import { parseAccountDeletedParams, type ReceiptLookup } from "@/lib/account/deletion-receipt";
import { localDeletionOutcomeFor, type LocalDeletionOutcome } from "@/lib/account/deletion-local-outcome";

// Actual TSX/functions with a small synchronous hook host only.
// This is not a React scheduler, RN/browser renderer, or accessibility-tree test.
// No Auth, account API, storage, or network implementation is loaded.
//
// 2026-10-05 (Simon decision Q-261004-42 = A): the panel is no longer fed by an
// in-memory notice store that the sign-in screen read. It renders only on the
// /account-deleted route, from the SERVER receipt fetched by the number in the
// URL. The sign-in screen draws no receipt at all (deletion-receipt-published
// test pins that), so the old "receipt outranks both guest guards" case is gone
// with the store it described.
type Props = Record<string, unknown>;
type Node = { type?: unknown; props?: Props };
type Notice = {
  receiptId: string | null;
  erasedAtIso: string | null;
  expiresAtIso: string | null;
  receipt: {
    profileErased: boolean | null;
    deletionFenced: boolean | null;
    rawClippingsErased: boolean | null;
    rawClippingsEmptyAtCheck: boolean | null;
  } | null;
  localPurge: "complete" | "retry-scheduled" | "unconfirmed" | null;
  localSignOut: "complete" | "unconfirmed" | null;
};
const RECEIPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const root = resolve(__dirname, "../../../..");
const notice = (overrides: Partial<Notice> = {}): Notice => ({
  receiptId: RECEIPT_ID,
  erasedAtIso: "2026-10-05T12:00:00.000Z",
  expiresAtIso: "2027-10-05T12:00:00.000Z",
  receipt: {
    profileErased: true,
    deletionFenced: true,
    rawClippingsErased: false,
    rawClippingsEmptyAtCheck: false,
  },
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
    react: hooks, "react-i18next": { useTranslation: () => ({ t: translate, i18n: { language: "en" } }) },
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
const texts = (nodes: Node[]) => nodes.filter(node => node.type === "Text").map(node => node.props?.children);

test("the module no longer holds a notice store or a store hook", () => {
  const source = readFileSync(resolve(__dirname, "../AccountDeletionNotice.tsx"), "utf8");
  expect(source).not.toMatch(/useSyncExternalStore|useAccountDeletionNotice|getAccountDeletionNotice|dismissAccountDeletionNotice/);
});

test("details start collapsed and expose each remote observation without claiming universal erasure", () => {
  const screen = mountPanel(notice());
  expect(textKeys(screen.render())).toContain("account.deletionReceipt.title");
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

test("the receipt number is shown selectable with its keep-until hint", () => {
  const nodes = mountPanel(notice()).render();
  const idRow = nodes.find(node => node.props?.testID === "account-deletion-receipt-id");
  expect(idRow).toBeDefined();
  const idText = nodes.find(node => node.type === "Text" && node.props?.children === RECEIPT_ID);
  expect(idText?.props?.selectable).toBe(true);
  expect(texts(nodes)).toContain("account.deletionReceipt.receiptNumberHint");
  expect(texts(nodes)).toContain("account.deletionReceipt.erasedAt");
});

test("a confirmed erasure without a server receipt says so instead of inventing a number", () => {
  const nodes = mountPanel(notice({ receiptId: null, receipt: null, erasedAtIso: null, expiresAtIso: null })).render();
  expect(texts(nodes)).toContain("account.deletionReceipt.notRecorded");
  expect(texts(nodes)).not.toContain("account.deletionReceipt.body");
  expect(nodes.find(node => node.props?.testID === "account-deletion-receipt-id")).toBeUndefined();
});

test("the fixed dark card keeps its text in the existing ForceDark subtree", () => {
  const screen = mountPanel(notice());
  expect(screen.render()[0].type).toBe("ForceDark");
  expect(screen.render()[1].type).toBe("MdCard");
});

test.each([[true, "observedAbsent"], [false, "reportedUnfinished"], [null, "notReported"]] as const)("preserves three-valued remote results: %s", (value, key) => {
  const screen = mountPanel(notice({ receipt: {
    profileErased: value, deletionFenced: true,
    rawClippingsErased: value, rawClippingsEmptyAtCheck: true,
  } }));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render()).filter(text => text === `account.deletionReceipt.${key}`)).toHaveLength(2);
});

test.each([[true, "proofConfirmed"], [false, "proofReportedFalse"], [null, "notReported"]] as const)("shows three-valued completion proof: %s", (value, key) => {
  const screen = mountPanel(notice({ receipt: {
    profileErased: true, deletionFenced: value,
    rawClippingsErased: false, rawClippingsEmptyAtCheck: value,
  } }));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render()).filter(text => text === `account.deletionReceipt.${key}`)).toHaveLength(2);
});

test.each(["complete", "retry-scheduled", "unconfirmed"] as const)("local purge status is separate from confirmed account deletion: %s", localPurge => {
  const screen = mountPanel(notice({ localPurge }));
  screen.press("account-deletion-details");
  expect(textKeys(screen.render())).toContain(`account.deletionReceipt.localPurge.${localPurge}`);
  expect(textKeys(screen.render())).toContain("account.deletionReceipt.title");
});

test("a receipt opened by number on another device shows no local observations", () => {
  const screen = mountPanel(notice({ localPurge: null, localSignOut: null }));
  screen.press("account-deletion-details");
  const keys = textKeys(screen.render()).map(String);
  expect(keys.some(key => key.startsWith("account.deletionReceipt.localPurge."))).toBe(false);
  expect(keys.some(key => key.startsWith("account.deletionReceipt.localSignOut."))).toBe(false);
});

test.each(["complete", "unconfirmed"] as const)("only one close action is offered and it never requests deletion again: %s", localSignOut => {
  const screen = mountPanel(notice({ localSignOut }));
  expect(textKeys(screen.render())).toContain(`account.deletionReceipt.localSignOut.${localSignOut}`);
  const buttons = screen.render().filter(node => node.type === "MdButton");
  expect(buttons).toHaveLength(1);
  expect(buttons[0].props?.disabled).toBeUndefined();
  screen.press("account-deletion-dismiss");
  expect(screen.onClose).toHaveBeenCalledTimes(1);
});

describe("/account-deleted shows a receipt only while nobody is signed in", () => {
  const found: ReceiptLookup = {
    status: "found",
    receipt: {
      id: RECEIPT_ID,
      erasedAtIso: "2026-10-05T12:00:00.000Z",
      expiresAtIso: "2027-10-05T12:00:00.000Z",
      sweeps: {
        profile_erased: true,
        deletion_fenced: true,
        raw_clippings_erased: true,
        raw_clippings_empty_at_check: true,
        record_photos_erased: true,
        record_photos_empty_at_check: true,
      },
      sweepsReported: true,
    },
  };
  const OWNER = "11111111-1111-4111-8111-111111111111";
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const OP = "33333333-3333-4333-8333-333333333333";
  // This device's one-time outcome for the deletion it just finished
  // (deletion-local-outcome.ts). URL values never stand in for it.
  const outcome = (overrides: Partial<LocalDeletionOutcome> = {}): LocalDeletionOutcome => ({
    token: OP, owner: OWNER, receiptId: RECEIPT_ID, localPurge: "complete", localSignOut: "complete", ...overrides,
  });
  const fromDeletion = parseAccountDeletedParams({ receipt: RECEIPT_ID, op: OP });
  const byNumber = parseAccountDeletedParams({ receipt: RECEIPT_ID });
  const base = {
    authLoading: false,
    userId: null as string | null,
    sessionUnavailable: false,
    transitionPending: false,
    params: fromDeletion,
    local: outcome() as LocalDeletionOutcome | null,
    lookup: found as ReceiptLookup | null,
  };

  test("signed out with a found receipt renders it", () => {
    const view = receiptScreenView(base);
    expect(view.kind).toBe("receipt");
    if (view.kind !== "receipt") return;
    expect(view.notice.receiptId).toBe(RECEIPT_ID);
    expect(view.notice.receipt).toEqual({
      profileErased: true, deletionFenced: true, rawClippingsErased: true, rawClippingsEmptyAtCheck: true,
    });
    expect(view.notice.localPurge).toBe("complete");
  });

  test.each([
    // The flow opens this route before its sign-out lands, so the deleted
    // account waits; anyone else signed in only gets a way back into the app.
    ["the deleted account before its sign-out lands", { userId: OWNER, local: outcome({ localSignOut: null }) }, "waiting"],
    ["any other signed-in account (B after a switch), fresh deletion", { userId: OTHER }, "signed-in"],
    ["any signed-in account opening a number by hand", { userId: OTHER, params: byNumber, local: null }, "signed-in"],
    ["a held owner transition (DEL-N2-01)", { transitionPending: true }, "waiting"],
    ["auth still resolving", { authLoading: true }, "waiting"],
    // UNKNOWN is not signed out (DEL2-R1-01 / D2A-05): AuthContext publishes
    // userId null with sessionUnavailable true when it never learned the session.
    ["an unknown session state", { sessionUnavailable: true }, "session-unknown"],
    ["an unknown session state, number opened by hand", { sessionUnavailable: true, params: byNumber, local: null }, "session-unknown"],
  ] as const)("%s never sees the receipt", (_label, overrides, kind) => {
    const view = receiptScreenView({ ...base, ...overrides });
    expect(view.kind).toBe(kind);
    expect(view.kind).not.toBe("receipt");
  });

  test("a failed sign-out of the deleted account is said plainly, not waited on forever (D2A-07)", () => {
    expect(receiptScreenView({ ...base, userId: OWNER, local: outcome({ localSignOut: "unconfirmed" }) }).kind)
      .toBe("signout-unconfirmed");
    // The same outcome never speaks to another account.
    expect(receiptScreenView({ ...base, userId: OTHER, local: outcome({ localSignOut: "unconfirmed" }) }).kind)
      .toBe("signed-in");
  });

  test("a number opened later shows the server receipt without local claims", () => {
    const view = receiptScreenView({ ...base, params: byNumber, local: null });
    expect(view.kind === "receipt" && view.notice.localPurge).toBeNull();
    expect(view.kind === "receipt" && view.notice.localSignOut).toBeNull();
  });

  test.each([
    [{ status: "not-found" } as ReceiptLookup, "not-found"],
    [{ status: "unavailable" } as ReceiptLookup, "unavailable"],
    [null, "loading"],
  ] as const)("lookup %p maps to %s, never to a receipt", (lookup, kind) => {
    expect(receiptScreenView({ ...base, lookup }).kind).toBe(kind);
  });

  test("no number: only this device's finished deletion says no receipt was recorded", () => {
    const noNumber = receiptScreenView({
      ...base,
      params: parseAccountDeletedParams({ op: OP }),
      local: outcome({ receiptId: null, localPurge: "unconfirmed" }),
      lookup: null,
    });
    expect(noNumber.kind === "receipt" && noNumber.notice.receiptId).toBeNull();
    expect(noNumber.kind === "receipt" && noNumber.notice.receipt).toBeNull();
    expect(noNumber.kind === "receipt" && noNumber.notice.localPurge).toBe("unconfirmed");
    expect(receiptScreenView({ ...base, params: parseAccountDeletedParams({}), local: null, lookup: null }).kind).toBe("lookup");
  });

  test("a forged or copied link carries no claim (DEL2-R1-05 / D2A-06)", () => {
    // The exact URL the gate used: no number, done/local/signout all "complete".
    const forged = parseAccountDeletedParams({ done: "1", local: "complete", signout: "complete" });
    expect(receiptScreenView({ ...base, params: forged, local: null, lookup: null }).kind).toBe("lookup");
    // A token that is not this device's outcome, or a token moved to another
    // receipt number, never borrows the local results.
    expect(localDeletionOutcomeFor(outcome(), parseAccountDeletedParams({ receipt: RECEIPT_ID, op: OTHER }))).toBeNull();
    expect(localDeletionOutcomeFor(outcome(), parseAccountDeletedParams({ receipt: OTHER, op: OP }))).toBeNull();
    expect(localDeletionOutcomeFor(outcome(), parseAccountDeletedParams({ receipt: RECEIPT_ID }))).toBeNull();
    expect(localDeletionOutcomeFor(null, fromDeletion)).toBeNull();
    expect(localDeletionOutcomeFor(outcome(), fromDeletion)).toEqual(outcome());
    // Another device's receipt number with a valid token from this device shows
    // the server receipt only.
    const elsewhere = receiptScreenView({ ...base, params: parseAccountDeletedParams({ receipt: RECEIPT_ID, op: OTHER }), local: null });
    expect(elsewhere.kind === "receipt" && elsewhere.notice.localPurge).toBeNull();
  });

  test("untrusted route params never become claims", () => {
    expect(parseAccountDeletedParams({ receipt: "not-a-number", op: "x", local: "everything", signout: "yes", done: "true" })).toEqual({
      receiptId: null, op: null,
    });
  });
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
  // The pending sign-out state belonged to the in-memory hand-off; the route opens after sign-out.
  expect(en.localSignOut.pending).toBeUndefined();
  expect(en.dismissPendingHint).toBeUndefined();
  // The receipt carries no account details, and the copy must not claim otherwise.
  expect(en.receiptNumberHint).toContain("{{date}}");
  expect(ko.receiptNumberHint).toContain("{{date}}");
  expect(en.receiptNumberHint).toContain("no account details");
  expect(ko.receiptNumberHint).toContain("계정 정보가 들어 있지 않습니다");
});
