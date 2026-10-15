# T16 웹 초안 폐기 준비 A

2026-10-15. 구현 시작 기준 `f3136a1524dd73be56051b591c6abbaaf7eb9c40`.
승인된 후속 설계 `cbd8a11610e95f6d52308dc9b93c2ca551c6ef1164d479887764b2326e371ac2`의
첫 웹 단위다. **현재 앱의 인증 경로·화면·본문 보관에 연결하지 않았다.** 이 준비 단위의
검증을 T16 전체 완료, 웹 초안 지원 또는 서버 저장 완료로 표시하지 않는다.

## 범위와 상충 해소

서버 content generation 제공자가 없는 상태와, 현재 브라우저의 로컬 보관 generation은
다른 문제다. 이번 `storageGeneration`은 한 project 안의 owner/session 보관 수명 식별자다.
서버 wipe·최종 저장·coverage·AI hold 권한을 대신하지 않는다. native v2의 production
content lease가 null/unconfirmed인 경계를 바꾸지 않는다.

웹 로그아웃에서는 본문을 폐기한다. native pending/unknown 일반 discard 제한을 웹에 그대로
적용해 원문을 남기는 경로를 만들지 않는다. 실제 본문 writer는 아직 없고, pending intent의
본문 삭제와 비본문 receipt 식별자 보관 정책도 후속 C의 선행 조건이다. 이번 테스트의 본문은
직접 넣은 synthetic fixture이며 암호화·7일 만료·자동 보관의 구현 증거가 아니다.

native ordinary logout의 암호문 유지와 terminal 계정 삭제는 구분한다. 이번 파일은 native
store·key·namespace·TTL·terminal aggregate를 수정하지 않는다. 웹 terminal owner 전체 폐기는
정확한 세션 하나를 처리하는 이 API의 성공으로 대신하지 않는다.

## 로컬 D 계약

`web-draft-lifecycle.ts`는 `secondB.interviewWeb.v1:<auth storageKey>` IndexedDB version 1에
다음 두 object store를 함께 사용한다. 프로젝트별 현재 generation 하나만 지원한다.

| 저장소 | 키와 값 |
|---|---|
| `control` | out-of-line key `current`; v=1, ownerId, sessionId, storageGeneration, revision, phase, logoutId |
| `bodies` | compound key `[ownerId, sessionId, storageGeneration]`; A에는 제품 writer/reader 없음 |

control에 토큰·토큰 hash·본문을 기록하지 않는다. store 이름·keyPath·autoIncrement·index와
control의 필드/값을 검증한다. 다른 control key, orphan body, 다른 tuple의 body, inactive인데
남아 있는 body, 불완전 schema는 unconfirmed다. 이를 조용히 empty나 성공으로 바꾸지 않는다.
body 검사에는 key만 사용하고 fixture payload를 읽거나 반환하지 않는다.

- `activate(identity, previousReceipt)`는 명시적 작업이다. 초기 빈 registry에는 null만 허용한다.
  이후에는 정확한 inactive revision/logout receipt와 새로운 generation이 필요하다.
  active generation을 덮어쓰거나 lookup/purge가 자동으로 활성화하지 않는다.
- `purge(ticket, logoutId)`는 owner/session/generation/revision을 대조한 뒤, 같은 readwrite
  transaction에서 inactive + 고정 logoutId + revision 증가 + exact body 삭제를 수행한다.
- **성공은 transaction.oncomplete에서만 반환한다.** delete request.onsuccess나 이벤트
  BroadcastChannel은 삭제 ACK가 아니다. timeout/abort/blocked/open 실패는 SDK 호출을 허가하지 않는다.
- 같은 ticket/logoutId 재호출과 lookup은 동일 receipt를 반환한다. 아직 active인 exact ticket의
  lookup은 null이며, 이는 미완료 조회 결과일 뿐 SDK 호출 허가가 아니다. control이 없으면
  unconfirmed, 새로운 generation/revision이나 다른 logoutId이면 conflict다.
