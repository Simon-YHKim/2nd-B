# Lexicon Jurisdiction Matrix · v0.1

> **What this is**: a one-page legal map for the 2nd-Brain analysis system.
> Maps each Tier-1 jurisdiction's relevant law to the words / features /
> framings that would trigger it, plus our chosen mitigation.
>
> **Why**: the analysis system (Behavior Taxonomy + framework matrix + Voice
> layer) introduces a new vocabulary surface — IQ scores, percentile claims,
> "you are X type" verdicts — that the existing CLAUDE.md §3 clinical lexicon
> doesn't fully cover. Without an explicit map we ship blind into the EU AI
> Act, US Psychology Practice Acts, and KR 의료법.
>
> **Source for §10**: external session `Analysis System Design v0.22`
> (26.05.27 KST) — three Tier-1 / Tier-2 / Tier-3 buckets prioritized.
>
> **Companion doc**: `docs/legal/lexicon-draft-v0.1.md` (words + replacements).

---

## Tier 1 — Must comply (launch-blocking risk)

### 🇪🇺 EU · AI Act (Regulation (EU) 2024/1689)

- **Hook**: Article 5(1)(g) bans "biometric categorisation systems that
  categorise … natural persons on the basis of … personality traits".
  Annex III §1c marks "emotion recognition" as high-risk.
