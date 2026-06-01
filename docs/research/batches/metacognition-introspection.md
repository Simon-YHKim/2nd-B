# Framework: Metacognition & Introspection Accuracy

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Why this batch exists**: 2nd-Brain v0.2 design doc §05 introduces the **Ambiguity Resolution Queue** — when the inference layer is uncertain, the system asks the user. That mechanism implicitly assumes the user has accurate introspective access to the answer. The psychology of metacognition and introspection shows that assumption is *partial*: introspective access is real but bounded, domain-specific, and culturally modulated. This batch establishes those boundaries empirically and supplies rules for which questions are safe to put in the Ambiguity Queue, which are not, and how to frame those that are.
>
> **What this batch is NOT**: a claim that users cannot know themselves. Vazire's SOKA model (already covered in `self-report-bias.md`) is explicit that for internal-state and motivational traits, the self knows best. Nor is this a license for the Advisor to over-rule the user with "we know you better than you know yourself" — that framing is empirically false (no inference engine has access to internal states), and product-strategically toxic. The goal is *calibration*: route trait-style questions to the queue with humility; route value/goal/situation questions with confidence; never let either side overclaim.

## AI Retrieval Guide

| User context / system question | Look in this batch for |
| --- | --- |
| System question: can the user reliably answer "what kind of person am I"? | §Introspection accuracy limits (Nisbett & Wilson 1977; Schwitzgebel 2008); §SOKA bounds (cross-link to `self-report-bias.md` Vazire 2010) |
| System question: can the user reliably answer "what do I value, what do I want"? | §Self-knowledge psychology (Vazire 2010 — values/internal states are self-knows-best); §Application — values/goals/situations are queue-safe |
| User claims to know themselves with high certainty in skill domain | §Dunning-Kruger (Kruger & Dunning 1999); §Critique (Krueger & Mueller 2002); §Sanchez & Dunning 2018 beginner overconfidence |
| Designing Ambiguity Queue question framing | §Application — trait questions framed as "how do you see yourself"; values as "what matters to you"; situations as direct probes |
| User reports an emotion label — how confident should the system be? | §Domain-specific introspection — emotion (Russell & Barrett 1999) — core affect dimensions are accessible, prototype categories less so |
| User explains why they did something — how confident should the system be? | §Nisbett & Wilson 1977 — causal self-attribution is the *least* reliable form of introspection; §Bem 1972 self-perception theory |
| Confidence-weighting between user's self-report and behavioral signals | §Fleming & Lau 2014 metacognitive measurement; §Fleming 2014 cost of confidence; §Application — confidence weighting rules |
| Korean / East Asian user shows lower self-reported certainty | §Cultural variation (Heine 2001) — self-critical bias is a presentation mode, not necessarily lower accuracy |
| Voice/Advisor language: can we say "we know you better than you know yourself"? | §Application — explicit forbidden framings; §Cautions §5 |
| System question: should "we asked, you said X" override behavioral pattern Y? | §Application — confidence weighting; §Fleming & Lau 2014 — introspective confidence and accuracy partly dissociate |

## Foundational Sources

### Metacognition — the original framing

1. Flavell, J. H. (1979). Metacognition and cognitive monitoring: A new area of cognitive-developmental inquiry. *American Psychologist*, 34(10), 906–911. DOI: https://doi.org/10.1037/0003-066X.34.10.906

   The paper that coined "metacognition" as a research area. Flavell distinguishes **metacognitive knowledge** (what you know about your own cognitive processes), **metacognitive experiences** (in-the-moment feelings of knowing, uncertainty, etc.), and **metacognitive monitoring/regulation** (using the first two to control cognition). For 2nd-Brain: the Ambiguity Queue is, in Flavell's terms, an attempt to elicit *metacognitive knowledge* about the self. That elicitation is reliable to the extent the user has built that knowledge — which varies by domain.

### Metamemory — the formal monitoring/control framework

2. Nelson, T. O., & Narens, L. (1990). Metamemory: A theoretical framework and new findings. *Psychology of Learning and Motivation*, 26, 125–173. DOI: https://doi.org/10.1016/S0079-7421(08)60053-5

   The canonical monitoring-and-control model: cognitive processes ("object level") are monitored by a meta level that issues control signals. Most subsequent metacognition research — including Fleming's signal-detection treatment — sits on this scaffold. For 2nd-Brain: the user's "confidence rating" on an Ambiguity Queue answer is a *monitoring signal*; it has its own accuracy and its own biases, separate from the underlying first-order answer.

## Modern Metacognitive Accuracy Research

### Measuring metacognition — the methodological synthesis

3. Fleming, S. M., & Lau, H. C. (2014). How to measure metacognition. *Frontiers in Human Neuroscience*, 8, 443. DOI: https://doi.org/10.3389/fnhum.2014.00443

   The reference paper on disentangling **metacognitive sensitivity** (how well confidence ratings track accuracy) from **metacognitive bias** (overall over- or under-confidence) and **first-order task performance** (accuracy itself). Introduces meta-d′ as the bias-free measure. Direct implication for 2nd-Brain: when the user gives an answer plus a confidence judgment in the Ambiguity Queue, that confidence is *partly* informative (sensitivity) and *partly* a stylistic over/underconfidence (bias) and partly an artifact of how good they are at the underlying judgment. Treat self-reported confidence as a soft prior, not an oracle.

