-- Leisure & well-being (DRAMMA) — grounding for the RECREATION (오락) domain star.
-- The existing corpus had no leisure psychology (false-positive "flow" hits were
-- workflow/flowchart). This anchors recreation advice in the DRAMMA model of how
-- leisure produces well-being. DOI verified against Crossref / publisher record.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Leisure and Subjective Well-Being: A Model of Psychological Mechanisms as Mediating Factors',
    ARRAY['David B. Newman','Louis Tay','Ed Diener'],
    '10.1007/s10902-013-9435-x',
    'https://doi.org/10.1007/s10902-013-9435-x',
    'recreation',
    'adult',
    'en',
    now(),
    'DRAMMA 모델: 여가가 주관적 웰빙으로 이어지는 6개 심리 경로 — Detachment-recovery(회복), Autonomy(자율), Mastery(숙달), Meaning(의미), Affiliation(관계). 여가의 가치는 시간량이 아니라 이 경로들이 얼마나 충족되는지로 결정됨. 같은 활동도 어떤 경로를 채우느냐에 따라 효과가 다름.',
    'The DRAMMA model: six psychological pathways through which leisure yields subjective well-being — Detachment-recovery, Autonomy, Mastery, Meaning, and Affiliation. Leisure value depends not on hours spent but on how well these pathways are met; the same activity differs by which pathway it fills.',
    'recreation 도메인 별의 학술 근거. Advisor가 오락 항목을 다룰 때 ''얼마나 자주''가 아니라 어떤 DRAMMA 경로(회복·자율·숙달·의미·관계)를 채우는지 mirror. 활동 추천이 아니라 본인 여가의 의미를 비춰주기.'
  );
