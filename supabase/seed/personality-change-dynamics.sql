-- Personality Change Dynamics — verified knowledge sources
-- Batch source: docs/research/batches/personality-change-dynamics.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- `verified_at = now()` set at insert; re-verify quarterly.
-- Natural mean-level personality change in adulthood ≈ 0.1–0.2 SD per decade
-- (Roberts 2006; Bleidorn 2022). Even successful volitional intervention
-- (Stieger 2021) delivers ≈ 0.3–0.5 SD over 3 months. Week-over-week
-- percentile movement is almost always measurement noise.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Personality development: Stability and change',
    ARRAY['Avshalom Caspi','Brent W. Roberts','Rebecca L. Shiner'],
    '10.1146/annurev.psych.55.090902.141913',
    'https://doi.org/10.1146/annurev.psych.55.090902.141913',
    'personality_change',
    'lifespan',
    'en',
    now(),
    'Annual Review 종합 리뷰. 아동기부터 성인기까지의 성격 구조, 종단적 변화, 그리고 성격과 사회적 역할의 관계 메커니즘(social-investment principle)을 정리. 성숙 원칙을 단순 성숙 효과가 아니라 역할 기반(직장, 파트너십)으로 설명.',
    'Annual Review synthesis: structure, longitudinal change, and the social-investment principle. Frames the maturity pattern as role-driven rather than purely maturational. Covers child-to-adult personality structure, longitudinal change patterns, and the personality-social mechanisms.',
    '성격이 성인기에 성숙하는 *이유* 를 설명할 때 인용(직장 역할, 파트너십 역할이 어떤 trait 을 끌어올리는지). Advisor 의 maturation 내러티브의 메커니즘 근거.'
  ),
  (
    'Patterns of mean-level change in personality traits across the life course: A meta-analysis of longitudinal studies',
    ARRAY['Brent W. Roberts','Kate E. Walton','Wolfgang Viechtbauer'],
    '10.1037/0033-2909.132.1.1',
    'https://doi.org/10.1037/0033-2909.132.1.1',
    'personality_change',
    'lifespan',
    'en',
    now(),
    '92개 종단 표본(연령 10~101세) 메타분석. **성숙 원칙(maturity principle)** 정립: 성인기 전반에 걸쳐 대부분이 성실성 ↑, 우호성 ↑, 부정정서성 ↓ 방향으로 변화. 가장 큰 변화가 일어나는 trait 도 10년당 약 0.1~0.2 SD 수준. 2nd-Brain 백분위 UI 갱신 주기 결정의 1차 근거.',
    'The foundational meta-analysis of 92 longitudinal samples covering ages 10–101. Establishes the maturity principle: across the life course, most adults trend toward higher Conscientiousness, higher Agreeableness, lower Negative Emotionality. Effect sizes per decade are typically ~0.1–0.2 SD for the larger-changing traits. Anchors realistic-change expectations in 2nd-Brain.',
    'Hard ceiling for natural change. UI 는 decade-scale 움직임과 inconsistent 한 주간 percentile jump 를 표시하지 말 것.'
  ),
  (
    'Personality trait change in adulthood',
    ARRAY['Brent W. Roberts','Daniel Mroczek'],
    '10.1111/j.1467-8721.2008.00543.x',
    'https://doi.org/10.1111/j.1467-8721.2008.00543.x',
    'personality_change',
    'adult',
    'en',
    now(),
    '성인기 성격 변화의 접근 가능한 개관 논문. 평균 수준 변화(mean-level)와 순위 안정성(rank-order)을 함께 다루고, 변화의 메커니즘을 정리. Advisor 가 사용자에게 변화 가능성을 설명할 때 사용할 수 있는 readable bridge.',
    'Accessible review of adult personality change covering both mean-level shifts and rank-order stability, and the mechanisms behind both. The readable bridge between full meta-analyses and Advisor explanations.',
    '교과서 어조의 "30 이후 성격은 고정" 통념을 명시적으로 반박할 때 인용.'
  ),
  (
    'Clinical significance: A statistical approach to defining meaningful change in psychotherapy research',
    ARRAY['Neil S. Jacobson','Paula Truax'],
    '10.1037/0022-006X.59.1.12',
    'https://doi.org/10.1037/0022-006X.59.1.12',
    'reliable_change_index',
    'adult',
    'en',
    now(),
    '신뢰 가능한 변화 지수(Reliable Change Index, RCI)의 정초 논문. 관찰된 변화가 측정 오차 이상인지 판정하는 통계 기준(|RCI| ≥ 1.96, p < .05). 빅파이브 척도(reliability ≈ .85, SD ≈ 0.6) 기준 두 짧은 측정 사이에서 약 0.5 SD 미만의 차이는 노이즈로 처리해야 함을 시사. 2nd-Brain 의 "변화 vs 노이즈" UI 임계값의 기반.',
    'The Reliable Change Index (RCI). Statistical criterion for whether an observed change exceeds measurement error: |RCI| ≥ 1.96 (p < .05). For a typical Big Five scale with reliability ~.85 and SD ~0.6, this means observed deltas smaller than ~0.5 SD between two short measurements should be treated as noise, not real personality change. Basis for 2nd-Brain''s "show as change vs noise" threshold.',
    'UI 레이어에서 강제: 두 짧은 측정 사이 약 0.5 SD 미만 델타는 "측정 범위 내 / 감지된 변화 없음" 으로 표시. LLM 에 맡기지 말고 UI 가 직접 검사.'
  ),
  (
    'Stability and change of personality across the life course: The impact of age and major life events on mean-level and rank-order stability of the Big Five',
    ARRAY['Jule Specht','Boris Egloff','Stefan C. Schmukle'],
    '10.1037/a0024950',
    'https://doi.org/10.1037/a0024950',
    'personality_change',
    'adult',
    'en',
    now(),
    '독일 SOEP 패널 연구. 결혼, 이혼, 첫 직장, 출산, 은퇴, 배우자 사망 등 주요 생애사건이 trait 별로 다르게 영향. 첫 직장 → 성실성 ↑ 가 대표 예. 모든 효과가 적당히 작고 trait-specific 이라는 점을 강조 — 단일 사건이 "성격을 바꿨다" 는 민간 이론보다 작은 변화.',
    'The SOEP panel: marriage, divorce, first job, retirement, parenthood, death of spouse all produce measurable trait shifts, but most are modest and trait-specific (e.g., first job → Conscientiousness ↑). Most life-event effects are smaller than folk theory expects.',
    '생애사건 entry 태그 시 이후 90일을 가능 변동 시기로 처리. 단, 사건만으로 변화 단정 금지(선택 효과). 결정적 변화 약속하지 말 것.'
  ),
  (
    'Volitional personality trait change: Can people choose to change their personality traits?',
    ARRAY['Nathan W. Hudson','R. Chris Fraley'],
    '10.1037/pspp0000021',
    'https://doi.org/10.1037/pspp0000021',
    'personality_change',
    'young_adult',
    'en',
    now(),
    '의도적 성격 변화의 첫 직접 실증 연구(2015 JPSP). 사람들은 자신의 trait 을 *원할 때* 변화시킬 수 있지만, *변화하려는 욕망* 만으로는 불충분하며 *성공적 행동 실행* 이 동반되어야 함.',
    'The seminal demonstration: people can change their own traits when they want to, but only when desire is paired with successful behavioral execution. First direct empirical evidence that volitional personality change is real.',
    'Advisor 언어: 행동 > 욕망. Change-readiness 프롬프트 설계의 앵커.'
  ),
  (
    'A revised sociogenomic model of personality traits',
    ARRAY['Brent W. Roberts'],
    '10.1111/jopy.12323',
    'https://doi.org/10.1111/jopy.12323',
    'personality_change',
    'adult',
    'en',
    now(),
    '성격 변화의 메커니즘 모형. 환경에 반응하는 유전적 기질(pliable 시스템), 지속되면 trait 으로 누적되는 상태 수준 변동(elastic 시스템), 수년에 걸쳐 trait 을 유지·이동시키는 역할 기반 환경. 핵심 함의: 통찰이나 의도만으로는 변화가 일어나지 않으며, 수개월에 걸친 반복된 상태 경험이 필요.',
    'Roberts'' revised sociogenomic model. Integrates (a) genetic predispositions responsive to environment (pliable systems), (b) state-level fluctuations that become trait change if sustained (elastic systems), and (c) role-based environments that maintain or shift traits over years. Practical implication: trait change happens through repeated state experience over months, not through insight or intention alone.',
    '"왜 저널링만으로는 효과가 작은가" 설명의 앵커. Behavioral assignment 의 필요성 정당화.'
  ),
  (
    'Life events and personality trait change',
    ARRAY['Wiebke Bleidorn','Christopher J. Hopwood','Richard E. Lucas'],
    '10.1111/jopy.12286',
    'https://doi.org/10.1111/jopy.12286',
    'personality_change',
    'adult',
    'en',
    now(),
    '생애사건과 성격 변화에 관한 리뷰 및 향후 연구 의제. 사건은 trait 변화에 필요하지만 충분하지 않은 설명이며, *누가* 어떤 사건을 경험하는지의 선택 효과가 상당함을 정리.',
    'Review/agenda paper formalizing that life events are necessary but not sufficient explanations for trait change; selection effects (who experiences which events) are substantial.',
    '사건 후 trait shift 를 사건 단독 원인으로 해석하지 말 것. Advisor 가 "이 일 때문에 당신이 변했다" 식으로 단순화하지 않도록 가드.'
  ),
  (
    'Individual differences in personality change across the adult life span',
    ARRAY['Ted Schwaba','Wiebke Bleidorn'],
    '10.1111/jopy.12327',
    'https://doi.org/10.1111/jopy.12327',
    'personality_change',
    'adult',
    'en',
    now(),
    '네덜란드 패널(n ≈ 9,636) 분석. 사람마다 *얼마나* 변하는지가 다르고, 이 between-person 가소성 변동 자체가 안정적 개인차(trait-like). "모두가 같은 성숙 곡선을 따른다" 는 모델은 너무 단순함.',
    'Using Dutch panel data (n ≈ 9,636), shows people differ systematically in how much they change, not just what they change to. The "everyone follows the same maturation curve" model is too simple; between-person variation in plasticity is itself trait-like.',
    '페르소나 카드에서 one-size-fits-all 변화 예측 금지. 일부 사용자는 더 안정적, 일부는 더 변동성 큼.'
  ),
  (
    'You have to follow through: Attaining behavioral change goals predicts volitional personality change',
    ARRAY['Nathan W. Hudson','Daniel A. Briley','William J. Chopik','Jaime Derringer'],
    '10.1037/pspp0000221',
    'https://doi.org/10.1037/pspp0000221',
    'personality_change',
    'young_adult',
    'en',
    now(),
    '행동 챌린지를 단순히 *수락* 만 한 참가자에게서는 trait 변화 없음. 실제로 *완수* 한 참가자만 trait 변화. 의도-행동 격차가 변화를 좌우. 어떤 변화-약속 앱에든 핵심적인 설계 통찰.',
    'The "follow through" principle. Merely accepting behavioral challenges did not predict trait change. Only completing them did. The central design insight for any app that promises change: intention without execution does not move traits.',
    'Advisor 의 기본 규칙: 단순 reflection 프롬프트가 아니라 *완수 가능한* 구체 행동 제안. 완수 여부 추적 필수.'
  ),
  (
    'Change goals robustly predict trait growth: A mega-analysis of a dozen intensive longitudinal studies examining volitional change',
    ARRAY['Nathan W. Hudson','R. Chris Fraley','William J. Chopik','Daniel A. Briley'],
    '10.1177/1948550619878423',
    'https://doi.org/10.1177/1948550619878423',
    'personality_change',
    'young_adult',
    'en',
    now(),
    '12개 집중 종단연구 메가분석. 변화 목표 설정이 16주 동안 약 0.16 SD 의 추가 성장을 예측. "reflection + goal" 만 있고 행동 scaffold 가 없는 경우의 현실적 천장.',
    'Mega-analysis of 12 intensive longitudinal studies. Change goals predicted ~0.16 SD additional growth over 16 weeks for the trait participants targeted. The realistic ceiling for "reflection + goal" without behavioral assignment scaffolding.',
    '저널링 + 목표만 있는 사용자에게 약 0.16 SD / 16주 가 현실적 기대치. 그 이상 약속 금지.'
  ),
  (
    'A dimensional taxonomy of perceived characteristics of major life events',
    ARRAY['Maike Luhmann','Ina Fassbender','Marisa Alcock','Peter Haehner'],
    '10.1037/pspp0000291',
    'https://doi.org/10.1037/pspp0000291',
    'personality_change',
    'adult',
    'en',
    now(),
    '생애사건은 단일 범주가 아니라 다차원적 *지각 속성*(valence, predictability, controllability, social-status impact 등)으로 분해됨. 같은 "이혼" 도 사람마다 정반대 궤적을 가질 수 있음. 사건 라벨보다 *지각된 특성* 이 더 중요.',
    'Life events are not unitary; the perceived characteristics (valence, predictability, controllability, social-status impact) matter more than the event label itself. Two people experiencing "divorce" can have opposite trajectories depending on perceived characteristics.',
    '생애사건 태그 시 사건명만 저장하지 말고 valence/predictability/controllability 등을 함께 캡처. "무슨 일이 있었나" 만 묻지 말 것.'
  ),
  (
    'Changing personality traits with the help of a digital personality change intervention',
    ARRAY['Mirjam Stieger','Christoph Flückiger','Dominik Rüegger','Tobias Kowatsch','Brent W. Roberts','Mathias Allemand'],
    '10.1073/pnas.2017548118',
    'https://doi.org/10.1073/pnas.2017548118',
    'personality_change',
    'adult',
    'en',
    now(),
    '2nd-Brain 에 가장 직접적으로 관련된 연구. n=1,523 RCT, 3개월짜리 디지털 챗봇 개입(PEACH)으로 목표 trait 에 약 0.3~0.5 SD 변화 — 3개월 후에도 유지. 적극적 참여자에게 한정. AI-매개 reflection 제품의 현실적 천장.',
    'Most directly relevant study for 2nd-Brain. n=1,523 RCT — the PEACH chatbot over 3 months produced ~0.3–0.5 SD targeted trait change, maintained at 3-month follow-up, when participants actively engaged. The realistic ceiling for what a well-designed AI-mediated reflection product can plausibly deliver.',
    '2nd-Brain 의 변화 약속의 1차 앵커. 구조화된 행동 과제 + 일일 참여가 있을 때 약 0.3~0.5 SD / 3개월이 현실적 상한. 그 이상 promise 금지.'
  ),
  (
    'Personality stability and change: A meta-analysis of longitudinal studies',
    ARRAY['Wiebke Bleidorn','Ted Schwaba','Anqing Zheng','Christopher J. Hopwood','Susana S. Sosa','Brent W. Roberts','Daniel A. Briley'],
    '10.1037/bul0000365',
    'https://doi.org/10.1037/bul0000365',
    'personality_change',
    'lifespan',
    'en',
    now(),
    '2022 Psychological Bulletin 신세대 메타분석(k=189 안정성, k=276 변화, N>240k). Roberts 2006 의 maturity 패턴 확인 및 정교화. 성격 변화는 *생애 전반에 걸쳐 연속적* 이며 "30에 굳어진다" 는 옛 관점은 틀림. 2nd-Brain 변화 기대치의 1차 인용 앵커.',
    'The second-generation meta-analysis (k=189 stability, k=276 change; total N>240,000). Confirms and refines Roberts 2006: rank-order stability rises sharply through young adulthood; mean-level change is continuous across the lifespan with the largest shifts in young adulthood. Replaces the "personality fixed by 30" folk model.',
    'Advisor 및 UI 의 장기 변화 메시징의 정전적 인용. "성격 개조" 약속 금지, 10년에 0.1–0.2 SD 정도의 점진적 변화는 가능하다는 안내.'
  );
