# 담기 · 반입 — 화면 브리프 (7개)

> 00-SYSTEM.md의 토큰·위계·자유도 계약이 전제. 아래 "기능·필수 컨트롤"은 존재해야 하는 것의 목록이며 배치·순서·형태는 자유.

## 담기 (`/capture`) — windowed
목적: 떠오른 순간을 5가지 형식(글·링크·사진·음성·할 일)으로 즉시 담는 루트 담기 화면. 글 모드는 4W1H(누가·언제·어디서·무엇을·어떻게) 구조 폼이 기본이며, 모든 저장은 createRecord(kind:"note") 한 경로로 records 테이블에 남는다. 사진·음성은 전체 컴포저(/capture-full)의 실제 OCR·녹음 파이프로 넘겨준다.

기능 · 필수 컨트롤:
- 형식 칩 탭 → mode 전환, saved/error 상태 리셋 (입력값은 모드별 state에 유지)
- 글 모드 무엇을 칸 입력 → hasContent → 담기 버튼 활성화 (fourWHasContent)
- 언제/어디서/누가 필드 키보드 next → 다음 필드로 포커스 릴레이 (언제→어디서→누가→어떻게)
- 사진 모드 "카메라·앨범 열기" 탭 → router.push({pathname:"/capture-full", params:{text, mode:"ocr"}}) — 전체 컴포저 OCR 페인 오픈
- 음성 모드 "녹음 열기" 탭 → router.push({pathname:"/capture-full", params:{text, mode:"voice"}}) — 녹음 페인 오픈
- 할 일 추가 탭 → todos 배열에 빈 행 추가
- 담기 탭 → savePiece(): 글=composeFourWBody, 할 일=- 항목 나열, 그 외=텍스트 그대로 → createRecord(kind:"note", tags:[fourw|todo|link|photo|voice], withFollowup:false) → 성공 시 입력 초기화 + "저장 완료" + 기록 보관소 링크
- 저장 결과 followup.zone === "red" → CrisisRouter 핫라인 모달 표시 (저장 자체는 완료됨)
- "기록 보관소에서 보기" 탭 → router.push("/records")

담아야 할 정보 묶음(구성 자유): 타이틀 블록 · 형식 선택 칩 행 · 글(text) 모드 — 4W1H 폼 · 링크(link) 모드 · 사진(photo) 모드 · 음성(voice) 모드 · 할 일(todo) 모드 · 자동 분류 배너 · 저장 CTA + 후속 · 위기 안전망

4-상태: empty: 폼 비어있음 → 담기 버튼 disabled (saveHint 접근성 힌트) / loading: saving=true → 버튼 라벨 "저장 중" + loading 스피너 / error: 저장 실패 → 인라인 에러 카드 "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." / filled: 저장 성공 → 버튼 "저장 완료" + "기록 보관소에서 보기" 텍스트 버튼 노출, 폼 초기화

게이팅(불변): auth: 루트 _layout 게이트가 커버; canSave는 userId 필수 · tier: 없음 (담기 무제한) · minor: 위기 핫라인 라우팅만 분기 (KR_1388) · consent: 없음
안전(불변): C9 로컬 위기 분류 → red zone 시 CrisisRouter 핫라인 (성인 KR_109 / 미성년 KR_1388 / EN GLOBAL_988). AI 자동 분류는 배너 고지만; 별 밝기 반영은 propose→ratify 이후에만.
이동 대상: /capture-full (mode=ocr | mode=voice), /records, 독: / · /secondb · /records · /settings

카피(원문 고정):
- 담기
- 떠오른 순간을 편한 형식으로 담아요.
- 글 · 링크 · 사진 · 음성 · 할 일
- 무엇을 / 떠오른 생각·사건의 핵심을 적어요
- 언제 / 오늘 아침
- 어디서 / 회사
- 누가 / 나 · 팀원과
- 어떻게 · 왜 / 어떤 마음이었는지
- 링크를 붙여넣으면 세컨비가 제목·요약을 가져와요.
- https://
- 카메라·앨범 열기
- 사진에 대한 설명을 적어요
- 녹음 열기
- 말한 내용을 적어요
- 할 일 추가
- 담는 순간 세컨비가 어울리는 별과 태그로 자동 분류해요.
- 담기 / 저장 중 / 저장 완료
- 기록 보관소에서 보기
- 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.
- 무엇을 칸을 채우면 담기가 켜져요.

