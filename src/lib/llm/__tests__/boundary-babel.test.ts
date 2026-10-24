import { transformSync } from "@babel/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ts-jest does not exercise Metro's TypeScript transform.
test.each(["web", "android"])("boundary compiles with the release %s Babel config", platform => {
  const filename = resolve("src/lib/llm/boundary.ts");
  const caller = { name: "metro", platform, isDev: false };
  const result = transformSync(readFileSync(filename, "utf8"), {
    filename,
    configFile: resolve("babel.config.js"),
    babelrc: false,
    caller,
  });
  expect(result?.code).toContain("LlmConsentError");
});
