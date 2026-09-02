// Legal document snapshots (U4). SOURCE OF TRUTH: docs/legal/*.md -- edit there,
// then mirror here (a plain copy with the draft comment stripped and em dashes
// scrubbed). FINALIZED 2026-07-17 with Simon's 법률 6정보 (하양 프로덕션 · 대표
// 배소하 · 경기도 안양시 · kim0405@hayangzip.com · 보호책임자 김양환 · prices);
// no [기입]/[fill] markers remain, so isDraft() is false and the 초안 badge is
// gone. 사업자등록번호 205-10-98603 was issued 2026-07-22 and posted here on
// 2026-08-03; nothing in these documents is pending any more.
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

_시행일: 2026-08-16 · 최종 개정: 2026-08-16_

---

## 한국어

### 제1조 (목적)
본 약관은 하양 프로덕션(개인사업자, 대표: 배소하, 이하 "회사")가 제공하는 **2nd-Brain**(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.

### 제2조 (서비스의 성격)
서비스는 이용자가 자신에 관한 기록을 축적하고 **자기 이해와 성장**을 돕는 AI 기반 개인 도구입니다. 서비스는 **의료·심리상담·진단·치료 서비스가 아니며**, 서비스가 제공하는 정보와 AI 산출물은 **참고용 정보**로서 전문적(의료·법률·재정) 조언을 대체하지 않습니다.

### 제2조의2 (긴급 상황 및 안전 안내)
① **서비스는 응급·구조 서비스가 아닙니다.** 생명이나 안전이 걸린 상황에서는 서비스가 아니라 **112(경찰)·119(구조·구급)** 에 직접 연락하십시오.
② 서비스는 도움을 받을 수 있는 **상담·신고 창구의 번호를 화면에 안내**할 뿐이며, 이용자를 대신하여 **전화하거나 신고하지 않고, 제3자(보호자·학교·기관 등)에게 알리지 않으며, 이용자의 상태를 감시하지 않습니다.**
③ 서비스는 이용자가 위험에 처했는지 판단하지 않으며, 그러한 판단을 제공한다고 표시하지 않습니다. 안내되는 창구 목록은 참고용이며, 그 기관의 운영시간·응답·처리 결과에 대해 회사는 책임지지 않습니다.
④ 미성년 이용자에게도 동일한 안내가 제공되며, 연령을 이유로 기능을 임의로 잠그거나 보호자에게 통지하지 않습니다.

### 제3조 (약관의 효력 및 변경)
① 본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.
② 회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일자와 사유를 명시하여 사전 공지합니다. 이용자에게 불리한 변경은 30일 전 공지합니다.

### 제4조 (회원가입 및 계정)
① 이용자는 이메일 또는 소셜 로그인(Google, Apple, Kakao, Naver 등)으로 가입할 수 있습니다.
② **연령 요건**: 만 14세 이상만 직접 가입할 수 있습니다. 만 14세 미만 아동은 법정대리인의 동의가 확인된 경우에 한하여 이용할 수 있습니다(관련 법령 및 회사 정책에 따른 단계적 적용).
③ 이용자는 계정 정보를 정확히 제공·유지할 책임이 있으며, 계정의 관리 책임은 이용자에게 있습니다.
④ 한 이용자가 복수 경로로 가입한 경우 계정 연결·통합 정책은 서비스 내 안내에 따릅니다.

### 제5조 (유료 서비스 및 결제)
① 서비스는 무료 등급과 유료 구독 등급을 제공합니다. 유료 등급의 기능·한도·가격은 결제 화면에 표시됩니다(부가세 포함: 항해자 ₩9,900/월 · 북극성 ₩19,900/월(출시 준비 중) · 연간 구독 = 월 요금×10(2개월 무료)).
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

### 제13조 (사업자 정보 및 문의)
- 상호: 하양 프로덕션 (개인사업자, 대표: 배소하)
- 소재지: 경기도 안양시
- 사업자등록번호: 205-10-98603
- 통신판매업 신고: 면제 사업자 (「전자상거래 등에서의 소비자보호에 관한 법률」 시행령 제11조의 신고 면제 기준에 해당)
- 문의: kim0405@hayangzip.com (이메일 중심으로 운영합니다). 고객지원은 **영업일 기준 2일 이내** 회신을 목표로 합니다.

---

## English

### 1. Purpose
These Terms govern the rights, obligations, and responsibilities between Hayang Production (sole proprietorship, Representative: Bae Soha; the "Company") and users regarding the use of **2nd-Brain** (the "Service").

### 2. Nature of the Service
The Service is an AI-assisted personal tool that helps users accumulate records about themselves for **self-understanding and growth**. It is **not a medical, counseling, diagnostic, or treatment service**, and any information or AI output it provides is **for reference only** and does not replace professional (medical, legal, financial) advice.

### 2A. Emergencies and safety information
(1) **The Service is not an emergency or rescue service.** If life or safety is at risk, contact the emergency services directly (in Korea, **112 for police and 119 for fire/ambulance**), not this app.
(2) The Service only **displays the phone numbers of help and reporting lines on screen.** It does **not** call or report on your behalf, does **not** notify any third party (guardian, school, institution), and does **not** monitor your condition.
(3) The Service does not determine whether you are at risk, and does not present itself as doing so. The listed lines are provided for reference; the Company is not responsible for their hours, responsiveness, or outcomes.
(4) Minors see the same information. The Company does not lock features or notify a guardian on the basis of age.

### 3. Effect & changes of Terms
(1) These Terms take effect when posted in the Service. (2) The Company may amend them within the bounds of applicable law, giving prior notice of the effective date and reason; changes unfavorable to users are notified 30 days in advance.

### 4. Accounts & eligibility
(1) Users may sign up by email or social login (Google, Apple, Kakao, Naver, etc.). (2) **Age**: only users aged 14+ may register directly; children under 14 may use the Service only where verifiable guardian consent is obtained (phased per law and Company policy). (3) Users must provide accurate account information and are responsible for safeguarding their account. (4) Where one person registers via multiple methods, account-linking follows the in-Service guidance.

### 5. Paid services & billing
(1) The Service offers a free tier and paid subscription tiers; features, limits, and prices are shown at checkout (VAT included: Voyager ₩9,900/mo · North Star ₩19,900/mo (coming soon) · yearly = 10x monthly (2 months free)). (2) **Seller/billing**: paid subscriptions are sold and processed by **Paddle.com Market Limited ("Paddle") as Merchant of Record**; Paddle's buyer terms also apply. (3) **Auto-renewal**: subscriptions auto-renew at the shown cadence until cancelled, charging the payment method on file; you may cancel any time before the next renewal. (4) **Payment methods**: card, KakaoPay, NaverPay, and others offered at checkout.

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

### 13. Business information & contact
- Business name: Hayang Production (sole proprietorship, Representative: Bae Soha)
- Location: Anyang-si, Gyeonggi-do, Republic of Korea
- Business registration number: 205-10-98603
- Mail-order business report: exempt (meets the exemption criteria of Article 11 of the Enforcement Decree of Korea's e-commerce act)
- Contact: kim0405@hayangzip.com (email-first support). Support aims to reply **within 2 business days**.`,
};

export const REFUND_DOC: LegalDoc = {
  id: "refund",
  title: "환불 및 청약철회 정책 · Refund Policy",
  draftBadge: "초안 · Draft",
  body: `# 환불 및 청약철회 정책 · Refund & Cancellation Policy

_최종 업데이트: 2026-08-11 · 개정 시행일: 2026-08-11_

---

## 한국어

### 1. 판매자 및 결제 처리자
2nd-Brain(이하 "서비스")의 유료 구독 결제는 **Paddle.com Market Limited(이하 "Paddle")**\\가 **판매자(Merchant of Record)**\\로서 처리합니다. 결제·세금계산서·환불은 Paddle을 통해 이루어지며, 카드 명세서에는 Paddle 또는 \`Paddle.net\`\\이 표기될 수 있습니다.

- 서비스 운영자: 하양 프로덕션 (개인사업자, 대표: 배소하 · 소재지: 경기도 안양시 · 사업자등록번호 205-10-98603 · 통신판매업 신고 면제 사업자)
- 고객지원: kim0405@hayangzip.com (이메일 중심, 영업일 기준 2일 이내 회신)

### 2. 7일 환불 보장 (7-Day Money-Back Guarantee)
① 서비스는 결제일로부터 **7일 이내**이고 결제 이후의 이용량이 **무료 플랜이 같은 기간 제공하는 범위 안**에 있는 경우, **사유를 묻지 않고 7일 이내 전액 환불**해 드립니다. 앱 내 **[설정 → 구독 관리]** 에서 직접 요청할 수 있습니다.
② 기준이 되는 이용량은 **결제일 이후의 리즈닝 실행 횟수**이며, **무료 플랜이 1주일간 제공하는 양(주 2회)** 과 비교합니다. 환불 기간이 1주일이므로 기준 허용량은 항상 2회입니다. 현재 판정과 그 근거 수치(사용 횟수 · 무료 기준 허용량 · 남은 기간)는 [설정 → 구독 관리]에서 언제든 그대로 확인하실 수 있습니다.
③ 무료 플랜 범위를 **넘겨 이용하신 경우**는 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조제2항제5호의 **디지털 콘텐츠의 제공이 개시된 경우**에 해당하여 위 ①의 자동 전액 환불 대상에서 제외됩니다. 서비스는 같은 조 제6항에 따라 (a) 결제 화면과 본 정책에 이 제한을 사전에 표시하고, (b) **무료 플랜을 통한 한시적 이용**을 상시 제공하여 구매 전에 서비스를 충분히 시험해 보실 수 있게 합니다.
④ ③에 해당하더라도 **환불이 원천 차단되는 것은 아닙니다.** 아래 4항의 사유(중복·오류 결제, 서비스 중대 장애)는 그대로 적용되며, 그 밖의 개별 사정은 kim0405@hayangzip.com 으로 알려주시면 검토 후 회신합니다.
⑤ 위 ①의 7일 보장은 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조제1항이 정한 **법정 7일 청약철회권과 같은 기간**이며, 무료 플랜 범위 안의 이용에 대해서는 그 권리가 그대로 유지됩니다.
⑥ 디지털 콘텐츠 특성상, 이용자는 결제 시 **7일 환불 창(기간)과 위 ③의 제한에 대한 고지를 확인**한 뒤 이용을 시작합니다.

### 3. 구독 취소 및 자동 갱신
- 유료 구독은 **월 단위 자동 갱신**됩니다. 가격 및 갱신 주기는 결제 화면 및 이용약관에 표시됩니다(부가세 포함: 항해자 ₩9,900/월 · 북극성 ₩19,900/월(출시 준비 중) · 연간 = 월 요금×10).
- 이용자는 **다음 갱신일 이전 언제든 구독을 취소**할 수 있으며, 취소 시 **이미 결제한 기간의 만료일까지 유료 혜택이 유지**된 뒤 자동 갱신이 중단됩니다.
- **즉시 해지**를 선택하면 유료 기능이 바로 종료되며, 남은 기간은 자동으로 환불되지 않습니다(위 2항의 조건을 충족하면 별도로 환불을 요청하실 수 있습니다).
- 자동 갱신 결제도 **결제일로부터 7일 이내**이고 위 2항①의 이용량 조건을 충족하면 환불 대상입니다.
- 취소 방법: 앱 내 **[설정 → 구독 관리]** 에서 직접 해지(기본은 다음 갱신일 해지, 즉시 해지 선택 가능). Paddle 결제 영수증의 구독 관리 링크도 이용할 수 있습니다. 문의: kim0405@hayangzip.com.

### 4. 추가 환불 기준
7일 보장 및 위 2항③의 제한과 **무관하게**, 다음의 경우에는 언제나 환불을 처리합니다:

- **중복·오류 결제**: 이중 청구, 시스템 오류로 인한 결제 → 확인 후 **전액 환불**.
- **서비스 중대 장애**: 결제한 유료 기능을 상당 기간 이용할 수 없었던 경우 → 해당 기간 비례 환불.

### 5. 환불 방법 및 처리 기간
- 환불은 **원 결제수단**으로 Paddle을 통해 이루어집니다(카드, KakaoPay, NaverPay 등).
- 승인된 환불은 통상 영업일 기준 5~10일 이내 처리되며, 카드사·간편결제사의 정산 일정에 따라 실제 반영은 달라질 수 있습니다.

### 6. 환불 요청 방법
- **앱에서 직접**: [설정 → 구독 관리] → [환불 요청]. 판정 결과와 근거 수치를 화면에서 확인하신 뒤 요청하실 수 있습니다. 요청은 판매자인 Paddle에 접수되며, **접수 즉시 환불이 확정되는 것은 아니고** Paddle의 승인 후 원 결제수단으로 환불됩니다.
- **이메일로**: 자동 판정 대상이 아니거나 개별 사정이 있는 경우 kim0405@hayangzip.com 으로 (1) 가입 이메일, (2) 결제일/영수증 번호(Paddle 영수증 참조), (3) 사유를 보내주세요. 고객지원은 **영업일 기준 2일 이내** 회신합니다.

### 7. 정책 변경
본 정책은 관련 법령 및 서비스 정책에 따라 변경될 수 있으며, 변경 시 서비스 내 공지합니다.

### 8. 개정 경위
- **2026-08-11 (현행)**: 결제일로부터 7일 이내이고, 결제 이후의 이용량이 무료 플랜 범위 안에 있는 경우 전액 환불. 위 2항이 그 내용입니다. 기간은 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조제1항이 정한 법정 청약철회 기간과 같으며, 이용량 조건은 같은 조 제2항제5호에 근거합니다.
- **2026-07-17**: 결제일로부터 30일 동안 조건 없이 전액 환불.
- 개별 사정이 있으신 경우 위 2항④ 및 6항에 따라 kim0405@hayangzip.com 으로 알려주시면 검토 후 회신합니다.

---

## English

### 1. Seller & payment processor
Paid subscriptions to 2nd-Brain (the "Service") are sold and processed by **Paddle.com Market Limited ("Paddle") as the Merchant of Record**. Payments, invoices, and refunds are handled through Paddle, and your card statement may show Paddle or \`Paddle.net\`.

- Service operator: Hayang Production (sole proprietorship, Rep.: Bae Soha · Anyang-si, Gyeonggi-do · business registration 205-10-98603 · exempt from the mail-order business report)
- Support: kim0405@hayangzip.com (email-first; replies within 2 business days)

### 2. 7-Day Money-Back Guarantee
(1) We guarantee a **full refund within 7 days** of payment, **no questions asked**, as long as your usage since that payment stayed **within what the free plan provides over the same span**. You can request it yourself in-app at **[Settings → Manage subscription]**.
(2) The measured usage is the **number of reasoning runs since the payment**, compared against what the **free plan allows in one week (2 runs)**. Because the refund window is one week, that allowance is always 2. The current verdict and the numbers behind it (runs used, free-plan allowance, days left) are shown to you verbatim in [Settings → Manage subscription].
(3) If your usage went **beyond the free-plan range**, the payment falls under Article 17(2)5 of Korea's Act on Consumer Protection in Electronic Commerce (**digital content whose provision has begun**) and is therefore outside the automatic full refund in (1). Per Article 17(6) of the same Act, we (a) disclose this limit at checkout and in this policy in advance, and (b) provide **ongoing limited-use access through the free plan** so you can try the Service thoroughly before paying.
(4) Even where (3) applies, **refunds are not shut off.** Section 4 below still applies in full, and any other individual circumstance can be sent to kim0405@hayangzip.com for review and a reply.
(5) The 7-day guarantee in (1) is **the same period** as the statutory 7-day right of withdrawal under Article 17(1) of Korea's Act on Consumer Protection in Electronic Commerce, and for usage within the free-plan range that right is preserved in full.
(6) As this is digital content, you confirm awareness of the 7-day refund window and of the limit in (3) at checkout before use begins.

### 3. Cancellation & auto-renewal
- Paid subscriptions **auto-renew monthly**. Price and cadence are shown at checkout and in the Terms (VAT included: Voyager ₩9,900/mo · North Star ₩19,900/mo (coming soon) · yearly = 10x monthly).
- You may **cancel any time before the next renewal**; paid benefits **continue until the end of the paid period**, then auto-renewal stops.
- Choosing **immediate cancellation** ends paid features at once, and the remaining time is not refunded automatically (you may still request a refund separately if Section 2 applies).
- Auto-renewal charges are also covered by the 7-day guarantee in Section 2 **if within 7 days** of that charge and the usage condition in 2(1) is met.
- How to cancel: in-app **[Settings → Manage subscription]** (cancel at the next renewal by default, immediate cancellation optional), or the link on your Paddle receipt. Contact: kim0405@hayangzip.com.

### 4. Additional refund criteria
**Regardless** of the 7-day guarantee and the limit in 2(3), we always refund:

- **Duplicate/erroneous charges** → **full refund** after verification.
- **Major service outage**: paid features unavailable for a significant period → pro-rata refund.

### 5. Method & timing
- Refunds are issued to the **original payment method** via Paddle (card, KakaoPay, NaverPay, etc.).
- Approved refunds are typically processed within 5–10 business days; actual posting depends on the card/wallet provider's settlement schedule.

### 6. How to request
- **In the app**: [Settings → Manage subscription] → [Request a refund]. You see the verdict and the numbers behind it before you submit. The request goes to Paddle as the seller of record; **submitting is not the same as being refunded** and the money returns to your original payment method once Paddle approves it.
- **By email**: if the automatic check does not cover your case, email kim0405@hayangzip.com with (1) your account email, (2) payment date/receipt number (see your Paddle receipt), and (3) your reason. Support replies **within 2 business days**.

### 7. Changes
This policy may change per applicable law and Service policy; changes will be announced in the Service.

### 8. Revision history
- **2026-08-11 (current)**: a full refund where the request is made within 7 days of payment and usage since that payment stayed within the free-plan range. Section 2 above is that rule. The window is the same period as the statutory right of withdrawal under Article 17(1) of Korea's Act on Consumer Protection in Electronic Commerce, and the usage condition rests on Article 17(2)5 of the same Act.
- **2026-07-17**: a full refund for 30 days after payment, unconditionally.
- For any individual case, sections 2(4) and 6 above apply. Write to kim0405@hayangzip.com and we will review and reply.`,
};

export const PRIVACY_DOC: LegalDoc = {
  id: "privacy",
  title: "개인정보처리방침 · Privacy Policy",
  draftBadge: "초안 · Draft",
  body: `# 개인정보처리방침 · Privacy Policy

_시행일: 2026-09-02 · 최종 개정: 2026-09-02_

---

## 한국어

하양 프로덕션(개인사업자, 대표: 배소하, 소재지: 경기도 안양시, 이하 "회사")는 「개인정보 보호법」 등 관련 법령을 준수하며, 다음과 같이 개인정보를 처리합니다.

### 1. 수집하는 개인정보 항목
- **필수(계정)**: 이메일 주소, 소셜 로그인 식별자(Google/Apple/Kakao/Naver 등), 인증 토큰.
- **연령 확인**: 생년월일 또는 연령대(연령 등급 확인 및 아동 보호 목적).
- **이용자 콘텐츠**: 이용자가 입력·생성한 성찰·기록 등 서비스 이용 데이터.
- **프로필(선택)**: 표시할 이름, 목표 문장. 가입 과정에서 선택적으로 입력하며, 비워 두어도 서비스 이용에 제한이 없습니다.
- **음성·오디오(선택)**: 이용자가 앱에서 녹음하거나 직접 고른 오디오 파일. **텍스트로 옮기는 목적으로만** 처리하며, 앱이 만든 임시 녹음 파일은 전사 직후 기기에서 삭제합니다(이용자가 고른 파일은 회사가 삭제하지 않습니다). 전사된 텍스트는 이용자 콘텐츠로 저장됩니다.
- **자동 수집**: 서비스 이용 기록, 기기·브라우저 정보, 접속 로그, 쿠키/로컬 저장소(웹).
- **결제 관련**: 결제는 Paddle이 처리하며, **회사는 카드번호 등 결제수단 전체 정보를 저장하지 않습니다.** 결제 상태·구독 정보 등 처리 결과만 수신합니다.
- **건강·활동 데이터(선택·민감정보)**: 걸음 수, 운동, 수면, 심박수. 성인 이용자가 앱에서 직접 연동을 켜고 OS 건강 연결(예: Health Connect)을 승인한 경우에만 읽어 **본인 계정에만** 저장합니다. 만 14세 미만 및 14-17세 미성년자에게는 이 기능이 잠겨 있어 수집하지 않습니다.

**민감정보 처리 고지**: 위 건강·활동 데이터는 「개인정보 보호법」상 **민감정보**로 별도 동의를 받아 처리합니다. 이 데이터는 앱 내 루틴 자동 완료 표시와 이용자 본인의 건강 기록 표시("오늘의 건강 기록") 목적으로만 쓰이며, **건강·활동 측정값은 어떠한 AI 제공자에게도 전송하지 않고 외부 제3자 제공이나 광고·판매에 사용하지 않습니다.** 이용자는 언제든 열람·내보내기·삭제할 수 있습니다.

### 2. 수집·이용 목적
회원 식별 및 계정 관리, 서비스 제공 및 개인화(AI 처리 포함), 음성·오디오의 텍스트 전사, 이용자 기록에 기반한 **자동화된 요약·정리·시각화**(제10조), 유료 구독 결제·정산, 고객지원, 서비스 개선 및 보안, 법령상 의무 이행.

### 3. 보유 및 이용 기간
① 원칙적으로 **회원 탈퇴 시 지체 없이 파기**합니다. ② 다만 관련 법령이 정한 기간 동안 보관합니다: **계약·청약철회 및 대금결제·재화공급 기록 5년, 소비자 불만·분쟁처리 기록 3년, 표시·광고 기록 6개월**(전자상거래법). 로그인 기록은 통신비밀보호법에 따라 3개월 이상 보관할 수 있습니다. ③ 위 기간 경과 또는 목적 달성 시 지체 없이 파기합니다.

### 4. 개인정보의 제3자 제공 및 처리위탁
회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하며, 수탁사는 목적 범위 내에서만 처리합니다:

| 수탁사 | 위탁 업무 | 비고 |
|---|---|---|
| Supabase (Supabase, Inc.) | 인증·데이터베이스 호스팅 | 이용자 계정·콘텐츠 저장. 저장 위치는 대한민국(서울) 리전입니다 |
| OpenAI OpCo, LLC (OpenAI API) | AI 처리(대화·분석·생성·음성 전사, 임베딩은 활성화된 경우) | 이용자가 해당 AI 기능을 사용할 때 |
| Anthropic PBC (Claude API) | AI 처리(페르소나 서술·종합, 교차 검증의 일부) | 이용자가 해당 AI 기능을 사용할 때 |
| Google (Gemini API, \`@google/genai\`) | AI 처리(구버전 앱 등) | 구버전 앱 또는 전용 벤더 변수가 주입되지 않은 빌드의 AI 요청에 한함 |
| Functional Software, Inc. (dba Sentry) | 앱 오류·크래시 수집 및 분석 | 최신 앱에서는 초기화하지 않습니다(제5조 참조). 세션 녹화는 사용하지 않음 |
| 소셜 로그인 제공자 (Google/Apple/Kakao/Naver 등) | 인증 | 이용자가 선택한 로그인 수단 |
| Google (Google Analytics 4) | 서비스 이용 통계(웹) | 이용자가 사용 통계에 동의한 경우에만. 기본값은 꺼짐 |
| Google (Firebase Analytics)·Microsoft (Microsoft Clarity) | 서비스 이용 통계(앱) | 현재 앱에서 비활성화되어 있어 수집하지 않습니다 |

**결제(독립 판매자)**: 유료 결제는 회사의 수탁사가 아니라 **판매자(Merchant of Record)인 Paddle**이 자기 책임으로 처리합니다. 결제 시 이메일·국가·거래 정보가 Paddle.com Market Limited(영국) 또는 Paddle.com Inc.(미국)로 제공될 수 있으며, Paddle의 개인정보처리방침이 함께 적용됩니다.

### 5. 개인정보의 국외 이전
AI 처리 등 서비스 제공에 필요한 일부 수탁사(Google, OpenAI, Anthropic 등)는 국외(미국 등)에서 운영되므로, 해당 기능을 사용할 때 개인정보가 국외로 이전·처리될 수 있습니다. 이 필수 국외 처리위탁은 「개인정보 보호법」 제28조의8 제1항 제3호(계약 체결 및 이행을 위한 처리위탁·보관)에 근거하며 본 방침 공개로 고지합니다. 이용자는 kim0405@hayangzip.com 으로 국외 이전에 관해 문의하거나 계정 삭제를 요청할 수 있습니다. 필수 이전을 거부하면 AI 기능 등 해당 기능을 제공할 수 없습니다.

**데이터 저장(Supabase)**: 이용자 데이터베이스와 인증 정보는 Supabase, Inc.가 제공하는 인프라의 **대한민국(서울) 리전**에 저장됩니다. 다만 Supabase, Inc.는 미국 법인으로, 서비스 운영·기술 지원 과정에서 국외(미국 등)에서 데이터에 접근하거나 처리할 가능성이 있습니다(문의: privacy@supabase.com). 대상 항목은 제1조의 계정 정보·이용자 콘텐츠·프로필·건강 및 활동 데이터, 방법은 서비스 이용 시 TLS 전송, 보유는 제3조의 기간과 같습니다.

**AI 처리**: AI 기능을 이용할 때 이용자가 해당 기능에 제공한 콘텐츠가 OpenAI OpCo, LLC(미국)의 OpenAI API로 TLS 전송되어 분석·생성·음성 전사 등에 처리되며, 임베딩(기록 검색 색인) 기능이 서버에서 활성화된 경우에는 임베딩 생성에도 처리됩니다. 일부 AI 기능(페르소나 서술·종합, 교차 검증의 일부)은 Anthropic PBC(미국)의 Claude API로 전송되어 처리될 수 있습니다. 구버전 앱 또는 전용 벤더 변수가 주입되지 않은 빌드의 AI 요청은 Google(미국)의 Gemini API로 처리될 수 있으며, 과거에는 Gemini API가 주된 AI 처리 경로였습니다(Google 개인정보 문의: policies.google.com/privacy). 건강·활동 측정값은 어떤 AI 제공자에게도 전송하지 않습니다.

각 사의 공개 정책 기준(각 사 정책 변경에 따라 달라질 수 있음): OpenAI API 입력·출력은 이용자가 별도로 데이터 공유를 선택하지 않는 한 모델 학습에 사용되지 않으며, 적용 대상 API의 남용 감시 로그는 기본적으로 최대 30일 보관되고 법률상 의무 또는 서비스·제3자 보호를 위해 더 오래 보관될 수 있습니다. 현재 OpenAI 음성 전사 API는 남용 감시 로그와 애플리케이션 상태를 보관하지 않습니다. Anthropic API의 입력·출력은 기본적으로 수신·생성 후 30일 이내 삭제되며, 별도 보관 기능 사용·별도 합의·정책 집행 또는 법률상 의무가 있는 경우는 예외입니다.

**오류·크래시 수집(Sentry)**: 최신 버전의 앱은 오류 수집 도구(Sentry)를 초기화하지 않습니다. 다만 이전 버전의 앱에서는 오류·크래시 정보(스택 추적, 앱·기기·브라우저 정보 포함)가 Functional Software, Inc.(dba Sentry, 미국)로 전송되었을 수 있고, 그렇게 수집된 오류 이벤트가 잔존할 수 있습니다. 전송 당시 기본 개인정보 전송은 비활성화되어 있었고 웹에서는 주소·요청 정보를 제거한 뒤 전송했으며, 세션 녹화는 사용하지 않았습니다. 잔존 이벤트에 관한 문의와 삭제 요청은 kim0405@hayangzip.com 으로 할 수 있습니다.

**사용 통계**: 웹의 사용 통계(Google Analytics 4)는 **성인 이용자가 설정에서 켠 경우에만** Google LLC(미국)로 이전됩니다. 이전 항목은 화면 이동·조작 기록과 기기·브라우저 정보이며 기록 본문·대화 내용은 포함하지 않습니다. 이전 목적은 서비스 이용 통계 확인, 시점·방법은 해당 화면을 볼 때 암호화(TLS)된 네트워크 전송, 보유기간은 계정에 설정된 기간(사용자·이벤트 수준 데이터 기준 최대 14개월)을 따르되 **표준 집계 보고서는 이 보존 설정의 적용을 받지 않습니다**. 이 이전은 「개인정보 보호법」 제28조의8 제1항 제1호에 따라 **이용자의 별도 동의**를 근거로 하며, 설정에서 끄면 이후 전송이 중단됩니다. 사용 통계에 동의하지 않아도 서비스를 이용하는 데 제한이 없습니다. 앱의 사용 통계 도구(Firebase Analytics·Microsoft Clarity)는 **현재 비활성화되어 있어 수집·이전하지 않으며**, 활성화하는 경우 본 방침을 갱신하여 고지합니다(참고: Microsoft Clarity의 공개 보존 기준은 일반 녹화 30일, 즐겨찾기·표본 녹화와 히트맵 등 집계 최대 9개월).

**결제(Paddle)**: 유료 결제 시 이메일·국가·거래 정보가 판매자(Merchant of Record)인 Paddle.com Market Limited(영국) 또는 Paddle.com Inc.(미국)로 TLS 전송되어 결제·환불·세금 처리 목적으로 처리되며, 보유는 관련 법령상 기간에 따릅니다(문의: privacy@paddle.com).

### 6. 정보주체의 권리
이용자(및 법정대리인)는 언제든 개인정보 **열람·정정·삭제·처리정지**를 요구할 수 있습니다. 서비스는 앱 내에서 **계정 삭제 및 데이터 내보내기** 기능을 제공하며, kim0405@hayangzip.com 으로도 요청할 수 있습니다.

### 7. 만 14세 미만 아동
회사는 원칙적으로 만 14세 미만 아동의 개인정보를 수집하지 않으며, 불가피한 경우 법정대리인의 동의를 확인한 후에만 처리합니다(단계적 적용).

### 8. 안전성 확보 조치
행 수준 접근통제(RLS)를 포함한 접근권한 관리, 전송 구간 TLS 암호화 및 저장 데이터 암호화, 접속기록 보관, 정기 점검 등 관리적·기술적 보호조치를 시행합니다.

### 9. 개인정보 보호책임자 및 문의
- 개인정보 보호책임자: 김양환, 연락처 kim0405@hayangzip.com
- 문의: kim0405@hayangzip.com (영업일 기준 2일 이내 회신 목표)
- 권익침해 상담: 개인정보분쟁조정위원회, 개인정보침해신고센터(privacy.kisa.or.kr) 등.

### 10. 자동화된 처리에 관한 안내
① 서비스는 이용자가 남긴 기록을 바탕으로 **자동으로** 요약을 만들고, 영역별 기록량을 밝기 단계(L1~L5)로 표시하며, 전체를 한 문장으로 모아 보여줍니다.
② **밝기와 단계는 이용자가 남긴 기록의 양과 종류를 세어 계산한 값이며, AI가 정하는 값이 아닙니다.** AI가 만드는 것은 문장이고, 숫자는 계산의 결과입니다.
③ 이 처리는 이용자 본인에게 보여주기 위한 것이며, **채용·신용·보험·자격 등 이용자의 권리나 의무에 법적 효력을 미치는 결정에 사용되지 않고, 제3자에게 제공되지도 않습니다.**
④ 이용자는 AI가 제안한 내용을 **승인하기 전까지 반영되지 않도록** 할 수 있고, 승인한 내용을 언제든 수정·삭제할 수 있으며, 설정에서 관련 기능을 끌 수 있습니다. 자동화된 처리에 대한 설명을 원하시면 kim0405@hayangzip.com 으로 요청하실 수 있습니다.

### 11. 처리방침의 변경
본 방침은 법령·서비스 변경에 따라 개정될 수 있으며, 개정 시 시행일·변경내용을 서비스 내 공지합니다. 변경 전후를 비교할 수 있도록 개정 이력을 아래 제12조에 남깁니다.

### 12. 개정 이력
| 시행일 | 변경 내용 |
|---|---|
| 2026-09-02 | 실제 처리 경로에 맞춰 제4조·제5조를 정비했습니다: OpenAI·Anthropic의 처리위탁과 국외 이전 고지, 음성 전사 수탁사를 OpenAI로 정정, Supabase 저장 위치를 대한민국(서울) 리전으로 명확화, Paddle을 독립 판매자(Merchant of Record)로 구분, 오류 수집(Sentry)을 최신 앱 비활성 기준으로 정정, 앱 사용 통계(Firebase Analytics·Microsoft Clarity)의 현재 비활성 명시. 건강·활동 측정값의 AI 미전송 범위를 제공자 중립적으로 명확히 했습니다. |
| 2026-08-30 | 제4조 수탁사에 Google Analytics 4·Microsoft Clarity 추가(이용자가 사용 통계에 동의한 경우에만 처리). 제5조에 두 수탁사의 국외 이전 고지 신설(별도 동의 근거·이전 항목·보유기간 명시). |
| 2026-08-16 | 최초 시행. |

---

## English

Hayang Production (sole proprietorship, Representative: Bae Soha; Anyang-si, Gyeonggi-do; the "Company") complies with Korea's Personal Information Protection Act (PIPA) and processes personal data as follows.

### 1. Personal data collected
- **Required (account)**: email address, social-login identifiers (Google/Apple/Kakao/Naver, etc.), authentication tokens.
- **Age check**: date of birth or age band (for age-tier verification and child protection).
- **User Content**: reflections/records and other usage data you input or generate.
- **Profile (optional)**: a display name and a goal sentence, entered optionally during sign-up. Leaving them blank does not limit the Service.
- **Voice/audio (optional)**: audio you record in the app or pick from your device. Processed **only to turn it into text**. Temporary recordings the app itself created are deleted from the device right after transcription; files you picked are never deleted by the Company. The resulting text is stored as User Content.
- **Automatically collected**: usage logs, device/browser info, access logs, cookies/local storage (web).
- **Payment-related**: payments are handled by Paddle; **the Company does not store full payment-instrument data (e.g., card numbers)**; it receives only processing results such as payment status and subscription info.
- **Health & activity data (optional, sensitive)**: steps, exercise, sleep, heart rate. Read only when an adult user turns on the integration in-app and approves the OS health connection (e.g., Health Connect), and stored **only in your own account**. The feature is locked for users under 14 and for 14-17 minors, so no data is collected from them.

**Sensitive-data notice**: the health and activity data above is **sensitive data** under Korea's PIPA and is processed with separate consent. It is used only for in-app routine auto-completion and to show your own health records ("Today's health records"); **health and activity measurements are not sent to any AI provider, shared with external third parties, or used for advertising or sale.** You may view, export, or delete it at any time.

### 2. Purposes
Member identification and account management; service provision and personalization (including AI processing); transcription of voice/audio into text; **automated summarization, organization, and visualization** based on your records (Section 10); paid-subscription billing/settlement; customer support; service improvement and security; compliance with legal obligations.

### 3. Retention
(1) In principle, data is **destroyed without delay upon account closure**. (2) Certain records are retained for statutory periods: **contract/withdrawal and payment/supply records 5 years, consumer complaint/dispute records 3 years, ad/display records 6 months** (Korean e-commerce law); access logs may be kept 3+ months (Protection of Communications Secrets Act). (3) Data is destroyed without delay once the period lapses or the purpose is fulfilled.

### 4. Third-party sharing & processing entrustment
The Company entrusts processing as below; processors act only within the stated purpose:

| Processor | Function | Notes |
|---|---|---|
| Supabase (Supabase, Inc.) | Auth & database hosting | Stores accounts/User Content. Stored in the Seoul (South Korea) region |
| OpenAI OpCo, LLC (OpenAI API) | AI processing (chat, analysis, generation, voice transcription; embeddings when enabled) | When you use the relevant AI feature |
| Anthropic PBC (Claude API) | AI processing (persona narrative/synthesis, part of cross-checking) | When you use the relevant AI feature |
| Google (Gemini API, \`@google/genai\`) | AI processing (older app versions, etc.) | Limited to AI requests from older app versions or builds where the dedicated vendor variables were not injected |
| Functional Software, Inc. (dba Sentry) | App error and crash reporting and analysis | Not initialized in the latest app (see Section 5). No session replay |
| Social-login providers (Google/Apple/Kakao/Naver, etc.) | Authentication | Login method you choose |
| Google (Google Analytics 4) | Service usage statistics (web) | Only if you turn usage statistics on. Off by default |
| Google (Firebase Analytics) and Microsoft (Microsoft Clarity) | Service usage statistics (app) | Currently disabled in the app; nothing is collected |

**Payments (independent seller)**: paid purchases are processed not by a processor of the Company but by **Paddle as the Merchant of Record**, on its own responsibility. At checkout, your email, country, and transaction details may be provided to Paddle.com Market Limited (United Kingdom) or Paddle.com Inc. (United States), and Paddle's privacy policy also applies.

### 5. Overseas transfer
Some processors required to provide the Service, such as Google, OpenAI, and Anthropic for AI processing, operate abroad (including in the United States), so personal data may be transferred and processed abroad when you use those features. This essential overseas processing entrustment relies on Article 28-8(1)3 of Korea's PIPA (processing entrustment or storage necessary to enter into and perform a contract) and is disclosed through this policy. You may contact kim0405@hayangzip.com about overseas transfers or request account deletion. If you refuse an essential transfer, the corresponding AI or related feature cannot be provided.

**Data storage (Supabase)**: your database and authentication data are stored in the **Seoul (South Korea) region** of infrastructure provided by Supabase, Inc. However, Supabase, Inc. is a United States company, and data may be accessed or processed abroad (including in the United States) in the course of operations and technical support (contact: privacy@supabase.com). The items are the account data, User Content, profile, and health and activity data in Section 1; the method is TLS transmission while you use the Service; retention follows Section 3.

**AI processing**: when you use an AI feature, content you provide to that feature is transferred over TLS to OpenAI OpCo, LLC (United States) via the OpenAI API for analysis, generation, or voice transcription, and, where the embeddings (record search indexing) feature is enabled on the server, for generating embeddings. Some AI features (persona narrative/synthesis and part of cross-checking) may be transferred to and processed by Anthropic PBC (United States) via the Claude API. AI requests from older app versions or builds where the dedicated vendor variables were not injected may be processed by Google's Gemini API (United States), which was historically the primary AI processing path (Google privacy inquiries: policies.google.com/privacy). Health and activity measurements are not sent to any AI provider.

Per each provider's published policies (subject to change by each provider): OpenAI API inputs and outputs are not used to train models unless the customer separately opts in to data sharing; abuse-monitoring logs for applicable APIs are retained by default for up to 30 days and may be kept longer where required by law or reasonably necessary to protect the service or a third party; the OpenAI audio transcription API currently retains neither abuse-monitoring logs nor application state. Anthropic API inputs and outputs are deleted by default within 30 days of receipt or generation, except where a storage feature is used, a separate agreement applies, or retention is needed for policy enforcement or legal obligations.

**Error and crash reporting (Sentry)**: the latest version of the app does not initialize the error-reporting tool (Sentry). However, older app versions may have transmitted error and crash data (including stack traces and app/device/browser information) to Functional Software, Inc. (dba Sentry, United States), and error events collected that way may remain. When transmitted, default personal-data forwarding was disabled, the web client removed address and request data before sending, and no session replay was used. To ask about remaining events or request their deletion, contact kim0405@hayangzip.com.

**Usage statistics**: web usage statistics (Google Analytics 4) are transferred to Google LLC (United States) **only if an adult user turns them on in settings**. The transferred items are screen navigation and interaction records plus device/browser information, and they do not include the body of your records or your conversations. The purpose is to see how the Service is used; transfers occur over TLS-encrypted connections while you view those screens; retention follows the period set on the account (up to 14 months for user- and event-level data), while **standard aggregated reports are not governed by that retention setting**. This transfer rests on **your separate consent** under Article 28-8(1)1 of Korea's PIPA, and turning it off in settings stops further transfers. Declining usage statistics does not limit your use of the Service. The app's usage-statistics tools (Firebase Analytics and Microsoft Clarity) are **currently disabled and collect or transfer nothing**; if they are enabled, this policy will be updated first (for reference, Microsoft Clarity's published retention is 30 days for regular recordings and up to 9 months for favorite/sample recordings and aggregates such as heatmaps).

**Payments (Paddle)**: at checkout, your email, country, and transaction details are transferred over TLS to the Merchant of Record, Paddle.com Market Limited (United Kingdom) or Paddle.com Inc. (United States), for payment, refund, and tax processing; retention follows applicable statutory periods (contact: privacy@paddle.com).

### 6. Your rights
You (and legal representatives) may request **access, correction, deletion, or suspension of processing** at any time. The Service provides **in-app account deletion and data export**, and you may also contact kim0405@hayangzip.com.

### 7. Children under 14
The Company generally does not collect personal data of children under 14 and, where unavoidable, processes it only after verifying guardian consent (phased rollout).

### 8. Security measures
Access-rights management with row-level access control (RLS), TLS encryption in transit and encrypted storage, access-log retention, and regular vulnerability checks.

### 9. Data Protection Officer & contact
- DPO: Kim Yang-hwan, kim0405@hayangzip.com
- Contact: kim0405@hayangzip.com (aim to reply within 2 business days)
- Remedies: Korea's Personal Information Dispute Mediation Committee, KISA privacy center (privacy.kisa.or.kr).

### 10. Automated processing
(1) The Service **automatically** builds summaries from the records you leave, shows how much you have recorded in each area as a brightness level (L1-L5), and gathers the whole into a single sentence.
(2) **The brightness levels are counted from the amount and kind of records you left; they are not produced by the AI.** The AI writes sentences; the numbers are the result of counting.
(3) This processing exists to show you your own material. It is **not used for any decision with legal effect on your rights or obligations (hiring, credit, insurance, licensing) and is not provided to third parties.**
(4) You can keep an AI suggestion from taking effect **until you approve it**, edit or delete anything you have approved, and turn the related features off in settings. To request an explanation of this automated processing, write to kim0405@hayangzip.com.

### 11. Changes
This policy may be revised per law/service changes; revisions (effective date and content) will be announced in the Service. A revision history is kept in Section 12 so you can compare what changed.

### 12. Revision history
| Effective | What changed |
|---|---|
| 2026-09-02 | Reworked Sections 4 and 5 to match the actual processing paths: disclosed OpenAI and Anthropic entrustment and overseas transfers, corrected the voice-transcription processor to OpenAI, clarified that Supabase storage is the Seoul (South Korea) region, separated Paddle as an independent Merchant of Record, corrected error reporting (Sentry) to reflect that the latest app does not initialize it, and stated that app usage statistics (Firebase Analytics and Microsoft Clarity) are currently disabled. Clarified the provider-neutral rule that health and activity measurements are not sent to AI providers. |
| 2026-08-30 | Added Google Analytics 4 and Microsoft Clarity to the processors in Section 4 (processed only if you turn usage statistics on). Added an overseas-transfer notice for both in Section 5 (legal basis, transferred items, retention). |
| 2026-08-16 | Initial version. |
`,
};

export function isDraft(doc: LegalDoc): boolean {
  return doc.body.includes("[기입");
}
