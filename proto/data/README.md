# data/ — 2nd-Brain 프로토타입 데이터 계층 (정본)

이 폴더가 **앱을 실질적으로 구동하는 구조와 콘텐츠의 단일 소스**다.
코드(`sb-*.jsx`)는 렌더링·상호작용 로직만 갖고, "무엇을 그릴지"는 전부 여기 JSON에서 온다.

## 로딩 방식

`sb-boot.js`(plain script)가 **모든 `text/babel` 스크립트보다 먼저** `data/index.json`
매니페스트를 동기 XHR로 읽고, 나열된 파일 전부를 `window.SB_DATA.<key>`에 싣는다.
따라서 어떤 sb-*.jsx도 모듈 최상위에서 안전하게 `window.SB_DATA`를 읽을 수 있다
(기존 "sb-data 먼저 실행" 계약과 동일한 실행 모델 — 로드 순서 리스크 없음).

새 데이터 파일을 추가하려면: 파일을 만들고 `index.json`의 `files`에 키→경로 한 줄 추가.

## 파일 맵

| 키 | 파일 | 내용 |
|---|---|---|
| `screens` | `app/screens.json` | **화면 레지스트리** (57화면): id · component(window 전역 이름) · layout(immersive/museumLike/windowed) · root · companion · title. 라우터/상단바/레이아웃/컴패니언 노출이 전부 여기서 결정됨 |
| `nav` | `app/nav.json` | 하단 5탭 |
| `sky` | `app/sky.json` | 공유 별하늘: 시드·별 개수·색, 별자리 라인 4개, cosmic/outer 그라디언트 |
| `theme` | `app/theme.json` | mood → CSS var 매핑 |
| `constellation` | `core/constellation.json` | 북두칠성 7별 + 북극성 (좌표·레벨·카피·route), dipper 라인 |
| `chatModes` | `core/chat-modes.json` | 3개 인격 렌즈 (세컨비/메타비/트위비, 에셋·색) |
| `companion` | `core/companion.json` | 화면별 컴패니언 카피 + 순환 관찰 문구 7개 |
| `captureModes` | `core/capture-modes.json` | 담기 5형식 |
| `mock` | `core/mock.json` | RECORDS · BIGFIVE · ERAS 목데이터 |
| `icons` | `core/icons.json` | 인라인 SVG 아이콘 131개 + 브랜드 마크 (중복 키 dedupe: 후자 승리) |
| (화면팩) | `screens/*.json` | 화면별 콘텐츠 팩 — museum(전시 이벤트+해설), wiki(그래프 노드), relations(인물·엣지), star-lenses(도메인별 렌즈 데이터), audit, flows(온보딩·코치마크), ops, validate, digest, gaps, health(+input), hobby, persona, more, surfaces, know, core(챗 응답·담기 분류), careerinput, me, domain-meta |

## 불변 규칙

1. **값은 픽셀 계약이다.** 한국어 카피는 조사 하나도 원문 유지(`별가루이` 등 원문 표기 포함),
   좌표·색·크기 변경 금지. 값 변경은 곧 디자인 변경이며 스펙 캡처와의 비교가 깨진다.
2. **파생값은 코드에.** id→색 매핑(Object.fromEntries), 정렬 사본, 시드 PRNG 생성물,
   `Date.now()` 의존값은 JSON에 넣지 않는다 — 코드가 JSON 원본에서 파생한다.
3. **함수는 코드에.** `window.SB.C`(테마 토큰 함수)는 sb-data.jsx가 재부착한다.
   JSON 필드 값이 `C('role')`이던 자리는 등가 문자열 `var(--md-sys-color-role)`로 저장 가능.
4. **검증**: `node tools/validate-data.mjs` (레지스트리 무결성·컴포넌트 export·에셋 존재),
   `node tools/capture-proto.mjs` + `compare-shots.mjs` (37 스펙 화면 픽셀 회귀).

## 프로덕션 이식 노트 (Expo/2nd-B)

이 JSON들은 브라우저 프로토타입 전용 포맷이 아니다 — Expo 앱에서 `import screens from
'.../screens.json'`으로 그대로 소비 가능하도록 순수 데이터만 담는다. 화면 레지스트리의
`component`는 프로토타입의 window 전역 이름이므로, 이식 시 각 플랫폼의 컴포넌트 맵으로
대체하면 된다 (id·layout·title·companion 메타는 공용).
