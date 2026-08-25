# 코덱스 인계 — 디자인 파인튜닝을 여기서부터 이어간다

> Simon 지시(2026-08-28): *"디자인 작업을 모두 다 완료한 뒤에는 코덱스가 이어갈 수 있게
> 프롬프트와 필요한 자료들을 공유해줘."*
>
> 이 문서가 그 인계다. **읽는 순서**: 이 문서 → `FINE-TUNING-PROTOCOL.md`(판정 3층) →
> `REPO-NOTES.md`(이식 금지 7종·모듈 지도).

## 0. 지금 어디까지 왔나 (2026-08-26 갱신)

레퍼런스는 **데이터로** 저장소에 있고, 앱은 **같은 눈금으로 측정**된다. 즉 "레퍼런스를
따라간다"가 이제 의견이 아니라 숫자다.

| 있는 것 | 어디 |
|---|---|
| 레퍼런스 화면 93장(390×820, 결정적, 팝업 없음) | `captures/<id>.png` |
| 레퍼런스 런타임 토큰 157개 | `data/tokens.json` |
| 레퍼런스 DOM 다이제스트 | `data/structure/<id>.json` |
| 화면 목록 + 이식 범위(port true/false/deferred) | `data/screens.json` ★유일한 목록 |
| 번들 id → 앱 라우트 매핑 41개 | `data/app-routes.json` |
| **앱 대조 수치 40화면** | `data/app-compare.json` |
| stage 1 이식 전후 수치 | `data/app-compare-stage1.json` |
| 레퍼런스 재캡처 도구 | `tools/capture-bundle.mjs` |
| **앱 캡처·대조 도구** | `tools/capture-app.mjs` |
| 키트 무결성 게이트 | `tools/validate-ref.mjs` = `npm run check:design-ref` (verify 안) |

### 지금 점수 (2026-08-26, 전 화면 대조)

**잰 화면 35장 · 100% 가 18장 · 평균 86% · 측정 불가 3장.**

낮은 순: `capture-full 50` · `peer-invites 64` · `permissions·privacy·support·
manual·digest-today 71` · `peer·account 75` · `records·star 83` · `import 86` ·
`me-star 88`.

⚠ **"측정 불가"는 새로 생긴 구획이다.** `auth`·`signup`·`peer-token` 은 라우트가
맞는데도 이 하네스로는 못 잰다(로그인된 세션이면 인증 화면이 홈으로 리다이렉트되고,
`peer/sample` 은 실제 토큰이 아니라 오류 상태를 그린다). 도구가 **숫자 대신 사유를
출력한다** — 0% 로 두면 없는 결함을 쫓게 되기 때문이다. `data/app-routes.json` 의
`unmeasurable` 을 읽을 것.

⚠ **`unmapped` 도 새로 생겼다** — `record`·`digest`·`privacy-policy` 는 레퍼런스
프레임과 앱 화면이 **서로 다른 것**이라 매핑을 걷어냈다. 사유가 파일에 적혀 있다.
되돌리기 전에 그것부터 읽을 것.

## 1. 재현 절차 (이거부터 돌려서 숫자가 나오는지 확인할 것)

```bash
# 레퍼런스를 다시 뜰 일은 거의 없다(번들이 바뀔 때만):
npx http-server design/pixel_clay_260825 -p 8973 -s &
BASE_URL=http://localhost:8973 node design/pixel_clay_260825/tools/capture-bundle.mjs

# 앱 대조 — 이쪽을 매 작업마다 돌린다:
node design/pixel_clay_260825/tools/capture-app.mjs --print-env > /tmp/webenv.sh
source /tmp/webenv.sh && npx expo export --platform web --output-dir /tmp/webdist
mkdir -p /tmp/webroot && ln -s /tmp/webdist /tmp/webroot/2nd-B    # Windows: mklink /J
npx http-server /tmp/webroot -p 8979 -s --proxy "http://localhost:8979/2nd-B/index.html?" &
BASE_URL=http://localhost:8979 node design/pixel_clay_260825/tools/capture-app.mjs
# 일부만: SCREENS=review,me-star node ...
```

**5분 안에 숫자가 안 나오면 도구 헤더의 "밟은 함정 다섯"을 먼저 읽을 것.** 전부 실제로
겪은 것이고, 특히 3번(시각 고정 → 로그인 붕괴)은 캡처가 6/6 성공으로 보이면서 대조만
0% 가 되는 모양이라 원인을 찾는 데 가장 오래 걸린다.

