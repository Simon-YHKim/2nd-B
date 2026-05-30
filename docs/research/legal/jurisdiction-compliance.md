# Legal & Regulatory Reference — Global Compliance for 2nd-Brain

> **NOT LEGAL ADVICE.** This document is a curated reference of specific law articles, regulations, and enforcement guidance for Simon and Claude to ground design decisions. Independent legal counsel review is REQUIRED before launch.

> Every article references the official source URL. Where official primary-source URLs were not directly fetchable in this session, the canonical reference URL (legislation.gov.uk, law.go.kr, eur-lex.europa.eu, leg.state.fl.us, e-gov.go.jp, etc.) is cited and should be retrieved by counsel for verbatim language.

> **Compiled**: 2026-05-27 (KST). 2nd-Brain v0.2 design doc §10 Tier 1/2/3 jurisdiction strategy.

> **Project posture**: 2nd-Brain is a *self-knowledge / journaling* product, NOT a healthcare provider, NOT a mental-health service, NOT a HIPAA-covered entity. Every jurisdictional analysis below depends on this framing being maintained at code, copy, marketing, and DB level (see CLAUDE.md vocabulary policy and `src/lib/safety/lexicon.ts`).

---

## Table of Contents

1. EU AI Act (Regulation 2024/1689)
2. EU GDPR (Regulation 2016/679)
3. US Federal — FTC & HIPAA boundary
4. US State Psychology Practice Acts (CA, NY, TX, FL, IL)
5. United Kingdom
6. South Korea (대한민국)
7. Japan (日本)
8. Canada
9. Australia
10. Universal Compliance Principles (comparison matrices)
11. Open Questions for Legal Counsel
12. Forbidden Lexicon Implications (input to `lexicon.ts`)
13. Sources

---

## 1. EU AI Act (Regulation (EU) 2024/1689)

**Full title**: Regulation (EU) 2024/1689 of the European Parliament and of the Council of 13 June 2024 laying down harmonised rules on artificial intelligence and amending Regulations (EC) No 300/2008, (EU) No 167/2013, (EU) No 168/2013, (EU) 2018/858, (EU) 2018/1139 and (EU) 2019/2144 and Directives 2014/90/EU, (EU) 2016/797 and (EU) 2020/1828 (Artificial Intelligence Act).

**Official Journal publication**: OJ L, 2024/1689, 12.7.2024. Consolidated text at `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689`. Service Desk official portal: `https://ai-act-service-desk.ec.europa.eu/en/ai-act`.

**Enforcement bodies**: European AI Office (Commission, DG CNECT); national market surveillance authorities; European Artificial Intelligence Board. Member State notifying authorities have penalty authority under Art. 99.

### 1.1 Article 5(1) — Prohibited AI Practices (verbatim)

These prohibitions entered into force on **2 February 2025** (Art. 113(a)).

> **Art. 5(1)(a)** — "the placing on the market, the putting into service or the use of an AI system that deploys subliminal techniques beyond a person's consciousness or purposefully manipulative or deceptive techniques, with the objective, or the effect of materially distorting the behaviour of a person or a group of persons by appreciably impairing their ability to make an informed decision, thereby causing them to take a decision that they would not have otherwise taken in a manner that causes or is reasonably likely to cause that person, another person or group of persons significant harm".

> **Art. 5(1)(b)** — "the placing on the market, the putting into service or the use of an AI system that exploits any of the vulnerabilities of a natural person or a specific group of persons due to their age, disability or a specific social or economic situation, with the objective, or the effect, of materially distorting the behaviour of that person or a person belonging to that group in a manner that causes or is reasonably likely to cause that person or another person significant harm".

> **Art. 5(1)(c)** — Social scoring: "AI systems for the evaluation or classification of natural persons or groups of persons over a certain period of time based on their social behaviour or known, inferred or predicted personal or personality characteristics, with the social score leading to either or both of the following: (i) detrimental or unfavourable treatment of certain natural persons or groups of persons in social contexts that are unrelated to the contexts in which the data was originally generated or collected; (ii) detrimental or unfavourable treatment of certain natural persons or groups of persons that is unjustified or disproportionate to their social behaviour or its gravity".

> **Art. 5(1)(d)** — Criminal risk profiling: "AI system for making risk assessments of natural persons in order to assess or predict the risk of a natural person committing a criminal offence, based solely on the profiling of a natural person or on assessing their personality traits and characteristics" (exception for systems that support human assessment of factual evidence).

> **Art. 5(1)(e)** — "AI systems that create or expand facial recognition databases through the untargeted scraping of facial images from the internet or CCTV footage".

> **Art. 5(1)(f)** — "AI systems to infer emotions of a natural person in the areas of workplace and education institutions, except where the use of the AI system is intended to be put in place or into the market for medical or safety reasons".

> **Art. 5(1)(g)** — "biometric categorisation systems that categorise individually natural persons based on their biometric data to deduce or infer their race, political opinions, trade union membership, religious or philosophical beliefs, sex life or sexual orientation" (exceptions for lawful labelling/filtering, and for law enforcement).

> **Art. 5(1)(h)** — "'real-time' remote biometric identification systems in publicly accessible spaces for the purposes of law enforcement", with narrow exceptions for: (i) targeted search for victims (abduction, trafficking, sexual exploitation, missing persons); (ii) prevention of a substantial and imminent threat to life or physical safety, or a foreseeable terrorist attack; (iii) localisation/identification of persons suspected of Annex II offences.

**2nd-Brain relevance**:
- **Art. 5(1)(a)** — manipulative techniques: 2nd-Brain's "knowledge curation" must NOT use subliminal nudging that materially distorts a user's life decisions.
- **Art. 5(1)(b)** — vulnerability exploitation: red-zone (suicidal ideation, crisis) input flows touch this directly. Crisis short-circuit (C9) is the safety wall.
- **Art. 5(1)(c)** — social scoring: any "growth score" or "self-knowledge index" surfaced to user must be carefully scoped; do NOT lead to "detrimental or unfavourable treatment".
- **Art. 5(1)(f)** — emotion inference in workplace/education: 2nd-Brain is consumer-facing, NOT workplace/education context. BUT: if pivoting to B2B (corporate wellness) or to schools/universities (XPRIZE education vertical), this becomes a hard ban. Document explicitly that personal-use journaling is OUT of scope.
- **Art. 5(1)(g)** — biometric categorisation: do NOT infer personality traits, political opinions, sexual orientation, religion from journal entries via classifier. Personality reflection (e.g., "you write often about X theme") is on the line — see Recital 16/29 for "biometric data" definition.

### 1.2 Article 6 + Annex III — High-Risk AI Systems

**Art. 6(1)** classifies AI systems as high-risk if (a) intended to be used as a safety component of a product covered by Annex I Union harmonisation legislation, AND (b) the product is required to undergo third-party conformity assessment.

**Art. 6(2)** classifies the AI systems listed in **Annex III** as high-risk.

**Annex III — Section 1 (Biometrics)** (subject to Art. 6(1) and the listed restrictions):

> **Annex III §1(a)** — "remote biometric identification systems. This shall not include AI systems intended to be used for biometric verification the sole purpose of which is to confirm that a specific natural person is the person he or she claims to be".

> **Annex III §1(b)** — "AI systems intended to be used for biometric categorisation, according to sensitive or protected attributes or characteristics based on the inference of those attributes or characteristics".

> **Annex III §1(c)** — "AI systems intended to be used for emotion recognition".

**Other Annex III categories** (high-risk): §2 critical infrastructure; §3 education and vocational training; §4 employment; §5 essential services (public benefits, credit, insurance, emergency dispatch); §6 law enforcement; §7 migration/asylum/border; §8 administration of justice and democratic processes.

**2nd-Brain relevance**: If 2nd-Brain ever provides emotion recognition outputs (e.g., "your journal indicates stress level X"), this falls under Annex III §1(c) and triggers high-risk obligations (Arts. 8–17): risk management system, data governance (Art. 10), technical documentation (Art. 11), record-keeping (Art. 12), transparency (Art. 13), human oversight (Art. 14), accuracy/robustness/cybersecurity (Art. 15), conformity assessment (Art. 43), CE marking, post-market monitoring (Art. 72). **Recommended**: structurally avoid emotion-recognition outputs; reflect themes ("you wrote about work pressure") not emotion labels ("you're anxious").

### 1.3 Article 50 — Transparency Obligations

**Effective 2 August 2026** (Art. 113).

