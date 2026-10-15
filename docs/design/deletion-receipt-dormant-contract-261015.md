# T04/T05 · 비활성 삭제 접수 원장 첫 조각

기준 main `509654f3`. 10/06 서버 원장 우선 결정, RD-261007-12, Q-261013-32/44와
최소 서버 설계 독립 R1 PASS에 따른 **비활성 구현**이다. 과거 #2132 R2 BLOCK 이력을
유지한다. 이 문서는 원 설계 전체, 삭제 기능, 법무, 운영 적용의 완료 판정이 아니다.

## 이번 계약

`db/migration-drafts/UNNUMBERED_account_deletion_receipt_contract.sql`은
`deletion_receipt_private.accepted_requests`와 begin/lookup만 만든다. CLI
`supabase@2.116.0 migration new dormant_account_deletion_receipts`로 생성한 파일을
번호 없는 초안 위치로 옮겼다. 번호 예약·운영 migration·Edge·앱 호출 연결은 없다.

- 원장은 **accepted만 허용**한다. 완료·실패·폐기·dispatch·fence 해제 함수가 없다.
  0192의 기존 fence나 0225의 삭제 trigger를 변경하지 않는다.
- begin은 서비스 권한과 claim, 입력 길이·형식, 정확한 살아 있는 Auth 세션/계정,
  public.users 존재와 fresh iat를 검증한다. account advisory lock → user row → session
  순서이며, freshness와 session은 잠금을 기다린 **뒤** 다시 확인한다.
- 같은 owner/request/session/key version/hash의 재시도는 같은 확인 번호·시각을 반환한다.
  다른 request는 진행 중 충돌, 같은 request의 결속 변경은 불일치다. 기존 legacy fence가
  있으면 접수하지 않으며 그 fence를 새 작업의 소유로 취급하지 않는다.
- 공개 schema의 함수는 SECURITY INVOKER다. private definer는 빈 search_path와 완전한
  객체 경로를 사용한다. 테이블 직접 권한은 service_role까지 모두 회수하고 RLS를 강제한다.
  네 helper의 EXECUTE는 service_role만 가진다. private schema는 Data API에 노출하지 않는다.
- lookup은 확인 번호·key version·조회 hash를 함께 확인한다. 복구 hash는 조회에 쓸 수 없다.
  응답은 version/확인 번호/accepted/접수 시각/범위/만료 null/네 가지 unknown 관측뿐이다.
  owner·session·request ID·hash·이메일·오류 원문은 반환하지 않는다. not_found는 해당 검증
  조합을 찾지 못했다는 뜻이며, 삭제 요청이 존재하지 않았다는 증명이 아니다.
- Auth/profile FK를 두지 않아 어느 행의 삭제도 원장을 연쇄 삭제하지 않는다. 두 행이 실제로
  없어져도 accepted는 accepted다. 그런 사실을 완료 관측으로 수집하는 executor는 후속이다.

lookup/recovery hash는 미래의 신뢰할 서버가 목적을 분리해 검증한 32-byte digest다.
이 SQL은 raw token 발급·서명·키 보관·회전·재발급·타이밍 방어·rate limit·HTTP 인증을
구현하지 않는다. DB 함수의 owner/session/iat를 공개 요청 body에서 그대로 옮기면 안 된다.
begin 응답 유실 뒤 동일 증표를 재생성할 수 있는 서버 계약을 구현하기 전 공개 endpoint를 열지 않는다.

## 실제 검증

격리된 로컬 PostgreSQL에 현재 forward migration **236개**를 다시 적용했다. CI의 Auth/Storage
호환 fixture와 Supabase 함수 기본 grant를 사용했고, 0147+는 고정 CLI 2.116.0으로 재생했다.
pg_cron은 CI와 같은 명시적 missing-cron opt-out이다. Auth/Storage fixture는 실제 관리형
서비스, JWT gateway 또는 Storage HTTP 요청의 증거가 아니다.

실행 명령은 전체 schema를 넣은 **새 disposable DB**에서 다음과 같다. 테스트가 fixture를
남기므로 반복 실행은 새 DB로 한다. DB URL이나 운영 환경 변수는 받지 않는다.

```sh
node scripts/test-deletion-receipt-sql.mjs polascope_local t04_receipt_test_schema
```

runner는 현재 staged migration version 집합이 정확히 같은지 확인한 뒤 다음 12개 그룹을
실행했다. SQL 단언은 실제 Postgres에서 수행하며 SQL 호출을 mock으로 대체하지 않았다.
`supabase-dry-run` CI도 전체 schema를 재생한 뒤 별도 DB로 복제하여 같은 runner를 실행한다.
기존 draft 등록 가드는 그대로 유지하고, 새 draft/runner를 등록했다. 이 필수 CI 연결 때문에
원장·rollback·SQL 회귀·runner·문서 5파일에 workflow와 등록 테스트를 더해 7파일이 됐다.

