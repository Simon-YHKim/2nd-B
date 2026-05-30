# Methodology: AI Memory Architecture — Academic Foundations

> Research backing for 2nd-Brain v0.2 design document §04 (3-Tier evidence storage: atomic quote / context / full transcript) and §07 (Ledger structure: how the system accumulates, consolidates, retrieves, and forgets user-specific evidence over months and years).
>
> **Scope.** This file is methodology for *memory architecture* — the engineering and cognitive-science literature on how AI systems should store, summarize, retrieve, and erase user-specific information across long horizons. It complements three sibling methodology documents:
> - `methodology/llm-agnostic-design.md` — how the analysis layer is structured (and the canonical Lewis et al. 2020 RAG citation; not duplicated here).
> - `methodology/privacy-preserving-ml.md` — differential privacy, threat models, GDPR-grade tier separation (the *privacy* arguments for tiering; this file gives the *memory* arguments).
> - `methodology/uncertainty-calibration.md` — confidence bounds on what the memory layer infers.
>
> **Verification policy.** Every cited paper was confirmed against arXiv, the ACM Digital Library, IEEE Xplore, the ACL Anthology, AAAI OJS, Elsevier (Neural Networks, Psychology of Learning and Motivation), or the APA PsycNet record during this session. DOIs are given where the venue assigns one; for arXiv-only preprints the arXiv id is the canonical handle. No fabricated citations.

---

## AI Retrieval Guide (for RAG / Wiki use)

| When the system needs to answer… | Look at section |
|---|---|
| "How do persistent AI agents store and retrieve memories of past interactions?" | §1 |
| "Should we paginate context like an operating system?" | §2 |
| "Why split Tier A (atomic quote) from Tier B (context)?" | §3 |
| "How should the Ledger consolidate evidence as it ages?" | §4 |
| "Vector DB choice — FAISS vs. pgvector vs. HNSW?" | §5 |
| "What happens to the behavior-taxonomy classifier when we add new categories?" | §6 |
| "How do we honor 'I want to forget X' (right-to-erasure)?" | §7 |
| "Concrete memory-stack recommendation for the build" | §8, §9 |

---

## 1. Generative Agents and Persistent Memory

**Design claim (v0.2 §07).** The Ledger is a persistent, queryable record of behavioral evidence the system has collected about *one* user over months and years. The closest published architecture is the generative-agents memory stream — observations are stored verbatim with timestamps, retrieved by a recency × importance × relevance score, and periodically *reflected* into higher-level summaries.

