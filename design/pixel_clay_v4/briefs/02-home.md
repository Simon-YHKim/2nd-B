# 홈 별자리 · 별 렌즈 — 화면 브리프 (6개)

> 00-SYSTEM.md의 토큰·위계·자유도 계약이 전제. 아래 "기능·필수 컨트롤"은 존재해야 하는 것의 목록이며 배치·순서·형태는 자유.

## 홈 · 별자리 (`/`) — immersive
> [방향 변경] 2026-08-10 방향 (Simon 결정, 디자인 반영): 별자리의 7번째 슬롯(구 뮤지엄 자리)은 "커뮤니티" 별로 교체한다. 커뮤니티 별은 도메인이 아니므로 밝기 L1~L5가 없고 북극성 평균·all-lit 보너스에서 제외(뮤지엄 포탈과 동일 규칙) — 밝기 정직성 불변. 뮤지엄은 홈 한쪽 구석의 코너 버튼(인박스 벨과 동일 문법: 40px 원형, rgba(20,30,52,.7) 배경, museum 글리프)으로 진입한다. 구현 시 DESIGN.md·PRD의 홈 슬롯 결정(2026-07-29)을 이 결정으로 갱신할 것.
목적: 앱의 유일한 프로덕션 홈. 사용자의 삶을 3계층 별자리(북극성 = 종합 출력, 북두칠성 6도메인 별 + 뮤지엄 포털 = 입력, 숨은 레이어 B는 비표시)로 렌더링하고, 고정된 세컨비 캐릭터 머리와 말풍선이 안내자 역할을 한다. 별 밝기는 실제 기록량(L1~L5)에서만 계산되는 '정직한 밝기'이며, 여기서 모든 핵심 여정(도메인 렌즈, 북극성, 담기, 챗, 비서, 리즈닝)이 출발한다.

기능 · 필수 컨트롤:
- 도메인 별/뮤지엄 별 탭 → 말풍선이 star 상태로 전환(별 이름 + 질문 + 여행하기/다음에), AccessibilityInfo로 별 이름 안내. 내비게이션 없음(원탭 = 화면 단순화)
- star 말풍선의 [여행하기] → 도메인 → router.push('/star/<domain>'), 뮤지엄 → router.push('/museum')
- 북극성 탭 → 말풍선 intro 복귀 + router.push('/core-brain')
- 세컨비 머리 탭 → 말풍선 상태 순환: intro → reasoning → menu → intro
- menu 말풍선 [챗봇] → router.push('/secondb')
- menu 말풍선 [비서] → router.push('/ops')
- reasoning 말풍선 [자료 선택]/[진행 화면 보기]/[자동 설정] → router.push('/reasoning')
- reasoning depleted [광고 보고 N회 받기] → ReasoningLimitSheet 오픈(전체 rewarded 게이트는 시트가 적용)
- reasoning depleted [플랜 보기] → router.push('/plans?from=reasoning_limit')
- 좌상단 벨 탭 → router.push('/inbox')
- 우상단 공지 벨 탭 → NoticeDialog 수동 오픈(최신 미읽음 우선)
- 독 탭 선택 → router.replace(해당 루트)
- 코치마크 [다음]/[시작하기]/[다시 보지 않기] → 단계 전진 / 종료(markCoachmarksSeen 영구 저장)

담아야 할 정보 묶음(구성 자유): 배경 (스테이지) · 좌상단 인박스 벨 · 우상단 공지 벨 · 별자리 박스 · 세컨비 머리 + 말풍선 · 하단 독 (DeepSpaceScreen 공유 셸) · 오버레이: 홈 코치마크 (첫 방문 1회) · 오버레이: 공지 다이얼로그

4-상태: empty: 모든 도메인 L1 기본값의 '정직한 빈 하늘' — 별이 어둡게(0.49 불투명도), 북극성 밝기 0.2 기본. 별도 빈 카드 없음(코치마크가 첫 안내 담당) / loading: 인증/온보딩/TTFV 게이트가 해소될 때까지 InlineLoader (홈 플래시 방지). 밝기 로딩 중엔 빈 하늘로 먼저 렌더 / error: loadDomainLevels 실패 시 조용히 빈 하늘 유지(블록 없음). 공지/리즈닝 조회 실패는 fail-open / filled: 기록이 쌓인 도메인 별이 L에 비례해 밝아지고 북극성은 6개 도메인 평균(+전부 L2 이상이면 0.05 보너스)으로 밝아짐

