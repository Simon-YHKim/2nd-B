# T04/T05 · 비활성 삭제 접수 원장 첫 조각

> 2026-10-24 다음 조각: [종료 상태·휴면 완료 관찰](deletion-receipt-terminal-261024.md).
> 아래 accepted-only/중재-only 서술과 검증 수치는 각각 그 단계의 이력이다.
> 현재 묶음의 terminal·만료·private 데이터 분류·번호 조건은 새 문서를 함께 따른다.

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

## 2026-10-24 후속 조각: 양방향 진입 중재 (번호 없는 초안)

**선택: (b)의 진입 중재.** 위 시험 6의 빈칸은 완료 관측 없이 재현하고 닫을 수 있다.
(d)+(f)는 아직 없는 실행 증거와 보관 정책에 의존하므로 먼저 구현하지 않았다.
Q-261013-32의 「정해 둔 재설계(#2132)를 이어 간다」를 따른다. #2132의 과거 BLOCK,
첫 조각의 R1 BLOCK 이력, 10-18 23:19 / 10-20 09:22의 운영 gateway commit 계약 확인 전
O/H 활성화 금지는 그대로다. VISION의 세 축이 공유하는 계정 데이터 경계에 해당한다.

`UNNUMBERED_account_deletion_receipt_arbitration.sql`을 첫 초안 **다음**에 적용한다.
두 원장에 `BEFORE INSERT OR UPDATE` 트리거를 두며 기존 0192/0225 함수는 교체하지 않는다.

| 먼저 커밋한 쪽 | 나중 요청 | 결과 |
|---|---|---|
| 기존 tombstone | 새 receipt begin 또는 원장 쓰기 | `receipt_legacy_fence_unresolved`, 새 영수증 없음 |
| 새 accepted | 기존 begin / verify 호환 래퍼 또는 tombstone 쓰기 | `receipt_request_in_progress`, 새 fence 없음 |
| 먼저 온 쪽이 rollback | 반대쪽 요청 | 잠금 대기 뒤 정상 진입 |
| 다른 계정 | 기존 삭제 요청 | 첫 계정 잠금을 기다리지 않음 |

두 트리거는 0192와 같은 계정 advisory lock을 얻고 **그 뒤 별도 SQL 문장**에서 반대
원장을 읽는다. stale snapshot이 잠금 승자를 숨기지 않도록 신규 쓰기·설치·rollback은
READ COMMITTED만 허용한다. 원장 owner 키 이동도 거절한다. helper의 직접 EXECUTE와
두 테이블 직접 권한은 anon/authenticated/service_role 모두 닫혀 있다.
새 접수는 여전히 accepted이며 fence를 소유하거나 만들거나 풀지 않는다.

설치는 두 원장을 NOWAIT로 잠근 뒤 같은 owner가 양쪽에 이미 있는 경우 전체를 거절한다.
기존 행을 합치거나 채택하지 않는다. `_arbitration_down.sql`은 **공개 전, 영수증 원장이
비었을 때만** 두 트리거와 helper를 제거한다. 영수증이 하나라도 남으면 전체 rollback을
거절하고 두 원장과 중재를 보존한다. 두 SQL 모두 하나의 transaction으로 실행해야 한다.
기존 receipt down으로 begin/lookup을 닫더라도 중재 트리거는 남는다. 행을 지워 down을
통과시키는 것은 운영 절차가 아니다. 공개 후 rollback은 별도 설계가 필요하다.

검증 명령(로컬 PG는 새 폴더, loopback의 빈 포트 사용):

```sh
node scripts/test-deletion-receipt-arbitration.mjs 55484 t04_arbitration_test_local --fixture
```

로컬 PostgreSQL 18에서 기존 accepted-only SQL 회귀를 포함한 **10그룹**, 실제
`pg_blocking_pids`로 확인한 양방향 **8개 경합 순서**, **SQL 변이 13/13**을 실행했다.
변이: 양쪽 상대 원장 검사·owner 이동·helper ACL·양쪽 snapshot 제한·설치/down snapshot
제한·양쪽 advisory lock·설치 충돌·비어 있지 않은 down. 변이는 disposable DB에서만
실행하고 행과 함수는 복원한다. 로컬 fixture는 실제 0192와 두 초안을 실행하며, 관리형
Auth/Storage나 전체 migration 재생의 증거는 아니다. CI는 전체 현행 schema의 새 clone에서
**같은 runner를 `--fixture` 없이** 실행하고 기존 public/auth/storage 함수 및 기존 trigger
catalog가 바뀌지 않았는지도 확인한다. 첫 초안만 실행하는 이전 12그룹은 역사적 기준선으로
유지되며, 시험 6을 닫았다는 근거는 이 두 번째 초안의 별도 레인이다.

앱/Edge 런타임에서 begin/lookup/private schema 호출 0, 기존 delete-account body `{}`,
epoch+1 안내 경계 유지 여부는 소스 계약 시험으로 고정한다. 앱 삭제 응답·메모리 안내의
기존 순수 함수 시험도 함께 실행한다. 새로운 완료 안내나 앱 동작 변경은 없다.

**남은 순서와 바깥 조건:**

1. (a) 공개 endpoint 및 서버 소유 owner/session/iat, 목적별 증표·한도·재발급 계약.
2. (b)의 활성화 준비: 이미 발송된 legacy HTTP drain/조정, 무주체 tombstone 처리 계획,
   동일 계정 잠금 안 실행 claim+fence 결속 및 dispatch generation CAS/reconciliation.
   이번 진입 중재는 이미 발송된 Auth/Storage 요청을 회수하지 못한다.
3. (c) P #2627 위에서 Auth UUID·별도 profile·raw/photos 완료 관측. O는 gateway commit
   계약 확인 전 켜지 않는다. H도 같은 바깥 조건을 유지한다.
4. (d)+(f) 증거에 근거한 completed/failed/abandoned와 private 원장의 내보내기·지움·보관
   분류. 시간 경과를 실패로 확정하거나 fence 해제의 근거로 쓰지 않는다. 기존 public
   erasure/export 검사 통과는 private 원장 정책 검증이 아니다.
5. (e) 서버 영수증 기반 앱 안내, 기기 복구·소유권·동시 탭 경계 검증.

번호 부여·운영 적용·실제 계정 삭제·처리방침/법무·메일·O/H 활성화·머지는 이 조각의
범위 밖이다. 독립 검토 PASS + 새 medium 0 + CI 초록이 머지 조건이며 코디네이터가 맡는다.
