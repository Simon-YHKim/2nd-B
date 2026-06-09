// Soul Core v3 pixel-art bindings. The SVGs in public/assets/cosmic-pixel-v3-
// soulcore/ are imported as React components via react-native-svg-transformer
// (see metro.config.js). Reference-only — the art is owned by the asset
// workstream; this module just maps it to typed components for the render layer.
//
// Wired into IslandArt (graph core art) behind EXPO_PUBLIC_USE_V3_ART (default
// off). Mascot sprite sheets, momo-crew, and pattern-link edge art live in the
// same pack for later wiring (PatternLink.renderEdge / CrewLayer.renderCrew);
// see public/assets/cosmic-pixel-v3-soulcore/docs/asset_mapping.md.

import type { FC } from "react";
import type { SvgProps } from "react-native-svg";

import SoulCoreHero from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/graph/soul_core_hero.svg";
import BondCore from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/graph/bond_core.svg";
import WisdomCore from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/graph/wisdom_core.svg";
import NarrativeCore from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/graph/narrative_core.svg";
import MuseCore from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/graph/muse_core.svg";
import GrowthCore from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/graph/growth_core.svg";

import ArchonIdle from "../../../public/assets/cosmic-pixel-v3-soulcore/companions/sprites/archon/archon_idle.svg";
import ReliaIdle from "../../../public/assets/cosmic-pixel-v3-soulcore/companions/sprites/relia/relia_idle.svg";
import LumenIdle from "../../../public/assets/cosmic-pixel-v3-soulcore/companions/sprites/lumen/lumen_idle.svg";
import ForemanMomoIdle from "../../../public/assets/cosmic-pixel-v3-soulcore/companions/sprites/foreman_momo/foreman_momo_idle.svg";
import LuminaIdle from "../../../public/assets/cosmic-pixel-v3-soulcore/companions/sprites/iris/iris_idle.svg";

import CrewWorking from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_working.svg";
import CrewIdlePlaying from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_idle_playing.svg";
import CrewSlacking from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_slacking.svg";
import CrewAchievement from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_achievement.svg";
import CrewAnnoyed from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_annoyed.svg";
import CrewOverworked from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_overworked.svg";
import CrewAngry from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_angry.svg";

import PatternDataNode from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/graph/pattern_data_node.svg";
import LogChip from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/graph/log_chip.svg";
import PatternLinkFar from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/edges/pattern_link_far_320.svg";
import PatternLinkMid from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/edges/pattern_link_mid_320.svg";
import PatternLinkCurrent from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/edges/pattern_link_current_320.svg";
import PatternLinkNear from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/edges/pattern_link_near_320.svg";
import PatternConnectionPulse from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/overlays/pattern_connection_pulse.svg";
import SoulFocusGlow from "../../../public/assets/cosmic-pixel-v3-soulcore/mobile-graph/overlays/soul_focus_glow.svg";

// Legacy IslandArt id → v3 Pattern-Core component. `imagine` is intentionally
// absent (the imagine core was retired in worldview v-final) → PNG fallback.
export const V3_CORE_ART: Record<string, FC<SvgProps>> = {
  core: SoulCoreHero,
  relationship: BondCore,
  knowledge: WisdomCore,
  records: NarrativeCore,
  inspiration: MuseCore,
  work_growth: GrowthCore,
};

// WorkerId (internal id) → v3 companion idle pose. `secondb` has no v3 companion
// sprite (→ PNG fallback). The v3 pack ships per-state SVGs (not a 6-frame
// strip), so under the flag a worker shows a static idle pose rather than the
// PNG walk-cycle; its on-graph position still comes from CharacterPathLayer.
export const V3_WORKER_ART: Record<string, FC<SvgProps>> = {
  archi: ArchonIdle,
  gadi: ReliaIdle,
  lulu: LumenIdle,
  momo: ForemanMomoIdle,
  lumi: LuminaIdle,
};

// Decorative momo-crew (Narrative Core) mood sprites. Indexed by crew index in
// CrewLayer for ambient variety. Order is just the variant rotation.
export const V3_CREW_ART: FC<SvgProps>[] = [
  CrewWorking,
  CrewIdlePlaying,
  CrewSlacking,
  CrewAchievement,
  CrewAnnoyed,
  CrewOverworked,
  CrewAngry,
];

