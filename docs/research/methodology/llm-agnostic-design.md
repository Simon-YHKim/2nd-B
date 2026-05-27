# Methodology: LLM-Agnostic Analysis System Design — Academic Foundations

> Research backing for 2nd-Brain v0.2 design document §02 (LLM-agnostic 4 Layers), §08 (Golden Set Protocol), §09 Queues ① ② ④.
>
> **Scope.** This file is methodology (computer-science evaluation literature), not psychology content. For psychology constructs (Big Five, narrative identity, SDT, etc.) see `docs/research/batches/`. For the specific question "can an LLM reliably extract Big Five from journal text", see the companion batch `docs/research/batches/computational-personality.md` — that work is not duplicated here.
>
> **Verification policy.** Every cited paper was confirmed against arXiv, ACL Anthology, NeurIPS proceedings, PNAS, or the publisher record during this session. No fabricated citations. arXiv preprints are included only when the work has either (a) been accepted at a peer-reviewed venue or (b) is the canonical reference for its concept and is heavily cited.

---

## AI Retrieval Guide (for RAG / Wiki use)

| When the system needs to answer… | Look at section |
|---|---|
| "Why don't we use the LLM as an evaluator?" | §1 |
| "How do we know GPT-4 / Claude / Gemini will give comparable outputs?" | §2, §4 |
| "Why do we ground every Engine-2 inference in retrieved snippets from the user's journal?" | §3 |
| "Why are LLM outputs strictly JSON-schema'd, never free-form?" | §4 |
| "How do we validate the LLM as a behavior coder?" | §5 |
| "What measurable invariant do we ship in the Golden Set Protocol?" | §6 |

---

## 1. The LLM-as-Classifier Principle

**Design claim (v0.2 §02).** 2nd-Brain uses the LLM as a *classifier* — assigning each user input to a node in a fixed signal-pattern-category taxonomy — not as an *evaluator* assigning a free-form quality judgment.

The peer-reviewed literature on LLM-as-a-Judge documents three systematic biases that make free-form evaluative use brittle.

### 1.1 The benchmark for LLM-as-Judge: encouraging but bias-laden

Zheng et al. (2023, NeurIPS Datasets and Benchmarks Track) introduced **MT-Bench** and **Chatbot Arena** to test whether strong LLMs can substitute for human preference judges. Their headline result — "strong LLM judges like GPT-4 can match both controlled and crowdsourced human preferences well, achieving over 80% agreement, the same level of agreement between humans" — is positive in the aggregate. But the same paper isolates three biases that recur in every subsequent study:

- **Position bias.** Judges prefer the response shown first (or shown in a particular position).
- **Verbosity bias.** Longer responses are preferred even when content is matched.
- **Self-enhancement bias.** A model prefers its own outputs over those of other models.

### 1.2 Position bias and "rank by reordering"

Wang et al. (2023, *Large Language Models are not Fair Evaluators*, arXiv:2305.17926) made the position-bias problem operationally vivid: **"the quality ranking of candidate responses can be easily hacked by simply altering their order of appearance in the context."** They propose three calibration strategies (multiple evidence calibration, balanced position calibration, human-in-the-loop) — i.e., even mitigations require additional machinery, not just a better prompt.

A wider literature confirms this is not a small effect. Multiple follow-ups (e.g., *Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge*, arXiv:2410.02736; *Judging the Judges: A Systematic Investigation of Position Bias in Pairwise Comparative LLM-as-a-Judge*, arXiv:2406.07791) confirm position bias across model families and propose ensemble / swap-and-average mitigations.

### 1.3 G-Eval: correlation, not interchangeability

Liu et al. (2023, EMNLP main proceedings, *G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment*) is the most cited demonstration that LLM evaluators can correlate with human raters: GPT-4 with chain-of-thought reaches **Spearman ρ ≈ 0.514** with humans on summarization. That is the **upper bound** of current LLM-as-judge performance for a relatively constrained task with extensive prompt engineering. It is a *moderate* correlation, not parity — and it is on summarization, a much narrower task than "evaluate this user's reflection."

