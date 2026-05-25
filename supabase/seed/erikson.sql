-- Erikson's Stages of Psychosocial Development — verified knowledge sources
-- Batch source: docs/research/batches/erikson.md
-- DOIs verified against Crossref / publisher record, May 2026.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Development and validation of ego-identity status',
    ARRAY['James E. Marcia'],
    '10.1037/h0023281',
    'https://doi.org/10.1037/h0023281',
    'erikson',
    'young_adult',
    'en',
    now(),
    'Erikson의 정체감 vs 역할혼란 단계를 ''위기·전념'' 조합으로 4가지 status(성취·유실·유예·혼미)로 조작화한 고전 논문. 청년기 정체감 측정의 출발점.',
    'Operationalizes Erikson''s Identity vs Role Confusion stage into four statuses (achievement / foreclosure / moratorium / diffusion) based on the presence of crisis and commitment in occupation and ideology.',
    '청년기 인터뷰에서 ''나는 누구다''라는 질문을 통한 identity-status 추론의 학술 근거.'
  ),
  (
    'Natural history of male psychological health: IX. Empirical evidence for Erikson''s model of the life cycle',
    ARRAY['George E. Vaillant','Eva Milofsky'],
    '10.1176/ajp.137.11.1348',
    'https://doi.org/10.1176/ajp.137.11.1348',
    'erikson',
    'lifespan',
    'en',
    now(),
    '40년 종단연구 두 코호트로 Erikson 생애주기 모델을 경험적으로 검증. 친밀감과 생산성 사이에 ''직업 통합(career consolidation)'' 단계가 추가로 존재함을 제안.',
    'Tests Erikson''s life cycle model via two 40-year prospective studies. Identifies a "career consolidation" stage between Intimacy and Generativity not in Erikson''s original schema.',
    'Erikson 단계를 그대로 적용하지 않고 ''20–40대에 직업 정체성 통합도 함께 일어난다''는 미세 보정을 Advisor에 반영.'
  ),
  (
    'A theory of generativity and its assessment through self-report, behavioral acts, and narrative themes in autobiography',
    ARRAY['Dan P. McAdams','Ed de St. Aubin'],
    '10.1037/0022-3514.62.6.1003',
    'https://doi.org/10.1037/0022-3514.62.6.1003',
    'erikson',
    'midlife',
    'en',
    now(),
    'Erikson의 7단계(생산성 vs 침체)를 측정하기 위한 Loyola Generativity Scale(LGS) 개발 논문. 지식 전수·돌봄·유산·공동체 기여·창조성 5개 하위 영역으로 생산성을 조작화.',
    'Introduces the Loyola Generativity Scale (LGS), a 20-item self-report measure with five subscales: passing knowledge, caring, leaving legacy, contributing to community, creativity. Operationalizes Erikson''s Stage 7.',
    '중년기 인터뷰의 ''남기고 싶은 것''/''다음 세대''/''돌봄'' 프롬프트의 출처. 자녀 유무와 무관하게 생산성이 발현됨을 반영.'
  ),
  (
    'Implications of identity resolution in emerging adulthood for intimacy, generativity, and integrity across the adult lifespan',
    ARRAY['Lauren L. Mitchell','Jennifer Lodi-Smith','Erica N. Baranski','Susan Krauss Whitbourne'],
    '10.1037/pag0000537',
    'https://doi.org/10.1037/pag0000537',
    'erikson',
    'lifespan',
    'en',
    now(),
    'Rochester 종단연구(N=1224, 20-60대 5회 측정)로 Erikson 후기 단계를 검증. 청년기 정체감 해결도가 높으면 친밀감·생산성·통합감이 일관되게 높음. 낮은 집단도 시간이 지나며 따라잡아 60대에 거의 수렴.',
    'Rochester Adult Longitudinal Study (N=1224, up to 5 waves from 20s to 60s) testing Erikson''s later stages. High emerging-adult identity resolution predicts consistently high intimacy/generativity/integrity; low-resolution group shows faster growth, nearly converging by the 60s.',
    'Advisor의 hope-anchored guidance: ''30대에도 내가 누군지 모르겠다''는 사용자에게 학술적으로 정당한 ''만회 가능하다''는 메시지 근거.'
  ),
  (
    'Testing a process-oriented model of identity development in South Korean young adults',
    ARRAY['Yerin Park','Seheon Kim','Garam Kim','Sara K. Johnson','Sun W. Park'],
    '10.1007/s12144-021-01838-w',
    'https://doi.org/10.1007/s12144-021-01838-w',
    'erikson',
    'young_adult',
    'ko',
    now(),
    '한국 19-25세 N=548 표본으로 5차원 과정 지향 정체감 모델(exploration in breadth/depth, commitment making, identification with commitment, ruminative exploration)을 검증. 한국 사회의 개인주의·집단주의 공존 맥락 반영.',
    'Tests a five-dimensional process-oriented identity model in South Korean young adults (N=548, ages 19–25). Reflects coexistence of individualist and collectivist cultural demands shaping Korean identity formation.',
    '한국 사용자 정체감 인터뷰는 ''개별성 추구''뿐 아니라 ''관계적 정체감''(가족·공동체에서의 자기 위치)도 함께 묻도록 설계.'
  );
