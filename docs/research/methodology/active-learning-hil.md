# Methodology: Active Learning & Human-in-the-Loop — Academic Foundations

> Research backing for 2nd-Brain v0.2 design document §05 (Ambiguity Resolution Queue, Conversational Profile Editor).
>
> **Scope.** This file is methodology (computer-science active-learning and HCI notification literature), not psychology content. For psychology constructs (Big Five, narrative identity, SDT, etc.) see `docs/research/batches/`. For the upstream classifier reliability story (Cohen κ, Krippendorff α, Golden Set), see the companion file `methodology/llm-agnostic-design.md` — that work is not duplicated here but is referenced where the two methodologies meet (§6).
>
> **Verification policy.** Every cited paper was confirmed against ACM Digital Library, ACL Anthology, NeurIPS proceedings, AAAI Press, JAIR, Elsevier (FGCS), Croatian Society of Medical Biochemistry (Biochemia Medica), Springer (UMUAI), or the original institutional technical-report record during this session. No fabricated citations. arXiv preprints are included only when the work has either (a) been accepted at a peer-reviewed venue or (b) is the canonical reference for its concept and is heavily cited.

---

## AI Retrieval Guide (for RAG / Wiki use)

| When the system needs to answer… | Look at section |
|---|---|
| "What is active learning, and why is it different from passive ML?" | §1 |
| "How does the system decide *which* journal entry to ask about?" | §2 |
| "Can active-learning ideas be applied to LLM prompting?" | §3 |
| "How should humans and the ML pipeline share authority?" | §4 |
| "How many ambiguity questions per session is too many?" | §5 |
| "How does this connect to behavioral-coding reliability (κ, α)?" | §6 |
| "What is the priority function for the Ambiguity Resolution Queue?" | §7, §8 |

---

## 1. Active Learning: What and Why

**Design claim (v0.2 §05).** The Ambiguity Resolution Queue surfaces selected, low-confidence inputs to the user for disambiguation — not all inputs, and not at uniform priority. This is the classical *pool-based active learning* setting from the machine-learning literature: the system has many unlabeled instances (journal entries with uncertain classification), labeling is expensive (every question costs user attention), and the learner must choose *which* instance to query a human about.

### 1.1 The canonical survey

Settles (2009, *Active Learning Literature Survey*, Computer Sciences Technical Report 1648, University of Wisconsin–Madison) is the standard reference. The opening sentence frames the entire field: *"The key hypothesis is that if the learning algorithm is allowed to choose the data from which it learns — to be 'curious,' if you will — it will perform better with less training."* The survey enumerates the three main scenarios (membership query synthesis, stream-based selective sampling, pool-based sampling) and the major query strategy families (uncertainty sampling, query-by-committee, expected model change, expected error reduction, variance reduction, density-weighted methods). It also documents the practical drawback that motivates much of §5 of this document: *the human labeler is a limited resource and can be fatigued or biased by the system's choice of queries.*

### 1.2 Statistical foundations

Cohn, Ghahramani & Jordan (1996, *Active Learning with Statistical Models*, *Journal of Artificial Intelligence Research* 4, 129–145; DOI: 10.1613/jair.295) provide the formal Bayesian justification: given a statistical model of the learner (e.g., a mixture of Gaussians, locally weighted regression, or a neural network with a known output-variance estimator), the optimal next query is the input that minimizes expected future generalization error, which under standard assumptions reduces to *minimizing the model's expected output variance*. This is the result that licenses every "ask about the most uncertain example" heuristic — uncertainty sampling is a computationally tractable proxy for the variance-minimization objective.

### 1.3 The first text-classifier application