## 전체 담기 (풀 컴포저) (`/capture-full`) — immersive
목적: 딥스페이스 트랙에서 링크 스크랩·클립 붙여넣기·사진 OCR·실 녹음 전사·파일 인덱싱까지 도달 가능하게 하는 8모드 풀 인테이크. /capture의 검증된 CaptureLegacy 파이프를 DeepSpaceScreen 셸(active="capture") 안에 그대로 재사용한다(QA F1 후속). 일기(journal)는 records로, 메모/링크/OCR/파일은 sources(위키 별가루)로 저장된다.

기능 · 필수 컨트롤:
- 모드 탭 탭 → switchCaptureMode: 현재 모드 드래프트 기억(AsyncStorage, 저장 모드 5종만) → 새 모드 드래프트 복원. voice/todo/4W1H는 비영속(전환 시 비움)
- 더보기/줄이기 탭 → 고급 모드 8탭 확장/축소 (줄이면 일기로 복귀)
- 트랙 칩 탭 → track 고정 + trackTouchedRef=true (AI가 이후 덮어쓰지 않음)
- 일기 담기 → createRecord(kind:"journal") → records; followup red면 핫라인; 아니면 enqueueAutoReasoningRecord; 스트릭·한도·XP 갱신; 성공 패널(기록 보관소 CTA)
- 음성/할 일/4W1H 담기 → createRecord(kind:"note", tags:[voice|todo(+done)|fourw]) → records; red 핫라인 패리티; 성공 패널 CTA → /record/[id]
- 메모/링크/OCR/파일 담기 → classifyClipper(1콜: kind·태그·트랙·frontmatter 제안, 실패해도 저장 진행) → captureFromMarkdown → sources + Storage 업로드; 메모는 저장 후 위기 분류; inbox로 떨어진 120자+ 캡처는 형식 제안 패널 노출; 성공 패널 CTA → 그래프(/?highlightRecordId)
- 녹음 → 멈추고 받아쓰기 → transcribeAudio → 전사를 본문에 append (red zone 전사는 본문 대신 핫라인); 임시 오디오는 항상 삭제
- 카메라/갤러리 → 추출하기 → ocrImageAsset(Gemini 멀티모달) → 본문 채움; 위기 콘텐츠는 핫라인; 결정적 실패(용량·형식·손상)는 재시도 없는 전용 문구
- 추출 텍스트 승인하기 탭 → ocrReviewApproved=true → 담기 활성화 (본문 수정 시 승인 해제)
- 형식 제안받기 탭 → proposeClipperTemplate LLM 1콜 → 제안 카드; 저장(개인/공유)은 saveTemplate → clipper_templates
- 복사해 둔 내용 붙여넣기 탭 → readClipboardText → 본문 append (탭 시에만 클립보드 읽음)
- ?tag=... 딥링크 → 해시태그 사전 부착 (별 화면에서 온 조각이 그 별에 안착)
- 공유 payload 도착(url/text/title) → 드래프트 하이드레이션 후 linkclip 모드로 전환, 기존 드래프트 아래에 append, URL 파라미터 소거
- 최근 별가루 행 탭 → /record/[id]
- 내 형식 관리하기 / 형식 링크 탭 → /formats?view=manager

담아야 할 정보 묶음(구성 자유): 히어로 헤더 · 담기 2차 링크 (DeepSpaceLinks) · 저장 성공 패널 · AI 형식 제안 패널 (G3) · 내 형식 관리 링크 · 트랙 토글 (일상/Pro Wiki) · 모드 탭 · 일기 게이트/한도 카드 · 일기 작성 폼 · 링크/클립 입력 · 메모/OCR 본문 입력 · 음성 녹음 컨트롤 · 할 일 입력 · 4W1H 입력 · OCR 소스 선택·검토 · 파일 입력 · 해시태그 편집기 · 담기 제출 버튼 · 최근 별가루 리스트 · 오버레이

