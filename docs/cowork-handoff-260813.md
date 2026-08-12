# [cowork 발주] 2nd-B 잔여 작업 통합 인계 — 셀프 해지·환불 + 머지 큐

작성: Claude, 2026-08-13 · 이 문서 하나로 남은 일이 전부 끝나야 한다.
`docs/cowork-paddle-console-260810.md` 는 이 문서로 **대체됨** (그 문서의 1·2번은 완료, 배포 버전 수치는 낡음).

---

## 0. 공통 규칙 (어기면 되돌려야 한다)

- **main 직접 push 금지.** 항상 PR. 자동 머지는 CI 그린일 때만.
- **시크릿 하드코딩 절대 금지.** Paddle/Supabase 키는 전부 Supabase 함수 시크릿이며 **값은 Simon 이 직접 입력**한다.
- **새 `SECURITY DEFINER` 함수는 같은 파일에서 `REVOKE EXECUTE ... FROM anon` 필수.** Supabase 가 생성 즉시 anon 에 EXECUTE 를 자동 부여하므로 `REVOKE FROM PUBLIC` 만으로는 부족하다. `npm run check:definer-grants` 가 강제한다.
- **`git add -A` 금지.** 파일을 명시해서 스테이징한다.
- **Conventional Commits.** 커밋 전 취약점 코드리뷰.
- **`npm run verify` 단독 통과 후 PR.** CI 는 이 스크립트를 그대로 호출한다.
- **마이그레이션은 운영 적용 전 dry-run 확인.**
- **파괴적/금전 작업은 멱등 + 감사기록.**
- **확인 못 한 것은 `UNVERIFIED` 로 표기.** 추측을 사실처럼 쓰지 않는다.
- em dash 금지 · 임상 어휘 금지 (정본 `src/lib/safety/lexicon.ts`).

---

## 1. 지금 상태 (2026-08-13 실측)

| 항목 | 값 |
|---|---|
| `main` HEAD | `215f5cdd` |
| 마이그레이션 | `0125_drop_users_orphan_backup_0107.sql` 까지 (운영 적용 완료) |
| `paddle-webhook` | **v22**, `verify_jwt=false`, 배포 소스에 0123 블록 포함 확인 |
| `subscription-manage` | **v12**, `verify_jwt=true` |
| `paddle_webhook_events` | 4행 (전부 0115 이전, `paddle_transaction_id` 전부 NULL) |
| `billing_self_service_log` | **0행** |
| `raw_payload IS NOT NULL` (미처리 이벤트) | **0행** |
| 유료 사용자 | **0명** |
| 환불 재검토 트리거 카운트 | **0** |
| `refund_eligibility` 결정 기록(`COMMENT ON`) | 존재함 |
| 환불 규칙 | 7일 + 무료 플랜 범위 이내, **전 결제에 즉시 적용** (시행일 게이트 없음) |

프로젝트 ref `zoacryukmdeivmolvyhj` · 웹훅 URL `https://zoacryukmdeivmolvyhj.supabase.co/functions/v1/paddle-webhook`

**UNVERIFIED**: `PADDLE_SELF_SERVICE_ENABLED` 와 `PADDLE_SELF_SERVICE_DRYRUN` 의 현재 값. 시크릿은 읽을 수 없다. 확인법은 작업 C 에 있다.

---

## 2. 작업 A — PR #1211 마이그레이션 재채번 후 머지 (최우선, 코드)

### 왜

`#1211 feat(community): 1:1 + group text chat v1` 이 **`db/migrations/0117_community_chat.sql`** 을 들고 온다.
그런데 main 에는 이미 `0117` 이 **두 개** 있고 번호는 `0125` 까지 갔다.

마이그레이션은 **파일명 순서로 적용**된다. 이대로 머지하면 커뮤니티 스키마가 `0118`~`0125` **앞에서** 실행된다.
git 은 충돌을 보지 않고 CI 도 초록이다. **이 레포는 이미 같은 사고를 한 번 겪었다** (`0119_reconcile_two_0117s.sql` 이 그 수습 기록).

