# [cowork 발주] Paddle 콘솔 작업 — 셀프 환불 레일 활성화 전 필수 3건

작성: Claude, 2026-08-10 · 대상: **Paddle 대시보드 (브라우저 필요)** · 코드 변경 없음

Claude 는 Paddle 콘솔에 접근할 수 없어 여기까지가 한계입니다. **아래 3건은 전부 브라우저 작업**이고,
1번은 **안 하면 환불 정산 코드가 통째로 죽은 코드**가 됩니다.

---

## 배경 (30초)

2nd-B 는 셀프 구독 해지 + 조건부 셀프 환불을 구현했고, DB(0115~0119)와 엣지 함수는
**2026-08-10 운영 적용·배포 완료**입니다. 기능 자체는 `PADDLE_SELF_SERVICE_ENABLED` 시크릿이
없어서 fail-closed 상태이고, **2026-09-08** 개정 환불정책 시행일에 켭니다.

환불은 Paddle **adjustment** 로 나갑니다. Paddle 이 심사·승인하면 우리가 그 결과를 받아
(a) 상계 매출행을 쓰고 (b) 전액 환불이면 유료 등급을 회수합니다.
**그 "결과를 받는" 부분이 Paddle 알림 구독에 달려 있습니다.**

- 프로젝트 ref: `zoacryukmdeivmolvyhj`
- 웹훅 URL: `https://zoacryukmdeivmolvyhj.supabase.co/functions/v1/paddle-webhook`
- 현재 배포: paddle-webhook **v15**, subscription-manage **v6**

---

## 1. [필수·최우선] Notifications 에 adjustment 이벤트 2종 추가

**Paddle Dashboard → Developer tools → Notifications → (기존 destination 선택) → Events**

지금 구독돼 있어야 하는 것 (기존):
- `subscription.created`
- `subscription.updated`
- `subscription.canceled`
- `transaction.completed`

**추가할 것:**
- [ ] `adjustment.created`
- [ ] `adjustment.updated`

> **왜 필수인가**: 이 둘이 안 오면 Paddle 이 환불을 승인해도 앱이 모릅니다. 결과는
> **돈은 환불되고 유료 접근은 결제 기간 끝까지 유지** (연간이면 최대 12개월), 그리고 자동갱신도
> 계속 청구됩니다. 매출 집계(C4)도 환불액만큼 영구 과대 계상됩니다.
> 코드는 이미 두 이벤트를 처리하도록 배포돼 있습니다 — **구독만 안 돼 있으면 영원히 안 불립니다.**

확인 방법: 저장 후 destination 상세에서 구독 이벤트 목록에 6종이 보이면 됩니다.

---

## 2. [필수] `PADDLE_API_KEY` 권한 스코프 확인

**Paddle Dashboard → Developer tools → Authentication → API keys → (사용 중인 키)**

우리 엣지 함수가 호출하는 엔드포인트:
- `POST /subscriptions/{id}/cancel` → **subscription: write** 필요
- `POST /adjustments` → **adjustment: write** 필요

- [ ] 두 스코프가 모두 켜져 있는지 확인
- [ ] 없으면 추가하거나, 스코프 포함해 **새 키 발급**

> 키를 새로 발급했다면 값은 **Simon 이 직접** Supabase 함수 시크릿(`PADDLE_API_KEY`)에 넣어야
> 합니다. Claude 는 값에 접근하지 않습니다.
> 스코프가 없으면 9/8에 켜는 순간 전부 403 → 사용자에게는 "지원팀 문의" 로 fail-closed 됩니다
> (돈은 안 나가지만 기능은 죽습니다).

---

## 3. [권장] 샌드박스에서 adjustment 페이로드 실물 1회 확인

**이게 필요한 이유를 솔직히 적습니다**: 레포에 Paddle adjustment 웹훅 선례가 0건이라,
페이로드 필드 모양을 **모델 지식으로 작성**했습니다. 코드는 전부 옵셔널 체이닝이고 해석 실패 시
**돈만 기록하고 등급은 안 건드리는** 보수적 폴백이지만, 실물 1회 대조를 권합니다.