4-상태: empty: 모드별 빈 입력 → 담기 disabled + 모드별 사유 힌트 (예: OCR "추출 텍스트를 승인해야…", 파일 "파일을 선택하거나 본문을 적어야…") / loading: auth 로딩 → PremiumLoadingState; 제출 중 "담는 중…"; OCR 추출 중 loading; 전사 중 상태 행 / error: 저장/추출/전사/제안 실패 → 피드백 모달 (결정적 실패는 재시도 버튼 없음); 일기 게이트/한도 카드 / filled: 저장 성공 패널 (위치별 CTA) + 최근 별가루 리스트 + 스트릭

게이팅(불변): auth: userId 없으면 Redirect /sign-in; hasProfile===false면 Redirect /complete-profile (C10 + 동의 전 LLM 차단) · tier: 일기: XP 게이트(checkGate)+무료 한도(checkUsage); 세컨비 되짚기: Brain 플랜(canUsePremium "advisor") · minor: 위기 핫라인 KR_1388; OCR/전사 minor 플래그 전달 · consent: OCR 저장 전 명시 승인 필수 (propose→ratify)
안전(불변): C9: 일기·음성·할 일·4W1H·메모(저장 후)·OCR·전사 전 경로 위기 라우팅. propose→ratify: OCR 승인·음성 전사 검토·AI 태그는 사용자 태그에 항상 짐. 더블탭 중복 제출 가드. C3 감사 로그.
이동 대상: /formats?view=manager, /import, /inbox, /manual, /records, /record/[id], / (highlightRecordId), /audit, /plans?from=advisor_lock, /sign-in, /complete-profile

카피(원문 고정):
- 01. 별가루 담기
- 기록과 자료를 저장해요
- 일기 · 메모 · 링크 · 사진 · 문서
- 담기 / 담는 중…
- 더보기 / 줄이기
- 일상 Wiki / Pro Wiki
- 어디로 갈까요?
- 오늘 떠오른 생각이나 느낌을 적어주세요. 한 문장이어도 충분해요.
- 오늘의 성찰 질문
- 이 질문을 주제로
- 기록한 날: {count}일 (오늘은 선택이에요)
- 이 기록을 세컨비에게 물어보기
- 기본은 꺼짐. 세컨비의 되짚기를 받고 싶을 때만 켜세요.
- 일기 잠김
- 무료 일기를 다 썼어요
- 메모, 링크, 문서, 사진 담기는 한도 없이 계속 쓸 수 있어요.
- 링크 또는 저장한 글
- https://... 또는 글 내용을 붙여 넣으세요
- 링크 자동 인식: {kind}
- 복사해 둔 내용 붙여넣기
- 녹음 / 멈추고 받아쓰기 / 녹음 중… / 음성을 글로 바꾸는 중…
- 사진은 글자를 읽기 위해서만 글자 읽기 서비스로 전송돼요. 2nd-Brain은 이미지를 보관하지 않고 학습에 쓰지 않아요.
- 추출 텍스트 승인하기
- 추출하기
- 카메라 / 갤러리 / 파일 선택
- 해시태그
- 비워 두면 저장할 때 세컨비가 자동으로 달아줘요.
- Lumen이 새 별가루를 저장했어요
- 그래프 보기 / 기록 보관소 보기 / 또 담기
- 최근 별가루
- 이 자료에 딱 맞는 저장 형식이 없네요. 세컨비가 하나 제안할까요?
- 형식 제안받기
- 내 형식으로 저장 / 저장하고 공유
- 내 형식 관리하기

