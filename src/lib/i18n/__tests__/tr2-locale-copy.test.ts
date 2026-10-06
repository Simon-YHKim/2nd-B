// Q-261005-01 = A (QA 261006, R2B-03) translation bundle tr2.
//
// WHY. The life-tool screens (/meals, /ledger, /reading, /milestones,
// /side-project, /reminders and the phone hub), the /imagine seeds and the
// eight built-in /formats picked their copy with "Korean, otherwise English" in
// code: ops/copy.ts held an `en` and a `ko` map, imagine-seeds.ts an English
// mirror ("other locales fall back to EN"), the meal grid two weekday arrays,
// and /formats showed clipper-templates.ts' en/ko pairs. The es/pt/id packs had
// every key, so check:i18n-keys passed while those routes painted English (the
// 2026-10-05 web sweep: /meals 12 lines, /ledger 11, /imagine 9, /formats 16 ...).
// This bundle moved that copy into locale keys. The gates below keep it moved:
//
//   1. each screen reads the new keys, through the painted language
//      (renderedUiLanguage, #2064), and the old in-code tables are gone;
//   2. en and ko keep their text: the en/ko key values equal what the code
//      painted (the canon for the imagine seeds, clipper-templates.ts for the
//      formats, which the classifier prompt still reads);
//   3. es/pt/id hold their own text for every moved key, not the English;
//   4. a real i18next instance paints the es/pt/id text through the same
//      functions the screens call.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import i18next, { type i18n } from "i18next";

import { OPS_COPY_FIELDS, opsCopyFrom, opsCopyKey } from "@/components/deepspace/ops/copy";
import {
  IMAGINE_SEEDS,
  IMAGINE_SEED_KEYS,
  IMAGINE_STEP_KEYS,
  imagineSeedCopy,
} from "@/components/deep-space/imagine-seeds";
import { canonMore } from "@/lib/canon";
import { CLIPPER_TEMPLATE_LIST } from "@/lib/wiki/clipper-templates";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const OTHERS = ["es", "pt", "id"] as const;
const pack = (lng: string, ns: string) => JSON.parse(read(`locales/${lng}/${ns}.json`)) as Record<string, unknown>;
const at = (node: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((n, part) => (n as Record<string, unknown> | undefined)?.[part], node);

const COPY = read("src/components/deepspace/ops/copy.ts");
const OPS_SCREENS = read("src/screens/deepspace/ops/screens.tsx");
const SEEDS_TS = read("src/components/deep-space/imagine-seeds.ts");
const VIEWS = read("src/components/deep-space/DeepSpaceViews.tsx");
const IMAGINE_ROUTE = read("src/app/imagine.tsx");
const FORMATS = read("src/app/formats.tsx");
const SCHEMA_VIEW = read("src/components/wiki/FormatSchemaView.tsx");

function slice(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`slice not found: ${from}`);
  return src.slice(a, b);
}
const imagineView = slice(VIEWS, "export function ImagineDivergentView(", "\n// ── ");
const mealsScreen = slice(OPS_SCREENS, "export function MealsScreen()", "// --- Scheduled reminders");

let inst: i18n;
beforeAll(async () => {
  inst = i18next.createInstance();
  await inst.init({
    lng: "en",
    fallbackLng: "en",
    resources: Object.fromEntries(
      LOCALES.map((lng) => [lng, { ops: pack(lng, "ops"), home: pack(lng, "home"), formats: pack(lng, "formats") }]),
    ),
    interpolation: { escapeValue: false },
  });
});
const tFor = (lng: string, ns: string) => {
  const t = inst.getFixedT(lng, ns);
  return (key: string) => t(key);
};

