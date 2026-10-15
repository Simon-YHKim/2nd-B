# T16 웹 초안 폐기 준비 A / B0a / B0b


## B0b 추가: 원 logout intent와 IDB version 2

준비 기준은 main `5f9bcc085b01e9a72a1a5b4683e96bd1407f1207`에 B0a R2
`e928ff711d642f999e25fd0602d0775afcb6184b`를 local merge한
`1b630b988ee6acc12687cab4fe99b1230edc9abb`다. B0a R2는 독립 검토 PASS H0/M0/L0,
구현 BLOCK 1회 이력을 유지한다. B0 설계의 BLOCK 1회와는 별도다. **B0b 자체의 독립 검토·전체
verify·CI·머지 및 제품 연결은 별도 단계다.** 이 준비 변경은 여전히 기존 인증 caller 다섯 곳,
AuthContext, 본문 writer, UI, native 저장소와 서버를 연결하지 않는다.

같은 DB 이름 `secondB.interviewWeb.v1:<storageKey>`의 IndexedDB version을 2로 올린다. control의
row version과 필드는 v1 그대로이며 active.logoutId는 null이다. `logoutIntents` out-of-line store에
singleton `current` 한 행만 추가한다. 필드는 정확히 v=1, kind=web-interview-logout, ownerId,
sessionId, storageGeneration, 원 activeRevision, 원 logoutId, 원 scope(global/local)다.
본문·token·token hash·임의 null expectation·SDK 완료 flag는 저장하지 않는다. 이 행은 로컬
작업 식별자이며 서버 폐기나 다른 기기의 JWT 무효화 증거가 아니다.

oldVersion 0에서는 세 store를 한 versionchange로 만든다. oldVersion 1에서는 같은 upgrade
transaction에서 기존 두 store의 정확 schema/control key-value/body key 관계를 검증한 뒤 empty
intent store를 추가한다. 기존 control/body를 복사·삭제·재발급하지 않는다. orphan, undefined 값,
unknown 필드/index/store/version, 손상된 관계는 abort한다. schema 생성 뒤 부분 실패도 전체
versionchange를 rollback해야 한다. blocked/timeout 뒤 늦은 upgrade는 schema를 만들지 않는다.
기존 연결은 versionchange 때 닫고, 옛 v1 adapter가 v2를 open하면 VersionError로 실패한다.

inspect/prepare/purge/lookup/activate는 같은 D 안에서 세 store의 전체 metadata key/value와 body
key를 함께 읽는다. 본문 payload는 읽지 않는다. 정확 empty는 세 store 모두 행 0일 때뿐이다.
active+body0, inactive+body0, orphan intent는 empty가 아니다. 모든 성공은 transaction.oncomplete다.

`resolveWebInterviewSignOut`와 already-M helper는 B0a의 실제 context identity/lifetime/drain을
계승한다. 첫 await 전에 expected와 request를 복사하고 M 아래 S 확인→fresh D→필요한 S 재대조→
D 준비/폐기 또는 receipt 조회→마지막 S/public signOut을 수행한다. S를 잡은 채 D를 기다리거나
D/S 안에서 M을 다시 얻지 않는다. readonly 관측을 밖에서 받아 인증 권한으로 소비하는 API는 없다.

- `new`는 명시적인 새 동작이다. 현재 stable auth와 fresh active/no-intent를 확인한 뒤
  `createLogoutId(copiedTicket)`를 정확히 한 번 호출한다. caller는 받은 ticket과 생성한 ID를
  실제 captured expected/scope와 함께 메모리에 보존할 수 있다. intent prepare oncomplete 전에는
  purge/SDK를 시작하지 않는다. 이미 pending intent가 있으면 new는 conflict이며 overwrite하지 않는다.
- `resume`은 ID 생성 함수가 없다. durable intent의 원 tuple/activeRevision/ID/scope를 복원하며
  expected.accessToken은 null이다. 같은 process의 `original`이 있으면 원 ID/tuple/revision/scope가
  durable intent와 모두 같아야 한다. active는 같은 ID로 purge, inactive는 원 activeRevision로
  lookup해 receipt.revision=activeRevision+1을 확인한다. 현재 auth를 다시 확인한 뒤만 SDK를 호출한다.
