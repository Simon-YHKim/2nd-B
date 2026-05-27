# Methodology: LLM Confidence Calibration — Academic Foundations

> Research backing for 2nd-Brain v0.2 design document §02 Layer 1 (confidence field: high / medium / low / insufficient) and §08 (Golden Set Protocol — calibration validation).
>
> **Scope.** This file is methodology (computer-science / probabilistic-ML evaluation literature). It addresses one question: *when the LLM stamps "high confidence" on an analysis card, what evidence do we have that it is right ~90 % of the time?* For psychology constructs that the cards refer to (Big Five, narrative identity, SDT, etc.) see `docs/research/batches/`. For the parallel question of cross-LLM agreement (Golden Set κ), see the companion methodology file `llm-agnostic-design.md` — that work is not duplicated here.
>
> **Verification policy.** Every cited paper was confirmed against arXiv, ACL Anthology, OpenReview / ICLR / ICML / NeurIPS proceedings, TMLR, the ACL Anthology entry for EMNLP / ACL / NAACL, or the publisher record during this session. No fabricated citations. arXiv preprints are included only when the work has either (a) been accepted at a peer-reviewed venue or (b) is the canonical reference for its concept and is heavily cited.

---

## AI Retrieval Guide (for RAG / Wiki use)

| When the system needs to answer… | Look at section |
|---|---|
| "Why do we even need calibrated confidence — can't we just use the LLM's own 'I'm confident' wording?" | §1, §3 |
| "What metric do we use to score the confidence field on the Golden Set?" | §2 (ECE, Brier, reliability diagrams) |
| "Does verbalized confidence ('I'm 80 % sure') from Gemini mean anything?" | §3, §4 |
| "Should we ask the model multiple times and use agreement as the confidence signal instead?" | §5 |
| "Which calibration method should production 2nd-Brain use, given we don't have logit access on Gemini API?" | §4, §6 |
| "What Brier / ECE thresholds should gate a release?" | §7 |
| "Does the model know when to abstain ('insufficient' tier)?" | §3 (Kadavath, Yin), §6 |

---

## 1. Why Calibration Matters

**Design claim (v0.2 §02 Layer 1).** Every analysis card emitted by 2nd-Brain carries a confidence field — `high`, `medium`, `low`, `insufficient`. For this to be more than UI decoration, the labels must be *calibrated*: cards stamped "high" should be correct ~90 % of the time, "medium" ~70 %, "low" ~50 %, and "insufficient" should mean the system refuses to answer rather than guesses.

Without calibration, three failure modes appear:

1. **Overconfidence**: model says "high" on signals it cannot actually support; user trusts a wrong inference about themselves.
2. **Under-confidence**: model says "low" on signals it could reliably extract; cards get hidden, journaling momentum drops.
3. **Mode collapse to one tier**: model emits "medium" on everything, the field carries no information.

All three are documented in the LLM-calibration literature below. None of them are solved by prompt engineering alone; each requires either a measurement protocol (so we can *see* the failure on the Golden Set) or a calibration method (verbalized, sampling-based, multicalibration). The rest of this file is the evidence base for choosing the protocol and the method.

A separate but related concern — that the model *abstains* when it should ("insufficient" tier) — is the hallucination / refusal literature in §3.5–§3.6.

---

## 2. Calibration Metrics: ECE, Brier, Reliability Diagrams

Before we cite LLM-specific calibration work, we need the metrics. These predate LLMs by decades and are the same numbers the Golden Set dashboard will display.

### 2.1 The foundational vocabulary

- **Brier (1950, *Verification of Forecasts Expressed in Terms of Probability*, Monthly Weather Review 78(1):1–3, DOI 10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2)** introduced the squared-error scoring rule for probabilistic forecasts: `BS = (1/N) Σ (p_i − y_i)²` where `p_i` is the forecast probability and `y_i ∈ {0,1}` is the realized outcome. Brier score is **strictly proper** (minimized in expectation by the true probability), bounded in [0, 1], and lower is better. It is still the default scalar score for binary-probability calibration, including in the LLM-calibration papers below (e.g., Kadavath 2022, Lin 2022, Tian 2023).
- **Reliability diagrams** (introduced by Sanders 1963 in meteorology; named and popularized by **DeGroot & Fienberg (1983, *The Comparison and Evaluation of Forecasters*, The Statistician 32(1/2):12–22, DOI 10.2307/2987588)**) plot predicted probability on the x-axis against empirical frequency of the event on the y-axis. A perfectly calibrated forecaster lies on the diagonal. Modern LLM calibration papers (e.g., Tian 2023) report reliability diagrams as the visual companion to ECE / Brier.

