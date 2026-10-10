// Explicit disposable loopback database only. Never consumes a remote DB URL.
// node scripts/test-weather-sql.mjs 55439 weather_local weather_test_ci
import { spawn, spawnSync } from "node:child_process";
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
const args = ["-X", "--no-password", "-h", "127.0.0.1", "-p", port,
  "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"];
const result = spawnSync("psql", args, {
  input: sql, encoding: "utf8", env, windowsHide: true, timeout: 60_000,
});
process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  const ownerA = "26101146-0000-4000-8000-000000000011";
  const ownerB = "26101146-0000-4000-8000-000000000012";
  const query = (statement) => new Promise((done, reject) => {
    const child = spawn("psql", [...args, "-At"], { env, windowsHide: true, timeout: 20_000 });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => done({ code, out, err }));
    child.stdin.end(`SET request.jwt.claim.role='service_role';\n${statement}`);
  });
  const checked = async (statement) => {
    const r = await query(statement);
    if (r.code !== 0) throw new Error(`Weather SQL failed: ${r.err}`);
    return r.out;
  };
  await checked(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    ('${ownerA}','race-a@example.invalid',now()),('${ownerB}','race-b@example.invalid',now());
    INSERT INTO public.users(id,email,birth_date) VALUES
    ('${ownerA}','race-a@example.invalid','1990-01-01'),('${ownerB}','race-b@example.invalid','1990-01-01');
    SELECT public.weather_consent('${ownerA}','grant',0);
    SELECT public.weather_consent('${ownerB}','grant',0);`);
  const race = (owner, action = "status") => query(`BEGIN;
    SELECT public.weather_consent('${owner}','${action}',0);
    SELECT pg_sleep(0.3); COMMIT;`);
  for (const limit of ["user", "second", "minute", "day"]) {
    await checked(`UPDATE public.weather_consent_state SET consent_check_count=${limit === "user" ? 119 : 0};
      UPDATE public.public_data_provider_quota_daily SET calls=${limit === "day" ? 19999 : 0},
      weather_check_times=${limit === "second" ? "array_fill(clock_timestamp()+interval '1 minute',ARRAY[19])"
        : limit === "minute" ? "array_fill(clock_timestamp()-interval '10 seconds',ARRAY[119])" : "'{}'::timestamptz[]"}
      WHERE provider='weather_consent';`);
    const results = await Promise.all([race(ownerA), race(limit === "user" ? ownerA : ownerB)]);
    if (results.filter((r) => r.code === 0).length !== 1 ||
        !results.find((r) => r.code !== 0)?.err.includes("weather_limited")) {
      throw new Error(`Concurrent ${limit} quota exceeded: ${JSON.stringify(results)}`);
    }
    const total = await checked("SELECT calls FROM public.public_data_provider_quota_daily WHERE provider='weather_consent' AND usage_day=current_date;");
    if (!total.trim().endsWith(limit === "day" ? "20000" : "1")) throw new Error(`Concurrent ${limit} accounting failed`);
    process.stdout.write(`PASS: concurrent ${limit} quota admits exactly one of two requests\n`);
  }
  // Every quota is exhausted; two stale withdrawals must both succeed, one event.
  await checked(`UPDATE public.weather_consent_state SET consent_check_count=120;
    UPDATE public.public_data_provider_quota_daily SET calls=20000,
      weather_check_times=array_fill(clock_timestamp(),ARRAY[120]) WHERE provider='weather_consent';`);
  const withdrawals = await Promise.all([race(ownerA, "revoke"), race(ownerA, "revoke")]);
  if (withdrawals.some((r) => r.code !== 0)) throw new Error("Concurrent stale revoke failed");
  const revoked = await checked(`SELECT enabled=false AND revision=2 AND
    (SELECT count(*) FROM public.weather_access_events WHERE user_id='${ownerA}' AND event='revoke')=1
    FROM public.weather_consent_state WHERE user_id='${ownerA}';`);
  if (!revoked.trim().endsWith("t")) throw new Error("Concurrent revokes wrote more than one change");
  process.stdout.write("PASS: concurrent stale revokes bypass all quotas and write exactly one event\n");
}
