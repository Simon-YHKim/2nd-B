-- Narrative Identity (McAdams) — verified knowledge sources
-- Batch source: docs/research/batches/narrative-identity.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- This framework is the closest theoretical anchor for 2nd-Brain's
-- journaling-as-self-understanding mechanic.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'The psychology of life stories',
    ARRAY['Dan P. McAdams'],
    '10.1037/1089-2680.5.2.100',
    'https://doi.org/10.1037/1089-2680.5.2.100',
    'narrative_identity',
    'lifespan',
    'en',
    now(),
    '''인생 이야기 모델''로서의 정체감 이론을 정리한 핵심 리뷰. 사람은 현대 사회에서 내면화되고 진화하는 자기 서사를 구성함으로써 삶에 통일성과 목적을 부여함.',
    'Foundational review presenting McAdams''s life-story model of identity. People in modern societies provide their lives with unity and purpose by constructing internalized, evolving self-narratives.',
    '2nd-Brain의 저널링이 ''데이터 수집''이 아니라 ''인생 서사 구성''이라는 product framing의 학술 근거.'
  ),
  (
    'Narrative identity',
    ARRAY['Dan P. McAdams','Kate C. McLean'],
    '10.1177/0963721413475622',
    'https://doi.org/10.1177/0963721413475622',
    'narrative_identity',
    'lifespan',
    'en',
    now(),
    '서사 정체감을 ''재구성된 과거와 상상된 미래를 통합한 내면화·진화하는 인생 이야기''로 정의한 Current Directions 정리 논문. 고통에서 redemption을 찾고 agency·exploration 주제를 가진 서사는 정신건강·웰빙과 정적 연관.',
    'Defines narrative identity as a person''s internalized, evolving life story integrating reconstructed past and imagined future. Narrators who find redemptive meanings in suffering and whose stories feature agency and exploration show higher well-being.',
    'Advisor 프롬프트 설계: agency, communion, redemption, exploration 차원을 명시적으로 탐색하되 강요하지 않음.'
  ),
  (
    'The incremental validity of narrative identity in predicting well-being: A review of the field and recommendations for the future',
    ARRAY['Jonathan M. Adler','Jennifer Lodi-Smith','Frédérick L. Philippe','Iliane Houle'],
    '10.1177/1088868315585068',
    'https://doi.org/10.1177/1088868315585068',
    'narrative_identity',
    'adult',
    'en',
    now(),
    '서사 정체감이 Big Five·인구학 변수를 통제한 후에도 웰빙을 예측하는 incremental validity를 메타리뷰. 네 차원(motivational/affective/integrative meaning/structural) 중 motivational·affective·integrative meaning에서 증거가 강함.',
    'Review establishing the incremental validity of narrative identity for predicting well-being beyond Big Five and demographics. Strongest evidence for motivational, affective, and integrative-meaning themes; weaker for structural elements.',
    '2nd-Brain의 서사 분석 투자 정당화: trait 분석만으로 잡지 못하는 well-being 변동의 추가 설명력을 narrative가 가짐.'
  ),
  (
    'Validating the Korean version of the Thinking About Life Experiences Scale',
    ARRAY['Sangmi Park','Ji-Hyuk Park','Ickpyo Hong','Tae Hui Kim','Nicole Alea','Susan Bluck'],
    '10.1002/acp.4168',
    'https://doi.org/10.1002/acp.4168',
    'narrative_identity',
    'elderly',
    'ko',
    now(),
    '자전적 기억 기능 척도(TALE)를 한국어로 번안·검증. 한국 노인은 TALE 총점이 웰빙·삶의 의미와 정적 상관. Western 표본 대비 자전적 기억의 일상적 기능 활용 수준이 낮음 — 집단주의 문화에서 개인 경험 회상의 우선순위가 낮은 것으로 해석.',
    'Validates the Korean TALE in older Korean adults; TALE-K total score correlates with well-being and meaning in life. Korean older adults show lower functional use of autobiographical memory than Western samples, interpreted as a collectivist-cultural pattern.',
    '한국 사용자(특히 노인) 인터뷰 설계: 자기-narrative를 ''당연''하지 않게 invite. 가족·관계 맥락의 기억이 개인 사건 기억보다 접근성 높을 수 있음.'
  );
