# PIXEL-CLAY salvage batch 5 — implementation prompts

작성일: 2026-08-31 KST

대상: `/ops` → `/record/[id]` → `/sign-in`
공통 base: `codex/pixel-gate-primitives-260831` exact `60ae8f90bdbb8e7e40ab4f94b29ee8c8224d9fe7`

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

- 캡처의 계층·밀도·2열/카드 배치만 참고한다. 캡처의 고정 사용자 기록, 루틴, 수치,
  streak, 관계, 상태, 응답은 fixture이므로 이식하지 않는다.
- mount나 시각 QA만으로 LLM, quota 증가, 저장, 수정, 삭제, 권한 요청, 알림 예약,
  외부 앱 열기, OAuth를 실행하지 않는다.
- auth loading, signed-out, profile probing/failure/incomplete, owner switch, unmount를 각각
  정직하게 다룬다. read error/timeout을 empty/not-found로 말하지 않는다.
- `PixelSurface`, `PixelPressable`, `PixelGlyph`, `PixelGateShell`과 `m3.*` token을 우선한다.
  radius 0, 네 방향 bevel, integer rect, no blur/gradient/static alpha, 44dp, full-width 및
  접근성 state를 지킨다.
- 기존 legacy renderer와 그 styles는 byte-stable하게 보존한다. deep-space renderer만
  교체한다.
- inline KO/EN 임시 문구를 만들지 않는다. 기존 5-locale key를 우선하고, 새 문구가
  불가피하면 5 locale parity와 typed contract를 같은 PR에서 지킨다.
- `scripts/check-pixel-rules.ts`는 해당 PR의 실제 감소분만 반영한다. 다른 독립 PR을
  병합한 뒤에는 누적 baseline을 재계산한다.
- targeted Jest, 대상 ESLint, type-check, pixel rules, constraints, cycles, portable handoff,
  전체 `npm run verify`, diff/secret scan을 통과한 뒤에만 push와 Draft PR을 만든다.
- 웹 390×820 증거는 exact remote head를 export/attest한 뒤 남긴다. 웹 캡처는 시각 증거일
  뿐 Android HUMAN PASS가 아니다.

## 1. `/ops` — 실제 오늘 상태와 명시적 실행만 있는 비서 허브

