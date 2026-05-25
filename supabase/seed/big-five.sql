-- Big Five (OCEAN / Five-Factor Model) — verified knowledge sources
-- Batch source: docs/research/batches/big-five.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- `verified_at = now()` set at insert; re-verify quarterly.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Validation of the five-factor model of personality across instruments and observers',
    ARRAY['Robert R. McCrae','Paul T. Costa Jr.'],
    '10.1037/0022-3514.52.1.81',
    'https://doi.org/10.1037/0022-3514.52.1.81',
    'big_five',
    'adult',
    'en',
    now(),
    '5요인 성격 모델(외향성·우호성·성실성·신경성·개방성)이 자기보고와 동료보고, 형용사 및 질문지 형식에서 모두 일관되게 재현됨을 보인 초기 검증 연구. 5요인 구조의 외부 타당도 핵심 근거.',
    'Validates the five-factor model using both self- and peer-report data across two instrument types (adjective factors and questionnaire scales). Foundational evidence for the cross-observer robustness of the Big Five structure.',
    '저널 추론으로 얻은 trait 추정이 동료보고와 일치하지 않을 수 있다는 점을 Advisor가 인지해야 함. 단일 entry로 결론짓지 않도록 가드.'
  ),
  (
    'An alternative "description of personality": The Big-Five factor structure',
    ARRAY['Lewis R. Goldberg'],
    '10.1037/0022-3514.59.6.1216',
    'https://doi.org/10.1037/0022-3514.59.6.1216',
    'big_five',
    'adult',
    'en',
    now(),
    '어휘적(lexical) 접근으로 5요인 구조의 견고함을 입증. 일상 형용사로 성격을 묘사할 때 자연스럽게 5개 차원으로 수렴함을 보여줌.',
    'Demonstrates the Big-Five factor structure via the lexical hypothesis: trait adjectives in natural language consistently converge on five broad dimensions.',
    '저널 텍스트에서 형용사 빈도 분석으로 5요인 신호를 추출하는 trait extraction 정당성 근거.'
  ),
  (
    'The power of personality: The comparative validity of personality traits, socioeconomic status, and cognitive ability for predicting important life outcomes',
    ARRAY['Brent W. Roberts','Nathan R. Kuncel','Rebecca Shiner','Avshalom Caspi','Lewis R. Goldberg'],
    '10.1111/j.1745-6916.2007.00047.x',
    'https://doi.org/10.1111/j.1745-6916.2007.00047.x',
    'big_five',
    'lifespan',
    'en',
    now(),
    '성격 trait의 예측 타당도가 사회경제적 지위·인지능력과 견줄 만함을 메타분석으로 보인 연구. 성격이 사망률, 이혼, 직업 성취 등 주요 인생 결과에 실질적 영향을 미침.',
    'Meta-analytic evidence that personality traits predict mortality, divorce, and occupational attainment with effect sizes comparable to SES and cognitive ability. Establishes the practical importance of trait assessment.',
    'Advisor가 "성격은 어차피 안 바뀐다"는 허무주의에 빠지지 않도록 — trait이 인생 결과에 의미 있게 작동한다는 근거.'
  ),
  (
    'Personality trait change in adulthood',
    ARRAY['Brent W. Roberts','Daniel Mroczek'],
    '10.1111/j.1467-8721.2008.00543.x',
    'https://doi.org/10.1111/j.1467-8721.2008.00543.x',
    'big_five',
    'adult',
    'en',
    now(),
    '성인기에도 성격은 변화한다는 점을 정리한 리뷰. 20-40대에 자신감·따뜻함·자기통제·정서적 안정성이 증가하는 mean-level 변화가 가장 크게 나타남.',
    'Review establishing that personality traits change in adulthood, with the largest mean-level shifts in young adulthood (20–40): increases in self-confidence, warmth, self-control, and emotional stability.',
    '"성격은 고정된 게 아니다"라는 메시징의 학술 근거. 연령대별 변화 기대치를 Advisor 응답에 반영.'
  ),
  (
    'The Next Big Five Inventory (BFI-2): Developing and assessing a hierarchical model with 15 facets to enhance bandwidth, fidelity, and predictive power',
    ARRAY['Christopher J. Soto','Oliver P. John'],
    '10.1037/pspp0000096',
    'https://doi.org/10.1037/pspp0000096',
    'big_five',
    'adult',
    'en',
    now(),
    '현행 BFI-2 척도와 15개 facet 위계 구조를 제시한 척도 개발 논문. 2nd-Brain 영어 인터뷰 질문의 원형 출처.',
    'Introduces the BFI-2 with 15 lower-order facets nested under the five domains. Source instrument for English interview prompts in 2nd-Brain.',
    '인터뷰 질문은 BFI-2 facet 구조를 따르되 진단 검사가 아닌 자기탐색용으로 재구성.'
  ),
  (
    'Personality stability and change: A meta-analysis of longitudinal studies',
    ARRAY['Wiebke Bleidorn','Ted Schwaba','Anqing Zheng','Christopher J. Hopwood','Susana S. Sosa','Brent W. Roberts','Daniel A. Briley'],
    '10.1037/bul0000365',
    'https://doi.org/10.1037/bul0000365',
    'big_five',
    'lifespan',
    'en',
    now(),
    '대규모 종단연구 메타분석(k=189 안정성, k=276 변화, N>240k)으로 Big Five의 평생 변화 패턴을 정리. rank-order 안정성은 청년기 이후 빠르게 안정화되고, mean-level 변화는 전 생애에 점진적으로 일어남.',
    'Meta-analysis (k=189 stability, k=276 change; total N>240,000) of longitudinal personality data. Rank-order stability rises sharply through young adulthood; mean-level change continues across the lifespan with the largest shifts in young adulthood.',
    'Advisor의 변화 메시징 톤: "성격 개조"는 약속하지 않되, 10년에 0.1–0.2 SD 정도의 점진적 변화는 가능하다고 안내.'
  ),
  (
    'The Big Five Inventory-2 in Korea: Validation and cross-cultural comparisons with the U.S. and Chinese versions',
    ARRAY['Jinsoo Choi','Nanhee Kim','Bo Zhang','Sang Woo Park','Seonghee Cho','Young Woo Sohn','Christopher J. Soto','Oliver P. John'],
    '10.1177/10731911251357466',
    'https://doi.org/10.1177/10731911251357466',
    'big_five',
    'adult',
    'ko',
    now(),
    '한국어 BFI-2를 직장인·대학생 표본으로 검증한 연구. 미국·중국판과의 비교에서 domain 수준 측정동등성을 확인하면서도 facet 수준에서는 문화적 차이가 일부 나타남.',
    'Validates the Korean BFI-2 in two South Korean samples (working adults and college students). Confirms measurement invariance with U.S. and Chinese versions at the domain level, with some facet-level cultural variation.',
    '한국어 인터뷰 문항은 영어 직역이 아니라 이 한국판 문항을 참고해 자연스러운 한국어 어휘로 작성.'
  );