### 무엇을

1. 브랜치 `Simon-YHKim/260810_UIUX` 최신화 (원격에 이미 main 머지 커밋 `f590648f` 가 있다).
2. `git mv db/migrations/0117_community_chat.sql db/migrations/0126_community_chat.sql`
   - **0125 가 아니라 0126.** main 이 `0125_drop_users_orphan_backup_0107.sql` 을 이미 갖고 있다.
   - 채번 직전에 `git ls-tree --name-only origin/main db/migrations/ | tail -3` 로 **다시 확인**할 것. main 이 계속 움직인다.
3. 파일 1행 헤더 주석 `-- 0117_community_chat.sql` → `-- 0126_community_chat.sql`.
   파일명 참조는 이 한 줄뿐이다 (`git grep 0117_community` 로 재확인).
4. `npm run verify` → PR 갱신 → CI 그린 → 머지.
5. 머지 후 운영 적용. **적용 전 dry-run 확인.**

### 주의

- 이 브랜치는 **다른 세션의 워크트리(`orca/workspaces/2ndB/260810_UIUX`)가 점유 중**일 수 있다. 그 세션이 살아 있으면 먼저 조율하고, 그쪽이 직접 재채번하게 하는 편이 낫다.
- 운영에 `community%` 테이블 **0개** 이므로 재채번은 안전하다 (구 번호로 적용된 이력 없음). 적용 전에 이 사실을 다시 확인할 것.
- `0126_community_chat.sql` 안에 `SECURITY DEFINER` 함수가 있으면 **같은 파일에 `REVOKE ... FROM anon`** 이 있는지 확인.
- 커뮤니티 채팅은 **사용자에게 보이는 기능 출시**다. 머지 = 배포이므로 Simon 승인 없이 켜지 않는다.

### 완료 판정

`git ls-tree --name-only origin/main db/migrations/ | grep community` 가 `0126_...` 을 반환하고, 중복 번호가 없다:
```bash
git ls-tree --name-only origin/main db/migrations/ | sed 's|.*/||' | cut -c1-4 | sort | uniq -d
```
(0117 은 이미 알려진 중복이라 여기 남는다. **새로운 중복이 늘지 않는 것**이 판정 기준이다.)

---

## 3. 작업 B — Paddle 샌드박스 페이로드 대조 (콘솔, 브라우저 필요)

### 왜

`paddle-webhook` 은 환불 adjustment 의 `status` 를 아래 4개로 가정한다:
`pending_approval` · `approved` · `rejected` · `reversed`

**이 집합은 검증된 사실이 아니라 가정이다.** 이 레포에 adjustment 웹훅 수신 선례가 0건이고, 모델 지식으로 작성됐다.
`data.id` / `data.transaction_id` / `data.items[].type` / `data.totals.total` 의 실제 형태도 마찬가지다.

`0123` 덕분에 **가정이 틀려도 이벤트는 유실되지 않는다** (모르는 status 는 200 + 원문 저장 + ALERT). 그래서 급하지는 않다.
다만 대조를 해두면 가정을 사실로 바꿀 수 있다.

### 무엇을

1. `sandbox-vendors.paddle.com` 로그인.
2. 샌드박스 테스트 결제 1건 생성.
3. 그 트랜잭션에 **전액 환불(full refund) adjustment** 발행.
4. Paddle > Notifications > Logs 에서 `adjustment.created` 와 `adjustment.updated` **원본 JSON 을 그대로 복사**.
5. 아래와 대조해서 표로 보고:

| 코드가 읽는 경로 | 실제 값 | 일치? |
|---|---|---|
| `data.id` | | |
| `data.action` (`refund` 기대) | | |
| `data.status` | | |
| `data.transaction_id` | | |
| `data.subscription_id` | | |
| `data.totals.total` | | |
| `data.items[].type` (`full` 기대) | | |

6. 불일치가 있으면 **코드를 고치지 말고 먼저 보고**한다. 환불 경로라 추측 수정이 가장 위험하다.

### 하지 말 것

