import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Z122 (Simon 2026-10-14, Q-261014-01): below 354px the social sign-in buttons sit one per line;
// from 354px they stay in two columns. The rule is carried by the buttons' minimum width alone:
// two buttons fit side by side only while the row is at least 2 x minWidth + gap wide.
//
// Measured on 8081 before the change (2026-10-14): the row is the viewport minus 48px on the
// sign-in screen and minus 52px on the sign-up screen; the gap between the buttons is 6px on the
// sign-in screen (spacing s3) and 4px on the sign-up screen (spacing s2).
//   sign-in: 2 x 150 + 6 = 306 = 354 - 48
//   sign-up: 2 x 149 + 4 = 302 = 354 - 52
// So the two screens use different numbers to switch at the same viewport width. If the side
// padding or the gap of either screen changes, these numbers have to be measured again.
const read = (file: string): string =>
  readFileSync(resolve(__dirname, "../../../screens/deepspace", file), "utf8");

const providersStyle = (screen: string): string =>
  screen.slice(screen.indexOf("  providers: {"), screen.indexOf("  providerRoot: {"));

describe("provider buttons at narrow widths (Z122)", () => {
  const signIn = read("dds-sign-in-screen.tsx");
  const signUp = read("dds-sign-up-screen.tsx");

  test("the row wraps, and a button grows to fill a line it has to itself", () => {
    for (const screen of [signIn, signUp]) {
      const providers = providersStyle(screen);
      expect(providers).toContain('flexDirection: "row"');
      expect(providers).toContain('flexWrap: "wrap"');
      expect(screen).toMatch(/providerRoot: \{ flexBasis: "47%", flexGrow: 1, flexShrink: 1, minWidth: \d+ \}/);
    }
  });

  test("each screen keeps the gap and the minimum width that put the switch at 354px", () => {
    expect(providersStyle(signIn)).toContain("gap: m3.spacing.s3");
    expect(providersStyle(signUp)).toContain("gap: m3.spacing.s2");
    expect(signIn).toContain('providerRoot: { flexBasis: "47%", flexGrow: 1, flexShrink: 1, minWidth: 150 },');
    expect(signUp).toContain('providerRoot: { flexBasis: "47%", flexGrow: 1, flexShrink: 1, minWidth: 149 },');
  });

  test("every provider button on both screens takes that style", () => {
    expect(signIn.match(/rootStyle=\{styles\.providerRoot\}/g)).toHaveLength(1);
    expect(signUp.match(/rootStyle=\{styles\.providerRoot\}/g)).toHaveLength(1);
    expect(signIn).toContain("signInProviders.map((provider)");
    expect(signUp).toContain("visibleProviders.map((provider)");
  });
});