## 1-A. 일곱 절대 규칙 — 코드가 지금 어디인가 (2026-08-26 실측)

지금까지의 점수판은 **화면별 글자 대조**였다. 그건 "무엇이 빠졌나"는 알려주지만
"시각 체계가 얼마나 옮겨졌나"는 못 잰다. 규칙은 `docs/PIXEL-CLAY-MIGRATION.md`
§2-1 이 정본이고, 아래는 그 일곱 개에 대해 **딥스페이스 표면 코드**를 센 값이다.

| # | 규칙 | 남은 위반 | 상태 |
|---|---|---|---|
| 7 | 색 — 토큰만 | **0** (토큰 파일 밖 7건은 `records-graph-layout.ts` 의 도메인 색) | ✅ 사실상 끝 |
| 3 | 블러 금지 → 디더 스크림 | **1** (`DeepSpaceScreen.tsx`) | ✅ 거의 끝 |
| 6 | 입체 — 4방향 베벨 | **9, 한 파일** (`SecondbHead.tsx`) | ✅ 거의 끝 |
| 2 | 라운드 0 | **14** (`SecondbStatusHeader` 4 · kit 2 · …) | ✅ 거의 끝 |
| 5 | 모션 — `steps()` 만 | **46 / 11파일** (`SecondbHead` 12 · `DeepSpaceLoader` 11) | 중간 |
| 1 | 도형 — 정수 `rect` 만 | **135 / 21파일** (`DeepSpaceViews` 22 · `DeepSpaceDock` 18) | 큰 덩어리 |
| 4 | 불투명도 → 색 밴딩/디더 | **358 / 38파일** (`DeepSpaceViews` 61 · `lib/theme/tokens.ts` 50) | 큰 덩어리 |

### ⚠ 세는 방법을 틀리면 없는 일이 산더미로 보인다

1차 스캔은 규칙 2 를 **363건**으로 셌다. 거의 전부 거짓 양성이었다 — `m3Shape` 는
아홉 값이 **이미 전부 0**(`m3.ts:331`)이라 `m3.shape.large` 같은 호출은 이미 준수다.
같은 함정이 규칙 6 에도 있었다: `m3Elevation` 의 level0~5 가 전부 0 인데
`shadowOffset: {` 가 정규식에 걸려 29건으로 부풀었다.

**그래서 "0 이 아닌 값을 실제로 만드는 참조"만 세야 한다.** 위 표는 그렇게 센 값이다.

### 무엇이 남았는지의 정확한 모양

