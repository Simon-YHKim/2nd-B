# Framework: Computational Personality Inference (LLM Trait Extraction Reliability)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Trust score target**: P1 critical gap (was 20/100 in audit). Establishes the academic basis for the **Inference Engine (Engine 2)** of the 2nd-Brain blueprint — specifically, the question "**can an LLM reliably extract Big Five traits from a user's journal entries**?" The short answer from the evidence: **yes for English with substantial training data, partial for short personal text, largely uncertain for Korean journal text**. This batch establishes the precision-and-humility framing the Advisor must adopt.

## AI Retrieval Guide (for RAG / Wiki use)

**When user input or system needs to answer** → **look here**:
- "Can the app know my personality from my writing?" → §Pennebaker 2003 + §Schwartz 2013 + §Kosinski 2013 + §Honest framing (below)
- "What accuracy can we promise for the persona card?" → §Park 2015 + §Maharjan 2025 (LLM specific)
- "Is this method known to work in Korean?" → §Korean gap (below)
- "What language features predict Big Five?" → §Schwartz 2013 open-vocabulary findings
- "Why is this not the same as a clinical assessment?" → §Validity boundary (below)

## Foundational Sources (Western)

1. Pennebaker, J. W., Mehl, M. R., & Niederhoffer, K. G. (2003). Psychological aspects of natural language use: Our words, our selves. *Annual Review of Psychology*, 54, 547–577. DOI: https://doi.org/10.1146/annurev.psych.54.101601.145041
   - **The foundational synthesis** for the personality-from-language program. Establishes that function words (pronouns, articles, prepositions) reveal psychological state at scale. **LIWC dictionary** (referenced extensively in this paper) is the historical lineage to modern LLM-based extraction.

2. Kosinski, M., Stillwell, D., & Graepel, T. (2013). Private traits and attributes are predictable from digital records of human behavior. *Proceedings of the National Academy of Sciences*, 110(15), 5802–5805. DOI: https://doi.org/10.1073/pnas.1218772110
   - **N = 58,000 Facebook users**. Demonstrated that digital trace data predicts Big Five traits, demographics, political views, and sexual orientation with surprising accuracy. **Critical for 2nd-Brain**: shows the predictive ceiling, and also the privacy/consent stakes — these predictions are personally identifying.

3. Schwartz, H. A., Eichstaedt, J. C., Kern, M. L., Dziurzynski, L., Ramones, S. M., Agrawal, M., Shah, A., Kosinski, M., Stillwell, D., Seligman, M. E. P., & Ungar, L. H. (2013). Personality, gender, and age in the language of social media: The open-vocabulary approach. *PLOS ONE*, 8(9), e73791. DOI: https://doi.org/10.1371/journal.pone.0073791
   - **700 million words from 75,000 Facebook users**. The "open-vocabulary" finding: data-driven topic discovery outperforms dictionary-based (LIWC) approaches for Big Five prediction. **This is the architectural template** for any modern LLM-based trait extraction.

4. Park, G., Schwartz, H. A., Eichstaedt, J. C., Kern, M. L., Kosinski, M., Stillwell, D. J., Ungar, L. H., & Seligman, M. E. P. (2015). Automatic personality assessment through social media language. *Journal of Personality and Social Psychology*, 108(6), 934–952. DOI: https://doi.org/10.1037/pspp0000020
   - **N = 66,732 Facebook users**. Trained on language → predicted Big Five with **correlations of r ≈ 0.35–0.42** with self-report (Conscientiousness highest at r=0.42; Neuroticism lowest at r=0.35). **The single most-cited reference point for LLM-from-text personality accuracy.** Important caveat: these results required **enormous data per user** (hundreds to thousands of words) — short journal entries will yield much weaker signal.

## Recent Validation — LLM-Specific (Western, 2025)

5. Maharjan, J., Jin, R., Zhu, J., & Kenne, D. (2025). Do large language models really understand personality? *Journal of Medical Internet Research* (preprint accepted). DOI: https://doi.org/10.2196/75347
   - **Direct LLM personality-prediction benchmark** comparing OpenAI embeddings, BERT, RoBERTa on PANDORA Reddit dataset. Confirms LLM embeddings can match or modestly exceed traditional feature-engineering approaches. Model size matters but not as much as task-specific evaluation. **The contemporary anchor for "what accuracy is realistic" claims.**

## Korean Context — Identified Gap

[NO VERIFIED SOURCE FOUND] for **Korean-language LLM-based Big Five extraction** with a registered DOI in this session.

What this means for 2nd-Brain:
- All four Western papers above used **English** social media text. LIWC, open-vocabulary topics, and most LLM embeddings have weaker performance on Korean.
- Korean journaling text differs structurally: **honorifics, particle-rich syntax, indirect emotional expression, collectivist content**. Function-word features (pronouns) — which are central to Pennebaker's findings — work differently in pro-drop Korean.
- **2nd-Brain's persona card Engine 2 must be substantially more conservative in Korean than English about claimed accuracy.** Specifically: present "patterns we noticed in your entries" rather than "your personality traits".
- Korean adaptation of LIWC (K-LIWC) exists in some research literature but no DOI-registered LLM-Korean-Big-Five benchmark was confirmable in this session — **this is itself a future-batch priority**.

## Age Range Coverage

