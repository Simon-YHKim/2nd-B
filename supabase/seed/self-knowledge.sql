-- Self-Knowledge Methods (Reflection · Insight · Expressive Writing · Mindful Attention)
-- Batch source: docs/research/batches/self-knowledge.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- This is the closest theoretical+empirical fit for 2nd-Brain's
-- journaling-as-self-understanding mechanic. The central insight:
-- reflection helps, rumination harms, and the difference is measurable
-- and actionable in product design.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Confronting a traumatic event: Toward an understanding of inhibition and disease',
    ARRAY['James W. Pennebaker','Sandra K. Beall'],
    '10.1037/0021-843X.95.3.274',
    'https://doi.org/10.1037/0021-843X.95.3.274',
    'self_knowledge',
    'adult',
    'en',
    now(),
    '''표현적 글쓰기'' 연구의 출발점. 트라우마에 대해 4일간 글을 쓴 집단이 통제집단보다 장기 건강 지표가 개선됨을 보임. 억제 가설(억눌린 경험을 언어화하면 신체·정신 건강이 향상된다)의 시초.',
    'Foundational study of expressive writing. Participants who wrote about traumatic events for 4 days showed improved long-term health markers vs controls. Origin of the inhibition hypothesis — that putting suppressed experience into language improves physical and mental health.',
    '저널링이 건강·웰빙에 미치는 효과의 학술 1차 출처. 단 효과는 modest이며 무지원 트라우마 글쓰기는 일부에게 해로울 수 있음.'
  ),
  (
    'Self-concept clarity: Measurement, personality correlates, and cultural boundaries',
    ARRAY['Jennifer D. Campbell','Paul D. Trapnell','Steven J. Heine','Ilana M. Katz','Loraine F. Lavallee','Darrin R. Lehman'],
    '10.1037/0022-3514.70.1.141',
    'https://doi.org/10.1037/0022-3514.70.1.141',
    'self_knowledge',
    'adult',
    'both',
    now(),
    '자기개념 명료성(self-concept clarity) 척도 SCCS 개발 논문. 자기 신념이 얼마나 명확하고, 내적으로 일관되며, 시간에 걸쳐 안정적인가를 측정. 동아시아 표본에서는 Western보다 SCC가 낮은 경향 — 변증법적 자기관의 정상 표현으로 해석.',
    'Develops the Self-Concept Clarity Scale (SCCS). Measures how clearly and confidently self-beliefs are defined, internally consistent, and temporally stable. East Asian samples show lower SCC than Western — interpreted as dialectical self-construal, not pathology.',
    '2nd-Brain의 outcome 지표 후보: 사용자의 self-statement 일관성·안정성을 시간 축으로 추적. 단 한국 사용자에게 ''SCC 낮음 = 문제''로 해석하지 말 것.'
  ),
  (
    'Private self-consciousness and the five-factor model of personality: Distinguishing rumination from reflection',
    ARRAY['Paul D. Trapnell','Jennifer D. Campbell'],
    '10.1037/0022-3514.76.2.284',
    'https://doi.org/10.1037/0022-3514.76.2.284',
    'self_knowledge',
    'adult',
    'en',
    now(),
    '''자기에 대해 많이 생각함''에는 두 얼굴이 있음을 입증한 핵심 논문. Rumination(과거에 대한 반복 자기집중, Neuroticism 관련, 해로움)과 Reflection(자기탐색에 대한 철학적 사랑, Openness 관련, 유익함)을 24문항 RRQ로 분리.',
    'Key paper demonstrating that "thinking about oneself a lot" has two distinct faces. Develops the 24-item Rumination-Reflection Questionnaire (RRQ). Rumination = repetitive self-focus on past, links to Neuroticism, harmful. Reflection = philosophical love of self-exploration, links to Openness, beneficial.',
    '2nd-Brain product 설계의 결정적 분기점. 모든 자기성찰 프롬프트는 reflection 모드를 유도하고 rumination 모드를 차단하도록 설계.'
  ),
  (
    'The Self-Reflection and Insight Scale: A new measure of private self-consciousness',
    ARRAY['Anthony M. Grant','John Franklin','Peter Langford'],
    '10.2224/sbp.2002.30.8.821',
    'https://doi.org/10.2224/sbp.2002.30.8.821',
    'self_knowledge',
    'adult',
    'en',
    now(),
    'Self-Reflection and Insight Scale(SRIS) 개발 논문. 자기성찰 ''과정''(self-reflection)과 ''결과''(insight)를 분리 측정. 높은 reflection + 낮은 insight는 ''갇힌 성찰''(stuck reflection) 패턴으로 chronic 시 웰빙 저하.',
    'Develops the Self-Reflection and Insight Scale (SRIS) distinguishing self-reflection (process) from insight (outcome). High reflection with low insight ("stuck reflection") chronically predicts lower wellbeing — reflection without resulting understanding is counterproductive.',
    'Product KPI 설계: entry 양만 추적하지 않고 insight 신호(synthesis 문장, 행동 변화 언급 등)의 증가를 함께 추적. 양 늘면서 insight 정체면 advisor 모드 조정.'
  ),
  (
    'The benefits of being present: Mindfulness and its role in psychological well-being',
    ARRAY['Kirk Warren Brown','Richard M. Ryan'],
    '10.1037/0022-3514.84.4.822',
    'https://doi.org/10.1037/0022-3514.84.4.822',
    'self_knowledge',
    'adult',
    'en',
    now(),
    'Mindful Attention Awareness Scale(MAAS) 15문항 척도 개발 및 마음챙김과 정신건강 관계 입증 핵심 논문. 현재 순간 주의·자각이 정서적 웰빙, 자기조절, 진정성과 정적 상관, 반추와 부적 상관.',
    'Develops the 15-item Mindful Attention Awareness Scale (MAAS). Establishes that present-moment attention/awareness correlates positively with emotional well-being, self-regulation, and authenticity, and negatively with rumination.',
    'Rumination 차단 도구. 사용자가 stuck loop에 빠진 신호가 감지되면 reflection 프롬프트 대신 MAAS-style ''지금 무엇을 느끼는지'' 프롬프트로 전환.'
  ),
  (
    'Experimental disclosure and its moderators: A meta-analysis',
    ARRAY['Joanne Frattaroli'],
    '10.1037/0033-2909.132.6.823',
    'https://doi.org/10.1037/0033-2909.132.6.823',
    'self_knowledge',
    'adult',
    'en',
    now(),
    '146건의 무작위 표현적 글쓰기 연구 메타분석. 전체 효과 d≈0.075 (modest but real). 더 강한 효과를 만드는 moderators: 3회 이상 세션, 회당 15분 이상, 구체적 지침, 사적 공간, 고스트레스/저낙관 참여자.',
    'Meta-analysis of 146 randomized expressive-writing studies. Overall effect d≈0.075 — modest but real. Stronger effects with ≥3 sessions, ≥15 minutes each, specific instructions, private space, and for participants with high stress or low optimism.',
    '2nd-Brain product UX 직접 입력: ≥3 세션 권장, ≥15분 길이 권장 UI cue, 구체적 프롬프트 default, sharing-by-default 금지. 효과를 과장하지 않음.'
  ),
  (
    'Validation of the Korean Version of Mindful Attention Awareness Scale',
    ARRAY['Sun Jung Kwon','Kyo Heon Kim'],
    '10.17315/kjhp.2007.12.1.014',
    'https://doi.org/10.17315/kjhp.2007.12.1.014',
    'self_knowledge',
    'adult',
    'ko',
    now(),
    'K-MAAS 검증 연구. 원판의 일요인 구조 재현, Cronbach''s α = .87, 수렴·변별·증분 타당도 양호. 한국어 마음챙김 측정의 1차 도구.',
    'Validates the Korean MAAS. Replicates the original single-factor structure with high reliability (Cronbach''s α = .87), with good convergent, discriminant, and incremental validity. Primary Korean-language mindfulness attention measure.',
    '한국 사용자 ''지금-여기'' 프롬프트의 어휘 기반. 영어 MAAS 직역 대신 K-MAAS 문항 참고.'
  );
