-- Methodology Analysis — coaching meta-analysis evidence
-- Batch source: docs/research/batches/methodology-birkman-brain-trinity.md
-- DOI verified against Crossref / publisher record, May 2026.
--
-- Single row addition: Theeboom et al. (2014) is the strongest published
-- evidence on whether structured coaching works, with effect sizes
-- substantially larger than unstructured expressive writing (Frattaroli
-- 2006 d≈0.075 vs Theeboom g=0.43–0.74). Directly informs the question
-- "does a self-guided Brain-Trinity-style system produce real outcomes
-- without coach scaffolding?"

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Does coaching work? A meta-analysis on the effects of coaching on individual level outcomes in an organizational context',
    ARRAY['Tim Theeboom','Bianca Beersma','Annelies E. M. van Vianen'],
    '10.1080/17439760.2013.837499',
    'https://doi.org/10.1080/17439760.2013.837499',
    'self_knowledge',
    'adult',
    'en',
    now(),
    '코칭의 효과를 측정한 메타분석. 18개 연구 통합 결과 코핑(g=0.43), 직무 만족, 웰빙, 목표 지향적 자기조절(g=0.74) 모두에 유의한 정적 효과. 비구조 표현적 글쓰기(Frattaroli d≈0.075)보다 효과 크기가 5배 이상 큼 — 구조화된 대화가 결정적 차이.',
    'Meta-analysis of coaching effects in organizational contexts. Significant positive effects on coping (g=0.43), well-being, work attitudes, and goal-directed self-regulation (g=0.74). Effect sizes are 5×+ larger than unstructured expressive writing (Frattaroli 2006 d≈0.075), demonstrating that structured guided conversation drives most of the value.',
    '자기-주도 시스템(Polaris·PARA·LLM Wiki 등)이 코치 없이 작동할 때 효과 손실이 큼을 보이는 학술 근거. 2nd-Brain의 Advisor가 ''코치 대체재''로 작동하도록 설계해야 효과 보존 가능.'
  );
