# 세션 소유 경계

2026-08-17 밤에 콘솔 세션과 코딩 세션이 같은 저장소·같은 운영 DB 에 동시에 쓰기
시작했다. 하루 안에 PR 9건이 두 세션에서 나왔고 경계가 흐려졌다. 이 문서는 다음
사고를 막기 위한 규칙이고, 이미 확인한 사실도 함께 적어 같은 조사를 반복하지 않게 한다.

## 1. 누가 무엇을 소유하는가

| 영역 | 소유 |
|---|---|
| 운영 DB 마이그레이션 **적용** | 콘솔 세션 |
| 엣지 함수 **배포** | 콘솔 세션 |
| 저장소 시크릿·변수 | 콘솔 세션 (값은 사람이 입력) |
| 백업·복원·드릴 | 콘솔 세션 |
| 앱 코드·테스트 | 코딩 세션 |
| 코드를 설명하는 문서 | 코딩 세션 |
| 자기가 만든 PR 머지 | 만든 쪽 |

### 순서 규칙: 서버가 먼저, 클라이언트가 나중

클라이언트가 새로 의존하는 **서버 좌석·컬럼**이 생기면 **서버 배포·적용이 먼저,
클라이언트 활성화(변수 플립·머지)가 나중이다.** 반대로 하면 그 기능이 통째로 실패한다.
같은 모양이 이미 세 번 나왔다:

| 사례 | 거꾸로 하면 |
|---|---|
| `0127` (`users.display_name`) | 신규 가입이 100% 실패 |
| `0130` (`consent_records.safety_notice_ack`) | 가입 동의 기록이 실패 |
| `openai-proxy` 의 `secondb_chat` 좌석 | 대화가 `400 purpose_not_seated` 로 전부 실패 |

서버 쪽이 콘솔 소유이고 클라이언트 쪽이 코딩 세션 소유이므로, 이 순서는
**두 세션 사이의 순서**다. 클라이언트를 머지하는 쪽이 서버 배포가 끝났는지 확인한다.

#### Paddle 환불 무결성 draft: 웹훅을 끈 상태에서만 교체

`db/migration-drafts/UNNUMBERED_paddle_refund_consequence_integrity.sql`은 DB 함수와
`paddle-webhook`을 함께 바꾸므로 위의 일반적인 서버-first 규칙만 적용해서는 안 된다.
이 교체는 `apply_billing_refund`의 **9개 인자 SQL 시그니처만 유지한다.** 이전 Edge는
`p_event_id`에 `${eventId}:consequence`를 보냈지만 새 함수는 정확한 source lifecycle event를
요구하므로 **구 Edge와 새 DB 함수는 의미상 호환되지 않는다.** 새 함수는 구 호출을 거부하지만
구 Edge는 그 두 번째 RPC 오류를 기록한 뒤에도 200을 반환했다. 그래서 새 recorder는 승인된 source를
먼저 `refund_consequence_pending` review로 남기며, strict Edge만 확인된 consequence 뒤 이를 닫는다.
그 방어와 별개로 DB와 Edge 어느 쪽도 웹훅이 켜진 채 단독 교체하지 않는다.
7단계 직전에 아래 번호 규칙으로 당시의 다음 번호를 예약·push한다. **유일한 안전 순서**는
다음과 같다.

1. `PADDLE_WEBHOOK_ENABLED`를 `1`이 아닌 값으로 설정해 웹훅을 비활성화한다.
2. Edge invocation·gateway·Paddle delivery 로그를 함께 보고 기존 `paddle-webhook`의 **in-flight가
   0건**임을 확인한다. 비활성화 직전 시작된 요청의 최대 실행 시간과 재시도 지연보다 길게 관찰하고,
   0건을 증명할 수 없으면 DB 함수를 교체하지 않는다. 기능 플래그 OFF만으로 drain을 대신하지 않는다.
