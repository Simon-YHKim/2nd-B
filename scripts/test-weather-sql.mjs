// Explicit disposable loopback database only. Never consumes a remote DB URL.
// node scripts/test-weather-sql.mjs 55439 weather_local weather_test_ci
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const [port, user, database] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(port ?? "") || Number(port) > 65535 ||
    !/^weather_[a-z0-9_]+$/.test(user ?? "") || !/^weather_test[a-z0-9_]*$/.test(database ?? "")) {
  throw new Error("Use an explicit disposable weather_test database and weather_ user on localhost.");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "db/tests/weather_location_bootstrap.sql");
const sql = readFileSync(fixture, "utf8").replace(/^\\ir (.+)$/gm,
  (_match, path) => `\\ir '${resolve(dirname(fixture), path).replaceAll("\\", "/")}'`);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key) || key === "PGPASSWORD"));
const result = spawnSync("psql", ["-X", "--no-password", "-h", "127.0.0.1", "-p", port,
  "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"], {
  input: sql, encoding: "utf8", env, windowsHide: true, timeout: 60_000,
});
process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
