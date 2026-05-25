-- VIA Character Strengths (Peterson & Seligman) — verified knowledge sources
-- Batch source: docs/research/batches/via-strengths.md
-- DOIs verified against Crossref / publisher record, May 2026.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Strengths of character and well-being',
    ARRAY['Nansook Park','Christopher Peterson','Martin E. P. Seligman'],
    '10.1521/jscp.23.5.603.50748',
    'https://doi.org/10.1521/jscp.23.5.603.50748',
    'via',
    'adult',
    'en',
    now(),
    'VIA-IS로 5,299명 성인 대상 24개 강점과 삶의 만족도 관계 분석. 희망·열정·감사·사랑·호기심이 삶의 만족도와 가장 일관된 상관. 학습·심미·창조 등 지적 강점은 상관 약함.',
    'Analysis of 24 VIA strengths and life satisfaction in 5,299 adults across three Internet samples. Hope, zest, gratitude, love, and curiosity show the most robust associations with life satisfaction; intellectual strengths (love of learning, appreciation of beauty) show weaker associations.',
    '5개 핵심 강점(hope/zest/gratitude/love/curiosity)을 wellbeing-domain 인터뷰에서 우선 탐색.'
  ),
  (
    'Orientations to happiness and life satisfaction: The full versus the empty life',
    ARRAY['Christopher Peterson','Nansook Park','Martin E. P. Seligman'],
    '10.1007/s10902-004-1278-z',
    'https://doi.org/10.1007/s10902-004-1278-z',
    'via',
    'adult',
    'en',
    now(),
    '행복의 세 지향(쾌락·몰입·의미)이 각각 독립적으로 삶의 만족도를 예측하지만 ''의미'' 지향이 가장 강한 효과. ''full life''는 셋 모두 높은 상태.',
    'Three orientations to happiness (pleasure, engagement, meaning) each independently predict life satisfaction, with meaning showing the strongest effect. The "full life" combines all three.',
    'Advisor가 ''행복''을 하나의 차원으로 환원하지 않도록 — 세 경로를 별도로 추적. 사용자의 entry에서 어느 지향이 두드러지는지 분석.'
  ),
  (
    'Character strengths in 75 nations: An update',
    ARRAY['Robert E. McGrath'],
    '10.1080/17439760.2014.888580',
    'https://doi.org/10.1080/17439760.2014.888580',
    'via',
    'lifespan',
    'both',
    now(),
    '75개국 약 100만 명 VIA-IS 응답 분석. 정직·공정·친절·판단·호기심이 글로벌 상위, 자기조절·겸손·신중·영성이 하위. 한국 포함 국가별 순위에서 상당한 cross-cultural 유사성과 일부 변산성.',
    'Analysis of VIA-IS responses from 1,063,921 adults across 75 nations. Globally top: honesty, fairness, kindness, judgment, curiosity. Globally bottom: self-regulation, modesty, prudence, spirituality. Substantial cross-cultural similarity with meaningful national variance.',
    '한국 사용자에게 cross-cultural data가 적용되는 학술 근거. 단 한국 특이 분포는 별도 확인 권장.'
  );