3. 초기 rollout에서는 server-only `PADDLE_CHECKOUT_BINDING_SECRET`을 `subscription-manage`와
   `paddle-webhook`에 동일한 current 값으로 설정하고 previous 관련 두 변수는 비워 둔다.
4. `subscription-manage`을 먼저 배포하고 인증된 사용자에게만 짧은 checkout binding이 발급되는지
   확인한다.
5. 새 Paddle client token으로 binding-aware 클라이언트를 배포한다.
6. 기존 client token을 폐기하고 더는 구 클라이언트가 checkout을 열 수 없는지 확인한다.
7. 이미 열린 legacy checkout을 조정하거나 종료하고, 서명 없는 결제의 소유권을 운영자가
   reconciliation할 수 있게 목록을 고정한다.
8. `db/migration-drafts/UNNUMBERED_paddle_refund_consequence_integrity.sql`에 당시 새 번호를
   배정해 `db/migrations/`로 옮기고 예약 브랜치를 push한 뒤 적용을 완료한다.
9. strict `paddle-webhook`을 배포한다. `subscription-manage`와 동일한 binding secret인지 확인한다.
10. 격리된 staging 또는 local에서 `PADDLE_WEBHOOK_ENABLED=1`로 설정하고
   signed·tampered·expired·unattributed·retry webhook canary와 복수 adjustment 회귀를 실행한다.
11. 운영에서는 콘솔 소유자가 제한된 점검 창에서만 `PADDLE_WEBHOOK_ENABLED=1`로 전환하고,
    이미 처리된 무해한 signed event의 idempotent replay와 거부 canary를 즉시 실행한다. 활성화·검증·
    로그 확인을 같은 창에서 수행하며, 하나라도 실패하면 즉시 `PADDLE_WEBHOOK_ENABLED`를 다시 끈다.
12. 모든 운영 canary가 통과한 경우에만 `PADDLE_WEBHOOK_ENABLED=1`을 유지한다. 실패 시에는
    비활성 상태를 유지하고 아래 roll-forward 절차를 따른다.

운영 이후 checkout-binding 키 교체는 한 개 signer와 두 개 verifier의 순서를 따른다.
먼저 `paddle-webhook`의 current를 new, previous를 old로 먼저 설정하고
previous expiry는 계획한 signer 전환 시각보다 최소 7일 + 10분 뒤로 보수적으로 둔다. 이를
`PADDLE_CHECKOUT_BINDING_SECRET_PREVIOUS_EXPIRES_AT`에 기록한 다음 `paddle-webhook`을 먼저 재배포한다.
그 다음 `subscription-manage`의 current signer를 new로 전환해 배포하면서 실제 마지막 old binding 발급 시각을 기록한다.
설정된 expiry가 그 실제 시각 + 7일 + 5분보다 이르면 즉시 뒤로 연장하고 절대 줄이지 않는다. 이 실제 보존 시각이
지나고 old-key 검증 로그가 0임을 확인한 뒤 webhook의 previous secret과 expiry를 제거해 다시 배포한다.
`subscription-manage`는 previous secret을 읽거나 서명하지 않는다. 초기 OFF rollout 중에는
두 current 설정을 끝낸 뒤 9~12단계 canary에서 같은 값을 검증한다.

DB-first만으로는 안전하지 않다. 배포 간격에 구 Edge 함수가 서명된 최상위 `partial`을
line item 하나의 `full`만 보고 전체 환불로 승격할 수 있다. Edge-first도 안전하지 않다.
새 Edge 함수가 호출하는 `record_paddle_adjustment_review` RPC는 번호가 배정된 이 migration이
만들기 때문에, 먼저 배포하면 결과 기록 단계가 실패하고 이미 확정됐는지 모르는
consequence를 남길 수 있다.

어느 단계에서든 실패하면 **웹훅을 비활성 상태로 유지한 채 roll-forward**한다. 번호가 배정된
migration과 현재 Edge 함수가 모두 정상인 상태를 만든 뒤에만 다시 켠다.
구 Edge 함수를 재배포하지 않는다.
`db/migrations/rollback/0136_down.sql`을 실행하지 않는다. 둘 다 제거한 partial→full 경로를
다시 열기 때문에 이 변경의 운영 롤백 수단이 아니다.

