# Framework: Data Ethics, Consent & Regulatory Boundaries

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Trust score target**: Closes the "data ethics" audit gap (was 40/100). Establishes the academic + regulatory floor 2nd-Brain must clear: APA/equivalent ethical guidance for AI in mental wellbeing, Korean PIPA sensitive-data requirements, OECD AI principles, and the Korean AI Framework Act (effective Jan 2026). This batch is **compliance-adjacent** but grounded in peer-reviewed and authoritative sources where possible.

## AI Retrieval Guide (for RAG / Wiki use)

**When the question is** → **look here**:
- "Is this user input considered sensitive data?" → §PIPA Article 23 + §Korean classification of mental health data
- "What does informed consent require for AI tools?" → §Pillay 2025 + §APA AI ethics guidance (referenced)
- "What ethical frameworks govern AI deployment?" → §OECD AI Principles (2019, 2024 update)
- "Does 2nd-Brain need MFDS approval?" → §Korean AI Framework Act + Blueprint §3 wellness-not-medical positioning
- "How should AI bias be addressed?" → §Pillay 2025 + cross-ref to §computational-personality.md

## Foundational Peer-Reviewed Sources

1. Pillay, Y. (2025). Ethical decision-making guidelines for mental health clinicians in the artificial intelligence (AI) era. *Healthcare*, 13(23), 3057. DOI: https://doi.org/10.3390/healthcare13233057
   - **Direct synthesis** of AI ethics for mental-health practice. Covers: informed consent (opt-in), bias auditing, transparency, scope-of-practice boundaries, HIPAA/equivalent compliance. Recommends "dual consent" — one for treatment, one for technology used to deliver it. **2nd-Brain's consent flow should mirror this dual structure.**

   Cross-reference: Stade et al. (2024) in `ai-mental-health-safety.md` is the deeper LLM-specific framework; Pillay is the clinician-facing ethics layer.

## Authoritative Non-DOI Frameworks (real but not peer-reviewed)

These are essential regulatory references. No DOI assignable (legal/policy documents) but real and authoritative.

### Korean Personal Information Protection Act (PIPA)

**Reference**: 개인정보보호법, 시행 2023. Korean Personal Information Protection Commission. https://www.law.go.kr/

**Key provisions relevant to 2nd-Brain**:
- **Article 23**: defines "sensitive information" — health, sexual life, political views, etc. **Mental-health-adjacent journal content is classified as sensitive under PIPA's Health Data Use Guideline**.
- **Separate consent required**: collection of sensitive data needs explicit, separate consent (not bundled with general consent).
- **Pseudonymization**: pseudonymized data usable for research/statistical purposes without further consent, but re-identification safeguards mandatory.
- **2023 amendment**: revised consent and cross-border transfer rules; tightened user rights.
- **Implication**: 2nd-Brain's onboarding must show TWO consent checkboxes minimum — general service consent + sensitive data consent for journal content.

### Korean AI Framework Act (인공지능기본법)

**Reference**: National Assembly passed 26 December 2024, effective 22 January 2026. https://www.law.go.kr/

**Key provisions relevant to 2nd-Brain**:
- **High-impact AI / generative AI / high-performance AI** providers carry obligations for safety and transparency.
- **Generative AI** (which 2nd-Brain uses via Gemini) is explicitly named as a regulated category.
- **2nd-Brain implications**: must support transparency requirements (system disclosure, audit logs already in Blueprint C3), risk-management documentation, user notification of AI mediation. The Blueprint's audit-log infrastructure (C3) and AI-decision transparency requirements align well with this act.

### OECD AI Principles (2019, updated 2024)

**Reference**: OECD/LEGAL/0449. Originally adopted May 2019, amended May 2024. https://oecd.ai/

**Five core principles** (relevant to 2nd-Brain):
1. **Inclusive growth, sustainable development, and well-being** — 2nd-Brain's mission language aligns.
2. **Human rights and democratic values**, including non-discrimination, privacy, autonomy — must not infer protected categories (per `computational-personality.md` Kosinski warning).
3. **Transparency and explainability** — audit log + persona-card-with-evidence design.
4. **Robustness, security, safety** — Engine 7 safety classifier + Stade (2024) risk framework.
5. **Accountability** — clear team contact, response SLA, model card / system card publication.

### APA Ethics for AI in Mental Health (2024-2025)

**Reference**: American Psychological Association — *Ethical Guidance for AI in the Professional Practice of Health Service Psychology* (2025) + Companion AI Tool Checklist (2024). Public at apa.org/topics/artificial-intelligence-machine-learning/ethical-guidance-ai-professional-practice

