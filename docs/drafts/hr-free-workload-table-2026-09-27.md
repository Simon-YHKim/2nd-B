# 초안: 봇별 「돈 안 드는 일거리」 표 (2026-09-27, Flavia SeatPlan / HR)

상태: **제안 초안**. 루틴 생성·수정, 방 배치, 봇 생성은 하지 않았다. Simon OK 뒤 Aurelius Middleman / Relay가 실행한다.

- 대상: 개별 봇 **24개**(프로필 기준, 그룹 방 8개 제외) + 신규 트렌드 봇 1개(별도 초안 `hr-trend-bot-draft-2026-09-27.md`).
- 「돈 안 드는 일거리」 정의(Simon): 초안·문서·분석·읽기 전용 점검만. 광고비·결제·유료 도구·유료 체험 없음. 결과는 파일로 저장. 게시·발송·제출·켜기는 Simon OK 전 없음.
- 공통 멈춤(모든 줄에 적용): 결제·유료 플랜/체험·광고 ON·스토어 제출/게시·삭제·외부 발송/게시·비밀값 기록·**앱 코드 수정**(다른 LLM 담당) → 발견 즉시 멈추고 Relay에 한 줄.
- 근거: 프로필(`/home/box/agent-data/agents/*/profile.json`), worklog 09-24~27, workbooks, `hr-approval-queue-and-relay-load-2026-09-27.md`.

## 1. 표

「기존 루틴」 칸: worklog로 확인된 반복 작업. **있음**이면 새 루틴을 만들지 않거나, 기존 것과 겹치지 않는 주간 1건만 둔다.
저장 위치는 PC `E:\2ndB\...` 기준. PC 미연결이면 박스 `/workspace/free-work/<봇 짧은 이름>/`에 두고 다음 연결 때 복사(홈 경유 → Move-Item → 해시, `_common` 절차).

