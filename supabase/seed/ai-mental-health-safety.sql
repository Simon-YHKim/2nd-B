-- AI / LLM Mental Health Safety & Effectiveness
-- Batch source: docs/research/batches/ai-mental-health-safety.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- Framework slug: 'ai_mental_health' — addresses 2nd-Brain as an
-- AI-mediated wellness product (not therapy).

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Delivering cognitive behavior therapy to young adults with symptoms of depression and anxiety using a fully automated conversational agent (Woebot): A randomized controlled trial',
    ARRAY['Kathleen Kara Fitzpatrick','Alison Darcy','Molly Vierhile'],
    '10.2196/mental.7785',
    'https://doi.org/10.2196/mental.7785',
    'ai_mental_health',
    'young_adult',
    'en',
    now(),
    '자동 CBT 챗봇(Woebot)의 첫 주요 RCT(N=70 대학생, 2주 개입). Woebot 집단이 통제군 대비 PHQ-9 우울 점수 유의한 감소. AI 텍스트 기반 CBT 원리 전달이 측정 가능한 변화를 만들 수 있음을 입증한 foundational 증거.',
    'First major RCT of an automated CBT chatbot (Woebot, N=70 university students, 2-week intervention). Woebot group showed significant PHQ-9 depression reduction vs control. Foundational evidence that text-based AI delivering CBT principles can produce measurable change.',
    '2nd-Brain Advisor의 CBT-style 응답이 효과적일 수 있다는 학술 근거. 단 Woebot은 specifically CBT 콘텐츠로 설계됨 — 일반 Gemini 호출이 동등하지 않음.'
  ),
  (
    'An empathy-driven, conversational artificial intelligence agent (Wysa) for digital mental well-being: Real-world data evaluation mixed-methods study',
    ARRAY['Becky Inkster','Shubhankar Sarda','Vinod Subramanian'],
    '10.2196/12106',
    'https://doi.org/10.2196/12106',
    'ai_mental_health',
    'adult',
    'en',
    now(),
    'Wysa 챗봇의 실세계 사용 데이터 분석(통제 시험 아님). 고-사용 사용자가 저-사용 사용자보다 PHQ-9 개선 큼. 혼합 방법(정량+정성) — 사용자가 무엇을 실제로 도움된다고 보고하는지. 효능은 ''첫 세션''이 아닌 ''지속 engagement''에 의존.',
    'Real-world deployment data of Wysa (not controlled trial). High-usage users showed greater PHQ-9 improvement than low-usage. Mixed methods (quant + qualitative) reveal what users actually report finding helpful. Effect depends on sustained engagement, not first-session experience.',
    '2nd-Brain 위젯·알람 설계: 강제 일일 사용 push가 아닌 self-determined cadence가 효과 ↑. Inkster real-world 패턴 반영.'
  ),
  (
    'Large language models could change the future of behavioral healthcare: A proposal for responsible development and evaluation',
    ARRAY['Elizabeth C. Stade','Shannon Wiltsey Stirman','Lyle H. Ungar','Cody L. Boland','H. Andrew Schwartz','David B. Yaden','João Sedoc','Robert J. DeRubeis','Robb Willer','Johannes C. Eichstaedt'],
    '10.1038/s44184-024-00056-z',
    'https://doi.org/10.1038/s44184-024-00056-z',
    'ai_mental_health',
    'lifespan',
    'en',
    now(),
    'LLM의 정신건강 책임감 있는 배치를 위한 결정적 framework(2024). 위험 카테고리: 잘못된 정보·의존성·프라이버시·환각·놓친 위기·범위 확장·악화·형평성. 권고: 임상 과학 중심, 학제간 협력, 투명성, 편향 감사, 위험 감지 파이프라인.',
    'The definitive responsible-deployment framework for LLMs in mental health (2024). Risk categories: misinformation, dependency, privacy, fabrication, missed crisis, scope creep, exacerbation, equity. Recommendations: clinical-science centering, interdisciplinary teams, transparency, bias auditing, risk-detection pipelines.',
    '2nd-Brain의 8개 안전 dimension(Engine 7 safety + Engine 6 curator + audit log + RLS 등)이 Stade framework의 8개 위험에 1:1 대응하도록 설계. 이 논문이 product safety review의 체크리스트.'
  ),
  (
    'Randomized trial of a generative AI chatbot for mental health treatment',
    ARRAY['Michael V. Heinz','Daniel M. Mackin','Brianna M. Trudeau','Sukanya Bhattacharya','Yinzhou Wang','Haley A. Banta','Nicholas C. Jacobson'],
    '10.1056/AIoa2400802',
    'https://doi.org/10.1056/AIoa2400802',
    'ai_mental_health',
    'adult',
    'en',
    now(),
    '생성형 AI(Therabot, third-wave CBT 기반 치료자-환자 대화로 학습) 첫 임상 수준 RCT(N=210). MDD·GAD·식이장애 위험군에서 유의한 증상 개선. NEJM AI 2025. 단 Therabot은 specifically 치료 대화로 학습 — 일반 LLM 호출과 동등 아님.',
    'First RCT of a generative-AI mental health chatbot at clinical severity (N=210, Therabot, trained on therapist-patient dialogues grounded in third-wave CBT). Significant symptom improvement for MDD, GAD, and high-risk feeding/eating disorders. NEJM AI 2025. Therabot was specifically trained on clinical dialogue — not equivalent to general LLM calls.',
    '2nd-Brain은 Therabot이 아님 — 다른 scope, 다른 evidence base. Advisor는 ''structured reflection prompter''이지 ''치료자 surrogate''가 아님. 영업 메시지에 ''치료 효과 입증'' 같은 주장 금지.'
  ),
  (
    'Development and evaluation of a mental health chatbot using ChatGPT 4.0: Mixed methods user experience study with Korean users',
    ARRAY['Boyoung Kang','Munpyo Hong'],
    '10.2196/63538',
    'https://doi.org/10.2196/63538',
    'ai_mental_health',
    'young_adult',
    'ko',
    now(),
    '한국 청년(N=20, 18-27세)에게 ChatGPT 4.0 기반 정신건강 챗봇 사용 경험을 혼합 방법으로 평가한 2025 연구. 문화적 적합성, 인지된 유용성, 마찰점 분석. 한국 LLM 정신웰빙 도구 설계 공간 존재 입증 — 단 작은 N, 임상 outcomes 없음.',
    'Korean young adults (N=20, ages 18-27) using a ChatGPT 4.0-based mental health chatbot. Mixed-methods evaluation of cultural appropriateness, perceived helpfulness, friction points. Demonstrates the design space for Korean LLM mental wellbeing tools exists — but evidence is much thinner than Western (small N, no clinical-symptom outcomes).',
    '한국 사용자 친화성 설계의 1차 reference. 단 evidence 기반 약함 — 2nd-Brain은 자체 사용자 피드백 수집·반영이 학술 evidence를 보완해야 함.'
  );