게이팅(불변): auth: 미로그인 → /sign-in 리다이렉트. 프로필 없음 → /complete-profile (probe 실패 시 로더로 홀드) · onboarding: 미완료 → /onboarding. 첫날 TTFV 미시청 → /ttfv 1회 자동 리다이렉트 · tier: 리즈닝 말풍선이 주간 기본/보상 횟수 표시, 소진 시 플랜/광고 유도 · minor: 미성년(isMinor)에게는 rewarded 광고 버튼 미노출
안전(불변): AI 제안은 비준 전 별을 밝힐 수 없음(정직한 밝기 계약). 리즈닝 카운터는 챗 카운터와 분리. 미성년 rewarded 광고 금지. 가짜 unread 점 금지.
이동 대상: /star/[domain], /museum, /core-brain, /secondb, /ops, /reasoning, /inbox, /notices, /plans, /capture, /records, /settings

카피(원문 고정):
- 북극성
- 커리어 · 재정 · 성장 · 관계 · 건강 · 휴식 · 뮤지엄
- 안녕하세요, 저는 세컨비예요. 머리를 누르면 도와드릴게요.
- 어떻게 도와드릴까요?
- 여행하기 / 다음에 / 챗봇 / 비서
- 커리어: 무엇을 만들고 쌓아왔나요?
- 재정: 돈은 나의 무엇을 말해주나요?
- 관계: 가까운 사람들과 나는 어떤가요?
- 성장: 어느 시기가 지금의 나를 만들었나요?
- 건강: 요즘 내 컨디션과 리듬은요?
- 휴식: 무엇이 나를 쉬게 하나요?
- 뮤지엄: AI가 걸어온 길을 거닐며, 세컨비가 나를 이해하는 원리도 함께 배워요.
- 이번 주 {n}회 남았어요. 어떤 자료를 이을까요?
- 이번 주 기본 횟수를 다 썼어요. 월요일에 다시 채워져요.
- 광고 보고 {n}회 받기 / 플랜 보기 / 자료 선택 / 자동 설정 / 진행 화면 보기
- 코치마크: 여기는 별자리예요 → 별을 눌러보세요 → 떠오르면 담기 → 설정엔 더 많은 도구가 있어요
- 다시 보지 않기 / 다음 / 시작하기
- 독: 별자리 · 담기 · 세컨비 · 위키 · 설정

## 도메인 별 렌즈 (`/star/[domain]`) — museumLike
목적: 홈 별자리에서 도메인 별을 '여행하기'로 열었을 때의 도메인별 렌즈 화면. 7개 삶 도메인(career·finance·growth·relation·health·recreation·collect) 각각이 고유한 시각 문법(타임라인·가계·관계 지도·챕터·건강 링·휴식 사분면·정리 대기)을 가진다. 세컨비 브리핑은 실제 기록 수 기반의 정직한 문장만 쓰며(프로토의 조작된 분석 금지), 구조화 데이터가 없으면 시각 틀을 유지한 채 빈 상태를 말한다.

기능 · 필수 컨트롤:
- 뒤로가기 → router.back()
- primary 액션 버튼 → router.push('/capture-full', { tag: 'domain:<id>' }) — 별 문맥의 도메인 태그를 강제 부착
- secondary 액션 버튼 → 도메인별 전용 화면으로 push (/career-drilldown, /ledger, /audit, /people, /import, /rest, /records)
- 타임라인 기록 행 탭 → router.push('/record/[id]')
- 관계 지도 탭 → router.push('/people')
- 로드 실패 카드 [다시 시도] → records + 레벨 재조회
- 렌즈 빈 상태의 텍스트 버튼 → 각 데이터 원본 화면으로 push

담아야 할 정보 묶음(구성 자유): 상단 앱바 (museumLike 스크림) · 세컨비 브리핑 카드 · 액션 페어 · 도메인 렌즈: career (CareerLens) · 도메인 렌즈: finance (FinanceLens) · 도메인 렌즈: relation (RelationLens) · 도메인 렌즈: growth (GrowthLens) · 도메인 렌즈: health (HealthLens) · 도메인 렌즈: recreation (RecreationLens) · 도메인 렌즈: collect (CollectLens)

