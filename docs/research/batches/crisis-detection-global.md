# Framework: Crisis Detection & Routing — Global Extension (Engine 7, Locale Router)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026). All hotline numbers and policy URLs verified against the operating organisation's official site or the issuing government's official channel (May 2026).
>
> **Cross-reference**: `crisis-detection.md` (Korean policy + Western standard tools + LLM capability/limits) is the canonical batch. **This batch does NOT replace it.** It extends only the **locale-routing layer** for 2nd-Brain's global launch (v0.2). Detection logic, classifier scaffolding, and Korean RED-zone copy remain governed by `crisis-detection.md`. Routing differs per locale; this batch enumerates the per-locale resources, the legal/policy context, and the cross-cultural evidence on disclosure norms.
>
> **Trust score contribution**: closes the audit gap "Engine 7 routes only to Korean hotlines" by establishing DOI-grade evidence + official-source URLs for US, EU, UK, JP, CA, AU resources, plus an academic basis for cross-cultural variation in crisis disclosure that the classifier must respect.

## AI Retrieval Guide (for RAG / Wiki use)

**When user input or locale signal is** → **look here**:
- User locale = US → §US infrastructure (988 + Veterans Crisis Line + Crisis Text Line + Trevor Project) + §Routing Decision Tree
- User locale = UK → §UK Samaritans + §UK Online Safety Act 2023 (legal context for what 2nd-Brain must NOT publish to UK users)
- User locale = EU (DE/FR/IT/ES/…) → §EU 116-123 + country-specific lines + §EU Decision 2007/116/EC
- User locale = JP → §Japan (Inochi no Denwa + Yorisoi Hotline + 2017 General Principles)
- User locale = CA → §Canada (988 CA / Talk Suicide Canada + Kids Help Phone)
- User locale = AU → §Australia (Lifeline 13 11 14 + Kids Helpline + Beyond Blue)
- User locale = KR → see `crisis-detection.md` (canonical Korean protocol; do NOT duplicate here)
- User locale unknown / detection failed → §Default International Fallback (never skip, never English-only deflect)
- "How accurate is C-SSRS in non-English populations?" → §Cross-cultural validation (Austria-Corrales 2023 ES, Ji 2023 ZH, ISPOR 33-country translation programme)
- "Are there papers benchmarking LLM crisis response in non-English?" → §Multilingual LLM crisis response (Cui 2025 ZH, Pendse 2022 decolonial framing, Heston 2025 risk progression)
- "What does the UK Online Safety Act require?" → §UK Online Safety Act 2023 + Ofcom illegal-harms codes (Dec 2024)
- "What's the legal status of 116-123 as a number in EU member states?" → §EU Decision 2007/116/EC
- "Why must crisis copy be in user's language, not English?" → §Cautions (localisation is not optional)

## Foundational Sources — Academic basis for cross-cultural crisis screening

1. Posner, K., Brown, G. K., Stanley, B., Brent, D. A., Yershova, K. V., Oquendo, M. A., Currier, G. W., Melvin, G. A., Greenhill, L., Shen, S., & Mann, J. J. (2011). The Columbia-Suicide Severity Rating Scale: Initial validity and internal consistency findings from three multisite studies with adolescents and adults. *American Journal of Psychiatry*, 168(12), 1266–1277. DOI: https://doi.org/10.1176/appi.ajp.2011.10111704
   - The standard suicide risk assessment worldwide. Already cited in `crisis-detection.md` §Foundational Sources — repeated here as the anchor for the cross-cultural validation chain below.

2. Bryan, C. J., Rudd, M. D., Wertenberger, E., Etienne, N., Ray-Sannerud, B. N., Morrow, C. E., Peterson, A. L., & Young-McCaughon, S. (2014). Improving the detection and prediction of suicidal behavior among military personnel by measuring suicidal beliefs: An evaluation of the Suicide Cognitions Scale. *Journal of Affective Disorders*, 159, 15–22. DOI: https://doi.org/10.1016/j.jad.2014.02.021
   - Suicide-specific beliefs (unbearability, unlovability) measured by the Suicide Cognitions Scale (SCS) **predicted suicidal behavior beyond what ideation-only screens captured**, in two US active-duty military samples. Critical for 2nd-Brain because it shows the **cognitive content** of suicidal beliefs (not just verbal ideation) is detectable in language — a hook for NLP feature design beyond simple ideation keywords.

3. Rudd, M. D., & Bryan, C. J. (2021). The Brief Suicide Cognitions Scale: Development and clinical application. *Frontiers in Psychiatry*, 12, 737393. DOI: https://doi.org/10.3389/fpsyt.2021.737393
   - The **9-item Brief SCS** — public derivation, predicts attempts and deaths. Operational implication: a journal entry containing strong unbearability ("I can't take this anymore") or unlovability ("nobody would miss me") cognitions should weight RED-zone classification independently of explicit ideation keywords.

4. Simon, G. E., Rutter, C. M., Peterson, D., Oliver, M., Whiteside, U., Operskalski, B., & Ludman, E. J. (2013). Does response on the PHQ-9 Depression Questionnaire predict subsequent suicide attempt or suicide death? *Psychiatric Services*, 64(12), 1195–1202. DOI: https://doi.org/10.1176/appi.ps.201200587
   - Large prospective cohort (Group Health, N≈84,000). **PHQ-9 item 9** ("thoughts that you would be better off dead, or of hurting yourself") response level predicted attempts and suicide deaths over 1 year. Strong predictor — but item-9 alone has high false-positive rate (specificity ~66%). For 2nd-Brain: useful as a single high-recall gate, but cannot be the sole RED signal.

## Cross-cultural validation of C-SSRS (non-Korean)

5. Austria-Corrales, F., Cabrera-Ruiz, E., Salinas-Escudero, G., Mendieta-Cabrera, D., Heinze-Martin, G., et al. (2023). The Columbia-suicide severity rating scale: Validity and psychometric properties of an online Spanish-language version in a Mexican population sample. *Frontiers in Public Health*, 11, 1157581. DOI: https://doi.org/10.3389/fpubh.2023.1157581
   - N=3,645 Mexican adults. Cronbach's α=0.814; unidimensional; three risk levels (low/medium/high) reproduced from English original. **Establishes that C-SSRS structure transfers to Spanish-language self-report online** — direct relevance to 2nd-Brain Spanish-locale routing if expanded beyond EN/KO.

