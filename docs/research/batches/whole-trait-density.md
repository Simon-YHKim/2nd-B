# Framework: Whole Trait Theory & State Density Distributions

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Trust score target**: Establishes the academic basis for treating Big Five not as a single static score but as a **density distribution of states over time**. This batch is the conceptual companion to `big-five.md` and `computational-personality.md`: where those treat traits as relatively stable inferred summaries, Whole Trait Theory (WTT) — and the broader within-person variability literature — argues that **a person's trait IS the shape of their state distribution**, not a point on a line. For 2nd-Brain v0.2, this implies the Tier A evidence store must encode `(state, situation, timestamp)` triples, not just averaged trait scores.

## AI Retrieval Guide (for RAG / Wiki use)

**When user input or system needs to answer** → **look here**:
- "Has my personality really changed, or is this just a bad week?" → §Fleeson 2001 + §Baird 2006 + §Within-person variability section
- "Can the app just give me one score?" → §Density distribution principle (below) + §Cautions
- "Why does the same person act differently at work vs. with friends?" → §Mischel & Shoda 1995 (CAPS) + §Rauthmann 2014 (DIAMONDS)
- "What does it mean for journal entries to be tagged with situation?" → §Application: situation taxonomy
- "Why N=30+ entries minimum for a persona card?" → §Density estimation requires N >> 1
- "Is variability itself a personality trait?" → §Baird 2006 + §Geukes 2017

## Foundational Sources — Whole Trait Theory core

1. Fleeson, W. (2001). Toward a structure- and process-integrated view of personality: Traits as density distributions of states. *Journal of Personality and Social Psychology*, 80(6), 1011–1027. DOI: https://doi.org/10.1037/0022-3514.80.6.1011
   - **The founding paper.** Across multiple ESM studies (~50 reports/person over ~2 weeks), Fleeson shows that an individual's behavior on each Big Five dimension forms a roughly normal **distribution of states**. The mean of that distribution reproduces the conventional "trait score" — but the **standard deviation, skew, and full shape are themselves stable individual differences**. Key empirical finding: a person varies across the full trait range within a 2-week window almost as much as the entire population varies between people. **This is the paper that justifies treating "trait = distribution shape, not point".**

2. Fleeson, W. (2004). Moving personality beyond the person-situation debate: The challenge and the opportunity of within-person variability. *Current Directions in Psychological Science*, 13(2), 83–87. DOI: https://doi.org/10.1111/j.0963-7214.2004.00280.x
   - The accessible synthesis. Resolves the 40-year person-vs-situation debate: traits describe behavior **over time**, situations describe behavior **in the moment**. Both are real; they operate at different time scales. Important for 2nd-Brain's framing — single entries reflect state-in-situation, not trait.

3. Mischel, W., & Shoda, Y. (1995). A cognitive-affective system theory of personality: Reconceptualizing situations, dispositions, dynamics, and invariance in personality structure. *Psychological Review*, 102(2), 246–268. DOI: https://doi.org/10.1037/0033-295X.102.2.246
   - **CAPS theory** — the "if … then …" signature of personality. A person's stable identity is their **profile of conditional responses across situations**, not their average. Citation count >2,400. This is the theoretical predecessor that Fleeson's WTT operationalizes empirically. Direct implication for 2nd-Brain: extracting "user typically responds with X when in situation Y" is the right unit of analysis, not "user is type X."

4. Fleeson, W., & Jayawickreme, E. (2015). Whole Trait Theory. *Journal of Research in Personality*, 56, 82–92. DOI: https://doi.org/10.1016/j.jrp.2014.10.009
   - **The formal WTT statement.** Integrates the descriptive (density distribution) and explanatory (social-cognitive mechanisms producing each state) sides. Defines a "whole trait" as the joint of (a) the **density distribution of behavioral states** and (b) the **mechanisms that generate states from situations**. The two halves are inseparable in their account.

5. Jayawickreme, E., Zachry, C. E., & Fleeson, W. (2019). Whole Trait Theory: An integrative approach to examining personality structure and process. *Personality and Individual Differences*, 136, 2–11. DOI: https://doi.org/10.1016/j.paid.2018.06.045
   - Five-year refinement: explicit theory of how social-cognitive units (goals, interpretations, affect dynamics) produce the state distribution. Aligns WTT with cognitive-affective system models. Notes (caveat for 2nd-Brain) that **the explanatory side of WTT is much less empirically settled than the descriptive side** — density distributions are well-documented; the mechanisms generating them are still contested.

