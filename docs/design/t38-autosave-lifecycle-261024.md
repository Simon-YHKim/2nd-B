# T38 F: 자동 저장 수명주기 휴면 준비 · G 재확인

기준: `3ca7a5c2` (2026-10-24, #2731 포함).
승인 범위: `DECISIONS.md` 26.10.20 14:20의 「T38 후속 준비 (추천)」,
뜻은 「화면 연결 H 전에 정할 것 중 휴면으로 할 수 있는 것만 · 앱 동작 그대로」다.
F의 근거는 [승인 설계 §10·§12](chat-session-registry-261015.md),
[controller 후속 연결 순서](chat-session-controller-261016.md),
[H 준비 인수](t38-hprep-dormant-261024.md)다. F 범위는 문서에서 확인됐다.

## 구현과 수명

`createChatSessionAutosave`는 새 휴면 파일 `src/lib/chat/session-autosave.ts`에 있다.
라이브 `autosave-session.ts`를 수정하거나 이 파일에서 새 부품을 re-export하지 않는다.
기존 `session-controller.subscribeCompletion`과 `session-keep.keepExchange`를 그대로 주입한다.
controller 자체 수정은 필요하지 않았다.

| 계기 | 동작 |
| --- | --- |
| 세션 생성 | 동의 unknown/OFF로 시작. privacy/account/registry/completion 구독을 한 번 설치. 명시적 `hydrate()`의 Promise를 재사용하므로 읽기도 한 번 |
| ON | registry의 `maxSequence + 1`을 저장. 화면 배열이 줄어도 허용 경계가 되감기지 않음 |
| 새 reply/red 완료 | 원 owner·epoch·content/session generation·exchange·prompt/reply ID를 확인. 질문 sequence가 grant 이후인 쌍만 새 prefs 읽기와 keep으로 진행 |
| 탭 detach/reattach | factory를 다시 만들거나 hydrate/완료 이벤트를 재생하지 않음. 기존 세션이 계속 소유 |
| OFF | 동기 signal abort. 실패한 OFF 쓰기·늦은 hydration·뒤따른 ON이 중단 작업을 자동 재개하지 않음 |
| 수동 저장과 경합 | prefs 읽기 중에는 keep work를 선점하지 않음. `cancelPendingConsent(exchangeId)` 뒤 별도 수동 명령 가능. 이미 keep 중이면 기존 single-flight·원 승인 유지 |
| 실패·삭제·재동의 | ExchangeId별 완료 시도 기록과 D1 tombstone 유지. 과거 작업을 재실행하지 않음. F는 수동 영수증을 수정하지 않음 |
| clear·새 문맥·계정 교체 | 원 세션이 무효가 되면 새 완료 수락·grant·구독 종료. 새 세션은 새 factory와 hydration을 가짐 |
| content wipe | grant와 새 작업을 닫음. 발행 전 prefs 읽기는 취소. 이미 발행된 쓰기의 signal/정산은 기존 ledger-backed keep이 소유 |

`session-registry.getNextSequence()`는 기존 단조 sequence 상한의 읽기 전용 API다.
`ChatAutosaveTicket.retainUntilSettled?()`는 선택 계약이다. 새 auto 작업을 실제 소유한
keep만 보유하고 실제 I/O finally에서 해제한다. manual 작업에 합류한 auto는 보유하지 않는다.
wipe에서 공개 keep 결과가 먼저 `stale`로 끝나도 OFF 구독은 실제 정산까지 유지된다.
그 사이 OFF나 owner hold는 계속 즉시 abort한다. abort는 서버 rollback 증거가 아니다.

## 라이브 불변 증거

이 PR 시점에 기준과 현재의 다음 Git blob이 **2/2 동일**했다(검토 시점 diff 로 확인). 영구 시험은 blob 을
고정하지 않는다: 고정하면 `secondb.tsx` 를 고치는 다른 PR(#2727 · H)이 무관하게 빨강이 된다(검토 1회차 medium).
대신 `session-autosave.test.ts` 가 `src/app` 의 모든 경로에서 정적 import 를 따라가 `session-autosave` 에
닿지 않음을 지킨다(앱 경로가 그 모듈을 import 하는 변이를 넣으면 빨강).

| 파일 | Git blob |
| --- | --- |
| `src/app/secondb.tsx` | `9b4cc2c82e79987d9922e285dbc2f5125edadb2a` |
| `src/lib/chat/autosave-session.ts` | `f13cc97761b781da7c1588933592bb76b5caad68` |

G의 두 파일, `session-controller.ts`, 동결된 인터뷰 범위, DECISIONS/HANDOFF도 diff 0이다.
스위치·로케일·의존성·스키마 변경은 없다.

`check:cycles`와 같은 madge 설정(type-only import 제외)으로 `src/app`의 테스트가 아닌
모듈 **112개**에서 닿는 **1,142개** 모듈을 추적했다. `session-autosave`, `session-keep`,
`session-registry`, `session-controller`에 닿는 경로는 각각 **0개**다.
화면 연결이나 singleton 생성은 없다. 이 결과는 정적 import 그래프의 증거다.

## G 판정: 확인된 사실

- [#2318](https://github.com/Simon-YHKim/2nd-B/pull/2318)은 조회 시 OPEN·미병합이다.
  계정 전환 가림 해제의 증명 조건을 바꾸던 초안이다. 해당 동결 코드를 가져오지 않았다.
- [#2382](https://github.com/Simon-YHKim/2nd-B/pull/2382)는 2026-10-13 15:48:39 KST에
  `bc6fec77e2f9a2b3e197fa2441a2493f2bee9104`로 머지됐고 이 기준 브랜치의 조상이다.
  결정 원문은 Q-261013-29 「계정이 바뀌면 앱이 스스로 다시 시작(먼저 폰에서 되는지 확인)」다.
  `DECISIONS-2026-10-13.md` 14:49 기록도 #2318의 기존 접근을 접는다고 명시한다.
- 현재 `_layout.tsx`의 `PendingAccountTransitionResolver`는 auth 화면 밖에서
  `isAccountNavigationResetPending()`과 `accountRestartPending()`을 증명 분기보다 먼저 호출한다.
  폰은 `reloadAsync`, 웹은 집 주소로 `location.replace`한다. 실패·거부·4초 초과 시에는
  기존 navigation reset/proof로 돌아간다. 첫 로그인·같은 계정 재로그인·로그아웃만은 재시작 대상이 아니다.
- #2382는 `phone-embed.tsx`나 `DashboardPhone.tsx`를 바꾸지 않았다.
  현재 `PhoneEmbedNav`에는 entry ID가 없고 phone의 `screenStack`은 `string[]`다.
  같은 경로를 두 번 연 것과 같은 entry의 remount를 식별하는 G 계약은 아직 없다.
  `view-memory.ts`는 기존대로 owner/epoch 경계에서 비우며 디스크에 쓰지 않는다.

## G 판정: 코드에서 도출한 결론과 후속 제안

**G의 휴면 준비를 #2318 미병합에 계속 묶을 기술적 근거는 확인되지 않았다.** 계정 전환의
주 경로는 #2382로 대체됐다. 따라서 #2318 코드를 재개하거나 가져오지 않고 G의 순수
entry metadata를 별도 PR에서 준비할 수 있다고 판단한다. 이는 동결 해제나 G 완성 판정이 아니다.
재시작 불가 폴백이 남아 있으므로 owner lease/epoch 경계를 재시작 성공에 의존시켜서는 안 된다.

별도 G 준비 제안:

1. 본문 없는 `{entryId, route}` 메모리 자료형과 push/replace/back 전이 함수를 순수 모듈로 준비한다.
   같은 URL의 새 explicit push에는 새 ID, 동일 entry remount에는 기존 ID를 유지한다.
2. standalone navigation route key와 phone stack entry ID를 registry binding에 대응시키는
   계약·테스트를 준비한다. bare tab resume, fromNode 재진입, 실제 pop의 releaseEntry,
   owner ABA·wipe retired entry·seed 재소비 0을 포함한다.
3. 생산 phone stack과 hook 배선은 별도 단계에서 검토한다. F PR에는 G 코드를 넣지 않는다.
   실제 화면 전환·Back·재시작 실패 폴백의 확인은 그 연결 단계의 조건이다.

## 검증

2026-10-24 21:26:32 KST 기록. 관련 Jest **13묶음 404/404**(신규 F 사례 **38개**), tsc,
변경 파일 eslint, 금지어, C7(5언어·40 namespace·4,467키), 긴 줄표 모두 종료코드 0.
check:cycles 런타임 순환 **0**. 각 Jest 직전 메모리를 확인했고 2.5GB 문턱 이상이었다.

묶음: chat의 `session-autosave`, `autosave-session`, `autosave`, `session-controller`,
`session-registry`, `session-keep`, `keep-deferred-mutations`, `keep-receipts`;
auth의 `account-restart`, `account-epoch`; app의 `account-scope`;
nav의 `phone-embed`, `view-memory`. 모두 `--runTestsByPath ... --maxWorkers=2`로 실행했다.
새 F 시험은 실제 registry/controller/keep/ledger를 쓰며 prefs·capture·인증 I/O를 대체한다.
실제 capture 경로의 기존 deferred-mutation 회귀도 함께 통과했다. 서버 commit/폰 동작의 증거는 아니다.

| 변이 | 실패 사례 수 |
| --- | ---: |
| hydration 재실행 허용 | 2 |
| 늦은 hydration의 privacy change 검사 제거 | 1 |
| 이미 시도한 exchange 재실행 | 2 |
| ON 시 sequence 경계를 0으로 | 4 |
| OFF signal abort 제거 | 3 |
| 완료 이벤트의 session 결속 제거 | 5 |
| 수동 저장 전 prefs 대기 취소 제거 | 1 |
| wipe에서 발행된 쓰기까지 즉시 abort | 3 |
| keep의 ticket 보유 제거 | 2 |
| 실제 I/O 정산 뒤 ticket 해제 제거 | 1 |
| 완료 이벤트 구독 해제 제거 | 2 |
| 단조 상한을 현재 배열 끝 번호로 변경 | 1 |
| 완료 결과 종류 검사 제거 | 1 |
| 라이브 자동 저장 index 변경 | 1 |

실행 변이 **14/14 검출**. 변이 파일 4개의 원본 바이트를 복원한 뒤 최종 404개를 통과했다.
변이 로그·JSON은 로컬 `reports/t38-stepf/`에 있으며 Git에는 넣지 않는다.

## 남은 H 연결과 한계

- H가 세션별 factory를 한 번 만들고 실제 controller·공유 ledger-backed keep·유효한 표시/연령
  정보를 주입해야 한다. 화면 detach에서 dispose하지 않는다. 수동 버튼은 prefs 대기 취소 뒤
  별도 명시 keep을 호출한다. 이 조립과 화면 테스트는 아직 없다.
- D3b-O 실행 어댑터, unknown 쓰기의 서버 확정 계약, captured 전송, 저장 시 red 판정의
  영구 hold 연결은 #2731의 남은 항목대로 유지한다.
  최신 origin/main DECISIONS의 10-24 21:04 기록은 0270 운영 적용과 앱 연결 잔여를 구분한다.
  이 세션은 해당 기록만 읽었고 운영 상태를 직접 조회하지 않았다.
- E 계획 상태·G entry 경계와 send/keep/plan/autosave/entry 일괄 연결을 끝내기 전에는
  H를 활성화하지 않는다. Z117 실제 탭 왕복 해결은 아직 배송되지 않았다.
- 전체 verify는 PR CI, 독립 검토(Codex daybreak)·머지·8081 확인은 코디네이터 소유다.
  이 갈래는 운영·QA 로그인·LLM·APK·에뮬레이터·8081을 실행하지 않는다.
- VISION: 1축 자기 데이터 축적의 동의 정합성, 2축 개인 비서 기반의 대화 연속성 준비.
- 되돌림: 이 휴면 변경 커밋을 역적용하면 된다. 라이브 설정·데이터 마이그레이션은 없다.

머지 조건: 독립 검토 PASS + 새 medium 0 + CI 초록. 이 PR은 draft로 남긴다.