- **Art. 50(1)** — Providers of AI systems intended to interact directly with natural persons must design them so users are informed they are interacting with an AI, unless this is obvious to a reasonably well-informed person.
- **Art. 50(2)** — Providers of GPAI systems generating synthetic audio, image, video, or text must ensure outputs are **marked in a machine-readable format and detectable as artificially generated or manipulated** (C2PA, watermarking).
- **Art. 50(3)** — Deployers of **emotion recognition systems** or **biometric categorisation systems** must **inform** the affected natural persons of the operation of the system and process personal data in accordance with GDPR/LED.
- **Art. 50(4)** — Deepfake disclosure obligation (art/satire exception with appropriate disclosure).
- **Art. 50(5)** — Text published "on matters of public interest" generated by AI must be disclosed, unless human-edited or part of criminal investigations.
- **Art. 50(6)** — Information must be provided "in a clear and distinguishable manner at the latest at the time of the first interaction or exposure" and must comply with accessibility requirements.

**2nd-Brain compliance hook**: When user first interacts with the Gemini-backed AI reflection assistant, an unmissable disclosure ("This is an AI assistant. It is not a person, therapist, or doctor.") must be presented. C2PA / synthetic-content marking applies to any AI-generated text shown to user (e.g., daily reflection summary).

### 1.4 Article 99 — Penalties (verbatim tiering)

> **Tier 1 (Art. 5 violations)** — "Non-compliance with the prohibition of the AI practices referred to in Article 5 shall be subject to administrative fines of up to 35 000 000 EUR or, if the offender is an undertaking, up to 7 % of its total worldwide annual turnover for the preceding financial year, whichever is higher."

- **Tier 2** — Non-compliance with provider/deployer obligations (Arts. 16, 22, 23, 24, 26, 31, 33(1), 33(3), 33(4), 34), Art. 50 transparency: up to **€15 million** or **3% of global turnover**.
- **Tier 3** — Supplying incorrect, incomplete, or misleading information to authorities: up to **€7.5 million** or **1% of global turnover**.
- **SME/startup mitigation**: Art. 99(6) allows lower of the two amounts (cap by absolute or % whichever is lower).

### 1.5 Effective dates summary (Art. 113)

| Date | What applies |
|---|---|
| 1 Aug 2024 | Entry into force |
| **2 Feb 2025** | Chapter I (general) and Chapter II (Prohibited practices — Art. 5); AI literacy (Art. 4) |
| **2 Aug 2025** | Chapter V (GPAI), Chapter III §4 (notifying authorities), Chapter VII (governance), Chapter XII (penalties — Art. 99); Member State competent authorities |
| **2 Aug 2026** | Most provisions including Art. 50 transparency, high-risk AI obligations |
| **2 Aug 2027** | Art. 6(1) (high-risk classification for products under Annex I harmonisation legislation); obligations for high-risk AI already on market before 2 Aug 2026 |

---

## 2. EU GDPR (Regulation (EU) 2016/679)

**Full title**: Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 on the protection of natural persons with regard to the processing of personal data and on the free movement of such data, and repealing Directive 95/46/EC (General Data Protection Regulation).

**Effective**: 25 May 2018. Consolidated text: `https://eur-lex.europa.eu/eli/reg/2016/679/oj`. Article-level reference: `https://gdpr-info.eu/`.

**Enforcement**: National data protection authorities; European Data Protection Board (EDPB); coordinated through the one-stop-shop mechanism (Art. 56).

### 2.1 Article 9 — Special Categories of Personal Data

> **Art. 9(1)** — "Processing of personal data revealing racial or ethnic origin, political opinions, religious or philosophical beliefs, or trade union membership, and the processing of genetic data, biometric data for the purpose of uniquely identifying a natural person, **data concerning health** or data concerning a natural person's sex life or sexual orientation shall be prohibited."

"Data concerning health" is defined in **Art. 4(15)**: "personal data related to the physical or mental health of a natural person, including the provision of health care services, which reveal information about his or her health status." **Recital 35** confirms it includes "all data pertaining to the health status of a data subject which reveal information relating to the past, current or future physical or mental health status of the data subject."

**2nd-Brain relevance**: A user journaling about mood, sleep, anxiety, energy, etc. WILL likely be classed as "data concerning health" by EU regulators even if the app's positioning is "self-knowledge". The EDPB has historically taken an expansive view. This means **Art. 9 conditions apply by default to all journal content**.

> **Art. 9(2)** — Exceptions. Processing of Art. 9(1) data is permitted only if one applies:

> **(a)** "the data subject has given **explicit consent** to the processing of those personal data for one or more specified purposes, except where Union or Member State law provide that the prohibition referred to in paragraph 1 may not be lifted by the data subject"

> **(b)** Employment, social security, social protection law obligations

> **(c)** Vital interests (data subject physically/legally incapable of consenting)

> **(d)** Not-for-profit body with political, philosophical, religious or trade union aim

> **(e)** "processing relates to personal data which are manifestly made public by the data subject"

> **(f)** Establishment, exercise, defence of legal claims; courts in judicial capacity

> **(g)** "necessary for reasons of substantial public interest, on the basis of Union or Member State law"

> **(h)** "preventive or occupational medicine, ... medical diagnosis, the provision of health or social care or treatment or the management of health or social care systems and services on the basis of Union or Member State law or pursuant to contract with a health professional"

> **(i)** Public interest in public health

> **(j)** Archiving in public interest, scientific/historical research, statistical purposes (with Art. 89(1) safeguards)

**2nd-Brain primary legal basis**: **Art. 9(2)(a) explicit consent** — must be unambiguous, specific, informed, freely given. EDPB Guidelines 05/2020 on consent require: a separate, clearly distinguishable opt-in (not pre-ticked), with the option to withdraw at any time with equal ease. Important: 9(2)(h) is NOT available — 2nd-Brain is not a health professional and does not provide care/treatment.

### 2.2 Article 22 — Automated Individual Decision-Making, Including Profiling

> **Art. 22(1)** — "The data subject shall have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects concerning him or her or similarly significantly affects him or her."

> **Art. 22(2)** — Paragraph 1 does not apply if the decision: (a) is necessary for entering into, or performance of, a contract; (b) is authorised by Union or Member State law with safeguards; or (c) is based on the data subject's **explicit consent**.

> **Art. 22(3)** — Under 22(2)(a) and 22(2)(c), the controller must implement suitable measures to safeguard the data subject's rights and freedoms and legitimate interests, **at least the right to obtain human intervention** on the part of the controller, to express his or her point of view and to contest the decision.

> **Art. 22(4)** — "Decisions referred to in paragraph 2 shall not be based on special categories of personal data referred to in Article 9(1), unless point (a) or (g) of Article 9(2) applies and suitable measures to safeguard the data subject's rights and freedoms and legitimate interests are in place."

**2nd-Brain relevance**: Automated reflections, weekly summaries, suggested "growth themes" produced by Gemini — if these "similarly significantly affect" the user (e.g., framing their self-understanding), Art. 22 applies. Combined with Art. 9, the only viable legal basis is **explicit consent** AND human review must be available on request. Practical implication: build a "see how this was generated" and "ask for human review" pathway, plus an export-and-delete pathway.

**Article 29 Working Party Guidelines on Automated Decision-making and Profiling (WP251rev.01)** clarify that "significantly affects" includes psychological effects.

### 2.3 Article 35 — Data Protection Impact Assessment (DPIA)

> **Art. 35(1)** — Where a type of processing, in particular using new technologies, taking into account nature, scope, context and purposes, is likely to result in a **high risk to the rights and freedoms of natural persons**, the controller shall, prior to the processing, carry out a DPIA.

> **Art. 35(3)** — DPIA mandatory for: (a) systematic and extensive evaluation of personal aspects based on automated processing, including profiling, on which decisions producing legal/significant effects are based; (b) processing on a **large scale of special categories of data referred to in Article 9(1)** or data on criminal convictions; (c) systematic monitoring of publicly accessible areas on a large scale.

**2nd-Brain relevance**: **DPIA is MANDATORY** before launch in the EU because (a) Gemini-based profiling/reflection, (b) large-scale Art. 9 data. EDPB and national DPAs publish DPIA "blacklists" of operations requiring DPIA (e.g., CNIL list, IE DPC list). Self-knowledge / journaling with LLM analysis will appear on most.

### 2.4 Recital 75 — Risks to Rights and Freedoms

