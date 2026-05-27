# Framework: CHC (Cattell-Horn-Carroll) Theory of Cognitive Abilities

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Trust score target**: Justifies the v0.2 design-doc selection of CHC as the PRIMARY framework for the cognitive/intelligence dimension. CHC is the empirical consensus model in psychometric intelligence research, integrating Cattell's Gf/Gc, Horn's expansion, and Carroll's three-stratum hierarchical synthesis. This batch establishes both the foundations and the hard guardrails: **2nd-Brain must never claim IQ scores or measure cognitive ability** — it can only narrate self-reflection signals from journal text against a CHC vocabulary.

## AI Retrieval Guide (for RAG / Wiki use)

**When user input suggests** → **look here**:
- "How smart am I?" / "What's my IQ?" → §Cautions & Limitations (refuse to score) + §Schneider & McGrew 2018 (use vocabulary, not measurement)
- User describes problem-solving / novel reasoning → §Cattell 1963 (Gf) + §Schneider & McGrew 2018 (Gf broad ability)
- User describes vocabulary, accumulated knowledge, expertise → §Gc (Horn & Cattell 1966; Tucker-Drob 2022 aging)
- Memory complaints (short-term, working memory) → §Gsm + §Bulut 2021 WJ-IV
- Processing speed / "I'm slow" → §Gs + §Winter 2025 WAIS-5 aging
- Aging concerns: cognitive decline / "I'm losing it" → §Tucker-Drob 2022 (Gf/Gc trajectories) + §Cautions
- Multiple intelligences / Gardner framing in user vocabulary → §CHC vs MI critique (Waterhouse 2006; Gardner & Moran 2006)
- Korean user, cognitive-ability self-perception → §Jo & Park & Hwang 2015 (K-WAIS-IV CHC fit) + §Jo & Hwang 2017 (age effects)
- Journal-text inference of cognitive style → §Pennebaker & King 1999 + §Tausczik & Pennebaker 2010 + §Pennebaker & Stone 2003

## Foundational Sources

1. Cattell, R. B. (1963). Theory of fluid and crystallized intelligence: A critical experiment. *Journal of Educational Psychology*, 54(1), 1–22. DOI: https://doi.org/10.1037/h0046743
   - **The Gf / Gc split**. Cattell argues general intelligence is two distinct general factors: *fluid intelligence* (Gf — novel reasoning, independent of culture) and *crystallized intelligence* (Gc — accumulated knowledge, culture-dependent). The first empirical demonstration of the split via critical experiment.

2. Horn, J. L., & Cattell, R. B. (1966). Refinement and test of the theory of fluid and crystallized general intelligences. *Journal of Educational Psychology*, 57(5), 253–270. DOI: https://doi.org/10.1037/h0023816
   - **Refines Gf/Gc and adds broader factor structure**. Horn's expansion identifies additional broad abilities beyond Gf/Gc (visual processing, auditory processing, retrieval, speed). This is the Horn-Cattell "extended Gf-Gc" model — the seed of every later CHC broad ability.

3. Carroll, J. B. (1993). *Human Cognitive Abilities: A Survey of Factor-Analytic Studies*. Cambridge University Press. ISBN: 0-521-38275-0 (hardback). (Monograph — no single-paper DOI.)
   - **The three-stratum hierarchical synthesis**. Carroll reanalyzed 461 factor-analytic datasets from 70 years of intelligence research. Result: a hierarchy with general intelligence (g) at Stratum III, ~8 broad abilities at Stratum II (matching Horn-Cattell), and ~70 narrow abilities at Stratum I. This is the empirical backbone of the modern CHC consensus.

4. McGrew, K. S. (2009). CHC theory and the human cognitive abilities project: Standing on the shoulders of the giants of psychometric intelligence research. *Intelligence*, 37(1), 1–10. DOI: https://doi.org/10.1016/j.intell.2008.08.004
   - **The formal CHC unification**. McGrew explicitly merges Horn-Cattell extended Gf-Gc with Carroll's three-stratum model. Coins "CHC" as the consensus name. Defines the canonical broad-ability taxonomy used by all modern CHC-aligned assessments (WJ, SB5, WAIS-IV/V mappings).

