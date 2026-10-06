import { readFileSync } from "node:fs";
import { join } from "node:path";
import { m3 } from "../../theme/m3";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("the phone keeps the home sky behind its modal and uses the shared sky on direct entry", () => {
  const phone = read("src/components/dashboard/DashboardPhone.tsx");
  expect(read("src/components/deep-space/ConstellationHome.tsx")).toContain('params: { overlay: "home" }');
  expect(read("src/app/_layout.tsx")).toContain('name="dashboard" options={{ presentation: "transparentModal"');
  expect(phone).toContain('showSharedSky transparentBackdrop={transparentBackdrop}');
  expect(phone).toContain('if (transparentBackdrop) router.back()');
});

test("data controls live in Settings, not inside the phone's app tabs", () => {
  const phone = read("src/components/dashboard/DashboardPhone.tsx");
  const settings = read("src/app/settings.tsx");
  const dataSettings = read("src/app/data-connections.tsx");
  // The tab row is gone (Simon 2026-10-06), but the pages are still only dashboard + apps.
  expect(phone).toContain('type Tab = "dashboard" | "tools";');
  expect(phone).not.toContain('"sources" | "tools"');
  expect(phone).not.toContain('t("phone.controls")');
  expect(phone).not.toContain('t("phone.operational.sources")');
  expect(phone).not.toContain('t("phone.operational.manageSources")');
  expect(phone).not.toContain('sourceRows.map');
  expect(phone).not.toContain('go("/data-connections")');
  expect(phone).not.toContain('t("phone.lastRead"');
  expect(phone).not.toContain('"phone.operational.refreshCadence" : "phone.operational.manualRefresh"');
  expect(phone).toContain('useFocusEffect(useCallback(() => {');
  expect(phone).toContain('void loadDashboard(ownerId, isMinor)');
  expect(settings).toContain('router.push("/data-connections")');
  expect(settings).toContain('router.push("/reminders")');
  expect(dataSettings).toContain("SOURCE_GROUPS.map((group)");
  expect(dataSettings).toContain("sourceGroup(source) === group");
  expect(dataSettings).toContain("setRefreshSettings(ownerId, next)");
  expect(dataSettings).toContain('accessibilityRole="switch"');
  // Simon 2026-09-30: the refresh time opens a wheel sheet; the typed box and the interval radios are gone.
  expect(dataSettings).toContain("<PixelTimeSheet");
  expect(dataSettings).not.toContain("<TextInput");
  expect(dataSettings).not.toContain("REFRESH_MINUTE_OPTIONS");
  expect(dataSettings).toContain("const refreshNow = async () => {");
  expect(phone).not.toContain('t("phone.notifications")');
  expect(phone).not.toContain('ListFooterComponent=');
  expect(phone).toContain("nextRefreshAt(new Date(), refreshSettings)");
  expect(phone).toContain("shouldRefreshAfterResume(");
  expect(phone).toContain('if (!focusRunning || insideRoute !== "/focus") return;');
  expect(phone).toContain('AppState.currentState === "active"');
});

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => {
    const n = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string): number {
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + 0.05) / (low + 0.05);
}

test("phone and data-settings copy stays legible on the dark phone surfaces", () => {
  expect(contrast(m3.color.onSurface, m3.color.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(m3.color.onSurfaceVariant, m3.color.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(m3.color.onSecondaryContainer, m3.color.surfaceContainer)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(m3.color.onSurface, m3.color.primaryContainer)).toBeGreaterThanOrEqual(4.5);
  expect(read("src/components/dashboard/DashboardPhone.tsx")).toContain("style={[styles.phoneText, style]}");
});