describe("tr2 ops copy: every field reads ops copy.* in the painted language", () => {
  it("copy.ts holds no language maps and reads the ops bundle through the shared helper", () => {
    for (const gone of ["const en: OpsCopy", "const ko: OpsCopy", "OPS_COPY = { en, ko }", 'startsWith("ko") ? ko : en', "canonMore", "demoReminders:", "OpsDemoReminder"]) {
      expect({ gone, present: COPY.includes(gone) }).toEqual({ gone, present: false });
    }
    expect(COPY).toContain('useTranslation("ops")');
    expect(COPY).toContain("const lng = renderedUiLanguage(i18n);");
    expect(COPY).toContain("opsCopyFrom((key) => t(key, { lng }))");
    expect(COPY).toContain("`copy.${field}`");
  });

  it("the field list covers the bundle's copy block exactly, in all five locales", () => {
    expect(OPS_COPY_FIELDS.length).toBe(106);
    for (const lng of LOCALES) {
      const block = at(pack(lng, "ops"), "copy") as Record<string, unknown>;
      expect({ lng, keys: Object.keys(block).sort() }).toEqual({ lng, keys: [...OPS_COPY_FIELDS].sort() });
      for (const f of OPS_COPY_FIELDS) {
        const v = block[f];
        expect({ lng, f, ok: typeof v === "string" && v.trim().length > 0 }).toEqual({ lng, f, ok: true });
      }
    }
  });

  it("en and ko keep the text the in-code maps painted (sample pinned verbatim)", () => {
    const en = at(pack("en", "ops"), "copy") as Record<string, string>;
    const ko = at(pack("ko", "ops"), "copy") as Record<string, string>;
    expect([en.weeklyMeals, en.breakfast, en.nutritionNote, en.saveFailed, en.remindersCountTemplate, en.unlinkedBody]).toEqual([
      "This week's meals",
      "Breakfast",
      "Nutrition values are a reference - not dietary or medical advice.",
      "Couldn't save that. Nothing was recorded. Try again.",
      "{n} scheduled reminders",
      "Connect for automatic, or just write it yourself",
    ]);
    expect([ko.weeklyMeals, ko.breakfast, ko.nutritionNote, ko.saveFailed, ko.remindersCountTemplate, ko.nowReading]).toEqual([
      "이번 주 식단",
      "아침",
      "영양 수치는 참고용입니다 · 식이·의료 조언이 아닙니다.",
      "저장하지 못했습니다. 아무것도 기록되지 않았습니다. 다시 시도해 주세요.",
      "예약된 리마인더 {n}개",
      "NOW READING",
    ]);
  });

  it.each(LOCALES)("%s keeps the {n} slot the reminders screen replaces", (lng) => {
    expect(at(pack(lng, "ops"), "copy.remindersCountTemplate")).toContain("{n}");
    expect(OPS_SCREENS).toContain('c.remindersCountTemplate.replace("{n}", String(onCount))');
  });

  // Proper noun everywhere, and a loanword es/pt spell the same (id says "commit").
  const SAME_AS_EN: Record<string, readonly string[]> = { googleCalendar: OTHERS, commits: ["es", "pt"] };

  it.each(OTHERS)("%s translates every ops copy field", (lng) => {
    const en = at(pack("en", "ops"), "copy") as Record<string, string>;
    const mine = at(pack(lng, "ops"), "copy") as Record<string, string>;
    for (const f of OPS_COPY_FIELDS) {
      const same = SAME_AS_EN[f]?.includes(lng) ?? false;
      expect({ f, translated: mine[f] !== en[f] }).toEqual({ f, translated: !same });
    }
  });

  it.each(LOCALES)("opsCopyFrom paints the %s bundle through a real i18next", (lng) => {
    const copy = opsCopyFrom(tFor(lng, "ops"));
    const block = at(pack(lng, "ops"), "copy") as Record<string, string>;
    for (const f of OPS_COPY_FIELDS) expect({ f, v: copy[f] }).toEqual({ f, v: block[f] });
    expect(opsCopyKey("breakfast")).toBe("copy.breakfast");
  });

  it("es/pt/id paint their own words on /meals, /ledger and /reminders", () => {
    expect(opsCopyFrom(tFor("es", "ops")).breakfast).toBe("Desayuno");
    expect(opsCopyFrom(tFor("pt", "ops")).income).toBe("Receitas");
    expect(opsCopyFrom(tFor("id", "ops")).scheduledReminders).toBe("Pengingat terjadwal");
  });
});

