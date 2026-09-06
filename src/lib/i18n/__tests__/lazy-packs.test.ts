// es/pt/id packs are loaded lazily (audit D6-04, 2026-09-06): only en/ko sit in
// the entry bundle, the rest is attached with addResourceBundle on demand.
// Three things are pinned here: the eager set is exactly en+ko, every shipped
// locale is covered by exactly one of the two tiers, and a lazy pack attaches
// all 44 namespaces with the real JSON so t() resolves that locale's copy.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import i18next from "i18next";

import { AVAILABLE_UI_LOCALES } from "../locales";
import {
  EAGER_LOCALES,
  LAZY_PACKS,
  NAMESPACES,
  ensureLocalePack,
  initI18n,
  isLazyLocale,
  resources,
} from "../index";

const ROOT = join(__dirname, "..", "..", "..", "..");

function bundleFromDisk(lng: string, ns: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, "locales", lng, `${ns}.json`), "utf8"));
}

describe("lazy locale packs", () => {
  it("index.ts keeps exactly en and ko eager", () => {
    expect([...EAGER_LOCALES]).toEqual(["en", "ko"]);
    expect(Object.keys(resources).sort()).toEqual(["en", "ko"]);
    for (const lng of EAGER_LOCALES) {
      expect(Object.keys(resources[lng]).sort()).toEqual([...NAMESPACES].sort());
    }
  });

  it("every AvailableUiLocale is eager or lazy, never both, never neither", () => {
    // 45 since 2026-09-06: `index` was a bundle that shipped in all five locales
    // and was called by src/app/index.tsx but never registered, so its keys
    // rendered as raw names. See namespace-registry.test.ts.
    expect(NAMESPACES).toHaveLength(45);
    const lazy = Object.keys(LAZY_PACKS).sort();
    const eager = Object.keys(resources).sort();
    expect([...eager, ...lazy].sort()).toEqual([...AVAILABLE_UI_LOCALES].sort());
    for (const lng of AVAILABLE_UI_LOCALES) {
      const isEager = lng in resources;
      const isLazy = lng in LAZY_PACKS;
      expect(isEager !== isLazy).toBe(true);
      expect(isLazyLocale(lng)).toBe(isLazy);
    }
  });

  it("ensureLocalePack('es') attaches all 44 namespaces and t() resolves es copy", async () => {
    initI18n();
    expect(i18next.hasResourceBundle("es", "common")).toBe(false);
    // Before the pack lands, a lazy locale renders the EN fallback, never a
    // raw key.
    expect(i18next.t("actions.cancel", { lng: "es", ns: "common" })).toBe("Cancel");

    await ensureLocalePack("es");

    for (const ns of NAMESPACES) {
      expect(i18next.hasResourceBundle("es", ns)).toBe(true);
      // The pack module must map each namespace to its own JSON file: a
      // swapped import would still pass a plain "has bundle" check.
      expect(i18next.getResourceBundle("es", ns)).toEqual(bundleFromDisk("es", ns));
    }
    const esCommon = bundleFromDisk("es", "common") as { actions: { cancel: string } };
    expect(esCommon.actions.cancel).not.toBe("Cancel");
    expect(i18next.t("actions.cancel", { lng: "es", ns: "common" })).toBe(esCommon.actions.cancel);
  });

  it("is a no-op for eager locales and shares one load per lazy locale", async () => {
    initI18n();
    const add = jest.spyOn(i18next, "addResourceBundle");
    try {
      await expect(ensureLocalePack("en")).resolves.toBeUndefined();
      await expect(ensureLocalePack("ko")).resolves.toBeUndefined();
      expect(add).not.toHaveBeenCalled();

      const first = ensureLocalePack("pt");
      expect(ensureLocalePack("pt")).toBe(first);
      await first;
      expect(add).toHaveBeenCalledTimes(NAMESPACES.length);
      await ensureLocalePack("pt");
      expect(add).toHaveBeenCalledTimes(NAMESPACES.length);
    } finally {
      add.mockRestore();
    }
  });

  it("initI18n never throws and i18nReady settles when a lazy chunk fails to load", async () => {
    const storage = { getItem: jest.fn(() => "id"), setItem: jest.fn() };
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
    let mod!: typeof import("../index");
    jest.isolateModules(() => {
      jest.doMock("../packs/id", () => {
        throw new Error("chunk failed");
      });
      mod = require("../index") as typeof import("../index");
    });
    try {
      let instance!: ReturnType<typeof mod.initI18n>;
      expect(() => {
        instance = mod.initI18n();
      }).not.toThrow();
      expect(instance.language).toBe("id");
      await expect(mod.i18nReady()).resolves.toBeUndefined();
      // The gate opened and the UI carries on in EN via fallbackLng.
      expect(instance.hasResourceBundle("id", "common")).toBe(false);
      expect(instance.t("actions.cancel", { ns: "common" })).toBe("Cancel");
      // The failure is not memoized: the next attempt hits the loader again.
      await expect(mod.ensureLocalePack("id")).rejects.toThrow("chunk failed");
    } finally {
      jest.dontMock("../packs/id");
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
