-- Data Ethics, Consent & Regulatory Boundaries
-- Batch source: docs/research/batches/data-ethics-consent.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- Framework slug: 'data_ethics' — addresses AI mental wellbeing
-- consent + Korean PIPA + AI Framework Act compliance grounding.
-- Note: PIPA, AI Framework Act, OECD AI Principles, and APA AI ethics
-- guidance are referenced in the markdown but not added as rows here
-- because they are legal/policy documents without academic DOIs.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Ethical decision-making guidelines for mental health clinicians in the artificial intelligence (AI) era',
    ARRAY['Yegan Pillay'],
    '10.3390/healthcare13233057',
    'https://doi.org/10.3390/healthcare13233057',
    'data_ethics',
    'adult',
    'en',
    now(),
    '정신건강 임상가를 위한 AI 시대 윤리적 의사결정 가이드라인(2025). 옵트인 동의, 편향 감사, 투명성, 진료 범위 경계, HIPAA/동등 준수. ''이중 동의''(치료용 + 기술용) 권고. 2nd-Brain의 동의 흐름이 이 이중 구조를 반영해야 함.',
    'Ethical decision-making guidelines for mental health clinicians in the AI era (2025). Covers opt-in consent, bias auditing, transparency, scope-of-practice boundaries, HIPAA/equivalent compliance. Recommends dual consent — one for treatment, one for technology used to deliver it. 2nd-Brain''s consent flow should mirror this dual structure.',
    'PIPA Article 23 sensitive data consent + APA AI mediation consent + 일반 서비스 동의 — 3개 체크박스 onboarding 설계의 학술 근거.'
  );
