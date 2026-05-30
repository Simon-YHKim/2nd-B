-- Emotional Intelligence — Ability Model (MSCEIT lineage) — verified knowledge sources
-- Batch source: docs/research/batches/emotional-intelligence-mscit.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- `verified_at = now()` set at insert; re-verify quarterly.
-- 2nd-Brain uses ability-EI as conceptual scaffolding only; never as a deliverable score.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Emotional intelligence',
    ARRAY['Peter Salovey','John D. Mayer'],
    '10.2190/DUGG-P24E-52WK-6CDG',
    'https://doi.org/10.2190/DUGG-P24E-52WK-6CDG',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    'EI를 자신과 타인의 감정을 모니터링·구분·활용하는 능력으로 처음 정의한 1990년 원논문. 능력/특성 분리 이전 단계의 개념이며 이후 능력 모델(ability model) 발전의 출발점.',
    'The originating paper. EI defined as "the ability to monitor one''s own and others'' feelings and emotions, to discriminate among them, and to use this information to guide one''s thinking and action." Predates the ability/trait split — sets the ability trajectory the authors later developed.',
    'Framework anchor only. Do not use as a measurement tool. EI 어휘의 가장 원천적 1차 인용.'
  ),
  (
    'The intelligence of emotional intelligence',
    ARRAY['John D. Mayer','Peter Salovey'],
    '10.1016/0160-2896(93)90010-3',
    'https://doi.org/10.1016/0160-2896(93)90010-3',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    'EI가 왜 "지능(intelligence)"이라는 단어를 쓸 자격이 있는지 논증한 핵심 논문. 자기보고가 아니라 능력 검사(최대 수행 측정)로 측정되어야 한다는 핵심 주장을 처음 제시. MSCEIT 프로그램의 개념적 씨앗.',
    'The argument that EI deserves the word "intelligence." Lays out why EI must be measured as ability (maximum performance), not as a self-report personality trait. Conceptual seed for MSCEIT.',
    '왜 MSCEIT 계보가 자기보고 EI 척도보다 선호되는지 설명할 때 인용.'
  ),
  (
    'Measuring emotional intelligence with the MSCEIT V2.0',
    ARRAY['John D. Mayer','Peter Salovey','David R. Caruso','Gill Sitarenios'],
    '10.1037/1528-3542.3.1.97',
    'https://doi.org/10.1037/1528-3542.3.1.97',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    'MSCEIT V2.0 표준 검증 논문. 141문항 능력 검사로 4가지(인식·활용·이해·조절) 위계 구조를 N=2,112 표본에서 확립. 전체 신뢰도 α≈.91(합의 채점) / .90(전문가 채점)을 보고.',
    'The MSCEIT V2.0 validation paper. 141-item ability test scored against expert and consensus criteria across four branches: Perceiving, Using, Understanding, Managing emotions. N=2,112; full-scale α≈.91 consensus, .90 expert.',
    '4가지 가지 구조의 정전 인용. 2nd-Brain은 가지 어휘만 사용하고 MSCEIT 문항이나 채점표는 사용하지 않음.'
  ),
  (
    'Human abilities: Emotional intelligence',
    ARRAY['John D. Mayer','Richard D. Roberts','Sigal G. Barsade'],
    '10.1146/annurev.psych.59.103006.093646',
    'https://doi.org/10.1146/annurev.psych.59.103006.093646',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    'Annual Review of Psychology 통합 정리. EI를 (a) 능력-EI(MSCEIT), (b) 자기보고 혼합 모델 EI(Bar-On EQ-i, Goleman 식), (c) 특성-EI(TEIQue) 세 갈래로 명확히 구분하고 (a)만이 심리측정적 의미의 인지 능력 자격을 갖춤을 논증.',
    'Annual Review consolidation. Distinguishes (a) ability-EI (MSCEIT family, performance-based), (b) self-report mixed-model EI (Bar-On EQ-i, Goleman-style), and (c) trait-EI (TEIQue, self-perceived emotional self-efficacy). Argues only (a) qualifies as a cognitive ability in the psychometric sense.',
    '사용자가 "EQ 검사 했는데"라고 할 때 어떤 EI인지 구분하는 데 사용.'
  ),
  (
    'The ability model of emotional intelligence: Principles and updates',
    ARRAY['John D. Mayer','David R. Caruso','Peter Salovey'],
    '10.1177/1754073916639667',
    'https://doi.org/10.1177/1754073916639667',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    '능력 모델의 권위 있는 현행 정리. 4가지 가지 구조를 재확인하고 20년간의 비판에 응답. 능력-EI vs 특성-EI 구분 없이 "EI"라고만 부르는 것은 과학적 글쓰기에서 무의미하다고 명시.',
    'Authoritative current statement of the ability model. Reaffirms the four-branch architecture, addresses two decades of critique, and clarifies that "EI" without the ability/trait qualifier is meaningless in scientific writing.',
    '2nd-Brain DESIGN.md 감정 차원 framework 선택의 primary citation.'
  ),
  (
    'Emotional intelligence is a second-stratum factor of intelligence: Evidence from hierarchical and bifactor models',
    ARRAY['Carolyn MacCann','Dana L. Joseph','Daniel A. Newman','Richard D. Roberts'],
    '10.1037/a0034755',
    'https://doi.org/10.1037/a0034755',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    '능력-EI가 g 아래의 2차 요인(second-stratum factor)으로 자리 잡는다는 가장 강한 구성 타당도 근거. 대규모 MSCEIT 자료에 위계·이중 요인 모델을 적용해 EI가 일반 지능과 구분되면서도 연관됨을 입증.',
    'The strongest construct-validity result for ability-EI. Hierarchical and bifactor structural models on a large MSCEIT dataset show EI sits as a second-stratum factor under g, distinct from but related to general intelligence. The empirical claim that ability-EI is an intelligence, not merely a label.',
    '능력-EI가 진짜 지능이라는 주장의 핵심 근거. 회의론(Brody)과 균형 인용.'
  ),
  (
    'The validity of the Mayer-Salovey-Caruso Emotional Intelligence Test (MSCEIT) as a measure of emotional intelligence',
    ARRAY['Andrew Maul'],
    '10.1177/1754073912445811',
    'https://doi.org/10.1177/1754073912445811',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    'MSCEIT 구성 타당도에 대한 가장 강한 비판. 합의·전문가 점수 방식이 감정 능력보다 다수 의견·전문가 의견에의 동조를 측정한다는 지적. "Understanding" 가지는 감정 기술보다 어휘에 가깝게 작동한다고 분석.',
    'The strongest construct critique of MSCEIT. Argues consensus and expert scoring conflate skill with conformity to majority/expert opinion, and that the "Understanding" branch behaves more like vocabulary than emotional skill. 2nd-Brain implication: do not assume MSCEIT-like consensus scoring transfers to free-text journaling.',
    'MSCEIT 어휘를 사용하면서도 채점 방식의 한계를 정직하게 인정하는 인용. 텍스트로부터 EI 점수 산출 금지의 근거.'
  ),
  (
    'Emotional intelligence: An integrative meta-analysis and cascading model',
    ARRAY['Dana L. Joseph','Daniel A. Newman'],
    '10.1037/a0017286',
    'https://doi.org/10.1037/a0017286',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    '능력-EI의 4가지가 직무 성과를 캐스케이드(Perceive→Understand→Manage→Performance)로 예측한다는 메타분석(k≈190). Manage 가지가 예측력의 대부분을 담당. g와 빅5 통제 후에도 증분 타당도가 있지만 효과는 작음(ρ≈.15-.30).',
    'The cascading model. Meta-analysis (k≈190) showing the four branches of ability-EI predict job performance in cascade: Perceive→Understand→Manage→Performance, with Manage doing most of the predictive work. Ability-EI predicts performance incrementally beyond cognitive ability and Big Five, but effects are small.',
    'Advisor 가이드 순서: Perceive 어휘가 빈약한 사용자에게는 Manage 전략을 먼저 권하지 말 것. 캐스케이드 순서 준수.'
  ),
  (
    'The relation between emotional intelligence and job performance: A meta-analysis',
    ARRAY['Ernest H. O''Boyle','Ronald H. Humphrey','Jeffrey M. Pollack','Thomas H. Hawver','Paul A. Story'],
    '10.1002/job.714',
    'https://doi.org/10.1002/job.714',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    'EI-직무 성과 메타분석(k=43). 능력·자기보고·혼합 EI 세 흐름 모두 g와 빅5 위에 일부 증분 타당도. 혼합 모델 EI는 원상관은 가장 크지만 빅5 통제 시 증분 타당도가 가장 작아짐 — 능력 흐름을 개념적으로 선호할 핵심 논거.',
    'EI-job performance meta-analysis (k=43). Confirms incremental validity of all three EI streams over cognitive ability and Big Five for job performance. Mixed-model EI shows largest raw correlations but smallest incremental validity once personality is controlled — a key argument for preferring the ability stream conceptually.',
    'EI 예측력에 대한 현실적 기대치 설정. 2nd-Brain이 EI를 인생을 바꾸는 변수로 마케팅하지 않는 근거.'
  ),
  (
    'Trait emotional intelligence: Psychometric investigation with reference to established trait taxonomies',
    ARRAY['K. V. Petrides','Adrian Furnham'],
    '10.1002/per.416',
    'https://doi.org/10.1002/per.416',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    '특성-EI(trait EI) 진영의 핵심 논문. EI를 자기지각된 감정 자기효능감으로 보고 자기보고(TEIQue)로 측정해야 한다는 입장. 빅5 공간 내 하위 성격 특성으로 EI가 자리 잡음을 보임 — Mayer-Salovey 능력 모델의 명시적 대안.',
    'The trait-EI manifesto. Petrides & Furnham argue EI is best conceived as a lower-order personality trait (self-perceived emotional self-efficacy), measured by self-report (TEIQue), located within Big Five space — not as a cognitive ability. The explicit alternative to the Mayer-Salovey program.',
    '능력/특성 EI 구분선의 핵심 인용. 사용자의 "EQ" 자기인식이 실제로는 trait-EI일 가능성이 높다는 점 설명.'
  ),
  (
    'Commentaries on "Seven Myths About Emotional Intelligence" and "Emotional Intelligence: Theory, Findings, and Implications" (includes Brody, N. — "What cognitive intelligence is and what emotional intelligence is not")',
    ARRAY['Nathan Brody'],
    '10.1207/s15327965pli1503_03',
    'https://doi.org/10.1207/s15327965pli1503_03',
    'emotional_intelligence',
    'adult',
    'en',
    now(),
    'Brody의 EI 회의론 코멘터리. MSCEIT 점수가 감정 능력보다 문화적 감정 규범 지식을 측정한다고 비판하고 g·빅5 위의 증분 타당도가 옹호자 주장보다 약하다고 지적. 보수적 입장의 대표 인용.',
    'The classic skeptic''s argument. Brody contends MSCEIT scoring confounds emotional skill with knowledge of cultural emotional norms and that incremental validity over g and Big Five is weaker than proponents claim. Cite as the conservative position.',
    'Maul(2012)와 함께 MSCEIT 채점 한계 논의. 2nd-Brain의 텍스트 기반 무점수 정책 강화.'
  ),
  (
    'The reliability and validity of Korean version of the Wong and Law Emotional Intelligence Scale (K-WLEIS)',
    ARRAY['Sookyung Jeong','Mona Choi','Sookyung Park'],
    '10.4040/jkan.20109',
    'https://doi.org/10.4040/jkan.20109',
    'emotional_intelligence',
    'adult',
    'ko',
    now(),
    'WLEIS의 한국어판(K-WLEIS) 검증 논문. 16문항 자기보고로 자기·타인 감정 평가, 감정 활용, 감정 조절 네 영역을 측정. Mayer-Salovey 4가지를 개념적으로 따르되 자기보고 형식 — 능력 검사가 아니라 특성-EI에 가깝다는 점에 유의. 한국 간호사 표본에서 신뢰도·요인구조 양호.',
    'K-WLEIS validation in Korean nurses. 16-item self-report covering self-emotion appraisal, others'' emotion appraisal, use of emotion, regulation of emotion. Self-report — closer to trait-EI than to ability-EI — but the WLEIS items operationalize the four Mayer-Salovey branches conceptually. Reports adequate reliability and factor structure in a Korean sample.',
    '한국어 locale EI 신호 — 단, 자기보고이므로 scaffold로만 사용하고 능력-EI 점수로 제시 금지.'
  ),
  (
    'Validation of the Korean version of Schutte Emotional Intelligence Scale (K-SEIS) in college students',
    ARRAY['Jae Geun Kim','Yu Jin Woo'],
    '10.30593/jhuc.43.2.2',
    'https://doi.org/10.30593/jhuc.43.2.2',
    'emotional_intelligence',
    'young_adult',
    'ko',
    now(),
    'Schutte EI 척도의 한국어판(K-SEIS) 검증. 33문항 자기보고로 Salovey & Mayer(1990) 프레임에 기반. 한국 대학생 표본에서 4요인 구조와 한국 관련 정서/안녕 측정과의 동시 타당도를 확인. 자기보고이므로 능력 검사와 동일시 금지.',
    'K-SEIS validation in Korean college students. 33-item self-report based on the Salovey & Mayer (1990) framework. Reports four-factor structure and concurrent validity with related Korean wellbeing/affect measures. Same caveat: self-report ≠ ability test.',
    '한국 young_adult 트랙 EI 신호. 능력-EI 점수가 아님을 명시.'
  );
