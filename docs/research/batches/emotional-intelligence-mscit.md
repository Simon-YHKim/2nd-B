# Framework: Emotional Intelligence — Ability Model (MSCEIT Lineage)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref (May 2026).
>
> **Why this batch exists**: 2nd-Brain v0.2 design names MSCEIT (Mayer–Salovey–Caruso Emotional Intelligence Test) and the ability model of EI as the framework for the emotional dimension. This document justifies that choice, draws the **ability-EI vs. trait-EI** line, and sets the boundaries for what journal-text inference can and cannot say about a user's emotional intelligence.
>
> **Headline**: ability-EI (perceive → use → understand → manage emotions, measured as maximum performance) is the only EI model with a strong claim to being an *intelligence* (MacCann et al. 2014; Mayer, Roberts, & Barsade 2008). It cannot be administered through a journaling app — so 2nd-Brain treats EI-related signals from text as **vocabulary and reflection scaffolding only**, never as a score.

## AI Retrieval Guide (for RAG / Wiki use)

**When user input touches** → **look here**:
- "Why MSCEIT and not Bar-On / TEIQue / EQ-i?" → §Foundational + §Ability-EI vs Trait-EI + Mayer, Caruso, & Salovey (2016)
- "Is emotional intelligence a real intelligence?" → MacCann et al. (2014) + Mayer, Roberts, & Barsade (2008) + Maul (2012) critique
- "Can EI be measured from journal text?" → §Cautions + §Application + Joseph & Newman (2010) + linguistic-marker note
- "What does EI predict?" → Joseph & Newman (2010) cascading model + O'Boyle et al. (2011) meta-analysis
- "Is trait-EI just personality?" → Petrides & Furnham (2001) + Joseph & Newman cascading model
- Korean user, EI scale → Jeong, Choi, & Park (2020) K-WLEIS + Kim & Woo (2022) K-SEIS
- "Brody / Locke critique of EI" → Brody (2004) commentary + Maul (2012)

## Foundational Sources

1. Salovey, P., & Mayer, J. D. (1990). Emotional intelligence. *Imagination, Cognition and Personality*, 9(3), 185–211. DOI: https://doi.org/10.2190/DUGG-P24E-52WK-6CDG
   - The originating paper. EI defined as "the ability to monitor one's own and others' feelings and emotions, to discriminate among them, and to use this information to guide one's thinking and action." Predates the ability/trait split — sets the **ability** trajectory the authors later developed.
2. Mayer, J. D., & Salovey, P. (1993). The intelligence of emotional intelligence. *Intelligence*, 17(4), 433–442. DOI: https://doi.org/10.1016/0160-2896(93)90010-3
   - **The argument that EI deserves the word "intelligence."** Lays out why EI must be measured as ability (maximum performance), not as a self-report personality trait. This is the conceptual seed for MSCEIT.
3. Mayer, J. D., Salovey, P., Caruso, D. R., & Sitarenios, G. (2003). Measuring emotional intelligence with the MSCEIT V2.0. *Emotion*, 3(1), 97–105. DOI: https://doi.org/10.1037/1528-3542.3.1.97
   - **The MSCEIT V2.0 validation paper.** 141-item ability test scored against expert and consensus criteria across four branches: (1) Perceiving emotions, (2) Using emotions to facilitate thought, (3) Understanding emotions, (4) Managing emotions. N=2,112. Reports adequate reliability (full-scale α ≈ .91 consensus; .90 expert) and the **four-branch hierarchical factor structure** that anchors the model.
4. Mayer, J. D., Roberts, R. D., & Barsade, S. G. (2008). Human abilities: Emotional intelligence. *Annual Review of Psychology*, 59, 507–536. DOI: https://doi.org/10.1146/annurev.psych.59.103006.093646
   - **Annual Review** consolidation. Distinguishes (a) ability-EI (MSCEIT family, performance-based), (b) self-report mixed-model EI (Bar-On EQ-i, Goleman-style), and (c) trait-EI (TEIQue, self-perceived emotional self-efficacy). Argues only (a) qualifies as a cognitive ability in the psychometric sense.
