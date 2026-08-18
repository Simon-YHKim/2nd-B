# [cowork 발주] Paddle 콘솔 작업 — 셀프 해지·환불을 "진짜로 기능하게" 만드는 마지막 3건

> **SUPERSEDED (2026-08-13) — 이 문서를 지시서로 쓰지 마라.**
> 후속 정본: **[`docs/cowork-handoff-260813.md`](./cowork-handoff-260813.md)**
>
> 이 문서의 1·2번은 완료됐고, 아래 수치는 전부 낡았다:
> `paddle-webhook v15` / `subscription-manage v7` (실제 **v22 / v12**) ·
> 환불 정책 `pre_revision` 30일 (실제 **7일 + 무료 플랜 범위 조건, 전 결제 즉시 적용**) ·
> 시행일 `2026-09-08` (**폐기됨**, 0122).
> 남은 3번(샌드박스 페이로드 대조)은 후속 문서의 작업 B 로 이어진다.
> 이력 참고용으로만 보존한다.
>
> **체크박스 정리 (2026-08-19, 콘솔 세션 대시보드 실측).** 배너는 "1·2번 완료"라고
> 적어뒀는데 정작 아래 체크박스는 `[ ]` 로 남아 있어서, 콘솔이 같은 조사를 한 번 더
> 했다. 이제 실측값으로 채웠다. 요약:
>
> | 항목 | 실측 (2026-08-19) |
> |---|---|
> | 활성 destination 의 구독 이벤트 | **6종** (아래 1번에 나열) |
> | `adjustment.created` · `adjustment.updated` | **구독됨** |
> | `PADDLE_API_KEY` 스코프 | **Adjustments R/W · Subscriptions R/W** |
> | `PADDLE_API_KEY` 만료 | **2026-11-08** (오늘 기준 약 81일) |
> | `PADDLE_API_KEY` `Last used` | **`-`** (한 번도 호출된 적 없음) |
> | 비활성 destination 1개 | "2nd-B 구독 웹훅 (Supab...", Inactive, 4 events |
>
> `Last used` 가 `-` 인 것은 **고장 신호가 아니다.** `subscription-manage` 는
> `PADDLE_SELF_SERVICE_ENABLED != '1'` 이면 Paddle 로 나가기 전에 fail-closed 되고
> (`index.ts:285`), `PADDLE_SELF_SERVICE_DRYRUN=1` 이면 `index.ts:342` 에서
> `callPaddle` 앞으로 되돌아간다. 거기에 유료 사용자 0명 ·
> `billing_self_service_log` 0행이 겹쳤다. 즉 **설계대로 안 나간 것**이지 경로가
> 깨진 것이 아니다. 다만 실호출 검증이 0회인 것은 사실이므로, 아래 3번(샌드박스
> 대조)이 그 검증을 대신한다.
>
> **그래서 생기는 진짜 위험은 순서다.** 키는 11/08 에 만료되는데 기능은 아직 OFF 다.
> 이대로면 **첫 실사용 전에 키가 먼저 죽는다.** 자세한 것은
> `docs/cowork-reply-260819.md`.

작성: Claude, 2026-08-10 (개정 2판) · 대상: **Paddle 대시보드 (브라우저 필요)** · 코드 변경 없음

Claude 는 Paddle 콘솔에 접근할 수 없습니다. **DB·엣지 함수·앱은 전부 끝냈고, 남은 건 이 3건뿐입니다.**
1번을 안 하면 환불 정산 코드가 통째로 죽은 코드가 됩니다.

---

## 지금 상태 (실측, 2026-08-10)

| 항목 | 상태 |
|---|---|
| 마이그레이션 `0115`~`0120` | **운영 적용 완료** |
| `paddle-webhook` | **v15** 배포 (verify_jwt=false) |
| `subscription-manage` | **v7** 배포 (verify_jwt=true) |
| `PADDLE_API_KEY` | 있음 |
| `PADDLE_SELF_SERVICE_DRYRUN` | `1` (리허설 모드) |
| `PADDLE_SELF_SERVICE_ENABLED` | **없음 → 기능 OFF** |
| 현재 적용 환불 정책 | `pre_revision` · **30일 · 사유 불문** (9/8부터 자동으로 7일·조건부) |

