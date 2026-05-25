# Framework: AI / LLM Mental Health Safety & Effectiveness

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Trust score target**: P2 critical gap (was 15/100 in audit). Establishes the academic basis for **2nd-Brain itself as an AI-mediated mental-wellbeing product**. Answers: do AI chatbots actually help? what are the known harm patterns? what responsible-deployment standards exist? Covers a decade of evidence from Woebot (2017) through Therabot (NEJM AI 2025), plus the contemporary deployment ethics literature and a Korean validation.

## AI Retrieval Guide (for RAG / Wiki use)

**When user input or system needs to answer** → **look here**:
- "Does a chatbot actually help mental wellbeing?" → §Fitzpatrick 2017 Woebot RCT + §Heinz 2025 Therabot RCT
- "What does responsible LLM mental-health deployment look like?" → §Stade 2024 npj framework
- "What do real-world users actually report?" → §Inkster 2018 Wysa real-world data
- "Has this been tried with Korean users?" → §Kang & Hong 2025
- "What can go wrong?" → §Known harm patterns + §Stade 2024 risks section
- "Why is 2nd-Brain not therapy?" → §Validity boundary (below) + §crisis-detection.md cross-ref

## Foundational Sources (Western)

1. Fitzpatrick, K. K., Darcy, A., & Vierhile, M. (2017). Delivering cognitive behavior therapy to young adults with symptoms of depression and anxiety using a fully automated conversational agent (Woebot): A randomized controlled trial. *JMIR Mental Health*, 4(2), e19. DOI: https://doi.org/10.2196/mental.7785
   - **First major RCT of an automated CBT chatbot**. N=70 university students. 2-week intervention. **Woebot group showed significant reduction in PHQ-9 depression vs control**. Foundational evidence that text-based AI delivering CBT principles can produce measurable change.

2. Inkster, B., Sarda, S., & Subramanian, V. (2018). An empathy-driven, conversational artificial intelligence agent (Wysa) for digital mental well-being: Real-world data evaluation mixed-methods study. *JMIR mHealth and uHealth*, 6(11), e12106. DOI: https://doi.org/10.2196/12106
   - **Real-world deployment data** (vs controlled trial). High-usage Wysa users showed greater PHQ-9 improvement than low-usage users. Mixed-methods (quant + qualitative) approach reveals what users actually report finding helpful. **Key for 2nd-Brain: efficacy depends heavily on sustained engagement, not first-session experience.**

## Responsible Deployment Framework (Western, 2024)

3. Stade, E. C., Stirman, S. W., Ungar, L. H., Boland, C. L., Schwartz, H. A., Yaden, D. B., Sedoc, J., DeRubeis, R. J., Willer, R., & Eichstaedt, J. C. (2024). Large language models could change the future of behavioral healthcare: A proposal for responsible development and evaluation. *npj Mental Health Research*, 3(1), 12. DOI: https://doi.org/10.1038/s44184-024-00056-z
   - **The definitive responsible-deployment paper** for LLMs in mental health (2024). Identifies risk categories: misinformation, dependency, privacy, fabrication, missed crisis, inappropriate scope expansion, exacerbation of mental illness, equity issues. Recommends: clinical-science centering, interdisciplinary teams, transparency, bias auditing, risk-detection pipelines. **2nd-Brain's safety + curator + audit-log infrastructure should be designed to satisfy this framework.**

## Recent Controlled Evidence — Generative AI Specifically (Western, 2025)

4. Heinz, M. V., Mackin, D. M., Trudeau, B. M., Bhattacharya, S., Wang, Y., Banta, H. A., et al., & Jacobson, N. C. (2025). Randomized trial of a generative AI chatbot for mental health treatment. *NEJM AI*, 2(4), AIoa2400802. DOI: https://doi.org/10.1056/AIoa2400802
   - **First RCT of a generative-AI mental health chatbot at clinical severity** (N=210, Therabot, trained on therapist-patient dialogues grounded in third-wave CBT). Significant symptom improvement for MDD, GAD, and clinically high-risk feeding/eating disorders vs waitlist control. **Major implication**: generative AI is no longer purely speculative for mental health — but Therabot was *specifically trained* on clinical dialogue, not a general-purpose chatbot. **2nd-Brain is NOT Therabot** — different scope, different evidence base.

## Korean Validation (2025)

5. Kang, B., & Hong, M. (2025). Development and evaluation of a mental health chatbot using ChatGPT 4.0: Mixed methods user experience study with Korean users. *JMIR Medical Informatics*, 13, e63538. DOI: https://doi.org/10.2196/63538
   - **Korean young adult sample (N=20, ages 18-27)** using a ChatGPT 4.0–based mental health chatbot. Mixed-methods evaluation of cultural appropriateness, perceived helpfulness, and friction points. **Demonstrates the design space for Korean-adapted LLM mental wellbeing tools exists** but evidence base is much thinner than Western (small N, no clinical-symptom outcomes).

## Age Range Coverage

