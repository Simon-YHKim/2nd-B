-- Crisis Detection & Routing (Engine 7 — Safety Classifier)
-- Batch source: docs/research/batches/crisis-detection.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- Framework slug: 'crisis_detection' — distinct from 'self_knowledge'
-- because the safety system has a separate evidence base and policy layer.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'The Columbia-Suicide Severity Rating Scale: Initial validity and internal consistency findings from three multisite studies with adolescents and adults',
    ARRAY['Kelly Posner','Gregory K. Brown','Barbara Stanley','David A. Brent','Kseniya V. Yershova','Maria A. Oquendo','Glenn W. Currier','Glenn A. Melvin','Laurence Greenhill','Sa Shen','J. John Mann'],
    '10.1176/appi.ajp.2011.10111704',
    'https://doi.org/10.1176/appi.ajp.2011.10111704',
    'crisis_detection',
    'lifespan',
    'en',
    now(),
    'Columbia 자살 심각도 평가 척도(C-SSRS) 초기 검증 논문. 청소년·성인 3개 다기관 연구에서 신뢰도·타당도 입증. 전 세계 자살 위험 평가의 표준 도구. 6-질문 스크리너 + 심각도 레벨. 공용 도메인.',
    'Initial validation of the Columbia-Suicide Severity Rating Scale (C-SSRS) across 3 multisite studies with adolescents and adults. The global standard suicide risk assessment tool. 6-question screener + severity levels. Public domain.',
    'Engine 7(Safety Classifier)의 RED-zone trigger 로직 골격. C-SSRS 6단계를 LLM 분류 prompt의 reference rubric으로 사용. 공용 도메인이라 직접 모델링 가능.'
  ),
  (
    'The Language of Social Support in Social Media and Its Effect on Suicidal Ideation Risk',
    ARRAY['Munmun De Choudhury','Emre Kiciman'],
    '10.1609/icwsm.v11i1.14891',
    'https://doi.org/10.1609/icwsm.v11i1.14891',
    'crisis_detection',
    'adult',
    'en',
    now(),
    'ICWSM-17 Best Paper Award. Reddit 정신건강 커뮤니티의 댓글 언어 특징이 향후 자살 사고 발화를 어떻게 예측·영향하는지 분석. 텍스트 신호로 위험 변화가 감지 가능함을 보임 — 단 관찰 연구로 개입 효과는 아님.',
    'ICWSM-17 Best Paper. Analyzes how linguistic features in Reddit mental-health community comments influence subsequent suicidal-ideation discourse risk. Demonstrates that text-based signals of risk shift are detectable — but the work is observational, not interventional.',
    'NLP 기반 위험 신호 감지의 학술적 정당성. Engine 7의 텍스트 특징 추출 로직 근거. 단 ''감지 가능'' ≠ ''개입 정당''의 구분 유지.'
  ),
  (
    'Natural language processing of social media as screening for suicide risk',
    ARRAY['Glen Coppersmith','Ryan Leary','Patrick Crutchley','Alex Fine'],
    '10.1177/1178222618792860',
    'https://doi.org/10.1177/1178222618792860',
    'crisis_detection',
    'adult',
    'en',
    now(),
    '소셜미디어 텍스트에 딥러닝 NLP를 적용해 자살 시도 신호를 정량적으로 탐지한 핵심 논문. 자동 스크리닝의 실현가능성 입증. 임상 진단이 아님 — false positive/negative 비대칭 비용 명시.',
    'Deep-learning NLP applied to social media to detect quantifiable suicide-attempt signals. Establishes feasibility of automated screening. Explicitly not clinical diagnosis — asymmetric costs of false positives vs false negatives.',
    'Engine 7의 자동 스크리닝 학술 근거. 단 ''스크리닝 = 진단 아님''을 사용자 face 메시지에 반영. False negative는 catastrophic, false positive는 cheap — 보수적 threshold.'
  ),
  (
    'Evaluation of alignment between large language models and expert clinicians in suicide risk assessment',
    ARRAY['Ryan K. McBain','Jonathan H. Cantor','Li Ang Zhang','Olesya Baker','Fang Zhang','Alyssa Burnett','Aaron Kofner','Joshua Breslau','Bradley D. Stein','Ateev Mehrotra','Hao Yu'],
    '10.1176/appi.ps.20250086',
    'https://doi.org/10.1176/appi.ps.20250086',
    'crisis_detection',
    'adult',
    'en',
    now(),
    'ChatGPT·Claude·Gemini 3개 LLM의 자살 위험 평가 능력을 전문 임상의와 비교한 2025년 연구. LLM은 고위험 질의에 직접 응답을 거부하고 hotline·전문가에게 referral하는 경향 — 단 referral 메시지의 품질·일관성이 모델 간 크게 다름.',
    'Tests ChatGPT, Claude, and Gemini against expert clinicians on suicide risk queries (2025). LLMs frequently decline direct responses to high-risk queries and refer to hotlines/professionals — but the quality and consistency of those referrals varies dramatically across models.',
    'Engine 7의 RED-zone 응답을 LLM 자체 생성에 맡기지 말 것. McBain 발견: referral 메시지를 모델에 의존하면 비일관적. 고정 문자열 + 검증된 hotline 정보 직접 주입.'
  ),
  (
    'Applications of large language models in the field of suicide prevention: Scoping review',
    ARRAY['Glenn Holmes','Biya Tang','Sunil Gupta','Svetha Venkatesh','Helen Christensen','Alexis Whitton'],
    '10.2196/63126',
    'https://doi.org/10.2196/63126',
    'crisis_detection',
    'adult',
    'en',
    now(),
    'LLM의 자살 예방 응용 분야 scoping review(2025). 60% 연구가 위험 감지 임상 적용에 집중, 단 33%만 윤리 고려사항 보고. 방법론적으로 분야가 미성숙 — 강한 스크리닝 능력 vs 약한 안전 가드레일 및 prospective 검증 부족.',
    'Scoping review of LLM applications in suicide prevention (2025). 60% of studies focus on clinical risk detection; only 33% report ethical considerations. Methodologically immature field — strong screening capability paired with weak safety guardrails and limited prospective validation.',
    'Engine 7 배포 전 윤리 체크리스트 필수. consent, 로깅 minimization, 사용자 피드백 메커니즘, 정기 인간 리뷰 — Holmes 가 식별한 분야 공백을 product에서 닫음.'
  ),
  (
    'Contents of the Standardized Suicide Prevention Program for Gatekeeper Intervention in Korea, Version 2.0',
    ARRAY['Kyoung-Sae Na','Seon-Cheol Park','Sun-Jung Kwon','Minjae Kim','Hyoung-Jun Kim','Myungjae Baik','Jinmi Seol','Eun Ji An','Sang Min Lee','Eun-Jin Lee','Meerae Lim','Sung Joon Cho','Gwang Hun Kim','Nari Kim','Hong Jin Jeon','Jong-Woo Paik','Kang Seob Oh','Hwa-Young Lee'],
    '10.30773/pi.2020.0271',
    'https://doi.org/10.30773/pi.2020.0271',
    'crisis_detection',
    'lifespan',
    'ko',
    now(),
    '''Suicide CARE 2.0'' — 한국 표준 자살 예방 게이트키퍼 프로그램. 3단계 구조: 주의 깊은 관찰(Careful) → 적극적 경청(Active listening) → 전문가 의뢰(REferral). 한국 사용자 RED/YELLOW zone 응답 설계의 직접 모델.',
    'Suicide CARE 2.0 — Korea''s national standard gatekeeper program. Three-step structure: Careful observation → Active listening → Expert REferral. Direct model for Korean user RED/YELLOW zone response design.',
    '한국 사용자 RED-zone 고정 응답 문구를 Suicide CARE wording principles에 맞춰 작성. 직설적 위로보다 ''머무르지 말고 전문가에게 연결'' 톤.'
  ),
  (
    'National Policy, Service Delivery, Programs, and Data for Suicide Prevention in Korea',
    ARRAY['Deuk-Kweon You','Jin-Hwa Choi','Tae-Yeon Hwang'],
    '10.30773/pi.2024.0371',
    'https://doi.org/10.30773/pi.2024.0371',
    'crisis_detection',
    'lifespan',
    'ko',
    now(),
    '한국 제5차 자살예방기본계획(2023–2027) 및 인프라(한국생명존중희망재단, 1393, 1577-0199) 리뷰 논문(2025). 한국이 OECD 노인 자살률 최고 등 인구학적 위험 패턴 정리. 2nd-Brain이 위임할 인프라 학술 근거.',
    'Reviews Korea''s 5th National Suicide Prevention Master Plan (2023–2027) and the institutional infrastructure (한국생명존중희망재단, 1393 hotline, 1577-0199 mental health crisis line). Documents Korea''s OECD-highest elderly suicide rate and demographic risk patterns. The authoritative reference for the infrastructure 2nd-Brain hands off to.',
    '1393·1577-0199 및 한국생명존중희망재단 routing의 학술 근거. 한국 노년 사용자 가중치 ↑.'
  );
