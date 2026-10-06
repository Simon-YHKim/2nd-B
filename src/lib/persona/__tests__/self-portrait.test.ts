import { buildSelfPortrait, filledCount, type PortraitTranslate } from "../self-portrait";
import type { PersonaCard } from "../build";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Field copy lives in locales/<lng>/core-brain.json under portrait.* (Q-261005-01
// = A). Resolve it from the shipped bundle, the way the screen's `t` does.
type Lng = "en" | "ko" | "es" | "pt" | "id";
function tIn(lng: Lng): PortraitTranslate {
  const pack = JSON.parse(readFileSync(resolve(process.cwd(), `locales/${lng}/core-brain.json`), "utf8")) as Record<string, unknown>;
  return (key) => {
    const hit = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], pack);
    if (typeof hit !== "string") throw new Error(`missing core-brain key ${key} in ${lng}`);
    return hit;
  };
}
const portraitIn = (persona: PersonaCard | null, lng: Lng) =>
  buildSelfPortrait({ persona }, lng === "ko" ? "ko" : "en", tIn(lng));

function makePersona(overrides: Partial<PersonaCard> = {}): PersonaCard {
  return {
    version: 1,
    traits: { openness: 0.6, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.4 },
    traitsSource: "bfi",
    mbti: null,
    attachment: null,
    values: [],
    patterns: {},
    markdownExport: "",
    ...overrides,
  };
}

