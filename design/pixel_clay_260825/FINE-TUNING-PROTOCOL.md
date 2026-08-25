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

## 이 키트가 답하지 못하는 것 (한계를 먼저 적는다)

1. **앱 쪽 자동 캡처가 없다.** 레퍼런스는 93장이 있는데 앱은 0장이다. 그래서 지금
   가능한 것은 "레퍼런스가 무엇인지"의 고정이지 "얼마나 닮았는지"의 자동 측정이 아니다.
   앱 캡처 파이프라인(웹 export → 헤드리스 순회)은 다음 단계 작업이다.
   ⚠ 메모리 인덱스에 있던 "recapture CI 가 렌더를 검증한다"는 서술은 **이 저장소
   현황이 아니다** — `.github/workflows` 에 screenshot/playwright 히트 0건이다.
2. **번들은 목업이다.** 데이터가 가짜라 화면에 뜬 숫자·문장은 레퍼런스가 아니다.
   레이아웃과 연결이 레퍼런스고, 값은 저장소 실물에서 온다.
3. **93화면 중 80이 port:true 지만 순번이 있다.** stage 1 은 일곱 한 벌과 그 진입
   경로 8화면이다. 한꺼번에 옮기면 어디서 깨졌는지 못 찾는다.
