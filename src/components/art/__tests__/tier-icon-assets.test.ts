import { readdirSync } from "node:fs";
import path from "node:path";

import { TIER_ICON_IDS, shardIconForSource } from "@/components/art/tier-icon-contract";

const EXPECTED_TIER_ICON_IDS = [
  "archive_scroll",
  "book_wiki",
  "clock_time",
  "compass_inspiration",
  "cube_data",
  "dream_crystal",
  "file_source",
  "heart_relationship",
  "idea_lamp",
  "link_capture",
  "paper_journal",
  "seed_growth",
  "spark_recent",
] as const;

const EXPECTED_TIER_ICON_FILES = [
  "archive_scroll_premium.png",
  "book_premium.png",
  "clock_premium.png",
  "compass_premium.png",
  "data_cube_premium.png",
  "dream_crystal_premium.png",
  "file_page_premium.png",
  "flying_paper_premium.png",
  "heart_connection_premium.png",
  "idea_lamp_premium.png",
  "link_chain_premium.png",
  "seed_growth_premium.png",
  "star_spark_premium.png",
];

describe("TierIcon asset map", () => {
  test("maps every production tier icon asset", () => {
    const dir = path.join(process.cwd(), "public", "assets", "2ndb-production-premium-v1", "tier-icons");
    const files = readdirSync(dir).filter((name) => name.endsWith(".png")).sort();

    expect(files).toEqual(EXPECTED_TIER_ICON_FILES);
    expect([...TIER_ICON_IDS].sort()).toEqual([...EXPECTED_TIER_ICON_IDS].sort());
  });

  test("assigns specific source kinds to non-generic icons", () => {
    expect(shardIconForSource("inbox")).toBe("archive_scroll");
    expect(shardIconForSource("video")).toBe("clock_time");
    expect(shardIconForSource("code")).toBe("idea_lamp");
    expect(shardIconForSource("self_knowledge")).toBe("dream_crystal");
  });
});
