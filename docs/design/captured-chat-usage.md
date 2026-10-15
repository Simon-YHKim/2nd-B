# Captured chat usage 준비

C1b 최초 준비 기반 `f08577e5`는 main `218dbabb`와 D3a R1 `e7e9015c`의 로컬 통합이다.
현재 준비 기반 `c181080f`에는 D3a R2 `d5d803f7`을 추가 통합했다. D3a R2 독립 검토와
최종 main 병합은 아직 별도 선행 조건이다. 이 연결은 제품 caller·화면·기본 singleton을 추가하지 않는다. D3a 후속
검토 수정과 최종 main 통합·전체 검증을 준비 기반 검사로 대신하지 않는다.

## 선택 API와 발행 순서

`bumpChatUsageIfUnderCap`의 기존 3인자 호출은 같은 SDK RPC·응답·오류 정책을 유지한다.
선택 4번째 인자는 `{ session, observer }`를 함께 요구한다. observer에는 원 owner lease,
content generation, operationId/stepId와 공통 ledger의 좁은 포트가 있다. session만 주면
실패하며 legacy 호출로 되돌아가지 않는다. 새 caller 연결은 C1c/C3 이후다.

userId·session userId·observer ownerId와 epoch, 현재 generation/open 상태를 먼저 검사한다.
인증된 원 token/signal은 ticket 등록 전에 포착한다. acquire가 등록 publish 뒤 재검사하고,
issue가 최종 caller gate와 원 ticket을 검사한 다음 issued-pending 표시와 실제 transport를
같은 동기 구간에서 실행한다. dispatch 전 await/추가 auth 조회/사용자 callback은 없다.
원 `bump_chat_usage_if_under_cap` 한 번만 호출하며 새 reserve/refund API는 쓰지 않는다.

응답은 현재 본문 gate보다 먼저 원 ticket에 기록한다. 성공은 SQL `RETURNS int` 범위의
양수 정수(1..2147483647)만 인정한다. p_cap은 기존 SQL에서 무시되고 서버 tier+ad_bonus가
한도를 정하므로 응답을 임의의 client cap과 비교하지 않는다. null/0/음수/소수/overflow,
문자열·객체·배열·잘못된 JSON은 unknown이며 count 0이나 무료 시도로 바꾸지 않는다.

확정 cap 거부는 HTTP 400과 JSON object의 code `P0001`, message `chat_limit_exceeded`가
정확히 일치할 때뿐이다(0090 SQL 및 PostgREST 계약). 성공 status의 오류 모양 JSON,
다른 HTTP/code, 부분 문자열, network 오류와 유실/잘못된 본문은 rollback 증거가 아니다.
확정 거부는 definitely-not-committed와 기존 typed error, 나머지는 unknown으로 남긴다.

settlement 뒤 현재 owner/session/content gate가 실패하면 count/본문을 반환하지 않는다.
이미 바뀐 owner의 원 commit 사실도 보존하지만 자동 모델 호출·삭제·재전송·새 operation ID
발급은 하지 않는다. D3a의 usage ticket은 결과 outcome만 보존한다. adapter는 검증한 count를
settlement에 전달하지만 현재 leaf의 snapshot count를 usage 영수증이라고 주장하지 않는다.
unknown의 수명·삭제 차단은 공통 leaf 계약이며 별도 usage ledger나 만료 timer는 없다.

## 읽기와 검증 범위

readChatUsage/readChatUsageDetail의 선택 세 번째 execution은 같은 userId·signal·현재
session을 첫 SELECT 전, 응답 뒤, catch에서 확인한다. 기존 user_id/day 필터·열·기본 KST day,
정상 없음과 일반 오류, ad bonus 의미는 유지한다. 이 읽기는 기존 mutable SDK SELECT다.
JWT 고정 전송은 captured quota RPC에만 해당하며 읽기가 같은 transport로 바뀌었다고 하지 않는다.

새 I01 검사는 실제 usage/JSON RPC transport/account lease/epoch/content ledger를 실행한다.
mutation transport는 fetch만 대역으로 두고 인증과 SDK 읽기에는 명시 fixture를 사용한다.
같은 JWT/signal, issued 시점, 정확 cap proof, invalid count unknown, 등록/최종 gate 재진입,
늦은 commit·cap·오류, account hold/ABA/release, 중복 step과 자동 재전송 0을 검사한다.
기존 account/session/transport/SSV/한도/SQL/대화 검사는 유지한다. 실제 서버 transaction·
운영 DB·앱/폰·C3 supervisor 연결의 증거는 아니다. 원 lease의 wipe 중 수명과 owner hold
즉시 취소는 후속 C3의 책임이며 이 helper가 이미 발행한 요청을 취소했다고 주장하지 않는다.
