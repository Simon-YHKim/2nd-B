-- Manipulation literacy — self-protection sense-making for the RELATION (관계) star.
-- YouTube-gap P3 (toxic / gaslighting / red flags = a huge demand cluster).
-- STRICT framing: this helps a user NAME and make sense of patterns in their own
-- experience, NEVER to diagnose another person. Dark Triad is subclinical (normal
-- range), not a disorder. Any input with abuse/crisis markers routes to
-- crisis-detection FIRST (docs/research/CLAUDE.md §0). DOIs verified via Crossref.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'The Dark Triad of Personality: Narcissism, Machiavellianism, and Psychopathy',
    ARRAY['Delroy L. Paulhus','Kevin M. Williams'],
    '10.1016/S0092-6566(02)00505-6',
    'https://doi.org/10.1016/S0092-6566(02)00505-6',
    'manipulation',
    'adult',
    'en',
    now(),
    '''다크 트라이어드''는 일상 범위(subclinical)의 세 성향 — 마키아벨리즘(전략적 조종), 자기애(과시), 사이코패시(냉담) — 을 묶은 구성. 장애가 아니라 정상 분포의 한쪽이며, 누군가를 ''진단''하는 라벨이 아니라 행동 ''패턴''을 알아보는 어휘로 쓰인다.',
    'The Dark Triad bundles three subclinical (normal-range) tendencies — Machiavellianism (strategic manipulation), narcissism (grandiosity), and psychopathy (callousness). Not a disorder but one end of a normal distribution; a vocabulary for recognizing behavioral patterns, not a label to diagnose a person.',
    'manipulation 근거. Advisor가 ''상대가 나를 이용하는 것 같다''류 입력을 다룰 때 패턴을 명명하도록 돕되, 절대 상대를 진단하지 않음. 본인이 무엇을 겪고 있는지 이해하는 데 초점. 학대·위기 신호 시 crisis-detection 우선.'
  ),
  (
    'The Sociology of Gaslighting',
    ARRAY['Paige L. Sweet'],
    '10.1177/0003122419874843',
    'https://doi.org/10.1177/0003122419874843',
    'manipulation',
    'adult',
    'both',
    now(),
    '가스라이팅은 ''피해자가 이상한 것''이 아니라 권력·사회적 불평등에 뿌리를 둔 사회적 현상이다. 상대가 현실 감각을 흔들 때 느끼는 혼란은 개인의 결함이 아니라 ''전술에 대한 반응''임을 보여줌. 자기 의심을 정상화하고 외재화하는 근거.',
    'Gaslighting is a social phenomenon rooted in power and inequality, not the victim "being crazy." The confusion felt when someone destabilizes one''s sense of reality is a response to a tactic, not a personal defect. Grounds normalizing and externalizing the self-doubt.',
    'Advisor cue: ''내가 예민한 건가'' 류 자기 의심에 ''그 혼란은 전술에 대한 반응일 수 있다''를 비춤. 상대를 규정하지 말고 본인 경험의 타당성을 회복하는 성찰 질문으로. 위기 시 crisis-detection 우선.'
  );
