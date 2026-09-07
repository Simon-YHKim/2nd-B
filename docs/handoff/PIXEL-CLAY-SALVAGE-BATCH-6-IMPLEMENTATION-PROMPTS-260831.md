# PIXEL-CLAY salvage batch 6 — implementation prompts

작성일: 2026-08-31 KST

대상: `/plans` → `/museum` → `/inbox`
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

- 캡처의 계층·밀도·카드 배치만 참고한다. 캡처의 고정 요금 상태, 알림, 개수, 시각,
  기록, 사용자 상태는 fixture이므로 이식하지 않는다.
- mount나 시각 QA만으로 구매, 복원, 보상 광고, 저장, 동의, 외부 링크, 권한 요청,
  라우트 이동을 실행하지 않는다.
- auth loading, signed-out, profile probing/failure/incomplete, owner switch, unmount를 각각
  정직하게 다룬다. read error/timeout을 empty나 disabled로 말하지 않는다.
- `PixelSurface`, `PixelPressable`, `PixelGlyph`, `PixelGateShell`과 `m3.*` token을 우선한다.
  radius 0, 네 방향 bevel, integer rect, no blur/gradient/static alpha, 44dp, full-width 및
  접근성 state를 지킨다.
- 기존 legacy renderer와 그 styles가 있는 화면은 byte-stable하게 보존한다. deep-space
  renderer만 교체한다.
- inline KO/EN 임시 문구를 만들지 않는다. 기존 5-locale key를 우선하고, 새 문구가
  불가피하면 5 locale parity와 typed contract를 같은 PR에서 지킨다.
- `scripts/check-pixel-rules.ts`는 해당 PR의 실제 감소분만 반영한다. 다른 독립 PR을
  병합한 뒤에는 누적 baseline을 재계산한다.
- targeted Jest, 대상 ESLint, type-check, pixel rules, constraints, cycles, portable handoff,
  전체 `npm run verify`, diff/secret scan을 통과한 뒤에만 push와 Draft PR을 만든다.
- 웹 390×820 증거는 exact remote head를 export/attest한 뒤 남긴다. 웹 캡처는 시각 증거일
  뿐 Android HUMAN PASS가 아니다.

## 1. `/plans` — 실제 결제 가능성과 현재 tier를 과장하지 않는 요금제

