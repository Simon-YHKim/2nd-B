import { readFileSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..", "..", "..");

describe("Indonesian home copy", () => {
  test("localizes the constellation kind label", () => {
    const home = JSON.parse(readFileSync(path.join(root, "locales/id/home.json"), "utf8"));

    // The round replaced the loanword "Area" with proper Indonesian. The guard is
    // the line below - the label must not fall back to the English "Domain".
    expect(home.ds.home.kind.domain).toBe("Bidang");
    expect(home.ds.home.kind.domain).not.toBe("Domain");
  });
});
