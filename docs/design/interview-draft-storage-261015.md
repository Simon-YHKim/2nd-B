# T16 인터뷰 임시 보관: 네이티브 저장 첫 단위

기준: main `ed19edfa` · 2026-10-15. **화면에 연결하지 않은 저장 모듈이다. T16 전체 완료가 아니다.** 실제 모델 호출·운영 쓰기·SDK 추가·유료 서비스 사용은 없다.

## 승인과 구현 경계부터

- [Q-261014-21](../../DECISIONS.md) 원문 74행은 “앱이 꺼져도 「이어서 / 버리기」 · 7일 · 네이티브 암호화 · 웹은 로그아웃 때 지움”을 승인했다. **웹의 암호화 보장이 없다는 이유로 웹 보관을 영구 금지하지 않는다.** 이번 모듈의 웹 `unsupported`는 후속 구현 전까지의 상태다.
- `null` 인증 상태는 로그아웃 확정과 같지 않다. [AuthContext](../../src/lib/auth/AuthContext.tsx)의 세션 확인 불가 경로도 `noteResolvedOwner(null)`을 부른다. 네이티브의 기존 초안을 일반 로그아웃 때 모두 지우는 것으로 승인을 확대하지 않았다. 계정 변경 시 비노출, 계정 삭제 시 물리 삭제, 시간 만료 시 삭제를 구분한다.
- Q21은 7일 기준 시각을 지정하지 않았다. 이 단위는 **첫 `create` 시도 시각 + 정확히 7 × 24시간**을 고정 상한으로 사용한다. 같은 접근 객체의 재시도, 읽기, 수정은 시각을 연장하지 않는다. 새 대화는 새 접근 객체와 새 UUID를 사용하며 이전 버전으로 되살릴 수 없다.
- 미성년 차단, 별도 동의 키, 새 보관 안내 문구를 임의로 만들지 않았다. 기존 인터뷰 진입·연령·동의·위기 게이트를 아직 연결하지도, 우회하지도 않는다. 저장된 `crisis-ended`/`save-unknown`을 자동 재개하는 코드는 없다.
- T34 한도 안내 → T36 판정 상태 이후에 인터뷰 화면 연결을 진행해야 한다. T36의 `answered: null`은 중립이며 `false`나 미판정 `undefined`로 바뀌지 않는다. [동결 #2440](https://github.com/Simon-YHKim/2nd-B/pull/2440)의 끝내기 확인 흐름은 가져오지 않았다.

## 실제 동작

| 경계 | 이 단위의 동작 |
|---|---|
| 저장 형식 | `draft-codec.ts`의 v1 엄격 JSON. owner·초안 식별자·revision·생성/만료 시각·시기·언어·유입·단계·대화·입력 중 문장을 검증한다. 알려지지 않은 필드는 거부한다. 입력은 await 전에 복사한다. |
| 암호화 | 기존 `encrypted-native-storage.ts`의 AES-256-GCM과 기기 SecureStore 키를 재사용한다. AAD에 논리 키가 들어간다. 본문은 AsyncStorage에 암호문으로만 쓴다. |
| 전용 이름 | `interview.drafts.v1.<owner>` 하나에 해당 계정의 초안 1개를 둔다. 다른 기능의 capture 초안과 섞지 않는다. 새 namespace에는 과거 평문이 없으므로 직접 읽기와 시작 시 평문 이주 모두 예상치 못한 평문을 거부한다. |
| 크기 | 전체 JSON 256 KiB까지. 공용 암호화 저장소의 기존 용량·인증/감사 예약 예산을 그대로 지킨다. 초과는 `unconfirmed`이며 잘라 저장하거나 인터뷰를 끝내지 않는다. |
| 계정 귀속 | 화면이 사용할 접근 객체를 만들 때 `captureAccountOwnerLease`를 캡처한다. A→B→A여도 이전 객체는 무효다. 인증 전환 중에는 읽은 본문을 반환하지 않는다. |
| 원자성의 범위 | 같은 모듈 인스턴스의 계정별 큐가 저장·읽기·삭제를 직렬화한다. 쓰는 동안 lease가 무효화되면 같은 큐 안에서 이전 값을 복원하고 `stale`로 끝낸다. 복원도 실패하면 `unconfirmed`; 이후 접근은 복원 성공 전까지 본문을 반환하지 않는다. |
| 정상 로그아웃/인증 불명 | 기존 네이티브 암호문은 남고 접근 객체만 무효가 된다. 같은 계정의 새 로그인은 새 lease로 아직 유효한 초안을 읽을 수 있다. 웹 로그아웃 삭제와 다중 탭 처리는 후속이다. |
| 삭제 | `discard`는 UUID와 revision이 모두 맞을 때만 삭제한다. 이전 저장 응답으로 새 버전을 지울 수 없다. 계정 삭제는 실제 `local-purge.ts` 경로에서 기존 영구 삭제 fence를 먼저 설치하고 이 namespace도 비운다. 삭제 실패는 전체 purge의 `unconfirmed`로 이어진다. |
| 만료 | 읽기·저장 전후에 만료를 검사한다. 경계 시각과 같아도 만료다. 해당 계정 접근에서 삭제를 확인하기 전에는 본문을 주지 않는다. 단말 시계가 생성 시각 이전으로 후퇴해 나이를 확인할 수 없으면 보수적으로 만료 처리한다. |
| 실패 | 저장소·키·복호화·형식 오류를 “빈 초안”이나 성공으로 바꾸지 않는다. `unconfirmed`만 반환하며 원문이나 예외 상세를 로그·analytics로 내보내지 않는다. 실패 시 평문 fallback은 없다. |

`ready`는 이 로컬 저장 모듈의 본문 반환/저장 확인이다. 서버 기록으로 저장됐다는 뜻이 아니다. `empty`, `expired`, `conflict`, `stale`, `unsupported`, `unconfirmed`, `discarded`도 별도로 구분한다. `unconfirmed`는 저장 실패와 파손, 용량 초과를 사용자에게 구체적으로 안내하는 UI까지 완성했다는 뜻이 아니다.

## 기존 경계와 남은 연결

1. 실제 진입점은 [draft-store.ts](../../src/lib/interview/draft-store.ts)의 `interviewDraftsForOwner`다. 현재 인터뷰 화면은 이 함수를 호출하지 않는다. 새 모듈이 [local-purge.ts](../../src/lib/account/local-purge.ts)에 연결된 것은 계정 삭제만이다. [account-epoch.ts](../../src/lib/auth/account-epoch.ts)의 lease와 [local-deletion-fence.ts](../../src/lib/account/local-deletion-fence.ts)의 영구 fence는 목적이 다르며 정상 로그아웃에 영구 fence를 설치하지 않는다.
2. `AuthContext.publishSessionUnavailable`의 `null`과 [auth.ts](../../src/lib/supabase/auth.ts)의 명시적 `signOut`/`signOutExpected`를 소스에서 대조했다. 이번 코드는 정상 로그아웃 호출 경로를 바꾸지 않는다. 웹에서는 후속 구현이 명시적 로그아웃의 여러 진입점과 다른 탭의 늦은 쓰기까지 묶어야 한다. `onAuthStateChange`의 `null`만 보고 삭제하면 안 된다.
3. 이 v1은 대화/입력의 보관 경계다. 실제 「이어서 / 버리기」를 붙이기 전에 coverage/baseCoverage·pendingLayer·stuckStreak·abandoned·한도 상태와 T36 판정 복원의 정확한 계약을 완성해야 한다. 저장된 중립값을 재판정 대상으로 바꾸거나, 복원하면서 새 모델 호출·저장·별 진전을 자동 실행하면 안 된다.
4. [interview.tsx](../../src/app/interview.tsx)의 기존 `processingNotice` 의미를 유지하면서 임시 보관과 최종 기록 저장의 차이를 보여 줄 승인 시안/문구 대조가 필요하다. [개인정보처리방침](../legal/privacy-policy.md)의 보관 항목도 출시 전 대조한다. 이 모듈이 새 동의 문구나 법무 승인을 대신하지 않는다.
5. 만료 비노출은 현재 해당 계정 접근에서 실행한다. 앱이 꺼져 있는 동안 정확히 7일째 물리 삭제를 실행하지는 않는다. 다른 계정의 만료 초안까지 시작/재개 시 정리하는 제한된 sweep과 기기 검증은 후속이다. [DECISIONS.md](../../DECISIONS.md) 75행의 후속 조사대로 불필요한 상시 실행/절전 예외 권한을 추가하지 않는다.
6. 디스크가 실패하면 물리 삭제를 보장하지 않고 `unconfirmed`를 낸다. 실행 중인 큐/복원 표시는 프로세스 메모리다. 쓰기와 인증 전환 사이에 프로세스가 강제 종료되면 마지막 암호문이 해당 **원래 owner 키**에 남을 수 있다. 다음 실행에서도 owner/AAD/TTL 검사를 통과해야 읽으며 다른 계정에는 노출하지 않는다. 프로세스 종료를 넘는 트랜잭션 취소나 안전한 지우기까지 검증했다는 주장이 아니다.
7. [T62/D6 보안 후속](../handoff/D6-SECURITY-FOLLOWUP-261015.md)의 서버 세션 6시간 수명과 이 로컬 7일 보관은 다르다. 만료된 서버 세션을 되살리거나 `answered=true`를 신뢰해 coverage를 커밋하지 않는다. `audit_response` 기록/coverage 저장의 멱등성·저장 결과 불명 상태 복구, 서버 SQL 실제 적용과 RPC 배선은 별도 선행 과제다.
8. [#1814](https://github.com/Simon-YHKim/2nd-B/pull/1814)의 대화 자동 위키 저장은 이 로컬 임시 보관의 선행 조건이 아니다. T28의 영구 `ai_hold`와 위기 뒤 AI 접근 제한도 암호화 보관만으로 해결되지 않는다. 화면 연결 시 위기 종료 복원, 미성년/동의 경계와 함께 별도로 검증한다.

## 검사와 인수 기준

- 새 회귀는 실제 `createEncryptedNativeStorage` 구현과 Node의 **실제 AES-256-GCM**을 결합한다. 본문 비노출, 어댑터 재생성 후 복호화, 변조·다른 키로 옮긴 암호문 거부, 키 분실, TTL/읽기/수정/재시도, 저장·삭제 실패, 계정/ABA/늦은 읽기/늦은 쓰기/삭제 경합, 터미널 purge를 실행한다. 이 검사는 Expo 네이티브 암호화 바인딩이나 Android 기기 재시작 실측이 아니다.
- 로컬 타깃 실행: 새 모듈 32개와 기존 경계 검사를 합해 **5 suites / 98 tests PASS**. 기기 실행이나 전체 검사 결과로 대신 세지 않는다.
- 함께 실행할 기존 검사는 암호화 저장소, 계정 삭제 aggregate, 삭제 fence, account epoch다. 명령은 `npx jest --runInBand --runTestsByPath src/lib/interview/__tests__/draft-store.test.ts src/lib/storage/__tests__/encrypted-native-storage.test.ts src/lib/account/__tests__/local-purge.test.ts src/lib/account/__tests__/local-deletion-fence.test.ts src/lib/auth/__tests__/account-epoch.test.ts`다. 정적 검사와 정확 커밋의 전체 검사 결과는 PR/인수 기록에서 구분한다.
- 8파일이 필요한 이유: 전용 codec/store/회귀 3개, 공용 암호화 namespace/평문 거부와 기존 회귀 2개, 실제 계정 삭제 연결과 기존 회귀 2개, 이 설계/후속 문서 1개다. 화면·locale·모델·운영·의존성 파일은 변경하지 않는다.
- 출시 완료에는 독립 검토, 정확 HEAD 전체 검사, PR/CI/main 반영 뒤 실제 앱 흐름, 웹/다중 탭/로그아웃, 네이티브 키·재시작·계정 전환·7일 만료 확인이 더 필요하다. 이 문서와 모듈만으로 전체 T16 완료를 선언하지 않는다.

## 독립 검토 R1 수정 기록

R1(`32392a7c`)은 H0/M1/L0 BLOCK이었다. 내부 read/write의 owner 확인 뒤에도 mutation/owner queue가 응답을 넘기는 동안 public Promise가 pending인 틈이 있었다. 그때 A→B/ABA/계정 삭제 fence가 시작되면 이전 ready/삭제 성공 결과가 반환됐다. 원래 구현에 새 실행 회귀를 적용하면 load/create/replace/discard × 세 전환의 12개가 모두 실패했다. 원본 독립 보고와 실패 로그는 삭제하지 않는다. 누적 BLOCK은 1회다.

수정은 owner queue가 끝난 뒤 public Promise를 확정하는 마지막 동기 `.then`에서 같은 lease와 terminal fence를 확인한다. 그 확인 뒤에는 await가 없다. 본문/성공은 stale로 막고, 본문이나 성공 ACK가 없는 unconfirmed는 저장 복구 실패로 유지한다. 이미 저장된 정상 네이티브 암호문을 로그아웃 때문에 지우지 않는다. 회귀는 각 public Promise의 실제 pending 상태를 확인하며 내부 비동기 순서의 모든 탐색 구간에서 전환시킨다. `.then` 관측자가 한 tick 늦은 상태를 pending이라고 세지 않는다. **호출자가 결과를 소비한 뒤의 계정 전환까지 보장하지 않는다.** 후속 UI는 await한 결과를 반영할 때도 자신의 owner/화면 수명을 확인해야 한다. R2와 정확 HEAD 전체 검사는 별도 게이트다.