```text
`codex/pixel-gate-primitives-260831` exact head
`60ae8f90bdbb8e7e40ab4f94b29ee8c8224d9fe7`에서 저장소 내부 worktree
`.worktrees/codex/pixel-clay-plans-260831`, branch `codex/pixel-clay-plans-260831`를 만들고
deep-space `/plans` 화면 하나만 PIXEL-CLAY v4로 옮겨라. `PlansLegacy`와 legacy styles는
불변으로 두고 한 Draft PR만 만든다. 수정 파일은 최대 5개다.

추가로 먼저 읽는다:

- `src/app/plans.tsx`
- `src/screens/deepspace/dds-plans-screen.tsx`
- `src/lib/entitlements/tiers.ts`
- `src/lib/progression/pricing.ts`
- `src/lib/progression/useProgression.ts`
- `src/lib/payments/purchases.ts`
- `src/lib/billing/paddle-checkout.ts`
- `src/lib/ads/policy.ts`
- `src/components/deepspace/RewardedSheet.tsx`
- `src/lib/supabase/privacy.ts`
- `locales/*/plans.json`, `locales/*/deepspace.json`

레퍼런스 `plans`의 정직성 안내 → tier 카드 → 현재 요금제 → 기능 목록 → 명시적 CTA
계층은 direct하게 참고한다. 고정 `₩6,900/월`, 고정 `이용 중`, 임의 무료 한도와 준비되지
않은 tier는 이식 금지다. 가격은 오직 `TIER_PRICE_KRW`와 `TIER_PRICE_KRW_YEARLY`, 현재
tier는 DB authority를 읽는 `useProgression` 결과만 사용한다.

구조와 read 계약:

- 가능하면 현 `dds-plans-screen.tsx` 안의 데이터·결제 controller를 유지하고 renderer만
  작은 PIXEL-CLAY component로 분리한다. 결제 rail을 재구현하거나 별도 tier state를 만들지
  않는다.
- `DeepSpaceScreen active="lens" variant="windowed"`의 실제 chrome과 back 계약을 유지한다.
- auth loading, signed-out `/sign-in`, profile probing/failure/incomplete 경계를 명시한다.
  `userId`, age tier, DB tier의 owner가 바뀌면 이전 offerings, prefs, usage 결과를 폐기한다.
- RevenueCat offerings, privacy prefs, reasoning usage의 loading/error/unavailable을 분리한다.
  prefs read 실패는 ads consent false로 fail closed하되 tier/store read error를 준비 중으로
  위장하지 않는다.
- free/plus/pro 카드와 기능은 실제 locale key만 사용한다. `PRO_COMING_SOON`, 실제 Paddle
  price id, 실제 RevenueCat package가 허용하는 action만 보인다.
- 구매 rail이 없으면 기존 `showStoreNotice` 계약처럼 정직한 안내와 `/support` route만
  제공한다. 실행 불가능한 가격 CTA를 enabled로 만들지 않는다.
- monthly/yearly segment는 그 cadence의 실제 price id와 charge package가 모두 맞을 때만
  표시한다. yearly 표시 가격으로 monthly package를 구매하는 경로가 없어야 한다.

비용·법적 interaction 계약:

- tier CTA 첫 탭은 terms modal만 연다. 금액·주기·해지 방법과 동의 checkbox를 확인한
  modal confirm만 `openPaddleCheckout` 또는 `purchasePackage`를 호출한다.
- busy 중 double-submit을 막는다. cancel, unavailable, error, purchased를 구분하고 client가
  entitlement를 직접 쓰지 않는다. 구매 후 `refreshTier`로 DB authority를 재조정한다.
- restore는 보이는 명시적 CTA 뒤에만 `restorePurchases`를 호출한다. mount, cadence 선택,
  card focus, visual QA에서 purchase/restore 0이다.
- 미성년 안내는 `isMinor === true`일 때만 실제 locale 문구로 보이고, unknown을 minor로
  추정하지 않는다. 기존 고지·환불·terms 링크를 제거하거나 약화하지 않는다.
- rewarded 진입은 `canShowRewardedAds`의 build flag, free tier, confirmed adult, ads consent,
  route allow-list를 모두 통과할 때만 보인다. 보상 credit은 실제 ad earned callback 뒤에만
  추가하고 실패를 성공처럼 닫지 않는다.
- email, payment token, receipt, checkout URL, user id를 visible error, log, analytics,
  accessibility label, snapshot에 넣지 않는다.

PIXEL/Fabric:

- 정직성·미성년·tier·store/error 표면은 `PixelSurface`, tier/restore/legal/terms action은
  `PixelPressable`, 기능 표시는 `PixelGlyph`로 구성한다.
- current/coming-soon은 pill 대신 square badge나 inset fact row로 표시한다. disabled/pressed를
  static opacity로 표현하지 않는다.
- tier name, price, current badge가 320dp에서 겹치지 않도록 세로 reflow한다. terms modal의
  checkbox와 두 action은 44dp, 작은 Android 화면과 keyboard/safe-area에서 잘리지 않는다.

테스트:

- auth/profile 경계, DB tier authority, owner switch stale guard
- offerings/prefs/usage loading·error·unavailable 분리와 prefs failure ads fail-closed
- 실제 SoT 가격·cadence·package 일치, pro coming-soon, rail 없는 CTA disabled
- mount/card focus/cadence 변경에서 purchase/restore/reward mutation 0
- terms 동의 전 purchase 0, confirm 뒤 올바른 rail 1, double-submit 방지
- purchase/restore 결과와 `refreshTier`, client entitlement write 0
- rewarded full gate와 earned callback 전 credit 0
- legal/refund/support 실제 route, 민감 결제 값 비노출
- legacy renderer/styles 불변, Pixel/Fabric/44dp/a11y/reflow와 exact pixel ratchet

390×820 QA는 실제 QA 계정의 현재 tier와 현재 환경의 store 가능 상태를 그대로 캡처한다.
tier CTA, cadence, terms, purchase, restore, rewarded, legal/support를 누르지 않는다. 가격이나
결제 가능 상태를 fixture로 덮지 않는다. Android 결제/HUMAN은 pending이다.
```