### The cost of confidence — opinion piece on metacognition's role

4. Fleming, S. M. (2014). The cost of confidence. *Aeon* (online essay). NO Crossref DOI — popular-science essay, not peer-reviewed. **Excluded from `knowledge_sources` rows per C8 (DOI requirement)**. The cited claim — that metacognitive ability is partly distinct from the underlying cognitive ability — is carried by Fleming et al. 2010 (peer-reviewed *Science* paper, DOI below) and Fleming & Lau 2014 above. Reference Fleming 2014 only as a popular-science gloss; do not cite as evidence.

### Introspective accuracy and brain structure

5. Fleming, S. M., Weil, R. S., Nagy, Z., Dolan, R. J., & Rees, G. (2010). Relating introspective accuracy to individual differences in brain structure. *Science*, 329(5998), 1541–1543. DOI: https://doi.org/10.1126/science.1191883

   Found that individual differences in metacognitive sensitivity (perceptual task) correlate with anterior prefrontal cortex gray-matter volume and white-matter microstructure. Demonstrates that introspective accuracy is partly trait-like — some people are systematically better introspectors than others, controlling for first-order performance. For 2nd-Brain: users will differ in how informative their confidence judgments are. The system cannot assume uniform introspective skill.

### Visual confidence — the perceptual-decision domain

6. Mamassian, P. (2016). Visual confidence. *Annual Review of Vision Science*, 2, 459–481. DOI: https://doi.org/10.1146/annurev-vision-111815-114630

   A comprehensive review of perceptual confidence — how observers monitor their own perceptual decisions. Establishes that confidence is computed from partly the same evidence as the decision but partly from separate signals (response time, internal noise estimates). Implication for 2nd-Brain: the same dissociation applies to self-judgments — a user's confidence in a self-claim ("I'm an introvert") is not just a re-read of the underlying belief; it has its own sources.

## Introspection Accuracy Limits

### The seminal paper — Telling more than we can know

7. Nisbett, R. E., & Wilson, T. D. (1977). Telling more than we can know: Verbal reports on mental processes. *Psychological Review*, 84(3), 231–259. DOI: https://doi.org/10.1037/0033-295X.84.3.231

   The single most-cited paper on the limits of introspection. Reviews experimental evidence that people's verbal reports about *why* they made a choice, *what influenced* their judgment, or *which* stimulus drove their behavior are systematically inaccurate — often reflecting culturally-shared theories about likely causes rather than actual access to the mental process. **Direct implication for 2nd-Brain**: never put "*why* did you do X" in the Ambiguity Queue and treat the answer as ground truth about causation. The user's answer is itself a (potentially valuable) act of self-narration, not an oracle reading of cognitive processes.

### Strangers to ourselves — book-length synthesis

8. Wilson, T. D. (2002). *Strangers to Ourselves: Discovering the Adaptive Unconscious*. Cambridge, MA: Belknap Press of Harvard University Press. **Book — no Crossref DOI**. Cite by ISBN: 978-0-674-00936-3.

   Wilson's book-length extension of the 1977 finding. Argues that much of what shapes behavior is in an "adaptive unconscious" — fast, automatic, goal-directed processes not accessible to verbal report. Self-knowledge therefore requires *inferential* methods (observe your own behavior; ask others; track patterns over time) more than *introspective* methods (sit quietly and ask yourself). **2nd-Brain alignment**: this is the strongest theoretical justification for the *behavioral-pattern* layer (Engine 2 inferring from journal text and behavior) complementing the *self-report* layer. Both are needed.

### Naive introspection — philosophical critique

9. Schwitzgebel, E. (2008). The unreliability of naive introspection. *Philosophical Review*, 117(2), 245–273. DOI: https://doi.org/10.1215/00318108-2007-037

   Argues, with multiple convergent lines of evidence (visual imagery, emotion, conscious thought, dream phenomenology), that introspective reports of even *currently occurring* conscious experience are unreliable — not just memory-distorted retrospective ones. Schwitzgebel's claim is stronger than Nisbett & Wilson's: not just causal self-attribution is unreliable, but moment-to-moment introspection of experience itself. **For 2nd-Brain**: this is the upper bound on what *any* self-report system can extract. The right humility is "your report is the best signal we have, and it is imperfect even in principle."

## Self-Knowledge Psychology

### Self-Other Knowledge Asymmetry — primary citation in `self-report-bias.md`

The Vazire (2010) SOKA model is the central organizing framework for which traits the self knows best vs. which traits others know best. It is fully developed in `self-report-bias.md` and is **not duplicated as a row here**. Cross-link only.

- See `self-report-bias.md` §Self-Other Knowledge Asymmetry — Vazire, S. (2010). Who knows what about a person? The self–other knowledge asymmetry (SOKA) model. *Journal of Personality and Social Psychology*, 98(2), 281–300. DOI: https://doi.org/10.1037/a0017908

