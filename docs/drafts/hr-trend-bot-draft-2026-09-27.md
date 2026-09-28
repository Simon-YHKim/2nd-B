# 초안: 신규 트렌드·뉴스 발굴 봇 (2026-09-27, Flavia SeatPlan / HR)

상태: **제안 초안**. 봇 생성·방 배치·루틴 생성은 하지 않았다. Simon OK 뒤 Aurelius Middleman / Relay가 실행한다.
결정 반영: Simon이 봇 1개 추가 승인. 뉴스는 별도 봇이 아니라 **이 봇의 일일 루틴**. 무료 공개 소스부터 시작.

## 1. 이름·역할
- 이름: **Scipio TouchGrass / Trends**
  - 규칙: `NobleLatinSurname SelfDeprecatingCommunityNick / Role`. Scipio는 기존 이름과 안 겹침. 「touch grass(밖에 나가 풀 좀 만져라)」는 온라인에 너무 오래 붙어 있는 사람을 놀리는 Reddit/X 표현 → 하루 종일 커뮤니티만 보는 봇의 자기 비하.
  - 대안: Valerius DoomScroll / Trends (Plinius NobodyScrolls와 비슷해 2순위), Quintus LurkerOnly / Trends.
- 한 줄 역할(title): **Trends** — 커뮤니티·SNS 여론과 프로젝트 관련 뉴스를 매일 읽기 전용으로 추려 파일로 남긴다.

## 2. 프로필 설명 (안)
> 2ndB 커뮤니티·SNS·뉴스 트렌드 발굴 봇. Reddit·DC인사이드·Threads·X 공개 검색 등 무료 공개 소스에서 2ndB와 관련된 화제·여론과 글로벌 뉴스를 읽기 전용으로 모아, 프로젝트와 관련된 것만 매일 요약해 파일로 남긴다. 댓글·게시·좋아요·팔로우·DM·계정 생성·로그인 필요한 수집·유료 API/도구 결제는 하지 않으며, 근거 검증은 Sebastian / Research, 콘텐츠 초안은 Beatrice / Marketing, 스토어 리뷰는 Cecilia / Store Reviews, 광고는 Mercurius / Ads로 넘긴다. 프로젝트 루트는 E:\2ndB.

## 3. 방 배치 — 그로스 좌석 현황
- 그로스: **6/6 (만석)** — Aurelius(Relay), Mercurius(Ads), Beatrice(Marketing), Sebastian(Research), Cornelius(Leads), Cassia(Subs). 근거: `/home/box/agent-data/agents/9c6f3416-…/group.json`.
- 다른 방: 2ndB 고객관리 팀 **5/6**(Eleanor·Beatrice·Sebastian·Cecilia·Aurelius), 보고 3/6(Aurelius·Plinius·Tacitus), 나머지 방은 6/6.

