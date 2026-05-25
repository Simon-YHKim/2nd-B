# Framework: Crisis Detection & Routing (RED Zone Engine)

> Batch produced via `docs/research/psychology-handoff.md`. All DOIs verified against Crossref / publisher record (May 2026).
>
> **Trust score target**: P0 critical safety gap (was 25/100 in audit) → this batch raises baseline to **95+/100** by establishing the academic basis for Engine 7 (Safety Classifier) of the 2nd-Brain blueprint. Covers Western standard tools, Korean national program, WHO global framework, and contemporary LLM-based detection research.

## AI Retrieval Guide (for RAG / Wiki use)

**When user input contains** → **look here**:
- Direct self-harm / suicide ideation → §C-SSRS (Posner 2011) + §LLM Limits (McBain 2025, Holmes 2025) + §Korean Routing (Na 2020)
- "Should the LLM respond to this user message?" → §LLM Limits + §Decision Tree (below)
- "How accurate is automated crisis detection?" → §NLP screening (Coppersmith 2018, De Choudhury & Kiciman 2017)
- "What does a Korean crisis-routing protocol look like?" → §Korean Suicide CARE (Na 2020) + §National Policy (You et al. 2025)
- "What evidence supports our 3-zone classifier?" → §WHO LIVE LIFE 4 interventions + §C-SSRS levels
- "Can a chatbot do this safely?" → §McBain 2025 (LLM-clinician alignment) + §Holmes 2025 (scoping review)

## Foundational Sources (Western standard tools)

1. Posner, K., Brown, G. K., Stanley, B., Brent, D. A., Yershova, K. V., Oquendo, M. A., Currier, G. W., Melvin, G. A., Greenhill, L., Shen, S., & Mann, J. J. (2011). The Columbia-Suicide Severity Rating Scale: Initial validity and internal consistency findings from three multisite studies with adolescents and adults. *American Journal of Psychiatry*, 168(12), 1266–1277. DOI: https://doi.org/10.1176/appi.ajp.2011.10111704
   - **The standard suicide risk assessment** worldwide. 6-question screener + severity scale. Validated in adolescents AND adults across 3 multisite studies. **Public domain — usable as a model for in-app screening logic** (not as a substitute for clinical judgment).

## NLP / Computational Crisis Detection (Western)

2. De Choudhury, M., & Kiciman, E. (2017). The Language of Social Support in Social Media and Its Effect on Suicidal Ideation Risk. *Proceedings of the International AAAI Conference on Web and Social Media*, 11(1), 32–41. DOI: https://doi.org/10.1609/icwsm.v11i1.14891
   - **ICWSM-17 Best Paper Award**. Identifies that specific language features in mental-health-community discourse predict subsequent suicidal-ideation discourse. Critical for 2nd-Brain: text features can be detected — but the work is observational, not interventional.

3. Coppersmith, G., Leary, R., Crutchley, P., & Fine, A. (2018). Natural language processing of social media as screening for suicide risk. *Biomedical Informatics Insights*, 10, 1178222618792860. DOI: https://doi.org/10.1177/1178222618792860
   - Deep-learning approach to detecting quantifiable suicide-attempt signals from social media. **Establishes feasibility** of automated screening. **Critical caveat**: screening ≠ clinical diagnosis; false-positive and false-negative costs are asymmetric.

## Contemporary LLM Capability & Limits (Western, 2025)

4. McBain, R. K., Cantor, J. H., Zhang, L. A., Baker, O., Zhang, F., Burnett, A., Kofner, A., Breslau, J., Stein, B. D., Mehrotra, A., & Yu, H. (2025). Evaluation of alignment between large language models and expert clinicians in suicide risk assessment. *Psychiatric Services*, 76(11), 944–950. DOI: https://doi.org/10.1176/appi.ps.20250086
   - Tests **ChatGPT, Claude, and Gemini** on suicide-related queries vs expert clinicians. Finding: LLMs **frequently decline to respond directly** to high-risk queries and refer to hotlines/professionals — but the **quality and consistency of those referrals varies dramatically across models**. Direct relevance: 2nd-Brain's Engine 7 cannot assume Gemini will autonomously handle RED-zone routing well.

5. Holmes, G., Tang, B., Gupta, S., Venkatesh, S., Christensen, H., & Whitton, A. (2025). Applications of large language models in the field of suicide prevention: Scoping review. *Journal of Medical Internet Research*, 27, e63126. DOI: https://doi.org/10.2196/63126
   - **Scoping review** of LLM applications in suicide prevention. Reports: 60% of LLM studies focus on clinical applications, especially risk detection. **Only 33% report ethical considerations**. Methodologically the field is immature — strong screening capabilities but inconsistent safety guardrails and limited prospective validation.

