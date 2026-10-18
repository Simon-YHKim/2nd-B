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

/** The body of one exported function: from its declaration to the next top-level export. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

function parse(...parts: string[]): ts.SourceFile {
  return ts.createSourceFile(parts.join("/"), read(...parts), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** name -> module for every import in the file (default and named). */
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

/** The module whose default export the dashboard phone draws for `path`, read from the
 *  PHONE_ROUTE_SCREENS object literal by the TypeScript parser. */
function phoneScreenModule(path: string): string | null {
  const file = parse("src", "components", "dashboard", "phone-screens.tsx");
  let screen: string | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "PHONE_ROUTE_SCREENS" &&
        node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name) && property.name.text === path &&
            ts.isIdentifier(property.initializer)) screen = property.initializer.text;
      }
    }
    node.forEachChild(visit);
  };
  visit(file);
  if (screen === null) return null;
  const declaration = file.statements.find((statement): statement is ts.ImportDeclaration =>
    ts.isImportDeclaration(statement) && statement.importClause?.name?.text === screen);
  return declaration && ts.isStringLiteral(declaration.moduleSpecifier) ? declaration.moduleSpecifier.text : null;
}

/** `module#Name` for every imported component the file draws as a JSX tag. */
function drawnComponents(...parts: string[]): Set<string> {
  const file = parse(...parts);
  const imports = importsOf(file);
  const out = new Set<string>();
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && ts.isIdentifier(node.tagName)) {
      const from = imports.get(node.tagName.text);
      if (from) out.add(`${from}#${node.tagName.text}`);
    }
    node.forEachChild(visit);
  };
  visit(file);
  return out;
}

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

  // The route module, in turn, draws the screen that does the task (and reads the query).
  test.each([
    ["/data", "@/screens/deepspace/dds-data-screen#DeepSpaceDataScreen"],
    ["/privacy", "@/screens/deepspace/DeepSpaceDesignScreens#DeepSpacePrivacyDesignScreen"],
    ["/permissions", "@/screens/deepspace/DeepSpaceDesignScreens#DeepSpacePermissionsScreen"],
  ])("%s draws %s", (path, screen) => {
    expect([...drawnComponents("src", "app", `${path.slice(1)}.tsx`)]).toContain(screen);
  });

  test("the subscription route module is the subscription screen itself", () => {
    expect(read("src", "app", "subscription.tsx")).toContain("export default function SubscriptionScreen() {");
    expect(read("src", "app", "subscription.tsx")).toContain('{t("subscription.refund.title")}');
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
    const screen = read("src", "screens", "deepspace", "dds-data-screen.tsx");
    expect(screen).toContain("const { open } = useScreenParams<{ open?: string }>();");
    expect(screen).toContain("() => DATA_RIGHTS.find((item) => item.id === open)?.id ?? null,");
  });

  test("the privacy screen scrolls to its delete card for the delete button's query", () => {
    const [[name, value]] = Object.entries(splitPhoneRoute("/privacy?section=delete").params);
    const privacy = functionBody(read("src", "screens", "deepspace", "DeepSpaceDesignScreens.tsx"), "DeepSpacePrivacyDesignScreen");
    expect(privacy).toContain(`useStartAtEndWhen("${name}", "${value}")`);
    expect(privacy).toContain('t("account.delete")');
    // The hook reads the same params the phone hands over (and the page's own query outside it).
    expect(functionBody(read("src", "lib", "nav", "phone-embed.tsx"), "useStartAtEndWhen")).toContain(
      "const wanted = useScreenParams<Record<string, string>>()[name] === value;",
    );
  });
});

describe("notifications come only in the phone app", () => {
  test("the web build loads no notification module and the permissions rows are phone-only", () => {
    expect(loadNotifications()).toBeNull();
    const permissions = functionBody(read("src", "screens", "deepspace", "DeepSpaceDesignScreens.tsx"), "DeepSpacePermissionsScreen");
    expect(permissions).toContain('const native = Platform.OS !== "web";');
    expect(permissions).toContain('<PermissionRow kind="notif"');
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
    const screen = read("src", "app", "subscription.tsx");
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
