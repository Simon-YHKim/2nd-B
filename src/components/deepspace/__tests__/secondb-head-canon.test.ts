import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The character comes from the supplied HustleK portraits. Preserve the public
// entrypoints and expression channel, not the retired robot geometry.
const head = readFileSync(resolve(__dirname, "../SecondbHead.tsx"), "utf8");
const alias = readFileSync(resolve(__dirname, "../../deep-space/SecondbHead.tsx"), "utf8");

test("all legacy head imports share the HustleK renderer", () => {
  expect(alias).toMatch(/export \{[^}]*SecondbHead[^}]*\} from "@\/components\/deepspace\/SecondbHead"/);
  expect(head).toContain("<HustleKPortrait");
  expect(head).not.toMatch(/secondbHullRects|styles\.(?:eye|mouth|orb)|<Svg/);
});

test("the supplied expression changes for events and caller context, never random idle", () => {
  expect(head).toMatch(/reactExpr \?\? holdExpr/);
  expect(head).toContain("expression ?? hustlekExpressionFor(mood)");
  expect(head).toContain("subscribeExpression");
  expect(head).toContain("subscribeHold");
  expect(head).not.toMatch(/pickIdleAction|nextIdleDelayMs|useSecondbTracking|Animated/);
});
