# YouTube Topic → Evidence-Gap Map

**Status:** proposal for review (develop phase pending approval)
**Method:** title-census + frequency backbone over 4,074 videos from two
psychology channels, cross-checked against the 40 existing research batches
(`docs/research/batches/` 35 + 5 new domain seeds). Transcripts are a
*topic-discovery* input only — never a citation (per `docs/research/README.md`
rejection checklist: YouTube/blogs/Wikipedia are non-academic). Real grounding
for any gap below comes from peer-reviewed sources (DOI) in the develop phase.

## Sources scanned

| Channel | Videos | Language | Character |
|---|---|---|---|
| `@psych2go` | 3,444 | EN | pop-psychology, title = topic statement |
| `놀면서 배우는 심리학` (UCONTlrUj5pVn7LammlleLJg) | 630 | KO | KR pop-psychology |

## Demand backbone (title frequency)

- **Romantic/attraction** (강): love 201 · relationship 113 · crush 86 · attractive 70 · dating 55 · 사랑/연애 15
- **Clinical-shaped** (최대, but see §OUT): depression 135 · anxiety 97 · disorder 50 · mental illness 14 · self harm 11 · 우울 6 · 불안 19
- **Habits/behavior** (강): habits 152 · 습관 16 — *already well covered*
- **Toxic/abuse/manipulation**: toxic 116 · red flags 18 · emotional abuse 12 · gaslighting · narcissist · 가스라이팅 2
- **Trauma/childhood/parents**: trauma 101 · childhood trauma 15 · toxic parents 15 · parents 54
- **Self-worth**: self love 12 · 자존감 23 — *partially covered (self-compassion, self-concept-clarity)*
- **Personality/types/quiz**: personality 100 · types 85 · quiz 68 — *covered (Big Five); MBTI correctly rejected*
- **Highly Sensitive Person**: highly sensitive 18 — *not covered*
- **Social anxiety / loneliness / introversion**: social anxiety 19 · 외로움 7 · 내향 5 — *loneliness not covered as its own base*
- **Communication/empathy**: 대화 22 · communication · 공감 — *partial (interpersonal, EI)*
- **Intelligence**: highly intelligent 12 · brain 64 — *covered (CHC, multiple-intelligences)*

## Coverage cross-check → GAPS

Prioritized by demand × domain-fit × strength-of-real-research × safety-tractability.
"Domain" = which of the 7 life-domain stars / self-understanding it grounds.

| # | Gap topic | Demand | Domain | Why it's a gap | Candidate academic basis (verify DOI in develop) | Safety/lexicon note |
|---|---|---|---|---|---|---|
| **P1** | **Loneliness & social connection** | social anxiety 19, 외로움 7, isolation | relation / wellbeing | No batch grounds loneliness despite heavy demand; strong evidence base | Hawkley & Cacioppo 2010; Holt-Lunstad 2015 (social connection & mortality) | non-clinical framing as "connection", not isolation-as-illness |
| **P1** | **Attraction & relationship initiation** | love 201, crush 86, dating 55 | relation | `relationship-maintenance` (new) covers *keeping* relationships, nothing covers *how they start* — the single largest demand cluster | Finkel et al. 2012 (online dating, PSPI); Montoya & Horton (similarity-attraction) | frame as understanding own patterns, not "how to be attractive" pop angle |
| **P2** | **Highly Sensitive Person (Sensory Processing Sensitivity)** | highly sensitive 18 | self-understanding | Real validated construct, recurring demand, zero coverage | Aron & Aron 1997 (JPSP); Greven et al. 2019 review | trait, not disorder — keep non-pathologizing |
| **P2** | **Communication & conflict-repair skills** | 대화 22, communication, 공감 | relation / growth | `interpersonal` covers circumplex *structure*; nothing covers applied skills (responsiveness, repair, assertiveness) | Gable et al. (active-constructive responding); Markman/Stanley PREP | — |
| **P3** | **Manipulation literacy / toxic-pattern recognition** | toxic 116, red flags 18, gaslighting | relation / self-protection | Very high demand; real research, but SENSITIVE | Paulhus & Williams 2002 (Dark Triad) | frame as self-protection pattern-recognition; NEVER diagnosing others; coordinate with crisis/safety layer |
| **P3** | **Family-of-origin developmental influence** | childhood trauma 15, toxic parents 15 | self-understanding / relation | Demand high; partially in attachment/Erikson but not applied | Bowlby/attachment (have); add developmental family-systems source | SENSITIVE — developmental lens only, non-clinical, route distress to C9 |

## Explicitly OUT of scope (demand acknowledged, NOT a research-gap)

The **largest** title cluster is clinical: depression (135), anxiety (97),
disorders (50), mental illness, self-harm (11). The app is **deliberately
non-clinical** (CLAUDE.md vocabulary policy; lexicon.ts forbids therapy/diagnosis
/treatment terms). These must be **routed to the C9 safety layer** (crisis-detection,
ai-mental-health-safety — already researched), **never advised on**. This is a
positioning validation, not a gap: huge demand confirms the safety layer matters,
but the app's lane is self-understanding & growth, not mental-health treatment.
Also out: "how to be attractive / dark psychology / how to manipulate" pop angles
(weak evidence, off-mission) and MBTI/Enneagram/quiz formats (rejected framework).

## Quick wins (research already done, not yet loaded)

Two batches were researched but never seeded:
- `batches/cross-cultural-global-south.md` — real gap, loadable now.
- `batches/methodology-birkman-brain-trinity.md` — **skip** ("Brain Trinity" is
  legacy naming per CLAUDE.md; verify before loading).

## Proposed develop plan (pending approval)

For each approved gap above, follow the existing pipeline
(`docs/research/README.md`): external Deep Research → `batches/<slug>.md` →
DOI verification → `supabase/seed/<slug>.sql` (C8: DOI + verified_at). Selective
transcript deep-dive (the "선별 자막" step) runs per gap to confirm the user-facing
framing the channels use, so advice copy matches how people actually talk about it.

Recommended first wave: **P1 loneliness + P1 attraction-initiation** (highest
demand, cleanest evidence, lowest safety risk), then P2.
