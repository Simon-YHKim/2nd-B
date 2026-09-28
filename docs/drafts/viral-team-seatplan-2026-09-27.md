# 바이럴 팀 좌석안 — 채널 봇·경계·방·규칙·GO 체크리스트 (2026-09-27)

작성: Flavia SeatPlan / HR · 요청: Simon (via Aurelius Middleman / Relay) · 17:42 KST Reddit 채널 추가 반영
상태: **제안 초안만.** 봇·방·루틴 생성, 멤버 변경, 외부 게시·발송, 결제는 하지 않았다. Simon GO 뒤 Relay가 실행한다.
근거(실측 17:40 KST): `/home/box/agent-data/agents/*/profile.json`·`group.json` — 봇 26개, 방 8개.

## 0. 한눈 요약
- **추천: 채널 봇 3개(병합) + Reddit 봇 1개(나중 생성) + 쇼츠는 나중에(Drusilla 겸임 추천, 예약 이름 Nerva).** 봇 26 → 29개(지금) → 30개(Reddit 생성 뒤).
  1. **Marcellus WallOfText / Naver Blog** — 네이버 블로그 단독
  2. **Drusilla ZeroReach / Insta·Threads** — Instagram + Threads
  3. **Galerius BoomerPage / Official X·FB** — X + Facebook「하양프로덕션」(공식 창구)
  4. **Crassus DownvoteMagnet / Reddit** — 해외 반응 청취·초기 테스터 모집(영어). 영어 버전 앱 출시 3주쯤 전에 생성
  5. (예약·지금 생성 안 함) **Nerva NoSubs / Shorts** — YouTube 쇼츠
- 새 방 **「바이럴 팀」 6/6**: Relay, Beatrice(리드), Marcellus, Drusilla, Galerius, Crassus(생성 전까지 빈자리). 쇼츠는 Drusilla 겸임 추천(3절). Scipio·Mercurius는 지금 방에 두고 파일로 넘긴다.
- 페르소나 JSON: `E:\2ndB\marketing\personas\<channel>.json` (작성자 Beatrice).

## 1. 채널 봇 안 (이름·title·설명·workbook 첫 줄)
이름 규칙: `NobleLatinSurname SelfDeprecatingCommunityNick / Role`. 사용 중인 이름 및 Valerius·Quintus와 겹치지 않는다. 머리글자도 기존 봇과 최대한 다르게 골랐다.

