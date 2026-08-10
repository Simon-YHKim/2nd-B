import { readFileSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..", "..", "..");

describe("Indonesian home copy", () => {
  test("localizes the constellation kind label", () => {
    const home = JSON.parse(readFileSync(path.join(root, "locales/id/home.json"), "utf8"));

    expect(home.ds.home.kind.domain).toBe("Area");
    expect(home.ds.home.kind.domain).not.toBe("Domain");
  });
});
