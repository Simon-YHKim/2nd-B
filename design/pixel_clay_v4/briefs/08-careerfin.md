# 커리어 · 재정 도메인 — 화면 브리프 (5개)

> 00-SYSTEM.md의 토큰·위계·자유도 계약이 전제. 아래 "기능·필수 컨트롤"은 존재해야 하는 것의 목록이며 배치·순서·형태는 자유.

## 커리어 (`/career`) — museumLike
목적: 커리어 도메인 렌즈: domain:career 태그가 붙은 모든 기록을 연도별 타임라인으로 보여주고, 구조화된 '성과 담기' 폼으로 새 성과를 기록한다. 성과가 쌓일수록 홈 별자리의 커리어 별이 밝아진다(정직한 밝기 L1~L5). '쌓아온 길' 트랙으로 직접 담은 성과(메인)와 공식 이력(사이드, 연동 대기)을 구분한다.

기능 · 필수 컨트롤:
- 상단바 뒤로가기 탭 → router.back()
- 'Drill Down' 버튼 탭 → router.push('/career-drilldown')
- '성과 담기' / '닫기' 버튼 탭 → 성과 입력 폼 카드 토글
- 연도 입력이 4자리가 아님 → YearField error 상태 + '네 자리 연도로 적어 주세요' + 담기 버튼 disabled
- '담기' 탭 → createRecord(kind=note, tags=[career_achievement, domain:career, year:YYYY], body=composeAchievementBody(성과/역할/임팩트), topic=성과 80자)로 저장 → 성공 시 폼 초기화·닫기·목록 새로고침 / 실패 시 인라인 오류 문구, 내용 유지
- '메인'/'사이드' 탭 전환 → 타임라인 ↔ 공식 이력 안내 전환 (로컬 상태만)
- 타임라인 항목 카드 탭 → router.push('/record/[id]') — 기록 상세로 이동
- 로드 실패 카드의 '다시 시도' 탭 → records 재조회

담아야 할 정보 묶음(구성 자유): 상단 헤더 행 (headRow) · 성과 담기 폼 (adding=true일 때만, MdCard variant=outlined) · 쌓아온 길 헤더 + 트랙 탭 · 사이드 트랙 (track=side) · 메인 트랙 — 연도별 타임라인 (track=main)

4-상태: empty: MdCard outlined — '아직 커리어 별가루가 없어요. 지난 성과부터 하나 담아 보세요. 커리어 별이 밝아져요.' / loading: auth 로딩: PremiumLoadingState '불러오는 중이에요…' (중앙). rows=null: PremiumLoadingState '타임라인을 펴는 중…' / error: MdCard outlined — '타임라인을 잠깐 못 불러왔어요. 별가루는 그대로 있으니 다시 시도해 주세요.' + MdButton tonal '다시 시도' / filled: 연도별 그룹 타임라인 (연도 헤더 + 항목 카드 목록)

게이팅(불변): auth: userId 없으면 <Redirect href="/sign-in" /> · minor: isMinor가 createRecord로 전달됨(C10 위기 라우팅용) · tier: 없음 — 무료 기능
안전(불변): 저장은 전부 사용자 탭 뒤에서만(자동 실행 없음). C9 분류가 createRecord 내부에서 선행. 저장 실패는 침묵하지 않고 인라인으로 표시하며 입력 내용을 유지.
이동 대상: /career-drilldown, /record/[id], /sign-in (redirect)

카피(원문 고정):
- 커리어
- 커리어 타임라인
- 성과 담기
- 닫기
- 성과 (필수)
- 무엇을 해냈나요?
- 역할
- 그때 나의 역할
- 임팩트
- 무엇이 달라졌나요? 수치가 있다면 함께
- 연도
- 예: 2023 (비우면 오늘 기준)
- 네 자리 연도로 적어 주세요
- 저장하지 못했어요. 다시 시도해 주세요.
- 저장 중…
- 담기
- 쌓아온 길
- 메인
- 사이드
- 학력
- 병역
- 수상
- 자격
- 경력
- 학력·병역·수상·자격·경력 같은 공식 이력은 연동하면 여기에 자동으로 정리돼요. 지금은 메인에서 직접 담은 성과가 쌓여요.
- 타임라인을 펴는 중…
- 타임라인을 잠깐 못 불러왔어요. 별가루는 그대로 있으니 다시 시도해 주세요.
- 다시 시도
- 아직 커리어 별가루가 없어요. 지난 성과부터 하나 담아 보세요. 커리어 별이 밝아져요.
- 커리어 별가루
- (제목 없음)

