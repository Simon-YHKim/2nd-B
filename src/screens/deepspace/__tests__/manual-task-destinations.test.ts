// Z69 (Simon 2026-10-13 20:43, Q-261013-22): where the user guide's four common-task buttons land,
// and whether the answers say what those screens do.
//
// Review #2640 r1: checking that a route file exists and that a route string appears did not show
// that a button lands where its answer says. These run the parts that decide it: the phone keeps
// the query, the screen reads that query, the web build has no notification module, the refund
// screen explains its verdict, and the export file carries what it left out. Render tests are not
// available in this repo, so the two screen hooks are checked at their call sites.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }, useLocalSearchParams: () => ({}) }));
jest.mock("@/lib/supabase/client", () => {
  const invoke = jest.fn();
  return { getSupabaseClient: () => ({ functions: { invoke } }), __invoke: invoke };
});

import { requestAccountExport } from "@/lib/account/export";
import { refundReasonKey, type RefundStatus } from "@/lib/billing/subscription-manage";
import { splitPhoneRoute } from "@/lib/nav/phone-embed";
import { loadNotifications } from "@/lib/ops/notifications-sdk.web";

import { exportAccountData } from "../dds-account-actions";
import { DATA_RIGHTS } from "../dds-data-content";
import {
  filterManualTopics,
  manualTopicsFor,
  manualTopicsOn,
  visibleManualActions,
  type ManualTopic,
  type ManualTranslate,
} from "../dds-manual-content";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8").split("\r\n").join("\n");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const clientMock = require("@/lib/supabase/client") as { __invoke: jest.Mock };

function translatorFor(locale: string): ManualTranslate {
  const bundle: unknown = JSON.parse(read("locales", locale, "manual.json"));
  return (key) => {
    const value = key
      .replace(/^manual:/, "")
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
    if (typeof value !== "string") throw new Error(`${locale}/manual.json has no ${key}`);
    return value;
  };
}

function topic(locale: string, id: ManualTopic["id"]): ManualTopic {
  const found = manualTopicsFor(translatorFor(locale)).find((item) => item.id === id);
  if (!found) throw new Error(`no ${id} topic`);
  return found;
}

function parse(...parts: string[]): ts.SourceFile {
  return ts.createSourceFile(parts.join("/"), read(...parts), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

/** name -> module for the file's top-level imports (default and named). */
function importsOf(file: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const from = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause?.name) out.set(clause.name.text, from);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) out.set(element.name.text, from);
    }
  }
  return out;
}

/** A top-level function declaration: the file's `export default function`, or an exported one by name. */
function topFunction(file: ts.SourceFile, name: string): ts.FunctionDeclaration {
  const found = file.statements.filter((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.body !== undefined && hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
    (name === "default" ? hasModifier(statement, ts.SyntaxKind.DefaultKeyword) : statement.name?.text === name));
  expect({ name, count: found.length }).toEqual({ name, count: 1 });
  return found[0];
}

/** The expressions this function itself returns (returns inside nested functions are not its own). */
function ownReturns(fn: ts.FunctionLikeDeclaration): ts.Expression[] {
  const out: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
    node.forEachChild(visit);
  };
  visit(fn);
  return out;
}

/** JSX tag names inside an expression, not counting JSX built by nested functions. */
function jsxTags(expression: ts.Node): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && ts.isIdentifier(node.tagName)) out.push(node.tagName.text);
    node.forEachChild(visit);
  };
  visit(expression);
  return out;
}

/** The text of what the function returns: the screen it actually draws. */
const returnedText = (fn: ts.FunctionDeclaration): string => ownReturns(fn).map((e) => e.getText()).join("\n");

/** Statements directly in the function body (not inside callbacks or branches). */
const ownStatements = (fn: ts.FunctionDeclaration): string[] => (fn.body?.statements ?? []).map((st) => st.getText());

/** `module#Name` for the imported components the route module's default export returns. */
function routeDraws(path: string): string[] {
  const file = parse("src", "app", `${path.slice(1)}.tsx`);
  const imports = importsOf(file);
  return ownReturns(topFunction(file, "default"))
    .flatMap((expression) => jsxTags(expression))
    .filter((tag) => imports.has(tag))
    .map((tag) => `${imports.get(tag)}#${tag}`);
}

/** The module whose default export the dashboard phone draws for `path`: the top-level
 *  PHONE_ROUTE_SCREENS object literal, its one property for `path`, and the top-level default
 *  import that property names. */
