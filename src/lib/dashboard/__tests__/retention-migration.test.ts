import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = (name: string) => readFileSync(resolve(__dirname, "../../../../db/migrations", name), "utf8").replace(/\r\n/g, "\n");
const heartbeat = migration("0245_dashboard_retention_heartbeat.sql");
function definition(sql: string, name: string): string {
  const match = sql.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(.*?END \\$\\$;`, "s"));
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
}

// These bodies are copied for compatibility with the running 0244 Edge.
// Every other line, including terminal/quota/cache rules, must stay identical.
test.each([
  ["dashboard_generation_request", "0238_dashboard_terminal_states.sql"],
  ["dashboard_generation_dispatch", "0236_dashboard_generation.sql"],
])("0245 adds only freshness to deployed %s", (name, baseline) => {
  const next = definition(heartbeat, name);
  expect(next.match(/^  IF NOT public\.dashboard_generation_retention_ready\(\).*\n/gm)).toHaveLength(1);
  expect(next.replace(/^  IF NOT public\.dashboard_generation_retention_ready\(\).*\n/gm, ""))
    .toBe(definition(migration(baseline), name));
});

test("0245 leaves deployed completion definitions and G2-06 state unchanged", () => {
  const names = [...heartbeat.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.([a-z_]+)\(/g)].map((match) => match[1]);
  expect(names.sort()).toEqual([
    "dashboard_generation_dispatch", "dashboard_generation_request",
    "dashboard_generation_retention_ready", "purge_dashboard_generation",
  ]);
  expect(heartbeat).not.toMatch(/ADD COLUMN|_v2\(|pre_dispatch_|attempt_count|begin_classification/);
});
