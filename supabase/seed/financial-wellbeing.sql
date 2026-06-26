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