5. Schneider, W. J., & McGrew, K. S. (2018). The Cattell-Horn-Carroll theory of cognitive abilities. In D. P. Flanagan & E. M. McDonough (Eds.), *Contemporary Intellectual Assessment: Theories, Tests, and Issues* (4th ed., pp. 73–163). The Guilford Press. (Book chapter — no single-paper DOI; cite as Schneider & McGrew 2018.)
   - **The most-current canonical CHC reference**. 90-page chapter consolidates 16 broad abilities and ~80 narrow abilities, integrates neurocognitive evidence, and clarifies which broad factors have strongest replication. This is the textbook citation for "what CHC says today."

## Modern CHC Broad-Ability Taxonomy

The nine broad abilities most consistently replicated and operationalized in CHC-aligned assessments. Source-of-truth synthesis is Schneider & McGrew (2018), with primary historical anchors listed:

| Code | Broad Ability | Primary Source |
| --- | --- | --- |
| **Gf** | Fluid Reasoning — novel problem solving, inductive/deductive reasoning | Cattell (1963); Horn & Cattell (1966) |
| **Gc** | Comprehension-Knowledge — accumulated verbal/declarative knowledge, vocabulary | Cattell (1963); Horn & Cattell (1966) |
| **Gv** | Visual Processing — mental imagery, spatial relations, visualization | Horn & Cattell (1966); Carroll (1993) |
| **Ga** | Auditory Processing — phonetic coding, speech-sound discrimination | Horn & Cattell (1966); Carroll (1993) |
| **Gs** | Processing Speed — speed of simple cognitive tasks | Horn & Cattell (1966); Carroll (1993) |
| **Gsm** | Short-Term Memory / Working Memory — temporary information maintenance and manipulation | Horn & Cattell (1966); Carroll (1993); Schneider & McGrew (2018) |
| **Glr** | Long-Term Storage and Retrieval — encoding and fluent retrieval over minutes-to-days | Horn & Cattell (1966); Carroll (1993) |
| **Gq** | Quantitative Knowledge — declarative and procedural mathematical knowledge | Carroll (1993); McGrew (2009) |
| **Grw** | Reading and Writing — basic reading and writing skills | Woodcock (cited in McGrew 2009); Schneider & McGrew (2018) |

Note: Schneider & McGrew (2018) introduce additional candidate broad factors (Gkn domain knowledge, Gp psychomotor, Go olfactory, etc.) with varying levels of evidential support. The nine above are the consensus core. For 2nd-Brain's text-only signal, only **Gf**, **Gc**, **Gsm**, **Glr**, **Gs**, and partially **Grw** could plausibly leave traces in journal language — see §Trait Extraction Cues.

## CHC vs Other Intelligence Models

### vs Gardner Multiple Intelligences (MI)

6. Waterhouse, L. (2006). Multiple intelligences, the Mozart effect, and emotional intelligence: A critical review. *Educational Psychologist*, 41(4), 207–225. DOI: https://doi.org/10.1207/s15326985ep4104_1
   - **The empirical critique of MI**. Waterhouse argues MI lacks construct validation, no neurocognitive evidence supports the separable "intelligences," and educational applications show no incremental validity over standard cognitive ability assessment. Conclusion: MI is a pedagogical framework, not a tested model of cognition.

7. Gardner, H., & Moran, S. (2006). The science of multiple intelligences theory: A response to Lynn Waterhouse. *Educational Psychologist*, 41(4), 227–232. DOI: https://doi.org/10.1207/s15326985ep4104_2
   - **Gardner's reply**. Defends MI on conceptual grounds but does not supply the missing factor-analytic / construct-validation evidence Waterhouse demanded. The debate is itself instructive: MI is popular in education but lacks the psychometric backbone CHC provides.

**Why CHC wins**: CHC's broad abilities are *derived from* factor analysis of cognitive task performance (Carroll 1993 reanalyzed 461 datasets). Gardner's eight "intelligences" were *proposed from* a mix of neuropsychology, anthropology, and developmental evidence but were never recovered as orthogonal factors in cognitive-task batteries. For a self-knowledge product, MI offers richer vocabulary; for a *defensible* claim about a user's cognitive profile, only CHC has the evidence.

