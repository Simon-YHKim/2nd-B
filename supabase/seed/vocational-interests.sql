-- Vocational interests & performance — grounding for the CAREER (커리어) domain star.
-- The existing corpus mentioned career only as a test-catalog aside; this anchors
-- career advice in the meta-analytic interest-performance link.
-- DOI verified against Crossref / publisher record.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Vocational Interests and Performance: A Quantitative Summary of Over 60 Years of Research',
    ARRAY['Christopher D. Nye','Rong Su','James Rounds','Fritz Drasgow'],
    '10.1177/1745691612449021',
    'https://doi.org/10.1177/1745691612449021',
    'career',
    'adult',
    'both',
    now(),
    '60년치 연구를 종합한 메타분석: 직업 흥미(vocational interests)는 직무 수행과 지속(persistence)을 유의하게 예측하며, 흥미가 일의 요구와 일치(interest-job fit)할수록 효과가 커짐. 흥미는 단순 선호가 아니라 어디에 노력을 쏟을지를 좌우하는 동기 신호임을 보여줌.',
    'Meta-analysis across 60+ years: vocational interests significantly predict job performance and persistence, and the effect strengthens with interest-job fit. Interests are not mere preferences but motivational signals shaping where effort is directed.',
    'career 도메인 별의 학술 근거. Advisor가 커리어 항목을 다룰 때 사용자가 기록한 흥미 패턴과 현재 일의 일치도를 mirror. fit-gap을 발견해도 진로 처방 금지, 본인 성찰을 돕는 질문만.'
  );
