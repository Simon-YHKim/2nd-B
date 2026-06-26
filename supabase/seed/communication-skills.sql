-- Communication & conflict-repair skills — grounding for the RELATION (관계) star.
-- YouTube-gap P2. interpersonal.sql covers the circumplex STRUCTURE; nothing
-- covered applied skills (how to respond, how to handle conflict). Self-
-- understanding framing, not couples coaching. DOIs verified against Crossref.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'What Do You Do When Things Go Right? The Intrapersonal and Interpersonal Benefits of Sharing Positive Events',
    ARRAY['Shelly L. Gable','Harry T. Reis','Emily A. Impett','Evan R. Asher'],
    '10.1037/0022-3514.87.2.228',
    'https://doi.org/10.1037/0022-3514.87.2.228',
    'communication',
    'adult',
    'en',
    now(),
    '관계의 질을 가르는 것은 ''나쁜 일에 어떻게 반응하느냐''만이 아니라 ''좋은 일에 어떻게 반응하느냐''다(capitalization). 상대의 좋은 소식에 적극적·긍정적으로 호응(active-constructive)할수록 관계 만족과 친밀감이 높아진다. 무덤덤하거나 김빼는 반응은 조용히 관계를 깎는다.',
    'Relationship quality is shaped not only by how we respond to bad news but by how we respond to GOOD news (capitalization). Active-constructive responding to a partner''s good news raises satisfaction and intimacy, while passive or deflating responses quietly erode it.',
    'communication 근거. Advisor가 관계 입력을 다룰 때 ''상대의 좋은 소식에 어떻게 반응하는지''를 한 번 비춤. 본인의 호응 방식을 되돌아보는 성찰 질문으로.'
  ),
  (
    'What Type of Communication During Conflict Is Beneficial for Intimate Relationships?',
    ARRAY['Nickola C. Overall','James K. McNulty'],
    '10.1016/j.copsyc.2016.03.002',
    'https://doi.org/10.1016/j.copsyc.2016.03.002',
    'communication',
    'adult',
    'both',
    now(),
    '갈등 시 ''항상 좋은'' 소통 방식은 없다. 가벼운 문제에는 부드럽고 긍정적인 대화가 낫지만, 심각하거나 바뀌어야 할 문제에는 직접적이고 때로 부정적인 표현이 장기적으로 더 도움이 될 수 있다. 핵심은 ''무엇을 말하느냐''가 아니라 ''상황에 맞느냐''다.',
    'There is no universally "good" conflict communication. Soft, positive talk suits minor issues, but for serious problems that need to change, direct and even negative engagement can be more beneficial long-term. What matters is fit to the situation, not a fixed style.',
    'Advisor cue: ''갈등을 잘 못 한다''는 입력에 ''상황에 따라 맞는 방식이 다르다''를 비춤. 본인이 회피형인지 직면형인지, 어떤 상황에 어느 쪽이 맞았는지 되돌아보는 질문으로. 처방 금지.'
  );

-- Korean-context validation (④ follow-up). KCI-indexed, real DOI.
insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    '부부의사소통능력 척도 개발 및 타당화',
    ARRAY['강정실'],
    '10.15703/kjc.16.5.201510.385',
    'https://doi.org/10.15703/kjc.16.5.201510.385',
    'communication', 'adult', 'ko', now(),
    '한국 기혼 성인 344명 대상으로 부부의사소통능력 척도를 개발·타당화(최종 33문항, 3요인). 소통을 추상적 태도가 아니라 측정 가능한 ''능력''으로 조작화한 한국 도구.',
    'Develops and validates a Korean couple-communication-ability scale (33 items, 3 factors) in 344 married adults, operationalizing communication as a measurable competence in the Korean context.',
    '한국어 사용자의 소통 입력을 ''능력의 차원''으로 비추는 한국 근거. 처방이 아닌 성찰 질문으로.'
  );
