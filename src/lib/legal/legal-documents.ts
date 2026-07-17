// Legal document snapshots (U4). SOURCE OF TRUTH: docs/legal/*.md -- edit there,
// then regenerate this module (scripts noted in the PR; a plain copy with the
// draft comment stripped and em dashes scrubbed). The [기입: …] markers stay
// visible on purpose: the screen shows a draft badge while any remain, and the
// final text lands once Simon's 법률 6정보 arrives (HANDOFF.md §5-1).
// Lexicon note: the disclaimers must NAME the services 2nd-Brain is NOT
// (의료·심리상담·진단·치료) -- this file is allowlisted in
// src/lib/safety/lexicon.ts LEXICON_SCAN_ALLOWLIST for exactly that reason.

export interface LegalDoc {
  /** Route-stable id. */
  id: "terms" | "refund" | "privacy";
  /** Screen title (the document names itself bilingually). */
  title: string;
  /** Shown while the body still contains [기입] placeholders. */
  draftBadge: string;
  /** Markdown-lite body (headings/paragraphs/lists -- parse-legal-markdown.ts). */
  body: string;
}

export const TERMS_DOC: LegalDoc = {
  id: "terms",
  title: "이용약관 · Terms of Service",
  draftBadge: "초안 · Draft",
  body: `# 이용약관 · Terms of Service

_시행일: [기입: YYYY-MM-DD]_

---

## 한국어

### 제1조 (목적)
본 약관은 [기입: 운영자명](이하 "회사")가 제공하는 **2nd-Brain**(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.

### 제2조 (서비스의 성격)
서비스는 이용자가 자신에 관한 기록을 축적하고 **자기 이해와 성장**을 돕는 AI 기반 개인 도구입니다. 서비스는 **의료·심리상담·진단·치료 서비스가 아니며**, 서비스가 제공하는 정보와 AI 산출물은 **참고용 정보**로서 전문적(의료·법률·재정) 조언을 대체하지 않습니다.

### 제3조 (약관의 효력 및 변경)
① 본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.
② 회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일자와 사유를 명시하여 사전 공지합니다. 이용자에게 불리한 변경은 30일 전 공지합니다.

### 제4조 (회원가입 및 계정)
① 이용자는 이메일 또는 소셜 로그인(Google, Apple, Kakao, Naver 등)으로 가입할 수 있습니다.
② **연령 요건**: 만 14세 이상만 직접 가입할 수 있습니다. 만 14세 미만 아동은 법정대리인의 동의가 확인된 경우에 한하여 이용할 수 있습니다(관련 법령 및 회사 정책에 따른 단계적 적용).
③ 이용자는 계정 정보를 정확히 제공·유지할 책임이 있으며, 계정의 관리 책임은 이용자에게 있습니다.
④ 한 이용자가 복수 경로로 가입한 경우 계정 연결·통합 정책은 서비스 내 안내에 따릅니다.

### 제5조 (유료 서비스 및 결제)
① 서비스는 무료 등급과 유료 구독 등급을 제공합니다. 유료 등급의 기능·한도·가격은 결제 화면에 표시됩니다(부가세 포함, 예: [기입: ₩9,900/월], [기입: ₩19,900/월]).
② **결제 및 판매자**: 유료 구독의 결제는 **Paddle.com Market Limited("Paddle")가 판매자(Merchant of Record)**\\로서 처리합니다. Paddle의 구매자 약관이 결제에 함께 적용됩니다.
③ **자동 갱신**: 유료 구독은 이용자가 취소하기 전까지 표시된 주기로 자동 갱신되며, 갱신 시점에 등록된 결제수단으로 청구됩니다. 이용자는 다음 갱신 이전 언제든 취소할 수 있습니다.
④ **결제수단**: 카드, KakaoPay, NaverPay 등 결제 화면에 제공되는 수단을 이용할 수 있습니다.

### 제6조 (청약철회 및 환불)
청약철회·환불·구독 취소는 별도의 **[환불 및 청약철회 정책](./refund-policy.md)**\\과 「전자상거래 등에서의 소비자보호에 관한 법률」에 따릅니다.

### 제7조 (이용자의 의무 및 금지행위)
이용자는 다음 행위를 하여서는 안 됩니다: ① 법령·본 약관 위반, ② 타인의 계정·개인정보 도용, ③ 서비스의 정상 운영 방해(비정상적 접근, 자동화 남용 등), ④ 타인의 권리 침해 또는 불법·유해 콘텐츠 게시, ⑤ 회사의 사전 동의 없는 상업적 이용.

### 제8조 (콘텐츠 및 지식재산권)
① 이용자가 서비스에 입력·생성한 기록(이하 "이용자 콘텐츠")의 권리는 **이용자에게 귀속**합니다.
② 이용자는 서비스 제공·운영·개선(백업, 표시, AI 처리 등)에 필요한 범위에서 회사에 이용자 콘텐츠를 사용할 수 있는 비독점적 라이선스를 부여합니다.
③ 서비스 자체(소프트웨어, 디자인, 상표)에 대한 권리는 회사 또는 정당한 권리자에게 귀속합니다.
④ AI 산출물의 정확성·적합성은 보증되지 않으며, 이용자는 이를 판단·활용할 책임이 있습니다.

### 제9조 (서비스의 변경·중단)
회사는 운영·기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 중대한 변경·중단 시 사전 공지합니다.

### 제10조 (면책 및 책임의 제한)
① 서비스 및 AI 산출물은 "있는 그대로" 제공되며, 특정 목적 적합성이나 정확성을 보증하지 않습니다.
② 서비스는 **의료·법률·재정 등 전문적 조언을 제공하지 않으며**, 이용자의 판단·행위에 대한 책임은 이용자에게 있습니다.
③ 관련 법령이 허용하는 범위에서 회사의 책임은 제한됩니다.

### 제11조 (계약 해지)
① 이용자는 언제든 계정을 해지(탈퇴)할 수 있습니다. 탈퇴 시 데이터 처리는 개인정보처리방침에 따릅니다.
② 회사는 이용자가 본 약관을 중대하게 위반한 경우 사전 통지 후(긴급 시 사후) 이용을 제한·해지할 수 있습니다.

### 제12조 (준거법 및 분쟁해결)
① 본 약관은 **대한민국 법**에 따라 해석됩니다.
② 서비스 이용과 관련한 분쟁은 관련 법령에 따른 관할 법원을 제1심 관할로 합니다.

### 제13조 (문의)
문의: [기입: support 이메일] · [기입: 지원 전화번호]. 고객지원은 **영업일 기준 2일 이내** 회신을 목표로 합니다.

---

## English

### 1. Purpose
These Terms govern the rights, obligations, and responsibilities between [fill: operator name] (the "Company") and users regarding the use of **2nd-Brain** (the "Service").

### 2. Nature of the Service
The Service is an AI-assisted personal tool that helps users accumulate records about themselves for **self-understanding and growth**. It is **not a medical, counseling, diagnostic, or treatment service**, and any information or AI output it provides is **for reference only** and does not replace professional (medical, legal, financial) advice.

### 3. Effect & changes of Terms
(1) These Terms take effect when posted in the Service. (2) The Company may amend them within the bounds of applicable law, giving prior notice of the effective date and reason; changes unfavorable to users are notified 30 days in advance.

### 4. Accounts & eligibility
(1) Users may sign up by email or social login (Google, Apple, Kakao, Naver, etc.). (2) **Age**: only users aged 14+ may register directly; children under 14 may use the Service only where verifiable guardian consent is obtained (phased per law and Company policy). (3) Users must provide accurate account information and are responsible for safeguarding their account. (4) Where one person registers via multiple methods, account-linking follows the in-Service guidance.

### 5. Paid services & billing
(1) The Service offers a free tier and paid subscription tiers; features, limits, and prices are shown at checkout (VAT included, e.g., [fill: ₩9,900/mo], [fill: ₩19,900/mo]). (2) **Seller/billing**: paid subscriptions are sold and processed by **Paddle.com Market Limited ("Paddle") as Merchant of Record**; Paddle's buyer terms also apply. (3) **Auto-renewal**: subscriptions auto-renew at the shown cadence until cancelled, charging the payment method on file; you may cancel any time before the next renewal. (4) **Payment methods**: card, KakaoPay, NaverPay, and others offered at checkout.

### 6. Withdrawal & refunds
Withdrawal, refunds, and cancellation follow the separate **[Refund & Cancellation Policy](./refund-policy.md)** and Korean e-commerce law.

### 7. User obligations & prohibited conduct
Users must not: (1) violate law or these Terms; (2) misappropriate others' accounts/personal data; (3) disrupt normal operation (abnormal access, automation abuse); (4) infringe others' rights or post illegal/harmful content; (5) use the Service commercially without prior consent.

### 8. Content & intellectual property
(1) Rights to content you input or generate ("User Content") **belong to you**. (2) You grant the Company a non-exclusive license to use User Content as needed to provide, operate, and improve the Service (backup, display, AI processing). (3) Rights to the Service itself (software, design, trademarks) belong to the Company or rightful owners. (4) AI output accuracy/suitability is not guaranteed; you are responsible for evaluating and using it.

### 9. Changes/suspension of the Service
The Company may change or suspend all or part of the Service for operational/technical reasons, with prior notice for material changes.

### 10. Disclaimers & limitation of liability
(1) The Service and AI output are provided "as is" without warranty of fitness or accuracy. (2) The Service **does not provide professional (medical, legal, financial) advice**; you are responsible for your decisions and actions. (3) The Company's liability is limited to the extent permitted by law.

### 11. Termination
(1) You may close your account any time; data handling on closure follows the Privacy Policy. (2) The Company may restrict or terminate use for material breach, with prior notice (or after, if urgent).

### 12. Governing law & disputes
(1) These Terms are governed by the **laws of the Republic of Korea**. (2) Disputes are subject to the competent court under applicable law as the court of first instance.

### 13. Contact
Contact: [fill: support email] · [fill: support phone]. Support aims to reply **within 2 business days**.`,
};