### 2.2 The two classic supervised-learning references

- **Niculescu-Mizil & Caruana (2005, *Predicting Good Probabilities With Supervised Learning*, ICML 2005, DOI 10.1145/1102351.1102430).** Empirical comparison of 10 classifier families on 8 datasets. Headline finding: SVMs and boosted trees produce systematically **distorted** probability estimates (sigmoid-shaped distortion away from 0 and 1); Platt scaling and isotonic regression are the canonical post-hoc fixes. This is the paper that established "model accuracy and model calibration are different objects, and you can have one without the other."
- **Guo, Pleiss, Sun, and Weinberger (2017, *On Calibration of Modern Neural Networks*, ICML 2017, arXiv:1706.04599).** Demonstrated that *modern* deep networks (ResNet, DenseNet, etc.) — despite achieving low classification error — are **systematically over-confident**, in contrast to the well-calibrated shallower networks of the LeCun era. Introduced **Expected Calibration Error (ECE)** as the standard scalar metric:

  > Bin predictions by predicted probability into M bins; for each bin compute |accuracy − average confidence|; ECE is the sample-size-weighted average of these gaps.

  Also introduced **temperature scaling** — a single scalar T learned on a held-out set, dividing the pre-softmax logits — as a simple post-hoc calibration that recovers most of the calibration loss without sacrificing accuracy. This paper is the most-cited modern reference (>10,000 citations) for both the ECE metric and the diagnosis that "deep networks are confidently wrong."

### 2.3 What this gives 2nd-Brain operationally

| Metric | What it measures | What we will compute on the Golden Set |
|---|---|---|
| **Brier score** | Mean squared error of probabilistic forecast vs. binary outcome | Per-card-type, per-LLM, per release. |
| **ECE** (with M = 10 bins per Guo 2017) | Average gap between bucket confidence and bucket accuracy | Single scalar per release; trigger threshold (§7). |
| **Reliability diagram** | Visual check that confidence buckets sit on the diagonal | Plotted to dashboard; eyeballed before each release. |

These three are independent enough that all three are reported; Brier captures sharpness + calibration, ECE captures calibration only, reliability diagrams reveal *which tier* is mis-calibrated (e.g., overconfident at the "high" end, well-calibrated at "medium").

---

## 3. LLM-Specific Calibration Research

The 2017 Guo et al. result was about supervised classifiers with logit access. LLMs in 2nd-Brain's deployment posture (Gemini through `@google/genai`) raise two new problems: (a) most production APIs do not expose token-level logits in a way that makes Guo-style temperature scaling tractable, and (b) the model can be asked to *say* its confidence in natural language, which is a new degree of freedom that the older literature does not address. The papers below establish what is known about both.

### 3.1 Kadavath et al. (2022) — "Language Models (Mostly) Know What They Know"

**Kadavath, Conerly, Askell, Henighan, Drain, Perez, … Kaplan (2022, *Language Models (Mostly) Know What They Know*, arXiv:2207.05221).** Anthropic study, large-scale evaluation across multiple-choice and short-answer tasks. The two findings that anchor everything downstream:

1. **Self-evaluation works in-the-large.** When the model is shown its own answer and asked "Is the proposed answer A) True or B) False?", the resulting P(True) is reasonably calibrated for large models. Mid-sized models are over-confident; calibration improves with scale.
2. **Models can produce calibrated probabilities of being correct in zero-shot for tasks they have seen calibrated.** But calibration **degrades under distribution shift** and degrades when the model is asked compositional / multi-hop questions.

The paper is the foundational reference for "you can prompt the model to produce a confidence number and that number has signal" — but it does *not* license the inference that the number is well-calibrated by default; calibration must be measured on the deployment distribution.

