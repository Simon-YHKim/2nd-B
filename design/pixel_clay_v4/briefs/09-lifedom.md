# 성장 · 건강 · 휴식 · 관계 도메인 — 화면 브리프 (7개)

> 00-SYSTEM.md의 토큰·위계·자유도 계약이 전제. 아래 "기능·필수 컨트롤"은 존재해야 하는 것의 목록이며 배치·순서·형태는 자유.

## 나의 변화 (`/growth`) — windowed
목적: 주간 성장 리뷰. star_tier_history + 루틴 완료 로그 + 마일스톤 + 기록 수를 합성해 '이번 주 vs 지난주'의 별 밝기 변화를 보여주고, 가장 많이 자란 별 하나를 히어로로 세운다. 자기 이해 ↔ 개인 비서 피드백 루프를 닫는 화면: 관찰 문장과 '다음 한 걸음'을 제안하고 사용자가 탭하면 루틴으로 저장된다(LLM 없음, 결정적 합성).

기능 · 필수 컨트롤:
- 근거 칩 탭 ({별} ↑ ›) → 히어로 별의 렌즈 라우트로 push. 매핑: now→/big-five, recall→/interview, seen→/persona, rhythm→/esm, relational→/attachment, possible→/imagine, values→/audit
- '루틴으로 담기' 탭 → createRoutineFromRecommendation(userId, 별별 도메인, {title: 다음 걸음 문구, reason: 관찰 문구, 매일 09:00, recurrence daily}) → ops_routines INSERT. 성공 시 라벨 '담았어요' + disabled
- '이번 주 상상 한 조각을 첫 걸음으로?' 행 탭 → router.push('/imagine')
- '별 다시 살펴보기' 탭 → startTask 백그라운드 재수집(gatherWeeklyGrowth) — 화면 이탈해도 계속, 완료 토스트 '결과 보기'
- '오늘 기록 담기' (첫 주) → router.push('/capture')
- '루틴 하나 시작하기' (첫 주) → router.push('/ops')
- 상단 앱바 back → router.back()

담아야 할 정보 묶음(구성 자유): 히어로: 이번 주의 별 · 북두칠성 비교 SVG · 지표 칩 행 · 관찰 카드 (세컨비 코멘트) · 상상→걸음 행 · 재분석 고스트 버튼 · 첫 주 상태 (hasPriorWeek=false)

4-상태: empty: 첫 주(비교 대상 없음): hollow 별자리 + '첫 변화는 다음 주에' + capture/ops CTA / loading: OpsState variant=empty, title '…', body '변화를 모으는 중…' / error: OpsState variant=error '잠시 불러오지 못했어요 / 조금 뒤에 다시 볼게요' / filled: 히어로 + 비교 SVG + 지표 칩 + 관찰 카드 + 상상 행 + 재분석 버튼

게이팅(불변): auth: userId 없으면 gather 스킵(빈 상태), 리다이렉트는 없음 · tier: 없음 · minor: 없음 · consent: 없음
안전(불변): LLM 호출 없음(결정적 합성만). AI 제안은 사용자가 '루틴으로 담기'를 탭해야만 저장되는 propose→ratify 패턴. 주의: 이 화면의 7별은 stars.ts의 심리 구성(Layer B) id(now/recall/seen/rhythm/relational/possible/values)를 북두칠성 시각 언어로 표시한다 — 홈 7도메인 별과 이름이 다름. 재설계 시 canon(7 생활 도메인) 정렬 여부는 Simon 결정 필요.
이동 대상: /big-five, /interview, /persona, /esm, /attachment, /imagine, /audit, /capture, /ops, /growth(재분석 결과)

카피(원문 고정):
- 나의 변화
- 이번 주의 별
- 밝기 +{n}단계
- 가장 환한 별
- 지난주
- 이번주
- 기록
- 루틴 연속
- 완료율
- 마일스톤
- 루틴으로 담기
- 담았어요
- 이번 주 상상 한 조각을 첫 걸음으로?
- 별 다시 살펴보기
- 별을 다시 살펴보는 중
- 끝나면 알려줄게요. 앱은 그대로 써도 돼요.
- 첫 변화는 다음 주에
- 이번 주 기록과 루틴을 채우면 일요일에 너의 별이 얼마나 밝아졌는지 보여줄게요.
- 오늘 기록 담기
- 루틴 하나 시작하기
- 한 주만 채우면 변화가 보여요.
- 지난주와 비교했어요.
- 지금의 나를 자주 들여다본 한 주였어요.
- 하루의 리듬이 또렷해졌어요.
- 관계를 자주 떠올린 한 주였어요.
- 미래를 자주 그린 한 주였어요. 그 그림에 작은 일정 하나를 더해볼까요?
- 무엇이 중요한지 자주 돌아봤어요.
- 오늘 한 줄 돌아보기
- 같은 시간에 한 가지 하기
- 한 사람에게 안부 전하기
- 미래 계획 한 줄 적기
- 가치 한 가지 실천하기

