# T04 2조각: 종료 상태와 휴면 완료 관찰

기준 `e778ca12`(#2733). DECISIONS 26.10.24 20:49의 「이 초안은 (c) · (d)와 함께만 번호를 붙이고」에 따른 번호 없는 준비다. 26.10.18 23:19 · 26.10.20 09:22의 운영 gateway commit 계약 확인 전 O/H 활성화 금지를 유지한다. VISION 세 축의 공통 계정 데이터 경계다.

## 이번 동작

설치 순서는 **contract → arbitration → terminal**이다. 앞선 accepted-only 시험과 중재 시험은 각각의 역사적 단계에서 계속 실행하고, terminal은 별도 DB에서 세 초안을 함께 실행한다. 운영 번호·마이그레이션·공개 endpoint·앱 연결·삭제 발행은 없다.

SQL도 이 순서를 강제한다. terminal은 두 중재 트리거가 올바른 표·guard에 결속된 활성 BEFORE INSERT/UPDATE 행 트리거인지 먼저 확인한다. 하나라도 없거나 꺼져 있으면 `receipt_terminal_requires_arbitration`으로 거절한다. arbitration은 `admission_expires_at` 열 또는 `receipt_terminal_shape` 제약이 있으면 `receipt_arbitration_terminal_already_installed`로 거절한다. terminal down 뒤에도 이 흔적이 남으므로 이전 guard로 덮어쓸 수 없다. 각 파일은 한 transaction으로 실행한다.

**번호 부여 시 권장:** 세 설치 단계를 하나의 원자적 마이그레이션으로 합쳐 중간 상태를 배포하지 않는다. 역사 단계 시험은 유지하고, 최종 guard만 설치하는 통합본의 적용·재적용·거절 시험을 다시 검토한다. 이번에는 파일 통합이나 번호 부여를 하지 않는다.

| 상태 | 다음 상태 | 필요한 사실 | 기존 삭제 진입 |
|---|---|---|---|
| accepted | executing | 만료 전 같은 owner 잠금, 고유 execution ID 예약 | 거부 |
| accepted | failed | 실행 예약 전 서버의 확정 거부 | 다시 허용 |
| accepted | abandoned | 실행 예약 전 취소 또는 접수 10분 만료 | 다시 허용 |
| executing | completed | 같은 operation/owner/execution, 시작 뒤 관찰, Auth와 profile 각각 부재, raw/photos 빈 상태, 발송한 쓰기의 종료 확인 | 영수증이 더 이상 거부하지 않음 |
| executing | executing | 오류·시간 경과·응답 유실·일부 관찰·정합 확인 미완료 | 계속 거부 |
| completed/failed/abandoned | 동일 상태 | terminal 재조회·재시도 | 새 실행으로 돌아가지 않음 |

`start`는 실행 예약이며 **파괴 요청을 발송할 권한이 아니다**. 이 초안에는 fence claim이나 dispatch가 없다. 실제 O 연결 전 동일 계정 잠금 안에서 operation-owned fence와 dispatch generation을 결속해야 한다. 기존 legacy tombstone을 새 작업의 fence로 채택하거나 지우는 코드도 없다. 이미 시작한 요청을 failed/abandoned로 전환하는 일반 API는 제공하지 않는다. 그 전환은 알려지지 않은 외부 요청이 남아 있지 않다는 별도 reconciliation 계약이 필요하다.

기한은 `admission_expires_at`이며 영수증 보관 만료와 다르다. legacy 진입 트리거도 같은 계정 잠금 아래 미실행 접수의 만료를 먼저 확정하므로 조회·cron이 없어도 옛 경로가 열린다. 잠금을 기다리다가 기한이 지나면 start는 abandoned를 반환한다. executing의 접수 기한이 지나도 실행 예약을 뺏거나 차단을 풀지 않는다.

**O 활성화 전 필수: executing 수습 계약.** 실행자 실패나 execution ID 분실은 현재 completed 이외의 출구가 없어 양쪽 삭제 진입을 계속 막는다. 이 초안의 호출부 0은 활성화 뒤의 수습을 대신하지 않는다. operation ID를 실행자에게 전달하는 기능과 함께 다음을 구현·검토해야 하며, 그 전에는 O를 연결하지 않는다.

- 같은 owner/operation/execution에 대한 관리자 전용 조회와 실행 ID 복구 또는 같은 실행의 재개.
- failed/abandoned 해제 전 실행자와 dispatch generation을 차단하고, 이미 발송된 Auth/Storage 요청과 늦은 쓰기가 남지 않았다는 증거. 시간 초과·HTTP 오류만으로는 해제하지 않는다.
- 운영자 수동 해제를 포함한 권한 제한과 감사 기록: 담당 주체·사유·시각·원 실행·이전/다음 상태·외부 요청 종료 근거. 원장 직접 DELETE를 정상 수습 절차로 삼지 않는다.
- 수습/완료/새 삭제의 경합, 중복 수습, 오래된 실행자의 늦은 응답, 감사 저장 실패 시 무변경 시험.

이 조각에는 실제 실행자·dispatch·감사 저장 계약이 없으므로 임의 해제 API를 추가하지 않았다. 이 항목은 낮음의 활성화 게이트이며 설치 순서 medium 수정과 별개다.

활성 행은 owner마다 하나이고 terminal은 보존된다. 이전 request를 다시 보내면 같은 terminal을 반환하며, 다른 request는 활성 작업과 legacy fence가 없을 때 새 행을 받는다. terminal·binding은 변경할 수 없고 삭제 권한은 직접 부여하지 않는다. 실제 legacy begin의 인증·사용자 존재 확인은 그대로이므로 completed 뒤 계정이 없는 사용자를 새로 인증해 준다는 뜻은 아니다.

## 완료 관찰자

`supabase/functions/delete-account/receipt-observation.ts`의 `observeReceiptCompletion`은 O에 연결할 **읽기 전용 부품**이다. `src`·Edge의 런타임 호출부는 0이며 Jest가 이 경계를 검사한다. 실제 Auth/Storage SDK 어댑터, RPC 발행, 삭제·재시도·타이머·singleton은 없다.

주입된 서버 read port를 통해 다음 순서로 확인한다.

1. 원 owner/operation/execution/start 시각과 일치하는 executing scope, 그 작업의 fence 소유 및 발송된 쓰기의 종료 확인.
2. raw-clippings와 record-photos 각각의 첫 페이지가 빈 상태인지 확인.
3. 같은 Auth UUID의 명시적 `user_not_found`/404, 같은 profile의 별도 빈 조회.
4. 두 저장소의 첫 페이지를 다시 읽고 같은 scope를 다시 확인.

두 번째 읽기에 늦은 업로드가 보이면 unknown이다. 빈 페이지 두 번만으로 늦은 overwrite나 이미 발송된 외부 요청을 배제할 수 없으므로 fence/drain 확인을 생략하지 않는다. Auth soft-delete, profile cascade 가정, HTTP 삭제 성공, P #2627의 DB count, Storage remove 응답을 계정 완료로 사용하지 않는다. SQL 전이도 Auth/profile 부재를 별도로 다시 확인한다. Storage의 두 사실과 drain은 신뢰할 서버가 같은 execution에 대해 증명해야 하는 입력이며 클라이언트 body에서 받을 수 없다.

포트 구현은 관리자 권한의 정확한 owner 조회·캐시 없는 읽기여야 한다. RLS로 가려진 빈 배열이나 임의 404를 부재로 바꾸면 안 된다. 운영 gateway 계약 확인, 실제 fence와 진행 중 HTTP 종료 증거, 관리형 Auth/Storage의 늦은 쓰기 시험이 연결 전 필수다. 현재 테스트는 로컬 SQL과 주입한 응답으로 이 부품을 검증하며 운영 완료 증거가 아니다.

## 보관·지움·내보내기 (f)

새 표는 없고 private 원장에 7개 열이 추가된다. 모든 18개 열의 분류는 `db/migration-drafts/account-deletion-receipt-data-policy.json`에 둔다. SQL runner가 실제 catalog의 열 목록 전체와 대조하고 Jest도 누락·추가·민감 필드의 노출 분류를 확인한다. 기존 public 표용 두 검사 통과를 private 원장 검증으로 대신하지 않는다.

- content/account 지움은 이 원장을 연쇄 삭제하지 않는다. 완료 근거와 request 재사용 방지용이다.
- completed는 finished_at부터 365일, failed/abandoned는 30일 뒤 service-only purge 대상으로만 분류한다. executing은 시간으로 지우지 않는다. 예약 실행은 설치하지 않는다.
- purge는 만료된 accepted도 같은 owner 잠금으로 abandoned로 확정한다. 이 경우 finished_at은 admission_expires_at이며, 30일은 방문·purge 시점부터 다시 세지 않는다. 400일 된 미실행 행은 첫 purge에서 제거되고, 최근 만료 행은 남는다. lookup도 이 만료를 확정한다.
- 365일은 승인된 제품 값이다. 30일 및 각 식별자·digest의 보관 적정성은 법무/활성화 조건으로 남는다. 이 PR은 법무 승인 보고가 아니다.
- 일반 export에서는 operational private ledger로 제외하며, 별도 capability 조회는 receipt ID·상태·접수 시각·범위·보관 끝·네 관찰만 반환한다. owner/session/request/execution/key/hash는 반환하지 않는다. owner 결속의 보관 최소화와 사용자 접근 경로 검토는 번호/활성화 전에 필요하다.

## 롤백과 1조각 낮음 세 건

arbitration down은 자체 BEGIN/COMMIT을 갖고 원장이 비어 있지 않으면 전체 transaction을 중단한다. `ON_ERROR_STOP` 없는 기본 psql에서도 뒤의 DROP이 적용되지 않는다. up/down은 두 표의 `ACCESS EXCLUSIVE NOWAIT`를 먼저 얻어 DROP TRIGGER에서 추가 잠금을 기다리지 않는다. 읽는 transaction이 있으면 즉시 거절하고 새 reader를 줄 세우지 않는다. 롤백 잔여 검사는 두 helper와 두 trigger 전부를 확인한다. 두 guard의 VOLATILE 속성도 catalog로 고정한다.

terminal down은 공개 전 admission/start/purge 권한을 닫는 되돌림이다. executing 행이 하나라도 있으면 `receipt_terminal_rollback_execution_unresolved`로 전체를 거절하여 완료 전이를 회수하지 않는다. 실행을 수습한 뒤에는 행·lookup·중재·미실행 만료 처리를 보존하며 권한을 닫는다. terminal 재적용은 권한을 복구하며 기존 표와 terminal 행을 지우지 않는다.

terminal 설치 뒤에는 **terminal down → arbitration down 사슬도 거절**한다(`receipt_arbitration_terminal_requires_retirement`). terminal down은 제거가 아니며 lookup이 남은 만료 helper와 중재 트리거에 의존한다. 원장이 비어 있어도 중재만 걷어낼 수 없다. terminal 설치 전의 arbitration down은 기존 빈 원장 조건으로 동작한다.

남는 구조: 추가 열 7개, `receipt_terminal_shape`, 활성 owner 부분 고유 색인, terminal helper/전이/purge 함수와 중재. accepted-only의 owner UNIQUE·phase CHECK로 돌아가지 않는다. 따라서 contract down까지 이어가거나 contract/arbitration만 다시 설치하지 않는다. 전체 제거와 공개 후 rollback은 별도 검토한 마이그레이션이 필요하다.

## 검증과 인수

```sh
node scripts/test-deletion-receipt-arbitration.mjs 55764 t04_arbitration_test_lows_final --fixture
node scripts/test-deletion-receipt-terminal.mjs 55764 t04_arbitration_test_terminal_third --fixture
```

실행한 로컬 PostgreSQL 18은 이 워크트리 Output의 새 data 폴더·빈 loopback 포트를 사용했다. 작은 fixture는 실제 0192와 세 초안을 실행한다. 전체 현행 migration의 clone은 `supabase-dry-run` CI의 별도 두 lane이 판정한다.

- arbitration: 11그룹, 실제 잠금 대기 8순서, SQL 변이 17/17.
- terminal 최초 구현: 5그룹, 실제 잠금 대기 6순서, SQL 변이 11/11. 아래 R1 결과가 현재 수정본의 검증이다.
- 최초 구현의 관련 Jest는 12묶음 408건이었다. 완료 관찰은 Auth/profile·각 저장소·scope 교체·시간·예외·원 owner 고정 및 호출부 0을 확인했다.
- 최초 구현의 관찰자 실제 소스 변이 6/6은 Auth·profile·두 번째 저장소 읽기·execution 결속·drain·시각 검사를 제거해 각각 실패했고 원본 바이트를 복원했다. R1에서는 관찰자를 변경하지 않아 이 여섯 변이를 재실행하지 않았다.
- 기존 public/auth/storage 함수·trigger catalog가 바뀌지 않았음을 SQL runner가 비교한다(receipt facade 두 개만 제외).

**번호 조건:** #2733 중재를 이 (c)/(d) 초안 없이 단독으로 번호 붙이지 않는다. 이 PR이 그 조건 하나를 구현해도 전체 활성화 조건이 자동 해제되는 것은 아니다. 독립 검토(Codex daybreak) PASS + 새 medium 0 + CI 초록은 코디네이터의 머지 조건이다.

### R1 검토 수정 검증

- 새 loopback PostgreSQL 18(`56944`)에서 terminal **7그룹 / 경합 9순서 / 변이 28/28**, arbitration **11그룹 / 경합 8순서 / 변이 17/17** 통과. 합계 **18그룹 / 17순서 / 변이 45/45**다. 전용 서버는 시험 뒤 정지했다.
- 순서 거절 **13건**, 전후 상태 변화 **0**. terminal의 28건은 기존 동작 변이 11건, 만료·projection·purge 변이 4건, 역사적 설치 상태별 거절문 제거 13건이다.
- 관련 Jest **10묶음 / 358건**, root tsc, 변경 파일 eslint, lexicon·C7·emdash·constraints·definer-grants·erasure-registry·account-export-inventory 모두 종료코드 0. 전체 verify와 full-schema SQL 재생은 최신 커밋의 PR CI가 판정한다.
- 먼저 추가한 순서 시험이 이전 SQL에서 `Expected rejection: receipt_terminal_requires_arbitration`으로 실패했다.
- terminal 설치 누락·트리거 하나 누락/비활성·terminal 이후 arbitration 재적용·각 terminal 표식 단독·두 down 순서·executing 중 down을 거절한다. 함수 정의/ACL·트리거·열/기본값·제약·색인·두 원장 전체를 전후 대조한다.
- lookup 만료 확정, 공개 출력 키 7개, 400일 된 accepted purge, 최근 만료의 보관 끝, executing 보존과 purge 재시도를 SQL에서 검사한다.
- purge/start의 commit·rollback·역순을 실제 잠금 대기로 확인한다. 새 거절문과 만료/projection/purge를 제거한 변이는 연결 오류나 구문 오류가 아닌 같은 동작 검사의 실패로만 인정한다.

**남긴 것:** (a) 공개 끝점·서버 인증과 목적별 증표·재발급·한도, (e) 앱 안내·기기 복구·A→B/ABA/다중 탭, (b) operation-owned fence/dispatch generation CAS와 이미 발송된 legacy HTTP의 종료·reconciliation, O/H 실제 연결, 운영 gateway 계약, 관리형 Auth/Storage 실측, 법무/메일, 번호·운영 적용·머지·8081 확인. 기존 앱 epoch+1 안내 한계와 인터뷰 #2440은 변경하지 않았다.