6. Ji, Y., et al. (2023). Validation and application of the Chinese version of the Columbia-Suicide Severity Rating Scale: Suicidality and cognitive deficits in patients with major depressive disorder. *Journal of Affective Disorders*, 343, 47–55. DOI: https://doi.org/10.1016/j.jad.2023.09.014
   - Chinese-version C-SSRS validated in MDD inpatients. **Cross-cultural reliability of the scale's structure is established for the largest non-Latin script population the scale serves.** Provides evidence that the C-SSRS framework — and therefore the classification logic 2nd-Brain inherits from it — is not inherently English-bound.

7. Mundt, J. C., Greist, J. H., Gelenberg, A. J., Katzelnick, D. J., Jefferson, J. W., & Modell, J. G. (2010). Feasibility and validation of a computer-automated Columbia-Suicide Severity Rating Scale using interactive voice response technology. *Journal of Psychiatric Research*, 44(16), 1224–1228. DOI: https://doi.org/10.1016/j.jpsychires.2010.04.025
   - Early evidence (cited widely in subsequent validations) that **automated administration of C-SSRS produces results comparable to clinician-administered** — supports the principle that machine-mediated screening, **followed by human routing**, is methodologically defensible. Does not authorise machine-mediated *treatment*.

## US — Crisis Infrastructure

8. SAMHSA. (2022). *988 Suicide & Crisis Lifeline — National launch July 16, 2022*. US Substance Abuse and Mental Health Services Administration. Official URL: https://www.samhsa.gov/mental-health/988 · Service URL: https://988lifeline.org
   - On 2022-07-16, the 10-digit 1-800-273-8255 Lifeline transitioned to the 3-digit **988**. The original number remains routed to the same service. SAMHSA administers via cooperative agreement; ~200 local crisis centers operate the call/text/chat. **For US-locale 2nd-Brain users, this is the primary routing target.** SAMHSA is the authoritative policy source; the FCC implemented number-portability requirements via the National Suicide Hotline Designation Act (Public Law 116-172, 2020).

9. US Department of Veterans Affairs. (2022). *Veterans Crisis Line — Dial 988 then Press 1*. Official URL: https://www.veteranscrisisline.net
   - Launched 2022-07-16 alongside 988. Phone: **988 then press 1** · Text: **838255** · Chat: veteranscrisisline.net/get-help-now/chat. Open to all service members, veterans, and family — not limited to VA-enrolled veterans. **2nd-Brain US-locale routing should surface this as a secondary option when the user discloses military/veteran context, but never auto-detect; let the user opt in.**

10. Crisis Text Line. (2013–present). *Text HOME to 741741*. Official URL: https://www.crisistextline.org
    - Founded 2013 (Nancy Lublin). Text-based crisis support 24/7 in US, Canada, UK, Ireland. **Critical for users who cannot speak aloud safely** (abusive home environments; non-verbal preference; deaf/hard-of-hearing). 2nd-Brain US RED-zone copy already references "HOME to 741741" — this batch confirms it as a primary tier-1 route, not a fallback.

11. The Trevor Project. (1998–present). *LGBTQ+ youth crisis services — 1-866-488-7386 (TrevorLifeline) · text START to 678-678 · chat at thetrevorproject.org*. Official URL: https://www.thetrevorproject.org
    - 24/7, free, confidential, specifically trained on LGBTQ+ youth issues (age <25). **2nd-Brain MUST NOT auto-route users to Trevor Project based on inferred sexuality/gender identity** (violates `crisis-detection.md` §0 Hard Rule 3 and `data-ethics-consent.md`). May surface Trevor Project as **one option among several** in a US RED-zone message; user self-selects.

## EU — 116-123 Pan-European Emotional Support Helpline

12. European Commission. (2007). *Decision 2007/116/EC of 15 February 2007 on reserving the national numbering range beginning with '116' for harmonised numbers for harmonised services of social value* (notified under document number C(2007) 249). CELEX: 32007D0116. Official URL: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32007D0116 · Consolidated 2023 version (CELEX: 02007D0116-20230306) tracks subsequent amendments.
    - The Commission Decision that **legally reserved 116-xxx as harmonised numbers across all Member States**. Initial allocations: **116000 (missing children), 116111 (child helplines), 116123 (emotional support helplines)**. Member States were required to enable assignment from 2007-08-31. For 2nd-Brain EU-locale routing, this is the **only number that is guaranteed to route locally to a national emotional-support service across all 27 Member States** — which is precisely why it is the EU-default in the routing tree.

13. Samaritans (UK & Ireland). *Free 24/7 emotional support — 116 123*. Official URL: https://www.samaritans.org · 116 123 launch announcement: https://www.samaritans.org/news/samaritans-launches-new-free-helpline-number-uk/
    - Founded 1953 (Rev. Chad Varah, London). The UK's primary emotional-support charity; 200+ branches; 24/7; calls do not appear on phone bills. Samaritans operates the **UK side of the 116-123 harmonised number**. **Use 116 123 for UK routing, not the older 08457 number** (the older number was retired for new routing).

14. TelefonSeelsorge Deutschland. *24/7 telephone & chat counselling — 0800 111 0 111, 0800 111 0 222, 116 123*. Official URL: https://www.telefonseelsorge.de
    - Operated jointly by the Protestant and Catholic churches in Germany. ~7,500 trained volunteers. **Free, anonymous, confidential, no religious requirement.** Both 0800-prefixed numbers and 116-123 reach the service. For German-locale routing, both should be shown; the 0800 numbers are more recognised to older German users.

15. S.O.S Amitié France. *24/7 emotional support phone — 09 72 39 40 50*. Official URL: https://www.sosamitie.org
    - Federation of 45 regional associations, 2,000+ volunteer listeners. Founded 1961. Phone 24/7; chat 13:00–03:00; email response within 48h. Recognised by French government as serving suicide-prevention public interest. **For French-locale routing, surface this as the primary emotional-support line; 116-123 is also valid but SOS Amitié is the established cultural anchor.**

16. Telefono Amico Italia. *Emotional support — 02 2327 2327 (daily 09:00–24:00) · WhatsApp 345 0361628*. Official URL: https://www.telefonoamico.it
    - Founded 1967. **Not 24/7** — closes overnight. For Italian-locale routing, surface 116-123 as the 24/7 backup and Telefono Amico as the cultural anchor during operating hours.

## UK — Online Safety Act 2023 (regulatory context for 2nd-Brain content)