## Foundational Sources — Within-person variability as individual difference

6. Baird, B. M., Le, K., & Lucas, R. E. (2006). On the nature of intraindividual personality variability: Reliability, validity, and associations with well-being. *Journal of Personality and Social Psychology*, 90(3), 512–527. DOI: https://doi.org/10.1037/0022-3514.90.3.512
   - **The key paper on whether variability itself is meaningful.** Tests whether intraindividual SD (state variability) on each Big Five dimension is a reliable, valid construct distinct from the mean. **Conclusion: yes for some dimensions** (notably affect-related variability shows test–retest stability and negative correlation with well-being), but interpretation requires care — variability is partly confounded with mean (a person near the floor of a dimension cannot vary downward). For 2nd-Brain: persona card can plausibly include a "consistency" descriptor *for some dimensions*, but should not over-claim that variability itself is a stable signature on all dimensions.

7. Geukes, K., Nestler, S., Hutteman, R., Küfner, A. C. P., & Back, M. D. (2017). Trait personality and state variability: Predicting individual differences in within- and cross-context fluctuations in affect, self-evaluations, and behavior in everyday life. *Journal of Research in Personality*, 69, 124–138. DOI: https://doi.org/10.1016/j.jrp.2016.06.003
   - Direct test of "do Big Five trait levels predict state variability?" Two ESM datasets, N ≈ 200 each, ~7 days. Finding: **trait Neuroticism is the most robust predictor of higher state affect variability**; other dimensions show context-dependent links. Confirms that variability is partially trait-driven, not just measurement noise. Important methodological note: their study uses 3–7 prompts/day for a week — roughly the density journal entries cannot reach without explicit ESM-style prompts.

## Experience Sampling Methodology (ESM) — the measurement foundation

8. Csikszentmihalyi, M., & Larson, R. (1987). Validity and reliability of the experience-sampling method. *Journal of Nervous and Mental Disease*, 175(9), 526–536. DOI: https://doi.org/10.1097/00005053-198709000-00004
   - The methodological charter. Establishes that beeper-prompted self-reports are reliable, valid, and uniquely capable of capturing within-person dynamics that retrospective recall misses. Lays out the response-bias, reactivity, and compliance considerations that any quasi-ESM tool (including journal-based) inherits.

9. Wilt, J., Funkhouser, K., & Revelle, W. (2011). The dynamic relationships of affective synchrony to perceptions of situations. *Journal of Research in Personality*, 45(3), 309–321. DOI: https://doi.org/10.1016/j.jrp.2011.03.005
   - Demonstrates that **state-level affect tracks situation construal in real time**, and that the strength of that coupling is itself an individual difference. (User-task note: the project brief listed this as 2012; the verified record is 2011.) Direct relevance to 2nd-Brain: a user whose mood-state varies strongly with situational reports is a different psychological profile from one whose mood is decoupled from situation.

10. Wrzus, C., & Mehl, M. R. (2015). Lab and/or field? Measuring personality processes and their social consequences. *European Journal of Personality*, 29(2), 250–271. DOI: https://doi.org/10.1002/per.1986
    - Contemporary review of ambulatory assessment methods. Lays out the **measurement burden tradeoffs**: ESM (high signal, high participant burden), daily diaries (lower burden, less temporal resolution), passive sensing (low burden, narrow construct coverage). **2nd-Brain journals sit between daily diary and ESM**: self-initiated rather than prompt-driven, variable temporal resolution. The paper explicitly cautions that self-initiated diary entries underrepresent neutral / boring states — a sampling bias 2nd-Brain inherits.

## Situation Taxonomies — the second axis of Whole Trait Theory

11. Rauthmann, J. F., Gallardo-Pujol, D., Guillaume, E. M., Todd, E., Nave, C. S., Sherman, R. A., Ziegler, M., Jones, A. B., & Funder, D. C. (2014). The Situational Eight DIAMONDS: A taxonomy of major dimensions of situation characteristics. *Journal of Personality and Social Psychology*, 107(4), 677–718. DOI: https://doi.org/10.1037/a0037250
    - **The empirically derived taxonomy of situation characteristics.** Eight dimensions: **D**uty, **I**ntellect, **A**dversity, **M**ating, p**O**sitivity, **N**egativity, **D**eception, **S**ociality. Validated across 5 studies including international samples. Defines the *axis on which states get generated*: a "state of conscientiousness" only makes sense relative to a situation with high Duty. **For 2nd-Brain**: this gives an empirical grounding for the situation tags in journal entries — instead of inventing ad-hoc categories, the DIAMONDS dimensions are a peer-reviewed candidate set.