### 1-1. Marcellus WallOfText / Naver Blog
- 별명 뜻: Reddit에서 긴 글을 놀리는 「wall of text」. 긴 블로그 글을 쓰는 봇의 자기 비하.
- title: `Naver Blog`
- 설명(안):
  > 2ndB 네이버 블로그 초안 봇. 「AI 입문자의 적응기」 콘셉트로 AI 정보·앱 활용 글을 쓰고, 2ndB 실사용 이야기는 가끔만 넣으며 넣을 때는 반드시 '직접 만든 앱'이라고 밝힌다. 쓰기 전에 Beatrice가 만든 `E:\2ndB\marketing\personas\naver-blog.json`과 STYLE.md·marketing/voice.md를 읽고, 초안은 `E:\2ndB\marketing\drafts\blog\`에 저장한 뒤 게시 직전에 멈춘다(모든 게시는 Simon OK). 댓글·이웃 추가·공감·DM·광고·결제·계정 생성·비밀값은 다루지 않고 수치·후기를 지어내지 않는다. 프로젝트 루트는 E:\2ndB.
- workbook 파일: `/workspace/worklog/workbooks/Marcellus WallOfText - Naver Blog.md` (확정은 Tacitus)
```
# Marcellus WallOfText / Naver Blog — 작업 방법서
- 초판: 2026-09-27 KST · Flavia SeatPlan / HR 초안 (확정: Tacitus NobodyReads / Worklog, Simon GO 뒤)
1. `_common.md` → 이 파일 → `E:\2ndB\marketing\personas\naver-blog.json` → `STYLE.md`·`marketing/voice.md` 순서로 읽는다. 페르소나 파일이 없으면 쓰지 않고 Beatrice에게 요청.
2. 주제는 Beatrice 캘린더(`marketing/calendar.md`) 또는 Scipio 트렌드 파일에서만 고른다. 「미검증」 항목은 Sebastian 확인 전 사실처럼 쓰지 않는다.
3. 초안 저장 `drafts\blog\YYYY-MM-DD_blog_<slug>.md`(status: draft) → STYLE 셀프 체크 → Beatrice 검수 요청 → **게시 직전 멈춤**, Relay로 Simon OK 요청.
```

### 1-2. Drusilla ZeroReach / Insta·Threads
- 별명 뜻: 「도달 0(zero reach)」. 알고리즘에 안 뜬다고 투덜대는 SNS 제작자들의 자기 비하.
- title: `Insta·Threads`
- 설명(안):
  > 2ndB Instagram·Threads 초안 봇. Instagram은 「한 장에 담는 AI 팁」 카드뉴스 문구·릴스 대본을, Threads는 「인디 제작자의 혼잣말」 짧은 글을 쓰며, 두 채널의 말투는 각자의 페르소나 JSON(`instagram.json`, `threads.json`)을 따로 따른다. 초안은 `E:\2ndB\marketing\drafts\instagram\`·`drafts\threads\`에 저장하고 STYLE 체크 뒤 게시 직전에 멈춘다(모든 게시는 Simon OK). 댓글·좋아요·팔로우·DM·광고·결제·계정 생성·비밀값은 다루지 않고, 2ndB를 말할 때는 '직접 만든 앱'이라고 밝히며 수치·후기를 지어내지 않는다. 프로젝트 루트는 E:\2ndB.
- workbook 파일: `/workspace/worklog/workbooks/Drusilla ZeroReach - Insta·Threads.md`
```
# Drusilla ZeroReach / Insta·Threads — 작업 방법서
- 초판: 2026-09-27 KST · Flavia SeatPlan / HR 초안 (확정: Tacitus, Simon GO 뒤)
1. `_common.md` → 이 파일 → 채널별 `personas\instagram.json` 또는 `personas\threads.json` → STYLE.md·voice.md. **두 채널 말투를 섞지 않는다**(IG=팁·정보, Threads=1인칭 혼잣말).
2. IG: 카드 1장 핵심 문장 + 슬라이드별 문구 + 캡션, 릴스는 15–30초 대본·자막. 이미지 생성·유료 디자인 도구는 쓰지 않고 문구·구성만 쓴다.
3. 저장 `drafts\instagram\YYYY-MM-DD_ig_<slug>.md` / `drafts\threads\YYYY-MM-DD_th_<slug>.md` → Beatrice 검수 → **게시 직전 멈춤**.
```

### 1-3. Galerius BoomerPage / Official X·FB
- 별명 뜻: 「페이스북은 부머(윗세대) 페이지」라는 X/Reddit 농담. 공식 페이지 관리자의 자기 비하.
- title: `Official X·FB`
- 설명(안):
  > 2ndB·하양프로덕션 공식 창구 초안 봇. X에는 빠른 AI 소식·2ndB 공지를, Facebook 「하양프로덕션」에는 공지·재게시·(광고 시작 뒤) 광고 랜딩 게시물 초안을 쓰며, 채널별 페르소나 JSON(`x.json`, `facebook.json`)을 먼저 읽는다. 초안은 `E:\2ndB\marketing\drafts\x\`·`drafts\facebook\`에 저장하고 STYLE 체크 뒤 게시 직전에 멈춘다(모든 게시는 Simon OK). 광고 집행·예산·ON/OFF는 Mercurius / Ads 담당이라 하지 않고, 댓글·좋아요·팔로우·DM·결제·계정 생성·비밀값은 다루지 않으며 수치·후기를 지어내지 않는다. 프로젝트 루트는 E:\2ndB.
- workbook 파일: `/workspace/worklog/workbooks/Galerius BoomerPage - Official X·FB.md`
```
# Galerius BoomerPage / Official X·FB — 작업 방법서
- 초판: 2026-09-27 KST · Flavia SeatPlan / HR 초안 (확정: Tacitus, Simon GO 뒤)
1. `_common.md` → 이 파일 → `personas\x.json`·`personas\facebook.json` → STYLE.md·voice.md.
2. 공지는 출처(릴리스 노트·Livius 문서·Relay STATUS)가 있는 것만. 출시·가격·기능 날짜는 확인된 값만 쓰고 추측 금지. 제작소 계정 소개에는 개별 작품명을 넣지 않는다(2ndB 톤 검수 4번).
3. 저장 `drafts\x\YYYY-MM-DD_x_<slug>.md` / `drafts\facebook\YYYY-MM-DD_fb_<slug>.md` → Beatrice 검수 → **게시 직전 멈춤**. 광고 랜딩 게시물은 Mercurius가 광고 시작을 알리기 전엔 쓰지 않는다.
```

### 1-4. (예약) Nerva NoSubs / Shorts
- 별명 뜻: 「구독자 0(no subs)」. **지금은 만들지 않는다.** 쇼츠를 열 때 ① Drusilla의 릴스 대본을 재사용해 Drusilla가 겸하거나 ② 이 이름으로 새로 만든다. 바이럴 팀 6번째 자리는 Crassus / Reddit이 쓰므로, 쇼츠는 Drusilla 겸임을 추천한다(3절 선택지).
- 대체 이름(필요 시): Marcellus → Severus TLDRpls, Drusilla → Aemilia AlgoHatesMe, Galerius → Septimus PinnedAndIgnored.

### 1-5. Crassus DownvoteMagnet / Reddit (추가 2026-09-27 17:42 KST, 생성은 나중에 — 5절 GO 9번)
- 별명 뜻: 「downvote magnet」 — 쓰는 글마다 비추천이 몰린다는 Reddit식 자기 비하. Crassus는 사용 중인 이름과 겹치지 않는다. 대체 이름: **Pontius RatioByMods / Reddit**.
- title: `Reddit`
- 콘셉트: 해외 반응 청취 + 초기 테스터 모집. r/SideProject·r/IndieDev 같은 제작자 서브레딧에서는 「I made this(직접 만든 앱)」를 밝히고 피드백을 청한다. AI 서브레딧에서는 홍보 없이 일반 정보 참여만 한다. **본격 운영은 앱 영어 버전이 준비된 뒤.** 그 전에는 초안, 서브레딧 규칙 정리, 계정 나이·카르마 메모만 하고 게시하지 않는다.
- 설명(안):
  > 2ndB Reddit 초안 봇(결과물은 영어). r/SideProject·r/IndieDev 등 제작자 서브레딧에는 'I made this(직접 만든 앱)'를 밝힌 피드백·초기 테스터 모집 글을, AI 서브레딧에는 홍보 없는 일반 정보 댓글만 초안하며, 초안 전에 Beatrice의 `E:\2ndB\marketing\personas\reddit.json`과 해당 서브레딧 규칙·자기 홍보 비율을 확인한다. 초안은 `E:\2ndB\marketing\drafts\reddit\`에 저장하고 글·댓글 하나하나 게시 직전에 멈추며(모두 Simon OK), 읽기는 답글을 준비 중인 스레드와 우리 글에 달린 반응만 하고 테스터 피드백을 요약해 버그는 Cassius / QA로 넘긴다. 투표·DM·팔로우·다계정·카르마 모으기·광고·결제·계정 생성·비밀값은 다루지 않고 수치·후기를 지어내지 않으며, 영어 버전 앱이 준비되기 전에는 게시 요청을 하지 않는다. 프로젝트 루트는 E:\2ndB.
- workbook 파일: `/workspace/worklog/workbooks/Crassus DownvoteMagnet - Reddit.md`
```
# Crassus DownvoteMagnet / Reddit — 작업 방법서
- 초판: 2026-09-27 KST · Flavia SeatPlan / HR 초안 (확정: Tacitus, Simon GO 뒤) · 산출은 영어, 파일 맨 위에 Simon용 한국어 요약 2–3줄
1. `_common.md` → 이 파일 → `personas\reddit.json` → STYLE.md·voice.md(영어 톤은 JSON 규칙 우선). JSON이 없으면 쓰지 않고 Beatrice에게 요청.
2. **초안 전 서브레딧 점검**: `drafts\reddit\_subreddit-rules.md`에 서브레딧별 규칙·자기 홍보 허용 여부(전용 스레드·요일)·계정 나이/카르마 조건·플레어를 정리하고, 우리 계정의 최근 홍보 비율(서브레딧 규칙 우선, 없으면 흔히 쓰는 9:1 관행 이하)을 확인. 금지거나 조건 미달이면 쓰지 않고 메모만 남긴다.
3. 저장 `drafts\reddit\YYYY-MM-DD_rd_<subreddit>_<slug>.md` → Beatrice 검수 → **글·댓글마다 게시 직전 멈춤**. 테스터 피드백은 `drafts\reddit\feedback-YYYY-MM-DD.md`에 요약(닉네임 없이), 버그는 재현 정보와 함께 Cassius / QA로.
```

## 2. 경계 — Beatrice·Mercurius·Scipio(+Reddit 봇)와 나누기

| 일 | Simon | Relay | Beatrice / Marketing | 채널 봇 3 + Crassus | Scipio / Trends | Mercurius / Ads | Sebastian / Research |
|----|-------|-------|------|------|------|------|------|
| 채널 콘셉트·전체 전략 | A | I | **R** | C | C | I | – |
| 주간 캘린더(`calendar.md`) | A(승인) | I | **R** | C(슬롯 제안) | C(주간 TOP5) | – | – |
| 페르소나 JSON·STYLE/voice | A | I | **R**(유일 작성자) | C(피드백만, 직접 수정 X) | – | – | – |
| 트렌드·뉴스 발굴(07:13/15:13/23:13) | I | I | C | I(파일 읽기) | **R** | I | C |
| 사실·수치 확인 | – | – | C | 요청 | 「미검증」 표시 | – | **R** |
| 채널 초안 작성 | I | I | C | **R** | – | – | – |
| 서브레딧 규칙·자기 홍보 비율 점검 | I | – | C | **R**(Crassus) | – | – | – |
| Reddit 글·**댓글** 승인(하나하나) | **A·R** | 전달 | C | 요청(Crassus) | ✕ | – | – |
| Reddit 모니터링·트렌드 요약 | I | I | I | ✕(준비 중 스레드·우리 글 반응만 읽음) | **R** | – | C |
| 테스터 피드백 요약 → 버그 넘김 | I | I | I | **R**(Crassus) → Cassius / QA | – | – | – |
| STYLE 검수(2ndB 톤 검수) | – | – | **A** | R(셀프 체크) | – | – | – |
| 게시 승인(한 건마다) | **A·R** | 전달 | C | 요청 | – | – | – |
| 게시 실행 | **R**(로그인은 Simon) 또는 그 건 GO 받은 채널 봇 | 전달 | I | 멈춤 → GO 뒤만 | – | – | – |
| 유료 광고·예산·ON/OFF (지금 OFF) | **A** | I | C(소재 문구) | ✕ | – | **R** | – |
| FB 광고 랜딩 게시물(광고 시작 뒤) | A | I | C | R(Galerius 초안) | – | C(목표·링크) | – |

R=실행, A=최종 책임/승인, C=의견, I=통보, ✕=하지 않음.
- Beatrice는 「무엇을·언제·어떤 목소리로」, 채널 봇은 「그 채널 문법으로 실제 초안」. 이렇게 나누면 Beatrice가 초안 작성을 채널 봇에 넘겨 부담이 줄어든다(Beatrice의 IG·Threads 캘린더 작업은 유지, 채널 초안 작성은 이관).
- Scipio는 문구를 쓰지 않는다. 채널 봇은 트렌드 파일 `E:\2ndB\docs\trends\`를 읽기만 하고 Scipio에게 수집을 직접 시키지 않는다(Beatrice 경유).
- Mercurius는 Simon이 「광고 시작」이라고 하기 전까지 OFF. 채널 봇은 광고·부스트 버튼을 누르지 않는다.

### Reddit 봇 경계
| 봇 | 그 봇이 함 | Crassus는 |
|----|-----------|-----------|
| Scipio TouchGrass / Trends | Reddit 포함 모든 플랫폼을 읽기 전용으로 감시해 트렌드 요약. **절대 참여 안 함** | 넓게 감시하지 않는다. 답글을 준비 중인 스레드와 우리 글에 달린 반응만 읽는다. Scipio가 참여할 만한 스레드를 골라 넘기면 받는다(Beatrice 경유 또는 트렌드 파일의 「넘김: Reddit」 표시) |
| Cornelius ColdOpen / Leads | B2B 잠재고객·제안 메일(1:1 외부 연락) | 커뮤니티 공개 글·댓글 초안만 쓴다. DM·영업 연락은 안 한다. 협업·B2B 문의가 오면 Cornelius에게 넘긴다 |
| Cassius StillBroken / QA | 버그 재현·재검증 | 테스터가 알린 버그는 직접 판단하지 않고 재현 정보(기기·버전·순서, 닉네임 없이)를 붙여 Cassius에게 넘긴다 |
| Cecilia OneStarCope / Store Reviews | 스토어 리뷰 | 스토어 리뷰는 다루지 않는다 |
| Beatrice | reddit.json·검수 | 페르소나는 읽기만 한다 |

### 병합 판단
| 안 | 구성 | 장점 | 단점 |
|----|------|------|------|
| **A. 3봇 병합 (추천)** | 블로그 / IG+Threads / X+FB | 봇 +3(26→29, Reddit 생성 뒤 30)이라 Reddit 봇까지 방 하나(6/6)에 다 들어감. X·FB는 같은 공지를 채널에 맞게 두 벌 쓰는 일이라 한 봇이 일관성을 지키기 좋음. Threads는 보통 Instagram 계정으로 로그인해 계정 관리가 한 쌍으로 묶임. 블로그는 긴 글·검색 노출이라 따로 둠 | Drusilla 안에서 말투 두 개(IG 팁 / Threads 혼잣말)가 섞일 위험 → 채널별 JSON과 「섞지 않음」 규칙으로 막음 |
| B. 채널당 1봇 | 5봇 | 페르소나가 가장 선명함 | 봇 31개. Relay+Beatrice+5 = 7명이라 방 하나(최대 6)를 넘음 → Relay를 빼거나 방 2개. Threads·FB는 양이 적어 거의 쉬는 봇이 됨 |
| C. 2봇 | 블로그+IG(팁 콘텐츠) / Threads+X+FB(짧은 글·공식) | 봇 최소 | 혼잣말(Threads)과 공식 공지(X·FB)가 한 봇에 섞여 목소리가 흐려짐. IG 카드 작업이 블로그와 몰려 한 봇 부담 큼 |

- Reddit은 영어 산출에 서브레딧마다 규칙이 달라 다른 채널 봇과 합치지 않고 **전담 1봇**으로 둔다(Galerius의 X와 합치는 안은 말투·규칙 점검 부담 때문에 비추천).

**추천 A.** 조직이 이미 26봇이고 Simon 승인 대기 부담이 큰 상황이라(`hr-approval-queue-and-relay-load-2026-09-27.md`) 봇 수와 방 수를 적게 늘리는 게 낫다. 한 채널의 양이 늘어 목소리가 섞이면 그때 Threads만 떼어 내 B로 옮긴다(되돌리기 쉬움).

## 3. 「바이럴 팀」 방 구성 (최대 6)
실측(`group.json`, 17:40 KST):
- 그로스 6/6: Aurelius(Relay), Mercurius, Beatrice, Sebastian, Cornelius, Cassia
- 2ndB 고객관리 팀 6/6: Eleanor, Beatrice, Sebastian, Cecilia, Aurelius(Relay), Scipio
- 보고 3/6(Relay·Plinius·Tacitus), 나머지 방 모두 6/6 → 기존 방에 채널 봇을 넣을 자리는 없다. **새 방이 필요하다.**

추천 구성 **6/6** (Crassus 생성 전까지는 5/6):
| 자리 | 봇 | 이유 |
|------|----|------|
| 1 | Aurelius Middleman / Relay | CEO 방 규칙(Relay가 모든 CEO 방에 앉음). Simon OK 요청·GO 전달 창구 |
| 2 | Beatrice RatioIncoming / Marketing (리드) | 캘린더·페르소나·STYLE 검수 담당 |
| 3 | Marcellus WallOfText / Naver Blog | 채널 봇 |
| 4 | Drusilla ZeroReach / Insta·Threads | 채널 봇 |
| 5 | Galerius BoomerPage / Official X·FB | 채널 봇 |
| 6 | Crassus DownvoteMagnet / Reddit | 채널 봇(영어). 생성 전까지 빈자리로 둠 |

- Scipio: **고객관리 팀에 둔다.** 트렌드는 파일(`E:\2ndB\docs\trends\`)로 나오고 그 방에 Beatrice가 함께 있어 Beatrice가 골라 넘긴다.
- Mercurius: **그로스에 둔다.** 광고 OFF 동안 바이럴 팀에서 할 일이 없음. 광고 시작 뒤 FB 랜딩 게시물 조율은 그로스 방(Beatrice 공통 좌석) 또는 Relay 경유.
- 주의: Beatrice는 방 3개(고객관리·그로스·바이럴)에 앉게 된다. 부담이 크면 고객관리 팀 좌석을 빼는 안을 나중에 검토(지금은 이동 없음).

넘칠 때 선택지 (쇼츠 예약 자리가 없어짐):
- **쇼츠 ① Drusilla 겸임 (추천)**: 릴스 대본을 쇼츠로 재사용. 좌석·봇 추가 없음. `youtube-shorts.json`만 추가.
- 쇼츠 ② Nerva를 새로 만들고 자리 바꾸기: Galerius(X·FB)는 공지 위주라 방 밖(Relay 1:1 + 파일)으로 빼고 Nerva를 넣음.
- 쇼츠 ③ 방 나누기: 「바이럴 팀(국내: 블로그·IG·Threads·쇼츠)」과 「글로벌·공식(X·FB·Reddit)」 두 방, 각각 Relay·Beatrice 포함. 방이 하나 늘어 Relay 부담 증가 → 쇼츠 양이 많을 때만.
- a) Scipio를 방에 넣고 싶다 → 자리 없음. 파일 넘김 유지(Beatrice가 두 방에 있음).
- b) B안(5봇)을 고르면 → 7명이라 넘침. ① Relay를 빼고 Beatrice가 Relay 1:1로 보고(CEO 방 규칙 예외) 또는 ② 「바이럴 팀(블로그·IG·Threads)」과 「공식 창구(X·FB)」 두 방. 추천은 ①보다 A안 유지.

## 4. 모든 채널 봇 공통 규칙
페르소나 경로(제안): `E:\2ndB\marketing\personas\<channel>.json` — 기존 `marketing\drafts\<channel>\` 관례와 맞춤.
- 파일: `naver-blog.json`, `instagram.json`, `threads.json`, `x.json`, `facebook.json`, `reddit.json`(영어 톤·서브레딧별 참여 방식·disclosure 영어 문구), (나중) `youtube-shorts.json`.
- 작성·수정은 **Beatrice만.** 채널 봇은 읽기만 하고 고칠 점은 Beatrice에게 제안.
- 권장 키: `channel`, `concept`, `audience`, `voice`(말투·1인칭 여부·금지 표현), `formats`, `length`, `do`, `dont`, `disclosure`(직접 만든 앱 문구), `hashtags`, `mention_2ndb_ratio`, `cadence`, `examples`, `owner`, `updated_at`.

작업 순서(매번):
1. `_common.md`·자기 workbook → 채널 페르소나 JSON → 루트 `STYLE.md`·`marketing/voice.md` 읽기. **페르소나 JSON이 없으면 쓰지 않고 Beatrice에게 요청**하고 멈춘다.
2. 주제: `marketing/calendar.md` 슬롯 또는 Scipio 트렌드 파일. 제품 사실은 `README.md`·`docs/PRD.md`·`docs/CONCEPT.md` 등에서만(기능 지어내지 않음).
3. 초안 저장: `E:\2ndB\marketing\drafts\<blog|instagram|threads|x|facebook|reddit>\YYYY-MM-DD_<blog|ig|th|x|fb|rd>_<slug>.md`, `marketing/README.md` 템플릿, status `draft`. (threads·facebook·reddit 폴더는 새로 쓰는 관례 → Beatrice 확인, 2ndB 콘텐츠 초안 스킬 설명 보강은 Tacitus 몫)
4. STYLE 셀프 체크(2ndB 톤 검수 스킬 2–4번) → Beatrice 검수.
5. **게시 직전에 멈춤.** Relay에게 「초안 경로 + 게시 예정 채널·시각」만 전달 → Simon OK. 게시는 그 한 건 GO 뒤에만, 로그인은 Simon이 한다.
6. worklog 한 줄(게시했으면 반드시 기록).

내용 규칙:
- **2ndB를 말할 때는 첫 언급에 「제가 직접 만든 앱」을 본문에 밝힌다**(해시태그만으로 대신하지 않음. 예: `#직접만든앱`은 보조). 블로그는 글 앞부분에서 밝힌다. 표시 문구는 Beatrice가 JSON `disclosure`에 고정하고, 법적 표현 확인이 필요하면 Gaius / Legal에 넘긴다.
- 2ndB 비중은 채널 콘셉트대로 낮게(블로그 「가끔」). 광고처럼 보이는 글 연속 금지.
- 수치·후기·사용자 반응을 지어내지 않는다. 수치는 출처 링크가 있는 것만, 2ndB 사용자 수·평점은 확인된 값만.
- 경쟁 앱 이름·비교 단정 금지, 「유일한·최고의」 금지(톤 검수 3번).
- Scipio 항목 중 「미검증」은 Sebastian 확인 전 사실로 쓰지 않는다. 남의 글·이미지 무단 전재 금지(짧은 인용+출처).
- 개인정보(커뮤니티 닉네임·얼굴·프로필 링크) 넣지 않음.

