# 2ndB Cosmic Pixel Assets v1

## 목적

이 패키지는 2ndB의 개정 세계관인 **Cosmic Pixel Graph Village / 밤빛 조각마을**을 구현하기 위한 1차 SVG 친화형 자산 묶음입니다.

기존 Obsidian-style NavGraph 구조를 유지하되, 다음 시각 언어를 적용합니다.

- 깊은 밤색 배경
- 로봇 신경망 같은 연결선
- Game Boy inspired 2D pixel robot characters
- 유아틱하지 않은 조용한 픽셀 감성
- 모바일 세로 화면에서 사용 가능한 단순 SVG 구조

## 포함 자산

### characters/
- `secondb.svg` — 세컨비, AI 안내자
- `momo.svg` — 모모, 기록 관리자
- `lulu.svg` — 루루, 수집 드론
- `archi.svg` — 아치, 구조 설계자
- `vela.svg` — 벨라, 공상 확장자
- `gadi.svg` — 가디, 안전 관리자
- `character_sprite_strip.svg` — 6캐릭터 한 줄 스프라이트 스트립

### icons/
홈, 검색, 저장, 연결, 공상, 기록, 성장, 경고, 새로움, 지식, 대화, 설정, 나의 중심, 영역 노드, 생각 조각 아이콘.

### nodes/
- `core_node.svg`
- `domain_node.svg`
- `persona_node.svg`
- `data_shard.svg`

### css/
- `2ndb-cosmic-pixel-tokens.css`

## 구현 메모

- 캐릭터는 항상 많이 보여주지 말고, 이벤트 순간에만 등장시키세요.
- 메인 모바일 화면 기본 상태에서는 세컨비만 보여주고, 저장/연결/공상/안전 이벤트에 따라 루루, 아치, 벨라, 가디를 잠깐 보여주는 것을 권장합니다.
- 아이콘은 inline SVG 또는 CSS mask 방식으로 사용 가능합니다.
- SVG 내부의 색상은 토큰 팔레트를 기준으로 만들어졌습니다.
- 픽셀감을 유지하려면 `shape-rendering="crispEdges"`를 유지하세요.

## 유저-facing 용어

- Core Brain → 나의 중심
- Persona / Mask → 나의 모습
- Insight → 발견한 조각
- Wiki → 지식 창고
- Journal → 오늘의 조각
- Capture → 조각 담기
- Imagine → 공상 작업실
- 2ndB / Jarvis → 세컨비
