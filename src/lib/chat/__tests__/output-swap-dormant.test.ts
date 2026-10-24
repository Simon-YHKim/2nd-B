import fs from "node:fs";
import path from "node:path";
import { transformSync } from "@babel/core";

const settlement = "src/lib/chat/output-swap-settlement.ts";
const state = "src/lib/chat/output-swap-state.ts";
const conversation = "src/lib/chat/conversation-turn.ts";
test("T40 has zero production entrances through screens, helpers, routers or re-exports", () => {
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
      const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");
      if ([settlement, state, conversation].includes(relative)) continue;
      const source = fs.readFileSync(file, "utf8");
      expect({ file: relative, entrance: /output-swap-(?:settlement|state)|\b(createSwapSettlement|createSwapCandidate|settleOutputSwap)\b/.test(source) })
        .toEqual({ file: relative, entrance: false });
    }
  };
  visit(path.resolve("src"));
});

test.each(["web", "android"].flatMap(platform => [settlement, state, conversation, "src/lib/chat/retry-failed.ts", "src/app/secondb.tsx", "src/lib/llm/boundary.ts", "src/lib/llm/types.ts"].map(file => [platform, file])))(
  "%s release Babel compiles %s", (platform, file) => {
    const filename = path.resolve(file);
    const caller = { name: "metro", platform, isDev: false };
    const result = transformSync(fs.readFileSync(filename, "utf8"), {
      filename, configFile: path.resolve("babel.config.js"), babelrc: false,
      caller,
    });
    expect(result?.code).toBeTruthy();
  },
);