- **규칙 1 은 아이콘이다.** `DeepSpaceDock.tsx` 의 탭 아이콘 5개가 가장 크다 —
  이제 **16화면에 다 나오기 때문**이다(#1409·#1414·#1419). 레퍼런스는 `<path>`·
  `<circle>` 이 **0건**이고 정수 `rect` + `shape-rendering='crispEdges'` 로만 그린다
  (`app-offline.html` 실측: rect 25 · svg 3 · path 0 · circle 0).
- **규칙 4 는 토큰이 먼저다.** `lib/theme/tokens.ts` 의 50건이 정의 자리이고,
  거기를 고치면 호출부가 따라온다. 컴포넌트부터 손대면 같은 값을 38곳에서 고치게 된다.
- **규칙 3/4 의 디더를 레퍼런스에서 그대로 베낄 수 없다.** 레퍼런스는 CSS
  `repeating-conic-gradient(color-mix(...) 0% 25%, transparent 0% 50%) 50%/6px 6px`
  로 구현했는데 **React Native 에 `conic-gradient` 도 `color-mix` 도 없다.**
  결정 D4 가 이미 "작은 타일 이미지 반복"으로 정해 뒀다 — 그쪽으로 갈 것.
  (누름 반응은 레퍼런스가 `transform: translateY(var(--u))` = 1유닛 가라앉기다.)
- **폰트(D3)는 토큰 층에서 끝났다.** `m3Font` 는 전부 Galmuri 이고 4종 다 로드된다
  (`src/theme/typography.ts`). 다만 레퍼런스는 역할을 넷으로 가른다 —
  `--font-display: Galmuri14` · `--font-ui: Galmuri11` · `--font-micro: Galmuri9` ·
  mono `GalmuriMono11`. 앱은 **display/micro 역할이 타입 스케일에 안 붙어 있다.**

## 2. 다음에 할 일 (우선순위 순, 근거는 수치)

### ① 스택 화면의 하단 탭바 — ✅ **끝났다 (2026-08-30)**

원인이 예상과 달랐다. `variant="windowed"` 는 죄가 없었다 — `DeepSpaceScreen` 은 어느
variant 에서도 dock 을 렌더한다. 진짜 범인은 `DeepSpaceDesignScreens.tsx` 안의
로컬 `Shell` 이었다: dock 도 SafeAreaView 도 없는 순수 View 인데 **13개 화면**이 그걸
쓰고 있었다(옆 파일 `dds-wiki-records-screens.tsx` 의 같은 이름 컴포넌트는 진작
고쳐져 있었다 — P5 메가파일 분할 때 한쪽만 고친 것이다).

`Shell` 을 같은 파일의 `DockShell` 로 위임시켜 끝냈다. 결과:
review 31→**69** · manual 13→**71** · insights 14→**100** · formats 14→**100** ·
permissions/privacy/support 0→**71**.

⚠ 뒤로가기는 **바뀌지 않았다**: `DockShell` 의 `active="lens"` 는 TABS 밖이라
탭 하이라이트도, `DeepSpaceScreen` 의 BackHandler 특례도 걸리지 않는다(기본 pop 유지).

### ② 0% 인 화면 — ⚠ **먼저 구조를 의심하고, 카피 판정은 그 다음이다** (2026-08-30 정정)

이 자리에 원래 "0% 인 화면(privacy·support·permissions 등)은 우리 카피가 정본이라
작업 대상이 아니다"라고 적혀 있었다. **절반만 맞았다.** 실측 결과 그 화면들은
`Shell`(dock 없는 껍데기)을 쓰고 있어서 **하단 탭바 5칸을 통째로 잃고 있었다.**
껍데기 한 줄을 고치자 0% → 71% 로 올랐다.

그러니 순서는 이렇다:

1. **구조부터** — 그 화면이 dock/셸을 제대로 쓰는가. 캡처를 열어 탭바·상단바가 있는지
   눈으로 먼저 본다. 수치가 유난히 낮으면 카피가 아니라 껍데기를 의심할 것.
2. **그 다음 카피** — 구조를 맞춘 뒤에도 남는 격차만 카피 문제다. 그중
   법률 문서·동의 문구·빈 계정 화면(`auth · signup · privacy-policy · digest`)은
   **우리 것이 정본**이니 레퍼런스 문구로 바꾸지 말 것.
3. 남는 것은 레이아웃(섹션 순서·카드 구획)이고 그건 Tier 3(사람 눈)이다.

### ③ 실제로 낮은 것들 — **2026-08-26 갱신**

여기 있던 목록(`manual 13 · insights 14 · formats 14 · profile 14 · import-hub 33`)은
**낡았다. 인용하지 말 것.** 그 수치들은 (a) 측정 도구가 U+2060 워드 조이너 때문에
있는 문장을 없다고 세던 때의 값이고 (b) 하단 탭바가 16화면에서 빠져 있던 때의 값이다.
insights·formats·profile·import-hub 는 지금 **100%** 다.

지금 남은 것:

| 화면 | 지금 | 무엇이 남았나 |
|---|---|---|
| `capture-full` | 50% | 우리 문장과 레퍼런스 문장이 다르다. **문구를 레퍼런스로 바꾸지 말 것** — 비활성 사유는 이미 화면에 그린다(#1414) |
| `peer-invites` | 64% | 레퍼런스 문장 셋이 "보여지는 나 **렌즈**"라고 쓴다. 렌즈층은 결정 7 로 휴면 — **Simon 이 대체어를 정해야 착수** |
| `manual` | 71% | 같은 문 하나에 한국어 이름이 **다섯** 개다. **Simon 이 이름을 정해야 착수** |
| `permissions`·`privacy`·`support` | 71% | 독은 붙었다(#1409). 남은 것은 섹션 구성 |
| `digest-today` | 71% | 브리프 화면. QA 계정에 제안이 0건이라 빈 상태로 찍힌다 |
| `peer`(`/seen`)·`account` | 75% | 섹션 구성 |
| `records`·`star` | 83% | 섹션 구성 |
| `me-star` | 88% | 시드 이후 올랐다(#1413). 남은 것은 구성 |

`data/structure/<id>.json`(레퍼런스)과 캡처 산출물의 `structure/<id>.json`(앱)을
diff 하면 무엇이 없는지 바로 나온다.

### ④ 매핑이 없는 화면 39개

`data/app-routes.json` 은 41개만 잇는다. 나머지는 (a) 앱에 대응 화면이 없거나
(b) id 가 달라서 확신이 없어 비워뒀다. **억지로 이으면 대조 수치가 거짓이 된다** —
확신이 설 때만 추가하고, 추가한 근거를 그 파일 주석에 남길 것.

## 3. 작업 지시 템플릿 (그대로 복사해서 쓰면 된다)

```
레퍼런스: design/pixel_clay_260825/captures/<id>.png
구조:     design/pixel_clay_260825/data/structure/<id>.json
토큰:     design/pixel_clay_260825/data/tokens.json  (--u:2px, midnight)
현재 수치: design/pixel_clay_260825/data/app-compare.json 의 <id>
대상:     <저장소 렌더 파일 — 라우트 셸이 아니라 실제 렌더 체인을 따라갈 것>

이 화면을 레퍼런스에 맞춰라. 지킬 것:
- data/screens.json 의 port:false 화면은 건드리지 않는다(사유가 적혀 있다).
- REPO-NOTES.md 의 이식 금지 7종 — 특히 카피는 자산이 아니라 재검수 대상이고,
  번들 밝기 히트맵의 과거는 지어낸 값이라 옮기지 않는다.
- 모델·데이터는 저장소 실물이 정본(번들의 localStorage 모델을 옮기지 않는다).
- 카피는 반드시 locales 5로케일 키로. TSX 하드코딩은 em dash·파리티 검사를 우회한다.
- 끝나면: npm run verify 초록 + capture-app 재측정으로 그 화면 수치가 올랐는지 확인.
  올랐다는 근거 없이 "맞췄다"고 말하지 말 것.
```

## 4. 절대 하지 말 것

1. **레퍼런스 토큰을 CSS 텍스트에서 다시 뽑기.** `gen-tokens.mjs` 정규식은 `--u` 를
   4px 로 뽑는다(스타일시트가 `:root` 를 세 번 정의하고 마지막이 이긴다). 런타임
   추출본(`data/tokens.json`)만 정본이다.
2. **캐논(`design/proto_rev2/.../tokens.json`)을 midnight 으로 덮기.** 그건 앱 테마가
   아니라 **이주의 출발점 스냅샷**이고 런타임 소비자가 0건이다. 덮으면 기준선만 잃는다.
3. **화면 목록을 도구에 두 벌로 적기.** `data/screens.json` 한 곳이다.
4. **수치를 올리려고 카피를 레퍼런스 문구로 바꾸기.** 레퍼런스는 목업이다 — 법률·동의·
   빈 상태 문구는 우리 것이 정본이고, 그런 화면의 낮은 수치는 정상이다.
5. **번들 원본(`app-offline.html`) 수정.** 받은 그대로 둔다.

## 5. 아직 사람이 정해야 하는 것

- **홈 코너 버튼 구성** — PRD(알림·뮤지엄·커뮤니티·ops) vs 번들(알림·공지·뮤지엄·더보기).
  이번에 번들 쪽으로 진행했으나 확정은 Simon.
- **인터뷰 저장 동의 기본값** — 번들 ON vs privacy 규율 OFF. 손대지 않았다.
- ~~**스택 화면 탭바**~~ — **해소됐다(2026-08-30).** 16화면이 공용 셸로 돌아갔고
  `/onboarding` 은 **일부러** 독이 없다(첫 실행에서 탭으로 빠져나가면 안 된다).
  그것을 결함으로 보고 "고치지" 말 것.
- **매뉴얼 문 이름** — 다섯 중 하나로. 정해지기 전에는 `manual` 이 71% 에서 멈춘다.
- **'렌즈' 대체어** — `peer-invites` 가 64% 에서 멈춘다.
- **강조색** — 시안 `#46B6FF` ↔ 캐논 `#5b8def`. 앱 정체성 색이라 사람이 먼저 정한다.
- **정책 목차 화면** — 레퍼런스에는 "정책 및 약관" 목차가 있는데 앱에는 없다
  (약관·처리방침·환불이 각각 독립 문서). 만들지 여부는 제품 결정이다.
