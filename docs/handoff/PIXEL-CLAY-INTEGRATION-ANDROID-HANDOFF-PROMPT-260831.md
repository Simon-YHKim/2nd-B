# PIXEL-CLAY 통합·Android QA 실행 프롬프트

작성일: 2026-08-31 KST

대상: PIXEL-CLAY salvage Draft PR #1507~#1542

이 문서는 화면별 구현이 끝난 뒤의 **통합 담당자용 실행 계약**이다. 현재 36개 PR은
코드와 CI 기준으로 green이지만 서로 독립된 base에서 만들어졌으므로, 이 문서를 근거로
한 번에 병합하면 안 된다. 최신 `main`에 한 PR씩 직렬로 합치고, 충돌을 의미 단위로
통합하며, final integrated SHA에서 Android HUMAN QA까지 끝내는 것이 목표다.

## 0. 권한 게이트와 비목표

아래 준비·감사·로컬 검증은 바로 수행할 수 있다. 그러나 다음 작업은 사용자의 명시적
승인을 받은 뒤에만 수행한다.

- Draft를 Ready로 바꾸기
- PR base retarget
- PR merge
- 기존 원격 branch에 통합 commit push

절대 하지 않는다.

- `main` 직접 편집 또는 push
- force push, rebase, branch 삭제, history rewrite
- 충돌 파일 전체를 `ours` 또는 `theirs`로 선택
- green check만 보고 여러 PR을 동시에 merge
- 기존 web 캡처를 Android/HUMAN PASS로 보고
- 공용 QA 계정에 설문 답변, 기록, 업로드, 구매, 비밀번호/DOB 변경, 삭제/export 실행
- 사용자 데이터, 원응답, record/user ID, body, citation, raw DB error를 로그·스크린샷·보고서에 기록

## 1. 시작 전 정본과 저장소 확인

반드시 다음 파일을 완독한다.

- `CLAUDE.md`
- `docs/HANDOFF.md`
- `docs/PIXEL-CLAY-MIGRATION.md`
- `design/pixel_clay_v4/REPO-NOTES.md`
- `ANDROID_QA_GUIDELINES.md`
- `docs/SESSION-OWNERSHIP.md`
- `docs/CONSTRAINTS.md`

정본 checkout은 `E:\2ndB`, 작업용 worktree는 반드시
`E:\2ndB\.worktrees\<name>` 아래에 둔다. 정본 `main`을 직접 편집하지 않는다.

시작 시 아래를 기록한다.

```powershell
cd E:\2ndB
git fetch origin
git rev-parse origin/main
git status --short --branch
gh pr list --repo Simon-YHKim/2nd-B --state open `
  --json number,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup
