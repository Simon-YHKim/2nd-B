# 코딩 세션 → 콘솔 (2026-08-20) — 결제·크레딧 진행 상황과 콘솔 작업 큐

앞선 회신 `docs/cowork-reply-260819.md` 의 후속이다. **Simon 결정이 전부 나왔고 코드가 두 건
머지됐다.** 콘솔이 할 일이 늘었으므로 우선순위 순으로 정리한다.

---

## 0. 결정된 것 (더 이상 논의 대상 아님)

| 질문 | Simon 답 (2026-08-19) |
|---|---|
| A/B/C/D 중 무엇 | **Paddle 먼저 켜고, 토스는 그 다음** |
| "한 사용자 = 한 결제사" DB 강제 | **강제한다** → `0133` 머지 |
| 죽은 페이월 버튼 | **지금 고친다** → `#1250` 머지 |
| 크레딧·상점 | **전부 구현.** 남의것 불가 · 상점은 **네이티브에도** · 유효기간은 표준 준수 |

**결제수단 요구:** 계좌이체 · 삼성페이 · 페이코 · 토스페이 전부 되게.
→ 삼성페이·페이코는 **어느 결제사에서도 정기결제가 안 되므로** 일회성 상품(크레딧)이 필요하다.
그게 크레딧 시스템을 만드는 이유다.

---

## 1. 운영 적용 대기 — 마이그레이션 2건

둘 다 `main` 에 머지됨. **적용 전 dry-run 확인.**

### `0133_billing_provider_ownership.sql`

한 사용자는 한 결제사가 소유한다. 다른 결제사의 이벤트는 기존 구독이 **살아 있으면 거절**
(등급 미기록, **매출은 기록**, `provider_conflict` 플래그), **만료됐으면 인계 허용**.

적용 후 확인:

```sql
-- 컬럼과 제약이 생겼는지
select column_name from information_schema.columns
 where table_name = 'paddle_webhook_events' and column_name in ('provider','provider_conflict');

select conname from pg_constraint where conname = 'users_subscription_provider_check';

-- 기존 4행이 전부 paddle 로 백필됐는지
select provider, count(*) from public.paddle_webhook_events group by provider;

-- 함수가 21… 아니고 18인자 그대로인지 (0133 은 인자를 안 늘렸다)
select pg_get_function_identity_arguments(oid)
  from pg_proc where proname = 'apply_billing_event';
```

`provider_conflict = true` 행이 생기면 **사람이 봐야 하는 사건**이다 — 사용자가 두 곳에
결제하고 있다는 뜻이고 한쪽을 환불해야 한다.

### `0134_credit_ledger.sql`

크레딧 원장. **아무것도 호출하지 않는다** — 기존 함수 수정 0건, 기존 컬럼 쓰기 0건이고
테스트가 그걸 강제한다. 그래서 **적용해도 앱 동작이 바뀌지 않는다.** 먼저 적용해 두면
0135~0138 을 안전하게 얹을 수 있다.

적용 후 확인:

```sql
select table_name from information_schema.tables
 where table_name in ('credit_ledger','credit_balance','credit_skus');

-- 전부 0행이어야 정상 (아직 아무도 안 쓴다)
select (select count(*) from public.credit_ledger)  as ledger,
       (select count(*) from public.credit_balance) as balance,
       (select count(*) from public.credit_skus)    as skus;

-- 드리프트 뷰는 비어 있어야 한다
select * from public.credit_balance_drift;
```

---

## 2. Paddle 대시보드 — 여전히 1순위 확인

`docs/cowork-reply-260819.md` §8 그대로다. **아직 회신 못 받았다.**

- [ ] **Paddle > Checkout > Checkout settings > General** 에서
      `Korean local cards` · `KakaoPay` · `Naver Pay` 체크돼 있나?
- [ ] 항해자(cortex) · 북극성(brain) 플랜에 **KRW 가격이 있나?**

**둘 중 하나라도 아니면 지금 한국 사용자에게 결제수단이 하나도 안 뜨고 있고**, 약관·환불정책의
"카드, KakaoPay, NaverPay" 문장이 **프로덕션에서 거짓**이다.

Paddle 은 한국 결제수단을 **"가격이 KRW 이고 구매자 주소가 한국일 때만"** 노출한다.
자동 환율 변환으로 만든 KRW 가 이 조건을 만족하는지는 **문서가 답하지 않는다**(`UNVERIFIED`).
샌드박스 한 시간이면 확인된다.

---

## 3. Paddle 요율 협상 — 결제사 교체보다 싼 수단

Paddle 요금 페이지 각주가 세 번 반복된다:

> "If you're selling products **under $10** or require invoicing contact us for custom pricing"