### vs g-factor theory (Spearman / Jensen)

8. Spearman, C. (1904). "General intelligence," objectively determined and measured. *The American Journal of Psychology*, 15(2), 201–292. DOI: https://doi.org/10.2307/1412107 (JSTOR-registered stable identifier; pre-modern DOI era — verified resolvable.)
   - **The original g**. Spearman observed positive intercorrelations across diverse cognitive tasks ("positive manifold") and proposed a single general factor (g) plus task-specific factors (s). This is the historical root of psychometric intelligence research.

Jensen, A. R. (1998). *The g Factor: The Science of Mental Ability*. Praeger. ISBN: 0-275-96103-6. (Monograph — no single-paper DOI.)
   - **Modern g defense**. Jensen synthesizes evidence that g is robust, biologically grounded, and predictively valid across batteries. Controversial for its sections on group differences, but the core psychometric argument for g remains influential.

**How CHC integrates g**: Carroll's three-stratum model places g at the apex (Stratum III) above the CHC broad abilities (Stratum II). CHC does *not* reject g — it specifies the structure beneath g. McGrew (2009) is explicit: CHC accommodates both a general factor and meaningful broad-ability variation. The clinical and educational utility of CHC is precisely that *profile-level* information (Gf vs Gc vs Gs differences) is more actionable than a single g score.

**Why CHC is the current academic standard**:
- Modern intelligence batteries (WJ-IV, SB5, WAIS-IV/V, KABC-II) are explicitly built on CHC.
- Cross-cultural replication is broader than g-only models, including in Korean samples (§Korean-Context).
- CHC predicts academic achievement at the *broad-ability* level (Niileksela et al. 2016), giving differential validity beyond a single IQ.
- Modern textbooks (Flanagan & McDonough 2018) treat CHC as the consensus framework.

## Modern CHC-Aligned Assessments

9. Niileksela, C. R., Reynolds, M. R., Keith, T. Z., & McGrew, K. S. (2016). A special validity study of the Woodcock–Johnson IV: Acting on evidence for specific abilities. In D. P. Flanagan & V. C. Alfonso (Eds.), *WJ IV Clinical Use and Interpretation: Scientist-Practitioner Perspectives* (pp. 65–106). Elsevier. DOI: https://doi.org/10.1016/B978-0-12-802076-0.00003-7
   - **WJ-IV → CHC validation**. Demonstrates that WJ-IV broad-ability scores predict reading, math, and writing achievement *over and above* general intelligence. Establishes that CHC broad abilities have incremental validity — the empirical case for profile-level rather than g-only interpretation.

10. Dombrowski, S. C., McGill, R. J., & Canivez, G. L. (2018). Hierarchical exploratory factor analyses of the Woodcock-Johnson IV Full Test Battery: Implications for CHC application in school psychology. *School Psychology Quarterly*, 33(2), 235–250. DOI: https://doi.org/10.1037/spq0000221
   - **WJ-IV factor structure scrutiny**. Hierarchical EFA recovers fewer broad factors than the publisher's CHC scoring suggests. A critical perspective: the WJ-IV's clinically reported subtest groupings may overrepresent the CHC structure in marketing/scoring while the underlying factor solution is sparser. Important caution against over-reading single-test CHC profiles.

11. Bulut, O., Cormier, D. C., Aquilina, A. M., & Bulut, H. C. (2021). Age and sex invariance of the Woodcock-Johnson IV Tests of Cognitive Abilities: Evidence from psychometric network modeling. *Journal of Intelligence*, 9(3), 35. DOI: https://doi.org/10.3390/jintelligence9030035
   - **Measurement invariance for WJ-IV CHC scores**. Demonstrates the CHC structure replicates across age (school-age through older adult) and sex — critical for cross-age inference.