```

2026-08-31 12:55 KST 감사 시점의 `origin/main`은
`5b6bbe71ab1c723ff85d93268dfd0679e6085207`였다. 이 값은 기준 기록일 뿐 고정 base가
아니다. 작업 시작 시 최신 `origin/main`을 다시 사용한다.

## 2. head-drift 무관용 게이트

이 문서를 담는 #1507은 문서 commit 자체로 head가 바뀌므로 self-referential SHA를 고정할
수 없다. #1507은 작업 시작 시 `gh pr view 1507 --json headRefOid`로 동적으로 확인한다.
아래는 구현 PR #1508~#1542의 감사 시점 exact head다.

```text
#1508 8e526e49ab2e0046054e6cedba458d43a3f9ffd4
#1509 03aa838ed17c4d06c8f981d4bc34a8e0d7a7c51f
#1510 8e985fe9c021d1b477303f25213e1880555c68ec
#1511 252f1d51a68f666f63136251ede17d7058a567eb
#1512 10760fd583dd3ee8a5a3f56365bb3094308a7054
#1513 fb02c7e643abecbef55946e102c9d2231ec7be32
#1514 98629478bc9c9d1394d5898d2b64a1b9b7e8b0e8
#1515 60ae8f90bdbb8e7e40ab4f94b29ee8c8224d9fe7
#1516 d63d59cd2e89ad4ed391205f153334218fb2436e
#1517 c04e7739620d81d318c5f0d58de3ce4ab65a35ad
#1518 f4bbfd22f3e5aa7aaca00ef83bf40ca998bfffc1
#1519 ec458d57b046e718e33e4e0b6b803312ec2efb07
#1520 f29c2f58182ef830c29e60e0c8d82f1f7b104e03
#1521 314cbb59065abecb1db0a97204fd59585090205e
#1522 6808568e70ab7faa32d8a12cb9ea1da2d2aa43f5
#1523 e5ff11733fa4238e9cdcebfca95c29226e2bb6c6
#1524 5fb694ce3a3452a23a3b4e50c197697879846d17
#1525 8e123a515f25730d600dc676e490ada9aba4576b
#1526 00ca1bb317786a2c2819c8cf5d35ce6184931c4d
#1527 c5588d0d480609193903dbbf16d303951661953b
#1528 d1704e2883fe2f73dd784d9c5bcc7e4ec8e90cf5
#1529 2fd27e6873a690ea18097c191854541070722b04
#1530 d06ee50ba53616fd6df590347b0aae08095c2a92
#1531 0036dff2d56084dc684eb70bf3d85c105a0adba5
#1532 6cf1f422eea2714875ce1afcc2c58c15948d73a1
#1533 bfd9ce7a08334b683a19bb433f07a57ec7eccc3d
#1534 dcf66b61828517c25399ca8b1f1da1a1a408330f
#1535 67d5d29bd00270769b4ba64f88b3da3550cf1a3c
#1536 922112325bdf5d7a09eb9366dd5ca0b3849d493e
#1537 dc5eb84f97d3df1bfe9684c944b1374ff0dda37f
#1538 c695ebe30b66d1da8aa9c09eb9b008d61f41f746
#1539 091d0090f6b655dec12729e3bfd0a68aa1dbb4b4
#1540 b0ddb259a1393c090789abfad371aace8539ffb7
#1541 e0eb62c5fc416f92e62dd6a48db38f807845434c
#1542 b43bcd6652b08ff0baaa72214ad7ff4803ca42ec
```

감사 당시 #1507의 이전 head는 `68a8e488933d822d99830da8a3e51bd828a0192d`였고,
36개 모두 `OPEN + Draft + MERGEABLE/CLEAN`, 실패·대기 check 0이었다. #1507은 이 문서가
추가된 현재 remote head와 green check를 새 기준으로 기록한다. #1508~#1542 중 어느
head라도 달라졌거나 check가 실패·대기·취소 상태이면 그 PR은 멈추고 새 diff와 증거를 다시
감사한다. 과거 캡처와 검증 수치를 새 head에 재사용하지 않는다.

## 3. 의존 DAG와 직렬 순서

```text
main ─┬─ #1508 ─ #1509
      ├─ #1515 ─┬─ #1517, #1518, #1523, #1524, #1529…#1541 ─ #1542
      │          └─ #1522 ─ #1526, #1527, #1528
      └─ 나머지 main-based PR
```

아래 순서를 지킨다. 쉼표로 묶인 항목도 동시에 처리하지 말고 한 개씩 최신 `main`과
통합하고 remote CI까지 확인한 후 다음으로 간다.

1. #1507
2. #1508 → 최신 main을 child에 normal merge → #1509 base를 main으로 retarget → #1509
3. #1515
4. #1512 → #1513 → #1514 → #1520 → #1525
5. #1510 → #1511 → #1516
6. #1519 → #1532
7. #1521 → #1535
8. #1517 → #1533
9. #1518
10. #1522 → #1526 → #1527 → #1528
11. #1523 → #1524 → #1529 → #1530 → #1531 → #1534 → #1536 → #1537 → #1538 → #1539 → #1540 → #1541
12. #1541 → #1542
13. final integrated SHA에서 전체 검증과 Android HUMAN QA

부모 PR #1508, #1515, #1522는 가능하면 repository가 허용하는 **merge commit**으로
합친다. repository가 squash-only이면 child를 곧바로 retarget하지 않는다. 먼저 child
branch에 최신 `origin/main`을 `--no-ff` normal merge하고 push한 뒤 base를 main으로
바꾼다. 이 절차는 parent diff가 child에 다시 나타나는 것을 막는다. parent branch는 모든
child retarget이 끝날 때까지 삭제하지 않는다.

## 4. PR 하나를 통합하는 반복 절차

아래 명령은 사용자에게 merge·retarget 승인을 받은 뒤에만 실행한다.

```powershell
cd E:\2ndB
git fetch origin

$Pr = 1517
$HeadBranch = gh pr view $Pr --repo Simon-YHKim/2nd-B `
  --json headRefName --jq .headRefName
$ExpectedHead = gh pr view $Pr --repo Simon-YHKim/2nd-B `
  --json headRefOid --jq .headRefOid
$Worktree = "E:\2ndB\.worktrees\integrate-pr-$Pr-260831"

