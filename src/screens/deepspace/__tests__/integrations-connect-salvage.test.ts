import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { INTEGRATION_ENTRYPOINTS } from "../integrations/sources";

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const SCREEN_FILE = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const APP_FILE = "src/app/integrations.tsx";

const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

function integrationRenderer(): string {
  const src = read(SCREEN_FILE);
  const start = src.indexOf("function IntegrationEntryRow");
  const end = src.indexOf("// ── gaps.json", start);
  if (start < 0 || end < 0) throw new Error("/integrations renderer block not found");
  return src.slice(start, end);
}

function localeValue(locale: string, key: string): unknown {
  const colon = key.indexOf(":");
  const namespace = colon >= 0 ? key.slice(0, colon) : "deepspace";
  const path = (colon >= 0 ? key.slice(colon + 1) : key).split(".");
  let value: unknown = JSON.parse(read(`locales/${locale}/${namespace}.json`));
  for (const part of path) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

describe("connect frame layout salvage -> production /integrations", () => {
  it("tests the renderer that the production route actually mounts", () => {
    const app = read(APP_FILE);
    expect(app).toContain("DeepSpaceIntegrationsScreen");
    expect(app).toContain("export default DeepSpaceIntegrationsScreen");
    const renderer = integrationRenderer();
    expect(renderer).toContain('t("connect.lead")');
    expect(renderer).toContain("INTEGRATION_ENTRYPOINTS.map");
  });

  it("keeps the five reference rows but routes each to its real owner", () => {
    expect(INTEGRATION_ENTRYPOINTS.map((source) => source.id)).toEqual([
      "cal",
      "health",
      "notion",
      "photos",
      "gpt",
    ]);
    expect(Object.fromEntries(INTEGRATION_ENTRYPOINTS.map((source) => [source.id, source.route]))).toEqual({
      cal: "/import-hub",
      health: "/import?mode=account",
      notion: "/import-hub",
      photos: "/capture",
      gpt: "/import-hub",
    });
    expect(Object.fromEntries(INTEGRATION_ENTRYPOINTS.map((source) => [source.id, source.actionKey]))).toEqual({
      cal: "connect.openImport",
      health: "connect.connect",
      notion: "connect.openImport",
      photos: "connect.openCapture",
      gpt: "connect.openImport",
    });
    for (const source of INTEGRATION_ENTRYPOINTS) {
      const routeFile = source.route.slice(1).split("?", 1)[0];
      expect(existsSync(join(ROOT, "src", "app", `${routeFile}.tsx`))).toBe(true);
    }
  });

  it("sends health to the flow that owns consent, permission, denied, unavailable, and empty states", () => {
    const health = INTEGRATION_ENTRYPOINTS.find((source) => source.id === "health");
    expect(health).toMatchObject({
      nameKey: "import.healthName",
      route: "/import?mode=account",
      detailKey: "import:health.connect",
    });

    const owner = read("src/screens/deepspace/dds-import-inbox-screens.tsx");
    expect(owner).toContain("useLocalSearchParams<{ mode?: string }>()");
    expect(owner).toContain('requestedMode === "account" ? "account" : "file"');
    expect(owner).toContain('t("import.healthName")');
    expect(owner).toContain("handleHealthConsent");
    expect(owner).toContain("native.requestPermission()");
    for (const key of ["healthErrUnavailable", "healthErrDenied", "healthErrEmpty", "healthErrFailed"]) {
      expect(owner).toContain(`ds.import.${key}`);
    }
    expect(withoutComments(owner)).not.toContain("mockSamplesForRange");
  });

  it("does not invent a connected state or a local connection store", () => {
    const renderer = integrationRenderer();
    expect(renderer).not.toContain('t("connect.connected")');
    expect(renderer).not.toContain('t("connect.a11yConnected")');
    expect(renderer).not.toMatch(/setConnected|AsyncStorage|localStorage/);
  });

  it("uses the PIXEL-CLAY bevel primitive with Android-safe static touch geometry", () => {
    const renderer = integrationRenderer();
    expect(renderer).toContain("<PixelSurface");
    expect(renderer).toContain('variant="bevel"');
    expect(renderer).toContain('variant="inset"');
    expect(renderer).toContain('style={cx.integrationHit}');
    expect(renderer).not.toMatch(/style\s*=\s*\{\s*\(/);

    const src = read(SCREEN_FILE);
    expect(src).toMatch(/integrationHit:\s*\{[^}]*minHeight:\s*72/);
    expect(src).toMatch(/integrationAction:\s*\{[^}]*minHeight:\s*44/);
  });

  it.each(["en", "ko", "es", "pt", "id"])("reuses complete %s locale copy", (locale) => {
    for (const source of INTEGRATION_ENTRYPOINTS) {
      if (source.nameKey) expect(typeof localeValue(locale, source.nameKey)).toBe("string");
      expect(typeof localeValue(locale, source.detailKey)).toBe("string");
      expect(typeof localeValue(locale, source.actionKey)).toBe("string");
    }
  });
});
