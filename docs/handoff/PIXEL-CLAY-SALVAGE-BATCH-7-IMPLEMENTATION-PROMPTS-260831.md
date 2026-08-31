# PIXEL-CLAY salvage batch 7 — implementation prompts

작성일: 2026-08-31 KST

대상: `/sign-up` → `/ratifications` → `/big-five`
공통 base: `codex/pixel-gate-primitives-260831` exact
`60ae8f90bdbb8e7e40ab4f94b29ee8c8224d9fe7`

이 문서는 코딩 전 인계 계약이다. 세 화면은 서로 독립된 저장소 내부 worktree, branch,
Draft PR로 만든다. 한 PR은 한 화면만 소유하고 수정 파일은 최대 5개다. 다른 화면 branch를
base로 삼지 않는다.

공통으로 먼저 읽을 파일:

- `CLAUDE.md`
- `docs/PIXEL-CLAY-MIGRATION.md`
- `design/pixel_clay_v4/REPO-NOTES.md`
- `ANDROID_QA_GUIDELINES.md`
- `docs/SESSION-OWNERSHIP.md`
- `design/pixel_clay_260825/data/screens.json`
- 해당 화면의 `design/pixel_clay_260825/captures/<id>.png`
- 해당 화면의 `design/pixel_clay_260825/data/structure/<id>.json`
- PR #1508의 `design/pixel_clay_260825/data/salvage-plan.json`

공통 규칙:

- 캡처의 계층·밀도·카드 배치만 참고한다. 캡처의 고정 계정 상태, 검사 결과, 이력 수,
  시각, 사용자 이름은 fixture이므로 이식하지 않는다.
- mount나 시각 QA만으로 계정 생성, OAuth, 코드 검증, 동의 기록, 검사 저장, 별 반영,
  라우트 이동을 실행하지 않는다.
- auth loading, signed-out, profile probing/failure/incomplete, owner switch, unmount를 각각
  정직하게 다룬다. read error/timeout을 empty나 기본값으로 말하지 않는다.
- `PixelSurface`, `PixelPressable`, `PixelGlyph`, `PixelGateShell`과 `m3.*` token을 우선한다.
  radius 0, 네 방향 bevel, integer rect, no blur/gradient/static alpha, 44dp, full-width 및
  접근성 state를 지킨다.
- 기존 legacy renderer와 그 styles가 있는 화면은 보이는 동작과 출력이 byte-equivalent하게
  유지되어야 한다. deep-space renderer만 PIXEL-CLAY로 바꾼다.
- 새 inline KO/EN 임시 문구를 만들지 않는다. 이 PR의 5파일 한도 안에서는 기존 5-locale
  key를 우선 재사용한다. 새 문구가 꼭 필요하지만 5-locale parity를 지킬 수 없다면 문구를
  지어내지 말고 별도 후속 작업으로 명시한다.
- `scripts/check-pixel-rules.ts`는 해당 PR의 실제 감소분만 반영한다. 다른 독립 PR을 병합한
  뒤에는 누적 baseline을 재계산한다.
- targeted Jest, 대상 ESLint, type-check, pixel rules, constraints, cycles, portable handoff,
  전체 `npm run verify`, diff/secret scan을 통과한 뒤에만 push와 Draft PR을 만든다.
- 웹 390×820 증거는 exact remote head를 export/attest한 뒤 남긴다. 웹 캡처는 시각 증거일
  뿐 Android HUMAN PASS가 아니다.

## 1. `/sign-up` — 축약 시안 안에 실제 가입·동의·확인 흐름을 보존

