import { readFileSync } from "node:fs";
import path from "node:path";

describe("visible trust copy", () => {
  test("plans copy avoids unsupported local-device storage claims", () => {
    const root = path.resolve(__dirname, "../../..");
    const en = readFileSync(path.join(root, "locales/en/plans.json"), "utf8");
    const ko = readFileSync(path.join(root, "locales/ko/plans.json"), "utf8");

    expect(en).not.toMatch(/on your device|local brain|stays on your device/i);
    expect(ko).not.toMatch(/기기에|로컬/);
  });

  test("intro copy does not exclude saved sources", () => {
    const root = path.resolve(__dirname, "../../..");
    const files = [
      "locales/en/common.json",
      "locales/ko/common.json",
      "src/app/manual.tsx",
    ].map((file) => readFileSync(path.join(root, file), "utf8"));
    const text = files.join("\n");

    expect(text).not.toMatch(/built only from what you write/i);
    expect(text).not.toMatch(/쓴 것들로만/);
    expect(text).toMatch(/what you write and save/i);
    expect(text).toMatch(/쓰고 저장한 것들/);
  });
});