12. Janzen, H. L., Obrzut, J. E., & Marusiak, C. W. (2004). Test review: Roid, G. H. (2003). Stanford-Binet Intelligence Scales, Fifth Edition (SB:V). *Canadian Journal of School Psychology*, 19(1–2), 235–244. DOI: https://doi.org/10.1177/082957350401900113
   - **Stanford-Binet 5 → CHC alignment**. Reviews how SB5 operationalizes five CHC broad abilities (Gf, Gc, Gv, Gsm, Gq) via verbal and nonverbal subtests. Confirms SB5 as a CHC-aligned battery while flagging mixed factor-structure replication evidence.

13. Winter, E. L., Dale, B. A., Maharjan, S., Lando, C. R., Larsen, C. M., Courville, T., & Kaufman, A. S. (2025). Cognitive aging revisited: A cross-sectional analysis of the WAIS-5. *Journal of Intelligence*, 13(7), 85. DOI: https://doi.org/10.3390/jintelligence13070085
   - **WAIS-5 → CHC + aging trajectories**. WAIS-5 (2024 release) restructures the Perceptual Reasoning Index into separate Visual Spatial (Gv) and Fluid Reasoning (Gf) indices — explicitly aligning with CHC broad abilities. The cross-sectional aging analysis confirms classic Gf/Gs decline and Gc preservation patterns.

14. McGill, R. J., & Dombrowski, S. C. (2019). Critically reflecting on the origins, evolution, and impact of the Cattell-Horn-Carroll (CHC) model. *Applied Measurement in Education*, 32(3), 216–231. DOI: https://doi.org/10.1080/08957347.2019.1619561
   - **Critical perspective on CHC's evolution**. Reviews how CHC has been adopted commercially in test publishing and questions whether all "CHC-aligned" claims rest on equally strong factor-analytic evidence. Important balance against uncritical CHC enthusiasm.

## Aging and CHC

15. Tucker-Drob, E. M., de la Fuente, J., Köhncke, Y., Brandmaier, A. M., Nyberg, L., & Lindenberger, U. (2022). A strong dependency between changes in fluid and crystallized abilities in human cognitive aging. *Science Advances*, 8(5), eabj2422. DOI: https://doi.org/10.1126/sciadv.abj2422
   - **Modern longitudinal Gf/Gc aging evidence**. Two large longitudinal studies show fluid and crystallized changes are strongly *correlated within individuals* — losing Gf predicts losing (or failing to gain) Gc. Refines the classic "Gf declines, Gc stable" textbook story: in true longitudinal data, the two trajectories are coupled. Critical for any honest narrative-of-aging in the Elder advisor track.

## Korean-Context Adaptations

16. Jo, H., Park, K., & Hwang, S. T. (2015). Comparison between Wechsler and CHC structural models of the K-WAIS-IV. *Korean Journal of Clinical Psychology*, 34(3), 607–624. DOI: https://doi.org/10.15842/kjcp.2015.34.3.002
   - **CHC structure replicates better than Wechsler structure in Korean adults**. Confirmatory factor analysis on the K-WAIS-IV normative sample (N = 1,228) showed the CHC structural model fit significantly better than the Wechsler four-index model. Specifically, the Perceptual Reasoning Index splits cleanly into Gf and Gv; Arithmetic loads on both Gf and Gsm. **This is the strongest single piece of Korean-context evidence that CHC is the appropriate framework for Korean cognitive ability inference.**

17. Choi, A., Hong, S., Park, K., Chey, J., Hwang, S. T., & Kim, J. (2014). Validity of the K-WAIS-IV short forms. *Korean Journal of Clinical Psychology*, 33(2), 413–428. DOI: https://doi.org/10.15842/kjcp.2014.33.2.011
   - **K-WAIS-IV short-form validation**. Establishes that abbreviated K-WAIS-IV forms retain reasonable validity in Korean samples. Useful as a base citation for "the Korean Wechsler is the canonical adult intelligence assessment in Korea."

18. Jo, H., & Hwang, S. T. (2017). Age effect of CHC index on K-WAIS-IV. *The Korean Journal of Psychology: General*, 36(2), 271–291. DOI: https://doi.org/10.22257/kjp.2017.06.36.2.271
   - **CHC factor indices across Korean age groups**. Shows that in Korean K-WAIS-IV data, Gc remains stable across adulthood while Gf, Gv, Gsm, and Gs decline — replicating the classic Western Gf-decline / Gc-preservation pattern within a Korean sample. Critical for age-appropriate narration in the Adult and Elder tracks.

