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

-- Wave 2 (field-level + cross-cultural-trait + diaspora rows). Accurately
-- summarized after confirming each paper's core finding; the remaining ~7 verified
-- DOIs (Diaz-Loving 1998/2005, Soueif & Ahmed 2001, Kim/Yang/Hwang 2006 book+chapter,
-- Nsamenang 1992 book, Allwood & Berry preface) are deferred to a source-reading
-- pass rather than summarized from memory — integrity over completeness.
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Universal Features of Personality Traits From the Observer''s Perspective: Data From 50 Cultures',
    ARRAY['Robert R. McCrae','Antonio Terracciano'],
    '10.1037/0022-3514.88.3.547',
    'https://doi.org/10.1037/0022-3514.88.3.547',
    'cross_cultural_global_south', 'adult', 'en', now(),
    '50개 문화의 관찰자 평정 자료에서 Big Five 5요인 구조가 반복 재현됨. 성격의 기본 골격은 문화 보편적일 수 있음을 보여주되, 평균 수준·표현 방식의 문화 차이는 별개 문제로 남김.',
    'Across observer ratings from 50 cultures the Big Five structure replicates, suggesting the basic skeleton of personality may be culture-universal — while mean levels and expression remain separate, culturally variable matters.',
    '문화 보편 골격과 문화별 표현·평균을 구분하는 근거. 보편성을 빌미로 개인의 문화 맥락을 지우지 말 것.'
  ),
  (
    'The Geographic Distribution of Big Five Personality Traits: Patterns and Profiles of Human Self-Description Across 56 Nations',
    ARRAY['David P. Schmitt','Juri Allik','Robert R. McCrae','Veronica Benet-Martinez'],
    '10.1177/0022022106297299',
    'https://doi.org/10.1177/0022022106297299',
    'cross_cultural_global_south', 'adult', 'en', now(),
    '56개국 자기기술 자료로 Big Five의 지리적 분포를 지도화. 국가 간 평균 차이는 실재하나 개인 내 변산이 더 크다 — 국적으로 개인 성격을 추정하지 말라는 경고.',
    'Maps the geographic distribution of Big Five self-descriptions across 56 nations. National mean differences are real but within-nation variance is larger — a caution against inferring an individual''s personality from nationality.',
    '국적→성격 추정 금지의 근거. 문화 우선이 ''문화로 개인을 결정''하는 것은 아님을 Advisor가 지킬 것.'
  ),
  (
    'Cultural Specificity of Individualism and Collectivism: Variation Within and Between Cultures',
    ARRAY['Harry C. Triandis','Theodore M. Singelis'],
    '10.1016/s0147-1767(97)00034-5',
    'https://doi.org/10.1016/s0147-1767(97)00034-5',
    'cross_cultural_global_south', 'adult', 'en', now(),
    '개인주의/집단주의는 문화 ''사이''뿐 아니라 문화 ''안''에서도 크게 달라진다. 한 사람도 독립적·상호의존적 자기관을 동시에 지니며 맥락에 따라 어느 쪽이 활성화된다. 문화=집단주의로 고정하면 틀림.',
    'Individualism/collectivism varies as much WITHIN cultures as between them. One person holds both independent and interdependent self-construals, with context activating one or the other. Fixing a culture as "collectivist" is wrong.',
    '''한국인이니 집단주의'' 같은 고정 가정 금지. 같은 사람도 상황에 따라 다른 자기관이 켜짐을 mirror.'
  ),
  (
    'The Place of Culture in Psychological Science',
    ARRAY['Girishwar Misra','Kenneth J. Gergen'],
    '10.1080/00207599308247186',
    'https://doi.org/10.1080/00207599308247186',
    'cross_cultural_global_south', 'adult', 'en', now(),
    '서구 심리학이 ''탈맥락적 보편 법칙''을 자처해온 데 대한 비판. 인지·자기·감정은 문화적으로 구성되며, 비서구 지식 체계도 그 자체로 정합적임을 인정해야 한다고 주장.',
    'A critique of Western psychology''s claim to context-free universal laws. Cognition, self, and emotion are culturally constituted, and non-Western knowledge systems are internally coherent on their own terms.',
    '비서구 사용자의 자기 이해 틀을 ''틀린 버전''이 아니라 정합적 체계로 대우하는 근거.'
  ),
  (
    'Mainstreaming Culture in Psychology',
    ARRAY['Fanny M. Cheung','Fons J. R. van de Vijver','Frederick T. L. Leong'],
    '10.1037/a0029876',
    'https://doi.org/10.1037/a0029876',
    'cross_cultural_global_south', 'adult', 'en', now(),
    '문화를 심리학의 변두리 하위분야가 아니라 본류로 통합하자는 주장. emic(토착)과 etic(보편) 접근을 결합해 방법적 엄밀성과 문화 민감성을 함께 확보하는 방향 제시.',
    'Argues for integrating culture into the mainstream of psychology rather than a peripheral subfield, via a combined emic (indigenous) + etic (universal) approach that keeps both methodological rigor and cultural sensitivity.',
    '문화 우선 설계의 학술적 정당화. 토착 개념과 보편 측정을 함께 쓰되 어느 쪽도 특권화하지 않기.'
  ),
  (
    'Acculturation, Dialogical Voices and the Construction of the Diasporic Self',
    ARRAY['Sunil Bhatia'],
    '10.1177/0959354302121004',
    'https://doi.org/10.1177/0959354302121004',
    'cross_cultural_global_south', 'adult', 'en', now(),
    '디아스포라 정체성은 ''조화로운 통합''이 아니라 모국·정착국 사이의 갈등·협상·혼종이 끊임없이 이어지는 대화적 과정이다. 동화/분리/주변화의 ''나'' 위치들이 권력 불균형 속에서 공존.',
    'Diasporic identity is not a harmonious integration but an ongoing dialogical negotiation — conflict, hybridization, and competing I-positions (assimilated, separated, marginalized) coexisting within power inequalities.',
    '이민·디아스포라 사용자의 정체성 혼란을 ''미완성''이 아니라 정상적 대화 과정으로 비춤. 단일한 조화된 정체성을 강요 금지.'
  ),
  (
    'Foundations of Psychosocial Dynamic Personality Theory of Collective People',
    ARRAY['Marwan Dwairy'],
    '10.1016/s0272-7358(01)00100-3',
    'https://doi.org/10.1016/s0272-7358(01)00100-3',
    'cross_cultural_global_south', 'adult', 'en', now(),
    '집단주의 사회에서는 서구적 의미의 개별화(individuation)가 잘 일어나지 않으며, 규범·역할·가족 권위 지시가 ''개인 성격''보다 행동을 더 잘 예측한다. 서구 성격 이론의 적용 한계를 지적.',
    'In collective societies, Western-style individuation often does not occur, and norms, roles, and family-authority directives predict behavior more than "individual personality." Flags the limits of applying Western personality theory.',
    '집단주의 맥락 사용자의 행동을 ''개인 성격''으로만 환원하지 말고 역할·가족 맥락을 함께 비춤. 개별화 부재를 결함으로 보지 말 것.'
  ),
  (
    'The Global Need for Indigenous Psychology',
    ARRAY['Dharm P. S. Bhawuk'],
    '10.1007/978-1-4419-8110-3_1',
    'https://doi.org/10.1007/978-1-4419-8110-3_1',
    'cross_cultural_global_south', 'adult', 'en', now(),
    '토착 심리학은 ''이국적 문화 전용''이 아니라 모든 사회에 필요하다는 주장. 각 문화의 개념·방법 자원에 뿌리내린 이론화가 보편 심리학을 더 풍부하고 정확하게 만든다.',
    'Indigenous psychology is needed everywhere, not only for "exotic" cultures: theorizing rooted in each culture''s own concepts and methods makes general psychology richer and more accurate.',
    '문화 우선 접근이 ''비서구 예외 처리''가 아니라 보편 원칙임을 뒷받침. 모든 사용자에게 그들의 개념 자원을 존중.'
  ),
  (
    'Origins of and Need for Indigenous Psychologies',
    ARRAY['Carl Martin Allwood','John W. Berry'],
    '10.1080/00207590544000013',
    'https://doi.org/10.1080/00207590544000013',
    'cross_cultural_global_south', 'adult', 'en', now(),
    '여러 나라의 토착 심리학이 ''수입된 서구 틀''의 한계에 대한 응답으로 등장했음을 정리. 토착 심리학은 민속 신념이 아니라 지역 개념·방법에 근거한 학문적 commitment임을 분명히 함.',
    'Reviews how indigenous psychologies arose as a response to the limits of imported Western frameworks, clarifying that indigenous psychology is a disciplinary commitment grounded in local concepts and methods, not folk belief.',
    '토착 개념을 Tier-D 민속이 아니라 학문적 자원으로 구분해 다루는 근거(batch §6 indigenous ≠ folk).'
  );
