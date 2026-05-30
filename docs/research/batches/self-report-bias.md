# Framework: Self-Report Bias (Socially Desirable Responding, Faking, Acquiescence, Careless Responding)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Why this batch exists**: 2nd-Brain v0.2 design doc §03 Risk 3 names **자기선택 편향 (self-selection bias)** as a key limitation of the journaling-plus-AI inference architecture. The broader empirical literature on **self-report bias** — socially desirable responding (SDR), impression management, faking, acquiescence and extreme response style, careless / insufficient effort responding, and self-other knowledge asymmetry — must be made explicit. This batch supplies (a) the foundational measurement-psychology evidence base, (b) cross-cultural caveats relevant to Korean / East Asian users, and (c) the application rules under which Tier A atomic quotes, confidence bands, and Advisor invitations should be modulated when SDR signals are elevated in journal text.
>
> **What this batch is NOT**: a lie-detection rubric. Detecting SDR in free-text journals is itself error-prone (see §Cautions). Cultural face-saving (체면) is *not* faking; honne/tatemae is *not* dishonesty. The empirical literature is clear that self-report remains the best single source for many traits (Vazire 2010 SOKA model identifies the subset where self knows best — internal-state traits, neuroticism). The goal here is *calibration* — adjust confidence, never accuse — not interrogation.

## AI Retrieval Guide

| User context / system question | Look in this batch for |
| --- | --- |
| User journal entries read as performative / "writing what sounds good" | §SDR foundational (Paulhus 1984, 1991, 2002); §Application — Tier A confidence reduction rule |
| Question about whether self-report is reliable enough for Engine 2 inference | §Self-other knowledge asymmetry (Vazire 2010 SOKA); §Self-report as method (Paulhus & Vazire 2007) |
| User entries show repeated extreme positive framing without nuance | §Impression management (Paulhus 1984; Pauls & Stemmler 2003; Lanyon & Carle 2007) |
| Question about whether onboarding personality items can be faked | §Faking in personnel selection (Birkeland 2006; Morgeson 2007; Ziegler/MacCann/Roberts 2011) |
| Long journal entry with low specificity / many "all/none/never/always" | §Careless responding (Meade & Craig 2012; Huang 2015) |
| Korean user always picks middle or slightly-positive framings | §Cross-cultural response style (Heine 2002; Chen/Lee/Stevenson 1995; Locke & Baik 2009; Smith 2004) |
| System question: should we infer accuracy of self-reports differs by trait? | §Vazire 2010 SOKA — yes; internal traits (neuroticism) self-best, evaluative traits (intellect) other-best |
| Text-based deception detection question | §Detection in text (Newman/Pennebaker/Berry/Richards 2003); §Yarkoni 2010 limits |
| Should the Advisor confront user about apparent dishonesty? | §Cautions — no; SDR detection is error-prone, accusations harm trust |
| Long-form journaling: is it less susceptible to faking than surveys? | §Application — Paulhus & Vazire 2007 rationale; Yarkoni 2010 large-N text caveat |

## Foundational Sources

### Socially Desirable Responding (SDR) — two-component model

1. Paulhus, D. L. (1984). Two-component models of socially desirable responding. *Journal of Personality and Social Psychology*, 46(3), 598–609. DOI: https://doi.org/10.1037/0022-3514.46.3.598

This is the foundational empirical paper that separated SDR into **Impression Management (IM)** — conscious tailoring of responses to look good to others — and **Self-Deceptive Enhancement (SDE)** — honest but overly-positive self-perception. The factor-analytic separation has held up under replication; treat as Tier A.

### BIDR — Balanced Inventory of Desirable Responding

2. Paulhus, D. L. (1991). Measurement and control of response bias. In J. P. Robinson, P. R. Shaver, & L. S. Wrightsman (Eds.), *Measures of personality and social psychological attitudes* (Vol. 1, pp. 17–59). Academic Press. **Book chapter — no Crossref DOI; the chapter is the canonical citation for BIDR Version 6, with 40 items (20 IM, 20 SDE).** Cite by book ISBN: 0-12-590241-7.

3. Paulhus, D. L. (2002). Socially desirable responding: The evolution of a construct. In H. I. Braun, D. N. Jackson, & D. E. Wiley (Eds.), *The role of constructs in psychological and educational measurement* (pp. 49–69). Lawrence Erlbaum. **Book chapter — no Crossref DOI.** Cite by book ISBN: 0-8058-3899-7. This chapter is the canonical statement of the **evolved two-tier model**: SDR splits into Agency (self-deceptive vs. agency management) × Communion (self-deceptive vs. moralistic communion management) — a 2×2 conceptual refinement of the 1984 IM/SDE split.

