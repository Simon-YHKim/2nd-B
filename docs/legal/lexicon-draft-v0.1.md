# Analysis Lexicon Draft · v0.1

> **What this is**: the actual word lists — Universal Forbidden + Jurisdiction-
> Specific + Recommended Replacements — that the analysis system enforces in
> both build-time CI (`scripts/check-forbidden-lexicon.ts`) and runtime LLM
> output classification.
>
> **Companion doc**: `docs/legal/lexicon-jurisdiction-matrix.md` (the *why*
> per jurisdiction).
>
> **Implementation**: `src/lib/safety/lexicon.ts` exports
> `ANALYSIS_UNIVERSAL_FORBIDDEN` and `ANALYSIS_JURISDICTION_FORBIDDEN` that
> CI scans and the classifier checks. This doc is the human-readable spec.

---

## 1. Universal Forbidden — never appears in any user-facing surface

These trigger risk in **every** Tier-1 jurisdiction. Hard ban.

### English (US / EU / UK / AU / CA / SG)

| Term | Why banned | Replacement |
|---|---|---|
| `IQ`, `intelligence quotient`, `IQ score` | FTC §5 unsupported claim + US Practice Acts | "thinking-style profile" |
| `diagnose`, `diagnosis`, `diagnosing` | EU GDPR Art.9 + US Practice Acts + KR 의료법 | "observed pattern" |
| `therapy`, `psychotherapy`, `therapeutic` | US Practice Acts + JP 公認心理師法 | "self-reflection" |
| `psychologist`, `psychological evaluation` | US/AU/JP unauthorised practice | "self-knowledge tool" |
| `treatment`, `cure`, `heal`, `healing` | EU/US/KR medical-claim risk | "growth", "practice" |
| `mental illness`, `mental disorder`, `psychiatric` | EU GDPR Art.9 + FTC §5 | "pattern", "tendency" |
| `scientifically proven`, `clinically validated`, `medically approved` | FTC §5 deceptive | "based on peer-reviewed frameworks" |
| `increase your IQ`, `boost brainpower`, `improve memory by N%` | FTC §5 deceptive efficacy | "support your reflection practice" |
| `you are X type`, `you have X disorder`, `X personality type` | absolute verdict — undermines Cold Note principle | "patterns observed so far suggest …" |
| `top N%`, `percentile N` (without population) | LLM hallucination if no real distribution | "compared with your own past records" |

### Korean (KR primary, also EU/US for KR diaspora)

| 단어 | 금지 사유 | 대체어 |
|---|---|---|
| `IQ`, `지능지수`, `아이큐` | FTC + 의료법 + 결과 단정 | "사고 스타일 프로파일" |
| `진단`, `진단하다`, `진단명` | 의료법 §27 + EU GDPR Art.9 | "패턴 관찰", "기록에서 보인 경향" |
| `치료`, `치유`, `처방` | 의료법 §27 무면허 의료행위 | "성장", "자기 이해" |
| `정신건강의학`, `정신과`, `정신질환` | 의료법 + EU GDPR Art.9 | "마음의 경향", "정서 패턴" |
| `심리치료`, `심리상담` (전문 면허 호칭) | 의료법 + 公認心理師法 (JP 교포) | "자기 이해 시간" |
| `정상`, `비정상`, `장애`, `결함` | 단정형 + 의료법 + 차별 | "흔히 보이는", "덜 보이는" |
| `우월`, `열등`, `우수`, `부족` | 가치 단정 + 차별 위험 | "두드러지는", "조용한" |
| `당신은 ~한 사람입니다` | absolute verdict | "지금까지 기록에서 …하는 경향이 두드러집니다" |
| `상위 N%`, `평균보다 N배` (모집단 없이) | 통계 없는 백분위 | "본인의 시간 축 안에서의 변화" |
| `과학적으로 입증된`, `임상적으로 검증된` | FTC §5 + 표시광고법 | "검토된 학술 프레임워크 기반" |
| `머리 좋은`, `똑똑한`, `명석한` | 가치 단정 (한국어 특수) | "사고 폭이 넓은", "정리 잘하는" |

---

## 2. Jurisdiction-Specific Forbidden

Triggered only when distributing to the named market. Universal list above
covers everywhere; this catches market-specific tripwires.