## 휴식 (`/rest`) — museumLike
목적: 휴식 도메인 렌즈의 데이터 입력 보드. 나를 쉬게 하는 것들(게임·영화·음악·여행·공연·취미)을 '하고 싶어요/하는 중/했어요' 3상태 보드로 담는다. recreation_items의 첫 실제 쓰기 화면이며, 휴식 별의 밝기가 이 데이터를 접어 계산된다.

기능 · 필수 컨트롤:
- '휴식 담기'/'닫기' 버튼 탭 → 인라인 추가 폼 토글
- 종류 칩 탭 → category 단일 선택
- 상태 세그먼트 탭 → status 선택
- '담기' 탭 → createRecreationItem(userId,{title,category,status}) → recreation_items INSERT → 폼 닫고 리스트 새로고침. 실패 시 인라인 에러 문구
- 앱바 back → router.back()

담아야 할 정보 묶음(구성 자유): 헤더 행 · 추가 폼 (adding=true일 때만) · 상태별 그룹 리스트

4-상태: empty: outlined 카드: '아직 담긴 휴식이 없어요. 요즘 나를 쉬게 하는 것부터 담아 보세요. 휴식 별이 밝아져요.' / loading: auth 로딩: 중앙 PremiumLoadingState '불러오는 중이에요…' / 목록 로딩: PremiumLoadingState '펼치는 중…' / error: list 실패는 빈 배열로 강등(콘솔 경고만) → empty 상태로 보임; 저장 실패는 폼 내 인라인 문구 / filled: 상태별 3그룹 카드 리스트

게이팅(불변): auth: userId 없으면 <Redirect href="/sign-in" /> · tier: 없음 · minor: 없음 · consent: 없음
안전(불변): 쓰기는 전부 사용자 탭 뒤에서만. LLM 없음.
이동 대상: (back만)

카피(원문 고정):
- 휴식
- 휴식 담기
- 닫기
- 무엇인가요? (필수)
- 예: 젤다, 제주 여행, 피아노
- 종류
- 게임
- 영화
- 음악
- 여행
- 공연
- 취미
- 그 밖에
- 상태
- 하고 싶어요
- 하는 중
- 했어요
- 담기
- 저장 중…
- 저장하지 못했어요. 다시 시도해 주세요.
- 펼치는 중…
- 아직 담긴 휴식이 없어요. 요즘 나를 쉬게 하는 것부터 담아 보세요. 휴식 별이 밝아져요.
- 평점 {{rating}}/5

## 내 책장 (`/reading`) — windowed
목적: 독서·학습 책장. Google Books 검색으로 실제 책을 찾아 '읽고 싶은 책'에 담고, '읽는 중'으로 옮기면 진행률 히어로가 생기며, 다 읽으면 완료 처리한다. reading_list ops 도메인(개인 비서 축)의 관리 화면.

기능 · 필수 컨트롤:
- 검색어 입력 후 제출 → searchBooks(q) — Google Books Volumes API(키 불필요, https 강제, 방어적 파싱) → 결과 행 렌더. 실패 시 빈 결과
- 검색 결과 행 탭 (＋ 담기) → addToShelf(userId, book, 'want') → ops_reading INSERT → 책장 reload. 실패 시 저장 실패 배너
- '읽는 중으로' 칩 탭 → setShelfStatus(entry,'reading') → NOW READING 히어로로 승격
- '다 읽었어요' 칩 탭 → setShelfStatus(entry,'done')
- 앱바 back → router.back()

담아야 할 정보 묶음(구성 자유): 저장 실패 배너 (조건부) · 검색 행 · NOW READING 히어로 (읽는 중 1권 있을 때) · 검색 결과 (results>0) · 읽고 싶은 책 리스트

4-상태: empty: OpsState empty '아직 추천이 없어요' 계열이 아니라 reading 전용: title '아직 추천이 없어요'(emptyTitle) + body '무슨 책을 읽고 있나요?' / loading: OpsState empty title '…' body '기록이 쌓이면 걸음을 골라줄게요' / error: OpsState error '잠시 불러오지 못했어요 / 네트워크를 확인해 주세요' + '다시 시도' CTA(reload) / filled: 히어로 + want 리스트 (+검색 결과)