12. Funder, D. C. (2016). Taking situations seriously: The Situation Construal Model and the Riverside Situational Q-Sort. *Current Directions in Psychological Science*, 25(3), 203–208. DOI: https://doi.org/10.1177/0963721416635552
    - The construal addendum: **behavior is a function not of the objective situation but of the person's interpretation of it**. Two users in identical situations produce different states because they construe differently. For 2nd-Brain: the journal text itself carries construal information that a structured form would erase. This is part of why free-text journaling is signal-rich — but it also raises the LLM-extraction challenge (see `computational-personality.md`).

## Extraversion as Worked Example (state-trait integration)

13. Wilt, J., & Revelle, W. (2016). Extraversion. In *The Oxford Handbook of the Five Factor Model*. Oxford University Press. DOI: https://doi.org/10.1093/oxfordhb/9780199352487.013.15
    - Synthesizes ~50 years of evidence that Extraversion functions both as a **trait** (average position) and as a **state** (momentary level), with the two linked by reward sensitivity. (User-task note: the brief listed Wilt & Revelle 2009 in a Handbook of Individual Differences; the verified analogous chapter is the 2016 Oxford handbook entry.) The clearest worked example of how a single Big Five dimension is properly modeled as a state distribution rather than a point.

## Korean Context — Identified Gap

[NO VERIFIED SOURCE FOUND] for **Korean-population ESM or daily-diary studies of Big Five state variability** with a registered DOI in this session. Searched Crossref for: Korean × (ESM | experience sampling | EMA | daily diary | momentary affect) × (Big Five | personality | state variability). No matches.

What this means for 2nd-Brain:

- **The descriptive density-distribution finding (Fleeson 2001) has not been replicated in a Korean ESM sample with publicly indexed DOI** as of this batch. Cross-cultural generalization is plausible but unverified.
- **Cultural moderators almost certainly apply.** Korean collectivist norms produce stronger situation-driven self-presentation: state variability across formal/informal contexts may be larger in Korean samples than in Western samples (testable hypothesis, no DOI'd test yet).
- **Honorifics and pro-drop syntax** mean that linguistic markers of state (which Western ESM-text studies lean on) work differently in Korean — see `computational-personality.md` §Korean gap for the parallel issue in LLM extraction.
- **Practical consequence**: the persona card's confidence band for Korean users should be set conservatively, and the system should not invoke a "your trait distribution shows…" frame for Korean users until Korean-locale validation is available. Prefer: "최근 한 달 동안의 기록에서 자주 나타난 상태 패턴은 …".
- **Future-batch priority**: Korean-locale ESM personality validation is a known gap (joint with `computational-personality.md`).

## Age Range Coverage

- **Child (0–12)**: not applicable for the main 2nd-Brain app under the 14+ floor; ESM is rarely used in children due to compliance burden; density-distribution structure not established at this age.
- **Adolescent (13–17)**: applicable for 14-17 users with caution. Adolescent ESM studies exist but are not the basis for adult persona inference.
- **Young Adult (18–29)**: applicable — strongest evidence base; Fleeson 2001 sample, Geukes 2017 sample, most DIAMONDS validations are undergraduate.
- **Adult (30–49)**: applicable — Wrzus & Mehl 2015 covers methodological adaptation across adulthood; trait-level findings carry over, but ESM compliance drops with parental / work burden.
- **Midlife (50–64)**: applicable with caveats — fewer ESM studies; daily diary methods more practical.
- **Elderly (65+)**: limited — ESM compliance and digital-literacy issues reduce the evidence base; density-distribution structure is not well-documented for 65+ samples.

## Application to 2nd-Brain

### The density-distribution principle (architectural implication)

**A user's "Big Five score" is not a single point. It is the shape of a distribution of states across time and situations.**

This has direct implications for the v0.2 design doc:

| Naive design | WTT-informed design |
| --- | --- |
| `personality.openness = 0.72` (scalar) | `state_log: (timestamp, situation_tags[], openness_state, …)` rows; persona card derives **mean, SD, range, and within-situation conditional means** from the log |
| Single persona card snapshot | Versioned persona card with a `data_basis.entries_analyzed` count and **confidence band that grows with N** |
| "You are an introvert" framing | "Your extraversion-state ranges from X to Y depending on situation — your highest is in [setting], your lowest in [setting]" |
| Tier A evidence stored as `(trait, score)` | Tier A evidence stored as `(timestamp, situation, behavior, state_observation)` — preserves the raw distribution |

### How journal entries map to ESM-like data (and where they don't)

Journals are **quasi-ESM**, not true ESM. Differences that matter:

1. **Self-initiated vs prompted**: ESM samples random moments; journals sample notable moments. → over-represents emotionally salient and reflectively coherent states; under-represents flat / boring states (Wrzus & Mehl 2015 caution).
2. **Variable cadence**: a true density estimate needs even sampling; journal cadence varies by user. → density estimates should be weighted or interpreted as density-of-*written-about*-states, not density-of-*lived*-states.
3. **Retrospective compression**: even a same-day entry condenses hours of state into one narrative. → state-from-text is approximation (link: `computational-personality.md` §Validity boundary).
4. **No item-level Big Five rating**: ESM uses explicit Likert items; journals require LLM extraction. → another approximation layer, with its own confidence ceiling (link: `computational-personality.md` Park 2015).

These deviations do not invalidate the WTT framing — they just set realistic expectations.

### Situation tagging (DIAMONDS dimensions as candidate schema)

The DIAMONDS dimensions (Rauthmann 2014) are the most peer-reviewed candidate vocabulary for situation tags. Implementation note: do not surface raw dimension names to users (Duty/Intellect/etc.); use them as the *latent* tag set extracted by the inference engine, and surface a human-readable label.

Mapping example:

| DIAMONDS dim | What it captures | 2nd-Brain UX label (Korean / English) |
| --- | --- | --- |
| Duty | Tasks, obligations, work | "일·책임 / Work & responsibility" |
| Intellect | Mental engagement, learning | "배움·생각 / Learning & thinking" |
| Adversity | Threat, criticism, hardship | "어려움 / Difficulty" |
| Positivity | Enjoyable, light | "즐거움 / Enjoyment" |
| Negativity | Sad, frustrating | "힘듦 / Hard time" |
| Sociality | Interaction with others | "관계 / With others" |
| Mating, Deception | (handled carefully; see Cautions) | — |

### Cold Start: N >> 1 before a density estimate

Fleeson (2001) used ~50 reports/person over 2 weeks. Geukes (2017) used ~140 reports/person over a week. **The density-distribution structure is not stably estimable from a handful of entries.**

Pragmatic threshold for 2nd-Brain (conservative, will tighten with internal validation):

| Entries | What can be claimed |
| --- | --- |
| < 10 | No persona-card trait claims. Only "we're learning your patterns" framing. |
| 10–29 | Tentative single-dimension observations with explicit "early signal" hedge. No SD / variability claims. |
| 30+ | Mean-level observations on dimensions with sufficient signal coverage. Variability claims only for dimensions where the user has written across visibly different situations. |
| 80+ over ≥ 30 days | Conditional means by situation tag become defensible ("you tend toward X in Duty situations, toward Y in Sociality situations"). |

This matches the C8 / `knowledge_sources` evidence-tier discipline.

### Interview Question Examples (validated framing)

These probe state-vs-trait awareness — useful as periodic prompts that surface within-person variability to the user.

**Korean**
- 같은 한 주 안에서 본인의 모습이 가장 다르게 느껴졌던 두 순간이 있다면 언제·어디였나요?
- "원래 나는 ~한 사람"이라고 말하고 싶지만 사실 상황에 따라 꽤 달라지는 부분이 있다면 어떤 거예요?
- 지난 한 달 중 가장 활기찼던 자리와 가장 조용했던 자리를 떠올려보면, 그 차이는 본인 안의 변화일까요 상황의 차이일까요?
- 일할 때의 본인과 친한 사람들과 있을 때의 본인이 얼마나 같거나 다르다고 느끼세요?

**English**
- Within the past week, when did you feel most "like yourself" and most "unlike yourself" — what was different about those moments?
- If someone said "you're a [trait] person," what's a situation where that would be obviously wrong?
- Looking back at last month, the most energetic version of you and the quietest — is the difference inside you, or in the situation?
- How much does your "work self" overlap with your "with-friends self"?

### Trait Extraction Cues (state-aware)

For Engine 2 (per `computational-personality.md` Honest framing):

- **Tag each extracted state observation with situation context** (DIAMONDS-derived) and timestamp. Never store a trait observation without these two.
- **Conditional means matter more than overall means**: "high extraversion-state in Sociality situations, moderate in Duty situations" is the WTT-correct summary; "high extraversion" alone is the WTT-incorrect summary.
- **Flag low-coverage dimensions**: if the user has written 40 entries but 38 are about work (high Duty), do not generalize Sociality-state findings.
- **Variability as second-order observation**: only when N ≥ 30 and situation coverage is reasonable, compute and surface within-person SD on the dimensions where Baird 2006 / Geukes 2017 supports it (most strongly for affect-related variability).

### Advisor Guidance Patterns

- When the user reports a moment that contradicts their self-concept ("I'm not usually like this"), invoke the **state-vs-trait distinction**: "That sounds different from how you usually describe yourself. In [the research base], people's behavior varies more across situations than they expect — your usual self and this moment can both be real. What was different about the situation?" (Fleeson 2004 framing.)
- When the user asks "has my personality changed?", invoke **rank-order vs mean-level distinction** (cross-link to `big-five.md` Bleidorn 2022) AND density-distribution: "Personality change usually means the distribution has shifted, not that you've become a different person. Want to compare your last 30 days against your earlier entries on a specific dimension?"
- Do **not** invoke "you're an introvert" or "you're an extravert" — these are point-claims WTT does not support. Use distribution language: "Across the last month your extraversion state ranged from X to Y; the average was Z."

## Cross-references

- **Trait construct itself**: `big-five.md` for the dimensional structure and longitudinal stability evidence (Bleidorn 2022). WTT does not displace Big Five — it operationalizes it.
- **LLM extraction limits**: `computational-personality.md` for the state-from-text inference ceiling (Park 2015 r ≈ 0.4). The density-distribution framing makes Engine 2's hedging *more* defensible, not less — it explicitly recognizes that a single entry samples a state, not a trait.
- **Why journaling itself is reflective signal**: `self-knowledge.md` (Frattaroli 2006 minimum-duration evidence). WTT does not address whether journaling improves wellbeing, only whether journal-derived state observations are meaningful.
- **Privacy stakes of fine-grained state data**: `data-ethics-consent.md`. State-level data (vs aggregated trait summaries) is *more* identifying, not less.
- **Crisis routing**: `crisis-detection.md` always supersedes WTT-informed analysis. Variability that includes crisis-state language routes to crisis flow before any density-distribution interpretation.

## Cautions & Limitations

- **High measurement burden is the cost of WTT.** Real density estimation requires ESM-grade sampling (Fleeson 2001 used ~50 reports/person). Journal cadence cannot match this; results are approximations, and the persona card must say so.
- **Journals are biased samples.** Self-initiated entries over-represent emotionally salient and reflectively coherent moments. The estimated density curve is the *density of journal-able states*, not lived states (Wrzus & Mehl 2015).
- **Variability ≠ instability ≠ pathology.** Baird (2006) explicitly cautions that high state variability is not by itself a deficit. Some dimensions show modest negative variability–wellbeing correlation; do not generalize.
- **Floor/ceiling artifacts.** A user near the floor of a dimension cannot exhibit much downward variability — apparent low variability there is partly a measurement artifact, not a psychological one. Persona card should not infer "low variability ⇒ stable trait" without considering position.
- **Cold start is real.** Below ~30 entries, the persona card should refuse trait-distribution claims. This contradicts a UX desire for instant feedback; the resolution is to surface "we're still learning" honestly, not to fake an early estimate.
- **Korean validation gap.** Cross-cultural extension of density-distribution findings is plausible but not DOI-verified for Korean populations. Confidence bands must reflect this.
- **DIAMONDS Mating / Deception dimensions are sensitive.** Do not tag entries with these in user-facing UI. Use them (if at all) only as latent extraction targets with strict access control.
- **Construal is signal-rich but ambiguous.** Funder (2016) shows construal matters; LLM extraction of construal from text is even less reliable than extraction of state itself. Treat construal claims as suggestions, not findings.
- **Variability claims are weaker than mean claims.** The empirical base for "variability as individual difference" is robust for affect-related dimensions (Baird 2006, Geukes 2017) but thinner for behavioral conscientiousness or openness variability. Do not over-extend.
- **Does NOT contradict v0.2 design doc.** The architecture currently treats traits as relatively stable; WTT refines this by saying "stable in their distributional shape, not their point value." The implementation upgrade is **storing state-level observations with situation + timestamp**, not abandoning Big Five.

## Suggested `knowledge_sources` INSERT rows

```sql
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale, summary_ko, summary_en, application_notes)
values
  (
    'Toward a structure- and process-integrated view of personality: Traits as density distributions of states',
    ARRAY['William Fleeson'],
    '10.1037/0022-3514.80.6.1011',
    'https://doi.org/10.1037/0022-3514.80.6.1011',
    'whole_trait_density',
    'young_adult',
    'en',
    '한 사람의 빅파이브 점수는 단일 값이 아니라, 시간과 상황에 걸쳐 분포된 상태들의 밀도 분포다. ESM 데이터에서 한 사람의 2주간 행동 변동 범위가 전체 인구 변동 범위와 거의 같다는 사실을 보여, "성격 = 분포의 모양"이라는 패러다임을 정립한 논문.',
    'Foundational ESM evidence that an individual''s Big Five behavior forms a stable density distribution over ~2 weeks; the SD and shape — not just the mean — are themselves stable individual differences. Justifies treating "trait" as distribution, not point.',
    '2nd-Brain implication: persona card must derive from a log of (timestamp, situation, state) rows, not from averaged scores. Density-distribution structure is the architectural target, with realistic caveats about journal cadence.'
  ),
  (
    'Moving personality beyond the person-situation debate: The challenge and the opportunity of within-person variability',
    ARRAY['William Fleeson'],
    '10.1111/j.0963-7214.2004.00280.x',
    'https://doi.org/10.1111/j.0963-7214.2004.00280.x',
    'whole_trait_density',
    'all',
    'en',
    '40년간 이어진 성격 vs 상황 논쟁의 해소. 트레잇은 장기간에 걸친 행동을 잘 기술하고, 상황은 순간의 행동을 잘 기술한다 — 둘 다 옳고 시간 척도가 다를 뿐이다.',
    'Accessible synthesis resolving the trait-vs-situation debate: traits describe behavior over time; situations describe behavior in the moment. Both real, different time scales.',
    'Use as Advisor framing when a user reports state-trait contradiction ("I''m not usually like this"). Both the usual self and the moment can be real.'
  ),
  (
    'Whole Trait Theory',
    ARRAY['William Fleeson', 'Eranda Jayawickreme'],
    '10.1016/j.jrp.2014.10.009',
    'https://doi.org/10.1016/j.jrp.2014.10.009',
    'whole_trait_density',
    'adult',
    'en',
    '트레잇의 기술적 측면(상태 밀도 분포)과 설명적 측면(상태를 생성하는 사회-인지 메커니즘)을 통합한 공식 이론. "전체 트레잇"은 분포와 메커니즘의 결합이다.',
    'Formal statement integrating the descriptive (density distribution) and explanatory (mechanisms producing states) sides of personality. "Whole trait" = distribution + mechanism, inseparable.',
    'Architectural reference for 2nd-Brain Engine 2: state distribution is the descriptive target; situation construal + goals are the (less well-modeled) explanatory side.'
  ),
  (
    'Whole Trait Theory: An integrative approach to examining personality structure and process',
    ARRAY['Eranda Jayawickreme', 'Corinne E. Zachry', 'William Fleeson'],
    '10.1016/j.paid.2018.06.045',
    'https://doi.org/10.1016/j.paid.2018.06.045',
    'whole_trait_density',
    'adult',
    'en',
    '2015년 WTT 발표 이후 5년 정리. 사회-인지 단위(목표, 해석, 정서 동역학)가 상태 분포를 어떻게 생성하는지에 대한 명시적 이론 — 단, 설명적 측면은 기술적 측면보다 경험적 합의가 약함을 인정.',
    'Five-year refinement of WTT with explicit theory of how social-cognitive units (goals, interpretations, affect dynamics) produce the state distribution. Notes the explanatory side is less empirically settled than the descriptive side.',
    'Use cautiously for "why does a state happen" claims; the mechanism layer is theoretical, not yet validated. The distribution layer is the safer claim.'
  ),
  (
    'A cognitive-affective system theory of personality: Reconceptualizing situations, dispositions, dynamics, and invariance in personality structure',
    ARRAY['Walter Mischel', 'Yuichi Shoda'],
    '10.1037/0033-295X.102.2.246',
    'https://doi.org/10.1037/0033-295X.102.2.246',
    'whole_trait_density',
    'adult',
    'en',
    'CAPS 이론. 사람의 안정된 정체성은 평균이 아니라 상황별 조건적 반응의 패턴("if … then …" 시그니처)이다. WTT의 이론적 선조.',
    'CAPS theory: a person''s stable identity is their profile of "if … then …" conditional responses across situations, not their average. Theoretical predecessor of WTT.',
    'Engine 2 implication: extracting conditional patterns ("user tends to respond with X when in situation Y") is the right unit, not "user is type X."'
  ),
  (
    'On the nature of intraindividual personality variability: Reliability, validity, and associations with well-being',
    ARRAY['Brendan M. Baird', 'Kimdy Le', 'Richard E. Lucas'],
    '10.1037/0022-3514.90.3.512',
    'https://doi.org/10.1037/0022-3514.90.3.512',
    'whole_trait_density',
    'young_adult',
    'en',
    '개인 내 상태 변동성(SD) 자체가 신뢰할 만한 개인차 변수인가에 대한 검증. 일부 차원(특히 정서 관련)에서는 그렇지만, 평균값과의 혼동 등 해석에 주의가 필요하다.',
    'Tests whether intraindividual SD is itself a reliable, valid individual-difference construct distinct from the mean. Yes for affect-related dimensions; interpretation requires care due to floor/ceiling artifacts and mean-SD confound.',
    '2nd-Brain: persona card may surface a "consistency" descriptor for affect-related dimensions when N is sufficient, but must not over-claim variability as a stable trait signature across all dimensions.'
  ),
  (
    'Trait personality and state variability: Predicting individual differences in within- and cross-context fluctuations in affect, self-evaluations, and behavior in everyday life',
    ARRAY['Katharina Geukes', 'Steffen Nestler', 'Roos Hutteman', 'Albrecht C. P. Küfner', 'Mitja D. Back'],
    '10.1016/j.jrp.2016.06.003',
    'https://doi.org/10.1016/j.jrp.2016.06.003',
    'whole_trait_density',
    'young_adult',
    'en',
    '빅파이브 트레잇 수준이 ESM 상태 변동성을 어떻게 예측하는지 두 데이터셋(각 N≈200)에서 검증. 트레잇 신경증성이 정서 상태 변동성을 가장 강하게 예측한다는 가장 견고한 결과.',
    'Two ESM datasets (N ≈ 200 each, ~7 days) testing whether Big Five trait levels predict state variability. Robust finding: trait Neuroticism predicts higher state affect variability; other dimensions are context-dependent.',
    'Empirical anchor for "variability is partly trait-driven, not just noise." Sets expectation that journal-derived variability signals will be most interpretable on affect / Neuroticism-adjacent dimensions.'
  ),
  (
    'Validity and Reliability of the Experience-Sampling Method',
    ARRAY['Mihaly Csikszentmihalyi', 'Reed Larson'],
    '10.1097/00005053-198709000-00004',
    'https://doi.org/10.1097/00005053-198709000-00004',
    'whole_trait_density',
    'adult',
    'en',
    'ESM의 방법론적 헌장. 호출 기반 자기보고가 신뢰·타당하며, 회상 기반 측정이 놓치는 개인 내 동역학을 포착하는 데 고유한 가치가 있음을 정립.',
    'Methodological charter for ESM. Establishes beeper-prompted self-reports as reliable and uniquely able to capture within-person dynamics that retrospective recall misses.',
    'Reference point for what real ESM looks like. 2nd-Brain journals are quasi-ESM — self-initiated, not prompted — so inherit reactivity and compliance caveats but lose random-sampling rigor.'
  ),
  (
    'The dynamic relationships of affective synchrony to perceptions of situations',
    ARRAY['Joshua Wilt', 'Katharine Funkhouser', 'William Revelle'],
    '10.1016/j.jrp.2011.03.005',
    'https://doi.org/10.1016/j.jrp.2011.03.005',
    'whole_trait_density',
    'young_adult',
    'en',
    '상태 수준 정서가 실시간 상황 해석과 어떻게 동기화되는지, 그리고 그 동기화 강도 자체가 개인차임을 실증.',
    'Demonstrates state-level affect tracks real-time situation construal, and that the strength of that coupling is itself an individual difference.',
    'For 2nd-Brain: a user whose mood-state tightly tracks situational reports is a different psychological profile from one whose mood is decoupled — observable from journal entries with situation tags.'
  ),
  (
    'Lab and/or field? Measuring personality processes and their social consequences',
    ARRAY['Cornelia Wrzus', 'Matthias R. Mehl'],
    '10.1002/per.1986',
    'https://doi.org/10.1002/per.1986',
    'whole_trait_density',
    'adult',
    'en',
    '주변환경 평가(ambulatory assessment) 방법론 리뷰. ESM·일일 다이어리·수동 센싱의 측정 부담-신호 트레이드오프를 정리.',
    'Contemporary review of ambulatory assessment methods, laying out tradeoffs between ESM, daily diary, and passive sensing — burden vs signal vs construct coverage.',
    '2nd-Brain journals sit between daily diary and ESM. Inherits the self-initiation bias: under-represents neutral / boring states. Persona card density estimates must be hedged accordingly.'
  ),
  (
    'The Situational Eight DIAMONDS: A taxonomy of major dimensions of situation characteristics',
    ARRAY['John F. Rauthmann', 'David Gallardo-Pujol', 'Esther M. Guillaume', 'Elysia Todd', 'Christopher S. Nave', 'Ryne A. Sherman', 'Matthias Ziegler', 'Ashley Bell Jones', 'David C. Funder'],
    '10.1037/a0037250',
    'https://doi.org/10.1037/a0037250',
    'whole_trait_density',
    'young_adult',
    'en',
    '상황의 8개 주요 차원(Duty, Intellect, Adversity, Mating, pOsitivity, Negativity, Deception, Sociality) 분류 체계. 5개 연구에서 국제적으로 검증.',
    'Empirically derived 8-dimension taxonomy of situation characteristics (Duty, Intellect, Adversity, Mating, pOsitivity, Negativity, Deception, Sociality), validated across 5 studies.',
    'Candidate situation-tag schema for journal entries. Use as latent extraction target; surface user-facing labels (Work/Learning/Difficulty/Enjoyment/etc.). Mating and Deception kept as sensitive — no user-facing surface.'
  ),
  (
    'Taking Situations Seriously: The Situation Construal Model and the Riverside Situational Q-Sort',
    ARRAY['David C. Funder'],
    '10.1177/0963721416635552',
    'https://doi.org/10.1177/0963721416635552',
    'whole_trait_density',
    'adult',
    'en',
    '행동은 객관적 상황보다 그 상황에 대한 개인의 해석(construal)의 함수다. 동일 상황에서도 사람마다 다른 상태가 나오는 이유.',
    'Construal model: behavior is a function not of the objective situation but of the person''s interpretation of it. Two users in identical situations produce different states because they construe differently.',
    'Journal free-text carries construal information that structured forms would erase — a reason free-text journaling is signal-rich, also a reason LLM extraction of construal is uncertain (link: computational-personality).'
  ),
  (
    'Extraversion',
    ARRAY['Joshua Wilt', 'William Revelle'],
    '10.1093/oxfordhb/9780199352487.013.15',
    'https://doi.org/10.1093/oxfordhb/9780199352487.013.15',
    'whole_trait_density',
    'adult',
    'en',
    '약 50년간의 외향성 연구를 종합. 외향성은 트레잇(평균 위치)과 상태(순간 수준)로 동시에 작동하며 보상 민감성으로 연결된다는 점을 가장 명확히 보여주는 한 차원의 사례.',
    'Synthesizes ~50 years of evidence that Extraversion functions both as a trait (average) and as a state (momentary), linked by reward sensitivity — the clearest single-dimension worked example of state-trait integration.',
    'Use as the worked example when explaining state-trait distinction to users; extraversion is the most intuitive dimension for "you can vary day to day on this and still have a stable trait pattern."'
  );
```