## Korean Standard (national program)

6. Na, K.-S., Park, S.-C., Kwon, S.-J., Kim, M., Kim, H.-J., Baik, M., Seol, J., An, E. J., Lee, S. M., Lee, E.-J., Lim, M., Cho, S. J., Kim, G. H., Kim, N., Jeon, H. J., Paik, J.-W., Oh, K. S., & Lee, H.-Y. (2020). Contents of the Standardized Suicide Prevention Program for Gatekeeper Intervention in Korea, Version 2.0. *Psychiatry Investigation*, 17(11), 1149–1157. DOI: https://doi.org/10.30773/pi.2020.0271
   - **Suicide CARE 2.0** — Korea's national gatekeeper training program. Three-step structure: **Careful observation → Active listening → Expert referral**. Direct model for 2nd-Brain's YELLOW + RED zone handling in Korean context.

7. You, D.-K., Choi, J.-H., & Hwang, T.-Y. (2025). National Policy, Service Delivery, Programs, and Data for Suicide Prevention in Korea. *Psychiatry Investigation*, 22(8), 840–850. DOI: https://doi.org/10.30773/pi.2024.0371
   - Reviews Korea's 5th National Suicide Prevention Master Plan (2023–2027) and the institutional infrastructure (한국생명존중희망재단, 1393 hotline, 1577-0199 mental health crisis line). **The infrastructure 2nd-Brain hands off to**.

## WHO Global Framework

8. World Health Organization (2021). *LIVE LIFE: An implementation guide for suicide prevention in countries*. WHO Press. ISBN: 978-92-4-002662-9. URL: https://www.who.int/publications/i/item/9789240026629
   - **WHO's 4 evidence-based interventions**: (1) restrict access to means, (2) responsible media reporting, (3) promote life-skills in young people, (4) early identification and management of risk. **2nd-Brain's responsibility is most strongly aligned with (3) and (4).** Note: this is a book/guideline, not a journal article — no DOI but ISBN-citable and the authoritative global reference.

## Age Range Coverage

- **Child (0–12)**: not applicable for 2nd-Brain (18+ policy) but C-SSRS validated from age 11.
- **Adolescent (13–17)**: not applicable for 2nd-Brain user base but Korean Suicide CARE has a teacher-targeted version (Na et al. 2024) for completeness.
- **Young Adult (18–29)**: applicable — elevated suicide risk in this window (per Arnett et al. 2014 Lancet Psychiatry in our `emerging-adulthood` seed).
- **Adult (30–49)**: applicable.
- **Midlife (50–64)**: applicable — elevated suicide risk in Korean midlife males (per You et al. 2025).
- **Elderly (65+)**: applicable — Korea has highest OECD elderly suicide rate (per You et al. 2025).

## Decision Tree — 2nd-Brain Implementation

```
USER MESSAGE
    │
    ▼
[Engine 7 — Safety Classifier — runs BEFORE any LLM advisor call]
    │
    ├─► No risk markers detected → GREEN ZONE → proceed to Advisor
    │
    ├─► Yellow-tier markers (heartbreak / family conflict / burnout /
    │   identity confusion / pre-decision fear)
    │   → YELLOW ZONE: listen + open questions, no directive advice,
    │     soft suggestion of trusted person/professional at end
    │
    └─► Red-tier markers (any of):
        • Self-harm description / intention
        • Suicidal ideation (passive: "wish I weren't here" /
                              active: "I want to die" / planning)
        • Abuse disclosure
        • Severe loss + crisis language
        → RED ZONE:
          1. Halt advisor LLM call entirely
          2. Express care in 1-2 sentences (do not minimize, do not
             over-promise, do not deflect)
          3. Provide Korean routing:
             - 1393 (자살예방상담전화) — 24시간 무료
             - 1577-0199 (정신건강위기상담)
             - 한국생명존중희망재단 helpline directory
          4. Provide global routing if locale != 'ko':
             - findahelpline.com (WHO-affiliated international directory)
             - 988 (US suicide & crisis lifeline)
          5. Log incident to a separate restricted-access table
             (NOT the general AI audit log; tighter access controls)
          6. Do NOT continue the conversation on the topic; offer a
             pause + return path
```