- 프로젝트 ref: `zoacryukmdeivmolvyhj`
- 웹훅 URL: `https://zoacryukmdeivmolvyhj.supabase.co/functions/v1/paddle-webhook`

> **환불 정책은 이제 "시행일 게이트"가 아니라 "시행일 적용"입니다.** 서버가 요청 시점에 효력 있는
> 규칙으로 판정합니다. 9/8 이전엔 30일 무조건, 이후엔 7일+사용량 조건. **전환에 배포도 플래그도
> 필요 없습니다** (타임스탬프 비교). 그래서 **기능은 지금 켜도 됩니다.**

---

## 1. [필수·최우선] Notifications 에 adjustment 이벤트 2종 추가

**Paddle Dashboard → Developer tools → Notifications → (기존 destination) → Events**

이미 있어야 하는 것: `subscription.created` · `subscription.updated` · `subscription.canceled` · `transaction.completed`

**추가할 것:**
- [x] `adjustment.created` — **완료** (2026-08-19 확인)
- [x] `adjustment.updated` — **완료** (2026-08-19 확인)

활성 destination 의 이벤트는 지금 정확히 이 6종이다:
`transaction.completed` · `subscription.created` · `subscription.updated` ·
`subscription.canceled` · `adjustment.created` · `adjustment.updated`.

> **왜 필수인가**: 환불은 Paddle **adjustment** 로 나가고, Paddle 이 심사·승인한 결과를 이 두 이벤트로
> 알려줍니다. 구독이 안 돼 있으면 **돈은 환불되는데 앱은 모릅니다** → 유료 등급이 결제 기간 끝까지
> 유지되고(연간이면 최대 12개월) 자동갱신도 계속 청구됩니다. 매출 집계(C4)도 환불액만큼 영구 과대
> 계상됩니다.
> **코드는 이미 두 이벤트를 처리하도록 배포돼 있습니다** — 구독만 안 돼 있으면 영원히 안 불립니다.

확인: 저장 후 destination 상세에 이벤트 6종이 보이면 완료.

---

## 2. [필수] `PADDLE_API_KEY` 권한 스코프 확인

**Paddle Dashboard → Developer tools → Authentication → API keys → (사용 중인 키)**

우리가 호출하는 엔드포인트와 필요한 스코프:

| 호출 | 필요 권한 |
|---|---|
| `POST /subscriptions/{id}/cancel` | **subscription: write** |
| `POST /adjustments` | **adjustment: write** |

- [x] 두 스코프 모두 켜져 있는지 확인 — **완료** (2026-08-19: Adjustments R/W · Subscriptions R/W)
- [x] 없으면 추가하거나 스코프 포함해 **새 키 발급** — 불필요했다 (기존 키에 스코프가 이미 있었다)

> **새로 알게 된 것 (2026-08-19): 이 키는 `2026-11-08` 에 만료된다.** 그리고
> `Last used` 가 `-` 다. `Credential expiry check` 워크플로는 이 키를 보지 않는다.
> 즉 지금 상태로 두면 **한 번도 안 쓰인 채로 만료되고, 만료 사실도 아무도 모른다.**
> 감시를 어디에 붙일지는 `docs/cowork-reply-260819.md` 에 있다.

> 새 키를 발급했다면 값은 **Simon 이 직접** Supabase 함수 시크릿(`PADDLE_API_KEY`)에 넣어야 합니다.
> Claude 는 키 값에 접근하지 않습니다.
> 스코프가 없으면 켜는 순간 전부 403 → 사용자에게는 "지원팀 문의" 로 fail-closed 됩니다(돈은 안 나감).

---

## 3. [권장] 샌드박스에서 adjustment 페이로드 실물 1회 확인

**솔직히 적습니다**: 레포에 Paddle adjustment 웹훅 선례가 0건이라 **페이로드 필드 모양을 모델 지식으로
작성**했습니다. 코드는 전부 옵셔널 체이닝이고, 해석 실패 시 **돈만 기록하고 등급은 안 건드리는**
보수적 폴백입니다. 그래도 실물 1회 대조를 권합니다.