> **Recital 75** — The risk to the rights and freedoms of natural persons, of varying likelihood and severity, may result from personal data processing which could lead to physical, material or non-material damage, in particular: where the processing may give rise to discrimination, identity theft or fraud, financial loss, damage to the reputation, loss of confidentiality of personal data protected by professional secrecy, unauthorised reversal of pseudonymisation, or any other significant economic or social disadvantage; where data subjects might be deprived of their rights and freedoms or prevented from exercising control over their personal data; where personal data are processed which reveal racial or ethnic origin, political opinions, religion or philosophical beliefs, trade union membership, and the processing of genetic data, data concerning health or data concerning sex life or criminal convictions and offences or related security measures; where personal aspects are evaluated, in particular analysing or predicting aspects concerning **performance at work, economic situation, health, personal preferences or interests, reliability or behaviour, location or movements**, in order to create or use personal profiles; where personal data of vulnerable natural persons, in particular of children, are processed; where processing involves a large amount of personal data and affects a large number of data subjects.

### 2.5 EDPB Guidelines on AI/Profiling (relevant)

- **EDPB Opinion 28/2024 on AI models and GDPR** (December 2024).
- **EDPB Guidelines 05/2020 on consent under Regulation 2016/679**.
- **EDPB Guidelines 01/2020 on processing personal data in the context of connected vehicles** (not directly applicable but useful for the "sensor + journal" framing).
- **EDPB Guidelines 03/2022 on dark patterns in social media platform interfaces** (relevant to consent UX).

---

## 3. US Federal — FTC & HIPAA Boundary

### 3.1 FTC Act §5 — Unfair or Deceptive Acts (15 U.S.C. §45)

**Citation**: 15 U.S.C. §45(a)(1) — "Unfair methods of competition in or affecting commerce, and unfair or deceptive acts or practices in or affecting commerce, are hereby declared unlawful."

**Authority**: Federal Trade Commission (FTC). `https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act`.

**Three-part deception test** (FTC Policy Statement on Deception, 1983): (1) representation, omission, or practice (2) likely to mislead consumers acting reasonably (3) material to consumer's decision.

**Three-part unfairness test** (15 U.S.C. §45(n)): (1) substantial injury to consumers, (2) not reasonably avoidable by consumers, (3) not outweighed by benefits to consumers or competition.

### 3.2 Key FTC Enforcement Actions Relevant to 2nd-Brain

**FTC v. BetterHelp, Inc.** (FTC Matter No. 2023169, finalized July 2023)
- URL: `https://www.ftc.gov/legal-library/browse/cases-proceedings/2023169-betterhelp-inc-matter`
- Charges: Disclosing consumer health information (email, IP, intake-questionnaire data) to Facebook, Snapchat, Criteo, Pinterest for ad-targeting after promising privacy.
- **Section 5 theory**: BOTH deception (HIPAA seal misuse, privacy promises) AND **unfairness** (novel theory: failure to maintain written privacy policies, training, and oversight is itself unfair).
- Remedy: $7.8M consumer redress; permanent ban on sharing identifiable mental-health info for advertising; affirmative express consent required before any third-party data sharing.

**FTC v. GoodRx Holdings, Inc.** (Feb 2023, FTC v. GoodRx Holdings, Inc., No. 3:23-cv-460 (N.D. Cal.))
- First-ever enforcement of the FTC Health Breach Notification Rule.
- $1.5M civil penalty for sharing health info with Facebook/Google for advertising.

**FTC v. Premom (Easy Healthcare Corp.)** (May 2023)
- Health Breach Notification Rule + Section 5; $100K civil penalty.

**Operation AI Comply** (Sept 2024)
- URL: `https://www.ftc.gov/business-guidance/blog/2024/09/operation-ai-comply-continuing-crackdown-overpromises-ai-related-lies`
- Multi-defendant sweep against AI-related deceptive claims.

**FTC Inquiry into AI Chatbots Acting as Companions** (Sept 11, 2025)
- URL: `https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-launches-inquiry-ai-chatbots-acting-companions`
- Section 6(b) orders to Meta, OpenAI, Character.AI, Alphabet, Snap, xAI, Instagram.
- Focus: safety practices, monetization, character design, testing for negative impacts, age-based restrictions.
- Directly relevant: 2nd-Brain's reflection assistant must not be designed as a "companion".

**FTC AI Compliance Plan** (Executive Order 14178, signed Dec 11, 2025): FTC required to publish formal AI policy statement by **March 11, 2026**. Monitor for issuance.

### 3.3 FTC Health Breach Notification Rule (16 CFR Part 318)

**Citation**: 16 CFR §§318.1–318.9. eCFR: `https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-318`.

**2024 Amendments**: Effective **July 29, 2024** (89 Fed. Reg. 47028, May 30, 2024).

Key 2024 changes:
- New/expanded definitions: "PHR identifiable health information", "health care provider", "health care services or supplies".
- "Breach of security" includes BOTH security breaches AND **unauthorized disclosures** (this is the critical expansion).
- Notification timing: notify FTC contemporaneously with affected individuals and media; ≤60 calendar days for breaches affecting 500+ individuals; without unreasonable delay (max 60 days) otherwise.
- Electronic notice permitted.

**Applies to**: Vendors of personal health records (PHRs); PHR-related entities; third-party service providers — **including health/wellness apps that collect PHR identifiable health information**.

**2nd-Brain analysis**: To the extent journal content is "PHR identifiable health information" (sleep, mood, fitness, mental-health-adjacent inputs), 2nd-Brain MAY fall under Part 318. Even if positioned as "self-knowledge", FTC takes expansive view (see BetterHelp). **Recommended**: Build breach notification capability per Part 318 timing regardless.

### 3.4 HIPAA — 2nd-Brain Status: NOT a Covered Entity

**HIPAA covered entities** (45 CFR §160.103): (1) health plans, (2) health care clearinghouses, (3) health care providers who transmit health info electronically in connection with a HIPAA standard transaction. 2nd-Brain is **none of these**.

**HIPAA business associates**: 2nd-Brain is NOT a business associate unless it contracts with a covered entity to handle PHI on its behalf.

**Critical compliance posture**:
- ✅ **Do not display HIPAA seals or claim HIPAA compliance** (BetterHelp deception count).
- ✅ **Do not market "HIPAA-protected" or "HIPAA-compliant"** unless and until 2nd-Brain becomes a BAA-covered service.
- ⚠️ **HIPAA NOT applying does NOT mean health data is unregulated** — FTC Act §5, Health Breach Notification Rule, state biometric laws (BIPA, MyHealthMyData), and state consumer health data laws (WA, NV, CT) all apply.

**State consumer health data laws** (post-Dobbs wave):
- **Washington My Health My Data Act** (Wash. Rev. Code §§19.373.005 et seq.) — effective March 31, 2024. Consumer health data definition broader than HIPAA, includes "biometric data", "precise location near a healthcare facility", "data that identifies a consumer seeking health care services". Private right of action.
- **Nevada SB 370** (Nev. Rev. Stat. §603A.450) — effective March 31, 2024.
- **Connecticut Data Privacy Act amendments** (CT Public Act No. 23-56) — consumer health data provisions effective July 1, 2023.

---

## 4. US State Psychology Practice Acts (CA, NY, TX, FL, IL)

All five states protect the titles "psychologist" / "psychology" / "psychological" by statute. **2nd-Brain must never use these titles in any consumer-facing surface in any US state.** The Korean term "심리상담" similarly maps to "counseling" — also reserved in many states.

### 4.1 California — Bus. & Prof. Code §§2900–2919 (Psychology Licensing Law)

**URL**: `https://leginfo.legislature.ca.gov/faces/codes_displayexpandedbranch.xhtml?tocCode=BPC&division=2.&title=&part=&chapter=6.6.&article=`

- **§2900** — Legislative purpose: regulate practice of psychology in public interest.
- **§2902(c)** — Title definition: a person represents themselves as a psychologist when holding out by **any title or description of services incorporating the words "psychology," "psychological," "psychologist," "psychology consultation," "psychology consultant," "psychometry," "psychometrics" or "psychometrist," "psychotherapy," "psychotherapist," "psychoanalysis," or "psychoanalyst,"** or holds themselves out to be trained, experienced, or expert in psychology.
- **§2903** — Unlicensed practice prohibited.
- **§2908** — Exemptions (e.g., students under supervision, school psychologists under credentialed practice).
- **Enforcement**: California Board of Psychology (within DCA).

**2nd-Brain implication**: The CA list is the most comprehensive — also bars "psychometric", "psychoanalytic", "psychotherapy", "psychotherapist". Marketing copy cannot describe AI features as "psychometric assessment" or "psychoanalysis".

### 4.2 New York — Education Law Article 153 (§§7600–7606)

**URL**: `https://www.nysenate.gov/legislation/laws/EDN/A153` and `https://www.op.nysed.gov/professions/psychology/laws-rules-regulations/article-153`