₩9,900 은 약 $7 다. **우리는 Paddle 이 명시적으로 협상 대상이라고 안내하는 구간에 있다.**
현재 실효 수수료가 13.3% 인데(5% 가 **부가세 포함 총액**에 붙고 + 건당 $0.50), 공시가가
우리 요율이 아닐 수 있다. **메일 한 통이 토스 검토보다 훨씬 싸다.**

---

## 4. `PADDLE_API_KEY` 만료 감시 — 시급도 올라감

**키는 2026-11-08 만료**인데 `Last used` 가 `-` 다. 셀프 해지·환불이 아직 꺼져 있어서
**한 번도 못 쓰고 만료될 궤도**다. 만료 후 기능을 켜면 전부 401 인데 "새 기능이라서"로
오진되기 쉽다.

권장(회신 §4.1 그대로): **키를 GitHub 로 복사하지 말 것.** 정적 만료일을 repo Variable 에
두고 `credential-expiry-check.yml` 의 기존 `record()` 헬퍼에 태우면, 미설정 시 `bump 1` 로
이슈가 열려 "안 적어 둔 상태"가 건강해 보이지 않는다.

**시작해도 되면 말해 달라.** 결정 대기 항목 아니다.

---

## 5. ⚠ 새로 생긴 콘솔 작업 — IAP 세팅 (0136 의 선행 조건)

**Simon 이 상점을 네이티브에도 넣기로 했다.** 그러면 Apple 은 **IAP 가 필수**이고, 지금
`RevenueCat` 은 **키 없는 껍데기**다(`src/lib/payments/purchases.ts` 헤더가 "SCAFFOLD ONLY" 로
자백하고 있다).

**0136(구매 경로)을 쓰기 전에 콘솔에서 끝나 있어야 하는 것:**

- [ ] **App Store Connect** — 크레딧 팩 Consumable 상품 등록
- [ ] **Google Play Console** — 동일 상품 등록
- [ ] **RevenueCat 프로젝트** — 두 스토어 상품을 Offering 에 연결, 공개 SDK 키 발급
- [ ] `EXPO_PUBLIC_REVENUECAT_IOS_KEY` · `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (repo Variables,
      공개 토큰이라 시크릿 아님)
- [ ] **RevenueCat 웹훅** → Supabase 엣지 함수 (이건 내가 만든다. 콘솔은 URL 등록만)

⚠ **IAP 로 판 크레딧은 만료시킬 수 없다**(Apple 3.1.1 "Any credits or in-game currencies
purchased via in-app purchase may not expire"). `credit_skus.validity_days` 가 `NULL` 을
허용하는 게 그래서다 — IAP SKU 는 반드시 `NULL` 로 등록한다.

**웹 SKU 는 반대로 `>= 365` 가 DB 제약이다**(신유형 상품권 표준약관 제10073호). 두 규범이
한 테이블에 공존하니 SKU 등록할 때 헷갈리지 말 것.

---

## 6. 비활성 webhook destination

지워도 된다고 본다(회신 §4.3). 코드가 참조하는 건 `PADDLE_WEBHOOK_SECRET` 하나뿐이라
비활성 destination 이 다른 시크릿을 갖고 있어도 영향 없다. **지우기 전에 그 4개 이벤트
이름과 URL 만 적어 두라.**

---

## 7. 다음 마이그레이션 예고

| 번호 | 무엇 | 상태 |
|---|---|---|
| `0135` | 기존 리워드 크레딧을 원장으로 이관 + 추론 차감 갈아끼움 | **작성 중** (살아 있는 경로라 적대적 검토 중) |
| `0136` | 구매 경로 (웹 Paddle + **네이티브 IAP**) | 5절 콘솔 작업이 선행 조건 |
| `0137` | 만료 크론 + 만료 예고 | |
| `0138` | 환불 경로 분리 | **잠재 결함 수정** — 아래 |

⚠ **0138 이 고치는 것**: `refund_eligibility` 가 "가장 최근 transaction.completed"로 환불창을
잡는데 **상품을 구분하지 않는다.** 크레딧 구매가 생기는 순간 **₩4,900 팩이 ₩9,900 구독의
환불 기준점**이 되고, `apply_billing_refund` 의 전액환불이 `tier='free'` 로 등급을 회수하므로
**팩 환불이 살아 있는 구독을 날린다.** 지금은 일회성 상품이 없어 안 터진다.
**0136 을 적용하기 전에 0138 이 준비돼 있어야 한다.**

---

## 8. 요약 — 콘솔이 지금 할 것

1. `0133` · `0134` dry-run 후 운영 적용 (위 SQL 로 확인)
2. **Paddle 대시보드 2건 확인** (2절) — 이게 제일 급하다
3. Paddle 요율 협상 메일 (3절)
4. IAP 콘솔 세팅 시작 (5절) — 0136 의 선행 조건이라 리드타임이 있다
5. 비활성 destination 정리 (6절)

`PADDLE_API_KEY` 만료 감시(4절)는 내가 하면 되니 **시작해도 되는지만** 알려 달라.
