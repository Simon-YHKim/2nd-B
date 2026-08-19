# PIXEL-CLAY v4 — 시각 방향 결정과 이주 계획

> **Status: 방향 확정, 이주 미착수.** Simon 결정 2026-08-19 (결정 콘솔 V1).
> 이 문서가 시각 방향의 **정본**이다. `docs/REV2-MIGRATION.md` 는 이 결정으로 **대체됐다**.
>
> **축**: 세 축 전부에 걸침 (cross-cutting). **소유**: Simon.

## 0. 결정

**V1 — 시각 방향: PIXEL-CLAY v4 로 전환한다.**

2026-08-18 대조 보고서가 두 방향(M3-deepspace 유지 vs PIXEL-CLAY v4)을 나란히 놓고
Simon 의 판단을 요청했다. 회신은 **"PIXEL-CLAY v4 로 전환"** 이다.

이 결정은 **다른 다섯 항목(V2~V6)을 전부 막고 있었다.** 이제 풀렸다.

> ⚠ 인수 자료(`design/pixel_clay_v4/PRD.md` §21, `DECISIONS.md` §1, `README.md` §6)에는
> **"시각 방향 — PIXEL-CLAY vs M3 — Simon 비준 대기"** 라고 적혀 있다. **그건 낡았다.**
> 받은 문서를 고치지 않고 그대로 뒀으므로, 충돌하면 이 문서가 이긴다.

### 무엇이 바뀌지 않나

**개념은 그대로다.** 별자리 · 북극성 · 북두칠성 7별 · 정직한 밝기 L1~L5 · propose→ratify ·
세컨비. 안전 불변식(C1~C12)도 그대로다. 바뀌는 것은 **시각 체계**뿐이다.

이것은 rev2 PRD 가 세운 **"레이아웃 자유, 의미 고정"** 원칙의 두 번째 적용이다.
첫 번째는 cosmic-pixel → M3 였고, 이번은 M3 → PIXEL-CLAY v4 다.

## 1. 세 이름을 갈라 부른다 (V5)

**결정: 세 이름으로 갈라 부르고 문서에 상태 배지를 단다.**

"픽셀" 이라는 단어를 단독으로 쓰지 말 것. 서로 다른 세 물건을 가리키는 데 같은 말이
쓰여서 세션마다 혼선이 재생산됐다.

| 이름 | 상태 | 무엇인가 | 어디 있나 |
|---|---|---|---|
| **cosmic-pixel** | 🔴 **폐기** | 2026-06 이전의 원래 스킨. Cosmic Pixel Graph Village · phytoncide 토큰 · 마을 그래프 | `EXPO_PUBLIC_UI=legacy` 롤백 스킨으로만 생존. 새 작업의 참조 금지 |
| **M3-deepspace** | 🟡 **현행 (이주 출발점)** | 지금 사용자에게 배포돼 있는 것. Material 3 + 딥스페이스. `src/lib/theme/m3` | `src/` 전역. 이주가 끝날 때까지 **살아 있는 계약**이다 |
| **PIXEL-CLAY v4** | 🟢 **채택 (이주 목적지)** | 2026-08-18 Claude Design 산출 픽셀아트 체계. Galmuri · radius 0 · 디더 · steps() | `design/pixel_clay_v4/` (웹 프로토타입 + 디자인 시스템 번들) |

**cosmic-pixel 과 PIXEL-CLAY v4 는 같은 물건이 아니다.** 둘 다 픽셀아트지만
전자는 폐기된 스킨이고 후자는 새로 설계된 체계다. "레거시 픽셀이니까 버린다" 는
논증은 PIXEL-CLAY v4 에 적용되지 않는다.

## 2. 무엇이 실제로 바뀌나 — 여섯 항목이 전부 정반대다

대조에서 나온 여섯 항목은 중간값이 없다. 절충이 아니라 교체다.