- active/no-intent 또는 옛 A의 inactive/no-intent에서 original도 없으면
  `unconfirmed-missing-origin`이다. 자동 ID 생성, inactive.revision-1로 원 요청 합성, SDK 호출은 0이다.
  실제 in-memory original이 있으면 active의 exact prepare를 재시도할 수 있다. 옛 inactive는 A의
  explicit helper로만 대조하고 intent를 소급 작성하지 않는다.
- initial empty는 같은 M의 auth-only다. new.scope 또는 resume.emptyScope는 이 분기에만 쓰인다.
  durable intent가 있으면 항상 원 intent.scope를 쓰며 emptyScope로 확대·축소하지 않는다. 원 bound
  original을 제출한 resume에 empty가 나오면 conflict다. auth-only는 purge receipt를 반환하지 않는다.

A의 기존 두 인자 purge/lookup은 유지한다. 인증 helper는 선택적인 세 번째 scope를 전달하며,
intent가 있을 때 같은 D에서 원 scope까지 검증한다. 따라서 기존 explicit helper로 원 local intent를
global signOut으로 확대할 수 없다. intent가 없을 때 known-null+실제 captured context의 A 계약은
그대로다. 단순 null에서 owner/session/ID를 추측하지 않는다.

prepare는 control/body를 바꾸지 않는다. purge는 원 intent와 active tuple/revision을 다시 대조하고,
A대로 control inactive/revision+1과 정확 body 삭제를 한 transaction에 commit한다. intent는 남긴다.
SDK 실패·응답 유실은 이 metadata를 지우거나 SDK-complete flag를 만들지 않는다. 새 M에서 원 ID로
재대조·재전달할 수 있으며 SDK side effect가 정확히 한 번이라는 보장은 하지 않는다.

새 activation은 같은 M, live stable auth, 정확 previous inactive receipt, 다른 generation을 요구한다.
matching intent 제거와 새 active control(revision+1/logoutId=null)은 같은 D에서 commit한다. active
pending intent를 activation으로 덮지 않는다. 후속 C writer는 자신의 D CAS에서 pending intent도
거부해야 한다. 이번 변경은 writer API나 body 쓰기를 구현하지 않는다.

| 관측/현재 auth | resolver 결과 |
|---|---|
| 정확 empty + stable/legacy/known-null | 기존 expected 비교와 fresh D 후 auth-only |
| active/no-intent + stable + 명시 new | 원 ID 1회→prepare 완료→exact purge→최종 SDK |
| active/inactive + matching intent + 같은 stable 또는 known-null | 원 ID/scope/activeRevision로 재개 |
| bound legacy, 다른 owner, 같은 owner의 새 session, auth read error | SDK 0, 새 ID 0, body/intent 보존 |
| no-intent + original 없음 | missing-origin, 자동 새 ID/SDK 0 |
| scope/ID/tuple/revision 불일치, corrupt/unsupported/blocked/timeout/abort | 성공 receipt/SDK 0 |
| prepare 완료 전달 지연 또는 callback scope 종료 | 해당 invocation purge/SDK 0; intent의 실제 commit 가능성은 fresh D에서만 재판정 |
| SDK 실패 또는 완료 직후 재시작 | intent/receipt 보존, current auth 재대조, 같은 원 작업의 재전달만 |
| 새 generation activation 뒤 옛 작업 재시도 | 옛 작업 conflict, 새 body/auth 보존 |

실행 검증은 기존 A/B0a runner를 확장한다. 실제 Chromium IDB2/Web Locks/두 page, 실제 SDK/runtime,
합성 네트워크 응답을 쓴다. v1 exact/손상/부분 upgrade abort, prepare request-success 뒤 abort/늦은 ACK,
동시 다른 ID/scope CAS, known-null/foreign/legacy/unknown, 새 generation과 옛 retry를 검사한다.
전용 profile SIGKILL은 prepare 전/queued prepare/prepare 후/purge 후/SDK pending/SDK 후 여섯 지점에서
원 ID 복구 또는 missing-origin을 확인한다. 전원 차단이나 실제 기기의 저장장치 고장을 검증한 것은 아니다.
현재 관련 6 suites/154개(그 안의 session-mutation-v2 96개)와 실제 Chromium 55그룹이 통과했다.
55그룹은 A19/B0a14/B0b22이며 기존 검사를 중복 합산하지 않는다. scratch 변이 5종(조기 prepare ACK,
missing-origin에서 새 ID, scope 확대, 미검증 upgrade, 새 generation의 옛 intent 잔존)은 모두 실제
assertion에서 실패했다. 최종 artifact hash는 해당 구현 handoff/receipt에 동결한다. 앱 설정 parity/운영 Auth/폰 검증으로
바꾸지 않으며 B1/B2와 서버 선행 조건 전에는 제품 활성화하지 않는다.

