# PIXEL-CLAY v4 salvage batch 3 implementation prompts

작성일: 2026-08-31
대상 기준: `codex/pixel-clay-shared-260831` `60ae8f90`
순서: `/onboarding` → `/ttfv` → `/audit`

이 문서는 `design/pixel_clay_260825/data/salvage-plan.json`의 다음 세 항목을 실제 앱에
살리는 코딩 발주서다. 공통 완료 조건은
`docs/handoff/PIXEL-CLAY-APP-IMPLEMENTATION-PROMPT-260831.md`를 따른다.

- 한 화면, 한 branch, 한 Draft PR
- 한 세션에서 추적 파일 최대 5개
- 실제 데이터와 실제 동작 우선
- legacy/cosmic-pixel rollback renderer 불변
- `main` 직접 작업·push 금지
- Android HUMAN 판정 전 PASS 금지

## 1. `/onboarding` — `dobgate`를 실제 가입 경계로 흡수

```text
`codex/pixel-clay-shared-260831` exact head `60ae8f90`에서 저장소 내부 worktree와
`codex/pixel-clay-onboarding-260831` branch를 만들고 `/onboarding` 한 화면만
PIXEL-CLAY v4로 정리하라. Draft PR 하나만 만들고 main에는 직접 작업하거나 push하지
않는다.

먼저 CLAUDE.md, docs/CONSTRAINTS.md C10, docs/PIXEL-CLAY-MIGRATION.md,
design/pixel_clay_v4/REPO-NOTES.md, ANDROID_QA_GUIDELINES.md,
design/pixel_clay_260825/data/salvage-plan.json의 `dobgate`와 `/onboarding` 항목을 읽는다.
레퍼런스 dobgate는 layout-only다. 현재 앱의 C10 정본은
`src/components/auth/BirthDateField.tsx`, `src/lib/supabase/auth.ts`,
`src/app/(auth)/sign-up.tsx`, `src/app/(auth)/complete-profile.tsx`다.

중요한 제품 경계:
- onboarding에서 생년월일을 새로 입력·저장·판정하지 않는다. 실제 가입과 OAuth profile
  completion만 C10 생년월일과 동의를 소유한다.
- final step에서 기존 계정은 실제 `/sign-in`, 새 계정은 실제 `/sign-up`으로 명확히
  나눈다. signed-in 방어 경로는 onboarding 완료 후 `/`로 간다.
- dobgate 시각은 가입 전에 연령·프라이버시 경계를 알려 주는 한 장의 handoff로만
  살린다. `auth:signUp.ageNotice`, `auth:signUp.birthDateHelper`, 기존 onboarding/auth
  locale key처럼 이미 5개 언어에 존재하는 문구를 우선 재사용한다.
- 국가별 연령을 화면에 새로 hard-code하지 않는다. 현재 가입 계약과 다른 18+, 성인만,
  보호자 동의 완료 같은 상태를 만들지 않는다.
- `markOnboardingComplete()`는 실제 handoff action에서만 실행한다. 슬라이드를 보기만
  했거나 route가 mount된 것만으로 완료 처리하지 않는다.
- signed-out 사용자가 onboarding을 볼 수 있는 pre-auth 계약과 Android hardware Back의
  slide 역이동을 유지한다.

구현:
- 현재 네 슬라이드의 canon copy와 의미는 유지하되 raw `Pressable`, 장식 wrapper,
  수동 alpha 표면을 `PixelSurface`, `PixelPressable`, `PixelGlyph`로 바꾼다.
- 마지막 장은 SecondB head, 가입 시 연령 확인 안내, `/sign-up`과 `/sign-in` 두 실제
  action만 둔다. 로그인 상태에서는 중복 auth choice 대신 홈 진입 하나만 둔다.
- radius 0, 4방향 bevel, token color, 정수 rect, 44dp, reduced motion, Fabric-safe
  press contract를 지킨다. `withAlpha`, 정적 opacity, gradient, blur를 새로 만들지 않는다.
- 390×820에서 네 slide와 final handoff의 KO/EN 문구가 잘리지 않고 세로로 재흐름해야 한다.

테스트:
- signed-out pre-auth render와 onboarding-complete redirect
- 네 canon slide 및 Android Back 역이동
- final step의 `/sign-up`, `/sign-in`, signed-in `/` 목적지
- `markOnboardingComplete()`가 handoff action 전에 실행되지 않음
- onboarding 내부 DOB input/update, hard-coded 18+, fake guardian/adult state 부재
- Pixel primitives, 44dp, Fabric guard, 정적 opacity/withAlpha 부재
- targeted Jest, 대상 ESLint, type-check, check:pixel-rules, check:constraints,
  check:cycles, verify-portable-handoff, 전체 `npm run verify`

캡처는 로그아웃 QA 상태에서 네 번째 slide까지 읽기 전용으로 이동한 뒤 final handoff를
390×820으로 남긴다. `/sign-up`·`/sign-in` action은 캡처에서 누르지 않는다. 실제 DOB
입력·가입·동의와 Android Back/TalkBack은 HUMAN PENDING이다.
```