운영 review는 `refund_review=true`인 행을 정규화된 `paddle_adjustment_id` ·
`paddle_adjustment_action` · `paddle_adjustment_status` · `billing_review_reason`으로 조회한다.
판단과 외부 조정이 끝난 뒤에만 service role로
`set_paddle_refund_review('<event_id>', false)`를 호출한다. 이 RPC는 원인을 지우지 않고
`billing_review_resolved_at`을 남긴다. raw payload의 90일 삭제는 이 queue를 닫지 않는다.

#### Reward SSV: 서버 선행 전환

`db/migration-drafts/UNNUMBERED_reward_ssv_hardening.sql`은 기존 consume RPC를 제거하고
`rewarded-ssv`의 atomic settle RPC를 도입하므로 DB와 Edge를 온라인 상태에서 한쪽씩
교체할 수 없다. 공개 앱이 새 서버 계약보다 먼저 광고를 열지 않도록 아래 순서를 지킨다.

1. **server OFF:** 콘솔 세션이 운영 `REWARD_SSV_ENABLED=0`을 확인한다. 공개 client의
   `EXPO_PUBLIC_REWARD_SSV`도 unset/false로 유지한다. 기존 Edge invocation·광고 콜백의
   in-flight가 0인지 로그로 확인한다. 거래 원장 0건이나 티켓 테이블 부재로 drain을 대신하지 않는다.
2. **DB:** 운영 이력·함수 본문·ACL로 `0172_reward_authorization_hardening.sql`의
   서버 전용 지급 권한과 현재 사용자 자격 검사를 확인한다. 미적용이면 기존 기반 함수·원장을
   확인한 뒤 선행 적용한다. 이어 `0177_reward_ssv_tickets.sql` 또는 동등한 티켓 계약을
   적용한다. 당시의 다음 번호를 원격 재조회·예약·push한 뒤
   `UNNUMBERED_reward_ssv_hardening.sql`을 번호가 붙은 migration으로 적용하고 DB 회귀를 확인한다.
   **0177 단독 상태에서 활성화하지 않는다.** 0177의 티켓은 10분이고 hardening과 새 Edge는
   20분 계약이다. 아래 네 RPC의 정확한 시그니처와 `service_role` 전용 실행 권한을 확인한다.
   - `claim_reward_ssv_issue_rate_limit(uuid)`
   - `issue_reward_ssv_ticket(uuid,text,text,text,integer,text)`
   - `claim_reward_ssv_callback_attempt(text,text,text,integer,text)`
   - `settle_reward_ssv_ticket_v2(text,text,text,integer,text)`
   기존 `consume_reward_ssv_ticket(text,uuid,text,text,integer,text)`와
   `grant_chat_ad_bonus(uuid)`·`bump_reward_credits_if_under_cap(uuid,text,integer)`는
   공개 역할과 `service_role` 모두 실행할 수 없어야 한다. 함수 이름 존재만으로 0172 적용을
   판정하지 않는다. 이 검증을 마치기 전에는 새 Edge를 배포하지 않는다.
3. **Edge:** `REWARD_SSV_AD_UNIT_IDS`에 Android/iOS 실유닛을 쉼표로 구분해 최대 두 개
   설정하고 새 `rewarded-ssv Edge`를 배포한다. 전체 ID 또는 숫자 접미사를 허용하지만
   티켓 발급·서명 콜백·DB 비교는 모두 숫자 접미사로 정규화한다. 단일 변수
   `REWARD_SSV_AD_UNIT_ID`는 복수 변수가 없을 때만 호환한다. 아직 `REWARD_SSV_ENABLED=0`이므로
   티켓 발급·보상 콜백은 503으로 닫혀 있어야 한다. 사용자·티켓 필드가 모두 없는 AdMob
   콘솔 확인 요청만 Google 서명 검증 후 200(`verification_only`)으로 응답하며 DB에 접근하지 않는다.