// Tier 3 (Pattern Data) + Tier 4 (Log) node art — single components (vs the
// per-id core map). Wired into NavGraph behind EXPO_PUBLIC_USE_V3_ART; the
// flag-off path keeps rendering the legacy TierIcon metaphor icons untouched.
export const V3_DATA_ART: FC<SvgProps> = PatternDataNode;
export const V3_LOG_ART: FC<SvgProps> = LogChip;

// Pattern Link edge tiles by depth state (far -> near + the active "current").
// Ready for the textured-edge pass; NavGraph currently styles its AnimatedLine
// by depth color (rotating a tile along an animated edge is a separate change),
// so these are exported but not yet mounted — they drop in when that lands.
export const V3_EDGE_ART: Record<"far" | "mid" | "current" | "near", FC<SvgProps>> = {
  far: PatternLinkFar,
  mid: PatternLinkMid,
  current: PatternLinkCurrent,
  near: PatternLinkNear,
};

// Graph overlays — connection pulse + soul focus glow. Exported for the overlay
// pass (not yet mounted in NavGraph).
export const V3_OVERLAY_ART: Record<"pulse" | "focusGlow", FC<SvgProps>> = {
  pulse: PatternConnectionPulse,
  focusGlow: SoulFocusGlow,
};

// ─── Final candidate art (set 45, transparent PNG) ──────────────────────────
// Production v3 art, delivered as누끼-processed transparent PNG under
// final-candidate-v45/. IslandArt + NavGraph render these via <Image>
// (resizeMode="contain" + pixelated) behind EXPO_PUBLIC_USE_V3_ART. These take
// precedence over the placeholder SVG maps above for cores / Pattern Data / Log;
// mascots + crew have no PNG in this set, so they keep their SVG bindings. Pattern
// Link PNGs are exported as ready structure (not yet mounted — edges still render
// as styled lines). require() paths MUST be string literals (Metro static analysis).

// IslandArt id -> final core PNG. core = Tier-1 Soul Core (256, it renders
// largest/at the center); the 5 Pattern Cores use the 128 set. `imagine` has no
// v3 core (retired) -> falls back to the legacy PNG in IslandArt.
export const V3_CORE_PNG: Record<string, number> = {
  core: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier1_soul_core/soul_core_256.png"),
  relationship: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/bond_core_128.png"),
  knowledge: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/wisdom_core_128.png"),
  records: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/narrative_core_128.png"),
  inspiration: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/muse_core_128.png"),
  work_growth: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/growth_core_128.png"),
};

// Tier-3 Pattern Data PNG, keyed by the internal domain id (NavGraph node
// parentId: work / relation / knowledge / records / taste). Per-domain tint.
export const V3_DATA_PNG: Record<string, number> = {
  relation: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/bond_pattern_data_96.png"),
  knowledge: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/wisdom_pattern_data_96.png"),
  records: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/narrative_pattern_data_96.png"),
  taste: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/muse_pattern_data_96.png"),
  work: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/growth_pattern_data_96.png"),
};
export const V3_DATA_PNG_DEFAULT = require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/narrative_pattern_data_96.png");

// Tier-4 Log PNG, keyed by domain (mapped to the nearest life-category log).
export const V3_LOG_PNG: Record<string, number> = {
  work: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/work_log_96x72.png"),
  knowledge: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/knowledge_log_96x72.png"),
  relation: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/relationship_log_96x72.png"),
  taste: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/hobby_log_96x72.png"),
};
export const V3_LOG_PNG_DEFAULT = require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/knowledge_log_96x72.png");

// Pattern Link PNG tiles by depth (320x64). Exported as ready structure; the
// graph still renders edges as styled lines, so these are not mounted yet.
export const V3_EDGE_PNG: Record<"current" | "near" | "mid" | "far", number> = {
  current: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/pattern_links/pattern_link_current_320x64.png"),
  near: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/pattern_links/pattern_link_near_320x64.png"),
  mid: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/pattern_links/pattern_link_mid_320x64.png"),
  far: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/pattern_links/pattern_link_far_320x64.png"),
};
