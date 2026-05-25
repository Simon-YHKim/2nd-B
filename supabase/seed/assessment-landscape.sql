-- Personality & Character Assessment Landscape — comparative catalog
-- Batch source: docs/research/batches/assessment-landscape.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- Each row's framework slug encodes both the assessment and its empirical
-- tier: 'assessment_a_*' (Tier A — strong), 'assessment_b_*' (Tier B —
-- moderate), 'assessment_c_*' (Tier C — weak / contested).

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  -- Tier A
  (
    'Psychometric properties of the HEXACO Personality Inventory',
    ARRAY['Kibeom Lee','Michael C. Ashton'],
    '10.1207/s15327906mbr3902_8',
    'https://doi.org/10.1207/s15327906mbr3902_8',
    'assessment_a_hexaco',
    'adult',
    'en',
    now(),
    'Big Five에 정직-겸손(Honesty-Humility) 차원을 추가한 6요인 HEXACO-PI 모델의 초기 검증 논문. 6요인 구조가 명확하게 재현되고 외부 변수와 적절한 수렴 타당도 확인.',
    'Initial validation of the HEXACO-PI six-factor model adding Honesty-Humility to the Big Five. The six-factor structure replicated cleanly with adequate convergent validity against external variables.',
    'Big Five의 대안 또는 보완. 정직성·진실성 차원이 중요한 사용자(직장 윤리, 파트너 선택) 도메인에서 추가 사용 가능.'
  ),
  (
    'The development, evolution, and status of Holland''s theory of vocational personalities: Reflections and future directions for counseling psychology',
    ARRAY['Margaret M. Nauta'],
    '10.1037/a0018213',
    'https://doi.org/10.1037/a0018213',
    'assessment_a_riasec',
    'lifespan',
    'en',
    now(),
    'Holland의 직업 흥미 RIASEC 6유형 이론(현실·탐구·예술·사회·기업·관습)의 발전사와 현재 위치를 종합한 리뷰. 직업 흥미 평가의 표준 모델로 자리잡은 학술 정당성.',
    'Review of Holland''s vocational interests theory (RIASEC: Realistic, Investigative, Artistic, Social, Enterprising, Conventional) — its development, evidence base, and ongoing relevance as the standard model for vocational interest assessment.',
    '직업·진로 도메인 인터뷰의 6유형 frame. "어떤 일이 본인에게 맞을까" 프롬프트의 학술 근거.'
  ),
  (
    'Refining the theory of basic individual values',
    ARRAY['Shalom H. Schwartz','Jan Cieciuch','Michele Vecchione','Eldad Davidov','Ronald Fischer','Constanze Beierlein'],
    '10.1037/a0029393',
    'https://doi.org/10.1037/a0029393',
    'assessment_a_values',
    'adult',
    'both',
    now(),
    'Schwartz 인간 가치 모델을 19개 가치로 정교화하고 10개국 6,059명으로 검증. 가치는 ''자기보호 vs 성장'', ''개인 vs 사회 초점''의 원형 연속선 위에 배치됨.',
    'Refined Schwartz values theory with 19 (vs original 10) values, validated in 15 samples across 10 nations (N=6,059). Values arrange on a circular motivational continuum along self-protection vs growth and personal vs social focus axes.',
    '가치 명료화 모듈의 학술 근거. "본인이 실제로 무엇을 우선하는가" 인터뷰 차원 설계.'
  ),
  -- Tier B
  (
    'Using theory to evaluate personality and job-performance relations: A socioanalytic perspective',
    ARRAY['Joyce Hogan','Brent Holland'],
    '10.1037/0021-9010.88.1.100',
    'https://doi.org/10.1037/0021-9010.88.1.100',
    'assessment_b_hpi',
    'adult',
    'en',
    now(),
    'Hogan Personality Inventory(HPI)의 직무성과 예측 타당도를 사회분석적 관점으로 평가한 메타분석. 7개 척도의 진(true) 타당도 .25–.43.',
    'Meta-analysis evaluating HPI''s job-performance predictive validity through the socioanalytic lens. Estimated true validities for the 7 primary scales range from .25 to .43.',
    'HPI는 직장 맥락 전용 proprietary 도구. Birkman과 비슷한 ''reputation side'' framing 개념만 차용, 도구 자체는 사용 안 함.'
  ),
  (
    'Personality structure and the new Fifth Edition of the 16PF',
    ARRAY['Raymond B. Cattell','Heather E. P. Cattell'],
    '10.1177/0013164495055006002',
    'https://doi.org/10.1177/0013164495055006002',
    'assessment_b_16pf',
    'adult',
    'en',
    now(),
    '16개 1차 성격요인과 5개 2차 글로벌 요인 구조를 가진 16PF Fifth Edition의 개정 배경과 요인 구조 타당도 보고. 내적 일관성 .68–.87.',
    'Reports on the development and factor structure of the 16PF Fifth Edition: 16 primary source traits plus 5 global second-order factors. Internal consistency 0.68–0.87.',
    '16PF는 역사적으로 영향력 있지만 현행 Big Five로 대체된 도구. reference만 보유, active inference 사용 안 함.'
  ),
  (
    'Human abilities: Emotional intelligence',
    ARRAY['John D. Mayer','Richard D. Roberts','Sigal G. Barsade'],
    '10.1146/annurev.psych.59.103006.093646',
    'https://doi.org/10.1146/annurev.psych.59.103006.093646',
    'assessment_b_ei',
    'adult',
    'en',
    now(),
    'Annual Review 정서지능 종합 리뷰. 능력 모델(MSCEIT)과 trait 모델 구분, 인지능력·성격과의 incremental validity 정리. EI를 ''능력''으로 측정할 때 정당한 변별 영역이 있음을 정리.',
    'Annual Review synthesis of emotional intelligence research. Distinguishes ability-based EI (MSCEIT) from trait EI, evaluates incremental validity over cognitive ability and personality. Confirms ability-EI as a discriminable construct domain.',
    '''감정 능력'' 어휘로 인터뷰 프롬프트 구성 시 학술 근거. Performance-test 형식은 저널링 환경에 부적합 — vocabulary로만 사용.'
  ),
  (
    'Impact of the Birkman Method Assessment on Pharmacy Student Self-Confidence, Self-Perceptions, and Self-Awareness',
    ARRAY['Whitney D. Maxwell','Amy D. Grant','Patricia H. Fabel','Cathy Worrall','Kristy Brittain','Breanne Martinez','Z. Kevin Lu','Robert Davis','Georgia H. Doran','Bryan Ziegler'],
    '10.5688/ajpe809148',
    'https://doi.org/10.5688/ajpe809148',
    'assessment_b_birkman',
    'adult',
    'en',
    now(),
    'Birkman Method 진단이 약학과 학생의 자기인식·자기지각·자신감에 미친 영향 연구(N=5114). 자기인식 정확도가 1.6점 증가(95% CI 1.3–1.9). Birkman의 독립 peer-reviewed 검증 중 가장 강한 사례.',
    'Strongest independent peer-reviewed Birkman study available: tested impact of Birkman assessment+training on pharmacy students (N=5114). Self-awareness accuracy improved by 1.6 points (95% CI 1.3–1.9). Most Birkman validation lives in publisher technical reports rather than peer review.',
    'Birkman의 ''usual / need / stress'' 3분 framing은 개념적으로 유용 — 인터뷰 프롬프트 설계에 차용. 단 Birkman 점수·라벨 직접 사용 안 함(proprietary).'
  ),
  -- Tier C — included for completeness and to anchor critical evaluation
  (
    'Cautionary comments regarding the Myers-Briggs Type Indicator',
    ARRAY['David J. Pittenger'],
    '10.1037/1065-9293.57.3.210',
    'https://doi.org/10.1037/1065-9293.57.3.210',
    'assessment_c_mbti_critique',
    'adult',
    'en',
    now(),
    'MBTI에 대한 표준적 학술 비판. 유형 이산성 증거 없음(점수는 연속), 5주 내 유형 재할당 비율 약 50%, 직무성과 예측 타당도 약함을 정리.',
    'Canonical academic critique of the MBTI: no evidence for type discontinuity (scores are continuous), ~50% type reassignment within 5 weeks, weak job-performance predictive validity.',
    'Advisor가 사용자의 MBTI 자기언명은 수용하되 이를 근거로 추론하지 않도록 하는 정책의 학술 근거.'
  ),
  (
    'The Enneagram: A systematic review of the literature and directions for future research',
    ARRAY['Joshua N. Hook','Todd W. Hall','Don E. Davis','Daryl R. Van Tongeren','Mackenzie Conner'],
    '10.1002/jclp.23097',
    'https://doi.org/10.1002/jclp.23097',
    'assessment_c_enneagram_review',
    'adult',
    'en',
    now(),
    '에니어그램 문헌 104 samples 체계적 리뷰. 일부 하위 척도가 Big Five와 이론 일관된 상관을 보이지만 요인분석은 9유형을 거의 복원하지 못함. wings, intertype movement 등 부가 이론 증거 거의 없음.',
    'Systematic review of 104 Enneagram samples. Some subscales show theory-consistent correlations with Big Five, but factor analyses rarely recover the nine theorized types. Little to no evidence for secondary theory (wings, intertype movement).',
    'Advisor가 사용자의 에니어그램 자기언명은 수용하되 9-유형 구조를 사실로 다루지 않도록 하는 학술 근거.'
  );
