-- Whole Trait Theory & State Density Distributions — verified knowledge sources
-- Batch source: docs/research/batches/whole-trait-density.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- `verified_at = now()` set at insert; re-verify quarterly.
-- 2nd-Brain treats Big Five as a density distribution of states across time,
-- not a single point estimate. Storage unit: (timestamp, situation, state).

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Toward a structure- and process-integrated view of personality: Traits as density distributions of states',
    ARRAY['William Fleeson'],
    '10.1037/0022-3514.80.6.1011',
    'https://doi.org/10.1037/0022-3514.80.6.1011',
    'whole_trait',
    'young_adult',
    'en',
    now(),
    '한 사람의 빅파이브 점수는 단일 값이 아니라 시간과 상황에 걸쳐 분포된 상태들의 밀도 분포라는 점을 ESM 데이터(약 50개 보고/사람, 2주간)로 입증한 창시 논문. 한 개인의 2주간 행동 변동 범위가 전체 인구 변동 범위와 거의 같다는 사실을 보여, 분포의 평균뿐 아니라 SD·왜도·전체 모양 자체가 안정적 개인차임을 정립.',
    'The founding ESM paper for Whole Trait Theory. Across multiple experience-sampling studies (~50 reports/person over ~2 weeks), Fleeson shows that an individual''s behavior on each Big Five dimension forms a roughly normal distribution of states. The mean reproduces the conventional trait score, but the SD, skew, and shape are themselves stable individual differences — a person varies across the full trait range within 2 weeks almost as much as the entire population varies between people.',
    '2nd-Brain 함의: 페르소나 카드는 (timestamp, situation, state) 로그에서 파생되어야 하며 평균 점수 단일값으로 환원 금지. 밀도 분포가 아키텍처 타깃이고 저널 cadence 한계를 명시적으로 hedge.'
  ),
  (
    'Moving personality beyond the person-situation debate: The challenge and the opportunity of within-person variability',
    ARRAY['William Fleeson'],
    '10.1111/j.0963-7214.2004.00280.x',
    'https://doi.org/10.1111/j.0963-7214.2004.00280.x',
    'whole_trait',
    'adult',
    'en',
    now(),
    '40년간 이어진 성격 vs 상황 논쟁의 해소. 트레잇은 장기간에 걸친 행동을 잘 기술하고 상황은 순간의 행동을 잘 기술한다 — 둘 다 옳고 시간 척도가 다를 뿐이라는 접근 가능한 종합 논문. 2nd-Brain 프레이밍의 핵심: 단일 entry는 trait가 아니라 state-in-situation을 반영.',
    'Accessible synthesis resolving the 40-year trait-vs-situation debate. Traits describe behavior over time; situations describe behavior in the moment — both real, different time scales. Important for 2nd-Brain framing: a single entry reflects state-in-situation, not trait.',
    'Advisor 프레이밍 인용: 사용자가 자기개념과 모순되는 순간을 보고할 때 "장기적 본인의 모습"과 "지금 이 순간"이 모두 진짜일 수 있다고 안내.'
  ),
  (
    'A cognitive-affective system theory of personality: Reconceptualizing situations, dispositions, dynamics, and invariance in personality structure',
    ARRAY['Walter Mischel','Yuichi Shoda'],
    '10.1037/0033-295X.102.2.246',
    'https://doi.org/10.1037/0033-295X.102.2.246',
    'whole_trait',
    'adult',
    'en',
    now(),
    'CAPS 이론. 사람의 안정된 정체성은 평균이 아니라 상황별 조건적 반응("if … then …" 시그니처)의 패턴이라는 점을 정립. WTT의 이론적 선조이며 2nd-Brain의 분석 단위가 "type X" 가 아니라 "상황 Y에서 보통 X로 반응" 임을 정당화.',
    'CAPS theory — the "if … then …" signature of personality. A person''s stable identity is their profile of conditional responses across situations, not their average. Citation count >2,400. The theoretical predecessor that Fleeson''s WTT operationalizes empirically. Extracting "user typically responds with X when in situation Y" is the right unit of analysis, not "user is type X."',
    'Engine 2 함의: 평균 trait가 아니라 (situation → state) 조건부 패턴이 추출 단위. 페르소나 카드가 "user is type X" 라고 단정짓지 않도록 가드.'
  ),
  (
    'Whole Trait Theory',
    ARRAY['William Fleeson','Eranda Jayawickreme'],
    '10.1016/j.jrp.2014.10.009',
    'https://doi.org/10.1016/j.jrp.2014.10.009',
    'whole_trait',
    'adult',
    'en',
    now(),
    '트레잇의 기술적 측면(상태 밀도 분포)과 설명적 측면(상태를 생성하는 사회-인지 메커니즘)을 통합한 공식 WTT 이론 논문. "전체 트레잇"은 분포와 메커니즘의 결합이며, 두 측면은 분리할 수 없다.',
    'The formal WTT statement. Integrates the descriptive (density distribution) and explanatory (social-cognitive mechanisms producing each state) sides of personality. Defines a "whole trait" as the joint of (a) the density distribution of behavioral states and (b) the mechanisms that generate states from situations. The two halves are inseparable.',
    '2nd-Brain Engine 2의 아키텍처 레퍼런스: 상태 분포는 기술적 타깃, 상황 해석·목표는 설명적 측면(덜 안정적). 분포 측면을 먼저 안정화하고 메커니즘은 신중하게 다룸.'
  ),
  (
    'Whole Trait Theory: An integrative approach to examining personality structure and process',
    ARRAY['Eranda Jayawickreme','Corinne E. Zachry','William Fleeson'],
    '10.1016/j.paid.2018.06.045',
    'https://doi.org/10.1016/j.paid.2018.06.045',
    'whole_trait',
    'adult',
    'en',
    now(),
    '2015년 WTT 발표 이후 5년 정리. 사회-인지 단위(목표, 해석, 정서 동역학)가 상태 분포를 어떻게 생성하는지에 대한 명시적 이론을 제시하면서도, WTT의 설명적 측면은 기술적 측면보다 경험적 합의가 약함을 인정.',
    'Five-year refinement of WTT. Explicit theory of how social-cognitive units (goals, interpretations, affect dynamics) produce the state distribution. Aligns WTT with cognitive-affective system models. Caveat: the explanatory side of WTT is much less empirically settled than the descriptive side — density distributions are well-documented; the mechanisms generating them are still contested.',
    '"왜 이런 상태가 일어났는가" claim 에 신중. 메커니즘 layer 는 이론적, 분포 layer 가 더 안전한 claim. Advisor 의 설명적 추론에 사용할 때 hedge 필수.'
  ),
  (
    'On the nature of intraindividual personality variability: Reliability, validity, and associations with well-being',
    ARRAY['Brendan M. Baird','Kimdy Le','Richard E. Lucas'],
    '10.1037/0022-3514.90.3.512',
    'https://doi.org/10.1037/0022-3514.90.3.512',
    'whole_trait',
    'young_adult',
    'en',
    now(),
    '개인 내 상태 변동성(intraindividual SD) 자체가 신뢰할 만한 개인차 변수인가에 대한 핵심 검증. 일부 차원(특히 정서 관련)에서는 test-retest 안정성이 확인되고 웰빙과 음의 상관을 보이지만, 평균값과의 혼동(바닥 효과) 등 해석에 주의가 필요. 모든 차원에서 변동성을 안정 시그니처로 일반화하지 말 것.',
    'The key paper on whether variability itself is meaningful. Tests whether intraindividual SD on each Big Five dimension is a reliable, valid construct distinct from the mean. Conclusion: yes for some dimensions (notably affect-related variability shows test-retest stability and negative correlation with well-being), but interpretation requires care — variability is partly confounded with mean (a person near the floor of a dimension cannot vary downward).',
    '2nd-Brain: 페르소나 카드에 "consistency" 디스크립터를 정서 관련 차원에 한해 N 충분 시 표면화 가능. 모든 차원의 변동성을 안정 시그니처로 과도 주장 금지.'
  ),
  (
    'Trait personality and state variability: Predicting individual differences in within- and cross-context fluctuations in affect, self-evaluations, and behavior in everyday life',
    ARRAY['Katharina Geukes','Steffen Nestler','Roos Hutteman','Albrecht C. P. Küfner','Mitja D. Back'],
    '10.1016/j.jrp.2016.06.003',
    'https://doi.org/10.1016/j.jrp.2016.06.003',
    'whole_trait',
    'young_adult',
    'en',
    now(),
    '빅파이브 트레잇 수준이 ESM 상태 변동성을 어떻게 예측하는지 두 데이터셋(각 N≈200, ~7일)에서 검증. 트레잇 신경증성이 정서 상태 변동성을 가장 견고하게 예측한다는 결과. 변동성이 부분적으로 trait-driven 이며 단순한 측정 노이즈가 아님을 확인.',
    'Direct test of "do Big Five trait levels predict state variability?" Two ESM datasets, N ≈ 200 each, ~7 days. Robust finding: trait Neuroticism is the strongest predictor of higher state affect variability; other dimensions show context-dependent links. Confirms variability is partially trait-driven, not just measurement noise. Used 3–7 prompts/day for a week — denser than journal cadence can reach without explicit ESM-style prompts.',
    '저널 기반 변동성 신호의 해석 한계 설정. 정서 / 신경증성 인접 차원에서 변동성 시그니처가 가장 해석 가능. 다른 차원은 context-dependent.'
  ),
  (
    'Validity and reliability of the experience-sampling method',
    ARRAY['Mihaly Csikszentmihalyi','Reed Larson'],
    '10.1097/00005053-198709000-00004',
    'https://doi.org/10.1097/00005053-198709000-00004',
    'whole_trait',
    'adult',
    'en',
    now(),
    'ESM(experience sampling method)의 방법론적 헌장. 호출 기반 자기보고가 신뢰·타당하며, 회상 기반 측정이 놓치는 개인 내 동역학을 포착하는 데 고유한 가치가 있음을 정립. 응답 편향, 반응성, compliance 고려사항을 정리.',
    'The methodological charter for ESM. Establishes that beeper-prompted self-reports are reliable, valid, and uniquely capable of capturing within-person dynamics that retrospective recall misses. Lays out the response-bias, reactivity, and compliance considerations that any quasi-ESM tool (including journal-based) inherits.',
    '2nd-Brain 저널은 자기 시작형 quasi-ESM 으로 random-sampling 의 엄밀성을 잃음. 반응성/compliance caveat 은 상속하되 ESM-grade 신호 약속 금지.'
  ),
  (
    'The dynamic relationships of affective synchrony to perceptions of situations',
    ARRAY['Joshua Wilt','Katharine Funkhouser','William Revelle'],
    '10.1016/j.jrp.2011.03.005',
    'https://doi.org/10.1016/j.jrp.2011.03.005',
    'whole_trait',
    'young_adult',
    'en',
    now(),
    '상태 수준 정서가 실시간 상황 해석과 어떻게 동기화되는지, 그리고 그 동기화 강도 자체가 개인차임을 실증. 어떤 사용자는 mood-state 가 상황 보고와 강하게 동기화되고, 어떤 사용자는 둘이 디커플링되어 있음.',
    'Demonstrates that state-level affect tracks situation construal in real time, and that the strength of that coupling is itself an individual difference. (Note: project brief listed 2012; verified record is 2011.) A user whose mood-state varies strongly with situational reports is a different psychological profile from one whose mood is decoupled from situation.',
    '2nd-Brain: 상황 태그가 붙은 저널 엔트리에서 affect-situation 결합 강도를 second-order 신호로 추출 가능. 단, 차이 추론은 N ≥ 30 + situation coverage 보장 후에만.'
  ),
  (
    'Lab and/or field? Measuring personality processes and their social consequences',
    ARRAY['Cornelia Wrzus','Matthias R. Mehl'],
    '10.1002/per.1986',
    'https://doi.org/10.1002/per.1986',
    'whole_trait',
    'adult',
    'en',
    now(),
    '주변환경 평가(ambulatory assessment) 방법론 리뷰. ESM(고신호·고부담), 일일 다이어리(중부담·낮은 시간해상도), 수동 센싱(저부담·좁은 구성개념)의 측정 부담-신호 트레이드오프 정리. 자기 시작형 다이어리 엔트리는 중성/지루한 상태를 과소대표함을 명시.',
    'Contemporary review of ambulatory assessment methods. Lays out the measurement burden tradeoffs: ESM (high signal, high participant burden), daily diaries (lower burden, less temporal resolution), passive sensing (low burden, narrow construct coverage). Explicitly cautions that self-initiated diary entries underrepresent neutral / boring states — a sampling bias 2nd-Brain inherits.',
    '2nd-Brain 저널은 daily diary 와 ESM 사이. 자기 시작 편향(중성 상태 과소대표) 상속. 페르소나 카드의 밀도 추정에 hedge 필요.'
  ),
  (
    'The Situational Eight DIAMONDS: A taxonomy of major dimensions of situation characteristics',
    ARRAY['John F. Rauthmann','David Gallardo-Pujol','Esther M. Guillaume','Elysia Todd','Christopher S. Nave','Ryne A. Sherman','Matthias Ziegler','Ashley Bell Jones','David C. Funder'],
    '10.1037/a0037250',
    'https://doi.org/10.1037/a0037250',
    'whole_trait_situation',
    'young_adult',
    'en',
    now(),
    '상황 특성의 8개 주요 차원(Duty, Intellect, Adversity, Mating, pOsitivity, Negativity, Deception, Sociality) 분류 체계. 5개 연구에서 국제적으로 검증. 상태가 생성되는 축을 정의하며, "성실성 상태"는 Duty 가 높은 상황에서만 의미를 가짐.',
    'The empirically derived taxonomy of situation characteristics. Eight dimensions: Duty, Intellect, Adversity, Mating, pOsitivity, Negativity, Deception, Sociality. Validated across 5 studies including international samples. Defines the axis on which states get generated: a "state of conscientiousness" only makes sense relative to a situation with high Duty. Gives an empirical grounding for situation tags in journal entries — instead of inventing ad-hoc categories, DIAMONDS dimensions are a peer-reviewed candidate set.',
    '저널 엔트리의 상황 태그 후보 schema. latent extraction target 으로만 사용, 사용자에게는 humane label(일·책임, 배움, 관계 등) 노출. Mating/Deception 은 sensitive — UI 노출 금지.'
  ),
  (
    'Taking situations seriously: The Situation Construal Model and the Riverside Situational Q-Sort',
    ARRAY['David C. Funder'],
    '10.1177/0963721416635552',
    'https://doi.org/10.1177/0963721416635552',
    'whole_trait_situation',
    'adult',
    'en',
    now(),
    '행동은 객관적 상황보다 그 상황에 대한 개인의 해석(construal)의 함수라는 construal 모델. 동일 상황에서도 사람마다 다른 해석을 거쳐 다른 상태가 나오는 이유. 저널 자유 텍스트는 구조화된 폼이 지워버릴 해석 정보를 담고 있어 신호 풍부 — 동시에 LLM 추출의 어려움.',
    'The construal addendum to WTT/CAPS: behavior is a function not of the objective situation but of the person''s interpretation of it. Two users in identical situations produce different states because they construe differently. Journal free-text carries construal information that a structured form would erase — part of why free-text journaling is signal-rich, also why LLM extraction of construal is challenging.',
    'Engine 2 함의: 자유 텍스트 저널이 신호 풍부한 이유의 근거. 단, construal LLM 추출은 state 추출보다도 신뢰도 낮음 — 제안으로만 표면화, 발견으로 표면화 금지.'
  ),
  (
    'Extraversion',
    ARRAY['Joshua Wilt','William Revelle'],
    '10.1093/oxfordhb/9780199352487.013.15',
    'https://doi.org/10.1093/oxfordhb/9780199352487.013.15',
    'whole_trait',
    'adult',
    'en',
    now(),
    '약 50년간의 외향성 연구를 종합한 Oxford Handbook of the Five Factor Model 챕터. 외향성이 트레잇(평균 위치)과 상태(순간 수준)로 동시에 작동하며 보상 민감성으로 연결됨을 가장 명확히 보여주는 단일 차원의 사례. (브리프에는 Wilt & Revelle 2009로 표기되었으나 검증된 등가 챕터는 2016 Oxford handbook entry.)',
    'Synthesizes ~50 years of evidence that Extraversion functions both as a trait (average position) and as a state (momentary level), with the two linked by reward sensitivity. (Project brief listed Wilt & Revelle 2009 in a Handbook of Individual Differences; the verified analogous chapter is the 2016 Oxford handbook entry.) The clearest worked example of how a single Big Five dimension is properly modeled as a state distribution rather than a point.',
    '사용자에게 state-trait 구분을 설명할 때의 대표 예시. "매일 달라도 안정적인 trait 패턴이 있을 수 있다"는 직관적 설명에 외향성이 가장 적합.'
  );
