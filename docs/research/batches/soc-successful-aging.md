# Framework: SOC (Selective Optimization with Compensation) + Successful Aging

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).

Two complementary aging frameworks covered together: **Baltes's SOC** (process-level — how people manage gains and losses across the lifespan) and **Rowe & Kahn's successful aging** (outcome-level — what successful aging looks like at the population level). Modern Korean aging research uses them together.

## Foundational Sources

1. Baltes, P. B. (1997). On the incomplete architecture of human ontogeny: Selection, optimization, and compensation as foundation of developmental theory. *American Psychologist*, 52(4), 366–380. DOI: https://doi.org/10.1037/0003-066X.52.4.366
2. Rowe, J. W., & Kahn, R. L. (1997). Successful aging. *The Gerontologist*, 37(4), 433–440. DOI: https://doi.org/10.1093/geront/37.4.433
3. Freund, A. M., & Baltes, P. B. (2002). Life-management strategies of selection, optimization, and compensation: Measurement by self-report and construct validity. *Journal of Personality and Social Psychology*, 82(4), 642–662. DOI: https://doi.org/10.1037/0022-3514.82.4.642

## Recent Validation (last 10 years)

1. Kim, S.-H., Park, S., & Park, K.-S. (2017). Correlates of successful aging in South Korean older adults: A meta-analytic review. *Asia Pacific Journal of Public Health*, 29(7), 544–559. DOI: https://doi.org/10.1177/1010539517717021

## Korean-Context Adaptations

The Kim, Park, & Park (2017) meta-analysis above also serves as the Korean-context source — it synthesizes 17+ Korean studies on successful aging and reports culturally-relevant correlates (subjective health, family relationships, leisure, social engagement) distinct from the Western Rowe-Kahn weights.

## Age Range Coverage

- **Child–Young Adult (0–29)**: SOC processes operate but salience is low; mostly resource-acquisition phase.
- **Adult (30–49)**: applicable — SOC peaks in middle adulthood (Freund & Baltes 2002 reported middle-aged adults endorse SOC most strongly).
- **Midlife (50–64)**: applicable — Selection (which goals to keep), Optimization (how to maintain them), Compensation (how to substitute for declining capacity) become central.
- **Elderly (65+)**: applicable — both SOC and successful aging are designed for this stage.

## Application to 2nd-Brain

### Interview Question Examples (validated)

Distinct prompt sets for SOC (process) and successful-aging (outcome) framings.

**Korean — SOC framing**
- 요즘 본인이 ''이건 꼭 잡고 가야겠다''고 선택한 일과, ''이건 내려놓겠다''고 정한 일이 있다면 어떤 거예요? (Selection)
- 이전과 같은 결과를 내려고 본인이 새로 들이는 시간이나 노력이 있다면 어떤 거예요? (Optimization)
- 예전에는 쉽게 했던 일을 지금은 어떻게 다른 방식으로 해결하고 계세요? (Compensation)

**Korean — Successful aging framing**
- 본인에게 ''잘 늙어가고 있다''는 건 어떤 모습이세요? (Subjective successful aging)
- 지금 본인의 삶에서 가장 의미 있다고 느끼는 관계나 활동은 무엇이세요? (Engagement)
- 지난 한 달 동안 본인이 ''내가 누군가에게 도움이 됐다''고 느낀 순간이 있다면 어떤 거였어요? (Productive engagement)

**English — SOC framing**
- What's something you've recently decided to commit to, and something you've decided to let go of? (Selection)
- Where are you putting extra time or effort now to get the same result you used to get easily? (Optimization)
- Is there something you used to do one way and now do differently to get the same outcome? (Compensation)

**English — Successful aging framing**
- What does "aging well" look like for you, personally? (Subjective successful aging)
- What relationships or activities feel most meaningful to you right now? (Engagement)
- Tell me about a moment in the last month when you felt useful to someone. (Productive engagement)

### Trait Extraction Cues

- **Selection (elective)**: explicit goal-narrowing language, prioritization narratives.
- **Selection (loss-based)**: dropping previously-held roles or activities tied to a stated loss (health, retirement, bereavement).
- **Optimization**: investing more time, training, or planning to maintain prior performance levels.
- **Compensation**: using new means (technology, others' help, modified methods) to achieve unchanged ends.
- **Subjective successful aging**: presence of meaning vocabulary, autonomy in daily life, valued relationships.
- **Disengagement risk**: vocabulary of withdrawal, loneliness, role-loss without compensation.

### Advisor Guidance Patterns

- For midlife and older users, frame change as **strategy**, not loss. SOC reframes "I can't do X anymore" into "I'm choosing where to invest and how to substitute."
- Use Freund & Baltes (2002) finding: middle-aged adults endorse SOC most. For 40s–50s users, SOC prompts can be high-utility even before significant capacity decline.
- Use Kim, Park & Park (2017) Korean meta-analysis: in Korean elderly samples, **subjective health, family relationships, and meaningful social engagement** are stronger correlates of successful aging than the Western emphasis on disease avoidance alone. Adjust prompts accordingly.
- Avoid the Rowe-Kahn trap: do not frame successful aging as the absence of illness or limitation. Many users with chronic conditions age successfully on subjective and relational dimensions.
- For users facing loss-based selection (retirement, bereavement, illness), prioritize compensation prompts before optimization — the resource ground has shifted.

## Cautions & Limitations

- **Rowe-Kahn criticism**: the original "successful aging" model has been critiqued for implying that aging with chronic illness or disability is "unsuccessful," with ableist implications. Modern frameworks (including the Korean meta-analysis) emphasize subjective and relational components. Do not score users against the original biomedical criteria.
- **SOC is normative, not universal**: SOC is observed but not the only adaptive strategy; some older adults thrive via expansion rather than selection. Use as a vocabulary, not a prescription.
- **Cultural context**: Korean successful-aging research weights family relationships and leisure differently from Western samples (Kim, Park, & Park 2017). Use Korean-validated correlates.
- **Not a diagnostic for dementia or depression**: capacity declines from these conditions are clinical and require separate routing.
- **Avoid implying that not aging "successfully" is a personal failure**: structural factors (poverty, isolation, health system access) heavily shape who can deploy SOC effectively.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/soc-successful-aging.sql`.
