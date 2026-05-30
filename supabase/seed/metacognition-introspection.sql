-- Metacognition & Introspection Accuracy — verified knowledge sources
-- Batch source: docs/research/batches/metacognition-introspection.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- `verified_at = now()` set at insert; re-verify quarterly.
-- This batch governs the Ambiguity Resolution Queue: which questions are
-- safe to put to users with high confidence, which require humility framing,
-- and which (causal self-attribution) must never be treated as oracle.
-- Vazire 2010 SOKA is cross-linked from self-report-bias.sql (not duplicated).

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Metacognition and cognitive monitoring: A new area of cognitive-developmental inquiry',
    ARRAY['John H. Flavell'],
    '10.1037/0003-066X.34.10.906',
    'https://doi.org/10.1037/0003-066X.34.10.906',
    'metacognition',
    'lifespan',
    'en',
    now(),
    '"메타인지" 라는 연구 영역을 명명한 논문. Flavell 은 *메타인지 지식* (자신의 인지 과정에 대해 아는 것), *메타인지 경험* (안다는 느낌, 불확실성 등의 in-the-moment 감각), *메타인지 모니터링/조절* (앞 두 가지를 사용해 인지를 통제)을 구분. 2nd-Brain Ambiguity Resolution Queue 는 Flavell 의 용어로 사용자에게 *자신에 대한 메타인지 지식* 을 끌어내려는 시도 — 그 끌어냄의 신뢰성은 사용자가 도메인별로 그 지식을 구축한 정도에 따라 다름.',
    'The paper that coined "metacognition" as a research area. Flavell distinguishes metacognitive knowledge (what you know about your own cognitive processes), metacognitive experiences (in-the-moment feelings of knowing, uncertainty, etc.), and metacognitive monitoring/regulation (using the first two to control cognition). For 2nd-Brain: the Ambiguity Queue is, in Flavell''s terms, an attempt to elicit metacognitive knowledge about the self. That elicitation is reliable to the extent the user has built that knowledge — which varies by domain.',
    'Queue 설계 원칙: 모든 트레이트/가치/상황 질문에 동일 신뢰도를 부여하지 않음. 도메인별로 메타인지 지식 정도가 다름을 가정.'
  ),
  (
    'Metamemory: A theoretical framework and new findings',
    ARRAY['Thomas O. Nelson','Louis Narens'],
    '10.1016/S0079-7421(08)60053-5',
    'https://doi.org/10.1016/S0079-7421(08)60053-5',
    'metacognition',
    'adult',
    'en',
    now(),
    '모니터링·통제의 정전적 모형: 인지 과정("객체 수준")이 메타 수준의 모니터링을 받고, 메타 수준은 통제 신호를 발사. Fleming 의 신호탐지 처리를 포함한 후속 메타인지 연구 대부분이 이 scaffold 위에 있음. 2nd-Brain 함의: Ambiguity Queue 답변에 대한 사용자의 "신뢰도 평가" 는 그 자체로 *모니터링 신호* — 1차 답변과는 별개의 정확도·편향을 가짐.',
    'The canonical monitoring-and-control model: cognitive processes ("object level") are monitored by a meta level that issues control signals. Most subsequent metacognition research — including Fleming''s signal-detection treatment — sits on this scaffold. For 2nd-Brain: the user''s "confidence rating" on an Ambiguity Queue answer is a monitoring signal; it has its own accuracy and its own biases, separate from the underlying first-order answer.',
    'Engine 3: 사용자 confidence 를 1차 답변과 분리해 저장. confidence 의 sensitivity vs bias 가 도메인·사용자별로 다름을 추적.'
  ),
  (
    'How to measure metacognition',
    ARRAY['Stephen M. Fleming','Hakwan C. Lau'],
    '10.3389/fnhum.2014.00443',
    'https://doi.org/10.3389/fnhum.2014.00443',
    'metacognition',
    'adult',
    'en',
    now(),
    '메타인지 측정의 방법론적 합성. *메타인지 민감도* (confidence rating 이 정확도를 얼마나 잘 추적하는지) vs *메타인지 편향* (전반적 과/저신뢰) vs *1차 과제 수행* (정확도 자체) 분리. meta-d′ 를 편향 없는 측정으로 도입. 직접 함의: 사용자가 Ambiguity Queue 에서 답변과 함께 신뢰도를 제공할 때 그 신뢰도는 *부분적으로* 정보적(sensitivity), *부분적으로* 양식적 over/under-confidence(bias), 그리고 부분적으로 기저 판단을 얼마나 잘하는지의 artifact. 자기보고 신뢰도를 soft prior 로 처리, oracle 로는 처리하지 않음.',
    'The reference paper on disentangling metacognitive sensitivity (how well confidence ratings track accuracy) from metacognitive bias (overall over- or under-confidence) and first-order task performance (accuracy itself). Introduces meta-d′ as the bias-free measure. Direct implication for 2nd-Brain: when the user gives an answer plus a confidence judgment in the Ambiguity Queue, that confidence is partly informative (sensitivity) and partly a stylistic over/underconfidence (bias) and partly an artifact of how good they are at the underlying judgment. Treat self-reported confidence as a soft prior, not an oracle.',
    'Queue 답변 처리: 신뢰도 = soft prior. 행동 패턴과 충돌 시 둘 다 표시(silent override 금지), 사용자가 직접 본 후 판단.'
  ),
  (
    'Relating introspective accuracy to individual differences in brain structure',
    ARRAY['Stephen M. Fleming','Rimona S. Weil','Zoltan Nagy','Raymond J. Dolan','Geraint Rees'],
    '10.1126/science.1191883',
    'https://doi.org/10.1126/science.1191883',
    'metacognition',
    'adult',
    'en',
    now(),
    '메타인지 민감도(지각 과제)의 개인차가 전두엽 회질 부피 및 백질 미세구조와 상관됨을 발견. 1차 과제 수행 통제 후에도 — 어떤 사람은 체계적으로 더 나은 introspector. 내성 정확도는 부분적으로 trait-like. 2nd-Brain 함의: 사용자별로 confidence 판단의 informativeness 가 다름. 시스템은 uniform 한 introspective skill 을 가정할 수 없음.',
    'Found that individual differences in metacognitive sensitivity (perceptual task) correlate with anterior prefrontal cortex gray-matter volume and white-matter microstructure. Demonstrates that introspective accuracy is partly trait-like — some people are systematically better introspectors than others, controlling for first-order performance. For 2nd-Brain: users will differ in how informative their confidence judgments are. The system cannot assume uniform introspective skill.',
    'Engine 3: 사용자별 confidence informativeness 추적(시간에 따른 calibration 변동 기록). 단일 사용자 confidence 를 baseline norm 으로 사용 금지.'
  ),
  (
    'Visual confidence',
    ARRAY['Pascal Mamassian'],
    '10.1146/annurev-vision-111815-114630',
    'https://doi.org/10.1146/annurev-vision-111815-114630',
    'metacognition',
    'adult',
    'en',
    now(),
    '지각 신뢰도의 종합 리뷰 — 관찰자가 자신의 지각 결정을 어떻게 모니터링하는지. 신뢰도는 결정과 부분적으로 동일한 증거에서 계산되지만 부분적으로 별개의 신호(반응 시간, 내부 잡음 추정)에서도 계산됨. 2nd-Brain 함의: 자기 판단에도 동일 분리 적용 — 자기 주장에 대한 사용자 신뢰도("나는 내향적이에요")는 기저 신념의 단순 재읽기가 아니라 자체 출처를 가짐.',
    'A comprehensive review of perceptual confidence — how observers monitor their own perceptual decisions. Establishes that confidence is computed from partly the same evidence as the decision but partly from separate signals (response time, internal noise estimates). Implication for 2nd-Brain: the same dissociation applies to self-judgments — a user''s confidence in a self-claim ("I''m an introvert") is not just a re-read of the underlying belief; it has its own sources.',
    'Queue 디자인: 답변과 신뢰도를 분리 capture. 신뢰도가 답변의 단순 함수 아님을 가정.'
  ),
  (
    'Telling more than we can know: Verbal reports on mental processes',
    ARRAY['Richard E. Nisbett','Timothy D. Wilson'],
    '10.1037/0033-295X.84.3.231',
    'https://doi.org/10.1037/0033-295X.84.3.231',
    'metacognition',
    'adult',
    'en',
    now(),
    '내성(introspection)의 한계에 대한 가장 많이 인용되는 단일 논문. 사람들이 자신의 선택의 *이유*, 판단에 *영향을 준 것*, 행동을 *추동한 자극* 에 대해 말하는 내용이 체계적으로 부정확함 — 종종 실제 인지 과정에 대한 접근이 아니라 가능한 원인에 대한 문화적으로 공유된 이론을 반영. 직접 함의: "*왜* 그랬어요" 를 Ambiguity Queue 에 넣고 그 답을 인과의 ground truth 로 다루지 말 것. 사용자 답변은 (잠재적으로 가치 있는) 자기-서사 행위이지 인지 과정의 oracle 읽기가 아님.',
    'The single most-cited paper on the limits of introspection. Reviews experimental evidence that people''s verbal reports about why they made a choice, what influenced their judgment, or which stimulus drove their behavior are systematically inaccurate — often reflecting culturally-shared theories about likely causes rather than actual access to the mental process. Direct implication for 2nd-Brain: never put "why did you do X" in the Ambiguity Queue and treat the answer as ground truth about causation. The user''s answer is itself a (potentially valuable) act of self-narration, not an oracle reading of cognitive processes.',
    'Queue 라우팅 규칙: 인과 귀속 질문은 oracle 로 다루지 않음. narrative 초대로만 허용. 답변은 narrative_identity 로 저장하되 cognition_truth 로는 저장하지 않음.'
  ),
  (
    'The unreliability of naive introspection',
    ARRAY['Eric Schwitzgebel'],
    '10.1215/00318108-2007-037',
    'https://doi.org/10.1215/00318108-2007-037',
    'metacognition',
    'adult',
    'en',
    now(),
    '여러 수렴 증거(시각 심상, 정서, 의식적 사고, 꿈 현상학)로, *현재 진행 중* 의 의식 경험에 대한 내성 보고조차 불신뢰 — 기억으로 왜곡된 회상 보고만이 아님을 주장. Nisbett & Wilson 보다 강한 주장: 인과 자기-귀속만이 아니라 순간순간의 경험 내성 자체가 불신뢰. 2nd-Brain 함의: *어떤* 자기보고 시스템이 추출할 수 있는 것의 상한. 적절한 겸손: "당신의 보고가 우리가 가진 최선의 신호이고, 원리적으로 불완전하다."',
    'Argues, with multiple convergent lines of evidence (visual imagery, emotion, conscious thought, dream phenomenology), that introspective reports of even currently occurring conscious experience are unreliable — not just memory-distorted retrospective ones. Schwitzgebel''s claim is stronger than Nisbett & Wilson''s: not just causal self-attribution is unreliable, but moment-to-moment introspection of experience itself. For 2nd-Brain: this is the upper bound on what any self-report system can extract. The right humility is "your report is the best signal we have, and it is imperfect even in principle."',
    'Voice 레이어 가드: "We know you better than you know yourself" 금지(경험적으로 거짓). "당신 답변이 최선의 신호이고 우리는 패턴을 봅니다" 가 정직한 프레임.'
  ),
  (
    'In search of our true selves: Feedback as a path to self-knowledge',
    ARRAY['Kathryn L. Bollich','Patrick M. Johannet','Simine Vazire'],
    '10.3389/fpsyg.2011.00312',
    'https://doi.org/10.3389/fpsyg.2011.00312',
    'metacognition',
    'adult',
    'en',
    now(),
    '타인 피드백이 언제·어떻게 자기지식을 개선하는지에 대한 경험 문헌 리뷰. 핵심 발견: 피드백은 (a) 관련 관찰을 가진 사람에게서 나올 때, (b) trait-label 이 아닌 구체적·행동-anchored 일 때, (c) 비방어적 맥락에서 받을 때 가장 잘 작동. 2nd-Brain 함의: 향후 triangulation(또래·코치 피드백) 기능 도입 시 이 조건들에 맞춰 설계. 현재로서는 추론 엔진이 "외부 관찰자" 역할을 차지하되 *텍스트만* 관찰함을 명시적 caveat 로 부착.',
    'Reviews the empirical literature on when and how feedback from others improves self-knowledge. Key findings: feedback works best when it (a) comes from someone with relevant observation, (b) is specific and behavior-anchored rather than trait-labeled, (c) is received in a non-defensive context. Implication for 2nd-Brain: if/when triangulation (peer/coach feedback) is introduced as a future feature, design it per these conditions. For now, the inference engine occupies the "external observer" role with the explicit caveat that it observes only text — not behavior, not relationships.',
    'Advisor: 피드백은 행동 anchored, trait-labeled 회피. "당신은 외향적이에요" 가 아니라 "지난 2주 X 같은 entry 가 Y회 보였어요".'
  ),
  (
    'Unskilled and unaware of it: How difficulties in recognizing one''s own incompetence lead to inflated self-assessments',
    ARRAY['Justin Kruger','David Dunning'],
    '10.1037/0022-3514.77.6.1121',
    'https://doi.org/10.1037/0022-3514.77.6.1121',
    'metacognition',
    'young_adult',
    'en',
    now(),
    '원조 Dunning-Kruger 논문. 기술 도메인(논리, 문법, 유머)에서 실제 수행 하위 사분위 참가자가 자신의 백분위를 크게 *과대* 추정, 상위 사분위 참가자는 약간 *과소* 추정. 메타인지 결손으로 해석 — 잘 수행하는 데 필요한 기술이 수행을 인식하는 데도 필요한 기술과 같음. 결정적 범위 노트: *기술* 도메인 — 성격이나 가치로의 확장은 더 약한 경험 지지를 가짐.',
    'The original finding: in skill domains (logic, grammar, humor), participants in the bottom quartile of actual performance dramatically overestimated their percentile rank, while top-quartile participants slightly underestimated theirs. Interpreted as a metacognitive deficit — the skills needed to perform well are the same skills needed to recognize performance. Critical scope note: this is about skill domains. The extension to personality or values has weaker empirical support.',
    'Dunning-Kruger 프레임은 *기술 관련 자기 주장* (예: "갈등 관리를 잘해요")에만 한정 적용. 글로벌 "사용자는 자기를 모를 것" 으로 일반화 금지.'
  ),
  (
    'Unskilled, unaware, or both? The better-than-average heuristic and statistical regression predict errors in estimates of own performance',
    ARRAY['Joachim Krueger','Ross A. Mueller'],
    '10.1037/0022-3514.82.2.180',
    'https://doi.org/10.1037/0022-3514.82.2.180',
    'metacognition',
    'adult',
    'en',
    now(),
    'Dunning-Kruger 패턴이 부분적으로 통계적 artifact 임을 주장. 평균 회귀(regression to the mean) + 일반적 "평균 이상" 휴리스틱이 메타인지 결손 이야기 없이도 같은 그래프 곡선을 만들 수 있음. 후속 논쟁은 메타인지 vs 통계 성분의 크기를 완전히 해결하지 못함 — 양쪽 모두 기여하는 것으로 보임. 2nd-Brain 함의: 사용자 자기평가를 표면화할 때 저-기술 과신을 *확정된 임상 사실* 로 다루지 말 것. 어떤 피드백도 이벤트 anchored, skill-specific 으로 프레임 — 글로벌 "당신은 과신적이에요" 금지.',
    'Argues the Dunning-Kruger pattern is partly a statistical artifact: regression-to-the-mean plus a general "better than average" heuristic produces the same plotted curve even without a metacognitive-deficit story. Subsequent debate has not fully resolved the magnitude of the metacognitive vs. statistical components — both seem to contribute. Implication for 2nd-Brain: when surfacing user self-assessments, do not treat low-skill overconfidence as a settled clinical fact. Frame any feedback as event-anchored and skill-specific rather than as global "you''re overconfident."',
    'Advisor 가드: "당신은 자기를 과대평가하는 경향" 류 글로벌 단언 금지. 이벤트 anchored skill-specific 피드백만 허용.'
  ),
  (
    'Overconfidence among beginners: Is a little learning a dangerous thing?',
    ARRAY['Carmen Sanchez','David Dunning'],
    '10.1037/pspa0000102',
    'https://doi.org/10.1037/pspa0000102',
    'metacognition',
    'young_adult',
    'en',
    now(),
    'Dunning-Kruger 패턴을 finer-grained 곡선으로 복제·정련: 완전한 초보자는 적절히 불확실; *소량의 훈련을 받은 초보자* 는 실제 역량을 overshoot 하는 신뢰 스파이크를 보임; 중급 학습자는 겸손 trough 에 진입; 전문가는 재-calibrate. 2nd-Brain 함의: 첫 번째 깊은 자기 성찰 사이클을 막 완료한 사용자는 자기지식 주장에 "초보자 과신" 을 보일 수 있음. 시스템은 초기-온보딩-기간의 확신 주장을 *잠정적* 으로 다루고 더 긴 호에서 재검증.',
    'Replicates and refines the Dunning-Kruger pattern with a finer-grained curve: complete novices are appropriately uncertain; beginners with a small amount of training show a confidence spike that overshoots their actual competence; intermediate learners then enter a humility trough; experts re-calibrate. 2nd-Brain implication: a user who has just done their first deep self-reflection cycle may exhibit a "beginner''s overconfidence" in their self-knowledge claims. The system should treat early-onboarding-period certainty claims as provisional and re-test over the longer arc.',
    'Engine 3: 첫 1–2주 사용자의 강한 글로벌 자기 주장은 persona-card 즉시 반영하지 않고 보류; 4주차 재검증 후 통합.'
  ),
  (
    'Core affect, prototypical emotional episodes, and other things called emotion: Dissecting the elephant',
    ARRAY['James A. Russell','Lisa Feldman Barrett'],
    '10.1037/0022-3514.76.5.805',
    'https://doi.org/10.1037/0022-3514.76.5.805',
    'metacognition',
    'adult',
    'en',
    now(),
    '*핵심 정서(core affect)* — 가치 × 각성의 연속 차원적 감각 — 와 *원형적 정서 에피소드* — 이산 정서 단어로 라벨된 카테고리·다성분 사건 — 구분. 핵심 정서는 내성에 매우 접근 가능; 정서 카테고리 라벨링(분노 vs 좌절 vs 분개)은 훨씬 해석적이며 정서 입자도, 언어, 문화에 따라 다름. 2nd-Brain 함의: 가치/각성 질문("오늘이 얼마나 무거웠어요?", "얼마나 활력 있었어요?")이 특정 정서 카테고리 질문("화났어요 아니면 다쳤어요?")보다 내성적으로 안전. 정서 입자도가 낮은 사용자에게는 카테고리 질문이 안정된 답을 가지지 않을 수도 있음.',
    'Distinguishes core affect (a continuously available, dimensional sense of valence × arousal) from prototypical emotional episodes (categorical, multi-component events labeled with discrete emotion words). Core affect is highly accessible to introspection; emotion-category labeling (anger vs. frustration vs. resentment) is much more interpretive and varies by emotional granularity, language, and culture. For 2nd-Brain: queue questions about valence/arousal ("how heavy did the day feel?" "how energized?") are introspectively safer than questions about specific emotion categories ("were you angry or hurt?"). For users low in emotional granularity, the category question may not have a stable answer to be reported.',
    'Queue 라우팅: 핵심 정서(valence × arousal) 질문은 자유롭게 큐잉. 정서 카테고리 라벨은 옵션 다중 선택 + "잘 모르겠음" 허용.'
  ),
  (
    'Self-perception theory',
    ARRAY['Daryl J. Bem'],
    '10.1016/S0065-2601(08)60024-6',
    'https://doi.org/10.1016/S0065-2601(08)60024-6',
    'metacognition',
    'adult',
    'en',
    now(),
    'Bem 의 정전적 주장: 내적 단서가 약하거나 모호할 때, 사람들은 자신의 행동을 *관찰* 함으로써 자신의 태도를 추론 — 타인의 태도를 추론하는 것과 같은 방식. Nisbett & Wilson 1977 및 Wilson 2002 와 보완: 동기에 대한 내성 접근은 종종 관찰된 행동으로부터의 *post-hoc 추론* 이지 직접 읽기가 아님. 2nd-Brain 직접 함의: 사용자에게 자신의 행동 패턴(entry 빈도, 주제 drift, 비슷한 과거 날에 무엇을 썼는지)을 보여주는 것이 많은 동기-관련 질문에 대해 그들에게 내성하라고 하는 것보다 *더* 정보적. behavior-pattern 피드백 루프가 primary modality 인 근거 — fallback 이 아님.',
    'Bem''s classic claim: when internal cues are weak or ambiguous, people infer their own attitudes by observing their own behavior — the same way they would infer someone else''s attitude. This complements Nisbett & Wilson 1977 and Wilson 2002: introspective access to motivation is often post-hoc inference from observed behavior, not direct reading. Direct implication for 2nd-Brain: showing the user their own behavioral pattern (entry frequency, theme drift, what they wrote on similar past days) is, for many motivation-relevant questions, more informative than asking them to introspect. This is the basis for the behavior-pattern feedback loop being a primary modality, not a fallback.',
    'Advisor primary modality: 행동 패턴 표면화 ("X 일 중 Y 일에 Z 주제로 썼어요"). 동기 introspection 질문은 보조.'
  ),
  (
    'Divergent consequences of success and failure in Japan and North America: An investigation of self-improving motivations and malleable selves',
    ARRAY['Steven J. Heine','Shinobu Kitayama','Darrin R. Lehman','Toshitake Takata','Eugene Ide','Cecilia Leung','Hisaya Matsumoto'],
    '10.1037/0022-3514.81.4.599',
    'https://doi.org/10.1037/0022-3514.81.4.599',
    'metacognition',
    'adult',
    'en',
    now(),
    '문화적 자기-개선 vs 자기-고양의 정초적 경험 입증. 일본 참가자는 *실패* 피드백 후에 과제를 더 오래 지속(자기-개선 지향), 북미 참가자는 *성공* 피드백 후에 더 오래 지속(자기-고양 지향). 메타인지 배치에 직접 함의: "X 를 별로 못해요" 또는 "아직 배울 게 많아요" 라고 보고하는 동아시아 사용자는 평균적으로 *miscalibrated 가 아님* — 그들은 성장을 scaffolding 하는 문화적으로 정상적인 self-improving 프레임을 사용 중. 그들의 낮은 자기보고 신뢰도를 낮은 메타인지 정확도의 증거로 다루는 것은 범주 오류.',
    'A foundational empirical demonstration that Japanese participants persist longer on tasks after failure feedback (self-improvement orientation), while North American participants persist longer after success feedback (self-enhancement orientation). Implication for the metacognition batch specifically: an East Asian user reporting that they are "not very good at X" or "still have a lot to learn" is, on average, not miscalibrated — they are using a culturally-normative self-improving frame that scaffolds growth. Treating their lower self-reported confidence as evidence of low metacognitive accuracy would be a category error.',
    'Cultural context modifier: 한국 사용자의 "그런 편 같아요", "잘 모르겠어요" 는 메타인지 부정확이 아니라 self-improving 프레임. confidence 를 down-weight 하지 않음.'
  );