## Drill Down (`/career-drilldown`) — windowed
목적: 커리어 성과를 3C(Customer·Company·Competitor = '왜 했는가')와 4P(Product·Place·Price·Promotion = '무엇을·어떻게')로 분해해 적는 구조화 입력 화면. 제출하면 내용을 기록으로 먼저 저장(사람이 읽는 body + 기계가 읽는 structured 페이로드)한 뒤, 세컨비 채팅(/secondb)에 시드를 넘겨 더 깊이 파고드는 대화로 이어진다. /career의 정형 '성과 담기'를 보완하는 정성 입력.

기능 · 필수 컨트롤:
- 경험 유형 버튼 탭 → 칩 그리드 열림/닫힘 토글 (expanded a11y state)
- 유형 칩 탭 → 선택/해제 토글 후 그리드 닫힘
- '세컨비와 Drill Down' 탭 → ① createRecord(kind=note, topic=한줄요약(비면 '커리어 경험'), body='요약\n유형: …\n라벨: 값…' 채운 필드만, tags=[career_drilldown], structured=composeStructured('career_3c4p', {summary, exp_type, …values})) 저장 → ② 성공 시 router.push('/secondb', {fromNode: 'Drill Down · {요약} · {유형}'}) — 세컨비 채팅 프리필. 저장 실패 시 이동하지 않고 오류 문구 표시, 입력 유지 (no-navigate-on-failed-save 테스트로 고정)

담아야 할 정보 묶음(구성 자유): 제목 · 세컨비 안내 카드 (intro) · 경험 개요 카드 (MdCard outlined) · 3C 밴드 — 왜 했는가 (Why) · 4P 밴드 — 무엇을 · 어떻게 (What + How) · 하단 고정 제출 바

4-상태: empty: 모든 필드 비어 있으면 제출 버튼 disabled — 별도 empty 뷰 없음(입력 화면) / loading: auth 로딩 중엔 null 렌더(빈 화면) / error: 저장 실패: 제출 바 위 danger 문구, 내용 보존, 재시도 가능 / filled: 필드 하나라도 채우면 제출 활성화

게이팅(불변): auth: userId 없으면 <Redirect href="/sign-in" /> · tier: 없음
안전(불변): 제출 = 사용자 탭. 저장 실패가 침묵으로 사라지지 않도록 내비게이션이 저장 성공에 종속(과거 결함 수정 이력 주석). C9 분류는 createRecord 내부에서 선행.
이동 대상: /secondb (fromNode 프리필), /sign-in (redirect)

카피(원문 고정):
- Drill Down
- 성과를 3C로 'Why', 4P로 'What·How'를 채워 분해해 볼게요. 다 적으면 이걸 토대로 제가 더 깊이 파고드는 질문을 드릴게요.
- 경험 한 줄 요약
- 어떻게 했고, 결과는? - 한 줄로
- 경험 유형 선택
- 학업
- 학교 프로젝트
- 교내 동아리
- 대외활동 (교외 동아리)
- 연구/개발
- 공모전/대회
- 인턴
- 아르바이트
- 계약직/파견직
- 정규 입사 경험
- 개인 사업/창업/사이드 프로젝트
- 왜 했는가
- 무엇을 · 어떻게
- 고객
- 자사
- 경쟁사
- 상품
- 위치
- 가격
- 마케팅
- 혜택을 받는 대상
- 대상이 필요로 한 것
- 내가 속했던 곳
- 본인(팀)의 목표
- 문제 · 원인 (혹은 기회 상황)
- 팀 내에서 나의 역할
- 조사한 대상
- 조사 후 적용한 내용
- 결과
- 결과의 의미
- 문제 해결을 할 수 있었던 장소 · 지점 · 채널
- 생산성 관점 (비용 감소 · 효율 · 시간 단축 등)
- 알리기 관점
- 세컨비와 Drill Down
- 저장하지 못했어요. 적은 내용은 그대로 있어요. 다시 시도해 주세요.
- 커리어 경험