- **Our exposure (today)**: text-only input → personality/cognition
  inferences. Text is **not** biometric data per EU AI Act definitions
  (biometric = "specific technical processing relating to physical,
  physiological or behavioural characteristics … allowing the unique
  identification of a natural person", Art. 3(34)). We're outside §5(1)(g)
  as long as we stay text-only.
- **Tripwires** (the moment we cross any of these, we re-enter high-risk):
  - Adding voice/face/biometric emotion detection.
  - Using analysis output for advertising targeting, hiring, credit scoring,
    or insurance.
  - Marketing the app as "emotion recognition" or "personality testing for
    employers".
- **Mitigation framing** (the v0.22 §10 decision): position the product as
  a *"self-reflection structuring tool"*, not *"personality assessment"*
  and not *"emotion recognition"*. The lexicon below enforces this framing.

### 🇪🇺 EU · GDPR (Reg. 2016/679) Article 9

- **Hook**: data "concerning health" or "concerning a natural person's sex
  life or sexual orientation" is a special category. EDPB Guidelines 03/2020
  treats inferred mental-health categorisations as Art. 9 data.
- **Our exposure**: any field that infers depression/anxiety scores or
  diagnoses is Art. 9 → explicit consent + DPIA mandatory.
- **Mitigation**: the lexicon hard-bans diagnosis-style outputs. The Voice
  layer (per v0.22 §07) translates Ledger facts into self-reflection
  language, never clinical labels.

### 🇺🇸 US · State Psychology Practice Acts

- **Hook**: nearly every state criminalises unlicensed use of titles or
  services such as "psychologist", "psychotherapy", "psychological
  evaluation", "diagnose" outside a licensed practice. Examples:
  - California Bus. & Prof. Code §2903 (unauthorised practice of psychology).
  - New York Education Law §7605 (use of title).
  - Texas Occupations Code §501.003.
- **Our exposure**: the app is not a licensed practice; using these titles
  in copy is direct legal risk.
- **Mitigation**: lexicon bans those titles in any user-facing surface +
  Apple/Google store listings.

### 🇺🇸 US · FTC Act §5 (15 U.S.C. §45)

- **Hook**: "deceptive" claims include health/efficacy claims unsupported
  by competent and reliable scientific evidence. The FTC has settled
  multiple "brain-training" apps (Lumos Labs 2016 — $2M) for this.
- **Our exposure**: claims like "scientifically proven", "clinically
  validated", "increase your IQ", "improve your memory by X%".
- **Mitigation**: lexicon bans those claim shapes. Every score carries the
  v0.22 §03 `cold note` + theory-limitations field.

### 🇰🇷 KR · 의료법 §27 (무면허 의료행위 금지)

- **Hook**: "진단", "치료" 같은 어휘 + 의료행위 형식의 서비스 = 면허 없이
  하면 5년 이하 징역 / 5천만원 이하 벌금.
- **Our exposure**: 한국어 카피에 "진단", "치료", "처방", "정상/비정상"
  같은 단어가 들어가면 즉시 위험.
- **Mitigation**: 한국어 lexicon에 의료법 트리거어 hard ban. 대체어로
  "패턴 관찰", "자기 이해", "기록 정리" 사용. (이미 CLAUDE.md §3 에
  부분 적용 — 분석 시스템용으로 확장.)

---

## Tier 2 — Major markets (early follow-up, 출시 후 6개월)

| 시장 | 법령 | 핵심 트리거 |
|---|---|---|
| 🇬🇧 UK | UK GDPR + Online Safety Act 2023 | mental-health 표시는 special category. Children-facing 기능은 OSA category. |
| 🇯🇵 JP | 公認心理師法 (2017) | 公認心理師 명칭·業務 무자격 사용 금지. "心理アセスメント" 단어 위험. |
| 🇨🇦 CA | PIPEDA + Quebec Law 25 (2024) | sensitive personal info (mental health 포함) consent 강화. Quebec은 별도 책임자. |
| 🇦🇺 AU | AHPRA registration + Privacy Act 1988 | psychologist 명칭 보호. |
| 🇸🇬 SG | PDPA (2012) + HCSA (2024) | mental wellness service 정의 확장 — license 필요 가능. |

---

## Tier 3 — Monitor only (해당 시장 진입 결정 시)

| 시장 | 법령 |
|---|---|
| 🇧🇷 BR | LGPD |
| 🇮🇳 IN | DPDP Act 2023 |
| 🇨🇳 CN | PIPL |

---

## 의사결정 영향

이 매트릭스가 강제하는 것:

1. **Universal forbidden** (모든 Tier 1 공통): IQ, 지능지수, intelligence
   quotient, diagnose, diagnosis, therapy, psychotherapy, psychologist,
   psychological evaluation, treatment, cure, mental illness, disorder.
2. **Jurisdiction-specific**: "emotion recognition" (EU AI Act 트리거),
   "心理師" (JP), "정신건강의학", "정신질환" (KR 의료법 트리거).
3. **Claim shape ban** (FTC): "scientifically proven", "clinically validated",
   "increase your IQ", "boost your brainpower by N%".
4. **Replacement vocabulary**: "self-reflection structuring tool" /
   "thinking-style profile" / "patterns observed in your records" /
   "지금까지 기록에서 두드러지는 경향" / "사고 스타일 프로파일".
5. **Always paired with**: confidence level + theory source (DOI) + cold
   note (limitations field).

상세 단어 리스트 + 다국어 매핑은 `docs/legal/lexicon-draft-v0.1.md`.

---

## Legal review cycle

- 이 문서 + `lexicon-draft-v0.1.md` 는 **연 1회** 법적 리뷰 — 마지막 리뷰
  날짜를 `src/lib/safety/lexicon.ts` 의 `LEXICON_LAST_LEGAL_REVIEW` 에
  박음. CI는 1년 이상 경과 시 warning.
- 새 Tier 1/2 시장 진입 시 매트릭스 행 추가 + 외부 변호사 1회 리뷰 필수
  (특히 EU/US/JP).
- v0.2 → v0.3 트리거: legal review 완료 + 다국어 매핑 5개 언어 검증.

---

## 출처

- EU AI Act (Reg. 2024/1689) full text — https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- EU GDPR Art. 9 — https://gdpr-info.eu/art-9-gdpr/
- EDPB Guidelines 03/2020 (special categories) — https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-032020-processing-data-concerning-health-purpose_en
- CA Bus. & Prof. Code §2903 — https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=2903.&lawCode=BPC
- NY Education Law §7605 — https://www.nysenate.gov/legislation/laws/EDN/7605
- FTC Act §5 — https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act
- Lumos Labs FTC settlement (2016) — https://www.ftc.gov/news-events/news/press-releases/2016/01/lumosity-pay-2-million-settle-ftc-deceptive-advertising-charges-its-brain-training-program
- 의료법 §27 — https://www.law.go.kr/법령/의료법/제27조
- 公認心理師法 — https://elaws.e-gov.go.jp/document?lawid=427AC1000000068

---

**Source priority**: v0.22 설계도 §10 + 본 매트릭스. 코드(lexicon.ts)는
이 둘의 구현체이며, 의문이 있을 때는 본 매트릭스가 권위.
