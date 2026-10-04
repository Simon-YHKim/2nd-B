# 광고 보상 기록 89일 정리 · 분쟁 보류 운영 문서 (초안)

- 작성: Hadrianus(Dev Infra), 2026-10-04 19:40 KST, 20:43 KST 갱신(S1~S4 확정 반영). PR-7a(W5)에 넣을 초안이다. 아직 리포에 넣지 않았다.
- 근거: Simon D1~D5 (2026-10-04 19:26~19:29 KST), S1~S4 (20:30~20:31 KST), S5 (21:03 KST), S3-LEDGER (21:04 KST), `/workspace/relay-inbox/simon-go-attested-20261004-1926-ssv-d1.md`. Gaius 답변서 `vb-ssv-90d-purge-legal-answers.result.md` (③ 사유 코드, ④ 89일·감시, ⑦ 백업 문장 B 대비, W5 추가 항목).
- 대상 객체(0211): `reward_dispute_holds`, `reward_dispute_hold_events`, `place_reward_dispute_hold`, `review_reward_dispute_hold`, `release_reward_dispute_hold`, `purge_reward_records`, `reward_retention_health`, pg_cron `purge-reward-records-90d`.
- 확정 사항: **S1** 보류·해제 감사 기록은 분쟁이 끝난 날부터 3년 보관(방침 문장 A). **S2** 사유 코드 2종. **S3** 백업 문장 B 채택(그래서 §7 절차는 필수). **S4** 보류는 자동 상한 없이 90일마다 재검토, 담당은 D4(Simon 승인, Hadrianus 실행).
- **S5**(21:03 KST): DB 백업 아티팩트를 private 저장소로 옮긴다(실제 이동은 별도 GO, 계획서 `E:\2ndB\.bots\dev-infra\outbox\backup-private-move-plan.md`). 방침에 GitHub(국외) 보관을 적는다. 이동이 끝나면 §7의 `db-backup.yml`·아티팩트 위치를 새 저장소로 고친다.
- **S3-LEDGER**(21:04 KST): 복원 시점 이후 삭제 원장은 장애 난 DB의 `account_deletion_tombstones`를 쓰고, 얻지 못하면 서비스를 다시 열기 전에 Simon이 정한다(§7 2번).

## 1. 무엇이 언제 지워지나

| 대상 | 기준 | 시점 |
|---|---|---|
| `rewarded_ssv_txns` | `granted_at`부터 89일 | 매일 04:37 KST |
| `credit_ledger` ad_reward 로트 전체 | 여는 행 89일 + 만료 + 합계 0 | 같음 |
| `usage_counters` 보상 칸 | 그 KST 달 1일 0시부터 89일 | 같음(칸만 0, 행은 남음) |
| `chat_usage.ad_bonus` | 그 KST 날 0시부터 89일 | 같음(칸만 0) |
| `reward_ssv_issue_rate_limits` | `updated_at`부터 89일 | 같음 |
| `reward_ssv_tickets` | 소비 1일 뒤, 미사용 20분 만료 뒤 | 5분마다(0196) |
| `reward_dispute_hold_events`(감사 기록) | 그 사건의 분쟁이 끝난 날부터 3년(− 1일) | 매일 04:37 KST, 사건 단위(S1) |

- 89일 = 방침의 "최대 90일" − 실행 주기 1일. 하루 늦게 돌아도 90일 안에 지워진다.
- `credit_balance.lifetime_*`(누적 합계 숫자)는 이 정리에서 건드리지 않는다. 계정 삭제 때만 지워진다(Gaius ⑧).
- 계정을 지우면 위 기록은 보류 여부와 상관없이 함께 지워진다. 보류는 계정 삭제를 막지 않는다.

## 2. 담당자 규칙 (D4)

1. **요청 접수**: 이용자 문의나 스토어·광고 제공자 연락으로 특정 보상 거래에 분쟁이 생기면, 받은 사람이 Simon에게 알린다. 거래 ID(AdMob `transaction_id`)를 확인한다.
2. **승인**: Simon이 보류를 승인한다. 승인은 글로 남긴다(메시지 위치와 시각을 사건 파일에 적는다). 승인 없이는 걸지 않는다.
3. **실행**: Hadrianus(Dev Infra 봇)가 운영자 SQL 세션(JWT 없는 postgres 세션)에서 실행한다. 감사 기록에는 `actor = 'hadrianus'`, `approved_by = 'simon'`, `actor_role = 'operator'`가 남는다.
   - 함수가 `approved_by`가 비었거나 `actor`와 같으면 거부한다(자기 승인 금지). 감사 표도 같은 검사를 한다.
   - service_role 경로는 나중의 관리 도구를 위해 열려 있지만 지금은 쓰지 않는다. 쓰기 시작하려면 Simon이 따로 정한다.
   - Hadrianus가 실행할 수 없을 때의 대리 실행자는 정하지 않았다. 생기면 Simon이 정하고 이 절에 적는다.
