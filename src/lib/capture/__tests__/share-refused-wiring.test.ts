// Android share -> /capture, decided by the existing gates only (Simon
// 2026-10-07 12:04, "번호 · 대기 없이 다시"). Source contracts for the wiring a
// unit test cannot reach (component render tests are blocked in this repo):
//
//   - no share registry, delivery id or waiting state anywhere in the app;
//   - the capture screen fills from its params exactly as on main, and the
//     marker plays no part in filling;
//   - every gate that turns /capture away (the capture screen's own sign-in and
//     profile redirects, IntroGate's reset and C10 redirects, the first-avatar
//     redirect) adds the notice param only for a marked share;
//   - each screen those redirects land on draws the one line in its own flow,
//     not as an overlay over the app;
//   - round 4 (gate SG-R3-01 = SHARE-A3-01 and SHARE-A3-02, Simon 2026-10-07
//     13:33): the storage recovery screen, which IntroGate draws in place of
//     every route, first swaps a marked /capture for /capture?notice=shareRefused
//     and then draws the line from the whole route's params; the first-avatar
//     screen draws it in its load-error branch too.
//
// The redirects themselves run through the real IntroGate source in
// src/app/__tests__/profile-probe-route-hold.test.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as vm from "node:vm";
import * as ts from "typescript";

import { SHARE_REFUSED_PARAMS, showsShareRefused } from "../share-intent";

const ROOT = process.cwd();
const read = (file: string): string => readFileSync(join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

/** The text of `function <name>(` up to the next top-level function or export. */
function functionBody(source: string, name: string): string {
  const start = source.search(new RegExp(`\\n(export )?(default )?function ${name}\\(`));
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n(export )?(default )?function |\nconst styles = /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const path = join(dir, entry);
    if (entry === "__tests__" || entry === "node_modules") continue;
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js)$/.test(entry)) out.push(path);
  }
  return out;
}

describe("no share registry is left", () => {
  test("the delivery registry, its hooks and the overlay notice are gone", () => {
    for (const file of [
      "src/lib/capture/share-delivery.ts",
      "src/lib/capture/use-share-delivery.ts",
      "src/components/capture/ShareRefusedNotice.tsx",
    ]) {
      expect(existsSync(join(ROOT, file))).toBe(false);
    }
  });

  test("no app source or config plugin names a delivery id", () => {
    const hits = [...sourceFiles("src"), ...sourceFiles("config-plugins")].filter((file) =>
      /shareDelivery|share-delivery|ShareDelivery/.test(read(file)),
    );
    expect(hits.map((file) => relative(ROOT, join(ROOT, file)))).toEqual([]);
  });

  test("the root layout mounts no share layer of its own", () => {
    expect(read("src/app/_layout.tsx")).not.toMatch(/ShareRefused|ShareDelivery/);
  });
});

describe("the capture screen fills as on main; the marker only shapes its redirects", () => {
  const capture = read("src/app/capture.tsx");

  test("its two redirects add the notice only for a marked share", () => {
    const screen = functionBody(capture, "Capture");
    expect(screen).toContain("const shareMarked = carriesShareMarker(captureParams);");
    expect(screen).toContain('if (!userId) return <Redirect href={shareRefusedHref("/sign-in", shareMarked)} />;');
    expect(screen).toContain(
      'if (hasProfile === false) return <Redirect href={shareRefusedHref("/complete-profile", shareMarked)} />;',
    );
  });

  test("the intake that fills never reads the marker", () => {
    const session = functionBody(capture, "CaptureLegacySession");
    expect(session).toContain("normalizeSharedCaptureParams({ url: sharedUrlParam, text: sharedTextParam, title: sharedTitleParam })");
    expect(session).not.toMatch(/carriesShareMarker|SHARE_MARKER|shareRefusedHref|\bfrom\?: string/);
  });
});

describe("the gates add the notice when they turn a marked share away", () => {
  test("IntroGate: the reset lock and C10 read the current route once", () => {
    const gate = functionBody(read("src/app/_layout.tsx"), "IntroGate");
    expect(gate).toContain("const shareTurnedAway = isMarkedShareCapture(pathname, useGlobalSearchParams());");
    expect(gate).toContain('return <Redirect href={shareRefusedHref("/reset-password", shareTurnedAway)} />;');
    expect(gate).toContain('return <Redirect href={shareRefusedHref("/complete-profile", shareTurnedAway)} />;');
  });

  test("IntroGate: the storage recovery screen comes only after a marked /capture lost its text", () => {
    const gate = functionBody(read("src/app/_layout.tsx"), "IntroGate");
    const swap = gate.indexOf(
      'if (storageRecoveryRequired && shareTurnedAway) return <Redirect href={shareRefusedHref("/capture", true)} />;',
    );
    const screen = gate.indexOf("if (storageRecoveryRequired) return <EncryptedStorageRecoveryGate />;");
    expect(swap).toBeGreaterThan(-1);
    expect(screen).toBeGreaterThan(swap);
    // Nothing between the two returns: the swap is the first thing a recovery does.
    expect(gate.slice(swap, screen).match(/\breturn\b/g)).toHaveLength(1);
  });

  test("the first-avatar gate keeps its target and adds the notice param to it", () => {
    const gate = functionBody(read("src/components/avatar/AvatarSetupGate.tsx"), "AvatarSetupGate");
    expect(gate).toContain("const shareTurnedAway = isMarkedShareCapture(usePathname(), useGlobalSearchParams());");
    expect(gate).toMatch(
      /shareTurnedAway\s*\?\s*\{ pathname: "\/avatar-studio", params: \{ setup: "1", \.\.\.SHARE_REFUSED_PARAMS \} \}\s*:\s*"\/avatar-studio\?setup=1"/,
    );
  });
});

