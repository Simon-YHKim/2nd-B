# 검증 측정도구 — 화면 브리프 (6개)

> 00-SYSTEM.md의 토큰·위계·자유도 계약이 전제. 아래 "기능·필수 컨트롤"은 존재해야 하는 것의 목록이며 배치·순서·형태는 자유.

## 검증 · Big Five (`/big-five`) — windowed
목적: 성격 5요인(BFI-44, John/Donahue/Kentle 1991, public domain)을 측정하는 검증 렌즈 화면. 딥스페이스 캐논에서는 결과 렌즈(BigFiveLensM3)를 먼저 보여주고, 빈 상태/재측정 CTA에서 44문항 설문(BigFiveSurvey)을 같은 독 안에서 실행한다. 설문 결과는 bfi 태그 레코드로 저장되어 /persona와 추론 엔진(buildPersona)의 특질 축을 채운다.

기능 · 필수 컨트롤:
- 렌즈 empty 상태 CTA '검사 시작' 탭 → taking=true — 같은 딥스페이스 독 안에서 BigFiveSurvey 마운트
- 렌즈 error 상태 '다시 시도' 탭 → reloadKey 증가 → loadLatestBfi 재실행
- '다시 측정' 탭 → 설문 시작 (taking=true)
- '데이터 추가' 탭 → router.push('/capture')
- '다른 검증틀 · 애착 유형 보기' 카드 탭 → router.push('/attachment')
- 탑앱바 뒤로가기(windowed) → router.back()
- 리커트 버튼(1~5) 탭 → responses[itemId]=value 반영, 진행 카운트 갱신
- 마지막 페이지 '결과 저장' 탭 → scoreBfi 결과와 응답 원본을 createRecord로 저장(요약: '{특질}: x.x/5' 나열, 결론: '오늘 가장 높은 점수: {특질} (x.x/5)') → 저장 축하
- 저장 실패 → danger 토스트 '저장하지 못했어요. 답변은 그대로 남아 있으니 다시 시도해 주세요.' (3초, 응답 보존)
- 축하 완료(onDone) → 첫 별 nudge 소진 시 /secondb로 replace(fromNode 파라미터), 아니면 렌즈 복귀 + reloadKey 증가
- 설문 중 Android 뒤로가기 → 종료 확인 모달 표시(이벤트 소비)

담아야 할 정보 묶음(구성 자유): 렌즈 헤더 (filled 상태) · 특질 막대 5행 · 다른 검증틀 카드 · 액션 행 · 설문 모드 — 시작 안내 모달 (QuantIntroModal) · 설문 모드 — 헤더 카드 · 설문 모드 — QuantPager (5문항/페이지, 9페이지) · 저장 축하 (QuantSaveCelebration) · 종료 확인 모달

4-상태: empty: 가운데 별 아이콘(34px primary) + '아직 이 별은 어두워요' + '성격 검사를 한 번 마치면 지금의 나 별이 켜져요.' + filled 버튼 '검사 시작' / loading: auth 로딩 중: PremiumLoadingState '검사를 불러오는 중이에요…' (설문 내부); 렌즈 데이터 로드는 조용히 진행 / error: 경고 삼각형 아이콘 + '불러오지 못했어요' + '잠시 후 다시 시도해 주세요.' + tonal 버튼 '다시 시도' / filled: 헤드라인 + L4 칩 + 확신 64% + 5개 특질 ProgressLinear 행 + 다른 검증틀 카드 + 다시 측정/데이터 추가 버튼

게이팅(불변): auth: 미로그인 시 Redirect /sign-in (설문 본문 기준) · tier: 없음 · minor: 별도 게이트 없음 · consent: 없음
안전(불변): LLM 호출 없음(withFollowup=false — C9 경로 밖). 정직한 밝기 원칙: 델타를 지어내지 않고 측정값만 표시. 저장 실패 시 응답 보존 + 재시도.
이동 대상: /attachment, /capture, /secondb, /sign-in