4. **재검토(S4)**: 보류는 자동으로 풀리지 않는다. 걸 때와 다시 걸 때 `next_review_at`이 90일 뒤로 잡힌다. 기한이 오면 Hadrianus가 사건 상태를 확인해 Simon에게 올리고, Simon이 "계속" 또는 "해제"를 정한다.
   - 계속이면 Hadrianus가 `review_reward_dispute_hold`를 실행한다. 다음 재검토가 90일 뒤로 밀리고 감사 기록에 `reviewed`가 남는다.
   - 해제면 5번으로 간다.
   - 기한이 지난 활성 보류가 있으면 감시(§6)가 알린다.
5. **해제**: 분쟁이 끝나면 Simon이 해제를 승인하고 Hadrianus가 실행한다. 감사 기록 형식은 같다.
6. **기록**: 실행할 때마다 worklog에 한 줄을 남긴다(사건 번호, 동작, 시각만 적고 거래 ID와 이용자 정보는 적지 않는다).

## 3. 사유 코드 (S2 확정, 2026-10-04 20:31 KST)

| 코드 | 뜻 |
|---|---|
| `user_dispute` | 이용자가 특정 보상 거래에 이의를 제기함 |
| `store_dispute` | 특정 보상 거래의 지급 적정성에 관한 분쟁(스토어·광고 제공자 쪽에서 제기된 것 포함) |

- 다른 값(옛 초안의 `authority_request`, `other` 포함)은 DB CHECK가 거부한다. 코드를 늘리려면 새 마이그레이션과 Gaius 확인이 필요하다.
- "보상 지급과 관련한 분쟁"이 아닌 일(예: 수사기관 자료 요청)로 기록을 보존해야 한다면 이 장치를 쓰지 않는다. Simon과 Gaius에게 따로 올린다.

## 4. 사건 번호(`case_ref`) 규칙

- 형식: `RDH-YYYYMMDD-NN` (예: `RDH-20261104-01`). DB는 `^[A-Za-z0-9_-]{1,64}$`만 받는다.
- **이용자 식별값은 넣지 않는다**: 이메일, 전화번호, 이름, user_id, 광고 ID, 거래 ID 모두 금지. 형식 검사는 `@`·공백·마침표를 막지만, 숫자열(user_id 일부 등)은 막지 못하므로 사람이 지킨다.
- 사건 파일(요청 내용, 승인 기록, 결과)은 DB 밖 비공개 위치에 둔다. 위치는 Simon이 정한다(정해지면 이 줄에 적는다).
- **보관 기간(S1 확정)**: 감사 기록과 사건 파일 모두 **분쟁이 끝난 날부터 3년** 보관한 뒤 지운다.
  - 감사 기록: `purge_reward_records()`의 3-6 단계가 매일 지운다. "분쟁이 끝난 날"은 그 사건 번호의 마지막 `released` 시각이다. 해제 없이 보류 행이 지워졌으면(활성 보류 중 계정 삭제) 그 `source_deleted` 시각이다. 같은 사건 번호에 활성 보류가 하나라도 있으면 지우지 않는다. 매일 한 번 돌기 때문에 기준을 3년 − 1일로 잡았다.
  - 사건 파일: 같은 날짜 기준으로 Hadrianus가 지운다. 감사 기록이 지워진 사건(감시 §6의 `overdue_hold_audit_cases`가 0이 된 뒤)의 사건 파일을 매달 한 번 찾아 지우고 worklog에 사건 번호만 남긴다.
- 방침 문장 A(S1 채택): Gaius 답변서 ①의 초안 문장을 그대로 쓴다(분쟁 보류·해제 기록을 분쟁 종료일부터 3년 보관 뒤 파기). 문장 원문은 방침 개정안(GO-7)에 들어간다. 이 문서에는 옮겨 적지 않는다.

## 5. 절차와 SQL

