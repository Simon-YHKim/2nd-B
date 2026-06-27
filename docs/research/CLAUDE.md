# 2nd-Brain · Psychology Research Knowledge Base
## CLAUDE.md — AI Retrieval Schema (Karpathy LLM Wiki Pattern)

> This file tells any AI agent (Gemini, Claude, GPT, etc.) how to navigate the curated psychology research at `docs/research/batches/` + `supabase/seed/`. Following Andrej Karpathy's LLM Wiki pattern (April 2026), this is the **schema layer** — the operating instructions for treating these documents as a queryable, compounding knowledge base rather than a static archive.
>
> **Audience**: AI agents reading this to answer user queries with grounded, evidence-based responses. Humans may also read this as a knowledge-base operating manual.

---

## 0. Hard Safety Rules (NEVER violate)

These supersede all other guidance.

1. **Crisis content always routes to `crisis-detection.md` FIRST.** If user input contains self-harm, suicidal ideation, abuse disclosure, or severe-loss + crisis language: do not consult other batches. Halt advice. Use fixed crisis-response strings from `crisis-detection.md` §Decision Tree.
2. **Never claim diagnosis or therapy.** 2nd-Brain is wellness + self-knowledge, not clinical care. See `ai-mental-health-safety.md` §"What 2nd-Brain CANNOT claim".
3. **Never infer protected categories** (sexual orientation, religion, ethnicity, political views) from journal text — even if statistically possible. See `computational-personality.md` §Kosinski 2013.
4. **Never use Tier C assessment labels** (MBTI, Enneagram, DISC, CliftonStrengths types) as inference grounds. Accept user self-identification with those, but do not derive claims. See `assessment-landscape.md` §Tier C.
5. **Never coerce redemptive narratives** on raw difficulty. See `narrative-identity.md` §Cautions.
6. **Never continue inviting entry on a theme** the user has revisited 3+ times in 14 days without new framing — switch to rumination-interrupt prompt. See `self-knowledge.md` Trapnell & Campbell (1999).
7. **Always disclose AI mediation** in any persona-card or advisor output. See `data-ethics-consent.md`.

---

## 1. Knowledge Base Architecture

```
docs/research/
├── CLAUDE.md                            ← THIS FILE (schema, retrieval rules)
├── psychology-handoff.md                ← Master prompt for new batches
├── README.md                            ← Human-facing operations manual
├── batches/                             ← Source-of-truth research documents
│   ├── INDEX.md                         ← Human-readable batch index
│   ├── _template.md                     ← Empty batch template
│   └── {framework-slug}.md              ← Per-framework research batches
└── (raw/ — reserved for future ingestion of papers and primary docs)

supabase/seed/
├── README.md                            ← Seed-file operations manual
└── {framework-slug}.sql                 ← Per-batch INSERT statements
                                          for knowledge_sources table
```

**Each batch markdown file is self-contained** with:
- AI Retrieval Guide (query → section mapping)
- Foundational Sources (with DOI)
- Recent Validation (with DOI)
- Korean-Context Adaptations (where available, with DOI)
- Age Range Coverage
- Application to 2nd-Brain (interview prompts in Korean + English)
- Cautions & Limitations
- Cross-references to other batches

---

## 2. Query → Batch Routing Table

Use this to identify which batches to consult first for a given user query or system question. Multiple batches often apply — consult in order.

### A. User Self-Understanding Queries

