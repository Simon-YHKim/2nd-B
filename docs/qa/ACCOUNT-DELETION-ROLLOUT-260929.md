# 계정 삭제 서버 전환 점검 (2026-09-29)

이 문서는 운영 적용 전 관측, 배포 순서, 적용 결과와 남은 검증을 구분해 기록한다.
`docs/SESSION-OWNERSHIP.md`에 따라 DB·Edge 작업은 선점한 콘솔 세션 한 곳에서 수행한다.

## 적용 전 확인한 상태

- 운영 프로젝트 `zoacryukmdeivmolvyhj`의 마이그레이션 원장은 181행이며 `0192`와 `0194`가 없다. `0191`·`0193`·`0208`은 있다.
- 운영 `delete-account`는 v134(2026-09-08 배포)이다. 배포 소스는 `auth.admin.deleteUser`를 먼저 호출하고 Storage를 best-effort로 정리한다. `begin_account_deletion`과 `verify_account_deletion_session`을 호출하지 않는다. 따라서 `0192_account_deletion_completion_fence.sql` 첫머리의 “already-deployed Edge” 호환 설명은 현재 운영 상태와 맞지 않는다. **번호가 붙은 SQL 파일은 격리 리허설의 바이트 해시를 보존하기 위해 수정하지 않았다.**
- 현재 main의 `0192` Git blob SHA-256은 `9ecee8a61fec82fa707b0873a251472da0979b3d9b39e2536a7c97ed5c286cef`이며 9월 27일 관리형 Storage 격리 리허설과 일치한다. 리허설은 운영 데이터 복원, CLI 원장 왕복, 두 연결 잠금 경합, 삭제 fence 뒤 Storage API 업로드 거부를 통과하고 임시 프로젝트를 삭제했다. 리허설은 v134의 실제 Auth 삭제 흐름과 최신 Edge 전체 경로를 실행하지 않았다.
- 현재 main의 `0194`는 리허설 때보다 `service-v1` 계약이 `email-v6`(방침 2026-09-29)에 맞게 바뀌었다. 별도 PostgreSQL 회귀와 PR CI로 현재 파일을 검증해야 한다.
- 운영 Edge 로그의 2026-09-29 조회 시점 기준 최근 24시간 `delete-account` 경로 호출은 0건이었다. 이는 그 시간 범위의 관측이며 이후 무호출을 보장하지 않는다.

## 콘솔 전환 순서

1. 단일 콘솔 소유권과 최신 암호화 백업의 성공 기록을 확인한다. 원장·현재 Edge 버전·Storage 정책·`storage.objects`의 실제 컬럼/트리거를 읽기 전용으로 다시 대조한다. 운영 SQL을 일괄 `db push`하지 않는다.
2. `0192`만 적용하고 관리형 DB preflight와 tombstone/RPC ACL·Storage 정책·트리거를 확인한다. v134는 이 짧은 구간에서 여전히 완전한 영구삭제 보증을 제공하지 않는다. 다만 `0192`의 INSERT/UPDATE 트리거는 `public.users FOR KEY SHARE`로 업로드 메타데이터와 프로필 삭제를 직렬화하며 기존 Storage DELETE 정책은 유지한다.
3. preflight가 통과하면 현재 main의 `delete-account`를 `deploy-edge-function.yml`로 즉시 배포한다. 표준 워크플로의 스키마 게이트와 `verify_jwt=true`를 확인한다. 배포 후 버전만 보지 말고 실제 배포 소스에 `begin_account_deletion` 호출과 `listV2` 정리, 세션 검증, 응답 계약이 main과 맞는지 확인한다.
4. 별도 테스트 계정으로 삭제 영수증, Auth·프로필 제거, Storage 빈 목록, 재시도 결과를 확인한다. 검증이 실패하면 이후 SQL·클라이언트 활성화를 중단하고 원인에 맞는 forward 수정으로 복구한다. 운영 사용자 데이터와 기존 tombstone을 임의로 되감지 않는다.
5. 현재 `0194`의 SQL 회귀와 적용 전 preflight가 통과한 뒤 `0194`를 적용한다. 그 후 `service-consent` Edge를 배포하고 `service-v1`/`email-v6` 읽기 canary를 확인한다. 10월 5일 `service-v2`/`email-v7` 공개는 Draft PR #1902의 별도 게이트를 따른다.

`503`만 반환하는 임시 Edge로 전환하지 않는다. 현재 클라이언트는 서버 호출 전에 로컬 삭제 fence를 세우며, 실패 시 그 fence를 자동으로 해제하지 않아 사용자의 로컬 쓰기를 묶을 수 있다.

근거: [서버 적용·소유 규칙](../SESSION-OWNERSHIP.md), [Storage 리허설 절차](ACCOUNT-DELETION-MANAGED-STORAGE-REHEARSAL-260927.md), [서비스 동의 계약](SERVICE-CONSENT-260926.md).

## 2026-09-29 적용 결과와 남은 게이트

- 콘솔 실행 범위는 Relay `claim-prod-delete-consent-260929`으로 단독 선점하고 결과를 기록한 뒤 종료했다. 새 격리 프로젝트는 만들지 않았다. 9월 27일 관리형 Storage 리허설이 이미 완료됐기 때문이다.
- main `90650414`에서 0192 원장 `20260929143410`과 0194 원장 `20260929143632`가 각각 한 행 생겼다. 0192의 tombstone FORCE RLS·두 RPC ACL·Storage guard trigger와 정책, 0194의 service-role 전용 status/writer·`email-v6` 정확한 문서 판본을 읽기 전용으로 확인했다. 현재 0194의 번호 전체 SQL 재생·회귀 CI는 [PR #1929](https://github.com/Simon-YHKim/2nd-B/pull/1929)에서 4종 통과 후 병합됐다.
- [삭제 Edge 배포](https://github.com/Simon-YHKim/2nd-B/actions/runs/36583694890) 성공: `delete-account` v135, `verify_jwt=true`. [서비스 동의 Edge 배포](https://github.com/Simon-YHKim/2nd-B/actions/runs/36583979169) 성공: `service-consent` v1, `verify_jwt=true`. 두 함수의 배포 파일은 main 파일과 정확히 같고, 인증 없는 POST는 각각 401이다.
- 공용 QA 계정의 읽기 전용 서비스 동의 `status`는 **503 `service_consent_unavailable`**이었다. 잘못된 body도 503이므로 본문 검사 전 mode gate가 거부한 것으로 추정한다. 모드가 off/미설정/잘못된 값 중 무엇인지 확인하지 못했으며 설정을 바꾸지 않았다. 따라서 관리 UI 활성화 canary는 통과하지 않았다.
- 운영 전체 삭제는 별도 일회용 테스트 계정이 없어 실행하지 않았다. 공용 QA 계정은 삭제하지 않았다. Auth·프로필·Storage 제거와 재시도 결과는 아직 운영 종단 검증이 아니다. 이 두 canary가 끝나기 전에는 새 클라이언트 기능을 공개 활성화하지 않는다.