export const REFUND_DOC: LegalDoc = {
  id: "refund",
  title: "환불 및 청약철회 정책 · Refund Policy",
  draftBadge: "초안 · Draft",
  body: `# 환불 및 청약철회 정책 · Refund & Cancellation Policy

_최종 업데이트: [기입: YYYY-MM-DD]_

---

## 한국어

### 1. 판매자 및 결제 처리자
2nd-Brain(이하 "서비스")의 유료 구독 결제는 **Paddle.com Market Limited(이하 "Paddle")**\\가 **판매자(Merchant of Record)**\\로서 처리합니다. 결제·세금계산서·환불은 Paddle을 통해 이루어지며, 카드 명세서에는 Paddle 또는 \`Paddle.net\`\\이 표기될 수 있습니다.

- 서비스 운영자: [기입: 사업자/운영자명(법적 상호 권장)]
- 고객지원: [기입: support 이메일] · [기입: 지원 전화번호]

### 2. 30일 환불 보장 (30-Day Money-Back Guarantee)
① 서비스는 결제일로부터 **30일 이내 전액 환불**을 보장합니다. **사유를 묻지 않으며**, 아래 5·6항 절차로 요청하시면 원 결제수단으로 환불해 드립니다.
② 이 보장은 「전자상거래 등에서의 소비자보호에 관한 법률」이 정한 **7일 청약철회권을 포함·초과**하는 것으로, 이용자는 최소한 법정 7일 청약철회권을 언제나 보유합니다.
③ 디지털 콘텐츠 특성상, 이용자는 결제 시 **30일 환불 창(기간)에 대한 고지를 확인**한 뒤 이용을 시작합니다.

### 3. 구독 취소 및 자동 갱신
- 유료 구독은 **월 단위 자동 갱신**됩니다. 가격 및 갱신 주기는 결제 화면 및 이용약관에 표시됩니다(부가세 포함, 예: [기입: ₩9,900/월], [기입: ₩19,900/월] · 앱 표시 기준 확정 필요).
- 이용자는 **다음 갱신일 이전 언제든 구독을 취소**할 수 있으며, 취소 시 **이미 결제한 기간의 만료일까지 유료 혜택이 유지**된 뒤 자동 갱신이 중단됩니다.
- 자동 갱신 결제도 **결제일로부터 30일 이내**이면 위 2항의 환불 보장 대상입니다.
- 취소 방법: 앱 내 [설정 → 구독 관리] 또는 Paddle 결제 영수증의 구독 관리 링크. 문의: [기입: support 이메일].

### 4. 추가 환불 기준
30일 보장과 별개로, 다음의 경우에도 환불을 처리합니다:

- **중복·오류 결제**: 이중 청구, 시스템 오류로 인한 결제 → 확인 후 **전액 환불**.
- **서비스 중대 장애**: 결제한 유료 기능을 상당 기간 이용할 수 없었던 경우 → 해당 기간 비례 환불.

### 5. 환불 방법 및 처리 기간
- 환불은 **원 결제수단**으로 Paddle을 통해 이루어집니다(카드, KakaoPay, NaverPay 등).
- 승인된 환불은 통상 영업일 기준 5~10일 이내 처리되며, 카드사·간편결제사의 정산 일정에 따라 실제 반영은 달라질 수 있습니다.

### 6. 환불 요청 방법
[기입: support 이메일]\\로 (1) 가입 이메일, (2) 결제일/영수증 번호(Paddle 영수증 참조), (3) 사유(선택)를 보내주세요. 고객지원은 **영업일 기준 2일 이내** 회신합니다.

### 7. 정책 변경
본 정책은 관련 법령 및 서비스 정책에 따라 변경될 수 있으며, 변경 시 서비스 내 공지합니다.

---

## English

### 1. Seller & payment processor
Paid subscriptions to 2nd-Brain (the "Service") are sold and processed by **Paddle.com Market Limited ("Paddle") as the Merchant of Record**. Payments, invoices, and refunds are handled through Paddle, and your card statement may show Paddle or \`Paddle.net\`.

- Service operator: [fill: operator/business legal name]
- Support: [fill: support email] · [fill: support phone]

### 2. 30-Day Money-Back Guarantee
(1) We guarantee a **full refund within 30 days** of payment. **No questions asked** · request via Sections 5–6 and we refund to your original payment method.
(2) This guarantee **includes and exceeds** the 7-day statutory right of withdrawal under Korea's Act on Consumer Protection in Electronic Commerce; you always retain at least that 7-day right.
(3) As this is digital content, you confirm awareness of the 30-day refund window at checkout before use begins.

### 3. Cancellation & auto-renewal
- Paid subscriptions **auto-renew monthly**. Price and cadence are shown at checkout and in the Terms (VAT included, e.g., [fill: ₩9,900/mo], [fill: ₩19,900/mo] · confirm against in-app values).
- You may **cancel any time before the next renewal**; paid benefits **continue until the end of the paid period**, then auto-renewal stops.
- Auto-renewal charges are also covered by the 30-day guarantee in Section 2 **if within 30 days** of that charge.
- How to cancel: in-app [Settings → Manage subscription] or the link on your Paddle receipt. Contact: [fill: support email].

### 4. Additional refund criteria
Beyond the 30-day guarantee, we also refund:

- **Duplicate/erroneous charges** → **full refund** after verification.
- **Major service outage**: paid features unavailable for a significant period → pro-rata refund.

### 5. Method & timing
- Refunds are issued to the **original payment method** via Paddle (card, KakaoPay, NaverPay, etc.).
- Approved refunds are typically processed within 5–10 business days; actual posting depends on the card/wallet provider's settlement schedule.

### 6. How to request
Email [fill: support email] with (1) your account email, (2) payment date/receipt number (see your Paddle receipt), and (3) an optional reason. Support replies **within 2 business days**.

### 7. Changes
This policy may change per applicable law and Service policy; changes will be announced in the Service.`,
};