카피(원문 고정):
- 검증 · Big Five
- 숨은 결(레이어 B) · 도메인 행동을 삼각측량해 추정한 제안이에요
- 개방성 / 성실성 / 외향성 / 우호성 / 신경성
- 다른 검증틀 · 애착 유형 보기
- 다시 측정 / 데이터 추가
- 아직 이 별은 어두워요
- 성격 검사를 한 번 마치면 지금의 나 별이 켜져요.
- 검사 시작
- 전혀 아니다 / 아니다 / 보통 / 그렇다 / 매우 그렇다
- 저장됐어요 · 페르소나에서 다시 만나요
- 검사를 종료할까요?

## 성격 정밀검사 (IPIP-NEO-120) (`/ipip-neo`) — windowed
목적: IPIP-NEO-120(Johnson 2014, public domain) 120문항 정밀 자기보고 화면. /big-five(44문항 빠른 측정)와 공존하며, 같은 5개 도메인에 더해 30개 세부 특질(facet)까지 측정한다. 결과가 있으면 딥스페이스 캐논은 FacetBreakdown(도메인 5 + facet 30 막대) 렌즈를, 없으면 공용 LensView empty/error 상태를 보여준다.

기능 · 필수 컨트롤:
- empty CTA '검사 시작' / FacetBreakdown '다시 검사하기' 탭 → taking=true — 같은 독 안에서 IpipNeoSurvey 마운트
- error '다시 시도' 탭 → reloadKey 증가 → loadLatestIpip 재실행
- 리커트 선택 → responses 갱신, scoreIpipNeo 재계산(도메인 5 + facet 30 평균)
- '결과 저장' 탭(120문항 완료 시) → createRecord 저장 (결론: '오늘 가장 높은 축: {축} (x.x/5) · 30개 세부 특질도 함께 저장됐어요') → 축하 → 첫 별 nudge 또는 facet 렌즈 복귀+재로드
- 저장 실패 → danger 토스트 '저장하지 못했어요. 답변은 그대로 남아 있으니 다시 시도해 주세요.'
- 설문 중 Android 뒤로가기 → 종료 확인 모달 (BackHandler 구독, 언마운트 시 반드시 해제)

담아야 할 정보 묶음(구성 자유): 결과 렌즈 — FacetBreakdown (filled) · empty/error 상태 — 공용 LensView · 설문 모드 — 시작 안내 모달 · 설문 모드 — 헤더 + QuantPager (8문항/페이지) · 저장 축하 + 종료 확인

4-상태: empty: LensView empty: 별 아이콘 + '아직 이 별은 어두워요' + '검사 시작' CTA / loading: auth 로딩: PremiumLoadingState '검사를 불러오는 중이에요…' / error: LensView error: '불러오지 못했어요' + '다시 시도' / filled: FacetBreakdown — 도메인 5그룹 × facet 6행 막대 + '다시 검사하기'

게이팅(불변): auth: 미로그인 시 Redirect /sign-in · tier: 없음 · minor: 별도 게이트 없음 · consent: 없음
안전(불변): LLM 호출 없음. KO 문항은 미검증 참고 번역임을 인트로에서 고지(EN이 검증 원본). 저장 실패 시 응답 보존.
이동 대상: /secondb, /sign-in

카피(원문 고정):
- 성격 정밀검사 (IPIP-NEO-120)
- 정밀검사 · IPIP-NEO-120
- 이 문장이 당신을 얼마나 정확히 묘사하는지 골라주세요.
- 전혀 아니다 / 대체로 아니다 / 보통 / 대체로 그렇다 / 매우 그렇다
- 세부 특질 30가지
- 5가지 축을 그 아래 세부 특질까지 펼쳐봤어요. 막대는 자기보고 기준이에요.
- 다시 검사하기
- 저장됐어요 · 페르소나에서 다시 만나요
- 그만두시겠어요?

