-- Family-of-origin developmental influence — self-understanding lens.
-- YouTube-gap P3 (childhood / toxic parents = high demand). Developmental, NON-
-- clinical: how the family one grew up in shapes adult relating, via the
-- differentiation-of-self construct (Bowen tradition, operationalized). Never
-- blame-framing, never diagnosis; crisis/abuse markers route to crisis-detection
-- FIRST. DOI verified via Crossref.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'The Differentiation of Self Inventory: Development and Initial Validation',
    ARRAY['Elizabeth A. Skowron','Myrna L. Friedlander'],
    '10.1037/0022-0167.45.3.235',
    'https://doi.org/10.1037/0022-0167.45.3.235',
    'family_of_origin',
    'adult',
    'en',
    now(),
    '''자기분화''(differentiation of self): 가족과 정서적으로 연결돼 있으면서도 자기 입장(I-position)을 지키는 능력. 네 측면 — 정서적 반응성, 타인과의 융합, 정서적 단절, 자기 입장 — 으로 측정. 원가족에서 형성된 패턴이 성인기 관계 방식에 이어진다는 점을, 결정론이 아니라 ''현재 다룰 수 있는 차원''으로 제시.',
    'Differentiation of self: the capacity to keep one''s own position (I-position) while staying emotionally connected to family. Measured across four facets — emotional reactivity, fusion with others, emotional cutoff, and I-position. Frames family-of-origin patterns as carrying into adult relating, not as destiny but as a present-tense dimension one can work with.',
    'family_of_origin 근거. Advisor가 ''부모/어린 시절 때문에''류 입력을 다룰 때 반응성·융합·단절·자기입장 중 어디인지로 비춤. 부모를 비난하거나 진단하지 않고, 본인이 지금 조절할 수 있는 부분에 초점. 학대·위기 시 crisis-detection 우선.'
  );
