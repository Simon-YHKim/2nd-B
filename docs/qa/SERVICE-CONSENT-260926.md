# AI 처리 재동의·철회 계약

2026-09-26, `fix/qa-harness-integrated-260925`, Draft PR #1865 후속.
운영 DB·Edge·플래그 변경 및 Grok 전달은 하지 않았다. 기존 서버 선행 승인은 유지한다.
21641bda 고정 [이전 인계 패키지](SERVER-FIRST-1865-260925.md)에 이 후속 소스를 섞어 적용하지 않는다.

## 구현 범위

- `/privacy`의 현행·legacy 화면에서 `/service-consent`로 진입한다.
- 현재 상태를 서버에서 읽고 다섯 필수 항목을 미선택 상태로 제시한다. 앱이 표시한 계약 판본이
  서버와 다르면 grant를 막는다. 철회는 새 문서에 동의하지 않아도 가능하다.
- 철회는 `llm_processing_ack`만 false로 기록한다. 계정·기록·마케팅·선택 privacy 설정을 바꾸지 않는다.
- 서버가 JWT의 사용자를 선택하고 나이·계정 상태·계약·현재 변경 token을 검증한다. 원자적으로
  `consent_records`와 private provenance를 기록하며 직접 authenticated INSERT는 신뢰하지 않는다.
- 과거 optional 동의의 철회 시각 경계를 계승한다. 새 서비스 동의가 기존 optional 거절을 지우지 않는다.
  따라서 grant 저장 성공 후에도 다른 동의 때문에 `blocked`일 수 있으며 화면에서 구분한다.
- 계정과 최초 epoch에 묶인 상태, 고정 JWT, 전환 시 abort, 단일 저장, 성공 receipt 확인을 사용한다.
  A→B→A, 중복 탭, 오래된 판본/CAS, 미확인 응답은 이전 선택을 자동으로 다시 저장하지 않는다.
- KO/EN 동의 문구를 사용한다. ES/PT/ID는 인간 검토 전 EN 원문이라는 기존 gate를 유지하며
  원장 locale도 실제 표시 언어인 `en`으로 기록한다.
- 동의 오류는 제공자 failover를 금지한다. 대화/북극성 오류에서 동의 화면으로 이동할 수 있다.

## 단계와 전제

| 서버 설정 | AI 접근 | 관리 쓰기 |
|---|---|---|
| `LLM_CONSENT_MODE=off` 또는 새/기존 strict 미설정 | 이전 동작, 새 동의 RPC 없음 | 503, 화면에 성공·철회 표시 안 함 |
| `collect` | 영수증 없는 기존 계정만 잠정 허용. 모든 새 grant/revoke는 전후 token 검사 | 현재 계약과 CAS 확인 후 저장 |
| `enforce` | 모든 호출에 현재 신뢰 동의 필요 | 동일 |
| 기존 `LLM_REQUIRE_VERIFIED_CONSENT=true` | off/collect보다 우선하여 enforce | 동일 |
| 잘못된 mode 문자열 | 503 | 503 |

이 상태 응답은 **해당 관리 함수의 설정만** 증명한다. 네 provider proxy의 실제 배포·설정 일치는
별도 canary로 확인한다. 새 환경 변수를 클라이언트 공개 변수로 넣지 않는다.

### 콘솔 적용 순서

1. 현재 운영 함수/서명/원격 migration 번호를 확인한다. 신규 가입 0148/0149/0150 및 AdMob 계약,
   계정 삭제 fence → provenance/snapshot draft → 관리 draft와 Polaris draft가 필요하다.
   기존 적용본이 있으면 이 fresh CREATE를 다시 쓰지 않고 실제 서명에 맞는 forward migration을 준비한다.
   snapshot은 `(uuid, boolean DEFAULT false)`, Polaris 정산은 다섯 번째 `boolean DEFAULT false`까지다.
   승격 시 private receipt·Polaris의 erasure registry/forward gate/rollback coverage도 검증한다.
2. `runtime_flags.llm_enabled=false`로 새 provider 요청을 차단한다. 서버의 `bump_gemini_spend`
   (0092)와 capacity reservation(0176)이 이를 검사한다. 이미 통과한 요청이 끝났다는 관측을 남긴다.
   단순 sleep, flag 변경, capacity TTL 만료만을 모든 HTTP 요청 종료 증거로 삼지 않는다.
3. SQL, 네 proxy 및 공유 모듈을 배포한다. 관리 Edge는 아직 off로 둔다. SQL ACL/CAS/삭제와
   proxy의 off no-RPC, collect pre/post 검사 및 실제 배포 SHA를 확인한다.
4. 네 proxy를 같은 collect 설정으로 확인한다. 영수증 없는 legacy 허용, 첫 grant 후 token 변경,
   revoke 403, provider 실행 중 철회 결과 차단, 조회 실패 503, Polaris 실패 예약 반환을 canary한다.
   새 관리 Edge를 `verify_jwt=true`로 배포하고 동일 mode·JWT 주체·body 제한을 확인한다.
