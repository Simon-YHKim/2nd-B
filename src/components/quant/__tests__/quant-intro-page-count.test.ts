import { readFileSync } from "node:fs";
import path from "node:path";

// Source-level guard: these components pull in the deep-space shell and cannot be
// mounted in this suite. What matters is arithmetic agreement between two files,
// which reads fine statically.
const root = path.join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

const INTRO = read("components/quant/QuantIntroModal.tsx");
const PAGER = read("components/quant/QuantPager.tsx");

// route -> the perPage each screen hands QuantPager
const SCREENS: [string, string][] = [
  ["app/attachment.tsx", "5"],
  ["app/big-five.tsx", "5"],
  ["app/ipip-neo.tsx", "8"],
  ["app/motivation.tsx", "4"],
  ["app/rlss.tsx", "RLSS_ITEMS.length"],
  ["app/strengths.tsx", "4"],
  ["app/values.tsx", "4"],
];

describe("the intro's page count matches the pager's", () => {
  it("derives the count from perPage instead of a hardcoded 5", () => {
    // /5 was right for only 2 of the 7 instruments. /strengths paginates by 4, so
    // the intro promised 2 pages and the pager then rendered "1 / 3 페이지".
    expect(INTRO).toContain("Math.ceil(itemCount / Math.max(1, perPage))");
    expect(INTRO).not.toContain("Math.ceil(itemCount / 5)");
  });

  it("keeps 5 as the default so a non-paginating caller is unchanged", () => {
    expect(INTRO).toContain("perPage = 5,");
  });

  it("uses the same formula the pager uses", () => {
    expect(PAGER).toContain("Math.ceil(totalItems / perPage)");
  });

  it.each(SCREENS)("%s hands the intro the same perPage it hands the pager", (rel, per) => {
    const src = read(rel);
    const introBlock = src.slice(src.indexOf("<QuantIntro"));
    expect(introBlock).toContain(`perPage={${per}}`);
    expect(src).toContain(`perPage={${per}}`);
    // Both consumers must agree; a screen passing two different values is the
    // exact defect this test exists to stop.
    const occurrences = src.split(`perPage={${per}}`).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