**Note**: chapters 2 and 3 carry no DOI because pre-2005 Erlbaum / Academic Press chapters were rarely assigned them. They are nonetheless canonical citations in the SDR literature and are referenced in virtually every subsequent peer-reviewed SDR validation paper. We retain them as cited foundational sources but do not include them as `knowledge_sources` rows (which require DOI per C8). The 1984 *JPSP* paper above and the 2003 *PID* paper below carry the empirical load.

### Substance vs bias in SDR — re-examination

4. Pauls, C. A., & Stemmler, G. (2003). Substance and bias in social desirability responding. *Personality and Individual Differences*, 35(2), 263–275. DOI: https://doi.org/10.1016/S0191-8869(02)00187-3

Key finding: BIDR-IM and BIDR-SDE scores correlate substantially with **substantive** personality traits (low Neuroticism, high Conscientiousness, high Agreeableness) — i.e., the "bias" being measured is partly real personality. Implication for 2nd-Brain: a user with elevated apparent SDR markers may genuinely be more conscientious / agreeable / emotionally stable, not necessarily dishonest. Do NOT treat high SDR score as evidence of misrepresentation in isolation.

### BIDR validity in mixed samples

5. Lanyon, R. I., & Carle, A. C. (2007). Internal and external validity of scores on the Balanced Inventory of Desirable Responding and the Paulhus Deception Scales. *Educational and Psychological Measurement*, 67(5), 859–876. DOI: https://doi.org/10.1177/0013164406299104

Tested BIDR + Paulhus Deception Scales (PDS) across forensic and college samples (N=519). Confirms two-factor structure but finds external validity is **context-dependent** — IM functions differently under high-stakes (forensic, employment) vs. low-stakes (research) conditions. 2nd-Brain is a low-stakes context by default but onboarding flows may inadvertently feel high-stakes; design implication is to never frame onboarding as evaluative.

## Faking in Personality Assessment

### Meta-analysis of applicant faking

6. Birkeland, S. A., Manson, T. M., Kisamore, J. L., Brannick, M. T., & Smith, M. A. (2006). A meta-analytic investigation of job applicant faking on personality measures. *International Journal of Selection and Assessment*, 14(4), 317–335. DOI: https://doi.org/10.1111/j.1468-2389.2006.00354.x

Meta-analyzed applicant vs. incumbent scores across 33 studies. Effect sizes: applicants score 0.11–0.45 SD higher than incumbents on Big Five traits, with the largest faking on Emotional Stability (d=0.44) and Conscientiousness (d=0.45) — the most job-relevant traits. **Critical for 2nd-Brain**: the *direction* of faking is toward the contextually-desirable trait. Implication: if 2nd-Brain framing suggests a "good user is X", users will drift toward X.

### Personnel selection — pro-test panel response

7. Morgeson, F. P., Campion, M. A., Dipboye, R. L., Hollenbeck, J. R., Murphy, K., & Schmitt, N. (2007). Reconsidering the use of personality tests in personnel selection contexts. *Personnel Psychology*, 60(3), 683–729. DOI: https://doi.org/10.1111/j.1744-6570.2007.00089.x

A six-author SIOP panel that argued personality tests retain incremental validity for selection *despite* faking — because the rank-order correlation between faked and honest responses is high enough that valid predictions remain possible. **Implication for 2nd-Brain**: even if users present somewhat-enhanced versions of themselves, longitudinal rank-order across multiple entries still carries signal. The risk is in *absolute level* claims (e.g., "you score 95th percentile on Conscientiousness"), not in *relative* signal (e.g., "Conscientiousness appears more consistently in your narrative than Openness").

### Faking as a construct — Oxford handbook

8. Ziegler, M., MacCann, C., & Roberts, R. D. (Eds.). (2011). *New perspectives on faking in personality assessment*. Oxford University Press. DOI: https://doi.org/10.1093/acprof:oso/9780195387476.001.0001

Edited volume (year of record varies between 2011 print and 2012 Oxford Academic indexing — the DOI record is 2011). The integrative volume on faking as a multidimensional, motivated, partly-trait phenomenon. Important chapter: Paulhus's own chapter argues SDR has both nuisance-bias and trait-substance components (consistent with Pauls & Stemmler 2003 above).

## Careless / Insufficient Effort Responding

### Identifying careless responses

9. Meade, A. W., & Craig, S. B. (2012). Identifying careless responses in survey data. *Psychological Methods*, 17(3), 437–455. DOI: https://doi.org/10.1037/a0028085