| 항목 | M3-deepspace (현행) | PIXEL-CLAY v4 (목적지) |
|---|---|---|
| 폰트 | Roboto / Roboto Mono / Pretendard | **Galmuri** 픽셀 폰트 4종 |
| 라운드 | 4 / 8 / 12 / 16 / 28 | **0** — 전 화면 강제 |
| 불투명도 | `rgba()` · 정적 opacity | **색 밴딩 또는 50% 디더** |
| 이징 | M3 곡선 (`cubic-bezier`) | **`steps()` 만** |
| 도형 | 자유 (`path` · `circle`) | **정수좌표 `rect` 만** |
| 깊이 | `elevation` / 그림자 / 블러 | **4방향 베벨 + z-index만.** 블러 금지 |

### 절대 규칙 7개 (인수 PRD §2-1)

1. **도형** — 정수좌표 `<rect>` 만. `<path>` `<circle>` `<polyline>` 금지
2. **라운드** — `border-radius: 0`, 전 화면 강제
3. **블러** — `blur()` `backdrop-filter` 금지 → **디더 스크림**
4. **불투명도** — 정적 opacity 금지 → **색 밴딩** 또는 **50% 디더**
5. **모션** — `steps()` 이징만. 곡선 이징 금지
6. **입체** — 4방향 베벨. 2변 'ㄱ'자 금지
7. **색** — 토큰 또는 딥스페이스 액센트 변수만

### 실제 배포 색 (번들 기본값이 아니다)

프로토타입은 45개 팔레트 중 **`midnight` + `theme-dark`** 로 고정돼 있다. 이식 대상은 이 값이다.

```
--bg #0a0e18   --panel #141b2e   --panel-2 #232e4a
--fg #eaeef5   --fg-muted #8b96b0
--accent #5b8def   --ok #3fa88a   --warn #e0a63c   --danger #db5b57
```

딥스페이스 브랜드 레이어 (hex 리터럴이 허용된 유일한 구역):

```
--ds-star #CCFAFF   --ds-core #46B6FF   --ds-polaris #C8B6FF
--ds-nebula #A78BFA   --ds-ember #FF8A5B   --ds-visor #0A1020
mood: positive #5FF0C0 · neutral #A78BFA · negative #FF7A90
```

## 3. 이식 결정 5개 — **2026-08-20 전부 확정됨**

> Simon 결정 콘솔에서 다섯 개 전부 골랐다. 전문은 `docs/DECISIONS-260820.md`.
>
> | | 결정 |
> |---|---|
> | **D1** `--u` | **2px** (추천은 4px 이었으나 Simon 이 2px 선택 — CSS 가 실제 폰에서 만드는 값) |
> | **D2** 팔레트 | **런타임 교체 안 가져옴.** midnight 고정 |
> | **D3** 폰트 | **Galmuri 3종 추가** (11은 이미 있음) |
> | **D4** 디더 | **작은 타일 이미지 반복** |
> | **D5** 범위 | **토큰 층부터.** 화면은 나중에 |
>
> ⚠ **D1 = 2px 의 결과:** 인수 스크린샷 12장은 `--u:4px`(데스크톱 창)에서 찍혔다.
> 2px 로 만든 화면은 그 스크린샷보다 **촘촘하고 작게** 보인다 — 시안과 어긋난 게 아니라
> 시안이 실제 폰의 두 배로 찍혀 있었던 것이다. 되돌리려면 상수 하나만 4 로 바꾸면 된다.

## 3-1. 원래의 결정 항목 (근거 보존)

인수 자료를 실측해서 나온, **코드를 쓰기 전에 답이 있어야 하는** 질문들이다.
근거는 전부 `design/pixel_clay_v4/REPO-NOTES.md` 에 있다.

### D1. `--u` 를 몇 px 로 고정하나 ← 가장 시급

번들의 `--u` 는 **상수가 아니다.** 뷰포트로 갈린다:

```
--u: 2px   (< 640px)     ← 실제 390px 폰이 여기
--u: 3px   (640-1279px)
--u: 4px   (>= 1280px)   ← 인수 스크린샷 12장이 여기
```

시스템의 모든 치수가 `calc(var(--u) * N)` 이므로, **스크린샷은 실제 폰에서 보게 될 크기가
아니다 — 두 배로 크게 찍혀 있다.**

**권고: 4px 고정.** 스크린샷과 일치하고, `--s1`…`--s8` 이 기존 `m3Spacing` 과 같은 값이라
간격 이주가 사실상 무비용이 된다.

### D2. 팔레트 스와핑을 가져오나

번들은 `data-palette` 로 45개 팔레트를 런타임 교체한다. 저장소는 정반대 구조다 —
**35개 파일이 `StyleSheet.create` 안에서 모듈 스코프로 `m3.*` 를 읽는다.** 그래서
`check:cycles` 가 무관용 게이트다(`CLAUDE.md` 참조).

런타임 스와핑을 가져오면 그 35개가 전부 동적 스타일로 바뀌어야 한다.

**권고: 가져오지 않는다.** 배포된 프로토타입도 `midnight` 하나로 고정돼 있고,
설정 화면에 다크모드 토글조차 없다. 팔레트는 빌드타임 상수로 둔다.

### D3. Galmuri 폰트를 어떻게 넣나 — **거의 이미 돼 있다**

> ⚠ 2026-08-19 정정. 처음에 "폰트 바이너리가 한 개도 없다" 고 적었는데 그건
> **인수 번들** 이야기고(번들은 5종 전부 jsDelivr CDN 로드가 맞다),
> **저장소는 이미 Galmuri11 을 싣고 있다.** cosmic-pixel 시절의 픽셀 폰트
> 파이프라인이 그대로 살아 있다.

실측:

| | |
|---|---|
| 폰트 파일 | `assets/fonts/Galmuri11-subset.woff2` (147KB, 웹) · `.ttf` (2.5MB, 네이티브) |
| 로드 | `src/theme/typography.ts:48-51` → `fontAssets.Galmuri11`, `_layout.tsx:69` `useFonts()` |
| 라이선스 고지 | `docs/ASSETS.md:39-41` — **SIL OFL 1.1 이미 기재됨** |
| 기본 본문 face | `src/lib/settings/readable-font.ts:19` — `DEFAULT_FONT_STYLE = "pixel"` |

즉 **앱의 기본 본문 서체가 이미 픽셀 폰트다.** 저시력 사용자를 위한
`readable`(Pretendard) 전환 옵션도 이미 있다.

**남은 것은 Galmuri11 이 아니라 나머지 3종이다** — PIXEL-CLAY 는 Galmuri14(디스플레이) ·
Galmuri9(10px 마이크로) · GalmuriMono11(숫자·라벨)을 함께 쓴다. 저장소에는 Galmuri11 만 있다.

> **권고**: 3종을 같은 방식으로 서브셋해 추가한다(`galmuri` npm 패키지가 원본).
> 라이선스 고지는 `docs/ASSETS.md` 한 줄 확장이면 된다. **새로 만드는 것이 아니라
> 있는 파이프라인을 넓히는 일**이라 비용이 처음 추정보다 훨씬 작다.
>
> ⚠ 다만 `.ttf` 가 2.5MB 다. 3종을 더하면 네이티브 번들이 눈에 띄게 커진다 —
> 서브셋 범위를 먼저 정하고 크기를 측정할 것.

### D4. 디더를 무엇으로 그리나

블러 금지의 대체물인 디더 스크림은 `repeating-conic-gradient` + `color-mix()` 인데
**RN 에 둘 다 없다.** 후보: (a) 작은 타일 PNG 반복 (b) `react-native-svg` 패턴
(c) 사전 렌더 이미지. 성능과 선명도가 갈리므로 하나를 골라 프리미티브로 고정한다.