보류를 걸려면 기록이 지워지기 **전**, 곧 적립 뒤 89일 안에 걸어야 한다. 이미 지워졌으면 `place`가 `false`를 돌려준다. 그때는 보존할 기록이 없다는 것을 사건 파일에 적는다.

```sql
-- 걸기 (Simon 승인 뒤, Hadrianus 실행). true = 새로 걸림 또는 다시 걸림, false = 이미 걸려 있음 또는 거래 없음
SELECT public.place_reward_dispute_hold(
  '<transaction_id>', 'user_dispute', 'RDH-20261104-01', 'hadrianus', 'simon');

-- 확인 (건수와 상태만)
SELECT h.case_ref, h.reason_code, h.placed_by, h.placed_at, h.released_at
  FROM public.reward_dispute_holds AS h
 WHERE h.case_ref = 'RDH-20261104-01';

-- 재검토(S4, Simon이 "계속"을 승인한 뒤 Hadrianus 실행). 다음 재검토를 90일 뒤로 미룬다
SELECT public.review_reward_dispute_hold('<transaction_id>', 'hadrianus', 'simon');

-- 재검토 기한이 다가오거나 지난 활성 보류(14일 안). 건수와 날짜만 본다
SELECT h.case_ref, h.reason_code,
       to_char(h.next_review_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS next_review_kst
  FROM public.reward_dispute_holds AS h
 WHERE h.released_at IS NULL AND h.next_review_at < now() + interval '14 days'
 ORDER BY h.next_review_at;

-- 풀기 (Simon 승인 뒤, Hadrianus 실행). 다음 04:37 KST 실행에서 89일이 지난 기록이 지워진다
SELECT public.release_reward_dispute_hold('<transaction_id>', 'hadrianus', 'simon');

-- 감사 기록
SELECT e.at, e.action, e.reason_code, e.actor, e.approved_by, e.actor_role,
       e.transaction_id IS NULL AS source_deleted
  FROM public.reward_dispute_hold_events AS e
 WHERE e.case_ref = 'RDH-20261104-01'
 ORDER BY e.at;
```

- 보류 범위는 "해당 기록만"이다: 그 거래의 `rewarded_ssv_txns` 행, memo로 이어진 ad_reward 로트, 그 사용자의 그 KST 달 `usage_counters` 보상 칸, 그 KST 날 `chat_usage.ad_bonus`. 같은 사용자의 다른 거래는 89일에 지워진다.
- 거래 ID는 채팅·worklog·이슈에 남기지 않는다. SQL을 실행할 때만 쓴다.

## 6. 감시와 알림 (Gaius ④)

- `public.reward_retention_health()`(service_role과 운영자 세션 전용)가 돌려주는 것: 91일 넘은 비보류 기록 수(표별), 재검토 기한이 지난 활성 보류 수(`overdue_hold_reviews`, S4), 분쟁 종료 3년 넘게 남은 감사 사건 수(`overdue_hold_audit_cases`, S1), `purge-reward-records-90d`의 활성 여부, 마지막 성공 시각, 7일 안 실패 수, 26시간 넘게 성공이 없는지(`cron_stale`), 그리고 종합 `ok`.
- **알림**: `.github/workflows/billing-tripwires.yml`(매일 05:20 KST 예약, 실제 실행은 GitHub 사정으로 몇 시간 늦을 수 있음)가 이 함수를 읽어 `ok = false`면 `reward_retention` 칸을 1로 만들고 ops 이슈를 연다. 출력은 건수와 참/거짓뿐이다(리포가 public이라 이슈와 로그도 공개된다).
- 배포 직후 첫 04:37 KST 실행 전에는 `cron_stale = true`가 맞다(아직 한 번도 돌지 않았다). 첫 실행 뒤에도 `true`면 조사한다.
- 이상이 보이면:
  1. `verify/prod-readonly-checks.sql`의 F·G·H로 실행 기록과 잔량을 본다(읽기만).
  2. 실패 메시지가 잠금 시간 초과면 다음 날 실행을 기다려도 90일 안이다(89일 기준이므로 하루 여유). 이틀 연속이면 Simon에게 알린다.
  3. 수동 실행 `SELECT public.purge_reward_records();`는 운영 쓰기다. Simon 승인 뒤 Hadrianus가 실행한다.
  4. 91일 넘은 비보류 기록이 실제로 있으면 방침 위반 가능성이 있으므로 같은 날 Gaius에게 알린다.
  5. `overdue_hold_reviews`가 0이 아니면 §2의 4번(재검토)을 바로 한다. `overdue_hold_audit_cases`가 0이 아니면 정리 작업이 3-6 단계에서 실패하는지 본다(1번과 같음).

