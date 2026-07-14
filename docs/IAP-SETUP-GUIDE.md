# 2nd-Brain 인앱결제(IAP) 셋업 가이드 — v3 (가격 캐논 정정본)

> 스택: RevenueCat `react-native-purchases` v10 + Google Play Billing.
> 콘솔 §A·§B는 Simon 로그인 필요(사람이 클릭). §D 값을 Claude Code에 주면 앱에 실배선.
> 회사/개발자: HaYangZip Production · 지역: KRW · v3 개정 2026-07-14

---

## ⚠️ v2 → v3에서 바로잡은 것 — 가격 (스토어 제출 블로커였음)

**v2는 항해자 ₩6,900 / 북극성 ₩12,900 으로 Play 상품을 만들라고 지시했다. 이 값으로 만들면
스토어 결제가와 앱 표시가가 어긋난다.** 코드가 가격 정본(SoT)이고, 실제 값은:

| 티어 | 내부 enum | 표시명 | 월 | 연 |
|---|---|---|---|---|
| 항해자 | `cortex` (가격키 `plus`) | 항해자 / Voyager | **₩9,900** | ₩99,000 |
| 북극성 | `brain` (가격키 `pro`) | 북극성 / North Star | **₩19,900** | ₩199,000 |

근거 — 이 4곳이 이미 서로 일치한다:

- `src/lib/progression/pricing.ts:32-36` — `TIER_PRICING` (**단일 SoT**)
- `src/lib/progression/__tests__/pricing.test.ts` — 이 값을 테스트로 잠금 (바꾸면 `npm run verify` 실패)
- `src/lib/entitlements/tiers.ts:88-91` — `TIER_PRICE_KRW` 가 `pricing.ts` 에서 **파생만** 함
- `locales/ko/plans.json` · `locales/ko/deepspace.json` — ₩9,900 / ₩19,900

**v2가 근거로 든 `tiers.ts:80-81` 의 "plus 6900 / pro 11900" 리터럴은 존재하지 않는다.**
그 줄은 `pricing.ts` 파생 코드이며, 하드코딩된 가격 리터럴은 레포 어디에도 없다.

**따라서 코드는 손댈 것이 없다.** v2 §D의 "tiers.ts `pro` 11900→12900 반영" 지시는 폐기한다.

### soma(₩4,900)는 Play 상품이 필요 없다

`pricing.ts` 에는 `soma` (₩4,900) 티어가 있지만, **라이브 플랜 화면
(`src/screens/deepspace/dds-plans-screen.tsx`)은 카드를 3장만 그린다** — 무료 / 항해자 / 북극성.
`soma` 는 구매 경로가 없으므로 이번 IAP 셋업에서는 상품을 만들지 않는다.

> ⚠️ 열린 문제: 무료 사용자가 AI 한도에 도달하면 `src/lib/chat/limits.ts` 의 `NEXT_TIER` 가
> `soma` 를 가리키는데, 정작 플랜 화면에는 soma 카드가 없다. 업셀 대상과 판매 카드가 어긋난다.
> IAP 와 별개 이슈이나 런치 전에 정리 필요.

---

## §A. Google Play Console — 구독 상품 생성

1. **Play Console** → 앱 선택(없으면 앱 먼저 등록; 패키지는 `app.json`/EAS 기준).
2. 좌측 **수익 창출 → 상품 → 구독**.
3. **구독 만들기 ×2**:
   - **항해자**: 상품 ID `voyager_monthly`, 이름 "항해자", 월 자동갱신, **₩9,900**.
   - **북극성**: 상품 ID `northstar_monthly`, 이름 "북극성", 월 자동갱신, **₩19,900**.
4. 각 구독 **활성화**. (심사 전에도 RevenueCat 연결·샌드박스 테스트 가능.)

> 연 구독(₩99,000 / ₩199,000)을 함께 팔 거면 같은 구독의 **다른 기본 요금제(base plan)** 로
> 추가한다. 별도 상품 ID 로 만들지 말 것.

---

## §B. RevenueCat — 프로젝트·엔티틀먼트·오퍼링

1. **app.revenuecat.com** → 프로젝트 "2nd-Brain" 생성.
2. **Project settings → Apps → + Google Play**: 패키지 등록, **Service Account JSON 업로드**
   (Play Console → 설정 → API 액세스에서 생성).
3. **Entitlements 2개**: `plus`, `pro`.
   - ⚠️ **현재 앱 코드(`purchases.ts`)는 `pro`만 소비**한다. `plus` 게이팅은 코드 배선 필요(§D).
     지금 둘 다 만들어 두되, 항해자 혜택은 코드 배선 전까지 미적용임을 인지.
4. **Products**: Play 상품 import → `voyager_monthly`→`plus` 연결, `northstar_monthly`→`pro` 연결.
5. **Offering**(기본 1개, 식별자 예 `default`)에 두 패키지 배치:
   - ⚠️ **패키지 식별자를 각각 `voyager` / `northstar`** 로 지정(커스텀). 앱은 식별자에 포함된
     문자열로 매핑한다 — `plus`/`voyager`/`monthly`/`month` = 항해자, `pro`/`northstar`/`north` = 북극성.
   - **북극성 패키지 식별자에 "monthly"를 넣으면 항해자로 오매핑**된다. 반드시 피할 것.
     (근거: `dds-plans-screen.tsx:171,179`)