4-상태: empty: 브리핑 '이 별엔 아직 기록이 없어요…' + 각 렌즈의 시각 틀 유지형 빈 안내 + 원본 화면 CTA / loading: 브리핑 '이 별을 펼치는 중이에요…' + PremiumLoadingState('불러오는 중…'); 구조화 렌즈는 ProgressLinear + '실제 기록으로 렌즈를 맞추는 중이에요.' / error: 기록 실패: '잠깐 못 불러왔어요. 다시 시도해 주세요.' + [다시 시도]. 구조화 실패: '전용 기록을 잠깐 불러오지 못했어요. 원본 화면에서 다시 확인해 주세요.' + [기록 전체 보기]→/records / filled: 브리핑 N건 문장 + 도메인 고유 렌즈에 실데이터

게이팅(불변): auth: 미로그인 → /sign-in. 잘못된 domain 슬러그 → / 리다이렉트 · minor: 해당 없음 · consent: 건강 데이터는 디바이스 연동 동의 경로(/import)를 통해서만 유입
안전(불변): 브리핑에 조작된 통계 금지(실카운트 또는 중립 문구만). L 레벨은 기록량 기반, LLM 무관. Android 규율: 리스트 8개 바운드, 관계 SVG 24노드 캡, 애니메이션 SVG 필터 없음.
이동 대상: /capture-full, /career-drilldown, /career, /ledger, /audit, /people, /import, /import-hub, /rest, /records, /record/[id]

카피(원문 고정):
- 이 별에 {n}개의 기록이 담겼어요. 최근 기록부터 정리했어요.
- 이 별엔 아직 기록이 없어요. 담으면 세컨비가 흐름을 읽어드려요.
- 성과 입력 / Drill Down / 내역 입력 / 가계 보기 / 장면 담기 / 회상하기 / 사람 담기 / 사람 지도 / 기록 담기 / 데이터 연결 / 휴식 담기 / 휴식 지도 / 담기 / 기록 보기
- 쌓아온 길 / 이번 달 가계 / 나의 사람들 / 기록의 시간대 / 오늘의 건강 기록 / 수면 기록의 흐름 / 휴식 지도 / 정리 대기
- 가까움은 중심과의 거리, 관계 종류는 별빛 색으로 보여요.
- 밝기는 확인이 아닌 기록량: 헤더 게이지 L1~L5

## 북극성 문장 (`/northstar`) — windowed
목적: 레이어 C 출력인 한 줄 북극성 정체성 문장의 propose→ratify 에디터. 바이올렛 'NORTH STAR' 히어로 카드 자체가 인라인 에디터이며, 세컨비 제안은 사용자 본인의 기록에서만 생성되고 저장은 항상 사용자의 명시적 확정으로만 일어난다(이력 보존형 비준 원장).

기능 · 필수 컨트롤:
- 제안 카드 탭 → setDraft(문장) — 에디터 채움만, 저장 아님
- [다른 제안 받기] → 리즈닝 캡 확인 → 소진 시 router.push('/plans?from=northstar_limit'), 아니면 proposeNorthstarSentences 호출(1회 리즈닝 사용 + incrementReasoningUsage). null 반환 = thinBase 카드, 예외 = proposeError 카드
- [이 문장으로 저장] → saveNorthstar → records에 northstar_sentence 태그 note 신규 append(이력 보존). red zone이면 CrisisRouter 표시, 아니면 reactExpression('delight') + router.back()
- [취소] / 뒤로가기 → router.back()
- CrisisRouter 닫기 → 모달 닫힘 + router.back()

담아야 할 정보 묶음(구성 자유): 헤더 · NORTH STAR 히어로 카드 = 에디터 · 세컨비 제안 리스트 · 저장 액션 · CrisisRouter 모달

4-상태: empty: 에디터 placeholder만('나를 깊이 이해해 더 나답게 산다.'), 제안 리스트 없음 — [다른 제안 받기]로 시작 / loading: proposing 중 버튼 '생각 중' + disabled; saving 중 저장 버튼 스피너 / error: proposeError 카드(연결 문제) / thinBase 카드(기록 부족 — 별개 사실) / saveErr 라인. 실패해도 draft 보존 / filled: 현재 문장이 에디터에, 제안 카드 3안 내외, 선택 하이라이트