**Direct implication restated for this batch**: introspective access varies by trait domain.
- **Internal-state traits** (Neuroticism, anxiety, self-esteem, mood, motivation, values) → self has privileged access.
- **Evaluatively-loaded externally-visible traits** (intellect, creativity, attractiveness, charisma) → observers have privileged access.
- **Extraversion-related traits** → self and others roughly equivalent.

This is the *single most important* mapping for routing Ambiguity Queue questions.

### In search of our true selves

10. Bollich, K. L., Johannet, P. M., & Vazire, S. (2011). In search of our true selves: Feedback as a path to self-knowledge. *Frontiers in Psychology*, 2, 312. DOI: https://doi.org/10.3389/fpsyg.2011.00312

    Reviews the empirical literature on when and how feedback from others improves self-knowledge. Key findings: feedback works best when it (a) comes from someone with relevant observation, (b) is specific and behavior-anchored rather than trait-labeled, (c) is received in a non-defensive context. **Implication for 2nd-Brain**: if/when triangulation (peer/coach feedback) is introduced as a future feature, design it per these conditions. For now, the inference engine occupies the "external observer" role with the explicit caveat that it observes only text — not behavior, not relationships.

## Dunning-Kruger and Overconfidence

### The original Dunning-Kruger paper

11. Kruger, J., & Dunning, D. (1999). Unskilled and unaware of it: How difficulties in recognizing one's own incompetence lead to inflated self-assessments. *Journal of Personality and Social Psychology*, 77(6), 1121–1134. DOI: https://doi.org/10.1037/0022-3514.77.6.1121

    The original finding: in skill domains (logic, grammar, humor), participants in the bottom quartile of actual performance dramatically overestimated their percentile rank, while top-quartile participants slightly *under*estimated theirs. Interpreted as a metacognitive deficit — the skills needed to perform well are the same skills needed to recognize performance. **Critical scope note**: this is about *skill* domains. The extension to personality or values has weaker empirical support.

### The critique — regression and Bayesian artifacts

12. Krueger, J., & Mueller, R. A. (2002). Unskilled, unaware, or both? The better-than-average heuristic and statistical regression predict errors in estimates of own performance. *Journal of Personality and Social Psychology*, 82(2), 180–188. DOI: https://doi.org/10.1037/0022-3514.82.2.180

    Argues the Dunning-Kruger pattern is partly a statistical artifact: regression-to-the-mean plus a general "better than average" heuristic produces the same plotted curve even without a metacognitive-deficit story. Subsequent debate has not fully resolved the magnitude of the metacognitive vs. statistical components — both seem to contribute. **Implication for 2nd-Brain**: when surfacing user self-assessments, do not treat low-skill overconfidence as a settled clinical fact. Frame any feedback as event-anchored and skill-specific rather than as global "you're overconfident."

### Beginners' overconfidence — the J-curve

13. Sanchez, C., & Dunning, D. (2018). Overconfidence among beginners: Is a little learning a dangerous thing? *Journal of Personality and Social Psychology*, 114(1), 10–28. DOI: https://doi.org/10.1037/pspa0000102

    Replicates and refines the Dunning-Kruger pattern with a finer-grained curve: complete novices are appropriately uncertain; *beginners with a small amount of training* show a confidence spike that overshoots their actual competence; intermediate learners then enter a humility trough; experts re-calibrate. **2nd-Brain implication**: a user who has just done their first deep self-reflection cycle may exhibit a "beginner's overconfidence" in their self-knowledge claims. The system should treat early-onboarding-period certainty claims as provisional and re-test over the longer arc.

## Domain-Specific Introspection

### Core affect — what the self CAN reliably introspect about emotion

14. Russell, J. A., & Barrett, L. F. (1999). Core affect, prototypical emotional episodes, and other things called emotion: Dissecting the elephant. *Journal of Personality and Social Psychology*, 76(5), 805–819. DOI: https://doi.org/10.1037/0022-3514.76.5.805

    Distinguishes **core affect** (a continuously available, dimensional sense of valence × arousal) from **prototypical emotional episodes** (categorical, multi-component events labeled with discrete emotion words). Core affect is highly accessible to introspection; emotion-category labeling (anger vs. frustration vs. resentment) is much more interpretive and varies by emotional granularity, language, and culture. **For 2nd-Brain**: queue questions about valence/arousal ("how heavy did the day feel?" "how energized?") are introspectively safer than questions about specific emotion categories ("were you angry or hurt?"). For users low in emotional granularity, the category question may not have a stable answer to be reported.

### Self-perception theory — Bem's framing

15. Bem, D. J. (1972). Self-perception theory. *Advances in Experimental Social Psychology*, 6, 1–62. DOI: https://doi.org/10.1016/S0065-2601(08)60024-6

    Bem's classic claim: when internal cues are weak or ambiguous, people infer their own attitudes by observing their own behavior — the same way they would infer someone else's attitude. This complements Nisbett & Wilson 1977 and Wilson 2002: introspective access to motivation is often *post-hoc inference from observed behavior*, not direct reading. **Direct implication for 2nd-Brain**: showing the user their own behavioral pattern (entry frequency, theme drift, what they wrote on similar past days) is, for many motivation-relevant questions, *more* informative than asking them to introspect. This is the basis for the behavior-pattern feedback loop being a primary modality, not a fallback.