4. **공개 client capability OFF:** 배포된 앱의 `EXPO_PUBLIC_REWARD_SSV`는 계속 unset/false이고,
   실유닛이 없는 빌드도 `canCompleteRewardedWatch()`에서 닫히는지 확인한다.
5. **제한 canary:** 콘솔 세션이 감시 창에서만 `REWARD_SSV_ENABLED=1`로 전환한다. 공개 앱은
   계속 닫아 둔 채 동일 실유닛을 넣은 비공개 canary 빌드와 지정 테스트 계정만 사용해
   ticket POST, Google 서명 GET, reasoning/chat 각각의 원장 반영, exact replay, 거부 경로를 확인한다.
6. **server 유지/rollback:** 모든 canary와 로그가 기대 결과와 일치하면 서버 플래그를 1로 유지한다.
   하나라도 실패하면 즉시 `REWARD_SSV_ENABLED=0`으로 되돌리고 server를 roll-forward한다.
   이미 적용한 DB를 되감는 `DB down migration`은 실행하지 않는다.
7. **client activation:** 서버가 유지 상태임을 재확인한 뒤에만 공개 빌드에
   `EXPO_PUBLIC_REWARD_SSV=true`와 플랫폼별 전체 ID
   `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID` / `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS`를 넣는다.
   Android만 전용 변수가 아예 없을 때 기존 `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID`로 호환하며,
   iOS는 Android 값을 재사용하지 않는다. 각 ID의 숫자 접미사가 서버 허용목록에 있어야 한다.
   새 클라이언트는 POST `{kind, ad_unit_id}`로 실제 표시할 단위를 지정하며 서버가 티켓에
   그 단위를 결속한다. 구 `{kind}` 요청은 서버 유닛이 하나일 때만 허용된다. 불일치·누락·
   Google test unit이면 광고가 열리지 않는지 release 전에 확인한다.

전체 ID를 저장하던 이전 티켓은 새 숫자 ID와 호환되지 않는다. 전환 전 광고를 닫고
발급된 티켓의 20분 유효기간 및 소비 후 1일 exact-retry 창이 지난 뒤 잔여 요청이 없는지
확인한다. DB 행을 일괄 수정해서 맞추지 않는다. 새 Edge와 클라이언트 배포가 끝나도
위 canary와 별도 운영 승인 전에는 두 플래그를 켜지 않는다.

2026-09-25 01:24 KST Relay 회신(`vb-2e14b97d`)은 운영 Edge **v86**이 기존 직접 지급
구현이고 `reward_ssv_tickets`·`issue_reward_ssv_ticket`이 없다고 보고했다. 이 관측이
여전히 유효하면 티켓 대기 창은 해당 없음으로 기록할 수 있지만, 구 방식 콜백의 drain과
0172 → 0177 → hardening 계약 확인은 필요하다. 이 수치는 콘솔 세션의 당시 관측이며
현재 상태나 이번 코딩 세션의 DB 직접 조회 결과로 간주하지 않는다.

운영 DB 적용, Edge 배포, 서버 플래그 전환은 모두 **콘솔 세션 소유**다. 코딩 세션은 번호
없는 draft와 검증 자료만 넘기며, 콘솔 완료 증거 없이 공개 client activation을 승인하지 않는다.

#### 2026-09-25 통합 QA: 가입·Polaris·Paddle의 서버 선행 조건

`fix/qa-harness-integrated-260925`는 아래 계약을 포함한다. 코드 검증과 운영 적용을
구분하며, 새 클라이언트의 활성화 전에 콘솔 증거를 확인한다.

