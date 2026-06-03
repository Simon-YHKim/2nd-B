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
import IrisIdle from "../../../public/assets/cosmic-pixel-v3-soulcore/companions/sprites/iris/iris_idle.svg";

import CrewWorking from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_working.svg";
import CrewIdlePlaying from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_idle_playing.svg";
import CrewSlacking from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_slacking.svg";
import CrewAchievement from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_achievement.svg";
import CrewAnnoyed from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_annoyed.svg";
import CrewOverworked from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_overworked.svg";
import CrewAngry from "../../../public/assets/cosmic-pixel-v3-soulcore/momo-crew/sprites/momo_crew_angry.svg";

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
  lumi: IrisIdle,
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
