# Framework: CBT & REBT (Cognitive-Behavioral / Rational-Emotive)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Trust score target**: Closes the explicit gap from Blueprint §9 (CBT — Beck, Ellis listed but missing from seed). Adds the most well-validated psychotherapy framework family in the world — foundational for the Advisor Engine (Engine 4) when handling cognitive reframing in GREEN zone topics.

## AI Retrieval Guide (for RAG / Wiki use)

**When user input suggests** → **look here**:
- Distorted thinking patterns ("everyone hates me", "I'll never succeed") → §Beck cognitive distortions + §Hofmann 2012
- Self-defeating beliefs ("I must be perfect", "I can't stand it") → §Ellis REBT + §David 2018
- Depression-flavored language → §Cuijpers 2023 (depression-specific evidence) + §Korean Kim & Jin 2019
- "Does talk therapy actually work?" → §Hofmann 2012 + §Cuijpers 2023 (efficacy evidence)
- Korean user with cognitive-pattern content → §Kim & Jin 2019 + cultural adaptation notes
- "How should Advisor reframe a thought?" → §CBT thought-record template (below)

## Foundational Sources (Western)

1. Hofmann, S. G., Asnaani, A., Vonk, I. J. J., Sawyer, A. T., & Fang, A. (2012). The efficacy of cognitive behavioral therapy: A review of meta-analyses. *Cognitive Therapy and Research*, 36(5), 427–440. DOI: https://doi.org/10.1007/s10608-012-9476-1
   - **The standard reference** for "does CBT work". Reviewed 106 meta-analyses across 269 studies. Strong evidence for anxiety disorders, somatoform disorders, bulimia, anger control, general stress. Most extensively tested psychotherapy approach in history.

2. David, D., Cotet, C., Matu, S., Mogoase, C., & Stefan, S. (2018). 50 years of rational-emotive and cognitive-behavioral therapy: A systematic review and meta-analysis. *Journal of Clinical Psychology*, 74(3), 304–318. DOI: https://doi.org/10.1002/jclp.22514
   - **50-year REBT synthesis**. Effect size d = 0.58 vs comparison; d = 0.70 on irrational beliefs. Establishes REBT as evidence-based alongside CBT. Crucial: the **disputation of irrational beliefs** mechanism is the cognitive core 2nd-Brain's Advisor can model in GREEN zone.

**Note**: Aaron T. Beck's foundational works (*Cognitive Therapy and the Emotional Disorders*, 1976, International Universities Press; *Cognitive Therapy of Depression*, 1979, Guilford) and Albert Ellis's *Reason and Emotion in Psychotherapy* (1962, Lyle Stuart) are books without single-paper DOIs. The meta-analyses above are the citable evidence layer.

## Recent Validation (Western, last 5 years)

3. Cuijpers, P., Miguel, C., Harrer, M., Plessen, C. Y., Ciharova, M., Ebert, D., & Karyotaki, E. (2023). Cognitive behavior therapy vs. control conditions, other psychotherapies, pharmacotherapies and combined treatment for depression: A comprehensive meta-analysis including 409 trials with 52,702 patients. *World Psychiatry*, 22(1), 105–115. DOI: https://doi.org/10.1002/wps.21069
   - **Largest single CBT-for-depression meta-analysis ever** (409 trials, 52,702 patients). CBT moderately effective vs control conditions; comparable to other psychotherapies; comparable to pharmacotherapy short-term; **combined CBT + pharmacotherapy outperforms either alone**. The contemporary evidence anchor.

## Korean-Context Adaptation

4. Kim, N., & Jin, J. (2019). The meta-analysis on the effectiveness of Cognitive Behavioral Therapy Programs. *The Journal of Humanities and Social Science 21*, 10(4), 1663–1676. DOI: https://doi.org/10.22143/HSS21.10.4.119
   - **Korean CBT meta-analysis** synthesizing 62 Korean studies (2005–2019). Confirms CBT efficacy in Korean samples across mental-health-adjacent outcomes (depression, anxiety, stress). Korean validation that the Western meta-analyses generalize.

## Age Range Coverage

- **Child (0–12)**: applicable — CBT-for-kids well validated (Trauma-Focused CBT, etc.). Not 2nd-Brain's user base.
- **Adolescent (13–17)**: applicable. Not 2nd-Brain's user base.
- **Young Adult (18–29)**: applicable — most-studied window. Korean university samples in Kim & Jin (2019) include this range.
- **Adult (30–49)**: applicable — peak evidence base (Cuijpers 2023).
- **Midlife (50–64)**: applicable.
- **Elderly (65+)**: applicable — CBT validated in older adults (multiple meta-analyses).