- 입력 tuple/receipt는 비동기 작업 전에 복사한다. 반환 객체를 바꿔도 durable control은 바뀌지 않는다.
- 기본 4초 기한은 open부터 transaction 완료까지다. 기한 뒤 open 성공은 DB를 닫고 transaction을
  만들지 않는다. 늦은 첫 upgrade는 abort해 schema도 생성하지 않는다. 이미 commit했지만 완료
  알림이 늦으면 unconfirmed이며, 같은 logoutId lookup으로 확인한다. 늦은 callback에서 SDK를
  이어 실행하는 경로는 없다.

IDB oncomplete와 운영체제 프로세스 재시작 검증은 저장 장치 전원 차단 내구성 보증이 아니다.
현재 API는 `unsupported`, `unconfirmed`, `conflict`, `invalid`를 구분해 던진다. 오류에는
owner/session/본문/토큰을 담지 않는다. D 내부에서 auth 또는 M/S를 기다리지 않는다.

## 인증 coordinator

`web-interview-signout.ts`의 두 함수는 현재 제품 호출자가 없는 준비 함수다. required
lifecycle과 auth runtime의 storageKey가 같아야 한다. 누락된 adapter나 no-op 성공 fallback은 없다.
SDK 접근은 기존 `session-mutation.ts`의 검토된 primitive와 그 타입을 재사용한다.

```text
M (requireCrossTab=true)
  S: public getSession -> stable owner/session snapshot -> S 해제
  D: exact control 대조 -> inactive/body delete -> transaction.oncomplete
  S: 기존 inside helper의 세션 재대조 -> public SDK signOut -> S 해제
M 해제
```

Web Locks가 없거나 비정상인 경우 일반 auth의 process fallback을 destructive 성공으로 쓰지
않는다. 실제 SDK getSession이 끝난 다음 D를 실행하므로 S를 잡은 채 D를 기다리지 않는다.
owner 변경, 같은 owner의 다른 session, stable session_id가 없는 live/expected session은 거부한다.
같은 session의 토큰 교체는 허용한다. token equality/hash로 durable 세션 ID를 대신하지 않는다.

이미 auth session이 null인 경우도 non-null expected owner/session과 정확한 durable ticket이
필요하다. null 이벤트만으로 어느 owner의 본문인지 추측하지 않는다. D 이후 기존 inside helper가
세션을 다시 대조해 새 세션을 로그아웃하지 않는다. SDK가 실패해도 inactive/body 삭제를 되돌리거나
재활성화하지 않으며, 재시도는 같은 logoutId를 쓴다. global/local scope 의미는 기존과 같다.

저수준 lifecycle은 auth를 import하지 않는다. 활성화와 로그아웃의 제품 호출자는 반드시
coordinator가 잡은 M 안에서 이 adapter를 사용해야 한다. 새 production 호출자는 후속 B 검토
범위다. 비동기 auth subscriber 안에서 M을 await하지 않는다.

## 실행한 회귀와 재실행

기존 dependency만 사용한다: pinned `@supabase/auth-js` 2.106.1, esbuild, playwright-core.
서버·실제 계정·외부 모델 호출과 dependency 추가는 없다. 8081/앱 localhost를 사용하지 않는다.

```bash
npm test -- --runTestsByPath src/lib/auth/__tests__/session-mutation-v2.test.ts src/lib/supabase/__tests__/auth-session-boundary.test.ts src/lib/auth/__tests__/recovery-storage-events.test.ts src/lib/auth/__tests__/recovery-proof-store.test.ts src/lib/auth/__tests__/account-session-lease.test.ts src/lib/auth/__tests__/storage-recovery-retiring-client.test.ts --runInBand
T16_WEB_ARTIFACT=/tmp/t16-web-result.json node scripts/qa/interview-web-logout.cjs
```

runner는 `/usr/bin/chromium` 또는 `CHROMIUM_PATH`를 사용한다. 임시 loopback origin과 전용
persistent profile을 만들고 외부 page 요청을 차단한다. SDK fetch는 synthetic 응답뿐이다.
runner 자신이 만든 process group에만 SIGKILL을 보내고 같은 profile로 다시 시작한다.
테스트 뒤 그 profile을 지운다. artifact에는 본문·토큰이 없다.

