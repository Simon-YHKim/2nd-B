-- Self-Concept Clarity & Self-Multiplicity — verified knowledge sources
-- Batch source: docs/research/batches/self-concept-clarity.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- `verified_at = now()` set at insert; re-verify quarterly.
-- 2nd-Brain represents the user as structured multiplicity (work-self,
-- family-self, etc.), not as a monolithic profile. SCC is not therapy;
-- low SCC is normative in collectivist contexts and at certain phases.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Self-esteem and clarity of the self-concept',
    ARRAY['Jennifer D. Campbell'],
    '10.1037/0022-3514.59.3.538',
    'https://doi.org/10.1037/0022-3514.59.3.538',
    'self_concept_clarity',
    'young_adult',
    'en',
    now(),
    '자기개념의 명확성(consistency, certainty, temporal stability)이 자존감(positivity)과 경험적으로 구분된다는 점을 정립한 정초 연구. 자존감 낮은 참가자는 더 혼란스럽고 내적으로 비일관적이며 시간적으로 불안정한 자기 기술을 보임. SCC 구성개념의 경험적 씨앗.',
    'Foundational paper establishing that the clarity of the self-concept (consistency, certainty, temporal stability of self-beliefs) is empirically distinct from self-esteem (positivity). Low-self-esteem participants exhibit more confused, internally inconsistent, and temporally unstable self-descriptions. The empirical seed of the SCC construct.',
    'Ledger 의 SCC 신호와 self-esteem 신호를 별도 차원으로 추적. 동시에 변동할 수 있으나 동일한 것이 아니라는 점이 출발 전제.'
  ),
  (
    'Self-concept clarity: Measurement, personality correlates, and cultural boundaries',
    ARRAY['Jennifer D. Campbell','Paul D. Trapnell','Steven J. Heine','Ilana M. Katz','Loraine F. Lavallee','Darrin R. Lehman'],
    '10.1037/0022-3514.70.1.141',
    'https://doi.org/10.1037/0022-3514.70.1.141',
    'self_concept_clarity',
    'adult',
    'en',
    now(),
    '12문항 자기개념 명확성 척도(SCCS)를 개발·타당화한 핵심 논문. 낮은 신경증성, 높은 우호성·성실성과의 상관을 확인. 결정적으로 일본인 참가자는 캐나다인보다 SCC 가 체계적으로 낮지만 웰빙 저하로 연결되지 않음을 보여, SCC 를 보편적으로 바람직한 트레잇으로 다루지 말아야 한다는 정초 경고를 제공.',
    'THE SCCS paper. Validated the 12-item Self-Concept Clarity Scale; demonstrated correlations with low neuroticism and high agreeableness/conscientiousness; and — critically — included a cross-cultural comparison showing Japanese participants score systematically lower on SCC than Canadian participants, yet without corresponding decrements in well-being. The foundational warning against treating SCC as a universally desirable trait.',
    '동아시아 사용자에게 SCC 점수를 적용할 때 사용자 본인의 distress 보고와 함께 해석. 점수만으로 "개선 필요" 라벨 금지. Ledger 의 다국어 페르소나 규범에 직접 영향.'
  ),
  (
    'The dynamic self-concept: A social psychological perspective',
    ARRAY['Hazel Markus','Elissa Wurf'],
    '10.1146/annurev.ps.38.020187.001503',
    'https://doi.org/10.1146/annurev.ps.38.020187.001503',
    'self_concept_clarity',
    'adult',
    'en',
    now(),
    '자기개념이 역동적·다면적 시스템이며, 순간마다 맥락에 따라 자기 표상의 하위집합("working self-concept")이 활성화된다는 권위 있는 리뷰. McConnell의 다중 자기측면 프레임워크와 Linville의 자기복잡성 모델이 함께 위치하는 이론적 틀.',
    'Authoritative review establishing that the self-concept is a dynamic, multifaceted system in which a subset of self-representations (the "working self-concept") is active at any moment depending on context. Provides the theoretical scaffolding under which McConnell''s multiple self-aspects framework and Linville''s self-complexity model both sit.',
    'Voice layer 는 단일 "진짜 나" 를 강요하지 않고, "지금 활성화된 모습"이 맥락에 따라 다를 수 있음을 전제로 작동해야 함.'
  ),
  (
    'The Multiple Self-Aspects Framework: Self-Concept Representation and Its Implications',
    ARRAY['Allen R. McConnell'],
    '10.1177/1088868310371101',
    'https://doi.org/10.1177/1088868310371101',
    'self_concept_clarity',
    'adult',
    'en',
    now(),
    '2nd-Brain Ledger 아키텍처에 가장 직접적으로 load-bearing 한 프레임워크. 자기개념은 맥락별 자기측면(self-as-parent, self-as-employee, self-as-friend 등)의 집합으로 가장 잘 표상되며, 각 측면은 고유한 속성·행동·정서를 가짐. 한 측면에서 활성화된 속성이 연합 링크를 통해 다른 측면으로 전이되어, 한 영역의 위협이 다른 영역으로 정서적으로 spill-over 되는 현상을 설명.',
    'Most directly load-bearing for 2nd-Brain''s Ledger architecture. Argues that the self-concept is best represented as a collection of context-specific self-aspects (e.g., self-as-parent, self-as-employee, self-as-friend), each with associated attributes, behaviors, and affect. Attributes activated in one self-aspect spread to other aspects through associative links — explaining why threats in one domain can spill over emotionally.',
    'Ledger 스키마: 단일 trait 벡터가 아니라 self-aspect 별 trait 추정·내러티브·정서 시그니처. spill-over 감지 시 advisor 가 부드럽게 명명.'
  ),
  (
    'The self as a collection of multiple self-aspects: Structure, development, operation, and implications',
    ARRAY['Allen R. McConnell','Tonya M. Shoda','Heather M. Skulborstad'],
    '10.1521/soco.2012.30.4.380',
    'https://doi.org/10.1521/soco.2012.30.4.380',
    'self_concept_clarity',
    'adult',
    'en',
    now(),
    'Multiple Self-Aspects Framework 의 발전적 보충. 자기측면이 emerging adulthood 를 거쳐 어떻게 생성·통합되는지, 그리고 작동 메커니즘에 대한 추가 세부사항을 제공.',
    'Elaboration of the Multiple Self-Aspects Framework with developmental and operational detail. Useful when scoring how self-aspects emerge and consolidate across emerging adulthood.',
    'Emerging adult 사용자의 self-aspect 가 아직 통합 중일 수 있다는 점을 advisor 가 인식. 미통합을 결손으로 코딩하지 말 것.'
  ),
  (
    'Self-complexity and affective extremity: Don''t put all of your eggs in one cognitive basket',
    ARRAY['Patricia W. Linville'],
    '10.1521/soco.1985.3.1.94',
    'https://doi.org/10.1521/soco.1985.3.1.94',
    'self_concept_clarity',
    'young_adult',
    'en',
    now(),
    '인지적으로 더 분화된 자기 표상(더 많은 자기측면, 적은 측면 간 중복)을 가진 참가자가 단일 영역 사건에 대한 극단적 기분 변동을 덜 경험한다는 원조 연구. 자기복잡성 가설의 출발점.',
    'Original demonstration that participants with more cognitively differentiated self-representations (more self-aspects, less inter-aspect overlap) experience less extreme mood swings in response to single-domain events.',
    'Ledger 의 self-aspect 분화 정도가 어떤 기능적 의미를 가질 수 있는지 설명할 때 인용. 단, 인과적 권장(개입)으로 비약 금지.'
  ),
  (
    'Self-complexity as a cognitive buffer against stress-related illness and depression',
    ARRAY['Patricia W. Linville'],
    '10.1037/0022-3514.52.4.663',
    'https://doi.org/10.1037/0022-3514.52.4.663',
    'self_concept_clarity',
    'adult',
    'en',
    now(),
    '자기복잡성이 부정적 생애사건에 따른 우울·스트레스 관련 질환을 완충한다는 종단 증거. 단, 후속 메타분석(Rafaeli-Mor & Steinberg 2002)은 효과가 작고 일관성이 떨어진다고 지적 — 이론적 렌즈로만 사용하고 Tier-A 인과 주장으로 다루지 말 것.',
    'Extended the self-complexity model to clinical outcomes: longitudinal evidence that higher self-complexity buffers against depression and stress-related illness following negative life events. Replication caveat: the self-complexity → wellbeing relationship is mixed in later replications (Rafaeli-Mor & Steinberg 2002 meta found small and inconsistent effects). Treat as a theoretical lens, not a Tier-A causal claim.',
    '"자기측면을 늘리세요" 같은 개입 권장 금지. 구조적 기술 특성으로만 Ledger 에 표현.'
  ),
  (
    'Possible selves',
    ARRAY['Hazel Markus','Paula Nurius'],
    '10.1037/0003-066x.41.9.954',
    'https://doi.org/10.1037/0003-066x.41.9.954',
    'self_concept_clarity',
    'adult',
    'en',
    now(),
    '"가능한 자기(possible selves)" 개념 도입: 되고 싶은 자기, 기대하는 자기, 두려워하는 자기에 대한 인지적 표상. 미래-자기 상상을 현재 행동을 형성하는 동기적 엔진으로 위치시킴. 2nd-Brain 의 성장 표면(growth surfaces)에 직접 관련.',
    'Introduced the construct of possible selves — cognitive representations of the self one could become, hopes to become, or fears becoming. Positions future-self imagination as a motivational engine that shapes current behavior. Directly relevant to 2nd-Brain''s growth surfaces.',
    '성장 표면에서 사용자에게 5년 후 되고 싶은 모습 / 피하고 싶은 모습을 묻고, 페르소나 카드에 기대-가능-자기 와 우려-가능-자기를 별도 트랙으로 저장.'
  ),
  (
    'Possible selves and delinquency',
    ARRAY['Daphna Oyserman','Hazel R. Markus'],
    '10.1037/0022-3514.59.1.112',
    'https://doi.org/10.1037/0022-3514.59.1.112',
    'self_concept_clarity',
    'adolescent',
    'en',
    now(),
    '기대되는 가능 자기와 두려운 가능 자기 사이의 "균형(balance)" 이 행동을 예측. 두려운 자기(예: "약물 중독자")가 그것을 피하기 위한 기대 자기와 짝지어지지 않은 청소년이 비행 행동을 더 보임. 2nd-Brain 함의: 두려운 자기만 단독으로 표면화하면 불충분 — 반드시 기대-자기 대응 궤적과 페어링 필요.',
    'Empirical demonstration that balance between expected and feared possible selves predicts behavior. Adolescents whose feared selves (e.g., "drug user") are not paired with corresponding expected selves to avoid that outcome show more delinquent behavior. Implication for 2nd-Brain: feared selves alone are insufficient — they must be paired with expected-self counter-trajectories.',
    'Possible-selves 작업 규칙: 모든 두려운 자기는 그것을 피하기 위한 기대 자기와 페어링. "무엇이 두렵나?" 만 묻고 "그것을 피하기 위해 무엇을 할 것인가?" 를 묻지 않으면 경험적으로 더 나쁜 패턴 재생산.'
  ),
  (
    'Culture and self-concept flexibility',
    ARRAY['Incheol Choi','Yumi Choi'],
    '10.1177/014616702237578',
    'https://doi.org/10.1177/014616702237578',
    'self_concept_clarity',
    'young_adult',
    'both',
    now(),
    '한국인 참가자가 미국인보다 더 높은 자기개념 유연성(맥락에 따라 자신을 다르게 기술하려는 의지)을 보이며, 이 유연성이 한국 표본에서 낮은 웰빙과 연관되지 않음을 입증. 맥락적 자기 변동이 심리적 분절을 의미한다는 서구적 가정에 반증.',
    'Korean participants showed higher self-concept flexibility (greater willingness to describe themselves differently across contexts) than American participants — and this flexibility was NOT associated with lower well-being in the Korean sample, contradicting Western assumptions that contextual self-variation indicates psychological fragmentation.',
    '한국 사용자의 cross-context 자기 변동을 결손으로 코딩하지 말 것. Advisor 는 "어디서나 같아야 한다"는 서구적 처방 회피.'
  ),
  (
    'Culture and self-concept stability: Consistency across and within contexts among Asian Americans and European Americans',
    ARRAY['Tammy English','Serena Chen'],
    '10.1037/0022-3514.93.3.478',
    'https://doi.org/10.1037/0022-3514.93.3.478',
    'self_concept_clarity',
    'young_adult',
    'en',
    now(),
    '결정적 정교화: 아시아계 미국인은 cross-context 자기개념 일관성이 낮지만(다른 관계에서 다른 모습) within-context 안정성(같은 관계 안에서 시간에 따른 일관성)은 유럽계 미국인과 동등. 패턴은 혼란(chaos)이 아니라 구조화된 맥락주의(structured contextualism). 한국 사용자를 위한 맥락 인식 자기 표상 설계의 가장 정확한 경험적 앵커.',
    'Critical refinement: Asian Americans showed lower cross-context self-concept consistency (different in different relationships) but comparable within-context stability (consistent across time within the same relationship) as European Americans. The pattern is structured contextualism, not chaos. The most precise empirical anchor for designing context-aware self-representation for Korean users.',
    '한국/아시아계 사용자에게: cross-context 균일성("어디서나 같아야 한다") 대신 within-context 안정성("같은 사람 앞에서는 일관되시잖아요")을 강조.'
  ),
  (
    'Self-Concept Clarity Development Across the Lifespan',
    ARRAY['Jennifer Lodi-Smith','Elisabetta Crocetti'],
    '10.1007/978-3-319-71547-6_4',
    'https://doi.org/10.1007/978-3-319-71547-6_4',
    'self_concept_clarity',
    'lifespan',
    'en',
    now(),
    'Lodi-Smith 의 SCC 생애 발달 정전적 정리(Springer 단행본 챕터). SCC 는 청소년기에 가장 낮고, emerging adulthood 동안 상승, 중년기 동안 평탄, 후기 노년기에 역할 전환(은퇴, 사별)과 함께 하강할 수 있음. 사용자 요청의 "2021 PSPB" 인용은 Crossref 에서 발견되지 않아 이 2017 챕터로 해소.',
    'The user-requested "Lodi-Smith lifespan" reference resolves to this chapter, not a 2021 PSPB article. Synthesizes evidence that SCC is low in adolescence, rises across emerging adulthood, plateaus through middle adulthood, and may decline in late life with role transitions (retirement, widowhood).',
    '연령대별 SCC 기대치 차별화: 청소년/emerging adult 사용자의 낮은 SCC 를 결손으로 보지 말 것. 후기 노년 SCC 변동은 역할 전환 맥락에서 해석.'
  ),
  (
    'Development of identity clarity and content in adulthood',
    ARRAY['Jennifer Lodi-Smith','Seth M. Spain','Kara Cologgi','Brent W. Roberts'],
    '10.1037/pspp0000091',
    'https://doi.org/10.1037/pspp0000091',
    'self_concept_clarity',
    'adult',
    'en',
    now(),
    '정체성 명확성(SCC와 밀접 연관)이 중년기까지 계속 발달하며, 명확성 증가가 *내용* 변화와 동반된다는 종단 증거. 사람들은 고정된 자기에 대해 더 명확해지는 것이 아니라, *변화하는* 자기에 대해 더 명확해진다. Ledger 가 명확성과 내용 드리프트를 둘 다 시간에 따라 추적해야 함을 뒷받침.',
    'Longitudinal evidence that identity clarity (closely related to SCC) continues to develop into middle adulthood, and that clarity gains are accompanied by content changes — i.e., people don''t just get clearer about a static self, they become clearer about a changing self. Supports a Ledger architecture that tracks both clarity and content drift over time.',
    'Ledger 스키마: SCC 시계열뿐 아니라 자기-속성 *내용* 의 시간적 드리프트도 별도 트랙. 둘이 동행할 수 있다는 가정.'
  ),
  (
    'Self-concept clarity and subjective well-being: Disentangling within- and between-person associations',
    ARRAY['Guangcan Xiang','Zhaojun Teng','Qingqing Li','Hong Chen'],
    '10.1007/s10902-023-00646-2',
    'https://doi.org/10.1007/s10902-023-00646-2',
    'self_concept_clarity',
    'young_adult',
    'en',
    now(),
    '다층 종단 증거. SCC-웰빙 사이의 between-person 상관(평균적으로 SCC 높은 사람이 더 행복)과 within-person 효과(같은 사람의 SCC가 오르면 그의 웰빙도 오른다)를 분리. 두 효과 모두 존재하지만 within-person 효과는 더 작고 맥락 의존적. 낮은 SCC 를 고쳐야 할 개인적 결손으로 프레임하는 것에 대한 경고.',
    'Multilevel longitudinal evidence distinguishing between-person SCC-wellbeing correlations (higher-SCC people are happier on average) from within-person effects (when the same person''s SCC rises, their wellbeing rises). Both effects exist but the within-person effect is smaller and contextual. Cautions against framing low SCC as a personal deficit to be fixed.',
    '한 사용자의 SCC 변동이 웰빙 변동을 일부 예측할 수 있으나, "낮은 SCC = 고쳐야 할 문제" 라는 프레임은 피하라는 within-person 경고.'
  ),
  (
    'Construction and Validation of Self-Concept Clarity Scale for Children and Adolescent in Korea',
    ARRAY['Park, Wooram'],
    '10.20972/kjee.30.3.201909.1',
    'https://doi.org/10.20972/kjee.30.3.201909.1',
    'self_concept_clarity',
    'adolescent',
    'ko',
    now(),
    '한국 아동·청소년(9-18세)을 위한 자기개념 명확성 척도(K-SCCS) 개발 및 타당화. Campbell SCCS 를 한국 발달 맥락에 맞춰 적응시킨 척도, 항목 생성→EFA→CFA→준거 타당도 절차를 거침. 본 큐레이션에서 확인된 유일한 DOI 등록 한국 SCC 측정 도구.',
    'The K-SCCS for children/adolescents. A Korean validation of the Campbell SCCS adapted for ages 9–18, developed through the standard scale-development pipeline (item generation → EFA → CFA → criterion validity). The only DOI-registered Korean SCC measurement instrument located in this curation pass.',
    '한국 청소년 사용자의 SCC 추론 시 인용. 성인용 한국 SCCS 는 검증된 등록 도구가 없어, 한국 성인의 SCC 점수는 잠정적으로 다루고 역할-유연성·맥락-일관성 내러티브와 삼각측량 권장.'
  );