```text
`codex/pixel-gate-primitives-260831` exact head
`60ae8f90bdbb8e7e40ab4f94b29ee8c8224d9fe7`에서 저장소 내부 worktree
`.worktrees/codex/pixel-clay-sign-up-260831`, branch `codex/pixel-clay-sign-up-260831`를 만들고
deep-space `/sign-up` 화면 하나만 PIXEL-CLAY v4로 옮겨라. `SignUpLegacy`와 legacy styles,
sign-in/reset-password/consent-notice renderer는 불변으로 두고 한 Draft PR만 만든다. 수정
파일은 최대 5개다.

추가로 먼저 읽는다:

- `src/app/(auth)/sign-up.tsx`
- `src/lib/auth/useSignUpForm.ts`
- `src/lib/auth/sign-up-flow.ts`
- `src/lib/auth/consent-selections.ts`
- `src/screens/deepspace/dds-auth-screens.tsx`의 현 sign-up slice
- `src/components/consent/ConsentNotice.tsx`
- `src/components/auth/BirthDateField.tsx`
- `src/lib/supabase/auth.ts`의 age/provider/confirmation 계약
- `locales/*/auth.json`, `locales/*/consent.json`, `locales/*/deepspace.json`

레퍼런스 `signup`은 구조 추출상 제목과 하단 `계정 만들기` CTA만 남은 축약 프레임이다.
따라서 큰 제목 → 실제 입력·동의의 스크롤 본문 → 하단 primary CTA라는 계층만 layout-only로
참고한다. 실제 email/password/DOB, C10 필수·선택 동의, provider, 기존 계정 안내, 이메일
확인 코드 상태를 삭제하거나 한 장짜리 가짜 가입 화면으로 줄이지 않는다.

충돌 없는 구조:

- 새 `src/screens/deepspace/dds-sign-up-screen.tsx`가 deep sign-up만 소유하고 route가 이를
  직접 import하도록 한다. sign-in PR도 만지는 `dds-auth-screens.tsx`와
  `DeepSpaceDesignScreens.tsx`를 이 PR에서 수정하지 않는다.
- `useSignUpForm`을 단일 동작 authority로 유지한다. 화면에서 별도 가입/OAuth/확인 state나
  Supabase 호출을 재구현하지 않는다.
- loading 중에는 gate checking surface, 이미 로그인한 사용자는 기존 hold 조건
  (`submitting`, judge welcome, toast)을 보존한 뒤 `/`로 보낸다. render 중 navigation을
  호출하지 않는다.
- guest용 `PixelGateShell`의 back, locale switch, safe-area, keyboard avoidance를 유지한다.
  Android hardware back은 기존처럼 `/` 한 번만 연다.
- email, password, DOB, 체크리스트, 필수 5개와 optional marketing 동의, 각 동의 상세
  `/consent-notice`, `/terms`, `/sign-in`, `/manual` 실제 route를 유지한다.
- provider는 `visibleProviders`와 `naverEnabled`가 허용한 것만 보인다. provider가 0개이면
  구분선이나 빈 칸을 만들지 않는다. OAuth 가입 뒤 DOB·C10은 `/complete-profile`에서
  수집한다는 기존 계약을 바꾸지 않는다.
- `confirmationRequired`는 현재 email과 6자리 code 입력·검증이 있는 persistent primary
  state다. 성공 toast로 축약하거나 가짜 성공 화면으로 넘기지 않는다. native deep-link
  callback consumption과 web session detection을 보존한다.

쓰기·보안 interaction 계약:

- email submit, OAuth/Naver, confirmation verify 사이에 하나의 synchronous action lock을
  둔다. React state가 갱신되기 전 같은 frame의 double tap과 서로 다른 action의 race도
  막는다. 시작하지 않은 action은 lock을 잡지 않고 모든 terminal path에서 해제한다.
- `canSubmit`은 email 형식, 8자 이상 password, 실제 최소 자기동의 연령, 모든 required
  acknowledgement, 현재 action idle을 계속 요구한다. 화면이 validation을 완화하지 않는다.
- account creation과 consent ledger는 `submitSignUp`의 기존 순서 그대로다. 동의 기록을
  fire-and-forget으로 바꾸거나 실패한 가입을 성공으로 그리지 않는다.
- mount, focus, locale switch, 입력, checklist/동의 렌더, visual QA에서 sign-up/OAuth/verify
  호출 0이다. 오직 명시적 enabled CTA 한 번 뒤에 대응 action 하나만 실행한다.
- password, DOB, confirmation code, callback token, OAuth URL을 log, analytics,
  accessibility label/hint, test snapshot에 넣지 않는다. 오류 log는 raw provider/Supabase
  message를 재출력하지 않는다. 확인 대상 email은 기존 persistent 안내 본문에서만 표시한다.
- 기존 계정 가능성은 계정 존재 여부를 확정하지 않는 현재 문구와 `/sign-in` recovery path를
  유지한다. age-gate, breached-password, generic failure를 서로 다른 기존 locale 상태로
  표시한다.

PIXEL/Fabric:

- title/age notice/form/confirmation/existing-account/consent/provider/footer는
  `PixelSurface`; back/locale/submit/provider/verify/legal action은 `PixelPressable`; 상태와
  provider 표식은 `PixelGlyph` 또는 현재 provider asset로 구성한다.
- 입력과 체크 상태는 square border/fill/inset으로 나타낸다. disabled/pressed/error를 static
  opacity, round pill, blur, smooth shadow로 표현하지 않는다.
- sticky CTA는 keyboard와 safe area 위에서 유지되되 마지막 동의·법적 링크를 가리지 않는다.
  320dp와 390dp에서 provider row가 wrap되고 모든 action이 44dp 이상이어야 한다.
- confirmation code는 숫자 keyboard, one-time-code semantics, busy/disabled state를 유지한다.
  동의 checkbox는 checked state와 detail action을 screen reader에 각각 명확히 제공한다.

테스트:

- loading/signed-in/guest/judge hold와 back·locale·sign-in/manual/legal route
- email/password/DOB/min-age/required 5개/optional consent의 실제 `canSubmit` 계약
- provider feature flags와 provider 0개 reflow
- submit/OAuth/Naver/verify same-frame 및 cross-action double-submit 방지
- confirmationRequired/card/code success·failure와 deep-link one-shot consumption
- existing-account/age/breached/generic 결과 분리, consent ledger sequencing
- mount/input/locale/consent toggle에서 auth write·navigation 0
- password/DOB/code/token/raw error 비노출
- `SignUpLegacy`, sign-in/reset-password, 기존 giant auth renderer slice 불변
- Pixel/Fabric/44dp/a11y/keyboard/320dp reflow와 exact pixel ratchet

390×820 QA는 fresh signed-out context에서 입력·동의·provider·submit·code·legal link를 누르지
않고 initial form만 캡처한다. 테스트 자격증명을 입력하거나 계정을 생성하지 않는다. 실제
provider flag 상태를 fixture로 덮지 않는다. Android keyboard/back/HUMAN은 pending이다.
```

## 2. `/ratifications` — 적용된 별 변화만 정직하게 보여 주는 확인 원장

```text
공통 base exact head에서 저장소 내부 worktree
`.worktrees/codex/pixel-clay-ratifications-260831`, branch
`codex/pixel-clay-ratifications-260831`를 만들고 `/ratifications` 화면 하나만 PIXEL-CLAY v4로
옮겨라. 이 route는 deep-space 전용이다. 실제 persisted ledger와 newest-first 계산을 보존하고
한 Draft PR만 만든다. 수정 파일은 최대 5개다.

추가로 먼저 읽는다:

- `src/app/ratifications.tsx`
- `src/lib/persona/load-tier-observations.ts`
- `src/lib/persona/brightness-timeline.ts`
- `src/lib/persona/star-name.ts`
- `src/lib/persona/tier-history.ts`
- `src/lib/async/with-timeout.ts`
- `src/app/__tests__/ratifications-empty-state.test.ts`
- `locales/*/ratifications.json`, `locales/*/home.json`, `locales/*/community.json`

레퍼런스 `ratify`의 title/subtitle → summary strip → decision filters → newest-first entry
timeline 계층은 direct하게 참고한다. 고정 이력 수, 별 이름, level, 상대 시각, cited count는
이식 금지다. `star_tier_history`에 실제로 남은 accepted observation만 표시한다.

구조와 read 계약:

- `buildRatificationLog`의 stable chronological fold와 newest-first 출력, first observation의
  `prevLevel=null`, unchanged recompute fold를 복제하거나 바꾸지 않는다.
- 기존 `loadTierObservations(userId): Promise<TierObservation[]>`의 fail-soft signature는
  `/brightness` 등 기존 caller 때문에 그대로 둔다. 이 화면용 opt-in strict/result reader를
  추가해 Supabase의 returned `error`, thrown error, timeout, ready-empty를 구분한다. raw error는
  result에 싣지 않는다.
- auth loading, signed-out `/sign-in`, profile probing/failure/incomplete를 query보다 먼저
  gate한다. genuine incomplete만 `/complete-profile`로 보내고 probe failure를 incomplete로
  오인하지 않는다. gate 전 query는 0회다.
- screen state는 loading/error/timeout/empty/ready를 구분하고 explicit retry를 제공한다.
  retry는 현재 owner만 다시 읽으며 성공 이력을 먼저 empty로 지우지 않는다.
- owner id와 request ticket을 함께 검사한다. A 응답이 늦게 와도 B 또는 signed-out 화면을
  덮지 못하고 unmount 뒤 setState하지 않는다.
- 이 원장은 accepted observation만 저장한다. `ratified` 수와 행은 실제 `all.length`다.
  proposed/held/declined row를 만들거나 거절 사유를 합성하지 않는다. 지원되지 않는 결정
  filter는 기존 계약처럼 honest filtered-empty만 보여 주며 전체 이력이 없다고 말하지 않는다.
- 알려진 old/seven star는 `starNameKey`의 5-locale 이름만 쓴다. unknown id는 raw DB id 대신
  기존 `community:unknownSender` 같은 안전한 5-locale fallback을 쓴다.
- origin은 `ratify`, `rebuild`, null/recorded만 allowlist로 번역한다. unknown internal origin을
  화면에 그대로 노출하지 않고 recorded fallback으로 처리한다.
- KO `subtitle`의 `{{who}}`는 전역 `useAddressTerm` default variable로 해결된 실제 호칭 또는
  동기 fallback을 사용한다. raw placeholder가 first paint에 보이면 안 된다.

읽기 전용 interaction 계약:

- 이 화면에는 ratify/undo/tier write가 없다. mount, focus, filter, unchanged toggle, scroll,
  retry success, visual QA에서 DB mutation·LLM·analytics·companion expression 0이다.
- filter와 unchanged toggle은 로컬 상태만 바꾸고 query를 중복 실행하지 않는다. retry만
  명시적으로 read를 한 번 실행한다.
- genuine empty의 `/core-brain` CTA만 실제 route를 한 번 연다. load failure에 empty CTA를
  보여 주거나 자동 route하지 않는다.
- raw user id, star id, origin, citation/body, Supabase error를 visible copy, log,
  accessibility label, snapshot에 넣지 않는다. evidence는 citation count만 표시한다.

PIXEL/Fabric:

- summary, loading/error/empty, ledger entry는 `PixelSurface`; filter/toggle/retry/Polaris는
  `PixelPressable`; star/check/arrow는 `PixelGlyph`로 구성한다.
- 4열 summary는 320dp에서 두 줄 grid 또는 세로 fact rows로 reflow한다. count/label을
  round pill로 줄이지 않는다. selected filter는 square fill/border와 accessibility selected로
  표시한다.
- entry의 origin, decision, star, delta, time, cited count는 작은 화면에서 겹치지 않게
  세로 reflow한다. level과 count는 integer/mono, 모든 action은 44dp다.
- static opacity, smooth shadow, rounded chip, raw SVG path를 새 slice에서 제거한다.

테스트:

- strict reader의 returned error/thrown error/timeout/ready-empty 분리와 기존 fail-soft API 보존
- auth/profile/probe gate 전 query 0, signed-out/incomplete 실제 route
- explicit owner filter, A→B/signed-out/unmount stale guard, retry current owner 1회
- `buildRatificationLog` newest-first/prev delta/unchanged 기존 계약
- persisted accepted row/count만 표시, held/declined fixture 0건, filtered-empty 정직성
- known two-system star locale 이름과 unknown id/origin 비노출
- KO `{{who}}` raw placeholder 부재, relative time/date locale 계약
- mount/filter/toggle/read에서 mutation·LLM·navigation·expression 0
- Pixel/Fabric/44dp/a11y/320dp reflow와 exact pixel ratchet

390×820 QA는 실제 QA 계정의 현재 원장을 읽기 전용으로 캡처한다. filter, unchanged, retry,
Polaris CTA를 누르지 않고 이력을 seed하지 않는다. 실제 empty면 honest empty를 캡처한다.
Android screen-reader/HUMAN은 pending이다.
```