- **라이브(운영) 환불 테스트 금지.** 샌드박스에서만.
- `--no-verify-jwt` 로 재배포 금지.

---

## 4. 작업 C — DRYRUN 해제 (조건부, 지금은 보류가 정답)

### 현재 방침

**실결제 1건이 발생하기 전에는 해제하지 않는다.** 지금 풀어도 지목할 트랜잭션이 0건이라 확인할 것이 없고,
`provider_refunded_at` 까지 보려면 실제 결제가 필요하다.

### 선행 조건

`paddle_webhook_events` 에 `event_type='transaction.completed'` 이면서 `paddle_transaction_id IS NOT NULL` 인 행이 **1건 이상** 생길 것. (현재 0)

```sql
select count(*) from public.paddle_webhook_events
 where event_type='transaction.completed' and paddle_transaction_id is not null;
```

### 플래그 현재값 확인법 (시크릿은 직접 못 읽는다)

QA 계정(`.env.test` 의 `QA_TEST_EMAIL`/`QA_TEST_PASSWORD`) 으로 로그인해 앱의 **[설정 → 구독 관리]** 진입 후 동작으로 판별한다:

| 응답 | 의미 |
|---|---|
| `misconfigured` | `PADDLE_SELF_SERVICE_ENABLED` 미설정 또는 `PADDLE_API_KEY` 없음 |
| `rejected` + `not_subscribed` / `not_eligible:no_payment` | 기능 ON, 정상 (QA 계정은 결제가 없으므로 **이게 정상 결과**) |
| `dry_run` | 기능 ON + DRYRUN 모드 |

QA 계정에서 `dry_run` 을 기대하면 안 된다. 지목 가능한 결제가 없어서 그 앞 단계에서 거절되는 것이 정상이다.

### 시크릿 반영 방식 (중요)

시크릿 변경은 **재배포 없이** 적용되지만, 실행 중인 인스턴스는 콜드 스타트 전까지 옛 환경을 본다.
`misconfigured` 가 뜨면 **1분 기다렸다 재시도**한다. **재배포하지 말 것** (버전만 올라가고 원인은 그대로다).

### 해제 절차

1. 위 선행 조건 충족 확인.
2. `PADDLE_SELF_SERVICE_DRYRUN` 삭제 (또는 `0`).
3. 1분 대기 후 실환불 1건으로 전 구간 확인: `billing_self_service_log` 에 `accepted` 행 → Paddle adjustment 생성 → 웹훅 `adjustment.updated` 수신 → `approved` 시 매출 상계 행 + 등급 회수.
4. 결과 보고.

---

## 5. 작업 D — 이 문서로 발주서 교체 (문서)

- `docs/cowork-paddle-console-260810.md` 상단에 **대체됨(superseded)** 배너 추가, 링크로 이 문서 지시.
- 그 문서의 낡은 값: `paddle-webhook v15` / `subscription-manage v7` (실제 v22 / v12), 환불 정책 `pre_revision 30일` (실제 7일 즉시 적용), 시행일 `2026-09-08` (폐기됨).
- **버전 숫자로 배포 여부를 판단하지 말 것.** 아래 "함정" 4번 참조.

---

## 6. 작업 E — PR #1178 (선택, 낮은 우선순위)

`chore(legacy): quarantine stale design docs` · **CONFLICTING**, 56개 파일, 2026-08-03 이후 방치.
머지 동작이 아니라 리베이스 작업이다. 충돌 해소 후 `npm run verify` → 머지.
가치가 낮다고 판단되면 **닫는 것도 정당한 결론**이다. Simon 확인 후 결정.

`#1150` 은 DRAFT 이므로 건드리지 않는다.

---

## 7. 작업 F — 환불 결정 재검토 트리거 감시 (상시)

2026-08-11 Simon 이 환불 규칙 **현행 유지**를 결정했다. 그 결정의 근거·한계·재검토 조건은 전부 아래 3곳에 기록돼 있다:

