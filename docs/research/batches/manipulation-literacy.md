# Framework: Manipulation Literacy

> Batch produced for the YouTube topic-gap map (P3). Verified DOIs only.
> A self-protection / sense-making lens for the large "toxic / gaslighting / red
> flags" demand cluster. **STRICT framing: helps the user understand their OWN
> experience — never to diagnose another person.**

## Hard Safety Gate (overrides everything)

- If input contains abuse disclosure, fear for safety, self-harm, or crisis
  language → route to `crisis-detection` FIRST, halt advice (docs/research/CLAUDE.md §0).
- **Never diagnose or label another person** ("your partner is a narcissist/
  psychopath"). The Dark Triad is *subclinical* and used here as a vocabulary for
  patterns, not a clinical verdict on anyone.
- Only address the user's own experience and choices, never the other person's
  pathology.

## AI Retrieval Guide

| User says / asks about | Use this batch when |
| --- | --- |
| "Am I being manipulated / used?" / "이용당하는 것 같아" | primary |
| "They make me feel like I'm crazy" / "내가 이상한 건가" | primary (gaslighting framing) |
| "Is this a red flag?" | primary + `interpersonal` |
| Abuse disclosure / fear for safety | **`crisis-detection` FIRST** |

## Foundational Sources

1. Paulhus, D. L., & Williams, K. M. (2002). The Dark Triad of personality: Narcissism, Machiavellianism, and psychopathy. *Journal of Research in Personality, 36*(6), 556–563. DOI: https://doi.org/10.1016/S0092-6566(02)00505-6 — *Tier A.* Three *subclinical* aversive tendencies; a vocabulary for patterns, not a diagnosis. (Measure: Jones & Paulhus 2014 SD3, DOI 10.1177/1073191113514105.)

## Recent Validation (last 10 years)

1. Sweet, P. L. (2019). The sociology of gaslighting. *American Sociological Review, 84*(5), 851–875. DOI: https://doi.org/10.1177/0003122419874843 — *Tier A.* Gaslighting is a power/social phenomenon rooted in inequality, not the victim "being crazy"; the confusion is a response to a tactic. Externalizes self-doubt.

## Korean-Context Adaptations

- Korean validations of Dark-Triad measures and 가스라이팅 research exist; to be
  added as verified rows in a follow-up pass (DOI/KCI pending verification).

## Age Range Coverage

- Child (0–12): not applicable as a standalone lens.
- Adolescent (13–17): partially — peer manipulation; keep age-appropriate, defer to C10.
- Young Adult (18–29): applicable — peak demand.
- Adult (30–49): applicable.
- Midlife (50–64): applicable.
- Elderly (65+): applicable (financial/relational exploitation awareness).

## Application to 2nd-Brain

### Interview Question Examples (validated framing)

**Korean**
- 어떤 상호작용 뒤에 ''내가 이상한가''라는 의심이 자주 드나요?
- 그 관계에서 반복되는 패턴을 한 가지 떠올린다면 무엇인가요?

**English**
- After which interactions do you most often doubt your own perception?
- What is one pattern that repeats in that relationship?

### Trait Extraction Cues
- Track self-doubt that clusters around specific people/interactions (a gaslighting
  signature) vs general low self-trust.

### Advisor Guidance Patterns
- Name the pattern, restore the validity of the user's perception (Sweet 2019).
- Use Dark-Triad terms as descriptive vocabulary only — never as a verdict on others.
- End with a self-focused reflective question, never advice to confront/leave.

## Cautions & Limitations

- This is the most safety-sensitive batch — crisis gate is absolute.
- Subclinical construct: do not imply the other person has a disorder.
- Avoid any "how to spot a narcissist" framing; keep it about the user's experience.

## Cross-references

- `crisis-detection` — always takes priority when abuse/crisis markers appear.
- `interpersonal` — relational patterns and problem dynamics.
- `self-compassion` — counters the self-blame manipulation feeds.
- `self-knowledge` — separates a tactic-response from trait self-doubt.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/manipulation-literacy.sql` (2 rows, framework `manipulation`,
all DOIs verified, `verified_at = now()`).