## B0a 추가: 이미 가진 M과 초기 빈 저장소

2026-10-15, 기반 `9460615ac47ea18bb0046eec95789fb073df1e42`. B0 설계 R1 BLOCK 1회 뒤 독립 R2
PASS를 받은 계약의 첫 구현 단위다. 구현 독립 R1은 H0/M1/L0으로 BLOCK 1회이며, 아래 R2 수정은 별도 재검토 대상이다. 제품의 기존 다섯 인증 caller와 AuthContext는 연결하지 않았다.
아래 A의 exact ticket/purge 계약과 IndexedDB version 1의 두 store는 유지한다. **이 절은 B0a 당시 경계다. B0b의 durable intent/IDB2/resolver 준비는 위 별도 절에서 다룬다.**

`session-mutation.ts`는 실제 runtime이 발급한 context 객체를 callback 수명 동안 private WeakMap에
보관한다. `runWithWebAuthMutationContext`는 같은 runtime·같은 context·살아 있는 callback·실제 웹 M을
요구한다. public `destructiveSafe` 값을 복사하거나 저장한 객체로 권한을 연장할 수 없다. 종료한 context,
다른 runtime, retired runtime, process fallback은 새 helper 작업을 시작하지 못한다.

동기 callback의 일반값 반환과 throw는 같은 JavaScript stack에서 등록 문을 닫는다. 반환값이 native
Promise면 기존 await의 settlement 관측까지 열린다. foreign/custom thenable은 getter를 한 번만
읽으며, getter 실행 중에는 문을 닫아 재진입을 거부한다. 실제 then 함수가 확인된 뒤에는 비동기
assimilation과 중첩 Promise adoption이 끝날 때까지 수명을 유지한다. first resolve/reject 이후 throw는
Promise 규칙대로 무시하며, 실제 settlement를 관측한 뒤의 microtask는 새 작업을 등록할 수 없다.
동기값에도 무조건 await를 적용해 callback 반환 뒤 microtask에서 D를 시작하던 R1 M1을 수정했다.

이미-M helper는 첫 await 전에 작업을 등록하고 그 Promise 자체를 반환한다. 정상 await는 그대로
helper 종료→callback 종료→M 해제다. caller가 실수로 helper를 await하지 않고 callback을 끝내면 새 작업과
다음 단계 시작을 닫고 **등록 작업이 settle할 때까지 M을 유지**한다. getSession/D 대기 뒤에는 SDK를
시작하지 않는다. public SDK signOut을 이미 시작했다면 취소했다고 주장하지 않고 SDK 종료까지 M을
유지한다. 이 경우 결과는 성공이 아니며 이미 commit한 D를 복원하지 않는다. callback 원 오류가 있으면
그 오류를 보존하고, 그렇지 않으면 등록 작업의 오류를 전달한다. SDK 무응답을 임의 timeout으로 성공
또는 잠금 해제로 바꾸지 않는다. 등록 작업이 없는 기존 ordinary auth callback은 같은 계약을 유지한다.

`signOutExpectedWebInterviewSessionInsideMutation`은 실제 context를 받아 M 재획득 없이 A의 원
expected/ticket/logoutId를 처리한다. outer 함수도 같은 helper를 쓴다. guard wrapper는 실제 SDK의
getSession await 뒤와 signOut 직전에 scope를 확인하며 기존 expected-session primitive를 재사용한다.
S를 보유한 채 D를 기다리거나 D 안에서 S/M을 얻지 않는다.

`lifecycle.inspect()`는 기존 schema/control/body key 검사를 같은 readonly D에서 수행하며 성공은
oncomplete뿐이다. 반환은 empty/active(ticket)/inactive(receipt)이고 **SDK 허가증이 아니다.**
active인데 body가 0인 경우와 inactive는 empty가 아니다. control 없음+body 있음, 잘못된 schema/field/key,
다른 tuple, denied/blocked/timeout/abort는 empty로 바꾸지 않는다. 아직 DB가 없는 첫 catalog 생성은
기존 A 초기화에 따르며 본문 폐기로 세지 않는다. body payload는 읽거나 반환하지 않는다.

