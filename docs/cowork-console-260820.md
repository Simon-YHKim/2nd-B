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
| 크레딧·상점 | **전부 구현.** 남의것 불가 · 상점은 **웹에만**(08-20 정정) · 유효기간은 표준 준수 |

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

## 4. `PADDLE_API_KEY` 만료 감시 — ✅ 구현됨, Simon 은 명령 한 줄

**키는 2026-11-08 만료**인데 `Last used` 가 `-` 다. 셀프 해지·환불이 아직 꺼져 있어서
**한 번도 못 쓰고 만료될 궤도**다. 만료 후 기능을 켜면 전부 401 인데 "새 기능이라서"로
오진되기 쉽다.

**정정 (2026-08-20):** 이 절에 "권장 … 시작해도 되면 말해 달라" 라고 적혀 있었는데,
**추적 자체는 이미 붙어 있었다** — `credential-expiry-check.yml` 이 그 사이에
`record "PADDLE_API_KEY (2nd-B subscription-manage)" "2026-11-08"` 로 날짜를 들고 있다.
그러니 남은 결함은 "감시가 없다"가 아니라 **전사값이 낡는다** 였다. 파일 안에 박혀 있으면
갱신하려면 PR 을 열어야 하는데, 그 PR 을 열어야 하는 순간은 하필 **누가 자격증명을 회전하느라
바쁜 순간**이라 아무도 안 연다.

**지금 상태:** 만료일의 정본은 repo Variable `PADDLE_API_KEY_EXPIRES_AT` 이다.

```
gh variable set PADDLE_API_KEY_EXPIRES_AT --body 2026-11-08
```

(Paddle > Developer Tools > Authentication > Edit API key > Expires at)

- **미설정이어도 잘못된 날짜를 만들지 않는다** — 파일의 전사값(2026-11-08)을 그대로 써서
  진짜 마감을 유지하고, 대신 `미설정` 행을 하나 더 찍고 `bump 1` 로 이슈를 연다.
  "아무도 관리 가능한 자리에 안 적어 뒀다" 가 건강한 행과 똑같이 보이면 안 되기 때문이다.
- **키는 GitHub 로 안 간다.** Variable 은 날짜일 뿐이고, 키는 엣지 함수가 읽는 Supabase
  시크릿에 그대로 둔다. 테스트가 어떤 워크플로도 `secrets.PADDLE_API_KEY` 를 안 읽는지 확인한다.
- 로컬에서 두 경우(미설정 / 설정)를 실제로 돌려 확인했다.

---

## 5. ⛔ IAP 세팅 — 착수하지 말 것 (2026-08-20 철회)

**이 절에 "App Store Connect · Google Play · RevenueCat 세팅을 시작하라"고 적혀 있었다.
철회한다. 아직 아무것도 하지 말 것.**

경위: 2026-08-19 에 Simon 이 "상점 ok" 라고 답했고, 내가 그걸 "네이티브에도 넣는다"로
확인받아 IAP 를 선행 조건으로 올렸다. **2026-08-20 Simon 정정 — "면제 의도 포기 아니야.
포기하면 안돼. 네이티브 X".**

**그러니 확정은 이렇다:**

- **상점은 웹 표면에만 둔다.** 네이티브 앱에는 상점도, 충전 버튼도, 외부 결제 링크도,
  "웹에서 더 싸게" 문구도 넣지 않는다.
- **Apple 3.1.3(f) 면제를 유지한다** — 조건이 "앱 안에 구매도 외부 구매 유도도 없을 것"이고,
  지금 앱은 그 상태다. 이건 지켜야 할 자산이지 포기할 카드가 아니다.
- **IAP 는 필요 없다.** RevenueCat 은 키 없는 scaffold 인 채로 둔다.
- 로케일 5종에 "웹에서" 류 문구가 **0건**인 현 상태를 유지한다. 우연이 아니다.

**Google 은 이 결정과 무관하게 괜찮다** — consumption-only 예외가 웹 판매를 명시적으로
허용하고(구글 자신의 예시문이 "Head to our website to purchase more"), 트리거는
"앱에서 파느냐"이지 "앱에서 쓰느냐"가 아니다. 즉 **안드로이드 사용자도 지금 웹에서 살 수 있다.**

안드로이드 인앱은 **한국 기준 2026-12-31** 에 새 요금제(구독 10% · 첫 100만 달러 10%)와
**외부 웹링크**가 열리므로, 인앱 판매는 그때 다시 보면 된다.

⚠ **표현 정정(2026-08-20):** 외부 웹링크 자체는 **이미 존재한다** — 미국·EEA·영국·일본에서
몇 달째 운영 중이고, **한국에만 없다.** 앞 문장이 "아직 어디에도 없다"로 읽히면 틀린 것이다.
한국이 아직 어느 링크아웃 프로그램에도 포함돼 있지 않다는 것이 정확한 서술이다
(`support.google.com/.../answer/17161464` 는 영국·EEA 만 나열, `answer/16787536` 은 일본
전용이라고 명시).

