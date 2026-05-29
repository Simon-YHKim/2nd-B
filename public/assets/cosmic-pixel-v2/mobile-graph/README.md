# 2ndB Mobile Graph UI Pack v2

**Purpose:** 모바일 세로 화면에서 `Cosmic Pixel Graph Village / 밤빛 조각마을` 컨셉을 구현하기 위한 UI 자산 패키지입니다.

이 패키지는 캐릭터 패키지 다음 단계로, **메인 그래프 화면의 노드·엣지·HUD·바텀시트·모바일 목업**을 제공합니다.

## Recommended path

```txt
public/assets/cosmic-pixel-v2/mobile-graph/
```

## Key principle

- 기존 Obsidian graph 구조는 유지합니다.
- 노드는 장소, 연결선은 길 + 신경망 신호선, 데이터 점은 생각 조각으로 보이게 합니다.
- 모바일 기본 화면에는 Tier 1~2 위주로 보여주고, 확대/선택 시 Tier 3~4를 보여줍니다.
- 캐릭터는 별도 패키지를 사용하고, 이 패키지는 그래프 UI 구조를 담당합니다.

## Included

- `graph/`: Core/domain/persona/data shard SVG
- `edges/`: default/active/recent edge samples
- `hud/`: top ribbon, bottom sheet, FAB frame, controls, minimap
- `mockups/`: 390×844 mobile screen SVG references
- `overlays/`: focus glow, connection pulse, star-noise tile
- `components/`: React skeleton component
- `css/`: mobile graph CSS tokens and helper classes
- `layout/`: sample world coordinates and zoom rules
- `docs/`: implementation handoff docs

## First integration target

1. `css/mobile-graph-v2.css` 토큰/클래스 병합
2. `graph/core_node_v2.svg`, `domain_node_v2.svg`, `persona_node_v2.svg`, `data_shard_v2.svg`를 graph node placeholder로 사용
3. `layout/mobile_graph_layout_example.json`을 참고해 world coordinate 구조 적용
4. node tap → bottom sheet → connected edge highlight 구현
5. `mockups/mobile_main_graph_390x844.svg`를 디자인 기준으로 비교
