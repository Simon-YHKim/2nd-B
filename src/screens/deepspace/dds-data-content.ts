export type DataRightId = "import" | "account-export" | "iden" | "deletion";
export type DataRoute = "/import-hub" | "/account?tool=export" | "/iden" | "/privacy";
export type DataGlyph = "uploadFile" | "download" | "iden" | "trash";

export type DataTranslationKey =
  | "deepspace:account.navData"
  | "data:hero.title"
  | "data:hero.subtitle"
  | "data:hero.speech"
  | "data:import.eyebrow"
  | "data:import.body"
  | "data:import.button"
  | "data:import.accessibilityHint"
  | "consent:account.export.label"
  | "consent:account.export.body"
  | "consent:account.export.button"
  | "consent:account.export.buttonHint"
  | "iden:entry.eyebrow"
  | "iden:entry.body"
  | "iden:entry.button"
  | "iden:entry.accessibilityHint"
  | "data:delete.eyebrow"
  | "data:delete.body"
  | "data:delete.button"
  | "data:delete.accessibilityHint";

export interface DataScreenMeta {
  titleKey: DataTranslationKey;
  heroTitleKey: DataTranslationKey;
  heroSubtitleKey: DataTranslationKey;
  heroBodyKey: DataTranslationKey;
}

export interface DataRightItem {
  id: DataRightId;
  icon: DataGlyph;
  titleKey: DataTranslationKey;
  bodyKey: DataTranslationKey;
  actionLabelKey: DataTranslationKey;
  actionHintKey: DataTranslationKey;
  route: DataRoute;
  danger?: true;
}

export const DATA_SCREEN_META: DataScreenMeta = {
  titleKey: "deepspace:account.navData",
  heroTitleKey: "data:hero.title",
  heroSubtitleKey: "data:hero.subtitle",
  heroBodyKey: "data:hero.speech",
};

export const DATA_RIGHTS: readonly DataRightItem[] = [
  {
    id: "import",
    icon: "uploadFile",
    titleKey: "data:import.eyebrow",
    bodyKey: "data:import.body",
    actionLabelKey: "data:import.button",
    actionHintKey: "data:import.accessibilityHint",
    route: "/import-hub",
  },
  {
    id: "account-export",
    icon: "download",
    titleKey: "consent:account.export.label",
    bodyKey: "consent:account.export.body",
    actionLabelKey: "consent:account.export.button",
    actionHintKey: "consent:account.export.buttonHint",
    route: "/account?tool=export",
  },
  {
    id: "iden",
    icon: "iden",
    titleKey: "iden:entry.eyebrow",
    bodyKey: "iden:entry.body",
    actionLabelKey: "iden:entry.button",
    actionHintKey: "iden:entry.accessibilityHint",
    route: "/iden",
  },
  {
    id: "deletion",
    icon: "trash",
    titleKey: "data:delete.eyebrow",
    bodyKey: "data:delete.body",
    actionLabelKey: "data:delete.button",
    actionHintKey: "data:delete.accessibilityHint",
    route: "/privacy",
    danger: true,
  },
];
