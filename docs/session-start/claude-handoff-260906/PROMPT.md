2ndB 프로젝트의 Codex 작업을 이어받아 진행해줘.

먼저 아래 인수 문서를 읽어줘.
E:\2ndB\.worktrees\session-start-260906\docs\session-start\claude-handoff-260906\README.md

앱 원본은 E:\2ndB\.worktrees\2ndB\TTL-Work이고,
브랜치는 claude/pixelclay-auth-mascot-font-260905야.
문서·패치는 docs/session-start-260906 브랜치에 있어.
인수 문서가 로컬에 없으면 E:\2ndB에서 refs/heads/docs/session-start-260906을
SHA로 고정하고 git show로 docs/session-start/claude-handoff-260906/README.md와
상대 링크를 같은 SHA에서 읽어줘. 읽기 위해 main을 수정하거나 브랜치를 바꾸지 마.

현재 체크아웃의 CLAUDE.md, HANDOFF, 세션 소유권, 공통 작업 목록을 확인해줘.
첫 일은 COPY-INTEGRATE-260906이야. 앞선 문구·어휘 검사·저장소 오류 수정,
ES/PT/ID 후속 문구, 세컨비 잘림 수정 중 main에 빠진 것만 정리해줘.
다른 세션이 이미 맡았거나 통합했다면 현재 근거와 공통 작업 목록에 따라 다음 항목을 진행해.

TTL-Work에는 다른 세션 변경이 많이 섞여 있어. 전체 diff나 파일을 통째로 옮기지 말고,
현재 main과 원본·키별 내역·패치를 대조한 뒤 자신의 .worktrees 아래에서 필요한 변경만 통합해줘.
app-copy.patch 다음에 text-clipping.patch를 확인해. 첫 차수의 전제 코드도 함께 대조해줘.
공통 문서 브랜치가 앱 코드까지 포함한다고 가정하지 마.

최신 검증은 2026-09-06 22:37 KST 기준 npm run verify 전체 통과,
707개 묶음·8,641개 테스트 통과야. text-clipping-checks.json이 최신이고,
그보다 앞선 실패 기록은 이미 해소됐어. 변경 후에는 현재 코드로 다시 검증해줘.

스토어 초안은 KO/EN/ES/PT/ID 5개 언어가 준비돼 있어. 실제 콘솔 대조·등록·제출·공개,
출시용 Android/iOS 확인과 원어민 감수는 아직이야. 앱 통합 후 남은 로컬 준비를 이어가줘.
AI스러운 말투와 과장을 쓰지 말고 STYLE.md의 문맥 기준을 지켜줘.
SystemLocale EN/KO, 안전·동의 안내와 정형 설문은 문체 작업을 이유로 넓히거나 바꾸지 마.

완료한 일을 다시 시작하거나 계획만 내놓고 멈추지 말고, 필요한 수정과 검증까지 진행해줘.
이 인수 요청이 push·병합·배포·스토어 제출 권한을 새로 주는 것은 아니야.
현재 맡을 범위와 대상 브랜치를 한 줄 알린 뒤 시작해줘.