## Application to 2nd-Brain

### Where CBT belongs in the Engine pipeline

- **Engine 4 (Advisor) — GREEN zone**: cognitive reframing is appropriate when users describe distorted-thinking patterns about manageable life topics (work setbacks, social misreads, time-management failures).
- **Engine 4 (Advisor) — YELLOW zone**: cognitive reframing is **not appropriate** as primary tone. YELLOW topics (heartbreak, family conflict, burnout, identity confusion) require listening first; CBT-style "let's examine that thought" can feel dismissive in emotionally raw moments. Save reframing for later, after acknowledgment.
- **Engine 4 (Advisor) — RED zone**: CBT does not apply. Refer to `crisis-detection.md` batch — Engine 7 takes over.

### CBT thought-record template (Advisor prompt scaffold)

The classic 7-column thought record (Beck tradition), adapted for journaling:

```
1. Situation       — what happened (factual, observable)
2. Mood            — what feelings came up (1-100 intensity)
3. Automatic thought — what went through your mind
4. Evidence for the thought — what supports it
5. Evidence against the thought — what doesn't fit
6. Balanced thought — what's a fair, considered alternative
7. Mood re-rated   — feelings now (1-100)
```

Advisor can scaffold this in a multi-turn flow rather than demanding all 7 at once. Don't insist on completion — the structure is the support, not a checklist to enforce.

### REBT ABC adaptation (Ellis tradition)

For users who present rigid "must / should / can't stand it" patterns:

```
A — Activating event
B — Belief about it (often irrational: "I must be X", "It's awful that")
C — Consequence (emotional + behavioral)
D — Disputation: is this belief logical? empirical? helpful?
E — Effective new belief: a more flexible alternative
```

Disputation is the active mechanism (David et al. 2018). Advisor should model **disputation as questions, not corrections**: "what would you say to a friend with that exact thought?" rather than "that thought is irrational because…"

### Korean cultural adaptation

- **Indirect framing preferred**: direct disputation of beliefs can feel face-threatening in Korean conversational norms. Use questioning ("그렇게 생각하시면 본인에게 어떤 느낌이 드세요?") rather than confrontation.
- **Collectivist context aware**: a Korean user's "I must not disappoint my family" may not be a pure irrational must — it may be a culturally embedded value. Don't dispute the relational obligation; explore whether the user has agency within it. (See `values-meaning.md` self-concordance.)
- **Avoid clinical vocabulary**: per Blueprint §3, avoid "인지치료/치유" — use "생각 정리" or "관점 다시 보기" in user-facing strings.

### Cross-references

- **For when CBT is contraindicated (rumination)**: see `self-knowledge.md` Trapnell & Campbell (1999) — pure CBT-style thought analysis can feed rumination loops. Pair with mindful attention.
- **For values-anchored reframing**: see `values-meaning.md` — anchor reframes on what the user has identified as intrinsically important (Sheldon & Elliot 1999).
- **For the boundary with crisis routing**: see `crisis-detection.md` — CBT does not extend into RED zone.

## Cautions & Limitations

- **CBT is not a panacea**: Cuijpers (2023) shows CBT is moderately effective and not superior to other validated psychotherapies. Don't oversell.
- **Effect sizes are modest in routine practice**: research efficacy ≠ real-world effectiveness. App-delivered CBT (without therapist) shows smaller effects.
- **Cognitive reframing can pathologize emotion**: telling users that their feelings are "based on a distortion" can invalidate accurate negative appraisals (e.g., real injustice, real grief). Reframe with humility.
- **REBT's "irrational belief" framing requires care**: many beliefs labeled "irrational" in classical REBT are values-laden. Korean and other collectivist users may hold beliefs (relational obligation, hierarchy respect) that Western REBT classifies as irrational but which are functionally adaptive in context.
- **App-delivered CBT has thin evidence base**: most CBT validation comes from therapist-delivered formats. Self-guided CBT apps show smaller effects (Theeboom 2014 coaching meta in `methodology-coaching.sql` for the coaching-effect parallel).
- **Not for trauma processing**: Trauma-focused CBT exists but requires clinician supervision. Trauma content should route per `crisis-detection.md`.
- **Korean user privacy considerations**: cognitive content disclosure (negative self-thoughts) is highly sensitive. Logging and retention policy must be conservative.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/cbt-rebt.sql`.