17. UK Government. (2023). *Online Safety Act 2023*. UK Public General Acts c. 50. Official URL: https://www.legislation.gov.uk/ukpga/2023/50/contents
    - Sets statutory duties on user-to-user (U2U) and search services regarding illegal and harmful content. **Relevant sections for 2nd-Brain**:
      - **Sections 9–11** (services likely to be accessed by children): illegal-content risk assessments + safety duties. 2nd-Brain is 18+ (Blueprint C10), so children's duties **do not directly apply**, but the Act treats age verification as a duty to evidence the 18+ gate.
      - **Section 184 / Schedule 7 (priority offences)**: encouraging or assisting suicide is a Priority Offence; providers must proactively reduce risk. Subsequently (December 2025), the UK created two new Priority Offences via the *Online Safety Act 2023 (Priority Offences) (Amendment) Regulations 2025*: **encouraging or assisting serious self-harm**, and **cyberflashing**. Ofcom (the regulator) has signalled it will treat suicide and self-harm as a combined illegal-harm category.
      - **Section 64**: the section number "64" varies across the Act's structure; the **priority-offences mechanism** is the substantively relevant provision, codified across Schedule 7 and Part 4 of the Act. (The original task brief's "Section 64 priority offences" is best understood as shorthand for this priority-offences mechanism. Cite the Act + Schedule 7 explicitly, not "Section 64", to avoid mis-citation.)
    - **Implication for 2nd-Brain UK routing**: any 2nd-Brain UI string visible to UK users that could be construed as encouraging or assisting suicide or serious self-harm is a regulated category. The fixed-string RED-zone copy (per `crisis-detection.md`) is the safe path; LLM-generated reasoning about methods is not.

18. Ofcom. (2024). *Protecting people from illegal harms online — Statement and Codes of Practice*. Published 2024-12-16. Official URL: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-protecting-people-from-illegal-harms-online · Suicide and self-harm specific guidance: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/protecting-people-from-online-suicide-and-self-harm-material
    - First-edition codes; regulated services had until **2025-03-16** to complete illegal-content risk assessments; duties enforceable from **2025-03-17**. Ofcom's expectations include: proactive technology to detect illegal suicide content; recommender-system design to exclude likely-priority-illegal content from feeds; real-time reporting of livestream imminent-harm. **Direct implication for 2nd-Brain**: a journaling app is U2U-borderline (entries are private, not public). If 2nd-Brain later adds community/shared features in the UK, Ofcom obligations escalate sharply. For v0.2 launch (private journals only), the main obligation is that **2nd-Brain itself must not generate or surface encouragement/assistance content** — covered by the safety-classifier short-circuit.

## Japan — Crisis Infrastructure & Policy

19. Japan Federation of Inochi no Denwa (一般社団法人 日本いのちの電話連盟). *いのちの電話 — ナビダイヤル 0570-783-556 (10:00–22:00) · フリーダイヤル 0120-783-556 (毎月10日 8:00–翌8:00)*. Official URL: https://www.inochinodenwa.org
    - Founded 1971 (Tokyo). 53 prefectural centres. Volunteer telephone counselling. **Note**: 0570 is a navi-dial (caller pays) — the no-cost 0120 line is available only on the 10th of each month. For 2nd-Brain Japanese-locale routing, surface both numbers and explain the cost difference; do not present 0570 as "free" because it is not.

20. 一般社団法人 社会的包摂サポートセンター (Center for Social Inclusion Support). *よりそいホットライン — 0120-279-338 (toll-free, 24/7) · Fukushima area: 0120-279-226*. Official URL: https://www.since2011.net/yorisoi
    - Established 2011 (post–Tōhoku earthquake) as a government-funded 24/7 toll-free hotline for socially marginalised callers — economically vulnerable, foreign nationals, sexual minorities, DV/sexual violence survivors, people with disabilities, single-parent households. Specialised sub-lines for suicide-prevention, DV/sexual violence, and sexual-minorities. **For 2nd-Brain Japanese-locale routing, よりそいホットライン is the primary 24/7 free recommendation; いのちの電話 is the cultural anchor during operating hours.**

21. Japanese Cabinet Office. (2017). *General Principles of Suicide Prevention Policy — Realising a Society in Which No One Is Driven to Take Their Own Life* (Cabinet Decision, 25 July 2017). Provisional English translation (MHLW): https://www.mhlw.go.jp/content/001250885.pdf · JSCP (Japan Suicide Countermeasures Promotion Center) English summary: https://jscp.or.jp/english/img/06bbd4674feacc1a242baff060b1fb04d0227e90.pdf · WHO MiNDbank record: https://extranet.who.int/mindbank/item/6766
    - Updated General Principles (revised 2017; subsequent revision 2022) under Japan's **Basic Act on Suicide Prevention** (自殺対策基本法, 2006). Three-level framework: social systems · local cooperation · personal support. **Japan's suicide rate fell ~35% from 2006 to 2022** during the policy's operation (Kim et al. 2024, see below). For 2nd-Brain: the policy authorises and funds the public hotlines 2nd-Brain hands off to; routing to よりそいホットライン and いのちの電話 is consistent with the official Japanese framework.

22. Kim, S. J., Tachikawa, H., et al. (2024). Impact of the Japanese Government's 'General Principles of Suicide Prevention Policy' on youth suicide from 2007 to 2022. *BJPsych Open*. PubMed: https://pubmed.ncbi.nlm.nih.gov/38112073/ · DOI: https://doi.org/10.1192/bjo.2023.616
    - Long-run policy evaluation: significant declines in adult suicide rates over the policy period; **youth suicide rates rose** during the same window — sobering counter-evidence that policy alone does not protect under-18s. For 2nd-Brain: aligns with the 18+ floor (C10) and informs cautions around any future youth-product expansion.

## Canada — Crisis Infrastructure

23. Centre for Addiction and Mental Health (CAMH). (2023). *9-8-8 Suicide Crisis Helpline — National Canadian launch November 30, 2023*. Official URL: https://www.988.ca · Government of Canada announcement: https://www.canada.ca/en/public-health/news/2023/11/government-of-canada-launches-three-digit-suicide-crisis-helpline.html
    - Canada's 9-8-8 launched 2023-11-30, in English and French, 24/7 by call or text. Operated by CAMH coordinating a network of 37 local/provincial/territorial/national crisis lines (including Kids Help Phone and Hope for Wellness). **For 2nd-Brain Canadian-locale routing, 9-8-8 is the primary number.** The older 1-833-456-4566 Talk Suicide Canada line still operates and remains valid.

