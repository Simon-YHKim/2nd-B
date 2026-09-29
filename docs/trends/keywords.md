# 2ndB 트렌드·뉴스 키워드 목록

> **확정(v1) — Simon GO 2026-09-27 0908 승인, 고정 키워드.** [미검증] 표시는 Sebastian 확인 전까지 유지.
> 작성: Scipio TouchGrass / Trends · 2026-09-27 KST. v0(시험 1회) → v1: Beatrice·Sebastian 고객관리 팀 방 의견 반영(07:0x KST). 이전본: `keywords.v0-draft.md`
> 근거 표시: `[N#]`·`[T#]` = `2026-09-27-digest.md` 항목 번호
> 근거 파일: `E:\2ndB\README.md`(= 박스 `/workspace/2nd-B/README.md`), `docs/PRD.md`(Draft v4), `docs/GTM.md`, `docs/CONCEPT-BRIEF.md`, `docs/store-copy/drafts.json`, `/workspace/2ndB-marketing/voice.md`
> 표시: **[미검증]** = 문서에 근거가 없거나 오래된 문서에서 나온 가정. Sebastian 확인 필요.

## 0. 2ndB가 뭔지 (키워드를 이렇게 고른 이유)
- 앱 이름 **2nd-Brain**(프로젝트명 2ndB). 한 줄: 「AI 시대의 자산은 나 자신. 기록이 쌓여 나의 북극성이 됩니다.」(GTM §1 정본, 2026-08-26 갱신)
- 하는 일: 일기·메모·링크·시기별 회고 인터뷰로 **나에 대한 기록**을 모음 → 위키로 정리 → 북극성(요약)은 AI가 **제안하고 사용자가 승인**(propose→ratify) → AI 비서 **세컨비(SecondB)** 가 요약이 아니라 원문 기록을 읽고 답함 → Markdown/JSON으로 내보내 다른 LLM에서도 씀 (README "What it does", PRD §1–2)
- 범주: 비임상 **자기이해·기록·개인 AI 비서** 앱. 임상·웰니스 범주가 아님(CONCEPT-BRIEF, voice.md). Google Play·App Store 출시 준비 중, 0.9.0(STATE.md). 한국어 우선, 5개 로케일(en·ko·es·pt·id).
- 수익: 무료 + 구독 티어, AI 사용 횟수로만 차등, 리워드 광고(GTM §4, CONCEPT-BRIEF).
- 가입 연령: 나라별 표(13–20, 최소 14), 모르면 18 (README).