| User says / asks about | Primary batches | Secondary |
| --- | --- | --- |
| Personality, "what kind of person am I" | `big-five.md`, `assessment-landscape.md` | `narrative-identity.md` |
| Strengths, "what am I good at" | `via-strengths.md` | `big-five.md` |
| Values, "what matters to me" | `values-meaning.md`, `assessment-landscape.md` (Schwartz) | `narrative-identity.md` |
| Life purpose / meaning | `values-meaning.md` (Steger MLQ), `narrative-identity.md` (McAdams) | `erikson.md` |
| Relationships / partners / family | `attachment.md`, `interpersonal.md` | `erikson.md` (intimacy stage) |
| Loneliness / feeling disconnected even around people | `loneliness-connection.md` | `self-compassion.md`, `self-knowledge.md` |
| Attraction / crush / how relationships start | `attraction-initiation.md` | `attachment.md`, `relationship-maintenance.md` |
| "Too sensitive" / easily overwhelmed / overstimulated | `highly-sensitive.md` | `self-compassion.md`, `big-five.md` |
| Communication / conflict / "we keep arguing" | `communication-skills.md` | `interpersonal.md`, `attachment.md` |
| "Am I being manipulated / gaslit?" / "이용당하는 것 같아" | `manipulation-literacy.md` (+ **`crisis-detection.md` if abuse/crisis markers**) | `interpersonal.md`, `self-compassion.md` |
| "My parents made me this way" / 원가족 / childhood patterns | `family-of-origin.md` | `attachment.md`, `narrative-identity.md`, `cross-cultural-east-asian.md` |
| Career / work | `assessment-landscape.md` (RIASEC), `sdt.md` (autonomy) | `erikson.md` (generativity) |
| "Why do I keep doing X" pattern | `self-knowledge.md`, `cbt-rebt.md` | `big-five.md` |
| "I want to change but can't" | `cbt-rebt.md`, `growth-mindset.md`, `values-meaning.md` (self-concordance) | `sdt.md` |
| Self-compassion, "I'm too hard on myself" | `self-compassion.md` | `cbt-rebt.md` |
| Aging concerns / midlife | `soc-successful-aging.md`, `erikson.md` (integrity) | `narrative-identity.md` |
| "I'm not who I used to be" identity | `narrative-identity.md`, `erikson.md` | `big-five.md` (longitudinal change) |
| Emerging adulthood (18-29) feelings | `emerging-adulthood.md` | `erikson.md` (identity) |

### B. System Operations / Design Questions

| Question | Primary batch |
| --- | --- |
| Should this user input route to crisis system? | `crisis-detection.md` |
| How accurate is our Engine 2 trait extraction? | `computational-personality.md` |
| Does our journaling approach have evidence? | `self-knowledge.md` (Frattaroli 2006), `ai-mental-health-safety.md` |
| What outcome metrics should we measure? | `wellbeing-kpi.md` |
| Are we violating consent / ethics? | `data-ethics-consent.md` |
| Is this assessment we're using reliable? | `assessment-landscape.md` |
| How should the methodology of our app be evaluated? | `methodology-birkman-brain-trinity.md` |
| Does CBT-style advice belong here? | `cbt-rebt.md` |

### C. Cultural / Locale-Specific Queries

| Locale and topic | Look for Korean-context sources in: |
| --- | --- |
| Korean user, attachment | `attachment.md` Lee et al. (2023) K-ECRR-SF |
| Korean user, Big Five | `big-five.md` Choi et al. (2025) K-BFI-2 |
| Korean user, autonomy/needs | `sdt.md` 이명희·김아영 (2008) K-BPNS |
| Korean user, emerging adulthood | `emerging-adulthood.md` 김대희·김명식 (2024) K-IDEA |
| Korean user, identity | `erikson.md` Park et al. (2023) Korean young-adult identity |
| Korean user, life-review (elderly) | `narrative-identity.md` Park et al. (2024) Korean TALE |
| Korean user, mindfulness | `self-knowledge.md` Kwon & Kim (2007) K-MAAS |
| Korean user, self-compassion | `self-compassion.md` Chae et al. (2024) Korean SCS |
| Korean user, values/meaning (child) | `values-meaning.md` Choi & Shin (2022) K-MIL-CQ |
| Korean user, couples | `interpersonal.md` Yoo (2022) Korean adult couples |
| Korean user, successful aging | `soc-successful-aging.md` Kim, Park & Park (2017) Korean meta |
| Korean user, CBT | `cbt-rebt.md` Kim & Jin (2019) Korean CBT meta |
| Korean user, crisis routing | `crisis-detection.md` Na et al. (2020) Suicide CARE 2.0 + You et al. (2025) policy |
| Korean user, wellbeing measurement | `wellbeing-kpi.md` Moon et al. (2014) K-WHO-5 |
| Korean user, AI mental health pilot | `ai-mental-health-safety.md` Kang & Hong (2025) Korean ChatGPT chatbot |

