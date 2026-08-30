import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SCREEN = join(ROOT, "src", "app", "beyond.tsx");

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

describe("PIXEL-CLAY /beyond contract", () => {
  test("holds on auth loading and redirects a resolved signed-out session", () => {
    const source = read(SCREEN);
    expect(source).toContain("const { userId, loading } = useAuth()");
    expect(source).toMatch(/if \(loading\)[\s\S]*?<DeepSpaceLoader/);
    expect(source).toContain('if (!userId) return <Redirect href="/sign-in" />');
    expect(source).not.toContain("if (loading) return null");
  });

  test("keeps only the three real app destinations and the voice mode parameter", () => {
    const source = withoutComments(read(SCREEN));
    expect(source).toContain('router.push("/capture")');
    expect(source).toContain('pathname: "/capture-full"');
    expect(source).toContain('params: { mode: "voice" }');
    expect(source).toContain('router.push("/settings")');
    expect(source).not.toMatch(/router\.(?:push|replace)\([^)]*\/(?:widget|lock-screen|push)/);
  });

  test("marks every external surface as a preview without live or installed fixtures", () => {
    const source = withoutComments(read(SCREEN));
    for (const key of ["widgetsSection", "lockSection", "pushSection"]) {
      expect(source).toContain(`beyond.${key}`);
    }
    expect(source).toContain('t("beyond.preview")');
    expect(source).not.toContain('t("beyond.lead")');
    expect(source).not.toMatch(/\b(?:installed|widgetInstalled|permissionGranted|liveMetric|StateRow)\b/i);
    expect(source).not.toMatch(/\b(?:L[1-5]|9:41)\b/);
  });

  test("reveals at most one preview group and exposes disclosure state", () => {
    const source = read(SCREEN);
    expect(source).toContain('useState<BeyondPreviewId | null>("widgets")');
    expect(source).toContain("current === preview.id ? null : preview.id");
    expect(source).toContain("accessibilityState={{ expanded }}");
    expect(source).toContain("openPreview === preview.id");
  });

  test("uses shared pixel primitives and Fabric-safe press handling", () => {
    const source = read(SCREEN);
    expect(source).toContain("PixelSurface");
    expect(source).toContain("PixelPressable");
    expect(source).toContain("PixelGlyph");
    expect(source).toContain("fullWidth");
    expect(source).toContain("minHeight: m3.minTouch");
    expect(source).not.toMatch(/\b(?:MdCard|MdButton)\b/);
    expect(source).not.toMatch(/<Pressable\b/);
    expect(source).not.toMatch(/style=\{\s*\(\{?\s*pressed\b/);
    expect(source).not.toMatch(/\b(?:rgba|withAlpha)\s*\(/);
    expect(source).not.toMatch(/\bopacity\s*:\s*0?\.\d+/);
  });

  test("lets narrow screens reflow both widget previews without viewport arithmetic", () => {
    const source = read(SCREEN);
    expect(source).toContain('flexWrap: "wrap"');
    expect(source).toMatch(/previewCard:\s*\{[^}]*minWidth:\s*180/);
    expect(source).not.toMatch(/\b(?:Dimensions|getWindowDimensions|useWindowDimensions)\b/);
    expect(source).not.toMatch(/390\s*[-+*/]/);
  });

  test("keeps the settings dock context and translation-owned visible copy", () => {
    const source = read(SCREEN);
    expect(source).toContain('<DeepSpaceScreen active="settings" header="none">');
    expect(source).toContain('useTranslation(["deepspace", "common"])');
    expect(source).not.toMatch(/<RNText[^>]*>\s*[A-Za-z\u3131-\uD79D][^<{]*<\/RNText>/);
  });
});
