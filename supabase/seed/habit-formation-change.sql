-- Habit Formation & Behavior Change — verified knowledge sources
-- Batch source: docs/research/batches/habit-formation-change.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- `verified_at = now()` set at insert; re-verify quarterly.
-- 2nd-Brain treats Lally 66-day median as DISPLAY ANCHOR, never as deadline.
-- Dark patterns (Mathur 2019) are excluded from product surface regardless of
-- measured short-term lift.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'How are habits formed: Modelling habit formation in the real world',
    ARRAY['Phillippa Lally','Cornelia H. M. van Jaarsveld','Henry W. W. Potts','Jane Wardle'],
    '10.1002/ejsp.674',
    'https://doi.org/10.1002/ejsp.674',
    'habit_formation',
    'young_adult',
    'en',
    now(),
    '일상 환경에서 새로운 행동이 자동화되기까지 걸리는 시간을 측정한 정초 연구. 96명의 참가자가 일정한 맥락에서 12주 동안 매일 식이·음료·활동 행동을 수행, 자기보고 자동화(Self-Report Habit Index)를 점근 곡선으로 모형화. 95% 자동화 plateau 도달까지 중앙값 66일(개인 범위 18–254일). 결정적으로 *하루 빠지는 것은 곡선에 의미 있는 영향을 주지 않음* — 점근 곡선은 가끔의 빈틈에 견고. "N일 만에 습관 만들기" 주장의 경험적 anchor.',
    'The "66 days" paper. 96 participants chose an eating, drinking, or activity behavior to perform daily in a consistent context for 12 weeks; self-reported automaticity (Self-Report Habit Index) was modelled as an asymptotic curve. Median time to reach 95% of plateau automaticity was 66 days, with individual range 18 to 254 days. Critically, missing a single opportunity did not materially impair habit formation — the asymptotic curve is robust to occasional gaps. The empirical anchor for every "build a habit in N days" claim, and the result that licenses 2nd-Brain''s "missed day ≠ broken streak" policy.',
    '66일은 중앙값이지 마감일이 아님. 절대 deadline 으로 표시 금지. Streak 은 미스 날에 reset 하지 않음. 2–4주 마찰은 정상으로 프레임.'
  ),
  (
    'A new look at habits and the habit-goal interface',
    ARRAY['Wendy Wood','David T. Neal'],
    '10.1037/0033-295X.114.4.843',
    'https://doi.org/10.1037/0033-295X.114.4.843',
    'habit_formation',
    'adult',
    'en',
    now(),
    '습관의 이론적 핵심: 습관은 *맥락 단서 → 반응* 의 학습된 연합으로, 안정된 맥락에서의 반복으로 획득되며 최소한의 의식적 숙고로 실행됨. 습관-목표 인터페이스: 목표는 의도적으로 추구하는 것을 인도하고, 습관은 맥락 단서가 작동할 때 현재 목표와 무관하게 실행됨. Duhigg 의 대중서 "cue → routine → reward" 루프의 학술적 근원 — 인용은 Wood & Neal 로.',
    'Theoretical core. Habits are defined as learned associations between contextual cues and responses, acquired through repetition in stable contexts and executed with minimal conscious deliberation. The habit-goal interface frames the distinction: goals direct what we deliberately pursue; habits execute when context cues fire, regardless of current goals. The academic source for the popular "cue → routine → reward" loop (Duhigg''s trade book popularises this work; cite Wood & Neal, not Duhigg).',
    'Advisor 습관 코칭: 현재 단서(cue)를 식별 후 단서 자체를 바꾸거나 반응을 바꾸도록 가이드. "더 노력해" 같은 의지 기반 프레임 회피.'
  ),
  (
    'Psychology of habit',
    ARRAY['Wendy Wood','Dennis Rünger'],
    '10.1146/annurev-psych-122414-033417',
    'https://doi.org/10.1146/annurev-psych-122414-033417',
    'habit_formation',
    'adult',
    'en',
    now(),
    '20년의 습관 연구를 정리한 Annual Review 표준 리뷰. 이중 시스템 구조(숙고적 목표 추구 vs 맥락-단서 자동 행동) 확인, 신경 상관(기저핵, 배외측 선조체) 검토, 정책 관련 결론: *맥락을 바꾸는 것이 의지로 행동을 바꾸려는 것보다 종종 더 효과적*. 단절 순간(이사, 새 직장, 생활 전환)은 습관이 가장 가변적인 시기 — 2nd-Brain 온보딩 타이밍과 관련.',
    'The standard review of two decades of habit research. Confirms the dual-system architecture (deliberative goal pursuit vs context-cued automatic action), reviews neural correlates (basal ganglia, dorsolateral striatum), and frames the policy-relevant point: changing the context is often more effective than trying to change the behaviour by willpower. Discontinuity moments (move, new job, life transition) are when habits are most malleable — relevant to 2nd-Brain onboarding timing.',
    'Advisor: 단절 모멘트(이사, 이직 등)를 습관 재설치 기회로 활용. 안정 맥락 위에 새 단서를 얹지 않고 이미 작동 중인 단서에 새 반응을 연결.'
  ),
  (
    'Habit, attitude, and planned behaviour: Is habit an empty construct or an interesting case of goal-directed automaticity?',
    ARRAY['Bas Verplanken','Henk Aarts'],
    '10.1080/14792779943000035',
    'https://doi.org/10.1080/14792779943000035',
    'habit_formation',
    'adult',
    'en',
    now(),
    '습관 vs 의도의 분리: 습관 강도가 높을 때 행동은 진술된 의도·태도보다 과거 행동·맥락에 의해 더 잘 예측됨 — 즉 저널링이 습관화될수록 "내일 저널 쓸 거예요?" 의도 질문이 예측력을 잃음. Lally(2010)에서 사용된 Self-Report Habit Index 의 방법론적 기반.',
    'Habit vs intention dissociation. Establishes that when habit strength is high, behaviour is predicted more by past behaviour and context than by stated intentions or attitudes — i.e., asking users "do you intend to journal tomorrow?" loses predictive power as journaling becomes habitual. Methodologically grounded the Self-Report Habit Index used by Lally et al. (2010).',
    'Engine 3 (Persona): 습관화 단계가 진전될수록 intention 질문 비중을 줄이고 패턴 관찰 가중치를 올리는 자동 시프트.'
  ),
  (
    'Implementation intentions: Strong effects of simple plans',
    ARRAY['Peter M. Gollwitzer'],
    '10.1037/0003-066X.54.7.493',
    'https://doi.org/10.1037/0003-066X.54.7.493',
    'habit_formation',
    'adult',
    'en',
    now(),
    'If-then 계획 논문. 목표 의도("나는 X 할 거야")는 행동의 약한 예측자; *실행 의도*("상황 Y가 발생하면 행동 Z를 한다") 가 dramatically 더 강력 — 맥락 단서와 반응을 사전 연결하기 때문. 사실상 습관 형성을 위한 의도적 scaffold. 메커니즘: 단서 접근성 증가 + 단서 출현 시 반응의 자동 개시.',
    'The "if-then plan" paper. Goal intentions ("I intend to X") are weak predictors of action; implementation intentions ("When situation Y occurs, I will perform behaviour Z") are dramatically stronger because they pre-link a contextual cue to a response — effectively a deliberate scaffold for habit formation. Mechanism: increased cue accessibility plus automated response initiation once the cue is encountered.',
    '온보딩 핵심: 사용자가 직접 if-then 문장을 작성하도록 함. "When _____ I will _____" 템플릿. 시스템이 단서를 *부과* 하지 않음(autonomy 위배).'
  ),
  (
    'Implementation intentions and goal achievement: A meta-analysis of effects and processes',
    ARRAY['Peter M. Gollwitzer','Paschal Sheeran'],
    '10.1016/S0065-2601(06)38002-1',
    'https://doi.org/10.1016/S0065-2601(06)38002-1',
    'habit_formation',
    'adult',
    'en',
    now(),
    '메타분석 anchor. 94개 독립 연구, d=0.65 (중간–대 효과) — 실행 의도가 목표 의도 단독을 초과해 목표 달성에 미치는 효과. If-then 계획 효과의 실재성·재현성·실질성 확립. 효과 메커니즘: *언제/어디서* (단서)와 *무엇* (반응)을 사전 명세. 직접 설계 함의: 2nd-Brain 온보딩은 저널을 *언제·어디서* 쓸지를 사용자가 명세하게 해야 함 — 단지 "쓸 의도" 만으로는 부족.',
    'The meta-analytic anchor. 94 independent studies, d = 0.65 (medium-to-large effect) of implementation intentions on goal attainment over and above goal intentions alone. Establishes that the if-then plan effect is real, replicable, and substantial — and that it works through pre-specifying both when/where (cue) and what (response). Direct design implication: 2nd-Brain onboarding should ask the user to specify when and where they will journal, not just whether they intend to.',
    '온보딩 첫 세션 capture: (a) 습관화할 행동, (b) 단서(시간+장소+선행 사건), (c) 반응 명세. Sheeran 2006 = 메타근거.'
  ),
  (
    'A behavior model for persuasive design',
    ARRAY['B. J. Fogg'],
    '10.1145/1541948.1541999',
    'https://doi.org/10.1145/1541948.1541999',
    'habit_formation',
    'adult',
    'en',
    now(),
    'Fogg 행동 모델(FBM): B = MAT — *동기(Motivation)*, *능력(Ability)*, *트리거(Trigger)* 가 동시에 수렴할 때 행동이 발생. 설계 함의: 행동이 일어나지 않으면 동기가 너무 낮거나, 행동이 너무 어렵거나, 트리거가 안 발사된 것. Fogg 의 2019년 대중서 "Tiny Habits" 의 학술적 근원 — 책은 Tier D, 이 2009 conference 논문이 인용 대상.',
    'The Fogg Behaviour Model (FBM): B = MAT — behaviour occurs when Motivation, Ability, and a Trigger converge at the same moment. Design implication: if a behaviour isn''t happening, either motivation is too low, the behaviour is too hard, or no trigger fired. The "tiny habits" practitioner method popularised in Fogg''s 2019 trade book derives from this conference paper — the trade book is Tier D (no peer-review DOI), but the 2009 conference paper is the citable source.',
    'Advisor: 사용자가 "30분 저널 매일" 같은 큰 행동 제안 시 능력 비용 높음 → 이탈 위험 표면화, 작은 default(한 entry/한 문장) 제안 후 사용자가 scale up 결정.'
  ),
  (
    'Does gamification work? — A literature review of empirical studies on gamification',
    ARRAY['Juho Hamari','Jonna Koivisto','Harri Sarsa'],
    '10.1109/HICSS.2014.377',
    'https://doi.org/10.1109/HICSS.2014.377',
    'habit_formation',
    'adult',
    'en',
    now(),
    '첫 체계적 게이미피케이션 리뷰. 24개 경험 연구. 결론: 게이미피케이션은 동기·참여에 긍정 효과를 *낼 수 있지만* 효과는 맥락·사용자 특성에 크게 의존; 다수의 연구가 null 또는 음의 효과 보고. Streaks·points·badges 는 공짜 승리가 아님.',
    'First systematic gamification review. 24 empirical studies. Conclusion: gamification can produce positive effects on motivation and engagement, but effects depend heavily on context and user characteristics, and several studies report null or negative effects. Streaks, points, and badges are not free wins.',
    '게이미피케이션 요소는 도입 시 사용자별 적합성 검증 필요. universal lift 가정 금지.'
  ),
  (
    'The rise of motivational information systems: A review of gamification research',
    ARRAY['Jonna Koivisto','Juho Hamari'],
    '10.1016/j.ijinfomgt.2018.10.013',
    'https://doi.org/10.1016/j.ijinfomgt.2018.10.013',
    'habit_formation',
    'adult',
    'en',
    now(),
    '5년 후속 리뷰. 273개 경험 연구. 대부분 *단기* 참여 효과는 긍정적이나 *장기* 참여 증거는 약하고 이질적. 건강·교육 도메인이 일반 생산성보다 강한 효과. 게이미피케이션 수용의 cross-cultural 변동성 문서화되었으나 이론화 부족. 직접 설계 경고: 1주차 참여를 게임 메커닉으로 최적화하면 12주차 retention 을 해칠 수 있음 — 내재 동기가 crowd-out 되면.',
    'Five-year follow-up review. 273 empirical studies. Most studies report positive short-term engagement effects, but long-term engagement evidence is weak and heterogeneous. Health and education domains show stronger effects than generic productivity domains. Cross-cultural variation in gamification reception is documented but under-theorised. Direct design caution: optimising for week-1 engagement via game mechanics may hurt week-12 retention if intrinsic motivation is crowded out.',
    'KPI 단기 참여 ≠ 장기 retention. Streak/뱃지는 evidence-of-consistency 프레임만 허용, currency 프레임 금지.'
  ),
  (
    'Towards understanding the effects of individual gamification elements on intrinsic motivation and performance',
    ARRAY['Elisa D. Mekler','Florian Brühlmann','Alexandre N. Tuch','Klaus Opwis'],
    '10.1016/j.chb.2015.08.048',
    'https://doi.org/10.1016/j.chb.2015.08.048',
    'habit_formation',
    'adult',
    'en',
    now(),
    '"게이미피케이션은 역효과를 낼 수 있다" 의 DOI 검증 caveat. Points·levels·leaderboards 가 과제 *수행* 은 향상시켰지만 *내재 동기*, 자율성 지각, 유능감을 *향상시키지 않았고* 일부 조건에서는 감소시킴. sdt.md(autonomy/competence/relatedness)와 직접 연결 — 통제적으로 느껴지는 게이미피케이션은 표면적으로 지원하는 듯한 autonomy 욕구를 thwart 함. 2nd-Brain 정책의 경험적 기반: leaderboard 없음, 공개 순위 압력 없음, streak 은 *일관성의 증거* 로 프레임하되 *지켜야 할 화폐* 로는 절대 아님.',
    'The "gamification can backfire" caveat with a published DOI. Points, levels, and leaderboards increased performance on a task but did NOT enhance intrinsic motivation, perceived autonomy, or competence — and in some conditions reduced them. Connects directly to sdt.md (autonomy/competence/relatedness) — gamification that feels controlling thwarts the autonomy need it superficially appears to support. The empirical basis for 2nd-Brain''s policy: no leaderboards, no public-ranking pressure, streaks framed as evidence of consistency not currency to defend.',
    'Streak UI 카피: "27 days consistent" 허용, "27-day streak, don''t break it!" 금지. 어떤 사회적 비교·랭킹·공개 streak 도 도입 금지.'
  ),
  (
    'Using the internet to promote health behavior change: A systematic review and meta-analysis of the impact of theoretical basis, use of behavior change techniques, and mode of delivery on efficacy',
    ARRAY['Thomas L. Webb','Judith Joseph','Lucy Yardley','Susan Michie'],
    '10.2196/jmir.1376',
    'https://doi.org/10.2196/jmir.1376',
    'habit_formation',
    'adult',
    'en',
    now(),
    '디지털 개입 메타분석. 85개의 인터넷 매개 행동 변화 개입 연구. 평균 d=0.16 — 작지만 실재. *행동 변화 이론 명시적 기반* 개입(특히 Theory of Planned Behaviour, Social Cognitive Theory)이 무이론 개입보다 더 큰 효과; 풍부한 BCT 세트와 다중 전달 모드(텍스트+이메일+SMS)도 도움. 2nd-Brain 교훈: 이론 기반 설계가 unguided "좋은 아이디어" 를 이김, 그러나 *수수한 효과 크기* 예상 — over-promise 금지.',
    'The digital-intervention meta-analysis. 85 studies of internet-delivered behaviour-change interventions. Mean d = 0.16 — small but real. Interventions explicitly grounded in behaviour-change theory (especially Theory of Planned Behaviour, Social Cognitive Theory) produced larger effects than atheoretical ones; richer behaviour-change technique sets and more modes of delivery (text + email + SMS) also helped. Lesson for 2nd-Brain: theory-grounded design beats unguided "good ideas", but expect modest effect sizes — do not over-promise.',
    '마케팅·UI 카피 가드: "21일 만에 인생을 바꾸세요" 같은 약속 금지. 효과 크기는 modest 라는 사실에 정직.'
  ),
  (
    'Dark patterns at scale: Findings from a crawl of 11K shopping websites',
    ARRAY['Arunesh Mathur','Gunes Acar','Michael J. Friedman','Elena Lucherini','Jonathan Mayer','Marshini Chetty','Arvind Narayanan'],
    '10.1145/3359183',
    'https://doi.org/10.1145/3359183',
    'habit_formation',
    'adult',
    'en',
    now(),
    '조작적 UI의 경험적 지도. 11K 상업 사이트 crawl 에서 관찰된 15개 dark-pattern 유형 카탈로그(false scarcity, confirmshaming, forced action, sneak-into-basket 등). 2nd-Brain 관련성은 *반전된 의미* — 이 논문은 우리가 습관 형성을 위해 *배포해서는 안 되는* 패턴을 명세. data-ethics-consent.md 와 상호 인용. 측정된 단기 lift 와 무관하게 dark pattern 기반 engagement 는 2nd-Brain 제품 표면에서 배제.',
    'The empirical map of manipulative UI. Catalogues 15 dark-pattern types (false scarcity, confirmshaming, forced action, sneak-into-basket, etc.) observed across 11K commercial sites. The 2nd-Brain relevance is the inverse: this paper specifies the patterns we must NOT deploy in service of habit formation. Cross-references data-ethics-consent.md. Engagement designed via dark patterns is excluded from the 2nd-Brain product surface regardless of measured short-term lift.',
    'FOMO/false scarcity/confirmshaming 금지. "지금 안 쓰면 27일 진행이 날아갑니다" 같은 streak-loss 알림 절대 금지.'
  );
