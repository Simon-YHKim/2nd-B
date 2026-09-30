// HealthAutoReadSync source contract. The component cannot be rendered here (jest node,
// classic JSX), so it is kept thin: the rules live in lib/health/auto-read.ts and
// lib/health/auto-read-runner.ts and are tested by behaviour there. What is pinned here is
// the wiring: where it mounts, who it runs for and what it hands the runner.
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const sync = read("src/components/health/HealthAutoReadSync.tsx");
const autoRead = read("src/lib/health/auto-read.ts");
const runner = read("src/lib/health/auto-read-runner.ts");
const layout = read("src/app/_layout.tsx");
const importScreen = read("src/screens/deepspace/dds-import-inbox-screens.tsx");

test("it is mounted once, inside the auth provider, next to the other sync components", () => {
  expect(layout.match(/<HealthAutoReadSync \/>/g)).toHaveLength(1);
  const auth = layout.indexOf("<AuthProvider>");
  const mount = layout.indexOf("<HealthAutoReadSync />");
  expect(auth).toBeGreaterThan(-1);
  expect(mount).toBeGreaterThan(auth);
  expect(mount).toBeLessThan(layout.indexOf("</AuthProvider>"));
});

test("it runs only for a confirmed adult on a native build, outside any account recovery", () => {
  expect(sync).toContain('if (Platform.OS === "web") return;');
  expect(sync).toContain("if (loading || !userId || isMinor !== false || recoveryUserId || recoveryPendingGlobal) return;");
});

test("it hands the runner the real foreground state, account transition and lease, and cleans up", () => {
  expect(sync).toContain("return startHealthAutoRead(userId, {");
  expect(sync).toContain("appState: () => AppState.currentState,");
  expect(sync).toContain('AppState.addEventListener("change", listener)');
  expect(sync).toContain("return () => subscription.remove();");
  expect(sync).toContain("transitionPending: isAccountTransitionPending,");
  expect(sync).toContain("beginLease: (owner, parent) => beginAccountSessionLease(owner, parent),");
  expect(sync).toMatch(/setTimer: \(run, ms\) => setTimeout\(run, ms\)/);
});

test("no automatic path can ask for an OS permission", () => {
  for (const src of [sync, autoRead, runner]) expect(src).not.toMatch(/requestPermission\s*\(/);
  expect(autoRead).toContain("native.readGranted(");
});

test("a failed consent read is retried, not taken as 'no consent'", () => {
  expect(sync).toContain("if (error) throw error;");
  // fetchPrivacyPrefs falls back to the defaults (no consent) on an error; it must not be used.
  expect(sync).not.toMatch(/fetchPrivacyPrefs\(|from "@\/lib\/supabase\/privacy"/);
});

test("only the '오늘 반영' tap arms the phone, and only after the OS grant", () => {
  const granted = importScreen.indexOf('(await native.requestPermission()) !== "granted"');
  const armed = importScreen.indexOf("armHealthAutoRead(userId)");
  expect(granted).toBeGreaterThan(-1);
  expect(armed).toBeGreaterThan(granted);
  for (const src of [sync, runner, autoRead.replace(/export async function armHealthAutoRead[\s\S]*?\r?\n}\r?\n/, "")]) {
    expect(src).not.toContain("armHealthAutoRead(");
  }
});

test("the marks are purged with a deleted account", () => {
  expect(read("src/lib/account/local-purge.ts")).toContain("observe(() => purgeHealthAutoReadForDeletedAccount(owner)),");
});
