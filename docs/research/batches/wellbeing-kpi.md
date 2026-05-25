# Framework: Wellbeing Outcome Measurement (Longitudinal KPI)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Trust score target**: Closes the "longitudinal KPI" audit gap (was 70/100). 2nd-Brain needs validated outcome measures to know if it actually helps users — not just engagement metrics. This batch establishes the standard wellbeing instruments + Korean validation, with explicit guidance on what to measure, when, and how to interpret change.

## AI Retrieval Guide (for RAG / Wiki use)

**When the question is** → **look here**:
- "How do we know 2nd-Brain works?" → §All four sources + §KPI cadence (below)
- "What's a fast, low-friction wellbeing check?" → §WHO-5 (Topp 2015)
- "Comprehensive life-satisfaction measure?" → §SWLS (Diener 1985)
- "Multidimensional flourishing measure?" → §PERMA-Profiler (Butler & Kern 2016)
- "Korean validation exists?" → §Moon 2014 (K-WHO-5) + Korean SWLS note
- "When should we measure?" → §Cadence (below)
- "What change is meaningful?" → §Minimum clinically important difference (below)

## Foundational Sources

1. Diener, E., Emmons, R. A., Larsen, R. J., & Griffin, S. (1985). The Satisfaction with Life Scale. *Journal of Personality Assessment*, 49(1), 71–75. DOI: https://doi.org/10.1207/s15327752jpa4901_13
   - **The standard global life-satisfaction measure**. 5 items, 7-point Likert. Range 5–35. Used in thousands of studies. Korean adaptation (조명한 & 차경호 1998) exists; updated validation by 임영진 (2012) — KCI-indexed without DOI in available registers.

2. Topp, C. W., Østergaard, S. D., Søndergaard, S., & Bech, P. (2015). The WHO-5 Well-Being Index: A systematic review of the literature. *Psychotherapy and Psychosomatics*, 84(3), 167–176. DOI: https://doi.org/10.1159/000376585
   - **Systematic review** of the WHO-5 — among the most widely used wellbeing instruments globally. 5 items, ~1 minute completion, well-validated as a screening tool for depression and a general subjective wellbeing measure. **The lowest-friction option** for in-app periodic check-in.

## Multidimensional Measure

3. Butler, J., & Kern, M. L. (2016). The PERMA-Profiler: A brief multidimensional measure of flourishing. *International Journal of Wellbeing*, 6(3), 1–48. DOI: https://doi.org/10.5502/ijw.v6i3.526
   - **Seligman's PERMA model operationalized**: Positive emotion, Engagement, Relationships, Meaning, Accomplishment. 15 items (3 per dimension) + 8 filler items. Useful when 2nd-Brain wants to differentiate **which** dimension of wellbeing is shifting, not just aggregate change.

## Korean Validation

4. Moon, Y. S., Kim, H. J., & Kim, D. H. (2014). The relationship of the Korean version of the WHO Five Well-Being Index with depressive symptoms and quality of life in the community-dwelling elderly. *Asian Journal of Psychiatry*, 9, 26–30. DOI: https://doi.org/10.1016/j.ajp.2013.12.014
   - **K-WHO-5 validation in Korean community-dwelling elderly (N=244)**. K-WHO-5 score inversely correlates with K-SGDS depression scale and positively with Korean quality-of-life measure. **The DOI-verified Korean-language WHO-5 validation** — supports K-WHO-5 use across adult Korean samples.

## Age Range Coverage

- **Child (0–12)**: not applicable for these adult measures.
- **Adolescent (13–17)**: not applicable for 2nd-Brain (18+) but PERMA youth versions exist.
- **Young Adult (18–29)**: applicable for all four.
- **Adult (30–49)**: applicable for all four.
- **Midlife (50–64)**: applicable for all four.
- **Elderly (65+)**: K-WHO-5 specifically validated here (Moon 2014); SWLS and PERMA used broadly.

## Application to 2nd-Brain

### Recommended KPI Stack

| Frequency | Measure | Friction | What it tells you |
| --- | --- | --- | --- |
| **Weekly** (in-app micro-survey) | **WHO-5** (5 items, ~1 min) | Very low | Day-to-day wellbeing trajectory |
| **Monthly** | **SWLS** (5 items, ~1 min) | Very low | Cognitive life-satisfaction (slower-moving) |
| **Quarterly** | **PERMA-Profiler** (15 core items, ~3 min) | Moderate | Which dimensions are moving (insight, not just aggregate) |
| **Per crisis event** | Internal: did Engine 7 route correctly? | N/A | Safety system audit |

