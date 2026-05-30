-- Crisis Detection — Global Routing Extension — verified knowledge sources
-- Batch source: docs/research/batches/crisis-detection-global.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- `verified_at = now()` set at insert; re-verify quarterly.
-- Extends crisis-detection.sql (Korean canonical) with locale-routing layer
-- for US / UK / EU / JP / CA / AU. Detection logic + Korean RED-zone copy
-- remain governed by crisis-detection.sql. This batch establishes academic
-- evidence + cross-cultural disclosure norms behind the routing tree.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Improving the detection and prediction of suicidal behavior among military personnel by measuring suicidal beliefs: An evaluation of the Suicide Cognitions Scale',
    ARRAY['Craig J. Bryan','M. David Rudd','Evelyn Wertenberger','Neysa Etienne','Bobbie N. Ray-Sannerud','Chad E. Morrow','Alan L. Peterson','Stacey Young-McCaughon'],
    '10.1016/j.jad.2014.02.021',
    'https://doi.org/10.1016/j.jad.2014.02.021',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '미군 현역 표본에서 Suicide Cognitions Scale(SCS)이 측정하는 자살 특이적 인지(견딜 수 없음 unbearability, 사랑받지 못함 unlovability)가 단순 자살 사고 키워드 검출을 넘어 자살 행동을 예측함을 보인 연구. 자살 인지의 *내용* 자체가 언어에서 탐지 가능하다는 점에서 단순 ideation 키워드 외의 NLP feature 설계 근거.',
    'Found that suicide-specific beliefs (unbearability, unlovability) measured by the Suicide Cognitions Scale (SCS) predicted suicidal behavior beyond what ideation-only screens captured, in two US active-duty military samples. The cognitive content of suicidal beliefs — not just verbal ideation — is detectable in language, providing a hook for NLP feature design beyond simple ideation keywords.',
    'Engine 7 분류기: unbearability / unlovability 언어를 explicit ideation 키워드와 독립적인 RED-tier feature 로 가중. crisis-detection.sql 의 Korean 정책과 결합해 사용.'
  ),
  (
    'The Brief Suicide Cognitions Scale: Development and clinical application',
    ARRAY['M. David Rudd','Craig J. Bryan'],
    '10.3389/fpsyt.2021.737393',
    'https://doi.org/10.3389/fpsyt.2021.737393',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '9문항 단축형 Brief Suicide Cognitions Scale 개발 및 임상 적용 논문. 자살 시도와 사망을 예측. 운영 함의: 저널 entry 의 강한 unbearability("더 이상 못 견디겠다") 또는 unlovability("아무도 그리워하지 않을 것") 인지를 명시적 ideation 키워드와 독립적으로 RED-zone 분류에 가중해야 함.',
    'The 9-item Brief Suicide Cognitions Scale — public derivation, predicts attempts and deaths. Operational implication: a journal entry containing strong unbearability ("I can''t take this anymore") or unlovability ("nobody would miss me") cognitions should weight RED-zone classification independently of explicit ideation keywords.',
    'Engine 7: Brief-SCS 9개 인지 패턴을 한국어·영어 분류기의 RED-tier feature 템플릿으로 등록.'
  ),
  (
    'Does response on the PHQ-9 Depression Questionnaire predict subsequent suicide attempt or suicide death?',
    ARRAY['Gregory E. Simon','Carolyn M. Rutter','Do Peterson','Malia Oliver','Ursula Whiteside','Belinda Operskalski','Evette J. Ludman'],
    '10.1176/appi.ps.201200587',
    'https://doi.org/10.1176/appi.ps.201200587',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    'Group Health 대규모 전향적 코호트(N≈84,000). PHQ-9 9번 문항("죽는 게 낫다는 생각 또는 자해 생각") 응답 수준이 1년 후 자살 시도 및 사망을 예측. 단일 문항으로는 위양성률이 높음(특이도 ~66%). 단일 high-recall gate 로는 유용하지만 단독 RED 신호로는 불충분.',
    'Large prospective cohort (Group Health, N≈84,000). PHQ-9 item 9 ("thoughts that you would be better off dead, or of hurting yourself") response level predicted attempts and suicide deaths over 1 year. Strong predictor — but item-9 alone has high false-positive rate (specificity ~66%). Useful as a single high-recall gate, but cannot be the sole RED signal.',
    'Engine 7: PHQ-9-item-9 등가 문장을 YELLOW-tier gate 로 처리. 추가 feature 결합 시에만 RED 로 escalate.'
  ),
  (
    'The Columbia-suicide severity rating scale: Validity and psychometric properties of an online Spanish-language version in a Mexican population sample',
    ARRAY['Francisco Austria-Corrales','Evelyn Cabrera-Ruiz','Guillermo Salinas-Escudero','Diana Mendieta-Cabrera','Gerhard Heinze-Martin'],
    '10.3389/fpubh.2023.1157581',
    'https://doi.org/10.3389/fpubh.2023.1157581',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '멕시코 성인(N=3,645) 온라인 스페인어 C-SSRS 검증. Cronbach α=0.814; 단일 차원; 영어 원판의 3개 risk level(low/medium/high) 재현. C-SSRS 구조가 스페인어 자기보고로 이식 가능함을 입증 — 2nd-Brain 이 EN/KO 너머로 확장 시 스페인 로케일 라우팅에 직접 관련.',
    'N=3,645 Mexican adults. Cronbach''s α=0.814; unidimensional; three risk levels (low/medium/high) reproduced from the English original. Establishes that C-SSRS structure transfers to Spanish-language self-report online — direct relevance to 2nd-Brain Spanish-locale routing if expanded beyond EN/KO.',
    'Cross-cultural anchor: 스페인 로케일 지원 시 분류기 구조는 스페인어 C-SSRS 검증을 상속. v0.2 출시 시점에는 정보용.'
  ),
  (
    'Validation and application of the Chinese version of the Columbia-Suicide Severity Rating Scale: Suicidality and cognitive deficits in patients with major depressive disorder',
    ARRAY['Yangyang Ji'],
    '10.1016/j.jad.2023.09.014',
    'https://doi.org/10.1016/j.jad.2023.09.014',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '중국어 C-SSRS 를 주요우울장애 입원 환자에서 검증. 척도 구조의 cross-cultural 신뢰도가 가장 큰 비라틴 문자 인구권에서 확립됨 — 2nd-Brain 이 분류 로직을 상속하는 C-SSRS 프레임워크가 본질적으로 영어에 묶이지 않음을 증거.',
    'Chinese-version C-SSRS validated in MDD inpatients. Cross-cultural reliability of the scale''s structure is established for the largest non-Latin script population the scale serves. Provides evidence that the C-SSRS framework — and therefore the classification logic 2nd-Brain inherits from it — is not inherently English-bound.',
    'Cross-cultural anchor: 향후 zh-* 로케일 지원 시 분류기 카피는 이 evidence base 와 대조 검토.'
  ),
  (
    'Feasibility and validation of a computer-automated Columbia-Suicide Severity Rating Scale using interactive voice response technology',
    ARRAY['James C. Mundt','John H. Greist','Alan J. Gelenberg','David J. Katzelnick','James W. Jefferson','Jack G. Modell'],
    '10.1016/j.jpsychires.2010.04.025',
    'https://doi.org/10.1016/j.jpsychires.2010.04.025',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    'C-SSRS 의 자동화 시행(IVR)이 임상가 시행과 비교 가능한 결과를 산출함을 보인 초기 증거. 후속 검증에서 광범위하게 인용됨. 기계 매개 스크리닝 + 인간 라우팅 원칙의 방법론적 정당성. 자동화 *치료* 는 정당화하지 않음.',
    'Early evidence (cited widely in subsequent validations) that automated administration of C-SSRS produces results comparable to clinician-administered — supports the principle that machine-mediated screening, followed by human routing, is methodologically defensible. Does not authorise machine-mediated treatment.',
    'Engine 7 설계 원칙의 근거: 분류기는 탐지, 인간 서비스가 라우트. 자동화된 위기 *개입* 금지.'
  ),
  (
    '988 Suicide & Crisis Lifeline — National launch July 16, 2022',
    ARRAY['SAMHSA'],
    NULL,
    'https://www.samhsa.gov/mental-health/988',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '2022-07-16, 미국의 10자리 1-800-273-8255 Lifeline 이 3자리 988로 전환. 기존 번호도 동일 서비스로 라우팅 유지. SAMHSA 가 협력 협약을 통해 운영, 약 200개 지역 위기 센터가 통화/문자/채팅 운영. 미국 로케일 2nd-Brain 사용자의 primary 라우팅 대상. National Suicide Hotline Designation Act(Public Law 116-172, 2020)에 의한 번호 portability 의무.',
    'On 2022-07-16, the 10-digit 1-800-273-8255 Lifeline transitioned to the 3-digit 988. The original number remains routed to the same service. SAMHSA administers via cooperative agreement; ~200 local crisis centers operate the call/text/chat. For US-locale 2nd-Brain users, this is the primary routing target. FCC implemented number-portability requirements via the National Suicide Hotline Designation Act (Public Law 116-172, 2020).',
    'en-US 로케일 RED-zone 라우팅 primary: 988(통화/문자/채팅). 고정 문자열로 미리 검토된 카피만 출력. 정책 출처는 SAMHSA, 서비스 출처는 988lifeline.org.'
  ),
  (
    'Decision 2007/116/EC on reserving the national numbering range beginning with 116 for harmonised numbers for harmonised services of social value',
    ARRAY['European Commission'],
    NULL,
    'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32007D0116',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '유럽 위원회 결정(CELEX: 32007D0116) — 116-xxx 번호 범위를 모든 회원국에서 사회적 가치의 조화된 서비스용으로 법적 예약. 초기 할당: 116000(실종 아동), 116111(아동 헬프라인), 116123(정서 지원 헬프라인). 회원국은 2007-08-31 부터 번호 배정 가능. EU 로케일 라우팅의 법적 기반: 116-123 은 EU 27개국 전역에서 국가별 정서-지원 서비스로 라우팅이 법적으로 보장되는 유일한 번호.',
    'The Commission Decision (CELEX: 32007D0116) that legally reserved 116-xxx as harmonised numbers across all EU Member States. Initial allocations: 116000 (missing children), 116111 (child helplines), 116123 (emotional support helplines). Member States were required to enable assignment from 2007-08-31. The only number guaranteed to route locally to a national emotional-support service across all 27 Member States — which is why it is the EU-default in the 2nd-Brain routing tree.',
    'EU 로케일 라우팅 fallback: 116-123. 다만 회원국별 구현이 고르지 않으므로 국가별 라인(DE 0800-111-0-111, FR 09-72-39-40-50 등)을 동시 제시.'
  ),
  (
    'Online Safety Act 2023',
    ARRAY['UK Government'],
    NULL,
    'https://www.legislation.gov.uk/ukpga/2023/50/contents',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '영국 공공법 2023 c. 50. user-to-user(U2U) 및 검색 서비스에 대해 불법·유해 콘텐츠에 관한 법정 의무를 부과. 2nd-Brain 관련 조항: §§9–11 아동 접근 가능 서비스(2nd-Brain 은 18+ 이라 직접 적용 안 됨), §184/Schedule 7 우선 범죄(자살 권유·조력은 우선 범죄). 2025-12 개정으로 *심각한 자해 권유·조력* 및 cyberflashing 이 우선 범죄로 추가. 함의: 영국 사용자에게 보이는 모든 UI 문자열은 자살·심각한 자해 권유·조력으로 해석될 여지 없어야 함. 고정 문자열 RED-zone 카피가 안전한 경로; LLM 생성 방법 추론은 금지.',
    'UK Public General Acts c. 50. Sets statutory duties on user-to-user (U2U) and search services regarding illegal and harmful content. Relevant for 2nd-Brain: §§9–11 (children''s services — N/A because 2nd-Brain is 18+); §184 / Schedule 7 priority offences — encouraging or assisting suicide is a Priority Offence; subsequently (December 2025) encouraging serious self-harm and cyberflashing added. Implication: any UI string visible to UK users that could be construed as encouraging or assisting suicide or serious self-harm is a regulated category. Fixed-string RED-zone copy is the safe path; LLM-generated reasoning about methods is not.',
    'UK 로케일 카피 검토: 모든 RED-zone 문자열은 사전 native-speaker 검토 + 자살·자해 권유로 해석될 여지 없는지 확인. LLM 런타임 위기 카피 생성 절대 금지.'
  ),
  (
    'Protecting people from illegal harms online — Statement and Codes of Practice',
    ARRAY['Ofcom'],
    NULL,
    'https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-protecting-people-from-illegal-harms-online',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '2024-12-16 발행 First-edition 코드. 규제 대상 서비스는 2025-03-16 까지 불법 콘텐츠 위험 평가 완료, 의무는 2025-03-17 부터 시행. Ofcom 기대치: 불법 자살 콘텐츠 탐지를 위한 능동적 기술, 추천 시스템에서 우선 불법 콘텐츠 배제, 라이브스트림 임박 위해 실시간 신고. 2nd-Brain 함의: 사적 저널만 있는 v0.2 출시 시점에는 주 의무가 *2nd-Brain 자체가 권유/조력 콘텐츠를 생성·노출하지 않는 것* — safety classifier 단락(short-circuit)으로 커버됨. 영국에서 커뮤니티/공유 기능 추가 시 의무 급격히 확대.',
    'First-edition codes published 2024-12-16; regulated services had until 2025-03-16 to complete illegal-content risk assessments; duties enforceable from 2025-03-17. Ofcom''s expectations include proactive detection technology, recommender-system design to exclude priority-illegal content, and real-time reporting of livestream imminent-harm. For 2nd-Brain v0.2 (private journals only), the main obligation is that 2nd-Brain itself must not generate or surface encouragement/assistance content — covered by the safety-classifier short-circuit. Obligations escalate sharply if UK community/shared features are added.',
    'v0.2 영국 출시: 사적 저널 only 라면 safety classifier 단락이 충분. 향후 social feature 추가 전 법률 검토 필수.'
  ),
  (
    'Impact of the Japanese Government''s General Principles of Suicide Prevention Policy on youth suicide from 2007 to 2022',
    ARRAY['So Jung Kim','Hirokazu Tachikawa'],
    '10.1192/bjo.2023.616',
    'https://doi.org/10.1192/bjo.2023.616',
    'crisis_detection_global',
    'lifespan',
    'en',
    now(),
    '일본 자살예방 종합대강 정책(자살대책기본법 2006 + 2017·2022 개정 종합대강) 의 장기 평가. 정책 운영 기간(2006–2022) 동안 일본 자살률은 ~35% 감소; 그러나 *청소년 자살률은 같은 기간 상승* — 정책만으로는 18세 미만을 보호하지 못한다는 냉정한 반-증거. 2nd-Brain 함의: C10 (18+) 정책과 정합; 향후 청소년 제품 확장 시 경고 근거.',
    'Long-run policy evaluation: significant declines in adult suicide rates over Japan''s General Principles of Suicide Prevention Policy period (2006–2022, ~35% decline); but youth suicide rates rose during the same window — sobering counter-evidence that policy alone does not protect under-18s. For 2nd-Brain: aligns with the 18+ floor (C10) and informs cautions around any future youth-product expansion.',
    'C10 18+ 정책의 경험적 정당화. 향후 under-18 로드맵에 대한 cautionary evidence.'
  ),
  (
    'Evaluation of alignment between large language models and expert clinicians in suicide risk assessment',
    ARRAY['Ryan K. McBain','Jonathan H. Cantor','Li Ang Zhang','Olesya Baker','Fang Zhang','Aaron Burnett','Aaron Kofner','Joshua Breslau','Bradley D. Stein','Ateev Mehrotra','Hao Yu'],
    '10.1176/appi.ps.20250086',
    'https://doi.org/10.1176/appi.ps.20250086',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    'ChatGPT·Claude·Gemini 의 자살 관련 질의 응답을 임상 전문가와 비교 평가. 고위험 질의에 대해 LLM 들은 직접 응답을 거부하고 referral 을 함; 그러나 referral 품질은 모델별로 극심한 편차. 결정적 한계: 평가가 *영어 전용* — referral-decline 행동이 비영어 프롬프트로 일반화된다고 가정할 수 없음.',
    'Tests ChatGPT, Claude, and Gemini on suicide-related queries vs expert clinicians. LLMs decline direct response to high-risk queries; quality of referrals varies dramatically. Critical caveat: all findings were tested in English; cannot assume the referral-decline behavior generalises to non-English prompts.',
    'Engine 7: 보수적 임계값. Gemini 가 자율적으로 RED-zone 라우팅을 처리한다고 가정 금지 — 특히 비영어 로케일에서.'
  ),
  (
    'Applications of large language models in the field of suicide prevention: Scoping review',
    ARRAY['Glenn Holmes','Biya Tang','Sunil Gupta','Svetha Venkatesh','Helen Christensen','Alexis Whitton'],
    '10.2196/63126',
    'https://doi.org/10.2196/63126',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    'LLM × 자살예방 응용의 범위 검토. 단 33% 의 연구만이 윤리 고려를 보고했으며 다국어 적용 평가가 희소함을 확인. 영어 외 로케일에 대한 LLM 안전성 일반화의 evidence gap 명시.',
    'Scoping review confirms only 33% of LLM-in-suicide-prevention studies report ethical considerations and multilingual coverage is sparse. Documents the evidence gap for non-English locale safety generalization.',
    'Cross-locale evidence gap: 영어로 검증된 LLM 안전성 결과를 비영어 로케일로 외삽 금지. 로케일별 검증 필요.'
  ),
  (
    'Development and evaluation of LLM-based suicide intervention chatbot',
    ARRAY['Xinyi Cui','Yuyang Gu','Hong Fang','Tingshao Zhu'],
    '10.3389/fpsyt.2025.1634714',
    'https://doi.org/10.3389/fpsyt.2025.1634714',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    'GPT-4 기반 중국어 자살 개입 챗봇("心灵守护者", 마음 수호자) 개발 및 평가. 저자들은 GPT-4 가 중국어의 깊은 함의·문화적 맥락 포착에 약점이 있음을 인정하고 향후 중국어 프롬프트 설계 최적화 필요성을 명시. 직접 시사: 범용 LLM(2nd-Brain Gemini wrapper 포함)은 비영어 임상-문화 맥락에서 underperform 함. 비영어 로케일의 분류기 안전 임계값은 더 *보수적* 이어야 함.',
    'Chinese-language suicide-intervention chatbot built on GPT-4 ("Guardian of the Heart"). Authors note GPT-4 "sometimes struggles to capture deep connotations and cultural contexts" in Chinese, and future work needs "optimisation of Chinese-language prompt design." Direct relevance: general-purpose LLMs (which is what 2nd-Brain''s Gemini wrapper is) underperform in non-English clinical-cultural contexts. The classifier''s safety threshold for non-English locales should be more conservative, not less.',
    'Engine 7: ja-JP, ko-KR, zh-* 로케일의 RED-activation 임계값을 en-* baseline 대비 lower(더 민감). 예: 기본 p_red ≥ 0.30 일 때 비영어 0.25.'
  ),
  (
    'From treatment to healing: Envisioning a decolonial digital mental health',
    ARRAY['Sachin R. Pendse','Daniel Nkemelu','Nicola J. Bidwell','Sushrut Jadhav','Soumitra Pathare','Munmun De Choudhury','Neha Kumar'],
    '10.1145/3491102.3501982',
    'https://doi.org/10.1145/3491102.3501982',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    'CHI 2022 개념 논문. 디지털 정신건강 기술이 "역사적 부정의를 증폭시키고 소수화된 정신적 고통의 경험을 지워버린다"고 비판. 2nd-Brain 글로벌 라우팅 함의: 서구 기준 위기 카피를 비서구 로케일에 그대로 매핑하는 것 자체가 *해악 패턴*. Suicide CARE 2.0 정렬 한국 RED-zone 카피는 KO 의 gold standard; 영어 카피를 JP/CA-FR/EU 로 이식하는 것은 failure mode.',
    'Conceptual but critical: digital mental health technologies "amplify historical injustices and erase minoritised experiences of mental distress." For 2nd-Brain global routing: western-normative crisis copy mapped to non-western locales is itself a harm pattern. Korean RED-zone copy (Suicide CARE 2.0-aligned) is the gold standard for KO; English copy ported to JP/CA-FR/EU is a failure mode.',
    'Hard rule: 로케일별 RED-zone 카피는 필수, 옵션 아님. 렌더 실패 시에만 English fallback (P1 telemetry 이벤트).'
  ),
  (
    'The cultural theory and model of suicide',
    ARRAY['Joyce P. Chu','Peter Goldblum','Rebecca Floyd','Bruce Bongar'],
    '10.1016/j.appsy.2011.11.001',
    'https://doi.org/10.1016/j.appsy.2011.11.001',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '문화적 자살 이론(Cultural Theory of Suicide, CTS): 문화적 제재, 고통의 관용구(idioms of distress), 소수자 스트레스, 사회적 불화가 자살 경험이 *어떻게 표현되는가* — 단지 발생 여부가 아니라 — 를 형성. 키워드 기반 분류기가 문화권을 가로질러 underperform 하는 이유의 이론적 기반.',
    'Cultural Theory of Suicide (CTS): cultural sanctions, idioms of distress, minority stress, and social discord shape *how* suicidal experience is expressed, not just whether it occurs. Foundational for understanding why a literal-keyword classifier underperforms across cultures.',
    'Engine 7 설계 근거 문서: CTS 를 locale-conditioned feature weighting 의 이론적 기반으로 인용.'
  ),
  (
    'A mediation model of professional psychological help seeking for suicide ideation among Asian American and white American college students',
    ARRAY['Y. Joel Wong','Chris Brownson','Leslie Rutkowski','Catherine P. Nguyen','Martin S. Becker'],
    '10.1080/13811118.2013.826153',
    'https://doi.org/10.1080/13811118.2013.826153',
    'crisis_detection_global',
    'young_adult',
    'en',
    now(),
    'Asian American 대학생 표본에서 자살 사고가 있어도 백인 동료보다 전문가에게 *덜* 노출한다는 경험적 매개 모형 — 낙인 및 체면 손상 우려가 매개. 2nd-Brain 일본/한국/중국어권 로케일 함의: 분류기는 미국 검증 NLP 작업이 가정하는 explicit verbal disclosure 비율에 의존할 수 없음. 동아시아 로케일에서는 *간접 마커* (부담 언어, 위축, 마무리·작별 어조) 에 가중치 추가.',
    'Empirical: Asian American students with suicidal ideation are less likely to disclose to professionals than white American peers, mediated by stigma and loss-of-face concerns. For 2nd-Brain Japan/Korea/Chinese-speaking locales: the classifier cannot rely on explicit verbal disclosure of suicidality at the same rate as US-validated NLP work assumes. Add weight to indirect markers (burden language, withdrawal, finality + farewell tones) for East Asian locales.',
    'Engine 7: ja-JP, ko-KR, zh-* 로케일에서 burden/withdrawal/finality 간접 마커 가중치 강화. 명시적 ideation 키워드에만 의존 금지.'
  ),
  (
    'Racial differences in self-disclosure of suicidal ideation and reasons for living: Implications for training',
    ARRAY['Laura L. Morrison','David L. Downey'],
    '10.1037/1099-9809.6.4.374',
    'https://doi.org/10.1037/1099-9809.6.4.374',
    'crisis_detection_global',
    'adult',
    'en',
    now(),
    '오래되었지만 여전히 인용되는 임상 연구: 미국 인종 소수자 인구가 임상 스크리닝에서 자살 사고 자기개방을 위험 대비 *under-disclose*. 모든 로케일에 걸친 분류기의 보수적 임계값 원칙에 추가 근거.',
    'Older but still-cited: ethnic-minority US populations under-disclose ideation in clinical screening relative to risk. Supports the conservative-threshold principle for the safety classifier across locales.',
    'Engine 7: 비-주류 로케일에서 RED activation 임계값을 낮추는 결정의 문서화된 근거.'
  );
