import { readFileSync } from "fs";
import path from "path";

const root = path.resolve(__dirname, "..", "..", "..");

describe("Indonesian home copy", () => {
  test("localizes the constellation kind label", () => {
    const home = JSON.parse(readFileSync(path.join(root, "locales/id/home.json"), "utf8"));

    // Z62 / T47: this label belongs to the seven stars, not the life areas.
    // Keep it Indonesian and distinct from the old life-area label.
    expect(home.ds.home.kind.domain).toBe("Bintang");
    expect(home.ds.home.kind.domain).not.toBe("Bidang");
  });
});
