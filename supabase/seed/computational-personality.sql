-- Computational Personality Inference (Engine 2 reliability)
-- Batch source: docs/research/batches/computational-personality.md
-- DOIs verified against Crossref / publisher record, May 2026.
-- Framework slug: 'computational_personality' — separate from 'big_five'
-- because this concerns the METHODOLOGY of extracting Big Five from
-- text, not the trait construct itself.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Psychological aspects of natural language use: Our words, our selves',
    ARRAY['James W. Pennebaker','Matthias R. Mehl','Kate G. Niederhoffer'],
    '10.1146/annurev.psych.54.101601.145041',
    'https://doi.org/10.1146/annurev.psych.54.101601.145041',
    'computational_personality',
    'adult',
    'en',
    now(),
    '자연 언어 사용의 심리학적 측면을 정리한 Annual Review 종합. 기능어(대명사·관사·전치사)가 심리 상태를 대규모로 드러냄을 입증. LIWC 사전의 학술 계보 — 현행 LLM 기반 추출의 역사적 뿌리.',
    'Annual Review synthesis of psychological aspects of language use. Establishes that function words (pronouns, articles, prepositions) reveal psychological state at scale. The LIWC dictionary lineage that grounds modern LLM-based trait extraction.',
    'Engine 2의 텍스트 특징 추출 학술 계보. 단 LIWC는 영어 기반 — 한국어 적용은 검증 필요.'
  ),
  (
    'Private traits and attributes are predictable from digital records of human behavior',
    ARRAY['Michal Kosinski','David Stillwell','Thore Graepel'],
    '10.1073/pnas.1218772110',
    'https://doi.org/10.1073/pnas.1218772110',
    'computational_personality',
    'adult',
    'en',
    now(),
    'Facebook Likes 데이터로 Big Five, 인구학, 정치 성향, 성적 지향까지 예측 가능함을 보인 PNAS 논문(N=58,000). 디지털 흔적의 예측 ceiling과 동시에 프라이버시·동의 함의 — 이런 예측은 개인 식별적.',
    'PNAS landmark (N=58,000) showing Facebook Likes predict Big Five, demographics, political views, and sexual orientation with surprising accuracy. Demonstrates predictive ceiling AND privacy/consent stakes — these inferences are personally identifying.',
    'Engine 2는 traits만 추론, 보호 카테고리(성적 지향·정치·민족)는 통계적으로 가능해도 절대 surface하지 않음. Kosinski 발견의 윤리적 함의.'
  ),
  (
    'Personality, gender, and age in the language of social media: The open-vocabulary approach',
    ARRAY['H. Andrew Schwartz','Johannes C. Eichstaedt','Margaret L. Kern','Lukasz Dziurzynski','Stephanie M. Ramones','Megha Agrawal','Achal Shah','Michal Kosinski','David Stillwell','Martin E. P. Seligman','Lyle H. Ungar'],
    '10.1371/journal.pone.0073791',
    'https://doi.org/10.1371/journal.pone.0073791',
    'computational_personality',
    'adult',
    'en',
    now(),
    'Facebook 75,000명 7억 단어 분석으로 open-vocabulary 토픽 모델링이 LIWC 사전 접근보다 Big Five 예측에서 우수함을 입증. 현행 LLM 기반 trait 추출의 아키텍처 템플릿.',
    '700 million words from 75,000 Facebook users. Data-driven open-vocabulary topic discovery outperforms dictionary-based (LIWC) for Big Five prediction. The architectural template for modern LLM-based trait extraction.',
    'Engine 2 설계: 고정 사전이 아닌 LLM 임베딩 기반 open-vocabulary 접근을 사용하는 정당성.'
  ),
  (
    'Automatic personality assessment through social media language',
    ARRAY['Gregory Park','H. Andrew Schwartz','Johannes C. Eichstaedt','Margaret L. Kern','Michal Kosinski','David J. Stillwell','Lyle H. Ungar','Martin E. P. Seligman'],
    '10.1037/pspp0000020',
    'https://doi.org/10.1037/pspp0000020',
    'computational_personality',
    'adult',
    'en',
    now(),
    'Facebook 66,732명 데이터로 언어→Big Five 자동 평가 모델 학습. 자기보고와 상관 r≈0.35~0.42 (성실성 최고, 신경성 최저). LLM 기반 trait 추출 정확도의 ''현실적 ceiling'' 표준 reference. 단 ''사용자당 수백~수천 단어'' 필요.',
    'N=66,732 Facebook users. Trained language→Big Five model with correlations r≈0.35-0.42 with self-report (Conscientiousness highest at r=0.42; Neuroticism lowest at r=0.35). The most-cited reference for realistic LLM trait extraction accuracy. Requires substantial text per user.',
    'Engine 2 정확도 framing의 학술 anchor: r≈0.4는 분산의 16% 설명. 단일 entry 추론은 unreliable; trait inference는 30+ entries 누적 후. ''about you'' 진단이 아닌 ''pattern noticed'' 톤.'
  ),
  (
    'Do large language models really understand personality?',
    ARRAY['Julina Maharjan','Ruoming Jin','Jianfeng Zhu','Deric Kenne'],
    '10.2196/75347',
    'https://doi.org/10.2196/75347',
    'computational_personality',
    'adult',
    'en',
    now(),
    'LLM(OpenAI 임베딩, BERT, RoBERTa)의 성격 trait 예측 능력을 PANDORA Reddit 데이터로 벤치마크한 2025 연구. LLM 임베딩이 전통적 feature engineering과 동등하거나 약간 우수. 모델 크기보다 task-specific 평가가 더 중요.',
    '2025 benchmark of LLM personality prediction (OpenAI embeddings, BERT, RoBERTa) on PANDORA Reddit data. LLM embeddings match or modestly exceed traditional feature engineering. Task-specific evaluation matters more than model scale.',
    'Engine 2가 Gemini 임베딩으로 trait 추출을 수행하는 학술 근거 — 단 task-specific 평가 (한국어, 일기 도메인, 사용자별)를 정기적으로 수행해야 함.'
  );