게이팅(불변): auth: 미로그인 → /sign-in · tier: 제안 1회 = 리즈닝 1회. free 캡 소진 시 /plans?from=northstar_limit. 무제한 티어는 게이트 없음(수량 게이트일 뿐 품질 게이트 아님) · minor: isMinor가 propose/save에 전달(미성년 프롬프트 클램프), 위기 핫라인 KR_1388 분기
안전(불변): C9 classifyInput 레드존 → CrisisRouter 핫라인 모달 필수. 제안은 사용자 기록 기반이며 기록 부족 시 인격 조작 금지(thinBase 정직 안내). 저장은 항상 사용자 확정(propose→ratify).
이동 대상: /plans?from=northstar_limit, (back) /core-brain

카피(원문 고정):
- 북극성 문장
- 일곱 별을 종합해 세컨비가 제안한 문장이에요. 당신의 언어로 다듬어보세요.
- 나를 깊이 이해해 더 나답게 산다.
- NORTH STAR
- 세컨비 제안 / 다른 제안 받기 / 생각 중 / 취소 / 이 문장으로 저장
- 아직 기록이 얕아서 제안하기 조심스러워요. 별가루 5개쯤 담기면 기록에서 문장을 길어올게요.
- 지금은 제안을 받아오지 못했어요. 연결을 확인하고 다시 시도해 주세요.
- 저장하지 못했어요. 문장은 그대로 있으니 다시 시도해 주세요.

## 밝기 변화 (`/brightness`) — windowed
목적: 8주 밝기 타임라인 + 정직성 미터. 하나의 메시지('하늘이 어떻게 변했나')를 히트맵 하나로 설명한다 — 북극성 행이 맨 위(티어1 도미넌트), 그 아래 관측된 별들, 주당 1셀. 정직성 미터는 이 별빛이 무엇으로 만들어졌는지(관측·근거 수)를 말하며 확신을 주장하지 않는다(별빛 ≠ 확신).

기능 · 필수 컨트롤:
- 뒤로가기 → router.back()
- [승인 이력 보기] → router.push('/ratifications')
- 빈 상태 [북극성으로 가기] → router.replace('/core-brain')

담아야 할 정보 묶음(구성 자유): 헤더 · 히트맵 카드 (유일한 그래픽) · 티어 변화 넛지 카드 (조건부) · 정직성 미터 카드

4-상태: empty: 관측 2건 미만: outlined 카드 '아직 변화를 그릴 기록이 부족해요. 점검을 마치고 제안을 승인하면 별의 궤적이 여기 쌓여요.' + [북극성으로 가기](tonal) / loading: auth 로딩: PremiumLoadingState('불러오는 중이에요…'); 데이터 로딩: '하늘을 살펴보는 중…' / error: 명시적 에러 표면 없음(로드 실패 시 로딩 표시 지속) — 재구현 시 개선 여지 / filled: 히트맵 + (있으면) 넛지 + 정직성 미터

게이팅(불변): auth: 미로그인 → /sign-in
안전(불변): 밝기는 확신이 아니라는 카피 고정(별빛 ≠ 확신). 타임라인 데이터는 비준(ratify)된 관측만 — AI 제안이 비준 없이 궤적을 바꿀 수 없다.
이동 대상: /ratifications, /core-brain

카피(원문 고정):
- 밝기 변화
- 8주 타임라인
- 8주 전 / 이번 주
- 이 별빛의 근거
- 관측 {obs}번 · 근거 있는 관측 {cited}번 · 별 {stars}개
- 밝기는 확신이 아니라 기록의 양이에요. 근거가 붙을수록 믿을 만해져요.
- 승인 이력 보기
- 아직 변화를 그릴 기록이 부족해요. 점검을 마치고 제안을 승인하면 별의 궤적이 여기 쌓여요.
- 북극성으로 가기

## 첫 빛 (첫날 자기 이해 한 컷) (`/ttfv`) — fullscreen
목적: 가입 첫날 정확히 1회 자동 표시되는 첫 통찰 화면(수동 방문도 가능, 보면 게이트 소진). 북두칠성 중 한 별(기본: 관계)의 가벼운 첫 읽기를 제안하고 사용자가 비준하는 propose→ratify 2단계 원컷 화면. 어떤 답이든 별은 사용자 동의로만 밝아진다는 제품 핵심 계약을 첫날 체험시킨다. LLM 호출 없음(정적 기본 인사이트).

