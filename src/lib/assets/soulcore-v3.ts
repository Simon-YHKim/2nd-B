// Soul Core v3 pixel-art bindings. The SVGs in assets/legacy-art/cosmic-pixel-v3-
// soulcore/ are imported as React components via react-native-svg-transformer
// (see metro.config.js). Reference-only: the art is owned by the asset
// workstream; this module just maps it to typed components for the render layer.
//
// Every import here is bundled whether or not a screen draws it, so only the
// maps that have a consumer stay (2026-10-04, D-14 / L4-09): V3_DATA_ART /
// V3_LOG_ART (premium feedback empty/error states).
// V3_CORE_ART, V3_EDGE_ART, V3_OVERLAY_ART and every V3_*_PNG map had no
// consumer; they, their SVG/PNG files, the mascot sprite sheets and the per-state
// companion poses were moved to E:/Legacy/2ndB (MANIFEST.jsonl, batch
// qa261004-art). assets/legacy-art/cosmic-pixel-v3-soulcore/docs/asset_mapping.md
// still lists the moved files.
//
// 2026-10-05 (Simon 결정 Q-261004-15 A): V3_WORKER_ART(옛 캐릭터 다섯의 정지 자세
// SVG, WorkerSprite 의 EXPO_PUBLIC_USE_V3_ART 분기)와 V3_CREW_ART(모모 크루 7종,
// 소비자이던 NavGraph CrewLayer 는 2026-10-04 에 나갔다)를 뺐다. 이 모듈을
// feedback.tsx 가 import 하므로 그 SVG 열둘이 배송 번들에 실려 있었다. 파일은
// E:/Legacy/2ndB 에 있다(MANIFEST batch qa261004-chars).

import type { FC } from "react";
import type { SvgProps } from "react-native-svg";

import PatternDataNode from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/mobile-graph/graph/pattern_data_node.svg";
import LogChip from "../../../assets/legacy-art/cosmic-pixel-v3-soulcore/mobile-graph/graph/log_chip.svg";

// Tier 3 (Pattern Data) + Tier 4 (Log) node art, single components. The live
// consumer is the premium feedback state glyph (src/components/premium/feedback.tsx).
export const V3_DATA_ART: FC<SvgProps> = PatternDataNode;
export const V3_LOG_ART: FC<SvgProps> = LogChip;
