# Analysis lexicon · product policy v0.1

> **Corrected 2026-09-06.** This document explains product-copy decisions.
> It is not a statutory list of forbidden words, a licence assessment, or
> proof that a feature is legally cleared. The former draft overstated the
> connection between individual words and laws.
>
> Executable definitions: `src/lib/safety/lexicon.ts`.
> Legal context: [lexicon-jurisdiction-matrix.md](lexicon-jurisdiction-matrix.md).
> Review: [lexicon-policy-review-260906.md](lexicon-policy-review-260906.md).

## 1. Keep the restriction on the claim

We do not claim to provide a licensed clinical service, invent a user's diagnosis,
promise unsupported outcomes, or turn limited records into definitive judgments
about a person. The matcher is one check for those decisions, not a replacement
for assessing the feature, evidence, data processing, or surrounding copy.

The groups below describe the policy. Exact terms and inflections are in code;
these tables are not a second independently maintained word list.

| Copy category | Why we restrict it | Better direction |
|---|---|---|
| Diagnosis, therapy, treatment, cure, clinical-service or licensed-title claims | Misrepresents what this product provides or the standing of its speaker | Describe the actual recording, reflection, or organisation function |
| IQ or intelligence claims | Records do not establish a validated IQ measure or cognitive improvement | Describe a specific observation supported by the records |
| Scientifically proven, clinically validated, medically approved | Requires evidence for the precise product and claim, not merely a relevant paper | State which source informed the explanation and its limit |
| Fixed personality verdicts | Overstates what the data can establish about an individual | Identify the event or repeated behaviour, and leave room for correction |
| Unsubstantiated percentiles or quantified outcomes | Needs an actual comparison population and appropriate outcome evidence | Compare the user's own recorded values when that comparison is supported |

These are conservative product decisions. They do not imply that using a word
in an official resource name, research reference, disclaimer, or technical
explanation is automatically unlawful. The FTC examines overall claim meaning
and substantiation; a different word does not make an unsupported claim sound.
[FTC guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance).

## 2. Korean context matters

| Expression | Keep flagging | Allow the precise different meaning in CI |
|---|---|---|
| `정상이`, `장애가 있`, `결함이 있` | Unsupported judgments about the user | A server state, network outage, or code defect |
| `정신과` | A clinical-service or specialty claim | The grammatical phrase `도전 정신과 끈기` |
| `처방` | Offering a clinical prescription | The unrelated compound `대처방안` |
| `똑똑한`, `머리 좋은`, `우월한`, `열등한` | Value judgments unsupported by the user's records | Explicit instructions forbidding those judgments |
| `심리치료`, `심리상담`, related clinical labels | Presenting the app as those services | A clear prohibition or truthful disclosure in its own clause |

Do not require a cold or unnatural speaking style. Friendly questions and
concrete explanations are compatible with these limits. Do not replace a hard
verdict with a flattering synonym and assume the problem is solved.

For Korean clinical services, the relevant legal assessment concerns the actual
conduct and service, not the mere appearance of one word. Product restrictions
remain in place; this clarification does not authorise a clinical feature.
[의료법 제27조](https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1020977077).

## 3. Context handling in CI

`findCopyLexiconHits` in `scripts/lib/lexicon-copy.ts` applies the source-of-truth
terms to copy with two narrow adjustments:

1. `LEXICON_NON_CLINICAL_CONTEXTS` masks only the exact technical/ordinary-language
   span. Another occurrence in the same sentence or file is still checked.
2. An explicit prohibition or disclosure applies to its own clause. A stray
   `not`, `없`, or unrelated reassurance no longer skips an entire source line.
   `not only scientifically proven` remains a positive claim and is flagged.

Examples: `visual treatment` passes, but `visual treatment; our treatment cures
you` does not. `서버 상태는 정상이에요` passes, but adding `당신은 비정상이에요`
still fails. A defined prohibition may mention the term it prohibits.

These exceptions are **CI-only**. `classifyInput`, crisis terms, hotline selection,
and the raw runtime output matchers are unchanged. A clinical word in user input
remains YELLOW by itself. The user is not told that their experience is forbidden,
and that word alone is not promoted to crisis routing by this change.

Existing legal, research, hotline-name and policy-definition path exceptions
remain. Do not add a whole product file or directory just to silence one ordinary
technical phrase. Add a narrow justified context and positive/negative regression
examples instead.

## 4. Definition versus enforcement

`ANALYSIS_JURISDICTION_FORBIDDEN` and `ANALYSIS_BANNED_CLAIM_PATTERNS` remain
reference definitions. Their regexes are unit-tested, but there is no general
runtime/CI consumer enforcing all of them and no automatic country activation.
The former draft's claim that the classifier and CI enforced every listed market
and claim shape was incorrect.

Universal analysis terms are used by CI and selected output filters, not every
LLM response path. EN/KO are the matcher languages. Scanning ES/PT/ID files with
EN/KO rules does not amount to native-language coverage for those three locales.

The product review must still catch synonymous overclaims, unsupported scores,
and misleading context. Adding new runtime rejection or market gating would
require separate implementation and regression review.

## 5. Review record

- `LEXICON_VERSION`: `0.1`; existing terms remain unchanged in this revision.
- `LEXICON_LAST_LEGAL_REVIEW`: existing owner-recorded `2026-06-10` sign-off.
- This engineering review does not establish external-counsel approval or update
  that sign-off date.
- A legal/source review is needed when changing claims, processing sensitive
  data, providing new services, or entering another market. A passing word scan
  alone does not complete it.

Historical basis: Analysis System Design v0.22. The earlier proposed word-to-law
mapping and implementation plan have been replaced above by the current policy
and actual enforcement scope.
