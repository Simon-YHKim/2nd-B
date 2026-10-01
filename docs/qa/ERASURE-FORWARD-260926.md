# 서비스 계약의 삭제 등록부 후속 마이그레이션

2026-09-26 KST. PR #1865의 로컬 배포 준비 보완. **운영 미적용, 번호 미예약, Grok 전달 보류.**

## 발견과 변경

배포 초안 8개를 함께 승격하면 사용자 소유 표가 66개에서 70개로 늘어난다.
기존 canonical 등록부에는 새 표 4개의 분류가 없었다. 전체 JSON을 0189의 seed와
직접 비교하던 G7은 새 행을 추가할 때 이미 배포된 0189를 수정하도록 유도했다.
또한 Polaris provisioning에 등록부 upsert를 함께 두면, 등록부 rollback 후 복구할 때
이미 존재하는 제품 표를 다시 생성해 `duplicate_table`로 실패한다.

보완은 다음과 같다.

- `db/migration-drafts/service-contract-erasure-entries.json`: 아직 활성화하지 않은 4행 분류.
- `UNNUMBERED_service_contract_erasure_registry.sql`: 네 행만 upsert하는 전용 초안.
  기존 행을 prune하지 않는다. 제품 표 생성이나 사용자 데이터 수정이 없다.
- Polaris 초안의 등록부 upsert를 전용 초안으로 옮겼다.
- G7은 canonical의 선택적 `forwardAdditions`를 읽어 역사 seed와 후속 행을 각각 검증한다.
  전체 분류·권한·FK·실제 catalog 검사는 기존 G1~G10 경계를 유지한다.
- 생성 SQL 앞뒤에는 정상 종료된 주석만 허용한다. SQL 전체를 주석으로 감추기,
  미선언 생성 블록, 번호 충돌, 표나 소유 열보다 이른 등록을 거절한다.

| 표 | 콘텐츠 삭제 | 계정 삭제 |
| --- | --- | --- |
| `account_deletion_tombstones` | 유지 | 유지. 늦은 쓰기의 계정 복원을 막는 fence |
| `llm_consent_receipts` | 유지. 철회 후 collect의 legacy 허용으로 돌아가지 않음 | 계정 또는 원본 동의 행 삭제로 CASCADE |
| `polaris_generations` | lifetime 사용·중복 요청 원장은 유지, 근거와 파생 카드는 제거 | CASCADE |
| `reward_ssv_issue_rate_limits` | 유지. 콘텐츠 삭제로 발급 한도를 초기화하지 않음 | `public.users`를 통한 CASCADE |

네 표는 모두 `retained`다. 기존 정책을 새 이름으로 분류한 것이며, 보존 기간을 늘리는
변경은 아니다. 현재 canonical JSON, 0189·0190 및 rollback SQL은 변경하지 않았다.

## 콘솔 소유자가 실제 승격할 때

기존 서버 선행 적용 승인은 유지한다. [소유 규칙](../SESSION-OWNERSHIP.md)과
[서비스 동의 순서](SERVICE-CONSENT-260926.md), Reward·Paddle의 OFF/drain 절차가 적용된다.
이 문서는 기존 `21641bda` 패키지의 파일을 조용히 교체하는 근거가 아니다.

1. 원격 main·예약 브랜치와 실제 운영 함수/ACL/ledger를 다시 읽는다. 기존 draft를
   적용한 환경이면 fresh CREATE를 재실행하지 말고 실제 서명에 맞는 forward를 작성한다.
   consent snapshot의 1→2인수, Polaris settlement의 3/4→5인수 변경은 기존 overload를
   남겨 두면 구 구현 선택 또는 RPC 모호성이 생길 수 있다.
2. 실제 번호를 예약·공유한 뒤 signup → 삭제 fence → consent snapshot → 관리 writer /
   Polaris의 의존 순서를 지킨다. Reward의 0172 → 0177 → hardening도 먼저 충족한다.