5. Mayer, J. D., Caruso, D. R., & Salovey, P. (2016). The ability model of emotional intelligence: Principles and updates. *Emotion Review*, 8(4), 290–300. DOI: https://doi.org/10.1177/1754073916639667
   - **Authoritative current statement of the ability model.** Reaffirms the four-branch architecture, addresses two decades of critique, and clarifies that "EI" without the ability/trait qualifier is meaningless in scientific writing. This is the citation 2nd-Brain anchors on for the emotional dimension's framework choice.

> *Note on Mayer & Salovey (1997) "What is emotional intelligence?" book chapter in Salovey & Sluyter (Eds.), Emotional Development and Emotional Intelligence (Basic Books): the chapter has no Crossref DOI — book chapters from this 1997 edited volume were not DOI-registered. The 1993 *Intelligence* paper and the 2003 / 2016 papers above cover the same theoretical material and are DOI-verifiable.*

## MSCEIT Validation & Critique (last 10–20 years)

1. MacCann, C., Joseph, D. L., Newman, D. A., & Roberts, R. D. (2014). Emotional intelligence is a second-stratum factor of intelligence: Evidence from hierarchical and bifactor models. *Emotion*, 14(2), 358–374. DOI: https://doi.org/10.1037/a0034755
   - **The strongest construct-validity result for ability-EI.** Hierarchical and bifactor structural models on a large MSCEIT dataset show that EI sits as a **second-stratum factor under g**, distinct from but related to general intelligence. This is the empirical claim that ability-EI is *an* intelligence, not merely a label.
2. Maul, A. (2012). The validity of the Mayer–Salovey–Caruso Emotional Intelligence Test (MSCEIT) as a measure of emotional intelligence. *Emotion Review*, 4(4), 394–402. DOI: https://doi.org/10.1177/1754073912445811
   - **The strongest construct critique of MSCEIT.** Argues consensus and expert scoring conflate skill with conformity to majority/expert opinion, and that the "Understanding" branch behaves more like vocabulary than emotional skill. **2nd-Brain implication**: do not assume MSCEIT-like consensus scoring transfers to free-text journaling.
3. Joseph, D. L., & Newman, D. A. (2010). Emotional intelligence: An integrative meta-analysis and cascading model. *Journal of Applied Psychology*, 95(1), 54–78. DOI: https://doi.org/10.1037/a0017286
   - **The cascading model.** Meta-analysis (k≈190) showing the four branches of ability-EI predict job performance in cascade: Perceive → Understand → Manage → Performance, with Manage doing most of the predictive work. Ability-EI predicts performance incrementally beyond cognitive ability and Big Five, but **effects are small** (ρ ≈ .15–.30 depending on job emotional-labor demands).
4. O'Boyle, E. H., Humphrey, R. H., Pollack, J. M., Hawver, T. H., & Story, P. A. (2011). The relation between emotional intelligence and job performance: A meta-analysis. *Journal of Organizational Behavior*, 32(5), 788–818. DOI: https://doi.org/10.1002/job.714
   - **The other major EI–performance meta-analysis** (k=43). Confirms incremental validity of all three EI streams (ability, self-report, mixed) over cognitive ability and Big Five for job performance. Mixed-model EI shows largest raw correlations but smallest *incremental* validity once personality is controlled — a key argument for preferring the ability stream conceptually.

## Ability-EI vs Trait-EI Debate

1. Petrides, K. V., & Furnham, A. (2001). Trait emotional intelligence: Psychometric investigation with reference to established trait taxonomies. *European Journal of Personality*, 15(6), 425–448. DOI: https://doi.org/10.1002/per.416
   - **The trait-EI manifesto.** Petrides & Furnham argue EI is best conceived as a **lower-order personality trait** (self-perceived emotional self-efficacy), measured by self-report (TEIQue), and located within Big Five space — not as a cognitive ability. This is the **explicit alternative** to the Mayer–Salovey program. Subsequent work shows trait-EI overlaps heavily with Big Five (especially low Neuroticism + high Extraversion + high Conscientiousness).
