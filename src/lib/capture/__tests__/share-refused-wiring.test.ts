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
//     not as an overlay over the app.
//
// The redirects themselves run through the real IntroGate source in
// src/app/__tests__/profile-probe-route-hold.test.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

  test("the line is plain flow content: no overlay, no timer, no button, no stored state", () => {
    const line = read("src/components/capture/ShareRefusedLine.tsx");
    expect(line).toContain("if (!showsShareRefused(params)) return null;");
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