| 검사 | 실행 증거와 한계 |
|---|---|
| 기존 Jest 6 suites · 102개 PASS | 실제 GoTrueClient와 기존 auth runtime. D barrier double은 순서/실패/필수 dependency/복사 검증에 한정 |
| 실제 Chromium 154.0.8037.57, 19그룹 | 실제 IndexedDB/Web Locks/두 page/실제 SDK의 실행. synthetic body seed는 제품 autosave가 아님 |
| M → S 종료 → D → S | 실제 transaction 대기 동안 다른 page의 B sign-in이 M에서 기다리는 것을 LockManager.query로 관측 |
| delete 성공 뒤 abort | 실제 IDB delete request 성공 후 abort: body/control 보존, SDK 0. request 성공을 ACK로 삼는 구현을 잡는 반례 |
| timeout / late callback | 실제 deleteDatabase 뒤 대기한 open을 늦게 해제해 schema mutation 0. 실제 commit의 완료 전달을 지연 주입해 unconfirmed·SDK 0·동일 receipt lookup 확인 |
| malformed / orphan | 실제 IDB row/schema를 손상시켜 거짓 성공 0, 다른 tuple/body 보존 |
| SDK 실패 / 재시도 | 실제 SDK에 synthetic 500 응답: inactive/body 0 유지, 동일 logoutId 재시도 성공 |
| SIGKILL/restart 4시점 | D 전, IDB 대기 중, D ACK 뒤 SDK 응답 전, SDK 뒤. 재시작 시 앞의 둘은 active/body 1, 뒤의 둘은 inactive/body 0 |
| 미지원 주입 | Web Locks 없음/null/missing callback 및 IDB denied는 주입 검사. 실제 private mode나 OS 권한 차단을 재현했다고 주장하지 않음 |
| SDK event | sync subscriber 반환 후 M 작업을 큐잉해 교착 없음. 현재 AuthContext의 제품 연결 증거는 아님 |

추가 음성 대조는 scratch 번들에서만 oncomplete 전에 성공하도록 바꿔, 실제 browser의 delete 성공 뒤 abort 회귀가
실패하는지 확인했다(exit 1). 제품 원본은 바꾸지 않는다. 전체 verify/독립 검토/통합은 별도 단계이며
이 문서의 타깃 검사만으로 대체하지 않는다.

## 후속 B/C의 선행 조건

B는 일반 logout뿐 아니라 signup rollback, callback 실패, bootstrap, recovery cancel/fail-closed,
alreadyCleared, terminal 마무리의 기존 모든 경로와 AuthContext를 연결해야 한다. 이미 M을 잡은
caller에게 M을 다시 잡게 하면 안 된다. SIGNED_OUT(null) 전에 exact registry ticket을 보존하고,
즉시 비노출 처리와 callback 밖 cleanup을 나눠야 한다. 실패 UX를 logout 완료로 표시하지 않는다.

외부 revoke·BroadcastChannel 누락·null event 전에 프로세스가 종료되는 경우에는, 이번 A만으로
신뢰할 수 있는 폐기 증거나 즉시 물리 삭제를 증명하지 못한다. global signOut의 다른 기기는 다음
refresh 때 취소를 알 수 있고 access JWT는 expiry 전까지 남을 수 있다. 이 범위를 B에서 검증하고
확정하기 전에는 production body writer를 연결하지 않는다.

C는 원문 암호화 결정/구현, 실제 writer의 고정 7일/clock rollback, immutable pending/unknown
intent, revision CAS, 두 탭 write-vs-purge, 늦은 복원·입력·재시작 및 terminal owner 전체 purge ACK를
완성해야 한다. 서버 content generation/wipe receipt, keyed finalization, 기록·coverage·AI hold의
동일 transaction 저장, T36 server rule, 6시간 session, 승인 문구·동의·연령·안전 경계와 기기 확인도
남아 있다. 이번 로컬 generation은 그 조건들을 ready로 바꾸지 않는다.
