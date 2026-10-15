# 인터뷰 초안 v2 네이티브 저장 준비

T16의 세 번째 준비 단위다. v2 codec/순수 복원 #2577 다음에 전용 namespace와
revision CAS를 추가한다. **화면에서 읽거나 저장하는 연결은 없으며 production의
content-generation 제공자는 명시적으로 null이다.** 따라서 현재 제품 접근 함수는
`unconfirmed`이고 본문·empty·보관 성공을 반환하지 않는다. 테스트에서 제공한
generation을 운영 서버에서 확인했다고 주장하지 않는다.

기준 main은 `62c7a2df34edf48a2fb32ed22997d07f27b41abc`다. 승인 연결 설계 SHA256은
`cbd8a11610e95f6d52308dc9b93c2ca551c6ef1164d479887764b2326e371ac2`, 이번 준비 계획은
`d109fa4807a86833158d894ed67cf1346f08bedad0e13849cd328e70cbf350fe`다. 연결 설계의
R1 BLOCK1 → R2 PASS와 v1 모듈의 별도 R1 BLOCK1 → R2 PASS 이력은 유지한다.
이 새 adapter도 첫 검토 `c3428a56`에서 H0/M1/L0 BLOCK1을 받았다. 아래 반환 시각
경계를 보완한 후 R2 독립 검토를 받아야 한다. 세 검토 이력은 별도로 보존한다.

## 저장과 소유 경계

새 `draft-snapshot-store.ts`는 `interview.drafts.v2.<owner>`만 읽고 쓴다.
`interview.drafts.v1.*`, v1 codec/store 및 기존 보관 자료를 변경하거나 자동 이주하지
않는다. v1과 v2는 함께 남을 수 있다. 기존 v1의 TTL/key/CAS 계약도 그대로다.

adapter가 owner/ID/revision/생성·만료 시각/content generation을 소유한다. create는
첫 시도에서 ID와 시각을 고정하고, replace/discard는 exact draft ID와 revision으로
현재 값과 대조한다. 이미 읽은 초안을 버린 access는 create로 같은 대화를 되살리지
못한다. 새 논리 대화는 새 access/ID로 시작하며 기존 유효 자료를 자동 덮어쓰지 않는다.
만료 자료를 발견한 access도 정리 뒤 새 access를 요구한다.

입력과 expected revision은 await 전에 복사한다. 보관 결과 역시 별도 JSON 객체다.
호출자가 첫 반환 객체를 다음 저장의 입력으로 쓰고 그 객체를 나중에 수정해도 이미
큐에 든 입력은 바뀌지 않는다. 종료된 대화의 stable state 변경과 진행 중 request의
identity 변경은 거부한다. pending request를 읽었다고 모델을 다시 호출하지 않는다.

owner lease는 A→B→A와 인증 null을 구분한다. 별도의 content lease는 신뢰할 수 있는
durable generation 증거에 결합되고 동기 검사·무효화 후 되살리지 않는 계약을 요구한다.
기존 account epoch나 T38 메모리 방어만으로 이 증거를 만들지 않는다. queue/저장 await
뒤와 **공개 Promise 마지막 반환 직전**에도 검사를 한다. content 검사 안에서 동기
owner 전환이 일어나는 경우까지 마지막 owner 검사를 다시 한다. 후속 화면은 자기
commit 경계의 owner/view/input ticket도 별도로 확인해야 한다.

| 결과 | 뜻 |
|---|---|
| `stored` / `loaded` | 로컬 암호화 보관 ACK 또는 읽기. 서버 최종 저장·진전·AI hold 완료 아님 |
| `quarantined` | 확인된 새 generation에서 발견한 옛 본문. 원래 generation/TTL/intent 그대로이며 실행권 없음 |
| `unconfirmed` | authority·저장·복구 확인 실패. 본문이나 empty·성공 ACK 없음 |
| `stale` | 캡처한 owner/generation access 무효. 새 generation으로 갈아 끼워 재시도하지 않음 |
| `conflict` | 다른 draft/revision, 저장 intent, 종료 상태 또는 격리본과 충돌. 기존 값 보존 |
| `expired` | 원래 만료/시계 역행 경계에 도달한 본문 비노출. 서버 성공을 뜻하지 않음 |

생성 시각 + 7일과 256 KiB 상한을 그대로 적용한다. 편집·재시작·저장 unknown·내용 삭제
때 TTL을 늘리거나 본문 일부를 자르지 않는다. 만료 삭제 ACK가 실패하면 `unconfirmed`다.
접근 시 만료를 확인하며 만료 순간 앱이 꺼져 있어도 디스크를 지운다는 약속은 하지 않는다.

R1에서 내부 read/write의 마지막 검사 뒤 Promise 반환 전까지 만료 시각을 넘길 수 있음을
확인했다. 이제 **본문을 포함하는 모든 공개 결과의 마지막 동기 경계**에서 시각을 다시
검사한다. 만료·생성 전으로 역행·유효하지 않은 시각이면 본문/보관 성공을 숨기고
`unconfirmed`를 반환한다. 이 시점에는 삭제 ACK가 없으므로 `expired`나 정리 완료로
추정하지 않는다. 비동기 삭제를 뒤에 몰래 예약하지 않으며 다음 owner queue 접근이
실제 만료 제거를 확인하면 `expired`다. 이후 새 초안의 revision/ID를 옛 정리로 지우지 않는다.

## 미확인 저장은 완료가 아니다

`beginSave`는 pending request가 없는 현재 stable snapshot을 원래 draft revision과
request/session key에 결합해 보관한다. 이 함수는 서버/모델을 호출하지 않는다.
로컬 envelope revision이 올라가도 intent의 원래 revision은 고정이다.

