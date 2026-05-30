# Methodology: Onboarding & First-Time User Experience — Academic Foundations

> Research backing for 2nd-Brain v0.2 design document §05 (Ambiguity Resolution Queue at app entry), §06 (country/culture profile collection at signup), §07 (Voice trust calibration in first session).
>
> Status: verified — every citation below was checked against a primary catalog (CrossRef DOI, publisher page, ACM DL, or ISBN-resolved book record) before inclusion. Entries the curator could not verify with a DOI/URL are explicitly marked **[unverified — excluded]** and not used as load-bearing claims.

---

## AI Retrieval Guide

**When to load this document:**
- Designing or reviewing the 2nd-Brain first-run experience (signup → first journal entry → first insight).
- Considering changes to the Ambiguity Resolution Queue surfacing (v0.2 §05).
- Considering changes to locale/country/language collection at signup (v0.2 §06).
- Tuning trust-calibration copy or AI-mediation disclosure in the first session (v0.2 §07).
- Adding any new onboarding step (defaults to "no" unless the evidence below supports it).

**When NOT to load:**
- Steady-state UX problems after activation (use `active-learning-hil.md` or `uncertainty-calibration.md`).
- Consent surface design — see `docs/research/batches/data-ethics-consent.md` (this document only references it, does not duplicate it).
- Expressive-writing efficacy — see `docs/research/batches/self-knowledge.md` (Frattaroli 2006 lives there).

**Key claims surfaced here:**
1. Time-to-first-value beats feature breadth at onboarding (Cooper 2004; cognitive load literature).
2. Self-disclosure to a non-judging digital agent is *measurably easier* than to a perceived human (Lucas et al. 2014; Ho et al. 2018).
3. Progressive disclosure of complexity is grounded in cognitive load theory (Sweller 1988; Sweller, Ayres & Kalyuga 2011).
4. Stated privacy preferences predict behavior poorly — design for *trust signals at the moment of disclosure* (Norberg, Horne & Horne 2007; Acquisti & Grossklags 2005).
5. Cultural dimensions affect first-screen expectations (Marcus & Gould 2000).

---

## 1. Time-to-First-Value and Activation

### 1.1 Persona-driven design and the "first dance"

Cooper (2004), *The Inmates Are Running the Asylum*, argues that software fails users when engineers optimize for capability rather than the user's first task. The book introduces goal-directed design and the persona method, and frames the first session as a contract: the product must demonstrate a unit of value before the user invests further attention. This is the conceptual ancestor of what later SaaS practitioners call the "aha moment" or "activation."

- Cooper, A. (2004). *The Inmates Are Running the Asylum: Why High Tech Products Drive Us Crazy and How to Restore the Sanity* (2nd ed.). Sams Publishing. ISBN 978-0-672-32614-1.

**Why it matters for 2nd-Brain**: the v0.2 first session must produce *one* visible insight from *one* journal entry. Anything that pushes that moment past the first session erodes activation.

### 1.2 Activation studies in peer-reviewed venues

The curator was asked to find a peer-reviewed "Yin & Ipek (2024)" SaaS activation study but could not locate a verifiable record under that author pair in CrossRef, ACM DL, IEEE Xplore, or Google Scholar. **[unverified — excluded]**. Practitioner literature on activation (Reichheld, Ries, Yu) is excluded by the verification rule. The Cooper book above and the cognitive-load theory in §3 are the load-bearing academic anchors for activation-time claims.

---

## 2. Self-Disclosure to Digital Agents

### 2.1 Conversational agents and post-conversation effects

Ho, Hancock & Miner (2018) ran a controlled experiment in which participants conversed with a chatbot they believed to be either a bot or a human, then measured emotional, relational, and psychological outcomes. Results showed comparable disclosure-after-effects across conditions, supporting the claim that conversational agents can serve as a low-stakes disclosure surface.

- Ho, A., Hancock, J., & Miner, A. S. (2018). Psychological, relational, and emotional effects of self-disclosure after conversations with a chatbot. *Journal of Communication*, 68(4), 712–733. https://doi.org/10.1093/joc/jqy026

### 2.2 Virtual humans lower the bar to disclosure

Lucas, Gratch, King & Morency (2014) showed that participants interviewed by a virtual human disclosed more sensitive information and showed lower impression-management behavior when they believed the interviewer was fully automated rather than human-operated. The mechanism proposed is reduced fear of judgment.

- Lucas, G. M., Gratch, J., King, A., & Morency, L.-P. (2014). It's only a computer: Virtual humans increase willingness to disclose. *Computers in Human Behavior*, 37, 94–100. https://doi.org/10.1016/j.chb.2014.04.043

### 2.3 The cost of withheld disclosure

