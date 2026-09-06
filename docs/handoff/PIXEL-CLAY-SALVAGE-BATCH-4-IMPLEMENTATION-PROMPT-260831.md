# PIXEL-CLAY v4 salvage batch 4 implementation prompt

작성일: 2026-08-31
대상 기준: `codex/pixel-gate-primitives-260831` `60ae8f90`
대상 화면: `/capture-full`

이 문서는 독립 route가 없는 `lifeinput`, `hobbyinput`, `healthinput`의 쓸 만한 화면
구조를 실제 `/capture-full` 담기 흐름 안에서 살리는 코딩 발주서다. 새 route나 가짜
데이터 모델을 만드는 문서가 아니다. 공통 완료 조건은
`docs/handoff/PIXEL-CLAY-APP-IMPLEMENTATION-PROMPT-260831.md`를 따른다.

- 한 화면, 한 branch, 한 Draft PR
- 한 세션에서 추적 파일 최대 5개
- 실제 저장 파이프와 실제 내비게이션 유지
- legacy/cosmic-pixel rollback renderer 불변
- `main` 직접 작업·push 금지
- Android HUMAN 판정 전 PASS 금지

## 코딩 담당자에게 그대로 전달할 프롬프트

```text
`codex/pixel-gate-primitives-260831` exact head `60ae8f90`에서 저장소 내부 worktree와
`codex/pixel-clay-capture-full-260831` branch를 만들고 `/capture-full` 한 화면만
구현하라. Draft PR 하나, 추적 파일 최대 5개를 지키고 main에는 직접 작업하거나
push하지 않는다.

착수 전에 다음을 읽는다.

- `CLAUDE.md`
- `docs/PRD.md`, `docs/CONCEPT.md`
- `docs/PIXEL-CLAY-MIGRATION.md`
- `ANDROID_QA_GUIDELINES.md`
- `design/pixel_clay_v4/REPO-NOTES.md`
- `design/pixel_clay_260825/REPO-NOTES.md`
- `design/pixel_clay_260825/data/salvage-plan.json`의 `lifeinput`, `hobbyinput`,
  `healthinput`, `/capture-full`
- `design/pixel_clay_260825/captures/capture-full.png`
- `design/pixel_clay_260825/captures/lifeinput.png`
- `design/pixel_clay_260825/captures/hobbyinput.png`
- `design/pixel_clay_260825/captures/healthinput.png`
- `src/app/capture-full.tsx`, `src/app/capture.tsx`
- `src/lib/persona/domain-stars.ts`, `src/lib/records/detect-domain.ts`
- `src/lib/persona/load-domain-levels.ts`, `src/lib/wiki/capture.ts`

### 먼저 고정할 제품 경계

1. `capture-full`의 실제 저장 정본은 `CaptureLegacy`가 이미 보유한 journal/note,
   clip/link/OCR/file, voice/todo/4W1H 파이프다. 이를 다시 구현하거나 두 번째 form을
   만들지 않는다.
2. `lifeinput`의 2열 선택 구조만 생활 영역 선택 disclosure로 살린다. 사용자에게
   보이는 생활 영역은 커리어·재정·관계·건강·성장·휴식 여섯 개다. 이것들을 새
   일곱 별이라고 부르지 않는다. `collect`는 일반 담기 fallback이지 일곱 번째 생활
   영역 카드가 아니다.
3. `hobbyinput`의 하고 싶어요/하는 중/했어요 보드는 현재 저장 모델에 없다. 고정 목록,
   상태 수, 완료 이력을 만들지 말고 `휴식 메모` 진입의 카드 계층만 재사용한다.
4. `healthinput`의 컨디션 점수·에너지 칸·복수 선택·건강 데이터 수치는 실제 이 화면의
   저장 계약이 아니다. 센서 값, 권한 성공, 연결됨, 상태 점수, 고정 건강 결과를 만들지
   않는다. `건강 생활 메모`는 사용자가 직접 쓰는 메모임을 분명히 하고 실제 기기
   연동은 `/integrations`로만 안내한다.
5. 임상·의료·웰니스 framing을 새로 만들지 않는다. 증상 평가, 진단, 권고, 통증·스트레스
   fixture를 레퍼런스에서 복사하지 않는다.
6. `capture-full` 레퍼런스의 카피 일치율이 낮다는 이유로 현재 실제 비활성 사유·저장
   위치·위험 안내를 레퍼런스 문장으로 덮지 않는다. 점수를 위해 fixture나 거짓 action을
   넣지 않는다.

### 화면 구조

- `/capture-full`은 계속 `DeepSpaceScreen` 안에서 하나의 `CaptureLegacy` composer를
  렌더한다. exact route 앞에 별도 허브 화면이나 새 route를 추가하지 않는다.
- `CaptureLegacy`에 선택적 prop(예: `enableLifeAreaIntents`)을 두고 `/capture-full`만
  이를 켠다. legacy `Capture` 경로와 기존 deep `/capture`의 단순 body는 변하지 않아야
  한다.
- full composer 상단의 실제 형식/저장 계층 가까이에 `생활 영역으로 시작` disclosure
  하나를 둔다. 기본은 접힘이며 한 번에 이 disclosure 하나만 열린다.
- 펼치면 여섯 생활 영역을 2열 Pixel card로 보여준다. `PixelSurface`,
  `PixelPressable`, `PixelGlyph`만 사용하고 390px에서 44dp 이상, 세로 재흐름,
  radius 0, 정수 rect, 4방향 bevel을 지킨다.
- 건강과 휴식 카드는 각각 `healthinput`, `hobbyinput`의 색·카드 계층만 참고한다.
  레퍼런스의 값·목록·상태 수는 가져오지 않는다.
- 영역을 선택하면 disclosure를 닫고 실제 `memo` composer로 이동한다. composer에는
  현재 선택 영역을 읽을 수 있는 작은 Pixel context surface와 `영역 선택 지우기`를
  둔다. 내부 tag 문자열은 보이지 않는다.
- Android hardware Back은 영역 disclosure가 열려 있으면 먼저 닫고, 그 다음 기존
  화면 이탈 계약을 따른다. 입력 중 draft와 keyboard 동작을 깨뜨리지 않는다.

### 내부 영역 tag와 기존 deep link 호환

- 생활 영역 선택은 사용자가 누른 명시적 맥락이지만, user hashtag와는 다른 내부
  `domain:<slug>` 값이다. `domain:health` 같은 문자열을 tag chip, 본문, analytics,
  log, accessibility label에 노출하지 않는다.
- 기존 `/star/[domain]` 진입은 `/capture-full?tag=domain:<slug>`를 사용한다. 이 값이
  유효한 여섯 생활 영역이면 기존처럼 `tagsEditable`에 넣지 말고 hidden selected-area
  state로 변환한다. mode가 따로 없으면 실제 `memo` composer를 선택한다. 일반 tag
  query는 기존 동작을 유지한다.
- 유효성은 `isDomainId`/`isDomainTag`/`domainTagFor` 정본으로 검사한다. `collect`와 알 수
  없는 slug는 생활 영역 선택으로 인정하지 않는다. query 문자열을 신뢰해 임의 값을
  저장하지 않는다.
- 선택 영역은 AI classifier가 user tags를 대체한 뒤에도 source save의 최종 tags에
  정확히 한 번 합성한다. 다른 `domain:*`은 제거한다. 이 작업은
  `captureFromMarkdown`으로 저장되는 source 계열에만 적용한다.
- journal/voice/todo/4W1H는 `createRecord`와 `withDomainTag`의 instrument-owned 분류를
  그대로 사용한다. 생활 영역 맥락 상태에서 이 record 계열 mode로 바꾸면 hidden
  선택을 지워, 화면이 약속한 영역과 실제 저장 영역이 갈라지지 않게 한다.
- `withDomainTag`의 caller domain hijack 방지 계약을 약화시키거나 새 public override
  인자를 만들지 않는다.
- exact-duplicate source가 반환되면 새 영역 tag가 저장됐다고 주장하지 않는다.
  저장 성공 panel에서 영역 맥락을 새 결과처럼 과장하지 말고 기존 dedup 결과 계약을
  유지한다.

### 카피·접근성·시각 규칙

- 다섯 UI locale(en/ko/es/pt/id)을 모두 보존한다. 기존 `capture` namespace에 정확한
  키가 없고 5개 locale 파일을 수정하면 파일 한도를 넘는 경우, 이 화면 전용 typed
  copy map을 한 파일 안에 두되 다섯 언어를 모두 제공한다.
- UI에는 `생활 영역`이라고 쓰고 `별`, `7개 영역`, 옛 심리 구인을 되살리지 않는다.
- disclosure header에는 `accessibilityState={{ expanded }}`, 선택 카드에는 selected
  state, context 해제에는 명확한 action label을 준다. private body나 내부 domain tag를
  accessibility label로 복사하지 않는다.
- raw `Pressable`, function-form style/children, 정적 opacity, `withAlpha`, rgba,
  gradient, blur, circle/path, 새 rounded pill을 만들지 않는다.
- 기존 capture 저장 버튼의 disabled 사유, first-run 문구, crisis routing, OCR 승인,
  voice/file 권한·실패, draft hydration, double-submit 방지, auto-classify user-curation
  우선순위는 모두 보존한다.

### 필수 테스트

- `/capture-full`만 생활 영역 disclosure를 켜고 legacy `/capture` renderer에는 영향 없음
- 기본 접힘, 펼침, 한 영역 선택, 선택 지우기, Android Back 우선 닫힘
- 여섯 생활 영역과 `collect` 제외, 이것들을 별이라고 부르는 문구 부재
- 건강/휴식 선택이 실제 memo composer로 이어지고 가짜 점수·상태·센서·권한 claim 부재
- 기존 `tag=domain:career`가 hidden area context로 변환되고 user tag chip에는 노출되지 않음
- invalid/collect domain query fail closed, 일반 tag query 기존 동작 유지
- AI tag 제안 뒤 source save에도 선택 domain tag 정확히 1개, 다른 domain tag 제거
- record 계열 mode 전환 시 hidden 선택 제거, `withDomainTag` no-hijack 계약 불변
- body/draft/submit/저장 실패와 exact duplicate 계약 보존
- 다섯 locale typed completeness
- Pixel/Fabric/44dp/no-static-alpha/no-curve 계약

검증은 targeted Jest, 대상 ESLint, type-check, `npm run check:pixel-rules`,
`npm run check:constraints`, `npm run check:cycles`,
`node scripts/verify-portable-handoff.mjs`, 전체 `npm run verify`, `git diff --check`,
변경 파일 secret scan을 실행한다. 픽셀 래칫이 줄면 같은 PR에서 정확한 baseline을
내리되 총 5파일을 넘지 않는다.

### 시각 QA

- exact PR head의 attested web export와 pinned Chromium을 사용한다.
- standard `/capture-full` default 상태를 390×820으로 재측정한다. 현재 제품 카피가
  정본이라 98 미만이면 감점 사유를 사실대로 남기고 문구를 조작하지 않는다.
- 추가 visual evidence로 disclosure 펼침, `건강 생활 메모`, `휴식 메모` 선택 상태를
  캡처한다. 실제 QA 계정의 기존 draft를 지우거나 fixture를 seed하지 않는다.
- 캡처에서는 text 입력, 파일/사진/마이크 선택, permission, submit/save, tag mutation,
  외부 이동을 실행하지 않는다. disclosure와 영역 선택 같은 로컬 UI state 전환만
  계수해 보고한다.
- Android keyboard, hardware Back, TalkBack, 파일/사진/마이크, 실제 저장은 HUMAN
  PENDING으로 남긴다.
```

## 이 발주가 살리는 것과 버리는 것

- 살림: `lifeinput`의 선택 격자, `hobbyinput`/`healthinput`의 전용 카드 계층,
  `/capture-full`의 실제 다중 형식 저장 파이프, 기존 생활 영역 화면 deep link.
- 버림: 고정 취미 목록, 하고 싶어요/하는 중/했어요 fixture, 건강 점수·에너지·상태
  fixture, 센서/권한 성공 claim, 새 고아 route.
- 정본 유지: 사용자가 고른 생활 영역은 hidden internal context, 실제 본문과 저장 결과는
  기존 capture 계약, record 계열의 분류는 `withDomainTag` instrument가 소유한다.
