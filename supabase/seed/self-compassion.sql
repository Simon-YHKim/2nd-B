-- Self-Compassion (Neff) — verified knowledge sources
-- Batch source: docs/research/batches/self-compassion.md
-- DOIs verified against Crossref / publisher record, May 2026.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'The development and validation of a scale to measure self-compassion',
    ARRAY['Kristin D. Neff'],
    '10.1080/15298860309027',
    'https://doi.org/10.1080/15298860309027',
    'self_compassion',
    'adult',
    'en',
    now(),
    '자기자비를 자기친절·공통인간성·마음챙김의 세 차원과 그 대립항(자기비판·고립·과동일시)으로 정의하고 SCS 척도를 개발한 핵심 논문.',
    'Foundational paper defining self-compassion via three positive (self-kindness, common humanity, mindfulness) and three negative (self-judgment, isolation, over-identification) components, and introducing the Self-Compassion Scale (SCS).',
    '인터뷰의 ''친구에게는 어떻게 말할까'' 비교 질문이 self-kindness 차원의 표준 진입로.'
  ),
  (
    'Exploring compassion: A meta-analysis of the association between self-compassion and psychopathology',
    ARRAY['Angus MacBeth','Andrew Gumley'],
    '10.1016/j.cpr.2012.06.003',
    'https://doi.org/10.1016/j.cpr.2012.06.003',
    'self_compassion',
    'adult',
    'en',
    now(),
    '14개 연구·20개 표본 메타분석. 자기자비와 정신병리(우울·불안 등) 간 큰 부적 상관(r = -0.54) 확인. 자기자비의 보호 효과 학술 근거.',
    'Meta-analysis of 14 studies / 20 samples. Large negative association (r = −0.54) between self-compassion and psychopathology (depression, anxiety, stress). Establishes the protective role of self-compassion.',
    'Advisor가 자기자비를 ''감정 회피''가 아닌 ''정신건강 보호 요인''으로 framing하는 학술 근거.'
  ),
  (
    'Translation and validation study of the Korean Self-Compassion Scale',
    ARRAY['Si Woo Chae','Jeong Eun Cheon','Janet D. Latner','Young-Hoon Kim'],
    '10.1007/s12671-024-02453-z',
    'https://doi.org/10.1007/s12671-024-02453-z',
    'self_compassion',
    'adult',
    'ko',
    now(),
    '기존 한국판 SCS의 번역 부정확성을 검토하고 재번역·재검증한 연구(N=510). 한국인 표본에서 SCS의 요인구조(positive vs negative components 분리 모델 포함)를 CFA·ESEM으로 비교 검증.',
    'Re-translation and validation of the Korean SCS (N=510) addressing inaccuracies in prior Korean versions. Compares CFA and ESEM models, supporting a separation of positive and negative components in the Korean sample.',
    '한국어 self-talk 인터뷰는 영어 SCS 직역이 아닌 이 한국판 어휘를 참고. 긍정·부정 성분을 별도로 분석 가능.'
  );