---

## 3. Evidence Tier Rules

When citing or applying any source, observe these tier rules:

### Tier A — Strong (use freely)
- Foundational peer-reviewed in top journals (JPSP, American Psychologist, Psychological Bulletin, Annual Review, NEJM, Lancet)
- Meta-analyses with N > 1000 studies or > 10,000 participants
- Direct DOI verifiable, multi-author, replicated

→ Examples: Big Five (Bleidorn 2022 meta), CBT (Cuijpers 2023), Crisis (Posner 2011 C-SSRS)

### Tier B — Moderate (use with caveats)
- Single peer-reviewed study, modest sample
- Newer findings without extensive replication
- Proprietary instrument with publisher-controlled validation

→ Examples: Birkman (Maxwell 2016), Heinz Therabot RCT (2025), Kang & Hong Korean ChatGPT pilot (2025)

### Tier C — Weak / Contested (cite only with critique)
- Popular instruments lacking peer-reviewed validation
- Frameworks where systematic reviews find weak support

→ Examples: MBTI (cited only via Pittenger 2005 critique), Enneagram (cited only via Hook 2021 review), DISC, CliftonStrengths

### Tier D — Practitioner / Non-academic (do not cite as scientific evidence)
- Personal YouTube methodologies (e.g., "Brain Trinity")
- Trade books without peer-review backing (e.g., Tiago Forte's PARA)
- Engineering patterns (e.g., Karpathy LLM Wiki)

→ Reference for product design ideas; never as scientific claims about user wellbeing

---

## 4. Cross-Reference Density

Strong batches in this knowledge base cross-link extensively. A complete answer to most user-self-understanding questions invokes 3–5 batches:

**Example**: User says "I keep journaling but feel stuck and like nothing changes about me":

1. **`self-knowledge.md`** → Grant et al. (2002) SRIS — distinguish reflection (process) from insight (outcome). Stuck reflection without insight is the diagnosis pattern.
2. **`self-knowledge.md`** → Trapnell & Campbell (1999) RRQ — check whether journaling has tipped into rumination.
3. **`values-meaning.md`** → Sheldon & Elliot (1999) — are the goals self-concordant? Stuck often means introjected goals.
4. **`big-five.md`** → Bleidorn et al. (2022) — frame realistic change expectations (0.1-0.2 SD per decade).
5. **`narrative-identity.md`** → McAdams (2001) — agency-coherence-meaning narrative reframing.

The Advisor's response should integrate, not dump. Pick the most actionable thread for the user's specific situation.

---

## 5. Update / Lint Operations

Per Karpathy's LLM Wiki "lint" operation:

### Monthly automated review (Curator Engine + Simon)
- Scan all DOIs for resolution failures (any returning 404 → flag)
- Cross-check that the most recent meta-analysis on each topic is cited
- Identify cross-reference gaps (a new batch mentioning X without back-link from X's batch)
- Surface any added batch's content that contradicts existing batches without explicit note

### Quarterly content review
- Re-verify Korean-context sources still cited correctly (Korean academic landscape moves fast)
- Add new framework batches per `psychology-handoff.md` workflow if gap exists
- Update INDEX.md totals
- Re-score trust by category (per audit framework)

### When adding a new batch
1. Use `_template.md` structure
2. Add AI Retrieval Guide section at top
3. Add cross-references to existing batches in §Application
4. Update this CLAUDE.md §Query Routing Table
5. Update INDEX.md totals
6. Commit batch markdown + SQL together; never one without the other

---

## 6. Failure Modes to Watch For

When AI agents use this knowledge base, these patterns indicate misuse:

- **Citing without DOI**: every claim attributed to research should be traceable to a `knowledge_sources` row with verified DOI. No DOI → not a research claim, label as "practitioner insight" or "design heuristic".
- **Skipping crisis check**: any user content containing crisis markers should route to `crisis-detection.md` BEFORE any other batch consultation.
- **Overconfident persona claims**: Engine 2 outputs should always carry confidence bands (per `computational-personality.md`) and explicit invitation to disagree.
- **Forcing Western framing on Korean users**: always check the Korean-context column in §Query Routing Table C — Korean sources exist for most batches and should anchor Korean-locale responses.
- **Treating Tier C / D as Tier A**: MBTI, Enneagram, Brain Trinity, PARA are referenced for completeness — never as scientific bases.
- **Single-batch tunneling**: if the user's situation matches multiple batches' cross-references, consult all of them (per §4).

---

## 7. Quick Index — All Batches

(See `batches/INDEX.md` for richer detail.)

| Slug(s) | Batch | Rows | Tier focus |
| --- | --- | --- | --- |
| `big_five` | big-five | 7 | A |
| `attachment` | attachment | 6 | A |
| `erikson` | erikson | 5 | A |
| `sdt` | sdt | 4 | A |
| `emerging_adulthood` | emerging-adulthood | 4 | A+B (Côté critique) |
| `soc` / `successful_aging` | soc-successful-aging | 4 | A |
| `growth_mindset` | growth-mindset | 3 | A (with Macnamara critique) |
| `self_compassion` | self-compassion | 3 | A |
| `via` | via-strengths | 3 | A |
| `narrative_identity` | narrative-identity | 4 | A |
| `assessment_a/b/c_*` | assessment-landscape | 9 | A+B+C (explicit tiering) |
| `interpersonal` | interpersonal | 4 | A |
| `self_knowledge` | self-knowledge | 7 | A |
| `values_meaning` | values-meaning | 5 | A |
| (n/a — methodology audit) | methodology-birkman-brain-trinity + methodology-coaching | 1 | A (Theeboom 2014) |
| `crisis_detection` | crisis-detection | 7 | A |
| `cbt` / `rebt` | cbt-rebt | 4 | A |
| `computational_personality` | computational-personality | 5 | A |
| `ai_mental_health` | ai-mental-health-safety | 5 | A+B |
| `wellbeing_kpi` | wellbeing-kpi | 4 | A |
| `data_ethics` | data-ethics-consent | 1 | A (+ policy refs) |

**Total**: **346 inserted rows across 45 seed files / 51 framework slugs** — the
authoritative per-file count lives in `supabase/seed/README.md` (verified by
`grep -c "now()," supabase/seed/*.sql`). This Quick Index table above lists only
the original core batches; the corpus has since grown to include the cognitive /
style layer (`chc_cognitive`, `emotional_intelligence`, `dual_process`,
`multiple_intelligences`, `metacognition`, `whole_trait`, `self_concept_clarity`,
`personality_change`, `self_report_bias`), the cultural anchor
(`cross_cultural_east_asian`, `cross_cultural_global_south`), the global crisis
extension (`crisis_detection_global`), the engagement layer (`habit_formation`),
the five life-domain seeds, and the YouTube-gap batches `loneliness` + `attraction`
(P1), `sensitivity` + `communication` (P2), `manipulation` + `family_of_origin`
(P3, safety-sensitive — crisis gate absolute). "Rows" ≥ "verified DOI rows" in
`batches/INDEX.md` because some rows cite an ISBN or KCI id rather than a DOI.

---

## 8. Inter-AI Coordination Note

If this knowledge base is consulted by multiple AI agents simultaneously (Gemini in production, Claude during development, etc.):

- This CLAUDE.md is the **single source of truth** for retrieval rules.
- The Karpathy LLM Wiki pattern's "ingest / query / lint" maps to:
  - **Ingest**: adding new batches via `psychology-handoff.md` workflow
  - **Query**: agent runtime — use §Query Routing Table to identify relevant batches before responding
  - **Lint**: monthly automated review (§5 above)
- Different agents may have different system prompts but should respect Hard Safety Rules (§0) identically.

---

*Schema version: 1.0 · Last updated: 2026-05-25 KST*
*Knowledge base owner: Simon · curator pipeline per Blueprint §9 C8*
