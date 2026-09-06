# Lexicon jurisdiction review · product policy v0.1

> **Corrected 2026-09-06.** This is a product-policy review aid, not a legal
> clearance or a list of words prohibited by law. The earlier draft confused
> a conservative copy policy with legal requirements and overstated several
> jurisdictional conclusions. Those statements must not guide implementation.
> The review and implementation limits are recorded in
> [lexicon-policy-review-260906.md](lexicon-policy-review-260906.md).
>
> The executable word lists remain in `src/lib/safety/lexicon.ts`. Changes here
> do not change consent, crisis routing, feature permissions, or market access.

## 1. What the policy protects

The product must not present itself as a licensed clinical service, invent a
person's diagnosis, promise unsubstantiated outcomes, or present an unsupported
personality verdict as fact. This is our product decision. A word matcher can
flag some such copy; it cannot establish that a feature or data flow is lawful.

Technical usage, truthful disclosures, official resource names, and policy
instructions can legitimately name the same words. For example, network
diagnosis describes software. Merely renaming a health inference as a pattern
does not change what the system inferred or the personal data it processes.

## 2. Verified legal context

### EU · AI Act

The European Commission's current Article 5 FAQ describes prohibited *uses*,
including certain sensitive-attribute biometric categorisation and emotion
recognition in workplaces and education. It does not establish a general ban
on mentioning personality traits. The earlier draft's supposed Article 5(1)(g)
quotation ending in “personality traits” was not supported and has been removed.
[Commission Article 5 FAQ](https://ai-act-service-desk.ec.europa.eu/en/ai-act/faq/what-systems-are-prohibited-under-article-5-ai-act-eg-social-scoring-emotion-recognition).

The applicable assessment depends on the actual input processing, intended
purpose, deployment context, and relevant exceptions. Calling something a
self-reflection tool is not an exemption. Do not carry forward the earlier
claim that all text-only features are outside the Act or that all biometric
features are forbidden. The Commission distinguishes different biometric
uses, including verification.
[Commission biometrics FAQ](https://ai-act-service-desk.ec.europa.eu/en/ai-act/faq/are-biometric-systems-eg-facial-recognition-bank-security-permitted).

The official explorer warns that some displayed provisions have not yet
incorporated the Digital Omnibus amendments. Market-entry review must check the
applicable consolidated text and dates; this copy revision grants no EU launch
approval. [Commission AI Act overview](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai).

### US · advertising claims

FTC guidance requires truthful, non-misleading express and implied claims with
appropriate substantiation. It evaluates the advertisement's overall impression,
not just isolated words. A disclaimer cannot cancel a contradictory efficacy
claim. Our restrictions on unsupported IQ, clinical-validation, and outcome
promises remain useful, but a synonym or “based on research” is not proof that
this app delivers a claimed benefit.
[FTC Health Products Compliance Guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance).

### US · professional practice and titles

California BPC §2903 regulates practising psychology and representing oneself
as a psychologist without the required licence, subject to its exceptions.
Its scope includes the services provided. Removing a title from the interface
alone does not resolve that assessment. The former draft's claim about the
mere appearance of each word in every US state was too broad. Review the actual
service and relevant state's law before making a market decision.
[California BPC §2903](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=2903.&lawCode=BPC).

### KR · 의료법 제27조

제27조는 무면허 의료행위를 규율한다. `진단`, `치료`, `정상`이라는 단어가
등장했다는 사실만으로 위반이 확정된다는 기존 설명은 부정확했다. 실제 기능과
서비스 방식의 검토가 필요하며, 어휘 교체만으로 허용되는 기능이라고 판단하면
안 된다. 제품의 임상 서비스 주장 금지와 사용자에 대한 근거 없는 단정 금지는
계속 유지한다.
[국가법령정보센터 제27조](https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1020977077).

## 3. Items requiring a separate review

These were asserted too confidently in the older draft. They are review topics,
not completed legal conclusions or automatic launch gates:

| Area | What needs checking |
|---|---|
| GDPR | The actual inferred/stored data, Article 9 conditions, legal basis, and whether Article 35 requires a DPIA. Do not assume that explicit consent is the only possible condition or that every inference automatically requires a DPIA. |
| JP | The particular protected title, service, and current law. Do not equate all counselling vocabulary or qualifications with one statutory restriction. |
| UK / AU / CA / SG | The current applicable privacy, professional-practice, consumer, and child-safety rules for the actual feature and market. The old one-line market summaries were not sufficient evidence. |
| Official resource names | Accurate names in a help directory or disclosure do not by themselves claim that the app is that institution. Keep the established hotline and legal-copy exceptions. |
| BR / IN / CN and other markets | No market clearance is established by this document. |

## 4. What is actually enforced

| Definition | Current implementation |
|---|---|
| `FORBIDDEN_TERMS` | Runtime EN/KO lexical classification, plus CI product-copy scan. A forbidden input word alone is YELLOW, not RED. |
| `ANALYSIS_UNIVERSAL_FORBIDDEN` | CI scan and selected raw output filters (`northstar`, `axis-estimate`, knowledge bundle). It is not a universal semantic output validator. |
| `LEXICON_NON_CLINICAL_CONTEXTS` | CI-only exact technical/ordinary-language spans. No whole-file bypass is added. |
| `ANALYSIS_JURISDICTION_FORBIDDEN` | Reference lists. They are not automatically activated by country or a CI distribution gate. |
| `ANALYSIS_BANNED_CLAIM_PATTERNS` | Reference definitions with tests; no general runtime or CI consumer currently enforces all of them. |

The previous assertion that the last two lists were already enforced was wrong.
Implementing a new runtime or market gate requires its own design and regression
review, not a documentation claim that it already exists.

## 5. Review record

`LEXICON_LAST_LEGAL_REVIEW` remains `2026-06-10`, the existing owner-recorded
sign-off. This field is not evidence that external counsel approved the product.
The 2026-09-06 work is an engineering and source-accuracy review; it does not reset
that field. The word-list version remains `0.1` because this revision corrects
CI context handling and documentation without removing the existing term lists.

Historical basis: Analysis System Design v0.22 and the 2026-05/06 draft. Use the
corrections above and the actual current implementation, rather than the former
word-to-law equivalence, for future work.
