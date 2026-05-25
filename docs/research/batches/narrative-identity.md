# Framework: Narrative Identity (McAdams)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).

This framework is the most direct theoretical fit for 2nd-Brain's core mechanic: people make sense of who they are by **constructing and revising a life story**. Journal entries are raw material for that story; the Advisor's reflection prompts are story-development tools.

## Foundational Sources

1. McAdams, D. P. (2001). The psychology of life stories. *Review of General Psychology*, 5(2), 100–122. DOI: https://doi.org/10.1037/1089-2680.5.2.100

## Recent Validation (last 10 years)

1. McAdams, D. P., & McLean, K. C. (2013). Narrative identity. *Current Directions in Psychological Science*, 22(3), 233–238. DOI: https://doi.org/10.1177/0963721413475622
2. Adler, J. M., Lodi-Smith, J., Philippe, F. L., & Houle, I. (2016). The incremental validity of narrative identity in predicting well-being: A review of the field and recommendations for the future. *Personality and Social Psychology Review*, 20(2), 142–175. DOI: https://doi.org/10.1177/1088868315585068

## Korean-Context Adaptations

- Park, S., Park, J.-H., Hong, I., Kim, T. H., Alea, N., & Bluck, S. (2024). Validating the Korean version of the Thinking About Life Experiences Scale. *Applied Cognitive Psychology*, 38(1), e4168. DOI: https://doi.org/10.1002/acp.4168

   Note: The TALE-K is the first DOI-registered Korean validation of an autobiographical-memory function scale. The paper documents that Korean older adults show **lower functional use of autobiographical memory** than Western samples — interpreted as a collectivist-cultural pattern where remembering personal experiences is less daily-life-central than in individualist contexts. This has direct design implications: prompts must invite, not assume, life-story narration in Korean users.

## Age Range Coverage

- **Child (0–12)**: limited — coherent self-narrative formation begins in middle childhood but is not the framework's central focus.
- **Adolescent (13–17)**: applicable — McAdams positions adolescence as the emergence of narrative identity work.
- **Young Adult (18–29)**: applicable — peak narrative-identity construction window.
- **Adult (30–49)**: applicable — narrative consolidation and revision.
- **Midlife (50–64)**: applicable — generativity scripts, life-review onset.
- **Elderly (65+)**: applicable — formal life-review (Butler tradition) and Korean TALE-K validation here.

## Application to 2nd-Brain

### Interview Question Examples (validated)

Anchored on Adler et al. (2016)'s four narrative dimensions: motivational themes (agency, communion), affective themes (redemption, contamination), themes of integrative meaning, and structural elements (coherence). **Open-ended life-story prompts.**

**Korean**
- 본인의 인생을 책이라고 생각하면 지금까지 몇 개의 ''장(chapter)''으로 나뉘어 있을 것 같으세요? 그 장들에 어떤 제목을 붙이시겠어요? (Coherence / structure)
- 본인 인생에서 ''힘들었지만 결국 의미가 있었던'' 일이 있다면 어떤 거였어요? (Redemption sequence)
- 본인 인생에서 ''내가 무엇을 선택했다''고 가장 분명하게 말할 수 있는 순간이 있다면 언제예요? (Agency)
- 지금까지 가장 깊이 연결됐다고 느끼는 사람이나 공동체가 있다면 어떤 관계예요? (Communion)
- 5년 후, 10년 후 본인을 떠올렸을 때 ''이 시기에는 ~한 사람이었다''고 회상하실 것 같으세요? (Imagined future / temporal integration)

**English**
- If your life were a book, how many chapters would it have so far? What would you title them? (Coherence / structure)
- Is there something hard in your life that turned out to matter? (Redemption sequence)
- When in your life can you most clearly say "I chose this"? (Agency)
- Who or what community do you feel most deeply connected to? (Communion)
- Looking ahead, when you remember "yourself in this period" five or ten years from now, what will you remember? (Imagined future / temporal integration)

### Trait Extraction Cues

Adler et al. (2016) found the strongest well-being correlations for three narrative dimensions:

- **Agency**: language of choice, intention, "I decided / I made it happen"; strong in well-being entries.
- **Communion**: relational specificity, named others, mutual reference; protective against isolation patterns.
- **Redemption sequences**: explicit "bad → good" narrative arcs in difficulty entries; correlated with mental health (McAdams 2001).
- **Contamination sequences**: "good → bad" arcs in positive-event entries; risk signal for depression-pattern users.
- **Coherence**: temporal sequence, thematic continuity across entries spanning weeks/months.
- **Integrative meaning**: explicit lesson-drawing, value-articulation, "what this means for me" language.

These dimensions are extractable from journal entries with both LLM-based parsing (theme identification) and surface signals (pronouns, verb tense, valence shifts).

### Advisor Guidance Patterns

- 2nd-Brain's interview engine should **scaffold narrative construction**, not just collect data. After several entries on a theme, the Advisor can offer: "Across the last few weeks you've written about X — would it help to step back and look at this as a chapter?"
- Use Adler et al. (2016) incremental validity finding: narrative identity predicts well-being **above and beyond** Big Five and demographics. This justifies investing product effort in narrative-coherence support, not just trait scoring.
- For Korean users, reference Park et al. (2024): Korean elderly show lower default autobiographical-memory functional use. The Advisor should **invite** life-story prompts ("would it be okay to ask about ~?") rather than assume readiness. Family-shared and relational memories may be more accessible than purely individual self-narrative.
- For users whose entries skew toward **contamination sequences** (good things going bad), this is a clinically-relevant signal — do not pathologize, but consider it for risk-stratification routing.
- Avoid imposing a single "redemptive arc" frame on hard experiences — McAdams notes redemption is one healthy form, not the only one. Some experiences are simply painful and do not need to be made meaningful; presence and acknowledgement may matter more than reframing.

## Cautions & Limitations

- **Narrative coercion risk**: pushing users toward redemptive arcs when their experience is not yet (or not ever) redemptive is a documented harm pattern in narrative-therapy critiques. The Advisor must allow stories to remain unresolved.
- **Cultural variance**: McAdams's empirical base is heavily US-Western; redemption-sequence prevalence is partly a US cultural script. Korean (and other East Asian) users may construct meaning through different scripts (relational obligation, harmony, persistence). Do not score Korean narratives against US-derived structural ideals.
- **Korean adult finding (Park et al. 2024)**: lower default autobiographical-memory functional use in Korean older adults — design implication: do not assume users will spontaneously narrate. Scaffold gently.
- **Privacy and consent**: deep narrative material is sensitive. Storage, sharing, and retention policies must be explicit and conservative. Re-surfacing of past entries should be opt-in, not algorithmic.
- **Not therapy**: narrative reflection has therapeutic features but is not therapy. Trauma narratives in particular should be flagged for professional referral rather than processed in-product.
- **Not a single coherence requirement**: real lives have non-coherent stretches. Forced coherence is a misuse of the framework.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/narrative-identity.sql`.
