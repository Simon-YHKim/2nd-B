// The import screen's health consent reads the stored choices strictly (2026-10-14).
//
// It used to read them with fetchPrivacyPrefs, which returns "everything off" when the read fails,
// and then saved `{ ...that, health_import: true }` whole. A moment where the read failed but the
// write went through turned the person's other choices off, and told the ledger nothing of it.
// The privacy screen had the same defect (#2496). Now: a strict read with a deadline; a failed
// read saves nothing; a read that ends after the account changed saves nothing; the save's
// `before` is the value it started from.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const FILE = "src/screens/deepspace/dds-import-inbox-screens.tsx";
const SOURCE = fs.readFileSync(path.join(process.cwd(), FILE), "utf8").replace(/\r\n?/g, "\n");
const AST = ts.createSourceFile(FILE, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function handler(context: Record<string, unknown>) {
  let text = "";
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "handleHealthConsent") text = node.getText(AST);
    ts.forEachChild(node, visit);
  };
  visit(AST);
  if (!text) throw new Error("handleHealthConsent not found");
  const js = ts.transpileModule(`${text}\nconst run = handleHealthConsent;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as () => Promise<void>;
}

const STORED = { health_import: false, recommendations: true, records_embedding: true, external_analytics: true };

function harness(read: (lease: { switched: boolean }) => Promise<Record<string, unknown>>, isMinor: boolean | null = false) {
  const saves: { prefs: Record<string, unknown>; options: Record<string, unknown> | undefined }[] = [];
  const shown: boolean[] = [];
  const lease = { switched: false, released: false };
  const context: Record<string, unknown> = {
    userId: "owner-a",
    healthBusy: false,
    isMinor,
    ko: true,
    setHealthBusy: () => undefined,
    setHealthPref: (on: boolean) => shown.push(on),
    readPrivacyPrefsStrict: () => read(lease),
    withTimeout: (work: Promise<unknown>) => work,
    HEALTH_PREFS_READ_TIMEOUT_MS: 10_000,
    beginAccountSessionLease: () => ({
      assertCurrent: () => {
        if (lease.switched) throw new Error("account changed");
      },
      release: () => {
        lease.released = true;
      },
    }),
    // Like the real one: a failed read comes back as "everything off", never as an error.
    fetchPrivacyPrefs: async () => ({ health_import: false, recommendations: false, records_embedding: false, external_analytics: false }),
    savePrivacyPrefs: async (_id: string, prefs: Record<string, unknown>, options?: Record<string, unknown>) => {
      saves.push({ prefs, options });
    },
  };
  return { run: handler(context), saves, shown, lease };
}

describe("the health consent on the import screen", () => {
  it("saves nothing when the stored choices cannot be read", async () => {
    const screen = harness(async () => {
      throw new Error("no answer");
    });
    await screen.run();
    expect(screen.saves).toEqual([]);
    expect(screen.shown).toEqual([]);
    expect(screen.lease.released).toBe(true);
  });

  it("saves nothing when the account changed while the choices were being read", async () => {
    const screen = harness(async (lease) => {
      lease.switched = true;
      return { ...STORED };
    });
    await screen.run();
    expect(screen.saves).toEqual([]);
    expect(screen.shown).toEqual([]);
    expect(screen.lease.released).toBe(true);
  });

  it("keeps every other choice and tells the ledger what it started from", async () => {
    const screen = harness(async () => ({ ...STORED }));
    await screen.run();
    expect(screen.saves).toHaveLength(1);
    expect(screen.saves[0].prefs).toEqual({ ...STORED, health_import: true });
    expect(screen.saves[0].options?.before).toEqual(STORED);
    expect(screen.shown).toEqual([true]);
  });

  it.each([true, null])("never runs for a minor or an age that is not confirmed (%s)", async (isMinor) => {
    const screen = harness(async () => ({ ...STORED }), isMinor);
    await screen.run();
    expect(screen.saves).toEqual([]);
  });

  it("reads with a deadline, and the locale still rides on the save", () => {
    expect(SOURCE).toContain('const current = await withTimeout(readPrivacyPrefsStrict(owner), HEALTH_PREFS_READ_TIMEOUT_MS, "privacy_prefs");');
    expect(SOURCE).toContain('await savePrivacyPrefs(owner, prefs, { locale: ko ? "ko" : "en", before: current });');
    expect(SOURCE).toContain("const HEALTH_PREFS_READ_TIMEOUT_MS = 10_000;");
  });
});
