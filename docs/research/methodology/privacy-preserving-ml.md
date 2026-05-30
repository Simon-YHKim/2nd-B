# Methodology: Privacy-Preserving ML — Academic Foundations

> Research backing for 2nd-Brain v0.2 design document §04 (3-Tier evidence storage: atomic quote / context / full transcript) and §10 (global compliance, GDPR Art. 9 special category data, Korean PIPA).
>
> **Scope.** This file is methodology (privacy-preserving machine learning, cryptography, and the empirical security literature on language models). It complements `legal/jurisdiction-compliance.md` (legal text) and `methodology/llm-agnostic-design.md` (LLM safety/eval). Domain-specific wellness app privacy research (Iwaya, O'Loughlin) is in §6.
>
> **Verification policy.** Every cited paper was confirmed against arXiv, IACR ePrint, ACL Anthology, NeurIPS/ICML/ICLR proceedings, IEEE Xplore, ACM Digital Library, USENIX, Springer, or the publisher record during this session. DOIs are given where the venue assigns one; for arXiv-only preprints the arXiv id is the canonical handle. No fabricated citations.

---

## AI Retrieval Guide (for RAG / Wiki use)

| When the system needs to answer… | Look at section |
|---|---|
| "What does differential privacy formally guarantee?" | §1 |
| "Can we fine-tune a small classifier on user journals safely?" | §2 |
| "Should 2nd-Brain run federated / on-device?" | §3 |
| "Could an attacker reconstruct a user's journal from a model?" | §4 |
| "Can the LLM run on encrypted inputs?" | §5 |
| "What does the literature say about privacy in mental-health / wellness apps?" | §6 |
| "How does this translate to the v0.2 §04 storage tiers?" | §7 |
| "Concrete privacy stack recommendation for the build" | §8 |

---

## 1. Differential Privacy: The Math and What It Buys You

**Design claim (v0.2 §04 + §10).** Any aggregate analytics over the user base, and any model fine-tuned on user content (e.g., the behavior-taxonomy classifier), must carry a formal differential-privacy guarantee. We do not rely on "the data is anonymized" alone — re-identification attacks have repeatedly defeated naïve anonymization.

### 1.1 The original definition (Dwork et al., 2006)

Dwork, McSherry, Nissim, and Smith (2006, *Calibrating Noise to Sensitivity in Private Data Analysis*, Theory of Cryptography Conference / TCC) introduced ε-differential privacy and the Laplace mechanism. A randomized mechanism M is ε-differentially private if, for any two neighboring datasets D and D' (differing in one record) and any output set S:

Pr[M(D) ∈ S] ≤ exp(ε) · Pr[M(D') ∈ S]

This bounds *how much* the inclusion of any single user's record can shift the distribution of outputs — and therefore caps how much an adversary can learn about that user from the released result. The paper proves that adding Laplace noise scaled to the query's L1 sensitivity / ε achieves the guarantee.
DOI: 10.1007/11681878_14 (Springer, TCC 2006 proceedings).

### 1.2 The monograph (Dwork & Roth, 2014)

Dwork and Roth (2014, *The Algorithmic Foundations of Differential Privacy*, Foundations and Trends in Theoretical Computer Science 9(3–4), 211–407) is the canonical reference for composition theorems, the Gaussian mechanism, (ε, δ)-DP, and the privacy-utility frontier. The "advanced composition" theorem (Thm 3.20) is the budgetary tool we use in §8 to set ε per query / per epoch and aggregate to a release-wide ε.
DOI: 10.1561/0400000042.

Key practical takeaways from the monograph:

- **Composition is real.** k applications of an (ε, δ)-DP mechanism compose to roughly (k·ε, k·δ) in basic composition, and to ≈ (√(2k ln(1/δ')) · ε, k·δ + δ') under advanced composition. The implication: a fixed ε budget is *spent* by repeated queries.
- **Group privacy.** ε-DP for individuals implies (k·ε)-DP for groups of k people. If a user posts 100 entries, the per-entry guarantee weakens when an attacker targets the whole user.
- **Post-processing immunity.** Any function of a DP output is still DP. We can release a DP model and let arbitrary downstream code consume it.

### 1.3 DP-SGD (Abadi et al., 2016)

Abadi, Chu, Goodfellow, McMahan, Mironov, Talwar, and Zhang (2016, *Deep Learning with Differential Privacy*, ACM CCS) introduced DP-SGD: per-example gradient clipping + Gaussian noise injection during SGD, with the **moments accountant** for tight (ε, δ) tracking across thousands of training steps. On MNIST they reach 97 % accuracy at (ε=8, δ=10⁻⁵) and on CIFAR-10 ~73 % at (ε=8, δ=10⁻⁵).
DOI: 10.1145/2976749.2978318.

DP-SGD is the *only* widely deployed, mathematically defensible recipe for training neural networks on private data. Every modern privacy-preserving training paper (§2) is a refinement of it.

---

## 2. DP-SGD and Language Models

The relevant question for 2nd-Brain is narrower than "train a language model from scratch with DP." We will never pre-train a foundation model; we may fine-tune small classifiers. The 2022 wave of ICLR papers showed that *fine-tuning* large pre-trained models with DP-SGD is far more tractable than training them from scratch.

### 2.1 Yu et al. (2022): DP fine-tuning of LMs

Yu, Naik, Backurs, Gopi, Inan, Kamath, Kulkarni, Lee, Manoel, Wutschitz, Yekhanin, and Zhang (2022, *Differentially Private Fine-tuning of Language Models*, ICLR) showed that DP fine-tuning with parameter-efficient methods (LoRA, adapter layers) recovers most of the utility gap between non-private and private fine-tuning across GLUE and several generation benchmarks at meaningful ε (e.g., ε ∈ {3, 6}). The key insight is that the smaller parameter count of the trainable LoRA matrix reduces the sensitivity term, so DP noise hurts less.
arXiv: 2110.06500.

### 2.2 Li et al. (2022): Large LMs as strong DP learners

Li, Tramèr, Liang, and Hashimoto (2022, *Large Language Models Can Be Strong Differentially Private Learners*, ICLR) demonstrated, on the same broad benchmark set, that with proper hyperparameter choices (large batch size, larger pre-trained model, careful learning rate) DP-SGD fine-tuning of GPT-2-scale and RoBERTa-scale models matches non-DP utility within a few points at ε = 8. The paper's "non-trivial findings" reframed the field: privacy and utility are not at fundamental odds for language fine-tuning.
arXiv: 2110.05679.

### 2.3 Mireshghallah et al. (2022): Memorization in NLP fine-tuning

Mireshghallah, Uniyal, Wang, Evans, and Berg-Kirkpatrick (2022, *Memorization in NLP Fine-tuning Methods*, arXiv:2205.12506; later EMNLP 2022 Findings as *An Empirical Analysis of Memorization in Fine-tuned Autoregressive Language Models*) systematically compared full fine-tuning, head fine-tuning, adapter fine-tuning, and prefix tuning on the *amount of training-data leakage*. The headline result: **head fine-tuning leaks the least** by orders of magnitude, while full fine-tuning of all weights leaks the most. The leakage gap holds across model scales and target text types.

Implication: even without DP-SGD, restricting fine-tuning to a small head reduces memorization risk substantially. With DP-SGD on top of head/LoRA fine-tuning, both effects compound.

---

## 3. Federated Learning: When to Use, When Not To

**Design claim (v0.2 §04).** Federated learning (FL) is the architectural answer to "can we improve the model without ever centralizing user journals?" The literature is clear that FL alone is *not* a privacy guarantee — gradients leak — and must be combined with DP and/or secure aggregation.

### 3.1 McMahan et al. (2017): FedAvg

McMahan, Moore, Ramage, Hampson, and Agüera y Arcas (2017, *Communication-Efficient Learning of Deep Networks from Decentralized Data*, AISTATS) introduced **Federated Averaging (FedAvg)**: each client runs several local SGD steps on its own data and uploads only the resulting weights/updates; the server averages updates across clients. The paper showed 10–100× reduction in communication rounds versus naïve federated SGD on MNIST and Shakespeare LM tasks.
arXiv: 1602.05629. (PMLR proceedings v54.)

### 3.2 Konečný et al. (2016): communication efficiency

Konečný, McMahan, Yu, Richtárik, Suresh, and Bacon (2016, *Federated Learning: Strategies for Improving Communication Efficiency*, NeurIPS Workshop on Private Multi-Party Machine Learning) introduced structured updates and sketched updates as compression strategies, enabling FL on mobile devices with constrained uplink. The paper is the canonical reference for FL bandwidth tradeoffs.
arXiv: 1610.05492.

### 3.3 Bonawitz et al. (2019): production FL at scale

Bonawitz, Eichner, Grieskamp, Huba, Ingerman, Ivanov, Kiddon, Konečný, Mazzocchi, McMahan, Van Overveldt, Petrou, Ramage, and Roselander (2019, *Towards Federated Learning at Scale: System Design*, MLSys / Proceedings of Machine Learning and Systems 1) documents Google's production FL system: device selection, secure aggregation, pace steering, and failure modes when training across tens of millions of phones. This is the reference for "what does FL actually cost operationally."
arXiv: 1902.01046.

### 3.4 The crucial caveat: gradients leak

A line of work starting with Phong et al. (2017) and culminating in **Zhu, Liu, and Han (2019, *Deep Leakage from Gradients*, NeurIPS)** showed that raw shared gradients in FL can be inverted to recover the underlying training examples — often pixel-level for images and token-level for text — when the batch is small. The "iDLG" follow-up (Zhao, Mopuri, Bilen 2020) made the attack more reliable. The implication is operational: FL *without* (a) secure aggregation (gradients are aggregated on a server that never sees individual updates) and (b) DP noise on the update is **not** a privacy guarantee.
Zhu et al. arXiv: 1906.08935. iDLG arXiv: 2001.02610.

### 3.5 Implication for 2nd-Brain

FL is attractive in principle (user journals never leave the device) but expensive in practice (mobile compute, complex client orchestration, secure-aggregation infrastructure). For v0.2 we recommend the simpler architecture: **central storage with strong cryptographic at-rest protection (§7) plus DP-SGD if and only if we ever fine-tune on user data**. FL becomes a v1.x consideration if and when the user base demands it. The Bonawitz paper is the calibration: production FL is not a weekend project.

---

## 4. The Attack Surface (Membership Inference, Extraction)

**Why this section exists.** The hard constraint that 2nd-Brain should **not** be trained into a foundation model (CLAUDE.md §C-implicit, blueprint §10) is grounded in this attack literature. Models trained on user data leak that data.

### 4.1 Shokri et al. (2017): membership inference

Shokri, Stronati, Song, and Shmatikov (2017, *Membership Inference Attacks Against Machine Learning Models*, IEEE Symposium on Security and Privacy) is the foundational MIA paper. Given query access to a trained model and an example x, the attacker decides whether x was in the training set. They achieved high precision against models trained on CIFAR, hospital data, and location data — and showed the attack works even on commercial ML-as-a-service offerings (Google Prediction API, Amazon ML at the time).
DOI: 10.1109/SP.2017.41.

### 4.2 Carlini et al. (2021): extracting training data from LLMs

Carlini, Tramèr, Wallace, Jagielski, Herbert-Voss, Lee, Roberts, Brown, Song, Erlingsson, Oprea, and Raffel (2021, *Extracting Training Data from Large Language Models*, USENIX Security Symposium) showed that GPT-2 can be **prompted into emitting verbatim training data** — including names, phone numbers, email addresses, code, and UUIDs — at non-trivial rates. They extracted 600+ memorized examples from a public model. The paper's most cited line is the operational implication: **"larger models are more vulnerable than smaller models."**
arXiv: 2012.07805. USENIX proceedings link: https://www.usenix.org/conference/usenixsecurity21/presentation/carlini-extracting.

This is the empirical foundation for the v0.2 §10 rule "do not send raw user journals to any external model training pipeline." Even sending journals through an inference-only API is risky if the provider's TOS reserves the right to use prompts for training.

### 4.3 Carlini et al. (2022): quantifying memorization

Carlini, Ippolito, Jagielski, Lee, Tramèr, and Zhang (2022, *Quantifying Memorization Across Neural Language Models*, ICLR 2023) established the scaling laws of memorization: memorization grows log-linearly with model capacity, training-data duplication, and prompt length / context. The practical recommendation — *deduplicate the training set aggressively* — is one of the simplest defenses.
arXiv: 2202.07646. ICLR 2023 (OpenReview): https://openreview.net/forum?id=TatRHT_1cK.

### 4.4 Carlini et al. (2023): extracting training data from diffusion models

Carlini, Hayes, Nasr, Jagielski, Sehwag, Tramèr, Balle, Ippolito, and Wallace (2023, *Extracting Training Data from Diffusion Models*, USENIX Security) extended extraction attacks to image generators (Stable Diffusion, Imagen). They recovered identifiable training images, including photographs of real people. The principle (memorize-and-emit) is independent of modality.
arXiv: 2301.13188. USENIX proceedings: https://www.usenix.org/conference/usenixsecurity23/presentation/carlini.

### 4.5 Implication for 2nd-Brain

The combination Shokri + Carlini-2021 + Carlini-2023 is the legal+technical brief for the v0.2 §10 stance:

1. Do not train, fine-tune, or pre-train any foundation model on user journals.
2. If fine-tuning a *small* downstream classifier (e.g., behavior taxonomy) is unavoidable, use DP-SGD with a *bounded* ε budget (§8) and head-only/LoRA parameterization (§2.3).
3. Vendor selection for inference must include a contractual guarantee of no training-on-inputs (Gemini's enterprise tier; Anthropic Workspaces; OpenAI's no-train opt-out).

---

## 5. Private Inference and Synthetic Data

### 5.1 CryptoNets (Gilad-Bachrach et al., 2016)

Gilad-Bachrach, Dowlin, Laine, Lauter, Naehrig, and Wernsing (2016, *CryptoNets: Applying Neural Networks to Encrypted Data with High Throughput and Accuracy*, ICML / PMLR 48: 201–210) demonstrated the first practical fully-homomorphic-encryption (FHE) inference for a neural network on MNIST. The user encrypts the input; the server runs the network on ciphertexts; the user decrypts the output. The server learns nothing.
URL: https://proceedings.mlr.press/v48/gilad-bachrach16.html.

The latency cost in 2016 was several hundred seconds per image. Modern FHE (CKKS, BFV via SEAL / OpenFHE) has improved by 1–2 orders of magnitude but FHE inference on transformer-scale models is still impractical at production latency. CryptoNets is the canonical *existence proof* and remains the cited start of the FHE-for-ML literature.

### 5.2 nGraph-HE (Boemer et al., 2019)

Boemer, Lao, Cammarota, and Wierzynski (2019, *nGraph-HE: A Graph Compiler for Deep Learning on Homomorphically Encrypted Data*, ACM International Conference on Computing Frontiers / CF '19) wrapped HE primitives in a deep-learning compiler (Intel nGraph), making FHE inference accessible without writing low-level HE code. This is the reference for "is FHE inference engineerable?" — the answer being "yes, but only for shallow non-recurrent networks at this point."
DOI: 10.1145/3310273.3323047.

### 5.3 The Synthetic Data Vault (Patki et al., 2016)

Patki, Wedge, and Veeramachaneni (2016, *The Synthetic Data Vault*, IEEE International Conference on Data Science and Advanced Analytics / DSAA '16) introduced SDV, a relational synthesizer based on Gaussian copulas that generates surrogate datasets preserving multi-table statistical structure. SDV is the canonical reference for "synthetic data as a privacy mechanism" though Patki et al. did not claim a formal DP guarantee — their argument was statistical fidelity for downstream ML.
DOI: 10.1109/DSAA.2016.49.

### 5.4 DPGAN (Xie et al., 2018)

Xie, Lin, Wang, Wang, and Zhou (2018, *Differentially Private Generative Adversarial Network*, arXiv:1802.06739) trained a GAN with DP-SGD on the discriminator. Because the generator only sees gradients from the (DP) discriminator, generator outputs inherit the DP guarantee — yielding synthetic data with a formal ε bound. Subsequent work (PATE-GAN, DP-MERF, DP-Sinkhorn) has refined the technique but DPGAN remains the entry point in citations.
arXiv: 1802.06739.

### 5.5 Implication for 2nd-Brain

- **FHE inference is not yet viable for the LLM call path.** We will not be CryptoNets-ing Gemini. The practical alternative is *enterprise inference contracts* (no training on inputs, data residency, audit logs) plus regional model endpoints.
- **Synthetic data is viable for one specific use case**: generating a training set for the behavior-taxonomy classifier without exposing real user journals. We can pair (a) hand-crafted Golden Set inputs (already required by v0.2 §08), (b) DP-synthesized perturbations of those inputs, and (c) Gemini-generated paraphrases to enlarge the labeled corpus, with no real-user data in the loop.

---

## 6. Wellness / Mental-Health App Domain Specifics

The general PPML literature (§1–§5) applies to *any* sensitive dataset. The wellness-app literature documents the gap between what privacy guarantees *should* exist and what is actually delivered in shipped products. This is the literature the 2nd-Brain ethical posture explicitly tries to *not* repeat.

### 6.1 Iwaya et al. (2023): privacy of mental-health apps

Iwaya, Babar, Rashid, and Wijayarathna (2023, *On the Privacy of Mental Health Apps: An Empirical Investigation and Its Implications for Apps Development*, *Empirical Software Engineering* 28, Article 102) conducted a systematic privacy analysis of 27 of the top mental-health apps on Google Play. Findings include: 87 % shared data with third parties despite policy claims to the contrary; many transmitted personally identifiable health-adjacent data unencrypted; policy text frequently used terminology that misled users about what was actually shared.
DOI: 10.1007/s10664-023-10319-6.

### 6.2 O'Loughlin et al. (2019): depression-app privacy policies

O'Loughlin, Neary, Adkins, and Schueller (2019, *Reviewing the Data Security and Privacy Policies of Mobile Apps for Depression*, *Internet Interventions* 15, 110–115) reviewed the privacy policies of the top depression apps on Google Play and the App Store. The headline finding: a substantial fraction had **no privacy policy at all**; among those that did, policies frequently failed basic legal review (consent unclear, third-party sharing unbounded, data deletion not described). Subsequent work (Parker et al. 2019 *BMC Medical Informatics*) replicated the pattern across anxiety apps.
DOI: 10.1016/j.invent.2018.12.001.

### 6.3 The DPIA literature for AI (Mantelero, 2018)

Mantelero (2018, *AI and Big Data: A Blueprint for a Human Rights, Social and Ethical Impact Assessment*, *Computer Law & Security Review* 34(4), 754–772) framed the AI-specific Data Protection Impact Assessment that GDPR Article 35 implies for "high-risk" processing. Special-category data (GDPR Art. 9 — health, sexual orientation, religion, political views) processed by algorithmic systems is essentially always Art. 35 high-risk and therefore DPIA-required.
DOI: 10.1016/j.clsr.2018.05.017.

### 6.4 Implication for 2nd-Brain

The Iwaya and O'Loughlin papers are the cautionary-tale anchor: *most* wellness apps fail at the privacy basics. The cheap wins they document — actually publish a complete policy, actually encrypt in transit and at rest, actually scope third-party sharing, actually honor deletion — are operational, not algorithmic. The DPIA literature (Mantelero) tells us that AI-mediated wellness journaling triggers GDPR Art. 35 in essentially every EU deployment, so a DPIA is part of the build, not an afterthought.

Vocabulary note: per CLAUDE.md, this batch describes the *literature* on mental-health apps and depression apps, since that is what the cited papers cover. The 2nd-Brain product itself uses self-understanding / growth / reflection language (§Vocabulary policy). The privacy techniques discussed here are agnostic to that labeling distinction.

### 6.5 Korean privacy ML and PIPA specifics

Korean privacy practice has two distinctive technical concerns that the global literature touches only obliquely:

- **K-anonymity for the Korean PIPA "pseudonymized data" exception.** The PIPA Amendment of 2020 created a "pseudonymized information" category that can be processed for statistical, research, or public-interest purposes without separate consent. The standard reference for the underlying k-anonymity guarantee is Samarati and Sweeney (1998, *Protecting Privacy when Disclosing Information: k-Anonymity and Its Enforcement through Generalization and Suppression*, SRI International TR), with later limitations documented in Machanavajjhala, Kifer, Gehrke, and Venkitasubramaniam (2007, *ℓ-Diversity: Privacy Beyond k-Anonymity*, ACM Transactions on Knowledge Discovery from Data 1(1), Article 3). DOI: 10.1145/1217299.1217302.
- **The PIPA framework itself.** Personal Information Protection Act (Korea), 2011, with the major Amendment of 2020 introducing pseudonymized data and the Personal Information Protection Commission. The English statute text and PIPC guidelines are at https://www.pipc.go.kr/eng/. See `docs/research/legal/jurisdiction-compliance.md` for the obligation mapping.

Korean academic societies publishing in this area include the Korean Institute of Information Scientists and Engineers (KIISE) and the Korea Information Processing Society (KIPS); the Korea Institute of Electronics Engineers (한국전자통신학회 / KIEE) publishes adjacent work on secure communications. Specific Korean DOI-verified pseudonymization papers are added as the team encounters citation opportunities — none currently rises to the foundational level the global papers above do.

---

## 7. Implications for 2nd-Brain

Mapping the literature onto the v0.2 §04 storage tiers and §10 compliance posture.

### 7.1 Tier A — atomic quotes

These are the most sensitive surface: a single sentence the user wrote, surfaced into a UI for confirmation. They are also the most useful for the Engine-2 classifier.

- **At-rest encryption.** Use Supabase's table-level encryption (pgcrypto / pgsodium) so that even a database read by a misconfigured role does not expose plaintext. The encryption key is held in a managed KMS, not in the application code.
- **No training.** Atomic quotes are never used as training data for any LLM. They flow to inference endpoints only with no-train contractual guarantees (§4.5).
- **DP for aggregate queries.** Any aggregate metric derived from atomic quotes (e.g., "how often do users use word X across the user base") goes through a DP mechanism with a tracked ε budget (§1.2). Internal-only dashboards do not get a free pass.

### 7.2 Tier B — context

Short surrounding context around the atomic quote. Less sensitive than the quote alone (it includes the surrounding sentences but is not by itself identifying), more sensitive than Tier C aggregates.

- **At-rest encryption** as Tier A.
- **Pseudonymization** before any inference call. Names, emails, phone numbers, addresses are scrubbed via a regex+NER pipeline before the prompt is constructed. The classifier sees `[NAME]` rather than the actual name.

### 7.3 Tier C — full transcript

The complete chat / journal history. Used as a source for evidence retrieval (RAG) but never bulk-shipped to the LLM.

- **At-rest encryption** as Tier A.
- **Retrieval is per-query.** The LLM never sees the full transcript in one call; it sees retrieved snippets relevant to the current question.
- **Right to deletion is real.** Per GDPR Art. 17 and PIPA, a deletion request triggers physical row deletion plus invalidation of any cached embeddings derived from those rows. This must be ship-day correct, not roadmap.

### 7.4 Local-only mode (federated / on-device)

Should 2nd-Brain offer a **local-only mode** where the LLM call runs on-device (mobile MLC / Gemini Nano / on-device Llama variants) and no journal ever leaves the phone?

The empirical case from §3:

- *Yes, eventually.* On-device inference is the strongest possible privacy posture: the journal never traverses the network.
- *Not at v0.2.* The Bonawitz paper (§3.3) documents the operational cost of production-scale federated/on-device systems; a solo build on a deadline cannot ship that infrastructure correctly. The more defensible v0.2 posture is centralized storage with strong cryptographic + contractual guarantees, plus a documented roadmap to on-device for a future v1.x.

### 7.5 DP-SGD epsilon budget for the behavior-taxonomy classifier

If and when we fine-tune a small classifier on user journals:

- **Parameterization.** Head-only fine-tuning of a strong pre-trained encoder (per Mireshghallah §2.3) plus LoRA where head-only proves insufficient.
- **ε budget.** The literature converges on ε ≤ 8 for fine-tuning to be considered "meaningfully private" (the Abadi 2016 MNIST result and the Li/Yu 2022 NLP results live at ε ∈ {3, 6, 8}). The Apple Privacy Preserving Statistics deployment uses ε ≈ 4 per user per day for telemetry — a more conservative production reference point.
- **Audit.** Every training run logs the (ε, δ) consumption to the same `ai_audit_log` table that captures Gemini calls (per CLAUDE.md C3). The constraint is auditable, not aspirational.

### 7.6 Carlini 2021 → vendor selection rule

Per §4.2 and §4.5: no contract permits the vendor to use 2nd-Brain inference inputs to train any model of theirs. For Gemini, this is the Vertex AI enterprise tier with the data-governance commitments documented at https://cloud.google.com/vertex-ai/docs/generative-ai/data-governance. For any alternative vendor (Anthropic, OpenAI, local Llama via Together / Replicate), the same contractual property is the entry filter.

---

## 8. Recommended Privacy Stack

The minimum implementable stack consistent with the literature above:

| Layer | Mechanism | Reference |
|---|---|---|
| Transport | TLS 1.3, HSTS, certificate pinning in mobile clients | RFC 8446; OWASP MASVS V5 |
| At-rest | Supabase pgsodium table-level encryption, KMS-held keys | §7.1 |
| Pseudonymization before LLM call | Regex + NER scrub of PII categories (name, email, phone, address, SSN/RRN) | §7.2 |
| Vendor contract | No-train guarantee in writing; data residency match (KR / EU as user resides) | §4.5, §7.6 |
| Aggregate analytics | DP with ε budget ≤ 4 / user / day; tracked in `ai_audit_log` | §1.2, §7.1 |
| Fine-tuning (if performed) | DP-SGD with head-only / LoRA, ε ≤ 8 per training run | §2, §7.5 |
| Federated / on-device | Documented v1.x target; not v0.2 scope | §3, §7.4 |
| Synthetic training data | DPGAN-style synthesis for taxonomy classifier corpus; no real-user rows in train set | §5.4, §5.5 |
| DPIA | Authored per Mantelero 2018 framework; updated each model / vendor change | §6.3 |
| Deletion | Hard delete + embedding invalidation within 30 days of request (GDPR Art. 17, PIPA Art. 36) | §7.3 |
| Audit log | Every LLM call + every DP query logged with (ε, δ, vendor, model, region) | CLAUDE.md C3, §7.5 |
| Attack monitoring | Re-run Carlini 2021 prompt-extraction probe against any production fine-tune before release | §4.2 |

This stack is implementable on the v0.2 free-tier budget except for the (optional) DP fine-tuning step. None of the above requires custom cryptography research.

---

## Bibliography

DOIs and arXiv ids are exactly as appearing in the verified publisher / preprint records.

### Differential privacy foundations

- Dwork, C., McSherry, F., Nissim, K., & Smith, A. (2006). *Calibrating Noise to Sensitivity in Private Data Analysis.* In Theory of Cryptography (TCC 2006), LNCS 3876, 265–284. Springer. DOI: 10.1007/11681878_14.
- Dwork, C., & Roth, A. (2014). *The Algorithmic Foundations of Differential Privacy.* Foundations and Trends in Theoretical Computer Science, 9(3–4), 211–407. DOI: 10.1561/0400000042.
- Abadi, M., Chu, A., Goodfellow, I., McMahan, H. B., Mironov, I., Talwar, K., & Zhang, L. (2016). *Deep Learning with Differential Privacy.* Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security (CCS '16), 308–318. DOI: 10.1145/2976749.2978318.

### DP-SGD and language models

- Yu, D., Naik, S., Backurs, A., Gopi, S., Inan, H., Kamath, G., Kulkarni, J., Lee, Y. T., Manoel, A., Wutschitz, L., Yekhanin, S., & Zhang, H. (2022). *Differentially Private Fine-tuning of Language Models.* ICLR 2022. arXiv: 2110.06500.
- Li, X., Tramèr, F., Liang, P., & Hashimoto, T. (2022). *Large Language Models Can Be Strong Differentially Private Learners.* ICLR 2022. arXiv: 2110.05679.
- Mireshghallah, F., Uniyal, A., Wang, T., Evans, D., & Berg-Kirkpatrick, T. (2022). *An Empirical Analysis of Memorization in Fine-tuned Autoregressive Language Models.* arXiv: 2205.12506 (Findings of EMNLP 2022).

### Federated learning

- McMahan, B., Moore, E., Ramage, D., Hampson, S., & Agüera y Arcas, B. (2017). *Communication-Efficient Learning of Deep Networks from Decentralized Data.* AISTATS 2017 (PMLR 54). arXiv: 1602.05629.
- Konečný, J., McMahan, H. B., Yu, F. X., Richtárik, P., Suresh, A. T., & Bacon, D. (2016). *Federated Learning: Strategies for Improving Communication Efficiency.* NeurIPS 2016 Workshop on Private Multi-Party Machine Learning. arXiv: 1610.05492.
- Bonawitz, K., Eichner, H., Grieskamp, W., Huba, D., Ingerman, A., Ivanov, V., Kiddon, C., Konečný, J., Mazzocchi, S., McMahan, H. B., Van Overveldt, T., Petrou, D., Ramage, D., & Roselander, J. (2019). *Towards Federated Learning at Scale: System Design.* MLSys 2019. arXiv: 1902.01046.
- Zhu, L., Liu, Z., & Han, S. (2019). *Deep Leakage from Gradients.* NeurIPS 2019. arXiv: 1906.08935.
- Zhao, B., Mopuri, K. R., & Bilen, H. (2020). *iDLG: Improved Deep Leakage from Gradients.* arXiv: 2001.02610.

### Membership inference and extraction attacks

- Shokri, R., Stronati, M., Song, C., & Shmatikov, V. (2017). *Membership Inference Attacks Against Machine Learning Models.* IEEE Symposium on Security and Privacy (S&P 2017), 3–18. DOI: 10.1109/SP.2017.41.
- Carlini, N., Tramèr, F., Wallace, E., Jagielski, M., Herbert-Voss, A., Lee, K., Roberts, A., Brown, T., Song, D., Erlingsson, Ú., Oprea, A., & Raffel, C. (2021). *Extracting Training Data from Large Language Models.* USENIX Security Symposium 2021. arXiv: 2012.07805.
- Carlini, N., Ippolito, D., Jagielski, M., Lee, K., Tramèr, F., & Zhang, C. (2023). *Quantifying Memorization Across Neural Language Models.* ICLR 2023. arXiv: 2202.07646.
- Carlini, N., Hayes, J., Nasr, M., Jagielski, M., Sehwag, V., Tramèr, F., Balle, B., Ippolito, D., & Wallace, E. (2023). *Extracting Training Data from Diffusion Models.* USENIX Security Symposium 2023. arXiv: 2301.13188.

### Private inference and synthetic data

- Gilad-Bachrach, R., Dowlin, N., Laine, K., Lauter, K., Naehrig, M., & Wernsing, J. (2016). *CryptoNets: Applying Neural Networks to Encrypted Data with High Throughput and Accuracy.* ICML 2016 (PMLR 48), 201–210.
- Boemer, F., Lao, Y., Cammarota, R., & Wierzynski, C. (2019). *nGraph-HE: A Graph Compiler for Deep Learning on Homomorphically Encrypted Data.* ACM International Conference on Computing Frontiers 2019 (CF '19), 3–13. DOI: 10.1145/3310273.3323047.
- Patki, N., Wedge, R., & Veeramachaneni, K. (2016). *The Synthetic Data Vault.* IEEE International Conference on Data Science and Advanced Analytics (DSAA 2016), 399–410. DOI: 10.1109/DSAA.2016.49.
- Xie, L., Lin, K., Wang, S., Wang, F., & Zhou, J. (2018). *Differentially Private Generative Adversarial Network.* arXiv: 1802.06739.

### Wellness / mental-health app privacy

- Iwaya, L. H., Babar, M. A., Rashid, A., & Wijayarathna, C. (2023). *On the Privacy of Mental Health Apps: An Empirical Investigation and Its Implications for Apps Development.* Empirical Software Engineering, 28(5), Article 102. DOI: 10.1007/s10664-023-10319-6.
- O'Loughlin, K., Neary, M., Adkins, E. C., & Schueller, S. M. (2019). *Reviewing the Data Security and Privacy Policies of Mobile Apps for Depression.* Internet Interventions, 15, 110–115. DOI: 10.1016/j.invent.2018.12.001.
- Mantelero, A. (2018). *AI and Big Data: A Blueprint for a Human Rights, Social and Ethical Impact Assessment.* Computer Law & Security Review, 34(4), 754–772. DOI: 10.1016/j.clsr.2018.05.017.

### Korean privacy ML context

- Samarati, P., & Sweeney, L. (1998). *Protecting Privacy when Disclosing Information: k-Anonymity and Its Enforcement through Generalization and Suppression.* SRI International Technical Report SRI-CSL-98-04.
- Machanavajjhala, A., Kifer, D., Gehrke, J., & Venkitasubramaniam, M. (2007). *ℓ-Diversity: Privacy Beyond k-Anonymity.* ACM Transactions on Knowledge Discovery from Data, 1(1), Article 3. DOI: 10.1145/1217299.1217302.
- Personal Information Protection Act (PIPA), Republic of Korea, 2011, as amended 2020. PIPC English portal: https://www.pipc.go.kr/eng/.

---

*Methodology version: 1.0 · Last updated: 2026-05-27 KST*
*Companion files: `methodology/llm-agnostic-design.md` (LLM safety/eval), `legal/jurisdiction-compliance.md` (legal text), `psychology-handoff.md` (psychology batch handoff).*
