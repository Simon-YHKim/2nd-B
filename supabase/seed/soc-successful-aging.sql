-- SOC (Selective Optimization with Compensation) + Successful Aging
-- Batch source: docs/research/batches/soc-successful-aging.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- Uses two framework slugs: 'soc' (Baltes process model) and 'successful_aging' (Rowe-Kahn outcome model).

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'On the incomplete architecture of human ontogeny: Selection, optimization, and compensation as foundation of developmental theory',
    ARRAY['Paul B. Baltes'],
    '10.1037/0003-066X.52.4.366',
    'https://doi.org/10.1037/0003-066X.52.4.366',
    'soc',
    'lifespan',
    'en',
    now(),
    'SOC(선택·최적화·보상) 모델을 발달 이론의 기초로 제시한 Baltes의 핵심 논문. 인간 발달은 생애 전반에 걸쳐 자원의 선택적 투자와 손실 보상의 균형으로 진행됨.',
    'Foundational paper presenting SOC (selection, optimization, compensation) as the architecture of human ontogeny. Development across the lifespan is the balanced investment of resources against shifting gain–loss ratios.',
    '중년·노년기 사용자에게 변화를 ''쇠퇴''가 아닌 ''자원 재배분''으로 reframing하는 어휘 근거.'
  ),
  (
    'Successful aging',
    ARRAY['John W. Rowe','Robert L. Kahn'],
    '10.1093/geront/37.4.433',
    'https://doi.org/10.1093/geront/37.4.433',
    'successful_aging',
    'elderly',
    'en',
    now(),
    '성공적 노화를 ''질병·장애 회피, 높은 신체·인지 기능 유지, 사회적·생산적 활동 지속''의 세 요소로 정의한 The Gerontologist 핵심 논문. 비판도 함께 받는 영향력 있는 모델.',
    'Defines successful aging as (1) avoidance of disease and disability, (2) maintenance of high physical/cognitive function, (3) sustained social and productive engagement. Highly influential and widely critiqued.',
    'Advisor에서 이 모델은 reference로 보유하되, 만성질환 동반 노화를 ''실패''로 묶지 않도록 주관·관계 차원의 한국 보정 (Kim et al. 2017)을 우선 적용.'
  ),
  (
    'Life-management strategies of selection, optimization, and compensation: Measurement by self-report and construct validity',
    ARRAY['Alexandra M. Freund','Paul B. Baltes'],
    '10.1037/0022-3514.82.4.642',
    'https://doi.org/10.1037/0022-3514.82.4.642',
    'soc',
    'adult',
    'en',
    now(),
    '14–89세 표본으로 SOC 자기보고 척도를 개발·검증한 측정학적 핵심 논문. 4요인(elective selection / loss-based selection / optimization / compensation) 구조 확인. 중년기 응답자에서 SOC 사용이 가장 높음.',
    'Develops and validates a self-report SOC measure across two samples (ages 14–87 and 18–89). Confirms a 4-factor structure (elective selection, loss-based selection, optimization, compensation). Middle-aged adults endorse SOC most strongly.',
    '40–50대 사용자에게 SOC 인터뷰가 특히 적합. 4가지 하위 차원을 별도 trait extraction에 활용 가능.'
  ),
  (
    'Correlates of successful aging in South Korean older adults: A meta-analytic review',
    ARRAY['Sin-Hyang Kim','Sihyun Park','Kyung-Sook Park'],
    '10.1177/1010539517717021',
    'https://doi.org/10.1177/1010539517717021',
    'successful_aging',
    'elderly',
    'ko',
    now(),
    '한국 노인 표본 17건 이상을 메타분석. 한국 맥락에서 성공적 노화의 주요 상관변인은 주관적 건강, 가족 관계, 의미 있는 사회적 참여로, Western Rowe-Kahn의 ''질병 회피'' 비중과 다름.',
    'Meta-analysis of 17+ Korean older-adult studies. Korean successful aging correlates most strongly with subjective health, family relationships, and meaningful social engagement, weighting these higher than Western emphasis on disease avoidance.',
    '한국 노인 사용자 인터뷰는 주관적 건강 평가, 가족 관계 질, 의미 있는 활동을 중심 차원으로. ''질병 없음''을 성공의 기준으로 묻지 말 것.'
  );
