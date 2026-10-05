// Web cold start: the opening plays while the app fonts download (2026-10-04).
//
// Measured before this change: the static HTML carried a high-priority
// `<link rel="preload">` for all seven faces (about 1.5 MB), fetched alongside
// the 2.2 MB app code, and the root layout would not render the opening until
// every face had loaded. Render tests are blocked in this repo (RN 0.85), so the
// contract is read from source.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const web = read("src/lib/fonts/use-app-fonts.web.ts");
const native = read("src/lib/fonts/use-app-fonts.ts");
const layout = read("src/app/_layout.tsx");
// Code, not prose: the hooks' comments name useFonts to explain why it is not used.
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("web fonts load after the page starts", () => {
  test("the web hook never calls useFonts (which writes preload links into the static HTML)", () => {
    expect(code(web)).not.toMatch(/useFonts\s*\(/);
    expect(code(web)).toMatch(/useEffect\(\(\) => \{[\s\S]*loadAsync\(fontAssets\)/);
  });

  test("they wait for the opening's images (measured: otherwise they take the line from them), with a bound", () => {
    expect(code(web)).toMatch(/whenOpeningImagesSettled\(\(\) => \{\s*loadAsync\(fontAssets\)/);
    expect(code(web)).toContain("export const FONT_FALLBACK_MS = 6000;");
    const screen = read("src/components/ui/LoadingScreen.tsx");
    expect(screen).toContain("if (loaded.current.size >= APPROVED_OPENING_IMAGES_IN_USE_ORDER.length) markOpeningImagesSettled();");
    expect(screen).toContain("() => { setAssetError(true); markOpeningImagesSettled(); }");
  });

  test("the first render is 'not loaded' on the server and the client alike (hydration matches)", () => {
    expect(code(web)).toContain("useState<[boolean, Error | null]>([false, null])");
  });

  test("native keeps useFonts, so the splash still covers the font load", () => {
    expect(code(native)).toContain("return useFonts(fontAssets);");
  });
});

describe("root layout", () => {
  test("loads fonts through the platform hook only", () => {
    expect(layout).toContain('import { useAppFonts } from "@/lib/fonts/use-app-fonts";');
    expect(code(layout)).not.toMatch(/from "expo-font"/);
    expect(layout).toContain("const [fontsLoaded, fontError] = useAppFonts();");
  });

  test("on the web the opening does not wait for fonts; native does; i18n gates both", () => {
    expect(layout).toContain('const OPENING_LOADS_FONTS = Platform.OS === "web";');
    expect(layout).toContain("if ((!fontsReady && !OPENING_LOADS_FONTS) || !i18nReady) {");
  });

  test("the opening hands over only once the fonts are in", () => {
    expect(layout).toContain("<IntroGate fontsReady={fontsReady}>");
    expect(layout).toContain('ready={fontsReady && !loading && recoveryReady && profileHold !== "loading"}');
    expect(layout).toMatch(/function IntroGate\(\{ children, fontsReady = true \}/);
    const afterIntro = layout.slice(layout.indexOf("if (!introDone) {"));
    // Bare (no caption) since R2A-04: text laid out before the face is registered is
    // cached at the fallback width (android-text-clip-d08.test.ts).
    expect(afterIntro.indexOf("if (!fontsReady) return <InlineLoader bare />;")).toBeGreaterThan(0);
    expect(afterIntro.indexOf("if (!fontsReady) return <InlineLoader bare />;")).toBeLessThan(afterIntro.indexOf("if (storageRecoveryRequired)"));
  });
});
