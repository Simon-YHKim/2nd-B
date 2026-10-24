// The location import tiles say what is kept. The importer keeps only the place names the
// user picks on the review screen (summarizeLocations: names, a point count, a date range;
// proposals.ts turns each name into one proposal). It never measures how long anyone stayed,
// so the copy must not promise a dwell-time pattern (2026-10-19, queue C of the location terms).
import * as fs from "node:fs";
import * as path from "node:path";

import { summarizeLocations } from "../location";

const LOCALES = ["ko", "en", "es", "pt", "id"] as const;
const DWELL = /머문|dwell|estancia|permanência|singgah/iu;
// The approved line per language (independent review 2026-10-19 low: pin the promise itself,
// not only the absence of the old words).
const APPROVED: Record<(typeof LOCALES)[number], string> = {
  ko: "고른 장소 이름만 저장합니다. 좌표와 이동 경로는 저장하지 않습니다.",
  en: "Only the place names you choose. We don't store coordinates or routes.",
  es: "Solo los nombres de los lugares que elijas. No guardamos coordenadas ni recorridos.",
  pt: "Só os nomes dos lugares que você escolher. Não guardamos coordenadas nem trajetos.",
  id: "Hanya nama tempat yang kamu pilih. Koordinat dan rute tidak disimpan.",
};

function sourceCopy(locale: string, key: string): string {
  const file = path.resolve(__dirname, `../../../../locales/${locale}/import.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const sources = record.sources as Record<string, { what?: string }> | undefined;
    if (sources && typeof sources[key]?.what === "string") found.push(sources[key].what as string);
    for (const child of Object.values(record)) walk(child);
  };
  walk(json);
  if (found.length !== 1) throw new Error(`${locale}: expected one sources.${key}.what, found ${found.length}`);
  return found[0];
}

describe("location import copy matches what the importer keeps", () => {
  test("the summary has no duration field to back a dwell-time claim", () => {
    const summary = summarizeLocations([{ lat: 37.4, lon: 127, atIso: "2024-01-05T03:42:00.000Z", name: "집" }]);
    expect(Object.keys(summary).sort()).toEqual(["places", "points", "range"]);
  });

  test.each(LOCALES.flatMap((locale) => [[locale, "takeout"], [locale, "live-location"]] as const))(
    "%s sources.%s.what says only chosen place names are kept",
    (locale, key) => {
      expect(sourceCopy(locale, key)).not.toMatch(DWELL);
      expect(sourceCopy(locale, key)).toBe(APPROVED[locale]);
    },
  );
});
