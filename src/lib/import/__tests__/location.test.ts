import { parseTakeoutLocations, summarizeLocations } from "../location";

describe("parseTakeoutLocations", () => {
  test("legacy Records.json (E7 + timestamp / timestampMs)", () => {
    const json = {
      locations: [
        { latitudeE7: 374220000, longitudeE7: 1270000000, timestamp: "2024-01-05T03:42:00Z" },
        { latitudeE7: 374230000, longitudeE7: 1270010000, timestampMs: "1704430920000" },
        { longitudeE7: 1 }, // no lat → dropped
      ],
    };
    const out = parseTakeoutLocations(json);
    expect(out).toHaveLength(2);
    expect(out[0].lat).toBeCloseTo(37.422, 3);
    expect(out[0].lon).toBeCloseTo(127.0, 3);
    expect(out[0].atIso).toBe("2024-01-05T03:42:00.000Z");
    expect(out[1].atIso).not.toBeNull();
  });

  test("Semantic Location History (placeVisit with name)", () => {
    const json = {
      timelineObjects: [
        {
          placeVisit: {
            location: { latitudeE7: 374220000, longitudeE7: 1270000000, name: "집" },
            duration: { startTimestamp: "2024-01-05T20:00:00Z" },
          },
        },
        { activitySegment: { distance: 1200 } }, // not a visit → ignored
      ],
    };
    const out = parseTakeoutLocations(json);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("집");
    expect(out[0].atIso).toBe("2024-01-05T20:00:00.000Z");
  });

  test("unknown shape → []", () => {
    expect(parseTakeoutLocations(null)).toEqual([]);
    expect(parseTakeoutLocations({})).toEqual([]);
    expect(parseTakeoutLocations({ locations: "nope" })).toEqual([]);
  });
});

describe("summarizeLocations (derived summary)", () => {
  test("counts points, distinct named places, and the date range", () => {
    const s = summarizeLocations([
      { lat: 1, lon: 1, atIso: "2024-01-05T20:00:00.000Z", name: "집" },
      { lat: 2, lon: 2, atIso: "2024-01-06T09:00:00.000Z", name: "회사" },
      { lat: 3, lon: 3, atIso: "2024-01-04T08:00:00.000Z", name: "집" }, // dup name
    ]);
    expect(s.points).toBe(3);
    expect(s.places.sort()).toEqual(["집", "회사"]);
    expect(s.range).toEqual(["2024-01-04T08:00:00.000Z", "2024-01-06T09:00:00.000Z"]);
  });

  test("empty → zeros, null range", () => {
    expect(summarizeLocations([])).toEqual({ points: 0, places: [], range: null });
  });
});