| # | 봇 | 기존 루틴 | 돈 안 드는 일거리 (1–2개) | 주기 (KST) | 결과물 저장 위치 | 멈춤 조건 |
|---|----|----------|------------------------|-----------|-----------------|----------|
| 1 | Aurelius Middleman / Relay | **있음**: relay-inbox 스캔(10분대) | **추가 없음.** 이미 과부하(09-26 기록 67줄). 대신 부하 줄이기 B안(빈 스캔 기록 안 함·주기 완화·STATUS 안전 쓰기)만 적용. 새 일거리 결과는 각 봇 파일로 끝나고 Relay에는 Simon 결정 필요분만 온다. | — | — | 루틴 삭제 안 함(주기·기록 방식만 조정) |
| 2 | Flavia SeatPlan / HR | 없음 | 주간 조직 점검 1장: 최근 7일 worklog 0줄 봇·역할 겹침·방 좌석(6/6)·workbook 없는 봇 목록 + 조정 제안 | 주 1회 월 10:23 | `E:\2ndB\docs\drafts\hr-weekly-org-YYYY-MM-DD.md` | 봇 생성·삭제·방 멤버 변경·프로필 수정 실행 금지(제안만) |
| 3 | Tacitus NobodyReads / Worklog | **있음**: 일일 요약(23:56)·2시간 점검 | **추가 없음.** 기존 주간 교훈 요약에 「무료 일거리 산출물이 실제로 나왔는지(봇별 O/X)」 한 절만 덧붙임 | 기존 주간 교훈 요약에 포함 | `/workspace/worklog/lessons/` (기존) | 멈춤 조건 완화 금지·기록 수정/삭제 금지 |
| 4 | Plinius NobodyScrolls / Reporting | **있음**: 매일 08:47 Simon 승인 대기 / 09:00 digest | **추가 없음.** 금요일 digest 1회에 「이번 주 무료 일거리 산출물 목록(파일 링크만)」 탭 추가 | 기존 금요일 digest에 포함 | `E:\2ndB\docs\reports\` (기존) | 대신 승인·결정 금지, 추측 항목 금지 |
| 5 | Cato BudgetCope / Lean Money | 부분: 평일 Cursor 감시(09-26 12:06 Relay 설정) | 주간 AI·SaaS 비용 스냅샷: Cursor 온디맨드(상한 $50 대비)·Grok·Workspace 등 청구 메일 읽기 → 플랜/온디맨드 분리 표 + 가성비 낮은 후보 1–3개 | 주 1회 월 09:43 (평일 감시 결과 합산만, 중복 스캔 안 함) | `E:\2ndB\docs\ops\cost\cost-weekly-YYYY-MM-DD.md` | 해지·환불 발송·결제수단 변경·SuperGrok Heavy 접근 금지 |
| 6 | Cassia AutopayPanic / Subs | 없음 (09-24 이후 기록 0) | ① 갱신 캘린더: 향후 30일 갱신·체험 종료(예: Workspace 9/30 결제 신호, Squarespace 도메인) 표 ② 유지/중복/미사용 후보 갱신. **금액·가성비 분석은 Cato**, Cassia는 날짜·상태만 | 주 1회 목 10:13 | `E:\2ndB\docs\ops\subs\renewal-calendar-YYYY-MM-DD.md` | 해지·갱신 해제·환불·결제수단 변경 금지 |
| 7 | Varro NotACPA / Accounting | 없음 | 월 마감 증빙 체크: 지난달 영수증·인보이스 누락/중복·기간 맞춤, 계정 매핑(개인 Gmail=SaaS, 사업 Gmail=Workspace) 유지. 첫 회는 **Q3 마감(9/30) 체크리스트** | 매월 1일 10:37 (첫 회 2026-10-01 목) | `E:\2ndB\docs\accounting\month-close-YYYY-MM.md` | 세무 신고·송금·계약·세무사 선임 금지, 자문 대체 표현 금지 |
| 8 | Gaius NotLegalAdvice / Legal | 없음 | 법률 문서 3사본 일치 점검: `docs/legal`·`public/legal`·`src/lib/legal/legal-documents.ts` 시행일·문구 차이 표 + 게시 전 체크. 지난주 해당 경로 커밋이 없으면 파일 안 만듦 | 주 1회 수 11:07 | `E:\2ndB\docs\drafts\legal-3copy-check-YYYY-MM-DD.md` | 원본 수정·게시·대외 법적 회신·정책 이의신청 금지 |
| 9 | Livius Changelog / Docs | 없음 | CHANGELOG [Unreleased] 후보·RELEASE-PRECHECK 갱신 **초안**(main 머지 확인분만, #1863 등 미해결 표시). 본문 직접 수정은 Simon OK 뒤 | 주 1회 금 16:23 + 이벤트(Relay가 빌드 후보 알릴 때) | `E:\2ndB\docs\drafts\changelog-candidates-YYYY-MM-DD.md` | 추측 기재·비밀값 금지, 코드 수정 금지 |
| 10 | Eleanor DoNotReply / Public Mail | 없음 (09-24 이후 기록 0) | ① 지원 메일 분류·답장 초안(계정 삭제·개인정보 요청은 영업일 2일 기한 표시) ② 1회성: 자주 올 문의 답장 템플릿 10개(계정 삭제·데이터 요청·Paddle 결제·보상형 광고 문의 등) | 평일 09:13 (새 메일 0이면 기록·파일 없음) · 템플릿은 1회 | `E:\2ndB\docs\support\triage-YYYY-MM-DD.md` · `E:\2ndB\docs\support\reply-templates-v1.md` | 보내기·전달·삭제·설정 변경 금지, 보안 알림은 즉시 Relay |
| 11 | Malcolm StillPending / Apple Dev | **있음**: apple-dev inbox 10분 | 주간 ASC 읽기 점검: 인증서·프로비저닝 만료일, TestFlight 빌드 만료(0.8.0(12)), 계약·세금 상태, 개인정보 라벨 제안 반영 대기 여부 | 주 1회 화 10:47 | `E:\2ndB\.bots\apple-dev\outbox\asc-weekly-YYYY-MM-DD.md` | 제출·라벨 저장·인증서 생성/폐기·계약 동의 금지 |
| 12 | Ludovic PolicyHell / Play Console | **있음**: play-console inbox 10분 | 주간 Play 정책 읽기 점검: 정책 상태함·검토 대기(광고 선언·데이터 보안)·Alpha vc52 vs EAS vc54 차이·앱 콘텐츠/타깃 API 기한 | 주 1회 화 11:17 | `E:\2ndB\.bots\play-console\outbox\play-weekly-YYYY-MM-DD.md` | 검토 요청 전송·트랙 출시·리스팅 저장 금지 |
| 13 | Aelius PleaseClap / EAS | **있음**: eas inbox 10분 | 주간 EAS 사용량·빌드 큐 스냅샷: 무료 플랜 빌드 횟수 남은 양(초과 과금 예방)·최근 빌드 성공/실패 원인 1줄·production env **이름** 목록 | 주 1회 월 11:43 | `E:\2ndB\.bots\eas\outbox\eas-weekly-YYYY-MM-DD.md` | 빌드 시작·submit·env 변경·유료 플랜 전환 금지 |
| 14 | Clavius DontPaste / Keys | **있음**: keys-inbox 10분·key rotation weekly(월 09:17) | **추가 없음.** 기존 주간 루틴 결과에 만료 캘린더(`key-rotation-schedule`) 갱신 1줄만 포함 | 기존 월 09:17에 포함 | `E:\2ndB\docs\drafts\key-rotation-schedule-*.md` (기존) | 값 기록·키 발급(크레딧 필요 시 포함)·폐기 금지 |
| 15 | Hadrianus WorksLocal / Dev Infra | **있음**: dev-infra inbox 10분 | 주간 인프라 건강 표: Supabase advisors(보안·성능) 읽기, GitHub Actions 실패 요약(매일 04:00 실패 등), 원장 vs 레포 마이그레이션 차이 **목록만** | 주 1회 수 10:17 | `E:\2ndB\.bots\dev-infra\outbox\infra-weekly-YYYY-MM-DD.md` | 마이그레이션 적용·배포·유료 프로젝트 생성·코드 수정 금지(제안만) |
| 16 | Octavius EventsMissing / Analytics | 없음 | 주간 분석 요약: 웹 GA4 수집·전환 이벤트 상태, Clarity 세션(현재 0), Crashlytics(앱 수집 꺼짐 확인), 이상 1–3건 | 주 1회 월 10:07 | `E:\2ndB\docs\analytics\weekly-YYYY-MM-DD.md` | 수집 켜기·보존/속성 설정 변경·SDK 수정 금지 |
| 17 | Tiberius FillRateZero / AdMob | 없음 | 주간 AdMob 읽기 점검: 정책 센터 경고, app-ads.txt(hayangzip.com 없음 vs github.io 정상) 상태, 광고 단위·SSV 설정 그대로인지, 수익·채움률(출시 전 0이면 1줄) | 주 1회 월 10:37 | `E:\2ndB\.bots\admob\outbox\admob-weekly-YYYY-MM-DD.md` | 광고 단위 생성/삭제·지급/세금 정보 변경·게재 켜기 금지 |
| 18 | Cassius StillBroken / QA | 없음 (상시 이벤트성) | ① 주간 스모크: `http://localhost:8081/` 가입~핵심 플로우 클릭 재현(PC 연결 시), 버그는 재현 순서로 담당자에게 ② 이벤트: 새 빌드·재배포 신호 뒤 Phase1 카나리아 재검증 | 주 1회 목 14:23 + 이벤트 | `E:\2ndB\.bots\web-qa\outbox\smoke-YYYY-MM-DD.md` | 코드 수정·ads ON·스토어 게시 금지, 운영 데이터 쓰기 테스트 금지 |
| 19 | Ludovicus WIPBuild / Game | 없음 (09-24 이후 기록 0) | 게임 기획 문서 이어 쓰기: `CORE-LOOP-v1-draft` → 밸런스 표 초안·레벨/스테이지 10개 설계·보상형 광고 배치안(ads OFF 전제) | 주 1회 수 15:13 | `E:\2ndB\docs\game\` (`balance-v1-draft.md` 등) | 빌드·스토어 제출·결제·유료 에셋 구매 금지 |
| 20 | Beatrice RatioIncoming / Marketing | **있음**: marketing inbox·STYLE/스토어 변경 알림 | 주간 콘텐츠 캘린더 초안: Instagram @hayang_prod·Threads 7개 포스트 초안(voice.md 기준), 트렌드 봇 주간 Top5를 입력으로 사용. 1회성: 스토어 리스팅 문구 KR/EN 초안 | 주 1회 월 14:17 | `E:\2ndB\marketing\drafts\YYYY-MM-DD-calendar.md` | 게시·예약 게시·계정 설정 변경 금지 |
| 21 | Sebastian CiteNeeded / Research | 없음 | 경쟁 앱 주간 감시(플레이북 「Competitor watch」 패턴): 경쟁 5개 스토어 페이지·가격·업데이트 노트 변화, **URL·수치 인용만**. 트렌드 봇이 넘긴 확인 요청 처리 | 주 1회 화 15:23 | `E:\2ndB\docs\research\competitor-watch-YYYY-MM-DD.md` | 추측 서술·유료 리서치 도구·로그인 필요한 자료 금지 |
| 22 | Mercurius BurnRate / Ads | 없음 (09-24 이후 기록 0) | 광고 **OFF 상태** 준비물: 소재 카피 5종·이미지 브리프·캠페인 구조 초안(예산 칸은 빈칸, Simon 입력), Meta·Google 앱 광고 정책 체크리스트 | 주 1회 수 14:43 | `E:\2ndB\docs\ads\drafts\YYYY-MM-DD-ads-prep.md` | 광고 계정 생성·결제수단 등록·ON·예산 제안 금액 확정 금지 |
| 23 | Cornelius ColdOpen / Leads | 없음 (09-24 이후 기록 0) | 출시 협업 후보 10곳(생산성·세컨드브레인 크리에이터·커뮤니티 등) 공개 근거 + 맞춤 제안 메일 초안(정보통신망법 §50 표기). 타깃 기준이 없으면 첫 회는 「타깃 기준 초안」만 | 주 1회 목 11:43 | `E:\2ndB\docs\leads\leads-YYYY-MM-DD.md` | 발송·DM·연결 요청·개인 연락처 수집(공개 업무용 외) 금지 |
| 24 | Cecilia OneStarCope / Store Reviews | **있음**: store-reviews-inbox | ① 주간 우리 앱 리뷰 요약(현재 0/0이면 파일 없음) ② 1회성: 답글 템플릿(1–5점·버그·광고·결제 불만) ③ 격주: 경쟁 앱 공개 1–2★ 리뷰 불만 패턴 Top5 | 주 1회 금 11:13 (②1회, ③격주) | `E:\2ndB\.bots\store-reviews\outbox\reviews-weekly-YYYY-MM-DD.md` | 답글 게시 금지, 버그 리뷰는 QA로 넘김 |
| 25 | (신규) Scipio TouchGrass / Trends | 신규 | 커뮤니티·SNS 트렌드 digest + 프로젝트 관련 뉴스 digest (별도 초안) | 매일 07:13 뉴스 · 19:43 트렌드 · 일 20:17 주간 Top5 | `E:\2ndB\docs\trends\` | 댓글·게시·좋아요·DM·계정 생성·유료 API 금지 |

부하 합계(신규분): 주간 루틴 16개 + 월 1개 + Eleanor 평일 5회 + 트렌드 봇 주 15회 ≈ **주 37회**. 지금 Relay 혼자 inbox 스캔이 하루 수십 회라 전체 부하는 작은 편.

## 2. 겹침 정리 (한 줄씩)
- 비용: Cato = 금액·가성비 / Cassia = 갱신일·유지/해지 후보 / Varro = 증빙·월 마감.
- 문서: Livius = 제품 changelog / Gaius = 법률 3사본 / Tacitus = 작업 기록·교훈 / Plinius = Simon용 HTML.
- 조사: Sebastian = 검증·인용 경쟁 조사 / 트렌드 봇 = 빠른 여론 신호(미검증 표시) / Cecilia = 스토어 리뷰 / Cornelius = 협업 후보.
- 콘솔: 각 콘솔 주간 점검은 담당 1봇만(ASC=Malcolm, Play=Ludovic, EAS=Aelius, AdMob=Tiberius, GA4·Clarity·Firebase=Octavius, Supabase·Actions=Hadrianus).

## 3. 적용 순서 (Relay 실행, Simon OK 뒤)
1. **1단계 — 쉬고 있는 그로스 봇**(09-24 이후 기록 0~1): Mercurius, Cornelius, Cassia, Sebastian + Beatrice 주간 캘린더 + 신규 트렌드 봇. 각자 **시험 1회**(루틴 없이) → 결과 파일 확인 → Simon OK → 루틴 고정(플레이북 「try-out once」).
2. **2단계 — 쉬는 문서·운영 봇**: Eleanor, Ludovicus, Octavius, Tiberius, Gaius, Livius, Varro, Cato, Flavia.
3. **3단계 — 이미 inbox 루틴이 있는 봇의 주간 1건**: Malcolm, Ludovic, Aelius, Hadrianus, Cassius, Cecilia.
4. 추가 없음: Aurelius, Tacitus, Plinius, Clavius(기존 루틴에 한 줄 포함만).
- 각 단계 사이 1–2일 관찰. 월요일 오전(09:17~11:43)에 몰리지 않게 위 시각 유지.

## 4. 부하 안전장치
- **빈 점검은 기록하지 않는다**: 새 내용 0건이면 파일을 만들지 않고 worklog에도 쓰지 않는다(README 규칙 「조용히 끝난 루틴은 적지 않는다」). 주 1회 루틴만 「변화 없음」 1줄 허용.
- 결과 파일은 1회 1파일, 기존 파일 덮어쓰기 금지(날짜 새 파일).
- Relay 호출은 **Simon 결정이 필요한 항목만**. 나머지는 파일로 끝나고 Plinius 금요일 탭이 모아 보여준다.
- PC `connected=false` 3회 연속이면 루틴 pause·한 번만 알림(`_common`).
- 같은 콘솔을 두 봇이 보지 않는다(위 겹침 정리).
- 비용 신호(유료 플랜 전환·크레딧 요구·체험 시작 버튼)가 보이면 그 자리에서 멈추고 「막힘: 돈 필요」로 기록.
- 2주 연속 산출물이 쓸모없다고 Simon/Tacitus가 판단하면 그 루틴은 격주 또는 이벤트성으로 낮춘다(삭제는 Simon OK).