- **Child (0–12)**: not applicable to 2nd-Brain; chatbot mental health evidence in children is thin.
- **Adolescent (13–17)**: not applicable to 2nd-Brain (18+ block) but Wysa has adolescent validation.
- **Young Adult (18–29)**: **strongest evidence** — Woebot (Fitzpatrick 2017), Kang & Hong (2025) all young adult.
- **Adult (30–49)**: applicable — Therabot RCT (Heinz 2025) and Wysa real-world include adult ages.
- **Midlife (50–64)**: applicable; lighter evidence base.
- **Elderly (65+)**: emerging — Korean rural elderly study (Naver Clova CareCall) shows promise but elderly-specific evidence remains limited.

## Application to 2nd-Brain — Implementation Implications

### What the evidence permits 2nd-Brain to claim

✅ **Defensible claims**:
- "Conversational AI tools have shown measurable wellbeing benefits in randomized trials" (Fitzpatrick 2017, Heinz 2025)
- "Effects depend on sustained engagement" (Inkster 2018)
- "Korean-language LLM mental wellbeing tools are an active area of evaluation" (Kang & Hong 2025)

❌ **NOT defensible claims** (2nd-Brain should never say):
- "Our AI provides therapy" — 2nd-Brain is wellness, not therapy (per Blueprint §3)
- "Clinically proven to reduce depression" — that claim requires our own RCT
- "As effective as a human therapist" — no RCT supports this for general-purpose tools
- "Safe for crisis situations" — see `crisis-detection.md`; LLMs are not safe for unsupervised crisis

### Risk categories from Stade et al. (2024) — apply to 2nd-Brain design

| Risk | 2nd-Brain mitigation |
| --- | --- |
| **Misinformation** | Curator Engine + DOI-verified knowledge_sources only (Blueprint C8) |
| **Dependency** | No "always be here for you" framing; emphasize human relationships in YELLOW prompts |
| **Privacy** | RLS on Supabase, audit log, no plaintext crisis logs (see `crisis-detection.md`) |
| **Fabrication** | All advice references curated framework rows; never make up sources |
| **Missed crisis** | Engine 7 Safety Classifier with C-SSRS-anchored rubric (see `crisis-detection.md`) |
| **Scope creep** | Engineer-enforced YELLOW/RED zone routing; Advisor refuses RED topics |
| **Exacerbation** | Rumination detector (see `self-knowledge.md` Trapnell & Campbell 1999) |
| **Equity** | Korean + English from day one; pricing tier doesn't gate safety features |

### Engagement-design implications from Inkster (2018)

- Sustained engagement = better outcomes. **But**: the Blueprint's "every-day widget reminder" approach risks becoming nagging (dependency risk per Stade 2024). 
- **Better pattern**: engagement that respects user's current life pace + signals when entries are decreasing (gentle check-in, not push).
- Wysa's real-world data showed self-determined check-in cadence outperformed forced daily cadence.

### Generative-AI-specific implications from Heinz (2025)

- Therabot succeeded **because it was trained on actual therapist-patient dialogues**. 2nd-Brain's Gemini Wrapper is NOT trained that way.
- **Implication**: 2nd-Brain's Advisor should not attempt therapy-like dialogue depth. The Engine 4 Advisor is closer to a **structured reflection prompter** than a therapist surrogate.
- The Heinz finding does NOT mean "any LLM is now safe for mental health" — it means a specifically-tuned LLM trained on therapy dialogues, with safety scaffolding, can produce measurable benefit in a controlled trial.

## Cross-references

- **For the crisis-routing boundary**: see `crisis-detection.md` — most relevant Stade (2024) risk category is "missed crisis"
- **For the reflection-vs-rumination design**: see `self-knowledge.md` — most relevant Stade risk is "exacerbation"
- **For the CBT-quality reframing**: see `cbt-rebt.md` — Heinz Therabot was specifically CBT-grounded
- **For the trait-inference reliability**: see `computational-personality.md` — Engine 2's outputs feed Engine 4 (Advisor) and accuracy ceilings cascade
- **For the coaching-effect comparison**: see `methodology-coaching.sql` — Theeboom 2014 g=0.43-0.74 establishes that scaffolded support outperforms unstructured journaling significantly

## Cautions & Limitations

- **The field is moving fast**: 2017 Woebot evidence and 2025 Therabot evidence are not equivalent — methods, models, and standards differ dramatically across the decade. Cite recency carefully.
- **Selection bias in chatbot studies**: users who download mental-health chatbots are not representative; effects in motivated users may not generalize.
- **Small sample sizes**: Fitzpatrick 2017 (N=70), Kang & Hong 2025 (N=20) are small. Heinz 2025 (N=210) is the largest gen-AI mental health RCT to date — still modest.
- **Comparison conditions vary**: most chatbot RCTs use waitlist or information-control, not active comparison. Effect-size estimates inflate relative to active comparators.
- **Long-term effects unknown**: follow-ups are typically weeks, not months/years. Sustained-engagement assumptions are weakly evidenced.
- **Korean evidence base is thin**: only one DOI-verified Korean mental-health LLM evaluation found. Western results may not generalize.
- **No 2nd-Brain-specific evidence**: 2nd-Brain itself has not been evaluated. All cited effects apply to other products — not transferable claims.
- **Privacy stakes are real**: Inkster 2018 and Stade 2024 both flag that mental-health chatbot data is exceptionally sensitive. Treat as protected category beyond GDPR Article 9 baseline.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/ai-mental-health-safety.sql`.