## 1. 우리 이름 (자기 언급 감시)
왜: 2ndB가 커뮤니티·SNS에서 언급되는지 보려고. 일반 단어와 겹치므로 **앱/AI와 함께** 검색한다.
- EN: `"2nd-Brain" app`, `"2nd Brain" app`, `SecondB AI`
- KO: `세컨비`, `"2nd-Brain" 앱`, `세컨드브레인 앱`
- 브랜드(확정, Beatrice): Instagram `@hayang_prod`, X `@Hayang_Prod`, Facebook 페이지 「하양프로덕션」, 한글 상호 `하양프로덕션`·`하양 프로덕션` — 로그인 없는 공개 검색으로만 수집
- 제품어(단독 검색 금지, 노이즈 큼): 북극성, 별자리, 스크랩(PR #1865에서 「담기」가 바뀜), 일곱 별, 승인

## 2. 핵심 기능어 (사용자가 쓰는 말)
왜: 우리 기능과 같은 니즈를 말하는 글을 잡으려고. 스토어 초안 키워드(drafts.json)를 포함.
| 묶음 | KO | EN |
|---|---|---|
| 기록·일기 | AI 일기, 일기 앱, 저널링, 일상기록, 회고, 인생 회고 | AI journal, journaling app, daily journal, life review, one line a day |
| 메모·자료 | 메모정리, 기록관리, 자료모음, 글보관, 위키노트 | notes app, personal wiki, archive, links, read later |
| 자기이해 | 자기이해, 나를 알아가기, 진짜 나, 내 성향, 가치관, 강점 | self-understanding, self-knowledge, know yourself, personal values |
| 두 번째 뇌 | 세컨드 브레인, 제2의 뇌, 개인 지식관리(PKM) | second brain, PKM, personal knowledge management |
| 내 데이터로 답하는 AI | 내 기록 기반 AI, 나만의 AI 비서, 개인 AI | AI that knows me, personal AI assistant, RAG over my notes, chat with my journal |
| 내보내기·이식성 | 데이터 내보내기, 다른 AI로 옮기기, 마크다운 | export my data, portable memory, Markdown export, own your data |
| 스크랩·캡처 | 캡처 정리, 스크린샷 정리, 저장만 하고 안 봄 | screenshot hoarding, save and never read |
| 계획·리듬 | 작심삼일, 계획이 밀림, 루틴 실패, 내 리듬 | habit tracking burnout, routine failure |
| 회고 습관 | 한 줄 일기, 주간 회고, 월간 회고, 연말 회고, 기록 습관 | weekly review, monthly review, year in review |
| 나 탐구 | 나 사용 설명서, 나를 아는 법, 나 탐구 질문 | user manual for me, questions to know yourself |
| AI 요약 신뢰 | AI 요약 믿어도 될까, AI가 틀리게 요약 | AI summary wrong, AI summary accuracy |
| 검사·프레임 (**감시 전용 — 콘텐츠 힌트로 넘기지 않음**, 검사·진단 톤 금지) | 빅파이브, 성격검사, 애착유형 | Big Five, BFI-44, attachment style (ECR-S) |

## 3. AI 메모리·개인 AI (가장 가까운 범주 경쟁)
왜: 「나=자산」 해자에 직접 영향. 큰 AI가 나를 기억·요약하는 기능을 넣을수록 2ndB의 차별(편집권·원문 근거·이식성)이 시험받음 (CONCEPT-BRIEF 질문 1).
- EN: `ChatGPT memory`[T2·T3], `memory summary`[T2], `ChatGPT dreaming`[N2], `Claude memory`, `Gemini personal context`, `Meta Muse`[T6], `personal AI agent`[T6], `AI knows me`, `private AI compute memory`[N4]
- KO: `챗GPT 메모리`, `챗GPT 기억`, `메모리 요약`, `메타 뮤즈`[T6], `개인 AI 에이전트`, `AI가 나를 안다`
- 범용 AI(한국): 뤼튼 (Sebastian: §4에서 옮김)

## 4. 경쟁·비교 앱 (**내부 참고 전용**)
왜: GTM §3·§8에 적힌 경쟁 후보 + Sebastian 경쟁 감시 목록(`E:\2ndB\docs\research\competitor-watch-2026-09-27.md`). 이름이 흔한 단어면 `app`/`앱`을 붙임.
넘김 규칙: Beatrice에게는 앱 이름 대신 「사람들이 무엇을 불편해하는지」 중심으로 요약(콘텐츠에서 경쟁사 언급 금지). 앱 이름·수치 확인은 Sebastian으로.
- 저널링·자기성찰: Rosebud, Finch, How We Feel, Day One(`"Day One" journal app`), Reflectly, Daylio, Stoic(`Stoic journal app`), Mindsera [미검증: GTM에 없음, 범주상 후보], Harbour Journal(GTM §4 언급)
- 메모·PKM: Obsidian, Logseq, Notion, Evernote, Capacities(`Capacities app`), Mem [Mem은 미검증: GTM에 없음 — 감시 키워드로만]
- 한국 앱 (근거: Sebastian `E:\2ndB\docs\research\kr-competitor-candidates-2026-09-27.md` — URL·평가 수·스토어 설명 인용 포함). 이름이 흔하면 `앱`을 붙여 검색:
  - 가까운 후보: `휴튼 앱`, `타임버블 앱`, `헤이다이어리`, `와이더리 앱`, `나답 앱`
  - 감시만(비교 문구에 쓰지 않음): `마인디 앱` — CBT(인지행동 기법) 기반이라 2ndB(비임상)와 범주가 다름
  - 규모 기준점(경쟁 아님, AI 기능 없음): `하루콩 앱`
  - 제외(사주·범용 AI·임상 앱): Sebastian 파일의 제외 목록을 따름
- 비교 대상 아님(규제 참고만): 캐릭터챗(제타, 크랙, Character.AI, Replika) — 청소년 AI 규제 기사에 자주 같이 나옴

## 5. 타깃 커뮤니티 (수집 위치)
왜: GTM §3 타깃 세그먼트. ※ GTM §3–4 일부는 옛 local-first 전제(GTM §1이 경고) — 세그먼트 이름만 참고.
- Reddit: r/Journaling, r/PKMS, r/ObsidianMD, r/ChatGPT(메모리 여론), r/selfimprovement, r/productivity, r/Stoicism
- DC인사이드: 특이점이 온다 마이너 갤(AI 여론). [미검증] 자기계발·다이어리 관련 갤 — 다음 회차에 robots 확인 후 추가
- GeekNews, Hacker News(Show HN 저널링·세컨드브레인)
- Threads·X: 웹 검색 결과만
- 에브리타임·블라인드(GTM §3): **로그인 필요 → 수집 안 함**

## 6. SNS 밈·챌린지 (콘텐츠 힌트용)
왜: 「AI로 나를 알아보는」 놀이가 이미 퍼지는 중이면 우리 메시지와 닿음. 날마다 바뀜.
넘김 규칙: 밈마다 방향 한 줄 — 「AI가 나를 다 안다」 쪽인지 「내가 확인한다」 쪽인지(우리 메시지는 뒤쪽).
- `AI 한 단어 챌린지`[T1], `나는 무슨 꽃이야`, `AI 압수수색`[T1], `caricature me using everything you know about me`, `MBTI 대신 AI` — 지금 목록은 모두 「AI가 나를 다 안다」 쪽

## 7. 정책·규제 (Gaius / Ludovic / Malcolm 넘김용)
왜: 2ndB는 AI 대화 기능이 있고 14세 이상 가입, IAP 구독 예정이라 연령·AI 챗봇·스토어 결제 규칙이 바로 적용됨.
- 스토어: `Google Play policy`, `Play 수수료`, `인앱결제`, `대체 결제`, `App Store age rating`, `age assurance`, `App Store Accountability Act`, `iOS subscriptions`
- 연령·청소년: `EU KIDS Act`, `age verification app`, `AI 챗봇 청소년 보호`, `정보통신망법 개정안 AI 연령확인`, `우리 아이 AI 안심 패키지법`, `SB 243`, `SB 1119`
- AI 일반: `AI기본법`, `AI Act chatbot`, `생성형 AI 이용자 보호 가이드라인`, `학습 데이터 옵트아웃`
- LLM 벤더 사고: `OpenAI incident`, `ChatGPT data leak` (2ndB는 OpenAI 등 여러 벤더 사용 — PRD §0)

## 8. 제외어·주의
- 노이즈: Obsidian Energy / Obsidian Security, "Day One"(자선단체·행사), 일반어 Muse, 운세 기사(MBTI 오늘의 운세), AI 사주 서비스(예: 담월[T10] — Sebastian: 경쟁 앱 아님), 북극성·일곱 별·스크랩(단독)
- 임상 범주 기사(예: 디지털 의료기기)는 **규제 참고일 때만** 넣음. 2ndB는 비임상 — 넘길 때 효능·임상 표현을 옮겨 적지 않음(voice.md)
- 개인 식별 정보(닉네임·핸들·프로필 링크·얼굴) 기록 안 함