2. Brody, N. (2004). What cognitive intelligence is and what emotional intelligence is not. *Psychological Inquiry*, 15(3), 234–238. (Within: COMMENTARIES on "Seven Myths About Emotional Intelligence" and "Emotional Intelligence: Theory, Findings, and Implications". DOI: https://doi.org/10.1207/s15327965pli1503_03 — umbrella commentaries DOI; Brody's individual commentary is not separately DOI-registered.)
   - **The classic skeptic's argument.** Brody contends that MSCEIT scoring confounds emotional skill with knowledge of cultural emotional norms and that incremental validity over g and Big Five is weaker than proponents claim. Cite as the conservative position. Pair with MacCann et al. (2014) for the counterargument.

**Synthesis** (per Mayer, Roberts, & Barsade 2008): three EI families exist in the literature.
- **(a) Ability EI** — MSCEIT family. Performance-based. Strongest construct claim. Modest predictive effects, but truly incremental over g and Big Five.
- **(b) Self-report mixed-model EI** — Bar-On EQ-i, Goleman. Mixes personality, motivation, social skills. High criterion validity but minimal incremental validity over Big Five.
- **(c) Trait EI** — TEIQue (Petrides & Furnham). Self-perceived emotional self-efficacy. Sits inside Big Five space; not an ability.

2nd-Brain's emotional dimension references **family (a)** as the conceptual scaffold, never as a deliverable score.

## Korean-Context Adaptations

1. Jeong, S., Choi, M., & Park, S. (2020). The reliability and validity of Korean version of the Wong and Law Emotional Intelligence Scale (K-WLEIS). *Journal of Korean Academy of Nursing*, 50(4), 547–559. DOI: https://doi.org/10.4040/jkan.20109
   - K-WLEIS validation in Korean nurses. 16-item self-report covering self-emotion appraisal, others' emotion appraisal, use of emotion, regulation of emotion. **Self-report — closer to trait-EI than to ability-EI**, but the WLEIS items operationalize the four Mayer–Salovey branches conceptually. Reports adequate reliability and factor structure in a Korean sample.
2. Kim, J. G., & Woo, Y. J. (2022). Validation of the Korean version of Schutte Emotional Intelligence Scale (K-SEIS) in college students. *Journal of Human Understanding and Counseling*, 43(2), 27–48. DOI: https://doi.org/10.30593/jhuc.43.2.2
   - K-SEIS validation in Korean college students. 33-item self-report based on the Salovey & Mayer (1990) framework. Reports four-factor structure and concurrent validity with related Korean wellbeing/affect measures. Same caveat: self-report ≠ ability test.

**No K-MSCEIT exists** as of 2026-05 in DOI-indexed Korean academic literature. Korean EI validations to date are self-report instruments (K-WLEIS, K-SEIS, K-TEIQue translations in education journals without strong validation pipelines). This **reinforces the boundary**: 2nd-Brain cannot administer ability-EI in Korean either, so the conceptual scaffold approach applies uniformly across locales.

## Age Range Coverage

- **Child (0–12)**: **partially** — MSCEIT-YV (Youth Version) exists for ages 10–17 (Rivers et al., separate from main MSCEIT). For ages <10, use developmentally appropriate emotion-understanding tasks (Pons & Harris TEC) rather than MSCEIT. Under-14 users remain outside the main 2nd-Brain app.
- **Adolescent (13–17)**: **applicable** for 14-17 users with MSCEIT-YV evidence; 13-year-olds remain outside the main app. Adult MSCEIT V2.0 is validated 17+.
- **Young Adult (18–29)**: **applicable** — largest evidence base. MSCEIT V2.0 normed primarily on adult samples in this range.
- **Adult (30–49)**: **applicable** — strong evidence base. Job-performance meta-analyses (Joseph & Newman 2010; O'Boyle et al. 2011) draw heavily from this range.
- **Midlife (50–64)**: **applicable** — MSCEIT validation extends here; modest age-related improvements reported in Understanding and Managing branches (consistent with crystallized-ability patterns).
- **Elderly (65+)**: **applicable with caution** — some research suggests Perceiving-branch declines with age (face-perception confound). MSCEIT normative data thins past 65. Korean validations cited above are primarily young/middle adult.

## Application to 2nd-Brain

### Interview Question Examples (validated)

Items are inspired by the four MSCEIT branches (Perceive, Use, Understand, Manage) but reformulated as open-ended reflection prompts. **Do not present as a diagnostic test.** Do not score branch performance from text; use these to elicit vocabulary about emotional experience.

**Korean**
- 최근 며칠 동안 가장 또렷하게 느꼈던 감정 하나를 떠올려보면, 그게 어떤 감정이었고 어디서 알아챘나요? (Perceive — 감정 인식)
- 어떤 기분일 때 일이 더 잘 풀리고, 어떤 기분일 때는 일을 미루게 되시나요? (Use — 사고 촉진)
- '실망'과 '서운함'은 비슷해 보이지만 다르게 쓰이잖아요. 본인에게 두 단어가 다르게 다가오는 순간이 있다면 언제인가요? (Understand — 감정 이해)
- 강한 감정이 올라왔을 때 본인이 가장 자주 쓰는 진정 방식은 무엇인가요? 그게 효과가 있던 때와 없던 때를 비교해보면요? (Manage — 감정 조절)

**English**
- Think of an emotion you've felt clearly in the last few days. What was it, and how did you notice it? (Perceive)
- When you're in what mood does your work go best — and when does it stall? (Use)
- "Disappointed" and "let down" sound similar but feel different. When does that difference matter to you? (Understand)
- When a strong emotion hits, what's your go-to way to settle yourself? When does it work, and when doesn't it? (Manage)

### Trait Extraction Cues

**Critical framing**: 2nd-Brain does **not** estimate an EI score from text. What it can do is observe whether the user's writing demonstrates engagement with the four branches and surface gaps as reflection invitations — not as deficits.

- **Perceive branch signals in text**: granularity of emotion words (e.g., distinguishes 화·서운함·억울함·실망 vs. lumps all as "기분 나쁨"); attention to others' emotional states; somatic emotion descriptions ("가슴이 답답하다") indicating interoceptive awareness.
- **Use branch signals**: explicit links between mood and behavior choice ("이 기분일 때는 단순 작업이 잘 된다"); use of emotional states as information rather than noise to suppress.
- **Understand branch signals**: causal reasoning about emotion ("그게 왜 그렇게 화났는지 생각해보면…"); recognition of mixed/blended emotions; awareness of emotional transitions ("처음엔 X였는데 나중엔 Y가 됐다").
- **Manage branch signals**: described strategies (reappraisal, distraction, social support, problem-solving); reflection on what worked vs. didn't; acceptance language without suppression.

**Rule**: Do not classify on a single entry. Patterns must be observed across ≥10 entries with explicit user invitation to discuss before any branch-level feedback. **Never assign an EI number or letter grade.** All output is descriptive ("당신의 일기에는 감정을 구분하는 단어가 풍부합니다 — 이게 본인이 느끼기에 맞는 묘사인가요?") and invitational, not evaluative.

### Advisor Guidance Patterns

- Use the four-branch vocabulary as **conversation scaffolding**, not as scoring rubric. Phrasing template: "당신의 글에서는 [Perceive/Use/Understand/Manage 중 한 가지]가 자주 보입니다. 다른 측면은 어떻게 다가오시나요?"
- Anchor any guidance in Joseph & Newman (2010) **cascading model**: Perceive → Understand → Manage. If a user struggles to name emotions (Perceive), do not jump to regulation strategies (Manage). Build vocabulary first.
- For users who self-identify as "low EI": cite Mayer, Caruso, & Salovey (2016) on EI as developable ability — but **do not promise quantifiable improvement**. The evidence base on EI training programs is mixed and not 2nd-Brain's claim to make.
- For users who self-identify as "high EQ" from popular tests (Goleman / EQ-i style): gently distinguish ability-EI from self-report EI without invalidating their experience. Phrasing: "감정에 대한 자기 평가와, 감정 과제 수행 능력은 서로 다른 측면을 측정합니다. 둘 다 의미가 있어요."
- **Never** route an EI concern through a clinical lens. EI is a non-clinical individual-difference variable. Crisis content always supersedes (see `crisis-detection.md`).
- Cross-reference: high Negative Emotionality + low Perceive-branch signals → see `big-five.md` and consider whether granularity-of-emotion prompts (Feldman Barrett tradition) would help.

## Cautions & Limitations

- **MSCEIT is a copyrighted, proprietary instrument** owned by MHS (Multi-Health Systems). **2nd-Brain cannot administer it.** Do not embed MSCEIT items, scoring tables, or normative data into the product. The framework citation in `DESIGN.md` is conceptual scaffolding only.
- **Journal-text inference is supplementary, not equivalent.** Ability-EI by definition requires a maximum-performance test against consensus/expert criteria (Mayer, Caruso, & Salovey 2016). Free-text journaling produces typical performance under non-standardized conditions. The two are not interchangeable. Any 2nd-Brain output about a user's "emotional intelligence" must use hedged, descriptive language and never a score.
- **Trait-EI and ability-EI must not be conflated.** Self-report scales (Bar-On EQ-i, TEIQue, WLEIS, SEIS, K-WLEIS, K-SEIS) measure self-perceived emotional self-efficacy and overlap substantially with Big Five. Ability-EI (MSCEIT) measures performance on emotional tasks against external criteria. They are different constructs. If 2nd-Brain ever uses a self-report EI scale, it must be labeled as such — never as a measure of "EI" without qualifier.
- **Modest predictive validity**: even the strongest meta-analyses (Joseph & Newman 2010; O'Boyle et al. 2011) report job-performance effects in the ρ ≈ .15–.30 range. EI is not a master variable. Do not market 2nd-Brain as boosting EI or implying that low EI explains life outcomes — this overclaims the evidence.
- **Cultural caveat on Perceive branch**: emotion-recognition tasks based on Western (often US college student) facial-expression stimuli show modest cross-cultural variability. Korean users may produce different consensus patterns. The four-branch *structure* appears to replicate broadly, but normative comparisons across cultures are weak. Reference Korean self-report validations cited above for Korean users, not Western MSCEIT norms.
- **No clinical claim**: low EI is not a disorder and 2nd-Brain does not screen for, diagnose, or treat alexithymia or any related clinical construct. If a user's writing suggests genuine difficulty identifying or describing emotion across many entries combined with distress markers, route per `ai-mental-health-safety.md` and `crisis-detection.md` — do not interpret as an EI deficit to "fix."
- **Brody (2004) and Maul (2012) critiques remain unresolved.** The construct validity of MSCEIT's consensus scoring is debated. 2nd-Brain treats ability-EI as the **best available conceptual framework** for emotional skills, while acknowledging the construct is still maturing.
- **No diagnostic use under any circumstances.** EI is not in DSM or ICD. Do not link EI patterns to any diagnostic category.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/emotional-intelligence-mscit.sql` for the executable version. Inline SQL preview:

```sql
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale, summary_ko, summary_en, application_notes)
values
  (
    'Emotional intelligence',
    ARRAY['Salovey, P.', 'Mayer, J. D.'],
    '10.2190/DUGG-P24E-52WK-6CDG',
    'https://doi.org/10.2190/DUGG-P24E-52WK-6CDG',
    'ability_ei',
    'adult',
    'en',
    'EI를 자신과 타인의 감정을 인식·식별·활용하는 능력으로 처음 정의한 1990년 원논문. 이후 능력 모델(ability model)로 발전하는 출발점.',
    'The 1990 origin paper defining EI as the ability to monitor, discriminate, and use emotions. Conceptual seed for the ability-model trajectory.',
    'Framework anchor only. Do not use as a measurement tool.'
  ),
  (
    'The intelligence of emotional intelligence',
    ARRAY['Mayer, J. D.', 'Salovey, P.'],
    '10.1016/0160-2896(93)90010-3',
    'https://doi.org/10.1016/0160-2896(93)90010-3',
    'ability_ei',
    'adult',
    'en',
    'EI가 왜 "지능(intelligence)"이라는 단어를 쓸 자격이 있는지 논증. 자기보고가 아니라 능력 검사로 측정되어야 한다는 핵심 주장을 처음 제시.',
    'The argument for EI as an intelligence, requiring maximum-performance (not self-report) measurement. Seed of the MSCEIT program.',
    'Cite when explaining why MSCEIT lineage is preferred over self-report EI measures.'
  ),
  (
    'Measuring emotional intelligence with the MSCEIT V2.0',
    ARRAY['Mayer, J. D.', 'Salovey, P.', 'Caruso, D. R.', 'Sitarenios, G.'],
    '10.1037/1528-3542.3.1.97',
    'https://doi.org/10.1037/1528-3542.3.1.97',
    'ability_ei',
    'adult',
    'en',
    'MSCEIT V2.0 표준 검증 논문. 4개 가지(인식·활용·이해·조절) 위계 구조, N=2,112, 신뢰도와 요인 구조 보고.',
    'The standard MSCEIT V2.0 validation paper. Establishes the four-branch hierarchy and reports reliability/factor structure (N=2,112).',
    'Reference for the four-branch framework. 2nd-Brain uses branch vocabulary as prompts, not MSCEIT items.'
  ),
  (
    'Human abilities: Emotional intelligence',
    ARRAY['Mayer, J. D.', 'Roberts, R. D.', 'Barsade, S. G.'],
    '10.1146/annurev.psych.59.103006.093646',
    'https://doi.org/10.1146/annurev.psych.59.103006.093646',
    'ability_ei',
    'adult',
    'en',
    'Annual Review 통합 정리. 능력-EI(MSCEIT)와 자기보고 혼합 모델(Bar-On)과 특성-EI(TEIQue)를 명확히 구분.',
    'Annual Review consolidation distinguishing ability-EI (MSCEIT), mixed-model self-report EI (Bar-On), and trait-EI (TEIQue).',
    'Use to explain to users why "high EQ" from popular tests is a different construct than ability-EI.'
  ),
  (
    'The ability model of emotional intelligence: Principles and updates',
    ARRAY['Mayer, J. D.', 'Caruso, D. R.', 'Salovey, P.'],
    '10.1177/1754073916639667',
    'https://doi.org/10.1177/1754073916639667',
    'ability_ei',
    'adult',
    'en',
    '능력 모델의 권위 있는 현행 정리. 4가지 가지 구조를 재확인하고 20년간의 비판에 응답.',
    'Authoritative current statement of the ability model. Reaffirms the four-branch architecture and addresses two decades of critique.',
    'Primary citation for 2nd-Brain DESIGN.md emotional-dimension framework choice.'
  ),
  (
    'Emotional intelligence is a second-stratum factor of intelligence: Evidence from hierarchical and bifactor models',
    ARRAY['MacCann, C.', 'Joseph, D. L.', 'Newman, D. A.', 'Roberts, R. D.'],
    '10.1037/a0034755',
    'https://doi.org/10.1037/a0034755',
    'ability_ei',
    'adult',
    'en',
    '능력-EI가 g 아래의 2차 요인(second-stratum factor)으로 자리 잡는다는 가장 강한 구성 타당도 근거. 위계·이중 요인 모델로 검증.',
    'The strongest construct-validity result: ability-EI sits as a second-stratum factor under g via hierarchical and bifactor models.',
    'Cite when defending ability-EI as a real intelligence against trait-EI / Brody critique.'
  ),
  (
    'The validity of the Mayer–Salovey–Caruso Emotional Intelligence Test (MSCEIT) as a measure of emotional intelligence',
    ARRAY['Maul, A.'],
    '10.1177/1754073912445811',
    'https://doi.org/10.1177/1754073912445811',
    'ability_ei',
    'adult',
    'en',
    'MSCEIT 구성 타당도에 대한 가장 강한 비판. 합의·전문가 점수 방식이 감정 능력보다 다수 의견에의 동조를 측정한다는 지적.',
    'The strongest construct critique of MSCEIT: consensus/expert scoring may conflate emotional skill with conformity to majority opinion.',
    'Use as the honesty footnote when citing MSCEIT lineage. 2nd-Brain explicitly does not import MSCEIT scoring assumptions into text inference.'
  ),
  (
    'Emotional intelligence: An integrative meta-analysis and cascading model',
    ARRAY['Joseph, D. L.', 'Newman, D. A.'],
    '10.1037/a0017286',
    'https://doi.org/10.1037/a0017286',
    'ability_ei',
    'adult',
    'en',
    '능력-EI의 4가지가 직무 성과를 캐스케이드(Perceive→Understand→Manage→Performance)로 예측한다는 메타분석. 효과는 점진적이지만 작다(ρ≈.15–.30).',
    'Meta-analysis demonstrating the cascading model: Perceive→Understand→Manage→Performance, with incremental but modest effects beyond g and Big Five.',
    'Use cascading order to structure advisor guidance: never push Manage strategies before Perceive vocabulary is established.'
  ),
  (
    'The relation between emotional intelligence and job performance: A meta-analysis',
    ARRAY['O''Boyle, E. H.', 'Humphrey, R. H.', 'Pollack, J. M.', 'Hawver, T. H.', 'Story, P. A.'],
    '10.1002/job.714',
    'https://doi.org/10.1002/job.714',
    'ability_ei',
    'adult',
    'en',
    'EI–직무 성과 메타분석. 능력·자기보고·혼합 EI 세 흐름 모두 일부 증분 타당도를 보이나, 혼합 모델은 빅5 통제 시 상당 부분 사라짐.',
    'EI–job performance meta-analysis (k=43). Mixed-model EI shows large raw correlations but small incremental validity once Big Five is controlled.',
    'Frame realistic expectations about EI predictive power. Do not overclaim.'
  ),
  (
    'Trait emotional intelligence: Psychometric investigation with reference to established trait taxonomies',
    ARRAY['Petrides, K. V.', 'Furnham, A.'],
    '10.1002/per.416',
    'https://doi.org/10.1002/per.416',
    'trait_ei',
    'adult',
    'en',
    '특성-EI(trait EI) 진영의 핵심 논문. EI를 자기지각된 감정 자기효능감으로 보고 자기보고로 측정해야 한다는 입장. 능력-EI와 명확히 다른 구성.',
    'The trait-EI manifesto: EI as self-perceived emotional self-efficacy, measured by self-report (TEIQue), lower-order personality trait.',
    'Cite to draw the ability/trait line. 2nd-Brain references ability stream; popular "EQ" tests usually measure trait-EI.'
  ),
  (
    'Commentaries on "Seven Myths About Emotional Intelligence" and "Emotional Intelligence: Theory, Findings, and Implications" (includes Brody, N. — "What cognitive intelligence is and what emotional intelligence is not")',
    ARRAY['Brody, N.'],
    '10.1207/s15327965pli1503_03',
    'https://doi.org/10.1207/s15327965pli1503_03',
    'ability_ei',
    'adult',
    'en',
    'Brody의 EI 회의론 코멘터리. MSCEIT 점수가 감정 능력보다 문화적 감정 규범 지식을 측정한다고 비판. 보수적 입장의 대표 인용.',
    'Brody''s skeptical commentary on EI. Cite as the conservative position alongside MacCann et al. (2014) counterargument.',
    'Pair with Maul (2012) when discussing limits of MSCEIT-style scoring; reinforces 2nd-Brain''s no-score-from-text policy.'
  ),
  (
    'The reliability and validity of Korean version of the Wong and Law Emotional Intelligence Scale (K-WLEIS)',
    ARRAY['Jeong, S.', 'Choi, M.', 'Park, S.'],
    '10.4040/jkan.20109',
    'https://doi.org/10.4040/jkan.20109',
    'trait_ei',
    'adult',
    'ko',
    'WLEIS의 한국어판(K-WLEIS) 검증 논문. 16문항 자기보고; Mayer–Salovey 4가지를 개념적으로 따르되 자기보고 형식. 한국 간호사 표본에서 신뢰도·요인구조 양호.',
    'K-WLEIS validation in Korean nurses. 16-item self-report following the four-branch concept but in self-report format.',
    'Korean-locale EI signal — but self-report, so use as scaffolding only; never present as ability-EI score.'
  ),
  (
    'Validation of the Korean version of Schutte Emotional Intelligence Scale (K-SEIS) in college students',
    ARRAY['Kim, J. G.', 'Woo, Y. J.'],
    '10.30593/jhuc.43.2.2',
    'https://doi.org/10.30593/jhuc.43.2.2',
    'trait_ei',
    'young_adult',
    'ko',
    'Schutte EI 척도의 한국어판(K-SEIS) 검증. 33문항 자기보고; Salovey & Mayer 1990 프레임에 기반. 한국 대학생 표본에서 4요인 구조 확인.',
    'K-SEIS validation in Korean college students. 33-item self-report based on the Salovey & Mayer (1990) framework.',
    'Korean young-adult locale EI signal. Same caveat: self-report, not ability test.'
  );
```