describe("tr2 /meals weekday labels read toolScreens.meals.days", () => {
  const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  it("the meal grid reads the bundle; the two in-code arrays are gone", () => {
    expect(OPS_SCREENS).toContain('const MEAL_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;');
    expect(mealsScreen).toContain("const dayLabels = MEAL_DAY_KEYS.map((k) => t(`toolScreens.meals.days.${k}`));");
    expect(OPS_SCREENS).not.toContain("DAYS_EN");
    expect(OPS_SCREENS).not.toMatch(/const DAYS = \[/);
    expect(mealsScreen).not.toContain("ko ? DAYS");
  });

  it("en and ko keep the old arrays; es/pt/id have their own", () => {
    const days = (lng: string) => DAY_KEYS.map((k) => at(pack(lng, "ops"), `toolScreens.meals.days.${k}`));
    expect(days("en")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(days("ko")).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
    for (const lng of OTHERS) {
      const mine = days(lng);
      mine.forEach((v, i) => {
        expect({ lng, i, ok: typeof v === "string" && v.length > 0 && v !== days("en")[i] }).toEqual({ lng, i, ok: true });
      });
    }
  });
});

describe("tr2 /imagine seeds: canon on the Korean screen, home bundle everywhere else", () => {
  const EN_MIRROR = [
    ["Expand", "If you took a year off", "Erase money, work, and ties for a moment - what would you do first?",
      "Write 3 things you want to do", "Taste one with a single hour this month", "Picture who joins you on the relations star"],
    ["Reverse", "If you lived the exact opposite", "Improvise instead of plan, together instead of alone. What pulls you from the far side?",
      "Try one thing you never do this week", "Note what felt awkward with SecondB", "Capture it to the rest star and watch the pattern"],
    ["Connect", "Career × rest, combined", "Force the two stars together - what odd idea falls out?",
      "Write a one-line project from the two keywords", "Prototype it in two weekend hours", "Log it on the growth star as an experiment"],
  ];
  const FIELDS = ["angle", "title", "body", ...IMAGINE_STEP_KEYS];
  const seedValues = (lng: string, key: string) => FIELDS.map((f) => at(pack(lng, "home"), `ds.imagine.seeds.${key}.${f}`));

  it("the view reads the painted language through the shared helper; no EN mirror, no isKo prop", () => {
    expect(SEEDS_TS).not.toContain("EN_MIRROR");
    expect(SEEDS_TS).not.toContain("fall back to EN");
    expect(SEEDS_TS).toContain("t(`ds.imagine.seeds.${seed.key}.${field}`)");
    expect(imagineView).toContain('const ko = renderedUiLanguage(i18n) === "ko";');
    expect(imagineView).toContain("imagineSeedCopy(s, ko, (key) => t(key))");
    expect(imagineView).not.toContain("seed[lang]");
    expect(imagineView).not.toContain("isKo");
    expect(IMAGINE_ROUTE).toContain("<ImagineDivergentView />");
    expect(IMAGINE_ROUTE).not.toContain("isKo");
  });

  it("en keeps the old mirror verbatim and ko mirrors the canon", () => {
    IMAGINE_SEED_KEYS.forEach((key, i) => {
      expect(seedValues("en", key)).toEqual(EN_MIRROR[i]);
      const c = canonMore.imagineSeeds[i];
      expect(seedValues("ko", key)).toEqual([c.angle, c.title, c.body, ...c.steps]);
    });
  });

  it.each(OTHERS)("%s translates every seed field", (lng) => {
    for (const key of IMAGINE_SEED_KEYS) {
      const en = seedValues("en", key);
      seedValues(lng, key).forEach((v, i) => {
        expect({ key, field: FIELDS[i], ok: typeof v === "string" && v.length > 0 && v !== en[i] }).toEqual({ key, field: FIELDS[i], ok: true });
      });
    }
  });

  it("imagineSeedCopy paints the canon for ko and the bundle for es/pt/id", () => {
    const first = IMAGINE_SEEDS[0];
    expect(imagineSeedCopy(first, true, tFor("ko", "home"))).toBe(first.ko);
    for (const lng of OTHERS) {
      const c = imagineSeedCopy(first, false, tFor(lng, "home"));
      expect([c.angle, c.title, c.body, ...c.steps]).toEqual(seedValues(lng, "expand"));
    }
    expect(imagineSeedCopy(IMAGINE_SEEDS[2], false, tFor("es", "home")).title).toBe("Carrera × descanso, combinados");
  });
});

describe("tr2 /formats built-ins read builtIn.kinds.* and mirror the classifier source", () => {
  it("the built-in list and guide read the bundle in the painted language", () => {
    expect(FORMATS).toContain("const uiLng = renderedUiLanguage(i18n);");
    expect(FORMATS).toContain("return tf(`builtIn.kinds.${t.kind}.name`);");
    expect(FORMATS).toContain("return tf(`builtIn.kinds.${t.kind}.what`);");
    expect(FORMATS).toContain("describe: tf(`builtIn.kinds.${t.kind}.props.${p.name}`)");
    expect(FORMATS).toContain("setViewing({ schema: schemaOfBundled(t), lng: uiLng })");
    expect(FORMATS).toContain("<FormatSchemaView schema={viewing.schema} locale={viewing.lng} />");
    expect(SCHEMA_VIEW).toContain("locale: AvailableUiLocale");
    const bundled = slice(FORMATS, "function schemaOfBundled(", "function schemaOfCustom(");
    const list = slice(FORMATS, "{CLIPPER_TEMPLATE_LIST.map((t) => (", "))}");
    for (const part of [bundled, list]) {
      expect(part).not.toMatch(/t\.name\.(en|ko)|t\.what\.(en|ko)|p\.describe\.(en|ko)/);
    }
    expect(list).toContain("title={builtInName(t)}");
    expect(list).toContain("{builtInWhat(t)}");
  });

  it("en and ko bundle values equal clipper-templates.ts (the classifier prompt's text)", () => {
    expect(CLIPPER_TEMPLATE_LIST).toHaveLength(8);
    for (const lng of ["en", "ko"] as const) {
      const f = pack(lng, "formats");
      for (const t of CLIPPER_TEMPLATE_LIST) {
        expect(at(f, `builtIn.kinds.${t.kind}.name`)).toBe(t.name[lng]);
        expect(at(f, `builtIn.kinds.${t.kind}.what`)).toBe(t.what[lng]);
        const props = (at(f, `builtIn.kinds.${t.kind}.props`) ?? {}) as Record<string, string>;
        expect(Object.keys(props).sort()).toEqual(t.aiProperties.map((p) => p.name).sort());
        for (const p of t.aiProperties) expect(props[p.name]).toBe(p.describe[lng]);
      }
    }
  });

  it.each(OTHERS)("%s translates every built-in name, line and detail", (lng) => {
    const en = pack("en", "formats");
    const mine = pack(lng, "formats");
    let compared = 0;
    for (const t of CLIPPER_TEMPLATE_LIST) {
      const keys = ["name", "what", ...t.aiProperties.map((p) => `props.${p.name}`)];
      for (const k of keys) {
        const key = `builtIn.kinds.${t.kind}.${k}`;
        const v = at(mine, key);
        compared++;
        expect({ key, ok: typeof v === "string" && v.length > 0 && v !== at(en, key) }).toEqual({ key, ok: true });
      }
    }
    expect(compared).toBe(23);
  });

  it("a real i18next paints the es guide values", () => {
    const tf = tFor("es", "formats");
    expect(tf("builtIn.kinds.self_knowledge.name")).toBe("Autoconocimiento");
    expect(tf("builtIn.kinds.code.props.language")).toBe("Lenguaje de programación principal, si es evidente.");
  });
});
