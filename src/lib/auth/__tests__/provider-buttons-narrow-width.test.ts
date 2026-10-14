import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROVIDER_ONE_COLUMN_BELOW, providerColumns } from "../provider-columns";

// Z122 (Simon 2026-10-14, Q-261014-01): below 354px the social sign-in buttons sit one per line;
// from 354px they stay in two columns. The rule is one pure function of the viewport width that
// both screens ask, so it does not depend on either screen's padding or gap.
const root = resolve(__dirname, "../../../..");
const read = (file: string): string => readFileSync(resolve(root, file), "utf8").replace(/\r\n/g, "\n");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(to, start + from.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};
const SIGN_IN = "src/screens/deepspace/dds-sign-in-screen.tsx";
const SIGN_UP = "src/screens/deepspace/dds-sign-up-screen.tsx";
const SWITCH = "rootStyle={columns === 1 ? styles.providerRootOne : styles.providerRoot}";

describe("provider buttons at narrow widths (Z122)", () => {
  test("one per line below 354px, two columns from 354px", () => {
    expect(PROVIDER_ONE_COLUMN_BELOW).toBe(354);
    expect([320, 353, 353.9].map(providerColumns)).toEqual([1, 1, 1]);
    expect([354, 357, 360, 390, 412, 1280].map(providerColumns)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  test("the screens read the viewport width through that function only", () => {
    expect(read("src/components/auth/ProviderBrandIcon.tsx")).toContain("return providerColumns(useWindowDimensions().width);");
    for (const file of [SIGN_IN, SIGN_UP]) {
      const screen = read(file);
      expect(screen).toContain('import { ProviderBrandIcon, useProviderColumns } from "@/components/auth/ProviderBrandIcon";');
      expect(screen.match(/const columns = useProviderColumns\(\);/g)).toHaveLength(1);
      expect(screen.match(/useProviderColumns/g)).toHaveLength(2);
      expect(screen).not.toContain("useWindowDimensions");
      expect(screen).not.toContain("PROVIDER_ONE_COLUMN_BELOW");
      // The two styles are used once each, in the one expression that chooses between them.
      expect(screen.split(SWITCH)).toHaveLength(2);
      expect(screen.match(/styles\.providerRootOne/g)).toHaveLength(1);
      expect(screen.match(/styles\.providerRoot\}/g)).toHaveLength(1);
    }
  });

  test("sign-in: the row draws every provider with the one button that applies the rule", () => {
    const screen = read(SIGN_IN);
    // The hook runs at the top of the screen component, before its first early return.
    const body = between(screen, "export function DeepSpaceSignInDesignScreen() {", '  if (branch.kind === "deletion") {');
    expect(body).toContain("  const columns = useProviderColumns();\n");
    const row = between(screen, "<View style={styles.providers}>", "</View>");
    expect(row).toContain("signInProviders.map((provider)");
    expect(row.match(/<PixelPressable/g)).toHaveLength(1);
    expect(row.split(SWITCH)).toHaveLength(2);
  });

  test("sign-up: the OAuth providers and Naver both go through the one component that applies the rule", () => {
    const screen = read(SIGN_UP);
    const button = between(screen, "function ProviderButton({", "\n}\n");
    expect(button).toContain("  const columns = useProviderColumns();\n");
    expect(button.split(SWITCH)).toHaveLength(2);
    const row = between(screen, "<View style={styles.providers}>", "</View>");
    expect(row).toContain("visibleProviders.map((provider)");
    expect(row).toContain("{naverEnabled ? (");
    expect(row.match(/<ProviderButton/g)).toHaveLength(2);
    expect(row).not.toContain("<PixelPressable");
    expect(row).not.toContain("rootStyle=");
  });

  test("one per line means the full row; two columns keep the earlier style", () => {
    for (const file of [SIGN_IN, SIGN_UP]) {
      const screen = read(file);
      const providers = between(screen, "  providers: {", "  providerRoot: {");
      expect(providers).toContain('flexDirection: "row"');
      expect(providers).toContain('flexWrap: "wrap"');
      expect(screen).toContain('providerRoot: { flexBasis: "47%", flexGrow: 1, flexShrink: 1, minWidth: 112 },');
      expect(screen).toContain('providerRootOne: { flexBasis: "100%", flexGrow: 1, flexShrink: 1, minWidth: 112 },');
    }
  });
});