## 2. `/ttfv` — 고정 성향 fixture를 실제 첫 기록 검토로 교체

```text
`codex/pixel-clay-shared-260831` exact head `60ae8f90`에서 저장소 내부 worktree와
`codex/pixel-clay-ttfv-260831` branch를 만들고 `/ttfv` 한 화면만 구현하라. 한 Draft
PR, 최대 5개 추적 파일을 지킨다.

먼저 CLAUDE.md, docs/PRD.md의 propose→ratify와 정직한 밝기 규칙,
docs/PIXEL-CLAY-MIGRATION.md, ANDROID_QA_GUIDELINES.md,
design/pixel_clay_260825/data/salvage-plan.json의 `/ttfv` 항목을 읽는다. 레이아웃 패턴은
`digest-today`의 한 메시지·한 그래픽만 참고한다.

현재 결함을 그대로 두지 않는다:
- 현재 `TTFVScreen`은 prop을 받는 호출자가 없어서 항상 관계 별/“먼저 다가가는” 고정
  성향을 표시한다. 가입은 성향 질문을 받지 않으므로 이 문장을 사용자 사실처럼
  ratify하거나 first_light record로 쓰지 않는다.
- `/ttfv` mount만으로 `markTTFVSeen()`을 호출해 auth/loading/error에서도 기회를
  소모하지 않는다. 인증이 해결되고 실제 화면 상태를 표시한 뒤에만 seen을 기록한다.

실제 데이터 계약:
- `useAuth` loading과 signed-out `/sign-in` redirect를 명시한다.
- `listRecentRecords(userId, ...)` 또는 같은 owner-filtered reader에서 실제 최신 기록 한
  건만 읽는다. stale user 전환, timeout, unmount update를 막는다.
- 실제 기록이 있으면 그 사용자가 쓴 짧은 excerpt와 기록 시각만 근거로 “이 기록이
  지금의 나를 보여주는가”를 묻는다. 새로운 성향·관계·별 등급을 추론하지 않는다.
- 기록이 없으면 가짜 insight를 만들지 않고 한 메시지 empty state와 실제 `/capture`
  action을 보여준다. load failure는 empty와 구분하고 retry를 제공한다.
- “맞아요”와 “조금 달라요”는 모두 사용자의 실제 선택으로만 first_light 기록을 남긴다.
  원문 전체나 비밀 값을 로그·analytics·accessibility label에 복사하지 않는다.
- 저장 성공 전 “별이 밝아졌다” 완료 상태를 표시하지 않는다. 저장 실패 시 입력 선택을
  유지하고 retry 가능한 오류를 보여준다. 현재처럼 fire-and-forget catch로 실패를
  삼키지 않는다.
- 새 일곱은 `seven-stars.ts` 정본이다. 레퍼런스의 관계 별 또는 옛 심리 구인을
  되살리지 않는다. 첫날 UI에서 특정 L1→L2를 단정하지 않는다.

구현:
- `/ttfv` route와 `TTFVScreen`을 분리한 구조는 유지한다. 필요한 데이터 adapter와 pure
  state helper는 작은 별도 파일로 둘 수 있지만 총 5파일을 넘지 않는다.
- `PixelSurface`, `PixelPressable`, `PixelGlyph`, `PixelStarSvg`와 토큰만 사용한다.
  raw `Pressable`, circle node, rounded pill, 정적 opacity, blur, gradient를 제거한다.
- 다섯 UI locale 모두를 보존한다. 새 copy가 불가피하면 한 화면 전용 typed copy map을
  사용해 5개 언어를 모두 제공하고 KO/EN 두 언어만 넣은 임시 map은 만들지 않는다.
- 390×820에서 actual excerpt가 길어도 줄 수 제한과 disclosure로 한 화면 한 메시지를
  지킨다. touch target은 44dp 이상이다.

테스트:
- auth loading/redirect와 seen 기록 시점
- actual latest owner record, stale user guard, timeout
- real record / honest empty / load error 세 상태
- excerpt 외 성향·관계·L1→L2 fixture 부재
- affirm/soft 저장 성공, 저장 실패 retry, no fire-and-forget swallow
- `/capture`, `/` 실제 목적지
- 원문 전체의 log/a11y/analytics 비노출
- Pixel/Fabric/44dp/i18n 5-locale 계약
- targeted Jest, 대상 ESLint, type-check, pixel rules, constraints, cycles,
  portable handoff, 전체 verify

390×820 캡처는 실제 QA 계정의 현재 상태를 그대로 사용한다. 기록이 없으면 empty state를
정직하게 캡처하고 fixture를 seed하지 않는다. 캡처 중 affirm/soft/save를 누르지 않는다.
Android HUMAN은 pending이다.
```

## 3. `/audit` — 옛 시기표 대신 새 일곱 별의 실제 근거·변경 이력