The canonical methodology paper. Recommends multiple indicators: response time (too fast), longstring (same answer repeated), Mahalanobis distance, even-odd consistency, and infrequency / bogus items ("I have lived on Mars"). Single indicators have false-positive rates of 5–10%; combining 2+ indicators improves precision. **2nd-Brain analogue**: in free-text journals, careless responding manifests as ultra-short entries, repeated boilerplate phrasing, or low lexical diversity across multiple entries — not as scale-survey artifacts.

### Detecting insufficient effort responding

10. Huang, J. L., Bowling, N. A., Liu, M., & Li, Y. (2015). Detecting insufficient effort responding with an infrequency scale: Evaluating validity and participant reactions. *Journal of Business and Psychology*, 30(2), 299–311. DOI: https://doi.org/10.1007/s10869-014-9357-6

Validates an infrequency-scale approach and importantly examines **participant reactions** — finding that infrequency items do not significantly degrade respondent experience when properly framed. **Implication for 2nd-Brain**: lightweight attention probes during onboarding are tolerable, but the journaling surface itself must NOT contain bogus-item attention checks (would break the reflective context).

## Acquiescence and Extreme Response Style

### Measuring extreme response style

11. Greenleaf, E. A. (1992). Measuring extreme response style. *Public Opinion Quarterly*, 56(3), 328–351. DOI: https://doi.org/10.1086/269326

The foundational paper on **Extreme Response Style (ERS)** — the tendency to use scale endpoints regardless of item content. Proposes that ERS measures be built from items with uncorrelated content and equal extreme-response base rates. This is the methodological standard later used by Weijters and Schimmack.

### Stability of response styles over time

12. Weijters, B., Geuens, M., & Schillewaert, N. (2010). The stability of individual response styles. *Psychological Methods*, 15(1), 96–110. DOI: https://doi.org/10.1037/a0018721

Longitudinal study (1-year gap, non-overlapping items) finding that **acquiescence, disacquiescence, midpoint, and extreme** response styles have substantial trait-like stability (r=.30–.50). Demographics explain only a small share. Implication: response style is an individual-difference variable, not just a noise component to scrub. For 2nd-Brain, this means recurring linguistic patterns across journal entries (always-superlative, always-hedging) are partly stable trait expression, not just bias.

### Acquiescent response bias as cultural communication style

13. Smith, P. B. (2004). Acquiescent response bias as an aspect of cultural communication style. *Journal of Cross-Cultural Psychology*, 35(1), 50–61. DOI: https://doi.org/10.1177/0022022103260380

Meta-analysis across 41 nations showing that acquiescence (yea-saying) varies systematically with cultural communication norms — higher in collectivist, high-power-distance nations. This is the empirical bridge to the §Cross-cultural variation section below.

## Self-Report as a Method — defense and limits

### The self-report method chapter

14. Paulhus, D. L., & Vazire, S. (2007). The self-report method. In R. W. Robins, R. C. Fraley, & R. F. Krueger (Eds.), *Handbook of research methods in personality psychology* (pp. 224–239). Guilford Press. **Book chapter — no Crossref DOI.** Cite by book ISBN: 978-1-59385-111-1.

Argues that despite known biases, self-report remains the **single most informative method** for personality assessment because (a) only the self has access to internal experience, (b) only the self has dense longitudinal observation of self-behavior across contexts, and (c) the alternatives (informant report, behavioral observation) have their own biases. The chapter advocates *triangulation* rather than self-report-replacement. **2nd-Brain alignment**: longitudinal journaling is closer to the self-as-observer ideal Paulhus & Vazire describe than is a one-shot Likert questionnaire.

### Self-Other Knowledge Asymmetry (SOKA) — which traits self knows better

15. Vazire, S. (2010). Who knows what about a person? The self–other knowledge asymmetry (SOKA) model. *Journal of Personality and Social Psychology*, 98(2), 281–300. DOI: https://doi.org/10.1037/a0017908

The most important paper in this batch for 2nd-Brain epistemics. SOKA model:

- **Self knows best**: internal-state traits (Neuroticism, anxiety, depression, self-esteem) — observability is low, evaluativeness is low → self has unique access.
- **Others know best**: evaluatively-loaded, externally-visible traits (intellect, creativity, attractiveness) — ego-protective biases distort self-view but observers see clearly.
- **Self and others equally good**: extraversion-related traits — both can observe.

**Direct implication for 2nd-Brain**: when Engine 2 infers a Neuroticism-related trait from journal text, the self-report basis is the most-reliable available signal. When Engine 2 attempts to infer Intellect / Openness / creative ability from journal text, the self-report basis is the *least*-reliable signal — observer ratings (peer feedback, written work quality) would be more informative if available.

### Self-other agreement at zero acquaintance

