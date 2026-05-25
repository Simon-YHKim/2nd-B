-- Emerging Adulthood (Arnett) — verified knowledge sources
-- Batch source: docs/research/batches/emerging-adulthood.md
-- DOIs verified against Crossref / publisher record / KCI (May 2026).

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Emerging adulthood: A theory of development from the late teens through the twenties',
    ARRAY['Jeffrey Jensen Arnett'],
    '10.1037/0003-066X.55.5.469',
    'https://doi.org/10.1037/0003-066X.55.5.469',
    'emerging_adulthood',
    'young_adult',
    'en',
    now(),
    '18–29세를 청소년기도 청년기도 아닌 별개의 발달 단계(성인진입기)로 제안한 이론 논문. 정체감 탐색·불안정성·자기집중·중간 느낌·가능성의 5가지 특징.',
    'Foundational paper proposing emerging adulthood (18–29) as a distinct life stage with five features: identity exploration, instability, self-focus, feeling in-between, possibilities.',
    '18–29 사용자에게 ''in-between'' 느낌이 정상화되는 학술 근거. 단 Côté 비판도 함께 적재해 균형 유지.'
  ),
  (
    'The new life stage of emerging adulthood at ages 18–29 years: implications for mental health',
    ARRAY['Jeffrey Jensen Arnett','Rita Žukauskienė','Kazumi Sugimura'],
    '10.1016/S2215-0366(14)00080-7',
    'https://doi.org/10.1016/S2215-0366(14)00080-7',
    'emerging_adulthood',
    'young_adult',
    'en',
    now(),
    '미국·유럽·일본 등 지역별 성인진입기 양상과 정신건강 함의를 정리한 Lancet Psychiatry 리뷰. 이 단계에서 우울·불안·정체감 혼란 위험이 상승하지만 병리는 아님을 강조.',
    'Lancet Psychiatry review of emerging adulthood across regions (US, Europe, Japan) and its mental-health implications. Depression, anxiety, and identity confusion are elevated in this window without indicating pathology.',
    '성인진입기 사용자의 정서 변동을 ''위험 신호''가 아닌 ''단계 특성''으로 우선 해석. 단 Safety Classifier 위임 임계치 이상은 별개 경로.'
  ),
  (
    'The dangerous myth of emerging adulthood: An evidence-based critique of a flawed developmental theory',
    ARRAY['James E. Côté'],
    '10.1080/10888691.2014.954451',
    'https://doi.org/10.1080/10888691.2014.954451',
    'emerging_adulthood',
    'young_adult',
    'en',
    now(),
    'Arnett의 성인진입기 개념을 방법론·증거 측면에서 비판한 주요 반론 논문. 구조적 실업과 주거 위기를 발달 단계로 정상화하는 것이 청년에게 경제·정서적 해를 끼친다고 주장.',
    'Principal published critique of Arnett''s framework. Argues that the construct pathologizes structural unemployment and housing precarity as a developmental phase, with documented economic and emotional harms.',
    'Advisor가 구조적 제약(취업난·주거비·가족 압박)을 ''탐색 단계''로 reframing하지 않도록 가드. 구조 문제를 명명할 것.'
  ),
  (
    'Validation of the Korean Inventory of the Dimensions of Emerging Adulthood (K-IDEA)',
    ARRAY['김대희','김명식'],
    '10.23844/kjcp.2024.08.36.3.905',
    'https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART003111319',
    'emerging_adulthood',
    'young_adult',
    'ko',
    now(),
    '한국 18–29세 500명 표본으로 IDEA 척도를 번안·타당화. 5요인(정체감 탐색/가능성, 부정성/불안정성, 타자 집중, 자기 집중, 중간 느낌) 구조 확인.',
    'Validates the Korean IDEA in 500 Korean adults aged 18–29. Confirms a 5-factor structure: identity exploration/possibilities, negativity/instability, other-focus, self-focus, feeling in-between.',
    '한국 사용자의 ''타자 집중(other-focus)'' 차원은 Western IDEA에는 약한 특징. 한국형 인터뷰는 self-discovery만이 아니라 가족·관계 의무를 함께 묻도록 구성.'
  );
