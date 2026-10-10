import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function configure(enabled: string, modelAvailable: boolean, retention: unknown = [{ ready: true }], retentionOk = true) {
  const stub = `globalThis.fetch=async(url,init)=>{
    if(String(url).endsWith('/database/query')) {
      if(JSON.parse(init.body).query!=='SELECT public.dashboard_generation_retention_ready() AS ready;') throw Error('retention query');
      console.log('retention-checked'); return {ok:${retentionOk},status:503,json:async()=>(${JSON.stringify(retention)})};
    }
    if(String(url).includes('/models/')) return {ok:${modelAvailable},json:async()=>({id:'claude-sonnet-5'})};
    const settings=JSON.parse(init.body);
    if(settings.length!==3 || settings.some(row=>!row.name.startsWith('DASHBOARD_'))) throw Error('scope');
    console.log('configuration-written');return {ok:true};
  };`;
  return spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(stub)}`,
    resolve(__dirname, "../dashboard-runtime-config.mjs"), "configure"], {
    encoding: "utf8", env: { ...process.env, PROJECT_REF: "a".repeat(20), SUPABASE_ACCESS_TOKEN: "private-token-sentinel",
      DASHBOARD_ENABLED: enabled, DASHBOARD_MODEL: "claude-sonnet-5", DASHBOARD_CRON_SECRET: "s".repeat(40), ANTHROPIC_API_KEY: "private-key-sentinel" },
  });
}
test("model preflight failure cannot activate the backend", () => {
  const run = configure("true", false);
  expect(run.status).not.toBe(0); expect(run.stdout).not.toContain("configuration-written");
});
test("an emergency OFF does not depend on provider availability", () => {
  const run = configure("false", false);
  expect(run.status).toBe(0); expect(run.stdout).toContain("enabled=false");
  expect(run.stdout + run.stderr).not.toContain("private-");
  expect(run.stdout).not.toContain("retention-checked");
});

test.each([[], null, [{ ready: false }], [{ ready: null }], [{ ready: "true" }], [{ ready: true }, { ready: true }]])(
  "missing, stale or malformed retention cannot activate generation: %j", (retention) => {
    const run = configure("true", true, retention);
    expect(run.status).not.toBe(0); expect(run.stdout).not.toContain("configuration-written");
    expect(run.stdout + run.stderr).not.toContain("private-");
  },
);
test("a failed retention query cannot activate generation", () => {
  const run = configure("true", true, [{ ready: true }], false);
  expect(run.status).not.toBe(0); expect(run.stdout).not.toContain("configuration-written");
});
test("reviewed settings activate after model preflight without printing credentials", () => {
  const run = configure("true", true);
  expect(run.status).toBe(0); expect(run.stdout).toContain("configuration-written");
  expect(run.stdout + run.stderr).not.toContain("private-");
});