### 1.4 Implication for 2nd-Brain

Free-form LLM evaluation of journal entries would inherit all three biases (the user might write a longer entry and get an artificially more positive read; the LLM might prefer its own paraphrase; reordered context could change the verdict). Using the LLM as a *classifier into a pre-registered taxonomy* (the v0.2 signal-pattern-category hierarchy) sidesteps the evaluator role entirely. The LLM is never asked "how good is this?" — only "which of these N labels best fits?" Classifier tasks are testable with inter-rater agreement (kappa / α) against held-out human labels; evaluator tasks are not, in the same way.

---

## 2. Cross-LLM Variance: What the Literature Shows

**Design claim (v0.2 §08).** The Cross-LLM Golden Set Protocol periodically runs a fixed set of synthetic user inputs through GPT-4-class, Claude-class, and Gemini-class models and asserts that labels agree above a kappa threshold; drift below threshold flags the taxonomy or prompt for review.

The literature gives several independent reasons this protocol is necessary, not paranoid.

### 2.1 Non-determinism even within a single model

Ouyang, Zhang, Harman, and Wang (2023, arXiv:2308.02828; later in ACM TOSEM) ran ChatGPT 829 times each on three code-generation benchmarks. Even with `temperature = 0`, output was non-deterministic: across the three benchmarks 47–76 % of tasks had **no two equal outputs across runs**. The paper's headline number — **75.76 % of CodeContests tasks produced zero pairwise-equal outputs across runs at the default temperature** — is the most direct empirical case that "the same model with the same prompt" cannot be assumed to produce the same answer in production.

### 2.2 Model behavior drifts over time

