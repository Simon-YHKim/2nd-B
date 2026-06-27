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

-- Deepen the career domain (1 -> 3 rows). DOIs verified against Crossref.
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'The Nature and Power of Interests',
    ARRAY['James Rounds','Rong Su'],
    '10.1177/0963721414522812',
    'https://doi.org/10.1177/0963721414522812',
    'career',
    'adult',
    'both',
    now(),
    '흥미(interests)는 시간이 지나도 상당히 안정적이며, 사람이 어떤 환경을 선택하고 그 안에서 얼마나 노력·지속하는지를 좌우함. 능력만큼이나 ''무엇에 끌리는가''가 진로 성과를 설명함을 정리한 리뷰. 흥미를 가벼운 취향이 아니라 오래가는 방향타로 보게 함.',
    'Interests are highly stable over time and steer which environments a person selects into and how much they persist there. A review showing that what one is drawn to explains career outcomes as much as ability does. Frames interests as a durable compass, not a light preference.',
    'career 도메인 별 보강 근거. Advisor가 사용자의 누적 흥미 기록을 ''일시적 변덕 vs 지속 패턴''으로 구분해 비춰주도록. 진로 지시 금지, 본인이 자기 방향타를 보게만.'
  ),
  (
    'Calling and Vocation at Work: Definitions and Prospects for Research and Practice',
    ARRAY['Bryan J. Dik','Ryan D. Duffy'],
    '10.1177/0011000008316430',
    'https://doi.org/10.1177/0011000008316430',
    'career',
    'adult',
    'both',
    now(),
    '''소명(calling)''과 ''천직(vocation)''을 일에서의 의미·목적 지향으로 정의하고, 이런 의미 지향이 직무 만족·몰입과 연결됨을 정리. 커리어를 보상만이 아니라 ''나에게 무슨 의미인가''의 축으로도 보게 하는 self-understanding 프레임. 의미 강요는 경계.',
    'Defines calling and vocation as meaning- and purpose-oriented stances toward work, and links such orientation to job satisfaction and engagement. A self-understanding frame that lets career be read along a "what does this mean to me" axis, not reward alone, while cautioning against coercing meaning.',
    'career 도메인 별 보강 근거. Advisor가 커리어 기록에서 사용자가 일에 부여하는 의미를 mirror하되, ''천직을 찾아야 한다''는 압박은 주지 않음(narrative 강요 금지 원칙과 정렬).'
  );