기능 · 필수 컨트롤:
- 화면 마운트 → markTTFVSeen() — 자동 트리거 게이트 영구 소진(정확히 1회 보장)
- '이렇게 본 근거 2가지' 토글 → 근거 카드 2장 + 각주 펼침/접힘 (a11y expanded 상태)
- [맞아요] → ratify(false): ratify 단계 전환, 별 블룸 성장, records에 first_light 태그 note 저장('첫 통찰: "먼저 다가가는" - 맞아요', tags [first_light, first_light:affirm]) — fire-and-forget, 실패해도 화면 진행
- [조금 달라요] → ratify(true): soft 문구의 ratify 단계, tags [first_light, first_light:soft]로 저장 — 정정 자체가 신호
- [별자리로 들어가기] → router.replace('/')

담아야 할 정보 묶음(구성 자유): 타이틀 · 별자리 스테이지 (유일한 그래픽) · propose 단계 · ratify 단계

4-상태: empty: 해당 없음(정적 제안이 항상 존재) / loading: 해당 없음(즉시 렌더). 홈 게이트 쪽에서 hydration 대기 / error: 기록 저장 실패는 무시(첫 빛 순간을 막지 않음) / filled: propose ↔ ratify 2상태

게이팅(불변): auth: 게이트는 홈에서 처리(자동 트리거는 로그인+온보딩 완료 후). 직접 방문 시 userId 없으면 기록만 생략 · minor: createRecord에 minor 플래그 전달
안전(불변): propose→ratify 원칙의 원형: 어떤 AI 읽기도 사용자 동의 전에는 별을 밝히지 않는다. 근거는 날조 금지(가입 데이터가 없음을 정직하게 명시). L1→L2 상승은 명시적 비준으로만.
이동 대상: /

카피(원문 고정):
- 첫 빛
- 당신의 첫 별이 켜졌어요
- 당신은 ‘먼저 다가가는’ 사람일지도 몰라요.
- 관계 별부터 함께 켜볼까요? 담을수록 더 또렷해져요.
- 이렇게 본 근거 2가지
- 지금은 — 첫 별을 켜는 출발점이에요 / 앞으로 — 담을수록 진짜 근거가 쌓여요
- 아직 시작이라 가벼운 첫 읽기예요. 담을수록 근거가 쌓여요.
- 맞아요 / 조금 달라요
- 어떤 답이든, 별은 당신의 동의로만 밝아져요.
- 관계 별이 한 단계 밝아졌어요.
- 당신 말이 별을 더 정확하게 만들었어요.
- 담을수록 별이 또렷해지고, 7개가 모이면 북극성이 켜져요.
- 별자리로 들어가기

## 테마 · 글꼴 (`/theme`) — windowed
목적: 표시 설정 화면(딥스페이스 분기 = DeepSpaceThemeScreen, src/screens/deepspace/DeepSpaceDesignScreens.tsx:1327). 테마(딥스페이스/미드나잇), 글꼴(픽셀/읽기 편한), 모션 줄이기(라이트 모드)를 실제 ThemeContext·readable-font·lite-mode 설정에 읽고 쓴다. 파일 내 ThemeScreenLegacy는 legacy 전용으로 제외.

기능 · 필수 컨트롤:
- 테마 행 탭 → setMode('dark'|'light') — 즉시 저장
- 글꼴 행 탭 → setFontStyle('pixel'|'readable') — 즉시 반영
- 모션 줄이기 토글 → setLiteMode(!liteMode)

담아야 할 정보 묶음(구성 자유): 셸 + 상태 헤더 · 테마 카드 · 글꼴 카드 · 모션 카드

4-상태: empty: 해당 없음(항상 현재 설정 표시) / loading: 해당 없음(동기 컨텍스트) / error: 해당 없음 / filled: 선택된 행 하이라이트

게이팅(불변): auth: 셸 게이트 경유(설정 트리 하위)
안전(불변): 죽은 컨트롤 금지(글자 크기 슬라이더 미구현이라 미노출), 미드나잇 부분 적용을 정직하게 고지.
이동 대상: (back) /settings

카피(원문 고정):
- 테마 · 글꼴
- 보기 편한 테마와 글꼴을 골라요.
- 모션을 줄이면 화면이 더 차분해져요.
- 테마 / 딥스페이스 / 미드나잇
- 미드나잇은 아직 일부 화면에만 적용돼요. 딥스페이스 화면 적용은 준비 중이에요.
- 글꼴 / 읽기 편한 · Pretendard
- 모션 줄이기