## 2. `/museum` — canon 역사만 담는 픽셀 타임라인

```text
공통 base exact head에서 저장소 내부 worktree
`.worktrees/codex/pixel-clay-museum-260831`, branch `codex/pixel-clay-museum-260831`를 만들고
`/museum` 화면 하나만 PIXEL-CLAY v4로 옮겨라. 이 route는 현재 deep-space 전용이므로
`MuseumTimelineScreen`의 실제 canon 데이터·선택·탐색 계약을 보존하고 한 Draft PR만 만든다.
수정 파일은 최대 5개다.

추가로 먼저 읽는다:

- `src/app/museum.tsx`
- `src/screens/deepspace/museum/MuseumTimelineScreen.tsx`
- `src/screens/deepspace/museum/museum-timeline-data.ts`
- `src/screens/deepspace/museum/__tests__/museum-canon.test.ts`
- `src/lib/canon/index.ts`와 museum canon source
- `locales/*/deepspace.json`의 `museum` keys

레퍼런스 `museum`의 두 lane, 연도 축, 사건 카드, 선택 detail, 관계선, 연도 scrubber 계층은
direct하게 참고한다. 캡처에 보이는 2022~2024 node만 전체 역사인 것처럼 줄이지 말고,
`canonMuseum.events + canonMuseum.extra`의 실제 43개 항목과 detail/ref 관계를 유지한다.

구조와 데이터 계약:

- `museum-timeline-data.ts`의 canon 변환, stable sort, lane, related id, reference mapping을
  화면 편의를 위해 복제하거나 축약하지 않는다. data 파일은 가능하면 byte-stable하게 둔다.
- 이 화면은 편집된 역사 콘텐츠다. 사용자 활동, 현재 기록, AI 분석 결과처럼 말하지 않는다.
  hardcoded editorial event는 허용되지만 canon 밖의 연도·사건·인용을 만들지 않는다.
- initial seek, horizontal timeline scroll, year readout, dial seek, node select/deselect,
  prev/next, related jump, close를 모두 유지한다.
- selected detail은 실제 canon title/body/detail/refs만 표시한다. detail이 없는 항목에 내용을
  합성하지 않고 honest summary만 쓴다.
- reference/related id가 missing이면 crash하거나 다른 항목으로 보내지 않고 해당 action을
  숨기거나 unavailable로 표시한다.
- 외부 reference는 사용자가 명시적으로 눌렀을 때만 기존 allowlisted URL opener를 사용한다.
  mount, scroll, select, visual QA에서 network/external open 0이다.
- 화면을 벗어나기 전 animation/gesture/async callback을 정리하고, 빠른 선택 전환에서 이전
  detail animation이 새 선택을 덮지 않게 한다.

PIXEL/Fabric:

- world/AI lane은 texture나 gradient가 아니라 token 기반 integer grid, dither, square rail로
  구분한다. 기존 `mzAlpha`, smooth shadow, rounded card, opacity fade 의존을 새 PIXEL-CLAY
  slice에서 제거한다.
- node, year marker, selected detail, ref/related row, prev/next/close를 `PixelSurface`,
  `PixelPressable`, `PixelGlyph`, `PixelDither`로 구성한다.
- timeline의 선과 node는 정수 좌표·두께로 그린다. 선택 상태는 border/fill/inset으로 나타내고
  static opacity로 의미를 숨기지 않는다.
- horizontal canvas 자체는 유지하되 title, close, detail action은 320dp/390dp에서 화면 밖으로
  밀리지 않는다. 44dp touch, screen-reader 순서, selected/expanded state를 제공한다.
- `prefers-reduced-motion` 또는 RN reduced-motion 상태에서는 detail 전환을 즉시 완료한다.
  seek-safe하지 않은 장식 animation 때문에 내용이 사라지지 않아야 한다.

테스트:

- canon 43개 및 lane/stable sort/detail/ref/related 무결성
- initial seek, dial bounds, node select/deselect, prev/next wrap or clamp 기존 계약
- related jump exact id, missing relation/ref fail closed
- mount/scroll/select에서 external open 0, explicit ref action 뒤 올바른 opener 1
- 빠른 selection/unmount stale animation guard와 reduced-motion
- canon 밖의 fixture event·가짜 사용자 상태 부재
- Pixel/Fabric/44dp/a11y/320dp reflow와 exact pixel ratchet

390×820 QA는 initial timeline과 실제 canon node 하나의 detail을 캡처할 수 있다. external
reference, related navigation, home CTA는 누르지 않는다. node 선택은 로컬 UI 상태 변경만
허용하며 네트워크·저장은 0이어야 한다. Android gesture/HUMAN은 pending이다.
```

## 3. `/inbox` — 샘플 알림 대신 실제 링크 제안·피어 응답

```text
공통 base exact head에서 저장소 내부 worktree
`.worktrees/codex/pixel-clay-inbox-260831`, branch `codex/pixel-clay-inbox-260831`를 만들고
deep-space `/inbox` 화면 하나만 PIXEL-CLAY v4로 옮겨라. `InboxLegacy`와 legacy styles,
같은 파일의 `DeepSpaceImportScreen` renderer/styles는 불변으로 두고 한 Draft PR만 만든다.
수정 파일은 최대 5개다.

추가로 먼저 읽는다:

- `src/app/inbox.tsx`
- `src/screens/deepspace/dds-import-inbox-screens.tsx`
- `src/lib/wiki/queries.ts`의 `listInferredLinkDetails`
- `src/lib/peer/invite.ts`의 `listPeerInvites`
- `src/lib/supabase/privacy.ts`
- `/digest`, `/peer-invites`의 실제 route와 owner/read contract
- `locales/*/deepspace.json`의 `inbox` keys

레퍼런스 `inbox`의 title → 알림 card → icon/title/body/time → 명시적 CTA 계층만
layout-only로 참고한다. 캡처의 `신뢰별 변화`, `주간 다이제스트`, `관계별 인터뷰`,
`정리함 8개`, 고정 시각과 개수는 fixture이므로 이식 금지다. 현재 앱에서 실제 signal
source는 pending inferred-link proposal과 responded peer invite뿐이다.

구조와 read 계약:

- 가능하면 새 `src/screens/deepspace/dds-inbox-screen.tsx`가 inbox만 소유하고,
  `dds-import-inbox-screens.tsx`는 inbox를 re-export한다. 같은 파일의 import renderer와 shared
  styles slice는 byte-stable하게 둔다.
- `DeepSpaceScreen active="lens" variant="windowed"`의 실제 chrome과 back 계약을 유지한다.
- auth loading, signed-out `/sign-in`, profile probing/failure/incomplete 경계를 명시한다.
- `listInferredLinkDetails(userId)`와 `listPeerInvites(userId)`는 explicit owner로 읽고 각각
  loading/error/timeout/empty/ready를 추적한다. owner switch·unmount stale result를 버린다.
- 현 구현처럼 두 read 모두 `.catch(() => [])`로 바꿔 전체 empty를 표시하지 않는다.
  한 source만 실패하면 성공한 실제 카드와 함께 부분 오류/retry를 보여 준다. 둘 다 genuine
  empty일 때만 `ds.inbox.empty`를 보여 준다.
- link proposal은 실제 pending/ratifiable 결과만 묶어 실제 count로 `/digest`에 보낸다.
  peer item은 실제 `responded_at`과 accepted/declined status를 만족하는 owner invite만 묶어
  실제 count로 `/peer-invites`에 보낸다.
- DB에 timestamp가 없으면 `방금`, `오늘`, `1시간 전`을 합성하지 않는다. timestamp가 있다면
  공용 locale formatter만 사용한다.
- read 결과 도착만으로 companion expression, analytics, seen/read 상태, notification
  acknowledgement를 쓰지 않는다. 이 PR에서 새 notification 저장소나 background poller를
  만들지 않는다.

interaction 계약:

- card와 CTA는 같은 실제 route로 가되 한 탭에 navigation 한 번만 발생한다. nested
  pressable 때문에 중복 push되지 않아야 한다.
- retry는 실패한 source만 같은 현재 owner로 다시 읽는다. retry 중 성공 카드가 사라지거나
  error가 empty로 바뀌지 않는다.
- mount, focus, scroll, visual QA에서 proposal ratify, peer mutation, LLM, seen/read mutation,
  route 이동 0이다.
- error/log/accessibility에는 invite token, peer identifier, raw citation, record/source body,
  user id를 넣지 않는다.

PIXEL/Fabric:

- feed item, partial error, empty/loading surface는 `PixelSurface`, CTA/retry는
  `PixelPressable`, signal icon은 `PixelGlyph`로 구성한다.
- item card 전체를 pressable로 만들 경우 내부 CTA를 별도 nested pressable로 중복시키지
  않는다. 한 action surface와 읽을 수 있는 route hint를 쓴다.
- count는 실제 값만 square badge나 본문에 표시한다. timestamp가 없으면 빈 정렬 칸도 만들지
  않는다.
- 320dp에서 title/count/action이 겹치지 않고 세로 reflow한다. 44dp, accessibility role,
  label, busy/retry 상태를 제공하며 static opacity/pill/smooth shadow를 쓰지 않는다.

테스트:

- auth/profile 경계와 두 query의 explicit owner filter
- 두 source 각각 loading/error/timeout/empty/ready, partial success, failed-source retry
- owner switch/id change/unmount stale guard
- 실제 proposal/responded invite filter와 count, fixture 4종·고정 시각 부재
- both-empty에서만 empty, read failure를 empty로 위장하지 않음
- mount/read/scroll에서 mutation·LLM·navigation·expression 0
- card/CTA 한 action당 exact route push 1, nested double-push 부재
- token/id/body/citation 비노출
- InboxLegacy와 DeepSpaceImportScreen renderer/styles 불변
- Pixel/Fabric/44dp/a11y/reflow와 exact pixel ratchet

390×820 QA는 실제 QA 계정의 현재 inbox를 읽기 전용으로 캡처한다. card, CTA, retry,
proposal, peer route를 누르지 않고 fixture를 seed하지 않는다. 실제 signal이 없으면 honest
empty만 캡처한다. Android HUMAN은 pending이다.
```

## 권장 진행·병합 순서

1. `/plans`
2. `/museum`
3. `/inbox`

세 PR 모두 shared primitives 위의 독립 branch다. 권장 병합 순서는 제품 우선순위일 뿐
branch stacking 지시가 아니다. 병합 때는 각 PR의 pixel ratchet 감소분을 누적 계산한다.

이 batch의 핵심은 레퍼런스의 완성된 모양을 복제하는 것이 아니다.

- `/plans`: 고정 가격·현재 상태를 실제 DB tier와 live purchase rail로 교체
- `/museum`: 일부 캡처를 canon 43개 전체와 실제 timeline interaction에 맞게 유지
- `/inbox`: canned notification을 실제 두 signal source와 정직한 partial-error 상태로 교체