**Key principles**:
- Opt-in (not opt-out) consent for AI mediation.
- Revisit consent regularly as terms/risks evolve.
- HIPAA-equivalent privacy protection (in Korea: PIPA sensitive data compliance).
- Disclose AI's scope and known limitations to users (no medical claim, no diagnosis, no therapeutic substitute).

## Age Range Coverage

- **Child (0–12)** / **Adolescent (13–17)**: not applicable to 2nd-Brain user base (18+ block per Blueprint C10). Korean PIPA Article 22-2 has additional protections for users under 14 — not 2nd-Brain's concern but worth noting if scope ever expands.
- **Young Adult (18–29)** through **Elderly (65+)**: all governed by adult PIPA framework; standard consent.

## Application to 2nd-Brain

### Consent Architecture (built on Pillay 2025 + PIPA + APA guidance)

```
ONBOARDING — three separate consent checkboxes (PIPA-compliant)

[ ] General service consent (account creation, data storage)

[ ] Sensitive personal information consent (PIPA Article 23):
    "Your journal entries may describe mental wellbeing, relationships,
     beliefs, and life events. This is sensitive personal information
     under Korean law (PIPA Article 23). We need your separate consent
     to process this. You can withdraw this consent at any time without
     losing your account."

[ ] AI mediation consent (APA / Stade 2024 alignment):
    "2nd-Brain uses generative AI (Google Gemini) to:
       - Generate interview questions
       - Identify patterns in your entries
       - Provide reflective prompts (NOT therapy or diagnosis)
     The AI may make mistakes. You can review every AI-generated
     reflection, disagree with it, and ask for removal. We log AI
     decisions for transparency. You can revoke this consent at
     any time and your journal becomes plain notes."

[ ] (Optional) Anonymized usage analytics consent — separate again
```

**Critical**: bundling sensitive-data consent with general consent violates PIPA. Each box must be independently checkable and refusable.

### Disclosures (built on OECD transparency + Pillay)

In-app, persistent (not buried in legal):

- "2nd-Brain is a wellness and learning product, not therapy or medical care."
- "Pattern observations are based on your entries, not diagnostic."
- "AI responses can be wrong. Trust your own knowledge of yourself."
- "Crisis situations require human help — see [emergency resources] always available."

### Data minimization principles

- **Crisis events** (per `crisis-detection.md`): log only structured features (classifier confidence, trigger category, routing version), NOT plaintext user content.
- **Persona cards**: retain only the latest version + a small set of previous versions; delete older revisions after N months unless user opts in to extended retention.
- **Journal entries**: user-owned, user-exportable, user-deletable. No "we keep a backup forever" pattern.
- **Pseudonymized analytics**: PIPA permits, but maintain re-identification safeguards and document them.

### Cross-border data transfer (PIPA + global users)

- Gemini API calls = data leaves Korea (Google data centers).
- 2nd-Brain's Supabase free tier may host in non-Korean regions.
- **PIPA 2023 amendment requires explicit user notification** of cross-border transfer for sensitive data.
- **Implication**: onboarding consent must include cross-border transfer notification.

## Cautions & Limitations

- **PIPA is law, not opinion**: Pillay 2025 and APA guidance are ethical recommendations; PIPA is binding in Korea. Where they conflict, PIPA wins for Korean users.
- **AI Framework Act enforcement is still maturing**: rules may evolve through 2026 implementation. Re-audit annually.
- **DOI evidence base for AI mental health ethics is thin**: Pillay 2025 is one of the few peer-reviewed articles; most authoritative guidance is APA/regulatory. Document this as a research gap, not a confidence ceiling.
- **"Sensitive" classification has product implications**: any feature that infers protected attributes (sexual orientation, religion, political views) from journal text MUST be either disabled or behind explicit additional consent — see Kosinski 2013 in `computational-personality.md` for the precedent on inferential capability.
- **Korean PIPA does not equal GDPR**: similar principles, different implementation details. EU users would need GDPR-specific compliance (separate analysis not in this batch).

## Cross-references

- **For AI mental health risk taxonomy**: see `ai-mental-health-safety.md` Stade (2024) — Pillay is the clinician-facing layer, Stade is the LLM-specific layer.
- **For crisis-data privacy**: see `crisis-detection.md` minimal-logging policy.
- **For trait-inference privacy stakes**: see `computational-personality.md` Kosinski (2013) — sensitive attributes are inferable; must be prohibited.
- **For wellbeing-score privacy**: see `wellbeing-kpi.md` — never share scores externally without per-disclosure consent.

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/data-ethics-consent.sql`.