- **§7601** — "Only a person licensed or otherwise authorized under this article shall be authorized to practice psychology or to use the title 'psychologist' or to describe his or her services by use of the words 'psychologist,' 'psychology' or 'psychological' in connection with his or her practice."
- **§7602** — Definition of practice of psychology.
- **§7605** — Exempt persons (clergy acting in pastoral capacity, certain other licensed professionals, students under supervision).
- **Effective**: Chapter 676 of Laws of 2002, effective September 1, 2003.
- **Enforcement**: NYS Education Department, State Board for Psychology.

### 4.3 Texas — Occupations Code Chapter 501 (Psychologists' Licensing Act)

**URL**: `https://statutes.capitol.texas.gov/Docs/OC/htm/OC.501.htm`

- **§501.003** — Definitions.
- **§501.251** — License required to practice or represent as engaged in practice of psychology.
- **§501.004** — Exemptions.
- **Enforcement**: Texas State Board of Examiners of Psychologists, under Texas Behavioral Health Executive Council. `https://bhec.texas.gov/texas-state-board-of-examiners-of-psychologists/`.

### 4.4 Florida — Fla. Stat. Ch. 490 (Psychological Services Act)

**URL**: `https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0400-0499/0490/0490.html`

- **§490.001** — Legislative intent.
- **§490.003** — Definitions.
- **§490.012** — Violations and penalties: "No person shall hold himself or herself out by any title or description incorporating the words **'psychologist,' 'psychology,' 'psychological,' 'psychodiagnostic,' or 'school psychologist,'**" unless licensed under Chapter 490.
- **§490.014** — Exemptions.
- **Enforcement**: Florida Board of Psychology, Department of Health.

**Note**: FL adds "psychodiagnostic" to the protected list (relevant if 2nd-Brain considers any "diagnostic" framing for self-assessment).

### 4.5 Illinois — 225 ILCS 15 (Clinical Psychologist Licensing Act)

**URL**: `https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=1294&ChapterID=24`

- **§15/3** — Definitions.
- **§15/5** — Persons who must be licensed: "No individual shall, without a valid license as a clinical psychologist issued by the Department, in any manner hold himself or herself out to the public as a psychologist or clinical psychologist under the provisions of this Act or render or offer to render clinical psychological services, or attach the title 'clinical psychologist', 'psychologist' or any other name or designation which would in any way imply that he or she is able to practice as a clinical psychologist."
- **§15/9** — Use of titles.
- **§15/24** — It is a public nuisance for any person to render or offer clinical psychological services without a license.
- **Enforcement**: Illinois Department of Financial and Professional Regulation (IDFPR).

### 4.6 What 2nd-Brain May Say (US, conservative)

**Safe (purely descriptive, non-clinical)**:
- "Journaling app", "self-knowledge tool", "personal reflection", "AI-assisted journaling".
- "Habit tracker", "mood log", "daily reflection".
- "Themes and patterns from your journal".

**Risky — DO NOT USE without legal review**:
- "psychological assessment", "personality test", "mental wellness diagnosis", "psychotherapy", "therapy", "counseling", "psychologist", "therapist", "psychometric", "psychoanalysis", "treatment", "healing", "cure".
- Korean-translation traps: "심리치료", "심리상담" (CA, NY likely cover via "psychological services" and "psychotherapy"); "정신건강" framing implies clinical.

**Mandatory disclaimers (every US state)**:
- "Not a substitute for professional medical advice, diagnosis, or treatment."
- "If you are in crisis, contact 988 (Suicide & Crisis Lifeline)" (US-specific).
- "This app does not provide mental health, psychological, or counseling services."

---

## 5. United Kingdom

### 5.1 UK GDPR + Data Protection Act 2018

**UK GDPR**: Retained EU law version of Regulation 2016/679 as amended by the Data Protection, Privacy and Electronic Communications (Amendments etc) (EU Exit) Regulations 2019.

**Data Protection Act 2018** (DPA 2018): `https://www.legislation.gov.uk/ukpga/2018/12/contents`

- **Part 2, Chapter 2**: General processing (UK GDPR supplements).
- **Section 10** + **Schedule 1**: Conditions for processing special category data and criminal offence data.
- **Schedule 1, Part 1, ¶2** — Health data: substantial public interest in field of public health; also processing necessary for health/social care purposes by/under supervision of health professional or other person owing duty of confidentiality.
- **Section 14**: Automated decision-making safeguards (mirrors GDPR Art. 22).

**Enforcement**: Information Commissioner's Office (ICO). `https://ico.org.uk/`.

