// The privacy screen's stored choices are read strictly (2026-10-14).
//
// It used to read them with fetchPrivacyPrefs, which returns "everything off" when the read fails.
// So, offline, every toggle showed OFF as if that were stored; and the handlers that turn
// recommendations or record embedding on read the same way and saved `{ ...that, X: on }` whole,
// so a moment where the read failed but the write went through turned the person's other
// choices off. The consent ledger then either missed those changes (the save's own `before`
// read failed too) or logged withdrawals nobody made (it did not).
//
// Now: one strict read with a deadline. If it fails, the settings cards are replaced by the
// sentence the app already uses for an unreachable server and a retry. The handlers read strictly,
// save nothing when the read fails, and hand the value they built from to the save as `before`.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const FILE = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const SOURCE = fs.readFileSync(path.join(process.cwd(), FILE), "utf8").replace(/\r\n?/g, "\n");
const AST = ts.createSourceFile(FILE, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function fnText(name: string): string {
  let text = "";
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) text = node.getText(AST);
    ts.forEachChild(node, visit);
  };
  visit(AST);
  if (!text) throw new Error(`${name} not found`);
  return text;
}

function load(name: string, context: Record<string, unknown>) {
  const js = ts.transpileModule(`${fnText(name)}\nconst run = ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as (...args: unknown[]) => Promise<void>;
}

const OWNER = "owner-a";
const STORED = { recommendations: false, records_embedding: false, external_analytics: true, chat_autosave: true };

function harness(read: () => Promise<Record<string, unknown>>) {
  const saves: { prefs: Record<string, unknown>; options: Record<string, unknown> | undefined }[] = [];
  const errors: boolean[] = [];
  const context: Record<string, unknown> = {
    userId: OWNER,
    busy: false,
    ko: true,
    minorRef: { current: false },
    prefsUserRef: { current: OWNER as string | null },
    privacyMountedRef: { current: true },
    activeUserRef: { current: OWNER as string | null },
    prefsRef: { current: { ...STORED } },
    setBusy: () => undefined,
    setUnderstanding: () => undefined,
    setEmbedUnderstanding: () => undefined,
    setRecOn: () => undefined,
    setEmbedOn: () => undefined,
    setRecError: (on: boolean) => errors.push(on),
    setEmbedErr: (on: boolean) => errors.push(on),
    readPrivacyPrefsStrict: read,
    fetchPrivacyPrefs: async () => {
      throw new Error("the fail-soft read must not be used by a handler that saves");
    },
    savePrivacyPrefs: async (_id: string, prefs: Record<string, unknown>, options?: Record<string, unknown>) => {
      saves.push({ prefs, options });
    },
    recordRecommendationsConsent: async () => true,
    backfillAllRecordEmbeddings: async () => undefined,
    clearRecordEmbeddings: async () => undefined,
  };
  return { context, saves, errors };
}

describe("a handler that saves reads strictly, and saves nothing when the read fails", () => {
  it.each(["enableRecommendations", "disableRecommendations", "enableEmbedding", "disableEmbedding"])("%s", async (name) => {
    const failing = harness(async () => {
      throw new Error("no answer");
    });
    await load(name, failing.context)();
    expect(failing.saves).toEqual([]);
    expect(failing.errors.filter(Boolean)).toEqual([true]);
  });

  it.each([
    ["enableRecommendations", "recommendations", true],
    ["disableRecommendations", "recommendations", false],
    ["enableEmbedding", "records_embedding", true],
    ["disableEmbedding", "records_embedding", false],
  ] as const)("%s keeps the other choices and tells the ledger what it started from", async (name, key, value) => {
    const ok = harness(async () => ({ ...STORED }));
    await load(name, ok.context)();
    expect(ok.saves).toHaveLength(1);
    expect(ok.saves[0].prefs).toEqual({ ...STORED, [key]: value });
    expect(ok.saves[0].options?.before).toEqual(STORED);
  });
});

describe("analytics and ads start from the choices on screen, and say so to the ledger", () => {
  it("the save carries the choices it was built from as before", () => {
    const fn = fnText("toggleExternalPreference");
    expect(fn).toContain("const base: PrivacyPrefs = prefsRef.current;");
    expect(fn).toContain("const updated: PrivacyPrefs = { ...base, [key]: next };");
    expect(fn).toContain('await savePrivacyPrefs(targetUserId, updated, { locale: ko ? "ko" : "en", before: base });');
    expect(fn).toContain('await savePrivacyPrefs(targetUserId, committed, { locale: ko ? "ko" : "en", before: updated });');
  });
});

describe("the screen's own read", () => {
  const screen = fnText("DeepSpacePrivacyDesignScreen");

  it("is strict and has a deadline", () => {
    expect(screen).toContain('void withTimeout(readPrivacyPrefsStrict(targetUserId), PRIVACY_READ_TIMEOUT_MS, "privacy_prefs").then(');
    expect(SOURCE).toContain("const PRIVACY_READ_TIMEOUT_MS = 10_000;");
    expect(screen).toContain("}, [userId, prefsReload]);");
  });

  it("a failed read says so, unless the health card's strict read already knows the choices", () => {
    expect(screen).toContain("if (prefsUserRef.current === targetUserId && prefsRef.current) show(prefsRef.current);");
    expect(screen).toContain("else setPrefsReadFailed(true);");
  });

  it("then the settings cards give way to the existing sentence and a retry, and no toggle is drawn", () => {
    const at = screen.indexOf("{prefsReadFailed ? (");
    expect(at).toBeGreaterThan(-1);
    const failed = screen.slice(at, screen.indexOf(") : (", at));
    expect(failed).toContain('t("common:errors.network")');
    expect(failed).toContain("onPress={() => setPrefsReload((n) => n + 1)}");
    expect(failed).toContain('t("common:actions.retry")');
    expect(failed).not.toContain("<Toggle");
    // The three settings cards sit on the other side of that branch.
    const rest = screen.slice(screen.indexOf(") : (", at), screen.indexOf("<HealthWithdrawCard"));
    expect(rest).toContain('t("privacy.analytics.title")');
    expect(rest).toContain('t("privacy.recommend.title")');
    expect(rest).toContain('t("privacy.semantic.title")');
  });

  it("only the backfill's own probe still reads fail-soft, and that one fails closed", () => {
    const uses = SOURCE.split("\n").filter((line) => line.includes("fetchPrivacyPrefs("));
    expect(uses).toEqual(["            const live = await fetchPrivacyPrefs(targetUserId);"]);
  });
});

describe("the two strings already exist", () => {
  it.each(["ko", "en", "es", "pt", "id"])("%s", (lng) => {
    const common = JSON.parse(fs.readFileSync(path.join(process.cwd(), `locales/${lng}/common.json`), "utf8")) as {
      errors: Record<string, string>;
      actions: Record<string, string>;
    };
    expect(common.errors.network.trim()).not.toBe("");
    expect(common.actions.retry.trim()).not.toBe("");
  });
});