```text
`codex/pixel-gate-primitives-260831` exact head
`60ae8f90bdbb8e7e40ab4f94b29ee8c8224d9fe7`에서 저장소 내부 worktree
`.worktrees/codex/pixel-clay-ops-260831`, branch `codex/pixel-clay-ops-260831`를 만들고
deep-space `/ops` 화면 하나만 PIXEL-CLAY v4로 옮겨라. legacy `OpsLegacy`와 legacy
styles는 불변으로 두고 한 Draft PR만 만든다. 수정 파일은 최대 5개다.

추가로 먼저 읽는다:

- `src/app/ops.tsx`
- `src/screens/deepspace/DeepSpaceDesignScreens.tsx`의 `DeepSpaceOpsScreen`
- `src/screens/deepspace/ops/screens.tsx`
- `src/lib/ops/domains.ts`
- `src/lib/ops/recommend.ts`
- `src/lib/ops/routines.ts`
- `src/lib/ops/today-picks.ts`
- `src/lib/ops/usage.ts`
- `src/lib/ops/reminders.ts`
- `src/lib/ops/push.ts`
- `src/lib/supabase/privacy.ts`
- `locales/*/ops.json`

레퍼런스 `ops`의 원형 진행판·일과 목록·패턴 카드·세컨비 카드 계층은 layout-only다.
고정 `2/4`, `12일`, 산책·물 마시기, 수면 수치, 특정 시각 알림, 고정 pattern은 모두
이식 금지다. 화면은 현재 사용자에게 실제로 존재하는 루틴, 완료 로그, 주간 streak,
추천 결과, 오늘 후보만 보여야 한다.

구조:

- 가능하면 새 `src/screens/deepspace/dds-ops-screen.tsx`가 화면을 소유하게 하고,
  `DeepSpaceDesignScreens.tsx`의 기존 거대 구현은 얇은 re-export로 줄인다. 다른 exported
  screen의 renderer/style slice는 바꾸지 않는다.
- `DeepSpaceScreen active="ops" variant="windowed"`의 실제 앱 chrome은 유지한다.
- 첫 카드에는 실제 `todayRoutines`의 `done/total`과 실제 `weekStreak`만 표시한다.
  데이터가 0이면 0을 정직하게 보여주거나 승인된 empty copy를 쓴다.
- 추천 영역은 실제 `OPS_GROUP_IDS`와 `domainsForGroup`만 쓴다. 전용 route가 있는 domain은
  기존 `opsRouteForDomain`으로 보내고, 나머지만 이 화면의 추천 실행 대상으로 둔다.
- `오늘의 두 가지`는 `loadPickCandidates` + `pickToday`의 실제 결과만 쓴다. read 실패를
  `picks: []`로 위장하지 말고 unavailable/error와 genuine empty를 구분한다.
- 실제 route가 있는 tool grid는 유지하되 존재하지 않는 도구, sample count, 준비된 결과를
  만들지 않는다.

read/auth 계약:

- `useAuth`의 loading, signed-out `/sign-in`, `hasProfile === null`,
  `profileProbeFailed`, incomplete `/complete-profile` 경계를 명시한다.
- privacy prefs, usage, today routines/completions, today candidates를 explicit `userId`로
  읽는다. timeout/error/empty/ready를 구분하고 owner switch·unmount의 stale result를
  폐기한다.
- recommendations preference 또는 quota usage를 읽지 못하면 추천 LLM을 fail closed한다.
  오류를 free quota나 consent로 추정하지 않는다.
- 오늘 루틴 read가 실패하면 빈 루틴이라고 말하지 않는다. today candidate read 실패도
  추천용 empty와 분리한다.

mutation/비용 계약:

- `recommendForDomain`은 사용자가 활성 domain을 고르고 CTA를 누른 뒤에만 호출한다.
  `recommendationsAllowed(isMinor, pref)`와 `OPS_DAILY_LIMIT`를 호출 전에 통과해야 한다.
  quota bump와 결과는 같은 owner/request에만 적용한다.
- routine 완료는 optimistic update를 할 수 있지만 실패 시 원래 상태로 rollback하고
  보이는 오류와 screen-reader announce를 남긴다.
- 추천을 routine으로 저장할 때 DB 생성 성공과 reminder 결과를 분리한다. routine이 이미
  저장됐는데 reminder denied/error가 났다면 전체 저장 실패라고 말하거나 중복 저장을
  유도하지 않는다.
- calendar, ICS, share sheet처럼 앱 밖으로 보내는 action은 기존 `ops_push` standing-consent
  inline disclosure를 통과한 뒤 사용자 탭으로만 실행한다. 동의 저장 실패 시 기존 legacy
  계약처럼 이번 명시적 handoff는 실행하되 다음 방문에 다시 묻는다는 사실을 숨기지 않는다.
- on-device reminder는 해당 CTA/저장 CTA의 명시적 탭 뒤에만 실행하며 permission 결과를
  saved/denied/unavailable/error로 구분한다.
- mount·scroll·domain 선택만으로 quota, routine, completion, consent, reminder, calendar,
  share mutation이 발생하지 않는다.

PIXEL/Fabric:

- routine row는 `PixelPressable` checkbox 역할과 checked state를 쓴다. 완료된 항목도
  44dp를 유지한다.
- hero ring은 smooth circle이 아니라 기존 integer rect ring 또는 Pixel glyph로 그린다.
- 추천·tool·state·consent 표면은 `PixelSurface`, CTA는 `PixelPressable`을 쓴다.
- pressed/disabled는 static opacity로 표현하지 않는다. Fabric에서 함수형 Pressable style을
  쓰지 않는다.
- 320dp에서도 domain/group/action이 가로로 잘리지 않고 wrap/reflow해야 한다.

테스트:

- auth/profile 네 경계, owner filters, timeout/error/empty/ready, stale guard
- prefs/usage failure가 LLM을 막고 mount에서 LLM/quota mutation 0
- explicit run 뒤 minor/pref/quota gate 순서, success/error/empty 분리
- 실제 routine done/total/streak만 사용하고 고정 2/4·12·fixture 루틴 부재
- completion rollback + visible error
- routine save success와 reminder failure의 분리
- ops_push consent 전 calendar/ICS/share 0, 동의 뒤에만 실행
- reminder는 명시적 action 뒤에만 실행
- 모든 tool/domain route가 기존 실제 route와 일치
- legacy renderer/styles 및 다른 DeepSpaceDesignScreens export 불변
- Pixel/Fabric/44dp/a11y/reflow와 exact pixel ratchet

390×820 QA는 실제 QA 계정의 현재 state를 그대로 캡처한다. 추천 실행, routine 완료/저장,
calendar/share/reminder, consent CTA는 누르지 않는다. fixture를 seed하지 않는다. Android
HUMAN은 pending이다.
```

## 2. `/record/[id]` — records와 sources를 정확히 구분하는 실제 상세

```text
공통 base exact head에서 저장소 내부 worktree
`.worktrees/codex/pixel-clay-record-detail-260831`, branch
`codex/pixel-clay-record-detail-260831`를 만들고 deep-space `/record/[id]` 상세 화면 하나만
PIXEL-CLAY v4로 옮겨라. legacy `RecordDetailLegacy`와 legacy styles는 불변으로 두고 한
Draft PR만 만든다. 수정 파일은 최대 5개다.

추가로 먼저 읽는다:

- `src/app/record/[id].tsx`
- `src/screens/deepspace/dds-wiki-records-screens.tsx`의
  `DeepSpaceRecordDetailScreen`
- `src/lib/records/get-piece.ts`
- `src/lib/records/create.ts`
- `src/lib/records/timeline.ts`
- `src/lib/records/followup.ts`
- `src/lib/persona/evidence.ts`
- `src/lib/persona/domain-stars.ts`
- `src/lib/privacy/prefs.ts`
- `src/lib/persona/related-embeddings.ts`의 실제 호출 경로
- `locales/*/recordDetail.json`, `locales/*/deepspace.json`

레퍼런스 `record`의 type/date → title/body → 세컨비 근거 → 일반 tag → 연결 기록 →
edit/move/delete 계층만 참고한다. 캡처의 회의 문장, `관계` 별, `기록 5`, 산책·책 표지,
tag, bot 문장은 fixture라 이식 금지다.

구조:

- 가능하면 새 `src/screens/deepspace/dds-record-detail-screen.tsx`가 상세 화면을 소유하고,
  `dds-wiki-records-screens.tsx`는 그 component를 re-export한다. 같은 파일의 `/records`와
  `/wiki` renderer/style slice는 byte-stable하게 둔다.
- `getPieceById(userId, recordId, origin)`을 유일한 record/source read boundary로 사용한다.
  `src-` prefixed source id와 raw id + `origin=source` 둘 다 유지한다.
- primary piece read와 related-list read를 분리한다. related read가 실패해도 실제 상세를
  not-found로 바꾸지 않고, primary read error를 missing으로 바꾸지 않는다.
- loading, timeout, read-error, missing, ready를 별도 state로 둔다. retry는 같은 현재 owner와
  id만 다시 읽는다. owner switch·id change·unmount의 stale result를 버린다.
- 실제 title/type/date/body/structured assessment만 표시한다. assessment JSON은 원문으로
  덤프하지 않고 기존 instrument route로 연결한다.
- user tag만 chip으로 보여 준다. `domain:*`은 내부 분류이므로 `stripDomainTags`를 거친 뒤
  절대 화면·accessibility label·로그에 노출하지 않는다.
- canonical domain tag가 실제로 있을 때만 그 life area를 말한다. domain이 없으면 특정 별을
  추정하지 말고 실제 related count에 맞는 generic copy 또는 unlinked copy를 쓴다.
- related records는 실제 tag/consented embedding 결과만 보여 준다. privacy preference가
  허용되지 않았거나 preference read가 실패하면 semantic query를 호출하지 않는다.

mutation 계약:

- edit는 plain-body record에서만 열고 빈 값·동일 값은 write하지 않는다. 실패 시 body를
  rollback하고 보이는 오류 + announce를 남긴다.
- free-text tag 입력은 `domain:*`을 거부한다. add 실패 시 원래 tags로 rollback한다.
- move는 한 canonical domain tag만 교체하고 일반 user tag를 보존한다. 실패 시 rollback한다.
- delete는 hard delete다. 별도 명시적 confirm modal 전에는 절대 호출하지 않는다.
  deleting 중 중복 submit을 막고 실패 시 화면에 남아 retry할 수 있어야 한다.
- source는 record-only edit/tag/move/delete를 절대 노출하지 않는다.
- source → wiki 승격은 별도 명시적 CTA 뒤에만 실행한다. mount/read/visual QA에서
  `promotePendingUploads`나 `generateSourcePage`를 호출하지 않는다. 중복 탭을 막고 실패를
  not-found로 바꾸지 않는다.
- error log에는 record body, source body, tag 내용, id를 넣지 않는다.

PIXEL/Fabric:

- type/date header, body/structured surface, 실제 근거 line, tags, related list, action row를
  `PixelSurface`, `PixelPressable`, `PixelGlyph`로 구성한다.
- body는 selectable과 긴 텍스트 reflow를 유지한다. related title은 줄임표와 별도 전체
  접근성 label을 갖는다.
- edit TextInput과 modal actions는 44dp, full-width/reflow를 지킨다.
- delete는 danger token을 쓰되 static alpha, curved radius, soft shadow로 강조하지 않는다.
- 320dp와 390×820에서 edit/move/delete가 겹치거나 잘리지 않는다.

테스트:

- auth loading/signed-out 및 적용되는 profile gate
- prefixed source/raw source/record lookup, explicit owner filter
- primary timeout/error/missing/ready와 related failure 독립, retry, stale guard
- assessment JSON 비노출, structured field 유지, 긴 body reflow
- 모든 visible/a11y/log에서 `domain:*`, citation/body/id 누출 부재
- semantic preference false/failure에서 embedding query 0
- edit/tag/move optimistic rollback과 visible error
- delete confirm 전 0, confirm 뒤 1, double-submit 방지, failure 유지
- source에서 record mutation CTA 0, promote는 explicit CTA 뒤에만 1
- `/records`·`/wiki` renderer/style 불변
- Pixel/Fabric/44dp/a11y/reflow와 exact pixel ratchet

390×820 QA는 QA 계정이 소유한 실제 piece id를 `/records`에서 읽기 전용으로 열어 캡처한다.
record body/id/tag를 텍스트 보고서에 복사하지 않는다. edit/add/move/delete/promote/related
navigation은 누르지 않는다. 실제 piece가 없으면 honest missing/empty만 캡처하며 fixture를
seed하지 않는다. Android HUMAN은 pending이다.
```

## 3. `/sign-in` — 실제 로그인 form을 보존한 PIXEL-CLAY 진입 게이트

```text
공통 base exact head에서 저장소 내부 worktree `.worktrees/codex/pixel-clay-sign-in-260831`,
branch `codex/pixel-clay-sign-in-260831`를 만들고 deep-space `/sign-in` 화면 하나만
PIXEL-CLAY v4로 옮겨라. legacy `SignInLegacy`와 legacy styles, `/sign-up`,
`/reset-password`, consent/DOB 흐름은 불변으로 두고 한 Draft PR만 만든다. 수정 파일은
최대 5개다.

추가로 먼저 읽는다:

- `src/app/(auth)/sign-in.tsx`
- `src/screens/deepspace/dds-auth-screens.tsx`의 `DeepSpaceSignInDesignScreen`
- `src/lib/auth/useSignInForm.ts`
- `src/lib/auth/auth-providers.ts`
- `src/lib/auth/native-social.ts`
- `src/components/pixel/PixelGateShell.tsx`
- `locales/*/auth.json`, `locales/*/deepspace.json`
- signed-out 접근이 가능한 `/terms`, `/privacy-policy`, `/refund` route

레퍼런스 `auth`의 head/brand → email/password → primary login → sign-up → provider row →
reset/legal footer 계층만 참고한다. 레퍼런스의 고정 회사 정보, 주소·등록번호, 임시 정책
문구는 이식하지 않는다. 실제 form을 두 개의 선택 카드만 있는 fake gate로 축소하지 않는다.

구조:

- 가능하면 새 `src/screens/deepspace/dds-sign-in-screen.tsx`가 sign-in만 소유하고,
  `dds-auth-screens.tsx`는 이를 re-export한다. sign-up/reset/consent renderer와 shared styles는
  byte-stable하게 둔다.
- signed-out shell은 `PixelGateShell`을 사용한다. 앱 내부 dock이나 smooth radial gradient를
  다시 만들지 않는다.
- 실제 `useSignInForm`을 그대로 사용한다. 별도 auth state, provider list, login API를
  복제하지 않는다.
- loading 중 form을 flash하지 않고 branded loader를 보여 준다. `userId`가 생기면 기존처럼
  `/`로 redirect한다.
- email TextInput → password TextInput → submit의 keyboard flow, secureTextEntry,
  show/hide, returnKey, safe-area/IME clearance를 유지한다.
- provider 버튼은 `visibleProviders`에 있는 것만, Naver는 `naverEnabled`일 때만 보인다.
  브랜드 표시는 기존 허용된 단색 mark 또는 읽을 수 있는 monogram을 사용하고 전체 provider
  이름을 accessibility label로 제공한다.
- forgot-password는 `/reset-password`로 보낸다. email은 trim 후 현재 앱이 허용하는
  syntactically valid address일 때만 param으로 전달하고 그 외에는 전달하지 않는다.
- sign-up은 `/sign-up` link만 유지한다. 이 PR에서 DOB, consent, confirmation wall을
  수정하지 않는다.
- 기존 5-locale key를 재사용해 `/terms`, `/privacy-policy`, `/refund`의 실제 signed-out
  링크를 보여 줄 수 있다. `legalConsent` 문장 하나를 오직 `/terms`로만 보내는 모순은
  만들지 않는다. 새 정책 주장을 inline으로 쓰지 않는다.

보안/interaction 계약:

- password와 email 값을 log, analytics, error text, accessibility label/hint, test snapshot에
  복사하지 않는다. reset 안내가 email을 명시하는 기존 hook 상태는 화면에만 렌더하고
  로그로 보내지 않는다.
- submit은 `canSubmit`이고 사용자가 CTA를 누르거나 password returnKey를 보냈을 때만
  `handleSubmit`을 호출한다. loading/submitting 중 중복 호출을 막는다.
- OAuth/Naver도 해당 provider CTA의 명시적 탭 뒤에만 호출한다. mount, provider render,
  locale change, screenshot에서 호출 0이다.
- provider flag가 off인 방법을 reference와 맞추려고 노출하지 않는다.
- error/success toast는 기존 hook message와 tone을 사용하고 live-region/alert 의미를 유지한다.

PIXEL/Fabric:

- form/group는 `PixelSurface`, CTA/provider/legal link는 `PixelPressable`, 장식은
  `PixelGlyph` 또는 허용된 단색 brand mark를 쓴다.
- TextInput은 square inset surface 안에 두고 44dp 이상, visible focus/error/disabled 상태를
  token으로 표현한다.
- primary 로그인과 secondary 가입의 계층은 유지하되 static opacity, pill, smooth shadow,
  gradient를 쓰지 않는다.
- provider 수가 늘어도 320dp에서 잘리지 않게 wrap/reflow한다. 작은 Android 화면에서
  password/reset/legal footer가 nav bar나 keyboard 아래로 숨지 않아야 한다.

테스트:

- loading → signed-out form, signed-in `/` redirect
- email/password state와 secure/show-hide, keyboard submit, disabled/busy/double-submit
- mount에서 submit/OAuth/Naver/reset mutation 0
- `visibleProviders`/`naverEnabled`와 실제 handler 1:1
- reset param trim + invalid email omission
- password/email raw value의 log/a11y/snapshot 비노출
- `/sign-up`, `/reset-password`, `/terms`, `/privacy-policy`, `/refund` 실제 route
- sign-up/reset/consent renderer와 legacy SignIn renderer/styles 불변
- PixelGateShell, Pixel/Fabric/44dp/safe-area/IME/a11y/reflow와 exact pixel ratchet

390×820 QA는 새 signed-out browser context에서 form을 읽기 전용으로 캡처한다. email/password를
입력하지 않고 login, provider, sign-up, reset, legal link를 누르지 않는다. Android keyboard와
HUMAN QA는 pending이다.
```

## 권장 진행·병합 순서

1. `/ops`
2. `/record/[id]`
3. `/sign-in`

세 PR 모두 shared primitives 위의 독립 branch다. 권장 병합 순서는 제품 우선순위일 뿐
branch stacking 지시가 아니다. 병합 때는 각 PR의 pixel ratchet 감소분을 누적 계산한다.

이 batch의 핵심은 레퍼런스의 완성된 모양을 복제하는 것이 아니다.

- `/ops`: 고정 루틴·패턴을 실제 owner 상태와 명시적 실행으로 교체
- `/record/[id]`: sample 상세를 실제 record/source/error/mutation 경계로 교체
- `/sign-in`: fake 선택 게이트가 아니라 실제 auth form을 PIXEL-CLAY 진입 구조로 정리