## 5. 절대 멈춤 · 주기 · Relay GO 체크리스트

### 절대 멈춤
- 공개 게시(예약 게시 포함)는 **한 건마다 Simon OK** 전 금지.
- 댓글·답글·DM·좋아요·공유·팔로우·이웃 추가·투표 금지. **Reddit은 댓글도 한 건마다 Simon OK 뒤에만**(Crassus는 댓글 초안까지). 업/다운보트·다계정·카르마 모으기·다른 사람에게 투표 부탁 금지.
- Reddit: 서브레딧 규칙이 홍보를 금지하거나 계정 나이·카르마가 모자라면 쓰지 않는다. 영어 버전 앱 전에는 게시 요청을 하지 않는다. AI 서브레딧에서는 2ndB를 언급하지 않는다.
- 계정 생성·유료 인증·유료 플랜·유료 도구(디자인·예약 도구 포함)·체험 시작 금지. 결제 화면이 보이면 멈춤.
- 광고·부스트·홍보 버튼 금지(광고는 Mercurius, Simon이 시작을 말하기 전 OFF).
- 로그인은 Simon이 한다. 비밀번호·토큰·인증 코드를 묻거나 적지 않는다. CAPTCHA·로그인 벽 우회 금지.
- 프로필·페이지 설정(소개, 링크, 이름) 변경 금지 — 필요하면 초안만.
- 앱 코드 수정·외부 발송·비밀값 기록 금지. 돈 드는 선택지를 먼저 꺼내지 않는다.