**Paddle Sandbox 에서:**
1. 샌드박스 결제 1건 생성 (테스트 카드)
2. 그 트랜잭션에 **전액 환불(full refund) adjustment** 생성
3. Notifications → **Logs / Events** 에서 `adjustment.created` 와 `adjustment.updated` 의 **원본 JSON 그대로 복사**

**확인해서 알려줄 필드:**

| 코드가 읽는 경로 | 기대값 | 실제값 |
|---|---|---|
| `data.id` | `adj_...` | ? |
| `data.action` | `refund` | ? |
| `data.status` | `pending_approval` → `approved` | ? |
| `data.transaction_id` | `txn_...` | ? |
| `data.subscription_id` | `sub_...` (있는지) | ? |
| `data.totals.total` | 환불 금액 (minor unit 문자열?) | ? |
| `data.items[].type` | `full` | ? |
| 이벤트 `occurred_at` | ISO8601 | ? |

특히 **`data.items[].type` 에 `full` 이 실제로 오는지**가 중요합니다. 등급 회수 여부를 가르는 두 신호 중
하나입니다. (다른 하나는 우리 원장의 accepted 셀프 요청 매칭이라, **셀프 환불 경로는 이 필드가 없어도
안전**합니다. **지원팀이 대시보드에서 직접 환불한 경우에만** 이 필드에 의존합니다.)

원본 JSON 을 그대로 붙여주시면 Claude 가 코드와 대조해 필요하면 수정합니다.

---

## 하지 말 것

- ❌ 엣지 함수를 **`--no-verify-jwt`** 로 재배포하지 마세요.
- ❌ **라이브 환경에서 실제 환불로 테스트하지 마세요.** 샌드박스만.
- ❌ `PADDLE_SELF_SERVICE_DRYRUN` 을 **1번이 끝나기 전에 지우지 마세요.** DRYRUN 이 걸려 있으면
  Paddle 로 아무것도 안 나가서 안전합니다.

---

## 1·2번이 끝난 뒤 (Simon)

이 순서로 켜면 됩니다. **9/8을 기다릴 필요 없습니다** — 지금 켜면 현행 30일 무조건 정책으로 동작하고,
9/8에 서버가 알아서 7일·조건부로 넘어갑니다.

1. `PADDLE_SELF_SERVICE_ENABLED=1` 설정 (DRYRUN 은 아직 유지)
2. QA 계정으로 화면 1회 확인 — 지금은 `dry_run` 결과가 뜨고 원장에 기록만 남습니다
3. 문제 없으면 **`PADDLE_SELF_SERVICE_DRYRUN` 해제** → 이때부터 실제로 Paddle 로 나갑니다
4. 첫 실환불 1건을 눈으로 확인 (원장 `billing_self_service_log` 에 `provider_refunded_at` 이 채워지는지)

> DRYRUN 을 안 지우면 사용자에게 "리허설 모드라 전송되지 않았어요" 가 뜹니다(거짓 성공 아님).
> 0118 이후로는 dry-run 이 진짜 요청을 영구 차단하지도 않습니다.

---

## 참고: Claude 가 이미 끝낸 것 (중복 작업 방지)

- 마이그레이션 `0117`(2건)·`0118`·`0119`·`0120` **운영 적용 + 적용 후 실측 검증**
- `paddle-webhook` v15 / `subscription-manage` v7 배포, `verify_jwt` 확인
- pg_cron `sweep-stale-billing-claims` 10분 주기 등록 확인
- 리허설: 무구독 해지 거부(`not_subscribed`) 동작 확인, 시크릿 원복 확인
- 현재 적용 정책 실측: `policy=pre_revision`, `refund_window_days=30`, `usage_gate_applies=false`

### 알아둘 것

운영 `paddle_webhook_events` 의 4행(2026-08-08 실결제)은 **0115 이전 웹훅이 받아서
`paddle_transaction_id`·`occurred_at` 이 전부 NULL** 입니다. 그 결제자는 셀프 환불 판정에서
`no_payment` → 지원팀 경로로 빠집니다. **버그가 아니라 의도된 동작**입니다(환불 대상 트랜잭션을
지목할 수 없으면 추측하지 않고 사람에게 넘김). **v15 부터 들어오는 이벤트는 정상 캡처**됩니다.
