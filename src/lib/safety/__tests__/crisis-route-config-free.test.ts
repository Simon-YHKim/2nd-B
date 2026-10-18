// The shared crisis route reads no configuration (Simon 2026-10-18 12:00, Q-261018-48 가).
//
// 「위기 판정부터 안내까지를 설정을 안 읽는 별도 파일로 옮기고(동작은 그대로), 시험은 그 파일이 설정에
// 닿는 import 가 없는지 + 위기면 바로 그 결과를 돌려주는지만 본다.」
//
// Background: #2611 tried to fence one function inside boundary.ts (a file that reads settings by design);
// three review rounds each found a way one layer further out. Here the route lives in its own file instead,
// so the check is about that file's inputs, not about every line around it:
//
//  A. Imports. The runtime import closure of src/lib/safety/crisis-route.ts is walked by resolving every
//     specifier (relative and "@/"), following re-exports, ignoring only `import type` / `export type`.
//     It must equal the pinned set below and must not contain a known configuration module or any package.
//     Dynamic import(), require(), `import x = require()` and import.meta are refused in every closure file.
//  B. Host globals. No closure file may reference process, globalThis, window, etc., may use `declare`
//     (an ambient declaration would hide a host global from A), or may carry an EXPO_PUBLIC_ name in a string.
//  C. Surface. crisis-route.ts exports only functions (plus types), has no top-level let/var, and its
//     exported function signatures are pinned: a new parameter is the other way a setting could ride in.
//  D. Behaviour. Every entry point (the four boundary re-exports, callLlm's input gate, and callLlm's two
//     proxy-422 paths) returns the crisis guidance while every configuration read is recorded and throws:
//     getEnv(), any property of the env object, and any process.env.EXPO_PUBLIC_* read. For the proxy paths
//     reads are armed at the moment the proxy rejects, since choosing the proxy legitimately reads settings.
// The mutation block feeds altered sources to A to C so each rule is shown to fail where it should.
import { existsSync, readFileSync } from "fs";
import { posix, resolve } from "path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const ENTRY = "src/lib/safety/crisis-route.ts";

// The whole runtime closure, pinned. A new import changes this set and fails here, so it is seen in review.
const PINNED_CLOSURE = [
  "src/lib/async/abort.ts",
  "src/lib/safety/classifier.ts",
  "src/lib/safety/crisis-context.ts",
  "src/lib/safety/crisis-language.ts",
  "src/lib/safety/crisis-route.ts",
  "src/lib/safety/emergency-routing.ts",
  "src/lib/safety/lexicon.ts",
];

// Explicitly forbidden even if someone also edits PINNED_CLOSURE: the settings reader, the vendor switches,
// everything under the LLM boundary directory (it reads settings), Supabase (its client reads settings),
// tier/entitlement, privacy prefs, chat mode, and anything rendered.
const FORBIDDEN_FILES = ["src/lib/env.ts", "src/lib/llm/routing.ts"];
const FORBIDDEN_DIRS = [
  "src/lib/llm/",
  "src/lib/supabase/",
  "src/lib/entitlements/",
  "src/lib/privacy/",
  "src/lib/chat/",
  "src/app/",
  "src/components/",
];

const HOST_GLOBALS = new Set([
  "process", "globalThis", "global", "window", "self", "document", "navigator", "localStorage",
  "sessionStorage", "require", "module", "exports", "__DEV__", "eval", "Function", "fetch", "XMLHttpRequest",
  "importScripts", "Deno",
]);

// Exported surface of crisis-route.ts: name -> printed parameter list ("" for non-functions is refused).
const PINNED_SURFACE: Readonly<Record<string, string>> = {
  crisisObserver: "(observer: CrisisObserver | undefined, fence: () => void)",
  inspectProxyCrisisRejection: "(error: unknown)",
  createCrisisRouting: "(ledger: CrisisLedger)",
};