### 무료 초안 주기(제안, 시험 1주 뒤 Simon이 조정)
| 봇 | 채널 | 주당 초안 | 작성 시점(묶어서) |
|----|------|-----------|------------------|
| Marcellus | 네이버 블로그 | 1–2편 | 화 |
| Drusilla | Instagram | 카드뉴스 2 + 릴스 대본 1 | 화·금 |
| Drusilla | Threads | 짧은 글 3–5개 | 금(한 번에) |
| Galerius | X | AI 소식 3–5 + 공지 필요 시 | 화·금 |
| Galerius | Facebook | 공지·재게시 1–2 (광고 랜딩은 광고 시작 뒤) | 금 |
| Crassus | Reddit (영어 버전 전) | 서브레딧 규칙 정리 1회 + 초안 1–2(게시 없음) | 생성 첫 주 |
| Crassus | Reddit (영어 버전 뒤) | 제작자 서브레딧 글 주 1 이하 + AI 서브레딧 정보 댓글 2–3 + 피드백 요약 1 | 수(한 번에) |
- 흐름: 월 14:17 Beatrice 캘린더(기존 루틴) → 화·금 채널 봇 초안 묶음 → Beatrice 검수 → Relay가 **한 번에 묶어** Simon OK 요청(하루 1회 이내). 매일 루틴은 만들지 않는다.
- 루틴은 시험 1회 → Simon OK 뒤에만 고정. 시각은 정각을 피한다(예: 화·금 10:23).

