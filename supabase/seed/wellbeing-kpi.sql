-- Wellbeing Outcome Measurement (Longitudinal KPI)
-- Batch source: docs/research/batches/wellbeing-kpi.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- Framework slug: 'wellbeing_kpi' — outcome measurement instruments for
-- tracking whether 2nd-Brain actually helps users.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'The Satisfaction with Life Scale',
    ARRAY['Ed Diener','Robert A. Emmons','Randy J. Larsen','Sharon Griffin'],
    '10.1207/s15327752jpa4901_13',
    'https://doi.org/10.1207/s15327752jpa4901_13',
    'wellbeing_kpi',
    'adult',
    'en',
    now(),
    '글로벌 표준 삶의 만족도 척도 SWLS 개발 논문(1985). 5문항 7점 Likert, 점수 범위 5–35. 인지적 삶의 만족 측정. 수천 건 연구에 사용. 한국판 조명한·차경호 (1998), 임영진 (2012) 재검증 존재.',
    'The standard global life-satisfaction measure. 5 items, 7-point Likert, range 5-35. Cognitive life-satisfaction. Used in thousands of studies. Korean adaptation by 조명한 & 차경호 (1998), revalidated by 임영진 (2012).',
    '월간 outcome KPI 후보. SWLS는 변화가 느려 monthly 측정이 적합. 4점 이상 변화가 의미 있는 신호.'
  ),
  (
    'The WHO-5 Well-Being Index: A systematic review of the literature',
    ARRAY['Christian Winther Topp','Søren Dinesen Østergaard','Susan Søndergaard','Per Bech'],
    '10.1159/000376585',
    'https://doi.org/10.1159/000376585',
    'wellbeing_kpi',
    'adult',
    'en',
    now(),
    'WHO-5 척도의 종합 체계적 리뷰. 글로벌 가장 널리 쓰이는 웰빙 도구 중 하나. 5문항 1분 작성. 우울 스크리닝 도구 및 일반 주관적 웰빙 측정으로 검증. 0–100 변환 후 50 미만은 추가 평가 신호, 28 미만은 우울 스크리닝 cutoff.',
    'Systematic review of WHO-5 — one of the most widely used wellbeing instruments globally. 5 items, ~1 minute completion. Validated as depression-screening tool and general subjective wellbeing measure. After 0-100 conversion: <50 suggests further evaluation; <28 is the depression screening cutoff.',
    '주간 in-app micro-survey의 최적 후보 — 가장 낮은 friction. 10+ 변화가 MCID. <28 트리거 시 YELLOW zone 라우팅 (단 단일 측정으로 자동 escalate 금지, 2회+ 추세 + 맥락 확인).'
  ),
  (
    'The PERMA-Profiler: A brief multidimensional measure of flourishing',
    ARRAY['Julie Butler','Margaret L. Kern'],
    '10.5502/ijw.v6i3.526',
    'https://doi.org/10.5502/ijw.v6i3.526',
    'wellbeing_kpi',
    'adult',
    'both',
    now(),
    'Seligman의 PERMA 모델 조작화. 긍정 정서·몰입·관계·의미·성취 5차원 각 3문항(15문항 핵심 + 8 filler). 다차원적 flourishing 측정 — 어떤 차원이 변하는지 분화. 분기 측정 적합.',
    'Operationalizes Seligman''s PERMA model: Positive emotion, Engagement, Relationships, Meaning, Accomplishment. 3 items per dimension (15 core + 8 filler items). Multidimensional flourishing measurement — differentiates WHICH dimension is moving, not just aggregate. Suitable for quarterly use.',
    '분기 KPI — WHO-5/SWLS는 aggregate만 보고, PERMA는 dimensional. 어떤 차원에서 변화가 일어나는지 사용자에게 reflective insight 제공 가능.'
  ),
  (
    'The relationship of the Korean version of the WHO Five Well-Being Index with depressive symptoms and quality of life in the community-dwelling elderly',
    ARRAY['Yoo Sun Moon','Hyun Ji Kim','Do Hoon Kim'],
    '10.1016/j.ajp.2013.12.014',
    'https://doi.org/10.1016/j.ajp.2013.12.014',
    'wellbeing_kpi',
    'elderly',
    'ko',
    now(),
    '한국판 K-WHO-5의 지역사회 거주 노인 N=244 검증 연구. K-WHO-5 점수가 SGDS-K 우울 척도와 부적, 한국판 삶의 질과 정적 상관. DOI-검증된 한국어 WHO-5 검증의 1차 근거 — 한국 성인 일반에서 K-WHO-5 사용 정당화.',
    'Validates the Korean WHO-5 in community-dwelling elderly (N=244). K-WHO-5 inversely correlates with K-SGDS depression scale and positively with Korean quality-of-life measure. The DOI-verified Korean-language WHO-5 validation — supports K-WHO-5 use across adult Korean samples.',
    '한국 사용자의 주간 WHO-5 측정 학술 근거. 특히 노년 사용자에 강함. 청장년 K-WHO-5는 cross-domain 사용 — Korea-specific 추가 검증은 자체 데이터로 보강.'
  );
