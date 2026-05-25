# Research Batches — Index

DOI-verified psychology framework batches curated via `docs/research/psychology-handoff.md`. Each batch has a paired SQL file under `supabase/seed/`. All DOIs were verified against Crossref or the original publisher record at curation time (May 2026).

## By framework

| Slug | Batch file | Verified DOIs | Tier |
| --- | --- | --- | --- |
| `big_five` | [big-five.md](big-five.md) | 7 | T1 — core personality |
| `attachment` | [attachment.md](attachment.md) | 6 | T1 — relationships |
| `erikson` | [erikson.md](erikson.md) | 5 | T1 — lifespan development |
| `sdt` | [sdt.md](sdt.md) | 4 | T1 — motivation / wellbeing |
| `emerging_adulthood` | [emerging-adulthood.md](emerging-adulthood.md) | 4 | T2 — life stage (18–29) |
| `soc` / `successful_aging` | [soc-successful-aging.md](soc-successful-aging.md) | 4 | T2 — life stage (midlife+, elderly) |
| `growth_mindset` | [growth-mindset.md](growth-mindset.md) | 3 | T3 — growth |
| `self_compassion` | [self-compassion.md](self-compassion.md) | 3 | T3 — growth |
| `via` | [via-strengths.md](via-strengths.md) | 3 | T3 — strengths |
| `narrative_identity` | [narrative-identity.md](narrative-identity.md) | 4 | Core — life story (direct fit for 2nd-Brain) |
| `assessment_a/b/c_*` | [assessment-landscape.md](assessment-landscape.md) | 9 | Meta — empirical tiering of famous assessments (Big Five / HEXACO / RIASEC / Schwartz Values / HPI / 16PF / EI / Birkman / MBTI critique / Enneagram review) |
| `interpersonal` | [interpersonal.md](interpersonal.md) | 4 | Adult relationships (Wiggins IPC, IIP-32, Gottman, Korean couples) |
| `self_knowledge` | [self-knowledge.md](self-knowledge.md) | 7 | **Core methods** — reflection vs rumination (RRQ), insight (SRIS), expressive writing meta-analysis, mindful attention (MAAS), self-concept clarity (SCCS), K-MAAS |
| `values_meaning` | [values-meaning.md](values-meaning.md) | 5 | **"철학" layer** — self-concordant goals (Sheldon & Elliot), best-possible-self writing (King), Meaning in Life (Steger), Valued Living (Wilson ACT), Korean K-MIL-CQ |
| *(analysis)* | [methodology-birkman-brain-trinity.md](methodology-birkman-brain-trinity.md) | 1 | **Methodology audit** of the Birkman × Brain Trinity practitioner manual — component-by-component evidence map, 8 critical gaps, developed integration recipe; adds Theeboom et al. (2014) coaching meta-analysis (g=0.43–0.74) |

**Total**: 15 batches (1 methodology analysis), 69 verified rows for `knowledge_sources`.

## Coverage by life stage

| Stage | Primary frameworks |
| --- | --- |
| Child (0–12) | Attachment (infant), Erikson (stages 1–4) |
| Adolescent (13–17) | Erikson (identity), SDT (Korean BPNS), Big Five, Attachment |
| Young Adult (18–29) | Emerging Adulthood, Erikson (identity → intimacy), SDT, Big Five, Attachment, K-IDEA |
| Adult (30–49) | Big Five, SDT, Erikson (generativity onset), SOC, Narrative Identity |
| Midlife (50–64) | Big Five, SOC, Erikson (generativity), Narrative Identity |
| Elderly (65+) | Successful Aging, SOC, Erikson (integrity), Narrative Identity (TALE-K), Big Five (BFI-K) |

## Korean-context sources included

- **Big Five**: Choi et al. (2025) — Korean BFI-2 validation
- **Attachment**: Lee, Kim, & Shin (2023) — culturally responsive Korean ECR-R-SF
- **Erikson**: Park et al. (2023) — Korean process-oriented identity model
- **SDT**: 이명희 & 김아영 (2008) — Korean adolescent BPNS
- **Emerging Adulthood**: 김대희 & 김명식 (2024) — K-IDEA
- **SOC / Successful Aging**: Kim, Park, & Park (2017) — Korean meta-analysis
- **Self-Compassion**: Chae et al. (2024) — Korean SCS re-translation
- **VIA**: McGrath (2015) — 75-nation including Korea (no Korean-only DOI-registered validation found)
- **Narrative Identity**: Park et al. (2024) — Korean TALE validation
- **Growth Mindset**: [NO VERIFIED SOURCE FOUND] in this session
- **Interpersonal / Couples**: Yoo (2022) — Korean adult marital communication & gender-role moderation
- **Assessment Landscape**: McGrath (2015) — 75-nation VIA (includes Korea); other tools rely on global multi-cultural samples
- **Self-Knowledge Methods**: Kwon & Kim (2007) — K-MAAS Korean mindfulness attention
- **Values & Meaning**: Choi & Shin (2022) — K-MIL-CQ Korean children meaning in life

## What is NOT in this set (future batches)

- **CBT / cognitive frameworks** (Beck, Ellis) — applicable but not curated
- **Resilience** (Masten, Luthar) — applicable to all stages
- **Korean cultural constructs** (정 / 우리 / 체면, Confucian relational frameworks) — explicit Tier 5 in handoff prompt
- **Mindfulness measurement** (Brown & Ryan MAAS, FFMQ) — adjacent to self-compassion
- **Values clarification / ACT** (Hayes) — applicable to growth-orientation
- **Theory of mind, executive function** (Wellman, Diamond) — child-specific
- **Levinson's seasons** — adult development, in approved list
- **Vaillant defenses** — adult development
- **Schutz FIRO-B, MMPI** — additional assessments mentioned in landscape but no peer-reviewed validation rows added yet
- **Family systems** (Bowen) — relational systems framework
- **Bowen, Sullivan books** — interpersonal/family foundational works without single-paper DOI

Each is a separate batch request via `docs/research/psychology-handoff.md`.

## How to extend

1. Send `docs/research/psychology-handoff.md` (verbatim) as the first message to a Deep Research tool (Gemini / Claude / ChatGPT) and request a single framework batch.
2. Save the result as `docs/research/batches/{framework-slug}.md`, matching the structure of `_template.md`.
3. Verify every DOI (5 min via doi.org) before approving.
4. Extract the `INSERT` statements to `supabase/seed/{framework-slug}.sql`.
5. Update this INDEX.md with the new row.
6. Commit batch markdown + SQL together.

Workflow details: see `docs/research/README.md`.