### 1.1 Park et al. (2023) — Generative Agents memory stream

Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., and Bernstein, M. S. (2023). *Generative Agents: Interactive Simulacra of Human Behavior*. In **Proceedings of the 36th Annual ACM Symposium on User Interface Software and Technology (UIST '23)**, Article 2, pp. 1–22. ACM.
DOI: 10.1145/3586183.3606763.

The paper introduces three coupled mechanisms that we treat as the canonical reference for long-horizon agent memory:

- **Memory stream.** A flat, append-only log of natural-language observations with `(timestamp, text)` tuples. Nothing is overwritten; consolidation is performed by *adding* derived records, not by mutating originals.
- **Retrieval scoring.** Each query computes a weighted sum of *recency* (exponential decay), *importance* (LLM-scored 1–10 at insert time), and *relevance* (cosine similarity in an embedding space). The agent then conditions generation only on the top-k retrieved items, not on the entire stream.
- **Reflection.** Periodically, when the cumulative importance of recent observations crosses a threshold, the agent prompts itself to generate higher-order *reflections* (e.g., "Klaus tends to be helpful when asked direct questions"). Reflections are stored back into the same stream as derived observations and become retrievable for future queries.

This three-part design — *append-only log + scored retrieval + reflection consolidation* — is the structural template for the 2nd-Brain Ledger.

### 1.2 Park et al. (2024) — Generative Agent Simulations of 1,000 People (later retitled)

Park, J. S., Zou, C. Q., Kamphorst, J., Egan, N., Shaw, A., Hill, B. M., Cai, C., Morris, M. R., Liang, P., Willer, R., and Bernstein, M. S. (2024). *Generative Agent Simulations of 1,000 People*. arXiv:2411.10109 (submitted 15 November 2024; later revised under the title *LLM Agents Grounded in Self-Reports Enable General-Purpose Simulation of Individuals*).

The 2024 paper extends the 2023 architecture by grounding each agent's memory in a long structured interview with a real human (n=1,052), then evaluating whether the agent can reproduce that human's behavior on held-out survey items, economic games, and personality batteries. Reported test-retest-normalized accuracy is ≈86%. The relevant takeaways for 2nd-Brain Ledger design are two:

- **Self-report transcripts are sufficient ground.** A long-form first-person interview, treated as raw episodic memory and retrieved at inference time, lets an LLM agent predict *that individual's* future responses with usable accuracy. This is the empirical backbone for the design claim that 2nd-Brain's Tier C (raw transcript) is not merely a privacy artifact — it carries irreducible signal that consolidation lossily compresses away.
- **Demographic baselines underperform.** The agent-grounded approach reduced disparities in accuracy across racial and ideological subgroups relative to a demographics-only model. The implication for the Ledger is that *per-user* episodic memory dominates demographic priors for prediction quality.

---

## 2. External Memory Systems for LLMs

The native context window of every current LLM is finite (typically 8K–2M tokens). The 2nd-Brain Ledger, by year three of a daily journaling user, will far exceed any plausible context window. The literature on *external* memory for LLMs gives two distinct architectural patterns: OS-style virtual memory (MemGPT) and explicit long-term-memory modules with cognitive-science-grounded decay (MemoryBank, Think-in-Memory).

### 2.1 Packer et al. (2023) — MemGPT: virtual context management

Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Stoica, I., and Gonzalez, J. E. (2023). *MemGPT: Towards LLMs as Operating Systems*. arXiv:2310.08560 (submitted 12 October 2023; v2 February 2024).

MemGPT treats the LLM context window as **main memory** and an external store as **disk**, with the LLM itself emitting function calls to page items in and out. The design distinguishes:

- **Main context** — the prompt currently in the model's context window. Sub-tiered into a system instruction segment, a working-memory segment, and a FIFO message-history segment.
- **External context** — recall storage (full conversational history, queryable by search) and archival storage (a vector store of arbitrary documents).
- **Function-call interface** — the model emits structured tool calls (`save_to_archive`, `search_archive`, `evict_from_context`) and the runtime executes them; the loop continues until the model emits a user-visible reply.

For 2nd-Brain, the relevant lesson is *not* "wrap Gemini in MemGPT" — that adds latency and a custom runtime we cannot afford on solo build. The lesson is the **separation of working memory (assembled per request) from authoritative storage (the Ledger)**. The Ledger is canonical; the working-memory bundle handed to Gemini on any one call is a transient assembly of retrieved Tier A + Tier B records, *never* the source of truth.

### 2.2 Zhong et al. (2024) — MemoryBank + Ebbinghaus-style decay

Zhong, W., Guo, L., Gao, Q., Ye, H., and Wang, Y. (2024). *MemoryBank: Enhancing Large Language Models with Long-Term Memory*. In **Proceedings of the AAAI Conference on Artificial Intelligence**, Vol. 38, No. 17 (AAAI-24 Technical Track on NLP II). arXiv:2305.10250.

MemoryBank is the closest published analog to the kind of long-horizon memory a journaling app needs. Three relevant design choices:

- **Cognitive grounding.** The retention schedule is explicitly derived from the **Ebbinghaus forgetting curve**: an item's strength decays as a function of elapsed time, and each retrieval *resets* the decay timer. The system therefore privileges memories that have been recalled often, mirroring spacing-effect findings from human memory.
- **Hierarchical summarization.** Conversation memories are organized into daily summaries, then global summaries of the user's persona, all stored alongside the raw conversation. Retrieval can target any tier.
- **AI companion as the testbed.** The reference application (SiliconFriend) is itself a long-running affective companion, which is the closest published task to 2nd-Brain's actual workload.

We adopt the **decay-on-non-retrieval + summarize-up-the-hierarchy** pattern directly. We do *not* automatically delete the underlying record on decay — we only down-weight it in the retrieval scoring (unlike the original MemoryBank, which is more aggressive). User-initiated deletion is the only path to physical erasure (§7).

### 2.3 Liu et al. (2023) — Think-in-Memory

Liu, L., Yang, X., Shen, Y., Hu, B., Zhang, Z., Gu, J., and Zhang, G. (2023). *Think-in-Memory: Recalling and Post-thinking Enable LLMs with Long-Term Memory*. arXiv:2311.08719 (submitted 15 November 2023).

The key contribution is that the memory store contains not just observations but the *thoughts derived from them*: after each interaction, the LLM produces an inductive summary ("the user's tone shifted from anxious to determined") and stores that thought alongside the raw exchange. Future retrievals can pull both the raw quote and the prior inference, avoiding the "biased reasoning" failure mode in which an LLM re-derives the same shallow conclusion from each retrieval.

For 2nd-Brain this validates a Ledger row schema in which Tier A holds the atomic quote and a sibling column holds the LLM's behavior-taxonomy classification with its provenance and confidence. The classification is itself a queryable memory artifact, not just an annotation.

---

## 3. Retrieval-Augmented Generation Memory Patterns

The canonical RAG citation (Lewis et al., 2020, NeurIPS) is documented in `methodology/llm-agnostic-design.md` §3 and not repeated here. This section covers the two additions specifically relevant to memory-as-retrieval: **DSPy** for declarative pipeline structure and **IRCoT** for iterative retrieve-while-reasoning.

### 3.1 Khattab et al. (2023) — DSPy

Khattab, O., Singhvi, A., Maheshwari, P., Zhang, Z., Santhanam, K., Vardhamanan, S., Haq, S., Sharma, A., Joshi, T. T., Moazam, H., Miller, H., Zaharia, M., and Potts, C. (2023). *DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines*. arXiv:2310.03714 (submitted 5 October 2023).

DSPy abstracts LM pipelines as graphs of declarative *modules* (signatures + parameterized prompts) and compiles them by optimizing prompts / few-shot demonstrations against a metric on labeled examples. For memory-retrieval pipelines, the relevant idea is that **the retrieve-and-condition step is a parameterized module**, not a fixed prompt. As the Ledger grows, the optimal retrieval prompt for "summarize what this user has said about boundary-setting" is unlikely to be the same prompt that worked at month 1.

We adopt the DSPy *separation between module signatures and prompts* even if we do not adopt the DSPy compiler itself: Engine-1 and Engine-2 in the 2nd-Brain architecture should have explicit signatures (typed input/output), so the prompt body becomes a tunable parameter rather than load-bearing code.

### 3.2 Trivedi et al. (2023) — Interleaving Retrieval with Chain-of-Thought (IRCoT)

Trivedi, H., Balasubramanian, N., Khot, T., and Sabharwal, A. (2023). *Interleaving Retrieval with Chain-of-Thought Reasoning for Knowledge-Intensive Multi-Step Questions*. In **Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics (ACL 2023)**. arXiv:2212.10509.

The contribution: for multi-step questions, retrieve-once-then-reason fails because the second-step query depends on the first-step answer. IRCoT interleaves retrieval with each chain-of-thought step, conditioning the next retrieval on the running rationale.

For the Ledger, this matters when a user asks "why have I been irritable this month?" The first retrieved batch (recent journal entries) often surfaces a *correlate* (e.g., poor sleep) that should drive the second retrieval (entries mentioning sleep over a longer window). A single-shot retrieval over the user's "irritable" entries misses this. The Ledger query layer is therefore designed to support iterative retrieval steps within one user-facing reflection, not just k-NN once.

---

## 4. Episodic vs Semantic Memory (Tulving Lineage)

The split between Tier A (atomic quote = episodic) and the behavior-taxonomy profile (semantic) maps directly onto the most durable distinction in human-memory psychology.

### 4.1 Tulving (1972) — the original distinction

Tulving, E. (1972). Episodic and semantic memory. In E. Tulving and W. Donaldson (Eds.), *Organization of Memory* (pp. 381–403). Academic Press.

Tulving distinguished:

- **Episodic memory** — memory for personally experienced events, indexed by time and place ("I cried in the car on Tuesday").
- **Semantic memory** — context-free general knowledge, including abstracted facts about the self ("I tend to cry when I feel unheard").

The pair is not a strict dichotomy in the cognitive literature (see Tulving 1985, 2002 for refinement), but it is the structural ancestor of every two-tier memory architecture in AI from the 1980s onward.

### 4.2 Conway and Pleydell-Pearce (2000) — the self-memory system

Conway, M. A., and Pleydell-Pearce, C. W. (2000). The construction of autobiographical memories in the self-memory system. **Psychological Review**, *107*(2), 261–288.
DOI: 10.1037/0033-295X.107.2.261.

Conway and Pleydell-Pearce's *self-memory system* (SMS) is the most-cited modern model of autobiographical memory. Its central architectural claim is that autobiographical memory is *constructed* on demand from three nested levels:

- **Lifetime periods** — abstract spans ("when I was in grad school").
- **General events** — repeated or extended categories ("Sunday calls with my mother").
- **Event-specific knowledge** — sensory-rich, brief, single-event records.

Retrieval traverses the hierarchy top-down (cue → period → general event → specific record), and the *working self* — a stable set of active goals — gates which memories surface. The SMS predicts (and the literature has subsequently confirmed) that memory retrieval is goal-dependent, not content-addressable in the naive sense.

The implication for the Ledger is structural: a Tier-A vector store keyed only by embedding similarity will miss the user's actual access pattern. The Ledger must also support hierarchical traversal (year → month → week → entry), and queries should be conditioned on the user's current stated goal (the "working self" surrogate, supplied via the app's reflection prompts).

### 4.3 Bower (1981) — mood-state-dependent retrieval

Bower, G. H. (1981). Mood and memory. **American Psychologist**, *36*(2), 129–148.
DOI: 10.1037/0003-066X.36.2.129.

Bower's classic paper documents *mood-congruent* and *mood-state-dependent* memory: people retrieve memories that match their current affective state more easily, and recall is best when test-mood matches encoding-mood. For the Ledger, this is a *bias warning*: if the user opens the app in low mood and asks "how have I been doing?", a similarity-only retrieval will surface low-mood entries, confirming the low mood. The retrieval layer should therefore (a) explicitly diversify by retrieved-entry mood, and (b) surface mood drift as a first-class statistic, not let it remain an invisible retrieval bias.

### 4.4 Mapping to 2nd-Brain

- **Tier A atomic quote** = episodic memory. Vector store row keyed by `(user_id, entry_id, quote_text, embedding, timestamp, situation_tags, mood_state)`. The embedding handles relevance; the timestamp and situation tags handle the Conway lifetime-period / general-event traversal; the mood_state is the Bower control variable.
- **Tier B context** = consolidated episodic. After ~30 days (§4 below), a Tier-A cluster is summarized into a Tier-B record. The original Tier-A rows are preserved (the user can still grep the raw quote), but the day-to-day retrieval default shifts to Tier-B for older content.
- **Semantic memory layer** = the cumulative behavior-taxonomy profile (v0.2 §02). This is *not* in the Ledger as additional rows; it is a separate structured table whose entries are *backed by* Ledger evidence. Every semantic-layer claim (e.g., "this user shows pattern X with 0.78 confidence") has a list of Ledger row IDs as its provenance.
- **Tier C raw transcript** = unindexed raw episodic, retained at the user's option for replay / re-classification when the taxonomy or LLM improves.

---

## 5. Hierarchical Summarization Patterns

The Ledger consolidates Tier-A records into Tier-B summaries as content ages. The two papers below are the canonical references for *recursive* summarization at scale.

### 5.1 Wu et al. (2021) — Recursively Summarizing Books with Human Feedback

Wu, J., Ouyang, L., Ziegler, D. M., Stiennon, N., Lowe, R., Leike, J., and Christiano, P. (2021). *Recursively Summarizing Books with Human Feedback*. arXiv:2109.10862.

The paper trains a model to summarize entire books by (a) chunking, (b) summarizing each chunk, then (c) recursively summarizing the summaries until a target length is reached. The recursive tree is the operative idea: any node summarizes its children, so the depth of the tree is logarithmic in the corpus size. Human feedback is used at every level of the tree to keep summaries faithful to the source.

For the Ledger, the analog is: a week's Tier-A rows → a weekly Tier-B summary; a month's weekly summaries → a monthly summary; etc. The faithfulness constraint at every level is critical — a Tier-B summary that diverges from the underlying Tier-A rows will eventually be used to make a behavior-taxonomy claim that the user disputes. We therefore preserve all Tier-A rows, never replace them, and store the summary alongside as a sibling node.

### 5.2 Chen et al. (2023) — Walking Down the Memory Maze (MemWalker)

Chen, H., Pasunuru, R., Weston, J., and Celikyilmaz, A. (2023). *Walking Down the Memory Maze: Beyond Context Limit through Interactive Reading*. arXiv:2310.05029.

MemWalker structures a long document as a *tree of summaries* and lets the LLM at query time decide, at each node, whether to (i) answer from the current summary, (ii) descend into a child node for more detail, or (iii) back-track. The tree is built once; queries are answered by interactive traversal.

The relevance to the Ledger: rather than always retrieving k nearest-neighbor Tier-A rows for a query, the system can ascend to a Tier-B (or higher) summary, decide whether the query is satisfiable at that altitude, and only descend to Tier A when the summary is insufficient. This is far cheaper at the LLM-call level, and it preserves the user's privacy-preference: many queries never need to load any single raw quote.

### 5.3 Recommended consolidation cadence (Ledger design)

Based on the §1.1 generative-agents reflection cadence (importance-threshold-triggered), the §2.2 MemoryBank decay schedule, and the §5.1 Wu recursive tree:

| Age of content | Default retrieval target | Consolidation step |
|---|---|---|
| 0 to 30 days | Tier A (raw quote) | Nightly: cluster the day's Tier-A rows by topic/situation; emit a Tier-B daily summary. |
| 30 days to 1 year | Tier B (weekly/monthly summary) | Weekly: roll 7 daily summaries into a weekly summary. Monthly: roll 4 weekly summaries into a monthly summary. |
| Older than 1 year | Tier B (quarterly/yearly summary) | Monthly: roll the prior month into the long-history summary tree. |

Tier-A rows are **never deleted by the consolidation pipeline**. Erasure is only user-initiated (§7).

---

## 6. Vector Databases and Similarity Retrieval

Tier-A retrieval is similarity-based: given a query embedding, return the k nearest Tier-A rows. The relevant prior art is the approximate-nearest-neighbor (ANN) literature.

### 6.1 Johnson, Douze, and Jégou (2017/2019) — FAISS

Johnson, J., Douze, M., and Jégou, H. (2017). *Billion-scale similarity search with GPUs*. arXiv:1702.08734. Later published in **IEEE Transactions on Big Data**, 7(3), 535–547 (2021).
DOI: 10.1109/TBDATA.2019.2921572.

FAISS is the canonical GPU-accelerated ANN library. The paper documents constructing a k-NN graph on 95 million images in 35 minutes and a 1-billion-vector graph in under 12 hours on 4 GPUs. The relevant takeaway for 2nd-Brain is the *scale floor*: at the per-user scale we operate at (≤10⁵ rows after years of journaling), any modern ANN library is more than sufficient. Vector-DB choice is not a scaling problem; it is an operational and privacy problem.

### 6.2 Malkov and Yashunin (2016/2018) — HNSW

Malkov, Yu. A., and Yashunin, D. A. (2016). *Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs*. arXiv:1603.09320. Published in **IEEE Transactions on Pattern Analysis and Machine Intelligence**, 42(4), 824–836 (2020).
DOI: 10.1109/TPAMI.2018.2889473.

HNSW is the algorithm under nearly every production vector index in 2024–2026 (pgvector, Pinecone, Qdrant, Weaviate, FAISS's IndexHNSWFlat). It is a multi-layer proximity graph in which the top layer is sparse (long-range hops) and the bottom layer is dense (local refinement). Query complexity is empirically O(log N) on real datasets, with recall > 0.95 at modest `efSearch` values. For per-user Tier-A retrieval (N in the thousands to low tens of thousands), HNSW at default parameters is comfortably below 10 ms.

### 6.3 Vector-DB choice for 2nd-Brain — Supabase pgvector

The stack (CLAUDE.md) is already Supabase. **pgvector** ships HNSW indexing as of pgvector 0.5.0 (Aug 2023) and has been generally available on Supabase since shortly after. The argument for pgvector over a separate vector service:

- **One auth boundary, one RLS policy.** Row-level security on `ledger_tier_a` (the Postgres table) automatically scopes vector queries. A separate vector service requires a parallel auth layer.
- **Joins.** Tier-A retrieval almost always needs to join back to entry metadata, behavior-taxonomy classifications, and Tier-B parents. With pgvector this is a normal SQL join; with a separate vector store it is two round-trips.
- **GDPR / PIPA erasure.** A user deletion is a single `DELETE … CASCADE` across all tiers when everything lives in one Postgres. Erasure that has to fan out to a separate vector service is a class of bug we should not introduce on a solo build.

We therefore recommend **pgvector with an HNSW index on the Tier-A embedding column**, with default `m=16, ef_construction=64`, and per-query `ef_search` tunable. This matches the privacy-preserving-ML doc (`privacy-preserving-ml.md` §7) which also concluded "one Postgres" is the lower-risk operational target.

---

## 7. Catastrophic Forgetting and Continual Learning

The Ledger's *retention* problem is the dual of the classifier's *forgetting* problem: as we add new entries (and possibly new behavior-taxonomy categories) over the user's lifetime, a fine-tuned classifier risks losing prior calibration on older categories. This is catastrophic forgetting.

### 7.1 McCloskey and Cohen (1989) — the original demonstration

McCloskey, M., and Cohen, N. J. (1989). Catastrophic interference in connectionist networks: The sequential learning problem. In G. H. Bower (Ed.), **The Psychology of Learning and Motivation**, Vol. 24, pp. 109–165. Academic Press.
DOI: 10.1016/S0079-7421(08)60536-8.

The paper that named the problem. Training a backprop network sequentially on task A then task B caused near-total loss of task-A performance, in stark contrast to human learners on the same tasks. The result has held up across architectures: pretty much any naive sequential fine-tune of a neural network induces forgetting.

For 2nd-Brain the implication is that we do **not** sequentially fine-tune the behavior classifier on each user's new entries. The classifier is a fixed, periodically retrained model whose training set is held centrally (with the privacy guarantees in `methodology/privacy-preserving-ml.md` §1–3). Per-user adaptation happens in the *prompt* (retrieved context from the user's Ledger), not in the *weights*.

### 7.2 Parisi et al. (2019) — Continual Lifelong Learning survey

Parisi, G. I., Kemker, R., Part, J. L., Kanan, C., and Wermter, S. (2019). Continual lifelong learning with neural networks: A review. **Neural Networks**, *113*, 54–71.
DOI: 10.1016/j.neunet.2019.01.012.

Parisi et al. organize the field into three broad strategies — *regularization* (EWC and successors), *rehearsal / replay* (store or generate samples from prior tasks), and *dynamic architectures* (grow the network as new tasks arrive). All three trade off retention against capacity in different ways; none "solves" forgetting in the strong sense.

For 2nd-Brain the takeaway is operational: if we ever do fine-tune (e.g., a small per-language head), we use *rehearsal* — retain a frozen sample of prior training data and mix it into every retraining run.

### 7.3 De Lange et al. (2021) — TPAMI continual learning survey

De Lange, M., Aljundi, R., Masana, M., Parisot, S., Jia, X., Leonardis, A., Slabaugh, G., and Tuytelaars, T. (2021). A continual learning survey: Defying forgetting in classification tasks. **IEEE Transactions on Pattern Analysis and Machine Intelligence**, *44*(7), 3366–3385.
DOI: 10.1109/TPAMI.2021.3057446.

De Lange et al. provide the empirical benchmark suite (Permuted MNIST, Split CIFAR-100, Tiny ImageNet) that is now standard for continual-learning evaluation, and quantify the trade-off explicitly: under realistic memory budgets, no current method matches joint training. This is the strongest available evidence that *we should not pretend to do continual learning on a budget-constrained solo build*. Periodic full retrain on the aggregated, anonymized training set is the lower-risk operating point.

---

## 8. Privacy-Aware Memory and Machine Unlearning

The privacy *guarantees* (differential privacy, threat models, jurisdiction compliance) are in `methodology/privacy-preserving-ml.md`. This section covers the *memory-specific* additions: how to honor a user's "forget X" request once Tier-A rows have already been embedded and possibly influenced a fine-tuned classifier.

### 8.1 Cao and Yang (2015) — first machine-unlearning formalization

Cao, Y., and Yang, J. (2015). Towards Making Systems Forget with Machine Unlearning. In **2015 IEEE Symposium on Security and Privacy**, pp. 463–480.
DOI: 10.1109/SP.2015.35.

Cao and Yang introduced the term *machine unlearning* and gave the first formal definition: after an unlearning request for record r, the model should behave as if r had never been part of training. They show this is tractable for a class of *summation-form* learning algorithms (naive Bayes, certain SVMs, k-means), where the contribution of one record can be subtracted in closed form. For arbitrary deep networks the closed-form result does not hold.

### 8.2 Bourtoule et al. (2021) — SISA

Bourtoule, L., Chandrasekaran, V., Choquette-Choo, C. A., Jia, H., Travers, A., Zhang, B., Lie, D., and Papernot, N. (2021). Machine Unlearning. In **2021 IEEE Symposium on Security and Privacy (SP)**, pp. 141–159.
DOI: 10.1109/SP40001.2021.00019.

SISA (Sharded, Isolated, Sliced, and Aggregated training) is the dominant practical unlearning recipe. The training set is partitioned into shards, each shard trains an independent sub-model, and predictions are aggregated. To unlearn a record, retrain only the shard that contained it. SISA bounds the worst-case retraining cost to one shard's worth of work, irrespective of model size.

For 2nd-Brain this informs both the *classifier* and the *Ledger*:

- **Classifier (training time).** If we ever train a fine-tuned classifier on user-contributed data, shard the training set by user (or by user-cluster). User deletion then requires retraining at most one shard. With the per-user-shard recipe, a single user's right-to-erasure is operationally a constant-cost operation, not a full retrain.
- **Ledger (inference time).** Tier-A and Tier-B records are user-scoped from the outset; physical deletion is a SQL DELETE within that user's rows. The harder case is the *embedding cache* and any precomputed semantic-layer claim that referenced the deleted row — both must cascade. This is why the Ledger schema requires the semantic-layer claim to store its provenance row IDs explicitly: a deletion triggers re-derivation of every claim whose provenance set was affected.

### 8.3 "I want to forget X" — operational design

Combining §8.1, §8.2, and the storage-tier model:

1. **User flags Tier-A row r for deletion.** UI confirms intent and shows downstream impact (e.g., "this quote is cited by 3 weekly summaries and 1 monthly summary").
2. **Cascade.** Delete r from Tier A. For each Tier-B summary that listed r as provenance, mark the summary stale. Re-generate the affected summaries from the *remaining* Tier-A rows in their window (or, if the window is now empty, delete the summary).
3. **Semantic-layer recomputation.** Every behavior-taxonomy claim whose provenance set included r is re-derived from current Ledger contents; if a claim's evidence drops below threshold, the claim is removed.
4. **Embedding cache invalidation.** The vector for r is removed from the HNSW index. (pgvector reclaims via VACUUM.)
5. **Training-set fork.** If r was ever included in a classifier training run, mark r as unlearned in the audit log; the next scheduled retraining excludes r and its shard.
6. **Audit-log entry.** A row is written to `ai_audit_log` (cf. C3 in CLAUDE.md) recording the deletion event with the user's consent timestamp and the cascade set, for GDPR / PIPA accountability.

This is heavier than a plain `DELETE`, but it is the only design under which "forget X" actually corresponds to *forgetting* across the whole memory architecture rather than just the user-facing surface.

---

## 9. Implications for 2nd-Brain Ledger

Restating the v0.2 §04 / §07 design claims with the literature-backed justification:

| Design claim | Backed by | Method |
|---|---|---|
| Tier A = atomic quote, vector store keyed by `(timestamp, situation_tags, mood_state)` | §1.1 Park 2023 retrieval scoring; §4.1 Tulving 1972 episodic; §4.3 Bower 1981 mood-state-dependent | Append-only log + recency × importance × relevance scoring + mood as explicit retrieval covariate |
| Tier B = consolidated episodic, generated after ~30 days | §5.1 Wu 2021 recursive summarization; §1.1 Park 2023 reflection; §2.2 Zhong 2024 hierarchical summary | Nightly chunk → weekly → monthly summary tree, Tier A preserved as leaves |
| Tier C = raw transcript, user-controlled retention | §1.2 Park 2024 self-report sufficiency; `privacy-preserving-ml.md` §7 (privacy argument) | User can re-classify against future taxonomies and LLM upgrades |
| Semantic-layer profile = behavior-taxonomy claims, each with Ledger provenance | §2.3 Liu 2023 store-the-thought; §4.2 Conway 2000 self-memory system | Profile is *derived* from Tier A/B, never authoritative on its own |
| Vector DB = Supabase pgvector with HNSW | §6.2 Malkov 2018 HNSW; §6.3 (this doc) operational argument | One auth boundary, RLS scopes vector queries, cascade-safe deletion |
| Retrieval = iterative, not single-shot | §3.2 Trivedi 2023 IRCoT | Multi-step retrieval supported when reflections require it |
| Forgetting = user-initiated, full cascade with audit log | §8.1 Cao 2015; §8.2 Bourtoule 2021; CLAUDE.md C3 | DELETE → summary re-gen → semantic-layer recomputation → embedding eviction → audit row |
| No per-user fine-tuning | §7.1 McCloskey 1989; §7.2 Parisi 2019; §7.3 De Lange 2021 | Periodic central retrain with rehearsal; per-user adaptation via prompt, not weights |
| Retrieval default ages up the tree as content ages | §2.2 Zhong 2024; §5.2 Chen 2023 MemWalker | Tier A for ≤30d, Tier B for 30d–1y, summary tree for >1y; descend only when needed |

---

## 10. Recommended Memory Stack

The concrete, pre-launch stack consistent with this methodology and the existing CLAUDE.md / v0.2 design constraints:

**Storage layer**
- **Postgres (Supabase)** with three tables: `ledger_tier_a` (atomic quotes + embeddings), `ledger_tier_b` (summaries, with FK arrays to Tier A), `ledger_tier_c` (raw transcripts, user-controlled retention flag).
- **pgvector ≥ 0.5** on `ledger_tier_a.embedding`, HNSW index, `m=16, ef_construction=64`.
- **RLS policies** scope every Tier-A/B/C row to `auth.uid()`. No cross-user joins are ever possible at the SQL level.

**Embedding layer**
- One embedding model, called from `src/lib/llm/gemini.ts` (C1). Recommended: `text-embedding-004` via Gemini for consistency with the LLM call boundary, or a small local sentence-transformer if `EXPO_PUBLIC_USE_VERTEX=false`. Embedding dim recorded in the `ai_audit_log` row.

**Retrieval layer**
- Default: top-k HNSW similarity on Tier A within the window the user is asking about, plus mood-diversification (§4.3) and situation-tag filter.
- For temporal queries ("this month", "last year"): pivot to Tier B summaries; descend to Tier A only when the summary is insufficient (§5.2).
- For multi-step reflection queries: IRCoT-style iterative retrieve (§3.2), with each retrieval logged to `ai_audit_log`.

**Consolidation layer**
- Nightly cron: cluster the day's Tier-A rows; generate a Tier-B daily summary citing Tier-A IDs as provenance.
- Weekly cron: roll 7 daily summaries into a Tier-B weekly summary.
- Monthly cron: roll 4 weekly summaries into a Tier-B monthly summary; archive Tier-A rows older than 30 days from the default retrieval set but never delete them.
- All summaries pass through the safety classifier (`classifyInput()`, C9) before being stored, in case consolidation surfaces red-zone content.

**Forgetting layer**
- User-initiated deletion only. UI surfaces the cascade scope before confirmation.
- Cascade: Tier-A row → affected Tier-B summaries (regenerate or delete) → semantic-layer claims (re-derive or remove) → embedding (HNSW eviction + VACUUM).
- Audit-log row written for every deletion with consent timestamp.
- If/when a classifier is ever fine-tuned on user data, SISA-style per-user-shard training (§8.2) so that one user's deletion costs at most one shard's retraining.

**Calibration layer**
- Every semantic-layer claim carries a confidence (see `methodology/uncertainty-calibration.md`).
- Every claim also carries its Ledger provenance set, so the user can audit *why* the system thinks what it thinks. This is the practical operationalization of Tulving's episodic-supports-semantic principle (§4.1) at the system level.

This stack matches the existing 12 hard constraints (CLAUDE.md), respects the $0/mo free-tier promise (pgvector ships with Supabase free tier; no separate vector service), and is implementable in the solo-build evenings-and-weekends time budget.

---

## Bibliography

Bourtoule, L., Chandrasekaran, V., Choquette-Choo, C. A., Jia, H., Travers, A., Zhang, B., Lie, D., and Papernot, N. (2021). Machine Unlearning. *2021 IEEE Symposium on Security and Privacy (SP)*, 141–159. DOI: 10.1109/SP40001.2021.00019.

Bower, G. H. (1981). Mood and memory. *American Psychologist*, 36(2), 129–148. DOI: 10.1037/0003-066X.36.2.129.

Cao, Y., and Yang, J. (2015). Towards Making Systems Forget with Machine Unlearning. *2015 IEEE Symposium on Security and Privacy*, 463–480. DOI: 10.1109/SP.2015.35.

Chen, H., Pasunuru, R., Weston, J., and Celikyilmaz, A. (2023). Walking Down the Memory Maze: Beyond Context Limit through Interactive Reading. arXiv:2310.05029.

Conway, M. A., and Pleydell-Pearce, C. W. (2000). The construction of autobiographical memories in the self-memory system. *Psychological Review*, 107(2), 261–288. DOI: 10.1037/0033-295X.107.2.261.

De Lange, M., Aljundi, R., Masana, M., Parisot, S., Jia, X., Leonardis, A., Slabaugh, G., and Tuytelaars, T. (2021). A continual learning survey: Defying forgetting in classification tasks. *IEEE Transactions on Pattern Analysis and Machine Intelligence*, 44(7), 3366–3385. DOI: 10.1109/TPAMI.2021.3057446.

Johnson, J., Douze, M., and Jégou, H. (2021). Billion-scale similarity search with GPUs. *IEEE Transactions on Big Data*, 7(3), 535–547. DOI: 10.1109/TBDATA.2019.2921572. arXiv:1702.08734 (2017).

Khattab, O., Singhvi, A., Maheshwari, P., Zhang, Z., Santhanam, K., Vardhamanan, S., Haq, S., Sharma, A., Joshi, T. T., Moazam, H., Miller, H., Zaharia, M., and Potts, C. (2023). DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines. arXiv:2310.03714.

Liu, L., Yang, X., Shen, Y., Hu, B., Zhang, Z., Gu, J., and Zhang, G. (2023). Think-in-Memory: Recalling and Post-thinking Enable LLMs with Long-Term Memory. arXiv:2311.08719.

Malkov, Yu. A., and Yashunin, D. A. (2020). Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs. *IEEE Transactions on Pattern Analysis and Machine Intelligence*, 42(4), 824–836. DOI: 10.1109/TPAMI.2018.2889473. arXiv:1603.09320 (2016).

McCloskey, M., and Cohen, N. J. (1989). Catastrophic interference in connectionist networks: The sequential learning problem. In G. H. Bower (Ed.), *The Psychology of Learning and Motivation*, Vol. 24, pp. 109–165. Academic Press. DOI: 10.1016/S0079-7421(08)60536-8.

Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Stoica, I., and Gonzalez, J. E. (2023). MemGPT: Towards LLMs as Operating Systems. arXiv:2310.08560.

Parisi, G. I., Kemker, R., Part, J. L., Kanan, C., and Wermter, S. (2019). Continual lifelong learning with neural networks: A review. *Neural Networks*, 113, 54–71. DOI: 10.1016/j.neunet.2019.01.012.

Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., and Bernstein, M. S. (2023). Generative Agents: Interactive Simulacra of Human Behavior. *Proceedings of the 36th Annual ACM Symposium on User Interface Software and Technology (UIST '23)*, Article 2, 1–22. DOI: 10.1145/3586183.3606763.

Park, J. S., Zou, C. Q., Kamphorst, J., Egan, N., Shaw, A., Hill, B. M., Cai, C., Morris, M. R., Liang, P., Willer, R., and Bernstein, M. S. (2024). Generative Agent Simulations of 1,000 People (later: *LLM Agents Grounded in Self-Reports Enable General-Purpose Simulation of Individuals*). arXiv:2411.10109.

Trivedi, H., Balasubramanian, N., Khot, T., and Sabharwal, A. (2023). Interleaving Retrieval with Chain-of-Thought Reasoning for Knowledge-Intensive Multi-Step Questions. *Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics (ACL 2023)*. arXiv:2212.10509.

Tulving, E. (1972). Episodic and semantic memory. In E. Tulving and W. Donaldson (Eds.), *Organization of Memory* (pp. 381–403). Academic Press.

Wu, J., Ouyang, L., Ziegler, D. M., Stiennon, N., Lowe, R., Leike, J., and Christiano, P. (2021). Recursively Summarizing Books with Human Feedback. arXiv:2109.10862.

Zhong, W., Guo, L., Gao, Q., Ye, H., and Wang, Y. (2024). MemoryBank: Enhancing Large Language Models with Long-Term Memory. *Proceedings of the AAAI Conference on Artificial Intelligence*, 38(17), AAAI-24 Technical Track on NLP II. arXiv:2305.10250.

*Cross-references (cited but not duplicated here):*
- Lewis, P. et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. NeurIPS 2020. — see `methodology/llm-agnostic-design.md` §3.
- Dwork, C. et al. (2006); Abadi, M. et al. (2016); and the differential-privacy threat-model literature. — see `methodology/privacy-preserving-ml.md` §1–4.
