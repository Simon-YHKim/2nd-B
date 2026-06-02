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
