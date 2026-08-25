# 레퍼런스 파인튜닝 프로토콜 — 코덱스가 "얼마나 어긋났나"를 판정하는 법

> Simon 지시(2026-08-26): *"디자인은 앞서 제공한 번들이 레퍼런스야. 스타일 화면 구조
> 화면 연결 모두가 레퍼런스를 따라갔으면 좋겠어. 이후에 작업을 완료하면 코덱스를 통해서
> 점검하고 디자인을 파인튜닝 할 거야."*
>
> 그 점검이 **눈대중이 아니라 대조**가 되려면, 레퍼런스가 저장소 안에 기계가 읽는
> 형태로 있어야 한다. 이 문서는 그 형태와 사용법이다.

## 왜 문서가 아니라 데이터인가

이전 인수(`design/pixel_clay_v4/`) 때 우리는 어긋남 6건·함정 5건을 **문장으로** 적었다.
그 문장들은 다음 세션에서 절반이 오독됐다 — 대표적으로 `--u`. 스타일시트가 `:root` 를
세 번 정의하고 마지막이 이기는데, 사람도 정규식도 첫 번째 블록을 읽고 "4px, 브리프
위반"이라고 판정했다. 실제 런타임 값은 2px 이었다.

그래서 이 키트의 규율은 하나다: **화면이 실제로 쓰는 값만이 레퍼런스다.**
토큰은 CSS 텍스트가 아니라 `getComputedStyle` 에서 뜨고, 구조는 설명이 아니라 DOM
다이제스트로 뜨고, 화면은 서술이 아니라 390×820 PNG 로 뜬다.

## 무엇이 들어 있나

```
design/pixel_clay_260825/
  app-offline.html          ← 받은 그대로. 10MB 자가완결 번들(고치지 말 것)
  REPO-NOTES.md             ← 인수 판정·이식 금지 7종·모듈 지도
  FINE-TUNING-PROTOCOL.md   ← 이 문서
  captures/<id>.png         ← 93화면, 전부 390×820, 결정적 캡처
  data/screens.json         ← 화면 목록 + port(true|false|deferred) + 사유  ★유일한 목록
  data/tokens.json          ← 런타임 커스텀 프로퍼티 157개 (midnight/theme-dark)
  data/structure/<id>.json  ← 화면별 DOM 다이제스트(순서·태그·클래스·박스·텍스트)
  data/nav.json             ← 화면별 조작 가능 요소 라벨(연결 단서)
  data/capture-report.json  ← 캡처 결과·콘솔 에러(0건이어야 정상)
  tools/capture-bundle.mjs  ← 위 산출물을 한 패스로 다시 뜨는 도구
  tools/validate-ref.mjs    ← 키트 자체 무결성 (npm run check:design-ref, verify 안에서 돔)
```

**목록은 `data/screens.json` 한 곳이다.** 도구도 게이트도 여기서 읽는다. 화면 목록을
코드에 두 벌로 적지 말 것 — 두 벌이 되는 순간 한 쪽이 조용히 낡는다(이 저장소가 시기
목록·별 목록에서 이미 두 번 겪은 사고다).

## 산출물 다시 뜨는 법

```bash
npx http-server design/pixel_clay_260825 -p 8973 -s &
BASE_URL=http://localhost:8973 node design/pixel_clay_260825/tools/capture-bundle.mjs
# 일부만: SCREENS=home,chat,me-star node ...
```

`file://` 로 열면 안 된다 — localStorage origin 이 없어 게이트(`sb_onboarded` 등)를 못
심고, 온보딩이 뜬 채로 93장이 찍힌다. 결정성은 고정 시각·LCG 재시드·애니메이션 정지로
확보한다(같은 커밋에서 두 번 뜨면 같은 PNG 가 나와야 한다).

## 판정을 3층으로 가른다

파인튜닝이 "느낌"으로 흐르지 않으려면, **무엇이 자동 판정 가능하고 무엇이 사람 눈인지**를
먼저 갈라야 한다.

### Tier 1 — CI 가 강제한다 (게이트, 빨개지면 머지 불가)

| 항목 | 어떻게 | 지금 상태 |
|---|---|---|
| 키트 무결성 | `check:design-ref` — 매니페스트↔캡처↔구조 대조, 토큰 앵커(`--u:2px`·`--ds-*`) | **가동 중**(verify 안) |
| 픽셀 규율 | `check:pixel-rules` — radius 0·블러 0·타입격자. 이식 완료 화면을 MIGRATED 목록에 추가하는 방식 | 기존 가드 재사용 |
| 어휘·em dash | `check:forbidden-lexicon`·`check:emdash` | 기존 가드 |
| 카피 키 커버리지 | 코드의 별 목록 ↔ 로케일 키(예: `home-star-copy.test.ts`) | 1건 가동, 확장 대상 |

### Tier 2 — 수치로 보되 게이트는 아니다 (파인튜닝의 눈금)

- **구조 다이제스트 diff**: `data/structure/<id>.json`(레퍼런스) vs 앱 렌더 트리.
  픽셀 SSIM 의 대체물이다 — 이 저장소는 RN 컴포넌트 렌더 테스트가 업스트림 문제로
  막혀 있어(`reference_2ndb_render_tests_blocked`) 앱 쪽 자동 렌더 캡처가 없다.
  **그래서 "픽셀 동일"은 목표가 아니다.** 섹션의 순서·개수·상대 크기가 눈금이다.
