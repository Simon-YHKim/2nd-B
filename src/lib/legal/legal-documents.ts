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
  id: "terms" | "refund";
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

export function isDraft(doc: LegalDoc): boolean {
  return doc.body.includes("[기입");
}
