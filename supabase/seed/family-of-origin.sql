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

-- Korean-context validation (④). KCI-indexed; url-only (no DOI) satisfies C8.
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    '한국형 자기분화 척도 개발과 타당성에 관한 연구',
    ARRAY['정혜정','조은경'],
    NULL,
    'https://www.kci.go.kr/kciportal/landing/article.kci?arti_id=ART001064523',
    'family_of_origin', 'adult', 'ko', now(),
    '한국형 자기분화 척도를 개발·타당화. 정서적 반응성·자기 입장·정서적 단절·타인과의 융합에 더해, 한국인에게 특히 두드러지는 ''정서적 융합'' 차원을 별도로 둠 — 가족 상호의존이 높은 한국 맥락의 분화를 서구 모델 그대로 적용하지 말아야 함을 시사.',
    'Develops/validates a Korean Differentiation of Self scale, adding an emotional-fusion dimension regarded as particularly salient for Koreans — signaling that differentiation in high-interdependence Korean contexts should not be read off the Western model directly.',
    '한국어 사용자의 자기분화를 ''정서적 융합''을 포함한 한국 맥락으로 비추는 근거. 높은 가족 상호의존을 낮은 분화로 오해 금지(cross-cultural-east-asian 교차).'
  );