## Connection to Journal Text (Computational Linguistics)

These sources establish *whether and how* journal language can plausibly hint at CHC broad abilities. Strong caution applies — see §Cautions.

19. Pennebaker, J. W., & King, L. A. (1999). Linguistic styles: Language use as an individual difference. *Journal of Personality and Social Psychology*, 77(6), 1296–1312. DOI: https://doi.org/10.1037/0022-3514.77.6.1296
   - **The foundational text-as-individual-difference paper**. Demonstrates that LIWC-style text features are reliable individual-difference signals, including a factor interpretable as cognitive style. Notes that vocabulary breadth and word-length in student essays correlate with SAT scores — a tentative behavioral link from text to Gc.

20. Pennebaker, J. W., & Stone, L. D. (2003). Words of wisdom: Language use over the life span. *Journal of Personality and Social Psychology*, 85(2), 291–301. DOI: https://doi.org/10.1037/0022-3514.85.2.291
   - **Language use changes with age, reflecting cognitive complexity**. Across 3,000+ participants and historical literary corpora, increasing age is associated with greater linguistic cognitive complexity (more complex causal structure, fewer self-references, more future-oriented). A signal that *text* can index aspects of crystallized/cognitive maturity — but at the population, not individual, level.

21. Tausczik, Y. R., & Pennebaker, J. W. (2010). The psychological meaning of words: LIWC and computerized text analysis methods. *Journal of Language and Social Psychology*, 29(1), 24–54. DOI: https://doi.org/10.1177/0261927X09351676
   - **The methodological anchor for LIWC-based text analysis**. Synthesizes how LIWC categories map to psychological constructs including thinking styles. Provides the empirical vocabulary for *attempting* CHC inference from journal text — but explicitly cautions that LIWC categories are correlates of cognitive style, not measures of cognitive ability.

22. Pennebaker, J. W., & Beall, S. K. (1986). Confronting a traumatic event: Toward an understanding of inhibition and disease. *Journal of Abnormal Psychology*, 95(3), 274–281. DOI: https://doi.org/10.1037/0021-843X.95.3.274
   - **Cross-reference**: This is the foundational expressive-writing study. Cited here to anchor the *paradigm* that journal writing carries psychological signal — see also `self-knowledge.md`. **Not** a CHC source, but the bridge that justifies analyzing journal text at all.

## Age Range Coverage

- **Child (0–12)**: applicable — CHC operationalized in child assessments (WJ-IV-Cog, WISC-V, KABC-II); broad-ability differentiation emerges from middle childhood. Not 2nd-Brain's user base (C10 birth-date ≥ 18).
- **Adolescent (13–17)**: applicable — CHC structure replicates; broad abilities increasingly differentiated. Not 2nd-Brain's user base.
- **Young Adult (18–29)**: applicable — peak Gf, peak Gs, still-rising Gc; emerging vocabulary differentiation. Strong evidence base from K-WAIS-IV (Jo et al. 2015; Jo & Hwang 2017).
- **Adult (30–49)**: applicable — Gf stable to slowly declining, Gc rising, Gs slowly declining. Western and Korean evidence align.
- **Midlife (50–64)**: applicable — Gf decline more visible, Gc near plateau, Gs decline steeper. Tucker-Drob 2022 shows Gf-Gc trajectory coupling becomes clearer here.
- **Elderly (65+)**: applicable — classic crossover: Gf, Gv, Gsm, Gs continue to decline; Gc peaks ~late 60s then slowly declines (Winter 2025 WAIS-5 cross-sectional; Tucker-Drob 2022 longitudinal). Korean elderly data (Jo & Hwang 2017) replicates the pattern.

## Application to 2nd-Brain

### Interview Question Examples (validated)

Items below use CHC broad-ability vocabulary to invite *reflection*, not measurement. Phrasing avoids any test-like framing.

