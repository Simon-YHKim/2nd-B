-- Interpersonal Relationships (Wiggins IPC + Gottman + IIP-32 + Korean couples)
-- Batch source: docs/research/batches/interpersonal.md
-- DOIs verified against Crossref / publisher record, May 2026.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'A psychological taxonomy of trait-descriptive terms: The interpersonal domain',
    ARRAY['Jerry S. Wiggins'],
    '10.1037/0022-3514.37.3.395',
    'https://doi.org/10.1037/0022-3514.37.3.395',
    'interpersonal',
    'adult',
    'en',
    now(),
    '대인 영역의 trait 어휘를 인자 분석해 ''주도성(agency)''과 ''친교성(communion)'' 두 축으로 정리한 Wiggins 대인 원형(IPC) 모델의 출발 논문. 이후 IIP 등 모든 대인 측정의 구조적 기반.',
    'Factor-analytic taxonomy of interpersonal trait-descriptive terms establishing the two-dimensional interpersonal circumplex (IPC): agency (dominant↔submissive) and communion (warm↔cold). Structural foundation for all subsequent IPC-based instruments including the IIP.',
    'Advisor의 대인 패턴 분석은 ''유형''이 아닌 IPC 2축 좌표로. 사용자에게 라벨 부착 금지, 패턴 묘사만.'
  ),
  (
    'Psychometric evaluation of the Inventory of Interpersonal Problems 32',
    ARRAY['Cassandra Bailey','Anna Abate','Carla Sharp','Amanda Venta'],
    '10.1521/bumc.2018.82.2.93',
    'https://doi.org/10.1521/bumc.2018.82.2.93',
    'interpersonal',
    'adult',
    'en',
    now(),
    'IIP-32(Inventory of Interpersonal Problems 32항목 단축형)의 심리측정 평가. IPC 8개 octant 구조(Domineering/Intrusive/Overly Nurturant/Overly Accommodating/Non-assertive/Socially Avoidant/Cold/Vindictive)의 신뢰도·타당도 확인.',
    'Psychometric evaluation of IIP-32, the 32-item brief form of the Inventory of Interpersonal Problems. Validates the 8-octant circumplex structure (Domineering, Intrusive, Overly Nurturant, Overly Accommodating, Non-assertive, Socially Avoidant, Cold, Vindictive) with appropriate reliability and validity.',
    '저널 엔트리에서 대인 문제 패턴 8 octant 매핑의 학술 근거. 단 자기보고와 dyadic observation은 다름을 명시.'
  ),
  (
    'The Timing of Divorce: Predicting When a Couple Will Divorce Over a 14-Year Period',
    ARRAY['John M. Gottman','Robert W. Levenson'],
    '10.1111/j.1741-3737.2000.00737.x',
    'https://doi.org/10.1111/j.1741-3737.2000.00737.x',
    'interpersonal',
    'adult',
    'en',
    now(),
    '14년 종단연구로 부부 이혼 시점 예측 모델 검증. 갈등 중 부정 정서(criticism/defensiveness/contempt/stonewalling — ''Four Horsemen'')는 조기 이혼을 예측. 다른 변수가 후기 이혼을 예측. Gottman 연구 프로그램의 핵심.',
    'Longitudinal 14-year prospective study of marital outcomes establishing that different variables predict early vs late divorce. Negative affect during conflict (the "Four Horsemen": criticism, defensiveness, contempt, stonewalling) predicts early divorce. Anchor study for Gottman''s research program.',
    'Four Horsemen 어휘를 trait extraction의 risk marker로 사용. 단 단일 entry로 결론짓지 않고 패턴 빈도로 추적.'
  ),
  (
    'Gender role attitude, communication quality, and marital satisfaction among Korean adults',
    ARRAY['Jieun Yoo'],
    '10.1080/13229400.2020.1791230',
    'https://doi.org/10.1080/13229400.2020.1791230',
    'interpersonal',
    'adult',
    'ko',
    now(),
    '한국 성인 부부 표본 연구. 전통-평등 성역할 태도 차이가 의사소통 질과 부부 만족도에 강하게 작용. 한국 부부 만족 연구의 맥락 변수로 성역할 기대 차이가 핵심.',
    'Study of Korean adult couples showing that traditional-vs-egalitarian gender role attitudes strongly moderate communication quality and marital satisfaction. Identifies role-expectation gap as a key contextual variable in Korean couple research.',
    '한국 사용자의 가족/배우자 entry 해석 시 성역할 기대 맥락을 우선 점검. Western 의사소통 처방을 직접 적용하지 말 것.'
  );