1. 현재 migration 버전 집합과 authenticated content-wipe 잠금.
2. 두 번 적용, 실제 SET ROLE·ACL·RLS·입력/세션/목적/idempotency, 삭제 0 및 허위 완료 0.
3. 같은 key의 동시 begin이 동일 영수증 한 건으로 수렴.
4. 다른 key의 동시 begin은 같은 owner 한 건만 허용.
5. legacy가 먼저 fence를 잡으면 기다리던 begin이 거부됨.
6. begin이 먼저 접수된 뒤 legacy가 실행되어도 accepted 유지. **이 경우를 막는 arbitration은 미구현**.
7. owner 잠금 대기 중 세션을 지우면 접수 거부.
8. 잠금을 기다리는 동안 5분을 넘긴 iat를 거부.
9. 실제 session-row transactionid 잠금 대기 중 iat 만료 또는 Auth soft-delete면 접수 거부,
   원장 0행·fence 변화 0. pg_stat_activity로 해당 대기 자체도 확인.
10. session-row 잠금을 기다린 유효 요청은 정상 접수되고 동일 key 재시도도 같은 영수증.
11. begin transaction rollback 뒤 원장/fence 없음, 다음 접수는 새 영수증.
12. 활성화 전 rollback이 helper를 닫고 행을 보존하며 reapply가 같은 영수증 복원.

구현 독립 R1은 **BLOCK H0/M1/L0**였다. account/user 잠금 뒤의 freshness 확인이
최종 session-row 대기 중 낡아지는 반례가 실제 DB에서 재현됐다. iat가 302초가 되거나
Auth 사용자가 soft-delete돼도 accepted가 생겼다. 같은 잠금 순서를 유지하면서 최종
session lock 뒤 두 사실을 다시 읽도록 보완했고, 새 회귀가 원 SQL에서 실패하는 것도
확인했다. 이 BLOCK 이력은 설계 PASS나 후속 검증으로 지우지 않는다.

Supabase security advisors도 로컬 DB에서 실행했다. 경고는 main의 public-schema 확장
pgcrypto/citext/pg_trgm/vector 네 건이며, 이번 객체에 대한 경고는 없다. 이것은 독립 보안
검토 또는 전체 production 검증을 대신하지 않는다. 실제 Auth/Storage 외부 삭제·공개 endpoint
테스트·운영 적용·앱 연결은 **0**이다. 전체 verify와 독립 코드 검토는 통합 단계에서 별도 기록한다.

## 후속 구현·활성화 조건

| 항목 | 필수 후속 |
|---|---|
| 공개 endpoint와 증표 | 최신 인증·정확한 owner/session/iat 도출, token 목적 분리·검증·재발급·회전·만료, 입력 제한·rate limit·no-store·비밀값 로그 금지. 서비스-only helper를 공개 grant로 열지 않는다. |
| 동시 실행과 fence | legacy/new 양쪽 arbitration, 기존 무주체 tombstone/이미 발송된 HTTP 전환 계획, 동일 owner 잠금 안 claim+fence 결속, dispatch generation CAS 및 reconciliation. accepted 행만으로 기존 삭제를 막았다고 하지 않는다. |
| 실제 완료 관측 | 동일 Auth UUID 삭제, profile 별도 확인, raw/photos API 반복 삭제와 빈 첫 페이지 재관측, 늦은 upload/overwrite 반례. profile DELETE 또는 Auth FK cascade를 완료 증빙으로 쓰지 않는다. |
| terminal 및 보관 | completed/failed/abandoned 상태 전이와 필요한 증거. 미확인을 타이머로 failed로 바꾸거나 fence를 풀지 않는다. accepted-only 초안에는 자동 만료·정리도 없다. |
| 승인/법무 | 완료 365일은 승인된 제품 값이다. 기산점·항목의 법무 적정성은 별도다. 30일은 옛 실패·포기 설계/고지 값이며 확정 terminal과 장기 미확인을 구분해야 한다. owner/session/hash·기기 메모·로그는 각기 수명을 정한다. 법무 완료 원문은 미복구 TODO. |
| 기기/앱 | intent 영속 확인 뒤 execute, 별도 복구 capability 검증, owner/session/generation 및 CAS, A→B/ABA/다중 탭, local purge와 서버 사실의 분리. Web Locks 지원이나 T16 초안 정리가 완료된 것으로 세지 않는다. |
| export/erasure | private 원장의 개인정보 분류·내보내기·보관/정리 정책을 명시한다. public 82표 registry guard 통과를 이 새 private 원장의 정책 검증으로 세지 않는다. |
| 배포/rollback | 새 번호 예약 즉시 coordinator push, DB → Edge → 앱 순서. 이번 down은 **공개 전** entrypoint 제거용이며 행은 보존한다. 공개 후 lookup/in-flight 복구를 보존해야 하므로 이 down을 그대로 재사용하지 않는다. |

현재의 legacy exact `{}` 계약, 기존 앱의 메모리 영수증 및 local terminal 문제, 메일/법무
2단계 계획은 이 첫 조각에서 변경하지 않았다. 최소 서버 설계 전체가 요구한 실제 Storage/Auth
반례와 기기 검증도 계속 남는다.
