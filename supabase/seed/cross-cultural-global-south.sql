-- Cross-cultural (Global South) — curated subset of the researched batch.
-- Source of truth: docs/research/batches/cross-cultural-global-south.md (22 DOIs
-- Crossref-verified there). That batch authored only the simpatía row in full and
-- left the rest as a pattern note; this file seeds 6 load-bearing rows spanning the
-- four regions (Latin America, Africa, South Asia, Arab world). The remaining ~16
-- rows are a documented follow-up (the .md is the research record).
--
-- CRITICAL framing (per the batch's Cautions): every construct is a PROBABILISTIC
-- cultural script, never an ethnic essence; never conflate religion with ethnicity;
-- mirror the user's own framing rather than asserting it. DOIs per the batch's
-- Crossref-verified Verification Summary. framework = 'cross_cultural_global_south'.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Simpatía as a Cultural Script of Hispanics',
    ARRAY['Harry C. Triandis','Gerardo Marin','Judith Lisansky','Hector Betancourt'],
    '10.1037/0022-3514.47.6.1363',
    'https://doi.org/10.1037/0022-3514.47.6.1363',
    'cross_cultural_global_south',
    'adult',
    'en',
    now(),
    '히스패닉·라티노 사회적 상호작용의 ''심파티아'' 스크립트 — 따뜻한 관계 톤, 갈등 회피, 긍정적 상호작용 강조 — 를 실증적으로 조작화. 본질이 아니라 확률적 행동 스크립트.',
    'Empirical operationalization of simpatía as a Hispanic cultural script emphasizing warm relational tone, conflict avoidance, and positive interaction. A probabilistic script, not an ethnic essence.',
    '라틴아메리카·라티노 사용자가 갈등을 부드럽게 처리하는 서사를 보일 때 simpatía로 비춤. 낮은 자기주장으로 오분류 금지. 본인 언어를 mirror.'
  ),
  (
    'Hispanic Familism and Acculturation: What Changes and What Doesn''t?',
    ARRAY['Fabio Sabogal','Gerardo Marin','Regina Otero-Sabogal','Barbara VanOss Marin','Eliseo J. Perez-Stable'],
    '10.1177/07399863870094003',
    'https://doi.org/10.1177/07399863870094003',
    'cross_cultural_global_south',
    'adult',
    'en',
    now(),
    '''파밀리스모''(가족 중심성)를 의무·지지·준거 세 요소로 분해하고, 문화 적응이 진행돼도 ''가족의 지지·준거'' 요소는 비교적 유지됨을 보여줌. 가족 중심성을 단일 덩어리가 아닌 분해 가능한 구성으로 다룰 근거.',
    'Decomposes familism into obligation, support, and family-as-referent components, showing the support/referent components persist even as acculturation proceeds. Grounds treating family-centeredness as a decomposable construct, not a monolith.',
    '라틴아메리카 사용자의 가족 관련 입력을 ''의무 vs 지지 vs 준거'' 중 어디인지로 비춤. 가족 중심성을 자율성 결핍으로 오해 금지.'
  ),
  (
    'Toward an African Moral Theory',
    ARRAY['Thaddeus Metz'],
    '10.1111/j.1467-9760.2007.00280.x',
    'https://doi.org/10.1111/j.1467-9760.2007.00280.x',
    'cross_cultural_global_south',
    'adult',
    'en',
    now(),
    '우분투(Ubuntu) 전통을 학술적 도덕 이론으로 정식화: ''사람은 다른 사람을 통해 사람이 된다'' — 자아는 관계 속에서 성립한다는 관계적 인간관. 격언이 아닌 체계적 이론으로 제시.',
    'Formalizes the Ubuntu tradition as a systematic moral theory: "a person is a person through other persons" — a relational view of selfhood constituted through community. Presented as theory, not slogan.',
    '사하라 이남 아프리카 사용자가 ''나''를 관계 속에서 정의하는 서사를 보일 때 Ubuntu 관계적 자아로 비춤. 서구 개인주의 자율성 틀을 강요 금지.'
  ),
  (
    'Human Ontogenesis: An Indigenous African View on Development and Intelligence',
    ARRAY['A. Bame Nsamenang'],
    '10.1080/00207590544000077',
    'https://doi.org/10.1080/00207590544000077',
    'cross_cultural_global_south',
    'adult',
    'en',
    now(),
    '아프리카 발달관: 발달과 지능을 ''사회적 책임·역할 수행''의 성숙으로 보는 관점. 인지 능력 중심의 서구 모델과 달리, 공동체 내 기여 역량을 발달의 핵심 지표로 둠.',
    'An African view of development that frames maturation and intelligence as growth in social responsibility and role competence, contrasting the Western cognition-centered model by centering capacity to contribute within community.',
    '아프리카 사용자의 ''성장/유능함'' 서사를 인지 점수가 아닌 사회적 책임 성숙으로 비춤. 서구 지능 모델로 환원 금지.'
  ),
  (
    'Spirituality and Indian Psychology: Karma as a Theory of Work',
    ARRAY['Dharm P. S. Bhawuk'],
    '10.1007/978-1-4419-8110-3_8',
    'https://doi.org/10.1007/978-1-4419-8110-3_8',
    'cross_cultural_global_south',
    'adult',
    'en',
    now(),
    '카르마를 종교 교리가 아니라 ''일·결과 귀인 틀''로 조작화: 카르마요가(행위 지향, 결과에 대한 집착 내려놓기)는 스트레스 하에서 노력을 ''줄이는'' 것이 아니라 ''유지·강화''한다. 운명론으로의 번역 금지.',
    'Operationalizes karma not as religious doctrine but as a work-and-attribution framework: karmayoga (action-orientation, detachment from outcomes) sustains rather than reduces effort under stress. Do not translate as fatalism.',
    '남아시아 사용자가 ''이건 내 카르마'' 틀을 쓰면 인과-귀인 주장으로 다루고 학습된 무력감으로 번역 금지. 비-힌두 배경 사용자에게 종교 전제 강요 금지.'
  ),
  (
    'Self-Assertive Interdependence in Arab Culture',
    ARRAY['Alvaro San Martin','Marwan Sinaceur','Amer Madi','Steve Tompson','William W. Maddux','Shinobu Kitayama'],
    '10.1038/s41562-018-0435-z',
    'https://doi.org/10.1038/s41562-018-0435-z',
    'cross_cultural_global_south',
    'adult',
    'en',
    now(),
    '아랍 문화는 ''상호의존''이면서 동시에 ''자기주장''이 강한 형태(self-assertive interdependence)임을 보여줌. 동아시아의 자기절제형 상호의존을 아랍에 그대로 적용하면 틀린다는 load-bearing 증거. 상호의존=순응이라는 단순 가정 차단.',
    'Shows Arab culture combines interdependence WITH self-assertion (self-assertive interdependence). Load-bearing evidence that East-Asian self-effacing interdependence does not transfer to Arab contexts; blocks the assumption that interdependence equals conformity.',
    '아랍·MENA 사용자의 상호의존 서사를 동아시아형으로 가정 금지 — 자기주장과 공존함. 종교(이슬람)와 민족·문화를 동일시 금지.'
  );