### Personality — different traits, different self-other accuracy

The Vazire (2010) SOKA finding — that personality traits differ in whether self or other is a more accurate observer — is the relevant citation here, cross-linked above. The single new emphasis for this batch: the Ambiguity Queue should treat **personality-trait** questions with more humility than **value** or **situation** questions, because trait self-perception is more vulnerable to ego-protective bias (Vazire 2010) and to causal self-attribution error (Nisbett & Wilson 1977).

## Cultural Variation in Metacognition

### Divergent self-improvement vs. self-enhancement

16. Heine, S. J., Kitayama, S., Lehman, D. R., Takata, T., Ide, E., Leung, C., & Matsumoto, H. (2001). Divergent consequences of success and failure in Japan and North America: An investigation of self-improving motivations and malleable selves. *Journal of Personality and Social Psychology*, 81(4), 599–615. DOI: https://doi.org/10.1037/0022-3514.81.4.599

    A foundational empirical demonstration that Japanese participants persist longer on tasks after *failure* feedback (self-improvement orientation), while North American participants persist longer after *success* feedback (self-enhancement orientation). **Implication for the metacognition batch specifically**: an East Asian user reporting that they are "not very good at X" or "still have a lot to learn" is, on average, *not* miscalibrated — they are using a culturally-normative self-improving frame that scaffolds growth. Treating their lower self-reported confidence as evidence of low metacognitive accuracy would be a category error.

### Cross-link to the broader East-Asian self-construal literature

Heine's broader program — including Heine et al. 2002 reference-group effect (cited in `self-report-bias.md`) and Suh 2002 identity-consistency-across-contexts (cited in `cross-cultural-east-asian.md`) — frames a critical caveat: **lower self-reported certainty in East Asian samples does not equal lower introspective accuracy**. It often reflects a different presentation norm and a different relationship between self-claims and growth.

**Note on Korean self-criticism + accuracy**: a directly DOI-verified Korean / East Asian paper specifically measuring metacognitive *accuracy* (as opposed to *confidence presentation*) in a cross-cultural comparison was not located with confidence in this curation pass. The Heine et al. 2001 paper is the closest peer-reviewed anchor; further Korean-specific metacognitive-accuracy work is flagged as a gap for future curation.

## Korean / East Asian Introspection — gap acknowledgment

A targeted search for 한국심리학회지 (Korean Journal of Psychology) publications on metacognition (메타인지) yielded substantial work on **academic-learning metacognition** (study-strategy monitoring, judgments of learning) but did not surface a DOI-verified paper directly on **personality / value / self-introspection accuracy** in the Korean adult population that meets C8's verification bar within this curation pass. The Korean academic-learning metacognition literature is genuine and high-volume but is conceptually one step removed from the self-knowledge question this batch addresses.

**Korean philosophical self-cultivation traditions** (Neo-Confucian 수양 / 성찰; the Toegye–Yulgok 心學 lineage) offer rich first-person reflective frameworks distinct from Western introspection psychology. These are referenced for product-design framing but **tagged Tier D** (philosophical / pre-empirical tradition) and not cited as scientific evidence per the §3 tier rules in `CLAUDE.md`.

**Action item**: flag a future curation pass to specifically locate (a) Korean-population metacognitive-accuracy studies with DOI verification, and (b) any comparative Korean–Western introspective-accuracy studies. Until then, this batch leans on Heine 2001 + the broader `cross-cultural-east-asian.md` layer for the Korean-context layer.

## Age Range Coverage

- **Child (0–12)**: Flavell (1979) is foundational specifically in developmental work — metacognition emerges through childhood. However, the *introspection-accuracy-about-self* work (Nisbett & Wilson; Schwitzgebel; Fleming; Vazire) is adult-validated. Under-14 child-range applicability is informational only.
- **Adolescent (13–17)**: applicable in principle; metacognitive skill consolidates through adolescence. 14-17 users are now in 2nd-Brain's user range with youth safeguards.
- **Young Adult (18–29)**: primary sample for nearly all studies in this batch. Note: Sanchez & Dunning 2018 beginner-overconfidence effect is most-tested in this age range and is directly relevant to first-time journaling users.
- **Adult (30–49)**: applicable. Fleming et al. 2010 and Vazire 2010 community samples cover this range.
- **Midlife (50–64)**: applicable. Metacognitive monitoring shows mild age-related decline in some perceptual tasks but is largely preserved for personality/value self-knowledge.
- **Elderly (65+)**: applicable, with caveat — narrative life-review (cross-link `narrative-identity.md`) becomes a more salient introspective mode than in-the-moment metacognitive monitoring. Self-reported certainty often increases with age, partly reflecting genuine accumulated self-knowledge and partly reflecting cohort acquiescence (cross-link `self-report-bias.md` §9).

## Application to 2nd-Brain — the Ambiguity Resolution Queue

### Queue-routing rule by question type

Routing the Ambiguity Queue is governed by which questions users can reliably introspect about. Combining Vazire 2010 SOKA + Nisbett & Wilson 1977 + Russell & Barrett 1999 + Bem 1972:

| Question type | Introspective reliability | Queue treatment |
| --- | --- | --- |
| **Values** ("does X matter more or less to you than Y?") | High — internal-state quadrant per SOKA; values are self-defined by definition | **Queue freely**. User's answer carries high weight. |
| **Goals & situations** ("are you in a transition right now?" "is X a current focus?") | High — situational facts are self-observable | **Queue freely**. User's answer is near-ground-truth for situation facts. |
| **Internal states** ("how heavy has the week felt?" "how energized?") | High for core affect (Russell & Barrett 1999); lower for specific emotion-category labels | **Queue freely** for valence/arousal; **queue with options** for category labels (offer alternatives, accept multi-select) |
| **Personality traits** ("are you more introverted or extraverted?") | Medium — partly self-knows-best (Neuroticism), partly other-knows-best (Intellect), partly mixed (Extraversion) per SOKA | **Queue with humility framing** — see §Framing rules. Frame as "how do you see yourself" not "what are you." |
| **Causal self-attribution** ("why did you do X?" "what influenced your choice?") | Low — Nisbett & Wilson 1977; self-perception is post-hoc per Bem 1972 | **Do not queue as oracle**. May queue as *narrative invitation* if the user clearly wants to construct meaning, but never store the answer as ground truth about causation. |
| **Trait-level evaluative claims about self** ("am I creative?" "am I a good thinker?") | Low — observer-knows-best quadrant per SOKA; ego-protective bias | **Avoid queueing**. Where unavoidable, frame as event-anchored ("when was the last time something you made felt creative to you?") |

### Framing rules for trait-related queue questions

