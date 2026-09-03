import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(SRC, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

describe("own-back registrations follow navigation focus", () => {
  test("MdTopAppBar registers on focus and releases on blur", () => {
    const source = read("components/m3/MdTopAppBar.tsx");

    expect(source).toMatch(/import \{ useFocusEffect \} from "expo-router"/);
    expect(source).toMatch(
      /useFocusEffect\(useCallback\(\(\) => registerOwnBack\(\), \[\]\)\)/,
    );
    expect(source).not.toMatch(/useEffect\(\(\) => registerOwnBack/);
  });

  test("no runtime component mount-scopes registerOwnBack", () => {
    const violations = sourceFiles(SRC)
      .filter((file) => !file.includes(`${path.sep}__tests__${path.sep}`))
      .filter((file) => /useEffect\s*\(\s*\(\)\s*=>\s*registerOwnBack/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));

    expect(violations).toEqual([]);
  });
});
