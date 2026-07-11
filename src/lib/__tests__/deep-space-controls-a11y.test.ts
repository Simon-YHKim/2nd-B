import { readFileSync } from "node:fs";
import path from "node:path";

// Source-scan guard (same idiom as deep-space-shell-a11y.test.ts): the deep-space
// theme + permission controls were inert painted mockups (static ✓ rows, a dead
// font-size knob, hardcoded on/off toggles) and the shared Action row / digest
// row / settings segment had a11y gaps. These asserts keep the wiring in place.
const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const dds = read("screens/deepspace/DeepSpaceDesignScreens.tsx");

describe("deep-space Action nav row a11y", () => {
  test("exposes a button role and hides the decorative chevron", () => {
    expect(dds).toMatch(/function Action\([^)]*\)\s*{/);
    expect(dds).toContain('accessibilityRole="button"');
    // The chevron is decorative — it must be removed from the a11y tree.
    expect(dds).toContain(
      'accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›',
    );
  });
});

describe("deep-space theme screen is wired to real settings", () => {
  test("reads and writes the same hooks as the legacy screen", () => {
    expect(dds).toContain("const { mode, setMode } = useTheme();");
    expect(dds).toContain("const { fontStyle, setFontStyle } = useFontStyle();");
    expect(dds).toContain("const { liteMode, setLiteMode } = useLiteMode();");
    expect(dds).toContain("onPress={() => setMode(\"dark\")}");
    expect(dds).toContain("onPress={() => setFontStyle(\"pixel\")}");
    expect(dds).toContain("onPress={() => setLiteMode(!liteMode)}");
  });

  test("drops the dead painted font-size knob", () => {
    // The knob had no backing setting; it must not be rendered anymore.
    expect(dds).not.toContain("styles.sizeKnob");
  });
});

describe("deep-space permissions screen reflects real OS status", () => {
  test("queries real permission modules instead of hardcoded toggles", () => {
    expect(dds).toContain("permissionAdapters");
    expect(dds).toContain("getRecordingPermissionsAsync");
    expect(dds).toContain('PermissionRow kind="notif"');
    // The old dead rows passed a literal on/off with no handler — gone now.
    expect(dds).not.toMatch(/<Toggle label={t\("permissions\.photo"\)}[^>]*on={false} \/>/);
  });

  test("continue button carries a button role", () => {
    expect(dds).toMatch(
      /accessibilityRole="button"\s+accessibilityLabel=\{t\("permissions\.continue"\)\}/,
    );
  });
});

describe("digest proposal row exposes nested actions to VoiceOver", () => {
  test("outer row Pressable opts out of accessibility grouping", () => {
    const digest = read("app/digest.tsx");
    expect(digest).toContain("accessible={false}");
  });
});

describe("settings segmented control announces checked state", () => {
  test("radio option sets both selected and checked", () => {
    const settings = read("app/settings.tsx");
    expect(settings).toContain("accessibilityState={{ selected: on, checked: on }}");
  });
});

describe("keep-all sweep wraps short Korean display copy", () => {
  test("swept components import keepAllKo", () => {
    for (const file of [
      "components/deep-space/SecondbStatusHeader.tsx",
      "components/deep-space/HomeCoachmarks.tsx",
      "components/deep-space/AxisCheck.tsx",
    ]) {
      expect(read(file)).toContain('from "@/lib/i18n/keep-all"');
    }
  });
});