**Korean**
- 처음 보는 문제를 풀어야 할 때, 본인은 어떤 식으로 접근하시나요? (Gf — novel reasoning)
- 어떤 분야에 대해 "내가 좀 안다" 싶은 게 있다면 어떤 거예요? (Gc — crystallized knowledge)
- 머릿속에 공간이나 지도를 그려서 생각하는 편이세요, 말로 풀어서 생각하는 편이세요? (Gv vs verbal)
- 한 번에 몇 가지 일을 동시에 머릿속에 담아두는 게 편하세요, 부담스러우세요? (Gsm — working memory)
- 예전에 알던 사람 이름이나 장소가 떠오르는 데 시간이 좀 걸리는 편이세요? (Glr — retrieval; age-sensitive)
- 새로운 단어나 표현을 만났을 때 보통 어떻게 반응하세요? (Gc — vocabulary growth)

**English**
- When you hit a problem you've never seen before, what's your first move? (Gf)
- What's a topic where you'd say "I actually know this pretty well"? (Gc)
- When you think through a problem, do you tend to picture it visually or talk it through in words? (Gv vs verbal preference)
- How does it feel when you have to hold several things in your head at once? (Gsm)
- Lately, when you try to remember a name or a place, does it come quickly or take a beat? (Glr)
- When you come across a word you don't know, what do you usually do? (Gc — knowledge acquisition behavior)

### Trait Extraction Cues

From journal entries, map language patterns to CHC broad abilities *as soft signal only* (per Pennebaker & King 1999; Tausczik & Pennebaker 2010):

- **Gc (Comprehension-Knowledge)** — vocabulary breadth, use of low-frequency precise words, domain-specific terminology, willingness to define terms. **Caveat**: heavily confounded with education and reading habits; do not equate with "innate" Gc.
- **Gf (Fluid Reasoning)** — markers of novel-problem framing ("I'd never seen X before, so I tried Y"), analogy use, hypothesis-testing language ("if this is true, then…"). Hard to distinguish from general thinking style.
- **Gsm (Working Memory)** — complaints of dropped tasks, frequency of "I forgot to…", sentence-level coherence in dense reflective passages. Highly confounded with stress and sleep.
- **Glr (Long-Term Retrieval)** — self-reports of word-finding difficulty, "the name that's on the tip of my tongue," delayed recall of past events. Age-sensitive.
- **Gs (Processing Speed)** — descriptions of pace ("I'm slow at this," "I needed extra time"), task-completion frustration. Hardly inferrable from text alone.
- **Grw (Reading & Writing)** — observable directly from journal output: syntactic complexity, paragraph structure, error rate. But: the user has self-selected into a journaling app, biasing this signal.

**Rule**: Treat any CHC inference as **descriptive narration**, not measurement. Wait for ≥20 entries before tentatively narrating a pattern. Never produce a numeric score, percentile, or category label. Never rank the user against any population.

### Advisor Guidance Patterns

- **Vocabulary, not metrics**: Use CHC terms ("you seem to lean on accumulated knowledge here" = Gc-flavored) to enrich the user's self-language, never to label them.
- **Aging-track honesty**: For users in the 50+ track, narrate the classic Gf-decline / Gc-preservation pattern *only* when prompted, and cite Tucker-Drob (2022) for the more nuanced coupled trajectory — do not promise "you'll only get wiser, never slower."
- **Korean users**: Reference K-WAIS-IV CHC alignment (Jo et al. 2015) as the locally validated structural backbone. Do not import US norms.
- **No comparison framing**: Never tell a user they are "above/below average" on any CHC broad ability. This is the bright line: CHC requires standardized testing for true measurement (see §Cautions).
- **Cross-link**: For users describing strengths/talents, prefer `via-strengths.md` framework over CHC — VIA character strengths are character-virtues, not cognitive abilities, and are safer to narrate.

## Cautions & Limitations