1. `COMMENT ON public.refund_eligibility(uuid)` — DB 안
   ```sql
   select obj_description('public.refund_eligibility(uuid)'::regprocedure, 'pg_proc');
   ```
2. `db/migrations/0124_refund_eligibility_decision_record.sql` 헤더
3. `supabase/functions/subscription-manage/index.ts` 헤더

**트리거**: `transaction.completed` + `paddle_transaction_id IS NOT NULL` 첫 행이 생기는 순간 (현재 0).
그 시점부터 유예 없는 개정 규칙이 실제 사용자에게 적용되기 시작하므로 판단을 다시 꺼내야 한다.

**중요**: 이 결정의 자체 평가(고지 절차 관련)는 **내부 기록에만** 둔다. 공개 환불정책에는 중립적인 개정 이력만 싣는다.
테스트가 양쪽을 고정하고 있으니 공개 문서로 옮기지 말 것.

---

## 8. 이미 닫힌 항목 — 다시 손대지 마라

멱등키(안정 키) · 레이트 리밋(20/시간, fail-closed) · dry-run 인덱스 오염 · `past_due` 처리 ·
매출 상계 행 · 시행일 게이트 폐기 · adjustment 핸들러 통합(0119) · 미지 status 기록(0123) ·
`config.toml` 함수 선언 3건 · `peer-respond` 의 `verify_jwt`.

---

## 9. 이 레포의 함정 (실측으로 확인된 것만)

1. **`apply_migration` 은 함수 본문의 `--` 주석을 제거한다.** 빌링 함수 7/7 실측. DB 에 남겨야 할 설명은 문자열 리터럴인 `COMMENT ON` 으로 쓴다. `COMMENT ON` 문자열 **안에 `--` 를 넣으면 잘릴 수 있다.**
2. **마이그레이션은 파일명 순서로 적용된다.** 번호 중복 = 조용한 last-writer-wins. 작업 A 가 이 문제다.
3. **작업 전 `git fetch origin main` 후 번호 재확인.** main 이 빠르게 움직인다. 이 작업 중에도 0114→0115, 0125 가 밀렸다.
4. **`ezbr_sha256` 은 소스 파일 해시가 아니라 배포 번들 해시다.** 로컬 파일 sha256 과 비교하면 항상 다르게 나온다. 배포 내용 확인은 **배포 소스를 직접 받아 마커 문자열을 grep** 한다. 예: `paddle-webhook` 은 `unhandled_adjustment_status` 가 있으면 0123 이후 버전이다.
5. **버전 숫자로 배포 여부를 판단하지 말 것.** 다른 세션의 재배포로도 올라간다.
6. **`request.jwt.claim.role` GUC 는 이제 설정되지 않는다.** service_role 판별은 `request.jwt.claims` JSON 도 읽어야 한다. 헬퍼 `public.billing_request_role()` 을 쓸 것. 이걸 놓쳐서 첫 실결제 500 사고가 났다.
7. **CI 가드가 소스의 리터럴 문자열을 박제한다.** i18n 키를 변수로 빼면 `check:constraints` 가 깨진다. 문구 수정 시 가드 노후를 먼저 의심할 것.
8. **엣지 함수 배포는 깨끗한 워크트리 + CLI 로.** MCP 배포는 전사 위험. `supabase login` 게이트는 이미 풀려 있다.
9. **다른 세션이 브랜치를 워크트리로 점유 중일 수 있다.** `git checkout` 이 "already used by worktree" 로 실패한다. **명령을 `|` 로 묶으면 종료코드가 가려져 뒤의 파괴적 명령이 실행된다.** 파이프와 `&&` 를 섞지 말 것.

---

## 10. 권장 순서

1. **A** (#1211 재채번) — 유일하게 실제 사고로 이어지는 항목
2. **D** (발주서 교체) — 5분, 다음 사람이 낡은 값을 믿는 것을 막는다
3. **B** (샌드박스 대조) — 브라우저 필요, 가정을 사실로
4. **E** (#1178) — 선택
5. **C** (DRYRUN) 와 **F** (트리거) — 실결제 발생 전까지 대기
