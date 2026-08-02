import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..", "..", "..");

const read = (file: string): string => readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

describe("visible development copy", () => {
  test("deep-space hub preview does not expose TODO copy after sending", () => {
    const source = read("src/screens/deepspace/DeepSpaceHubDockScreen.tsx");

    expect(source).not.toContain("TODO입니다");
    expect(source).toContain("이 미리보기에서는 대화가 저장되지 않습니다.");
  });
});