```text
`codex/pixel-clay-shared-260831` exact head `60ae8f90`에서 저장소 내부 worktree와
`codex/pixel-clay-audit-260831` branch를 만들고 `/audit`의 deep-space 화면 하나만
재설계하라. legacy 질문 flow와 styles는 그대로 보존하고 한 Draft PR만 만든다.

먼저 CLAUDE.md, docs/PRD.md, docs/CONCEPT.md,
design/pixel_clay_260825/data/salvage-plan.json의 `audit`, `audit-full`, `/audit` 항목,
`src/lib/persona/seven-stars.ts`, `src/lib/persona/seven-tier-history.ts`,
`src/lib/persona/load-tier-observations.ts`, `src/lib/persona/brightness-timeline.ts`를 읽는다.

레퍼런스 audit/audit-full의 13–18, 19–28 ERAS, 고정 vividness, 고정 응답 수는 이식
금지다. 현재 `PastMeErasView`의 navigation-only 시기 목록도 이 화면의 최종 목적이
아니다. deep-space `/audit`은 새 일곱 별의 실제 provenance 허브로 만든다.

실제 데이터 계약:
- useAuth loading, signed-out `/sign-in`, incomplete profile `/complete-profile` 경계를
  deep renderer에도 유지한다.
- `star_tier_history`를 explicit `user_id`로 읽고 `parseTierKey()`가 인정한 `seven:*`
  행만 사용한다. 옛 심리 축의 같은 id를 절대 합치지 않는다.
- read timeout, error, empty를 구분한다. Supabase/RLS 오류를 “기록 없음”으로 말하지
  않는다. stale user/unmount result를 폐기한다.
- 각 새 일곱 별은 실제 최신 level, 실제 관측 수, 실제 citation 수, 최신 recorded_at,
  actual origin만 표시한다. 없는 값은 없음으로 두고 7별 모두 L값을 채우지 않는다.
- citation 내용이나 record id를 화면·로그에 노출하지 않고 개수만 표시한다.
- 한 번에 한 별만 펼치는 disclosure를 사용한다. 해당 시기 별에 실제 interview period가
  있을 때만 `/interview?period=<real period>`로 연결한다. 전체 변경 이력은 기존
  `/ratifications`, 밝기 변화는 `/brightness`로 연결해 기능을 복제하지 않는다.
- profile/아직 살지 않은 시기/데이터 없는 별을 fake CTA나 고정 결과로 꾸미지 않는다.

구현:
- `AuditLegacy`와 legacy styles는 시각·기능 모두 불변으로 둔다. 새
  `src/screens/deepspace/dds-audit-screen.tsx`를 만들고 `AuditDeepSpace`만 위임한다.
- 가능하면 기존 `home:ds.audit`, `home:ds.star.*`, `brightness:*`,
  `ratifications:*`, `common:*`의 5-locale copy를 재사용한다. inline KO/EN fixture copy를
  만들지 않는다.
- `PixelSurface`, `PixelPressable`, `PixelGlyph`, token colors만 사용한다. radius 0,
  4방향 bevel, integer rect, no static opacity/blur/gradient, 44dp, fullWidth와
  accessibility expanded/link state를 지킨다.
- `DeepSpaceViews.tsx` 거대 파일의 `PastMeErasView`를 확장하지 않는다. 다른 caller가
  있으므로 삭제하지도 않는다.

테스트:
- auth loading, signed-out, incomplete-profile 경계
- owner-filtered query, timeout/error/empty/stale guard
- `seven:*`만 포함하고 legacy ids를 배제
- 실제 latest level/observation/citation/date/origin 집계
- citation id/body 비노출
- 한 번에 한 disclosure, `/ratifications`, `/brightness`, 유효 period의 `/interview`
- 13–18/19–28, AUDIT_ERAS, fixed level/count, `PastMeErasView` route 사용 부재
- legacy renderer/style 불변
- Pixel/Fabric/44dp/accessibility 계약
- targeted Jest, 대상 ESLint, type-check, pixel rules, constraints, cycles,
  portable handoff, 전체 verify

390×820 캡처는 QA 계정의 실제 seven:* history가 있으면 그 상태, 없으면 honest empty를
그대로 남긴다. interview/ratifications/brightness action은 누르지 않는다. Android
HUMAN은 pending이다.
```

## 병합·검증 순서

세 화면은 서로 독립이며 모두 shared primitives PR #1515 위에 쌓는다. 병합은
`#1515 → onboarding → ttfv → audit` 순서를 권장한다. 단, 각 화면은 다른 화면 branch를
base로 삼지 않는다.

이 묶음의 핵심은 고아 화면을 새 route로 늘리는 것이 아니다.

- `dobgate` → 실제 가입 경계를 미리 설명하는 onboarding handoff
- `ttfv` → 실제 첫 기록이 있을 때만 작동하는 첫날 검토
- `audit`/`audit-full` → 옛 시기표를 폐기하고 새 일곱 별의 실제 provenance 허브

자동 검증이 모두 초록이어도 Android 폰트·TalkBack·Back·키보드·터치는 사람이 확인할
때까지 `PENDING`이다.
