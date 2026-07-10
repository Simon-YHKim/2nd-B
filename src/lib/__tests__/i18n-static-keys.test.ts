import fs from "node:fs";
import path from "node:path";

// Every static t("...") call must resolve to something in the en bundle (en is the
// fallbackLng, so a key missing there renders as its raw path on screen).
//
// check-i18n-keys (C7) cannot catch this class: it compares locales to EACH OTHER,
// so a key missing from all five locales is perfectly symmetric and parity passes.
// It shipped twice before this guard existed - the /insights domain labels came
// close (#879), and settings' language picker rendered "language.body" and
// "Español language.betaTag" literally on the live emulator screen.
//
// Scope, stated honestly:
//   - literal keys only; dynamic keys (t("ds.dock." + key)) are invisible to a
//     static scan and are skipped (the trailing-dot filter below),
//   - a file's unprefixed keys resolve against the UNION of every namespace the
//     file declares via useTranslation (react-i18next actually resolves against
//     ns[0] per hook, so a key found only in a sibling hook's ns could still
//     render raw at runtime - this guard under-claims rather than false-alarms),
//   - "ns:key" prefixed calls are always checked.

const SRC = path.resolve(__dirname, "../..");
const LOCALES_EN = path.resolve(SRC, "../locales/en");
const DEFAULT_NS = "common"; // i18n init: defaultNS "common"

type Bundle = Record<string, unknown>;
const EN: Record<string, Bundle> = {};
for (const f of fs.readdirSync(LOCALES_EN)) {
  if (f.endsWith(".json")) {
    EN[path.basename(f, ".json")] = JSON.parse(fs.readFileSync(path.join(LOCALES_EN, f), "utf8")) as Bundle;
  }
}

/** Key resolves when its path reaches a string, an object (returnObjects), or a plural/context variant. */
function resolves(ns: string, key: string): boolean {
  let cur: unknown = EN[ns];
  if (cur === undefined) return false;
  const parts = key.split(".");
  for (let i = 0; i < parts.length; i++) {
    if (cur !== null && typeof cur === "object" && parts[i] in (cur as Bundle)) {
      cur = (cur as Bundle)[parts[i]];
    } else if (cur !== null && typeof cur === "object" && i === parts.length - 1) {
      return Object.keys(cur as Bundle).some((k) => k.startsWith(parts[i] + "_"));
    } else {
      return false;
    }
  }
  return true;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "__tests__") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

test("every static t() key resolves in the en bundle", () => {
  const missing: string[] = [];

  for (const file of sourceFiles(SRC)) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("useTranslation")) continue;
    // A file-local `const t = ...` (e.g. ImportHubScreen's COPY-table helper)
    // shadows i18next's t; its calls are not translation lookups. Static scoping
    // is out of reach here, so skip the whole file rather than guess.
    if (/\bconst t\s*=/.test(src)) continue;

    const declared = new Set<string>();
    for (const m of src.matchAll(/useTranslation\(\s*"([^"]+)"\s*\)/g)) declared.add(m[1]);
    for (const m of src.matchAll(/useTranslation\(\s*\[([^\]]+)\]/g)) {
      for (const q of m[1].matchAll(/"([^"]+)"/g)) declared.add(q[1]);
    }
    if (/useTranslation\(\s*\)/.test(src)) declared.add(DEFAULT_NS);

    for (const m of src.matchAll(/\bt\(\s*"([^"]+)"/g)) {
      const raw = m[1];
      if (raw.endsWith(".")) continue; // dynamic prefix, not statically checkable
      if (raw.includes(":")) {
        const [ns, key] = raw.split(/:(.+)/);
        if (!resolves(ns, key)) missing.push(`${path.relative(SRC, file)} :: ${ns}:${key}`);
      } else if (declared.size > 0) {
        if (![...declared].some((ns) => resolves(ns, raw))) {
          missing.push(`${path.relative(SRC, file)} :: [${[...declared].join(",")}] ${raw}`);
        }
      }
    }
  }

  expect(missing).toEqual([]);
});