- **가입:** `UNNUMBERED_signup_consent_admob_20260925.sql`을 0148/0149/0150의
  후속으로 번호 예약·적용한다. `signup_consent_contract_status()`의 email-v4 및
  consent/policy/terms 판본과 confirmation ready를 확인하고 실제 이메일 확인을 검증한다.
  과거 v2/v3 튜플과 기존 원장은 유지한다. Web publish·production EAS build·OTA는
  공개 상태 RPC가 현재 클라이언트와 일치하지 않으면 실패한다. 코딩 세션의 2026-09-25
  조회에서는 해당 RPC가 아직 없었으며, 로컬 build-only는 이 상태에서도 가능하다.
- **Polaris:** 0189·0190 및 번호를 예약한 account-deletion completion fence가 선행한다.
  `UNNUMBERED_polaris_generation_allowance.sql`을 번호로 승격할 때 canonical erasure
  registry·forward gate·rollback coverage도 함께 갱신한다. 기존 0189를 수정하지 않는다.
  콘텐츠 삭제 후에도 lifetime 사용 원장은 보존하고 근거·역할 카드를 제거하며,
  계정 삭제는 원장을 CASCADE로 지운다. DB `enabled=false`와 `ratify_polaris_role_card`
  준비 → OpenAI의 예약 근거·정산 wrapper 및 나머지 세 proxy의 공유 거부 가드 배포
  → 클라이언트 → 예약/정산/승인/삭제 경합 canary → enabled 순서다.
- **서비스 동의 v2:** 후속 코드가 `effective_llm_consent_snapshot_v2`로 제공자 호출 전후의
  같은 영수증·변경 번호를 검사한다. Polaris는 같은 token을 4인수 정산에 넘겨 SQL 잠금 아래
  재검사한다. OFF에서는 새 조회 없이 기존 3인수 정산과 호환된다. 활성화 전에는 snapshot
  RPC와 새 정산, 서버 소유 재동의·철회 writer/UI 및 현재 계약 영수증의 활성 계정 coverage가
  모두 준비돼야 한다. 과거 행을 backfill하지 않는다. 이미 구 draft가 적용된 운영에는 fresh
  CREATE 초안을 재적용하지 않고 실제 서명을 확인한 forward migration을 따로 준비한다.
  제공자 비용과 완료된 정산은 유지하며, 최종 DB 검사와 HTTP 전달의 원자성은 보장하지 않는다.
  chat_autosave/analytics 설정의 기존 의미를 새 서비스 동의로 바꾸지 않는다.
- **Paddle:** 위 refund OFF/drain 절차를 우선하며, v2 webhook verifier →
  subscription-manage signer → 웹 빌드 순서다. 서로 다른 Supabase 프로젝트와
  환경별 키·가격·binding을 사용한다. [sandbox runbook](PADDLE-SANDBOX-RUNBOOK.md)의
  실제 결제·갱신·환불·운영 원장 무변경 확인 전에는 종단 검증 완료로 기록하지 않는다.

[실행 기록](qa/COMPLEMENT-EXECUTION-260925.md)에 로컬 SQL·브라우저·하네스 증거와
미실행 항목을 구분했다. 위 운영 작업은 이번 코딩 세션에서 실행하지 않았다.

**마이그레이션 파일 작성은 원래 코딩 세션 몫이다.** 콘솔 세션이 쓴 적이 있다
(`0131`, 어드바이저가 잡은 인덱스 누락). 사람이 승인하면 가능하지만 **쓴 사실을
상대 세션에 알려야 한다.** 0131 은 알리지 않았고, 그래서 이 문서가 생겼다.

## 2. 마이그레이션 번호 규칙

번호 중복은 이 저장소에서 **이미 세 번 일어났다**: `0092` · `0113` · `0117` 각 2개.
중복은 조용히 성공하고 적용 순서가 승자를 정한다. 즉 사고가 나도 CI 가 안 잡는다.

1. 파일을 **쓰기 직전에** `origin/main` 에서 최댓값을 읽고 +1 한다. 미리 예약하지 않는다.
   ```powershell
   git fetch origin main
   git ls-tree -r --name-only origin/main -- db/migrations |
     ForEach-Object { [int]([System.IO.Path]::GetFileNameWithoutExtension($_)).Substring(0,4) } |
     Sort-Object -Descending | Select-Object -First 1
   ```
