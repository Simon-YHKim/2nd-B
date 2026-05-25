# Framework: Attachment Theory (Infant + Adult)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).

## Foundational Sources

1. Ainsworth, M. D. S., & Bell, S. M. (1970). Attachment, exploration, and separation: Illustrated by the behavior of one-year-olds in a strange situation. *Child Development*, 41(1), 49–67. DOI: https://doi.org/10.2307/1127388
2. Hazan, C., & Shaver, P. (1987). Romantic love conceptualized as an attachment process. *Journal of Personality and Social Psychology*, 52(3), 511–524. DOI: https://doi.org/10.1037/0022-3514.52.3.511
3. Bartholomew, K., & Horowitz, L. M. (1991). Attachment styles among young adults: A test of a four-category model. *Journal of Personality and Social Psychology*, 61(2), 226–244. DOI: https://doi.org/10.1037/0022-3514.61.2.226
4. Fraley, R. C., Waller, N. G., & Brennan, K. A. (2000). An item response theory analysis of self-report measures of adult attachment. *Journal of Personality and Social Psychology*, 78(2), 350–365. DOI: https://doi.org/10.1037/0022-3514.78.2.350

**Note**: Bowlby's *Attachment and Loss* trilogy (1969, 1973, 1980, Basic Books) is the theoretical foundation but is a book series without single-paper DOI. Ainsworth & Bell (1970) is the canonical empirical anchor.

## Recent Validation (last 10 years)

1. Fraley, R. C. (2019). Attachment in adulthood: Recent developments, emerging debates, and future directions. *Annual Review of Psychology*, 70, 401–422. DOI: https://doi.org/10.1146/annurev-psych-010418-102813

## Korean-Context Adaptations

- Lee, J., Kim, Y.-K., & Shin, Y.-J. (2023). Validation of the Korean Version of Culturally Responsive Experiences in Close Relationships–Short Form. *International Journal for the Advancement of Counselling*, 45(1), 57–81. DOI: https://doi.org/10.1007/s10447-023-09503-6

## Age Range Coverage

- **Child (0–12)**: applicable — Strange Situation classifies infant attachment (secure / anxious-ambivalent / avoidant / disorganized) at 12 months. Continuity through middle childhood is moderate.
- **Adolescent (13–17)**: applicable — adult attachment representations begin to consolidate; AAI and adolescent-adapted ECR variants used.
- **Young Adult (18–29)**: applicable — most-studied window; ECR-R and Korean ECR-R-SF validated here.
- **Adult (30–49)**: applicable — attachment style stable but updatable via "earned secure" trajectories (Fraley 2019).
- **Midlife (50–64)**: applicable but less studied.
- **Elderly (65+)**: partially — attachment dynamics shift toward children and chosen kin; fewer validated instruments.

## Application to 2nd-Brain

### Interview Question Examples (validated)

Inspired by ECR-R dimensions (Anxiety, Avoidance) and four-category model (Bartholomew & Horowitz 1991). **Open-ended reflection, not diagnostic.**

**Korean**
- 가까운 사람에게 "내가 부담스러운 거 아닐까" 같은 걱정이 들 때가 있나요? 보통 그게 어떤 상황에서 그래요? (Anxiety)
- 누군가 본인에게 정말 가까워지려고 할 때 보통 어떤 느낌이 드세요? (Avoidance)
- 힘들 때 가장 먼저 떠오르는 사람이 있다면 누구이고, 실제로 연락을 하시나요? (Secure base behavior)
- 어릴 때 마음이 힘들면 부모님이나 보호자가 어떻게 반응해주셨던 기억이 있으세요? (Internal working model origins)

**English**
- Do you ever worry that you're "too much" for the people closest to you? When does that come up? (Anxiety)
- When someone tries to get really close to you, what's the first feeling you notice? (Avoidance)
- When you're struggling, who comes to mind first — and do you actually reach out? (Secure base behavior)
- Looking back at childhood: when you were upset, how did your parent or caregiver typically respond? (Internal working model origins)

### Trait Extraction Cues

- **Attachment Anxiety (high)**: preoccupation with relationship status across entries, vigilance for rejection cues, reassurance-seeking language, catastrophizing partner silences.
- **Attachment Avoidance (high)**: minimization of emotional needs ("I don't really need anyone"), discomfort with disclosure, framing independence as identity rather than choice.
- **Secure**: comfort with both connection and autonomy; ability to name negative feelings about close others without dissolving the bond.
- **Earned secure markers**: explicit narratives of having reworked early relationship templates (therapy, mentorship, long stable partnership).

Aggregate across ≥15 entries before tagging. Treat childhood-origin questions with care — they can surface trauma; route to Safety Classifier if distress signals appear.

### Advisor Guidance Patterns

- Frame attachment as **behavioral patterns under stress**, not personality identity. Phrase: "When you feel disconnected, you tend to X — does that ring true?"
- Anchor change-orientation on **earned secure** trajectory (Fraley 2019): attachment is updatable through consistent corrective relational experiences.
- For high-anxiety users: prompts on tolerating uncertainty, naming the fear before reaching out, distinguishing fact from prediction.
- For high-avoidance users: prompts on micro-disclosures, naming what closeness costs them, tracking patterns of withdrawal.
- **Never label** users as "anxious" or "avoidant" — describe behavior, ask the user to confirm.

## Cautions & Limitations

- **Self-report ≠ AAI**: self-report attachment measures (ECR family) tap conscious romantic-attachment representations and only modestly correlate with the Adult Attachment Interview, which taps state of mind regarding early caregivers. They measure related but distinct constructs (Fraley 2019).
- **Categorical vs dimensional**: Hazan & Shaver's 3 styles and Bartholomew's 4 categories are heuristic; modern measurement (Fraley et al. 2000) treats attachment as 2 continuous dimensions (Anxiety, Avoidance).
- **Childhood-origin questions are sensitive**: can surface unprocessed grief, neglect, or abuse. Use sparingly and route distress to Safety Classifier.
- **Cross-cultural caveat**: Strange Situation distributions vary by culture; collectivist contexts show higher rates of "anxious-ambivalent" classification under Western coding (van IJzendoorn & Kroonenberg 1988 — older but standard caveat). Lee et al. (2023) developed a culturally-responsive Korean short form precisely to address this. Use Korean-adapted measures, not direct translations.
- **Not therapy**: identifying an attachment pattern is not treatment. Insecure attachment is not a disorder.
- **Disorganized attachment** is a clinical category — never apply this label from journal text alone.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/attachment.sql`.