**Paddle Sandbox 에서:**
1. 샌드박스 결제 1건 생성 (테스트 카드)
2. 그 트랜잭션에 **전액 환불(full refund) adjustment** 생성
3. Notifications → **Logs / Events** 에서 `adjustment.created` 와 `adjustment.updated` 의
   **원본 JSON 을 그대로 복사**

**확인해서 알려줄 필드 (우리 코드가 읽는 것):**

| 코드가 읽는 경로 | 기대값 | 실제값 |
|---|---|---|
| `data.id` | `adj_...` | ? |
| `data.action` | `refund` | ? |
| `data.status` | `pending_approval` → `approved` | ? |
| `data.transaction_id` | `txn_...` | ? |
| `data.subscription_id` | `sub_...` (있는지) | ? |
| `data.totals.total` | 환불 금액(minor unit 문자열?) | ? |
| `data.items[].type` | `full` (전액인지 판별) | ? |
| 이벤트 `occurred_at` | ISO8601 | ? |

특히 **`data.items[].type` 에 `full` 이 실제로 오는지**가 중요합니다. 이게 등급 회수 여부를
가르는 두 신호 중 하나입니다(다른 하나는 우리 원장의 accepted 셀프 요청 매칭이라, 셀프 환불
경로는 이 필드가 없어도 안전합니다. **지원팀이 대시보드에서 직접 환불한 경우에만** 이 필드에
의존합니다).

원본 JSON 을 그대로 붙여주시면 Claude 가 코드와 대조해서 필요하면 수정합니다.

---

## 하지 말 것

- ❌ **`PADDLE_SELF_SERVICE_ENABLED` 를 지금 켜지 마세요.** 2026-09-08 개정 정책 시행일 전까지
  fail-closed 유지가 의도입니다(이용약관 제3조② 불리한 변경 30일 사전공지).
- ❌ 엣지 함수를 `--no-verify-jwt` 로 재배포하지 마세요.
- ❌ 라이브 환경에서 실제 환불로 테스트하지 마세요. 샌드박스만.

---

## 참고: Claude 가 이미 끝낸 것 (중복 작업 방지)

- 마이그레이션 `0117`(2건)·`0118`·`0119` **운영 적용 완료**, 적용 후 실측 검증 완료
- `paddle-webhook` **v15** / `subscription-manage` **v6** 배포 완료 (verify_jwt 각각 false/true 확인)
- pg_cron `sweep-stale-billing-claims` 10분 주기 등록 확인
- DRYRUN 리허설 재실행: 시행일 게이트(`policy_not_in_effect`)·무구독 해지 거부(`not_subscribed`) 동작 확인
- 시크릿 상태: `PADDLE_API_KEY` 있음 · `PADDLE_SELF_SERVICE_DRYRUN=1` 있음 · `PADDLE_SELF_SERVICE_ENABLED` **없음(의도)**

### 알아둘 것 하나

운영 `paddle_webhook_events` 에 남은 4행(2026-08-08 실결제)은 **0115 이전 웹훅이 받은 거라
`paddle_transaction_id`·`occurred_at` 이 전부 NULL** 입니다. 그래서 그 결제자는 셀프 환불 판정에서
`no_payment` → 지원팀 경로로 빠집니다. **버그가 아니라 의도된 동작**입니다(환불 대상 트랜잭션을
지목할 수 없으면 추측하지 않고 사람에게 넘김). v15 부터 들어오는 이벤트는 정상 캡처됩니다.

### 9/8 당일 체크리스트 (별건, 참고용)

1. 개정 환불정책 인앱 공지가 이미 발행돼 있는지 확인(재발행일 08-09 기준 30일 충족)
2. `PADDLE_SELF_SERVICE_ENABLED=1` 설정
3. **같은 작업에서 `PADDLE_SELF_SERVICE_DRYRUN` 해제** ← 이걸 빠뜨리면 사용자에게 "접수됨" 이
   뜨는데 Paddle 로는 아무것도 안 갑니다(단, 0118 이후로는 진짜 요청을 영구 차단하지는 않습니다)