git worktree add $Worktree -b "codex/integrate-pr-$Pr-260831" "origin/$HeadBranch"
git -C $Worktree rev-parse HEAD
git -C $Worktree status --short --branch
git -C $Worktree merge --no-ff origin/main
```

충돌은 다음 절의 union 계약대로 수동으로 푼다. 해결 뒤에는 최소 아래를 실행한다.

```powershell
npm --prefix $Worktree run check:pixel-rules
npm --prefix $Worktree run check:cycles
npm --prefix $Worktree run type-check
npm --prefix $Worktree run verify
node "$Worktree\scripts\verify-portable-handoff.mjs"
git -C $Worktree diff --check
git -C $Worktree status --short
```

diff, staged secret, `.env*`, 불필요 생성물, 사용자 데이터 포함 여부를 수동 감사한다. 모든
검증이 통과한 뒤에만 승인 범위 안에서 기존 PR head branch로 push하고 base를 바꾼다.

```powershell
git -C $Worktree push origin "HEAD:$HeadBranch"
gh pr edit $Pr --repo Simon-YHKim/2nd-B --base main
gh pr checks $Pr --repo Simon-YHKim/2nd-B --watch
gh pr view $Pr --repo Simon-YHKim/2nd-B `
  --json headRefOid,baseRefName,isDraft,mergeable,mergeStateStatus,statusCheckRollup
```

실제 Ready 전환과 merge는 별도 사용자 승인 뒤에만 한다. 다음 PR로 가기 전에 다시
`git fetch origin`으로 최신 main을 받는다.

## 5. 충돌·의미 회귀 union 계약

### `design/pixel_clay_260825/data/app-routes.json`

#1509와 #1517 사이에 실제 conflict marker 1개가 재현된다. `profilesetup`과 `pwreset`을
둘 다 mapped 화면으로 보존하고, 각각에 대응하던 기존 unmapped 항목을 둘 다 제거한다.
한쪽 route만 남기지 않는다. 해결 뒤 `npm run check:design-ref`와
`npm run test:ui-work0`을 실행한다.

### `PixelPressable.tsx`와 pixel primitive tests

#1515와 #1521 사이에 2파일·4 marker가 재현된다. 다음을 모두 보존한다.

- #1515: `background`, `rootStyle`, `fullWidth`, gate shell 및 primitive 계약 테스트
- #1521: switch `accessibilityRole`, checked state 전달, RecordsGraph assertions

prop 타입은 하나로 통일하고 중복 선언하지 않는다. focused primitive/RecordsGraph 테스트와
full verify를 모두 실행한다.

### `scripts/check-pixel-rules.ts`