### 3.2 Lin, Hilton, and Evans (2022) — "Teaching Models to Express Their Uncertainty in Words"

**Lin, Hilton, and Evans (2022, *Teaching Models to Express Their Uncertainty in Words*, TMLR; arXiv:2205.14334).** Trained GPT-3 on arithmetic to emit **verbalized probabilities** ("90 % confident") and showed that the resulting verbalized numbers are **better-calibrated than the model's token-level logit probabilities** on out-of-distribution arithmetic. The paper coins the term "verbalized confidence" as a distinct calibration target and demonstrates it can outperform logit-based confidence specifically when the task distribution shifts away from training — relevant for 2nd-Brain, because every user's journal is its own distribution.

The caveat is dataset-specific: this is arithmetic, not free-form natural-language reasoning. The follow-up work in §3.3–§3.4 extends to broader tasks but the gap is real.

### 3.3 Tian et al. (2023) — "Just Ask for Calibration"

**Tian, Mitchell, Zhou, Sharma, Rafailov, Yao, Finn, Manning (2023, *Just Ask for Calibration: Strategies for Eliciting Calibrated Confidence Scores from Language Models Fine-Tuned with Human Feedback*, EMNLP 2023; arXiv:2305.14975).** This is the most directly applicable paper for the 2nd-Brain deployment posture (RLHF'd closed-source LLMs through API). Their headline result:

> "Verbalized probabilities from RLHF-LMs are often better-calibrated than the model's conditional probabilities (token logits) across a range of question-answering tasks, and across multiple model families."

Concretely: for GPT-3.5 / GPT-4 / Claude, **asking the model "what is your confidence (0–100 %)?" produces lower ECE than reading the token logit of the answer**, on TriviaQA / SciQ / TruthfulQA. They also catalogue prompting strategies (top-k confidence, chain-of-thought + confidence, sampling-and-aggregation) and benchmark them on ECE.

For 2nd-Brain this is the key license: if Gemini behaves like its RLHF peers, verbalized confidence in the JSON schema is a credible primary signal — but the deployment-distribution calibration must be measured (next section).

### 3.4 Xiong et al. (2024) — Empirical evaluation of confidence elicitation

**Xiong, Hu, Lu, Li, Fu, He, Hooi (2024, *Can LLMs Express Their Uncertainty? An Empirical Evaluation of Confidence Elicitation in LLMs*, ICLR 2024; arXiv:2306.13063).** Systematic comparison of three families of confidence-elicitation methods across multiple LLMs and tasks:

- **Verbalized** (the model just says a number).
- **Consistency-based** (sample N answers, use agreement as the score — see §5).
- **Hybrid** (verbalized + consistency reweighted).

Findings most relevant to 2nd-Brain:

1. **Verbalized confidence alone tends to be over-confident** — the model says "90 %" too often when it is wrong, particularly on hard tasks.
2. **Consistency-based methods dominate verbalized on calibration metrics** (lower ECE, better AUROC for selective prediction).
3. **Hybrid methods do best.** Specifically, sample several answers and use both the verbalized confidence and the inter-sample agreement, then combine.

This is the empirical case for the §5 self-consistency pattern in 2nd-Brain: when latency and cost allow it, sample the LLM N times and use agreement as part of the confidence signal, not just the model's spoken confidence.

### 3.5 Geng et al. (2024) — Survey

**Geng, Cai, Wang, Koeppel, Petersen, Heck, Tresp, Lyu (2024, *A Survey of Confidence Estimation and Calibration in Large Language Models*, NAACL 2024; arXiv:2311.08298).** The current canonical survey. Three-axis taxonomy of methods:

- **Logit-based** (e.g., perplexity, max-token probability, P(True) following Kadavath).
- **Consistency-based** (sample-and-vote, self-consistency, SelfCheckGPT — see §5).
- **Verbalized** (ask the model, with or without chain-of-thought).
- (Plus emerging: **supervised / probe-based**, training a small head on internal states. Not applicable to closed-source Gemini.)

The survey's headline operational guidance — and the most useful single sentence for 2nd-Brain's design — is that no single method dominates across tasks and models; **hybrid pipelines that combine at least two of the three signals are the current state of the art**.

### 3.6 Detommaso et al. (2024) — Multicalibration

**Detommaso, Bertran, Fogliato, Roth (2024, *Multicalibration for Confidence Scoring in LLMs*, ICML 2024; arXiv:2404.04689).** Extends the multicalibration framework (Hébert-Johnson, Kim, Reingold, Rothblum 2018) to LLM confidence: requires the confidence score to be calibrated **not only marginally but within every identifiable subgroup of inputs** (e.g., short prompts vs. long prompts, English vs. Korean, factual vs. opinion). The paper demonstrates that marginally-calibrated LLM confidence is often *not* subgroup-calibrated — a card type or user cohort that looks well-calibrated in aggregate can be badly miscalibrated within.

This is the formal underpinning for evaluating calibration *per card type and per language* in the Golden Set, not as a single ECE number.

### 3.7 Yin et al. (2023) — "Do LLMs Know What They Don't Know?"

**Yin, Sun, Guo, Wu, Huang, Qiu (2023, *Do Large Language Models Know What They Don't Know?*, ACL Findings 2023; arXiv:2305.18153).** Built **SelfAware**, a 1,032-question benchmark including known-answerable and known-unanswerable questions, and evaluated whether LLMs can recognize the unanswerable ones. Key result: even the best instruction-tuned LLMs of 2023 (GPT-3.5, GPT-4 partial) leave a **substantial gap to the human upper bound** at recognizing unanswerability — and smaller models are dramatically worse. The "insufficient" tier of the 2nd-Brain confidence field is exactly this capability; the Yin benchmark is the prior art for measuring it.

### 3.8 Wen et al. (2024) — "The Art of Saying No"

**Wen, Wang, Sclar, Wadden, Lu, Smith, Suhr, Jia (2024, *The Art of Saying No: Contextual Noncompliance in Language Models*, NeurIPS 2024 Datasets and Benchmarks; arXiv:2407.12043).** Constructs a taxonomy of contexts in which an LLM *should* refuse to comply — including "I don't have enough information," "this is outside my knowledge," "the request is ambiguous." Evaluates open and closed LLMs on a benchmark of 1,000+ prompts and finds compliance / refusal behavior is **inconsistent across the taxonomy categories** and not well-controlled by safety training.

For 2nd-Brain the relevance is the *contextual* part: "insufficient" should fire when a journal entry is too short to support a Big-Five inference, too ambiguous to coerce into a narrative, etc. Wen et al. is the evidence base that this is a measurable and learnable behavior, not a side effect of RLHF.

---

## 4. Verbalized vs Sampling-Based vs Logit-Based Confidence

The three families from §3 condensed into a decision table that maps onto 2nd-Brain's deployment posture (Gemini via `@google/genai`; mock mode in tests; per-call `ai_audit_log` row).

### 4.1 Side-by-side

| Family | Mechanism | Pros | Cons | Applies to Gemini API? |
|---|---|---|---|---|
| **Logit-based** | Read token-level P(answer) or max-token prob; apply Guo-style temperature scaling on a held-out set. | Cheap (one forward pass). Mathematically grounded. | Requires logit / logprob access; values reflect token-level uncertainty, not answer-level reasoning uncertainty. RLHF distorts logits (Tian 2023). | Partial — Gemini API exposes `avgLogprobs` / `logprobs` only on some endpoints; not always reliable. |
| **Verbalized** | Prompt the model to emit a 0–100 % confidence number in the JSON schema. | Works on any API. Picks up reasoning-level uncertainty. RLHF'd models often emit better-calibrated verbalized than logit probabilities (Tian 2023). | Single-sample; tends to over-confidence (Xiong 2024). Sensitive to prompt phrasing (Sclar 2024, cross-referenced in `llm-agnostic-design.md` §2.3). | Yes — JSON schema can require a `confidence_pct` field. |
| **Sampling / consistency** | Sample N answers (temperature > 0, or N independent calls); use inter-sample agreement / variance as the score. | Best calibration in Xiong 2024. Catches reasoning-path instability that logits miss. | Cost scales linearly in N. Latency cost. | Yes — just N calls. |
| **Hybrid** | Combine verbalized + consistency (and logit where available). | State of the art per Geng 2024 survey. | All of the above cons. Requires per-card-type weighting. | Yes. |

### 4.2 Recommendation for 2nd-Brain (Gemini deployment)

Given that 2nd-Brain promises $0/month free-tier (blueprint §5) and Gemini's API behavior with logits is partial/inconsistent, the recommendation is:

1. **Primary signal: verbalized confidence in the JSON schema.** Every analysis card carries a `confidence_pct` field (0–100), which then maps to `high` (≥80), `medium` (50–79), `low` (30–49), `insufficient` (<30 OR explicit "insufficient" tier from the schema).
2. **Secondary signal: sampling-based agreement** — but only for high-stakes card types (signals routed into Engine 2 with weight > w_threshold) and only when within the Golden Set evaluation, not on every user call (cost). This is exactly the design space Xiong 2024 maps; the Golden Set protocol (§7) is where the hybrid pays off without eating the runtime budget.
3. **Logit-based: not used in production.** Gemini API consistency is insufficient to bet a metric on; if a future release exposes stable logprobs, revisit.

This is consistent with Tian 2023's finding that verbalized confidence on RLHF'd models often beats logit-based on calibration; the asymptotic improvement from sampling per Xiong 2024 is bought back in the Golden Set, not on every entry.

---

## 5. Self-Consistency as a Confidence Proxy

Two specific results in this family are worth pinning down because they are the methodological license for the sampling pattern recommended in §4.2.

### 5.1 Wang et al. (2022) — Self-Consistency

**Wang, Wei, Schuurmans, Le, Chi, Narang, Chowdhery, Zhou (2023, *Self-Consistency Improves Chain of Thought Reasoning in Language Models*, ICLR 2023; arXiv:2203.11171).** Sample multiple chain-of-thought reasoning paths at non-zero temperature; take the majority-vote answer. Across arithmetic, commonsense, and symbolic reasoning benchmarks, self-consistency improves accuracy substantially over greedy CoT (e.g., +17.9 pp on GSM8K with PaLM-540B). The implicit claim — and the one Xiong 2024 makes explicit — is that the *agreement rate* across samples is itself a calibrated proxy for correctness probability: when 9/10 samples agree, the model is usually right; when 4/10 agree, it usually is not.

### 5.2 Manakul, Liusie, and Gales (2023) — SelfCheckGPT

**Manakul, Liusie, Gales (2023, *SelfCheckGPT: Zero-Resource Black-Box Hallucination Detection for Generative Large Language Models*, EMNLP 2023; arXiv:2303.08896).** Black-box hallucination detection without any external knowledge base or logit access: sample multiple responses, score consistency of factual claims across them, flag low-consistency claims as hallucinations. AUC-PR for hallucination detection is competitive with grey-box methods that *do* read logits.

For 2nd-Brain, SelfCheckGPT is the operational template for the §4.2 step-2 sampling check: when an Engine-2 inference is flagged as "high confidence," the Golden Set evaluation samples it N times and computes a SelfCheckGPT-style inconsistency score. Cards where the consistency score disagrees with the verbalized confidence are exactly the cards that mis-calibrate the system.

---

## 6. Implications for 2nd-Brain (mapped to v0.2 sections)

Concrete, testable design recommendations from the foregoing literature. Numbered in continuation of the convention in `llm-agnostic-design.md` but scoped only to calibration.

| # | Recommendation | Cited evidence | Where it lands in v0.2 |
|---|---|---|---|
| C1 | The confidence field on every analysis card is a **verbalized probability** emitted by the LLM in the JSON schema (`confidence_pct ∈ [0,100]`), not a heuristic computed on the surface. | Tian 2023; Lin 2022; Kadavath 2022 | §02 Layer 1 schema |
| C2 | The four-tier label (`high / medium / low / insufficient`) is a deterministic function of `confidence_pct` and an explicit "insufficient" override slot; thresholds are versioned alongside the prompt. | Sclar 2024 (cross-ref); Yin 2023; Wen 2024 | §02 Layer 1; prompt template |
| C3 | "Insufficient" is a first-class tier — not the bottom of the confidence scale. It fires when the model cannot ground the inference in retrieved snippets, when the entry is too short, or when the model emits an explicit refusal. Measured separately from miscalibration. | Yin 2023; Wen 2024 | §02 Layer 1 routing |
| C4 | Calibration is **measured on the Golden Set** using ECE (M=10 bins, Guo 2017) and Brier score; reliability diagrams are rendered to the dashboard. | Brier 1950; Guo 2017; DeGroot & Fienberg 1983 | §08 dashboard |
| C5 | Calibration is measured **per card type** (signal vs. pattern vs. category roll-up) and **per language** (EN, KO) — not just marginally. | Detommaso 2024 (multicalibration) | §08 dashboard; §07 i18n |
| C6 | High-stakes inferences (those that enter Engine 2 with weight > w_threshold) get a **secondary sampling-based check** at Golden Set evaluation time: N samples, SelfCheckGPT-style inconsistency score, flag cards where verbalized confidence disagrees with sample agreement. | Wang 2022 / 2023; Manakul 2023; Xiong 2024 | §08 Golden Set extension |
| C7 | Logit-based calibration (Guo-style temperature scaling) is **not used in production** because Gemini API logprob exposure is inconsistent; it is held as a fallback for any future model where logprobs are stable. | Guo 2017; Geng 2024 survey | §02 (decision, not artifact) |
| C8 | Every Gemini call writes its `confidence_pct`, derived tier, and (for Golden Set runs) the sample-agreement score to `ai_audit_log` so we can compute ECE / Brier offline. (Constraint C3 already requires the row; this just adds fields.) | Operational consequence | `ai_audit_log` schema + constraint C3 |
| C9 | Mock mode and crisis short-circuit (constraints C3, C9) also emit a confidence field, even though it is constant — so downstream consumers never branch on the field's *presence*, only on its value. | Operational consequence | §02; safety lexicon path |

---

## 7. Recommended Validation Protocol (Golden Set extension)

This section is the operational protocol that turns §6 into a release gate. It extends the Golden Set Protocol described in `llm-agnostic-design.md` §2 and v0.2 §08; it does not replace it.

### 7.1 What the Golden Set carries for calibration

For each item in the Golden Set:

- A synthetic user input (per existing protocol).
- A **gold label** at signal / pattern / category granularity (per existing protocol).
- A **gold confidence band**: the human-coded answer to "given this input, what is the maximum responsible confidence?" — e.g., for a deliberately ambiguous entry, the gold band caps at `medium`; for a deliberately information-free entry, the gold tier is `insufficient`.

The gold confidence band is what makes mis-calibration *detectable*. Without it, "the model said 90 % and was wrong on item X" looks like noise; with it, "the model said 90 % on an item the gold band caps at medium" is a calibration failure.

### 7.2 Metrics computed each run

Per LLM vendor (GPT-4-class, Claude-class, Gemini-class), per language (EN, KO), per card type (signal, pattern, category):

1. **Brier score** of `confidence_pct / 100` against the binary `correct?` outcome.
2. **ECE** with M=10 bins, per Guo 2017.
3. **Reliability diagram** plotted.
4. **Insufficient-tier recall**: of items where the gold tier is `insufficient`, what fraction did the model also mark `insufficient`? (Yin 2023's SelfAware metric translated to 2nd-Brain's taxonomy.)
5. **Insufficient-tier precision**: of items the model marked `insufficient`, what fraction were genuinely insufficient? (Avoids the "model just refuses everything" failure.)
6. **For high-stakes card types only**: sample N=5 times, compute SelfCheckGPT-style inconsistency, report the correlation between `1 − inconsistency` and `confidence_pct / 100`. A correlation < 0.4 means the verbalized confidence and the sample-agreement disagree systematically — investigate.

### 7.3 Release-gate thresholds (initial; reviewable each retro)

These thresholds are **starting points** anchored to the published literature; they will move as we accumulate Golden Set data. Reviewable per quarterly retro per project policy.

| Metric | Initial gate | Source / justification |
|---|---|---|
| **Brier score** (signal-level, EN) | ≤ 0.20 | Roughly the upper end of "useful" probabilistic forecasts in the meteorology / medical-decision literature (Brier 1950 successors). Above 0.25, the score is no better than always predicting the marginal base rate. |
| **ECE** (10-bin, signal-level, EN) | ≤ 0.10 | The "well-calibrated" band in Guo 2017 Fig. 1 / Table 1. Modern post-hoc-calibrated deep networks routinely hit ECE < 0.05; we set 0.10 to leave headroom for LLM-API drift (Chen 2023, cross-ref) and keep the gate achievable on the v0.2 Golden Set size. |
| **ECE per subgroup** (per card type × language) | ≤ 0.15 | Multicalibration loosens marginal targets per subgroup (Detommaso 2024). |
| **Insufficient-tier recall** | ≥ 0.70 | Below the human upper bound but well above the GPT-3.5-class baseline reported by Yin 2023 (~0.5). Tightens over time. |
| **Insufficient-tier precision** | ≥ 0.80 | Prevents the failure mode where the model refuses everything to game recall. |
| **Verbalized-vs-consistency correlation** (high-stakes card types) | ≥ 0.40 | Below this, the two signals disagree systematically; falls back to per-card investigation. |

Any subgroup breaching its gate is a release-blocker for that subgroup (i.e., we can ship EN while we fix KO; we can ship signal-level confidence while we hold pattern-level rollups).

### 7.4 Cost vs accuracy

The sampling-based secondary signal (step §7.2 metric 6) is the only metric that scales call cost linearly. The design is to run it **only** at Golden Set evaluation time (not on every user call) and **only** on high-stakes card types. Concretely: if the Golden Set is ~200 items, the sampling check costs ~1000 Gemini calls per release — a one-off cost, far below the free-tier budget, and orthogonal to per-user runtime cost.

Verbalized confidence (the primary signal) has **zero additional cost** over the existing call: it is an extra field in the JSON output the model is already emitting. The free-tier promise (blueprint §5) is therefore preserved at runtime; calibration measurement is a release-time activity.

### 7.5 What this does *not* claim

This protocol verifies that the *confidence field is calibrated as a probabilistic forecast of label correctness on the Golden Set distribution*. It does not, by itself:

- Verify that the labels themselves are valid as psychological constructs (that is the role of the psychology batches; see `docs/research/CLAUDE.md`).
- Verify cross-LLM agreement of the label (that is the kappa / Krippendorff-α track in `llm-agnostic-design.md`).
- Verify safety routing (that is the `crisis-detection.md` / safety lexicon track).

These are separate measurement axes that the Golden Set carries in parallel; calibration is one of four.

---

## 8. Gaps and Limitations

**Gaps identified during this batch (May 2026 session):**

1. **No verified Gemini-specific calibration study at the depth of Tian 2023.** Tian 2023 covers GPT-3.5, GPT-4, Claude-class; the *finding* that RLHF'd verbalized confidence beats logit-based is reasonable to expect for Gemini given its RLHF training, but it is an extrapolation, not a direct citation. The Golden Set must measure it on Gemini directly before we can claim parity.
2. **No verified Korean-language LLM calibration study at the depth of Xiong 2024 or Tian 2023.** This mirrors the same gap flagged in `llm-agnostic-design.md` §7 (Korean LLM-as-coder κ) and in `computational-personality.md` (Korean LLM trait extraction). The KO subgroup gate (§7.3) is therefore initial — likely to need adjustment after the first Golden Set runs.
3. **Multicalibration in production at our scale.** Detommaso 2024's full multicalibration algorithm assumes more eval data than v0.2's initial Golden Set will carry. We implement *per-subgroup ECE reporting* (the diagnostic half of multicalibration) immediately; full multicalibrated post-hoc adjustment is a v0.3 candidate, not a v0.2 requirement.
4. **No verified standalone "insufficient-tier" benchmark for journaling-style ambiguous inputs.** Yin 2023 (SelfAware) is the closest prior art and is question-answering, not journaling. We extend Yin's protocol by hand-coding the "insufficient" tier of the Golden Set; this is novel methodological work, not pre-existing evidence.

**Not duplicated here (see linked sources):**

- Cross-LLM kappa / Krippendorff-α agreement on the Golden Set → `llm-agnostic-design.md` §5.
- LLM-as-classifier vs. LLM-as-evaluator framing → `llm-agnostic-design.md` §1.
- RAG faithfulness scoring (RAGAS) on Engine 2 outputs → `llm-agnostic-design.md` §3.4.
- Crisis-detection routing thresholds (different evidence base, different metric) → `docs/research/batches/crisis-detection.md`.
- Psychological-construct validity of the labels themselves → `docs/research/batches/computational-personality.md`, `big-five.md`, etc.

---

## Bibliography

Listed in citation order within sections; venue and DOI / arXiv ID verified during this session.

**§2 — Foundational calibration**

- Brier, G. W. (1950). Verification of forecasts expressed in terms of probability. *Monthly Weather Review*, 78(1), 1–3. DOI: 10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2
- DeGroot, M. H., & Fienberg, S. E. (1983). The comparison and evaluation of forecasters. *The Statistician*, 32(1/2), 12–22. DOI: 10.2307/2987588
- Niculescu-Mizil, A., & Caruana, R. (2005). Predicting good probabilities with supervised learning. *Proceedings of the 22nd International Conference on Machine Learning (ICML 2005)*, 625–632. DOI: 10.1145/1102351.1102430
- Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017). On calibration of modern neural networks. *Proceedings of the 34th International Conference on Machine Learning (ICML 2017)*. arXiv: 1706.04599

**§3 — LLM-specific calibration**

- Kadavath, S., Conerly, T., Askell, A., Henighan, T., Drain, D., Perez, E., … Kaplan, J. (2022). Language models (mostly) know what they know. arXiv: 2207.05221
- Lin, S., Hilton, J., & Evans, O. (2022). Teaching models to express their uncertainty in words. *Transactions on Machine Learning Research (TMLR)*. arXiv: 2205.14334
- Tian, K., Mitchell, E., Zhou, A., Sharma, A., Rafailov, R., Yao, H., Finn, C., & Manning, C. D. (2023). Just ask for calibration: strategies for eliciting calibrated confidence scores from language models fine-tuned with human feedback. *Proceedings of EMNLP 2023*. arXiv: 2305.14975
- Xiong, M., Hu, Z., Lu, X., Li, Y., Fu, J., He, J., & Hooi, B. (2024). Can LLMs express their uncertainty? An empirical evaluation of confidence elicitation in LLMs. *International Conference on Learning Representations (ICLR 2024)*. arXiv: 2306.13063
- Geng, J., Cai, F., Wang, Y., Koeppel, H., Petersen, F., Heck, L., Tresp, V., & Lyu, S. (2024). A survey of confidence estimation and calibration in large language models. *Proceedings of NAACL 2024*. arXiv: 2311.08298
- Detommaso, G., Bertran, M., Fogliato, R., & Roth, A. (2024). Multicalibration for confidence scoring in LLMs. *Proceedings of the 41st International Conference on Machine Learning (ICML 2024)*. arXiv: 2404.04689
- Yin, Z., Sun, Q., Guo, Q., Wu, J., Huang, X., & Qiu, X. (2023). Do large language models know what they don't know? *Findings of the Association for Computational Linguistics: ACL 2023*. arXiv: 2305.18153
- Wen, B., Wang, X., Sclar, M., Wadden, D., Lu, X., Smith, N. A., Suhr, A., & Jia, R. (2024). The art of saying no: contextual noncompliance in language models. *NeurIPS 2024 Datasets and Benchmarks Track*. arXiv: 2407.12043

**§5 — Self-consistency as a confidence proxy**

- Wang, X., Wei, J., Schuurmans, D., Le, Q., Chi, E., Narang, S., Chowdhery, A., & Zhou, D. (2023). Self-consistency improves chain of thought reasoning in language models. *International Conference on Learning Representations (ICLR 2023)*. arXiv: 2203.11171
- Manakul, P., Liusie, A., & Gales, M. J. F. (2023). SelfCheckGPT: zero-resource black-box hallucination detection for generative large language models. *Proceedings of EMNLP 2023*. arXiv: 2303.08896

---

*Methodology file version: 1.0 · Created: 2026-05-27 KST · Owner: Simon · Aligned with `~/.claude/skills/simon-research` verification policy.*
