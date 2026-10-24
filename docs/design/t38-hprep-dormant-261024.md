# T38 H 준비: 휴면 계약

기준: `b87b181f02241a5c9a3f81070080f56fbc7178e0`, 2026-10-24 구현 갈래.
근거: [HANDOFF 10-20 14:57](../HANDOFF.md),
`DECISIONS.md` 26.10.20 14:20/14:49. 승인 범위는 휴면 준비이며 현재 앱 동작을 유지한다.
`secondb.tsx` 연결, 스위치, 운영 접근, 인터뷰 #2440, DECISIONS/HANDOFF 수정은 없다.

## 다섯 항목과 완료 기준

| 항목 | 처리 | 계약·검증 |
| --- | --- | --- |
| ① 삭제 알림 | 구현 | 동기 fan-out을 유지하면서 Promise 거절도 소비한다. 한 리스너의 동기 예외·비동기 거절은 호출 결과와 다음 리스너를 바꾸지 않는다. 빈 배열이나 빈/공백 ID가 하나라도 있으면 그 이벤트 전체를 버린다. 유효한 ID는 trim하지 않는다. |
| ② 전체 삭제 시작 장벽 | 미구현(D3b-O 실행 어댑터가 아직 없음) | 아래의 선행 실행 어댑터가 없다. 라이브 삭제에 장벽만 붙여 완료·재진입을 보장하지 않는다. |
| ③ 저장 작업 키 | 구현 | session-keep의 키를 `replyTurnId`로 맞춘다. 기존 prepareKeptExchange의 같은 키와 동일 registry 슬롯을 쓴다. `capture` 별칭은 받아들이지 않는다. 양쪽 선점 순서를 실행 시험으로 검증한다. |
| ④ red 판정 → aiReuse 보류 증거 | H 전 숙제, 미구현 | 원문을 AI 재사용 대상으로 옮기지 않는다. 아래 D4 결정을 유지한다. |
| ⑤ checking 완료 안내 | 구현 | `KeepResult.status=settled`는 저장 성공 안내가 아니다. 완료 콜백의 타입은 `present / unknown / failed`만 허용하며 `checking`은 제외한다. D1의 오류 결과 알림은 유지하고 ledger를 쓰는 H 경로는 기존처럼 `present`만 알린다. |

작업 순서는 원문·호출부 확인 → 회귀 시험 → 최소 수정 → 관련 Jest → 수정 줄 변이 →
tsc/lint/어휘/C7/em dash/순환/제약 → 브랜치 push/draft PR이다.
전체 verify와 독립 검토, 머지, 8081 확인은 코디네이터와 CI의 후속 단계다.

## ② 확인할 수 없었던 전제

`account/content-wipe.ts`의 실제 공개 API는 factory인 `createContentWipeLedger()`다.
`beginWipe()`는 반환된 인스턴스의 메서드이며 생산 코드 호출부가 없다.
지금의 `deleteAllUserData()`는 ledger·owner lease·intent를 받지 않고 기존 삭제 함수를 순서대로 부른다.
다른 삭제 함수가 쓰는 `prepareSavedDataDeletion()`은 **성공 후 D2 무효화 알림**이며
삭제 전 동기 ACK·진행 중 쓰기 정산을 제공하는 D3 장벽과 다르다.

