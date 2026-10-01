# PolaScope 10월 5일 계약 Draft 선행 점검 — 2026-10-01

기준은 main `8918e0db`와 [Draft PR #1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)의 원격 head `4c81c0ce`다. 별도 워크트리에서 main을 `--no-commit`으로 합쳤고 충돌은 없었다. 합친 트리의 `npm run verify`는 869묶음·11,289건 통과, `git diff --check`도 통과했다. PR 브랜치에는 push하지 않았다.

## 운영 가입 계약 게이트

`scripts/check-signup-consent-deployment.cjs`가 요구하는 공개 RPC를 **운영 프로젝트 `zoacryukmdeivmolvyhj`**의 anon 설정으로 조회했다. 프로젝트 ref를 검사한 뒤, 응답에서는 공개 버전·준비 여부만 읽었다. 키 값, 개인 정보, 응답의 다른 필드는 기록하지 않았다.

| 항목 | 운영 공개 RPC | #1902 클라이언트 요구 |
|---|---|---|
| `signup_consent_contract_status` | HTTP 200, 6행 | 정확한 계약 1행과 확인 가능 상태 필요 |
| 가입 revision | `email-v2`~`email-v6`, `complete-profile-v1`; `email-v7` 0행 | `email-v7` |
| 최신 email 행의 consent / privacy / terms | `2026-09-07` / `2026-09-29` / `2026-08-16` (`email-v6`, 확인 가능·준비됨) | `2026-10-05` / `2026-09-29` / `2026-10-05` |
| 출시 게이트 | `Deployed server does not support the client's signup policy contract; publish is blocked.` (exit 1) | 일치 시에만 통과 |

이전 인수 기록의 “RPC 404”는 **현재 상태가 아니다**. 엔드포인트는 응답하지만 새 계약 행이 없어 #1902 게시가 차단된다. 10월 5일 전 서버 계약·운영 원장 선행 적용과 게이트 재검증이 필요하다. 이번 점검은 DB·Edge·변수·Play Console·공개 사이트를 변경하지 않았다.

[Draft PR #1917](https://github.com/Simon-YHKim/2nd-B/pull/1917)도 최신 main `6354bca0`과 원격 head `6a61ca66`을 별도 워크트리에서 커밋 없이 합쳤다. 충돌은 없고 main 대비 차이는 `supabase/config.toml`의 복구·가입 확인 메일 제목 두 줄뿐이다. `npm run check:supabase-auth-config` 통과, 합친 트리의 `npm run verify` 870묶음·11,286건 통과, main 대비 `git diff --check` 통과. PR 브랜치에는 push하지 않았고 실제 메일 발송·Supabase 대시보드 설정 변경도 하지 않았다. 제목은 10월 5일에 대시보드와 저장소 설정을 같은 값으로 맞춘 뒤에만 적용한다.

두 Draft는 예정일 전에 병합하지 않는다. Android ARM 실기기와 Play Console 양식도 이 점검에서 확인하지 않았다.

로컬 재현 스크립트: `E:\2ndB\.git\app-parity\polascope-contract-check-261001.cjs` (키는 출력하지 않음). 테스트 로그: 같은 폴더의 `polascope-mergecheck-verify-261001.log`.
메일 제목 합친 트리 테스트 로그: 같은 폴더의 `polascope-mail-mergecheck-verify-261001.log`.
