// 시계 줄 날씨 그림 (Simon 2026-10-07, Q-261007-39 = GPS · 위치정보법 절차).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GLYPH_BOX, isOnGrid } from "@/components/pixel/pixel-glyphs";
import { SKY_CONDITIONS, WEATHER_LAYERS } from "../board/weather-glyphs";
import { buildBoard } from "@/lib/dashboard/board/build";

const root = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("weather glyphs", () => {
  test("five conditions, each drawn", () => {
    expect([...SKY_CONDITIONS].sort()).toEqual(Object.keys(WEATHER_LAYERS).sort());
    expect(SKY_CONDITIONS).toHaveLength(5);
    for (const sky of SKY_CONDITIONS) expect(WEATHER_LAYERS[sky].flatMap((layer) => layer.rects).length).toBeGreaterThan(0);
  });

  test("whole even cells inside the 24 box (PIXEL-CLAY rule 1)", () => {
    for (const sky of SKY_CONDITIONS) {
      for (const layer of WEATHER_LAYERS[sky]) {
        expect(isOnGrid(layer.rects)).toBe(true);
        for (const rect of layer.rects) {
          expect(rect.w).toBeGreaterThan(0);
          expect(rect.h).toBeGreaterThan(0);
          expect(rect.x + rect.w).toBeLessThanOrEqual(GLYPH_BOX);
          expect(rect.y + rect.h).toBeLessThanOrEqual(GLYPH_BOX);
        }
      }
    }
  });

  test("every language names each sky and the temperature", () => {
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const clock = JSON.parse(read(`locales/${locale}/ops.json`)).phone.board.clock;
      for (const sky of SKY_CONDITIONS) expect(typeof clock.sky[sky]).toBe("string");
      expect(clock.temp).toContain("{{temp}}");
    }
  });
});

describe("clock row", () => {
  const parts = read("src/components/dashboard/board/BoardParts.tsx");

  test("the weather is a picture and a temperature, not a sentence", () => {
    expect(parts).toContain("<WeatherGlyph sky={weather.sky} size={24} />");
    expect(parts).toContain("{`${temp}°`}");
    expect(parts).toContain("accessibilityLabel={sky ?? undefined}");
    expect(parts).not.toContain("say(part.weather)");
  });

  test("a disabled service hides weather and its action even with a previous reading", () => {
    // SDK denial is exercised in location tests; this checks the rendered contract.
    const board = buildBoard(null, new Date("2026-10-08T00:00:00Z"), false, {
      enabled: false, consent: true, permission: "granted", weather: { sky: "clear", tempC: 18 },
    });
    expect(board.parts[0]).toMatchObject({ weather: null, weatherAction: null });
  });
});
