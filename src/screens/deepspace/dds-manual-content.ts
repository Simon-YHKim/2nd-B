// 사용 안내서의 구조. **문구는 여기 없다** — 로케일 번들(manual.json 의 `guide`)에 있다.
//
// ⚠ 2026-09-08 이전에는 이 파일이 `Record<"en" | "ko", …>` 로 문구를 직접 들고 있었고,
// 화면이 `i18n.language.startsWith("ko") ? "ko" : "en"` 으로 골랐다. 그래서 앱이
// 다섯 언어(en · ko · es · pt · id)를 제공하는데 **안내서는 두 언어뿐**이었고,
// es · pt · id 사용자는 영어를 봤다. 번역이 없어서가 아니라 **번역이 닿을 수 없는
// 곳에 문구가 있었기 때문**이다 — 코드 안의 문자열은 번역 파이프라인이 못 본다.
//
// 검사가 이걸 못 잡은 이유도 같다: /manual 의 카피 핀들이 **라우트의 죽은 반쪽**을
// 읽고 있었고 그쪽은 t() 를 제대로 썼다. 배송되는 화면은 아무도 안 보고 있었다.
//
// 그래서 이 파일은 이제 **id · 아이콘 · 목적지**만 갖는다. 문구는 키로 가리키고
// 화면이 t() 로 푼다. 새 문구는 다른 모든 카피와 같은 길을 탄다.

export type ManualTopicId =
  | "stars"
  | "brightness"
  | "source"
  | "ratify"
  | "data"
  | "refund"
  | "export"
  | "deleteAccount"
  | "notifications";

export type ManualRoute =
  | "/secondb?panel=dashboard"
  | "/brightness"
  | "/records"
  | "/review"
  | "/privacy"
  | "/iden"
  | "/data?open=account-export"
  | "/support"
  | "/subscription"
  | "/privacy?section=delete"
  | "/permissions";

export type ManualGlyph =
  | "home"
  | "sparkle"
  | "book"
  | "taskAlt"
  | "lock"
  | "creditCard"
  | "download"
  | "trash"
  | "notifications";

/** 번들에서 문구를 꺼내는 함수. 화면의 `t` 를 그대로 넘긴다. */
export type ManualTranslate = (key: string) => string;

export interface ManualAction {
  label: string;
  route: ManualRoute;
  /** The screen has something to do only in the phone app (see NATIVE_ONLY). */
  nativeOnly: boolean;
}

export interface ManualTopic {
  id: ManualTopicId;
  icon: ManualGlyph;
  question: string;
  answer: string;
  actions: readonly ManualAction[];
}

export interface ManualScreenCopy {
  hero: string;
  tip: string;
  searchLabel: string;
  searchPlaceholder: string;
  noResults: string;
  expanded: string;
  collapsed: string;
}

/** 액션 라벨 키. 목적지마다 하나이고, 여러 주제가 같은 목적지를 쓰면 라벨도 같다. */
const ACTION_KEY: Record<ManualRoute, string> = {
  "/secondb?panel=dashboard": "dashboard",
  "/brightness": "brightness",
  "/records": "records",
  "/review": "review",
  "/privacy": "privacy",
  "/iden": "iden",
  "/data?open=account-export": "accountExport",
  "/support": "support",
  "/subscription": "subscription",
  "/privacy?section=delete": "deleteAccount",
  "/permissions": "permissions",
};

/** Destinations with nothing to do on the web. The permissions screen draws its rows only on a
 *  phone, and the web build loads no notification module (notifications-sdk.web.ts), so on the
 *  web the notifications answer stands without a button. */
const NATIVE_ONLY: ReadonlySet<ManualRoute> = new Set<ManualRoute>(["/permissions"]);

interface TopicSpec {
  id: ManualTopicId;
  icon: ManualGlyph;
  routes: readonly ManualRoute[];
}

/** 주제의 뼈대. 순서가 화면 순서다. */
const TOPIC_SPECS: readonly TopicSpec[] = [
  { id: "stars", icon: "home", routes: ["/secondb?panel=dashboard"] },
  { id: "brightness", icon: "sparkle", routes: ["/brightness"] },
  { id: "source", icon: "book", routes: ["/records"] },
  { id: "ratify", icon: "taskAlt", routes: ["/review"] },
  {
    id: "data",
    icon: "lock",
    routes: ["/privacy", "/iden", "/data?open=account-export", "/support"],
  },
  // Common tasks (Z69, Simon 2026-10-13): a search for refund or notifications found nothing
  // and sent the visitor to the chat. Each answer has one button to the screen that does it.
  { id: "refund", icon: "creditCard", routes: ["/subscription"] },
  { id: "export", icon: "download", routes: ["/data?open=account-export"] },
  { id: "deleteAccount", icon: "trash", routes: ["/privacy?section=delete"] },
  { id: "notifications", icon: "notifications", routes: ["/permissions"] },
];

const SCREEN_FIELDS = [
  "hero",
  "tip",
  "searchLabel",
  "searchPlaceholder",
  "noResults",
  "expanded",
  "collapsed",
] as const;

export function manualScreenCopyFor(t: ManualTranslate): ManualScreenCopy {
  const out = {} as Record<(typeof SCREEN_FIELDS)[number], string>;
  for (const field of SCREEN_FIELDS) out[field] = t(`manual:guide.${field}`);
  return out;
}

export function manualTopicsFor(t: ManualTranslate): readonly ManualTopic[] {
  return TOPIC_SPECS.map(({ id, icon, routes }) => ({
    id,
    icon,
    question: t(`manual:guide.topics.${id}.question`),
    answer: t(`manual:guide.topics.${id}.answer`),
    actions: routes.map((route) => ({
      label: t(`manual:guide.actions.${ACTION_KEY[route]}`),
      route,
      nativeOnly: NATIVE_ONLY.has(route),
    })),
  }));
}

/** The buttons this platform draws: on the web, the ones that would open an empty screen are left out. */
export function visibleManualActions(actions: readonly ManualAction[], os: string): readonly ManualAction[] {
  return os === "web" ? actions.filter(({ nativeOnly }) => !nativeOnly) : actions;
}

/** The topics as this platform shows them. The screen searches and draws this one list, so a
 *  button left out on the web cannot match a search either (review #2640 r2). */
export function manualTopicsOn(topics: readonly ManualTopic[], os: string): readonly ManualTopic[] {
  return topics.map((topic) => ({ ...topic, actions: visibleManualActions(topic.actions, os) }));
}

function searchableText(topic: ManualTopic): string {
  return [topic.question, topic.answer, ...topic.actions.map(({ label }) => label)].join(" ");
}

export function filterManualTopics(
  topics: readonly ManualTopic[],
  query: string,
): readonly ManualTopic[] {
  const needle = query.normalize("NFKC").trim().toLocaleLowerCase();
  if (!needle) return topics;
  return topics.filter((topic) =>
    searchableText(topic).normalize("NFKC").toLocaleLowerCase().includes(needle),
  );
}
