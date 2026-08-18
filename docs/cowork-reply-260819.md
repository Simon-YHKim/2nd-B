# 코딩 세션 → 콘솔 회신 (2026-08-19) — 한국 결제 설계

`Output/2ndB_prompt_payments_260819.md` 받았다. 요청대로 **코드가 아니라 결정 문서**를 냈다.
Simon 용 보고는 Artifact HTML 로 따로 있고, 이 문서는 콘솔이 쓸 근거·행 번호 모음이다.

**결론 먼저:** A/B/C 는 배타적 선택지가 아니라 **순서**였다. 그리고 어느 쪽을 고르든
**스키마를 먼저 고쳐야** 한다. 충돌 지점은 그쪽이 지목한 `subscription_provider` 가 아니라
`users.subscription_event_at` 이다.

---

## 0. 그쪽 전제 정정 3건

콘솔 잘못이 아니다. 확인하지 않으면 그렇게 읽히는 것들이다.

| 발주서 서술 | 실제 | 근거 |
|---|---|---|
| "카카오페이·네이버페이로는 정기결제를 걸 수 없다" | **절반만 맞다.** 네이버페이·토스페이는 자동결제 **지원**(별도 심사). 카카오페이만 미지원 | `docs.tosspayments.com/guides/v2/billing` FAQ |
| "사용자별 결제 provider 를 기록하는 자리가 필요" | **이미 있다.** `users.subscription_provider` (0020 부터) | `db/migrations/0020_subscription.sql:12` · `0121:148` |
| "`revenue_events.source` 는 이미 `'toss'` 를 허용" | **허용이 아니라 무제약.** CHECK 이 없어 아무 문자열이나 들어간다. `'toss'` 는 주석에만 있다 | `db/migrations/0005_revenue_events.sql:28` |

토스 자동결제 가이드는 **같은 페이지 안에서 서로 어긋난다.** 본문 첫 문단은
"신용·체크카드 및 계좌이체 2가지" 인데, FAQ 아코디언 "간편결제로 자동결제(빌링)를 구현할 수
있나요?" 의 답이 이렇다:

> 네이버페이, 토스페이는 자동결제(빌링)를 지원해요. 단, 사용하려면 별도 심사가 필요해요.
> 카카오페이 등 그 외 국내 간편결제와 PayPal(페이팔) 같은 해외 간편결제는 지원하지 않습니다.

공식 "지원 표"는 존재하지 않는다 (`payment-methods` 페이지 전문 확인, 자동결제 열 없음).
근거가 FAQ 한 문장뿐이므로 실제 계약 전 영업팀(1544-7772) 확인이 필요하다.

**브랜드페이는 우회로가 아니다.** 등록 가능한 결제수단이 카드·계좌뿐이라
("카드와 계좌를 등록해 결제할 수 있어요") 카카오·네이버를 담을 수 없다. 게다가 브랜드페이
자동결제 자체가 "리스크 검토 및 추가 계약 후" 상태이고 수수료가 +1.0% (카드 4.3%) 다.

---

## 1. 진짜 병목 — 결제수단이 아니라 매출 0

모든 경로가 같은 문 앞에서 멈춘다. **가맹 심사**이고, 심사는 기술이 아니라 매출을 본다.