24. Kids Help Phone. *1-800-668-6868 (EN/FR · 24/7) · text CONNECT to 686868 · live chat at kidshelpphone.ca*. Official URL: https://kidshelpphone.ca
    - Canada's national support service for under-25s, available in 100+ languages via interpreters. **Surface only on user opt-in to under-25 context**; do not auto-route on inferred age.

## Australia — Crisis Infrastructure

25. Lifeline Australia. *13 11 14 · text 0477 13 11 14 (12pm–midnight AEDT) · chat lifeline.org.au (24/7)*. Official URL: https://www.lifeline.org.au
    - Founded 1963. ~1M+ contacts per year. 24/7 phone. **The primary Australian-locale recommendation.**

26. Kids Helpline (Australia, operated by yourtown). *1800 55 1800 (24/7) · web chat at kidshelpline.com.au*. Official URL: https://kidshelpline.com.au
    - 5–25 age band. Free; trained counsellors. **As with Trevor Project and Kids Help Phone — do not auto-route on inferred age.**

27. Beyond Blue. *1300 22 4636 (24/7 phone) · web chat 13:00–24:00 AEST · email response within 24h*. Official URL: https://www.beyondblue.org.au
    - Founded 2000 (Australian Government national depression initiative, ex-Premier Jeff Kennett). Covers depression, anxiety, suicide-related distress. **Secondary Australian-locale recommendation alongside Lifeline 13 11 14.**

## Multilingual LLM Crisis Response — Evidence Base

28. McBain, R. K., Cantor, J. H., Zhang, L. A., Baker, O., Zhang, F., Burnett, A., Kofner, A., Breslau, J., Stein, B. D., Mehrotra, A., & Yu, H. (2025). Evaluation of alignment between large language models and expert clinicians in suicide risk assessment. *Psychiatric Services*, 76(11), 944–950. DOI: https://doi.org/10.1176/appi.ps.20250086
    - Already in `crisis-detection.md`. Repeated here as the anchor: **LLMs decline direct response to high-risk queries; quality of referrals varies dramatically.** All of McBain's findings were tested in English; we cannot assume the referral-decline behaviour generalises to non-English prompts. See entries 29–31 below for the multilingual evidence gap.

29. Holmes, G., Tang, B., Gupta, S., Venkatesh, S., Christensen, H., & Whitton, A. (2025). Applications of large language models in the field of suicide prevention: Scoping review. *Journal of Medical Internet Research*, 27, e63126. DOI: https://doi.org/10.2196/63126
    - Already in `crisis-detection.md`. Scoping review confirms **only 33% of LLM-in-suicide-prevention studies report ethical considerations** and the multilingual coverage is sparse.

