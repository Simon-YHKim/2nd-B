# SVG 재구성용 캐릭터 스펙

## 공통 규칙

- 기준 캔버스: 64×64
- 스타일: Game Boy inspired 2D pixel art
- 렌더링: `shape-rendering="crispEdges"`
- 눈: 4×4 rect 두 개
- 캐릭터 기본 구조:
  - antenna or role-specific head accessory
  - rounded square head
  - dark face panel
  - compact body core
  - simple arms/legs
- 색상 수: 캐릭터당 4~6개
- 금지:
  - 큰 애니메이션 눈
  - 농장/동물/작물 의상
  - 과한 표정
  - 말풍선 포함
  - 복잡한 그라데이션

## 캐릭터 역할

### 세컨비
- 역할: AI 안내자
- 대표색: Soul Violet `#A78BFA`
- 보조색: Electric Mint `#72F2C7`
- UI 위치: FAB, chat, main graph center

### 모모
- 역할: 기록 관리자
- 대표색: Pixel Lamp `#FFD166`
- 소품: 라벨 카드, 보관함

### 루루
- 역할: 수집 드론
- 대표색: Electric Mint `#72F2C7`
- 소품: 집게, 안테나

### 아치
- 역할: 구조 설계자
- 대표색: Soft Signal Blue `#4CC9F0`
- 소품: 선 긋는 도구, 구조 프레임

### 벨라
- 역할: 공상 확장자
- 대표색: Dream Pink `#FF9FD6`
- 소품: 작은 날개/별빛

### 가디
- 역할: 안전 관리자
- 대표색: Guard Rose `#FF7A90`
- 소품: 경계등, 방패형 프레임