## 애착 유형 (`/attachment`) — windowed
목적: 가까운 관계 패턴을 회피×불안 2축으로 측정하는 ECR-S(Wei et al. 2007, 12문항) 화면. 캐논은 결과 렌즈(AttachmentLensM3 — 2축 사분면 지도 + 스타일 추정)를 먼저 보여주고, 빈 상태/재측정 CTA에서 12문항 설문(AttachmentSurvey)을 같은 독 안에서 실행한다. 설문이 ['attachment','ecr'] 태그 레코드의 유일한 작성자다.

기능 · 필수 컨트롤:
- 렌즈 empty CTA '검사 시작' 탭 → taking=true — 독 안에서 AttachmentSurvey 마운트
- 렌즈 error CTA 탭 → onStart(설문 시작) — 주의: error 상태의 '다시 시도' 버튼이 onRetry가 아닌 onStart로 배선되어 있음
- '관계 인터뷰' 탭 → router.push('/interview')
- 'Big Five 보기' 탭 → router.push('/big-five')
- 탑앱바 뒤로가기 → router.back()
- 리커트 선택(1~7) → scoreEcr 재계산 — 불안/회피 하위척도 평균 + 4개 스타일 판정, 헤더에 실시간 반영
- '결과 저장' 탭(12문항 완료) → createRecord 저장 (요약 '애착 스타일: {스타일} · 불안 x.x/7 · 회피 x.x/7', 결론 = 스타일 설명문) → 축하
- 저장 실패 → danger 토스트 '검사 결과를 저장하지 못했어요. 답변은 그대로 남아 있어요.'
- 설문 중 Android 뒤로가기 → 종료 확인 모달

담아야 할 정보 묶음(구성 자유): 렌즈 헤더 (filled) · 회피×불안 2축 지도 카드 · 세컨비 인사이트 카드 · 액션 행 · 설문 모드 — 시작 안내 모달 · 설문 모드 — 헤더 + QuantPager (7점 리커트) · 저장 축하 + 종료 확인

4-상태: empty: 별 아이콘 + '아직 이 별은 어두워요' + '애착 검사를 한 번 마치면 관계의 나 별이 켜져요.' + filled '검사 시작' / loading: auth 로딩: PremiumLoadingState '검사를 불러오는 중이에요…' / error: '불러오지 못했어요' + '잠시 후 다시 시도해 주세요.' + tonal '다시 시도' / filled: 2축 사분면 지도 + 내 위치 점 + '{스타일}에 가까움' + 세컨비 인사이트 + 관계 인터뷰/Big Five 버튼

게이팅(불변): auth: 미로그인 시 Redirect /sign-in · tier: 없음 · minor: 별도 게이트 없음 · consent: 없음
안전(불변): LLM 호출 없음. propose→ratify: 렌즈는 추정임을 부제('추정한 제안')로 고지, 확정은 심층 플로우에 위임. 첫 별 activation nudge는 markFirstStarChatNudged 1회성.
이동 대상: /interview, /big-five, /secondb, /sign-in

카피(원문 고정):
- 애착 유형
- 숨은 결(레이어 B) · 관계 도메인을 ECR 척도로 본 모습
- 안정 / 몰입 / 회피 / 혼란
- ← 회피 낮음 · 높음 →
- {{style}}에 가까움
- · 회피 {{avoid}} · 불안 {{anx}}
- 관계 인터뷰 / Big Five 보기
- 애착 스타일 (ECR-S)
- ECR-S · 12문항
- 가까운 관계 전반을 떠올리며 1(전혀 아니다) ~ 7(매우 그렇다)로 답해 주세요.
- 안정형 / 몰입형 / 거리두기형 / 혼란형
- 저장됐어요 · 별 하나가 켜졌어요
- 애착 검사를 한 번 마치면 관계의 나 별이 켜져요.

## 가벼운 체크인 (ESM) (`/esm`) — immersive
목적: 15초짜리 순간 표집 체크인 화면 — 지금 순간의 맥락(어디서 누구와) 또는 에너지(1~5)를 한 번의 탭 몇 개로 남긴다. 알림 없이 사용자가 직접 열었을 때만 기록하며, 판단이나 꼬리표가 아니라 나중에 흐름을 보는 작은 단서로 프레이밍된다. 캐논/레거시가 동일한 기능 화면을 공유하고 크롬만 다르다(딥스페이스는 DeepSpaceScreen 독).

