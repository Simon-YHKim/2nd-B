// H9, the half that needed no building: the ad stack and the analytics stack are
// already separate, and the analytics stack never grants an ad signal.
//
// That was worth confirming rather than assuming, and it turned out to be true in
// a specific and fragile way: every GA4/Firebase consent call in
// analytics/index.ts hardcodes ad_storage / ad_user_data / ad_personalization to
// denied, in ALL states — flag off, flag on, revoke, and grant. Web Clarity is
// structurally absent because its SPA history restart cannot uphold the private-
// route boundary. There is no variable, pref, or branch that grants ad storage.
//
// A literal repeated four times is exactly the thing a later edit unifies into a
// variable "for cleanliness" and then makes conditional. This pins it.
//
// It also pins the other half: health data (PIPA 민감정보) has no path into the
// analytics payloads, because the two modules that read health_samples do not
// import the analytics module at all.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LIB = join(__dirname, "..", "..");

function read(...parts: string[]): string {
  return readFileSync(join(LIB, ...parts), "utf8").replace(/\r\n/g, "\n");
}

const ANALYTICS = read("analytics", "index.ts");

describe("the analytics stack never grants an ad signal", () => {
  test("every ad_storage assignment denies", () => {
    const values = [...ANALYTICS.matchAll(/ad_storage:\s*([^,\n]+)/g)].map((m) => m[1].trim());
    expect(values.length).toBeGreaterThanOrEqual(4);
    for (const v of values) expect(v).toMatch(/^("denied"|false)$/);
  });

  test("every ad_user_data and ad_personalization assignment denies", () => {
    const values = [...ANALYTICS.matchAll(/ad_(?:user_data|personalization):\s*([^,\n]+)/g)].map(
      (m) => m[1].trim(),
    );
    expect(values.length).toBeGreaterThanOrEqual(6);
    for (const v of values) expect(v).toMatch(/^("denied"|false)$/);
  });

  test("web Clarity is structurally absent", () => {
    expect(ANALYTICS).toMatch(/WEB_CLARITY_HARD_DISABLED\s*=\s*true/);
    expect(ANALYTICS).not.toMatch(/clarity\.ms\/tag/);
    expect(ANALYTICS).not.toMatch(/\.clarity\?\./);
    expect(ANALYTICS).not.toMatch(/ad_Storage\s*:/);
  });

  test("no ad signal is ever computed from a variable", () => {
    // The denial has to stay a literal at each call site. The moment one of these
    // reads `granted` or any other identifier, "analytics consent" and "ad
    // consent" have become the same switch, which is the thing being prevented.
    const suspicious = [...ANALYTICS.matchAll(/ad_(?:storage|Storage|user_data|personalization):\s*([^,\n]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^("denied"|false)$/.test(v));
    expect(suspicious).toEqual([]);
  });
});

describe("health data has no path into analytics", () => {
  test("the two modules that read health_samples do not import analytics", () => {
    for (const file of [
      ["persona", "load-domain-levels.ts"],
      ["ops", "routines.ts"],
    ] as const) {
      const src = read(...file);
      expect(src).toMatch(/health_samples|health-link|healthSample/i);
      expect(src).not.toMatch(/from\s+["']@\/lib\/analytics["']/);
      expect(src).not.toMatch(/from\s+["'](\.\.\/)+analytics/);
    }
  });

  test("star_lit reports a self-knowledge star id, not a life-domain one", () => {
    // The seven ids in stars.ts (now/recall/seen/rhythm/relational/possible/values)
    // and the domain ids in domain-stars.ts are different sets, and only the
    // former is emitted. The latter includes "health"; if the event ever switched
    // sources, a bare metric name would start leaving the device.
    const domains = read("persona", "domain-stars.ts");
    const stars = read("persona", "stars.ts");
    expect(domains).toMatch(/"health"/);
    expect(stars).not.toMatch(/"health"/);

    const emitter = read("persona", "record-star-tiers.ts");
    expect(emitter).toMatch(/star_lit/);
    expect(emitter).not.toMatch(/domain-stars|DomainId/);
  });
});
