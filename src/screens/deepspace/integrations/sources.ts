// `/integrations` is a visual entry hub, not a second connector engine.
// Keep every row pointed at the production flow that owns the real state:
// `/import-hub` owns export/OAuth imports, `/import` owns native health
// permission + empty/error states, and `/capture` owns photo intake.

export type IntegrationRoute = "/import-hub" | "/import?mode=account" | "/capture";

export interface IntegrationEntrypoint {
  id: "cal" | "health" | "notion" | "photos" | "gpt";
  icon: "forum" | "bedtime" | "book" | "camera" | "bubble";
  nameKey?: string;
  name?: "Notion";
  detailKey: string;
  actionKey: "connect.connect" | "connect.openImport" | "connect.openCapture";
  route: IntegrationRoute;
}

export const INTEGRATION_ENTRYPOINTS: readonly IntegrationEntrypoint[] = [
  {
    id: "cal",
    icon: "forum",
    nameKey: "connect.sources.cal.name",
    detailKey: "connect.sources.cal.sub",
    actionKey: "connect.openImport",
    route: "/import-hub",
  },
  {
    id: "health",
    icon: "bedtime",
    // Health Connect on Android and HealthKit on iOS share this neutral label.
    nameKey: "import.healthName",
    // The old connect subtitle called health a star. The real health flow calls
    // this an activity sync and owns consent, OS permission, denied, unavailable,
    // and no-data states, so use that existing localized copy instead.
    detailKey: "import:health.connect",
    actionKey: "connect.connect",
    route: "/import?mode=account",
  },
  {
    id: "notion",
    icon: "book",
    name: "Notion",
    detailKey: "connect.sources.notion.sub",
    actionKey: "connect.openImport",
    route: "/import-hub",
  },
  {
    id: "photos",
    icon: "camera",
    nameKey: "connect.sources.photos.name",
    // Do not repeat the prototype's unsupported claim that a photo already
    // yielded relationship/rest signals. This row only promises its real action.
    detailKey: "connect.openCapture",
    actionKey: "connect.openCapture",
    route: "/capture",
  },
  {
    id: "gpt",
    icon: "bubble",
    nameKey: "connect.sources.gpt.name",
    detailKey: "connect.sources.gpt.sub",
    actionKey: "connect.openImport",
    route: "/import-hub",
  },
] as const;
