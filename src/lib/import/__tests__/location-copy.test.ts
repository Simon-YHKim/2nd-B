// The location import tiles say what is kept. The importer keeps only the place names the
// user picks on the review screen (summarizeLocations: names, a point count, a date range;
// proposals.ts turns each name into one proposal). It never measures how long anyone stayed,
// so the copy must not promise a dwell-time pattern (2026-10-19, queue C of the location terms).
import * as fs from "node:fs";
import * as path from "node:path";

import { summarizeLocations } from "../location";

const LOCALES = ["ko", "en", "es", "pt", "id"] as const;
const DWELL = /머문|dwell|estancia|permanência|singgah/iu;

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
    "%s sources.%s.what does not promise a dwell-time pattern",
    (locale, key) => {
      expect(sourceCopy(locale, key)).not.toMatch(DWELL);
    },
  );
});
