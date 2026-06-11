// Ops domains (O-R3): the 14 life-management areas from Simon's capture,
// grouped so the picker never shows more than ~5 choices at once (Hick).
// Labels live in the `ops` i18n namespace (ops:groups.* / ops:domains.*).

export const OPS_GROUP_IDS = ["body", "learning", "worklife", "living", "creative"] as const;
export type OpsGroupId = (typeof OPS_GROUP_IDS)[number];

export const OPS_DOMAIN_IDS = [
  "exercise_routine",
  "exercise_ideas",
  "health_routine",
  "weekly_meals",
  "simple_meals",
  "reading_list",
  "learning_goals",
  "language_practice",
  "career_check",
  "money_check",
  "daily_focus",
  "home_reset",
  "news_digest",
  "side_project",
] as const;
export type OpsDomainId = (typeof OPS_DOMAIN_IDS)[number];

export const OPS_DOMAIN_GROUP: Record<OpsDomainId, OpsGroupId> = {
  exercise_routine: "body",
  exercise_ideas: "body",
  health_routine: "body",
  weekly_meals: "body",
  simple_meals: "body",
  reading_list: "learning",
  learning_goals: "learning",
  language_practice: "learning",
  career_check: "worklife",
  money_check: "worklife",
  daily_focus: "living",
  home_reset: "living",
  news_digest: "living",
  side_project: "creative",
};

export function domainsForGroup(group: OpsGroupId): OpsDomainId[] {
  return OPS_DOMAIN_IDS.filter((d) => OPS_DOMAIN_GROUP[d] === group);
}