5. 관리 UI를 준비한 뒤 LLM 이용을 재개한다. 기존 off 요청이 남아 있으면 철회 효력을 약속할 수 없다.
   실제 제공자 canary의 비용은 기존 별도 승인 범위를 확인한다. 이 로컬 검증은 모델을 호출하지 않았다.
6. 서비스 권한의 read-only 호출로 `SELECT public.llm_service_consent_coverage();`를 확인한다.
   전체 active/non-deleting 계정을 대상으로 granted/intentionally_revoked/uncovered/blocked를 세며,
   `uncovered_accounts=0 AND blocked_accounts=0`일 때만 `ready_for_enforce=true`다.
   일부 사용자 목록이나 역사적 영수증 backfill로 0을 만들지 않는다. 의도적 철회는 별도로 보존한다.
7. strict 전환도 요청 차단·drain과 canary 후 수행한다. collect 때 시작한 요청은 요청 당시 mode를
   유지하기 때문이다. 철회가 생긴 뒤 off로 되돌리면 철회 강제가 사라지므로 off 롤백은 허용하지 않는다.
   장애 때 전역 AI 차단 상태를 유지하고 수정본으로 진행한다. DB down으로 원장을 되감지 않는다.

## 관리 API

`POST /functions/v1/service-consent`, 인증 JWT 필수. 본문은 최대 4 KiB, 알 수 없는 필드는 거절한다.
OpenAPI/Swagger 문서는 현재 저장소에 없다. 계약과 실행형 테스트를 함께 유지한다.

```json
{"action":"status"}
```

status 응답은 `mode`와 정확히 다음 필드다:
`contract_revision`, `consent_version`, `policy_version`, `terms_version`,
`state`(`uncovered|granted|revoked|blocked`), `change_token`(opaque lower-hex 64), `can_grant`.
token은 로컬 메모리에서만 사용하며 사용자 식별자나 원문을 넣어 전송·기록하지 않는다.

```json
{
  "action": "grant",
  "contractRevision": "service-v1",
  "expectedChangeToken": "<status에서 받은 token>",
  "requiredAcks": {
    "service": true, "llmProcessing": true, "overseasTransfer": true,
    "sensitiveData": true, "safetyNotice": true
  },
  "locale": "ko"
}
```

철회는 `action:"revoke"`, `requiredAcks:{}`이며 나머지 키는 같다. body에 user ID를 받지 않는다.
쓰기 응답은 status에 `created:true`를 더한다. 앱은 새 token과 결과 상태/판본을 확인한 뒤 성공을 표시한다.
401 인증 오류, 400 잘못된 입력, 403 계정 자격, 409 현재 상태·계약 충돌, 413 본문 초과,
503 미활성/조회 실패다. DB 예외 원문·JWT·동의 token은 진단에 출력하지 않는다.

## 검증 근거와 한계

- 실제 PostgreSQL: 관리 writer/status/coverage, ACL, CAS, 기존 선택 동의 철회 보존, 동시 writer,
  삭제 경합, collect lease 무효화, Polaris 정산/환급. `Output/service-consent-management/green3.log`.
- 실제 Edge handler를 로컬 호스트로 실행: provider 경계·관리 요청 포함 9 suites/316 tests.
  `Output/service-consent-260926/scoped-green.log`. 실제 Deno check는 도구 부재로 미실행이며
  로컬 Deno/SDK shim을 사용한 strict TypeScript 진단은 0이다.
- provider failover 회귀: RED 12실패 → 관련 7 suites/69 tests PASS. 미검토 번역 gate 실패도 보존하고
  ES/PT/ID의 EN 원문과 실제 표시 locale로 수정했다.
- 클라이언트·실제 TSX 핸들러 호스트: 48 tests PASS. React scheduler/네이티브 렌더를 검증한 것은 아니다.
- 실제 브라우저 320/425/768px: 미활성 상태, 다섯 ACK, 연속 클릭 1회 저장, 철회, CAS 재확인,
  privacy 진입, 가로 넘침 없음. pageerror 0, LLM 요청 0. 실제 QA 로그인 뒤 동의 응답만 브라우저
  fixture로 대체했으므로 운영 writer 종단 검증이나 실제 동의 변경의 증거는 아니다.
- 전체 verify/정적 웹/원격 CI 최종 값은 PR #1865와 [보고서](service-consent-260926.html)에 기록한다.

이미 제공자에게 보낸 입력·비용과 완료된 결과는 회수하지 못한다. SQL 최종 검사와 HTTP 전달 사이의
철회까지 원자적으로 묶을 수 없다. collect의 무영수증 legacy 계정에는 과거 계정 상태 ABA까지 보장하지
않는다. 첫 신뢰 영수증 이후의 동의/철회 ABA는 새 영수증·revision으로 잡는다. 실제 운영 수집률,
Paddle 결제, 모델 인용 품질, GA4 수신, 실기기 QA는 이번 로컬 구현의 완료 근거에 포함하지 않는다.