16. Hirschmüller, S., Egloff, B., Schmukle, S. C., Nestler, S., & Back, M. D. (2015). Accurate judgments of neuroticism at zero acquaintance: A question of relevance. *Journal of Personality*, 83(2), 221–228. DOI: https://doi.org/10.1111/jopy.12097

Important counter-nuance to Vazire 2010: when **relevant behavioral cues** are present, even strangers can detect Neuroticism accurately at zero acquaintance. This means the "self knows Neuroticism best" claim is bounded — under cue-rich conditions, observers also perform. For 2nd-Brain, this implies that journal *behaviors* described (sleep disruption, social withdrawal, repeated worry themes) carry observable cues that an inference engine can use, not solely the user's self-labels.

## Cross-Cultural Variation in Self-Report Style

### Reference-group effect — the foundational problem

17. Heine, S. J., Lehman, D. R., Peng, K., & Greenholtz, J. (2002). What's wrong with cross-cultural comparisons of subjective Likert scales? The reference-group effect. *Journal of Personality and Social Psychology*, 82(6), 903–918. DOI: https://doi.org/10.1037/0022-3514.82.6.903

The empirical paradox: cross-cultural experts agree East Asians are more collectivist than North Americans, but Likert-scale self-reports of individualism/collectivism *do not show this difference* — because respondents implicitly compare themselves to their own cultural reference group, washing out the absolute difference. **Direct implication for 2nd-Brain**: a Korean user's self-report of, e.g., "I am pretty independent" should NOT be interpreted with the same anchor as an American user's identical self-report. Reference-group adjustment is required before any cross-locale comparison.

### Middle response bias in East Asian samples

18. Chen, C., Lee, S., & Stevenson, H. W. (1995). Response style and cross-cultural comparisons of rating scales among East Asian and North American students. *Psychological Science*, 6(3), 170–175. DOI: https://doi.org/10.1111/j.1467-9280.1995.tb00327.x

Japanese and Chinese students used scale midpoints significantly more than American students; American students used extreme values more. Within each culture, individualism endorsement predicted extreme-value use, collectivism endorsement predicted midpoint use. **2nd-Brain implication**: for Korean users, midpoint preference is partly a stable cultural-communicative style, not exclusively informational ambivalence. Do NOT code midpoint responses as "low engagement" or "doesn't know themselves well" for Korean users.

### Korean acquiescence and consistency

19. Locke, K. D., & Baik, K. (2009). Does an acquiescent response style explain why Koreans are less consistent than Americans? *Journal of Cross-Cultural Psychology*, 40(2), 319–323. DOI: https://doi.org/10.1177/0022022108328915

Direct comparison: Koreans show higher acquiescence (yea-saying) than Americans, and this acquiescence partially mediates the "Korean self-reports are less internally consistent" finding. Implication: when measuring trait consistency from Korean journal text, expect a baseline level of agreement-with-context that reflects cultural communication style rather than self-knowledge deficit.

**Cross-reference**: see `cross-cultural-east-asian.md` for chemyon (체면 — social face) and honne/tatemae (本音/建前 — inner/outer feeling) as cultural constructs distinct from "faking". Chemyon is a stable interpersonal-presentation mode in Korean culture, NOT impression management in Paulhus's sense. Conflating them would be a category error.

## Detection in Text — and its limits

### Linguistic predictors of deception

20. Newman, M. L., Pennebaker, J. W., Berry, D. S., & Richards, J. M. (2003). Lying words: Predicting deception from linguistic styles. *Personality and Social Psychology Bulletin*, 29(5), 665–675. DOI: https://doi.org/10.1177/0146167203029005010

LIWC-based classifier achieved 67% accuracy in detecting deception in laboratory-induced lies. Liars used: fewer self-references ("I", "me"), more negative emotion words, fewer exclusive words ("but", "without"), lower cognitive complexity. **Critical caveat for 2nd-Brain**: this is *laboratory-induced* deception about specific topics, not journaling style. The classifier accuracy is far below threshold for any production-confidence claim about a specific user entry. Use only as *signal-aggregate* across many entries, never as per-entry verdict.

### Personality from blog text — and its ceiling

21. Yarkoni, T. (2010). Personality in 100,000 words: A large-scale analysis of personality and word use among bloggers. *Journal of Research in Personality*, 44(3), 363–373. DOI: https://doi.org/10.1016/j.jrp.2010.04.001

Large-N (N=694) analysis of bloggers' word use and Big Five scores. Many small but reliable correlations between specific words and traits (e.g., neurotic → "awful", "lazy", "depressing"; conscientious → "completed", "boring", "thank"). **Two implications**:
- (a) Long-form journal text **does** carry trait signal — supports 2nd-Brain's premise.
- (b) Individual correlations are small (r ≈ .10–.20); valid inference requires aggregation across many entries and many features. Single-entry inferences are over-confident by construction. Cross-link: `computational-personality.md` Park 2015 finds r ≈ .35–.40 ceiling for text-based personality prediction.