## 7. 백업 복원 뒤 삭제 다시 적용 (필수. S3 방침 문장 B 채택)

방침 문장 B(S3 채택): Gaius 답변서 ⑦의 초안 문장을 그대로 쓴다(지운 정보가 암호화 백업에 최대 14일 남을 수 있고, 백업은 장애 복구에만 쓰며, 복원하면 이미 지운 정보를 다시 지운다). 문장 원문은 방침 개정안(GO-7)에 들어간다. 그래서 아래 절차는 복원할 때마다 **반드시** 한다.

원칙: 백업은 **장애 복구에만** 쓴다. 지운 기록을 되살리려고 복원하지 않는다. `db-backup.yml` 아티팩트는 14일 뒤 만료된다(`expires_at`). 복원은 `docs/DB-RESTORE-RUNBOOK.md`를 따르고, 운영에 되돌려 놓는 경우에는 그 문서 §7 검증 뒤, 서비스를 다시 열기 **전에** 아래를 한다.

1. **복원 시점 기록**: 쓴 백업의 생성 시각(KST)을 적는다. 그 뒤에 일어난 삭제는 복원된 DB에 반영돼 있지 않다.
2. **계정 삭제 다시 적용**: 복원 시점 이후에 삭제된 계정 목록을 구한다. 우선 출처는 장애 난 DB의 `account_deletion_tombstones`(읽을 수 있으면)이고, 그다음은 Supabase Auth 감사 로그와 운영 기록이다. 그 계정들을 평소의 계정 삭제 경로로 다시 지운다(tombstone 행도 다시 쓴다).
   - **삭제 원장 출처(S3-LEDGER 확정, 2026-10-04 21:04 KST)**:
     1. 장애 난 DB(원래 Supabase 프로젝트)의 `account_deletion_tombstones`에서 복원 시점(1번) 이후 행을 읽는다. 읽기 전용 SQL 세션으로 계정 ID와 삭제 시각만 가져오고, 목록은 worklog에 건수만 남긴다.
     2. 이 표를 얻지 못하면(프로젝트째 잃었거나 읽을 수 없음) **서비스를 다시 열지 않는다**. Hadrianus가 상황(복원 시점, 잃은 구간, 알 수 있는 다른 단서)을 Simon에게 올리고, Simon이 진행 방법을 정한 뒤에만 다시 연다. Supabase Auth 감사 로그 같은 다른 출처는 Simon이 그때 고를 수 있는 단서로만 적는다.
3. **89일 정리 다시 적용**: `SELECT public.purge_reward_records();`를 바로 실행한다. 복원된 행 가운데 이미 89일이 지난 것이 지워진다.
4. **보류와 감사 기록 맞추기**: 복원 시점 이후에 풀린 보류는 복원된 DB에서 다시 활성으로 보인다. 사건 파일과 대조해 풀린 것은 다시 푼다(Simon 승인 기록은 원래 것을 쓴다). 복원 시점 이후에 새로 건 보류는 다시 건다(대상 거래가 복원돼 있을 때만). 복원 시점 이후의 재검토도 사건 파일대로 `review`를 다시 실행한다. 3년이 지나 이미 지운 감사 기록이 복원됐으면 다음 정리 실행이 다시 지운다(3번에서 함께).
5. **확인**: `SELECT public.reward_retention_health();`가 `ok = true`인지(첫 cron 실행 전이면 `cron_stale`만 true), `verify` E가 0인지 본다.
6. **기록**: 복원 시각, 다시 적용한 계정 수와 정리 건수(건수만)를 worklog에 남기고 Gaius에게 알린다.

## 8. 하지 말 것

- 보류 표나 감사 표에 직접 INSERT·UPDATE·DELETE 하지 않는다(권한도 없다). 함수만 쓴다.
- 기간 상수(89일)를 바꾸지 않는다. 바꾸려면 새 마이그레이션, Gaius 확인, 회귀 테스트 P9 갱신이 필요하다.
- `app.credit_mirror`, `app.reward_hold_audit_purge` 우회를 다른 곳에서 쓰지 않는다. 감사 기록은 정리 작업만 지운다.
- cron 작업을 끄는 것(`cron.unschedule`)은 응급 정지일 때만 하고, Simon 승인 뒤 Hadrianus가 실행한다. 끄면 하루 안에 `reward_retention` 알림이 뜬다.
