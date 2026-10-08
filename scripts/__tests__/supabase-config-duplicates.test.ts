import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "../..");
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
function check(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "w1-config-test-"));
  const subdir = join(dir, "supabase");
  mkdirSync(subdir);
  const file = join(subdir, "config.toml");
  writeFileSync(file, source);
  try {
    return spawnSync(process.execPath, [require.resolve("tsx/cli"), join(root, "scripts/check-supabase-auth-config.ts")],
      { cwd: dir, encoding: "utf8", windowsHide: true, timeout: 20_000 });
  } finally {
    unlinkSync(file); rmdirSync(subdir); rmdirSync(dir);
  }
}

test("the real configuration passes and duplicate function scalars fail before deployment", () => {
  expect(check(config).status).toBe(0);
  const duplicate = config.replace("[functions.dashboard-generate]", '[functions.dashboard-generate]\nimport_map = "./functions/import_map.json"');
  const rejected = check(duplicate);
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toContain("Duplicate TOML key: functions.dashboard-generate.import_map");
});
