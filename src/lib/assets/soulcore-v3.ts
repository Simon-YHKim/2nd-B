// Soul Core v3 pixel-art bindings. The SVGs in assets/legacy-art/cosmic-pixel-v3-
// soulcore/ are imported as React components via react-native-svg-transformer
// (see metro.config.js). Reference-only: the art is owned by the asset
// workstream; this module just maps it to typed components for the render layer.
//
// Every import here is bundled whether or not a screen draws it, so only the
// maps that have a consumer stay (2026-10-04, D-14 / L4-09): V3_WORKER_ART
// (WorkerSprite, EXPO_PUBLIC_USE_V3_ART), V3_CREW_ART (NavGraph CrewLayer) and
// V3_DATA_ART / V3_LOG_ART (premium feedback empty/error states).
// V3_CORE_ART, V3_EDGE_ART, V3_OVERLAY_ART and every V3_*_PNG map had no
// consumer; they, their SVG/PNG files, the mascot sprite sheets and the per-state
// companion poses were moved to E:/Legacy/2ndB (MANIFEST.jsonl, batch
// qa261004-art). assets/legacy-art/cosmic-pixel-v3-soulcore/docs/asset_mapping.md
// still lists the moved files.
//
// Line 21-25 (the five idle poses) are cited by docs/legal; keep them in place.

import type { FC } from "react";
import type { SvgProps } from "react-native-svg";

import ArchonIdle from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/companions/sprites/archon/archon_idle.svg";
import ReliaIdle from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/companions/sprites/relia/relia_idle.svg";
import LumenIdle from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/companions/sprites/lumen/lumen_idle.svg";
import ForemanMomoIdle from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/companions/sprites/foreman_momo/foreman_momo_idle.svg";
import LuminaIdle from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/companions/sprites/iris/iris_idle.svg";

import CrewWorking from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_working.svg";
import CrewIdlePlaying from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_idle_playing.svg";
import CrewSlacking from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_slacking.svg";
import CrewAchievement from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_achievement.svg";
import CrewAnnoyed from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_annoyed.svg";
import CrewOverworked from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_overworked.svg";
import CrewAngry from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_angry.svg";

import PatternDataNode from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/mobile-graph/graph/pattern_data_node.svg";
import LogChip from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/mobile-graph/graph/log_chip.svg";


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

// Tier 3 (Pattern Data) + Tier 4 (Log) node art, single components. The live
// consumer is the premium feedback state glyph (src/components/premium/feedback.tsx).
export const V3_DATA_ART: FC<SvgProps> = PatternDataNode;
export const V3_LOG_ART: FC<SvgProps> = LogChip;
