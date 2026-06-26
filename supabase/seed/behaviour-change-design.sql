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
