import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../..");

describe("decode-uri-component security compatibility patch", () => {
  test("pins the fixed release and preserves the CommonJS consumer contract", () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      overrides?: Record<string, Record<string, string>>;
    };
    const packageLock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as {
      packages?: Record<string, { version?: string }>;
    };
    const patch = readFileSync(join(ROOT, "patches/decode-uri-component+0.5.0.patch"), "utf8");

    expect(packageJson.overrides?.["query-string"]?.["decode-uri-component"]).toBe("0.5.0");
    expect(packageLock.packages?.["node_modules/decode-uri-component"]?.version).toBe("0.5.0");
    expect(patch).toContain("+module.exports = function decodeUriComponent");
    expect(patch).toContain('-\t"type": "module",');
  });

  test("loads through query-string and safely handles malformed URI input", () => {
    const decodeUriComponent = require("decode-uri-component") as (value: string) => string;
    const queryString = require("query-string") as {
      parse(value: string): Record<string, string | string[] | null>;
      stringify(value: Record<string, string>): string;
    };

    expect(typeof decodeUriComponent).toBe("function");
    expect(decodeUriComponent("%84%D7%25%88%90")).toBe("%84%D7%%88%90");
    expect(queryString.stringify({ a: "1", b: "x y" })).toBe("a=1&b=x%20y");
    expect(queryString.parse("a=%E0%A4%A&b=x%20y")).toMatchObject({
      a: "%E0%A4%A",
      b: "x y",
    });
  });
});