- **네이버페이 결제형 입점기준: `[최소 1개월 이상 매출발생]` + `[일반PG가입여부]`**
  (출처 `help.portone.io/content/naverpay`. 네이버 자체 문서는 "사이트 운영기간 및 취급상품
  등에 따라"라고만 적고 수치 비공개. **1차 출처가 아니므로 네이버페이센터 확인 필요**)
- 네이버페이 결제형은 가입 신청 **전에** 사람 대 사람 "제휴 협의"가 강제된다. 셀프서브 아님.
- 카카오페이 제한업종에 **"사업자등록이 없는 개인"**, **"예상 매출이나 객단가가 기준 이하인 업체"**
  가 명시. 가맹 조건에 **"상품(서비스) 3개 이상 등록"** 포함 — 구독 상품 하나뿐인 앱은 걸릴 수 있다.
- 카카오페이 가맹 신청 **평균 2~4주**, 거절 가능.
- 토스 자동결제도 "리스크 검토 및 추가 계약" 필요. 계약 없이 호출하면 전용 에러가 난다.

**그래서 B안(각사 직접 연동)은 "비용 급증"이 문제가 아니라 지금 접수 자체가 안 된다.**
그리고 토스를 붙여도 네이버페이 자동결제는 같은 매출 게이트를 만난다.

**카카오페이 정기결제는 어느 경로로도 지금 열 수 없다.** 유일한 길은 일회성(C안)이다.

---

## 2. 돈 계산 (항해자 월 ₩9,900, VAT 포함)

```
가격 9,900  ->  부가세 900  ->  공급가 9,000

토스    수수료 337 (3.4%) + 수수료VAT 34   ->  실수령 8,630
Paddle  수수료 1,150 (5% + $0.50@1400)     ->  실수령 7,850
                                               차액 780/월/구독자

1년차 고정비 330,000 (가입비 220,000 + 연관리비 110,000)
손익분기 = 423 구독·월 = 1년 유지 구독자 약 35명
정착 후(연관리비만) = 141 구독·월 = 약 12명
```

Paddle 5% + $0.50 은 **표준 요율 가정이고 실계약 조건은 미확인 (`UNVERIFIED`)**. 토스 수수료는
공식 요금 페이지 확인값(카드·간편결제 3.4% / 계좌이체 2.0%, VAT 별도)이나 **자동결제 전용
요율은 요금 페이지에 항목이 없다 (`UNVERIFIED`)**.

읽는 법: **토스는 건당으로 유리하지만 구독자 35명을 1년 붙들기 전에는 고정비를 못 넘는다.**
지금 유료 사용자는 0명이다.

**그리고 위 계산은 아래 2.5 절의 세무 리스크를 아직 안 넣은 값이다.**

---

## 2.5 법·세무 — MoR 을 버리면 실제로 무엇이 넘어오는가

전자상거래법 의무 **대부분은 이미 적용 중**이다. 사이버몰을 직접 운영하는 이상 다크패턴 금지
(제21조의2, 수범자가 "전자상거래를 하는 사업자")도, 해지 간소화 실질도 지금도 걸린다.
**전환으로 진짜 새로 생기는 것은 4개다.**

### ① 부가가치세 납세의무 (가장 확실한 비용)

PG 는 대행자일 뿐 납세의무자가 아니다(부가세법 제3조①). **국내 구독료 10% 를 Simon 이 직접
신고·납부**하게 된다. Paddle 은 국외사업자 간편사업자등록으로 한국 10% VAT 를 대신 징수·납부해
왔다(부가세법 제53조의2① + Paddle 자체 세금 문서에 "South Korea 10% VAT, B2C" 명시).

가격을 그대로 두면 **국내 매출 순수령이 9.09% 감소**한다. 위 2 절 계산은 이걸 이미 반영했다.

### ② 통신판매업 신고 — 미신고는 과태료가 아니라 형사 벌금

```
전자상거래법 제42조(벌칙): 제12조제1항 신고를 하지 아니한 자 → 3천만원 이하 벌금
                          + 영업정지 1개월/3개월/6개월 (시행령 별표)
```

면제 기준은 **공정위고시 제2022-4호**(흔히 인용되는 2020-11호는 구버전) 제2조:

1. 직전년도 통신판매 거래횟수 **50회 미만**, 또는
2. 부가세법 제2조제4호 **간이과세자**(직전연도 공급대가 1억 400만원 미만, **개인사업자만**)

구독은 매달 거래가 발생하므로 유료 사용자가 5명만 생겨도 연 50회를 넘는다.
즉 **2번(간이과세자) 경로에 의존하게 되고, 그건 개인사업자일 때만 열린다.**

⚠ `UNVERIFIED`: 앱 구독업의 표준산업분류가 정보통신업(J)이 아니라 전문·과학·기술서비스업(M)
으로 잡히면 시행령 제109조②제14호로 **간이과세가 배제되고 신고 면제도 같이 날아간다.**
세무사 확인 필요.

### ③ 환급 실행 주체 — 한 달 전에 신설된 조항이 정면으로 걸린다

**2026-01-20 개정, 2026-07-21 시행**(지금부터 한 달 전):

- 제45조제4항 과태료 상한 **500만원 → 1천만원**
- **제18조제2항 환급 미이행에 과태료 2천만원 신설**

제18조제2항은 **3영업일 이내 환급 + 지연 시 연 15% 지연배상금**이다. Paddle 체제에서는 환급
실행 주체가 Paddle 이지만, PG 로 가면 **Simon 이 3영업일 시계를 직접 지켜야 한다.**
셀프 환불을 이제 막 켜려는 시점이라 이게 이번 전환의 가장 위험한 신설 조항이다.

### ④ 미성년자 취소권의 경제적 부담

§13③ 고지의무 자체는 새로 생기는 게 아니다(이미 고지 카드가 붙어 있다, 6.2 절). 바뀌는 것은
**취소권이 행사됐을 때 돈을 토해내는 주체**다. 지금은 Paddle, 전환 후엔 Simon.

부수 정정 2건:
- §13③ 과태료 **1천만원은 2026-07-21 부터 정확**하다. 그 이전 기준 문서는 500만원이다.
  실제 부과기준은 1차 200 / 2차 400 / 3차 이상 1,000만원 + 영업정지 3/6/12개월.
- **정기결제 사전고지는 제13조제3항이 아니라 제13조제6항**이고(2024-02-13 신설, 2025-02-14 시행),
  기간은 시행령 제20조의2 상 **30일**이다. "유료전환 14일"로 적은 자료는 입법예고 단계 값이다.

### ⑤ 가장 과소평가되기 쉬운 것 — 해외 매출

Paddle 은 **100여 관할의 VAT/GST 를 대신 처리**한다. 국내 PG 로 원화 정산을 받으면 부가세법
시행령 제33조②제1호의 "외국환은행에서 원화로 받거나 기재부령으로 정하는 방법으로 받을 것"
요건 충족이 **불확실**해 영세율이 막힐 수 있고, 그러면 해외 매출에도 10% 가 붙는다.

`UNVERIFIED` · 세무사 확인 필수. **이게 전환의 최대 숨은 비용일 수 있다.**

> **요약:** 토스가 건당 ₩780 을 더 준다는 계산은 국내 매출만 본 값이다. 해외 매출 영세율이
> 막히거나 간이과세가 배제되면 그 우위는 사라진다. 그리고 3영업일 환급 시계와 형사 벌금
> 리스크는 금액으로 환산되지 않는 비용이다.

---

## 3. entitlement 권위 — 충돌 지점은 하나다

### 3.1 그쪽이 걱정한 것과 실제

"두 소스가 같은 컬럼을 서로 덮어쓴다"보다 나쁜 일이 일어난다. **조용히 스킵된다.**

`0109` 가 넣고 `0121` 이 그대로 보존한 순서 가드:

```sql
UPDATE public.users
   SET subscription_tier = p_tier, subscription_expires_at = p_expires_at,
       subscription_provider = p_provider, subscription_event_at = v_at
 WHERE id = v_user_id
   AND (subscription_event_at IS NULL OR v_at >= subscription_event_at);
GET DIAGNOSTICS v_rows = ROW_COUNT;
IF v_rows = 0 THEN
  UPDATE public.paddle_webhook_events SET stale_entitlement = true WHERE event_id = p_event_id;
END IF;
```

`users.subscription_event_at` 은 **사용자당 스칼라 1개**이고 provider 로 나뉘지 않는다.

시나리오: Paddle 갱신 10:30 이 먼저 처리됨 → 토스 첫 결제 10:18 웹훅이 늦게 도착 →
`10:18 >= 10:30` 이 거짓 → **0행** → 등급 미반영 + `stale_entitlement = true`.
**정상 결제가 "상류 배달 순서 뒤바뀜"으로 위장되어 사라진다.** 예외도 안 난다.

### 3.2 같은 성격의 문제 둘

| 지점 | 지금 | 두 번째 provider 가 오면 |
|---|---|---|
| `paddle_webhook_events.event_id` | 맨 `text PRIMARY KEY`, provider 열 없음 | id 충돌 시 `'duplicate'` 로 조용히 폐기 |
| `0121` supersede `UPDATE` | `WHERE action='cancel' AND outcome='accepted' AND paddle_subscription_id = v_sub_id AND created_at <= v_at` — **`user_id` 조건 없음** | 구독 id 전역 유일이라는 Paddle 전제에 의존 |
| `billing_self_service_log` | 유니크 2개가 `paddle_transaction_id` / `(paddle_subscription_id, effective_from)` 기준 | 해지·환불 "1회만" 이 provider 별로 안 갈림 |

추가로 **`apply_billing_event` 는 `p_provider` / `p_source` 를 전혀 검증하지 않는다.**
`p_tier` 만 화이트리스트다. 판별자가 자유 문자열인 채 두 번째 provider 를 받으면 오타 하나가
조용히 새 provider 를 만든다.

### 3.3 이름이 Paddle 인 것들 (일반화 대상)

```
paddle_webhook_events                      (테이블)
  paddle_subscription_id, paddle_transaction_id, occurred_at,
  payment_method, scheduled_cancel_at, stale_entitlement

billing_self_service_log.paddle_subscription_id / .paddle_transaction_id
  billing_self_service_refund_once_uidx(paddle_transaction_id)
  billing_self_service_cancel_once_uidx(paddle_subscription_id, effective_from)
```

**provider 중립인 것 (그대로 써도 됨):** `users.subscription_tier` / `_expires_at` / `_provider`,
`revenue_events (source, external_id)` 유니크, `apply_billing_event(p_provider, p_source)` 인자.

### 3.4 지금이 가장 싼 시점

```
paddle_webhook_events     4행 (전부 0115 이전, 컬럼 대부분 NULL)
billing_self_service_log  0행
유료 사용자                0명
```

일반화 작업이 **지금은 사실상 데이터 이관이 없다.** 유료 사용자가 생긴 뒤에는 아니다.

### 3.5 0133 제안

1. **순서 가드를 provider 별로 쪼갠다.** `users.subscription_event_at` 은 남기고
   (같은 provider 안에서의 단조성은 0109 의 원래 의도대로 유효), provider 별 최신 이벤트
   시각을 갖는 자리를 추가해 가드가 `(user_id, provider)` 로 비교하게 한다.
2. **판별자에 CHECK.** `subscription_provider` 와 `apply_billing_event(p_provider, p_source)`
   허용값을 좁힌다.
3. **멱등 키에 provider.** PK 를 `(provider, event_id)` 로. 표 이름은 호환 뷰를 남기고 일반명으로.
4. **`0121` supersede 에 `user_id` 조건 추가.** provider 개수와 무관하게 지금도 있어야 한다.
5. **한 사용자 = 한 provider 불변식.** 다른 provider 소유 사용자에게 온 이벤트는 등급을 쓰지 않고
   **기록만** 한다 (`0123` 미처리 이벤트 패턴 재사용). 소유권 이전은 명시적 경로로만.

**⚠ Simon 확인 필요:** 5번을 **DB 제약으로 강제**할지 **기록만 하고 통과**시킬지.
강제 쪽을 권한다 — 사용자 0명인 지금이 이관 경로를 실데이터 없이 설계할 수 있는 유일한
시점이고, 비강제면 겹침 구간의 승자 규칙을 영원히 들고 가야 한다.

### 3.6 provider 는 이미 둘이 될 예정이었다

토스 이전에 **RevenueCat 이 절반 들어와 있다.** `src/lib/payments/purchases.ts` 는 네이티브
IAP 래퍼(`react-native-purchases` v10, 설치됨)이고 헤더에
`TODO(IAP-webhook): wire the RevenueCat -> edge function -> revenue_events path` 가 남아 있다.
Paddle 은 웹 전용이다 (`paddle-checkout.ts` 는 네이티브에서 `unsupported_platform` 반환).

**즉 이 스키마 작업은 토스를 위한 것이 아니라 이미 예정돼 있던 두 번째 provider 를 위한 것이고,
토스는 세 번째다. 2개가 아니라 3개를 전제로 설계할 것.**

---

## 4. 그쪽 4절 3건 회신

### 4.1 `PADDLE_API_KEY` 만료 감시 위치

`credential-expiry-check.yml` 은 두 종류만 다룬다 — **만료일 파싱 가능**(step `certs`,
`record()` 헬퍼)과 **살았는지만 확인**(step `keys`, HTTP 200 프로브). Paddle 키는 둘 다 안 맞는다:
GitHub 시크릿이 아니라 **Supabase 엣지 시크릿**이라 러너에 값이 없고, Paddle 은 키 자신의
만료일을 읽는 API 를 문서화하지 않는다.

**권장: 키를 GitHub 로 복사하지 말 것.** 시크릿이 두 곳이면 회전도 두 곳이다.

- **정적 만료일 한 줄을 repo Variable 에 두고 기존 `record()` 에 태운다.** 미설정이면 `bump 1`
  로 이슈가 열리므로 "안 적어 둔 상태"가 건강해 보이지 않는다. 이 워크플로가 2026-08-18 에
  고친 바로 그 결함(누락이 통과로 보이는 것)을 반복하지 않는 방식이다.
- **생존 확인은 Paddle 이 해 준다.** Paddle 은 만료 전 `api_key.expiring` 계열 알림을 보낸다.
  destination 이 이미 있으므로 이벤트만 추가하면 되고 CI 가 키를 만질 이유가 없어진다.
  (`UNVERIFIED` — 이벤트명은 조사 결과이므로 대시보드 Events 목록에서 실제 이름 확인 필요.)

**시급한 이유:** 키는 2026-11-08 만료(약 81일)인데 셀프 해지·환불은 아직 꺼져 있다.
**한 번도 못 쓰고 만료된다.** 그리고 만료 후 기능을 켜면 전부 401 인데 "새 기능이라서"로
오진되기 쉽다.

### 4.2 `Last used` 가 `-` 인 것

**고장 신호가 아니다.** 경로는 살아 있다:

- `subscription-manage` 는 실제로 Paddle API 를 친다 —
  `POST /subscriptions/{id}/cancel`, `POST /adjustments`
  (`supabase/functions/subscription-manage/index.ts:138-151`, `:368-375`)
- `PADDLE_SELF_SERVICE_ENABLED !== '1'` 이면 Paddle 로 나가기 전에 `misconfigured` fail-closed (`:285`)
- `PADDLE_SELF_SERVICE_DRYRUN=1` 이면 `:342` 에서 `callPaddle` 앞으로 되돌아감
- **유료 사용자 0명 · `billing_self_service_log` 0행** — 부를 사용자가 없었다

**결론은 그쪽이 맞다** — 실호출 검증 0회다. 그 검증은 `docs/cowork-handoff-260813.md` 작업 B
(샌드박스 adjustment 페이로드 대조)가 해야 한다. 그 문서가 스스로 적었듯 adjustment status
4종(`pending_approval` / `approved` / `rejected` / `reversed`)은 **검증된 사실이 아니라 가정**이다.

### 4.3 비활성 destination

**지워도 된다고 본다.** 코드가 참조하는 것은 `PADDLE_WEBHOOK_SECRET` 하나뿐이라 비활성
destination 이 다른 서명 시크릿을 갖고 있어도 어느 경로에도 영향이 없다.
다만 지우기 전에 **그 4개 이벤트 이름과 URL 만 적어 두라** — 활성 것과 URL 이 같았다면 과거
이중 전달 여부를 확인할 근거가 사라진다.

---

## 5. 그쪽 3절 — 문서 정리 완료

`docs/cowork-paddle-console-260810.md` 를 고쳤다.

- 체크박스 4개 전부 `[x]` + 2026-08-19 실측 주석
- 활성 destination 이벤트 6종 명시
- 상단 배너에 실측 표 추가 (스코프 · 만료일 · `Last used` · 비활성 destination)
- `Last used = -` 가 왜 고장이 아닌지 행 번호와 함께 기록

**그 문서는 2026-08-13 부터 이미 SUPERSEDED 배너를 달고 있었고 후속 정본은
`docs/cowork-handoff-260813.md` 다.** 배너 본문은 "1·2번 완료"라고 적어뒀는데 정작 체크박스는
`[ ]` 로 남아 있어서 그쪽이 같은 조사를 반복한 것으로 보인다. 그 어긋남을 없앴다.

---

## 6. 조사하다 나온 별건 3개

### 6.1 연간 결제가 UI 에서 도달 불가능

`EXPO_PUBLIC_PADDLE_PRICE_*_YEARLY` 는 빌드에 주입되고 `priceIdFor(tier, cadence)` 도 연간을
지원하는데, 호출부가 `cadence` 를 안 넘겨 항상 monthly 로 떨어진다
(`src/screens/deepspace/dds-plans-screen.tsx:310-313`). **"연간 = 2개월 무료" 문구는 있는데
살 수가 없다.** 결제사 결정과 무관한 별건.

### 6.2 미성년 결제 "구멍"은 구멍이 아니다

`CLAUDE.md` 에 "billing 에 `isMinor` 게이트가 없다 = 뚫린 구멍"으로 적혀 있는데
**2026-08-16 Simon 결정(G1)으로 의도된 상태다.** 차단 대신 **고지**를 택했고 그 카드가 실제로
붙어 있다 (`dds-plans-screen.tsx:345-353`, 문구 `locales/ko/deepspace.json:807`).
코드 주석이 이유까지 적어뒀다 — "disclose, do not block: 미성년의 결제는 우리가 뭐라 하든
취소 가능하므로 게이트는 취소권을 막지 못한다".

**단, 토스로 바꾸면 재검토 대상이다.** Paddle 이 판매자일 때는 취소권 리스크의 1차 수취인이
Paddle 이지만 토스면 Simon 이 판매자다. 민법 제5조 취소권은 제146조상 최장 8년.

### 6.3 `amount_cents` 가 KRW 에서 거짓말이 된다

KRW 는 보조단위가 없어 "cents" 가 곧 원이다. 지금은 `/100` 하는 코드가 **한 군데도 없어 실제
버그는 아니다**(전수 확인). 다만 두 통화가 같은 열에 섞이면 나중에 집계 짜는 사람이 한 번
틀린다. 개명은 `bump_gemini_spend` 와 같은 이유로 미루고 **`COMMENT ON COLUMN` 으로
"통화의 최소단위, KRW 는 원 단위"라고 못박는 것**을 권한다.

---

## 7. Simon 결정 대기 3건

1. **A / B / C / D 중 무엇인가** (추천: **D** = Paddle 유지 + 스키마 선반영)
   - A: 토스 도입, 한국 구독은 카드·계좌이체. 네이버페이는 매출 생긴 뒤 별도 심사로 추가 가능
   - B: **지금 실행 불가** (신청 자격 미달)
   - C: 구독 대신 회차권·크레딧. **카카오페이를 꼭 쓰려면 이것이 유일한 길**
   - D: Paddle 유지 + 0133 스키마 일반화만 먼저. 외부 계약 0건
2. **"한 사용자 = 한 provider"를 DB 로 강제할까** (추천: **강제**)
3. **공개 문서의 "KakaoPay, NaverPay" 문장** — 사실 확인 후 필요시 수정

   **법률 문서는 사본이 3개다.** `docs/legal/*.md` 가 정본, `public/legal/*.html` 는 거기서
   재생성, `src/lib/legal/legal-documents.ts` 는 **앱 안에서 사용자가 실제로 읽는 사본**이다.
   가드 2개가 셋의 일치를 강제하므로(`check:legal-snapshot-parity`, `check:legal-html-fresh`)
   하나만 고치면 CI 가 막는다.

   | 문서 | 마크다운(정본) | 앱 스냅샷 |
   |---|---|---|
   | 환불정책 KO | `docs/legal/refund-policy.md:37` | `src/lib/legal/legal-documents.ts:192` |
   | 환불정책 EN | `docs/legal/refund-policy.md:84` | `src/lib/legal/legal-documents.ts:239` |
   | 약관 KO 제9조④ | `docs/legal/terms-of-service.md:35` | `src/lib/legal/legal-documents.ts:61` |
   | 약관 EN | `docs/legal/terms-of-service.md:95` | `src/lib/legal/legal-documents.ts:121` |

   `public/legal/*.html` 는 `scripts/build-legal-html.mjs` 로 재생성한다.
   법률 문서는 `locales/` JSON 이 아니라 이 TS 파일에 KO/EN 이 같이 들어 있으므로
   **C7 5로케일 패리티 대상이 아니다.**

결정이 나오면 순서는 **0133 작성(나) → dry-run·적용(콘솔) → 엣지 함수 재배포 → 변수** 다.
번호는 쓰기 직전 `origin/main` 최댓값 +1 로 재확인하고 즉시 브랜치 push 하겠다.
현재 `origin/main` 최댓값은 `0132` 이므로 `0133` 이다 (중복 `0092`/`0113`/`0117` 은 기존 이력).

**4절의 Paddle 키 만료 감시는 결정을 안 기다려도 된다.** 시작해도 되면 말해 달라.