- **CHC requires standardized testing for true measurement.** The broad abilities are operationalized via specific test batteries (WJ-IV, WAIS-V, SB5). Journal text alone *cannot* measure Gf, Gc, Gv, Ga, Gs, Gsm, Glr, Gq, or Grw. 2nd-Brain must never present a CHC inference as a measurement.
- **2nd-Brain must NOT claim IQ scores or any quantitative cognitive ability output.** This is a legal/ethical bright line from v0.2 design. Producing IQ-like outputs from journal text would (a) be psychometrically invalid, (b) potentially run afoul of Korean and US health-information regulations on psychological assessment, and (c) violate the vocabulary policy (clinical-test framing).
- **Journal-based inference can only approximate, not measure.** Pennebaker-tradition LIWC research demonstrates *correlations* between language features and cognitive style at the population level. Individual-level CHC profile inference from text is unsupported by the literature.
- **CHC is well-validated but not infallible.** McGill & Dombrowski (2019) and Dombrowski et al. (2018) show that commercial CHC-aligned scoring can overrepresent the structure relative to underlying factor solutions. The framework is the consensus, but not all "CHC-aligned" claims rest on equally strong evidence.
- **Cross-cultural caveat**: CHC replicates broadly, including in Korean samples (Jo et al. 2015; Jo & Hwang 2017), but narrow-ability and item-level cultural variance exists. Never assume US norms apply to Korean users.
- **Aging narratives must be coupled**: Do not tell users "Gc keeps rising forever" — Tucker-Drob (2022) shows Gf and Gc trajectories are dependent within individuals. Honest narration of cognitive aging acknowledges decline alongside preservation.
- **MI vocabulary is user-facing legitimate but not scientific**: If a user self-identifies with "musical intelligence" or "interpersonal intelligence" (Gardner MI), accept the self-description but do not derive trait claims from it (per `assessment-landscape.md` Tier C rule, applied here to MI).
- **Not for cognitive impairment screening.** Any user content suggesting dementia, mild cognitive impairment, post-stroke deficits, or rapid cognitive decline must route to `crisis-detection.md` / `ai-mental-health-safety.md` "see a clinician" pathway — never to a CHC narrative.

## Cross-References

- `assessment-landscape.md` — for the tiering rationale that places CHC in Tier A and MBTI/Enneagram in Tier C.
- `self-knowledge.md` — for the broader rationale (Frattaroli 2006 meta) that journal writing has psychological value, regardless of CHC inference.
- `computational-personality.md` — for the consent/confidence-band rules that any text-based inference (including CHC) must respect.
- `ai-mental-health-safety.md` — for the "what 2nd-Brain CANNOT claim" guardrails that explicitly include cognitive/IQ scoring.
- `big-five.md` — Roberts et al. (2007) showed personality predicts life outcomes *over and above* cognitive ability. Use Big Five for trait narration; reserve CHC vocabulary for cognitive-domain reflection only.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/chc-cognitive-abilities.sql` for the executable version. Inline SQL preview:

```sql
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale, summary_ko, summary_en, application_notes)
values
  -- 18 rows with verified DOIs:
  -- Cattell 1963, Horn & Cattell 1966, McGrew 2009,
  -- Waterhouse 2006, Gardner & Moran 2006, Spearman 1904,
  -- Niileksela 2016, Dombrowski 2018, Bulut 2021, Janzen 2004,
  -- Winter 2025, McGill & Dombrowski 2019, Tucker-Drob 2022,
  -- Jo Park & Hwang 2015, Choi et al. 2014, Jo & Hwang 2017,
  -- Pennebaker & King 1999, Pennebaker & Stone 2003, Tausczik & Pennebaker 2010,
  -- Pennebaker & Beall 1986
  -- + 2 monograph rows (Carroll 1993, Jensen 1998, Schneider & McGrew 2018) with NULL doi
  (
    'Theory of fluid and crystallized intelligence: A critical experiment',
    ARRAY['Raymond B. Cattell'],
    '10.1037/h0046743',
    'https://doi.org/10.1037/h0046743',
    'chc',
    'adult',
    'en',
    'Cattell의 Gf(유동지능)/Gc(결정지능) 이분 모형의 최초 경험적 실험 검증. CHC 이론의 출발점.',
    'First empirical demonstration of the Gf (fluid intelligence) vs Gc (crystallized intelligence) split. The originating paper of what becomes CHC theory.',
    '인지능력 차원의 어휘적 토대로 사용. 점수화·측정 금지.'
  );
  -- ... (additional rows in seed file)
```