function phoneScreenModule(path: string): string | null {
  const file = parse("src", "components", "dashboard", "phone-screens.tsx");
  const table = file.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "PHONE_ROUTE_SCREENS");
  expect(table).toHaveLength(1);
  const literal = table[0].initializer;
  if (!literal || !ts.isObjectLiteralExpression(literal)) return null;
  const entries = literal.properties.filter((property): property is ts.PropertyAssignment =>
    ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name) && property.name.text === path);
  if (entries.length !== 1 || !ts.isIdentifier(entries[0].initializer)) return null;
  const screen = entries[0].initializer.text;
  const declaration = file.statements.find((statement): statement is ts.ImportDeclaration =>
    ts.isImportDeclaration(statement) && statement.importClause?.name?.text === screen && !statement.importClause.isTypeOnly);
  return declaration && ts.isStringLiteral(declaration.moduleSpecifier) ? declaration.moduleSpecifier.text : null;
}

/** `const <binding> = <callee>(...)` written directly in the function body (not in a callback or a branch). */
function directCalls(fn: ts.FunctionDeclaration, callee: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  for (const statement of fn.body?.statements ?? []) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer;
      if (init && ts.isCallExpression(init) && ts.isIdentifier(init.expression) && init.expression.text === callee) out.push(init);
    }
  }
  return out;
}

const stringArgs = (call: ts.CallExpression): (string | null)[] =>
  call.arguments.map((arg) => (ts.isStringLiteral(arg) ? arg.text : null));

/** Visit the function's own returned trees, not descending into nested functions. */
function walkReturned(fn: ts.FunctionDeclaration, visit: (node: ts.Node) => void): void {
  const walk = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    visit(node);
    node.forEachChild(walk);
  };
  for (const expression of ownReturns(fn)) walk(expression);
}

/** JSX attributes in the returned tree whose value is exactly `{name}`. */
function attributesBoundTo(fn: ts.FunctionDeclaration, name: string): string[] {
  const out: string[] = [];
  walkReturned(fn, (node) => {
    if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer) &&
        node.initializer.expression && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === name) {
      out.push(node.name.getText());
    }
  });
  return out;
}

/** Elements in the returned tree whose onPress is `() => router.push("<route>")`, as attribute name -> value text. */
function rowsOpening(fn: ts.FunctionDeclaration, route: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  walkReturned(fn, (node) => {
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return;
    const attributes: Record<string, string> = {};
    let opens = false;
    for (const attribute of node.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
      attributes[attribute.name.getText()] = attribute.initializer.getText();
      const value = ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
      if (attribute.name.getText() === "onPress" && value && ts.isArrowFunction(value) && ts.isCallExpression(value.body) &&
          value.body.expression.getText() === "router.push" && value.body.arguments.length === 1 &&
          ts.isStringLiteral(value.body.arguments[0]) && value.body.arguments[0].text === route) opens = true;
    }
    if (opens) out.push(attributes);
  });
  return out;
}

const DESIGN_SCREENS = ["src", "screens", "deepspace", "DeepSpaceDesignScreens.tsx"] as const;

const TASKS = [
  { id: "refund", route: "/subscription", path: "/subscription", params: {} },
  { id: "export", route: "/data?open=account-export", path: "/data", params: { open: "account-export" } },
  { id: "deleteAccount", route: "/privacy?section=delete", path: "/privacy", params: { section: "delete" } },
  { id: "notifications", route: "/permissions", path: "/permissions", params: {} },
] as const;