## 목표 (`/milestones`) — windowed
목적: 배움/커리어 점검 두 도메인의 수동 마일스톤(목표) 관리 화면. 목표를 이름 붙여 추가하고, 마감일을 달고, 상태 칩 탭 한 번으로 계획→진행 중→완료를 순환시키며, 도메인별 진행률 바로 성장 흐름을 점검한다. Ops/비서 축(비전 2축)의 화면으로, 모든 쓰기는 사용자 탭 뒤에서만 일어난다.

기능 · 필수 컨트롤:
- 도메인 탭 전환 → listMilestones 재조회 (learning_goals ↔ career_check)
- 이름 입력 후 '＋ 기록 담기' 또는 키보드 done → createMilestone(userId, domain, {title, target_date}) → 성공 시 입력 초기화 + reload / 실패 시 저장 실패 배너
- 목표 제목 탭 → 인라인 편집 모드 진입(제목 + 마감일)
- 편집 '저장' → updateMilestone(title, target_date) → reload; 제목을 비우면 그냥 편집 종료
- 편집 '취소' → 편집 종료, 변경 폐기
- 마감일 '지우기' → 편집 중 due를 빈 값으로 (저장 시 null)
- 상태 칩 탭 → updateMilestone(status=next) — todo→doing→done→todo 순환 → reload
- 읽기 오류 카드 '다시 시도' → listMilestones 재시도
- 상단바 뒤로가기 → router.back() → /ops

담아야 할 정보 묶음(구성 자유): OpsFrame 셸 · 저장 실패 배너 (조건부) · 도메인 픽커 (OpsDomainPicker) · 진행률 헤더 · 목표 추가 폼 · 목표 리스트

4-상태: empty: OpsState empty — '아직 추천이 없어요' + body '목표' / loading: OpsState empty variant, title '…', body '기록이 쌓이면 걸음을 골라줄게요' / error: OpsState error — '잠시 불러오지 못했어요' / '네트워크를 확인해 주세요' + CTA '다시 시도' / filled: 진행률 헤더 + 목표 행 리스트; 쓰기 실패 시 리스트 유지 + 상단 저장 실패 배너

게이팅(불변): auth: userId 없으면 리스트가 빈 배열로 해석됨(명시적 redirect 없음 — 실사용 경로는 로그인 후 /ops 경유) · tier: 없음
안전(불변): 자동 실행 없음 — 모든 쓰기는 탭 뒤. 쓰기 실패는 데이터를 지우지 않는 인라인 배너로 표시(읽기 실패의 전체 교체형 OpsState와 구분).
이동 대상: 뒤로 → /ops

카피(원문 고정):
- 목표
- 다음 한 걸음
- 목표 이름을 적어 주세요
- 마감일
- 지우기
- ＋ 기록 담기
- 계획
- 진행 중
- 완료
- 마감 지남
- 목표 이름 바꾸기
- 저장
- 취소
- 저장하지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.
- 잠시 불러오지 못했어요
- 네트워크를 확인해 주세요
- 다시 시도
- 아직 추천이 없어요
- 기록이 쌓이면 걸음을 골라줄게요

## 이번 달 점검 (`/ledger`) — windowed
목적: 수동 가계부의 이번 달 점검 화면. 수입/지출/잔여 요약과 전월 대비 지출 추세 칩, 분류별 지출 바, 개별 내역 리스트(삭제 가능)를 보여주고, 종류·날짜·금액·분류를 갖춘 실제 입력 폼으로 내역을 추가한다. 재정 도메인 별을 실데이터로 채우는 입력 표면.

기능 · 필수 컨트롤:
- '지출'/'수입' 토글 탭 → 입력 종류 전환
- 날짜 필드 → 이번 달 1일~오늘 범위에서 기입일 선택(소급 기입 가능)
- '추가' 탭 또는 분류 입력 done → createLedgerEntry(userId, {occurred_on, kind, amount_krw, category(비면 '기타')}) → 성공 시 금액/분류 초기화·날짜 오늘로 리셋·reload / 실패 시 저장 실패 배너
- 내역 행 ✕ 탭 → deleteLedgerEntry → reload / 실패 시 배너
- 읽기 오류 '다시 시도' → 이번 달 내역 재조회
- 뒤로가기 → router.back()

