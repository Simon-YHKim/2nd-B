import { readFileSync } from "node:fs";
import { join } from "node:path";

type LockPackage = {
  version?: string;
};

type PackageLock = {
  packages?: Record<string, LockPackage>;
};

type PackageJson = {
  overrides?: Record<string, string | Record<string, string>>;
};

type LockPackages = NonNullable<PackageLock["packages"]>;

const METRO_SECURITY_BOUNDARIES = [
  ["@expo/metro", "56.0.1"],
  ["metro", "0.84.4"],
  ["metro-config", "0.84.4"],
  ["metro-transform-worker", "0.84.4"],
  ["image-size", "1.2.1"],
] as const;

const METRO_MINIMUM_VERSIONS = [
  ["@expo/metro", [56, 0, 2]],
  ["metro", [0, 84, 5]],
  ["metro-config", [0, 84, 5]],
  ["metro-transform-worker", [0, 84, 5]],
] as const;

const lock = JSON.parse(
  readFileSync(join(process.cwd(), "package-lock.json"), "utf8"),
) as PackageLock;
const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as PackageJson;

function numericVersion(version: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`non-numeric package version: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function atLeast(version: string, minimum: readonly [number, number, number]): boolean {
  const current = numericVersion(version);
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== minimum[index]) return current[index] > minimum[index];
  }
  return true;
}

function isPackagePath(path: string, packageName: string): boolean {
  const packagePath = `node_modules/${packageName}`;
  return path === packagePath || path.endsWith(`/${packagePath}`);
}

function forbiddenMetroEntries(packages: LockPackages): string[] {
  return Object.entries(packages)
    .filter(([path, pkg]) => {
      if (isPackagePath(path, "image-size")) return true;

      const minimum = METRO_MINIMUM_VERSIONS.find(([name]) => isPackagePath(path, name))?.[1];
      if (!minimum) return false;
      return !pkg.version || !atLeast(pkg.version, minimum);
    })
    .map(([path]) => path);
}

function vulnerableUuidEntries(packages: LockPackages): string[] {
  return Object.entries(packages)
    .filter(([path, pkg]) => (
      isPackagePath(path, "uuid")
      && (!pkg.version || !atLeast(pkg.version, [11, 1, 1]))
    ))
    .map(([path]) => path);
}

describe("dependency security pins", () => {
  test("keeps every Metro lock entry secure and removes every image-size entry", () => {
    const packages = lock.packages ?? {};

    for (const [packageName] of METRO_MINIMUM_VERSIONS) {
      expect(Object.keys(packages).some((path) => isPackagePath(path, packageName))).toBe(true);
    }
    expect(forbiddenMetroEntries(packages)).toEqual([]);
  });

  test("keeps every js-yaml lock entry beyond the merge-key CPU advisory", () => {
    const yamlVersions = Object.entries(lock.packages ?? {})
      .filter(([path]) => path === "node_modules/js-yaml" || path.endsWith("/node_modules/js-yaml"))
      .map(([, pkg]) => pkg.version)
      .filter((version): version is string => typeof version === "string");

    expect(yamlVersions.length).toBeGreaterThan(0);
    for (const version of yamlVersions) {
      const [major] = numericVersion(version);
      if (major === 3) expect(atLeast(version, [3, 15, 2])).toBe(true);
      else if (major === 4) expect(atLeast(version, [4, 3, 2])).toBe(true);
      else expect(major).toBeGreaterThan(4);
    }
  });

  test("keeps xcode's CommonJS uuid runtime beyond the buffer advisory", () => {
    expect(manifest.overrides?.xcode).toEqual({ uuid: "11.1.1" });
    expect(vulnerableUuidEntries(lock.packages ?? {})).toEqual([]);
  });

  test("rejects a vulnerable nested uuid lock entry", () => {
    const nestedPath = "node_modules/xcode/node_modules/uuid";
    const packagesWithNestedVulnerability = {
      ...(lock.packages ?? {}),
      [nestedPath]: { version: "11.1.0" },
    };

    expect(vulnerableUuidEntries(packagesWithNestedVulnerability)).toContain(nestedPath);
  });

  test.each(METRO_SECURITY_BOUNDARIES)(
    "rejects a vulnerable nested %s lock entry",
    (packageName, vulnerableVersion) => {
      const nestedPath = `node_modules/transitive/node_modules/${packageName}`;
      const packagesWithNestedVulnerability = {
        ...(lock.packages ?? {}),
        [nestedPath]: { version: vulnerableVersion },
      };

      expect(forbiddenMetroEntries(packagesWithNestedVulnerability)).toContain(nestedPath);
    },
  );
});