When a personality-trait question must be queued (because the user's input genuinely needs it), apply:

1. **Frame as perception, not essence**: "How do you see yourself on X?" not "Are you X?"
2. **Offer the alternative explicitly**: "Some people are more X, some more Y, some shift by context — which feels closer right now?"
3. **Time-bound**: "Right now / in this period of life" rather than "in general / always."
4. **Pair with event probe**: follow with "Is there a recent moment that felt like a clear example?" (the Bem 1972 / McAdams alignment — self-perception via observed instance).
5. **Accept "I'm not sure"**: the Ambiguity Queue must support uncertain answers as a first-class response. Forcing a binary on a low-reliability introspection produces noise, not signal.

### Confidence weighting between user self-report and behavioral signals

Per Fleming & Lau (2014), self-reported confidence is partly informative (sensitivity component) and partly stylistic (bias component) and partly first-order-skill-dependent. Therefore:

- **When user answer is in the values / goals / situations bucket**: user's stated answer outweighs behavioral pattern (the user defines what they value; the system observes; if they disagree, the user wins).
- **When user answer is in the personality-trait bucket and conflicts with high-confidence behavioral pattern**: present *both* in the persona-card with separate confidence bands. Never silently override the user; never silently dismiss the behavioral signal. Surface as "you described yourself as X; the pattern across entries reads closer to Y — both can be true; here's where the difference shows up."
- **When user answer is in the causal-attribution bucket**: do not weight behavioral signal against user's self-attribution; that direction of confrontation is the wrong move (per `self-report-bias.md` §Cautions §6 — accusations of dishonesty cost more than they yield). Instead, treat the user's attribution as part of their *narrative identity* (cross-link `narrative-identity.md`) — what they say about *why* is who they are becoming, even if it is not historically accurate about cognition.

### Forbidden Voice-layer framings

The voice / Advisor layer must NEVER use any of these:

- "We know you better than you know yourself." — empirically false (the system has no access to internal states; Schwitzgebel 2008 establishes even direct introspection is partly unreliable, which does not transfer accuracy to a text-only observer) and product-strategically toxic (corrodes trust per `data-ethics-consent.md`).
- "Your real self is X, not Y." — assumes a fixed real-self that observers can read better than the user. The evidence does not support a "real self" oracle; SOKA shows trait-specific asymmetries, not blanket access.
- "You're being dishonest with yourself." — reframes a self-report into an accusation. See `self-report-bias.md` §Cautions §6.
- "Your unconscious motivation is X." — Wilson 2002's "adaptive unconscious" framing in a clinical / oracle register; mishandled. The adaptive-unconscious thesis says introspection is bounded, *not* that any observer can substitute.

Acceptable Voice-layer framings:

- "Here's a pattern in what you've written; does it match how you'd describe yourself, or does it not quite?"
- "You told us you value X; we've also noticed Y comes up a lot — is Y part of how X shows up for you, or is something else going on?"
- "We can't tell from words alone — what's your sense?"

### Interview Question Examples (validated)

**Korean — values / goals / situations (queue-safe, high reliability)**
- 요즘 본인한테 가장 중요한 게 뭐예요? (Schwartz / SDT values — self-knows-best quadrant)
- 지금 본인의 삶에서 어떤 시기예요? 정착기, 전환기, 정리기 중에 가까운 게 있다면? (Situational fact — direct observation, queue-safe)
- 지난 한 주 동안 본인의 에너지 수준은 어땠어요? 무겁다 / 가볍다 / 그 사이 (Russell & Barrett 1999 core affect — high-reliability introspection)

**Korean — trait-related (queue with humility, framed as self-perception)**
- 본인이 본인을 봤을 때, 새로운 사람들이랑 어울리는 걸 좀 더 즐기는 편 같으세요, 익숙한 관계가 더 편한 편 같으세요? (Extraversion as self-perception, time-bound)
- 최근에 본인의 어떤 면이 가장 잘 드러난 순간이 있었다면 언제예요? (Bem 1972 — self-perception via observed instance)
- 이건 잘 모르겠으면 "잘 모르겠다"가 답이어도 괜찮아요. (Always include — uncertainty as first-class)

**Korean — causal attribution (do NOT treat as oracle)**
- 그때 그 선택을 한 게 본인한테 어떻게 의미가 있었어요? (Narrative meaning — McAdams-style; NOT a question about cognitive causation)

**English — values / goals / situations (queue-safe)**
- What matters most to you right now? (Values — self-knows-best)
- Where would you place yourself in your life right now — settling in, in transition, winding down something? (Situation — direct observation)
- How has your energy felt this past week? Heavy / light / somewhere between? (Core affect — Russell & Barrett 1999)

**English — trait-related (queue with humility)**
- When you look at yourself, do you lean more toward enjoying new people, or feeling more at ease with familiar ones? (Extraversion as self-perception)
- When was a recent moment where some part of you came through clearly? (Bem 1972 self-perception via instance)
- "Not sure" is a valid answer here. (Uncertainty as first-class)

**English — causal attribution (NOT an oracle question)**
- What did that choice mean for you at the time? (Narrative meaning — not causation)

### Trait Extraction Cues

- **High-reliability claim markers** (queue-safe domains): claim is value-based, situation-based, or affect-dimensional; backed by a specific event; user offers their own qualification ("right now," "in this period," "with people I trust"). Trust as Tier A.
- **Lower-reliability claim markers** (trait / causal-attribution domains): claim is trait-essential ("I am an X"); claim is causal about own mental process ("the reason I did Y was Z"); claim is global and unhedged ("I always," "I never," "deeply"). Apply SDR-aware confidence reduction per `self-report-bias.md` §Tier-A integrity check, plus this batch's introspection-bound humility.
- **Beginner-overconfidence flag** (Sanchez & Dunning 2018): user is in first 1–2 weeks of journaling AND making strong global self-claims AND the claim has not yet been tested against an event. Hold persona-card update; await the longer arc.
- **Cultural-context modifier**: a Korean user's lower self-reported certainty ("그런 편 같아요," "딱히 잘 모르겠어요") is *not* low metacognitive accuracy — it is a culturally-normative presentation mode (Heine 2001; cross-link `self-report-bias.md` Locke & Baik 2009). Do not down-weight.

### Advisor Guidance Patterns

- **Use behavior-pattern feedback as a primary modality, not a fallback** (Bem 1972 + Wilson 2002): showing the user their own behavioral pattern is, for many self-knowledge questions, more informative than asking them to introspect. The system can surface "you wrote about X on Y of the last Z days" as a *fact* with high confidence, while a question "are you preoccupied with X?" would have lower-reliability self-report as its answer.
- **Pair queue answers with behavioral cross-check** (Fleming & Lau 2014): when the queue returns an answer, store the user's confidence as a soft prior, not a verdict. Re-test by surfacing the answer 2–4 weeks later: "Last month you said X about yourself — does that still fit?" Drift in user's own answer over time is more diagnostic than any single self-report.
- **Frame trait persona-card cells in self-perception register**: "How you see yourself: …" not "You are: …". Reserve the "You are: …" register only for value/goal/situation cells where the user is the definitional source.
- **Honor uncertainty as a signal**: when the user answers an ambiguity prompt with "I'm not sure," that uncertainty is itself information. Do not re-prompt for a definitive answer. Cross-link `self-knowledge.md` Grant et al. 2002 — insight is an outcome, not a forced response.
- **Surface the introspection bound explicitly in onboarding** (per voice / consent layer): "We can read what you write; we cannot read your mind. When we ask you something, your answer counts. When the pattern across entries reads differently, we'll show you both." This is an empirically-honest framing aligned with `data-ethics-consent.md`.

## Cautions & Limitations

### 1. The introspective floor is not zero

Nisbett & Wilson (1977) and Schwitzgebel (2008) establish that introspection is *partial*, not absent. Vazire (2010) SOKA explicitly identifies domains where the self *is* the best observer. A product narrative of "users can't know themselves" is as empirically wrong as "users have perfect self-knowledge." Both errors damage the product:
- "Users know themselves perfectly" → over-trusts noisy self-reports, over-rides high-confidence behavioral signals, and makes false implicit promises.
- "Users can't know themselves" → invites the Advisor to overclaim, corrodes trust, and ignores the actual evidence that values/goals/states are self-best-known.

The right register is *calibrated humility on both sides*.

### 2. Dunning-Kruger applies to skills, less cleanly to personality

Kruger & Dunning (1999) is a skill-domain finding. Krueger & Mueller (2002) showed that part of the curve is statistical artifact. Direct extension to "low-self-knowledge users overestimate their self-knowledge" is *plausible* but not as well-established as the skill-domain finding. Use Dunning-Kruger framing only for skill-relevant self-claims (e.g., "I'm great at managing conflict"), not as a global "users probably don't know themselves" license.

### 3. East-Asian self-critical bias is presentation, not (necessarily) accuracy

Heine et al. (2001) and the broader cross-cultural literature show East Asian samples present lower self-reports of certainty, ability, and positivity than North American samples — and this is a culturally-normative growth-oriented presentation, not lower accuracy. Coding a Korean user's "잘 모르겠어요" or "그런 편이에요" as low metacognitive accuracy would import a Western individualist norm as if it were a measurement standard. Do not. Cross-link `self-report-bias.md` §Cultural Variation and `cross-cultural-east-asian.md`.

### 4. The "adaptive unconscious" thesis is bounded — do not weaponize it

Wilson (2002) is often misread as licensing third-party "we know your unconscious better than you do" claims. Wilson's actual claim is more modest: introspection is partial, and inferential methods (behavioral observation, others' feedback, longitudinal pattern) complement it. The "adaptive unconscious" is not a target for AI inference; it is an explanation for why complete introspective access is impossible. 2nd-Brain may legitimately surface *behavioral patterns* the user did not consciously identify, but must not narrate them as "your unconscious motivation."

