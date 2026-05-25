-- Growth Mindset (Dweck) — verified knowledge sources
-- Batch source: docs/research/batches/growth-mindset.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- Note: includes both supporting (Yeager & Dweck) and critical
-- (Macnamara & Burgoyne) recent literature for balanced Advisor framing.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'A social-cognitive approach to motivation and personality',
    ARRAY['Carol S. Dweck','Ellen L. Leggett'],
    '10.1037/0033-295X.95.2.256',
    'https://doi.org/10.1037/0033-295X.95.2.256',
    'growth_mindset',
    'lifespan',
    'en',
    now(),
    '암묵적 능력 이론(entity vs incremental)과 학습 목표 지향성이 행동·정서 패턴(helpless vs mastery-oriented)을 어떻게 만드는지 설명한 Dweck의 핵심 이론 논문.',
    'Foundational theoretical paper distinguishing entity vs incremental theories of ability and showing how they drive helpless vs mastery-oriented response patterns under difficulty.',
    '저널에서 ''난 원래 ~ 사람''(entity) vs ''아직 ~ 못함''(incremental) 어휘 차이를 잡아내는 trait extraction 근거.'
  ),
  (
    'What can be learned from growth mindset controversies?',
    ARRAY['David S. Yeager','Carol S. Dweck'],
    '10.1037/amp0000794',
    'https://doi.org/10.1037/amp0000794',
    'growth_mindset',
    'adolescent',
    'en',
    now(),
    'Growth mindset 연구에 대한 비판을 정면으로 다룬 Dweck 진영 응답. 효과 크기는 작지만 의미 있고 이질적이며, 환경적 지지가 동반될 때만 작동함을 명시.',
    'Authors'' response to growth mindset critiques. Defends modest but meaningful and heterogeneous effects; emphasizes that mindset alone, without supportive context, does not change outcomes.',
    'Advisor가 ''마음만 바꾸면 된다''로 과장하지 않도록 가드. 환경 지지 동반 권유.'
  ),
  (
    'Do growth mindset interventions impact students'' academic achievement? A systematic review and meta-analysis with recommendations for best practices',
    ARRAY['Brooke N. Macnamara','Alexander P. Burgoyne'],
    '10.1037/bul0000352',
    'https://doi.org/10.1037/bul0000352',
    'growth_mindset',
    'adolescent',
    'en',
    now(),
    '63개 연구(N≈97,000) 메타분석으로 growth mindset 개입의 학업 성취 효과를 검증. 전체 효과 d≈0.05, 출판편향 보정 후 비유의, 고품질 연구에서 d≈0.02. 효과 주장은 연구 설계 결함과 보고 편향에 기인.',
    'Meta-analysis of 63 studies (N≈97,000) on growth mindset interventions and academic achievement. Overall d≈0.05, non-significant after publication-bias correction; highest-quality studies d≈0.02. Argues apparent effects stem from study design flaws and reporting bias.',
    'Advisor가 growth mindset을 ''성취 향상 도구''로 약속하지 않도록 가드. 자기이해 어휘로만 사용, 개입 효과는 보수적으로 표기.'
  );