save pending/unknown 동안 requestId/sessionId/draftId/revision/contentGeneration/
snapshot뿐 아니라 period/uiLanguage/conversationLocale/growthOrigin도 변경할 수 없다.
generic replace와 discard는 거부한다. 이 단위에서는 별도 편집본을 함께 관리하지 않는다.
`markSaveUnknown`은 같은 request의 status만 unknown으로 남기며 원래 intent를 유지한다.
새 key, unknown→pending 전환, 성공 추정 또는 재전송은 없다.

확인된 `committed/already_committed` receipt가 없으므로 완료 cleanup API도 없다.
TTL 만료와 terminal account purge는 보관 수명 종료로 별개이며 서버 저장 완료로
돌려주지 않는다. 7일 이후의 본문 없는 receipt 보관/조회 정책은 서버 단계에 남아 있다.

## 암호화와 삭제 수명

v2는 encrypted-native-storage의 managed/ciphertext-only 두 목록에 함께 등록한다.
plaintext는 direct read와 startup migration 모두 거부한다. allowlist fingerprint가
바뀌므로 이전 migration marker로 검사를 건너뛰지 않는다. 기존 device master key,
sentinel, 용량 ledger와 auth/audit 예약량은 그대로다. AAD는 기존
`secondB.secureStorage.v1:` + 전체 logical key이므로 v1↔v2 또는 owner 사이의 ciphertext
복사는 읽을 수 없다. 키가 없으면 새 키나 plaintext fallback을 만들지 않는다.

native 일반 logout/null 인증은 기존 원문 ciphertext를 보관하되 예전 lease를 무효화한다.
내용 전체 삭제 역시 계정 삭제가 아니며 이 adapter가 원문 전체 삭제를 새로 승인하지 않는다.
늦은 쓰기 복구가 옛 원문을 되돌려도 그 generation은 그대로여서 격리본일 뿐이다.

terminal 계정 삭제는 기존 영구 fence 이후 `local-purge.ts`가 v1과 v2를 모두 기다린다.
v2는 같은 owner queue 뒤에서 exact owner key만 지운다. 키/generation을 확인하지 못해도
terminal 삭제는 가능해야 한다. 다른 owner의 두 namespace는 유지한다. 제거 실패나
aggregate 5초 deadline은 `unconfirmed`이고 성공이라고 표시하지 않는다.

## 검증과 남은 제한

기존 `draft-store.test.ts`의 실제 Node AES-256-GCM과 제품 encrypted adapter harness를
재사용했다. v1 32개 검사를 유지하고 v2 roundtrip, v1 bytes 보존, owner/namespace AAD,
원래 TTL, 키 유실, write/remove/rollback 실패, CAS, 반환 객체와 입력의 분리, pending
intent/metadata 불변성, ordinary logout, terminal purge를 실행한다. 모든 공개 연산의
Promise가 아직 pending인 microtask 경계에 계정 전환/ABA/내용 wipe/terminal fence를
넣어 본문과 성공 ACK가 나오지 않음을 확인한다. content 검사 안의 reentrant owner
전환도 별도로 실행한다. 구현 판정문을 테스트에 다시 써서 비교하지 않는다.

v2 codec/순수 restore 및 실제 화면 send/ask/finish AST 회귀도 다시 실행한다. 저장 모듈
테스트의 fake backing은 장애·순서 제어용이다. encrypted storage suite의 deterministic
seal과 실제 AES-GCM suite는 구분하며, 어느 쪽도 실제 폰 강제 종료 내구성 증거는 아니다.

R1 작성자 확인은 대상 7개 suite / 221개 검사 PASS였으나 독립 만료 반례 5개가 이를
보완했다. 같은 원인에 대해 만료/시계 역행/잘못된 시각 × 본문 반환 6종 및 실제 실패·
대기 중 정리/새 초안 보호를 검사하는 19개 회귀를 추가했다. 원 R1 제품 코드에서
19개가 모두 실패하는 음성 대조를 먼저 실행했다. 대상은 draft-store, draft-restore,
실제 화면 interview-verdict-states, encrypted-native-storage, local-purge,
local-deletion-fence, account-epoch다. 최종 실행 수·type-check/lint/cycles 결과는
frozen 커밋 인수에 기록하며 전체 verify와 독립 검토는 별도 통합 관문이다.
R2 작성자 실행은 대상 7개 suite / 240개 PASS와 원 독립 반례 5개 PASS다(반례 파일의
기존 86개 skipped는 재실행 수에 포함하지 않는다). type-check, 변경 TypeScript lint,
runtime cycles 0, 어휘 및 diff whitespace 검사도 통과했다.

local CAS와 rollback queue는 **한 production instance/프로세스 안의 보장**이다.
factory를 여러 writer로 만들거나 다중 프로세스 원자성을 주장하지 않는다. crash 때
메모리 rollback이 사라질 수 있고 공개 반환 직전 무효화되면 보관된 옛 generation의
ciphertext가 남을 수도 있다. 다음 접근은 owner/AAD/TTL와 durable generation을 새로
확인해야 하며 이전 프로세스 epoch나 불명 상태를 성공으로 추정하지 않는다.

UI 활성화 전에는 M1 durable generation/wipe receipt, 기록·coverage·AI hold의 같은
transaction/멱등 최종화, unknown 조회와 실제 receipt cleanup, T36 새 immutable rule,
6시간 서버 세션과 7일 본문 정책, fresh coverage 실패 구분이 필요하다. 웹의
M→exact session→D purge ACK→SDK signOut과 두 탭/재시작 검증도 별도 작업이다.
승인 화면·법무/동의·연령/owner/위기 가드 및 같은 설정 main/8081/APK·기기 확인을
끝내기 전까지 T16 전체 완료로 표시하지 않는다. 이번 단위는 UI·auth·SQL을 바꾸지 않는다.
