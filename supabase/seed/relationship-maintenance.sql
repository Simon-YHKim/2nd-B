-- Relationship maintenance (Investment Model) — grounding for the RELATION (관계)
-- domain star. attachment.sql + interpersonal.sql cover STYLE / PROBLEMS, not the
-- maintenance/commitment dynamics; this anchors relationship advice in Le & Agnew's
-- meta-analysis of Rusbult's Investment Model.
-- DOI verified against Crossref / publisher record.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Commitment and Its Theorized Determinants: A Meta-Analysis of the Investment Model',
    ARRAY['Benjamin Le','Christopher R. Agnew'],
    '10.1111/1475-6811.00035',
    'https://doi.org/10.1111/1475-6811.00035',
    'relation',
    'adult',
    'both',
    now(),
    'Rusbult 투자 모델(Investment Model)의 메타분석: 관계 헌신(commitment)은 세 요인으로 예측됨 — 만족도(satisfaction), 대안의 질(quality of alternatives, 낮을수록 헌신↑), 투자 규모(investment size). 헌신은 다시 관계 지속을 예측. 관계 유지는 감정만이 아니라 쌓아온 투자와 대안 인식의 함수임을 보여줌.',
    'Meta-analysis of Rusbult''s Investment Model: relationship commitment is predicted by three factors — satisfaction, quality of alternatives (lower alternatives raise commitment), and investment size. Commitment in turn predicts persistence. Relationship maintenance is a function not of feeling alone but of accumulated investment and perceived alternatives.',
    'relation 도메인 별의 학술 근거. Advisor가 관계 항목을 다룰 때 사용자가 기록한 만족·투자·대안 인식을 mirror. 관계 유지/종료를 처방하지 않고, 본인이 무엇을 투자해 왔는지 비춰주는 self-understanding 용도로만.'
  );