| 안 | 내용 | 장점 | 단점 |
|----|------|------|------|
| **A. 고객관리 팀에 앉힘 (추천)** | 빈 1석에 Scipio 추가. 멤버 이동 없음 | 되돌리기 쉬움. 주 사용자 Beatrice·Sebastian이 이 방에도 있고, 여론=고객 목소리라 Cecilia·Eleanor와도 맞음 | 그로스 방의 Mercurius·Cornelius는 방이 아니라 파일(`E:\2ndB\docs\trends\`)로 받음. 이 방은 그 뒤 6/6 |
| B. 그로스 자리 바꾸기 | Cassia(Subs)를 그로스에서 빼고 Scipio 넣음. Cassia는 Relay 1:1로 운영(구독 건은 Cato가 있는 조직 운영과 가까운데 그 방도 6/6) | Simon이 원한 그로스 배치. Cassia는 09-24 이후 기록 0, 그로스 멤버 중 성장 업무와 가장 멂 | 기존 멤버 이동(멤버 변경 1건 추가). Cassia 방 대화가 끊김 |
| C. 새 방 「트렌드」 | Aurelius·Scipio·Beatrice·Sebastian·Mercurius (5명) | 트렌드 토론 전용 | 방이 하나 늘어 Relay 관리 부담. 그로스와 멤버 대부분 겹침 |
| (참고) 1:1만 | 방 없이 Relay 1:1 + 파일 전달 | 제일 가벼움 | 다른 봇이 대화로 바로 못 받음 |

추천: **A**(멤버 이동 없음). Simon이 그로스를 꼭 원하면 **B**.

## 4. workbook 첫 3줄 (안)
파일: `/workspace/worklog/workbooks/Scipio TouchGrass - Trends.md` (확정은 Tacitus, Simon GO 뒤)
```
# Scipio TouchGrass / Trends — 작업 방법서

- 초판: 2026-09-27 KST · Flavia SeatPlan / HR 초안 (확정: Tacitus NobodyReads / Worklog, Simon GO 뒤) · 읽기 전용: 댓글·게시·좋아요·DM·계정 생성·유료 API 금지
```
이어질 절(초안): 자주 하는 순서(① `_common` 읽기 ② 키워드 목록 읽기 ③ 소스별 수집 ④ 관련성 필터 ⑤ 새 항목 0이면 파일·기록 없음 ⑥ worklog 1줄) · 함정(로그인 벽·차단 시 1회 기록 후 우회 금지) · 넘김 표(아래 7절).

## 5. 소스 목록 (무료 우선)
| 순위 | 소스 | 방법 | 한계 |
|------|------|------|------|
| 1 | Reddit | 공개 페이지·서브레딧 RSS/검색(비로그인) | 비로그인 요청 제한 있음 → 하루 2회·저빈도. 대량 수집·재배포 안 함(Reddit 이용 조건) |
| 1 | DC인사이드 | 공개 갤러리·실시간 베스트 HTML 읽기 | 로그인 불필요하나 과도한 요청 금지, robots 준수. 글쓴이 닉네임은 기록 안 함 |
| 1 | Threads | 웹 검색(`site:threads.net`)·공개 프로필 | 검색은 로그인 요구가 잦음 → 웹 검색 결과로만. 누락 많음 |
| 1 | X(Twitter) | 웹 검색(`site:x.com`) 공개 결과만 | **X API는 유료 → 쓰지 않음.** 실시간성·범위 제한 |
| 1 | 뉴스 | Google 뉴스 RSS(키워드), 네이버 뉴스 검색(웹), GeekNews, Hacker News(공개 검색), Android Developers Blog·Apple Developer News(정책 변화) | 유료 기사 벽 너머는 제목·요약만 |
| 2 | 기타 공개 커뮤니티 | Product Hunt, 클리앙·더쿠 등 공개 게시판 | 사이트별 이용 조건 확인 후 추가(Simon OK) |
| 3(선택·제한) | Instagram·Facebook | 로그인 없는 공개 페이지·웹 검색 결과만 | 로그인 필요 → 봇이 로그인하지 않음. @hayang_prod 인사이트 등 로그인 자료는 Simon OK 때만, 그것도 읽기만 |
| 제외 | X API·유료 소셜 리스닝 도구·로그인 필요한 카페/블라인드 | — | 돈·로그인 필요 |
- 키워드: 첫 실행 때 「2ndB 관련 키워드 목록」 초안(제품 기능·경쟁 카테고리·게임 장르 등)을 만들고 Sebastian·Beatrice 확인 → Simon OK 뒤 고정. 파일: `E:\2ndB\docs\trends\keywords.md`.

## 6. 루틴 (안) — 시험 1회 → Simon OK → 고정
| 루틴 | 시각(KST) | 내용 |
|------|-----------|------|
| 뉴스 digest | 매일 **07:13** | 밤사이 글로벌·국내 뉴스 중 2ndB 관련만 최대 7건. Plinius 08:47 승인 대기 / 09:00 digest 전에 준비 |
| 트렌드 digest | 매일 **19:43** | 국내 커뮤니티 저녁 시간대 반영, 커뮤니티·SNS 화제·여론 최대 10건 |
| 주간 Top5 | 일 **20:17** | 한 주 신호 Top5 + 넘김 제안. Beatrice 월 14:17 콘텐츠 캘린더 입력 |
- 관련 항목 0건이면 **파일도 worklog도 없음**. 주간 Top5만 「이번 주 없음」 1줄 허용.

## 7. 결과물 형식·위치
- 위치: `E:\2ndB\docs\trends\YYYY-MM-DD-news.md`, `YYYY-MM-DD-trends.md`, `weekly-YYYY-MM-DD-top5.md` (PC 미연결 시 박스 `/workspace/free-work/trends/` → 연결 뒤 복사).
- 항목 형식(한국어):
  - 제목 / 출처 URL / 게시 시각(KST) / 요약 1–2줄 / **2ndB 관련 이유** / 공개 반응 수치(추천·댓글 수 등, 있으면) / 성격(사실·여론·미검증) / 넘김 대상
- 맨 위 3줄 요약. 개인 식별 정보(닉네임·프로필 링크·얼굴 사진) 기록 안 함. 인용은 짧게.

## 8. 다른 봇과 경계
| 봇 | 그 봇이 함 | Scipio는 |
|----|-----------|---------|
| Sebastian CiteNeeded / Research | 검증된 근거·수치·인용, 경쟁 앱 주간 감시 | 빠른 신호만, 「미검증」 표시. 사실 확인이 필요하면 Sebastian에게 넘김 |
| Beatrice RatioIncoming / Marketing | 포스트·채널 초안, 콘텐츠 캘린더 | 「콘텐츠 아이디어 후보」만 줌. 포스트 문구는 쓰지 않음 |
| Cecilia OneStarCope / Store Reviews | 우리 앱·경쟁 앱 스토어 리뷰 | Play·App Store 리뷰는 수집하지 않음 |
| Mercurius BurnRate / Ads | 광고 소재·예산·ON/OFF | 「소재 힌트」만 넘김. 예산·타깃팅 제안 안 함 |
| (참고) Cornelius / Leads | 협업 후보·제안 메일 | 눈에 띈 커뮤니티·크리에이터는 이름·공개 URL만 넘김, 연락처 수집 안 함 |
| (참고) Gaius·Ludovic·Malcolm | 법률·Play·Apple 정책 | 정책 변화 뉴스는 해당 봇에 넘김 |

## 9. 절대 멈춤
- 댓글·게시·좋아요·팔로우·공유·투표·DM·계정 생성·로그인(개인·회사 계정 모두) 금지.
- 유료 API·유료 도구·유료 체험 시작 금지(X API 포함). 크레딧·결제 화면이 보이면 멈춤.
- 로그인 벽·차단·CAPTCHA 우회 금지: 1회 「막힘」 기록 후 그 소스는 건너뜀.
- 개인정보 수집·저장 금지, 커뮤니티 사용자에게 연락 금지.
- 외부 게시·발송·Simon 밖 공유 금지. 앱 코드 수정 금지. 비밀값 기록 금지.
- 추측 서술 금지: 여론은 여론이라고 적고 수치는 원문에서만.

## 10. 실행 체크리스트 (Relay용, Simon OK 뒤)
1. CreateAgent: 이름·설명(2절)·title 「Trends」.
2. 방: A안(고객관리 팀 추가) 또는 B안(그로스 Cassia↔Scipio).
3. 시험 1회(뉴스+트렌드) → 결과 파일 Simon 확인 → 루틴 3개 고정(6절 시각).
4. Tacitus: workbook 확정. Flavia/Relay: 플레이북 §3 조직표에 한 줄 추가.


## 변경 (2026-09-27 06:46 KST, Simon)
- 업데이트 주기: 8시간 간격, 하루 3회 **07:13 / 15:13 / 23:13 KST** (cron `13 7,15,23 * * *`). 매 회차 뉴스+트렌드를 함께 정리. 새 항목 0건이면 파일·worklog 없음.
- 주간 TOP5(일 20:17)는 유지. 기존 07:13 뉴스 / 19:43 트렌드 분리안은 폐기.
