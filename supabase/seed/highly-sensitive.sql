-- Highly sensitive / Sensory Processing Sensitivity — self-understanding lens.
-- YouTube-gap P2. A validated TRAIT (not a disorder): ~20-30% of people process
-- stimuli more deeply and react more strongly. Framing stays non-pathologizing —
-- a temperament dimension, never a condition. All DOIs verified against Crossref.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Sensory-Processing Sensitivity and Its Relation to Introversion and Emotionality',
    ARRAY['Elaine N. Aron','Arthur Aron'],
    '10.1037/0022-3514.73.2.345',
    'https://doi.org/10.1037/0022-3514.73.2.345',
    'sensitivity',
    'adult',
    'en',
    now(),
    '감각처리민감성(SPS)은 정보를 더 깊이 처리하고 자극에 더 강하게 반응하는 정상적 기질 특성으로, 내향성이나 정서불안과는 구별되는 독립 차원이다. ''너무 예민하다''는 결함이 아니라 약 15~20%에게서 나타나는 기질의 한 형태임을 보여준다(HSP 척도의 출발점).',
    'Sensory-processing sensitivity (SPS) is a normal temperament trait of deeper processing and stronger reactivity to stimuli, a distinct dimension from introversion and emotionality. Being "too sensitive" is not a defect but a temperament form present in roughly 15-20% of people (origin of the HSP scale).',
    'self-understanding 렌즈. ''내가 너무 예민한가''류 입력에 결함이 아닌 기질 차원으로 비춤. 진단·교정 금지, 본인 반응 패턴을 정상화하는 성찰만.'
  ),
  (
    'Dandelions, Tulips and Orchids: Evidence for the Existence of Low-Sensitive, Medium-Sensitive and High-Sensitive Individuals',
    ARRAY['Francesca Lionetti','Arthur Aron','Elaine N. Aron','G. Leonard Burns','Jadzia Jagiellowicz','Michael Pluess'],
    '10.1038/s41398-017-0090-6',
    'https://doi.org/10.1038/s41398-017-0090-6',
    'sensitivity',
    'adult',
    'en',
    now(),
    '민감성은 ''예민/둔감'' 이분법이 아니라 연속선이다. 906명 분석에서 세 집단이 나타남 — 고민감(orchid, 31%), 중간(tulip), 저민감(dandelion, 29%). 즉 대부분은 중간이며, 높은 민감성은 비정상이 아니라 분포의 한쪽 끝이다.',
    'Sensitivity is a continuum, not a sensitive/insensitive binary. In 906 adults, three groups emerged — high (orchids, 31%), medium (tulips), and low (dandelions, 29%). Most people are in the middle; high sensitivity is one end of a distribution, not an abnormality.',
    'Advisor가 민감성을 다룰 때 ''예민 vs 무던'' 라벨 대신 정도(degree)로 비춤. 본인이 분포의 어디쯤이라 느끼는지 되돌아보는 질문으로.'
  ),
  (
    'Sensory Processing Sensitivity in the Context of Environmental Sensitivity: A Critical Review and Development of Research Agenda',
    ARRAY['Corina U. Greven','Francesca Lionetti','Charlotte Booth','Elaine N. Aron','Elaine Fox','Michael Pluess'],
    '10.1016/j.neubiorev.2019.01.009',
    'https://doi.org/10.1016/j.neubiorev.2019.01.009',
    'sensitivity',
    'adult',
    'en',
    now(),
    '환경 민감성(Environmental Sensitivity) 관점: 민감한 사람은 부정적 환경에 더 영향을 받을 뿐 아니라 ''좋은 환경에서 더 많이 얻는다''(vantage sensitivity). 민감성은 단순한 취약성이 아니라, 맥락에 따라 약점도 강점도 될 수 있는 양날의 특성이다.',
    'The Environmental Sensitivity view: highly sensitive people are not only more affected by negative environments but also benefit MORE from positive ones (vantage sensitivity). Sensitivity is not mere vulnerability but a double-edged trait that can be a strength or a cost depending on context.',
    'Advisor cue: 민감성을 약점으로만 보는 입력에 ''좋은 환경에서 더 얻는 면''을 한 줄로 비춤. 어떤 환경이 본인을 살리는지 성찰하는 질문으로.'
  );

-- Korean-context validation (④). KCI-indexed; url-only (no DOI) satisfies C8.
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    '한국판 매우 민감한 사람 척도(K-HSPS-18)의 재타당화',
    ARRAY['손옥선','김진숙'],
    NULL,
    'https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART002749199',
    'sensitivity', 'adult', 'ko', now(),
    '한국 성인 925명에서 HSP 척도를 18문항·4요인으로 재타당화 — 흥분 용이성·낮은 감각 역치·심미적 민감성, 그리고 한국 고유의 ''눈치(Nunchi)'' 요인. 민감성 수준은 orchid 22.6% / healthy orchid 3.1% / tulip 54.7% / dandelion 19.5%로 분류. 한국인의 민감성에 문화 특수성이 있음을 시사.',
    'Revalidation of the HSP scale in 925 Korean adults (K-HSPS-18, four factors including a culturally unique Nunchi factor); sensitivity groups orchid 22.6% / healthy orchid 3.1% / tulip 54.7% / dandelion 19.5%.',
    '한국어 사용자의 민감성을 ''눈치''를 포함한 한국 맥락으로 비추는 근거. 민감성을 결함이 아닌 정도·문화적 특성으로.'
  );
