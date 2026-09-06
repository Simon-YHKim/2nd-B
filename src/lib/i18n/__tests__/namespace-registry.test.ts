/**
 * The i18n namespace registry has to agree with three things at once, and until
 * 2026-09-06 nothing checked that it did.
 *
 * `locales/<lc>/index.json` shipped in all five locales, `src/app/index.tsx:245`
 * called `useTranslation("index")` for 28 keys, and `NAMESPACES` never listed
 * `index` (git log -S '"index"' on src/lib/i18n/index.ts finds no commit that
 * ever added it, so it was missed when c2634882 routed the home chrome through
 * t()). i18next therefore had no such bundle and every one of those calls
 * rendered the raw key name. Nothing failed: no exception, no CI signal, just
 * "villageQuiet" where a sentence belonged, on the EXPO_PUBLIC_UI=legacy home
 * that CLAUDE.md keeps as the rollback path.
 *
 * The `satisfies Record<AvailableUiLocale, Record<Namespace, unknown>>` in
 * index.ts already catches a namespace that is registered but missing from a
 * locale. It cannot catch the reverse, because a bundle nobody imports is
 * invisible to the type system. These three assertions close that direction.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { NAMESPACES } from "../index";

const ROOT = join(__dirname, "..", "..", "..", "..");
const LOCALES = join(ROOT, "locales");
const SRC = join(ROOT, "src");

function localeDirs(): string[] {
  return readdirSync(LOCALES).filter((entry) => statSync(join(LOCALES, entry)).isDirectory());
}

function bundlesOf(locale: string): string[] {
  return readdirSync(join(LOCALES, locale))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("i18n namespace registry", () => {
  const registered = new Set<string>(NAMESPACES);

  it("every shipped locale bundle is registered in NAMESPACES", () => {
    // A bundle nobody registers is dead JSON at best and, when a screen calls
    // useTranslation on it, raw key names on screen at worst.
    const orphans = bundlesOf("en").filter((ns) => !registered.has(ns));
    expect({ orphanBundles: orphans }).toEqual({ orphanBundles: [] });
  });

  it("every registered namespace has a bundle in every locale", () => {
    // The `satisfies` in index.ts covers the eager pair and the lazy packs, but
    // only for locales that have an import line. This covers the directory.
    const missing: string[] = [];
    for (const locale of localeDirs()) {
      const have = new Set(bundlesOf(locale));
      for (const ns of NAMESPACES) if (!have.has(ns)) missing.push(`${locale}/${ns}.json`);
    }
    expect({ missingBundles: missing }).toEqual({ missingBundles: [] });
  });

  it("every useTranslation namespace argument is registered", () => {
    // The failure mode this test exists for: the call site and the bundle both
    // said "index" while the registry did not.
    const pattern = /useTranslation\(\s*"([A-Za-z][A-Za-z0-9-]*)"/g;
    const unregistered: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(pattern)) {
        const ns = match[1];
        if (!registered.has(ns)) unregistered.push(`${file.slice(ROOT.length + 1)} -> ${ns}`);
      }
    }
    expect({ unregisteredNamespaceCalls: unregistered }).toEqual({ unregisteredNamespaceCalls: [] });
  });
});