### 5. The Voice layer's framing IS load-bearing — empirical correctness AND product trust

This batch's findings are not just a design preference. They constrain *what is empirically defensible* for the Advisor to say. Claims of "knowing the user better than they know themselves" are simultaneously:
- empirically false (no observer has full access; SOKA shows trait-specific asymmetries, not blanket superiority);
- ethically unsupported (claims of superior knowledge over the user are paternalist);
- product-strategically toxic (corrodes trust per `data-ethics-consent.md`; reads as "creepy" per common user-research findings in AI-self-knowledge products).

The Voice layer should never use that framing, even informally / in marketing copy.

### 6. Metacognitive ability is partly trait-like

Fleming et al. (2010) show that metacognitive sensitivity correlates with prefrontal brain structure — i.e., it is a stable individual difference. Some users will be systematically more informative when reporting their confidence than others. The product cannot rely on uniform introspective skill, and should not treat any single user's confidence rating as a normative anchor for what "high-confidence" means across the user base.

### 7. Beginner-overconfidence likely applies to early journaling cycles

Sanchez & Dunning (2018) show beginners overshoot. A user 1–2 weeks into 2nd-Brain may make very confident self-claims that the longer arc will revise. Persona-card updates should weight early certainty *less*, not more, than later certainty — opposite to a naive "first answer is freshest" heuristic.

### 8. Free-text introspection is not a validated metacognitive instrument

The peer-reviewed metacognitive-accuracy literature (Fleming & Lau 2014; Mamassian 2016) measures metacognition under *controlled task* conditions — perceptual decisions with objective accuracy. There is no validated free-text journal-based metacognitive-accuracy measure. 2nd-Brain's inference of user's introspective reliability is therefore *engineering heuristic informed by this literature*, not a measurement. Treat as a confidence-modulation input, never as a published score.

### 9. Korean-population metacognitive-accuracy DOI gap

This batch flags a curation gap: a specifically DOI-verified Korean-population study of metacognitive accuracy in the self-knowledge domain (as opposed to academic-learning metacognition) was not located. The Heine et al. 2001 paper covers Japan and is the closest peer-reviewed cross-cultural anchor. Korean Neo-Confucian self-cultivation traditions are referenced for product framing but tagged Tier D (philosophical / pre-empirical). A future curation pass should target this gap.

### 10. The Ambiguity Resolution Queue is a self-report channel — apply `self-report-bias.md`

The Queue is, by construction, a self-report instrument. Everything in `self-report-bias.md` about socially desirable responding, impression management, acquiescence, and cross-cultural response style applies to the answers the Queue collects. Apply both batches together: this batch determines *what to ask*; `self-report-bias.md` determines *how to weight the answers received*.

## Cross-References to Other Batches