3. 네 표가 생긴 뒤 registry-only 초안을 마지막에 적용하도록 번호를 배정한다.
   저장소 번호는 기존 네 자리 규약이다. 운영의 timestamp 변환은 배포 도구가 담당한다.
4. sidecar의 `tables` 네 행을 `db/erasure-registry.json`에 병합하고, 같은 JSON에
   `forwardAdditions`를 추가한다. 키는 **실제 번호가 붙은 registry-only 파일명**, 값은
   네 표 이름 배열이다. 역사 0189를 재생성하지 않는다. `generate-erasure-registry --sql`의
   전체 snapshot 출력은 부분 추가 migration으로 사용할 수 없다.
5. `db/migrations/rollback/0189_down.sql`의 `c_names`에는 registry-only migration의
   ledger 이름을 추가한다. Polaris provisioning은 넣지 않는다. Polaris의 등록부 읽기
   preflight는 `erasure-registry-migration.test.ts`의
   `LOOKED_AT_AND_ITS_LEDGER_ROW_MAY_STAY`에 실제 파일명과 이유로 검토 기록한다.
6. **폐기 가능한 격리 clone/CI scratch에서만** 전체 migration 적용과 Supabase CLI
   rollback·ledger 왕복을 실행한다. 여기서 registry 70행, 제품 데이터 불변,
   `erase_my_data(text)`의 공개 실행 차단, ledger 재생을 확인한다. 운영에서는 적용 후
   **읽기 전용** catalog·ACL·registry 확인과 전체 verify만 수행한다. 운영 DB에 rollback
   SQL을 실행하지 않는다. 아래 정적 projection과 좁은 SQL fixture는 clone 검증을 대신하지 않는다.
7. SQL과 Edge를 고정 source SHA에서 배포하고 version·시각·canary 결과를 기록한다.
   완료 증거 전에는 공개 클라이언트나 서버 기능 플래그를 활성화하지 않는다.

## 검증과 증거 범위

- 새 가드 회귀에서 주석 경계·파일명·선행 순서 관련 **12개 실패를 먼저 재현**한 뒤 수정했다.
- 실제 PostgreSQL: 기존 동의/Polaris 회귀와 함께 **18개 PASS 결과 묶음**.
  전제조건 실패, 반복 적용, 역사 seed 66행 보존과 70행 복구, 제품 데이터 불변,
  콘텐츠 삭제·계정 CASCADE·tombstone 유지까지 실행했다.
- 173개 실제 migration + 8개 draft의 임시 승격: 발견·등록 모두 **70표**, G1~G10 오류 0.
  26개 client_erasable / 31개 retained / 13개 account_delete_only.
  원본 보호 파일 해시 불변을 확인했고 임시 트리는 경계 검사 후 제거했다.
- 이 projection의 `9001`~`9008`은 OS temp 안의 fixture 번호다. 원격 예약이나 운영 적용이 아니다.
- 운영 가입 상태의 공개 read-only 검사에서는 현재 계약 RPC가 사용 가능하지 않아 게시 가드가
  실패했다. 운영 DB·Edge·flag·secret·결제 변경은 수행하지 않았다.

로컬 증거(공유하려면 함께 첨부):

| 경로 | 내용 |
| --- | --- |
| `Output/server-readiness-260926/review-red.log` / `review-green.log` | 회귀 RED/GREEN |
| `Output/server-readiness-260926/verify.log` | 전체 검증 결과 |
| `Output/erasure-forward/green3.log` | 실제 PostgreSQL 결과 |
| `Output/erasure-forward/check-promotion-projection.cjs` | 정적 projection 재현 스크립트 |
| `Output/erasure-forward/promotion-projection-result.json` | 입력 해시, 70표, 보호 파일·정리 증거 |
| `Output/server-readiness-260926/signup-deployment-readonly.log` | 운영 공개 가입 계약 조회 |

정적 projection 재현: 저장소 루트에서
`node --import tsx Output/erasure-forward/check-promotion-projection.cjs`.
SQL fixture는 CI의 `node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci`에 연결했다.
실제 운영 DB에 fixture를 실행하지 않는다.