describe("each task button reaches its screen, as a page and inside the dashboard phone", () => {
  test.each(TASKS)("$id: $route", ({ id, route, path, params }) => {
    expect(topic("en", id).actions.map((action) => action.route)).toEqual([route]);
    expect(existsSync(join(ROOT, "src", "app", `${path.slice(1)}.tsx`))).toBe(true);
    // Inside the phone the guide pushes the whole route; the phone splits it and keeps the query.
    expect(splitPhoneRoute(route)).toEqual({ path, params });
    // ...and draws the same route module the page uses, not some other screen.
    expect(phoneScreenModule(path)).toBe(`@/app${path}`);
  });

  // The route module's default export, in turn, returns the screen that does the task.
  test.each([
    ["/data", "@/screens/deepspace/dds-data-screen#DeepSpaceDataScreen"],
    ["/privacy", "@/screens/deepspace/DeepSpaceDesignScreens#DeepSpacePrivacyDesignScreen"],
    ["/permissions", "@/screens/deepspace/DeepSpaceDesignScreens#DeepSpacePermissionsScreen"],
  ])("%s returns %s", (path, screen) => {
    expect(routeDraws(path)).toContain(screen);
  });

  test("the subscription route's default export returns the refund block itself", () => {
    const fn = topFunction(parse("src", "app", "subscription.tsx"), "default");
    expect(returnedText(fn)).toContain('{t("subscription.refund.title")}');
  });

  test("the phone hands the query to the screen it opens", () => {
    expect(read("src", "components", "dashboard", "DashboardPhone.tsx")).toContain(
      'params: splitPhoneRoute(insideRoute ?? "").params,',
    );
    expect(read("src", "lib", "nav", "phone-embed.tsx")).toContain("return (embed ? embed.params : local) as Partial<T>;");
  });

  test("My data opens the export card for the export button's query", () => {
    const open = splitPhoneRoute("/data?open=account-export").params.open;
    expect(DATA_RIGHTS.find((item) => item.id === open)?.id).toBe("account-export");
    const screen = topFunction(parse("src", "screens", "deepspace", "dds-data-screen.tsx"), "DeepSpaceDataScreen");
    // The query is read directly in the screen body ...
    const params = directCalls(screen, "useScreenParams");
    expect(params.map((call) => (call.parent as ts.VariableDeclaration).name.getText())).toEqual(["{ open }"]);
    // ... and the card list's open card starts as the one the query names.
    const opened = directCalls(screen, "useState").filter((call) => {
      const first = call.arguments[0];
      return first !== undefined && ts.isArrowFunction(first) &&
        first.body.getText() === "DATA_RIGHTS.find((item) => item.id === open)?.id ?? null";
    });
    expect(opened).toHaveLength(1);

    // Review #2640 r5: that state has to be what the card list draws. Take the state and its setter
    // from that one useState, then follow the screen's returned DATA_RIGHTS.map callback: each card
    // decides `expanded` from that state, its header toggles it with that setter, and its detail is
    // folded away unless `expanded`.
    const binding = (opened[0].parent as ts.VariableDeclaration).name;
    expect(ts.isArrayBindingPattern(binding)).toBe(true);
    const [state, setter] = (binding as ts.ArrayBindingPattern).elements.map((element) => element.getText());
    expect([state, setter]).toEqual(["expandedId", "setExpandedId"]);

    const callbacks: ts.ArrowFunction[] = [];
    walkReturned(screen, (node) => {
      if (ts.isCallExpression(node) && node.expression.getText() === "DATA_RIGHTS.map" && node.arguments.length === 1 &&
          ts.isArrowFunction(node.arguments[0])) callbacks.push(node.arguments[0]);
    });
    expect(callbacks).toHaveLength(1);
    const card = callbacks[0];
    const item = card.parameters[0].name.getText();
    const statements = ts.isBlock(card.body) ? card.body.statements : ts.factory.createNodeArray<ts.Statement>([]);
    const expandedFrom = statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => [...statement.declarationList.declarations])
      .filter((declaration) => declaration.name.getText() === "expanded")
      .map((declaration) => declaration.initializer?.getText());
    expect(expandedFrom).toEqual([`${item}.id === ${state}`]);

    const cardTree = ownReturns(card).map((expression) => expression.getText()).join("\n");
    expect(cardTree).toContain(`onPress={() => ${setter}(expanded ? null : ${item}.id)}`);
    expect(cardTree).toContain("style={[styles.detailSurface, !expanded && styles.detailFolded]}");
    expect(cardTree).toContain(`{${item}.id === "account-export" ? (`);
    expect(cardTree).toContain("<AccountExportPanel />");
  });

  test("the privacy screen scrolls to its delete card for the delete button's query", () => {
    const [[name, value]] = Object.entries(splitPhoneRoute("/privacy?section=delete").params);
    const privacy = topFunction(parse(...DESIGN_SCREENS), "DeepSpacePrivacyDesignScreen");
    // Called directly in the screen body with the query's own name and value, and the screen's
    // returned tree scrolls with what it gives back.
    const calls = directCalls(privacy, "useStartAtEndWhen").filter((call) => {
      const args = stringArgs(call);
      return args.length === 2 && args[0] === name && args[1] === value;
    });
    expect(calls).toHaveLength(1);
    const binding = (calls[0].parent as ts.VariableDeclaration).name.getText();
    expect(attributesBoundTo(privacy, binding)).toEqual(["scroll"]);
    expect(returnedText(privacy)).toContain('{t("account.delete")}');
    expect(returnedText(privacy)).toContain('{t("privacy.deleteAccount.body")}');
    // The hook reads the same params the phone hands over (and the page's own query outside it).
    const hook = topFunction(parse("src", "lib", "nav", "phone-embed.tsx"), "useStartAtEndWhen");
    expect(ownStatements(hook)).toContain("const wanted = useScreenParams<Record<string, string>>()[name] === value;");
  });

  // The answer names the other way to the same card: Settings, then Account, then Delete account.
  test("Settings opens the account screen, whose delete row is the guide's delete button", () => {
    // Rows the exported screens actually return (rows in an unused function do not count).
    const settings = topFunction(parse("src", "app", "settings.tsx"), "default");
    expect(rowsOpening(settings, "/account").map((row) => row.label)).toEqual(['{t("nav.account")}']);
    const account = topFunction(parse("src", "screens", "deepspace", "dds-account-screen.tsx"), "DeepSpaceAccountScreen");
    const deleteRows = rowsOpening(account, "/privacy?section=delete");
    expect(deleteRows.map((row) => row.accessibilityLabel)).toEqual(['{t("deepspace:account.delete")}']);
    expect(topic("en", "deleteAccount").actions.map((action) => action.route)).toEqual(["/privacy?section=delete"]);
  });
});

