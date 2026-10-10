// Invoked only by the disposable loopback SQL runner. Execute the real Edge
// against separate PostgreSQL transactions; never contact auth or a provider.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripTypeScriptTypes } from "node:module";

export async function testConsentAdmission({ root, query, checked, ownerA, ownerB }) {
  function moduleAt(file, names, dependencies = {}) {
    const exports = {};
    // Node's built-in transform keeps the SQL CI job independent of npm install.
    const code = stripTypeScriptTypes(readFileSync(resolve(root, file), "utf8"), { mode: "transform" })
      .replace(/^import \{([^}]+)\} from (['"][^'"]+['"]);/gm, "const {$1} = require($2);")
      .replace(/^export /gm, "") + `\nObject.assign(exports, {${names.join(",")}});`;
    new Function("exports", "require", code)(exports, (name) => {
      assert.ok(name in dependencies, `Unexpected import ${name}`);
      return dependencies[name];
    });
    return exports;
  }
  const create = moduleAt("supabase/functions/weather/handler.ts", ["createWeatherHandler"], {
    "../_shared/request-json.ts": moduleAt("supabase/functions/_shared/request-json.ts", ["readJsonObject", "readBodyBytes"]),
    "./metar.ts": moduleAt("supabase/functions/weather/metar.ts", ["parseMetarCsv"]),
  }).createWeatherHandler;
  const sqlErrors = [];
  const handler = create({
    enabled: true, userAgent: "local-test", authenticate: async (owner) => owner,
    fetch: async () => { throw new Error("External fetch forbidden"); },
    rpc: async (name, args) => {
      assert.equal(name, "weather_consent");
      assert.ok([ownerA, ownerB].includes(args.p_user_id));
      assert.ok(["grant", "status", "revoke"].includes(args.p_action));
      assert.ok(args.p_revision === null || Number.isSafeInteger(args.p_revision));
      const r = await query(`SELECT public.weather_consent('${args.p_user_id}','${args.p_action}',${args.p_revision ?? "NULL"});`);
      if (r.code === 0) return { data: JSON.parse(r.out.trim().split("\n").at(-1)), error: null };
      // psql verbose output proves the actual SQLSTATE, not a synthetic HTTP code.
      const code = /(?:ERROR:\s+)(PT429|PT409|42501):/.exec(r.err)?.[1];
      assert.ok(code, r.err);
      sqlErrors.push(code);
      return { data: null, error: { code } };
    },
  });
  const send = (owner, action = "grant", revision = 0) => handler(new Request("https://fixture.invalid/weather", {
    method: "POST", headers: { authorization: `Bearer ${owner}`, "content-type": "application/json" },
    body: JSON.stringify({ action, revision, locale: "en", contract: "weather-v1-261007" }),
  }));
  const prime = (limit, remaining = 1) => checked(`
    UPDATE public.weather_consent_state SET consent_check_count=${limit === "user" ? 120 - remaining : 0}, consent_check_day=current_date;
    UPDATE public.public_data_provider_quota_daily SET calls=${limit === "day" ? 20000 - remaining : 0},
      weather_check_times=${limit === "second" ? `array_fill(clock_timestamp()+interval '1 minute',ARRAY[${20 - remaining}])`
        : limit === "minute" ? `array_fill(clock_timestamp()-interval '10 seconds',ARRAY[${120 - remaining}])` : "'{}'::timestamptz[]"}
      WHERE provider='weather_consent';`);
  await checked(`UPDATE public.users SET birth_date='2012-01-01' WHERE id='${ownerB}';`);
  const ineligibleRevision = Number((await checked(`SELECT revision FROM public.weather_consent_state WHERE user_id='${ownerB}';`)).trim().split("\n").at(-1));
  for (const [kind, owner, revision, denied] of [["stale", ownerA, 0, 409], ["ineligible", ownerB, ineligibleRevision, 403]]) {
    const unchanged = () => checked(`SELECT jsonb_build_array(s.revision,s.enabled,s.updated_at,u.privacy_prefs,
      (SELECT count(*) FROM public.weather_access_events WHERE user_id='${owner}'))
      FROM public.weather_consent_state s JOIN public.users u ON u.id=s.user_id WHERE s.user_id='${owner}';`);
    const before = await unchanged();
    await prime("user", 2);
    sqlErrors.length = 0;
    const repeated = [];
    for (let i = 0; i < 3; i++) repeated.push((await send(owner, "grant", revision)).status);
    assert.deepEqual(repeated, [denied, denied, 429], `${kind} repeated admission`);
    assert.ok(sqlErrors.includes("PT429"), `${kind} must reach actual PT429`);
    assert.equal((await checked(`SELECT consent_check_count FROM public.weather_consent_state WHERE user_id='${owner}';`)).trim().split("\n").at(-1), "120");
    assert.equal(await unchanged(), before, `${kind} denial changed consent`);
    console.log(`PASS: repeated ${kind} grants consume committed admissions then reach PT429`);
    for (const limit of ["user", "second", "minute", "day"]) {
      await prime(limit);
      sqlErrors.length = 0;
      const statuses = (await Promise.all([send(owner, "grant", revision), send(owner, "grant", revision)])).map((r) => r.status).sort();
      assert.deepEqual(statuses, [denied, 429], `${kind} concurrent ${limit} admission`);
      assert.ok(sqlErrors.includes("PT429"));
      const total = await checked("SELECT calls FROM public.public_data_provider_quota_daily WHERE provider='weather_consent' AND usage_day=current_date;");
      assert.equal(total.trim().split("\n").at(-1), limit === "day" ? "20000" : "1");
      assert.equal(await unchanged(), before);
      console.log(`PASS: concurrent ${kind} ${limit} admits exactly one denied attempt`);
    }
  }
  await prime("user", 120);
  const currentRevision = Number((await checked(`SELECT revision FROM public.weather_consent_state WHERE user_id='${ownerA}';`)).trim().split("\n").at(-1));
  assert.equal((await send(ownerA, "grant", currentRevision)).status, 200);
  await checked(`UPDATE public.weather_consent_state SET consent_check_count=120;
    UPDATE public.public_data_provider_quota_daily SET calls=20000,weather_check_times=array_fill(clock_timestamp(),ARRAY[120]) WHERE provider='weather_consent';`);
  const counters = () => checked("SELECT jsonb_agg(row_to_json(q)) FROM public.public_data_provider_quota_daily q WHERE provider='weather_consent'; SELECT jsonb_agg(jsonb_build_array(user_id,consent_check_day,consent_check_count) ORDER BY user_id) FROM public.weather_consent_state;");
  const before = await counters();
  const responses = await Promise.all([send(ownerA, "revoke"), send(ownerB, "revoke")]);
  for (const response of responses) { assert.equal(response.status, 200); assert.equal((await response.json()).enabled, false); }
  assert.equal(await counters(), before, "withdrawal must not consume quotas");
  console.log("PASS: Edge withdrawal succeeds after every quota is exhausted, counters unchanged");
}