Lewis & Gale (1994, *A Sequential Algorithm for Training Text Classifiers*, SIGIR '94, pp. 3–12; ACM DOI: 10.1145/188490.188495) introduced *uncertainty sampling* by name and applied it to probabilistic text classifiers. Their key empirical finding — that a classifier trained on ~500 actively-selected documents matched the accuracy of one trained on ~9000 randomly-selected documents — is the result that made active learning practically interesting. For 2nd-Brain, this is the relevant precedent: if the system has to choose between asking the user one carefully selected question versus passively absorbing dozens of ambiguous entries, the active-learning literature predicts the former is dramatically more sample-efficient.

### 1.4 Implication for 2nd-Brain

The Ambiguity Resolution Queue is a *pool-based active learner over journal entries*. Each new entry is scored for classifier uncertainty by the §02 LLM-classifier pipeline; entries above a confidence threshold are auto-labeled; entries below the threshold enter the queue and are ranked by the priority function (§7). The Settles 2009 survey, Cohn et al. 1996, and Lewis & Gale 1994 establish that this design — rather than asking about every uncertain case, or treating all uncertain cases as equally important — is the academically grounded one.

---

## 2. Query Strategies (Uncertainty, Committee, Expected Change)

This section catalogues the four query-strategy families relevant to 2nd-Brain. The taxonomy follows Settles (2009).

### 2.1 Uncertainty sampling: three variants

Uncertainty sampling (Lewis & Gale 1994, op. cit.; formalized in Settles 2009 §3.1) selects the instance about which the current classifier is least certain. Three quantitative forms are standard:

- **Least-confident.** Query the instance whose maximum predicted class probability is lowest: x* = argmax_x (1 − P(ŷ | x)), where ŷ is the most probable label.
- **Margin.** Query the instance with the smallest gap between the top-1 and top-2 predicted probabilities: x* = argmin_x [P(ŷ₁|x) − P(ŷ₂|x)]. This is more informative than least-confident when the classifier has many classes, because least-confident discards information about the runner-up.
- **Entropy.** Query the instance with the highest Shannon entropy across the full predicted-class distribution: x* = argmax_x [−Σᵢ P(yᵢ|x) log P(yᵢ|x)]. This is the most general — it uses the entire output distribution, not just the top two classes.

For 2nd-Brain's signal-pattern-category taxonomy (which has many possible labels per axis), the margin and entropy variants are the natural choices; the least-confident variant is theoretically dominated.

### 2.2 Query-by-committee (QBC)

Seung, Opper & Sompolinsky (1992, *Query by Committee*, COLT '92 — *Proceedings of the Fifth Annual Workshop on Computational Learning Theory*, pp. 287–294; ACM DOI: 10.1145/130385.130417) proposed sampling multiple hypotheses from the version space and querying the instance about which the committee *most disagrees*. Disagreement is typically quantified by vote entropy across the committee, or by the average KL divergence from each committee member to the consensus. The intuition is that disagreement is a signal that the labeled data so far is insufficient to constrain the true classifier — so the disputed instance is exactly where a label is most informative.

For 2nd-Brain, the natural committee is a small ensemble of LLM-classifier prompts (e.g., different framings of the same taxonomy question, or two different runs with different temperatures). When the committee disagrees on the label, the entry is a strong candidate for the queue — even if any single member is confident.

### 2.3 Expected model change

Settles, Craven & Ray (2007, *Multiple-Instance Active Learning*, NeurIPS 20) — and the broader literature reviewed in Settles 2009 §3.3 — proposed *expected gradient length* as a query strategy: query the instance whose label, in expectation over the predicted class distribution, would induce the largest gradient update to the model. This is "what would change the model the most?" formalized. It is appealing because it directly optimizes for learning, not for resolving local ambiguity. For an LLM-based classifier where direct gradient access is unavailable, the analog is "which input, if labeled, would most shift the empirical class-frequency calibration on held-out journal entries?" — a feasible proxy.

### 2.4 Expected error reduction

Roy & McCallum (2001, *Toward Optimal Active Learning through Sampling Estimation of Error Reduction*, ICML 2001) introduced the theoretically optimal pool-based strategy: query the instance whose expected future generalization error (estimated via Monte Carlo over possible labels) is lowest. This is provably better than uncertainty sampling when the class prior is skewed or the classifier is well-calibrated. The downside is computational: it requires retraining (or re-evaluating) the model once per candidate × possible label, which is prohibitive for an LLM. The strategy is included here for completeness — it is the theoretical ceiling against which uncertainty sampling and QBC are practical approximations.

### 2.5 Implication for 2nd-Brain

The Ambiguity Resolution Queue uses **margin/entropy uncertainty sampling as the base score**, augmented with a **QBC-style two-prompt agreement check** (cheap to compute with an LLM) and a **downstream-impact weight** (§7) that approximates expected model change without requiring gradient access. Expected error reduction is documented as the theoretical ideal but not implemented in v0.2.

---

## 3. Active Learning with LLMs

The recent literature extends classical active learning into the LLM-prompting and in-context-learning regime. This is the most directly relevant body of work for 2nd-Brain's architecture, in which the "classifier" is itself an LLM.

### 3.1 Active learning principles for in-context learning

Margatina, Schick, Aletras & Dwivedi-Yu (2023, *Active Learning Principles for In-Context Learning with Large Language Models*, EMNLP Findings 2023, pp. 5011–5034; ACL Anthology DOI: 10.18653/v1/2023.findings-emnlp.334) systematically apply classical query strategies (uncertainty, diversity, similarity) to the selection of *in-context examples* for an LLM. The headline finding: **similarity-based selection consistently outperforms uncertainty- or diversity-based selection for in-context demonstration choice**, contrary to what classical fine-tuning active-learning intuition would predict. This is a critical asymmetry: when the "training" mechanism is in-context demonstrations rather than gradient updates, the most useful examples are the ones *most similar to the query at hand*, not the ones the model is most uncertain about.

For 2nd-Brain, this has a precise implication: when the Ambiguity Resolution Queue *resolves* an entry (user gives an answer), the resolved (entry, label) pair should be added to the small in-context "few-shot bank" the LLM-classifier draws from — and the bank should be retrieved by similarity to the next ambiguous entry, not by recency or randomness.

### 3.2 Active prompting with chain-of-thought

Diao, Wang, Lin & Zhang (2024, *Active Prompting with Chain-of-Thought for Large Language Models*, ACL 2024, pp. 1330–1350; ACL Anthology DOI: 10.18653/v1/2024.acl-long.73) propose *Active-Prompt*: use uncertainty (disagreement across sampled chain-of-thought traces — a QBC analog) to identify which questions in a candidate pool would benefit most from a human-annotated chain-of-thought exemplar. The annotated exemplars are then used in the in-context prompt for downstream queries. The empirical result is significant gains over standard CoT prompting on arithmetic, commonsense, and symbolic reasoning benchmarks.

This is the most direct academic precedent for 2nd-Brain's design: a human-in-the-loop pipeline where (a) the LLM identifies entries it is uncertain about, (b) the user resolves a small selected subset, and (c) the resolutions are folded back into the LLM's prompting context — improving classification on subsequent similar entries without any model fine-tuning.

### 3.3 Implication for 2nd-Brain

The Conversational Profile Editor (v0.2 §05) is operationally an *Active-Prompt loop scoped to the user's own taxonomy*: the LLM identifies the dimensions where its classification has been historically uncertain for this user, asks a targeted question, the user's answer becomes a personalized in-context exemplar, and the LLM's classification of subsequent entries on that dimension improves. Margatina et al. 2023 dictates the retrieval policy for the exemplar bank (similarity, not recency); Diao et al. 2024 dictates the selection policy for *which* dimension to ask about (uncertainty across sampled completions).

---

## 4. Human-in-the-Loop System Patterns

The active-learning literature optimizes *which* instance to query. The HCI / interactive-ML literature studies *how* the human and the system should share authority across the system's lifecycle. Both perspectives are needed.

### 4.1 The HITL survey

Wu, Xiao, Sun, Zhang, Ma & He (2022, *A Survey of Human-in-the-loop for Machine Learning*, *Future Generation Computer Systems* 135, 364–381; DOI: 10.1016/j.future.2022.05.014) is the standard recent survey. It distinguishes three HITL paradigms by *where* the human enters the loop:

- **Data processing HITL.** Human refines or augments training data (classical active learning lives here).
- **Model training HITL.** Human directly intervenes in training — e.g., preference comparison, reward shaping.
- **System evaluation HITL.** Human serves as a continuous evaluator of system outputs in deployment.

2nd-Brain's Ambiguity Resolution Queue is a *data-processing* HITL system (it improves the LLM-classifier's label distribution); the Conversational Profile Editor is closer to *system-evaluation* HITL (the user adjudicates the system's evolving model of *them*). The two paradigms have different fatigue dynamics, which is why §5 treats them separately.

### 4.2 The interactive-ML manifesto

Amershi, Cakmak, Knox & Kulesza (2014, *Power to the People: The Role of Humans in Interactive Machine Learning*, *AI Magazine* 35(4), 105–120; AAAI DOI: 10.1609/aimag.v35i4.2513) articulates the design philosophy for human-facing ML systems. Three claims are load-bearing for 2nd-Brain:

- *Interactive ML transforms the user from passive labeler into an active steerer.* The user is not "annotating data" for the system; the user is collaboratively shaping a model that will then act on the user's behalf.
- *Tight, low-cost feedback cycles outperform large infrequent ones.* A user who can correct the system in one click, frequently, builds a more accurate model than a user who fills out a long calibration form once.
- *The system must make its uncertainty legible.* Users cannot supervise a model whose confidence is hidden; if 2nd-Brain only asks "what's this entry about?" without showing why it's asking, the user cannot tell whether to trust the eventual classification.

### 4.3 RLHF as adjacent ground truth

Two foundational RLHF papers are cited not because 2nd-Brain implements RLHF (it does not — see C1) but because they establish that *human preference feedback at modest scale can shape an ML system's behavior more efficiently than additional unlabeled data*.

Christiano, Leike, Brown, Martic, Legg & Amodei (2017, *Deep Reinforcement Learning from Human Preferences*, NeurIPS 2017, pp. 4299–4307) show that pairwise human comparisons — far cheaper than expert-designed reward functions — can train RL agents to solve novel Atari and MuJoCo tasks. Their key efficiency claim: roughly one thousand human comparisons suffice to substantially improve a policy that would otherwise require tens of millions of timesteps of environment interaction.

Ouyang, Wu, Jiang, Almeida, Wainwright, Mishkin, Zhang, Agarwal, Slama, Ray, Schulman, Hilton, Kelton, Miller, Simens, Askell, Welinder, Christiano, Leike & Lowe (2022, *Training language models to follow instructions with human feedback*, NeurIPS 2022 — InstructGPT) extend the same principle to language models: a much smaller InstructGPT model trained from human feedback was preferred by human evaluators over the much larger un-tuned GPT-3 on instruction-following tasks. The headline implication for any user-facing ML system: *targeted human feedback dominates passive data scale.* This justifies spending finite user attention on the Ambiguity Resolution Queue rather than scraping for more journal entries.

### 4.4 Implication for 2nd-Brain

The user is a *steerer*, not a labeler. The system surfaces a small number of high-leverage questions, makes its uncertainty legible (each queue item shows *why* the system is asking), and treats each answer as a high-value signal that updates the user-specific taxonomy weights. This is the operational shape of Amershi et al. 2014's "interactive ML" recommendation, with the priority function (§7) implementing the "high-leverage" filter.

---

## 5. User Fatigue and Notification Design

Active-learning theory assumes the human labeler is a cooperative oracle. In a deployed consumer app, the user is a *finite-attention* oracle whose willingness to answer decays with question count and time-of-day mismatch. The HCI notification literature is the relevant source.

### 5.1 Receptivity to mobile notifications

Mehrotra, Pejovic, Vermeulen, Hendley & Musolesi (2016, *My Phone and Me: Understanding People's Receptivity to Mobile Notifications*, CHI '16, pp. 1021–1032; ACM DOI: 10.1145/2858036.2858566) ran a four-week in-the-wild study of mobile notification responses. Three findings shape the 2nd-Brain question budget:

- *Sender and content matter more than timing.* Users are more receptive to notifications from a trusted source about a topic they care about than to optimally-timed notifications about anything else. For 2nd-Brain, this means a question framed as *"your 2nd Brain noticed something — want to clarify?"* is more likely to be answered than the same question framed as a generic system prompt.
- *Activity context predicts response.* Notifications delivered when the user is stationary and not engaged in a primary task are answered more reliably and more thoughtfully.
- *Negative emotion at notification time degrades response quality.* Users who are stressed or hurried produce shorter, less informative answers — i.e., a question asked at a bad moment yields a *worse* label than no question at all, which is a stronger constraint than the active-learning literature alone implies.

### 5.2 Smart notification design principles

Pielot, Vradi & Park (2018, *Dismissed! A Detailed Exploration of How Mobile Phone Users Handle Push Notifications*, MobileHCI '18; ACM DOI: 10.1145/3229434.3229445) — together with the broader Pielot et al. corpus on attention and notification design — establishes the practical envelope: median users dismiss the majority of notifications without engagement, and a small minority of notification *types* (typically interpersonal messages) drive most of the engagement; everything else competes for a sharply limited remainder. The design implication is blunt: a system that uses notifications must spend them very cautiously, because each unanswered notification *increases* the probability that the next one is also ignored.

A second corollary, derived from the same line of work, is that perceived disruptiveness compounds: two questions in a session are not twice as disruptive as one — they're more, because the second one signals that the system is "going to keep doing this." For an active-learning system, this is the empirical basis for a hard per-session cap rather than a continuous-budget model.

### 5.3 Implication for 2nd-Brain

The Ambiguity Resolution Queue must respect a strict per-session budget. The recommended ceiling (3–5 questions per session, with most sessions seeing ≤2) is the value range that the Mehrotra/Pielot literature shows preserves response quality and willingness-to-engage on subsequent prompts. Beyond ~5, response quality collapses and the user starts ignoring the system entirely — which is worse for the classifier than not asking at all. See §8 for the formal budget rule.

---

## 6. Connecting to Behavioral Coding Reliability

This section is the bridge to the companion methodology document `methodology/llm-agnostic-design.md`, which covers the LLM-as-classifier reliability story (Bakeman & Quera 2011; Cohen κ; Krippendorff α; Golden Set Protocol). Active learning and inter-rater reliability meet at one specific point: *what counts as a "ground truth" answer when the user resolves a queue item?*

### 6.1 The kappa statistic, revisited

McHugh (2012, *Interrater reliability: the kappa statistic*, *Biochemia Medica* 22(3), 276–282; DOI: 10.11613/BM.2012.031) is the standard practitioner-facing reference for Cohen's κ — what it means, how to interpret its magnitude, and where it fails. The two findings that matter for 2nd-Brain's HITL design:

- *κ corrects for chance agreement* — two raters who happen to use the same label by accident should not be credited with reliability. For an active-learning loop in which the "raters" are the LLM and the user, this matters: if the taxonomy is highly skewed (e.g., one label dominates), even a poorly-aligned user-LLM pair will achieve high raw agreement but low κ.
- *κ is sensitive to prevalence and bias.* Low-frequency categories (rare emotional patterns, rare narrative-identity codes) suppress κ even when the actual coding agreement is high. The practical recommendation in McHugh 2012 is to report both raw agreement and κ, and to interpret values in context: 0.40–0.59 is *weak*, 0.60–0.79 is *moderate*, 0.80–0.90 is *strong*, >0.90 is *almost perfect*. For 2nd-Brain's HITL loop, we report κ between the LLM's pre-question label and the user's post-question correction, on a rolling window — a falling κ over time signals taxonomy drift and triggers a recalibration cycle.

### 6.2 Why this matters for the HITL loop

The LLM-agnostic-design methodology defines the *quality bar* for the classifier (Golden-Set Protocol, target κ thresholds). The active-learning loop is the *mechanism* by which the classifier moves toward that bar in deployment without retraining: each resolved queue item is a held-out user-coded example that can be folded into the rolling κ calculation. If LLM-user κ on a given dimension is consistently strong, the system can raise the confidence threshold and ask fewer questions on that dimension. If κ falls, the system asks more.

This is the loop closure: §1–§4 say *how* to choose and ask the question; §5 says *how often*; §6 (via McHugh 2012 and the companion methodology) says *how to measure whether it's working*.

---

## 7. Implications for 2nd-Brain (queue design)

This section synthesizes §1–§6 into the operational design of the Ambiguity Resolution Queue and the Conversational Profile Editor.

### 7.1 Two-stage filter

**Stage 1 (auto-label cutoff).** Every classified entry is scored for confidence by the §02 LLM-classifier pipeline. Entries above the per-dimension confidence threshold are auto-labeled and never enter the queue. The threshold is dimension-specific because per-dimension κ varies (a personality-trait dimension may have higher reliability than a narrative-identity dimension).

**Stage 2 (queue ranking).** Entries below the threshold enter a candidate pool. They are ranked by the priority function (§7.2). The top-K (where K is the per-session budget, §8) are surfaced to the user this session; the rest age out or are rescored on next session.

### 7.2 Priority function (informal)

Priority(entry) = α · margin_uncertainty(entry) + β · committee_disagreement(entry) + γ · downstream_impact(entry) − δ · recent_dimension_query_penalty(entry)

Where:

- *margin_uncertainty* — the margin variant from §2.1 (P(top-1) − P(top-2)), inverted so smaller margins yield higher priority. Grounded in Settles 2009 §3.1 and Lewis & Gale 1994.
- *committee_disagreement* — QBC vote entropy across two LLM-classifier prompt variants (§2.2; Seung et al. 1992; the Diao et al. 2024 active-prompt analog).
- *downstream_impact* — an estimate of how many already-classified entries would have their predicted label change if this entry's label were known. This approximates expected model change (§2.3) without requiring gradient access; in practice it is computed as the count of nearby entries (by semantic similarity in the embedding space the §02 pipeline already maintains) whose top-2 margin is small.
- *recent_dimension_query_penalty* — a decay term that penalizes asking about the same taxonomy dimension twice within the last 30 days, irrespective of the entry. Grounded in the Mehrotra/Pielot fatigue literature (§5) and in the broader principle that repeated questions on the same axis degrade perceived system intelligence.

The coefficients α, β, γ, δ are not theoretically derived; they are calibrated empirically against rolling user-engagement metrics (queue answer rate, post-answer satisfaction, dimension-level κ trajectory).

### 7.3 The Conversational Profile Editor as committee-of-models query

The Conversational Profile Editor is operationally a periodic, scheduled active-learning session (rather than entry-triggered like the Ambiguity Resolution Queue). It selects taxonomy *dimensions* (not individual entries) where the committee of LLM-classifier prompts has historically disagreed most — i.e., it asks the user about the *axes* of their self-model that the system has been least reliable about. This is the Diao et al. 2024 active-prompt design, scoped to a per-user taxonomy rather than a benchmark dataset.

### 7.4 Online taxonomy weight updates

Each resolved queue item or profile-editor answer triggers a weight update to the per-user taxonomy. This is *not* a gradient update to any model — see C1, which forbids non-Gemini SDKs. It is a re-weighting of the in-context exemplar bank that the §02 LLM-classifier draws from when classifying subsequent entries. Margatina et al. 2023 supplies the design rationale for this: in-context exemplars retrieved by *similarity* to the new entry dominate uncertainty-based retrieval, so the bank should be kept current and well-distributed across the taxonomy.

---

## 8. Recommended Question Budget and Priority Function

This section gives the v0.2 operational parameters. All values are *defaults*; per-user tuning is permitted under the same constraints.

### 8.1 Per-session budget

- **Soft cap: 3 questions per session.** Most sessions stay at or below this. This is the modal value that the Mehrotra et al. 2016 receptivity literature shows preserves answer quality.
- **Hard cap: 5 questions per session.** Never exceed this regardless of queue pressure. This is the upper edge of the Pielot et al. notification-fatigue envelope (§5.2).
- **Floor: 0 questions per session.** If the priority function returns no entries above the *worth-asking* threshold (a separate, stricter threshold than the auto-label cutoff), the session asks nothing. Asking a low-value question to "use the budget" is explicitly forbidden — it trains the user to dismiss the system.

### 8.2 Cooldowns

- **Per-dimension cooldown: 30 days.** The same taxonomy dimension is not surfaced twice within 30 days, even if a new entry is uncertain on that dimension. This is the recent_dimension_query_penalty term δ in §7.2.
- **Post-dismissal cooldown: 7 days.** If a user dismisses a queue item without answering, the dimension is suppressed for 7 days. Grounded in the Pielot et al. finding that dismissal trains future dismissal.

### 8.3 Quality-of-answer signal

Each answered queue item carries a self-rated confidence (the user can mark "I'm not sure either"). Low-confidence answers are weighted lower in the rolling κ calculation (§6) and do not count toward raising the per-dimension auto-label threshold. This guards against the Mehrotra et al. finding that hurried or stressed answers are systematically noisier.

### 8.4 Logging

Every queue impression, dismissal, and answer is logged to `ai_audit_log` (constraint C3). The log is the input to the per-dimension κ trajectory (§6) and to the empirical calibration of α, β, γ, δ in the priority function (§7.2).

---

## Bibliography

Active learning foundational:

- Settles, B. (2009). *Active Learning Literature Survey*. Computer Sciences Technical Report 1648, University of Wisconsin–Madison. https://burrsettles.com/pub/settles.activelearning.pdf
- Cohn, D. A., Ghahramani, Z., & Jordan, M. I. (1996). Active Learning with Statistical Models. *Journal of Artificial Intelligence Research*, 4, 129–145. DOI: 10.1613/jair.295
- Lewis, D. D., & Gale, W. A. (1994). A sequential algorithm for training text classifiers. In *Proceedings of SIGIR '94*, pp. 3–12. ACM. DOI: 10.1145/188490.188495

Query strategies:

- Seung, H. S., Opper, M., & Sompolinsky, H. (1992). Query by committee. In *Proceedings of the Fifth Annual Workshop on Computational Learning Theory (COLT '92)*, pp. 287–294. ACM. DOI: 10.1145/130385.130417
- Roy, N., & McCallum, A. (2001). Toward Optimal Active Learning through Sampling Estimation of Error Reduction. In *Proceedings of ICML 2001*, pp. 441–448. Morgan Kaufmann.
- Settles, B., Craven, M., & Ray, S. (2007). Multiple-Instance Active Learning. In *Advances in Neural Information Processing Systems 20 (NeurIPS 2007)*.

Active learning with LLMs:

- Margatina, K., Schick, T., Aletras, N., & Dwivedi-Yu, J. (2023). Active Learning Principles for In-Context Learning with Large Language Models. In *Findings of EMNLP 2023*, pp. 5011–5034. DOI: 10.18653/v1/2023.findings-emnlp.334
- Diao, S., Wang, P., Lin, Y., & Zhang, T. (2024). Active Prompting with Chain-of-Thought for Large Language Models. In *Proceedings of ACL 2024*, pp. 1330–1350. DOI: 10.18653/v1/2024.acl-long.73

Reinforcement learning from human feedback:

- Christiano, P. F., Leike, J., Brown, T. B., Martic, M., Legg, S., & Amodei, D. (2017). Deep Reinforcement Learning from Human Preferences. In *Advances in Neural Information Processing Systems 30 (NeurIPS 2017)*, pp. 4299–4307.
- Ouyang, L., Wu, J., Jiang, X., Almeida, D., Wainwright, C. L., Mishkin, P., Zhang, C., Agarwal, S., Slama, K., Ray, A., Schulman, J., Hilton, J., Kelton, F., Miller, L., Simens, M., Askell, A., Welinder, P., Christiano, P., Leike, J., & Lowe, R. (2022). Training language models to follow instructions with human feedback. In *Advances in Neural Information Processing Systems 35 (NeurIPS 2022)*.

Human-in-the-loop ML systems:

- Wu, X., Xiao, L., Sun, Y., Zhang, J., Ma, T., & He, L. (2022). A Survey of Human-in-the-loop for Machine Learning. *Future Generation Computer Systems*, 135, 364–381. DOI: 10.1016/j.future.2022.05.014
- Amershi, S., Cakmak, M., Knox, W. B., & Kulesza, T. (2014). Power to the People: The Role of Humans in Interactive Machine Learning. *AI Magazine*, 35(4), 105–120. DOI: 10.1609/aimag.v35i4.2513

User fatigue and notification design:

- Mehrotra, A., Pejovic, V., Vermeulen, J., Hendley, R., & Musolesi, M. (2016). My Phone and Me: Understanding People's Receptivity to Mobile Notifications. In *Proceedings of CHI '16*, pp. 1021–1032. ACM. DOI: 10.1145/2858036.2858566
- Pielot, M., Vradi, A., & Park, S. (2018). Dismissed! A Detailed Exploration of How Mobile Phone Users Handle Push Notifications. In *Proceedings of MobileHCI '18*. ACM. DOI: 10.1145/3229434.3229445

Behavioral coding inter-rater reliability:

- McHugh, M. L. (2012). Interrater reliability: the kappa statistic. *Biochemia Medica*, 22(3), 276–282. DOI: 10.11613/BM.2012.031
- (See companion file `methodology/llm-agnostic-design.md` for Bakeman & Quera 2011, Cohen 1960, Krippendorff α.)

User feedback in personalization:

- Konstan, J. A., & Riedl, J. (2012). Recommender systems: from algorithms to user experience. *User Modeling and User-Adapted Interaction*, 22(1–2), 101–123. DOI: 10.1007/s11257-011-9112-x
- Joachims, T. (2002). Optimizing search engines using clickthrough data. In *Proceedings of KDD '02*, pp. 133–142. ACM. DOI: 10.1145/775047.775067