담아야 할 정보 묶음(구성 자유): OpsFrame 셸 · 저장 실패 배너 (조건부) · 월 요약 카드 (ledgerCard) · 내역 입력 폼 (ledgerForm) · 분류별 지출 (byCategory) · 이번 달 내역 (entries) · 푸터 노트

4-상태: empty: OpsState empty — '아직 추천이 없어요' + body '기록' (분류별 지출이 0건일 때; 요약 카드와 입력 폼은 항상 보임) / loading: OpsState empty, title '…' / error: OpsState error — '잠시 불러오지 못했어요' / '네트워크를 확인해 주세요' + '다시 시도' / filled: 요약 + 추세 칩 + 분류별 바 + 내역 리스트

게이팅(불변): auth: userId 없으면 빈 리스트 (명시적 redirect 없음 — 실경로는 로그인 후 진입) · tier: 없음
안전(불변): 쓰기는 전부 사용자 탭 뒤. 금액은 숫자만 파싱(0 이하 추가 불가). 날짜 클램프로 '보이지 않는 저장'을 구조적으로 차단. 쓰기 실패는 인라인 배너로 정직하게 표시.
이동 대상: 뒤로 → /ops 또는 /star/finance (진입 스택)

카피(원문 고정):
- 이번 달 점검
- 수입
- 지출
- 잔여
- 기록
- 날짜
- 금액
- 분류 (예: 식비)
- 기타
- 추가
- 분류별 지출
- 이번 달 내역
- 내역 삭제
- 다통화는 자동 환산돼요 (FX).
- 저장하지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.
- 잠시 불러오지 못했어요
- 네트워크를 확인해 주세요
- 다시 시도
- 아직 추천이 없어요

## 사이드 프로젝트 (`/side-project`) — windowed
목적: 키 없이(GitHub 공개 API) 사용자의 GitHub 공개 활동을 불러와 이번 주 커밋 수·활동일·저장소와 14일 커밋 히트맵을 보여주는 창작 도메인 점검 화면. @사용자명 하나로 연결하며, 연결은 기기 로컬(AsyncStorage)에만 기억되고 재방문 시 자동 재연결한다. 공상→구체화 축의 실행 흔적을 데이터로 비추는 표면.

기능 · 필수 컨트롤:
- 화면 진입 → AsyncStorage에서 저장된 핸들 로드 → 있으면 자동으로 fetchPushActivity 재연결
- 핸들 입력 후 done(연결) → setGithubUsername(기기 저장) → fetchPushActivity(공개 이벤트 조회) → 성공 시 요약/히트맵/저장소 렌더
- API 실패(레이트리밋 등) → OpsState rate — '잠시만요' / '요청이 많아 잠깐 쉬어가요 · 곧 다시' + CTA '다시 시도'
- 미연결 상태 CTA '연결하기' → 현재 입력값으로 연결 시도
- 뒤로가기 → router.back() → /ops

담아야 할 정보 묶음(구성 자유): OpsFrame 셸 · 핸들 입력 · THIS WEEK 카드 (연결됨 상태) · 저장소 리스트 (연결됨 상태)

4-상태: empty: 미연결 — OpsState unlinked: '아직 연결 안 됐어요' / '연결하면 자동으로, 아니면 직접 적어요' + CTA '연결하기' / loading: (연결 시도 중 별도 스피너 없음 — 미연결 상태 유지 후 결과 반영) / error: OpsState rate — '잠시만요' / '요청이 많아 잠깐 쉬어가요 · 곧 다시' + '다시 시도' / filled: THIS WEEK 카드(커밋 수 + 칩 + 히트맵) + 저장소 리스트

게이팅(불변): auth: userId 미사용 — 로그인 여부와 무관하게 동작(공개 데이터·기기 로컬 저장뿐) · tier: 없음
안전(불변): 외부 API는 공개·키리스만. 사용자명 외 어떤 것도 서버로 가지 않음. 레이트리밋을 정직한 상태 카드로 노출.
이동 대상: 뒤로 → /ops

카피(원문 고정):
- 사이드 프로젝트
- GitHub @사용자명
- THIS WEEK
- 커밋
- 저장소
- 아직 연결 안 됐어요
- 연결하면 자동으로, 아니면 직접 적어요
- 연결하기
- 잠시만요
- 요청이 많아 잠깐 쉬어가요 · 곧 다시
- 다시 시도