export const PRIVACY_DOC: LegalDoc = {
  id: "privacy",
  title: "개인정보처리방침 · Privacy Policy",
  draftBadge: "초안 · Draft",
  body: `# 개인정보처리방침 · Privacy Policy

_시행일: [기입: YYYY-MM-DD] · 최종 개정: [기입: YYYY-MM-DD]_

---

## 한국어

[기입: 운영자명](이하 "회사")는 「개인정보 보호법」 등 관련 법령을 준수하며, 다음과 같이 개인정보를 처리합니다.

### 1. 수집하는 개인정보 항목
- **필수(계정)**: 이메일 주소, 소셜 로그인 식별자(Google/Apple/Kakao/Naver 등), 인증 토큰.
- **연령 확인**: 생년월일 또는 연령대(연령 등급 확인 및 아동 보호 목적).
- **이용자 콘텐츠**: 이용자가 입력·생성한 성찰·기록 등 서비스 이용 데이터.
- **자동 수집**: 서비스 이용 기록, 기기·브라우저 정보, 접속 로그, 쿠키/로컬 저장소(웹).
- **결제 관련**: 결제는 Paddle이 처리하며, **회사는 카드번호 등 결제수단 전체 정보를 저장하지 않습니다.** 결제 상태·구독 정보 등 처리 결과만 수신합니다.

### 2. 수집·이용 목적
회원 식별 및 계정 관리, 서비스 제공 및 개인화(AI 처리 포함), 유료 구독 결제·정산, 고객지원, 서비스 개선 및 보안, 법령상 의무 이행.

### 3. 보유 및 이용 기간
① 원칙적으로 **회원 탈퇴 시 지체 없이 파기**합니다. ② 다만 관련 법령이 정한 기간 동안 보관합니다: **계약·청약철회 및 대금결제·재화공급 기록 5년, 소비자 불만·분쟁처리 기록 3년, 표시·광고 기록 6개월**(전자상거래법). 로그인 기록은 통신비밀보호법에 따라 3개월 이상 보관할 수 있습니다. ③ 위 기간 경과 또는 목적 달성 시 지체 없이 파기합니다.

### 4. 개인정보의 제3자 제공 및 처리위탁
회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하며, 수탁사는 목적 범위 내에서만 처리합니다:

| 수탁사 | 위탁 업무 | 비고 |
|---|---|---|
| Supabase (Supabase, Inc.) | 인증·데이터베이스 호스팅 | 이용자 계정·콘텐츠 저장 |
| Google (Gemini API, \`@google/genai\`) | AI 처리(입력 데이터 분석·생성) | AI 기능 제공 목적 |
| Paddle (Paddle.com Market Ltd.) | 결제 처리(판매자/Merchant of Record) | 결제·환불·세금 처리 |
| 소셜 로그인 제공자 (Google/Apple/Kakao/Naver 등) | 인증 | 이용자가 선택한 로그인 수단 |

### 5. 개인정보의 국외 이전
서비스는 위 수탁사(예: Supabase, Google)의 국외 서버를 이용할 수 있어 개인정보가 국외(예: 미국 등)로 이전·처리될 수 있습니다. 이전되는 항목·목적·시점·방법·보유기간은 [기입: 구체 명시]하며, 이용자는 이에 대해 [기입: 동의 획득 방식]으로 동의합니다.

### 6. 정보주체의 권리
이용자(및 법정대리인)는 언제든 개인정보 **열람·정정·삭제·처리정지**를 요구할 수 있습니다. 서비스는 앱 내에서 **계정 삭제 및 데이터 내보내기** 기능을 제공하며, [기입: support 이메일]\\로도 요청할 수 있습니다.

### 7. 만 14세 미만 아동
회사는 원칙적으로 만 14세 미만 아동의 개인정보를 수집하지 않으며, 불가피한 경우 법정대리인의 동의를 확인한 후에만 처리합니다(단계적 적용).

### 8. 안전성 확보 조치
접근권한 관리 및 접근통제, 전송·저장 구간 암호화 적용 노력, 접속기록 보관, 취약점 점검 등 관리적·기술적 보호조치를 시행합니다. [기입: 실제 시행 조치와 대조]

### 9. 개인정보 보호책임자 및 문의
- 개인정보 보호책임자: [기입: 성명/직책], 연락처 [기입: 이메일]
- 문의: [기입: support 이메일] (영업일 기준 2일 이내 회신 목표)
- 권익침해 상담: 개인정보분쟁조정위원회, 개인정보침해신고센터(privacy.kisa.or.kr) 등.

### 10. 처리방침의 변경
본 방침은 법령·서비스 변경에 따라 개정될 수 있으며, 개정 시 시행일·변경내용을 서비스 내 공지합니다.

---

## English

[fill: operator name] (the "Company") complies with Korea's Personal Information Protection Act (PIPA) and processes personal data as follows.

### 1. Personal data collected
- **Required (account)**: email address, social-login identifiers (Google/Apple/Kakao/Naver, etc.), authentication tokens.
- **Age check**: date of birth or age band (for age-tier verification and child protection).
- **User Content**: reflections/records and other usage data you input or generate.
- **Automatically collected**: usage logs, device/browser info, access logs, cookies/local storage (web).
- **Payment-related**: payments are handled by Paddle; **the Company does not store full payment-instrument data (e.g., card numbers)** - it receives only processing results such as payment status and subscription info.

### 2. Purposes
Member identification and account management; service provision and personalization (including AI processing); paid-subscription billing/settlement; customer support; service improvement and security; compliance with legal obligations.

### 3. Retention
(1) In principle, data is **destroyed without delay upon account closure**. (2) Certain records are retained for statutory periods: **contract/withdrawal and payment/supply records 5 years, consumer complaint/dispute records 3 years, ad/display records 6 months** (Korean e-commerce law); access logs may be kept 3+ months (Protection of Communications Secrets Act). (3) Data is destroyed without delay once the period lapses or the purpose is fulfilled.

### 4. Third-party sharing & processing entrustment
The Company entrusts processing as below; processors act only within the stated purpose:

| Processor | Function | Notes |
|---|---|---|
| Supabase (Supabase, Inc.) | Auth & database hosting | Stores accounts/User Content |
| Google (Gemini API, \`@google/genai\`) | AI processing (analyze/generate on input) | To provide AI features |
| Paddle (Paddle.com Market Ltd.) | Payment processing (Merchant of Record) | Payments/refunds/tax |
| Social-login providers (Google/Apple/Kakao/Naver, etc.) | Authentication | Login method you choose |

### 5. Overseas transfer
The Service may use processors' overseas servers (e.g., Supabase, Google), so personal data may be transferred to and processed abroad (e.g., the United States). The items, purpose, timing, method, and retention are [fill: specified], and users consent via [fill: consent method].

### 6. Your rights
You (and legal representatives) may request **access, correction, deletion, or suspension of processing** at any time. The Service provides **in-app account deletion and data export**, and you may also contact [fill: support email].

### 7. Children under 14
The Company generally does not collect personal data of children under 14 and, where unavoidable, processes it only after verifying guardian consent (phased rollout).

### 8. Security measures
Access-rights management and access control, encryption in transit/at rest where applicable, access-log retention, and vulnerability checks. [fill: reconcile with actual measures]

### 9. Data Protection Officer & contact
- DPO: [fill: name/title], [fill: email]
- Contact: [fill: support email] (aim to reply within 2 business days)
- Remedies: Korea's Personal Information Dispute Mediation Committee, KISA privacy center (privacy.kisa.or.kr).

### 10. Changes
This policy may be revised per law/service changes; revisions (effective date and content) will be announced in the Service.`,
};

export function isDraft(doc: LegalDoc): boolean {
  return doc.body.includes("[기입");
}
