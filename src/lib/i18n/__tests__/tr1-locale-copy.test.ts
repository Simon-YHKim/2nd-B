// Q-261005-01 = A (QA 261006, R2B-03) translation bundle tr1.
//
// WHY. /privacy, the /support FAQ and notices, the three onboarding slides, the
// North Star self-portrait fields and the /brightness re-check nudge picked their
// copy with "Korean, otherwise English" in code. The es/pt/id packs had every
// key, so check:i18n-keys passed, while those screens painted English (es 280
// lines, pt 279, id 278 in the 2026-10-05 web sweep). This bundle moved that copy
// into locale keys. The gates below keep it moved:
//
//   1. each screen reads the new keys and the old English literals are gone;
//   2. where a canon pack owns the Korean copy (gaps.json, flows.json) the ko
//      screen still paints the canon, and the ko key values mirror it byte for
//      byte, in the same order as the key lists the screens index with;
//   3. es/pt/id hold their own text for every moved key, not the English;
//   4. the two overseas-transfer disclosures on /privacy stay KO/EN on purpose
//      (F2: cross-border consent copy is never machine-translated, and the
//      consent row is logged as ko or en).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const pack = (lng: string, ns: string) => JSON.parse(read(`locales/${lng}/${ns}.json`)) as Record<string, unknown>;
const at = (node: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((n, part) => (n as Record<string, unknown> | undefined)?.[part], node);
function flatten(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "string") out[prefix] = node;
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const DSDS = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
/** One exported screen of the file: from its declaration to the next export. */
function screenOf(name: string): string {
  const start = DSDS.indexOf(`export function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const end = DSDS.indexOf("\nexport function ", start + 1);
  return DSDS.slice(start, end < 0 ? undefined : end);
}
const privacyScreen = screenOf("DeepSpacePrivacyDesignScreen");
const supportScreen = screenOf("DeepSpaceSupportDesignScreen");
const ONBOARDING = read("src/app/onboarding.tsx");
const CORE_BRAIN = read("src/app/core-brain.tsx");
const SELF_PORTRAIT = read("src/lib/persona/self-portrait.ts");
const TIER_HISTORY = read("src/lib/persona/tier-history.ts");
const BRIGHTNESS = read("src/app/brightness.tsx");
const GAPS = JSON.parse(read("public/proto/data/screens/gaps.json")) as {
  faqs: { q: string; a: string }[];
  notices: { t: string; tag: string }[];
  privacyFacts: { label: string; v: string }[];
};
const FLOWS = JSON.parse(read("public/proto/data/screens/flows.json")) as {
  onboardingSlides: { tag: string; title: string; body: string }[];
};

/** The order a screen indexes the canon array with, read from its source. */
function keyList(source: string, name: string): string[] {
  const m = source.match(new RegExp(`const ${name} = \\[([^\\]]*)\\] as const;`));
  if (!m) throw new Error(`${name} not found`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("tr1: screens read the moved keys", () => {
  it("/support FAQ and notices read deepspace keys outside Korean, no EN mirror left", () => {
    expect(supportScreen).toContain("renderedUiLanguage(i18n)");
    expect(supportScreen).toContain("t(`support.faqs.${key}.q`)");
    expect(supportScreen).toContain("t(`support.faqs.${key}.a`)");
    expect(supportScreen).toContain("t(`support.notices.${key}.t`)");
    expect(supportScreen).toContain("t(`support.notices.${key}.tag`)");
    for (const gone of ["GAPS_FAQ_EN", "GAPS_NOTICE_EN", "Does a paid plan make it smarter?", "SecondB three modes launched"]) {
      expect(DSDS).not.toContain(gone);
    }
  });

  it("/privacy reads every moved privacy key and none of the old English literals", () => {
    const en = flatten(at(pack("en", "deepspace"), "privacy"));
    const moved = Object.keys(en).filter((k) =>
      /^(atGlance|analytics\.|recommend\.|semantic\.|understand|saveFailed|deleteAccount\.)/.test(k),
    );
    expect(moved.length).toBeGreaterThanOrEqual(36);
    for (const k of moved) expect({ key: k, used: privacyScreen.includes(`t("privacy.${k}")`) }).toEqual({ key: k, used: true });
    expect(privacyScreen).toContain("t(`privacy.facts.${key}.label`)");
    expect(privacyScreen).toContain("t(`privacy.facts.${key}.v`)");
    // Reused keys whose text was already the same in every language.
    for (const reused of ['t("privacy.off")', 't("common:states.loading")', 't("common:actions.cancel")', 't("account.delete")']) {
      expect(privacyScreen).toContain(reused);
    }
    for (const gone of [
      "GAPS_FACT_EN",
      '"At a glance"',
      '"Usage analytics and ads"',
      '"Allow usage analytics"',
      '"Locked under 18"',
      '"Recommendations"',
      '"Semantic record connections"',
      "\"Couldn't save. Please try again.\"",
      '"Deletion confirmation"',
      '"Delete account permanently"',
      '"Deleting…"',
      "'Type \"DELETE\" to proceed.'",
    ]) {
      expect({ gone, present: privacyScreen.includes(gone) }).toEqual({ gone, present: false });
    }
  });

  it("onboarding slides and skip read deepspace keys outside Korean", () => {
    expect(ONBOARDING).not.toContain("SLIDE_EN");
    expect(ONBOARDING).toContain('t("onboarding.skip")');
    expect(ONBOARDING).toContain("t(slide.keys[field])");
    for (const k of ["intro.title", "intro.body", "stars.tag", "stars.title", "stars.body", "approve.tag", "approve.title", "approve.body"]) {
      expect(ONBOARDING).toContain(`"onboarding.slides.${k}"`);
    }
    // The first tag is the brand label every locale already shares.
    expect(ONBOARDING).toContain('tag: "auth.brandLabel"');
    for (const gone of ["An AI that gets", "Tell your story", "AI summaries need", '"Skip"']) {
      expect({ gone, present: ONBOARDING.includes(gone) }).toEqual({ gone, present: false });
    }
  });

  it("the self-portrait fields, saved-result card and deck titles read core-brain keys", () => {
    expect(SELF_PORTRAIT).not.toMatch(/Record<"en" \| "ko"/);
    expect(SELF_PORTRAIT).toContain("t(SELF_PORTRAIT_KEYS.label(id))");
    expect(SELF_PORTRAIT).toContain("t(SELF_PORTRAIT_KEYS.hint(id))");
    expect(SELF_PORTRAIT).toContain("t(SELF_PORTRAIT_KEYS.evidenceHint)");
    expect(CORE_BRAIN).toContain("buildSelfPortrait({ persona: portraitSignals }, locale, t)");
    for (const used of ['t("savedResult.title")', 't("savedResult.body")', 't("polarisGraphicA11y")', 't("deck.portrait")', 't("deck.evidence")', 't("persona:export")']) {
      expect(CORE_BRAIN).toContain(used);
    }
    for (const gone of ['"Previously saved result"', '"SELF PORTRAIT"', '"EVIDENCE"', '"Export"', "What fuels me", "Opens the records behind"]) {
      expect({ gone, present: CORE_BRAIN.includes(gone) || SELF_PORTRAIT.includes(gone) }).toEqual({ gone, present: false });
    }
  });

  it("the /brightness nudge sentence comes from the brightness bundle", () => {
    expect(TIER_HISTORY).not.toContain("Recent shift");
    expect(TIER_HISTORY).toContain('t(cited > 0 ? "shiftNudgeCited" : "shiftNudge", { stars, n: cited })');
    expect(BRIGHTNESS).toContain("(key, vars) => t(key, vars)");
    expect(BRIGHTNESS).toContain("[observations, locale, t]");
  });
});

describe("tr1: the Korean screen still paints the canon, and the ko keys mirror it", () => {
  it("support FAQ keys follow canonGaps.faqs order and text", () => {
    const keys = keyList(DSDS, "GAPS_FAQ_KEYS");
    expect(keys).toHaveLength(GAPS.faqs.length);
    const ko = pack("ko", "deepspace");
    keys.forEach((k, i) => {
      expect(at(ko, `support.faqs.${k}.q`)).toBe(GAPS.faqs[i].q);
      expect(at(ko, `support.faqs.${k}.a`)).toBe(GAPS.faqs[i].a);
    });
  });

  it("support notice keys follow canonGaps.notices order and text", () => {
    const keys = keyList(DSDS, "GAPS_NOTICE_KEYS");
    expect(keys).toHaveLength(GAPS.notices.length);
    const ko = pack("ko", "deepspace");
    keys.forEach((k, i) => {
      expect(at(ko, `support.notices.${k}.t`)).toBe(GAPS.notices[i].t);
      expect(at(ko, `support.notices.${k}.tag`)).toBe(GAPS.notices[i].tag);
    });
  });

  it("privacy fact keys follow canonGaps.privacyFacts order and text", () => {
    const keys = keyList(DSDS, "GAPS_FACT_KEYS");
    expect(keys).toHaveLength(GAPS.privacyFacts.length);
    const ko = pack("ko", "deepspace");
    keys.forEach((k, i) => {
      expect(at(ko, `privacy.facts.${k}.label`)).toBe(GAPS.privacyFacts[i].label);
      expect(at(ko, `privacy.facts.${k}.v`)).toBe(GAPS.privacyFacts[i].v);
    });
  });

  it("onboarding slide keys follow canonFlows.onboardingSlides order and text", () => {
    expect(ONBOARDING).toContain("ko || !slide.keys ? slide.ko[field]");
    const ko = pack("ko", "deepspace");
    const slots = [
      { tag: "auth.brandLabel", title: "onboarding.slides.intro.title", body: "onboarding.slides.intro.body" },
      { tag: "onboarding.slides.stars.tag", title: "onboarding.slides.stars.title", body: "onboarding.slides.stars.body" },
      { tag: "onboarding.slides.approve.tag", title: "onboarding.slides.approve.title", body: "onboarding.slides.approve.body" },
    ];
    expect(slots).toHaveLength(FLOWS.onboardingSlides.length);
    slots.forEach((slot, i) => {
      for (const field of ["tag", "title", "body"] as const) {
        expect(ONBOARDING).toContain(`${field}: "${slot[field]}"`);
        expect(at(ko, slot[field])).toBe(FLOWS.onboardingSlides[i][field]);
      }
    });
    // check:constraints pins the literal; the ko key carries the same word.
    expect(ONBOARDING).toContain('ko ? "건너뛰기" : t("onboarding.skip")');
    expect(at(ko, "onboarding.skip")).toBe("건너뛰기");
  });
});

describe("tr1: es/pt/id carry their own text", () => {
  const MOVED: Record<string, string[]> = {
    deepspace: ["privacy.atGlance", "privacy.facts", "privacy.analytics", "privacy.recommend", "privacy.semantic", "privacy.understand", "privacy.understandA11y", "privacy.saveFailed", "privacy.deleteAccount", "support.faqs", "support.notices", "onboarding.skip", "onboarding.slides"],
    "core-brain": ["portrait", "savedResult", "polarisGraphicA11y", "deck"],
    brightness: ["shiftNudge", "shiftNudgeCited"],
  };

  it.each(["es", "pt", "id"])("%s differs from the English source for every moved key", (lng) => {
    let compared = 0;
    for (const [ns, roots] of Object.entries(MOVED)) {
      const en = pack("en", ns);
      const other = pack(lng, ns);
      for (const root of roots) {
        const enFlat = flatten(at(en, root), root);
        for (const [key, value] of Object.entries(enFlat)) {
          const mine = at(other, key);
          compared++;
          expect({ ns, key, translated: typeof mine === "string" && mine.length > 0 && mine !== value }).toEqual({ ns, key, translated: true });
        }
      }
    }
    expect(compared).toBeGreaterThanOrEqual(80);
  });

  it.each(["en", "ko", "es", "pt", "id"])("%s keeps the DELETE token and the nudge variables", (lng) => {
    expect(at(pack(lng, "deepspace"), "privacy.deleteAccount.typePrompt")).toContain('"DELETE"');
    const b = pack(lng, "brightness");
    expect(b.shiftNudge).toContain("{{stars}}");
    expect(b.shiftNudgeCited).toContain("{{stars}}");
    expect(b.shiftNudgeCited).toContain("{{n}}");
  });
});

describe("tr1: what stays KO/EN on purpose", () => {
  it("the two overseas-transfer disclosures on /privacy are not moved into a translated bundle (F2)", () => {
    expect(privacyScreen).toContain("Before you turn it on. Your records are sent to ${recommendationVendorLabel()}");
    expect(privacyScreen).toContain("To do that, record text is sent to ${embedVendorLabel()} (processed overseas)");
    for (const lng of ["en", "es", "pt", "id"]) {
      const text = JSON.stringify(pack(lng, "deepspace"));
      expect({ lng, leaked: text.includes("processed overseas") }).toEqual({ lng, leaked: false });
    }
    // Their consent rows are ko or en, which is why the copy stays ko or en.
    expect(privacyScreen).toContain('locale: ko ? "ko" : "en"');
  });
});