이 파일은 14개 PR(#1510, #1516, #1522, #1523, #1524, #1526, #1527, #1530,
#1535, #1536, #1537, #1538, #1539, #1541)이 수정한다.

MIGRATED union에는 최소 account, profile, manual, data, change-password, record-detail,
inbox, sign-up, big-five를 모두 남긴다. 독립 감소분의 단순 합은 `165 → 158`처럼 보이지만
**158을 하드코딩하지 않는다.** 통합 source에서 `npm run check:pixel-rules`가 보고한 실제
값으로만 baseline을 낮춘다. 이전 통합 baseline보다 빚이 늘면 baseline을 올리지 말고
회귀로 중단한다.

### records extraction

#1521과 #1535를 primitives ancestry까지 포함해 합치면 3 section·5 marker가 재현된다.
#1515와 #1521을 먼저 통합한 다음, `dds-wiki-records-screens.tsx`의 #1521 safe graph,
imports, styles를 유지하고 #1535 record-detail renderer만 새 파일로 추출해 re-export한다.
`records-import-integrity`, `records-source-detail-route`, `get-piece` focused tests를 실행한다.

### 현재 marker 0이지만 의미 검증이 필요한 조합

- #1510 ↔ #1511 `DeepSpaceDesignScreens.tsx`: review와 integrations 영역·imports·styles를 모두 유지
- #1519 ↔ #1532 `capture.tsx`: #1519 `header="none"`과 #1532 life-area intents를 모두 유지
- #1517 ↔ #1527 `tabs.ts`: `/reset-password` hidden-back과 `/change-password` dock를 모두 유지
- #1517 ↔ #1533 `dds-auth-screens.tsx`: reset-password 구현과 sign-in 분리 re-export를 모두 유지

#1517은 17파일, #1521은 6파일을 바꾼다. 둘은 다른 화면과 묶지 말고 각각 독립된 통합
체크포인트로 처리한다.

## 6. Big Five false-positive 테스트 부채

#1541 head `e0eb62c5fc416f92e62dd6a48db38f807845434c`의 전체 검증은
557/557 suites, 6005/6005 tests로 통과했다. 그러나
`src/lib/persona/__tests__/loader-error-contract.test.ts`는 아직
`src/app/big-five.tsx`에서 `setHasError(true)` 문자열을 찾는다. renderer가 이동한 뒤 app에
남긴 migration-history marker 때문에 이 source-shape test가 false-positive로 통과하는
상태다.

#1541을 최신 main에 통합한 뒤, final Android QA 전에 별도 작은 Draft PR에서 다음을 한다.

1. `loader-error-contract`가 live `dds-big-five-screen.tsx`와
   `big-five-screen.ts`의 실제 error·timeout 동작을 검증하도록 바꾼다.
2. `app/big-five.tsx`의 migration marker 주석을 제거한다.
3. `big-five-canon`, `loader-error-contract`, `survey-back-guard`를 실행한다.
4. full `npm run verify`, portable handoff, diff/secret audit, remote CI를 다시 통과시킨다.

기존 6005/6005 PASS를 거짓이라고 보고할 필요는 없지만, 이 정적 계약 부채가 제거되기
전에는 final integration이 끝났다고 말하지 않는다.

이 후속 작업은 #1542 head `b43bcd6652b08ff0baaa72214ad7ff4803ca42ec`에서 완료됐다.
marker-only 제거가 기존 계약을 17/18 실패로 정확히 재현했고, live loader의 error·timeout과
DDS retry 소비를 실행하는 계약으로 교체한 뒤 focused 3 suites/77 tests와 full
557/557 suites, 6006/6006 tests를 통과했다. 통합 시 #1542를 #1541 직후 적용하고 새 head를
다시 검증한다.

## 7. 새 head 시각 증거

충돌 해결이나 최신 main merge로 PR head가 바뀌면 기존 캡처는 더 이상 그 head의 증거가
아니다. exact remote head를 export/attest한 뒤 새 390×820 web 캡처를 만든다.

- sign-up: fresh signed-out, 입력·동의·submit·OAuth·navigation 0
- ratifications: aggregate state만, row/body/ID/citation 비공개
- Big Five: aggregate 5-trait lens만, 원응답·user/record ID 비공개; Retake/Start/Add Data/
  Other Frameworks/retry/navigation/save 0
- record detail: body·ID·citation이 보이면 이미지를 공유하지 않는다
- plans: sandbox와 명시 승인 없이는 purchase/payment overlay를 열지 않는다

각 증거에는 exact head, PNG/report/receipt/export SHA-256, viewport, browser, request/response,
failed request, HTTP/console/page error, target click/input/navigation/mutation 수를 남긴다.
web 증거는 시각 QA이며 Android/HUMAN PASS가 아니다.

## 8. Android HUMAN QA matrix

final integrated SHA에서 `npm run android`로 실제 emulator/device cold launch를 한다.
가능하면 API 33과 API 35, 정상 폭과 320dp, font scale 1.0과 1.3~1.5, TalkBack off/on,
light/dark를 조합한다. 결과마다 final SHA, device, API, viewport, font scale만 기록하고
logcat·스크린샷에 사용자 데이터나 raw body를 남기지 않는다.

| 묶음 | 화면 | HUMAN 확인 항목 |
|---|---|---|
| 공통 shell | #1515 및 모든 pixel 화면 | 44dp touch, 계단식 press, bevel/elevation, overflow 그림자 절단·shine-through, dock/inset 하단 가림 |
| auth/forms | complete-profile, sign-in/up, reset/change-password, onboarding, profile/details/account/data | IME padding, next/done focus, 긴 KO/EN label, busy/disabled, hardware Back/modal, owner 전환. recovery/password/DOB/delete/export는 전용 fixture 없이는 실행 금지 |
| capture/media | call-reflection, capture, capture-full | header 1개, life-area open/close와 Back, mode 전환, keyboard, Android 13+ picker permission, background/resume. 공용 QA 저장·업로드 금지 |
| records/large data | records, record detail, inbox, museum, audit | FlatList/OOM·scroll, SVG graph frame, source/detail route, dock inset, delete confirm까지만. aggregate evidence만 허용 |
| insight | review, rest, people, ttfv, beyond, ratifications, Big Five | loading/error/timeout/empty/ready, retry, owner isolation, system Back, reduced motion, TalkBack reading order/state |
| utilities | not-found, settings, manual, integrations, ops | back target, focus order, long-text reflow, integrations가 fake connected state를 만들지 않음 |
| commerce | plans | 가격·주기·CTA·Back, 320dp reflow. sandbox와 명시 승인 없이는 purchase 금지 |

특히 Big Five에서 반드시 사람이 확인한다.

- saved/error 상태의 실제 TalkBack 동적 announcement
- 320dp + 큰 글꼴에서 progress head, scale legend, 가로 error row의 wrap/shrink
- pager, exit confirm/cancel, dirty/submitting/saved hardware Back
- reduced motion에서도 saved content가 보이고 timer/listener cleanup이 유지되는지
- 실제 QA 계정의 current lens가 다른 owner의 trait를 첫 paint에 노출하지 않는지

Android/HUMAN에서 아직 실행하지 않은 항목, 기기 부족, fixture 부재는 `미실행`으로 적는다.
소스 테스트나 web 캡처 통과를 근거로 PASS로 바꾸지 않는다.

### 2026-08-31 API 36 선행 smoke 증거

최신 36개 head를 로컬에서 순서대로 합친 integration SHA
`26f2f5ca4f57c6e4dbda3e1f355742a09e1613a1`에서 다음 선행 검증까지 완료됐다.
이 기록은 최종 merge나 전체 HUMAN matrix 완료를 뜻하지 않는다.

- `npm run verify`: 584/584 suites, 6342/6342 tests PASS
- PR #1517 Android 첫 렌더 차단 결함은 head
  `c04e7739620d81d318c5f0d58de3ce4ab65a35ad`에서 RN-safe storage event 구독으로 수정됨
- API 36 Google APIs x86_64, Pixel 7 Pro 프로필, dark, font scale 1.0에서 cold launch와
  signed-out `/sign-in`, `/dev-screens`, `/sign-up`, `/onboarding`, `/manual`,
  `/integrations`, `/plans` redirect, `/capture-full` redirect, not-found를 실제 렌더함
- 같은 폐기형 AVD와 공용 QA 계정으로 서버 쓰기 없이 `/`, `/big-five`, `/people`,
  `/settings`, `/plans`, `/capture-full`, `/dev-screens`를 읽기 전용으로 실제 렌더함
- 위 각 route 전환 뒤 새 `ReactNativeJS:E`와 `AndroidRuntime:E`는 관측되지 않음
- 온보딩 완료·coachmark 숨김은 폐기형 AVD의 AsyncStorage에만 기록됐고, 설문·record·업로드·
  profile·DOB·비밀번호·결제·export·delete 서버 쓰기는 실행하지 않음

여전히 미실행인 항목은 API 33/35, 320dp, font scale 1.3~1.5, TalkBack, light mode,
IME·picker·background/resume, 모든 화면의 전체 HUMAN interaction matrix다. 최종 통합 담당자는
이 선행 smoke를 재사용해 해당 항목을 PASS로 올리지 말고 final merged SHA에서 다시 수행한다.

## 9. 완료 기준과 보고 형식

완료 조건은 다음과 같다.

1. 의존 DAG 순서대로 모든 PR이 최신 main과 직렬 통합됐다.
2. 실제 conflict와 marker 없는 의미 회귀 지점을 union 계약대로 보존했다.
3. Big Five stale source-shape test debt가 별도 Draft PR로 제거됐다.
4. 각 변경 head의 focused test, pixel rules, cycles, type-check, full verify, portable handoff,
   diff/secret audit, remote required checks가 통과했다.
5. 바뀐 head의 web evidence를 새로 만들었다.
6. final integrated SHA에서 Android HUMAN QA를 수행하고 PASS/FAIL/미실행을 분리했다.
7. Ready/merge는 사용자의 별도 승인 뒤에만 했다.

최종 보고 표에는 PR 번호, final head, base, Draft/Ready, merge state, remote checks,
충돌 해결 내용, full verify 수치, 새 evidence SHA를 넣는다. Android 표에는 device/API/
viewport/font scale/TalkBack별 PASS·FAIL·미실행과 재현 경로를 넣는다. 실패한 검증,
Android 미실행, 개인정보 때문에 공유하지 않은 증거, 롤백 방법을 마지막에 명시한다.

핵심 판단: 지금 36개 Draft가 모두 green인 것은 **통합을 시작할 준비가 됐다**는 뜻이지,
이미 최종 앱에 합쳐졌거나 Android에서 검증됐다는 뜻이 아니다. 직렬 retarget·의미 충돌
해결·Big Five 테스트 부채 제거·final Android HUMAN 증거가 끝난 뒤 Ready/merge 여부를
결정한다.