// The routers createCrisisRouting builds (not module exports, but reachable through boundary): same rule.
const PINNED_ROUTERS: Readonly<Record<string, string>> = {
  classifyRecordTextForCrisis: "(text: string, locale: \"en\" | \"ko\", userId: string, minor = false, session?: AuthenticatedAccountSessionLease)",
  classifyInterviewTextForCrisis: "(text: string, locale: \"en\" | \"ko\", userId: string, minor = false)",
  startInterviewCrisisRouting: "(guard: { current: boolean }, input: InterviewCrisisRoutingInput, onVisible: () => void, onSettled: () => void)",
  routeCrisis: "(result: SafetyResult, locale: \"en\" | \"ko\", userId: string, promptHash: string, minor = false, sourceTag = \"input_red\", opts: { recordCrisisEvent?: boolean; purpose?: string; session?: AuthenticatedAccountSessionLease; classifierConfidence?: number; } = {})",
  classifyChatTextForCrisis: "(text: string, locale: \"en\" | \"ko\", userId: string, minor?: boolean, options?: { session: AuthenticatedAccountSessionLease; signal?: AbortSignal; onCrisisDetected?: CrisisObserver; })",
  routeProxyRejection: "(error: unknown, call: { locale: \"en\" | \"ko\"; minor?: boolean; userId: string; promptHash: string; purpose?: string; session?: AuthenticatedAccountSessionLease; notifyCrisis?: CrisisObserver; fence: () => void; })",
};
const FACTORY_HEAD = "const { writeAiAuditLog, writeCrisisEvent } = ledger;";

type Source = (rel: string) => string;
const readRepo: Source = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

function resolveSpecifier(fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = posix.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(fromRel), spec));
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.tsx?$/.test(candidate) && existsSync(resolve(ROOT, candidate))) return candidate;
  }
  return "<unresolved>";
}

interface ClosureReport {
  files: string[];
  problems: string[];
}

function walkClosure(read: Source, entry = ENTRY): ClosureReport {
  const seen = new Set<string>();
  const problems: string[] = [];
  const queue = [entry];
  while (queue.length) {
    const rel = queue.shift() as string;
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (FORBIDDEN_FILES.includes(rel) || FORBIDDEN_DIRS.some((dir) => rel.startsWith(dir))) {
      problems.push(`forbidden module in closure: ${rel}`);
      continue;
    }
    const sf = ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const follow = (spec: string, what: string): void => {
      const target = resolveSpecifier(rel, spec);
      if (target === null) problems.push(`${rel}: package ${what} "${spec}"`);
      else if (target === "<unresolved>") problems.push(`${rel}: unresolved ${what} "${spec}"`);
      else queue.push(target);
    };
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt)) {
        if (stmt.importClause?.isTypeOnly) continue;
        follow((stmt.moduleSpecifier as ts.StringLiteral).text, "import");
      } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
        if (stmt.isTypeOnly) continue;
        follow((stmt.moduleSpecifier as ts.StringLiteral).text, "re-export");
      } else if (ts.isImportEqualsDeclaration(stmt)) {
        problems.push(`${rel}: import = require`);
      }
    }
    problems.push(...hostReferences(rel, sf));
  }
  return { files: [...seen].sort(), problems };
}