2. 번호를 잡았으면 **즉시 브랜치를 push** 한다. 로컬에만 두면 상대가 볼 수 없다.
3. 운영에 적용하기 **전에** 같은 번호를 든 다른 브랜치가 없는지 확인한다.
   ```powershell
   git for-each-ref --format='%(refname:short)' refs/remotes/origin |
     ForEach-Object { git ls-tree -r --name-only $_ -- db/migrations } |
     Select-String '0132_'
   ```
4. 2026-08-18 00:41 KST 기준 최댓값은 `0131`. **다음은 `0132`.**

## 3. 이미 조사가 끝난 것 (다시 파지 말 것)

### 원장 이름이 파일 이름과 다른 10건

운영 `supabase_migrations` 에 `atomic_chat_usage` · `clipper_templates` ·
`t5_peer_review` · `records_structured` · `retention_activation` · `ops_daily_brief` ·
`reasoning_usage_cap` · `records_pgvector` · `notices` · `notice_withdrawal` 이
**번호 없는 이름**으로 기록돼 있다. main 의 `0026` · `0027` · `0064` · `0066` ·
`0067` · `0069` · `0070` · `0071` · `0113_notices` · `0114` 와 같은 것이다.
옛 툴링이 남긴 라벨 차이이고 스키마는 최신이다.

### 원장에 이름이 아예 없는 파일 7건 (전부 효과는 적용됨, 2026-08-18 실측)

| 파일 | 무엇으로 확인했나 |
|---|---|
| `0102_rls_wrap_auth_uid` | 어드바이저에 `auth_rls_initplan` 없음 |
| `0104_pin_function_search_path` | 어드바이저에 `function_search_path_mutable` 없음 |
| `0105_fk_covering_indexes` | `unindexed_foreign_keys` 가 `community_rooms` 1건뿐이었고 그건 `0131` 로 닫았다 |
| `0103_persona_graph_capture` | 원장의 `persona_graph_recall` 과 같은 것. `persona_entity` 테이블 존재 |
| `0092_runtime_flags` | `runtime_flags` 테이블 존재, 3행 |
| `0106_award_xp_once_only_race` | `award_xp` 본문에 `pg_advisory_xact_lock` 존재 |
| `0068_reset_wiki_embeddings` | 데이터 전용. `wiki_pages` 가 0행이라 무의미 |

### `bump_free_caps_5_chats_30_reasoning_20260711` 은 파일로 만들지 마라

운영 원장에는 있는데 main 에 파일이 없다. **의도된 상태다. 복원하려 들면 회귀를 만든다.**

- 채팅 몫(free 5/day)은 **`0090_chat_ad_bonus.sql` 에 흡수**돼 있다.
  main 파일과 운영 함수 본문이 주석까지 같다: `ELSE 5  -- free (5/day, Simon 2026-07-11)`.
- 추론 몫(월 30)은 **`0089_reasoning_weekly_cap.sql` 이 주 2회로 교체**했다.
  운영도 `ELSE 2  -- free (주 2회, Simon 2026-07-17)` 이다.

즉 main 파일만 처음부터 재생하면 운영과 같은 상태로 수렴한다. 이 이름으로 새 파일을
만들어 뒤 번호에 붙이면 **`0089` 가 없앤 월 30 캡을 되살려 주 2회를 덮어쓴다.**
파일이 없는 것이 맞다.

## 4. 주인이 없던 항목

| 항목 | 주인 | 상태 |
|---|---|---|
| `auth.identities` 패스 2 실측 | **콘솔 세션** | 미완. `docs/DB-RESTORE-RUNBOOK.md` 참조 |
| 벤더 키 4종 등록 | Simon | 미완 |
| age 개인키 KeePass 백업 | Simon | 미완 |
| 화면 육안 확인 2건 | Simon | 미완 |