Chen, Zaharia, and Zou (2023, *How is ChatGPT's Behavior Changing over Time?*, arXiv:2307.09009) compared GPT-3.5 and GPT-4 between March and June 2023. **GPT-4's accuracy on prime-number identification dropped from 84 % to 51 % in three months.** Format-following and code-generation behaviors changed without notice. The paper's prescription — "the necessity for ongoing LLM monitoring" — is exactly the role of the Golden Set Protocol.

### 2.3 Prompt-formatting sensitivity

Sclar, Choi, Tsvetkov, and Suhr (ICLR 2024, *Quantifying Language Models' Sensitivity to Spurious Features in Prompt Design*, arXiv:2310.11324) showed that **meaning-preserving formatting changes (extra spaces, colon-vs-double-colon, item-separator choice) can move accuracy by up to 76 percentage points** on widely used open-source LLMs. The paper proposes that responsible LLM evaluation should report a **range across format variations**, not a single point. For 2nd-Brain, this argues for treating the prompt + JSON schema as a versioned artifact under change control — a small "harmless" wording tweak can silently change classification distributions.

### 2.4 Cross-model divergence on identical prompts

There is no single canonical paper on GPT-4 ↔ Claude ↔ Gemini consistency, but two converging lines of evidence support the Golden Set design:

- **LLM-as-annotator reliability work.** Gilardi, Alizadeh, and Kubli (2023, PNAS, *ChatGPT outperforms crowd workers for text-annotation tasks*) report that ChatGPT achieved higher intercoder agreement than crowd workers across relevance, stance, topic, and frame detection on a dataset of n = 6,183 tweets and news articles — but the agreement was measured *between runs of the same model*, not between different model families. The cross-model question remains a per-deployment validation problem.
- **Recent agent-consistency work.** *When Agents Disagree With Themselves* (arXiv:2602.11619) finds that ReAct-style agents on HotpotQA produce 2.0–4.2 distinct action sequences per 10 identical runs across Llama-3.1-70B, GPT-4o, and Claude-Sonnet-4.5. Tasks with consistent behavior achieved 80–92 % accuracy; tasks with inconsistent behavior dropped to 25–60 %. Consistency is a *predictor* of correctness.

### 2.5 Implication for 2nd-Brain

LLM outputs vary along four axes simultaneously: (a) within-model stochasticity, (b) silent vendor model updates, (c) prompt-format sensitivity, (d) cross-vendor disagreement on identical prompts. The Golden Set Protocol is the only construct in v0.2 that observes all four; it should be run on **a schedule** (not only after deliberate prompt changes), and the kappa-against-baseline value should be the regression test.

---

## 3. RAG Grounding Reduces Hallucination

**Design claim (v0.2 §02 / §09 Queues ① ②).** Every Engine-2 inference is grounded in retrieved snippets from the user's own journal corpus. The LLM never generates a claim about the user from parametric memory alone.

### 3.1 Original RAG (Lewis et al., NeurIPS 2020)

Lewis et al. (2020, NeurIPS, *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*, arXiv:2005.11401) introduced RAG as a hybrid of a parametric seq2seq model and a non-parametric dense Wikipedia index. The architectural argument that motivates 2nd-Brain's design is in the abstract: by combining "pre-trained parametric and non-parametric memory for language generation," the model's outputs are constrained by retrievable evidence rather than only by the prior distribution learned during pretraining.

### 3.2 The 2023 RAG synthesis

Gao et al. (2023, *Retrieval-Augmented Generation for Large Language Models: A Survey*, arXiv:2312.10997) is the canonical taxonomy of RAG architectures (Naive → Advanced → Modular RAG) and the cleanest summary of what RAG is solving for: **"limitations of LLMs, including hallucination and outdated knowledge."** For a journaling app whose entire epistemic stance is "the user's text is the only knowledge base," the Modular RAG framing — retrieve, route, rerank, generate — is closest to 2nd-Brain's v0.2 architecture.

### 3.3 Hallucination as a measurable failure mode

Ji et al. (2023, ACM Computing Surveys, *Survey of Hallucination in Natural Language Generation*, DOI 10.1145/3571730) is the comprehensive taxonomy. The paper distinguishes **intrinsic hallucination** (output contradicts the source) from **extrinsic hallucination** (output adds unverifiable claims). For Engine 2, both are unacceptable; the design implication is that *every output sentence* must be traceable to a retrieved snippet (intrinsic check) and the LLM must be schema-constrained from adding fields not derivable from those snippets (extrinsic check).

### 3.4 Measuring RAG quality without ground truth

Es, James, Espinosa-Anke, and Schockaert (2023, *RAGAS: Automated Evaluation of Retrieval Augmented Generation*, arXiv:2309.15217) provides the evaluation framework most directly applicable to 2nd-Brain: a suite of metrics (faithfulness, answer relevance, context relevance) that **do not require ground-truth annotations**. For a single-user journaling app, where no external ground truth exists, RAGAS-style metrics computed against the user's own retrieved snippets are the closest thing to an automated faithfulness check.

### 3.5 Implication for 2nd-Brain

- Every Engine-2 generation passes through RAG with the user's journal as the index.
- The LLM prompt enforces "quote the snippet ID for every claim."
- A faithfulness score (RAGAS-style) on a held-out per-user evaluation set is the regression target for any Engine-2 prompt change.

---

## 4. Structured Output and Schema Enforcement

**Design claim (v0.2 §02 / §09).** Every LLM output in 2nd-Brain conforms to a registered JSON schema (signal classification, pattern classification, category roll-up). Free-form prose is generated only at the surface presentation layer, never as the primary inference artifact.

The literature gives a **mixed** picture here, and the design decision must be made consciously, not by default.

### 4.1 The constrained-decoding foundation

Willard and Louf (2023, *Efficient Guided Generation for Large Language Models*, arXiv:2307.09702) formalize constrained decoding as transitions on a finite-state machine over the model's vocabulary. This is the algorithmic basis of the Outlines library and similar grammar-constrained generation tools (guidance, XGrammar). Operationally: when an LLM is forced to emit valid JSON via a constraining decoder, the output is *guaranteed* parseable — the entire class of "the LLM returned malformed JSON" failures is eliminated by construction.

### 4.2 The format tax

Tam et al. (2024, *Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models*, arXiv:2408.02442) is the most rigorous current evidence on the *cost* of structured outputs. **Stricter format constraints generally cause greater degradation in reasoning performance.** The mechanism appears to be that the format constraint occupies attention / token budget that would otherwise go to the reasoning chain.

### 4.3 Reconciling the two findings: decouple reasoning from formatting

The recommended pattern in the recent literature ("The Format Tax", arXiv:2604.03616; *Decoupling Task-Solving and Output Formatting in LLM Generation*, arXiv:2510.03595) is to **let the model reason in freeform first, then re-emit the answer under schema constraint** — either as a two-pass generation or as an "extended thinking" preamble inside a single call. The cost-vs-determinism trade-off can be substantially recovered.

### 4.4 Implication for 2nd-Brain

- The schema (signal-pattern-category) is non-negotiable; downstream consumers cannot recover from free-form drift, and structured outputs are what make cross-model kappa comparison meaningful at all.
- Engine-2 prompts should use the **two-stage** pattern: an unconstrained "reflect on the evidence" step (which may be discarded), then a schema-constrained label emission. This preserves the reasoning bandwidth Tam et al. identify while keeping the audit trail and the cross-model invariant.
- The schema itself is a versioned artifact. Adding a field is a migration, not a prompt change.

---

## 5. Behavior Coding as the Bridge to Psychological Validity

**Design claim (v0.2 §02 / §08).** The signal-pattern-category hierarchy is a **behavior coding scheme** in the sense of observational methods in the behavioral sciences. The LLM is treated as one coder; agreement with a held-out human coder (or with itself across runs, or across vendors) is measured with the same statistics (Cohen's κ, Krippendorff's α) used for human inter-rater reliability.

### 5.1 The methodological reference

Bakeman and Quera (2011, *Sequential Analysis and Observational Methods for the Behavioral Sciences*, Cambridge University Press) is the canonical text on **coding schemes**: how to define mutually exclusive and exhaustive categories, how to train coders, how to compute reliability, how to analyze sequences of coded events. The book explicitly frames coding as a measurement problem with reliability and validity as separate requirements. The 2nd-Brain taxonomy work in v0.2 inherits this framing: signals are the codable events, patterns are the next-level grouping, categories are the highest aggregate.

### 5.2 Inter-rater reliability statistics

- Cohen (1960, *A Coefficient of Agreement for Nominal Scales*, *Educational and Psychological Measurement* 20(1):37–46, DOI 10.1177/001316446002000104) — the original κ for two coders, nominal categories, chance-corrected.
- Krippendorff's α — generalizes κ to any number of coders, any measurement level (nominal/ordinal/interval/ratio), and handles missing data. The standard exposition is in Krippendorff's *Content Analysis: An Introduction to Its Methodology* (Sage; multiple editions, most recent 4th ed.).
- McHugh (2012, *Interrater reliability: the kappa statistic*, *Biochemia Medica* 22(3):276–282, DOI 10.11613/BM.2012.031) — the most-cited modern practical guide; provides the thresholds used in many fields (κ ≥ 0.81 "almost perfect"; 0.61–0.80 "substantial"; 0.41–0.60 "moderate").

### 5.3 LLMs as coders, validated by κ

This is the bridge from psychology methodology to LLM engineering.

- **Gilardi, Alizadeh, and Kubli (2023, PNAS, DOI 10.1073/pnas.2305016120)** is the seminal paper. They report that ChatGPT's **intercoder agreement exceeded that of both crowd workers and trained annotators** across relevance, stance, topic, and frame detection tasks (n = 6,183). For 2nd-Brain, this is the empirical license to treat the LLM as a member of the coder set — but the agreement must be re-measured per task, per language, per model version.
- More recent work (e.g., *Towards Consistent Detection of Cognitive Distortions: LLM-Based Annotation*, arXiv:2511.01482, accepted LREC 2026) reports Fleiss κ ≈ 0.78 for GPT-4 on cognitive-distortion labeling — directly adjacent to 2nd-Brain's domain.

### 5.4 The Golden Set Protocol as cross-LLM κ measurement

Combining §2 and §5: the Golden Set Protocol is, in methodological terms, **a periodic inter-rater reliability study where each LLM vendor is one rater**. The kappa value across vendors on the fixed synthetic-input set is the measurable invariant the design relies on. If it drops below threshold, the system is not "LLM-agnostic" anymore until the prompt or the taxonomy is fixed.

### 5.5 Implication for 2nd-Brain

- Document the coding scheme to Bakeman-Quera standards: definitions, examples, decision rules, edge cases. The taxonomy file itself becomes the coder training material.
- Compute Krippendorff α (not just Cohen κ) on the Golden Set because we routinely have ≥ 3 LLM "coders" (GPT-4-class, Claude-class, Gemini-class).
- Report κ / α with confidence intervals; do not over-claim on small Golden Sets. McHugh's thresholds should appear in the dashboard.

---

## 6. Implications for 2nd-Brain

Concrete, testable design recommendations from the foregoing literature.

| # | Recommendation | Cited evidence | Where it lands in v0.2 |
|---|---|---|---|
| R1 | Never use the LLM as a free-form evaluator of user reflection. Use it as a classifier into a registered taxonomy. | Zheng 2023; Wang 2023; Liu 2023 | §02 (4-layer) |
| R2 | Treat the prompt + schema as a versioned artifact with the same change-control rigor as the database schema. | Sclar 2024 | §02; §07 ops |
| R3 | Ground every Engine-2 inference in retrieved snippets from the user's own journal. No parametric-memory claims about the user. | Lewis 2020; Gao 2023; Ji 2023 | §02 (Engine 2) |
| R4 | Compute a RAGAS-style faithfulness score on a per-user held-out set as the regression target for Engine-2 prompt changes. | Es 2023 | §08 (golden set extension) |
| R5 | Decouple reasoning from formatting: free-form reflection first, then schema-constrained emission. | Tam 2024; "The Format Tax" 2026 | §02 LLM prompt template |
| R6 | The Golden Set Protocol runs on a schedule, not on-demand, because vendors silently update models. | Chen 2023 | §08 |
| R7 | Document the signal-pattern-category taxonomy as a behavior coding scheme to Bakeman-Quera standards, including edge cases. | Bakeman & Quera 2011 | §02 (taxonomy doc) |
| R8 | Treat the LLM as one coder among ≥ 3 (vendors); compute Krippendorff α with confidence intervals. | Krippendorff; Gilardi 2023 | §08 |
| R9 | κ / α drift below McHugh's "substantial" threshold (0.61) is a release-blocker. | McHugh 2012 | §08 dashboard |
| R10 | For Korean text, every claim above must be re-validated; do not assume English results transfer. | (See `computational-personality.md` §Korean gap) | §02; §07 i18n |

---

## 7. Gaps and Limitations

**Gaps identified during this batch (May 2026 session):**

1. **No verified PerLLM-Persona benchmark by Wen et al.** A paper of that exact title was not locatable in arXiv / Semantic Scholar / ACL Anthology. The closest verified work is **PersonaLLM** (Jiang et al., 2023, arXiv:2305.02547, NAACL Findings 2024), which is about LLMs *expressing* assigned personality traits, not *inferring* user personality. We use PersonaLLM only where the citation is "can LLMs reliably express a target personality profile" — not as substitute evidence for inference accuracy.
2. **No single canonical cross-vendor (GPT-4 / Claude / Gemini) consistency paper.** Evidence in §2.4 is assembled from several papers each measuring one slice. A targeted study is a research gap; the Golden Set Protocol effectively constructs one in-house.
3. **No verified Korean-language LLM-as-coder κ study.** This is the same gap flagged in `computational-personality.md` and remains open.

**Not duplicated here (see linked sources):**

- Pennebaker 2003, Schwartz 2013, Kosinski 2013, Park 2015, Maharjan 2025 — all in `docs/research/batches/computational-personality.md`. These establish *that* LLM-from-text personality inference is feasible; this file establishes *how* to engineer the system so the inference is auditable, schema-stable, and cross-vendor portable.

---

## Bibliography

All entries verified during this session. arXiv links are canonical preprints; DOI / ACL / NeurIPS links go to the peer-reviewed venue where one exists.

### LLM-as-Judge and Evaluator Biases

- Zheng, L., Chiang, W.-L., Sheng, Y., Zhuang, S., Wu, Z., Zhuang, Y., Lin, Z., Li, Z., Li, D., Xing, E. P., Zhang, H., Gonzalez, J. E., & Stoica, I. (2023). **Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena.** *NeurIPS 2023 Datasets and Benchmarks Track.* arXiv:2306.05685. https://arxiv.org/abs/2306.05685
- Liu, Y., Iter, D., Xu, Y., Wang, S., Xu, R., & Zhu, C. (2023). **G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment.** *EMNLP 2023.* ACL Anthology 2023.emnlp-main.153. arXiv:2303.16634. https://aclanthology.org/2023.emnlp-main.153/
- Wang, P., Li, L., Chen, L., Cai, Z., Zhu, D., Lin, B., Cao, Y., Liu, Q., Liu, T., & Sui, Z. (2023). **Large Language Models are not Fair Evaluators.** arXiv:2305.17926. https://arxiv.org/abs/2305.17926

### LLM Consistency, Non-determinism, and Drift

- Ouyang, S., Zhang, J. M., Harman, M., & Wang, M. (2023). **An Empirical Study of the Non-determinism of ChatGPT in Code Generation.** arXiv:2308.02828 (later in ACM TOSEM, 2025). https://arxiv.org/abs/2308.02828
- Chen, L., Zaharia, M., & Zou, J. (2023). **How is ChatGPT's behavior changing over time?** arXiv:2307.09009. https://arxiv.org/abs/2307.09009
- Sclar, M., Choi, Y., Tsvetkov, Y., & Suhr, A. (2024). **Quantifying Language Models' Sensitivity to Spurious Features in Prompt Design.** *ICLR 2024.* arXiv:2310.11324. https://arxiv.org/abs/2310.11324

### Retrieval-Augmented Generation and Hallucination

- Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel, S., & Kiela, D. (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.** *NeurIPS 2020.* arXiv:2005.11401. https://arxiv.org/abs/2005.11401
- Gao, Y., Xiong, Y., Gao, X., Jia, K., Pan, J., Bi, Y., Dai, Y., Sun, J., Wang, M., & Wang, H. (2023). **Retrieval-Augmented Generation for Large Language Models: A Survey.** arXiv:2312.10997. https://arxiv.org/abs/2312.10997
- Es, S., James, J., Espinosa-Anke, L., & Schockaert, S. (2023). **RAGAS: Automated Evaluation of Retrieval Augmented Generation.** arXiv:2309.15217. https://arxiv.org/abs/2309.15217
- Ji, Z., Lee, N., Frieske, R., Yu, T., Su, D., Xu, Y., Ishii, E., Bang, Y. J., Madotto, A., & Fung, P. (2023). **Survey of Hallucination in Natural Language Generation.** *ACM Computing Surveys* 55(12), Article 248. DOI: 10.1145/3571730. https://dl.acm.org/doi/10.1145/3571730

### Structured Output and Constrained Decoding

- Willard, B. T., & Louf, R. (2023). **Efficient Guided Generation for Large Language Models.** arXiv:2307.09702. https://arxiv.org/abs/2307.09702
- Tam, Z. R., Wu, C.-K., Tsai, Y.-L., Lin, C.-Y., Lee, H., & Chen, Y.-N. (2024). **Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models.** arXiv:2408.02442. https://arxiv.org/abs/2408.02442

### Behavior Coding and Inter-rater Reliability

- Bakeman, R., & Quera, V. (2011). **Sequential Analysis and Observational Methods for the Behavioral Sciences.** Cambridge University Press. ISBN 9781107001244. https://www.cambridge.org/core/books/sequential-analysis-and-observational-methods-for-the-behavioral-sciences/E74148FC98DEFA56367A2DF32759AF4D
- Cohen, J. (1960). **A Coefficient of Agreement for Nominal Scales.** *Educational and Psychological Measurement* 20(1), 37–46. DOI: 10.1177/001316446002000104. https://journals.sagepub.com/doi/10.1177/001316446002000104
- Krippendorff, K. **Content Analysis: An Introduction to Its Methodology** (4th ed.). Sage Publications. https://methods.sagepub.com/book/mono/content-analysis-4e
- McHugh, M. L. (2012). **Interrater reliability: the kappa statistic.** *Biochemia Medica* 22(3), 276–282. DOI: 10.11613/BM.2012.031. https://www.biochemia-medica.com/en/journal/22/3/10.11613/BM.2012.031

### LLM-as-Annotator / LLM-as-Coder

- Gilardi, F., Alizadeh, M., & Kubli, M. (2023). **ChatGPT outperforms crowd workers for text-annotation tasks.** *Proceedings of the National Academy of Sciences (PNAS)* 120(30), e2305016120. DOI: 10.1073/pnas.2305016120. arXiv:2303.15056. https://www.pnas.org/doi/10.1073/pnas.2305016120

### LLM-Based Personality Inference (new since `computational-personality.md`)

- Peters, H., & Matz, S. C. (2024). **Large language models can infer psychological dispositions of social media users.** *PNAS Nexus* 3(6), pgae231. https://academic.oup.com/pnasnexus/article/3/6/pgae231/7692212
- Peters, H., Cerf, M., & Matz, S. C. (2024). **Large Language Models Can Infer Personality from Free-Form User Interactions.** arXiv:2405.13052. https://arxiv.org/abs/2405.13052
- Jiang, H., Zhang, X., Cao, X., Breazeal, C., Roy, D., & Kabbara, J. (2023). **PersonaLLM: Investigating the Ability of Large Language Models to Express Personality Traits.** *NAACL Findings 2024.* arXiv:2305.02547. https://arxiv.org/abs/2305.02547

### Cross-linked (not duplicated)

- See `docs/research/batches/computational-personality.md` for: Pennebaker et al. 2003; Kosinski et al. 2013; Schwartz et al. 2013; Park et al. 2015; Maharjan et al. 2025. These establish that LLM-from-text personality inference is feasible; this methodology file complements them on the engineering side.

---

## Provenance

- **Authored**: 2026-05-27 session.
- **Verification**: every paper above accessed during this session via arXiv, ACL Anthology, PNAS, Cambridge University Press, ACM Digital Library, or Sage publisher page. Citations marked with arXiv IDs were also cross-checked against the venue (NeurIPS / EMNLP / ICLR / NAACL Findings / ACM Computing Surveys / PNAS / PNAS Nexus / Biochemia Medica).
- **Not yet verified in this session**: the v0.2 design document's specific signal-pattern-category taxonomy is *not* in this file. That taxonomy lives in the design document; this file justifies the methodology that taxonomy uses.