function hostReferences(rel: string, sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) out.push(`${rel}: dynamic import()`);
    if (ts.isMetaProperty(node)) out.push(`${rel}: import.meta`);
    if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) {
      out.push(`${rel}: declare`);
    }
    if (ts.isModuleDeclaration(node)) out.push(`${rel}: namespace/module declaration`);
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && /EXPO_PUBLIC_/.test(node.text)) {
      out.push(`${rel}: setting name in a string`);
    }
    if (ts.isIdentifier(node) && HOST_GLOBALS.has(node.text)) {
      const p = node.parent;
      const isPropertyName = (ts.isPropertyAccessExpression(p) && p.name === node)
        || (ts.isPropertyAssignment(p) && p.name === node)
        || (ts.isMethodDeclaration(p) && p.name === node)
        || (ts.isPropertySignature(p) && p.name === node)
        || (ts.isPropertyDeclaration(p) && p.name === node);
      if (!isPropertyName) out.push(`${rel}: host global ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function paramsOf(fn: ts.FunctionDeclaration, sf: ts.SourceFile): string {
  return `(${fn.parameters.map((p) => p.getText(sf)).join(", ")})`.replace(/\s+/g, " ");
}

// The factory body may only destructure the ledger, declare the routers and return them frozen.
function factoryProblems(fn: ts.FunctionDeclaration, sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const routers = new Map<string, string>();
  for (const stmt of fn.body?.statements ?? []) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      routers.set(stmt.name.text, paramsOf(stmt, sf));
    } else if (ts.isVariableStatement(stmt) && stmt.getText(sf) === FACTORY_HEAD) {
      continue;
    } else if (ts.isReturnStatement(stmt)) {
      const call = stmt.expression;
      const frozen = call && ts.isCallExpression(call) && call.expression.getText(sf) === "Object.freeze"
        && call.arguments.length === 1 && ts.isObjectLiteralExpression(call.arguments[0])
        ? (call.arguments[0] as ts.ObjectLiteralExpression).properties.map((p) =>
          ts.isShorthandPropertyAssignment(p) ? p.name.text : `!${p.getText(sf)}`)
        : null;
      if (!frozen) out.push("factory return is not Object.freeze({ ...routers })");
      else if (JSON.stringify([...frozen].sort()) !== JSON.stringify(Object.keys(PINNED_ROUTERS).sort())) {
        out.push(`factory returns ${JSON.stringify(frozen)}`);
      }
    } else {
      out.push(`factory statement: ${stmt.getText(sf).slice(0, 60)}`);
    }
  }
  if (JSON.stringify([...routers.keys()].sort()) !== JSON.stringify(Object.keys(PINNED_ROUTERS).sort())) {
    out.push(`factory routers ${JSON.stringify([...routers.keys()])}`);
  }
  for (const [name, params] of routers) {
    if (PINNED_ROUTERS[name] !== undefined && PINNED_ROUTERS[name] !== params) out.push(`signature of ${name}: ${params}`);
  }
  return out;
}

function surfaceProblems(read: Source): string[] {
  const sf = ts.createSourceFile(ENTRY, read(ENTRY), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const exported = new Map<string, string>();
  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      if (!(stmt.declarationList.flags & ts.NodeFlags.Const)) out.push("top-level let/var");
      if (isExported(stmt)) out.push(`exported value: ${stmt.declarationList.declarations.map((d) => d.name.getText(sf)).join(",")}`);
    } else if (ts.isFunctionDeclaration(stmt) && isExported(stmt) && stmt.name) {
      exported.set(stmt.name.text, paramsOf(stmt, sf));
      if (stmt.name.text === "createCrisisRouting") out.push(...factoryProblems(stmt, sf));
    } else if (ts.isClassDeclaration(stmt) && isExported(stmt)) {
      out.push(`exported class: ${stmt.name?.text}`);
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly) {
      out.push("export { ... } list");
    } else if (ts.isExportAssignment(stmt)) {
      out.push("export default / export =");
    } else if (ts.isEnumDeclaration(stmt)) {
      out.push(`enum: ${stmt.name.text}`);
    }
  }
  const want = Object.keys(PINNED_SURFACE).sort();
  const got = [...exported.keys()].sort();
  if (JSON.stringify(want) !== JSON.stringify(got)) out.push(`exported functions ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  for (const [name, params] of exported) {
    if (PINNED_SURFACE[name] !== undefined && PINNED_SURFACE[name] !== params) out.push(`signature of ${name}: ${params}`);
  }
  return out;
}

describe("A-C: the crisis route file reads no configuration", () => {
  test("the runtime import closure is exactly the pinned pure modules", () => {
    const report = walkClosure(readRepo);
    expect(report.problems).toEqual([]);
    expect(report.files).toEqual(PINNED_CLOSURE);
    for (const rel of report.files) {
      expect(FORBIDDEN_FILES.includes(rel) || FORBIDDEN_DIRS.some((dir) => rel.startsWith(dir))).toBe(false);
    }
  });

  test("the exported surface is functions only, with pinned parameters", () => {
    expect(surfaceProblems(readRepo)).toEqual([]);
  });

  test("boundary.ts takes the routing from this file and hands in only the two ledger writers", () => {
    const boundary = readRepo("src/lib/llm/boundary.ts").replace(/\r\n/g, "\n");
    expect(boundary).toMatch(/\nconst crisisRouting = createCrisisRouting\(\{ writeAiAuditLog, writeCrisisEvent \}\);\n/);
    for (const name of ["classifyRecordTextForCrisis", "classifyInterviewTextForCrisis", "startInterviewCrisisRouting", "classifyChatTextForCrisis"]) {
      expect(boundary).toContain(`\nexport const ${name} = crisisRouting.${name};\n`);
      expect(boundary).not.toMatch(new RegExp(`function ${name}\\b`));
    }
    for (const name of ["routeCrisis", "crisisObserver", "inspectProxyCrisisRejection", "proxyCrisisSafetyResult"]) {
      expect(boundary).not.toMatch(new RegExp(`function ${name}\\b`));
    }
    // callLlm returns the routed guidance immediately: the RED input gate, and each proxy reply checked
    // before anything else (the failover switch included) is read. Uses of the routing are exactly these.
    const flat = boundary.replace(/\s+/g, " ");
    expect(flat).toContain('const inputSafety = classifyInputAnyLocale(input.user, input.locale, { minor: input.minor }); const promptHash = djb2(`${input.system ?? ""}${input.user}`); if (inputSafety.zone === "red") { notifyCrisis?.(inputSafety.crisisRouting?.hotline); return (await crisisRouting.routeCrisis( inputSafety, input.locale, input.userId, promptHash, input.minor, "input_red", { purpose: input.purpose, session: input.session }, )) as unknown as LlmResult<T>; }');
    expect(flat).toContain("const proxyCrisisCall = { locale: input.locale, minor: input.minor, userId: input.userId, promptHash, purpose: input.purpose, session: input.session, notifyCrisis, fence }; let { data, error } = await invokeProxy(primaryFn); const primaryCrisis = error ? await crisisRouting.routeProxyRejection(error, proxyCrisisCall) : null; if (primaryCrisis) return primaryCrisis as unknown as LlmResult<T>;");
    expect(flat).toContain("({ data, error } = await invokeProxy(failoverFn)); const failoverCrisis = error ? await crisisRouting.routeProxyRejection(error, proxyCrisisCall) : null; if (failoverCrisis) return failoverCrisis as unknown as LlmResult<T>; } latencyMs = Date.now() - t0; if (error) throw error;");
    expect(boundary.match(/crisisRouting\.\w+/g)?.sort()).toEqual([
      "crisisRouting.classifyChatTextForCrisis",
      "crisisRouting.classifyInterviewTextForCrisis",
      "crisisRouting.classifyRecordTextForCrisis",
      "crisisRouting.routeCrisis",
      "crisisRouting.routeCrisis",
      "crisisRouting.routeProxyRejection",
      "crisisRouting.routeProxyRejection",
      "crisisRouting.startInterviewCrisisRouting",
    ]);
  });

  describe("mutations are caught", () => {
    const base = readRepo(ENTRY);
    const withEntry = (text: string): Source => (rel) => (rel === ENTRY ? text : readRepo(rel));
    const firstImport = base.search(/^import /m);
    const prepend = (line: string): string => `${base.slice(0, firstImport)}${line}\n${base.slice(firstImport)}`;
    const append = (text: string): string => `${base}\n${text}\n`;

    test.each([
      ["a settings import", prepend('import { getEnv } from "../env";'), /forbidden module in closure: src\/lib\/env\.ts/],
      ["the vendor switches", prepend('import { failoverVendor } from "../llm/routing";'), /forbidden module in closure: src\/lib\/llm\/routing\.ts/],
      ["a re-export of settings", append('export { getEnv } from "../env";'), /forbidden module in closure: src\/lib\/env\.ts/],
      ["an alias import", prepend('import { getEnv } from "@/lib/env";'), /forbidden module in closure: src\/lib\/env\.ts/],
      ["a package", prepend('import Constants from "expo-constants";'), /package import "expo-constants"/],
      ["a mixed type/value import of the boundary", prepend('import { type LlmResult as X, MODELS } from "../llm/types";'), /forbidden module in closure: src\/lib\/llm\/types\.ts/],
      ["process.env", append("export function probe(): boolean { return process.env.X === \"1\"; }"), /host global process/],
      ["globalThis", append("export function probe(): unknown { return (globalThis as { a?: unknown }).a; }"), /host global globalThis/],
      ["an ambient declaration", append("declare const config: { on: boolean };"), /declare/],
      ["a setting name in a string", append("const KEY = \"EXPO_PUBLIC_LLM_MODE\";"), /setting name in a string/],
      ["a dynamic import", append("export async function probe(): Promise<unknown> { return import(\"../env\"); }"), /dynamic import\(\)/],
      ["require()", append("export function probe(): unknown { return require(\"../env\"); }"), /host global require/],
      ["import = require", prepend('import env = require("../env");'), /import = require/],
    ])("%s", (_label, mutated, problem) => {
      const report = walkClosure(withEntry(mutated));
      expect(report.problems.join("\n")).toMatch(problem);
    });

    test("an unlisted local module changes the pinned closure", () => {
      const report = walkClosure(withEntry(prepend('import { recordableCrisisCategories } from "./crisis-event-categories";')));
      expect(report.files).not.toEqual(PINNED_CLOSURE);
    });

    test.each([
      ["an exported mutable object", append("export const CRISIS_GATE = { enabled: true };"), /exported value: CRISIS_GATE/],
      ["a top-level let", append("let gate = true;"), /top-level let\/var/],
      ["a new parameter", base.replace("(error: unknown)", "(error: unknown, viaEdge?: boolean)"), /signature of inspectProxyCrisisRejection/],
      ["a new exported function", append("export function routeAnyway(): void {}"), /exported functions/],
      ["an export list", append("const hidden = 1;\nexport { hidden };"), /export \{ \.\.\. \} list/],
      ["a router parameter", base.replace("minor?: boolean;\n      userId: string;\n      promptHash: string;", "minor?: boolean;\n      viaEdge?: boolean;\n      userId: string;\n      promptHash: string;"), /signature of routeProxyRejection/],
      ["a new router", base.replace("  return Object.freeze({", "  function routeAnyway(): void {}\n  return Object.freeze({"), /factory routers/],
      ["a mutable factory state", base.replace("  const { writeAiAuditLog, writeCrisisEvent } = ledger;", "  const { writeAiAuditLog, writeCrisisEvent } = ledger;\n  const gate = { open: true };"), /factory statement: const gate/],
      ["an unfrozen return", base.replace("return Object.freeze({", "return ({"), /factory return is not Object\.freeze/],
    ])("%s", (_label, mutated, problem) => {
      expect(surfaceProblems(withEntry(mutated)).join("\n")).toMatch(problem);
    });
  });
});

// ---------------------------------------------------------------------------------------------------
// D. Behaviour: crisis in, guidance out, with every configuration read recorded and refused.

const mockConfig = { armed: false, reads: [] as string[] };
const mockInvoke = jest.fn();

jest.mock("../../env", () => {
  const values: Record<string, unknown> = {
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: true,
    EXPO_PUBLIC_USE_VERTEX: false,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: "test-key",
    SENTRY_DSN: undefined,
  };
  const guarded = new Proxy(values, {
    get(target, key) {
      if (mockConfig.armed) {
        mockConfig.reads.push(`env.${String(key)}`);
        throw new Error(`configuration read on the crisis path: env.${String(key)}`);
      }
      return Reflect.get(target, key);
    },
  });
  return {
    getEnv: () => {
      if (mockConfig.armed) {
        mockConfig.reads.push("getEnv()");
        throw new Error("configuration read on the crisis path: getEnv()");
      }
      return guarded;
    },
  };
});
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } }),
}));
jest.mock("../../supabase/audit", () => ({ insertAiAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../supabase/crisis-events", () => ({ insertCrisisEvent: jest.fn().mockResolvedValue(undefined) }));

import {
  callLlm,
  classifyChatTextForCrisis,
  classifyInterviewTextForCrisis,
  classifyRecordTextForCrisis,
  startInterviewCrisisRouting,
} from "../../llm/boundary";
import { resetAuditWriteOutboxForTests } from "../../llm/audit-write-outbox";
import { emergencyGuidance, emergencyRoute } from "../emergency-routing";

const RED_KO = "죽고 싶어";
const BENIGN = "Today I planned my week and it felt productive.";
const realProcessEnv = process.env;

function proxy422(body: unknown): { context: { status: number; json: () => Promise<unknown> } } {
  return { context: { status: 422, json: async () => body } };
}

describe("D: every crisis entry returns the guidance without reading configuration", () => {
  beforeAll(() => {
    const guarded = new Proxy(realProcessEnv, {
      get(target, key) {
        if (mockConfig.armed && typeof key === "string" && key.startsWith("EXPO_PUBLIC_")) {
          mockConfig.reads.push(`process.env.${key}`);
          throw new Error(`configuration read on the crisis path: process.env.${key}`);
        }
        return Reflect.get(target, key);
      },
    });
    Object.defineProperty(process, "env", { value: guarded, configurable: true, writable: true });
  });
  afterAll(() => {
    Object.defineProperty(process, "env", { value: realProcessEnv, configurable: true, writable: true });
  });
  beforeEach(() => {
    mockConfig.armed = false;
    mockConfig.reads = [];
    mockInvoke.mockReset();
    resetAuditWriteOutboxForTests?.();
  });
  afterEach(() => {
    mockConfig.armed = false;
  });

  const expectGuidance = (result: { text: string; safety: { zone: string } } | null): void => {
    expect(mockConfig.reads).toEqual([]);
    expect(result?.safety.zone).toBe("red");
    expect(result?.text).toMatch(/109/);
  };

  test("record save", async () => {
    mockConfig.armed = true;
    expectGuidance(await classifyRecordTextForCrisis(RED_KO, "ko", "u1"));
  });

  test("interview answer", async () => {
    mockConfig.armed = true;
    expectGuidance(await classifyInterviewTextForCrisis(RED_KO, "ko", "u1"));
  });

  test("interview routing shows the guidance synchronously, then settles", async () => {
    mockConfig.armed = true;
    const order: string[] = [];
    const run = startInterviewCrisisRouting({ current: false }, { text: RED_KO, locale: "ko", userId: "u1" },
      () => order.push("visible"), () => order.push("settled"));
    expect(order).toEqual(["visible"]);
    expectGuidance(await run.done);
    expect(order).toEqual(["visible", "settled"]);
  });

  test("chat turn", async () => {
    mockConfig.armed = true;
    expectGuidance(await classifyChatTextForCrisis(RED_KO, "ko", "u1"));
  });

  test("callLlm input gate", async () => {
    mockConfig.armed = true;
    expectGuidance(await callLlm({ userId: "u1", locale: "ko", purpose: "interview_probe", user: RED_KO }));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test.each([
    ["medical_emergency"],
    ["immediate_threat"],
    [undefined],
  ] as const)("callLlm proxy 422 (lane %s): the guidance the server lane names, in both locales and ages", async (lane) => {
    for (const locale of ["ko", "en"] as const) {
      for (const minor of [false, true]) {
        mockConfig.reads = [];
        mockInvoke.mockReset().mockImplementation(async () => {
          mockConfig.armed = true;
          return { data: null, error: proxy422({ error: "safety_red_zone", ...(lane ? { crisis_lane: lane } : {}) }) };
        });
        const result = await callLlm({ userId: "u1", locale, minor, purpose: "interview_probe", user: BENIGN });
        mockConfig.armed = false;
        expect(mockConfig.reads).toEqual([]);
        expect(result.safety.zone).toBe("red");
        const route = emergencyRoute(lane);
        if (route) {
          expect(result.safety.crisisRouting?.hotline).toBe(route.hotline);
          expect(result.text).toBe(emergencyGuidance(route.hotline, locale)?.text);
        } else {
          expect(result.text).toMatch(locale === "ko" ? /109/ : /988/);
        }
        expect(mockInvoke).toHaveBeenCalledTimes(1);
      }
    }
  });

  test("callLlm proxy 422 after a failover attempt", async () => {
    const failover = process.env.EXPO_PUBLIC_FAILOVER_VENDOR;
    process.env.EXPO_PUBLIC_FAILOVER_VENDOR = "gemini";
    try {
      mockInvoke
        .mockImplementationOnce(async () => ({ data: null, error: { context: { status: 500, json: async () => ({ error: "down" }) } } }))
        .mockImplementationOnce(async () => {
          mockConfig.armed = true;
          return { data: null, error: proxy422({ error: "safety_red_zone" }) };
        });
      const result = await callLlm({ userId: "u1", locale: "en", purpose: "interview_probe", user: BENIGN });
      mockConfig.armed = false;
      expect(mockConfig.reads).toEqual([]);
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(result.safety.zone).toBe("red");
      expect(result.text).toMatch(/988/);
    } finally {
      mockConfig.armed = false;
      if (failover === undefined) delete process.env.EXPO_PUBLIC_FAILOVER_VENDOR;
      else process.env.EXPO_PUBLIC_FAILOVER_VENDOR = failover;
    }
  });

  test("the guard itself works: a configuration read while armed is recorded and refused", () => {
    mockConfig.armed = true;
    expect(() => process.env.EXPO_PUBLIC_LLM_MODE).toThrow(/configuration read/);
    mockConfig.armed = false;
    expect(mockConfig.reads).toEqual(["process.env.EXPO_PUBLIC_LLM_MODE"]);
  });
});