기능 · 필수 컨트롤:
- '맥락'/'에너지' 탭 전환 → kind 변경, saved 리셋, 응답 UI 스왑
- 에너지 1~5 점 탭 → scaleValue 선택(단일), saved 리셋
- 맥락 칩 탭 → selectedTags 토글(복수), saved 리셋
- '체크인 저장' 탭 → esm_responses에 INSERT {user_id, prompt_kind, scale_value(에너지만), context_tags(맥락만)} → 성공 시 완료 카드 + 입력 리셋
- 저장 실패 → danger 토스트 '저장하지 못했어요. 다시 시도해 주세요.' (3초)
- '홈으로' 탭 → router.push('/')

담아야 할 정보 묶음(구성 자유): SceneHero 히어로 · 체크인 카드 (PremiumCard) · 저장 완료 카드

4-상태: empty: 기본 상태 = 빈 입력 (탭 + 미선택 UI); 저장 버튼 비활성 / loading: auth 로딩: 가운데 '체크인을 준비하는 중이에요…' / error: 저장 실패 토스트만 (화면 수준 에러 상태 없음) / filled: 저장 직후: 완료 카드 '저장했어요. 작은 단서 하나가 더해졌어요.' + 입력 초기화

게이팅(불변): auth: 미로그인 시 Redirect /sign-in · tier: 없음 · minor: 별도 게이트 없음 · consent: 없음
안전(불변): LLM 호출 없음. 무알림 원칙(사용자가 열 때만). 카피가 명시적으로 '판단/꼬리표 아님' 프레이밍.
이동 대상: /, /sign-in

카피(원문 고정):
- 가벼운 체크인
- 지금의 단서 하나
- 알림 없이, 내가 열었을 때만
- 판단이 아니라 지금 순간의 작은 신호만 남겨요.
- 15초
- 오늘은 어떤 단서로 남길까요?
- 맥락 / 에너지
- 지금 남아 있는 힘은 어느 정도인가요?
- 지금 어디에 누구와 있나요?
- 혼자 / 사람들과 / 일/공부 / 이동 중 / 쉬는 중 / 밖
- 이 기록은 판단이나 꼬리표가 아니에요. 나중에 흐름을 더 선명하게 보는 작은 단서예요.
- 체크인 저장
- 저장했어요. 작은 단서 하나가 더해졌어요.

## 심층 인터뷰 (`/interview`) — windowed
목적: 세컨비가 묻는 고정 5문항 회상 인터뷰 리커트 스크리너. 단계마다 진행 바 + 헤드라인 질문 + 부제 + 탭형 답변 카드 5개를 보여주고, 5문항을 마치면 비준(propose→ratify) 뷰에서 저장 여부를 승인받는다. 승인 시 답변 전사를 레코드로 저장하고 /big-five로 핸드오프한다. ?period=teens|20s 파라미터로 시기별 회상(과거의 나 타임라인 발 진입)을 지원한다.

기능 · 필수 컨트롤:
- 답변 카드 탭 → answers에 push, step+1 (5번째 답변 후 비준 뷰 진입)
- 비준 '다시' 탭 → answers/step 초기화, 1번 질문부터 재시작
- 비준 '승인하고 반영' 탭 → Q/A 전사를 createRecord(kind 'audit_response', tags ['interview','recall','screener'], auditPeriod=?period)로 저장 → 성공 토스트 → 700ms 후 router.replace('/big-five')
- 저장 실패 → 실패 모달 (답변 보존) — '다시 시도'로 재시도
- 탑앱바 뒤로가기 → router.back()

담아야 할 정보 묶음(구성 자유): 질문 단계 (step 0~4) · 비준 단계 (step ≥ 5) · 피드백 표면

4-상태: empty: 해당 없음 — 진입 즉시 1번 질문 (고정 문항) / loading: auth 로딩: PremiumLoadingState '인터뷰를 준비하는 중이에요…' / error: 저장 실패 시 모달 '반영하지 못했어요' + 재시도; 답변 보존 / filled: 5문항 완료 → 비준 뷰 '답변을 저장할까요?'