게이팅(불변): auth: userId 없으면 빈 책장으로 렌더(리다이렉트 없음) · tier: 없음 · minor: 없음 · consent: 없음
안전(불변): LLM 없음(C1/C3/C9 표면 아님). 외부 링크·이미지는 https 강제 + 길이 캡.
이동 대상: (back만)

카피(원문 고정):
- 내 책장
- 제목 · 저자 검색
- NOW READING
- 읽고 싶은 책
- 담기
- 무슨 책을 읽고 있나요?
- 읽는 중으로
- 다 읽었어요
- 저장하지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.
- 잠시 불러오지 못했어요
- 네트워크를 확인해 주세요
- 다시 시도

## 관계 (`/people`) — museumLike
목적: 관계 도메인 렌즈의 인물맵. 중심=나, 사람들은 가까움(1~5)에 따라 중심에 가깝게 궤도에 놓이고 6개 관계 섹터(가족/파트너/친구/동료/멘토/그 밖에)로 각도가 나뉜다. 점을 탭하면 인물 상세 카드, 추가 폼은 relation_people의 첫 쓰기 표면 — 관계 별의 밝기가 이 데이터를 접어 계산된다.

기능 · 필수 컨트롤:
- '사람 담기'/'닫기' 탭 → 추가 폼 토글
- '담기' 탭 → createPerson(userId,{display_name,relation_kind,closeness}) → relation_people INSERT → 폼 닫고 맵 새로고침
- 인물 노드(원) 탭 → 선택 토글 — 선택 시 링 하이라이트 + 아래 상세 카드 표시, 재탭 시 해제
- 관계 칩/가까움 세그먼트 탭 → 폼 값 선택
- 앱바 back → router.back()

담아야 할 정보 묶음(구성 자유): 헤더 행 · 추가 폼 (adding=true) · 인물맵 SVG · 선택 인물 상세 카드 (selected) · 범례

4-상태: empty: outlined 카드: '아직 담긴 사람이 없어요. 가까운 사람부터 하나씩 담아 보세요. 관계 별이 밝아져요.' / loading: auth: PremiumLoadingState '불러오는 중이에요…' / 맵: '지도를 펴는 중…' / error: list 실패는 빈 배열 강등 → empty 표시; 저장 실패는 폼 인라인 문구 / filled: 인물맵 SVG + (선택 시) 상세 카드 + 범례

게이팅(불변): auth: userId 없으면 <Redirect href="/sign-in" /> · tier: 없음 · minor: 없음 · consent: 타인 정보 최소 수집 고지 문구를 폼에 상시 노출
안전(불변): 타인 실명·개인정보 최소화 원칙(프라이버시 캡션). 카카오 임포트 경로에서는 별-이름 별칭으로 실명 무저장(star-alias) — 이 화면 자체는 사용자가 직접 적은 표시명만 저장.
이동 대상: (back만)

카피(원문 고정):
- 관계
- 관계 인물맵
- 사람 담기
- 닫기
- 이름 또는 부르는 말
- 예: 어머니, 준호
- 가까움 {{closeness}}/5
- 담기
- 저장 중…
- 저장하지 못했어요. 다시 시도해 주세요.
- 타인 정보는 내 기억을 위한 최소한만. 내 계정에만 저장돼요.
- 지도를 펴는 중…
- 아직 담긴 사람이 없어요. 가까운 사람부터 하나씩 담아 보세요. 관계 별이 밝아져요.
- 나
- 가족
- 파트너
- 친구
- 동료
- 멘토
- 그 밖에
-  · 연락 {{cadence}}
-  · 마지막 {{date}}

## 통화 녹음 (`/call-reflection`) — windowed
목적: 내 통화를 스피커폰 마이크로 직접 녹음해 텍스트로 받아 적고, 원본 음성은 즉시 삭제한 뒤 텍스트만 기록(위키)에 담는 화면. OS가 통화 오디오 스트림 캡처를 막으므로 '사용자가 시작하는 스피커폰 녹음'이 유일한 정직한 경로이며 UI가 이를 그대로 말한다. idle → rec → stt → result 4단계.

