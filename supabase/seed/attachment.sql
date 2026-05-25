-- Attachment Theory — verified knowledge sources
-- Batch source: docs/research/batches/attachment.md
-- DOIs verified against Crossref / publisher record, May 2026.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Attachment, exploration, and separation: Illustrated by the behavior of one-year-olds in a strange situation',
    ARRAY['Mary D. S. Ainsworth','Silvia M. Bell'],
    '10.2307/1127388',
    'https://doi.org/10.2307/1127388',
    'attachment',
    'child',
    'en',
    now(),
    '12개월 영아의 ''Strange Situation'' 절차를 도입한 고전 논문. 영아 애착의 안정/불안-양가/회피 분류 체계의 출발점.',
    'Introduces the Strange Situation procedure with 12-month-old infants. Origin of the infant attachment classification (secure / anxious-ambivalent / avoidant).',
    '유아·아동 인터뷰 질문에서 ''보호자가 힘든 순간에 어떻게 반응했는가''라는 working-model 질문의 학술 근거.'
  ),
  (
    'Romantic love conceptualized as an attachment process',
    ARRAY['Cindy Hazan','Phillip Shaver'],
    '10.1037/0022-3514.52.3.511',
    'https://doi.org/10.1037/0022-3514.52.3.511',
    'attachment',
    'adult',
    'en',
    now(),
    '영아 애착 분류 체계를 성인 로맨틱 관계에 확장한 최초의 연구. 성인기에도 안정/불안/회피 비율이 영아기와 유사하게 분포함을 보고.',
    'Extends infant attachment categories to adult romantic relationships. Reports comparable distributions of secure / anxious / avoidant styles in adulthood and infancy.',
    '성인 인터뷰의 attachment-style 질문(가까워질 때 어떤 느낌인지)의 출처. 단, 3-스타일은 휴리스틱이고 현행 측정은 차원적임을 표기.'
  ),
  (
    'Attachment styles among young adults: A test of a four-category model',
    ARRAY['Kim Bartholomew','Leonard M. Horowitz'],
    '10.1037/0022-3514.61.2.226',
    'https://doi.org/10.1037/0022-3514.61.2.226',
    'attachment',
    'young_adult',
    'en',
    now(),
    '자기 이미지·타인 이미지 조합으로 4가지 애착 prototype(안정/몰입/회피-거부/회피-두려움)을 제시한 연구. 청년기 애착 측정의 4-카테고리 모델 원형.',
    'Proposes four attachment prototypes (secure / preoccupied / dismissing / fearful) based on positive vs negative self-image and other-image. Foundational for the 4-category model in young adults.',
    '인터뷰 응답을 4-카테고리로 추론하되 사용자에게 라벨링하지 않고 ''~한 패턴이 보이는데 동의하시나요'' 식으로 제시.'
  ),
  (
    'An item response theory analysis of self-report measures of adult attachment',
    ARRAY['R. Chris Fraley','Niels G. Waller','Kelly A. Brennan'],
    '10.1037/0022-3514.78.2.350',
    'https://doi.org/10.1037/0022-3514.78.2.350',
    'attachment',
    'adult',
    'en',
    now(),
    '성인 애착 자기보고 척도 4종을 IRT로 비교 분석하고 ECR-R 척도를 도출한 측정학적 핵심 논문. 차원적(불안/회피) 접근의 학술 기반.',
    'IRT comparison of four adult attachment self-report measures and derivation of the ECR-R. Establishes the two-dimensional (Anxiety, Avoidance) measurement approach.',
    'trait extraction을 차원적으로(category가 아닌 anxiety/avoidance 점수) 구현하는 근거.'
  ),
  (
    'Attachment in adulthood: Recent developments, emerging debates, and future directions',
    ARRAY['R. Chris Fraley'],
    '10.1146/annurev-psych-010418-102813',
    'https://doi.org/10.1146/annurev-psych-010418-102813',
    'attachment',
    'adult',
    'en',
    now(),
    '성인 애착 연구의 최신 리뷰. ''earned secure'' 경로, 차원적 접근, AAI와 자기보고의 관계, 진화적 기능 등 현행 논쟁 정리.',
    'Annual Review synthesis of adult attachment: the earned secure trajectory, dimensional vs categorical measurement, AAI vs self-report distinction, and evolutionary debates.',
    'Advisor가 ''애착은 바뀔 수 있다''고 안내할 때 earned-secure 개념의 학술 근거.'
  ),
  (
    'Validation of the Korean Version of Culturally Responsive Experiences in Close Relationships–Short Form',
    ARRAY['Ji-yeon Lee','Yun-Kyung Kim','Yun-Jeong Shin'],
    '10.1007/s10447-023-09503-6',
    'https://doi.org/10.1007/s10447-023-09503-6',
    'attachment',
    'adult',
    'ko',
    now(),
    '한국 문화 맥락을 반영한 ECR-R Short Form(K-ECRR-SF) 검증 연구. Rasch 분석으로 12문항을 선별해 한국 청장년 표본에서 신뢰도·타당도 확인. 한국 사용자 애착 측정의 1차 근거.',
    'Validates a culturally responsive Korean ECR-R Short Form (K-ECRR-SF). Used Rasch analysis on original 36 items to select 12 culturally equivalent items; CFA confirmed factor structure in Korean adult sample.',
    '한국어 애착 인터뷰 질문은 이 한국판의 어휘를 참고. 영어 ECR-R 직역 금지.'
  );
