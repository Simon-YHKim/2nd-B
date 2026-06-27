-- Financial well-being — grounding for the FINANCE (재정) domain star.
-- The existing corpus had no money-psychology source; this anchors finance
-- advice in the validated perceived-financial-well-being construct.
-- DOI verified against Crossref / publisher record.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'How Am I Doing? Perceived Financial Well-Being, Its Potential Antecedents, and Its Relation to Overall Well-Being',
    ARRAY['Richard G. Netemeyer','Dee Warmath','Daniel Fernandes','John G. Lynch Jr.'],
    '10.1093/jcr/ucx109',
    'https://doi.org/10.1093/jcr/ucx109',
    'finance',
    'adult',
    'en',
    now(),
    '''지각된 재정적 웰빙''을 두 차원으로 분리: 현재 재정 스트레스(current money management stress)와 미래 재정 안정 기대(expected future financial security). 이 두 차원이 객관적 소득보다 전반적 삶의 만족을 더 강하게 예측. 재정은 ''얼마 버느냐''가 아니라 ''스스로 통제하고 있다고 느끼느냐''의 문제임을 보여줌.',
    'Splits perceived financial well-being into two dimensions: current money-management stress and expected future financial security. Both predict overall life satisfaction more strongly than objective income. Finance is less about how much one earns than about the felt sense of being in control.',
    'finance 도메인 별의 학술 근거. Advisor가 재정 항목을 다룰 때 소득 액수가 아니라 ''통제감''과 ''미래 안정 기대''를 mirror하도록 프롬프트 설계. 처방·조언 금지, 본인 인식 반영만.'
  );

-- Deepen the finance domain (1 -> 3 rows). DOIs verified against Crossref.
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Financial well-being: A conceptualization and research agenda',
    ARRAY['Elisabeth C. Brüggen','Jens Hogreve','Maria Holmlund','Sertan Kabadayi','Martin Löfgren'],
    '10.1016/j.jbusres.2017.03.013',
    'https://doi.org/10.1016/j.jbusres.2017.03.013',
    'finance',
    'adult',
    'both',
    now(),
    '재정적 웰빙을 ''현재 재정 상황을 감당하고 미래 재정 자유를 누릴 수 있다는 인식''으로 정의하고, 그 결정 요인을 개인 행동(financial behavior)·개입(financial literacy 교육 등)·맥락(소득, 제도)으로 정리한 개념 종합. 재정 웰빙은 단일 수치가 아니라 행동·지식·환경이 함께 만드는 상태임을 보여줌.',
    'Defines financial well-being as the perception of being able to sustain current and future financial freedom, and organizes its drivers into personal behavior, interventions (e.g. literacy), and context (income, systems). Financial well-being is a state co-produced by behavior, knowledge, and environment, not a single number.',
    'finance 도메인 별 보강 근거. Advisor가 재정 기록을 다룰 때 ''행동/지식/환경'' 세 갈래로 사용자가 어디에 서 있는지 비춰주되, 특정 상품·투자 처방은 금지(paid-api-guard·비조언 원칙).'
  ),
  (
    'High income improves evaluation of life but not emotional well-being',
    ARRAY['Daniel Kahneman','Angus Deaton'],
    '10.1073/pnas.1011492107',
    'https://doi.org/10.1073/pnas.1011492107',
    'finance',
    'adult',
    'both',
    now(),
    '소득은 삶에 대한 ''평가적 만족''(life evaluation)은 계속 끌어올리지만, 일상의 ''정서적 웰빙''(emotional well-being)은 일정 소득 수준 위에서 더는 크게 좋아지지 않음. 재정 목표를 정서적 행복과 동일시하지 않도록 돕는 경계선. 돈과 행복의 관계를 단순 비례로 보지 않게 함.',
    'Income keeps lifting evaluative life satisfaction, but day-to-day emotional well-being stops improving much above a certain income level. A boundary that helps separate financial goals from emotional happiness, so money and well-being are not read as simply proportional.',
    'finance 도메인 별 보강 근거. Advisor가 ''돈을 더 벌면 더 행복''이라는 자동 가정에 빠지지 않도록, 평가적 만족과 정서적 웰빙을 구분해 사용자의 재정 목표를 비춰줌. 라이프스타일 중립, 비임상.'
  );
