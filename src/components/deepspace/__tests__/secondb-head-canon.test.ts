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

test("events and caller context take priority while home can opt into live expression", () => {
  expect(head).toMatch(/reactExpr \?\? holdExpr/);
  expect(head).toContain("expression ?? hustlekExpressionFor(mood)");
  expect(head).toContain("subscribeExpression");
  expect(head).toContain("subscribeHold");
  expect(head).toContain("blocked: !!eventExpr || !hustlekAllowsLife(portraitExpression)");
  expect(head).toContain("idle = false");
  expect(head).not.toMatch(/pickIdleAction|nextIdleDelayMs|useSecondbTracking|Animated/);
});
