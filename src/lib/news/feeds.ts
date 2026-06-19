// Wave 2 — News digest engine (news_digest ops domain).
//
// RSS is the ground truth: a small, curated list of FREE public RSS feeds.
// $0/mo (blueprint §5) holds because every feed below is a public RSS endpoint
// with no key and no paid tier. Korea-first per the roadmap, plus one world feed.
//
// This list is data only — no network, no parsing. fetch.ts reads `url`,
// parse.ts maps the XML, and queries.ts caches the result per user. The AI
// summary (summarize.ts) is a separate OPT-IN step and never runs from here.

export type FeedLang = "ko" | "en";

export interface NewsFeed {
  /** Stable id used as the persisted `source` and the fetch key. */
  id: string;
  /** Human label (EN canonical per C7; UI localizes separately). */
  label: string;
  /** Public RSS/Atom endpoint. No key, no paid tier ($0). */
  url: string;
  lang: FeedLang;
}

// Curated, free, public RSS endpoints. Korea-first (연합/한겨레/매경) + one world.
export const NEWS_FEEDS: readonly NewsFeed[] = [
  {
    id: "yonhap",
    label: "Yonhap News",
    url: "https://www.yna.co.kr/rss/news.xml",
    lang: "ko",
  },
  {
    id: "hani",
    label: "Hankyoreh",
    url: "https://www.hani.co.kr/rss/",
    lang: "ko",
  },
  {
    id: "mk",
    label: "Maeil Business",
    url: "https://www.mk.co.kr/rss/30000001/",
    lang: "ko",
  },
  {
    id: "bbc-world",
    label: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    lang: "en",
  },
] as const;

export type NewsFeedId = (typeof NEWS_FEEDS)[number]["id"];

/** Lookup a feed by id (returns undefined for an unknown id). */
export function getFeed(feedId: string): NewsFeed | undefined {
  return NEWS_FEEDS.find((f) => f.id === feedId);
}