Slepian & Greenaway (2018) synthesize the secrecy literature to show that the cognitive burden of keeping a secret comes primarily from *spontaneous rumination* rather than active concealment, and that disclosing — even to a non-confidant — reliably reduces this burden. This provides theoretical grounding for why a private, AI-mediated journaling surface produces relief even without human readership.

- Slepian, M. L., & Greenaway, K. H. (2018). The benefits and burdens of keeping secrets. *Current Directions in Psychological Science*, 27(1), 1–6. https://doi.org/10.1177/0963721417734102

**Why it matters for 2nd-Brain**: §07 trust-calibration copy can lean on Lucas et al. — explicit disclosure that the system is AI, with no human reviewer by default, is not a liability but an asset for disclosure depth.

---

## 3. Cognitive Load and Progressive Disclosure

### 3.1 Original cognitive load theory

Sweller (1988) introduced the framework that learners have bounded working memory and that extraneous load (interface complexity, irrelevant choices) competes with intrinsic and germane load. Applied to onboarding, every question, animation, or option presented before the user has a mental model is extraneous load.

- Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257–285. https://doi.org/10.1207/s15516709cog1202_4

### 3.2 Modern synthesis: cognitive load theory in design

Sweller, Ayres & Kalyuga (2011), *Cognitive Load Theory*, consolidates three decades of CLT research and explicitly addresses staged information presentation. The "expertise reversal" finding — that scaffolds that help novices hurt experts — is the academic basis for progressive disclosure in interfaces.

- Sweller, J., Ayres, P., & Kalyuga, S. (2011). *Cognitive Load Theory* (Explorations in the Learning Sciences, Instructional Systems and Performance Technologies, Vol. 1). Springer. https://doi.org/10.1007/978-1-4419-8126-4

### 3.3 Training wheels: minimum-viable surface for first-run

Carroll & Carrithers (1984) introduced the "training wheels" interface — a deliberately reduced version of a product that blocks advanced features until the user has succeeded at basic tasks. Their evaluation showed faster time-to-competence and lower error rates than the full interface.

- Carroll, J. M., & Carrithers, C. (1984). Training wheels in a user interface. *Communications of the ACM*, 27(8), 800–806. https://doi.org/10.1145/358198.358218

### 3.4 Technology acceptance among non-expert users

Renaud & van Biljon (2008) developed the Senior Technology Acceptance & Adoption Model (STAAM), an extension of TAM grounded in qualitative work with elderly mobile users. While the population is specific, the design principle — *perceived usefulness must arrive before perceived ease-of-use can be evaluated* — applies broadly to first-run experiences for unfamiliar product categories (journaling-with-AI being one).

