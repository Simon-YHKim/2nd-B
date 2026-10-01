import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Resolve real SDK imports and Deno types; Jest's SDK stubs cannot check them.
// `check` downloads public modules but never starts a handler or calls a backend.
const root = fileURLToPath(new URL("../", import.meta.url));
const entries = readdirSync(new URL("../supabase/functions/", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .filter((entry) => readdirSync(new URL(`../supabase/functions/${entry.name}/`, import.meta.url))
    .includes("index.ts"))
  .map((entry) => `supabase/functions/${entry.name}/index.ts`)
  .sort();
if (entries.length === 0) throw new Error("No Edge entrypoints found");

const result = spawnSync(process.env.DENO_BINARY || "deno", [
  "check", "--no-config", "--node-modules-dir=none", "--no-lock", ...entries,
], { cwd: root, stdio: "inherit", env: { ...process.env, DENO_NO_UPDATE_CHECK: "1" } });
if (result.error) {
  console.error(`Cannot run Deno: ${result.error.message}. Install Deno 2.9.7 or set DENO_BINARY.`);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Edge runtime check: ${entries.length} entrypoints passed (no handlers executed).`);