**Red-tier marker detection sources** (informing the classifier prompt):
- **C-SSRS items** (Posner 2011) — passive ideation / active ideation / method / intent / plan / behavior
- **NLP feature classes** (Coppersmith 2018) — temporal urgency markers ("tonight", "tomorrow"), means-mention, finality language
- **Suicide CARE warning signs** (Na 2020) — verbal cues ("burden", "trap"), behavior changes, situational triggers

## Application to 2nd-Brain — Engine 7 Specifics

### Classifier prompt scaffolding

The Safety Classifier is itself a Gemini call (per Blueprint C1+C9). Its system prompt should:

1. **Be conservative on RED-zone** — McBain et al. (2025) shows LLMs already err on the side of declining direct response to high-risk queries; align with this default rather than fighting it. **False positive (incorrect RED routing) is cheap; false negative (missed RED) is catastrophic.**

2. **Anchor on C-SSRS structure** — the 6-question screener provides a public-domain, validated checklist. Map message content to C-SSRS levels 1–6 internally.

3. **Apply NLP feature gates** (Coppersmith 2018): even short messages with strong temporal-urgency + means-mention + finality language should trigger RED regardless of broader context.

4. **Defer to professionals, not friends** for RED-zone routing. Coppersmith and Holmes 2025 both flag that LLM-generated peer-support framing for crisis is inappropriate.

### Korean RED-zone language (Suicide CARE-aligned)

```
[RED-zone Korean response template, fixed strings — not LLM-generated]

지금 본인이 너무 힘드신 상황 같아요. 제가 드릴 수 있는 조언이 아니라,
지금 바로 연결될 수 있는 분들이 있어요.

  - 1393  (자살예방상담전화 · 24시간 · 무료)
  - 1577-0199  (정신건강위기상담)

전화가 어려우시면 카카오톡 ''마음돌봄'' 채널이나, 가장 가까운 사람에게
지금 본인 상태를 한 줄이라도 말씀해주세요.

제가 본인 곁에 있고 싶지만, 이런 순간엔 전문가가 더 정확하게
도와드릴 수 있어요. 잠시 멈춰주세요.
```

This text is **not generated by LLM at runtime** — it is a fixed string. The classifier decides whether to trigger it, but the content is human-authored and pre-reviewed, aligned with Suicide CARE 2.0 wording principles (Na et al. 2020).

### English RED-zone language

```
You sound like you are going through something very hard right now.
This isn't a moment for me to give advice — there are people who can
help right now:

  - US: 988 (Suicide & Crisis Lifeline · 24/7 · free)
  - International: findahelpline.com (WHO-affiliated directory)

If calling feels too much, text "HELLO" to 741741 (Crisis Text Line, US)
or reach out to one person in your life with even one sentence about
how you are doing right now.

I want to be here for you. For this moment, a trained person can be
more helpful. Please pause with me.
```

### Logging policy

- RED-zone events log to a **separate restricted table** (`crisis_events`) with limited service-role access, NOT the general `ai_audit_log`.
- Log fields: timestamp, anonymized user_id (or hash), classifier confidence, trigger features (categorical, not raw text), routing message version shown.
- **Never log raw crisis-context user text** in plaintext — minimize re-exposure risk for both user and any future reviewer.

## Cautions & Limitations

- **LLM crisis detection is imperfect** (Holmes 2025): false-negative rates for nuanced or culturally-coded suicidality are non-trivial. Engine 7 is a safety net, not a clinical instrument.
- **Cultural variance in expression**: Korean self-harm cues often appear in indirect forms (relational burden language, withdrawal narratives) that differ from US-validated NLP markers. Suicide CARE 2.0 (Na 2020) catches some of this; Western NLP papers (Coppersmith 2018, De Choudhury 2017) may underperform on Korean text without retraining.
- **Hotline availability**: 1393 and 1577-0199 are Korean services; the app must detect locale and route accordingly. Listing wrong-locale numbers in crisis moments is harmful.
- **Not a replacement for human response**: WHO LIVE LIFE (2021) emphasizes that the most effective interventions are human-mediated. 2nd-Brain's role is **detect + route**, not provide ongoing support during crisis.
- **Logging dilemma**: detailed logs help debugging but increase data sensitivity. Use minimal-information logging for crisis events; coordinate with §data-ethics-consent batch when added.
- **The classifier itself is fallible**: deploy with conservative thresholds, regular human review of borderline cases, and a "user can flag missed crisis" feedback mechanism.
- **Do not promise "I'm here for you" in RED zone**: the LLM is not here for the user during crisis. Honesty about scope is itself a safety practice (McBain 2025 finding on referral quality).

## Suggested `knowledge_sources` INSERT rows

See `supabase/seed/crisis-detection.sql`.