`UNVERIFIED`: **한국의 billing fee 는 공개되지 않았다.** 구글은 US/UK/EEA 만 5% 로 명시하고
그 외 지역은 "forthcoming" 이다. 그래서 "구글 10% + 토스 2~3%" 와 비교되는 쪽(Play 결제
= 10% + 미공개 billing fee)의 숫자가 아직 없다. **절감 방향은 맞지만 크기는 미확인이다.**

**코드 영향 없음.** `0134` 는 웹/네이티브 어느 쪽이든 동일해서 되돌릴 것이 없다.
`credit_skus.validity_days` 가 `NULL`(무기한)을 허용하는 것도 그대로 두는데, 지금은 **쓰지
않는다** — 웹 SKU 는 전부 `>= 365` 다. NULL 은 나중에 네이티브를 다시 검토할 때를 위한
자리로만 남는다.

---

## 6. 비활성 webhook destination

지워도 된다고 본다(회신 §4.3). 코드가 참조하는 건 `PADDLE_WEBHOOK_SECRET` 하나뿐이라
비활성 destination 이 다른 시크릿을 갖고 있어도 영향 없다. **지우기 전에 그 4개 이벤트
이름과 URL 만 적어 두라.**

---

## 7. 다음 마이그레이션 예고

| 번호 | 무엇 | 상태 |
|---|---|---|
| `0135` | 기존 리워드 크레딧을 원장으로 이관 + 추론 차감 갈아끼움 | **머지됨** |
| `0136` | **환불 경로 분리** | **머지됨.** 아래 예고에서 `0138` 로 부르던 것이다 — 구매 경로보다 먼저 있어야 해서 다음 빈 번호를 가져갔다 |
| `0137`(예정) | 구매 경로 (**웹 Paddle 만**) | **⚠ 클라이언트 읽기 변경이 같이 가야 함 — 아래** |
| `0138`(예정) | 만료 크론 + 만료 예고 | |

⚠ **구매 경로가 반드시 같이 해야 하는 것 — 안 하면 산 크레딧이 안 보인다.**
`0135` 의 미러는 `reward_credits` 를 **`credit_ad_earned_this_month`(광고분만)** 로 재유도한다.
그건 이관 기간에는 의도된 안전한 과소보고였는데, **구매 크레딧이 생기면 얘기가 달라진다** —
구매분은 `usage_counters` 에 절대 안 나타나고 클라이언트는 그 컬럼만 읽으므로
(`usage.ts` → `reasoning-cap.ts`), **50개를 사도 화면에는 "0 남음"이 뜬다.**
크레딧은 정상적으로 차감되므로 기능은 되는데 **잔액이 안 보이는** 상태다.

그래서 구매 경로는 **서버 변경만으로 끝나지 않는다.** `getReasoningUsage` 가
`credit_balance` / `credit_available` 를 읽도록 같이 바꿔야 한다. 이건 웹 결제에도
그대로 해당한다(네이티브와 무관).

✅ **그 결함은 `0136` 이 고쳤다** (2026-08-20). 여기 적혀 있던 진단은 맞았고, 실측으로
**한 건이 더 나왔다** — 더 나쁜 쪽이다.

| | 무엇 | 결과 |
|---|---|---|
| 1 | `claim_billing_self_service` 가 같은 무조건 질의로 **Paddle 에 보낼 거래 id** 를 고른다 | **돈이 틀린다.** 구독 환불을 신청했는데 크레딧 팩이 환불되고 구독은 계속 청구된다 |
| 2 | `refund_eligibility` 가 그 거래로 7일 창과 사용량 게이트를 잡는다 | 팩 구매가 **닫힌 환불창을 다시 연다** |
| 3 | `apply_billing_refund` 가 전액환불이면 무조건 `tier='free'` | **팩 환불이 살아 있는 구독을 날린다** |

판별자는 **원장 자신**이다: `credit_ledger` purchase lot 을 연 거래면 일회성 상품이고,
아니면 오늘과 똑같이 동작한다. 팩이 하나도 없는 지금은 술어가 아무것도 안 걸러서
**동작이 이전과 동일하다** — 그래서 구매 경로보다 먼저 올려도 안전하다.
엣지 함수 재배포도 필요 없다(9인자 시그니처 그대로).

---

## 8. 요약 — 콘솔이 지금 할 것

1. `0133` · `0134` dry-run 후 운영 적용 (위 SQL 로 확인)
2. **Paddle 대시보드 2건 확인** (2절) — 이게 제일 급하다
3. Paddle 요율 협상 메일 (3절)
4. ~~IAP 콘솔 세팅~~ — **철회됨. 착수하지 말 것** (5절)
5. 비활성 destination 정리 (6절)

`PADDLE_API_KEY` 만료 감시(4절)는 내가 하면 되니 **시작해도 되는지만** 알려 달라.
