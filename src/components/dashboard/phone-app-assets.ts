// The supplied artwork stays separate from labels, dates, badges, and actions.
// Static requires are needed for Metro's native asset bundling.
export const PHONE_APP_ICONS = {
  notifications: require("../../../assets/images/phone-app/app_icons/icon_notification.png"),
  assistant: require("../../../assets/images/phone-app/app_icons/icon_assistant.png"),
  focus: require("../../../assets/images/phone-app/app_icons/icon_focus_timer.png"),
  reminders: require("../../../assets/images/phone-app/app_icons/icon_reminder.png"),
  money: require("../../../assets/images/phone-app/app_icons/icon_expense.png"),
  growth: require("../../../assets/images/phone-app/app_icons/icon_goal.png"),
  meals: require("../../../assets/images/phone-app/app_icons/icon_meal.png"),
  museum: require("../../../assets/images/phone-app/app_icons/icon_ai_museum.png"),
  community: require("../../../assets/images/phone-app/app_icons/icon_community.png"),
  relationships: require("../../../assets/images/phone-app/app_icons/icon_people.png"),
  settings: require("../../../assets/images/phone-app/app_icons/icon_settings.png"),
  more: require("../../../assets/images/phone-app/app_icons/icon_more.png"),
  avatarPalette: require("../../../assets/images/phone-app/app_icons/icon_avatar_palette.png"),
} as const;

export type PhoneAppId = keyof typeof PHONE_APP_ICONS;

export const PHONE_UI_ART = {
  hero: require("../../../assets/images/phone-app/scene/hero_evening_village.png"),
  tile: require("../../../assets/images/phone-app/ui_icons/app_tile_frame.png"),
  brand: require("../../../assets/images/phone-app/ui_icons/brand_sparkle.png"),
  sun: require("../../../assets/images/phone-app/ui_icons/weather_sun.png"),
  previous: require("../../../assets/images/phone-app/ui_icons/chevron_left.png"),
  next: require("../../../assets/images/phone-app/ui_icons/chevron_right.png"),
  currentPage: require("../../../assets/images/phone-app/ui_icons/page_active.png"),
  otherPage: require("../../../assets/images/phone-app/ui_icons/page_inactive.png"),
} as const;