- `self-report-bias.md` — Vazire 2010 SOKA (the central self/other accuracy mapping, not duplicated here); Paulhus 1984 IM/SDE; cross-cultural response style. The Queue is a self-report channel, and that batch governs how its outputs are weighted.
- `self-knowledge.md` — Grant et al. 2002 reflection-vs-insight; Trapnell & Campbell 1999 reflection-vs-rumination; Frattaroli 2006 expressive-writing moderators. The journaling layer that complements the Queue.
- `narrative-identity.md` — McAdams agency-coherence-meaning; the framing under which causal-attribution self-statements live (as narrative identity, not as cognitive ground truth).
- `cross-cultural-east-asian.md` — chemyon, honne/tatemae, Suh 2002 identity-consistency; the cultural layer that gates how lower Korean / East Asian self-reported certainty is interpreted.
- `computational-personality.md` — Park 2015 text → trait ceiling at r ≈ .35–.40; the upper bound on what behavioral-pattern inference can achieve. Limits the "we know you better" claim from the inference side as `self-report-bias.md` SOKA limits it from the trait side.
- `cbt-rebt.md` — for cognitive-distortion patterns (catastrophizing, mind-reading, etc.); a Voice-layer "we know your motivation" claim is itself a mind-reading distortion when modeled by AI.
- `data-ethics-consent.md` — the trust-and-disclosure framework under which Voice-layer claims about user inner life must be calibrated.
- `crisis-detection.md` — crisis-content routing supersedes any introspection-bound reasoning. A user expressing crisis content goes to crisis protocol regardless of their metacognitive certainty.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/metacognition-introspection.sql` (to be created in companion commit). Rows tagged `framework='metacognition_introspection'` with sub-slugs `metacognition_foundational`, `metacognitive_accuracy`, `introspection_limits`, `self_knowledge_feedback`, `dunning_kruger`, `domain_specific_introspection`, `cultural_metacognition`.

```sql
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Telling more than we can know: Verbal reports on mental processes',
    ARRAY['Richard E. Nisbett', 'Timothy D. Wilson'],
    '10.1037/0033-295X.84.3.231',
    'https://doi.org/10.1037/0033-295X.84.3.231',
    'metacognition_introspection',
    'adult',
    'en',
    now(),
    '내성(introspection)의 한계를 입증한 정초 논문. 사람들이 자신의 행동의 원인에 대해 말하는 내용은 실제 인지 과정에 대한 직접 접근이라기보다 문화적으로 공유된 인과 이론을 반영하는 경우가 많음을 실험적으로 증명. 2nd-Brain의 Ambiguity Resolution Queue가 사용자에게 "왜 그랬어요"를 물을 때 그 답을 인과적 진실로 다루지 말아야 함을 정초하는 근거.',
    'The seminal demonstration that people''s verbal reports about *why* they made a choice or *what* influenced their behavior are systematically inaccurate — often reflecting culturally-shared causal theories rather than direct access to mental processes. The foundational reason 2nd-Brain''s Ambiguity Queue must not treat user-supplied causal self-attributions as ground truth.',
    'Ambiguity Queue 라우팅 규칙: 가치/목표/상황 질문은 자유롭게 큐잉, 성격 특성 질문은 self-perception 프레이밍으로 큐잉, 인과 귀속 질문("왜 그랬어요")은 oracle로 다루지 않음. Voice 레이어는 "당신의 진짜 동기는 X예요" 같은 단언 금지.'
  );
-- (additional rows for all 13 DOI-verified entries follow same pattern)
```

## Verification Summary

- **DOIs verified via Crossref / publisher record** in this curation pass: **13**
  1. Flavell 1979 — `10.1037/0003-066X.34.10.906`
  2. Nelson & Narens 1990 — `10.1016/S0079-7421(08)60053-5`
  3. Fleming & Lau 2014 — `10.3389/fnhum.2014.00443`
  4. Fleming et al. 2010 — `10.1126/science.1191883`
  5. Mamassian 2016 — `10.1146/annurev-vision-111815-114630`
  6. Nisbett & Wilson 1977 — `10.1037/0033-295X.84.3.231`
  7. Schwitzgebel 2008 — `10.1215/00318108-2007-037`
  8. Bollich, Johannet & Vazire 2011 — `10.3389/fpsyg.2011.00312`
  9. Kruger & Dunning 1999 — `10.1037/0022-3514.77.6.1121`
  10. Krueger & Mueller 2002 — `10.1037/0022-3514.82.2.180`
  11. Sanchez & Dunning 2018 — `10.1037/pspa0000102`
  12. Russell & Barrett 1999 — `10.1037/0022-3514.76.5.805`
  13. Bem 1972 — `10.1016/S0065-2601(08)60024-6`
  14. Heine et al. 2001 — `10.1037/0022-3514.81.4.599`

  **Total verified DOIs: 14** (after recount including Heine 2001 explicitly in the verification list).

- **Sources cited but NOT added as `knowledge_sources` rows** (per C8 DOI requirement):
  - **Wilson 2002** *Strangers to Ourselves* — book, ISBN 978-0-674-00936-3. Canonical reference; cited foundationally; pre-DOI book.
  - **Fleming 2014** "The cost of confidence" — *Aeon* popular-science essay, not peer-reviewed, no DOI. Cited only as gloss; the substantive claim is carried by Fleming et al. 2010 (peer-reviewed) and Fleming & Lau 2014 (peer-reviewed).
  - **Vazire 2010 SOKA** — already a row in `self-report-bias.md`. Cross-linked from this batch, not duplicated as a row per the no-duplication principle in `CLAUDE.md` §5.

- **[NO VERIFIED SOURCE] gaps explicitly flagged**:
  - **Korean-population metacognitive-accuracy in the self-knowledge domain** — gap. Korean academic-learning metacognition literature exists but is conceptually one step removed; a directly-on-topic DOI-verified Korean study was not located in this curation pass. Future curation target.
  - **Korean Neo-Confucian self-cultivation tradition** — referenced as Tier D (philosophical / pre-empirical); not a scientific-evidence row.

- **Total verified DOI rows for SQL seed**: 14 (13 required-scope + Heine 2001 cross-cultural anchor counted once in the canonical list).