## 내보내기 형식 · 내 클리퍼 형식 (`/formats`) — windowed
목적: 한 라우트에 두 표면이 산다: 기본(파라미터 없음) 딥스페이스 표면은 내 정체성·기록의 '내보내기 형식' 선택 화면(DeepSpaceFormatsScreen)이고, ?view=manager는 커뮤니티 클리퍼 형식 관리자(FormatsLegacy — G3 클리퍼 형식의 목록·공유·편집·삭제·신고·차단)다. 담기 화면의 '형식' 진입은 반드시 ?view=manager를 쓴다(med#11). QA는 /formats?view=manager로.

기능 · 필수 컨트롤:
- 기본 표면: 형식 카드 탭 → 내보내기 형식 선택 (라디오)
- 기본 표면: 내보내기 탭 → 선택 형식으로 export 생성 → 미리보기 패널
- 기본 표면: 복사/공유·내려받기 → clipboard.writeText 또는 RN Share; 웹은 blob 다운로드
- manager: 공유 스위치 토글 → clipper_templates.is_shared 낙관적 업데이트 (실패 롤백 + "공유 설정을 바꾸지 못했어요.")
- manager: 형식/기준 카드 탭 → 분류 기준 모달 (이름·설명·자료 종류·분류 위치·기본 해시태그·자동 연결 조건·저장 세부 항목)
- manager: 편집 탭 → TemplateEditor 인라인 폼 (이름 ko/en · 설명 · 자료 종류 · 분류 위치 · 자동 연결 조건 · 기본 해시태그 · 저장 폴더 · 저장할 세부 정보) → 저장 시 upsert
- manager: 신고 사유 탭 → reportTemplate → 리스트에서 낙관적 제거 + 성공 토스트
- manager: 작성자 차단 → blockOwner → 해당 작성자 형식 전부 제거
- manager: 차단 모두 해제 → unblockAllOwners → 리로드로 복원
- manager: 담으러 가기 (빈 상태) → /capture

4-상태: empty: manager: 내 형식 빈 상태(담으러 가기 CTA) · 커뮤니티 빈 문구 / 기본 표면: 결과 패널 없음 / loading: auth 로딩 스피너; manager 리스트 로딩 "형식을 불러오는 중이에요…"; 내보내는 중… / error: manager 로드 실패: "형식을 불러오지 못했어요" + "다시 시도"; export 실패 문구; 토글·삭제 실패 토스트 / filled: 기본: 형식 선택 + 미리보기 패널 / manager: 기본 8 + 내 형식 + 커뮤니티 리스트

게이팅(불변): auth: 미로그인 Redirect /sign-in (양 표면) · tier: 없음 · minor: 없음 (P2 IARC 차단 예정) · consent: 없음
안전(불변): UGC 표면: 신고 3건 누적 시 전체 숨김, 차단은 작성자 단위, 사유 고정 목록(자체 모더레이션 표면화 방지). 작성자 익명(식별자 미노출).
이동 대상: /capture, /sign-in

카피(원문 고정):
- 내보내기 형식
- 나를 어디로든 가져가요
- .iden 포터블 정체성 파일
- Obsidian 친화
- 개발자 · API
- 포함 범위
- 성격 · 애착 모델
- 회상 · 내러티브
- 기록 원문 포함
- 포함됨
- 내보내기 / 내보내는 중…
- 복사 / 내려받기 / 닫기
- 내 클리퍼 형식
- 내가 만든 형식과 커뮤니티가 공유한 형식
- 형식 추가
- 기본 형식 ({count})
- 내 형식 ({count})
- 커뮤니티 형식 ({count})
- 커뮤니티에 공유됨 / 나만 보기
- 눌러서 분류 기준 보기 ›
- 신고·차단
- 신고하면 내 목록에서 바로 숨겨져요. 3명이 신고하면 모두에게 숨겨져요.
- 작성자 차단
- 차단 모두 해제
- 이 형식을 삭제할까요?
- 삭제하면 되돌릴 수 없어요.

## 알림 (`/inbox`) — windowed
목적: 실제 인앱 이벤트 2종 — 검토 대기 중인 연결 제안(propose→ratify /digest 큐)과 응답 도착한 지인 초대 — 를 모아 보여주는 창형 알림함. 각 카드는 해당 실제 표면으로 라우팅한다. 신호가 없으면 정직한 빈 상태를 보여준다(프로토의 canned 카드 5장 제거).

기능 · 필수 컨트롤:
- 카드 또는 CTA 탭 → router.push(카드의 route: /digest 또는 /peer-invites)
- back 탭 → router.back()
- 카드 1개 이상 로드 → 세컨비 헤드 delight 표정 1.2초 (reactExpression)

담아야 할 정보 묶음(구성 자유): 상단 앱바 · 페이지 타이틀 · 알림 카드 스택 · 빈 상태

4-상태: empty: "새 알림이 없어요. 담고 정리하면 여기에 쌓여요." / loading: auth 로딩·데이터 로딩 → DeepSpaceLoader dots / error: 개별 소스 실패는 빈 배열로 강등 (카드 미표시) / filled: 최대 2장 집계 카드

게이팅(불변): auth: 미로그인 Redirect /sign-in · tier: 없음 · minor: 없음 · consent: 없음
안전(불변): 연결 제안 수는 표시만 — 비준(ratify)은 /digest에서만 일어남 (propose→ratify).
이동 대상: /digest, /peer-invites, back

카피(원문 고정):
- 알림
- 새 알림이 없어요. 담고 정리하면 여기에 쌓여요.
- 검토할 연결 제안
- 세컨비가 이어 본 연결 {n}건이 확인을 기다려요.
- 제안 검토
- 지인 응답 도착
- 보낸 초대 중 {n}건에 응답이 왔어요.
- 응답 보기

## 외부 가져오기 (`/import`) — windowed
목적: 파일(.json·.zip·.txt·.md·.csv) 또는 계정 연동으로 흩어진 나의 데이터를 들여오는 창형 가져오기 허브. 파일 가져오기는 클리퍼와 같은 captureFromMarkdown 파이프(LLM 0콜, $0)로 sources에 안착하고, Apple 건강 행은 실 Health Connect/HealthKit 옵트인·인제스트를 돌린다. 가져온 것은 철회(전체 삭제) 가능하다.

기능 · 필수 컨트롤:
- 파일로/계정 연동 토글 → 소스 섹션 스왑
- 파일 선택 탭 → pickImportFiles → 노트 분리 → 노트별 captureFromMarkdown(self_knowledge) → 결과 카드(추가/중복/실패) + 이력 기록(sourceIds 포함, 철회 가능)
- ChatGPT/Notion/캘린더 행 탭 → 동일 파일 픽커 실행 (계정 OAuth 미구축의 정직한 폴백)
- Apple 건강 행 탭 (연동 필요) → handleHealthConsent: privacy pref 저장 + 민감정보 동의 레코드(recordHealthImportConsent) — 미성년은 도달 불가
- Apple 건강 행 탭 (오늘 반영) → handleHealthIngest: 오늘 0시~현재 창으로 Health Connect/HealthKit 읽기 → ingestHealthSamples. 소스 없음·권한 거부·데이터 없음이면 아무것도 안 쓰고 해당 에러 문구 (mock 폴백 금지 — 정직한 밝기 불변식)
- 철회 탭 → deleteSourcesByIds → removeImportHistory → 리스트 갱신 (삭제 실패 시 로그 유지 + 에러)

담아야 할 정보 묶음(구성 자유): 리드 문장 · 모드 토글 · 파일 모드 — 드롭존 · 계정 모드 — 계정 리스트 · 가져오기 결과 카드 · 가져오기 전 약속 (3블록 동의 카드) · 가져오기 이력

4-상태: empty: 이력 0건이면 이력 섹션 자체가 숨김; 결과 카드 없음 / loading: auth 로딩 DeepSpaceLoader; 버튼 라벨 "여는 중"/"가져오는 중"/"연동 중" / error: 건강 4종 에러 라인(기록 0 보장 명시); 철회 실패 문구; 픽커 취소는 무시 / filled: 결과 집계 카드 + 이력 리스트 + 건강 "반영됨"

게이팅(불변): auth: 미로그인 Redirect /sign-in · tier: 없음 · minor: Apple 건강 하드락 (healthImportAllowed 불통과, CTA "미성년 잠금" 비활성) · consent: 건강 인제스트 전 명시 동의 레코드 필수; 3블록 약속 카드 상시 노출
안전(불변): 정직한 밝기 불변식: 건강 데이터가 없거나 거부되면 0바이트 기록 + 명시 문구 (mock 샘플 폴백 제거됨). 철회는 서버 source 행까지 지워야 완결.
이동 대상: /sign-in, back

카피(원문 고정):
- 외부 가져오기
- 다른 곳에 흩어진 나를 가져와요. 가져온 것도 당신의 비중으로만 별에 반영돼요.
- 파일로 / 계정 연동
- 파일 선택
- 여기에 파일을 놓거나 선택
- .json · .zip · .txt · .md · .csv
- 연결할 계정
- 파일로 가져오기
- 연동 필요 / 오늘 반영 / 연동 중 / 반영됨 / 미성년 잠금
- {count}개를 정리함에 담았어요
- 중복 {count}개
- 실패 {count}개
- 가져오기 전 약속
- 원문 데이터 — 내가 올린 파일/계정의 기록만 읽어요
- 기기 내 처리 — 파싱·요약은 기기 안에서 먼저 일어나요
- 철회 가능 — 언제든 가져온 데이터를 통째로 지울 수 있어요
- 가져오기 이력
- 철회
- 별가루 {count}개
- 이 기기에서는 건강 앱에 연결할 수 없어요. 아무것도 기록하지 않았어요.
- 건강 접근이 거부돼서 아무것도 기록하지 않았어요. 기기 설정에서 허용할 수 있어요.
- 오늘 반영할 건강 활동이 없어요.

## 가져오기 (개인 데이터 허브) (`/import-hub`) — fullscreen
목적: 민감도 3계층(최민감·민감·보통)으로 배열된 10개 소스에서 개인 데이터를 들여오는 다단계 허브: 소스 선택 → 동의 시트(무엇을/어디에/보관·삭제 약속) → 파일 선택·붙여넣기 또는 구글 OAuth → 온디바이스 파싱 → 제안 리뷰(propose→ratify, 민감 항목은 기본 제외) → 선택 항목만 기록 반영 → 이력/철회. 원문은 저장하지 않고 파생 신호만 남긴다.

기능 · 필수 컨트롤:
- 소스 행 탭 → 동의 스텝 (미성년+잠금 소스는 무반응/비활성)
- 동의하고 파일 선택 / 분석 → detectImportKind(내용 스니핑 우선) → 미성년이면 감지 kind도 잠금 재검사(F7/C10) → buildProposals 온디바이스 파싱 → 리뷰 스텝 (0건이면 형식 에러)
- 구글 연결 → GIS 토큰(웹) → 캘린더 이벤트→ics 또는 Tasks → 동일 리뷰 경로. 에러: 일정 없음/취소/네이티브 미지원/일반
- 제안 행 탭 → 선택 토글 (민감 항목은 명시 선택해야 포함)
- 고른 {n}건 기록에 반영 → captureFromMarkdown(제안 마크다운, self_knowledge) → sources; proposalDecided 분석 이벤트(ratify/decline 카운트); finance CSV면 ratifyLedgerEntries → ops_ledger(부분 실패 경고); addImportHistory; recordImportConsent(동의 원장); enqueueAutoReasoningSource(자동 추론 큐); 카카오면 upsertKakaoRelationPeople(별-이름 익명 인물); 성공 시 허브 복귀 + delight
- 반영 실패 → 리뷰에 머무르며 "가져오지 못했어요. 아무것도 기록되지 않았어요." (허브로 튕기지 않음)
- 이력 삭제 탭 → deleteSourcesByIds → removeImportHistory (미로그인·삭제 실패 시 로그 보존 + 에러)
- back → 허브에서는 router.back(), 하위 스텝에서는 허브로

담아야 할 정보 묶음(구성 자유): 헤더 · 허브 — 민감도 계층별 소스 리스트 · 동의 스텝 · 입력 스텝 · 리뷰 스텝 (propose→ratify) · 이력 스텝

4-상태: empty: 이력 빈 상태 ("아직 가져온 게 없어요") + CTA / loading: busy — "연결 중…", 반영 버튼 비활성 / error: 파싱 실패·가져오기 실패·구글 4종·철회 2종·원장 경고 2종 — 전부 OpsState/문구로 표면화 / filled: 허브 10행 + 리뷰 요약/제안 + 이력 리스트

게이팅(불변): auth: 비준(ratify)·철회는 userId 필수 (철회는 미로그인 시 명시 거부 문구) · tier: 없음 · minor: C10: 통신·위치(카카오·타임라인·SMS·실시간 위치) 타일 잠금 + 내용 스니핑 레벨 재잠금(MINOR_LOCKED_KINDS) · consent: 소스별 동의 시트 필수 통과; 반영 시 consent_records 원장 기록; 민감 제안 기본 제외
안전(불변): propose→ratify 전면 적용(승인한 것만 기록·별 반영), 원문 무저장(원문 0 박스 상시), 민감 기본 제외, 미성년 이중 잠금, 실패 시 '아무것도 기록되지 않았음' 보장 문구, 철회는 서버 행까지.
이동 대상: back

카피(원문 고정):
- 가져오기
- 가져온 데이터
- 무엇을 들여올까요?
- 네가 승인한 것만 기록에 남아요.
- 최민감 · 명시 동의 필요
- 민감
- 보통
- 동의 필요
- 미연결
- 잠김
- 카카오톡 대화
- 구글 타임라인
- 문자(SMS)
- 실시간 위치
- 건강
- 이메일
- Notion · Obsidian
- 구글 캘린더
- 구글 할 일
- 캘린더(.ics)
- 약속·할 일·관계 신호만 뽑아요. 메시지 본문은 저장하지 않아요.
- 이 기기에서 분석하고 원문은 버려요. 파생 신호만 암호화해 보관해요.
- 보관 90일
- 언제든 삭제
- 이 기기에서만 처리
- 동의하고 파일 선택
- 대신 파일로 가져오기
- 구글 연결
- 분석
- 여기에 붙여넣기
- 완료
- 약속 / 장소 / 노트 / 시청 / 거래 / 원문
- 반영할 항목 고르기
- 민감 · 기본 제외
- 고른 {n}건 기록에 반영
- 아직 가져온 게 없어요
- 소스 고르기
- 삭제
- 가져오지 못했어요. 아무것도 기록되지 않았어요. 다시 시도해 주세요.
- 수집 항목·보관 위치·기간·삭제권에 동의해요. 미성년은 통신·위치 임포트가 잠겨 있어요.

## 데이터 연동 (`/integrations`) — windowed
목적: 외부 데이터 소스 5종을 소개하고 오늘 실제로 동작하는 흐름(파일·붙여넣기 가져오기 /import-hub, 사진은 /capture)으로 정직하게 핸드오프하는 창형 목록 화면. 소스별 OAuth가 미구축이므로 '연결됨' 상태는 이 화면에 존재하지 않는다(가짜 성공 패턴 제거).

기능 · 필수 컨트롤:
- 소스 버튼 탭 → router.push("/import-hub") 또는 사진 앨범은 router.push("/capture")
- back → router.back()

담아야 할 정보 묶음(구성 자유): 타이틀 + 리드 · 프라이버시 약속 카드 · 소스 리스트

4-상태: empty: 해당 없음 (정적 목록) / loading: 없음 / error: 없음 / filled: 5행 고정

게이팅(불변): auth: 루트 게이트 커버 (화면 자체 리다이렉트 없음) · tier: 없음 · minor: 없음 (잠금은 /import-hub에서) · consent: 약속 카드 고지만; 실제 동의는 /import-hub 동의 스텝
안전(불변): 가짜 '연결됨' 토글 금지(과거 감사 A패턴 — 로컬 체크만 켜지고 아무것도 연결 안 되던 상태 제거). 정직한 핸드오프 라벨만.
이동 대상: /import-hub, /capture, back

카피(원문 고정):
- 데이터 연동
- 연결하면 별이 더 빨리 밝아져요. 모든 처리는 기기 안에서 먼저 일어나요.
- 원문은 저장하지 않아요. 도출된 신호만 암호화해 남기고, 언제든 연결을 끊고 지울 수 있어요.
- Google 캘린더 — 일정에서 리듬·관계 신호
- Apple 건강 — 수면·활동으로 건강 별
- Notion — 메모·문서 가져오기
- 사진 앨범 — 장면에서 휴식·관계
- ChatGPT 내보내기 — 대화 기록 불러오기
- 파일로 가져오기
- 담기로 가져오기