**Cross-reference**: `computational-personality.md` contains the full Pennebaker / Kosinski / Schwartz / Park lineage. This batch does not duplicate those rows; this is the *measurement-bias* lens on the same evidence base.

## Age Range Coverage

- **Child (0–12)**: not applicable — BIDR and most SDR instruments are validated for adolescent+. Children's self-report has its own developmental bias literature (acquiescence, social desirability differ by age) not covered in this batch. Defer to developmental-assessment literature for children.
- **Adolescent (13–17)**: partially applicable — SDR research has been extended to adolescents (Crowne-Marlowe and shortened BIDR adaptations exist), but the foundational literature here is adult-validated. Use with caution; expect higher acquiescence baseline.
- **Young Adult (18–29)**: applicable — primary sample for most SDR / faking / response-style studies (university undergraduates). All instruments in this batch validated on this range.
- **Adult (30–49)**: applicable — Birkeland (2006) and Morgeson (2007) cover working-age applicants and incumbents; Vazire (2010) SOKA includes adult community samples.
- **Midlife (50–64)**: applicable, with mild caveat — response-style stability over time (Weijters 2010) was studied at adult+. Midlife-specific SDR variation is under-studied; assume continuity.
- **Elderly (65+)**: applicable, with caveat — acquiescence tends to increase with age (Greenleaf 1992 and subsequent work, not all DOI-traceable here). Elderly journal entries may show higher "agreeable, conventional" framing as a cohort effect, not as faking.

## Application to 2nd-Brain

### Tier-A atomic-quote integrity check (Engine 2)

Per the v0.2 design doc, Tier A atomic quotes (direct user statements) are the highest-trust source. SDR-aware modifications:

1. **Flag candidates with elevated SDR linguistic markers** — high frequency of agency/communion superlatives ("always", "consistently", "deeply"), low frequency of specific behavioral detail, low frequency of negative-affect / negative-event references. These are *signals*, not verdicts.
2. **Reduce confidence band** when SDR signals are elevated AND the trait being inferred is in the **other-knows-best** SOKA quadrant (Intellect, creative ability, evaluatively-loaded traits). Do NOT reduce confidence when the trait is in the **self-knows-best** quadrant (Neuroticism, internal states) — Vazire 2010 explicitly grants the self privileged access there.
3. **Never** present a single high-SDR entry as a verdict about the user's honesty. Aggregate across ≥10 entries before applying any SDR weighting.
4. **Cross-check with cultural-context layer**: if user profile = KR (Korean), apply Locke & Baik (2009) acquiescence baseline before flagging — what looks like SDR may be cultural communicative style.

### When confidence is reduced — Advisor invitation, not accusation

Acceptable Advisor surfacing:
- "이 부분은 한 번 더 다른 각도에서 적어보고 싶다면 알려주세요." (Korean — invitation, no judgment)
- "We notice this came out really polished — want to revisit it from a more uncertain angle?" (English — invitation)
- "이게 본인한테 진짜 그렇게 느껴졌는지, 아니면 그렇게 보여야 한다고 생각했는지 — 두 가지 다 의미 있어요." (Korean — explicit dual-framing without accusation)

Forbidden Advisor surfacing:
- "We think you're not being honest with yourself." — accusation.
- "Your responses look socially desirable." — exposes the inference, breaks trust.
- "Try to be more authentic." — implies user has failed authenticity test.

### Long-form journal vs. single-shot survey

Paulhus & Vazire (2007) explicitly note that **density of observation** is one of the self's epistemic advantages. A 6-month journal with 100+ entries is closer to the self-as-observer ideal than a 40-item BIDR questionnaire. Implication: 2nd-Brain's longitudinal frame is *less* susceptible to acute IM than a recruiting-context personality test would be. Do NOT import the high-stakes-faking effect sizes from Birkeland (2006) wholesale; the contextual stakes differ.

However, *self-deceptive enhancement* (the second SDR component) can persist across long-form journaling — users can have stable, sincere, but inaccurate self-views (Vazire 2010). The remedy is not detection-and-confrontation; it is **triangulation** (cross-link to other observers if user invites it) and **specificity probes** (asking for concrete behavioral examples rather than self-labels).

### Interview Question Examples (validated)