Western evidence base is overwhelmingly young-adult (Facebook/Reddit samples). Application to other age ranges is extrapolation:
- **Adolescent (13–17)**: not applicable for 2nd-Brain (18+) but research base is adolescent-skewed.
- **Young Adult (18–29)**: strongest evidence.
- **Adult (30–49)**: applicable but writing-style norms differ from social media style.
- **Midlife (50–64)**: limited evidence; older adults less represented in training corpora.
- **Elderly (65+)**: very limited evidence; extraction confidence should drop materially.

## Application to 2nd-Brain

### The Validity Boundary — what Engine 2 can and cannot claim

| Claim | Evidence support | Recommended Advisor wording |
| --- | --- | --- |
| "Your Big Five traits are X" | **Weak for short text** | ❌ Do not claim |
| "Your entries often touch on themes typical of high X" | **Park 2015 supports for English with sufficient data** | ✅ "Across your entries this month, themes consistent with [openness] showed up X times — does that match how you see yourself?" |
| "You are a [Big Five type]" | **No evidence; Big Five is dimensional, not categorical** | ❌ Do not claim |
| "Here's a self-reflection prompt designed for someone whose recent entries lean toward X" | **Defensible — frames it as adaptive content, not diagnosis** | ✅ |
| "Your personality has changed" | **Weak — requires Bleidorn 2022 longitudinal logic with substantial time + data** | ⚠️ Only after months of substantial entry, and with caveats |

### Multi-source triangulation principle

Park (2015) achieved r ≈ 0.4 with hundreds-of-words-per-user training. A typical 2nd-Brain user might write 50–200 words per entry, 3–5 entries per week. **Single-entry inference is unreliable**; trait inference should accumulate across:

1. **Linguistic features** (vocabulary, sentence structure, pronoun ratios) — Pennebaker 2003
2. **Topic distribution** (which life domains are mentioned, how often) — Schwartz 2013 open-vocab
3. **Affect distribution** (positive vs negative valence across entries) — standard sentiment analysis
4. **Self-described content** (when user states a preference / trait) — highest-weight signal
5. **Cross-entry consistency** (does the pattern persist across weeks?) — minimum 30+ entries before naming a trait

### Recommended persona card structure (Engine 2 output)

```yaml
persona_card:
  version: 4  # incrementing with substantial new data
  generated_at: 2026-08-10T...
  data_basis:
    entries_analyzed: 47
    total_words: 12340
    date_span_days: 62
  confidence_band: medium  # low | medium | high
  observations:
    - dimension: openness
      direction: above_average
      confidence: medium
      evidence_count: 11  # number of entries showing the pattern
      example_themes: ["unfamiliar ideas", "aesthetic detail"]
      hedge: "based on language patterns in your recent entries"
    - dimension: conscientiousness
      direction: uncertain
      confidence: low
      note: "mixed signals — recent entries lean lower than older entries"
  user_confirmable: true
  user_can_disagree: true
  not_a_diagnosis: true
  consult_notes: "this is a pattern observation, not a clinical assessment"
```

### Honest framing in user-facing UI

**Do:**
- "Patterns we noticed in your recent writing"
- "This often signals X — does that resonate?"
- "Want to track whether this stays stable over the next month?"
- (Korean) "최근 기록에서 자주 보이는 패턴은…"

**Do not:**
- "Your personality type is..."
- "We've analyzed you and found that you are..."
- "Your scores are..."
- (Korean) "본인의 성격은 ~형입니다"

## Cross-references

- **Big Five framework foundations**: see `big-five.md` for the trait constructs themselves and longitudinal stability evidence (Bleidorn 2022).
- **Why short journal entries are inherently weak signal**: see `self-knowledge.md` Frattaroli (2006) on minimum-session-duration evidence (≥15min effective).
- **Korean Big Five validation**: see `big-five.md` Choi et al. (2025) — confirms Big Five structure in Korean but does NOT validate LLM-based extraction in Korean.
- **Privacy stakes**: Kosinski (2013) shows how powerful these inferences can be — pair with `data-ethics-consent` batch (forthcoming) on informed consent for trait inference.

## Cautions & Limitations

- **r ≈ 0.4 is moderate**: explains roughly 16% of variance. **Most users will see prediction errors.** Treat Engine 2 output as conversation starter, not ground truth.
- **Self-fulfilling labeling risk**: if the app says "you're high in Openness," users may begin to behave more openly — confirmation effect inflating apparent accuracy. Pre-empt by always inviting disagreement.
- **Cultural bias of training data**: Western Facebook/Reddit samples encode US conversational norms. Korean users' patterns will be filtered through a Western-trained lens unless explicitly recalibrated.
- **Privacy stakes are higher than the app's framing suggests**: Kosinski (2013) showed digital traces predict sexual orientation, political views, ethnicity with high accuracy. Engine 2 must NEVER infer or surface these categories even if statistically possible.
- **No clinical diagnosis**: Big Five is a personality framework, not a clinical instrument. Persona cards must explicitly disclaim diagnostic interpretation.
- **Insufficient data for confident inference is the default, not the exception**: most users in their first month will not have generated enough text for moderate-confidence trait estimates. Engine 2 should default to "low confidence" or refuse to produce a card until threshold met.
- **The "personality" of an LLM itself confuses things**: recent work (Cureus 2024 LLM personality profiles, in Maharjan 2025 references) shows LLMs themselves have measurable personality biases that can leak into trait extraction. Reproducibility checks essential.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/computational-personality.sql`.
