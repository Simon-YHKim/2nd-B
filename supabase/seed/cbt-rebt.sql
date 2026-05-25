-- CBT (Beck tradition) + REBT (Ellis tradition) — verified knowledge sources
-- Batch source: docs/research/batches/cbt-rebt.md
-- DOIs verified against Crossref / publisher record / KCI, May 2026.
-- Framework slug: 'cbt' for cognitive-behavioral, 'rebt' for rational-emotive.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'The efficacy of cognitive behavioral therapy: A review of meta-analyses',
    ARRAY['Stefan G. Hofmann','Anu Asnaani','Imke J. J. Vonk','Alice T. Sawyer','Angela Fang'],
    '10.1007/s10608-012-9476-1',
    'https://doi.org/10.1007/s10608-012-9476-1',
    'cbt',
    'adult',
    'en',
    now(),
    'CBT의 표준 reference review. 269개 연구의 106개 메타분석 종합. 불안장애, 신체화, 폭식, 분노 조절, 일반 스트레스에 강한 증거. 역사상 가장 광범위하게 검증된 심리치료 접근.',
    'The standard reference for CBT efficacy: 106 meta-analyses across 269 studies. Strong evidence for anxiety disorders, somatoform disorders, bulimia, anger control, general stress. Most extensively tested psychotherapy approach in history.',
    'Engine 4 GREEN zone에서 CBT reframing의 학술 정당성. 단 ''효능 > 효과''(efficacy > effectiveness) 갭 명시 — 임상 연구 효과가 일상 앱 사용에 그대로 전이되지 않음.'
  ),
  (
    '50 years of rational-emotive and cognitive-behavioral therapy: A systematic review and meta-analysis',
    ARRAY['Daniel David','Carmen Cotet','Silviu Matu','Cristina Mogoase','Simona Stefan'],
    '10.1002/jclp.22514',
    'https://doi.org/10.1002/jclp.22514',
    'rebt',
    'adult',
    'en',
    now(),
    'REBT(Ellis 합리적 정서치료)의 50년 종합. 다른 개입 대비 효과크기 d=0.58, 비합리적 신념 변화에 d=0.70. ABC-DE 모델의 ''disputation''(반박)이 핵심 작동 기제.',
    'REBT (Ellis) 50-year synthesis. d=0.58 vs comparison interventions; d=0.70 on irrational beliefs. The disputation of irrational beliefs in the ABC-DE model is the active mechanism.',
    'Advisor의 ''must / should / can''t stand it'' 패턴 사용자에 대한 disputation prompt 학술 근거. 단 disputation은 ''질문''으로 제시 — 한국 conversational norms에서 직설적 반박은 face-threatening.'
  ),
  (
    'Cognitive behavior therapy vs. control conditions, other psychotherapies, pharmacotherapies and combined treatment for depression: A comprehensive meta-analysis including 409 trials with 52,702 patients',
    ARRAY['Pim Cuijpers','Clara Miguel','Mathias Harrer','Constantin Yves Plessen','Marketa Ciharova','David Ebert','Eirini Karyotaki'],
    '10.1002/wps.21069',
    'https://doi.org/10.1002/wps.21069',
    'cbt',
    'adult',
    'en',
    now(),
    '역사상 최대 규모 CBT-우울 메타분석(409 시험, 52,702 환자). CBT는 통제군 대비 중간 효과크기로 유의; 다른 검증된 심리치료들과 동등; 단기적으로 약물치료와 동등; 약물+CBT 병용이 단독치료보다 우월.',
    'Largest CBT-for-depression meta-analysis ever (409 trials, 52,702 patients). CBT moderately effective vs control; comparable to other validated psychotherapies; comparable to pharmacotherapy short-term; combined CBT + pharmacotherapy outperforms either alone.',
    'Advisor 톤: ''CBT가 만병통치는 아님'' 정직하게 — 다른 접근과 동등 효과. 약물치료가 필요한 경우는 YELLOW/RED 라우팅으로 전환.'
  ),
  (
    'The Meta-analysis on the Effectiveness of Cognitive Behavioral Therapy Programs',
    ARRAY['Najin Kim','Jueun Jin'],
    '10.22143/HSS21.10.4.119',
    'https://doi.org/10.22143/HSS21.10.4.119',
    'cbt',
    'lifespan',
    'ko',
    now(),
    '한국 CBT 프로그램 효과의 메타분석(2005-2019, 62개 한국 연구). 한국 표본에서도 CBT 효능이 우울·불안·스트레스 등 정신건강-인접 outcomes에 유의함을 확인. Western 메타분석의 한국 일반화 학술 근거.',
    'Korean CBT meta-analysis synthesizing 62 Korean studies (2005-2019). Confirms CBT efficacy in Korean samples across mental-health-adjacent outcomes (depression, anxiety, stress). Korean validation that Western meta-analyses generalize.',
    '한국 사용자에게 CBT reframing 적용의 학술 정당성. 단 Western 임상 효능과 한국 일상 앱 효과의 갭, 그리고 collectivist 맥락의 의무·관계 가치 존중 필요.'
  );