**Cadence rationale**: WHO-5 captures recent wellbeing (past 2 weeks per standard wording); SWLS captures stable satisfaction; PERMA-Profiler differentiates dimensions. Stacking three avoids both single-measure bias and over-burdening users.

### Minimum Clinically Important Difference (MCID)

Honesty in product reporting requires that the app distinguish **noise from signal**:

- **WHO-5**: 10+ point change on the 0–100 scale is considered clinically meaningful (Topp 2015). Below that, treat as noise.
- **SWLS**: 4+ point change on the 5–35 scale roughly corresponds to a meaningful shift (Diener literature).
- **PERMA dimensions**: 1+ point change on the 0–10 dimension scale; dimension-level shifts are smaller signal than aggregate.

**Implication**: 2nd-Brain should not report "your wellbeing went up!" unless the change exceeds MCID. Reporting noise as progress is a documented gamification harm pattern.

### Consent + privacy framing

Validated wellbeing measurement is high-signal **and** high-sensitivity. Any periodic in-app survey should:

1. **Opt-in explicitly**, not by-default
2. **Explain why** ("we ask this to know if 2nd-Brain is actually helping you, not to score you")
3. **Allow withdrawal** at any time
4. **Never share scores externally** without explicit per-disclosure consent
5. **Cross-reference**: see also forthcoming `data-ethics-consent.md` batch + Stade et al. (2024) in `ai-mental-health-safety.md` (privacy is a named risk)

### What 2nd-Brain CANNOT claim from these measures

- **Causation**: even if user WHO-5 rises, 2nd-Brain caused it is a causal claim that requires an RCT.
- **Clinical interpretation**: WHO-5 < 50 is a depression-screening signal, NOT a diagnosis. **Never label a user as "depressed" from WHO-5 score.**
- **Comparison to other users**: no leaderboards, no "you scored higher than X% of users". Validated measures are for the individual, not gamified ranking.
- **Predictive claims**: "Your wellbeing will improve" is unsupported.

### Engine 7 / crisis-detection cross-reference

WHO-5 has a built-in depression-screening cutoff. **If WHO-5 score drops below 28** (Topp 2015 threshold for depression screening), 2nd-Brain should consider:
1. Soft-nudge to professional support (YELLOW zone language, per `crisis-detection.md`)
2. Re-prompt for explicit free-text follow-up (does the user describe specific RED-zone content?)
3. **Do not auto-escalate from a single WHO-5 score** — false positives are common. Trend over 2+ measurements + context.

## Cautions & Limitations

- **Self-report**: all four are self-report; subject to social desirability, recall bias, and momentary mood effects.
- **Validation populations vary**: SWLS validated worldwide; WHO-5 strong across many languages; PERMA-Profiler newer with less cross-cultural data.
- **Korean SWLS DOI gap**: 임영진 (2012) Korean SWLS validation is KCI-indexed but DOI not registered with Crossref in this session's check. Use 조명한 & 차경호 (1998) for the construct's Korean validity in academic citation.
- **WHO-5 is a screening tool, not a clinical instrument**: cutoffs (e.g., <50/100) suggest further evaluation, not diagnose.
- **Cultural variance in wellbeing reporting**: East Asian samples often report lower wellbeing than US samples on identical items, partly due to response-style differences (modesty bias). Cross-cultural comparison should be careful.
- **PERMA's "Engagement" dimension overlaps with flow** — for 2nd-Brain users who are not in classical flow domains, Engagement may underestimate.
- **Measurement reactivity**: asking users about wellbeing can itself change wellbeing (small effect). Acknowledge this in product framing.

## Cross-references

- **For the underlying constructs**: see `values-meaning.md` (Steger MLQ for meaning dimension of PERMA), `self-knowledge.md` (Campbell SCC as another outcome measure)
- **For the evidence that journaling produces wellbeing change**: see `self-knowledge.md` Frattaroli (2006) d≈0.075
- **For coaching-effect comparison**: see `methodology-coaching.sql` Theeboom (2014) g=0.43-0.74
- **For privacy framing of wellbeing scores**: see forthcoming `data-ethics-consent` batch + Stade (2024) in `ai-mental-health-safety.md`
- **For the depression-screening boundary**: see `crisis-detection.md` for routing rules when WHO-5 indicates concern

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/wellbeing-kpi.sql`.
