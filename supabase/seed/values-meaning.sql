-- Values, Meaning & Self-Concordant Goals — the "philosophy" layer
-- Batch source: docs/research/batches/values-meaning.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- Complements assessment_a_values (Schwartz taxonomy) with the applied
-- writing-and-wellbeing-linked literature most relevant to 2nd-Brain.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Goal striving, need satisfaction, and longitudinal well-being: The self-concordance model',
    ARRAY['Kennon M. Sheldon','Andrew J. Elliot'],
    '10.1037/0022-3514.76.3.482',
    'https://doi.org/10.1037/0022-3514.76.3.482',
    'values_meaning',
    'adult',
    'en',
    now(),
    '목표를 추구하는 ''이유''가 웰빙을 결정한다는 self-concordance 모델 핵심 종단연구. intrinsic·identified 동기는 노력 지속·달성 가능성·달성 후 웰빙을 높임. introjected(죄책감 회피)·external(외부 강요) 동기는 달성해도 웰빙 효과 약함.',
    'Longitudinal self-concordance model: the "why" of a goal determines its wellbeing yield. Intrinsic + identified motives predict sustained effort, attainment, and post-attainment wellbeing. Introjected (guilt-avoidance) + external (imposed) motives can be achieved but produce weak durable wellbeing.',
    'Advisor의 ''이 목표가 정말 본인 것인가'' 프롬프트의 학술 근거. introjected 패턴을 발견하면 mirror만, 처방 금지.'
  ),
  (
    'The health benefits of writing about life goals',
    ARRAY['Laura A. King'],
    '10.1177/0146167201277003',
    'https://doi.org/10.1177/0146167201277003',
    'values_meaning',
    'adult',
    'en',
    now(),
    '''최선의 가능한 자아''(Best Possible Self) 글쓰기 개입의 효시. 4일간 20분 글쓰기로 주관적 웰빙 증가 + 5개월 후 질병 감소. 트라우마 글쓰기보다 덜 고통스러우면서 비슷한 건강 이득.',
    'Seminal Best Possible Self writing intervention. 20-min/day for 4 days about ideal future self produced increased subjective wellbeing and decreased illness 5 months later. Less distressing than trauma writing while producing comparable health benefits.',
    '2nd-Brain의 주기적 ritual prompt 후보 (월 1회 best-possible-self). Frattaroli moderators(15분+, 구체적 지침, 사적 공간)와 결합해 UX 설계.'
  ),
  (
    'The Meaning in Life Questionnaire: Assessing the presence of and search for meaning in life',
    ARRAY['Michael F. Steger','Patricia Frazier','Shigehiro Oishi','Matthew Kaler'],
    '10.1037/0022-0167.53.1.80',
    'https://doi.org/10.1037/0022-0167.53.1.80',
    'values_meaning',
    'adult',
    'both',
    now(),
    'Meaning in Life Questionnaire(MLQ) 10문항 척도 개발. 의미 ''존재''(presence)와 의미 ''탐색''(search)을 분리 측정. 두 차원은 독립적이며 문화권에 따라 search-wellbeing 관계가 다름(서구: 부적, 일부 동아시아: 정적).',
    'Develops the 10-item Meaning in Life Questionnaire (MLQ) with two distinct dimensions: Presence (have meaning) and Search (looking for meaning). Dimensions are independent; search-wellbeing relationship varies by culture (negative in Western adults, positive in some East Asian samples).',
    '한국 사용자에게 ''의미를 찾고 있다''는 상태를 결핍이 아닌 가능태로 해석하는 학술 근거.'
  ),
  (
    'The Valued Living Questionnaire: Defining and Measuring Valued Action within a Behavioral Framework',
    ARRAY['Kelly G. Wilson','Emily K. Sandoz','Jennifer Kitchens','Miguel Roberts'],
    '10.1007/BF03395706',
    'https://doi.org/10.1007/BF03395706',
    'values_meaning',
    'adult',
    'en',
    now(),
    'ACT 가치 명료화의 핵심 측정 도구 VLQ. 10개 생활 영역(가족·친밀관계·양육·친구·일·교육·여가·영성·시민·건강) 각각의 ''중요도''와 ''실제 행동 일치도''를 분리 측정해 value-action gap을 진단.',
    'Core ACT values clarification measure. The 10-domain VLQ (family, intimate relationships, parenting, friendships, work, education, recreation, spirituality, citizenship, health) separately measures stated importance and actual congruent action, surfacing value-action gaps.',
    '2nd-Brain의 importance-vs-action 그리드 대시보드 학술 근거. 사용자의 stated 중요도와 entry-time 분포 비교로 gap 시각화.'
  ),
  (
    'Assessing quality of life among elementary school students: Validation of the Korean version of the Meaning in Life in Children Questionnaire',
    ARRAY['Younyoung Choi','Joo Yeon Shin'],
    '10.3389/fpsyg.2022.904115',
    'https://doi.org/10.3389/fpsyg.2022.904115',
    'values_meaning',
    'child',
    'ko',
    now(),
    '한국 초등학생용 의미 척도 K-MIL-CQ 검증 연구. presence·search 두 차원 구조가 한국 아동 표본에서도 유지됨을 확인. 다른 배치에서 다루지 못한 아동 단계 한국어 의미 측정의 학술 근거.',
    'Validates the Korean Meaning in Life in Children Questionnaire (K-MIL-CQ) in elementary students. Confirms the two-dimensional (presence, search) structure in Korean children. Extends Korean-validated meaning measurement down to the child age range not covered elsewhere in this seed.',
    '아동 사용자(보호자 동의 하 사용 시나리오) ''의미'' 프롬프트의 한국어 어휘 기반. 직역 금지.'
  );