### Relay GO 체크리스트 (Simon GO 뒤 순서대로)
0. [ ] Simon 선택: A(3봇 + Reddit 나중, 추천) / B(5봇) / C(2봇) · 이름 OK(대체 이름 1-4 참고) · 방 구성 OK.
1. [ ] CreateAgent ×3: Marcellus WallOfText / Naver Blog, Drusilla ZeroReach / Insta·Threads, Galerius BoomerPage / Official X·FB — 1절 설명·title 그대로(멈춤 문구 줄이지 말 것).
2. [ ] CreateChannel 「바이럴 팀」: Relay, Beatrice, 위 3봇(5/6). 6번째는 Crassus 자리로 비움(9번). 기존 방 멤버는 바꾸지 않음.
3. [ ] Beatrice 과제: 페르소나 JSON 5개 `E:\2ndB\marketing\personas\` + `disclosure` 문구 확정, `drafts\threads\`·`drafts\facebook\` 폴더 관례 확인.
4. [ ] Tacitus 과제: workbook 3개 확정(1절 첫 줄 초안 기반).
5. [ ] 시험: 채널당 초안 1건 → Beatrice 검수 → Simon 확인(**게시 안 함**).
6. [ ] Simon OK 뒤 초안 주기 루틴 고정(5절 표). 게시 GO는 여전히 한 건마다.
7. [ ] Flavia: 플레이북 §3에 바이럴 팀 행·봇 3줄 추가 초안 → Relay 적용.
8. [ ] 쇼츠: 오픈 결정 때 Drusilla 겸임(추천) 또는 3절 ②·③ 다시 제안(지금은 없음).
9. [ ] **Reddit (나중)**: 영어 버전 출시 약 3주 전, 예를 들어 영어 빌드가 내부·비공개 테스트에 들어갈 때 Crassus를 CreateAgent하고 바이럴 팀 6번째 자리에 넣는다. 첫 과제는 Beatrice의 `reddit.json` + Crassus의 `_subreddit-rules.md`(규칙·홍보 비율·계정 나이/카르마 메모)와 초안 1–2건(게시 없음).
   - 그 전에 Simon만 할 일(지금 가능, 봇 불필요): 쓸 Reddit 계정의 나이·카르마 확인. 새 계정이면 많은 서브레딧이 나이·카르마 조건을 두므로 Simon이 평소처럼 직접 참여해 두는 것을 권장(봇이 카르마를 모으지 않음).
   - 영어 버전 준비 확인(Relay) 뒤에만 첫 게시 OK 요청.
- 하지 말 것: Crassus를 영어 버전 준비 전에 게시용으로 돌리기, Scipio·Mercurius 방 이동, 광고 ON, 채널 계정 생성·로그인 대행, 결제.
