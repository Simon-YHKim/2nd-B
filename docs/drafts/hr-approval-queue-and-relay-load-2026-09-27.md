# 초안: Simon 승인 대기 목록 + Relay 부하 줄이기 (2026-09-27, Flavia SeatPlan / HR)

상태: **초안**. Simon이 "그러자"로 방향 OK(06:27 KST). 실행(Plinius 루틴 생성, Relay 루틴 수정)은 Relay가 한다. Flavia는 생성·수정하지 않음.

## 배경 (worklog 09-26~27 근거)
- Relay 기록 09-26 36건, 09-27 새벽 11건. 대부분 inbox 10분 스캔 중 "0 new" 빈 점검.
- 09-27 06:11 Relay 루틴 중 PowerShell `-replace`로 `STATUS.md`가 3B로 날아갔다가 outbox 백업으로 복구.
- Simon 손이 필요한 막힘이 여러 봇 기록에 흩어져 있음: age 개인키(KeePassXC 잠김, Hadrianus 복원 리허설), GitHub Actions Production 승인 대기, Edge 배포 0/3(운영 Supabase 시크릿 없음).

## A. Plinius: "Simon 승인 대기" 한 장 (하루 1회)
- 담당: Plinius NobodyScrolls / Reporting. 방 «보고».
- 주기 제안: 매일 08:47 KST 1회(주말 포함 여부는 Simon 선택, 기본 매일).
- 입력: 전날~당일 `/workspace/worklog/*.md`, `E:\Coding Infra\AI Infra\Communication\bots\STATUS.md`, 각 봇 outbox의 BLOCKED/GO 대기 항목.
- 출력: 자체완결 한국어 HTML 1파일(≤100KB), 맨 위 "오늘 Simon이 할 일" 표만. 열: 무엇 / 누가 기다림 / 왜 Simon만 가능(키·승인·결제·제출·삭제) / 어디서 하면 되는지 / 대기 시작 시각.
  - 저장: `E:\2ndB\docs\reports\approval-queue-YYYY-MM-DD.html` (+ Relay outbox 사본).
  - 새 항목 0건이면 파일 만들지 않고 worklog 한 줄만.
- 멈춤: 승인 대신 누르기·키 열기·결제·제출·외부 발송 금지. 추측 항목 금지(근거 로그 줄 인용 필수). 비밀값 표기 금지(이름만).
- Tacitus 일일 요약과 겹침 방지: Tacitus = 한 일 전체, Plinius = Simon 결정 필요분만.

## B. Relay 루틴 부하 줄이기
1. inbox 스캔: 10분 → 30분(업무시간 09–23시), 야간 60분. 긴급은 봇 간 priority 메시지로 깨우므로 누락 위험 낮음.
2. "0 new" 빈 스캔은 worklog에 쓰지 않음(하루 끝 1줄 요약만: "빈 스캔 N회").
3. `STATUS.md` 쓰기 안전장치: 쓰기 전 백업 → 임시 파일에 작성 → 크기 확인(이전의 50% 미만이면 중단·복구) → 교체. PowerShell 인라인 `-replace`로 파일 통째 덮어쓰기 금지.
4. 같은 티켓 상태를 여러 번 적는 반복(vb-* 관찰만 한 회차)은 변경 있을 때만 기록.
- 멈춤: 루틴 삭제는 하지 않음(주기·기록 방식만 조정). 조정 후 1일 관찰, 놓친 티켓 있으면 원복.

## 측정(부담 없는 확인용)
- 1주 후: Relay 빈 스캔 기록 수, STATUS 사고 0건 여부, Simon 대기 항목 평균 대기 시간.
