# 코덱스 인계 — 디자인 파인튜닝을 여기서부터 이어간다

> Simon 지시(2026-08-28): *"디자인 작업을 모두 다 완료한 뒤에는 코덱스가 이어갈 수 있게
> 프롬프트와 필요한 자료들을 공유해줘."*
>
> 이 문서가 그 인계다. **읽는 순서**: 이 문서 → `FINE-TUNING-PROTOCOL.md`(판정 3층) →
> `REPO-NOTES.md`(이식 금지 7종·모듈 지도).

## 0. 지금 어디까지 왔나 (2026-08-28)

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

**stage 1(일곱 한 벌) 결과**: home 83→100 · chat 83→100 · interview 86→100 ·
trend 67→100 · me-star 56→75 · review 7→31.

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

### ③ 실제로 낮은 것들 (구조가 다른 화면)

`manual 13 · insights 14 · formats 14 · profile 14 · import-hub 33 · capture-full 47 ·
peer-invites 58 · me-star 75`

- **me-star 는 데이터 탓이 크다** — QA 계정에 인터뷰 커버리지가 없어 "판 만큼" 줄과
  층 표시가 안 뜬다. 시드를 넣고 재측정하거나, 그 화면은 Tier 3 로 볼 것.
- 나머지는 섹션 구성이 실제로 다르다. `data/structure/<id>.json` 의 텍스트 목록과
  앱 쪽 `.app-shots/structure/<id>.json` 을 diff 하면 무엇이 없는지 바로 나온다.

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
- **스택 화면 탭바**(위 ①) — 되살릴지 여부는 네비게이션 정책이라 사람 판단이 먼저다.
