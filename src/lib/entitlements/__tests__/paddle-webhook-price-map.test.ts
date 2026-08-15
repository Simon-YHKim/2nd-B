// Structural guard for the paddle-webhook price->tier map.
//
// A tier has TWO Paddle prices (monthly + yearly) on one product. The first
// version of the map read one env var per tier and stored a single id, so a
// yearly purchase resolved to no tier, fell through to `ignored: no_op`, and
// the payer stayed free — the exact BLOCKER-1 the webhook exists to prevent.
// The function is Deno (edge runtime) so it cannot be imported here; assert on
// its source, the same idiom as ops-brief-output-budget.test.ts.

import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "..", "supabase", "functions", "paddle-webhook", "index.ts"),
  "utf8",
);

describe("paddle-webhook price->tier map", () => {
  test("each tier env var is parsed as a comma-separated list of price ids", () => {
    expect(SRC).toMatch(/\.split\(','\)/);
    // A single-id read (map[Deno.env.get(...)] = tier) would silently drop yearly.
    expect(SRC).not.toMatch(/const id = Deno\.env\.get\(env\);\s*if \(id\) map\[id\] = tier;/);
  });

  test("both sellable tiers are mapped", () => {
    expect(SRC).toMatch(/put\('PADDLE_PRICE_CORTEX', 'cortex'\)/);
    expect(SRC).toMatch(/put\('PADDLE_PRICE_BRAIN', 'brain'\)/);
  });

  // soma (Lifetime) was retired 2026-07-29 and has no Paddle product, so no
  // price id can resolve to it. Pin that so it is not re-added by habit.
  test("the retired soma tier is not mapped", () => {
    expect(SRC).not.toMatch(/PADDLE_PRICE_SOMA/);
    expect(SRC).not.toMatch(/put\([^)]*'soma'\)/);
  });
});
