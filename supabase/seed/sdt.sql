-- Self-Determination Theory (SDT) — verified knowledge sources
-- Batch source: docs/research/batches/sdt.md
-- DOIs verified against Crossref / publisher record, May 2026.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being',
    ARRAY['Richard M. Ryan','Edward L. Deci'],
    '10.1037/0003-066X.55.1.68',
    'https://doi.org/10.1037/0003-066X.55.1.68',
    'sdt',
    'lifespan',
    'en',
    now(),
    '자기결정성 이론(SDT)의 American Psychologist 정리 논문. 자율성·유능성·관계성 세 가지 기본 심리욕구가 내재 동기와 웰빙의 핵심임을 제시.',
    'American Psychologist summary of Self-Determination Theory. Identifies three basic psychological needs — autonomy, competence, relatedness — as foundational for intrinsic motivation, social development, and well-being.',
    'Advisor가 동기·웰빙 진단 시 세 욕구 차원으로 가이드를 분기하는 골격 근거.'
  ),
  (
    'The "what" and "why" of goal pursuits: Human needs and the self-determination of behavior',
    ARRAY['Edward L. Deci','Richard M. Ryan'],
    '10.1207/S15327965PLI1104_01',
    'https://doi.org/10.1207/S15327965PLI1104_01',
    'sdt',
    'adult',
    'en',
    now(),
    'SDT의 동기 내재화 연속체(외재→내사→동일시→통합→내재)를 상세히 제시한 이론 논문. ''왜'' 그 행동을 하는지의 질이 ''무엇'' 행동인지보다 웰빙에 더 중요함을 주장.',
    'Detailed theoretical paper presenting SDT''s motivation internalization continuum (external → introjected → identified → integrated → intrinsic). Argues that the "why" of behavior matters more for well-being than the "what".',
    '저널 텍스트의 ''~해야 해서''(introjected) vs ''~하고 싶어서''(identified/intrinsic) 어휘 분석으로 동기 질을 추정하는 trait extraction 근거.'
  ),
  (
    'Basic psychological need theory: Advancements, critical themes, and future directions',
    ARRAY['Maarten Vansteenkiste','Richard M. Ryan','Bart Soenens'],
    '10.1007/s11031-019-09818-1',
    'https://doi.org/10.1007/s11031-019-09818-1',
    'sdt',
    'lifespan',
    'en',
    now(),
    '20년간의 SDT 기본 욕구 연구를 정리한 특별호 서문. 욕구 ''좌절''(active thwarting)과 ''불충족''(absence)의 구분, 문화 보편성 증거, 신체 욕구와의 인터페이스 등 최신 쟁점 정리.',
    'Special-issue introduction synthesizing 20 years of SDT need research. Distinguishes need frustration (active thwarting) from need dissatisfaction (absence), reviews cross-cultural universality evidence, and outlines integration with physical needs.',
    'Advisor가 ''좌절''과 ''불충족''을 구분해 다른 가이드를 제공하도록 설계: 강제적 환경(좌절)은 환경 변화 권유, 단순 결여(불충족)는 행동 변화 권유.'
  ),
  (
    'Development and Construct Validation of the Basic Psychological Needs Scale for Korean Adolescents: Based on the Self-Determination Theory',
    ARRAY['이명희','김아영'],
    '10.21193/kjspp.2008.22.4.010',
    'https://doi.org/10.21193/kjspp.2008.22.4.010',
    'sdt',
    'adolescent',
    'ko',
    now(),
    '한국 중·고등학생 1591명 표본으로 자율성·유능성·관계성 18문항 척도를 개발·타당화. 한국 청소년 맥락에서 SDT 세 욕구의 측정 신뢰도·타당도 확보.',
    'Develops and validates an 18-item BPNS scale (6 items each for autonomy, competence, relatedness) for Korean adolescents (N=1591, middle and high school). Used translation/back-translation and qualitative interviews to ensure cultural equivalence.',
    '한국 사용자(특히 청소년) 인터뷰의 욕구 측정은 이 척도의 문항 어휘를 참고. 한국식 ''자율''은 개인주의적 독립이 아닌 ''내적 동의''로 표현되어야 함.'
  );