- **토큰 사용률**: 앱 토큰(`m3.ts`·`tokens.ts`)이 `data/tokens.json` 의 값과 몇 %나
  같은가. 어긋난 항목 목록이 곧 작업 목록이 된다.

### Tier 3 — 사람이 본다 (자동화하지 말 것)

여백의 리듬, 픽셀 아트의 손맛, 애니메이션 타이밍의 체감, 카피의 온도. 코덱스에게는
"레퍼런스 캡처와 나란히 놓고 어긋난 곳을 지목하라"고 시키되, **판정을 코드로 박지 말 것.**

## 코덱스에게 주는 작업 지시 형태

```
레퍼런스: design/pixel_clay_260825/captures/<id>.png
구조:     design/pixel_clay_260825/data/structure/<id>.json
토큰:     design/pixel_clay_260825/data/tokens.json
대상:     <저장소 렌더 파일 경로>

이 화면을 레퍼런스에 맞춰라. 단:
- data/screens.json 의 port 가 false 인 화면은 건드리지 않는다(사유가 적혀 있다).
- REPO-NOTES.md 의 이식 금지 7종을 어기지 않는다 — 특히 카피는 자산이 아니라 재검수 대상.
- 모델·데이터는 저장소 실물이 정본이다(번들의 localStorage 모델을 옮기지 않는다).
- 끝나면 npm run verify 가 초록이어야 한다.
```

## 앱 쪽 캡처 — 이제 있다 (2026-08-28)

`tools/capture-app.mjs` 가 우리 앱을 **같은 눈금**(390×820)으로 찍고 레퍼런스와 대조한다.
결과는 `data/app-compare.json`(수치만 커밋, PNG 는 `.app-shots/` 로 gitignore).

```bash
node design/pixel_clay_260825/tools/capture-app.mjs --print-env > /tmp/webenv.sh
source /tmp/webenv.sh && npx expo export --platform web --output-dir <dist>
# <root>/2nd-B -> <dist> 정션을 만들고 그 부모를 SPA 폴백으로 서빙
npx http-server <root> -p 8979 -s --proxy "http://localhost:8979/2nd-B/index.html?"
BASE_URL=http://localhost:8979 node design/pixel_clay_260825/tools/capture-app.mjs
```

**이 도구가 밟은 함정 다섯**(주석에 다시 적혀 있다):

1. **baseUrl 이 `/2nd-B`** — dist 를 그냥 서빙하면 에셋이 404 나고 "Unexpected token '<'" 만 남는다.
2. **`/2nd-B/index.html` 이 아니라 `/2nd-B/`** — 라우터가 `.html` 경로를 not-found 로 그린다.
3. **시각을 고정하면 로그인이 깨진다** — 고정 시각이 토큰 발급보다 뒤면 세션이 만료로
   보여 **모든 화면이 로그인 월로 찍힌다**(캡처는 성공, 대조만 0%). 기본값은 '지금'.
4. **깊이 6 컷은 앱에 안 맞는다** — RN-web 은 View 를 겹겹이 싸서 글자가 8~12 depth 에
   있다. 앱은 24까지 본다(대조는 텍스트 집합이라 비대칭이 문제되지 않는다).
5. **온보딩은 매 이동마다 다시 뜬다** — 완료 표시가 계정 상태에 있어 한 번 건너뛰는
   것으로는 홈이 영영 안 찍힌다. 화면마다 확인해서 밀어낸다.

**text match 의 뜻**: 레퍼런스 화면의 텍스트 노드 중 앱에도 있는 비율. **픽셀 동일이
아니라 "같은 말을 하고 있는가"의 눈금**이다. 낮다고 곧 나쁜 것이 아니다 — 레퍼런스가
목업 데이터를 쓰는 화면(digest·insights)은 원래 안 맞고, 카피가 다른 화면(privacy·
support)은 우리 문서가 정본이다. **읽는 법: 같은 화면의 수치가 이식 전후로 오르는가.**

## 이 키트가 답하지 못하는 것 (한계를 먼저 적는다)

1. **픽셀 비교는 여전히 없다.** 앱 캡처가 생겨 구조·텍스트 대조는 가능해졌지만, SSIM
   같은 픽셀 지표는 이 저장소에서 의미가 약하다(RN-web 렌더와 번들 DOM 은 애초에 다른
   엔진이다). 여백·손맛은 Tier 3(사람 눈)으로 남는다.
   ⚠ 메모리 인덱스에 있던 "recapture CI 가 렌더를 검증한다"는 서술은 **이 저장소
   현황이 아니다** — `.github/workflows` 에 screenshot/playwright 히트 0건이다.
2. **번들은 목업이다.** 데이터가 가짜라 화면에 뜬 숫자·문장은 레퍼런스가 아니다.
   레이아웃과 연결이 레퍼런스고, 값은 저장소 실물에서 온다.
3. **93화면 중 80이 port:true 지만 순번이 있다.** stage 1 은 일곱 한 벌과 그 진입
   경로 8화면이다. 한꺼번에 옮기면 어디서 깨졌는지 못 찾는다.
