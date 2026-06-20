import { opsRouteForDomain } from "../nav";
import { OPS_DOMAIN_IDS } from "../domains";

describe("opsRouteForDomain (domain picker = router)", () => {
  test("domains with a dedicated screen map to their route", () => {
    expect(opsRouteForDomain("reading_list")).toBe("/reading");
    expect(opsRouteForDomain("weekly_meals")).toBe("/meals");
    expect(opsRouteForDomain("simple_meals")).toBe("/meals");
    expect(opsRouteForDomain("learning_goals")).toBe("/milestones");
    expect(opsRouteForDomain("career_check")).toBe("/milestones");
    expect(opsRouteForDomain("money_check")).toBe("/ledger");
    expect(opsRouteForDomain("side_project")).toBe("/side-project");
  });

  test("domains without a dedicated screen converge to /ops (null)", () => {
    for (const d of [
      "exercise_routine",
      "exercise_ideas",
      "health_routine",
      "language_practice",
      "daily_focus",
      "home_reset",
      "news_digest",
    ] as const) {
      expect(opsRouteForDomain(d)).toBeNull();
    }
  });

  test("every domain id resolves (route or null), never undefined", () => {
    for (const d of OPS_DOMAIN_IDS) {
      const r = opsRouteForDomain(d);
      expect(r === null || typeof r === "string").toBe(true);
    }
  });
});
