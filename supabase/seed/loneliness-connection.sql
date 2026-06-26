-- Loneliness & social connection — grounding for the RELATION (관계) domain star.
-- Demand surfaced by the YouTube topic-gap map (외로움 / social anxiety / isolation);
-- the corpus had no source on loneliness as a felt state distinct from being alone.
-- Non-clinical framing only: connection as a need, never isolation-as-illness.
-- Crisis content still routes to crisis-detection FIRST (docs/research/CLAUDE.md §0).
-- All DOIs verified against Crossref / publisher record.

insert into public.knowledge_sources
  (title, authors, doi, url, framework, age_range, locale,
   verified_at, summary_ko, summary_en, application_notes)
values
  (
    'Loneliness Matters: A Theoretical and Empirical Review of Consequences and Mechanisms',
    ARRAY['Louise C. Hawkley','John T. Cacioppo'],
    '10.1007/s12160-010-9210-8',
    'https://doi.org/10.1007/s12160-010-9210-8',
    'loneliness',
    'adult',
    'en',
    now(),
    '외로움은 ''혼자 있음''(객관적 고립)이 아니라 ''연결이 부족하다고 지각함''(주관적 상태)이다. 사람이 많아도 외로울 수 있고 혼자여도 외롭지 않을 수 있다. 외로움은 사회적 위협에 대한 과민 경계를 높여, 더 방어적으로 행동하게 만들고 그 결과 연결이 더 어려워지는 자기강화 고리를 만든다.',
    'Loneliness is the perception that one''s connection is insufficient (a subjective state), not the objective fact of being alone. One can feel lonely in a crowd or content in solitude. Loneliness raises hypervigilance for social threat, nudging more defensive behavior that in turn makes connection harder — a self-reinforcing loop.',
    'relation 도메인 별의 학술 근거. Advisor가 외로움을 다룰 때 ''사람 수''가 아니라 ''연결의 질에 대한 본인 지각''을 mirror. 외로움을 결함이 아닌 흔한 신호로 정상화. 위기 신호 동반 시 crisis-detection 우선.'
  ),
  (
    'Loneliness and Social Isolation as Risk Factors for Mortality: A Meta-Analytic Review',
    ARRAY['Julianne Holt-Lunstad','Timothy B. Smith','Mark Baker','Tyler Harris','David Stephenson'],
    '10.1177/1745691614568352',
    'https://doi.org/10.1177/1745691614568352',
    'loneliness',
    'adult',
    'en',
    now(),
    '70편 이상을 종합한 메타분석: 주관적 외로움과 객관적 고립 모두 장기적 건강 결과와 유의하게 연관되며, 그 크기가 잘 알려진 생활 요인들과 비슷한 수준이다. 사회적 연결은 ''있으면 좋은 것''이 아니라 삶의 기반 요소임을 보여준다.',
    'A meta-analysis pooling 70+ studies: both subjective loneliness and objective isolation are significantly associated with long-term outcomes, at magnitudes comparable to well-established lifestyle factors. Social connection is foundational, not optional.',
    '연결을 ''사치''가 아닌 기반 우선순위로 프레이밍하는 근거. Advisor는 관계 항목의 중요도를 본인 삶의 다른 축과 동등하게 비추되, 겁주지 않고 사실 기반으로 전달. 임상/처방 금지.'
  ),
  (
    'A Meta-Analysis of Interventions to Reduce Loneliness',
    ARRAY['Christopher M. Masi','Hsi-Yuan Chen','Louise C. Hawkley','John T. Cacioppo'],
    '10.1177/1088868310377394',
    'https://doi.org/10.1177/1088868310377394',
    'loneliness',
    'adult',
    'en',
    now(),
    '외로움을 줄이려는 개입 4종(사회 기술 향상, 사회적 지지 강화, 만남 기회 확대, 부적응적 사회 인지 다루기)을 비교한 메타분석. 가장 효과가 큰 지렛대는 ''더 많은 만남''이 아니라 ''왜곡된 사회 인지를 다루는 것''이었다. 즉 사람을 더 만나는 것보다 ''남들이 나를 어떻게 볼까''에 대한 과도한 부정 예측을 점검하는 것이 핵심.',
    'A meta-analysis comparing four loneliness-reduction strategies (social-skills training, boosting social support, increasing contact opportunities, and addressing maladaptive social cognition). The strongest lever was not "meet more people" but addressing distorted social cognition — the over-negative predictions about how others see us.',
    '가장 실행 가능한 Advisor cue: 외로움 호소 시 ''사람을 더 만나라'' 대신 ''남들이 나를 어떻게 볼지에 대한 예측''을 한 가지 부드럽게 점검하는 질문으로 연결. 조언이 아닌 성찰 질문으로 끝맺기.'
  );