describe("buildSelfPortrait — data contract", () => {
  it("keeps measured portrait fields independent from the trait-provenance gate", () => {
    const screen = readFileSync(resolve(process.cwd(), "src/app/core-brain.tsx"), "utf8");
    expect(screen).toContain("buildSelfPortrait({ persona: portraitSignals }, locale, t)");
    expect(screen).not.toContain("buildSelfPortrait({ persona: hasUnrecordedProvenance ? null : persona }, locale)");
    expect(screen.match(/loadSelfPortraitSignals\(userId\)/g)).toHaveLength(1);
    expect(screen).toContain("[loading, userId, hasProfile, isMinor, reloadKey, evidenceReloadKey]");
    // 2 -> 1 (2026-10-05): 같은 자화상 칸을 그리던 곳이 둘(덱 · 레거시 꼬리)이었다. 꼬리는
    // 롤백 레버와 함께 빠졌다(Simon 결정 Q-261004-11 C). 남은 덱의 칸이 같은 이름을 진다.
    expect(screen.match(/accessibilityLabel=\{field\.value \? `\$\{field\.label\}: \$\{field\.value\}` : field\.label\}/g)).toHaveLength(1);
  });

  it("returns all five fields in mission order", () => {
    const fields = portraitIn(null, "ko");
    expect(fields.map((f) => f.id)).toEqual(["who", "forWhom", "goal", "do", "fuel"]);
  });

  it("marks every field collecting when there is no persona (never fabricates)", () => {
    const fields = portraitIn(null, "ko");
    expect(fields.every((f) => f.status === "collecting" && f.value === null)).toBe(true);
    expect(filledCount(fields)).toBe(0);
  });

  it("fills `who` from a measured MBTI type", () => {
    const persona = makePersona({ mbti: { type: "INFJ", scores: { E: 0, I: 1, S: 0, N: 1, T: 0, F: 1, J: 1, P: 0 } } });
    const who = portraitIn(persona, "en").find((f) => f.id === "who")!;
    expect(who.status).toBe("filled");
    expect(who.value).toContain("INFJ");
    expect(who.route).toBe("/records?tags=mbti");
    expect(who.actionHint).toContain("records behind this value");
  });

  it("falls back to attachment style for `who` when MBTI is absent", () => {
    const persona = makePersona({ attachment: { style: "secure", anxiety: 2, avoidance: 2 } });
    const who = portraitIn(persona, "ko").find((f) => f.id === "who")!;
    expect(who.status).toBe("filled");
    expect(who.value).toBeTruthy();
    expect(who.route).toBe("/records?tags=attachment");
  });

  it("fills `fuel` from the top measured value framework", () => {
    const persona = makePersona({ values: ["big_five"] });
    const fuel = portraitIn(persona, "ko").find((f) => f.id === "fuel")!;
    expect(fuel.status).toBe("filled");
    expect(fuel.value).toBeTruthy();
    expect(fuel.route).toBe("/records?tags=life_audit");
  });

  it("keeps forWhom / goal / do collecting (no backing data contract yet)", () => {
    const persona = makePersona({
      mbti: { type: "INFJ", scores: { E: 0, I: 1, S: 0, N: 1, T: 0, F: 1, J: 1, P: 0 } },
      values: ["big_five"],
    });
    const fields = portraitIn(persona, "ko");
    for (const id of ["forWhom", "goal", "do"] as const) {
      expect(fields.find((f) => f.id === id)!.status).toBe("collecting");
    }
    // who + fuel filled = 2
    expect(filledCount(fields)).toBe(2);
  });

  it("routes each collecting field to an active, semantically matching destination", () => {
    const fields = portraitIn(null, "en");
    const byId = Object.fromEntries(fields.map((f) => [f.id, f.route]));
    expect(byId).toMatchObject({
      who: "/attachment",
      forWhom: "/interview",
      goal: "/secondb?mode=divergent",
      do: "/capture",
      fuel: "/audit?screener=1",
    });
    // No retired redirect route leaks back into an active field destination.
    for (const route of Object.values(byId)) {
      expect(route).not.toMatch(/^\/journal\b/);
      expect(route).not.toMatch(/^\/imagine\b/);
      expect(route).not.toMatch(/^\/mbti\b/);
      expect(route).not.toBe("/persona");
      expect(route).not.toBe("/audit");
    }
    expect(fields.every((field) => field.actionHint === field.hint)).toBe(true);
  });

  it("does not promise automatic completion for fields without a backing contract", () => {
    const fields = portraitIn(null, "en");
    const koFields = portraitIn(null, "ko");
    for (const id of ["forWhom", "goal", "do"] as const) {
      expect(fields.find((field) => field.id === id)?.hint).toContain("automatic summary");
      expect(koFields.find((field) => field.id === id)?.hint).toContain("자동 요약");
    }
  });

  it("paints es/pt/id field copy in their own language, not the English labels (R2B-03)", () => {
    const en = portraitIn(null, "en");
    for (const lng of ["es", "pt", "id"] as const) {
      const fields = portraitIn(null, lng);
      fields.forEach((field, i) => {
        expect({ lng, id: field.id, label: field.label === en[i].label }).toEqual({ lng, id: field.id, label: false });
        expect({ lng, id: field.id, hint: field.hint === en[i].hint }).toEqual({ lng, id: field.id, hint: false });
      });
    }
    // The screen's own labels: a filled `who` in Spanish opens its records with Spanish copy.
    const persona = makePersona({ mbti: { type: "INFJ", scores: { E: 0, I: 1, S: 0, N: 1, T: 0, F: 1, J: 1, P: 0 } } });
    const who = portraitIn(persona, "es").find((f) => f.id === "who")!;
    expect(who.label).toBe("Quién soy");
    expect(who.actionHint).toBe("Abre los registros en los que se basa este valor.");
  });

  it("keeps state-dependent portrait routes aligned with the design navigation contract", () => {
    const nav = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "design/pixel_clay_260825/data/nav.json"),
        "utf8",
      ),
    ) as {
      me: {
        items: Array<{ label: string; kind: string; to?: string; toAnyOf?: string[] }>;
      };
    };
    const portraits = [
      portraitIn(null, "ko"),
      portraitIn(
        makePersona({
          mbti: {
            type: "INFJ",
            scores: { E: 0, I: 1, S: 0, N: 1, T: 0, F: 1, J: 1, P: 0 },
          },
          values: ["big_five"],
        }),
        "ko",
      ),
      portraitIn(makePersona({ attachment: { style: "secure", anxiety: 2, avoidance: 2 } }), "ko"),
    ];
    const runtimeRoutes = (id: "who" | "fuel") =>
      [...new Set(portraits.map((fields) => fields.find((field) => field.id === id)!.route))].sort();
    const declaredRoutes = (label: string) => {
      const item = nav.me.items.find((candidate) => candidate.label === label)!;
      expect(item.kind).toBe("route");
      expect(item.to).toBeUndefined();
      expect(item.toAnyOf).toBeDefined();
      return [...item.toAnyOf!].sort();
    };

    expect(declaredRoutes("나는 누구인가")).toEqual(runtimeRoutes("who"));
    expect(declaredRoutes("나의 원동력")).toEqual(runtimeRoutes("fuel"));
  });
});