describe("notifications come only in the phone app", () => {
  test("the web build loads no notification module and the permissions rows are phone-only", () => {
    expect(loadNotifications()).toBeNull();
    const permissions = topFunction(parse(...DESIGN_SCREENS), "DeepSpacePermissionsScreen");
    expect(ownStatements(permissions)).toContain('const native = Platform.OS !== "web";');
    expect(returnedText(permissions)).toMatch(/\{native \? \(\s*<Card>\s*<PermissionRow kind="notif"/);
  });

  test("on the web the notifications answer has no button; the other three keep theirs", () => {
    for (const { id, route } of TASKS) {
      const actions = topic("ko", id).actions;
      expect(visibleManualActions(actions, "android").map((action) => action.route)).toEqual([route]);
      expect(visibleManualActions(actions, "ios").map((action) => action.route)).toEqual([route]);
      expect(visibleManualActions(actions, "web").map((action) => action.route)).toEqual(id === "notifications" ? [] : [route]);
    }
    // Every other guide button stays on the web.
    for (const item of manualTopicsFor(translatorFor("en")).filter(({ id }) => id !== "notifications")) {
      expect(visibleManualActions(item.actions, "web")).toEqual(item.actions);
    }
  });

  // Review #2640 r2: the label of a button left out on the web must not match a search there.
  test("a button left out on the web is not searchable there; on a phone it is", () => {
    for (const [locale, label] of [["ko", "권한 관리"], ["en", "Manage permissions"]] as const) {
      const topics = manualTopicsFor(translatorFor(locale));
      expect(filterManualTopics(manualTopicsOn(topics, "web"), label).map(({ id }) => id)).toEqual([]);
      expect(filterManualTopics(manualTopicsOn(topics, "android"), label).map(({ id }) => id)).toEqual(["notifications"]);
    }
    // The question itself still finds the topic on the web.
    const ko = manualTopicsOn(manualTopicsFor(translatorFor("ko")), "web");
    expect(filterManualTopics(ko, "알림").map(({ id }) => id)).toEqual(["notifications"]);
    expect(ko.find(({ id }) => id === "notifications")?.actions).toEqual([]);
  });

  const WEB_SENTENCE: Record<(typeof LOCALES)[number], string> = {
    en: "The web version sends no notifications.",
    ko: "웹에서는 알림이 오지 않습니다.",
    es: "La versión web no envía notificaciones.",
    pt: "A versão web não envia notificações.",
    id: "Versi web tidak mengirim notifikasi.",
  };
  test.each(LOCALES)("%s: the answer ends by saying the web sends none", (locale) => {
    expect(topic(locale, "notifications").answer.endsWith(WEB_SENTENCE[locale])).toBe(true);
  });
});

describe("what the answers say the screens do", () => {
  // "If you have a payment, that screen shows whether you can get a refund right now, and why."
  test("with a payment, the subscription screen shows the verdict and its reason in every locale", () => {
    const withPayment: RefundStatus[] = ["eligible", "refund_already_requested", "used_beyond_free", "window_passed", "unknown"];
    for (const locale of LOCALES) {
      const reasons = (JSON.parse(read("locales", locale, "settings.json")) as {
        subscription: { refund: { reason: Record<string, string> } };
      }).subscription.refund.reason;
      for (const status of withPayment) {
        expect({ locale, status, reason: (reasons[refundReasonKey(status)] ?? "").length > 0 }).toEqual({ locale, status, reason: true });
      }
    }
    const screen = returnedText(topFunction(parse("src", "app", "subscription.tsx"), "default"));
    const gate = screen.indexOf('{eligibility && eligibility.status !== "no_payment" ? (');
    const reason = screen.indexOf("{t(`subscription.refund.reason.${reasonKey}`, {");
    expect(gate).toBeGreaterThan(-1);
    expect(reason).toBeGreaterThan(gate);
  });

  // "The file also lists what it leaves out and why." The export refuses a bundle without that list,
  // and the file it hands over is the bundle as received.
  test("the export file carries what it left out and why", async () => {
    const bundle = {
      kind: "2nd-b-account-export",
      schema_version: 1,
      exported_at: "2026-10-19T00:00:00.000Z",
      user_id: "user-a",
      tables: { users: {} },
      storage: [],
      excluded: { ai_audit_log: "hashes only" },
      errors: {},
    };
    clientMock.__invoke.mockResolvedValueOnce({ data: bundle, error: null });
    let written = "";
    const result = await exportAccountData({
      requestAccountExport: () => requestAccountExport(),
      buildExportFilename: () => "account.json",
      deliver: async (json) => {
        written = json;
      },
      expectedUserId: "user-a",
      isActive: () => true,
    });
    expect(result.status).toBe("done");
    expect((JSON.parse(written) as { excluded: Record<string, string> }).excluded).toEqual({ ai_audit_log: "hashes only" });

    const { excluded: _dropped, ...withoutList } = bundle;
    clientMock.__invoke.mockResolvedValueOnce({ data: withoutList, error: null });
    await expect(requestAccountExport()).rejects.toThrow();
  });
});

describe("the answers use the names the screens show", () => {
  type Bundle = Record<string, unknown>;
  const at = (bundle: Bundle, path: string): string => {
    const value = path.split(".").reduce<unknown>((node, part) => (node as Bundle)?.[part], bundle);
    if (typeof value !== "string") throw new Error(`no ${path}`);
    return value;
  };

  test.each(LOCALES)("%s", (locale) => {
    const settings = JSON.parse(read("locales", locale, "settings.json")) as Bundle;
    const deepspace = JSON.parse(read("locales", locale, "deepspace.json")) as Bundle;
    expect(topic(locale, "refund").answer).toContain(at(settings, "subscription.rowLabel"));
    expect(topic(locale, "export").answer).toContain(at(settings, "nav.data"));
    expect(topic(locale, "deleteAccount").answer).toContain(at(settings, "nav.account"));
    expect(topic(locale, "deleteAccount").answer).toContain(at(deepspace, "account.delete"));
    expect(topic(locale, "notifications").answer).toContain(at(settings, "permissions"));
    const settingsName = at(settings, "settings");
    for (const id of ["refund", "export", "deleteAccount", "notifications"] as const) {
      expect({ locale, id, settings: topic(locale, id).answer.includes(settingsName) }).toEqual({ locale, id, settings: true });
    }
  });

  // "Deleting cannot be undone": the delete card the button lands on says so in the same words,
  // in every locale.
  const CANNOT_UNDO: Record<(typeof LOCALES)[number], string> = {
    en: "cannot be undone",
    ko: "되돌릴 수 없",
    es: "No se puede deshacer",
    pt: "Não dá para desfazer",
    id: "tidak bisa dibatalkan",
  };
  test.each(LOCALES)("%s: the delete answer and the delete card both say it cannot be undone", (locale) => {
    const deepspace = JSON.parse(read("locales", locale, "deepspace.json")) as Bundle;
    expect(at(deepspace, "privacy.deleteAccount.body")).toContain(CANNOT_UNDO[locale]);
    expect(topic(locale, "deleteAccount").answer).toContain(CANNOT_UNDO[locale]);
  });
});