**Korean**
- 최근에 누군가에게 "내가 좋은 사람이다"라는 인상을 주려고 신경 쓴 순간이 있나요? 어떤 순간이었어요? (Paulhus 1984 IM — invitation, not interrogation)
- 본인에 대해 "나는 X한 사람이다"라고 말할 때, 구체적인 사건이 떠오르는 X와, 막연히 그렇다고 믿고 있는 X가 있어요? (Vazire 2010 — separates evidenced self-view from belief-only self-view)
- 어떤 자리에서는 본인의 다른 면을 보여주게 되는데, 그게 본인한테 자연스러운가요, 아니면 신경 쓰이는 일인가요? (Pauls & Stemmler 2003 — substance-vs-bias framing; chemyon-friendly)

**English**
- Looking at what you just wrote, is there a part of you that's more uncertain about it than the words sound? (Paulhus 1984 — SDE invitation)
- For the traits you've described yourself as having — which ones could you point to a specific recent example for, and which feel more like a general sense? (Vazire 2010 — operationalization probe)
- Are there parts of yourself that you'd describe differently if you knew no one would ever read this? (Paulhus 1991 IM — hypothetical-private framing)

### Trait Extraction Cues

When evaluating an atomic quote for SDR-modulated confidence, check:

- **IM-marker pattern**: high frequency of socially-virtuous self-attribution without concrete events ("I always try to help others"; "I'm a very honest person"). Per Paulhus 1984, these load on IM rather than substantive trait.
- **SDE-marker pattern**: confident global self-assessments with no acknowledged limitation or uncertainty ("I know myself well"; "I have a clear sense of who I am"). Per Paulhus 1984, these load on SDE.
- **Specificity contrast**: high SDR signal when self-claims are abstract and not followed by concrete events; low SDR signal when self-claims are followed by detailed, dated, sensorially-specific events. (Bridge to `narrative-identity.md` McAdams agency-coherence-meaning operationalization.)
- **Acquiescence in journaling prompts**: if the prompt suggests a frame (e.g., "tell me about a time you grew") and the user's entry adopts the frame's vocabulary uncritically, treat as low evidential weight for the trait the prompt named. This is the *demand-characteristic* failure mode.
- **Korean-locale modifier**: midpoint / hedged framing ("어느 정도", "그런 편이에요", "딱히…") is the cultural-communicative norm (Chen 1995; Locke & Baik 2009), NOT a sign of low engagement or evasion.

### Advisor Guidance Patterns

- **Never accuse**. Replace any verdict-style surfacing with invitation-style: "would you like to revisit this from a different angle?"
- **Reduce-confidence-quietly**: when SDR signals are elevated for a specific trait, simply present the persona-card claim with wider confidence intervals; do not announce the SDR signal to the user.
- **Triangulate-with-invitation**: if user has invited friend / partner / coach feedback (consent-explicit), use that as cross-check for evaluatively-loaded traits (Vazire 2010 other-knows-best). Never auto-prompt user to invite triangulators.
- **Long-arc framing**: when a single entry seems polished, note it internally but wait for ≥10 entries before adjusting persona-card. Per Yarkoni (2010), single-entry text inference is too noisy.
- **Specificity probe over confrontation**: when SDR markers are high, the Advisor's next-question selector should prefer event-anchored prompts ("tell me about a specific time when…") over self-label prompts ("do you think you're a generous person?"). This is consistent with the entire 2nd-Brain Engine 4 specificity stance and aligns with the McAdams narrative-identity operationalization.
- **Cultural-context priority for Korean users**: before reducing confidence on apparent acquiescence / midpoint pattern, verify against the user's declared locale and the chemyon/we-ness layer in `cross-cultural-east-asian.md`.

## Cautions & Limitations

### 1. SDR detection in free-text is itself error-prone

Newman et al. (2003) achieved 67% deception-detection accuracy in *laboratory-induced* lies on specific topics — and that's the optimistic ceiling. Free-form journal text, no ground truth, no controlled topic: any per-entry SDR verdict from text features is no better than chance for many entries. Use SDR signal only as **aggregate** across ≥10 entries and only as **confidence-band modifier**, never as accusation.

### 2. SDR and substantive trait overlap

Pauls & Stemmler (2003) — and the broader Paulhus 2002 reformulation — establish that BIDR scores correlate with real personality (low N, high C, high A). A "high-SDR" user may genuinely be conscientious and emotionally stable. Treating SDR score as evidence of dishonesty conflates measurement-bias with substantive trait.

### 3. Cultural face-saving (체면) is NOT faking

Korean chemyon (Kim & Yang 2011 in `cross-cultural-east-asian.md`) and Japanese honne/tatemae (Bachnik 2007 in `cross-cultural-east-asian.md`) describe *functional, culturally-validated* presentation-modulation across contexts. They are not IM in Paulhus's sense (which presumes a "real self" being concealed from a misled audience). The Suh (2002) finding — Korean identity-consistency-across-contexts correlates less with wellbeing than American consistency does — directly supports treating contextual self-presentation as adaptive in collectivist cultures.