### EU (AI Act + GDPR)

- `emotion recognition` / `emotion detection` / `affective computing`
  — AI Act Annex III §1c high-risk trigger.
- `biometric categorisation` — Art. 5(1)(g) prohibited use.
- `personality assessment for employment` — Art. 5(1)(b) manipulative
  classification trigger.

### KR (의료법 / 정신건강복지법)

- `정신건강복지센터` (official institution name — implies affiliation)
- `정신질환자`, `우울증 환자` (clinical labeling — 정신건강복지법 §3
  보호 대상 호칭)
- `자살예방` (in product copy; reserved for licensed crisis services —
  use as crisis-routing destination only, never as product feature claim)

### JP (公認心理師法 + 医師法)

- `公認心理師`, `臨床心理士`, `心理師` (title protection)
- `精神療法`, `カウンセリング` (in conjunction with diagnosis claims)

### US (state-specific)

- `licensed practitioner`, `clinical evaluation`, `medical advice` — every
  state Practice Act trigger.
- `psychologist`-related compound words even in disclaimers ("we are not
  psychologists" is safer than "we provide psychological insights").

---

## 3. Recommended Replacement Map (multilingual)

| Concept | EN | KO | JP | ES | FR |
|---|---|---|---|---|---|
| Self-knowledge product positioning | "self-reflection tool" | "자기 이해 도구" | "自己理解ツール" | "herramienta de autorreflexión" | "outil d'auto-réflexion" |
| Output of analysis | "thinking-style profile" | "사고 스타일 프로파일" | "思考スタイルのプロファイル" | "perfil de estilo de pensamiento" | "profil de style de pensée" |
| What we observed | "patterns observed in your records" | "기록에서 보인 패턴" | "記録に見られた傾向" | "patrones observados en tus registros" | "schémas observés dans vos notes" |
| Disclaimer | "Observed patterns only — not verdicts or advice" | "패턴 관찰일 뿐, 단정이나 권고가 아니에요" | "観察されたパターンのみ。診断や助言ではありません" | "Solo patrones observados — no diagnósticos ni consejos" | "Modèles observés uniquement — pas de diagnostic ni de conseil" |
| Cold-note framing | "this could also be interpreted as …" | "이건 …로도 해석될 수 있어요" | "これは…とも解釈できます" | "esto también podría interpretarse como …" | "cela pourrait aussi être interprété comme …" |

---

## 4. Claim shapes — banned templates

Even with all individual words OK, certain *shapes* of claims trigger FTC §5
or EU AI Act framing risk. Banned templates:

- `[Product] proven to [outcome]`
- `[N]% increase in [cognitive ability]`
- `Clinically validated to [outcome]`
- `Doctors recommend [Product]`
- `You will [achieve outcome] in [N] days/weeks`
- `Replace your therapist with [Product]`
- `Find out your [diagnostic label]`

Safe templates:

- `Patterns observed across your [N] records`
- `Based on [framework name] (peer-reviewed, [year])`
- `One reading of this is … another reading would be …`
- `Your records over the last [N] days suggest …`
- `For deeper guidance, consult a licensed professional`

---

## 5. Versioning & legal review

- `LEXICON_VERSION`: `0.1`
- `LEXICON_LAST_LEGAL_REVIEW`: pending (set by external counsel review)
- Update cadence: annual minimum + on new market entry.
- CI must warn when `Date.now() - LAST_LEGAL_REVIEW > 365d`.

---

## 6. CI integration plan

1. `src/lib/safety/lexicon.ts` adds two new exports:
   - `ANALYSIS_UNIVERSAL_FORBIDDEN: Record<Locale, readonly string[]>`
   - `ANALYSIS_JURISDICTION_FORBIDDEN: Record<Jurisdiction, readonly string[]>`
2. `scripts/check-forbidden-lexicon.ts` extends `containsForbiddenLexicon`
   to also check the analysis lists. Failures grouped by source list.
3. New test in `src/lib/safety/__tests__/analysis-lexicon.test.ts` asserts
   every term in this doc is mirrored in code (single SoT in lexicon.ts).

---

**Source**: v0.22 설계도 §10 + lexicon-jurisdiction-matrix.md.
**Status**: v0.1 draft. Counsel review pending before flipping to v1.0.