### D5. 어디까지 한 번에 바꾸나

**권고: 토큰 층부터. 화면은 나중에.** `src/lib/theme/` 에 PIXEL-CLAY 값을 넣고
`m3.*` 의 **이름은 유지**하면(번들의 `px-bridge.css` 가 웹에서 정확히 이 일을 한다 —
M3 어휘 30개를 PIXEL-CLAY 시맨틱으로 별칭)、35개 모듈 스코프 파일을 건드리지 않고
전 화면이 한 번에 픽셀 톤으로 바뀐다. 라운드 0 · 색 · 간격 · 타입은 그 한 층에서 끝난다.

그 다음에야 화면별로 도형(`rect` 만) · 디더 · `steps()` 를 손본다.

## 4. 이주 단계

| 단계 | 내용 | 선행 조건 |
|---|---|---|
| **P0** | 방향·이름 기록 (이 문서 · `CLAUDE.md` · `docs/CONCEPT.md` · `DESIGN.md`) | — |
| **P1** | D1~D5 결정 | Simon |
| **P2** | 토큰 층 교체 (`src/lib/theme/`, M3 이름 유지) | D1 · D2 · D5 |
| **P3** | 폰트 벤더링 + 라이선스 고지 | D3 |
| **P4** | 프리미티브 (베벨 · 디더 · press) | D4 |
| **P5** | 화면별 도형·모션 정리 | P2~P4 |
| **P6** | 캐논 JSON 을 PIXEL-CLAY 토큰으로 갱신 + `canon-tokens.test.ts` 갱신 | P2 |

⚠ **2026-08-20 정정 — 여기 적었던 캐논 결합은 사실이 아니었다.**
`canon-tokens.test.ts` 는 `canonTokens`(= rev2 프로토타입의 `m3-theme.css` 미러)를
**자기 자신하고만** 대조한다. 앱의 `m3.*` 와 캐논 토큰을 같다고 주장하는 코드는 없다.
그래서 앱 토큰을 바꿔도 캐논 JSON 은 안 건드려도 된다 — 실제로 안 건드리고 통과했다.

진짜 결합부는 **`src/lib/theme/__tests__/m3.test.ts`** 다. 그 파일이 이주 목표를
박아두므로 토큰을 바꾸면 그 가드를 새 목표로 다시 박아야 한다.

## 5. 이 결정이 무효화하는 것

- `docs/REV2-MIGRATION.md` — **대체됨.** 목적지가 M3 였다. 역사 기록으로 남긴다.
- `CLAUDE.md` 의 "ACTIVE MIGRATION (2026-07-01) — rev2 PRD v2.0 → Material 3" 절 —
  갱신됨. M3 는 이제 목적지가 아니라 **출발점**이다.
- "Galmuri/Press Start → Roboto/Pretendard" 델타 — **방향이 뒤집혔다.**

## 6. 이 결정이 바꾸지 않는 것

- `EXPO_PUBLIC_UI=legacy` = cosmic-pixel 롤백 스킨. 그대로 둔다.
- 개념 3층(별자리 · 북극성 · 북두칠성) · propose→ratify · L1~L5 · 세컨비.
- C1~C12 하드 제약 전부.
- 정보 밀도 규칙(한 화면 한 메시지) · 터치 44px · reduced-motion 존중.
  이 셋은 **양쪽 문서가 이미 합의**하고 있다.

## 7. 참고

- `design/pixel_clay_v4/` — 인수 자료 전체 (프로토타입 · 디자인 시스템 · 화면 12장)
- `design/pixel_clay_v4/REPO-NOTES.md` — **먼저 읽을 것.** 받은 문서와 저장소가
  어긋나는 곳 6건 + 이식 함정 5건을 실측으로 정리했다
- `docs/DECISIONS-260819.md` — V1~V6 결정 전문