`signOutEmptyWebInterviewSession`과 inside-M 버전은 이전 observation을 입력으로 받지 않는다.
매 호출 **M→S(expected 확인, 종료)→fresh D empty/oncomplete→S(최종 비교, public signOut)→M 해제**다.
성공값은 `{kind:"auth-only"}`이며 purge receipt/원문 삭제/과거 보관 미사용 이력을 만들지 않는다.
SDK 실패 뒤 재시도나 다음 callback에서도 반드시 fresh D를 확인한다. 다른 탭 activation은 같은 M을
요구하고, 미래 writer는 D에서 exact active tuple/revision CAS를 해야 한다. 모든 body write에 M을
새로 요구한다는 뜻은 아니다. 실제 writer 연결은 후속 C의 검토 범위다.

| 상태 | B0a 동작 |
|---|---|
| 정확 초기 empty + 같은 stable session | auth-only 허용. 같은 session의 token rotation 유지 |
| 정확 초기 empty + legacy | 기존 owner/token equality만 메모리에서 사용. token 교체면 거부 |
| 정확 초기 empty + known-null | expected null 또는 원 non-null expected의 이미 지워짐 의미 유지 |
| bound active/inactive | empty helper는 거부. 원 stable expected + exact ticket/ID의 explicit helper만 가능 |
| D 불가/오류 또는 auth read 오류 | SDK 0. known-null이나 empty로 접지 않음 |
| D 이후 다른 owner/새 session | 기존 최종 비교로 SDK 0. 이미 폐기된 D를 복원하지 않음 |
| callback 종료/복사 context/다른 runtime | 새 D/SDK 시작 0. 이미 시작한 작업만 M 안에서 settle |

실행 검증은 기존 auth-js 2.106.1 SDK/runtime과 기존 Jest suite를 확장하고, 실제 Chromium runner의
A 검사에 B0a 반례를 더했다. SDK의 네트워크 응답과 fault만 synthetic이며 IDB/Web Locks는 실제다.
R2에서는 관련 6 suites/137개(그 안의 `session-mutation-v2` 79개)와 Chromium 33그룹이 통과했다. 로그는 최종 handoff/receipt에 동결한다. R1의 Jest `session-mutation-v2` 69개와 Chromium 31그룹 PASS만으로는 위 동기 반환 반례를 잡지 못했다. 기존 A의 19그룹을 유지하고,
empty/legacy/null/readonly abort·늦은 완료, fresh retry, context 복사/재사용, 두 page activation 대기,
callback 조기 종료의 실제 S/IDB/SDK 6시점을 추가했다. 실제 LockManager의 held/pending도 검사한다.
전용 browser profile의 SIGKILL/restart 4시점은 A의 보관 사실 검사이며 B0b 복구 구현 증거가 아니다.
R1 scratch 번들 음성 대조 4종도 실행했다. 조기 D ACK, context 복사 허용, 등록 작업 drain 제거,
empty 관측 캐시 재사용이 각각 실제 브라우저 assertion에서 실패했다. 제품 소스에는 변이를 넣지 않았다.

R2는 동기 반환/throw 뒤 실제 D·auth-only·explicit helper의 시작 0, then getter 재진입 0, 실제 SDK를 기다리는 thenable의 두 page M 대기를 추가 검사한다. R1 독립 반례 원본·관측은 보존하고 별도 출력에 재실행한다. R1 runtime을 scratch 번들에 되돌리는 음성 대조도 추가했다.

B0a R2 독립 검토는 PASS H0/M0/L0이며 구현 BLOCK 1회 이력을 유지한다. 전체 verify/CI/merge는 root의 통합 원장으로 관리한다. B0a를 B0 전체, 웹 로그아웃 제품 통합, 원문 자동
보관, 서버 generation, 폰 QA 또는 T16 완료로 표시하지 않는다. 기존 five-caller/B1, 외부 이벤트/B2,
법무 원문 TODO 및 서버 S0/S1/S2는 그대로 남아 있다.

## A 구현 기준과 기존 증거

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