기능 · 필수 컨트롤:
- '녹음 시작' 탭 → 웹이면 notice '웹에서는 녹음이 불안정해요. 앱에서 이용해 주세요.' / 마이크 권한 요청 → 거부 시 '마이크 권한이 필요해요.' / 허용 시 expo-audio 녹음 시작, 타이머 0부터, phase=rec
- '녹음 멈추고 분석' 탭 → 녹음 정지 → base64 변환 → transcribeAudio(Gemini, purpose voice_transcribe, C9 게이트) → 레드존이면 idle 복귀+CrisisRouter / 빈 텍스트면 '받아 적을 말이 없었어요.' / 성공 시 phase=result. finally에서 discardRecording으로 임시 오디오 삭제(위기·빈·오류 경로 포함)
- '취소 · 저장 안 함' 탭 → 녹음 정지 + 임시 오디오 삭제 + phase=idle, 타이머 리셋
- '승인하고 위키에 담기' 탭 → createRecord({kind:'note', body:transcript, topic:'통화 기록', tags:['call_reflection','voice'], structured call_reflection}) → router.push('/records')
- '버리기' 탭 → router.push('/') — 저장 안 함
- '다음에 할게요' 탭 → router.push('/settings')
- '돌아가기' (차단 상태) → router.back()

담아야 할 정보 묶음(구성 자유): 차단 상태 (KO 로케일 아님 또는 미성년) · idle 히어로 · idle 푸터 · rec (녹음 중) · stt (받아 적는 중) · result (받아 적음) · 위기 모달 (전 페이즈 공통)

4-상태: empty: idle 히어로 (기본 상태) / loading: stt 페이즈: dots 로더 + '통화를 받아 적는 중' / error: notice 인라인 문구(시작 실패/권한/파일 없음/받아 적기 실패) 후 idle 복귀 / filled: result 페이즈: transcript 카드 + 승인/버리기

게이팅(불변): auth: userId 없으면 <Redirect href="/sign-in" /> · tier: 없음 · minor: 미성년 차단 (isMinor=true → 차단 화면) · consent: KO 로케일 외 차단(관할 신호=로케일). 상대에게 알리라는 '예의' 고지 상시 노출 · jurisdiction: 한국 1당사자 동의 전제 — KR 로케일 성인 한정 (Simon 결정 2026-07-06)
안전(불변): C9: 레드존 transcript는 서버에서 위기 템플릿으로 치환되어 오며 저장하지 않고 CrisisRouter 핫라인으로 라우팅. 원본 음성은 모든 종료 경로에서 삭제(프라이버시 약속 이행). 저장은 명시적 '승인' 탭에서만(propose→ratify).
이동 대상: /records, /, /settings, /sign-in

카피(원문 고정):
- 통화 녹음
- 지금은 이용할 수 없어요
- 통화 녹음은 녹음 관련 법규가 지역마다 달라, 현재 한국 지역의 성인 이용자에게만 제공돼요.
- 돌아가기
- 내 통화를 받아 적어 세컨비가 어울리는 별로 엮어요. 원본 음성은 저장하지 않아요.
- 방법
- 통화를 스피커폰으로 두고 녹음을 시작하면 양쪽 목소리가 함께 담겨요.
- 예의
- 내가 낀 통화만 녹음돼요. 상대에게 녹음을 알려 주세요.
- 녹음 시작
- 다음에 할게요
- 통화를 녹음하고 있어요. 끝나면 자동으로 받아 적어요.
- 녹음 멈추고 분석
- 취소 · 저장 안 함
- 통화를 받아 적는 중
- 음성을 텍스트로 바꾸고 있어요. 원본 녹음은 곧 삭제돼요.
- 받아 적었어요
- 받아 적은 통화
- 버리기
- 승인하고 위키에 담기
- 원본 음성은 저장하지 않았어요. 텍스트만 남아요.
- 웹에서는 녹음이 불안정해요. 앱에서 이용해 주세요.
- 마이크 권한이 필요해요.
- 받아 적을 말이 없었어요.
- 받아 적기에 실패했어요.
- 통화 기록

## 이번 주 식단 (`/meals`) — windowed
목적: 주간 식단 그리드. 월~일 x 아침/점심/저녁 셀을 탭해 끼니를 입력하고, 식약처(MFDS) 식품영양성분 DB에서 아이디어 칩을 제안받는다. weekly_meals/simple_meals ops 도메인(개인 비서 축)의 관리 화면. 영양 수치는 참고용이며 식이·의료 조언이 아니라는 고지를 상시 노출.

기능 · 필수 컨트롤:
- ‹ / › 탭 → weekStart를 ±7일 이동, 해당 주 데이터 재로드
- 그리드 셀 탭 → 바텀시트 오픈(기존 값 프리필) + searchFoods(로케일별 시드 검색어)로 아이디어 로드
- 아이디어 칩 탭 → 입력값을 그 음식명으로 교체
- '저장' 탭 또는 키보드 done → setMeal(userId, date, slot, title) → ops_meal_plan upsert → 그리드 reload, 시트 닫힘. 빈 값이면 그냥 닫힘. 실패 시 저장 실패 배너
- backdrop 탭 → 시트 닫힘(저장 안 함)
- 앱바 back → router.back()

