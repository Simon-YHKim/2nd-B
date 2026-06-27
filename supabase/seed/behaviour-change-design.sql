-- Behaviour-change design (COM-B) — grounding for the HEALTH (건강) domain star.
-- habit-formation-change.sql supplies the automaticity MECHANISM but no design
-- spine; this anchors health-habit support in the COM-B / Behaviour Change Wheel.
-- DOI verified against Crossref / publisher record.
-- Lexicon-clean: no clinical terms; framed as everyday habit and lifestyle support.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'The Behaviour Change Wheel: A New Method for Characterising and Designing Behaviour Change Interventions',
    ARRAY['Susan Michie','Maartje M. van Stralen','Robert West'],
    '10.1186/1748-5908-6-42',
    'https://doi.org/10.1186/1748-5908-6-42',
    'health',
    'adult',
    'both',
    now(),
    'COM-B 모델: 어떤 행동이든 Capability(능력)·Opportunity(기회)·Motivation(동기) 세 조건이 맞아야 일어남. 습관이 안 잡히면 의지 부족으로 단정하지 말고 세 축 중 무엇이 빠졌는지 짚어보라는 설계 틀. 일상 습관·생활 루틴 지원의 구조적 뼈대.',
    'The COM-B model: any behaviour requires Capability, Opportunity, and Motivation to co-occur. When a habit fails to form, the framework asks which of the three is missing rather than blaming willpower. A structural spine for everyday habit and lifestyle-routine support.',
    'health 도메인 별의 학술 근거. Advisor가 건강 습관 항목을 다룰 때 사용자가 막힌 지점을 능력/기회/동기 셋 중 어디인지로 mirror. 임상 조언 금지, 본인 루틴 설계를 비춰주는 self-understanding 도구로만 사용.'
  );

-- Deepen the health domain (1 -> 3 rows) with two everyday-lifestyle anchors
-- (movement + sleep). DOIs verified against Crossref. Lexicon-clean: framed as
-- daily activity and rest, never as clinical care.
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Health benefits of physical activity: the evidence',
    ARRAY['Darren E. R. Warburton','Crystal Whitney Nicol','Shannon S. D. Bredin'],
    '10.1503/cmaj.051351',
    'https://doi.org/10.1503/cmaj.051351',
    'health',
    'adult',
    'both',
    now(),
    '규칙적인 신체활동과 일상 컨디션·활력 사이에는 용량-반응(dose-response) 관계가 있어, 조금만 더 움직여도 도움이 되고 더 많이 움직일수록 이점이 커지는 경향. 운동을 ''전부 아니면 전무''로 보지 않게 하는 근거. 일상 움직임을 기록·반영하는 라이프스타일 입력으로 다룸.',
    'Regular physical activity shows a dose-response relationship with everyday function and vitality: even a little more movement helps, and more tends to help more. Evidence against an all-or-nothing view of exercise. Treated as a lifestyle input the user logs and reflects on.',
    'health 도메인 별 보강 근거. Advisor가 활동 기록을 ''완벽 아니면 실패''가 아니라 점진적 움직임으로 비춰줌. 운동 처방·임상 조언 금지, 본인 생활 패턴 반영만.'
  ),
  (
    'National Sleep Foundation''s sleep time duration recommendations: methodology and results summary',
    ARRAY['Max Hirshkowitz','Kaitlyn Whiton','Steven M. Albert','Cathy Alessi','Oliviero Bruni','Lydia DonCarlos'],
    '10.1016/j.sleh.2014.12.010',
    'https://doi.org/10.1016/j.sleh.2014.12.010',
    'health',
    'lifespan',
    'both',
    now(),
    '연령대별 권장 수면 시간을 전문가 합의로 정리(성인 7-9시간 등). 적정 수면은 나이에 따라 다르고 개인차가 있으므로, 단일 기준이 아니라 ''내 연령대 범위 안에서 나는 어디인가''로 보게 하는 참고선. 수면을 라이프스타일 입력으로 기록·반영.',
    'Expert-consensus recommended sleep durations by age band (e.g. 7-9h for adults). Adequate sleep varies with age and individual difference, so it serves as a reference range — "where am I within my age band" — rather than a single rule. Sleep treated as a lifestyle input to log and reflect on.',
    'health 도메인 별 보강 근거. Advisor가 수면 기록을 연령대 참고 범위에 비춰주되, 부족을 단정하거나 임상 판단을 내리지 않음. self-understanding 용도, 라이프스타일 중립.'
  );
