export const TIER_ICON_IDS = [
  "archive_scroll",
  "paper_journal",
  "book_wiki",
  "link_capture",
  "file_source",
  "cube_data",
  "clock_time",
  "dream_crystal",
  "idea_lamp",
  "seed_growth",
  "heart_relationship",
  "compass_inspiration",
  "spark_recent",
] as const;

export type TierIconId = typeof TIER_ICON_IDS[number];

export function shardIconForSource(source: string): TierIconId {
  switch (source) {
    case "journal": return "paper_journal";
    case "wiki": return "book_wiki";
    case "capture": return "link_capture";
    case "interview": return "heart_relationship";
    case "audit": return "compass_inspiration";
    case "inbox": return "archive_scroll";
    case "article": return "archive_scroll";
    case "video": return "clock_time";
    case "paper": return "file_source";
    case "reddit": return "heart_relationship";
    case "code": return "idea_lamp";
    case "ai_tool": return "idea_lamp";
    case "self_knowledge": return "dream_crystal";
    default: return "cube_data";
  }
}
