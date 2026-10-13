import i18next from "i18next";

import enOps from "../../../../locales/en/ops.json";
import esOps from "../../../../locales/es/ops.json";
import idOps from "../../../../locales/id/ops.json";
import koOps from "../../../../locales/ko/ops.json";
import ptOps from "../../../../locales/pt/ops.json";
import {
  DEVICE_NOTIFICATION_TEXT_FALLBACK,
  deviceNotificationText,
  type DeviceNotificationTextKey,
} from "../device-notification-text";

const KEYS = Object.keys(DEVICE_NOTIFICATION_TEXT_FALLBACK) as DeviceNotificationTextKey[];
const OPS = { en: enOps, es: esOps, id: idOps, ko: koOps, pt: ptOps } as const;
type Lang = keyof typeof OPS;
const LANGS = Object.keys(OPS) as Lang[];

function fromFile(lang: Lang, key: DeviceNotificationTextKey): string {
  return (OPS[lang].push as Record<string, string>)[key];
}

describe("deviceNotificationText before the languages are loaded", () => {
  test.each(KEYS)("falls back to English: %s", (key) => {
    expect(i18next.isInitialized).toBeFalsy();
    expect(deviceNotificationText(key)).toBe(DEVICE_NOTIFICATION_TEXT_FALLBACK[key]);
  });

  test.each(KEYS)("the fallback is the English file's sentence: %s", (key) => {
    expect(fromFile("en", key)).toBe(DEVICE_NOTIFICATION_TEXT_FALLBACK[key]);
  });
});

describe("deviceNotificationText follows the app language", () => {
  beforeAll(async () => {
    await i18next.init({
      lng: "en",
      fallbackLng: "en",
      ns: ["ops"],
      defaultNS: "ops",
      resources: Object.fromEntries(LANGS.map((lang) => [lang, { ops: OPS[lang] }])),
      interpolation: { escapeValue: false },
    });
  });

  for (const lang of LANGS) {
    test.each(KEYS)(`${lang}: %s is that language's sentence`, async (key) => {
      await i18next.changeLanguage(lang);
      const text = deviceNotificationText(key);
      expect(text).toBe(fromFile(lang, key));
      expect(text.trim().length).toBeGreaterThan(0);
      // A fixed sentence: nothing to fill in, so nothing of the user's can reach it.
      expect(text).not.toMatch(/\{\{|\}\}/);
    });
  }

  test.each(KEYS)("every other language differs from English: %s", (key) => {
    for (const lang of LANGS.filter((l) => l !== "en")) {
      expect(fromFile(lang, key)).not.toBe(fromFile("en", key));
    }
  });

  test.each(KEYS)("a language without the sentence gets English: %s", async (key) => {
    await i18next.changeLanguage("fr");
    expect(deviceNotificationText(key)).toBe(DEVICE_NOTIFICATION_TEXT_FALLBACK[key]);
  });
});