describe("each destination draws the line in its own flow", () => {
  test.each([
    ["src/screens/deepspace/dds-sign-in-screen.tsx", "DeepSpaceSignInDesignScreen"],
    ["src/screens/deepspace/dds-auth-screens.tsx", "DeepSpaceResetPasswordDesignScreen"],
    ["src/app/(auth)/complete-profile.tsx", "CompleteProfileBody"],
    ["src/app/avatar-studio.tsx", "AvatarStudioScreen"],
  ])("%s renders <ShareRefusedLine /> inside %s", (file, component) => {
    const source = read(file);
    expect(source).toContain('import { ShareRefusedLine } from "@/components/capture/ShareRefusedLine";');
    expect(functionBody(source, component)).toContain("<ShareRefusedLine />");
  });

  test("the storage recovery screen draws the line from the whole route, in its message spot", () => {
    const source = read("src/screens/deepspace/storage-recovery-gate.tsx");
    expect(source).toContain('import { ShareRefusedLine } from "@/components/capture/ShareRefusedLine";');
    const gate = functionBody(source, "EncryptedStorageRecoveryGate");
    expect(gate).toContain("const routeParams = useGlobalSearchParams();");
    const line = gate.indexOf("<ShareRefusedLine routeParams={routeParams} style={styles.shareRefused} />");
    // Under the warning and above the failure message, inside the screen's own column.
    expect(line).toBeGreaterThan(gate.indexOf('t("auth:storageRecovery.warning")'));
    expect(line).toBeLessThan(gate.indexOf('t("auth:storageRecovery.failed")'));
    expect(source).toContain('shareRefused: { alignSelf: "stretch" },');
  });

  test("the first-avatar screen keeps the line in its load-error branch", () => {
    const source = read("src/app/avatar-studio.tsx");
    const start = source.indexOf('if (loadState.userId === userId && loadState.status === "error") {');
    const end = source.indexOf("if (!readyForUser)", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = source.slice(start, end);
    const line = branch.indexOf("<ShareRefusedLine style={styles.shareRefusedInCenter} />");
    expect(line).toBeGreaterThan(branch.indexOf("return frame("));
    expect(line).toBeLessThan(branch.indexOf('t("avatar:loadError")'));
    expect(source).toContain('shareRefusedInCenter: { alignSelf: "stretch" },');
  });

  test("the line is plain flow content: no overlay, no timer, no button, no stored state", () => {
    const line = read("src/components/capture/ShareRefusedLine.tsx");
    expect(functionBody(line, "ScreenShareRefusedLine")).toContain("if (!showsShareRefused(params)) return null;");
    expect(line).toContain('t("shareRefused.body")');
    expect(line).not.toMatch(/position:\s*"absolute"|setTimeout|Pressable|useState|useEffect|Storage/);
  });

  test("the line has its text in all five locales, and nothing else is left of the old notice", () => {
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const capture = JSON.parse(read(`locales/${locale}/capture.json`)) as {
        shareRefused?: Record<string, string>;
      };
      expect(Object.keys(capture.shareRefused ?? {})).toEqual(["body"]);
      expect(capture.shareRefused?.body.trim().length).toBeGreaterThan(0);
    }
  });
});

// The two ways the line reads the notice, run from the real source (render tests
// are blocked in this repo, so the functions are lifted out with the TypeScript
// parser and run against stand-ins, as profile-probe-route-hold.test.ts does).
describe("ShareRefusedLine reads the screen's params, or the route's when it is given them", () => {
  const FILE = "src/components/capture/ShareRefusedLine.tsx";
  const sf = ts.createSourceFile(FILE, read(FILE), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lift = (name: string): string => {
    const found: ts.FunctionDeclaration[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (found.length !== 1) throw new Error(`expected one function ${name}, found ${found.length}`);
    return ts.transpileModule(found[0].getText(sf).replace(/^export /, ""), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    }).outputText;
  };

  type Element = { type: unknown; props: Record<string, unknown> } | null;
  const RefusedLine = { host: "RefusedLine" };
  const screenReads: number[] = [];
  let screenParams: Record<string, unknown> = {};
  const context = vm.createContext({
    React: { createElement: (type: unknown, props: Record<string, unknown> | null) => ({ type, props: props ?? {} }) },
    RefusedLine,
    showsShareRefused,
    useScreenParams: () => {
      screenReads.push(1);
      return screenParams;
    },
  });
  vm.runInContext(lift("ScreenShareRefusedLine"), context);
  vm.runInContext(lift("ShareRefusedLine"), context);
  const ShareRefusedLine = context.ShareRefusedLine as (props: Record<string, unknown>) => Element;
  const ScreenShareRefusedLine = context.ScreenShareRefusedLine as (props: Record<string, unknown>) => Element;

  test("given the route's params, it shows only for the notice and never reads screen params", () => {
    screenReads.length = 0;
    expect(ShareRefusedLine({ routeParams: { ...SHARE_REFUSED_PARAMS } })?.type).toBe(RefusedLine);
    expect(ShareRefusedLine({ routeParams: { text: "shared words", from: "share" } })).toBeNull();
    expect(ShareRefusedLine({ routeParams: {} })).toBeNull();
    expect(screenReads).toEqual([]);
  });

  test("without them, it hands over to the screen-params reader, which shows only for the notice", () => {
    expect(ShareRefusedLine({})?.type).toBe(ScreenShareRefusedLine);
    screenParams = { ...SHARE_REFUSED_PARAMS };
    expect(ScreenShareRefusedLine({})?.type).toBe(RefusedLine);
    screenParams = { text: "shared words", from: "share" };
    expect(ScreenShareRefusedLine({})).toBeNull();
    expect(screenReads).toHaveLength(2);
  });
});
