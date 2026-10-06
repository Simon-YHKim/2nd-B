// R2B-01 · R2B-02 (2026-10-05): the language the UI is painted in.
//
// R2B-02: screens with their own es/pt/id copy read
// `i18n.resolvedLanguage ?? i18n.language`, and i18next fixes resolvedLanguage
// inside init to the first language that HAS resources. A lazy locale's pack
// lands later via addResourceBundle, which never recomputes it, so those
// screens painted EN on every es/pt/id launch.
//
// R2B-01: <html lang> was only written by the languageChanged listener, which
// is attached after init has already emitted the startup languageChanged. Every
// web launch kept the static "ko" of +html.tsx.
//
// Both are pinned on the real initI18n with a fresh module registry per case.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { renderedUiLanguage } from "../ui-language";

type IndexModule = typeof import("../index");

const SRC = join(__dirname, "..", "..", "..");

interface Harness {
  mod: IndexModule;
  storage: { getItem: jest.Mock; setItem: jest.Mock };
  doc: { documentElement: { lang: string } };
}

function bootWith(saved: string, failingPack?: "es" | "pt" | "id"): Harness {
  const storage = { getItem: jest.fn(() => saved), setItem: jest.fn() };
  const doc = { documentElement: { lang: "ko" } }; // +html.tsx static default
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  let mod!: IndexModule;
  jest.isolateModules(() => {
    if (failingPack) {
      jest.doMock(`../packs/${failingPack}`, () => {
        throw new Error("chunk failed");
      });
    }
    mod = require("../index") as IndexModule;
  });
  return { mod, storage, doc };
}

afterEach(() => {
  jest.dontMock("../packs/es");
  jest.dontMock("../packs/pt");
  jest.dontMock("../packs/id");
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { document?: unknown }).document;
});

describe("renderedUiLanguage", () => {
  it("returns the active shipped locale when its bundles are attached", () => {
    const has = jest.fn(() => true);
    expect(renderedUiLanguage({ language: "pt", hasResourceBundle: has })).toBe("pt");
    expect(has).toHaveBeenCalledWith("pt", "common");
    expect(renderedUiLanguage({ language: "ko-KR", hasResourceBundle: () => true })).toBe("ko");
  });

  it("returns en while a lazy pack is missing, and for unshipped or empty tags", () => {
    expect(renderedUiLanguage({ language: "pt", hasResourceBundle: () => false })).toBe("en");
    expect(renderedUiLanguage({ language: "ja", hasResourceBundle: () => true })).toBe("en");
    expect(renderedUiLanguage({ language: "cimode" })).toBe("en");
    expect(renderedUiLanguage({ language: "" })).toBe("en");
    expect(renderedUiLanguage(null)).toBe("en");
  });

  it("trusts a stub without hasResourceBundle", () => {
    expect(renderedUiLanguage({ language: "es" })).toBe("es");
  });
});

describe("initI18n: painted language and <html lang>", () => {
  it("stamps the saved eager locale at startup without persisting anything (R2B-01)", () => {
    const { mod, storage, doc } = bootWith("en");
    const instance = mod.initI18n();
    expect(instance.language).toBe("en");
    expect(doc.documentElement.lang).toBe("en");
    // Detection is not a choice: nothing is written back.
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("a lazy locale paints en until its pack attaches, then its own language (R2B-01 · R2B-02)", async () => {
    const { mod, storage, doc } = bootWith("pt");
    const instance = mod.initI18n();
    expect(instance.language).toBe("pt");
    // The pack is not attached yet, so the copy on screen is the EN fallback.
    expect(renderedUiLanguage(instance)).toBe("en");
    expect(doc.documentElement.lang).toBe("en");

    await mod.i18nReady();

    expect(instance.hasResourceBundle("pt", "common")).toBe(true);
    // The screens' in-code copy maps and Intl formatters read this value.
    expect(renderedUiLanguage(instance)).toBe("pt");
    expect(doc.documentElement.lang).toBe("pt");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("a lazy chunk that fails keeps en on screen and in <html lang>", async () => {
    const { mod, doc } = bootWith("id", "id");
    const instance = mod.initI18n();
    await mod.i18nReady();
    expect(instance.language).toBe("id");
    expect(renderedUiLanguage(instance)).toBe("en");
    expect(doc.documentElement.lang).toBe("en");
  });

  it("an explicit switch restamps <html lang> and persists the choice", async () => {
    const { mod, storage, doc } = bootWith("ko");
    const instance = mod.initI18n();
    expect(doc.documentElement.lang).toBe("ko");
    await mod.changeUiLanguage("es");
    expect(renderedUiLanguage(instance)).toBe("es");
    expect(doc.documentElement.lang).toBe("es");
    expect(storage.setItem).toHaveBeenCalledWith("2nd-brain:locale", "es");
  });
});

describe("source rule: no resolvedLanguage reads in src/", () => {
  function walk(dir: string, out: string[]): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "__tests__" || name === "node_modules") continue;
        walk(full, out);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("reads the UI language through renderedUiLanguage only", () => {
    const helper = join(SRC, "lib", "i18n", "ui-language.ts");
    const offenders = walk(SRC, [])
      .filter((file) => file !== helper)
      .filter((file) => /\bresolvedLanguage\b/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });
});