- Renaud, K., & van Biljon, J. (2008). Predicting technology acceptance and adoption by the elderly: A qualitative study. In *Proceedings of the 2008 Annual Research Conference of the South African Institute of Computer Scientists and Information Technologists on IT Research in Developing Countries (SAICSIT '08)* (pp. 210–219). ACM. https://doi.org/10.1145/1456659.1456684

---

## 4. Privacy Paradox and Trust Calibration

### 4.1 Stated preferences ≠ behavior

Norberg, Horne & Horne (2007) coined the term "privacy paradox" for the empirically observed gap between consumers' stated privacy concerns and their actual disclosure behaviors. Implication: asking users at onboarding whether they care about privacy is uninformative; instead, the disclosure context itself must signal trust.

- Norberg, P. A., Horne, D. R., & Horne, D. A. (2007). The privacy paradox: Personal information disclosure intentions versus behaviors. *Journal of Consumer Affairs*, 41(1), 100–126. https://doi.org/10.1111/j.1745-6606.2006.00070.x

### 4.2 Bounded rationality in privacy decisions

Acquisti & Grossklags (2005) show that even informed users fail to optimize privacy decisions because of incomplete information, bounded rationality, and systematic biases (hyperbolic discounting, optimism bias). This argues against long up-front privacy disclosures: users cannot integrate them.

- Acquisti, A., & Grossklags, J. (2005). Privacy and rationality in individual decision making. *IEEE Security & Privacy*, 3(1), 26–33. https://doi.org/10.1109/MSP.2005.22

### 4.3 Credibility cues at first contact

Fogg, Soohoo, Danielson, Marable, Stanford & Tauber (2003) conducted a large-N study of how users judge website credibility, finding that surface design factors (visual design, organization) dominate initial credibility judgments far more than content-quality factors. For 2nd-Brain, the first screen carries disproportionate trust weight.

- Fogg, B. J., Soohoo, C., Danielson, D. R., Marable, L., Stanford, J., & Tauber, E. R. (2003). How do users evaluate the credibility of Web sites?: A study with over 2,500 participants. In *Proceedings of the 2003 Conference on Designing for User Experiences (DUX '03)* (pp. 1–15). ACM. https://doi.org/10.1145/997078.997097

### 4.4 Dynamic consent

Schermer, M. H. N. is best known for bioethics work; the specific 2011 *Bioethics* paper titled "The dynamics of digital consent" requested in the brief could not be confirmed in CrossRef or Wiley's catalog for *Bioethics* under that author/year/title combination. **[unverified — excluded]**. The consent-design treatment lives in `docs/research/batches/data-ethics-consent.md`; see that document for verified dynamic-consent citations.

---

## 5. Cross-Cultural First-Run Design

### 5.1 Hofstede's cultural dimensions applied to UI

Marcus & Gould (2000) mapped Hofstede's cultural dimensions (power distance, individualism/collectivism, masculinity, uncertainty avoidance, long-term orientation) onto observable web-UI patterns, with case examples drawn from national portals. The paper is foundational for cross-cultural HCI design and supports the practice of inferring default expectations from locale rather than requiring an explicit culture-questionnaire.

- Marcus, A., & Gould, E. W. (2000). Crosscurrents: Cultural dimensions and global Web user-interface design. *Interactions*, 7(4), 32–46. https://doi.org/10.1145/345190.345238

### 5.2 Korean mobile UX literature

The curator scanned ACM DL, IEEE Xplore, and DBLP for peer-reviewed Korean mobile-UX onboarding studies suitable as load-bearing citations. Available work tends to be either (a) market reports without DOIs or (b) broader Asia-Pacific HCI work where Korea is one site among many. Rather than cite weakly, this section defers to Marcus & Gould (2000) plus device-locale-based defaults. **[no verified Korea-specific citation included]**.

---

## 6. Onboarding for Reflection/Journaling Apps

### 6.1 Expressive writing: where the benefit comes from

The mechanism by which journaling produces wellbeing improvements is treated in detail in `docs/research/batches/self-knowledge.md` (Frattaroli 2006 meta-analysis; Pennebaker foundational work). For onboarding purposes, two implications transfer:

1. The first writing session need not be long — Frattaroli's effect sizes are stable across short and moderate dosages.
2. Prompts that reduce activation cost (a specific question rather than a blank page) raise completion rates without diluting effect.

Cross-reference: `docs/research/batches/self-knowledge.md` §1–§2.

### 6.2 Peer-reviewed onboarding studies specific to journaling apps

A targeted search for peer-reviewed onboarding studies *specifically for digital journaling or reflection apps* surfaced primarily mental-health-app onboarding work (e.g., depression-tracking apps), which is out of scope per project lexicon policy (`src/lib/safety/lexicon.ts`) and would mis-frame 2nd-Brain. **[no journaling-app-specific onboarding study cited]**. The treatment in §1–§5 above is generalized from foundational HCI work and is the load-bearing basis.

---

## 7. Implications for 2nd-Brain (mapped to v0.2 sections)

| v0.2 section | Implication | Evidence |
|---|---|---|
| §05 Ambiguity Resolution Queue at app entry | Surface at most 1 ambiguity prompt in first session; defer the rest until after the first insight is delivered. | Sweller 1988; Sweller, Ayres & Kalyuga 2011; Carroll & Carrithers 1984 |
| §06 Country/culture profile collection | One question, prefilled from device locale, skippable. Do not present a Hofstede-style culture quiz. | Marcus & Gould 2000; Norberg et al. 2007; Acquisti & Grossklags 2005 |
| §06 Birth-date / age-18 check (C10) | Hard gate; framed as legal requirement, not interrogation. | Constraint C10 (project) |
| §07 Voice trust calibration in first session | Explicit "this is an AI, no human reads your entries by default" framing; warm but not over-familiar tone. | Lucas et al. 2014; Ho et al. 2018; Fogg et al. 2003 |
| §07 First insight | Show exactly one low-confidence-acknowledged insight; do not infer traits. | Slepian & Greenaway 2018; uncertainty-calibration methodology (see `uncertainty-calibration.md`) |
| Consent surface | Layered, progressive; full DPIA-grade disclosure deferred to first analysis-feature use. | `docs/research/batches/data-ethics-consent.md` |

**Anti-patterns this evidence rules out:**
- 10-step onboarding questionnaire (extraneous cognitive load, no first-value yet).
- Up-front trait inference before sufficient data (false confidence; would violate uncertainty-calibration constraints).
- Hidden AI mediation (forfeits the disclosure-depth benefit documented by Lucas et al. 2014).
- Marketing-style "we care about your privacy" copy without behavioral commitment (privacy paradox literature).
- Forced culture/country selection before first-value moment.

---

## 8. Recommended First-Session Flow

Derived from the citations above. Each step lists its primary evidentiary anchor.

1. **Locale-defaulted welcome** — device locale → language + country prefilled, one tap to confirm or change. *Marcus & Gould 2000; Sweller 1988.*
2. **Age verification (C10)** — birth-date entry framed as legal gate, not profiling. *Constraint C10.*
3. **AI-mediation disclosure (one screen)** — "An AI reads your entries to surface patterns. No human reads them by default. You can delete anything." *Lucas et al. 2014; Ho et al. 2018; Fogg et al. 2003.*
4. **Minimum consent acceptance** — data-use only; advanced features defer their own consent. *Acquisti & Grossklags 2005; cross-link `data-ethics-consent.md`.*
5. **First prompt** — a single concrete question (not a blank page), under 200 ms to appear. *Carroll & Carrithers 1984; Frattaroli 2006 via `self-knowledge.md`.*
6. **One insight return** — one observation with explicit low-confidence framing; no trait inference. *Slepian & Greenaway 2018; `uncertainty-calibration.md`.*
7. **Defer the rest** — Ambiguity Queue, deeper profile, analysis features all surface in session 2+. *Sweller, Ayres & Kalyuga 2011.*

Total target: ≤ 90 seconds from app open to first insight delivered, on a mid-tier Android device with cold cache.

---

## Bibliography

Verified entries — each link resolves to a publisher record, DOI, or ISBN catalog.

1. Acquisti, A., & Grossklags, J. (2005). Privacy and rationality in individual decision making. *IEEE Security & Privacy*, 3(1), 26–33. https://doi.org/10.1109/MSP.2005.22
2. Carroll, J. M., & Carrithers, C. (1984). Training wheels in a user interface. *Communications of the ACM*, 27(8), 800–806. https://doi.org/10.1145/358198.358218
3. Cooper, A. (2004). *The Inmates Are Running the Asylum* (2nd ed.). Sams Publishing. ISBN 978-0-672-32614-1.
4. Fogg, B. J., Soohoo, C., Danielson, D. R., Marable, L., Stanford, J., & Tauber, E. R. (2003). How do users evaluate the credibility of Web sites? A study with over 2,500 participants. In *Proceedings of DUX '03* (pp. 1–15). ACM. https://doi.org/10.1145/997078.997097
5. Ho, A., Hancock, J., & Miner, A. S. (2018). Psychological, relational, and emotional effects of self-disclosure after conversations with a chatbot. *Journal of Communication*, 68(4), 712–733. https://doi.org/10.1093/joc/jqy026
6. Lucas, G. M., Gratch, J., King, A., & Morency, L.-P. (2014). It's only a computer: Virtual humans increase willingness to disclose. *Computers in Human Behavior*, 37, 94–100. https://doi.org/10.1016/j.chb.2014.04.043
7. Marcus, A., & Gould, E. W. (2000). Crosscurrents: Cultural dimensions and global Web user-interface design. *Interactions*, 7(4), 32–46. https://doi.org/10.1145/345190.345238
8. Norberg, P. A., Horne, D. R., & Horne, D. A. (2007). The privacy paradox: Personal information disclosure intentions versus behaviors. *Journal of Consumer Affairs*, 41(1), 100–126. https://doi.org/10.1111/j.1745-6606.2006.00070.x
9. Renaud, K., & van Biljon, J. (2008). Predicting technology acceptance and adoption by the elderly: A qualitative study. In *Proceedings of SAICSIT '08* (pp. 210–219). ACM. https://doi.org/10.1145/1456659.1456684
10. Slepian, M. L., & Greenaway, K. H. (2018). The benefits and burdens of keeping secrets. *Current Directions in Psychological Science*, 27(1), 1–6. https://doi.org/10.1177/0963721417734102
11. Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257–285. https://doi.org/10.1207/s15516709cog1202_4
12. Sweller, J., Ayres, P., & Kalyuga, S. (2011). *Cognitive Load Theory*. Springer. https://doi.org/10.1007/978-1-4419-8126-4

### Excluded (unverified by curator)

- "Yin, P. & Ipek, U. (2024)" SaaS activation study — no matching record found in CrossRef, ACM DL, IEEE Xplore, or Google Scholar.
- Schermer, M. (2011). "The dynamics of digital consent." *Bioethics* — no matching record under that title/year/journal combination. Dynamic-consent citations live in `docs/research/batches/data-ethics-consent.md`.
- Korea-specific peer-reviewed mobile-onboarding study — no DOI-bearing source met the load-bearing-citation bar.

### Cross-references (do not duplicate here)

- `docs/research/batches/data-ethics-consent.md` — informed-consent and dynamic-consent UX surface design.
- `docs/research/batches/self-knowledge.md` — Frattaroli (2006) meta-analysis on expressive writing; mechanism-of-benefit citations.
- `docs/research/methodology/uncertainty-calibration.md` — confidence framing for the first-insight return in §8 step 6.
- `docs/research/methodology/active-learning-hil.md` — post-activation learning loops (out of scope for this document).