30. Cui, X., Gu, Y., Fang, H., & Zhu, T. (2025). Development and evaluation of LLM-based suicide intervention chatbot. *Frontiers in Psychiatry*, 16, 1634714. DOI: https://doi.org/10.3389/fpsyt.2025.1634714
    - **Chinese-language** suicide-intervention chatbot built on GPT-4 ("心灵守护者", Guardian of the Heart). Authors note GPT-4 "sometimes struggles to capture deep connotations and cultural contexts" in Chinese, and future work needs "optimisation of Chinese-language prompt design." **Direct relevance**: confirms that general-purpose LLMs (which is what 2nd-Brain's Gemini wrapper is) underperform in non-English clinical-cultural contexts. The classifier's safety threshold for non-English locales should be **more conservative**, not less.

31. Pendse, S. R., Nkemelu, D., Bidwell, N. J., Jadhav, S., Pathare, S., De Choudhury, M., & Kumar, N. (2022). From treatment to healing: Envisioning a decolonial digital mental health. *Proceedings of the 2022 CHI Conference on Human Factors in Computing Systems (CHI '22)*, Article 548, 1–23. DOI: https://doi.org/10.1145/3491102.3501982
    - Conceptual but critical: digital mental health technologies "amplify historical injustices and erase minoritised experiences of mental distress." For 2nd-Brain global routing: **western-normative crisis copy mapped to non-western locales is itself a harm pattern.** Korean RED-zone copy (Suicide CARE 2.0-aligned, per `crisis-detection.md`) is the gold standard for KO; English copy ported to JP/CA-FR/EU is a failure mode.

## Cross-cultural Disclosure Norms (informs classifier sensitivity)

32. Chu, J. P., Goldblum, P., Floyd, R., & Bongar, B. (2010). The cultural theory and model of suicide. *Applied and Preventive Psychology*, 14(1–4), 25–40. DOI: https://doi.org/10.1016/j.appsy.2011.11.001
    - Cultural Theory of Suicide (CTS): cultural sanctions, idioms of distress, minority stress, and social discord shape **how suicidal experience is expressed**, not just whether it occurs. Foundational for understanding why a literal-keyword classifier underperforms across cultures.

33. Wong, Y. J., Brownson, C., Rutkowski, L., Nguyen, C. P., & Becker, M. S. (2014). A mediation model of professional psychological help seeking for suicide ideation among Asian American and white American college students. *Archives of Suicide Research*, 18(4), 333–354. DOI: https://doi.org/10.1080/13811118.2013.826153
    - Empirical: Asian American students with suicidal ideation are **less likely** to disclose to professionals than white American peers, mediated by stigma and loss-of-face concerns. **For 2nd-Brain Japan/Korea/Chinese-speaking locales**: the classifier cannot rely on explicit verbal disclosure of suicidality at the same rate as US-validated NLP work assumes (Coppersmith 2018, De Choudhury & Kiciman 2017, both in `crisis-detection.md`). Add weight to **indirect markers** (burden language, withdrawal, finality + farewell tones) for East Asian locales — consistent with `crisis-detection.md` §Cautions.

34. Morrison, L. L., & Downey, D. L. (2000). Racial differences in self-disclosure of suicidal ideation and reasons for living: Implications for training. *Cultural Diversity and Ethnic Minority Psychology*, 6(4), 374–386. DOI: https://doi.org/10.1037/1099-9809.6.4.374
    - Older but still-cited: ethnic-minority US populations under-disclose ideation in clinical screening relative to risk. Supports the conservative-threshold principle for the safety classifier across locales.

## Routing Decision Tree — Locale → Resources

```
USER MESSAGE
    │
    ▼
[Engine 7 — Safety Classifier]
    │
    │  (Detection logic per crisis-detection.md — UNCHANGED.
    │   This tree only governs the ROUTING after a RED is detected.)
    │
    ▼
RED detected → Lookup user.locale (set at sign-up; user-editable)
    │
    ├─ locale = ko-KR        → see crisis-detection.md §Korean RED-zone copy
    │                          (1393, 1577-0199, 한국생명존중희망재단)
    │
    ├─ locale = en-US        → 988 (call/text/chat)
    │                          Crisis Text Line: text HOME to 741741
    │                          (offer Trevor Project, Veterans Crisis Line only if
    │                           user has self-identified — never auto-route on inference)
    │
    ├─ locale = en-CA / fr-CA → 9-8-8 Canada (call/text · EN/FR)
    │                          (offer Kids Help Phone only if user-identified under-25)
    │
    ├─ locale = en-GB        → Samaritans 116 123 (free, 24/7)
    │                          Crisis Text Line UK: text SHOUT to 85258
    │
    ├─ locale = en-IE        → Samaritans 116 123 (covers UK & Ireland)
    │
    ├─ locale = de-DE / de-AT / de-CH (German)
    │                        → TelefonSeelsorge 0800 111 0 111 or 116 123 (24/7)
    │
    ├─ locale = fr-FR        → S.O.S Amitié 09 72 39 40 50 (24/7)
    │                          + 116 123 (EU harmonised)
    │
    ├─ locale = it-IT        → Telefono Amico 02 2327 2327 (daily 9am–midnight)
    │                          + 116 123 (24/7 EU harmonised fallback)
    │
    ├─ locale = es-* (EU)    → 024 (Línea de Atención a la Conducta Suicida, ES)
    │                          + 116 123
    │
    ├─ locale = any other EU → 116 123 (legal harmonised EU number, per
    │                          Commission Decision 2007/116/EC)
    │
    ├─ locale = ja-JP        → よりそいホットライン 0120-279-338 (24/7 toll-free)
    │                          いのちの電話 0570-783-556 (10am–10pm, navi-dial paid)
    │                          (do NOT call 0570 "free")
    │
    ├─ locale = en-AU        → Lifeline 13 11 14 (24/7)
    │                          Beyond Blue 1300 22 4636 (24/7)
    │                          (offer Kids Helpline only if user-identified 5–25)
    │
    └─ locale = UNKNOWN / detection failed
                             → DEFAULT INTERNATIONAL FALLBACK
                               1. https://findahelpline.com  (WHO-affiliated
                                  international directory; covers 130+ countries)
                               2. https://www.iasp.info/resources/Crisis_Centres
                                  (International Association for Suicide Prevention)
                               3. 116 123 if EU phone-prefix detected
                               4. 988 if North American phone-prefix detected
                               (Never English-only deflect. Never skip.)
```

### Hard rules embedded in the tree

1. **Country detection failure → show international list, never skip.** A blank or silent classifier output on RED is a P0 incident, equivalent to a missed crisis. The default fallback is a fixed string; render it whenever locale lookup returns null/error.

2. **Crisis message must be in user's primary language.** If `app_language = ja-JP`, the RED-zone copy is rendered in Japanese; English fallback only if Japanese rendering fails (which itself triggers a P1 telemetry event). This is **not optional** — Pendse et al. 2022 documents the harm pattern of western-normative crisis messaging.

3. **No locale-inference from text content alone.** User locale is set at sign-up (Blueprint C10 birth-date flow runs in user-selected locale; locale is stored explicitly). Do not infer locale from journal text; rely on the stored value.

4. **No identity-inference for sub-population routing.** Trevor Project, Kids Help Phone, Kids Helpline, Veterans Crisis Line — surface only on **explicit user self-identification** (e.g., user opted into "I am a veteran" in profile). Auto-inference of LGBTQ+, age <25, or veteran status from journal text is a Hard Safety Rule violation (`crisis-detection.md` §0 Hard Rule 3; `data-ethics-consent.md`).

5. **Locale-specific RED-zone strings are fixed, human-authored, pre-reviewed.** Same principle as `crisis-detection.md` §Korean RED-zone language: no LLM generation of crisis copy at runtime. Each locale's string is reviewed before release, and the locale lookup returns the pre-translated string, not a translation API result.

## Age Range Coverage (locale × age intersection)

- **Child (0–12)**: out of scope for 2nd-Brain (18+ gate). Children-specific resources listed for completeness only (Kids Help Phone, Kids Helpline, child sub-lines on 116111).
- **Adolescent (13–17)**: out of scope. UK Online Safety Act 2023 children's duties (§§9–11) do not apply because 2nd-Brain is 18+; if age-gate fails, child-protection legal obligations attach in UK + EU jurisdictions.
- **Young Adult (18–29)**: elevated risk across all locales. Trevor Project (<25), Kids Help Phone (<25, CA), Kids Helpline (5–25, AU) become relevant only on user opt-in.
- **Adult (30–49)**: standard adult routing.
- **Midlife (50–64)**: elevated risk especially Korean males (per `crisis-detection.md` You 2025); elevated risk in Japan working-age population (per Kim 2024).
- **Elderly (65+)**: highest-rate OECD elderly suicide in Korea; in Japan, よりそいホットライン and いのちの電話 both serve older adults explicitly.

## Application to 2nd-Brain — Implementation Implications

### What this batch changes vs `crisis-detection.md`

| Layer | `crisis-detection.md` (canonical) | This batch (global extension) |
| --- | --- | --- |
| Detection (classifier inputs) | C-SSRS + NLP features + Suicide CARE markers | UNCHANGED |
| Classifier output schema | GREEN / YELLOW / RED | UNCHANGED |
| Korean RED-zone copy | Suicide CARE 2.0-aligned fixed string | UNCHANGED — canonical |
| Korean routing targets | 1393, 1577-0199, 한국생명존중희망재단 | UNCHANGED |
| Non-Korean RED-zone copy | English fallback only | **REPLACED** by per-locale fixed strings (DE, FR, IT, ES, EN-US, EN-GB, EN-AU, EN-CA, FR-CA, JA-JP) |
| Default fallback | English + findahelpline.com | **EXPANDED** to also include IASP directory + locale-prefix-based geo-routing |
| Sub-population resources | Not in scope | Listed (Trevor, Kids Help Phone, Veterans CL, etc.) — opt-in only |
| Threshold per locale | Single threshold | **Conservative-shift for non-English locales** (Cui 2025, Wong 2014, Morrison 2000 — see below) |

### Classifier threshold per locale

Per cross-cultural disclosure literature (Wong 2014, Morrison 2000) and multilingual LLM evidence (Cui 2025), the safety classifier should **lower its activation threshold for RED in non-English locales** — i.e., be **more sensitive**, even at the cost of more false positives. Rationale:

- East Asian users (KO, JA, ZH) under-disclose explicitly relative to risk (Wong 2014 in AAPI sample; structural pattern in Chu et al. 2010 CTS).
- General-purpose LLM classifiers (which Engine 7 is) underperform on culturally-coded suicidality (Cui 2025; Pendse 2022).
- False-positive cost (one extra RED-zone fallback shown to a not-in-crisis user) is bounded; false-negative cost (missed crisis) is catastrophic — same asymmetry as `crisis-detection.md`, but the cross-cultural evidence widens the gap.

Concretely: if the GREEN/YELLOW/RED probabilities sum to 1.0 and the default RED activation is `p_red ≥ 0.30`, set `p_red ≥ 0.25` for `locale ∈ {ko-KR, ja-JP, zh-*}`.

### Locale + sub-population disclosure UX

When 2nd-Brain shows a RED-zone screen, it can optionally include a single line:

> "If you identify with any of these communities, there are people trained for your situation: [LGBTQ+ youth · veterans · under-25 · …]"

Each tag is a one-tap button that reveals the corresponding resource. **User taps it; we do not pre-classify them.** This satisfies Hard Rule 4 above while ensuring the resources are findable.

### Localisation copy review checklist

For each locale-specific RED-zone string, the following must be true before shipping:

- Native-speaker review (not machine translation).
- Verified against the operating organisation's preferred phrasing (e.g., Samaritans publishes recommended wording; Lifeline AU has Mindframe guidelines).
- Avoids method-mention (Mindframe / WHO responsible-reporting principle).
- Avoids minimising language ("things will get better").
- Avoids the false-companionship promise that LLMs are prone to ("I'm always here for you") — McBain 2025 caution.
- Phone number rendered as locally-dialable, with country code visible if the user might roam.
- Cost transparency where relevant (e.g., Japan navi-dial is paid; UK 116 123 is free).

## Cross-references

- **`crisis-detection.md`** — canonical detection logic + Korean policy + LLM capability/limits. **Read first.** This batch is the routing layer on top of it.
- **`ai-mental-health-safety.md`** §Stade 2024 risk categories — "missed crisis" maps directly to the conservative-threshold + default-fallback obligations here.
- **`data-ethics-consent.md`** — Hard Rule 4 (no identity-inference) flows from the consent + protected-category principles documented there.
- **`cross-cultural-east-asian.md`** — broader cultural context for the East Asian disclosure findings (Wong 2014, Chu 2010); the disclosure-norm evidence here is a specialised slice of that batch.
- **`computational-personality.md`** — Hard Rule 3 ("never infer protected categories") originates there (Kosinski 2013 caution).

## Cautions & Limitations

- **LLM accuracy in crisis detection is bounded.** McBain 2025 and Holmes 2025 both show that LLMs decline-and-refer on high-risk English prompts, but referral quality varies dramatically across models. Cui 2025 adds that general-purpose LLMs underperform on non-English cultural contexts. **Engine 7 is a safety net, not a clinical instrument.** Never frame it to users (or to ourselves) as more than that.
- **Cultural disclosure norms vary.** Wong 2014, Chu 2010, Morrison 2000: some cultures under-disclose explicit ideation to professionals — and a chatbot is, structurally, a professional-mediated artefact. The classifier must compensate, not assume parity.
- **Never replace a human crisis line; always route out.** WHO LIVE LIFE (2021) names early identification + management as one of four evidence-based interventions; the management half is human. 2nd-Brain detects + routes. It does not stay with the user during crisis.
- **Localisation is not optional.** A user receiving English-only crisis copy at the moment of their crisis is a failure mode, not a fallback. Pendse 2022 documents this as a decolonial harm pattern. Every supported app locale must have its own pre-reviewed RED-zone string before 2nd-Brain offers that locale at sign-up.
- **Hotline numbers change.** Verify all numbers at every release boundary. Specifically: the Crisis Text Line UK keyword is "SHOUT to 85258" not "HOME to 741741" (which is the US Crisis Text Line keyword). Samaritans' older 08457 number was deprecated in favour of 116 123. Spain's national suicide helpline 024 launched 2022 — relatively new and likely to evolve.
- **Legal classification of 2nd-Brain by locale may shift.** The UK Online Safety Act 2023 + Ofcom illegal-harms codes (Dec 2024) may treat journaling apps with social features as U2U services. If 2nd-Brain adds shared persona-cards or community in the UK, regulatory exposure escalates substantially; Section-184 priority offences attach. Re-review with counsel before any social-feature launch in the UK.
- **EU 116-123 implementation is uneven.** Although Decision 2007/116/EC reserved the number across all Member States, not every member has assigned the number to a 24/7 emotional-support operator. For some EU locales, country-specific lines (e.g., DE 0800 111 0 111, FR 09 72 39 40 50) are more reliable than 116-123. Always surface both.
- **Japan toll asymmetry.** 0570 navi-dial is **not free** in Japan; calling it from a Japanese mobile costs ~¥10/20 seconds. The toll-free 0120 numbers are the user-cost-safe primary recommendation (よりそいホットライン 0120-279-338). Do not market 0570 as "free."
- **Veterans / LGBTQ+ / under-25 sub-routing is opt-in.** Auto-routing on inferred identity violates Hard Rule 3 (`crisis-detection.md` §0 / this batch §Routing Decision Tree Hard Rule 4). Sub-routes are surfaced via user-tappable tags, not classifier output.
- **The classifier itself is fallible.** Deploy with conservative thresholds, regular human review of borderline cases (especially non-English), and a "user can flag missed crisis" feedback mechanism (per `crisis-detection.md` §Cautions). Cross-locale borderline-case review should sample from each locale, not just English.
- **DOI verification is current to May 2026.** All entries in this batch verified against Crossref / publisher record at curation time. Per `CLAUDE.md` §5 lint operation, re-verify quarterly.

## Suggested `knowledge_sources` INSERT rows

```sql
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale, summary_ko, summary_en, application_notes)
values
  (
    'Improving the detection and prediction of suicidal behavior among military personnel by measuring suicidal beliefs: An evaluation of the Suicide Cognitions Scale',
    ARRAY['Bryan, C. J.', 'Rudd, M. D.', 'Wertenberger, E.', 'Etienne, N.', 'Ray-Sannerud, B. N.', 'Morrow, C. E.', 'Peterson, A. L.', 'Young-McCaughon, S.'],
    '10.1016/j.jad.2014.02.021',
    'https://doi.org/10.1016/j.jad.2014.02.021',
    'crisis_detection_global',
    'adult',
    'en',
    '자살 인지(unbearability, unlovability)는 단순 자살 사고 키워드 검출을 넘어서 자살 행동을 예측한다는 군 표본 연구. NLP 분류기 설계 시 인지 내용 가중치 근거.',
    'Suicide-specific cognitions (unbearability, unlovability), measured by the SCS, predict suicidal behaviour beyond ideation-keyword screens in two US military samples. Basis for weighting cognitive content in NLP classifier features.',
    'Engine 7 classifier: weight unbearability/unlovability language as RED-tier features independent of explicit ideation keywords.'
  ),
  (
    'The Brief Suicide Cognitions Scale: Development and clinical application',
    ARRAY['Rudd, M. D.', 'Bryan, C. J.'],
    '10.3389/fpsyt.2021.737393',
    'https://doi.org/10.3389/fpsyt.2021.737393',
    'crisis_detection_global',
    'adult',
    'en',
    '9문항 단축형 자살 인지 척도. 시도와 사망을 예측. 저널 텍스트에서 "더 이상 못 견디겠다" / "아무도 그리워하지 않을 것" 같은 표현을 RED 신호로 처리하는 근거.',
    'Brief 9-item Suicide Cognitions Scale; predicts attempts and deaths. Justification for treating unbearability/unlovability phrasing in journal text as RED signals.',
    'Engine 7: list the 9 Brief-SCS cognitive patterns as RED-tier feature templates for the Korean and English classifiers.'
  ),
  (
    'Does response on the PHQ-9 Depression Questionnaire predict subsequent suicide attempt or suicide death?',
    ARRAY['Simon, G. E.', 'Rutter, C. M.', 'Peterson, D.', 'Oliver, M.', 'Whiteside, U.', 'Operskalski, B.', 'Ludman, E. J.'],
    '10.1176/appi.ps.201200587',
    'https://doi.org/10.1176/appi.ps.201200587',
    'crisis_detection_global',
    'adult',
    'en',
    'PHQ-9 9번 문항(자살 사고)이 1년 후 시도/사망을 예측. 단일 문항으로는 위양성률이 높아 단독 RED 트리거로는 부적합.',
    'PHQ-9 item 9 predicts attempts and deaths over 1 year (large cohort). High false-positive rate means it is a strong recall gate, not a stand-alone RED trigger.',
    'Engine 7: use PHQ-9-item-9-equivalent phrasing as YELLOW-tier gate that escalates to RED only with additional features.'
  ),
  (
    'The Columbia-suicide severity rating scale: Validity and psychometric properties of an online Spanish-language version in a Mexican population sample',
    ARRAY['Austria-Corrales, F.', 'Cabrera-Ruiz, E.', 'Salinas-Escudero, G.', 'Mendieta-Cabrera, D.', 'Heinze-Martin, G.'],
    '10.3389/fpubh.2023.1157581',
    'https://doi.org/10.3389/fpubh.2023.1157581',
    'crisis_detection_global',
    'adult',
    'es',
    'C-SSRS 스페인어 온라인 버전 멕시코 표본 검증 (N=3,645). 분류기 구조가 스페인어로 이식 가능함을 입증.',
    'C-SSRS Spanish-language online version validated in Mexican adults; demonstrates the scale structure transfers to Spanish self-report.',
    'Cross-cultural anchor: if 2nd-Brain ever serves Spanish-locale users, classifier structure inherits from Spanish C-SSRS.'
  ),
  (
    'Validation and application of the Chinese version of the Columbia-Suicide Severity Rating Scale',
    ARRAY['Ji, Y.', 'et al.'],
    '10.1016/j.jad.2023.09.014',
    'https://doi.org/10.1016/j.jad.2023.09.014',
    'crisis_detection_global',
    'adult',
    'zh',
    '중국어 C-SSRS MDD 입원 환자 검증. 비라틴 문자 최대 언어권에서 척도 구조 이식성 확인.',
    'Chinese C-SSRS validated in MDD inpatients. Confirms scale-structure transfer to the largest non-Latin-script population the scale serves.',
    'Cross-cultural anchor for any future zh-* locale support; classifier copy reviewed against this evidence base.'
  ),
  (
    'Feasibility and validation of a computer-automated Columbia-Suicide Severity Rating Scale using interactive voice response technology',
    ARRAY['Mundt, J. C.', 'Greist, J. H.', 'Gelenberg, A. J.', 'Katzelnick, D. J.', 'Jefferson, J. W.', 'Modell, J. G.'],
    '10.1016/j.jpsychires.2010.04.025',
    'https://doi.org/10.1016/j.jpsychires.2010.04.025',
    'crisis_detection_global',
    'adult',
    'en',
    '자동화된 C-SSRS 시행이 임상가 시행과 비교 가능한 결과 산출. 기계 매개 스크리닝 + 인간 라우팅 원칙의 방법론적 근거.',
    'Computer-automated C-SSRS produces results comparable to clinician administration. Methodological basis for the "machine-mediated screening, human-mediated routing" principle.',
    'Engine 7 design principle: classifier detects, human services route. No automated treatment.'
  ),
  (
    'Evaluation of alignment between large language models and expert clinicians in suicide risk assessment',
    ARRAY['McBain, R. K.', 'Cantor, J. H.', 'Zhang, L. A.', 'Baker, O.', 'Zhang, F.', 'Burnett, A.', 'Kofner, A.', 'Breslau, J.', 'Stein, B. D.', 'Mehrotra, A.', 'Yu, H.'],
    '10.1176/appi.ps.20250086',
    'https://doi.org/10.1176/appi.ps.20250086',
    'crisis_detection_global',
    'adult',
    'en',
    'ChatGPT, Claude, Gemini의 자살 위험 응답이 임상 전문가와 일치하는지 평가. 모델별 referral 품질 격차 큼. 영어 한정 평가라는 한계.',
    'Tests ChatGPT, Claude, Gemini on suicide-related queries vs expert clinicians. Referral quality varies dramatically across models. Caveat: English-only testing.',
    'Engine 7: conservative thresholds; never assume Gemini autonomously handles RED-zone routing. Especially for non-English locales where this evidence does not apply.'
  ),
  (
    'Applications of large language models in the field of suicide prevention: Scoping review',
    ARRAY['Holmes, G.', 'Tang, B.', 'Gupta, S.', 'Venkatesh, S.', 'Christensen, H.', 'Whitton, A.'],
    '10.2196/63126',
    'https://doi.org/10.2196/63126',
    'crisis_detection_global',
    'adult',
    'en',
    'LLM-자살예방 응용 분야 범위 검토. 33%만 윤리 고려 보고. 다국어 평가 부족.',
    'Scoping review of LLMs in suicide prevention. Only 33% report ethical considerations. Multilingual coverage is sparse.',
    'Cross-locale evidence gap: do not extrapolate English-tested LLM safety findings to non-English locales without locale-specific validation.'
  ),
  (
    'Development and evaluation of LLM-based suicide intervention chatbot',
    ARRAY['Cui, X.', 'Gu, Y.', 'Fang, H.', 'Zhu, T.'],
    '10.3389/fpsyt.2025.1634714',
    'https://doi.org/10.3389/fpsyt.2025.1634714',
    'crisis_detection_global',
    'adult',
    'zh',
    'GPT-4 기반 중국어 자살 개입 챗봇. GPT-4가 중국어 문화 맥락 포착에 약점이 있음을 저자들이 인정. 비영어 일반목적 LLM은 보수적 임계값 필요 근거.',
    'GPT-4-based Chinese suicide-intervention chatbot. Authors acknowledge GPT-4 struggles with Chinese cultural connotation. Direct evidence that general-purpose LLMs need conservative thresholds in non-English locales.',
    'Engine 7: lower RED-activation threshold for ja-JP, ko-KR, zh-* locales relative to en-* baseline.'
  ),
  (
    'From treatment to healing: Envisioning a decolonial digital mental health',
    ARRAY['Pendse, S. R.', 'Nkemelu, D.', 'Bidwell, N. J.', 'Jadhav, S.', 'Pathare, S.', 'De Choudhury, M.', 'Kumar, N.'],
    '10.1145/3491102.3501982',
    'https://doi.org/10.1145/3491102.3501982',
    'crisis_detection_global',
    'adult',
    'en',
    '서구 기준 디지털 정신건강의 식민주의적 해악 패턴을 분석. 영어 전용 위기 문구를 비서구 로케일에 그대로 이식하는 것이 해악 패턴임을 명시.',
    'Critique of western-normative digital mental health as a harm pattern. Naming English-only crisis copy ported to non-western locales as a documented decolonial harm.',
    'Hard rule: per-locale RED-zone copy is mandatory, not optional. English fallback only on render-failure (P1 telemetry).'
  ),
  (
    'A mediation model of professional psychological help seeking for suicide ideation among Asian American and white American college students',
    ARRAY['Wong, Y. J.', 'Brownson, C.', 'Rutkowski, L.', 'Nguyen, C. P.', 'Becker, M. S.'],
    '10.1080/13811118.2013.826153',
    'https://doi.org/10.1080/13811118.2013.826153',
    'crisis_detection_global',
    'young_adult',
    'en',
    'AAPI 대학생이 자살 사고 시 전문가 도움 요청을 백인 동료보다 덜 한다는 매개 모형. 동아시아 로케일에서 분류기가 명시적 사고 키워드에만 의존하면 누락 위험.',
    'Asian American college students less likely to disclose suicidal ideation to professionals than white American peers, mediated by stigma. Classifier in East Asian locales cannot rely on explicit ideation disclosure at parity.',
    'Engine 7: weight indirect markers (burden, withdrawal, finality + farewell) more heavily for ja-JP, ko-KR, zh-* locales.'
  ),
  (
    'The cultural theory and model of suicide',
    ARRAY['Chu, J. P.', 'Goldblum, P.', 'Floyd, R.', 'Bongar, B.'],
    '10.1016/j.appsy.2011.11.001',
    'https://doi.org/10.1016/j.appsy.2011.11.001',
    'crisis_detection_global',
    'adult',
    'en',
    '문화적 자살 이론 (CTS): 문화적 제재, 고통의 관용구, 소수자 스트레스, 사회적 불화가 자살 표현 방식을 형성. 키워드 분류기 한계 이론적 기반.',
    'Cultural Theory of Suicide: cultural sanctions, idioms of distress, minority stress, and social discord shape expression of suicidal experience. Theoretical basis for the limits of keyword classifiers.',
    'Engine 7 design rationale doc: cite CTS as the foundation for locale-conditioned feature weighting.'
  ),
  (
    'Racial differences in self-disclosure of suicidal ideation and reasons for living: Implications for training',
    ARRAY['Morrison, L. L.', 'Downey, D. L.'],
    '10.1037/1099-9809.6.4.374',
    'https://doi.org/10.1037/1099-9809.6.4.374',
    'crisis_detection_global',
    'adult',
    'en',
    '미국 인종 소수자가 자살 사고 자기개방을 위험 대비 덜 한다는 임상 연구. 보수적 임계값 원칙 추가 근거.',
    'US ethnic-minority populations under-disclose suicidal ideation in clinical screening relative to risk. Additional grounding for the conservative-threshold principle.',
    'Engine 7: documented basis for lower RED activation threshold in non-majority locales.'
  ),
  (
    'Impact of the Japanese Government''s General Principles of Suicide Prevention Policy on youth suicide from 2007 to 2022',
    ARRAY['Kim, S. J.', 'Tachikawa, H.'],
    '10.1192/bjo.2023.616',
    'https://doi.org/10.1192/bjo.2023.616',
    'crisis_detection_global',
    'all_ages',
    'en',
    '일본 자살예방 종합대강 정책 평가 (2007-2022). 성인 자살률은 감소했지만 청소년 자살률은 증가. 18+ 정책 정당성 + 청소년 확장 시 주의 근거.',
    'Long-run policy evaluation of Japan''s General Principles of Suicide Prevention Policy. Adult suicide declined ~35%; youth suicide rose. Reinforces 18+ floor and cautions any future youth-product expansion.',
    'Aligns with C10 (18+ floor); informs any future under-18 roadmap with sobering counter-evidence.'
  );
```

Per `CLAUDE.md` §5, the SQL above should also be saved as `supabase/seed/crisis-detection-global.sql` when this batch is committed; the migration tracks the markdown release.