**Operational rule**: never apply Paulhus IM weights to entries that differ across contexts for a Korean / Japanese user without first cross-checking the cultural layer. The 2nd-Brain cultural-priority function (v0.2 §06) takes precedence here.

### 4. Self-other agreement is bounded — both directions

Vazire (2010) SOKA: the self has privileged access to internal-state traits (Neuroticism, anxiety, self-esteem). Observers have privileged access to evaluatively-loaded traits (intellect, creativity). Neither monopoly is total. **2nd-Brain implication**: do not over-weight self-report for Intellect-quadrant traits, and do not under-weight self-report for Neuroticism-quadrant traits. The mapping is trait-specific, not blanket.

### 5. Long-form journaling is less susceptible to acute IM, but not to SDE

Paulhus's two-component model separates IM (conscious, context-driven, fades when stakes drop) from SDE (sincere over-positive self-view, stable across contexts). Longitudinal journaling reduces acute IM (low stakes, private context) but does NOT reduce SDE — a user can sincerely believe overly-positive things about themselves across hundreds of entries. SDE is the harder problem for 2nd-Brain, and the right intervention is **specificity probes** + **(invited, never auto) triangulation**, not detection-and-confrontation.

### 6. Accusing the user of dishonesty has high cost, low benefit

Even when SDR detection is accurate, surfacing the inference to the user (a) damages trust, (b) tends to *increase* IM rather than reduce it (defensive correction), and (c) violates the 2nd-Brain product principle that the system is the user's tool, not their auditor. The maximum-acceptable surfacing is invitation to revisit ("어떤 부분이 평소처럼 안 나왔다 싶으면 알려주세요"), never accusation.

### 7. Single-entry inference is unreliable; cohort drift over time is the signal

Yarkoni (2010) establishes that text-feature → trait correlations are r ≈ .10–.20 per feature, requiring large aggregation. Park et al. (2015, in `computational-personality.md`) finds the practical ceiling at r ≈ .35–.40 even with thousands of words per user. Implication: single-entry SDR flags should never trigger any user-facing action. Multi-month drift in a user's narrative pattern (a sudden shift toward polished framing, a sudden disappearance of specific events) is the higher-signal pattern, and even that is invitation-worthy at most.

### 8. SDR-detection tools (BIDR, MCSDS, etc.) are validated on Likert questionnaires, not free-text journals

This is the most-important limitation. The instruments (BIDR — Paulhus 1991; MCSDS — Crowne & Marlowe 1960, not added as a row here because superseded by BIDR for most purposes) are 40-item Likert scales scored against published norms. **There is no validated SDR-from-free-text instrument**. Any SDR-from-text inference 2nd-Brain runs is *engineering heuristic* informed by this literature, not a validated measurement. Always label such signals as heuristic-derived in any internal scoring, never as a measured score.

### 9. Demographic / age-cohort acquiescence drift

Greenleaf (1992) and follow-up literature note that acquiescence tends to increase with age. Elderly user entries may show higher "agreeable, conventional" framing as a cohort effect — do not pathologize as faking or as cognitive decline. This interacts with the `soc-successful-aging.md` integrity-stage findings.

### 10. The judge-mode honeypot interacts with this

C6 (judge-mode auto-flag for `@xprize.org`, `@devpost.com`, `@hacker.fund`) explicitly anticipates that *judges* will create accounts and exercise SDR / IM in ways that differ from organic users. Birkeland (2006) effect sizes for high-stakes contexts (0.11–0.45 SD inflation on socially-relevant traits) are directly applicable to judge accounts. The judge-mode flag is the right operational response — it changes downstream evaluation rather than confronting the judge.

## Cross-References to Other Batches