## 3. `/big-five` — 실제 BFI-44 결과 lens와 저장 가능한 자기보고 흐름

```text
공통 base exact head에서 저장소 내부 worktree
`.worktrees/codex/pixel-clay-big-five-260831`, branch `codex/pixel-clay-big-five-260831`를 만들고
deep-space `/big-five` 화면 하나만 PIXEL-CLAY v4로 옮겨라. `BigFiveLegacy`의 보이는 출력과
기존 shared quant caller 동작은 불변으로 두고 한 Draft PR만 만든다. 수정 파일은 최대 5개다.

추가로 먼저 읽는다:

- `src/app/big-five.tsx`
- `src/lib/persona/bfi.ts`
- `src/lib/persona/build.ts`의 `loadLatestBfi`
- `src/lib/records/create.ts`
- `src/components/deep-space/DeepSpaceViews.tsx`의 `BigFiveLensM3`
- `src/components/quant/QuantIntroModal.tsx`
- `src/components/quant/LikertChoiceGroup.tsx`
- `src/components/quant/QuantPager.tsx`
- `src/components/quant/QuantSaveCelebration.tsx`
- `src/lib/onboarding/state.ts`의 first-star nudge
- `locales/*/big-five.json`, `locales/*/home.json`

레퍼런스 `bigfive`의 `검증 · Big Five` title → Layer B 설명 → 실제 trait/result 또는 honest
empty/error → 명시적 검사 CTA 계층은 direct하게 참고한다. 캡처에 결과가 보이더라도 trait
값을 fixture로 이식하지 않는다. BFI-44 44문항을 축약하거나 임의 질문·점수로 바꾸지 않는다.

구조와 read 계약:

- BFI 결과 authority는 `loadLatestBfi(getSupabaseClient(), userId)`뿐이다. 1~5 mean을 기존
  `bfiMeanToPercent`로 바꾸는 계산을 유지하고, heuristic/sample trait를 채우지 않는다.
- lens read를 auth/profile gate 뒤에서 loading/error/timeout/empty/ready로 구분한다. 현재처럼
  initial `null`을 empty로 먼저 그리지 않는다. retry는 현재 owner를 한 번 다시 읽는다.
- owner id와 request ticket으로 A의 늦은 read가 B/signed-out state를 덮지 못하게 하고
  unmount stale result를 버린다.
- filled에는 실제 five traits와 기존 5-locale labels만 표시한다. empty CTA는 실제 BFI-44
  survey를 같은 deep-space flow에서 열고 `/interview`나 가짜 결과 route로 대체하지 않는다.
- `BFI_ITEMS`, reverse scoring, `scoreBfi`, 5-point choices, 5개/page, 총 9페이지, answered
  progress, all 44 complete gate를 그대로 유지한다. shared quant component를 바꿔 다른 검사에
  회귀를 만들지 않는다. 필요하면 화면에 `skin="pixel"` 같은 opt-in을 추가하고 default
  output은 byte-equivalent하게 보존한다.
- 이 PR에서 새 inline KO/EN copy를 만들지 않는다. lens는 기존 `home:ds.lens.*`, survey는
  기존 `big-five`와 현재 검증된 BFI item copy를 재사용한다. 기존 inline 두 언어 문구를
  건드려야 한다면 5파일 한도 안에서 parity를 지킬 수 있는 별도 후속 i18n 작업으로 남긴다.

저장·소유권 interaction 계약:

- mount, result read, retry, survey open, intro cancel, page move, answer 선택에는 `createRecord`,
  LLM, nudge, navigation write가 0이다.
- 저장은 모든 44개 응답 뒤 마지막 명시적 CTA에서만 가능하다. React state와 별도로
  synchronous submit lock을 둬 same-frame double tap에도 `createRecord` 정확히 1회다.
- 저장 payload는 기존 `kind: note`, JSON `bfi_responses`와 scores, `big_five`/`bfi`/
  `assessment` tags, `withFollowup:false`를 그대로 유지한다. client가 별 level이나 persona를
  직접 쓰지 않는다.
- submit이 시작된 owner와 완료 시 active owner가 같을 때만 saved celebration, lens reload,
  first-star chat nudge를 실행한다. owner switch/unmount/failed save에서는 성공 UI·nudge·route
  0이고 답변을 유지해 retry할 수 있어야 한다.
- 저장 실패는 기존 locale failure copy로 표시하고 응답을 보존한다. raw response JSON,
  user id, record id, DB error를 log, analytics, accessibility label, snapshot에 넣지 않는다.
- Android hardware back은 진행 전에는 일반 back, 하나 이상 답한 뒤에는 기존 exit confirm을
  유지한다. cancel은 답변 유지, explicit exit만 로컬 응답을 버리고 돌아간다.
- save success 뒤 `consumeFirstStarChatNudge`는 한 번만 평가한다. true면 기존 `/secondb`
  route, false면 lens로 돌아가 현재 owner 결과를 다시 읽는다.

PIXEL/Fabric:

- lens의 loading/error/empty/traits, intro, question, scale, pager, exit confirm, save status를
  `PixelSurface`; start/retry/choice/page/save/exit를 `PixelPressable`; trait/status/arrow를
  `PixelGlyph`로 구성한다.
- trait 값은 square bar/cells와 integer geometry로 표현하고 gradient, smooth shadow,
  rounded card, static opacity에 기대지 않는다. 선택한 Likert 값은 border/fill/inset과
  accessibility checked/selected로 나타낸다.
- 320dp에서 five traits와 1~5 choices가 잘리지 않게 scale choices를 wrap 또는 균등 grid로
  reflow한다. 질문, pager, save CTA가 keyboard/safe-area에 가려지지 않고 모든 action은
  44dp 이상이어야 한다.
- reduced motion에서는 save celebration이 즉시 완료되어도 내용과 다음 action이 사라지지
  않아야 한다. animation timer와 hardware back listener를 unmount에서 정리한다.

테스트:

- auth/profile/probe gate와 lens loading/error/timeout/empty/ready, explicit retry
- BFI `loadLatestBfi` explicit owner, A→B/signed-out/unmount stale read guard
- actual five trait mapping, no sample/fixture/heuristic values
- exact BFI_ITEMS 44, 5-point scale, reverse score, 9 pages, all-44 submit gate
- mount/read/open/answer/page에서 createRecord·LLM·nudge·navigation 0
- terminal CTA createRecord exact payload 1회, same-frame double-submit 방지
- failed/stale-owner save에서 responses 유지·success/nudge/route 0
- saved current-owner에서 reload 및 first-star nudge one-shot route
- Android back exit confirmation과 cancel/confirm semantics
- raw responses/id/error 비노출, `BigFiveLegacy`와 shared quant default output 불변
- Pixel/Fabric/44dp/a11y/reduced-motion/320dp reflow와 exact pixel ratchet

390×820 QA는 실제 QA 계정의 현재 lens를 읽기 전용으로 캡처한다. result가 없으면 honest
empty까지만 캡처하고 Start/Retake/Add Data/Other Frameworks를 누르지 않는다. 검사 답변을
seed하거나 저장하지 않는다. Android pager/back/HUMAN은 pending이다.
```

## 권장 진행·병합 순서

1. `/sign-up`
2. `/ratifications`
3. `/big-five`

세 PR 모두 shared primitives 위의 독립 branch다. 권장 병합 순서는 제품 우선순위일 뿐
branch stacking 지시가 아니다. 병합 때는 각 PR의 pixel ratchet 감소분을 누적 계산한다.

이 batch의 핵심은 레퍼런스의 완성된 모양을 복제하는 것이 아니다.

- `/sign-up`: 축약 프레임 안에 실제 C10 가입·provider·confirmation 상태를 보존
- `/ratifications`: fail-soft empty 대신 실제 accepted ledger와 정직한 read 상태를 표시
- `/big-five`: fixture trait 대신 실제 BFI-44 read·survey·single-save 계약을 유지
