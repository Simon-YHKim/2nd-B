// check:supabase-auth-config -- guards supabase/config.toml against the partial
// [auth]-push regressions that hit prod twice.
//
// `supabase config push` rewrites the WHOLE auth group from the committed file:
// every undeclared field resets to a CLI default, and in a non-TTY shell the
// confirm auto-accepts. On 2026-07-16 that reset site_url -> localhost and turned
// Confirm-Email off; on 2026-07-18 it disabled the Apple provider and tried to
// enable paid storage-vector buckets (402). So the committed config.toml IS the
// production truth -- this lint pins the invariants that must never regress in it,
// catching a bad edit before it is pushed.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG = join(process.cwd(), "supabase", "config.toml");
const PROD_SITE_URL = "https://simon-yhkim.github.io/2nd-B/";

// Flat TOML-ish reader: map "section.key" -> raw scalar value (same-line only,
// which is all these invariants need; multi-line arrays are ignored).
function readScalars(toml: string): Map<string, string> {
  const out = new Map<string, string>();
  let section = "";
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      section = sec[1];
      continue;
    }
    const kv = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (kv) out.set(`${section}.${kv[1]}`, kv[2].trim());
  }
  return out;
}

const toml = readFileSync(CONFIG, "utf8");
const s = readScalars(toml);
const errors: string[] = [];

function expect(key: string, want: string): void {
  const got = s.get(key);
  if (got !== want) errors.push(`[${key}] expected ${want}, got ${got ?? "(missing)"}`);
}

// auth: enabled, production site_url (NOT localhost), Confirm-Email ON.
expect("auth.enabled", "true");
expect("auth.site_url", `"${PROD_SITE_URL}"`);
if ((s.get("auth.site_url") ?? "").includes("localhost")) {
  errors.push("auth.site_url points at localhost -- the 2026-07-16 reset. Must be the prod URL.");
}
expect("auth.email.enable_confirmations", "true"); // #1009 depends on it; the reset turned it off
// storage vector buckets are paid; a CLI-default enable dies with 402 on push.
expect("storage.vector.enabled", "false");

if (errors.length > 0) {
  console.error("SUPABASE AUTH-CONFIG FAIL  supabase/config.toml regressed (partial-push hazard):");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  "SUPABASE AUTH-CONFIG PASS  config.toml: auth enabled, prod site_url, Confirm-Email on, vector off",
);
