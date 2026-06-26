-- Attraction & relationship initiation — grounding for the RELATION (관계) star.
-- The single largest YouTube demand cluster (love / crush / dating) had no source:
-- relationship-maintenance covers KEEPING relationships, nothing covered how they
-- START. Framing = understanding one's own initiation patterns, not "how to be
-- attractive" pop advice. All DOIs verified against Crossref / publisher record.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Online Dating: A Critical Analysis From the Perspective of Psychological Science',
    ARRAY['Eli J. Finkel','Paul W. Eastwick','Benjamin R. Karney','Harry T. Reis','Susan Sprecher'],
    '10.1177/1529100612436522',
    'https://doi.org/10.1177/1529100612436522',
    'attraction',
    'adult',
    'en',
    now(),
    '프로필 탐색과 매칭 알고리즘은 두 사람이 실제로 잘 맞을지를 거의 예측하지 못한다. 끌림과 궁합은 ''고르는'' 단계가 아니라 ''상호작용하는'' 과정에서 드러난다. 사진과 스펙으로 사람을 평가하는 방식은 실제 관계 형성과 어긋난다.',
    'Profile browsing and matching algorithms predict little about whether two people will actually click. Attraction and compatibility emerge from interaction, not from selection. Evaluating people by photos and specs is misaligned with how relationships actually form.',
    'attraction 도메인 근거. Advisor가 ''왜 마음에 드는 사람이 안 생기나''류 입력을 다룰 때 ''고르기''보다 ''상호작용 경험''에 초점을 비추도록. 매력 평가가 아닌 본인 관계 형성 패턴 성찰로 연결.'
  ),
  (
    'A Meta-Analytic Investigation of the Processes Underlying the Similarity-Attraction Effect',
    ARRAY['R. Matthew Montoya','Robert S. Horton'],
    '10.1177/0265407512452989',
    'https://doi.org/10.1177/0265407512452989',
    'attraction',
    'adult',
    'en',
    now(),
    '240여 개 연구를 종합: 끌림을 만드는 것은 ''실제 유사성''보다 ''내가 상대와 비슷하다고 지각하는 정도''다. 우리는 닮았다고 ''느끼는'' 사람에게 끌리며, 이 지각은 실제 공통점과 다를 수 있다. 첫인상의 끌림이 곧 깊은 궁합을 뜻하지는 않는다.',
    'Pooling ~240 studies: attraction is driven more by PERCEIVED similarity than actual similarity. We are drawn to those we believe are like us, and that perception can diverge from real overlap. Initial attraction is not the same as deep compatibility.',
    'Advisor cue: ''왜 비슷한 사람만 좋아하게 될까''류 패턴에 ''지각된 유사성''을 한 줄로 비추되 판정하지 않기. 본인이 무엇을 ''닮음''으로 읽는지 되돌아보는 질문으로 마무리.'
  ),
  (
    'The Experimental Generation of Interpersonal Closeness: A Procedure and Some Preliminary Findings',
    ARRAY['Arthur Aron','Edward Melinat','Elaine N. Aron','Robert Darrin Vallone','Renee J. Bator'],
    '10.1177/0146167297234003',
    'https://doi.org/10.1177/0146167297234003',
    'attraction',
    'adult',
    'en',
    now(),
    '점진적으로 깊어지는 상호 자기개방은 처음 만난 사이에서도 가까움을 만들어낸다(이른바 ''36개의 질문'' 연구). 친밀감은 ''발견''하는 것이 아니라 서로의 취약함을 주고받으며 ''만들어가는'' 것이다. 연결은 운이 아니라 상호작용의 구조에서 나온다.',
    'Escalating, reciprocal self-disclosure can generate closeness even between strangers (the "36 questions" study). Intimacy is built through mutual vulnerability rather than found. Connection comes from the structure of interaction, not luck.',
    'Advisor cue: 관계가 깊어지지 않는다는 입력에 ''상호 자기개방의 점진성''을 비춤. 본인이 먼저 한 걸음 여는 작은 행동 하나를 떠올리게 하는 성찰 질문으로 연결. 조언/지시 금지.'
  );