**ICO guidance for AI/profiling**: ICO Guidance on AI and Data Protection (updated 2023). ICO Age Appropriate Design Code (Children's Code) — Sept 2020, full effect Sept 2021.

### 5.2 Online Safety Act 2023

**URL**: `https://www.legislation.gov.uk/ukpga/2023/50`

**Effective**: Royal Assent 26 October 2023. Phased implementation by Ofcom.

- **Section 9** — Duties about illegal content (all in-scope services).
- **Section 11** — Duties to protect children from harmful content (children-likely-to-access services).
- **Sections 33–39** — Duties on Category 1 services (largest user-to-user services).
- **Schedule 7** — Priority offences.
- **Category 1 threshold** (Online Safety Act 2023 (Category 1, Category 2A and Category 2B Threshold Conditions) Regulations 2025, `https://www.legislation.gov.uk/ukdsi/2025/9780348267174`): >34 million UK monthly active users AND content recommender system OR sharing of user-generated content with capacity to be encountered widely.

**Enforcement**: Ofcom. Maximum fines: **£18 million or 10% of qualifying worldwide revenue**, whichever greater (s.143).

**2nd-Brain analysis**: As a private journaling app (not user-to-user content sharing), 2nd-Brain is likely **out of scope** for Online Safety Act primary obligations IF it remains single-user reflection. Any social feature (sharing reflections with friends, public profiles) would put it in scope. Self-harm and suicide content protections (s.71, primary priority content for children) are notable: even private content shown back to a user (e.g., AI quoting their crisis-language journal entry) carries risk. Crisis classifier short-circuit (C9) handles this.

### 5.3 HCPC Protected Titles — Health Professions Order 2001

**URL**: `https://www.legislation.gov.uk/uksi/2002/254/contents`

- **Article 39(1)** — "A person commits an offence if, with intent to deceive (whether expressly or by implication), he — (a) falsely represents himself to be registered ...; (b) uses a title to which subsection (2) applies, ...; or (c) falsely represents himself to possess qualifications in a relevant profession."

**Seven protected psychology titles** (UK):
1. Clinical Psychologist
2. Health Psychologist
3. Counselling Psychologist
4. Educational Psychologist
5. Occupational Psychologist
6. Sport and Exercise Psychologist
7. Forensic Psychologist

**Plus generic** (for already-registered specialists): "Practitioner Psychologist", "Registered Psychologist".

**Penalty**: Criminal offence; fine up to **£5,000** (level 5 on the standard scale) per Article 39(2).

**Enforcement**: Health and Care Professions Council (HCPC). `https://www.hcpc-uk.org/`.

**Important UK quirk**: The bare term **"Psychologist"** (without specialty) is **NOT** itself a protected title — only the seven above + "Practitioner/Registered Psychologist" + the qualifications-misrepresentation theory. However, BPS (British Psychological Society) and HCPC consistently treat misleading use of "psychologist" alone as falling under Article 39(1)(a) "intent to deceive". **For 2nd-Brain**: do not use "psychologist" in UK marketing under any specialty form.

---

## 6. South Korea (대한민국)

### 6.1 의료법 (Medical Service Act) §27 — Prohibition of Unlicensed Medical Practice

**URL**: `https://www.law.go.kr/법령/의료법/제27조` and consolidated act at `https://www.law.go.kr/lsInfoP.do?lsId=001788` (국가법령정보센터).

**§27(1)** (paraphrased translation; consult official text):
> 의료인이 아니면 누구든지 의료행위를 할 수 없으며 의료인도 면허된 것 이외의 의료행위를 할 수 없다. ("No person other than a medical practitioner may engage in medical practice, and medical practitioners may not engage in medical practice beyond the scope of their license.")

**§27(3)** — Medical advertising restrictions.

**Penalties** (의료법 §87, §88): Unlicensed medical practice — up to **5 years imprisonment** or fine up to **KRW 50,000,000**.

**Definition of "medical practice" (의료행위)** — Korean Supreme Court interpretation (대법원 2002도6155 등): "Acts of disease prevention or treatment performed through medical knowledge or experience based on diagnosis, prescription, medication, or surgical operation, or acts that could cause harm to public health and sanitation if not performed by medical professionals."

**2nd-Brain analysis**: Korean enforcement (보건복지부, 식약처) has historically taken a broad view of "medical practice". Any framing of AI-generated reflections as "diagnosis", "treatment", "symptom analysis" could be interpreted as 무면허 의료행위. **Strict copy rule for KR**: no 진단(diagnosis), 치료(treatment), 처방(prescription), 처치, 의학적, 임상.

### 6.2 정신건강증진 및 정신질환자 복지서비스 지원에 관한 법률 (정신건강복지법, Mental Health Welfare Act)

**URL**: `https://www.law.go.kr/법령/정신건강증진및정신질환자복지서비스지원에관한법률`

**Effective**: Major revision 2017-05-30.

- **§2** — Definitions: 정신질환자 (person with mental illness), 정신건강전문요원 (mental health professional, includes 정신건강임상심리사 / 정신건강간호사 / 정신건강사회복지사 / 정신건강작업치료사).
- **§17** — Mental health professional credentials and scope.
- **§77** — Restrictions on opening mental-health-related facilities.

**Enforcement**: 보건복지부 (Ministry of Health and Welfare).

**2nd-Brain analysis**: 정신건강 in Korean carries clinical weight. Even though Korean lay usage of 정신건강 is broader (loosely "mental health/wellness"), regulators read it as clinical. Per CLAUDE.md vocabulary policy, 정신건강 is on the forbidden list — use 자기 이해, 성장 instead.

### 6.3 개인정보 보호법 (PIPA, Personal Information Protection Act)

**URL**: `https://www.law.go.kr/법령/개인정보보호법` (consolidated). Sequence ID: 195062.

- **§23** — Restrictions on processing of sensitive information (민감정보).
- **§23(1)** — A personal information controller must not process sensitive information unless: (1) it obtains separate consent from the data subject, distinct from consent for other personal information, after informing them of the matters set out in §15(2) or §17(2); OR (2) processing is required or permitted by other laws.
- **시행령 §18** (Enforcement Decree §18) defines sensitive information categories: 사상·신념, 노동조합/정당 가입·탈퇴, 정치적 견해, **건강(health)**, 성생활, 유전정보, 범죄경력자료, biometric data uniquely identifying a person, 인종·민족.
- **§39-3** (informational rights for children under 14).

**Penalties**: Up to 5 years imprisonment or KRW 50,000,000 fine for unlawful sensitive info processing (§71).

**Enforcement**: 개인정보보호위원회 (PIPC). `https://www.pipc.go.kr/`.

**2nd-Brain analysis**: Journal content → likely "건강 (health)" sensitive info → §23 separate consent required (not bundled with general consent). Cross-border transfer requires §28-8 (export) compliance: separate consent + safeguards. EU adequacy granted to Korea Dec 2021 (one-way to EEA), Korea recognised UK in 2024 — no formal adequacy to US; standard contractual mechanisms required.

### 6.4 인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 (AI Framework Act / AI 기본법)

**URL**: `https://www.law.go.kr/법령/인공지능발전과신뢰기반조성등에관한기본법` (Law No. 20676).

**Promulgated**: 2025-01-21. **Effective**: **2026-01-22** (most provisions). 디지털의료기기 관련 조항: 2026-01-24.

Key provisions:
- **§2** — Definitions: 인공지능, 고영향 인공지능 (high-impact AI), 생성형 인공지능 (generative AI).
- **§13** — Generative AI labeling: providers/users of generative AI must inform users that output is AI-generated.
- **§31~§35** (provisional numbering) — Obligations on **high-impact AI** in energy, healthcare (보건의료), nuclear, transport, **education**, biometrics, employment, and other domains affecting life/safety/fundamental rights.
- **§40~** — Penalties.

**시행령 (Enforcement Decree)** — Notice of legislation (입법예고) issued by 과학기술정보통신부 (MSIT) on 2025-11-12.

**Enforcement**: 과학기술정보통신부 (MSIT) primary; 개인정보보호위원회 for data overlap.

**2nd-Brain analysis**: Mandatory generative AI disclosure (§13) is straightforward. "High-impact AI" categorization is the open question — if 2nd-Brain is interpreted as 보건의료 or 교육 high-impact, full risk management/conformity obligations apply. Maintain self-knowledge framing to stay outside 보건의료 categorization.

### 6.5 심리사 자격 — Korean Counselor/Psychologist Licensing

Korea does **not** have a unified national psychologist license equivalent to US state licensure. Instead, multiple credentials exist:

- **정신건강임상심리사 1급/2급** — Mental Health Welfare Act §17 credential (state-issued).
- **임상심리사 1급/2급** (Clinical Psychologist) — 한국산업인력공단 national qualification.
- **상담심리사 1급/2급** (Counseling Psychologist) — 한국상담심리학회 (private, non-statutory).
- **전문상담사** — various private credentials.

**Title risk in Korea**: "임상심리사" and "정신건강임상심리사" are state-issued titles. Using them in marketing would trigger 의료법 §27 / 정신건강복지법 issues if combined with offering services. Generic terms 코치, 멘토, 자기 성장 are unrestricted.

---

## 7. Japan (日本)

### 7.1 個人情報保護法 (Act on the Protection of Personal Information, APPI)

**URL**: `https://laws.e-gov.go.jp/law/415AC0000000057` (e-Gov 法令検索).

**Original**: Act No. 57 of 2003. **Major amendments**: 2015, 2017, 2020 (effective April 2022), 2021 consolidation, 2024.

**Key provisions for 2nd-Brain**:

- **Art. 2(3)** — "Special-care-required personal information" (要配慮個人情報): includes race, creed, social status, medical history (病歴), criminal record, fact of having suffered damage by a crime, and other items prescribed by Cabinet Order (which include physical/mental disability, results of medical exams, and details of medical treatment by physicians).
- **Art. 20(2)** — Acquisition of special-care-required info requires **prior consent** of the data subject (with limited exceptions: laws/regulations, life/body/property protection, public health, government cooperation, etc.).
- **Art. 28** — Cross-border transfer (April 2022 amendments) requires: (a) consent after the data subject is informed of the recipient country's name, that country's data protection regime, and the protection measures the recipient implements; OR (b) the recipient is in an APPI-equivalent jurisdiction designated by the PPC (currently EEA and UK); OR (c) the recipient has set up a personal information protection system meeting standards specified by PPC rules and the transferor regularly monitors (PPC Q&A clarifies: at least annually) the recipient's continued compliance.

**Enforcement**: 個人情報保護委員会 (Personal Information Protection Commission, PPC). `https://www.ppc.go.jp/`.

**Penalty**: Up to 1 year imprisonment or fine up to JPY 1 million for individual; corporate fines up to JPY 100 million (since 2020 amendment).

**2nd-Brain analysis**: Mood/sleep/wellbeing journals MAY qualify as 要配慮個人情報 if they include 病歴 or 心身の機能の障害 details. Conservative posture: treat all journal content as special-care-required → prior consent required. Cross-border (transfer to Google's Gemini infrastructure outside Japan) → Art. 28 mechanism required: Japanese-language disclosure of US data regime + Google's safeguards.

### 7.2 公認心理師法 (Certified Public Psychologist Act)

**URL**: `https://laws.e-gov.go.jp/law/427AC1000000068` (e-Gov 法令検索).

**Effective**: Promulgated 2015-09-16 (Act No. 68 of 2015); registration system began Sept 2017.

- **Art. 2** — Definition of 公認心理師 (Certified Public Psychologist) — performs psychological assessment, support, advice, instruction, and education in healthcare, welfare, education, and other domains.
- **Art. 44(1)** — "公認心理師でない者は、公認心理師という名称を使用してはならない。" ("A person who is not a Certified Public Psychologist may not use the title '公認心理師'.")
- **Art. 44(2)** — "前項の規定にかかわらず、公認心理師でない者は、その名称中に心理師という文字を用いてはならない。" ("Notwithstanding the preceding paragraph, a person who is not a Certified Public Psychologist may not use the characters '心理師' in their title.")
- **Art. 49** — Penalty for Art. 44 violation: fine up to **JPY 300,000** (三十万円以下の罰金).

**Important**: This is a **name-exclusive qualification** (名称独占資格), NOT a practice-exclusive qualification. Unlicensed persons CAN provide psychological services so long as they do not use the protected title.

**2nd-Brain analysis**: Cannot use 心理師 anywhere in Japanese-language UI/marketing. Cannot use 公認心理師. Safe: 自己理解, 内省, 日記, セルフリフレクション, ジャーナリング.

### 7.3 Related Japanese Acts (advisory)

- **臨床心理士** — private credential of 日本臨床心理士資格認定協会, not statutory. Still risky to use without authorization.
- **AI Bill / AI Promotion Act (人工知能関連技術の研究開発及び活用の推進に関する法律)** — Act No. 47 of 2025, promulgated June 4, 2025, mostly soft-law framework (no direct penalties).

---

## 8. Canada

### 8.1 PIPEDA (Personal Information Protection and Electronic Documents Act, S.C. 2000, c.5)

**URL**: `https://laws-lois.justice.gc.ca/eng/acts/p-8.6/`

- **Section 5** + **Schedule 1** (CSA Model Code): 10 fair information principles (accountability, identifying purposes, consent, limiting collection, limiting use/disclosure/retention, accuracy, safeguards, openness, individual access, challenging compliance).
- **Section 6.1** — Definition of valid consent: "the consent of an individual is only valid if it is reasonable to expect that an individual to whom the organization's activities are directed would understand the nature, purpose and consequences of the collection, use or disclosure of the personal information to which they are consenting."
- **Section 7** — Collection, use, disclosure without knowledge or consent (limited).
- **PIPEDA Schedule 1, §4.3.6** — Sensitive information: "Some information (for example, medical records and income records) is almost always considered to be sensitive."

**Bill C-27 (Digital Charter Implementation Act)**: Tabled June 2022, **died on Order Paper January 2025** due to prorogation. Was to introduce: Consumer Privacy Protection Act (CPPA), Personal Information and Data Protection Tribunal Act, AIDA. Status as of May 2026: PIPEDA remains the federal law; AIDA never enacted. Monitor for re-tabling.

**Enforcement**: Office of the Privacy Commissioner of Canada (OPC). `https://www.priv.gc.ca/`.

### 8.2 Quebec Law 25 (formerly Bill 64, An Act to modernize legislative provisions as regards the protection of personal information)

**URL**: `https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1` (Act respecting the protection of personal information in the private sector).

**Effective phases**: Sept 2022, Sept 2023, **Sept 2024** (full).

- **§2** — Personal information definition.
- **§12** — Automated decision-making (post-Sept 2023): organization must inform individual no later than at time of decision; must, on request, allow individual to access info used, the principal factors and parameters, the right to have inaccurate info corrected, and the right to submit observations to a member of personnel able to review the decision.
- **§14** — Anonymization standards.
- **Sensitive personal information** — defined in §12.1 framework: information which, by its nature, in particular medical, biometric or otherwise intimate, or by the context of its use or communication, raises a heightened reasonable expectation of privacy. **Express consent** required for sensitive info (cf. §12(2)).

**Penalty**: Up to **CAD $25 million** or **4% of worldwide turnover** (whichever greater). Quebec uniquely has direct private cause of action.

**Enforcement**: Commission d'accès à l'information du Québec (CAI). `https://www.cai.gouv.qc.ca/`.

### 8.3 BC PIPA + Alberta PIPA

- **British Columbia Personal Information Protection Act, S.B.C. 2003, c.63**: `https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/03063_01`.
- **Alberta Personal Information Protection Act, S.A. 2003, c. P-6.5**: `https://www.canlii.org/en/ab/laws/stat/sa-2003-c-p-6.5/latest/`.

Both: substantially similar to PIPEDA; cover private-sector in their provinces (PIPEDA does not apply intraprovincially in BC/AB/QC).

### 8.4 Psychology Title Protection — Provincial

Each province regulates psychology independently. Representative:

- **Ontario — Psychology Act, 1991, S.O. 1991, c. 38**: `https://www.ontario.ca/laws/statute/91p38`. Section 8 — "Restricted titles": "No person other than a member shall use the title 'psychologist' or 'psychological associate', a variation or abbreviation or an equivalent in another language." Section 9 — "Holding out": no person other than a member shall hold themselves out as qualified to practise in Ontario as a psychologist or psychological associate. Enforcement: College of Psychologists and Behaviour Analysts of Ontario (CPBAO). Schedule 4 of an enacting statute replaces "Psychology Act, 1991" with "Psychology and Applied Behaviour Analysis Act, 2021" once fully proclaimed.
- **Quebec — Professional Code (R.S.Q., c. C-26)** + Ordre des psychologues du Québec.

---

## 9. Australia

### 9.1 Privacy Act 1988 (Cth)

**URL**: `https://www.legislation.gov.au/Series/C2004A03712` (current compilation).

- **Section 6** — Definitions, including "sensitive information": "information or an opinion about an individual's racial or ethnic origin; political opinions; membership of a political association; religious beliefs or affiliations; philosophical beliefs; membership of a professional or trade association; membership of a trade union; sexual orientation or practices; criminal record; **that is also personal information; health information about an individual; genetic information about an individual that is not otherwise health information; biometric information that is to be used for the purpose of automated biometric verification or biometric identification; biometric templates**".
- **Schedule 1 — Australian Privacy Principles (APPs)**:
  - **APP 3.3** — Sensitive information must not be collected unless: (a) individual consents AND collection is reasonably necessary for one or more entity's functions/activities; OR various other exceptions.
  - **APP 5** — Notification of collection.
  - **APP 6** — Use or disclosure only for primary purpose unless exception applies.
  - **APP 11** — Security; obligation to take reasonable steps.

**Coverage**: APPs apply to "APP entities": Australian government agencies, and private-sector organizations with **annual turnover ≥ AUD $3 million** (small business operator exception, s.6D). However, **organizations that provide a health service AND hold health information** are APP entities **regardless of turnover** (s.6D(4)(b)). **2nd-Brain caveat**: if AU enforcement considers a journaling app to "provide a health service", small-business exemption is lost.

**Notifiable Data Breaches scheme** (Part IIIC, ss.26WA–26WT): mandatory notification of "eligible data breaches" likely to result in serious harm. Must notify OAIC and affected individuals "as soon as practicable" after becoming aware.

**Penalty (post-2022 Privacy Legislation Amendment Act)**: Up to greater of **AUD $50 million**, 3× benefit gained, or 30% of adjusted turnover during breach period.

**Enforcement**: Office of the Australian Information Commissioner (OAIC). `https://www.oaic.gov.au/`.

**Privacy Act review and reform 2024–2026**: First tranche of reforms (Privacy and Other Legislation Amendment Act 2024) enacted; second tranche under consultation. Monitor for further changes affecting small business and AI.

### 9.2 AHPRA + Psychology Board of Australia — Title Protection

**Statute**: Health Practitioner Regulation National Law (each State/Territory adopts via local enactment, e.g., Queensland's Health Practitioner Regulation National Law Act 2009).

- **Section 113 (National Law)** — Protected titles: "psychologist" is a protected title nationally. Use without registration is an offence.
- **Section 116 (National Law)** — Holding out as registered: offence.

**Penalty** (s.113): Maximum **AUD $30,000** for individuals; **AUD $60,000** for body corporates (varies slightly by state implementation).

**Enforcement**: Australian Health Practitioner Regulation Agency (AHPRA) + Psychology Board of Australia. `https://www.psychologyboard.gov.au/`.

**2nd-Brain analysis**: "Psychologist" is fully protected nationally. "Therapist" alone is not nationally protected but specific titles "counsellor" / "psychotherapist" are also unregulated at federal level (the gap is real but treated as a separate enforcement category — see AHPRA's 2020-02-26 statement on misuse of protected titles).

---

## 10. Universal Compliance Principles (Comparison Matrices)

### 10.1 Title Protection Matrix

| Jurisdiction | "Psychologist" protected? | "Therapist" protected? | "Counselor/Counsellor" protected? | Statutory authority |
|---|---|---|---|---|
| EU (varies by Member State) | Yes (varies) | Sometimes | Sometimes | Member State law |
| US — California | **Yes** (+ "psychotherapist", "psychometric", "psychoanalyst") | "Psychotherapist" yes | LMFT, LPCC titles protected separately | Bus. & Prof. §2902 |
| US — New York | **Yes** | LMSW/LCSW for social work; "psychotherapist" not standalone | LMHC protected | Edu. Law §7601 |
| US — Texas | **Yes** | LPC/LMFT protected separately | "Licensed Professional Counselor" protected | Occ. Code §501.251 |
| US — Florida | **Yes** (+ "psychodiagnostic", "school psychologist") | LMFT/LMHC protected | "Mental health counselor" protected | Fla. Stat. §490.012 |
| US — Illinois | **Yes** (clinical psychologist title) | LCPC protected | LPC/LCPC protected | 225 ILCS 15/5 |
| UK | Specialty titles protected; "psychologist" alone is grey | Not protected | Not protected | Health Professions Order 2001, Art. 39 |
| South Korea | "정신건강임상심리사", "공인심리사"-equivalent KR titles statutory; "심리상담사" private | Not statutory | "전문상담교사" yes; private elsewhere | 정신건강복지법 §17 |
| Japan | **Yes** — "心理師" any usage banned without 公認心理師 credential | Not protected | "臨床心理士" private but defended | 公認心理師法 §44 |
| Canada (provincial) | **Yes** in all provinces | Varies (e.g., Quebec yes via psychotherapist permit) | Varies | Provincial acts |
| Australia | **Yes** nationally | Not nationally | Not nationally | National Law s.113 |

**Universal rule for 2nd-Brain copy**: Default ban on "psychologist", "psychotherapist", "therapist", "counselor/counsellor", and language-equivalents in every locale.

### 10.2 Sensitive Data Consent Requirement Matrix

| Jurisdiction | Mental/health journal data is "sensitive"? | Consent type required | Citation |
|---|---|---|---|
| EU (GDPR) | Yes — "data concerning health" Art. 4(15), 9(1) | **Explicit consent** (Art. 9(2)(a)), separate from general consent | Reg. 2016/679 |
| UK | Yes — same as EU; UK GDPR + DPA 2018 Sch. 1 | Explicit consent + DPA Sch. 1 condition | DPA 2018 |
| US — federal | Yes in practice (FTC + state CHD laws) | "Affirmative express consent" (FTC norm, BetterHelp consent decree) | 15 U.S.C. §45; 16 CFR Part 318 |
| US — Washington | Yes — MHMDA "consumer health data" | Express opt-in consent | RCW 19.373 |
| South Korea | Yes — 민감정보 (§23 PIPA, 시행령 §18 "건강") | **Separate consent** from general processing | 개인정보 보호법 §23 |
| Japan | Likely yes — 要配慮個人情報 (Art. 2(3) APPI) | **Prior consent** (Art. 20(2)) | APPI |
| Canada (PIPEDA) | Yes — sensitive per Sch. 1 §4.3.6 | Express, opt-in (heightened "form of consent" — Sch. 1 §4.3.6) | PIPEDA |
| Canada (Quebec L25) | Yes — sensitive by nature (medical/intimate) | **Express consent** for sensitive | Act §12.1 |
| Australia | Yes — "sensitive information" + "health information" (s.6) | Consent + reasonably necessary (APP 3.3) | Privacy Act 1988 |

### 10.3 Cross-Border Transfer Mechanism Matrix

| From | To USA (Google Gemini etc.) | Mechanism |
|---|---|---|
| EU/EEA | No adequacy decision broadly; EU–US Data Privacy Framework for self-certified US importers | DPF, SCCs, BCRs, or derogations (Art. 49 — explicit consent for occasional transfer) |
| UK | UK Extension to EU–US DPF; UK IDTA; UK addendum to SCCs | DPF, IDTA, UK addendum |
| Switzerland | Swiss–US DPF | DPF or SCCs |
| South Korea | No adequacy to US | Separate consent under §28-8 PIPA + contract |
| Japan | No adequacy to US | Art. 28 mechanism: consent + disclosures, OR system equivalent to APPI |
| Canada (federal) | "Comparable level of protection" via contract (PIPEDA principle of accountability) | Contract + accountability |
| Canada (Quebec L25) | "Privacy impact assessment" + adequate protection in destination state | PIA + contract |
| Australia | APP 8 — must take reasonable steps to ensure overseas recipient does not breach APPs OR get consent | APP 8 |

### 10.4 Health vs. Wellness App Distinction (Recurring Test)

| Factor | Health/medical (regulated) | Wellness (2nd-Brain target zone) |
|---|---|---|
| **Marketing claims** | "Diagnose anxiety", "treat depression", "improve symptoms" | "Understand your habits", "reflect on your week", "track your journal" |
| **AI outputs** | "You have moderate depression (PHQ-9 score: X)" | "You wrote about work pressure this week" |
| **Provider relationship** | Connected to licensed clinicians | No provider relationship; not connected to clinicians |
| **HIPAA covered entity** | Often yes | No (2nd-Brain) |
| **FDA / regulator scrutiny** | Software as Medical Device (SaMD) — FDA, MHRA, PMDA classification | Generally outside SaMD |
| **Diagnostic claims** | Allowed within scope | **PROHIBITED** for 2nd-Brain |
| **Crisis routing** | In-app intervention | **Immediate redirect to professional / hotlines (988, 1393, Samaritans)** |

---

## 11. Open Questions for Legal Counsel

These are questions Simon should pose to actual lawyers (one EU/UK, one US, one KR, one JP, one AU/CA) before launch:

1. **GDPR Art. 9 legal basis**: Is "explicit consent under Art. 9(2)(a)" the appropriate sole basis for processing journal content in 2nd-Brain, or do we need a layered approach (general 6(1)(a) + 9(2)(a))? How does this interact with Art. 22 automated decision-making safeguards when Gemini produces reflections?
2. **DPIA template**: Will counsel review a draft DPIA tailored to 2nd-Brain (Art. 35 GDPR + ICO methodology)?
3. **EU AI Act Art. 50**: What disclosure phrasing satisfies "clear and distinguishable manner at the latest at the time of the first interaction or exposure" given our onboarding flow?
4. **Synthetic content marking (Art. 50(2))**: Is C2PA tagging of Gemini-generated text feasible, and does our implementation satisfy "machine-readable format and detectable"?
5. **Avoiding Annex III §1(c)**: Where is the line between "reflecting themes" (acceptable) and "inferring emotions" (high-risk under Annex III)? Need a written boundary test.
6. **US state consumer health data laws**: Are we a "consumer health data" controller under WA MHMDA, NV SB 370, CT amendments? If yes, what additional rights notice and consent flow are needed in those states?
7. **FTC Section 5 unfairness exposure** (BetterHelp doctrine): Even with explicit consent, does failure to maintain documented privacy training/policies create unfairness liability?
8. **Korean cross-border (§28-8 PIPA)**: Specific language for separate Gemini cross-border consent in Korean, and adequacy of Google's stated safeguards.
9. **Japan APPI Art. 28**: Does Google's standard data processing agreement satisfy "regularly monitor" requirement for APPI-equivalent recipient system?
10. **Title protection — comprehensive translation review**: Native-speaker legal review of all marketing/UI strings in EN/KO/JA/FR/DE/ES against psychologist/therapist/counselor protected lists.
11. **Crisis short-circuit (C9) liability**: When 2nd-Brain detects red-zone content and redirects to a hotline, what is the carrier-style "knowledge of crisis" exposure if the hotline call fails or is misrouted? Documented failover SLA?
12. **Minor age verification (C10)**: Does our birth_date ≥ 18 self-declaration satisfy COPPA / UK Age-Appropriate Design Code / Korea PIPA §39-3 / Australia AAP requirements, or is a stronger verification needed in any jurisdiction?
13. **Quebec L25 §12 — automated decision rights**: How specifically must our "explain this reflection" feature be implemented to meet §12(2) rights of access, correction, and observation submission?
14. **Online Safety Act (UK)**: If we add any social/sharing feature in future, where is the line for "user-to-user service" triggering ss.9–11 duties?
15. **Korean AI Framework Act high-impact**: Pre-binding written opinion from MSIT confirming 2nd-Brain is NOT 고영향 인공지능 in 보건의료 / 교육 categories.

---

## 12. Forbidden Lexicon Implications (input to `src/lib/safety/lexicon.ts`)

Current `lexicon.ts` forbidden list (per CLAUDE.md): "mental health, therapy, counseling, diagnosis, treatment, healing, cure, 정신건강, 심리치료, 심리상담, 치유".

**Recommended additions by jurisdiction**:

### English (US/UK/AU/CA)

- `psychologist` — protected (all US states, UK specialty, AU, CA provinces)
- `psychological` — protected (CA §2902, NY §7601, FL §490.012, IL 225 ILCS 15/5)
- `psychotherapy`, `psychotherapist` — protected (CA, FL via §490)
- `psychoanalysis`, `psychoanalyst` — protected (CA §2902)
- `psychometric`, `psychometry`, `psychometrist` — protected (CA §2902)
- `psychodiagnostic` — protected (FL §490.012)
- `clinical psychologist` — protected (IL 225 ILCS 15/5; CA, NY, TX)
- `therapist` — risky in CA/NY/FL/TX/IL/AU/CA when combined with service offers
- `counselor`, `counsellor` — protected when scoped to "professional counselor" / "mental health counselor" in CA, NY, TX, FL, IL
- `diagnose`, `diagnosis`, `diagnostic` — clinical claim; FTC unfair/deceptive risk
- `treat`, `treatment` — clinical claim
- `cure`, `heal`, `healing` — clinical claim; FTC risk
- `prescribe`, `prescription`, `medication` — medical practice claim
- `symptom` — clinical framing; risky
- `disorder`, `condition`, `illness`, `disease` — clinical framing
- `patient` — implies provider relationship; risky
- `clinical`, `clinically` — clinical claim
- `HIPAA-compliant`, `HIPAA-protected` — FTC deception risk (BetterHelp)

### Korean (KR)

- `심리사` — base radical of all Korean psychologist titles
- `공인심리사` — direct analog of 公認心理師
- `임상심리사` — credentialed title (산업인력공단)
- `정신건강임상심리사` — 정신건강복지법 §17 statutory title
- `정신건강전문요원` — 정신건강복지법 statutory category
- `상담심리사` — 상담심리학회 credential
- `상담사` — when combined with 심리 or 정신
- `치료사` — implies licensed practitioner
- `진단`, `진료`, `처방`, `처치` — medical practice (의료법 §27)
- `심리치료`, `심리상담` — already forbidden ✅
- `정신건강`, `정신질환`, `정신과` — clinical
- `치유` — already forbidden ✅
- `의학적`, `임상`, `임상적` — medical/clinical

### Japanese (JP)

- `心理師` — Art. 44(2) 公認心理師法 ALL usage banned
- `公認心理師` — Art. 44(1)
- `臨床心理士` — private but defended credential
- `カウンセラー` — combined with 心理 / 精神 → risky
- `セラピスト` — when combined with 心理
- `診断`, `診察`, `治療`, `処方` — clinical
- `精神` (combined with 健康/疾患/科) — clinical framing
- `症状`, `障害`, `疾患` — clinical

### Tier 1 / Tier 2 / Tier 3 enforcement levels

- **Tier 1 (hard ban — CI fails the build)**: psychologist, psychotherapist, psychometric, psychoanalyst, 심리사, 임상심리사, 정신건강임상심리사, 心理師, 公認心理師, 臨床心理士, diagnose, treat, cure, heal, 진단, 치료, 治療, 診断, HIPAA-compliant.
- **Tier 2 (warn — requires human review on PR)**: therapist, counselor, counsellor, セラピスト, カウンセラー, clinical, patient, symptom, disorder.
- **Tier 3 (advisory — log occurrence)**: wellness, mental, mind, emotional, 감정, 마음, 心.

---

## 13. Sources

### EU
- EU AI Act consolidated text: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
- EU AI Act Service Desk: https://ai-act-service-desk.ec.europa.eu/en/ai-act
- EU AI Act implementation timeline: https://artificialintelligenceact.eu/implementation-timeline/
- AI Act Article 5 (Prohibited): https://artificialintelligenceact.eu/article/5/
- AI Act Article 50: https://artificialintelligenceact.eu/article/50/
- AI Act Article 99: https://artificialintelligenceact.eu/article/99/
- AI Act Annex III: https://artificialintelligenceact.eu/annex/3/
- GDPR consolidated text: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- GDPR Article 9: https://gdpr-info.eu/art-9-gdpr/
- GDPR Article 22: https://gdpr-info.eu/art-22-gdpr/
- GDPR Article 35: https://gdpr-info.eu/art-35-gdpr/
- GDPR Recital 75: https://gdpr-info.eu/recitals/no-75/
- EDPB: https://www.edpb.europa.eu/

### US Federal
- FTC Act §5: https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act
- FTC v. BetterHelp: https://www.ftc.gov/legal-library/browse/cases-proceedings/2023169-betterhelp-inc-matter
- FTC BetterHelp press release: https://www.ftc.gov/news-events/news/press-releases/2023/03/ftc-ban-betterhelp-revealing-consumers-data-including-sensitive-mental-health-information-facebook
- FTC Health Breach Notification Rule: https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule
- 16 CFR Part 318 (eCFR): https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-318
- 2024 HBNR Federal Register: https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule
- FTC AI Compliance Plan: https://www.ftc.gov/ai
- FTC AI Chatbot Inquiry (Sept 2025): https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-launches-inquiry-ai-chatbots-acting-companions
- FTC Operation AI Comply (2024): https://www.ftc.gov/business-guidance/blog/2024/09/operation-ai-comply-continuing-crackdown-overpromises-ai-related-lies

### US State Psychology Acts
- California Bus. & Prof. Code §2900 et seq.: https://leginfo.legislature.ca.gov/faces/codes_displayexpandedbranch.xhtml?tocCode=BPC&division=2.&title=&part=&chapter=6.6.
- New York Education Law Article 153: https://www.nysenate.gov/legislation/laws/EDN/A153
- NYSED psychology law page: https://www.op.nysed.gov/professions/psychology/laws-rules-regulations/article-153
- Texas Occupations Code Ch. 501: https://statutes.capitol.texas.gov/Docs/OC/htm/OC.501.htm
- Florida Statutes Ch. 490: https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0400-0499/0490/0490.html
- Illinois 225 ILCS 15: https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=1294&ChapterID=24

### US State Consumer Health Data
- Washington MHMDA: https://app.leg.wa.gov/RCW/default.aspx?cite=19.373
- Nevada SB 370 (NRS 603A.450+): https://www.leg.state.nv.us/

### UK
- UK GDPR / Data Protection Act 2018: https://www.legislation.gov.uk/ukpga/2018/12/contents
- ICO Guidance on AI and Data Protection: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/
- Online Safety Act 2023: https://www.legislation.gov.uk/ukpga/2023/50
- Online Safety Act 2023 Category 1/2A/2B Threshold Conditions Regulations 2025: https://www.legislation.gov.uk/ukdsi/2025/9780348267174
- Health Professions Order 2001: https://www.legislation.gov.uk/uksi/2002/254/contents
- HCPC protected titles: https://www.hcpc-uk.org/about-us/who-we-regulate/the-professions/

### South Korea
- 의료법 §27: https://www.law.go.kr/법령/의료법/제27조
- 정신건강복지법: https://www.law.go.kr/법령/정신건강증진및정신질환자복지서비스지원에관한법률
- 개인정보 보호법: https://www.law.go.kr/lsEfInfoP.do?lsiSeq=195062
- 개인정보 보호법 §23: https://www.law.go.kr/법령/개인정보보호법/제23조
- AI 기본법 (인공지능 발전과 신뢰 기반 조성 등에 관한 기본법): https://www.law.go.kr/lsInfoP.do?lsiSeq=268543
- 개인정보보호위원회: https://www.pipc.go.kr/

### Japan
- APPI (個人情報保護法): https://laws.e-gov.go.jp/law/415AC0000000057
- 公認心理師法: https://laws.e-gov.go.jp/law/427AC1000000068
- PPC (個人情報保護委員会): https://www.ppc.go.jp/
- AI Promotion Act (人工知能関連技術の研究開発及び活用の推進に関する法律, Act No. 47/2025): https://laws.e-gov.go.jp/

### Canada
- PIPEDA: https://laws-lois.justice.gc.ca/eng/acts/p-8.6/
- Quebec Act (P-39.1): https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1
- Ontario Psychology Act, 1991: https://www.ontario.ca/laws/statute/91p38
- Office of the Privacy Commissioner: https://www.priv.gc.ca/
- Commission d'accès à l'information du Québec: https://www.cai.gouv.qc.ca/
- BC PIPA: https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/03063_01
- Alberta PIPA: https://www.canlii.org/en/ab/laws/stat/sa-2003-c-p-6.5/latest/
- Bill C-27 (historical, died Jan 2025): https://www.parl.ca/legisinfo/en/bill/44-1/c-27
- AIDA companion document: https://ised-isde.canada.ca/site/innovation-better-canada/en/artificial-intelligence-and-data-act-aida-companion-document

### Australia
- Privacy Act 1988 (Cth): https://www.legislation.gov.au/Series/C2004A03712
- OAIC: https://www.oaic.gov.au/
- Australian Privacy Principles guidance: https://www.oaic.gov.au/privacy/australian-privacy-principles
- AHPRA: https://www.ahpra.gov.au/
- Psychology Board of Australia: https://www.psychologyboard.gov.au/
- AHPRA statement on misuse of protected titles (2020-02-26): https://www.ahpra.gov.au/News/2020-02-26-statement-on-misuse-of-protected-titles.aspx

---

**End of Reference Document**

**Maintenance**: When any cited law is amended, update the relevant section and re-run `npm run check:constraints` to ensure 2nd-Brain configuration (lexicon, consent flows, DPIA) still aligns. Material amendments to track: EU AI Act secondary legislation; FTC AI Policy Statement (due March 11, 2026); UK Online Safety Act Ofcom code rollout; Korean AI 기본법 시행령 (effective 2026-01-22); Australian Privacy Act second-tranche reforms; any successor bill to Canadian Bill C-27.