담아야 할 정보 묶음(구성 자유): 저장 실패 배너 (조건부) · 주 내비게이션 · 7x3 식단 그리드 · 영양 고지 · 끼니 입력 바텀시트 (Modal, slide)

4-상태: empty: 모든 셀이 '＋' — 별도 empty 화면 없음(그리드 자체가 empty 상태를 표현) / loading: useAsync loading 동안 그리드는 빈 셀로 렌더 / error: read 오류 시에도 그리드는 빈 주로 렌더(강등); write 실패는 배너 / filled: 채워진 셀에 끼니 제목

게이팅(불변): auth: userId 없으면 빈 주로 렌더(리다이렉트 없음) · tier: 없음 · minor: 없음 · consent: 없음
안전(불변): 의료·식이 조언 아님 고지 상시(어휘 정책 준수: plan/idea 프레이밍). LLM 없음, 결정적 공공데이터 소스.
이동 대상: (back만)

카피(원문 고정):
- 이번 주 식단
- 지난 주
- 다음 주
- 아침
- 점심
- 저녁
- 끼니 입력
- 아이디어
- 저장
- 영양 수치는 참고용이에요 · 식이·의료 조언이 아닙니다.
- 지금 뭐 먹지?
- 저장하지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.

## 일일 집중 (`/focus`) — windowed
목적: 포모도로 집중 타이머. 한 번에 하나의 별(성장/커리어/학습/관계/건강)을 골라 집중 세션을 돌리고, 블록이 끝나면 daily_focus 루틴이 자동 체크되며(센서 자동완료 패턴) 기기 로컬 알림이 1회 울린다. AI 없음, 마이그레이션 없음 — 하루 목표 4회 요약까지 한 화면에서.

기능 · 필수 컨트롤:
- '집중 시작' / '일시정지' 탭 → 포모도로 상태기계 start/pause. 1초 인터벌 하나로 tick (ANDROID_QA §4: 미실행 시 인터벌 해제)
- '리셋' 탭 → reset — idle 프리셋 길이로 복귀
- 프리셋 칩 탭 (idle에서만) → focusMinutes 변경, 새 idle 블록 생성
- 별 칩 탭 → starIdx 선택 + AsyncStorage 영속. 세션 중 변경도 완료 시점에 반영(ref)
- 집중 블록 완료 (자동) → 새 idle 블록으로 복귀(휴식 페이즈 없음) + doneToday/doneByStar 증가(AsyncStorage 일자 키 영속) + applyFocusSessionComplete(userId)로 daily_focus 루틴 완료 기록(ops_routine_logs) + notifyNow 로컬 알림 '집중 블록 완료 / 잘했어요. {별} 별에 집중 1회를 담았어요.'
- 앱바 back → router.back() — 타이머는 화면 상태이므로 이탈 시 정지

담아야 할 정보 묶음(구성 자유): 리드 문장 · 타이머 링 · 프리셋 칩 행 · 컨트롤 행 · 어떤 별을 위해? (별 선택) · 오늘 요약 카드

4-상태: empty: idle: 링 가득 비움(준비됨) + 오늘 0회 요약 / loading: auth 로딩: DockShell + GraphLoading / error: 루틴 체크/알림 실패는 조용히 무시(best-effort) — 화면 오류 상태 없음 / filled: 실행/일시정지 링 + 오늘 n회 요약 + 별별 카운트

게이팅(불변): auth: userId 없으면 /sign-in 리다이렉트; hasProfile=false면 /complete-profile 리다이렉트 · tier: 없음 · minor: 없음 · consent: 없음
안전(불변): AI 없음. 자동완료는 결정적 센서 패턴(운동 기록이 exercise_routine을 체크하는 것과 동일). 별 탤리는 기기 로컬.
이동 대상: /sign-in, /complete-profile

카피(원문 고정):
- 일일 집중
- 한 가지에만 집중하는 시간이에요. 끝나면 
- {{star}} 별
- 에 한 걸음.
- 준비됨
- 집중 중
- 일시정지
- {{min}}분
- 집중 시작
- 리셋
- 어떤 별을 위해?
- 성장
- 커리어
- 학습
- 관계
- 건강
- 오늘 {{sessions}}회 집중
- 약 {{min}}분 · 목표 {{goal}}회
- {{star}} 별 · 오늘 {{n}}회
- 집중 블록 완료
- 잘했어요. {{star}} 별에 집중 1회를 담았어요.