게이팅(불변): auth: 미로그인 시 Redirect /sign-in · tier: 없음 · minor: isMinor를 createRecord에 전달 (레코드 정책 적용) · consent: 프로필 미완성(OAuth 세션, DOB/동의 미수집) 시 Redirect /complete-profile (C10 연령 게이트)
안전(불변): 자유 텍스트 LLM 턴 없음(C9 분류기는 이 화면 경로 밖 — gemini.ts에서 계속 강제). propose→ratify 준수: 승인 전 반영 없음. 정직한 밝기: 추정치를 지어내지 않는다는 노트를 비준 카드에 명시.
이동 대상: /big-five, /sign-in, /complete-profile

카피(원문 고정):
- 심층 인터뷰
- 질문 {{n}} / {{total}} · 회상 인터뷰
- 같은 핵심을 조금씩 다르게 되물어요. 더 또렷해지려고요.
- 그렇다 / 조금 그렇다 / 중간 / 조금 아니다 / 아니다
- 답변을 저장할까요?
- 답변은 기록으로 저장돼요. 쌓인 기록이 별 밝기에 반영돼요.
- 답변은 그대로 저장돼요. 지금 추정치를 지어내지 않고, 기록이 쌓이면 별 밝기에 반영돼요.
- 다시 / 승인하고 반영
- 반영했어요. 검증 화면으로 이동할게요.
- 반영하지 못했어요
- 요즘 사람들과 함께 있을 때, 에너지가 차오르나요 빠져나가나요?
- 혼자 있는 저녁과 약속이 있는 저녁 중, 어느 쪽이 더 당신답나요?
- 처음 만난 자리에서 먼저 말을 거는 편인가요?
- 지친 하루의 끝, 누군가에게 연락하고 싶어지나요?
- 돌아보면, 당신을 가장 살아있게 한 순간은 혼자였나요 함께였나요?

## 성장 · 과거의 나 (`/audit`) — windowed
목적: 딥스페이스 캐논의 /audit은 '과거의 나' 시대 타임라인(PastMeErasView) — 다섯 개 인생 시대(유아기/아동기/청소년기/청년기/현재)를 좌측 레일 타임라인으로 보여주고, 시대 카드를 탭하면 그 시기를 스코프로 /interview 회상 인터뷰가 열리는 내비게이션 전용 화면이다. 레거시 트랙의 서술형 라이프 오딧 질문 플로우(AuditLegacy, 25문항 자유 서술)는 캐논 분기에서 렌더되지 않는다.

기능 · 필수 컨트롤:
- 시대 카드 탭 → router.push('/interview', {period: ERA_PERIOD[era]}) — 유아기/아동기/청소년기→teens, 청년기→20s, 현재→current
- 탑앱바 뒤로가기 → router.back()

담아야 할 정보 묶음(구성 자유): 헤더 · 시대 타임라인

4-상태: empty: 해당 없음 — 고정 시대 목록 (데이터 무관 내비게이션 화면) / loading: 없음 / error: 없음 / filled: 항상 동일: 헤더 + 시대 타임라인 5카드

게이팅(불변): auth: 캐논 분기 자체는 게이트 없음 (다음 화면 /interview가 auth + 프로필 게이트 수행) · tier: 없음 · minor: 없음 (interview에서 처리) · consent: 없음 (interview에서 처리)
안전(불변): 정직한 밝기: 프로토의 시대별 '또렷함 L{n}' 고정 상수는 2026-07-21 로직 감사에서 제거(조작된 밝기 금지). LLM 호출 없음.
이동 대상: /interview?period=teens, /interview?period=20s, /interview?period=current

카피(원문 고정):
- 성장 · 과거의 나
- 과거의 나
- 시기를 골라 그때의 당신을 다시 떠올려봐요.
- 유아기 0–6세
- 아동기 7–12세
- 청소년기 13–18세
- 청년기 19–28세
- 현재 지금