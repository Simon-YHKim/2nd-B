// One list of app-written scaffolding tags (QA 261004 D-07).
//
// /discover and /research showed first_light, first_light:affirm and interview
// as the user's topics because they stripped only domain:. load-domain-levels
// already had its own SYSTEM_TAGS list (voice, todo, interview) that the topic
// surfaces never used. The predicate now lives once in domain-stars.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isSystemTag, stripSystemTags } from "../domain-stars";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("isSystemTag / stripSystemTags", () => {
  it("treats every tag the app writes as scaffolding, case-insensitively", () => {
    for (const tag of [
      "domain:career",
      "DOMAIN:growth",
      "first_light",
      "first_light:affirm",
      "first_light:soft",
      "interview",
      "recall",
      "screener",
      "entry-ui:ko",
      "entry-ui:en",
      "voice",
      "Todo",
      " interview ",
    ]) {
      expect({ tag, system: isSystemTag(tag) }).toEqual({ tag, system: true });
    }
  });

  it("keeps the user's own topics, including look-alikes", () => {
    for (const tag of ["reading", "interviews", "first light", "recall-practice", "domain", "voice memo"]) {
      expect({ tag, system: isSystemTag(tag) }).toEqual({ tag, system: false });
    }
    expect(stripSystemTags(["first_light", "reading", "domain:rest", "walk"])).toEqual(["reading", "walk"]);
  });

  it("covers every literal tag the TTFV note and the recall interview write", () => {
    // If one of these screens starts writing a new marker tag, it must join the
    // list, or it will show up on /discover and /research as a "topic".
    const ttfv = read("src/screens/deepspace/onboarding/TTFVScreen.tsx");
    const interview = read("src/app/interview.tsx");
    const written: string[] = [];
    for (const src of [ttfv, interview]) {
      for (const m of src.matchAll(/tags:\s*\[([^\]]*)\]/g)) {
        for (const lit of m[1].matchAll(/["`]([^"`$]+)(?:\$\{[^}]*\})?["`]/g)) written.push(lit[1]);
      }
    }
    expect(written).toEqual(
      expect.arrayContaining(["first_light", "first_light:", "interview", "recall", "screener", "entry-ui:"]),
    );
    const notSystem = written.filter((tag) => !isSystemTag(tag.endsWith(":") ? `${tag}x` : tag));
    expect(notSystem).toEqual([]);
  });

  it("is the one list: load-domain-levels and the topic surfaces all use it", () => {
    const levels = read("src/lib/persona/load-domain-levels.ts");
    expect(levels).toMatch(/import \{[^}]*\bisSystemTag\b[^}]*\} from "\.\/domain-stars"/);
    expect(levels).not.toMatch(/new Set\(\["voice"/);
    expect(levels).not.toMatch(/function isSystemTag/);
    for (const rel of [
      "src/lib/trends/rising.ts",
      "src/lib/records/records-research.ts",
      "src/lib/records/records-graph.ts",
    ]) {
      const src = read(rel);
      expect({ rel, usesSystem: src.includes("stripSystemTags(") }).toEqual({ rel, usesSystem: true });
      expect({ rel, domainOnly: src.includes("stripDomainTags(") }).toEqual({ rel, domainOnly: false });
    }
  });
});