[registry 설계 §4A](chat-session-registry-261015.md#4a-전체-내용-삭제-계정-전환과-다른-fence-r1-m1)는
첫 I/O 전 ACK, 모든 발행 쓰기 정산, 미확정 상태에서 삭제 금지, 단계별 영수증,
부분 실패·명시 재시도·새 세션 재진입을 함께 요구한다.
[captured-content-wipe](captured-content-wipe.md)의 「검증과 남은 연결」은 실제
deleteAllUserData 연결을 D3b-O 후속으로 명시한다. 다른 삭제 경로가 이미 이 실행 어댑터를
쓴다는 전제를 확인하지 못했으므로, 새 전역 ledger나 성공 후 이벤트로 대신하지 않았다.
O 없이 beginWipe만 연결하면 진행 중 쓰기와 삭제가 겹치거나 세션을 계속 잠글 수 있다.

## ③ 기존 저장분 호환

바뀌는 키는 세션 메모리의 작업 잠금이며 source ID, 본문 포맷, content hash,
dedup signature, 태그, 저장 스키마는 바꾸지 않는다. 기존 `prepareKeptExchange`는 그대로다.
실제 session-keep 작업으로 prepare를 실행해 payload와 capture 입력의 일치를 검사하고,
기존 source의 exact duplicate를 재사용하는 시험을 유지한다. 마이그레이션은 없다.

## ④ 안전 결정과 남긴 연결

[`DECISIONS-2026-10-07_12.md:27`](../../DECISIONS-2026-10-07_12.md)의 결정 원문:
「저장 + 위기 안내, AI 처리(추출·임베딩·분류)는 건너뛴다. 보류 상태는 레코드 필드
`ai_hold` 로 남긴다.」

[위기 AI 보류 설계](crisis-ai-hold-261015.md)는 사용자 원문 보관과 AI 재사용을 분리하며,
본문·쓰기·읽기 연결은 서버 SQL과 별도라고 명시한다. 이 기준 체크아웃에는
`db/migration-drafts/UNNUMBERED_crisis_ai_hold.sql`이 있고 0270 번호 파일은 없다.
0270의 운영 적용 상태는 이 세션에서 확인하지 않았다.

현재 `aiReuse`는 본문이 아니라 `hold-required`와 턴 ID 증거, 또는 `unconfirmed`만 담는다.
어느 상태도 AI 허가나 영구 보류 ACK가 아니다. 저장 시 새 red 판정의 증거를 이 메타데이터에
추가하는 방향은 본문 재사용과 다르다. 이 TODO 의 출처인 `DECISIONS.md` 26.10.20 11:38(D1 검토 낮음
「저장 때 red 로 분류된 본문이 aiReuse 에 안 남음」)과 위 D4 결정, 위기 AI 보류 설계의 보류 입력
(로컬 전체 글 검사 · 알려진 판정 전달)이 이미 뜻을 정한다: **본문이 아니라 저장 시점 red 판정을
`hold-required` 보류 증거로 싣는다.** 새 결정은 필요 없다. H 연결 전에 source 저장 · 중복 저장의
보류 승격 · AI 읽기 제외와 함께 구현 · 검증한다(0270 은 sources 에 백필이 없어 클라이언트가 보내는
판정이 유일한 보류 신호다).

## ⑤ 완료 안내와 재조회

삭제 알림이 저장 중에 도착하면 settle이 `checking`을 반환할 수 있다.
이때 완료 콜백은 0회다. 후속 재조회가 `present`, `missing`, `unknown` 어느 것으로 끝나도
완료 콜백을 뒤늦게 재생하지 않는다. 화면은 `receipts.subscribe`로 최신 상태를 읽는다.
`checking` 중 수동 재저장은 `check-required`, 자동 저장은 기존 tombstone으로 거절된다.
재조회가 새 capture나 upload를 일으키지 않는 것을 D1·ledger 경로에서 각각 검사한다.

## 라이브 동작 불변과 남은 H 단계

- 수정한 실행 파일은 `saved-data-changes.ts`, `session-keep.ts` 둘이다.
  session-keep와 prepareKeptExchange의 생산 호출자는 없고, 삭제 알림의 유일한 구독자는
  휴면 keep-receipts다. 기존 삭제 6경로의 쿼리·순서·반환값·오류를 실행 시험으로 비교한다.
- 화면·기존 capture/formatter·delete-bulk·content-wipe는 기준 커밋과 동일하다.
  라이브 경로를 새 API로 옮기거나 설정을 켜지 않는다.
- H 전에 D3b-O, 공유 ledger의 실제 주입, unknown 티켓의 서버 확정 계약, captured 전송,
  저장 시 red 판정의 영구 hold 연결, 동결된 E/G와 화면 진입을 각각 완료해야 한다.
- 로컬 회귀·변이 검증은 서버 commit, 운영 DB, 실제 폰 또는 탭 왕복 성공의 증거가 아니다.
  Z117의 실제 탭 복귀 동작은 H 연결 전까지 그대로다.
- VISION: 1축 자기 데이터 축적의 저장 정합성과 2축 개인 비서 기반의 대화 연속성 준비.

## 검증 기록

2026-10-24 20:00 KST. 관련 Jest 10묶음 **452/452**, tsc, 변경 파일 eslint,
금지어, C7(5언어·40 namespace·4,446키), 긴 줄표, check:constraints 모두 종료코드 0.
check:cycles는 런타임 순환 0. 제약 도구의 기존 C11 `PART` 표시는 유지된다.
렌더 시험·전체 verify·운영·폰·8081은 이 갈래에서 실행하지 않았다.

Jest 묶음은 chat의 `session-keep`, `prepare-kept-exchange`, `keep-deferred-mutations`,
`keep-receipts`, `keep-exchange`, wiki의 `saved-data-changes`, `saved-data-deletion-paths`,
`capture`, account의 `content-wipe`, records의 `delete-bulk`다. 각 `__tests__/*.test.ts`를
`npx jest --runTestsByPath ... --maxWorkers=2`로 실행했다. 추가한 검증 사례는 24개다.
매 실행 전에 여유 물리 메모리가 2.5GB 이상인지 확인했다.

| 변이 | 검사 | 결과 |
| --- | --- | --- |
| Promise reject 처리 제거 | saved-data-changes | 실패 1건 |
| 공백 ID 검사 제거 | saved-data-changes | 실패 2건 |
| 빈 배열 검사 제거 | saved-data-changes | 실패 1건 |
| 알림 ID를 trim해 다른 대상으로 변경 | saved-data-changes | 실패 4건 |
| 저장 작업 키를 `capture`로 복원 | session-keep | 실패 2건 |
| 완료 상태 판정을 항상 true로 | session-keep | 실패 3건 |
| 비문자 ID 검사 제거 | saved-data-changes | 실패 3건 |
| 콜백 타입을 KeepReceipt 전체로 확대 | tsc | 회귀 시험 콜백에서 TS2322 |

실행 변이 **7/7**, 타입 변이 **1/1** 검출. 타입 변이는 Jest에서는 생존했다.
`isolatedModules`의 타입 제거 때문이며, 별도 tsc가 잡는 것을 확인했다.
모든 변이 후 원본 바이트를 복원하고 최종 452건과 정적 검사를 통과했다.
②·④는 구현하지 않아 변이 수에 넣지 않았다.

같은 madge 설정(type-only import 제외)으로 `src/app/`의 모듈 178개에서 닿는
1,206개 모듈을 추적했다. `session-keep`, `keep-receipts`, `prepare-kept-exchange`에
닿는 경로는 0개다. 삭제 알림 leaf는 기존 삭제 함수에서 닿지만 라이브 구독자는 없다.
`secondb.tsx`, `settings.tsx`, `delete-bulk.ts`, `wiki/queries.ts`, `wiki/capture.ts`,
`keep-exchange.ts`, `prepare-kept-exchange.ts`, `content-wipe.ts`의 Git blob은 기준과
**8/8 동일**하다. 동적 외부 코드나 운영 commit 보장의 증거로 확대하지 않는다.
