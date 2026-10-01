# PR #1865 서버 선행 적용 인계 패키지

작성: 2026-09-25 KST. **로컬 준비 완료, Grok/콘솔에 미전달, 운영 미적용.**

| 항목 | 고정 값 / 상태 |
| --- | --- |
| 검토 기준 | `21641bda3fc839ba2fbf042c821b25688cf51dae` |
| 저장소 / PR | `Simon-YHKim/2nd-B` / [#1865](https://github.com/Simon-YHKim/2nd-B/pull/1865) |
| 작성 워크트리 | `E:/2ndB/.worktrees/qa-harness-integrated-260925`, `fix/qa-harness-integrated-260925` |
| 승인 근거 | 현재 사용자 대화에서 PR #1865의 운영 DB 마이그레이션·Edge 서버 선행 적용을 콘솔 세션에 승인함. 조정자가 이 범위의 승인을 확인함 |
| 전달 상태 | 사용자의 Grok 후속 보류 유지. 이 문서를 Relay 수신함이나 Bot 채팅에 게시하지 않았음 |
| 운영 접근 | 조정자의 이번 접근 조사에서 연결된 Supabase MCP/CLI 자격증명·활성 콘솔 브라우저를 확인하지 못함. 연결 위치 확인 중 |
| 실행 상태 | 새 migration 번호 예약, 운영 DB 변경, Edge 배포, secret/flag 변경, 결제 및 새 서비스 생성 모두 미실행 |
| 후속 코드 | 현재 작업트리의 consent snapshot/호출 중 철회 재검증 및 추가 GUI 변경은 이 SHA에 없음. 별도 검토·커밋·해시 목록 필요 |

이 문서는 승인된 실행 범위를 구체화한 인수 자료다. PR 본문의 작성 당시 미승인 상태를
현재 승인을 취소하는 근거로 사용하지 않는다. 동시에 서버 적용 승인과 Grok 전달 보류를
구분한다. Bot 전달, 공개 client 활성화, 새 유료 자원 생성 또는 실결제를 이 문서로 수행하지 않는다.

## 1. 고정 소스와 해시

로컬 manifest:
`Output/integration-260925/server-first-21641bda-manifest.json`

- Manifest SHA-256: `3f8bcadd00df8f12e02fa2dae1027d717b0e055dbd08277dbe13ec3ea1538f3a`.
- 58개 파일: 6개 SQL draft, 번호가 있는 선행 계약, 8개 Edge 진입점과 13개 로컬 import
  의존 파일, 설정·승격 가드·검증 자료·근거 문서.
- 각 해시는 `git show <고정 SHA>:<경로>`의 **원본 blob bytes**로 계산했다. 개행·공백을
  정규화하지 않는다. Windows checkout 파일의 CRLF 변환과 혼동하지 않는다.
- Edge 로컬 의존성은 TypeScript AST의 import/export, 리터럴 import 호출·type import를
  재귀적으로 확인했다. 외부 패키지 specifier는 기록했지만 다운로드/내용 해시 검증은 하지 않았다.
  따라서 배포된 Deno bundle이나 외부 패키지 무결성까지 증명하는 manifest가 아니다.
- `Output`은 로컬 자료다. 향후 인계가 허용될 때 문서만 보내지 말고 이 JSON도 함께 고정한다.
  현재 미커밋 파일을 섞거나 mutable branch HEAD를 배포 소스로 사용하지 않는다.

### 적용 후보 SQL

모두 `db/migration-drafts/` 아래의 파일이다. 번호는 아직 배정하지 않았다.

| 파일 | 원본 blob SHA-256 |
| --- | --- |
| `UNNUMBERED_signup_consent_admob_20260925.sql` | `7a21c7ee2795487e5c46e0f75647e248293ca64812be1b2ac5e9d057df9fa9f8` |
| `UNNUMBERED_account_deletion_completion_fence.sql` | `9ecee8a61fec82fa707b0873a251472da0979b3d9b39e2536a7c97ed5c286cef` |
| `UNNUMBERED_polaris_generation_allowance.sql` | `9a34bddc8e78d98dcac73f3a09ed8596012ff9937e3dae101ac8175421e41cd4` |
| `UNNUMBERED_effective_llm_consent_current_contract.sql` | `6b432ec54ca731777fcbdc72f8cfc02313f67c13c7a31b93b55d8fc8c7980ab9` |
| `UNNUMBERED_reward_ssv_hardening.sql` | `4a637061a2374666c6a5e3322340db6c58fdd7e2806c0beee79dc9ce3dd1246d` |
| `UNNUMBERED_paddle_refund_consequence_integrity.sql` | `94d2b1f38673555e57b94d7b7b12b19391989e45fad28c1fce3a104207473e61` |

Polaris 승격에는 erasure registry/forward gate/rollback coverage의 추가 코드 보완이 필요하다.
이 파일 해시를 검토 완료된 번호 승격 산출물의 해시로 대신 사용하지 않는다.
서비스 동의의 새 후속 변경도 이 표의 pinned draft를 조용히 대체해서는 안 된다.

## 2. 먼저 현재 상태를 읽고, 그다음 번호를 예약한다

1. 실행할 콘솔의 계정·조직·프로젝트를 확인한다. 기존 문서의 운영 프로젝트 ref는
   `zoacryukmdeivmolvyhj`다. 이름만 보고 선택하지 말고 URL/ref를 대조한다.
   환경별 secret의 존재·종류만 기록하고 값은 문서·채팅·스크린샷에 담지 않는다.
2. 운영 migration ledger, 실제 함수 본문/시그니처/owner/ACL, 테이블·trigger·RLS를 읽는다.
   과거 원장의 이름 차이와 누락이 있으므로 ledger만 보고 migration을 재실행하지 않는다.
3. 적용 전 복구 가능 자료와 관측 창을 확인한다. 이 조사에서 백업 복원이나 계정 삭제
   canary를 운영에서 임의 실행하지 않는다. 복구 절차는 [DB runbook](../DB-RESTORE-RUNBOOK.md)을 따른다.
4. 각 분야의 OFF와 기존 요청 drain을 먼저 증명한다. OFF 직전 시작된 요청도 포함하며
   Edge/gateway/provider 로그로 확인한다. 거래 원장 0행은 drain 증거가 아니다.
5. 실제 승격 직전에 원격 main과 다른 원격 브랜치의 migration 번호를 다시 읽는다.
   현 시점 최대 번호 다음을 예약하고 예약 브랜치를 push해 다른 세션에 알린다.
   [소유 경계](../SESSION-OWNERSHIP.md)의 `0132`는 8월의 예시이며 재사용하지 않는다.
6. 승격 전후 파일명·원본 해시·최종 해시·선행 migration을 기록하고 로컬/CI 검증을 통과시킨다.
   범위 밖 draft를 한꺼번에 적용하는 전체 DB push는 피한다. 실제 pending 목록을 먼저 검토한다.
7. 적용과 Edge 배포를 분야별로 완료하고 아래 증거를 반환한다. source SHA, 배포 version,
   설정의 비밀이 아닌 식별자, 적용 시각이 없으면 완료로 판정하지 않는다.

Signup 공개 RPC 예외는 `scripts/check-definer-grants.ts`의 정규화된 **전체 SQL** 해시에
묶여 있다. 파일명만 바꾸는 승격은 가능하지만 헤더·본문 변경은 재검토와 pin 갱신이 필요하다.
그 checker의 정규화 해시와 이 manifest의 raw-byte 해시는 서로 다른 값이다.

## 3. 분야별 실행 순서와 중단점

### A. 가입 계약

1. `0148_verified_email_signup_consent_ledger.sql` →
   `0149_atomic_complete_profile_signup_consent.sql` →
   `0150_signup_consent_contract_20260902.sql`의 실제 효과와 선행 기반을 확인한다.
2. Signup draft를 새 번호로 **원자 적용**한다. 기존 v2/v3 tuple과 원장을 유지한다.
3. 공개 `signup_consent_contract_status()`에서 아래 tuple과 준비 상태를 확인한다.
   `email-v4` / consent `2026-09-07` / policy `2026-09-25` / terms `2026-08-16`,
   `confirmation_eligible=true`, `confirmation_ready=true`.
4. 실제 확인 trigger wiring·ACL 및 확인 동작 증거를 확인한다. fixture는 폐기용 로컬 DB에서
   실행하며 임의 운영 사용자 생성이나 메일 전송으로 대신하지 않는다.

**중단:** tuple/RPC/확인 동작 중 하나라도 다르면 Web 게시·production EAS·OTA를 진행하지 않는다.

### B. 삭제 fence와 Polaris

1. `0189_erasure_registry.sql` → `0190_lock_erase_my_data_authenticated.sql`의 실제 효과를
   확인한다. `erase_my_data(text)`의 authenticated 실행 차단을 유지한다.
2. 운영 Storage 스키마와 `storage.objects` RLS를 확인하고, 해당 구조를 재현한 격리 환경에서
   completion fence trigger를 검증한다. 그다음 account-deletion fence draft를 적용한다.
3. 고정 SHA의 `delete-account/index.ts`와 `begin_account_deletion` 계약을 배포/확인한다.
   SQL compatibility wrapper는 DB→Edge 사이의 구 호출에도 durable fence를 제공한다.
4. Polaris 번호 승격 시 `db/erasure-registry.json`, forward gate와 rollback coverage를 함께
   보완·검증한다. 역사 migration 0189를 수정하지 않는다. lifetime 원장은 콘텐츠 삭제 후
   보존하며 근거와 역할 카드는 지우고, 계정 삭제는 원장을 CASCADE로 지운다.
5. Polaris draft를 `polaris_generation_config.enabled=false`로 적용하고
   `ratify_polaris_role_card`·예약·claim·정산·취소 RPC의 실제 계약/ACL을 확인한다.
6. `openai-proxy`의 근거 snapshot·정산 wrapper와 `gemini-proxy`, `claude-proxy`, `xai-proxy`의
   공유 거부 가드를 **네 bundle 모두** 배포한다. 지원 provider는 OpenAI뿐이다.
7. 별도 client 준비와 예약/중복/환급/승인/정산/원본 삭제/계정 삭제 경합 canary를 확인한다.

**중단:** registry 보완, 네 bundle 또는 canary가 미완료면 singleton은 false 유지.
실제 모델 호출이나 계정 삭제를 포함하는 canary는 지정된 격리 대상과 비용 범위가 확정된 뒤 수행한다.

### C. 서비스 동의 v2: 적용과 활성화를 분리

1. A의 email-v4 계약이 선행한다. effective-consent draft는 exact tuple과 server writer owner를
   확인하며 불일치하면 transaction을 실패시킨다.
2. Pinned draft의 provenance trigger와 `effective_llm_consent_v2(uuid)`를 적용/검증하더라도
   `LLM_REQUIRE_VERIFIED_CONSENT`는 **unset으로 유지**한다.
3. 활성화에는 검토된 server-owned 재동의 writer/UI, 현재 판본 영수증, 접근을 유지할 활성
   계정의 미충족 수 0 coverage 및 v2 RPC canary가 필요하다. 기존 영수증의 안전한 backfill은 불가하다.
4. **21641bda에는 provider 실행 중 철회를 정산 직전에 재검사하는 처리가 없다.** 현재 별도
   agent가 수정·검증 중이며, 후속 SHA/manifest/SQL 및 네 proxy의 검증을 별도로 받아야 한다.
   후속 파일을 이 패키지에 섞거나 해당 패치만으로 coverage 조건이 충족됐다고 판정하지 않는다.

**중단:** 위 조건 중 하나라도 남으면 verified-consent flag는 unset. analytics/chat_autosave
동의를 서비스 동의로 대신하지 않는다.

### D. Reward SSV

1. `REWARD_SSV_ENABLED=0`, 공개 `EXPO_PUBLIC_REWARD_SSV` unset/false → 기존 호출 drain 확인.
2. `0172_reward_authorization_hardening.sql` → `0177_reward_ssv_tickets.sql` → 새 번호의
   reward hardening draft 순서로 실제 계약을 맞춘다. **0177 단독 상태는 활성화 금지**다.
3. 아래 함수의 정확한 시그니처와 service_role 전용 실행 권한을 확인한다.
   - `claim_reward_ssv_issue_rate_limit(uuid)`
   - `issue_reward_ssv_ticket(uuid,text,text,text,integer,text)`
   - `claim_reward_ssv_callback_attempt(text,text,text,integer,text)`
   - `settle_reward_ssv_ticket_v2(text,text,text,integer,text)`
4. 기존 `consume_reward_ssv_ticket(text,uuid,text,text,integer,text)`, `grant_chat_ad_bonus(uuid)`,
   `bump_reward_credits_if_under_cap(uuid,text,integer)`는 공개 역할과 service_role 모두 실행 차단.
5. Android/iOS 실유닛을 서버 `REWARD_SSV_AD_UNIT_IDS` 허용목록에 최대 두 개 지정하고
   새 `rewarded-ssv`를 OFF 상태로 배포한다. 티켓/보상 요청은 503이어야 한다.
   무주체 AdMob 콘솔 검증만 Google 서명 확인 후 `verification_only`이며 DB 쓰기는 없어야 한다.
6. 제한된 canary에서만 서버 ON: ticket POST → 서명 GET → reasoning/chat 원장, exact replay,
   잘못된 unit/서명/계정/동의 거부를 확인한다. 공개 client는 계속 OFF다.

**중단:** 실패 즉시 server OFF, roll-forward. DB down은 하지 않는다.
이전 full-ID 티켓이 있으면 전환 전에 20분 유효기간과 소비 후 1일 exact-retry 창·잔여 요청을
확인한다. Relay의 01:24 v86/티켓 부재 관측은 과거 자료이며 현재 조회를 대체하지 않는다.
공개 활성화 전 플랫폼별 full ID, 서버 접미사 일치와 정책의 AdMob 미확정 운영 항목도 확인한다.

### E. Paddle 운영 계약과 별도 sandbox

1. `PADDLE_WEBHOOK_ENABLED`를 `1`이 아닌 값으로 유지하고 invocation/gateway/Paddle delivery로
   in-flight 0을 증명한다. 구 Edge와 새 refund SQL은 9개 인자라도 의미가 호환되지 않는다.
2. 최초 unsigned→binding 이행이 아직 필요하면 [소유 경계의 Paddle 절](../SESSION-OWNERSHIP.md)의
   초기 signer/client-token 이행·구 token 폐기·열린 legacy checkout reconciliation을 먼저 완료한다.
   이 최초 이행 절차와 이미 binding을 쓰는 서비스의 v1→v2 업그레이드를 혼동하지 않는다.
3. 기존 refund consequence의 정확한 adjustment 연결과 중복을 검토한다. 추론할 수 없는 기존
   행이 있으면 중단하고 운영자가 reconciliation한다. draft를 한 transaction으로 적용한다.
4. 최신 **v2 webhook verifier → subscription-manage signer → 이후 새 web** 순서를 따른다.
   signing secret은 양쪽 current가 일치해야 한다. 이전 키가 있으면 검증 보존 창을 지킨다.
5. 두 Edge의 environment·DB pin·API key 종류·가격 목록·binding audience를 확인한다.
   운영의 미설정 environment는 production 호환이나 잘못된 문자열/키는 fail closed다.
6. 격리 환경에서 signed/tampered/expired/unattributed/retry/partial/full adjustment 검증 후,
   제한 운영 창에서 이미 처리된 무해한 signed event의 멱등 replay·거부 canary를 확인한다.

**중단:** 실패 시 webhook OFF와 roll-forward. 구 Edge나 `rollback/0136_down.sql`로 복귀하지 않는다.
v2 발급 후 구 verifier 즉시 복귀도 금지한다. 마지막 v2 발급 후 7일+5분, 열린 checkout과
provider 재전송을 확인해야 한다.

Sandbox는 운영과 **별도 Supabase 프로젝트/DB**다. 자체 token/API key/notification secret/
binding secret/가격 및 운영과 다른 DB pin을 사용하며 운영 데이터를 복사하지 않는다.
새 프로젝트 생성이나 실제 sandbox 결제는 이 문서 작성 중 수행하지 않았다.
실제 결제→갱신→환불→권한/원장, 중복·재정렬·환경 혼용 거부와 운영 원장 무변경 증거가 필요하다.
정적 웹은 별도 HTTPS Supabase host와 test token, sandbox CSP가 함께 필요하다.
설정표·브라우저 제약·키 교체 절차는 [Paddle runbook](../PADDLE-SANDBOX-RUNBOOK.md)을 따른다.

## 4. 성공 증거 반환표

값 대신 존재/종류와 비밀이 아닌 식별자를 기록한다. 원문 webhook, 동의 내용, 기록 본문,
API key, service-role key, 비공개 token은 붙이지 않는다. 미실행은 `UNVERIFIED`로 쓴다.

| 범위 | 반환할 필드 | PASS 조건 |
| --- | --- | --- |
| 공통 | source SHA, manifest SHA, 프로젝트 ref, 실행자 세션, 시작/종료 KST, migration 번호·최종 파일 SHA, Edge version, 로그 위치 | 대상·소스·결과가 한 실행으로 연결됨 |
| 현재 상태 | 적용 전 catalog/ACL/trigger 요약, 운영 flag, pending migration 목록, 백업/복구 자료 위치 | 과거 문서나 ledger 이름만으로 추정하지 않음 |
| Signup | status tuple/ready, resolver/trigger ACL, 확인 동작 증거, 게시 gate 결과 | email-v4 정확 일치, v2/v3 보존 |
| 삭제/Polaris | Storage RLS/fence, registry 분류, singleton 상태, 네 proxy version, 예약/승인/정산/삭제 경합 결과 | OFF 선행, 무지원 vendor 지출 0, 승인/근거/할당량 계약 유지 |
| 동의 v2 | provenance/ACL, 재동의 writer/UI 검토 SHA, coverage 수, 후속 철회 회귀 SHA·결과, flag | 미충족 0과 실행 중 철회 보호가 없으면 unset |
| SSV | drain 관측 구간, 네 RPC ACL, 구 RPC 차단, OFF 503, canary 원장 delta·replay/거부 결과 | 중복 지급 0, unit 결속, 공개 client OFF 유지 |
| Paddle | drain, legacy reconciliation, refund migration/Edge version, binding 세대·키 종류, signed replay/거부 결과 | 결과 불명 consequence 없음, 중복 권한/매출 반영 없음 |
| Sandbox | 운영/sandbox 서로 다른 ref, 설정 종류, Test Mode, 결제/갱신/환불 결과, 운영 원장 delta | 격리 DB만 변경, 운영 delta 0 |
| 종료/중단 | 분야별 PASS/UNVERIFIED/STOP, 최종 flag, 남은 조건, roll-forward 계획 | 부분 성공을 전체 활성화 완료로 보고하지 않음 |

JWT gateway 설정도 결과에 포함한다. `paddle-webhook`·`rewarded-ssv`는 false이며 자체 서명 검증을
사용한다. 네 LLM proxy·`subscription-manage`·`delete-account`는 **true를 유지**한다.

## 5. 검증 명령과 실행 위치

승격 후 소스/CI 검사:

```powershell
npm run check:definer-grants
npm run check:erasure-registry
npm run verify
npm run verify:web
```

게시 대상의 공개 Supabase 설정이 주입된 환경에서 읽기 전용 배포 gate:

```powershell
node scripts/check-signup-consent-deployment.cjs
```

아래 두 runner는 **이미 준비한 폐기용 localhost DB 전용**이다. 예시 포트·역할·DB는
CI의 좌표이며 운영 연결로 바꾸거나 운영에서 fixture를 실행하지 않는다.

```powershell
node scripts/test-signup-consent-sql.mjs 5432 signup_local signup_test_ci
node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci
```

`scripts/check-reward-ssv-db.sh`는 GitHub Actions scratch DB에 제한돼 있다.
`db/tests/*regression.sql`은 쓰기·삭제 fixture를 포함하므로 운영 postflight 쿼리가 아니다.
운영 postflight에는 읽기 전용 catalog/ACL/상태 쿼리와 범위가 고정된 canary만 사용한다.
이 문서는 운영 apply/deploy를 자동 실행하는 명령 묶음을 제공하지 않는다.

고정 SHA의 기존 증거: 전체 verify 806 suites / 10,324 tests, web 127 documents,
가입·Polaris 로컬 SQL, 최종 원격 verify/sql/web-export-smoke/lint PASS.
[CI](https://github.com/Simon-YHKim/2nd-B/actions/runs/36145633007) ·
[SQL CI](https://github.com/Simon-YHKim/2nd-B/actions/runs/36145633041).
Deno 실제 배포, 운영 적용, sandbox 종단 검증은 당시 미실행이다.
이 문서 작성 시 위 전체 검사를 재실행한 것으로 기록하지 않는다.

## 6. 기존 인계 경로와 후속

- 절차 정본: [SESSION-OWNERSHIP](../SESSION-OWNERSHIP.md),
  [Paddle runbook](../PADDLE-SANDBOX-RUNBOOK.md), [실행 기록](COMPLEMENT-EXECUTION-260925.md).
- 과거 콘솔 문서: `docs/cowork-console-260820.md`와 `docs/cowork-reply-260819.md`.
  현재 콘솔 연결이나 현재 적용 상태를 증명하는 자료로 사용하지 않는다.
- 과거 Relay 결과 경로: `E:/2ndB/.bots/relay/outbox/vb-2e14b97d.result.md`.
- 보류 중 후속 결과 경로: `E:/2ndB/.bots/relay/outbox/vb-243be209.result.md`.
  이번 준비에서는 재전송·polling·결과 변경을 하지 않았다.
- 이 패키지를 `.bots/relay/inbox`에 복사하거나 Bot 채팅에 붙여 넣으면 전달 효과가 생긴다.
  현재 전달 보류를 유지한다. 전달 재개 시 coordinator가 최신 연결·대상·소스·승인 범위를
  대조하고 `/vibe-bot`의 검증된 전달 절차를 따른다.
- 검증 중인 동의 후속 변경은 별도 패키지로 확정한다. 해당 후속이 없으면 이 고정 SHA의
  verified-consent 활성화 미완료 상태는 계속 유지된다.
