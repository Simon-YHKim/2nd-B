-- Self-Report Bias (SDR, Faking, Acquiescence, Careless Responding) — verified knowledge sources
-- Batch source: docs/research/batches/self-report-bias.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- `verified_at = now()` set at insert; re-verify quarterly.
-- Goal: calibrate confidence on Tier A atomic quotes, never accuse. Cultural
-- face-saving (체면, honne/tatemae) is NOT faking; never apply Paulhus IM weights
-- to Korean / Japanese users without cross-checking the cultural layer.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Two-component models of socially desirable responding',
    ARRAY['Delroy L. Paulhus'],
    '10.1037/0022-3514.46.3.598',
    'https://doi.org/10.1037/0022-3514.46.3.598',
    'self_report_bias',
    'adult',
    'en',
    now(),
    '사회적 바람직성 응답(SDR)을 두 요인으로 분리한 정초 논문: **인상관리(Impression Management, IM)** — 타인에게 좋게 보이려는 의식적 응답 조정 — 과 **자기기만적 고양(Self-Deceptive Enhancement, SDE)** — 정직하지만 과도하게 긍정적인 자기 지각. 요인분석적 분리는 후속 검증에서 견고히 유지됨. Tier A.',
    'Foundational empirical paper separating SDR into Impression Management (IM) — conscious tailoring of responses to look good to others — and Self-Deceptive Enhancement (SDE) — honest but overly-positive self-perception. The factor-analytic separation has held up under replication; treat as Tier A.',
    'Tier A 원자 인용문에서 SDR 신호 탐지 시 IM(이벤트 없는 미덕 주장) 과 SDE(불확실성 없는 자기 진단) 를 구분해 confidence 조정에 반영. 절대 사용자에게 직접 고지하지 않음.'
  ),
  (
    'Substance and bias in social desirability responding',
    ARRAY['Cornelia A. Pauls','Gerhard Stemmler'],
    '10.1016/S0191-8869(02)00187-3',
    'https://doi.org/10.1016/S0191-8869(02)00187-3',
    'self_report_bias',
    'adult',
    'en',
    now(),
    'BIDR-IM 및 BIDR-SDE 점수가 실재하는 성격 trait(낮은 신경증성, 높은 성실성, 높은 우호성)과 상당히 상관됨을 보임. 측정되고 있는 "편향" 의 일부는 실제 성격임. 2nd-Brain 함의: 높은 SDR 마커를 가진 사용자가 실제로 더 성실하고 우호적이며 정서적으로 안정적일 수 있음 — 단독으로 misrepresentation 증거로 처리 금지.',
    'Key finding: BIDR-IM and BIDR-SDE scores correlate substantially with substantive personality traits (low Neuroticism, high Conscientiousness, high Agreeableness) — i.e., the "bias" being measured is partly real personality. A user with elevated apparent SDR markers may genuinely be more conscientious / agreeable / emotionally stable, not necessarily dishonest.',
    '높은 SDR 점수 = 부정직 으로 코딩 금지. 측정 편향과 실재 trait 의 혼합이라는 점을 가정.'
  ),
  (
    'Internal and external validity of scores on the Balanced Inventory of Desirable Responding and the Paulhus Deception Scales',
    ARRAY['Richard I. Lanyon','Adrian C. Carle'],
    '10.1177/0013164406299104',
    'https://doi.org/10.1177/0013164406299104',
    'self_report_bias',
    'adult',
    'en',
    now(),
    'BIDR 와 Paulhus Deception Scales(PDS)를 법정·대학생 표본(N=519)에서 검증. 2요인 구조 확인, 단 외적 타당도는 *맥락 의존적* — 고-stakes(법정, 채용) vs 저-stakes(연구) 조건에서 IM 이 다르게 작동. 2nd-Brain 은 기본적으로 저-stakes 맥락이지만 온보딩이 평가적으로 느껴지면 IM 이 깨어남.',
    'Tested BIDR + Paulhus Deception Scales (PDS) across forensic and college samples (N=519). Confirms two-factor structure but finds external validity is context-dependent — IM functions differently under high-stakes (forensic, employment) vs. low-stakes (research) conditions.',
    '온보딩 플로우를 평가적으로 프레이밍하지 말 것. 사용자가 "심사받는 느낌" 을 받지 않게 카피·UI 설계.'
  ),
  (
    'A meta-analytic investigation of job applicant faking on personality measures',
    ARRAY['Scott A. Birkeland','Todd M. Manson','Jennifer L. Kisamore','Michael T. Brannick','Mark A. Smith'],
    '10.1111/j.1468-2389.2006.00354.x',
    'https://doi.org/10.1111/j.1468-2389.2006.00354.x',
    'self_report_bias',
    'adult',
    'en',
    now(),
    '33개 연구 메타분석. 지원자가 현직자보다 빅파이브에서 0.11~0.45 SD 높게 점수, 가장 큰 가식(faking)은 정서적 안정성(d=0.44)과 성실성(d=0.45) — 가장 *직무 관련성 높은* trait. 핵심 시사: faking 의 *방향* 은 맥락적으로 바람직한 trait 쪽. 2nd-Brain 프레이밍이 "좋은 사용자는 X" 라고 암시하면 사용자가 X 쪽으로 드리프트.',
    'Meta-analyzed applicant vs. incumbent scores across 33 studies. Effect sizes: applicants score 0.11–0.45 SD higher than incumbents on Big Five traits, with the largest faking on Emotional Stability (d=0.44) and Conscientiousness (d=0.45) — the most job-relevant traits. Critical for 2nd-Brain: the direction of faking is toward the contextually-desirable trait.',
    'C6 judge-mode flag 의 경험적 정당화. Judge 계정(@xprize.org 등) 은 고-stakes 맥락에서 0.11~0.45 SD inflation 이 예상되므로 downstream evaluation 변경이 옳은 운영 대응.'
  ),
  (
    'Reconsidering the use of personality tests in personnel selection contexts',
    ARRAY['Frederick P. Morgeson','Michael A. Campion','Robert L. Dipboye','John R. Hollenbeck','Kevin Murphy','Neal Schmitt'],
    '10.1111/j.1744-6570.2007.00089.x',
    'https://doi.org/10.1111/j.1744-6570.2007.00089.x',
    'self_report_bias',
    'adult',
    'en',
    now(),
    'SIOP 6인 패널의 pro-test 입장. faking 에도 불구하고 성격 검사가 선발에서 증분 타당도를 유지 — 가식 응답과 정직 응답의 *순위 상관* 이 충분히 높아 유효 예측이 가능하기 때문. 2nd-Brain 함의: 사용자가 약간 향상된 자기상을 제시하더라도 다수 entry 의 *순위* 신호는 여전히 유효. 위험은 *절대 수준* 주장(예: "성실성 95 백분위")이지 *상대* 신호(예: "성실성이 개방성보다 더 자주 나타남")가 아님.',
    'A six-author SIOP panel arguing personality tests retain incremental validity for selection despite faking — because the rank-order correlation between faked and honest responses is high enough that valid predictions remain possible. Even if users present somewhat-enhanced versions of themselves, longitudinal rank-order across multiple entries still carries signal. The risk is in absolute level claims, not in relative signal.',
    '"성실성이 개방성보다 더 자주 나타난다" 같은 상대 비교는 안전. "95 백분위" 같은 절대 수준은 SDR 영향 큼.'
  ),
  (
    'New perspectives on faking in personality assessment',
    ARRAY['Matthias Ziegler','Carolyn MacCann','Richard D. Roberts'],
    '10.1093/acprof:oso/9780195387476.001.0001',
    'https://doi.org/10.1093/acprof:oso/9780195387476.001.0001',
    'self_report_bias',
    'adult',
    'en',
    now(),
    'Faking 에 관한 통합 편서(Oxford). Faking 을 다차원적·동기적·부분적으로 trait 인 현상으로 다룸. Paulhus 자신의 챕터는 SDR 에 nuisance-bias 성분과 trait-substance 성분이 둘 다 있다고 논함(Pauls & Stemmler 2003 과 일치).',
    'Edited volume (Oxford) on faking as a multidimensional, motivated, partly-trait phenomenon. Important chapter: Paulhus argues SDR has both nuisance-bias and trait-substance components (consistent with Pauls & Stemmler 2003).',
    'Faking 이 단일 차원이 아니라 multidimensional 이라는 가정 하에 advisor 가 단순화하지 않도록 가드.'
  ),
  (
    'Identifying careless responses in survey data',
    ARRAY['Adam W. Meade','S. Bartholomew Craig'],
    '10.1037/a0028085',
    'https://doi.org/10.1037/a0028085',
    'self_report_bias',
    'adult',
    'en',
    now(),
    'Careless responding 탐지의 정전적 방법론 논문. 다중 지표 권장: 응답 시간(너무 빠름), longstring(같은 답 반복), Mahalanobis distance, even-odd consistency, infrequency/bogus 항목. 단일 지표는 5~10% false-positive, 2개 이상 결합 시 정밀도 향상. 2nd-Brain 의 free-text 등가물: 초단신 entry, 반복적 boilerplate, 다수 entry 에 걸친 낮은 어휘 다양성.',
    'The canonical methodology paper for careless responding. Recommends multiple indicators: response time (too fast), longstring (same answer repeated), Mahalanobis distance, even-odd consistency, infrequency / bogus items. Single indicators have false-positive rates of 5–10%; combining 2+ indicators improves precision. 2nd-Brain analogue in free-text journals: ultra-short entries, repeated boilerplate phrasing, low lexical diversity.',
    'Engine 2 입력 위생: free-text 의 careless 신호(초단신, boilerplate, 어휘 다양성 저하) 2개 이상 결합으로만 판정. 단일 entry 기반 판정 금지.'
  ),
  (
    'Detecting insufficient effort responding with an infrequency scale: Evaluating validity and participant reactions',
    ARRAY['Jason L. Huang','Nathan A. Bowling','Mengqiao Liu','Yuhui Li'],
    '10.1007/s10869-014-9357-6',
    'https://doi.org/10.1007/s10869-014-9357-6',
    'self_report_bias',
    'adult',
    'en',
    now(),
    'Infrequency-scale 접근의 타당도 검증과 *참가자 반응* 평가. 적절히 프레이밍된 infrequency 항목은 응답자 경험을 크게 저해하지 않음. 2nd-Brain 함의: 온보딩 단계의 가벼운 주의 프로브는 견딜 만하지만 저널링 표면에는 bogus 주의-체크 항목을 절대 넣지 말 것(반성 맥락을 깸).',
    'Validates an infrequency-scale approach and examines participant reactions — finding that infrequency items do not significantly degrade respondent experience when properly framed. Implication for 2nd-Brain: lightweight attention probes during onboarding are tolerable, but the journaling surface itself must NOT contain bogus-item attention checks.',
    '저널 표면에 attention check 금지. 온보딩에만 부드러운 검증 항목 가능.'
  ),
  (
    'Measuring extreme response style',
    ARRAY['Eric A. Greenleaf'],
    '10.1086/269326',
    'https://doi.org/10.1086/269326',
    'self_report_bias',
    'adult',
    'en',
    now(),
    'Extreme Response Style(ERS) — 항목 내용과 무관하게 척도 양 끝을 사용하는 경향 — 의 정초 측정 논문. 무상관 내용·동일 극단응답 기저율을 가진 항목들로 ERS 척도를 구성할 것을 제안. 후속 Weijters/Schimmack 연구의 방법론적 표준.',
    'The foundational paper on Extreme Response Style (ERS) — the tendency to use scale endpoints regardless of item content. Proposes that ERS measures be built from items with uncorrelated content and equal extreme-response base rates. Methodological standard later used by Weijters and Schimmack.',
    '저널 어조에서 항상-극단(always/never/완전히/전혀) 패턴 감지는 ERS-적응 신호로 처리. 단, 단독으로 신뢰성 지표화 금지.'
  ),
  (
    'The stability of individual response styles',
    ARRAY['Bert Weijters','Maggie Geuens','Niels Schillewaert'],
    '10.1037/a0018721',
    'https://doi.org/10.1037/a0018721',
    'self_report_bias',
    'adult',
    'en',
    now(),
    '1년 간격, 비중복 항목 종단 연구. 묵종(acquiescence), 반-묵종(disacquiescence), 중간점, 극단 응답 스타일이 모두 상당한 trait-like 안정성(r=.30~.50)을 보임. 인구통계는 적은 분산만 설명. 응답 스타일은 단순 노이즈가 아니라 개인차 변수.',
    'Longitudinal study (1-year gap, non-overlapping items) finding that acquiescence, disacquiescence, midpoint, and extreme response styles have substantial trait-like stability (r=.30–.50). Demographics explain only a small share. Response style is an individual-difference variable, not just a noise component to scrub.',
    '저널 entry 의 반복 언어 패턴(always-superlative, always-hedging)은 부분적으로 안정 trait 표현. "그냥 노이즈" 로 무시 금지.'
  ),
  (
    'Acquiescent response bias as an aspect of cultural communication style',
    ARRAY['Peter B. Smith'],
    '10.1177/0022022103260380',
    'https://doi.org/10.1177/0022022103260380',
    'self_report_bias',
    'adult',
    'en',
    now(),
    '41개국 메타분석. 묵종(yea-saying)이 문화적 의사소통 규범과 체계적으로 변동 — 집단주의·고-권력거리 국가에서 더 높음. cross-cultural 응답 스타일 차이가 노이즈가 아니라 문화적 의사소통 양식임을 시사. §Cross-cultural 섹션의 경험적 다리.',
    'Meta-analysis across 41 nations showing that acquiescence (yea-saying) varies systematically with cultural communication norms — higher in collectivist, high-power-distance nations. The empirical bridge to cross-cultural response style: response style differences are communicative style, not noise.',
    '한국·아시아 사용자의 묵종 기저선이 다르다는 가정으로 advisor confidence 조정. cross-cultural 어조 가드.'
  ),
  (
    'Who knows what about a person? The self-other knowledge asymmetry (SOKA) model',
    ARRAY['Simine Vazire'],
    '10.1037/a0017908',
    'https://doi.org/10.1037/a0017908',
    'self_report_bias',
    'adult',
    'en',
    now(),
    '본 배치의 2nd-Brain 인식론에 가장 중요한 논문. SOKA 모델: (a) **자기가 가장 잘 안다** — 내적-상태 trait(신경증성, 불안, 우울, 자존감) — 관찰성 낮고 평가성 낮음 → 자기에게 고유한 접근. (b) **타인이 더 잘 안다** — 평가적으로 부하된 외적으로 가시적 trait(지성, 창의성, 매력) — 자기 자아-보호 편향이 자기관을 왜곡. (c) **자기와 타인 동등** — 외향성 관련. 직접 함의: Engine 2 가 저널 텍스트에서 신경증성을 추론하면 자기보고가 가장 신뢰 가능한 신호. 지성/개방성/창의 능력을 추론하면 자기보고가 *가장 덜* 신뢰 가능.',
    'The most important paper in this batch for 2nd-Brain epistemics. SOKA model: Self knows best on internal-state traits (Neuroticism, anxiety, depression, self-esteem) — low observability, low evaluativeness give self unique access. Others know best on evaluatively-loaded, externally-visible traits (intellect, creativity, attractiveness) — ego-protective biases distort self-view but observers see clearly. Self and others equally good on extraversion-related traits.',
    'Confidence 조정 규칙: Neuroticism-쿼드런트 trait(자기 최상) 신호는 SDR 신호 있어도 신뢰 유지. Intellect-쿼드런트 trait(타인 최상) 신호는 SDR 신호 있을 때 더 강하게 confidence 축소.'
  ),
  (
    'Accurate judgments of neuroticism at zero acquaintance: A question of relevance',
    ARRAY['Sarah Hirschmüller','Boris Egloff','Stefan C. Schmukle','Steffen Nestler','Mitja D. Back'],
    '10.1111/jopy.12097',
    'https://doi.org/10.1111/jopy.12097',
    'self_report_bias',
    'young_adult',
    'en',
    now(),
    'Vazire 2010 의 중요한 반-뉘앙스. *관련 행동 단서* 가 있을 때 zero-acquaintance 의 낯선 사람도 신경증성을 정확히 탐지. "자기가 신경증성을 가장 잘 안다" 는 주장은 *단서 풍부 조건* 에서 경계가 있음. 2nd-Brain 함의: 저널의 *기술된 행동*(수면 교란, 사회적 위축, 반복적 걱정 주제)은 단순 자기-라벨이 아니라 추론 엔진이 사용할 수 있는 관찰 가능한 단서.',
    'Important counter-nuance to Vazire 2010: when relevant behavioral cues are present, even strangers can detect Neuroticism accurately at zero acquaintance. The "self knows Neuroticism best" claim is bounded — under cue-rich conditions, observers also perform. For 2nd-Brain, this implies that journal behaviors described (sleep disruption, social withdrawal, repeated worry themes) carry observable cues that an inference engine can use, not solely self-labels.',
    'Engine 2 는 자기-라벨("나는 불안한 사람") 외에 *기술된 행동*(수면 교란, 사회 위축 등)도 별도 신호로 추출. 행동 단서가 자기-라벨과 정렬되는지 cross-check.'
  ),
  (
    'What''s wrong with cross-cultural comparisons of subjective Likert scales? The reference-group effect',
    ARRAY['Steven J. Heine','Darrin R. Lehman','Kaiping Peng','Joe Greenholtz'],
    '10.1037/0022-3514.82.6.903',
    'https://doi.org/10.1037/0022-3514.82.6.903',
    'self_report_bias',
    'adult',
    'en',
    now(),
    '경험적 역설: 동아시아인이 북미인보다 더 집단주의적이라는 데 cross-cultural 전문가들이 동의하지만, 개인주의/집단주의 자기보고 Likert 점수는 그 차이를 보이지 않음 — 응답자가 자신의 문화 *기준집단* 에 암묵적으로 비교해 절대 차이를 씻어내기 때문. 한국 사용자의 "나는 꽤 독립적" 자기보고는 미국 사용자의 동일한 자기보고와 같은 앵커로 해석되어서는 안 됨.',
    'The empirical paradox: cross-cultural experts agree East Asians are more collectivist than North Americans, but Likert-scale self-reports of individualism/collectivism do not show this difference — because respondents implicitly compare themselves to their own cultural reference group, washing out the absolute difference. Direct implication for 2nd-Brain: a Korean user''s self-report of "I am pretty independent" should NOT be interpreted with the same anchor as an American user''s identical self-report. Reference-group adjustment is required before any cross-locale comparison.',
    'cross-locale 비교 시 reference-group 보정 필수. 한국 사용자의 자기-기술 어휘를 미국 사용자와 동일 앵커로 해석 금지.'
  ),
  (
    'Response style and cross-cultural comparisons of rating scales among East Asian and North American students',
    ARRAY['Chuansheng Chen','Shin-Ying Lee','Harold W. Stevenson'],
    '10.1111/j.1467-9280.1995.tb00327.x',
    'https://doi.org/10.1111/j.1467-9280.1995.tb00327.x',
    'self_report_bias',
    'young_adult',
    'en',
    now(),
    '일본·중국 학생이 미국 학생보다 척도 중간점을 유의하게 더 자주 사용; 미국 학생은 극단값을 더 자주 사용. 각 문화 내에서 개인주의 지지 → 극단값 사용, 집단주의 지지 → 중간점 사용. 2nd-Brain 함의: 한국 사용자의 중간점 선호는 부분적으로 안정적 *문화적-의사소통 양식* 이지 단순 정보적 양가성이 아님 — "낮은 참여" 또는 "자기를 잘 모름" 으로 코딩 금지.',
    'Japanese and Chinese students used scale midpoints significantly more than American students; American students used extreme values more. Within each culture, individualism endorsement predicted extreme-value use, collectivism endorsement predicted midpoint use. 2nd-Brain implication: for Korean users, midpoint preference is partly a stable cultural-communicative style, not exclusively informational ambivalence.',
    '한국 사용자의 중간점/hedged 답("어느 정도", "그런 편이에요") 을 낮은 자기-지식으로 코딩하지 말 것. 문화-의사소통 규범으로 해석.'
  ),
  (
    'Does an acquiescent response style explain why Koreans are less consistent than Americans?',
    ARRAY['Kenneth D. Locke','Kyounghee Baik'],
    '10.1177/0022022108328915',
    'https://doi.org/10.1177/0022022108328915',
    'self_report_bias',
    'young_adult',
    'both',
    now(),
    '직접 비교: 한국인은 미국인보다 더 높은 묵종(yea-saying)을 보이며, 이 묵종이 "한국인 자기보고가 내적으로 덜 일관됨" 발견을 부분 매개. 한국 저널 텍스트에서 trait 일관성을 측정할 때 자기-지식 결손이 아니라 문화적 의사소통 양식을 반영하는 동의-경향 기저선을 예상해야 함.',
    'Direct Korean-American comparison: Koreans show higher acquiescence (yea-saying) than Americans, and this acquiescence partially mediates the "Korean self-reports are less internally consistent" finding. When measuring trait consistency from Korean journal text, expect a baseline level of agreement-with-context that reflects cultural communication style rather than self-knowledge deficit.',
    '한국 사용자 entry 에서 prompt 의 어휘를 무비판적으로 채택하는 패턴을 demand-characteristic 으로 가중치 낮추되, "정직하지 못함" 으로 코딩 금지.'
  ),
  (
    'Lying words: Predicting deception from linguistic styles',
    ARRAY['Matthew L. Newman','James W. Pennebaker','Diane S. Berry','Jane M. Richards'],
    '10.1177/0146167203029005010',
    'https://doi.org/10.1177/0146167203029005010',
    'self_report_bias',
    'young_adult',
    'en',
    now(),
    'LIWC 기반 분류기가 *실험실에서 유도된* 거짓말을 67% 정확도로 탐지. 거짓말쟁이는 자기-참조 단어(I, me) 적게, 부정 정서 단어 더 많이, exclusive 단어(but, without) 적게, 인지 복잡성 낮게 사용. **결정적 caveat**: 이는 실험실 유도 거짓말이지 저널링 양식이 아님. 분류기 정확도는 특정 사용자 entry 에 대한 production-confidence 주장 임계값에 못 미침. 다수 entry 에 걸친 *집계 신호* 로만 사용, 단일 entry 판정 절대 금지.',
    'LIWC-based classifier achieved 67% accuracy in detecting deception in laboratory-induced lies. Liars used: fewer self-references ("I", "me"), more negative emotion words, fewer exclusive words ("but", "without"), lower cognitive complexity. Critical caveat: this is laboratory-induced deception about specific topics, not journaling style. The classifier accuracy is far below threshold for any production-confidence claim about a specific user entry. Use only as signal-aggregate across many entries, never as per-entry verdict.',
    '단일 entry SDR 판정 절대 금지. 다수 entry 집계 + 다른 신호와 결합한 confidence 조정에만 사용. 사용자 고지 금지.'
  );