- `cross-cultural-east-asian.md` — chemyon (Kim & Yang 2011), honne/tatemae (Bachnik 2007), Suh (2002) identity-consistency-across-contexts, Heine (2002) reference-group effect — the cultural-context layer that gates SDR application for KR/JP users.
- `computational-personality.md` — Pennebaker LIWC, Kosinski 2013, Schwartz 2013, Park 2015 (text → trait ceiling r ≈ .35–.40), Maharjan 2025 LLM benchmark. The text-inference reliability layer that bounds Engine 2 confidence regardless of SDR question.
- `narrative-identity.md` — McAdams agency-coherence-meaning operationalization; specificity-of-event vs. abstract-self-label is the McAdams-derived signal we use to distinguish SDE / IM markers from grounded self-knowledge.
- `self-knowledge.md` — Trapnell & Campbell (1999) reflection vs rumination; Grant et al. (2002) SRIS reflection-vs-insight distinction. A user high in rumination is NOT high in IM — the linguistic surface looks different.
- `assessment-landscape.md` — for BIDR / SDR / faking discussion in the broader assessment-tiering frame.
- `data-ethics-consent.md` — invitation-based triangulation (peer / coach feedback) requires explicit consent; never auto-prompt user to invite triangulators.
- `crisis-detection.md` — crisis-content detection supersedes any SDR weighting. A user writing polished, controlled, low-affect entries about a crisis topic is at *higher* risk per De Choudhury 2017 findings, not lower.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/self-report-bias.sql` (to be created in companion commit). Rows tagged `framework='self_report_bias'` with sub-slugs `sdr_foundational`, `faking_personnel`, `careless_responding`, `response_style`, `self_other_knowledge`, `cultural_response_style`, `text_deception`.

```sql
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Two-component models of socially desirable responding',
    ARRAY['Delroy L. Paulhus'],
    '10.1037/0022-3514.46.3.598',
    'https://doi.org/10.1037/0022-3514.46.3.598',
    'self_report_bias',
    'adult',
    'en',
    now(),
    '사회적 바람직성 응답(SDR)을 인상관리(IM, 의식적)와 자기기만적 고양(SDE, 무의식적)의 두 요인으로 분리한 정초 논문. BIDR의 이론적 기반.',
    'Foundational paper separating socially desirable responding into Impression Management (conscious, audience-driven) and Self-Deceptive Enhancement (sincere but inflated self-view). Theoretical basis for the BIDR.',
    'Tier A 원자 인용문에서 SDR 신호를 탐지할 때 IM(이벤트 없는 미덕 주장)과 SDE(불확실성 없는 자기 진단)를 구분해 confidence 조정에 반영. 절대 사용자에게 직접 고지하지 않음.'
  );
-- (additional rows for all 16 DOI-verified entries follow same pattern)
```

## Verification Summary

- **DOIs verified via Crossref** in this curation pass: **16**
  1. Paulhus 1984 — `10.1037/0022-3514.46.3.598`
  2. Pauls & Stemmler 2003 — `10.1016/S0191-8869(02)00187-3`
  3. Lanyon & Carle 2007 — `10.1177/0013164406299104`
  4. Birkeland et al. 2006 — `10.1111/j.1468-2389.2006.00354.x`
  5. Morgeson et al. 2007 — `10.1111/j.1744-6570.2007.00089.x`
  6. Ziegler/MacCann/Roberts 2011 (Oxford book) — `10.1093/acprof:oso/9780195387476.001.0001`
  7. Meade & Craig 2012 — `10.1037/a0028085`
  8. Huang et al. 2015 — `10.1007/s10869-014-9357-6`
  9. Greenleaf 1992 — `10.1086/269326`
  10. Weijters et al. 2010 — `10.1037/a0018721`
  11. Smith 2004 — `10.1177/0022022103260380`
  12. Vazire 2010 (SOKA) — `10.1037/a0017908`
  13. Hirschmüller et al. 2015 — `10.1111/jopy.12097`
  14. Heine et al. 2002 — `10.1037/0022-3514.82.6.903`
  15. Chen/Lee/Stevenson 1995 — `10.1111/j.1467-9280.1995.tb00327.x`
  16. Locke & Baik 2009 — `10.1177/0022022108328915`

  Plus auxiliary cross-reference (also added as row because directly used in §Detection in Text):

  17. Newman/Pennebaker/Berry/Richards 2003 — `10.1177/0146167203029005010`

- **Foundational sources without Crossref DOI (cited but NOT added as `knowledge_sources` rows per C8)**: Paulhus 1991 BIDR chapter (book ISBN 0-12-590241-7); Paulhus 2002 SDR-evolution chapter (book ISBN 0-8058-3899-7); Paulhus & Vazire 2007 self-report-method chapter (book ISBN 978-1-59385-111-1). Each is a canonical reference in the SDR literature but pre-2005 chapters from these publishers lack DOIs. They are retained as cited foundational sources in §Foundational Sources; downstream rows reference them by ISBN.

- **Excluded constructs** (intentional, not oversight):
  - **MCSDS (Crowne-Marlowe Social Desirability Scale, 1960)** — superseded by BIDR for most contemporary uses; Paulhus 1991/2002 explicitly recommend BIDR over MCSDS. Not added as a row.
  - **Crowne & Marlowe 1960 *Journal of Consulting Psychology* paper** — pre-DOI era; would be cited by ISSN/volume/page only. Excluded.

- **[NO VERIFIED SOURCE] gaps**: 0 in this curation pass.

- **Total verified DOI rows for SQL seed**: 17 (16 required-scope + 1 cross-link to text-deception detection).