6. **API keys → Public app-specific key (Google/Android)** = `goog_...` 복사. (Secret 키 아님.)

---

## §C. 웹훅 — 아직 존재하지 않는다 (결제의 실제 블로커)

**현재 RevenueCat 웹훅 엣지 함수는 레포에 없다.** 그리고 `users.subscription_tier` 에 쓰는 주체가
코드 어디에도 없다 — 모든 게이트가 이 컬럼을 읽는데(`useProgression.ts:43-50`), 아무도 쓰지 않는다.

**즉 지금 상태로 결제가 성공해도 화면 안의 로컬 state 만 바뀌고 실제 캡·advisor 잠금은 free 그대로다.**
"돈 냈는데 안 열린다." **웹훅 없이는 IAP 를 켜면 안 된다.**

웹훅(`revenuecat-webhook` edge function)이 해야 할 두 가지:

1. **엔티틀먼트 → 티어 매핑 후 `users.subscription_tier` 업데이트**
   - `pro`(북극성) → **`brain`**
   - `plus`(항해자) → **`cortex`**
   - 만료/취소 → **`free`**
   - ⚠️ **엔티틀먼트명("pro"/"plus")을 `subscription_tier` 에 그대로 쓰면 안 된다.** 서버 게이트
     (`src/lib/progression/entitlements.ts` 의 `free/soma/cortex/brain` + LLM 프록시 `TIER_RANK`)는
     이 4값만 인식 → 잘못 쓰면 `undefined→free` 취급되어 **유료 북극성 유저가 advisor 에서 403**.
2. **`revenue_events` INSERT — C4 스키마 필수**: `month_bucket` + `is_related_party` +
   `customer_relation_type`.
   - ⚠️ **현재 `revenue_events` 에 INSERT 하는 코드가 레포에 0건이다.** C4 는 스키마만 통과하고
     매출 데이터는 존재하지 않는다. XPRIZE 가 관계자 매출 구분 증빙을 요구하면 낼 것이 없다.

→ "웹훅 만들어줘" 하면 Claude Code 가 이 규격으로 생성한다.

---

## §D. Claude Code에 넘길 값

**공개 SDK 키만.** Secret 키·서비스계정 JSON 은 보내지 마세요.

- [ ] RC **Public SDK Key (Android)** `goog_...` → env **`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`**
      (⚠️ `RC_ANDROID_KEY` 아님 — 그 이름으로 넣으면 SDK 가 안 잡힘. 근거 `purchases.ts:52-53`)
- [ ] (선택) iOS 키 → `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- [ ] 상품 ID: `voyager_monthly` / `northstar_monthly` (변경 시 실제값)
- [ ] RC 패키지 식별자: `voyager` / `northstar` (북극성에 "monthly" 금지)
- [ ] 엔티틀먼트: `plus` / `pro`
- [ ] 오퍼링 식별자: `default`
- [ ] 웹훅 매핑 확정: `plus→cortex`, `pro→brain`, 만료→`free`

**값을 받으면 Claude Code 가:**

1. `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` 를 EAS/env 에 배선
2. `purchases.ts` SCAFFOLD → `configure`/`getOfferings`/`purchase` 활성화 +
   **`plus` 엔티틀먼트 소비 배선**(현재 `pro` 만)
3. **`revenuecat-webhook` 엣지 함수 신규 작성** — 엔티틀먼트→`subscription_tier`(cortex/brain) 매핑
   + `revenue_events`(C4) INSERT. **이게 없으면 나머지는 의미 없다.**
4. **샌드박스(테스트) 결제**로 먼저 검증 후 보고

> **가격 코드 변경은 없다.** `pricing.ts` 가 이미 정본이고 맞다.
> 실 결제 라이브 전환은 **스토어 심사 통과 + Simon 명시 승인** 후에만.

---

## 코드 대조 근거 (파일:라인)

| 항목 | 위치 |
|---|---|
| **가격 SoT (cortex 9,900 / brain 19,900)** | `src/lib/progression/pricing.ts:32-36` |
| 가격 잠금 테스트 | `src/lib/progression/__tests__/pricing.test.ts` |
| `TIER_PRICE_KRW` 가 pricing.ts 에서 파생 | `src/lib/entitlements/tiers.ts:88-91` |
| 라이브 플랜 화면(3카드) | `src/screens/deepspace/dds-plans-screen.tsx` |
| RC 키 env 이름 | `src/lib/payments/purchases.ts:52-53` |
| `pro`-only 엔티틀먼트 소비 | `purchases.ts:31,167` |
| 티어 enum (free/soma/cortex/brain), advisor·planner=brain | `src/lib/progression/entitlements.ts:7,31-33` |
| 패키지 식별자 매핑 규칙 | `dds-plans-screen.tsx:171,179` |
| 웹훅 부재 / C4 미배선 | `purchases.ts:12-16` (SCAFFOLD ONLY 선언) |
| 게이트가 읽는 컬럼 (쓰는 주체 없음) | `src/lib/progression/useProgression.ts:43-50` |
