# PRD — 2nd-Brain (Draft v4)

> Product Requirements Document. 제품의 "무엇을·누구를 위해·어떤 기준으로" 를 한 곳에 모은
> 단일 진입점. 구현 세부는 `docs/ARCHITECTURE.md`, 강제 조항은 `docs/CONSTRAINTS.md`,
> 시각 이주는 `docs/PIXEL-CLAY-MIGRATION.md`. **충돌 시 저장소 루트 `CLAUDE.md` 의 최신
> 절이 이 문서를 이긴다** — v3 시절에는 반대였는데, 그 사이 CLAUDE.md 가 결정을 먼저
> 받아 적는 문서가 됐다.

| 항목 | 값 |
|---|---|
| Status | **Draft v4 (2026-08-25 — 일곱 한 벌 정본화)** |
| Owner | Simon Kim (solo build) |
| Last updated | 2026-08-25 |
| Deadline | **없음.** XPRIZE 는 2026-08-15 종료 — 마감·심사자·규정은 무효한 판단 근거 |
| 시각 방향 | **PIXEL-CLAY v4** (M3-deepspace 는 출발점) — `docs/PIXEL-CLAY-MIGRATION.md` |

> ## 0. v3 → v4 에서 뒤집힌 것 (2026-06-25 → 2026-08-25)
>
> v3 를 읽고 온 사람이 가장 먼저 알아야 할 네 가지. **v3 의 해당 서술은 전부 무효다.**
>
> 1. **XPRIZE 종료** (2026-08-15). 마감·트랙·심사자 모드·제출 마일스톤 전부 판단 근거에서
>    제외. 코드 잔재(C2·C6·C12)는 §10 참조.
> 2. **일곱은 한 벌이 됐다** (2026-08-24, #1376~#1379). 홈 별 일곱 = 생활 도메인이 아니라
>    **나를 알아가는 자리**다. 도메인 여섯은 세컨비 대시보드로 내려갔다. §4 가 새 정본.
> 3. **시각 목적지는 PIXEL-CLAY v4** (2026-08-19). v3 의 "픽셀아트 금지"는 cosmic-pixel
>    레거시 스킨 이야기였고, PIXEL-CLAY 를 거부하는 근거로 인용 금지.
> 4. **LLM 은 멀티벤더** (2026-08-17~18). 경계 모듈은 `boundary.ts`(구 gemini.ts),
>    벤더는 자리 적합성으로 고른다. ~~Gemini 는 OCR·음성 텍스트화 자리.~~
>    **2026-08-29 정정:** OCR·음성도 openai 다 — Simon 2026-08-23 "OCR = openai 유지
>    (gemini 예외 없음)". Gemini 에 남은 자리는 없고 9월에 폐기한다. §8 참조.

---

## 1. 비전 (불변)

**"AI 시대 가장 가치있는 자산 = 나 자신."** 나를 데이터로 축적하고 개인 비서로 키우는
플랫폼. 세 축:

1. **알아가기** — 나를 카테고리별로 입력하고 깊게 파는 자리 (북두칠성 일곱 별)
2. **개인 비서 기반** — 알아낸 것으로 실제로 도와주는 자리 (세컨비 · `/ops` 계열)
3. **공상 → 구체화** — 발산을 붙잡아 실행으로 잇는 자리 (`/imagine` → 담기)

데이터 방향 (Simon 정정 2026-08-17, 뒤집지 말 것):

```
대화 · 입력 ──▶ LLM 위키 (상세 원문) ──▶ 상세 분석 ──▶ 세컨비 발화
                     └────────────▶ 북극성 페르소나 (요약, 파생물)
```

위키가 원본이고 페르소나는 파생 요약이다. LLM 은 페르소나가 아니라 기록·위키를 읽고
말한다. "페르소나"는 LLM 이 쓸 가면이 아니라 대화로 알아낸 그 사람의 실제 모습이다.

## 2. 사용자와 문제

- **주 사용자**: 자기 자신을 정리하고 싶은 개인. 한국어 우선, 5개 로케일(en·ko·es·pt·id).
- **문제**: 자기 기록은 흩어지고(메모·대화·검사 결과), 요약은 소유되지 않으며(플랫폼
  종속), AI 는 나를 모른 채 일반론을 말한다.
- **답**: 기록을 한 곳에 담고(담기·인터뷰·임포트), 그 기록만을 근거로 나를 요약하며
  (북극성, propose→ratify 로 내가 승인), 그 요약이 아니라 **원문을 읽는** 비서(세컨비)를
  붙인다.
- 연령: 14세 이상 자기동의 가입, 14세 미만은 법정대리인 동의(C10). 미성년 개방 상태는
  CLAUDE.md 해당 절이 정본.

## 3. 제품 구조 — 네 덩어리 (Simon 2026-08-17, 이 밖의 층을 발명하지 말 것)

| # | 덩어리 | 무엇 | 어디 |
|---|---|---|---|
| 1 | **북두칠성 일곱 별** | 입력 — 나를 알아가는 자리 | 홈 별자리 → `/me/[star]` → `/interview` |
| 2 | **북극성** | 그 요약(페르소나) | `/core-brain` · `/northstar` · `/brightness` |
| 3 | **세컨비** | 활용 — 페르소나 근거로 실제로 도움 | `/secondb` + 대시보드 · `/ops` 계열 |
| 4 | **커뮤니티·공유** | 나눔 | `/community` · `/share-card` · `/peer-invites` |

## 4. 별자리 모델 (정본 — 2026-08-24 "일곱은 한 벌")

### 4.1 홈 일곱 별 = 나를 알아가는 자리

코드 정본: `src/lib/persona/seven-stars.ts`. 저장소에 "일곱"이 세 벌(도메인 별 · 자기이해
축 · 렌즈) 있어서 만든 사람도 헷갈렸고, Simon 결정으로 한 벌이 됐다.

| # | 별 | id | 시기/주제 | 인터뷰 |
|---|---|---|---|---|
| 1 | 프로필 | `profile` | 가입 정보·기본 개인정보 | 없음 (`/profile-details` 폼) |
| 2 | 영유아기 | `infancy` | 0~6세 | 있음 |
| 3 | 학창시절 | `school` | **7~19세** | 있음 |
| 4 | 20대 | `twenties` | 20~29세 | 있음 |
| 5 | 30대 이후 | `later` | 30세~ | 있음 |
| 6 | 직장 | `work` | 나이 무관 — 일하는 나 | 있음 |
| 7 | 지금 | `now` | 나이 무관 — 현재의 나 | 있음 |

- 학창시절이 7~19 인 이유: Simon 원안(7~18)은 19세가 어느 칸에도 없었다. 한국에서
  19세는 고3·재수·대학 1학년. `interview/__tests__/periods.test.ts` 가 경계 무결성을 지킨다.
- **겹침을 막지 않는다** (결정 1). 별을 재료로 가르지 않고 **질문의 결**로 가른다 — 같은
  서른다섯 살 이야기라도 시기 별은 *그때 어떤 사람이었나*, 직장 별은 *일하는 나*를 묻는다.
- **살지 않은 별은 잠근다** (`isUnlived`) — 스물다섯에게 "30대 이후"는 어둡게 두고 못
  들어가게 한다. 나이를 모르면 막지 않는다.
- 별자리 모양(좌표·선·바이어 이름)은 2026-08-24 개편에서 **그대로 유지**됐다 — 바뀐 것은
  별의 뜻이지 그림이 아니다. 지극성(Merak→Dubhe)→북극성 점선도 그대로.

### 4.2 밝기 = 판 만큼 (정직성 규칙, 불변 원칙 + 새 계기)

별 하나의 밝기 = 그 자리에서 다섯 층(fact→feeling→meaning→belief→echo, McAdams) 중
몇 층을 열었는가. `interview_coverage`(0143) 가 센다. 사다리:

| 열린 층 | 0 | 1 | 2~3 | 4+ | 비준 |
|---|---|---|---|---|---|
| 등급 | L1 | L2 | L3 | L4 | **L5** |

- **커버리지로는 L4 가 최대다. L5 는 비준(propose→ratify)으로만 온다.** 아무리 깊게 파도
  자동으로 최고 등급이 되면 "네가 확인해줬다"와 "내가 계산했다"가 구분되지 않는다.
- "모르겠다"는 칸을 채우지 않고 같은 층에서 발판(scaffold)을 준다. 대화가 저절로 별을
  밝히지 않는다 — 커버리지는 저장에 동의한 인터뷰만 센다.
- 밝기가 부풀면 거짓말이고 덜 차면 그냥 덜 찬 것이다. 읽기 실패 시 어둡게 둔다.
- 프로필 별은 인터뷰가 없으므로 채운 항목 수로 밝아진다(결정 5=A, `load-profile-star.ts`).

### 4.3 북극성 = 페르소나 (여섯 평균, 프로필 제외)

- 북극성 밝기 = **그리는 별 중 프로필을 뺀 여섯**의 평균(캐논 `polarisBrightness` 가 목록
  소유). 프로필은 나를 *설명하는* 자리이지 *증거*가 아니라서 평균에 넣으면 페르소나가
  부분적으로 자기 자신의 평균이 된다.
- 화면: `/core-brain`(종합·근거 서랍) · `/northstar`(한 줄 정체성 문장 편집) ·
  `/brightness`(8주 밝기 타임라인 — 새 일곱만 그린다).
- "Soul Core / Core Brain" 은 **이름만** 레거시다. 라우트 `/core-brain` 은 LIVE 고
  사용자 노출명이 북극성이다. 화면 폐기 서술(v3 §0)은 무효.

### 4.4 검증층 (stars.ts — 별이 아니다)

`src/lib/persona/stars.ts` 의 자기이해 축 7개는 **화면에 별로 뜨지 않는 검증층**이다.

- 셋(`now` 지금의 나·`relational`·`values`)은 실제 측정 도구(BFI-44/IPIP-NEO-120/ECR-S/
  가치)가 붙어 있고 **propose→ratify 가 그 위에 서 있다. 지우지 말 것.**
- 넷(`recall`·`seen`·`rhythm`·`possible`)은 2026-08-15 감사에서 "구인이 아니라 행 수를
  쟀다"고 확인된 쪽 — 새 판단의 근거로 인용 금지.
- 렌즈층(`lib/lenses/*`)은 2026-08-15~21 사이 ②를 대체하려다 2026-08-24 결정 7로
  **휴면**. 관문 5개·자율도 L1~L3 정의는 유효하나 "렌즈"라는 말은 사용자 앞에 안 나온다.
- ⚠ **`now` 가 두 체계에 다 있고 뜻이 다르다.** 원장(`star_tier_history`)에서 새 체계는
  `seven:` 접두사를 단다(`seven-tier-history.ts`). 떼면 예외 없이 틀린 숫자가 뜬다.

### 4.5 세컨비 대시보드 = 생활 여섯 영역 (별에서 내려온 것)

커리어·재정·성장·관계·건강·휴식은 **별이 아니라 활용면**이다. 진입 = 별자리에서 세컨비
머리 터치 → `/secondb?panel=dashboard`, 대화창 안에 여섯 영역 등급 요약이 펴진다(결정
6=B). 한 줄을 누르면 `/star/<domain>` 상세(브리핑+담기+타임라인)가 열린다 — 이 상세
화면들은 살아 있고, 입구만 바뀌었다. 담아내기(collect)는 대시보드에도 없다 — 생활
영역이 아니라 데이터 통로다.

### 4.6 propose → ratify (불변 원칙)

AI 는 자기모델을 직접 바꾸지 못한다. 제안(before/after/rationale/citations)을 만들고
사용자가 비준해야만 반영되며, **L5 는 비준으로만** 열린다. 인용은 실존 id(`record:<id>`
등)만 원장에 남는다(0060 sanitize).

- 옛 축 비준(검사 기반): `/review` — now/relational/values, `ratifiable.ts` 가 측정 근거
  있는 축만 후보로.
- **새 별 비준(인터뷰 기반, 2026-08-25 개통)**: 같은 `/review` 화면 — 두 층 이상 판 시기
  별만 후보(`seven-proposal-context.ts`, 문턱 2칸), 제안 근거는 그 시기의 인터뷰 원문,
  승인 시 `recordSevenTiers(origin:'ratify')` 로 `seven:` 접두사를 달고 적힌다.
- 그 밖의 비준면: `/northstar`(문장) · `/ttfv`(첫날 한 컷) · `/digest`(추론 링크 확정).

### 4.7 원장 규율 (star_tier_history)

- 새 체계 행은 항상 `seven:` 접두사 (`seven:school` 등). 값 재매핑 마이그레이션은 쓰지
  않았다 — id 값을 바꾸면 타입검사·테스트를 통과하면서 화면이 조용히 빈다(#1318 전례).
- 옛 축 행은 페르소나 rebuild 가 계속 쓴다(공존 상태). 은퇴는 별도 결정 사항.
- 두 체계를 같이 그리는 화면(`/ratifications`·`/review` 넛지)은 `star-name.ts` 의 공용
  해석기로 이름을 붙인다 — 원시 id 노출 금지.

## 5. 진입 경로와 내비게이션 (결정 4·6)

```
별자리 홈 (/)
 ├─ 별 탭 ──────────▶ /me/<star> 요약 ──▶ /interview?period=<p> (5층 드릴다운)
 ├─ 북극성 탭 ──────▶ /core-brain ──▶ /northstar · /brightness · /review
 ├─ 세컨비 머리 탭 ─▶ /secondb?panel=dashboard ──▶ /star/<domain> 상세
 ├─ 코너: 알림(/inbox) · 뮤지엄(/museum) · 커뮤니티(/community) · ops(/ops)
 └─ dock: 별자리 · 담기(/capture) · 세컨비 · 위키(/wiki) · 설정(/settings)
```

- 별을 누르면 **요약이 먼저** 열린다. 바로 인터뷰로 던지지 않는다 — 지금까지 뭘 했는지
  볼 자리가 없으면 매번 처음부터인 기분이 된다.
- 정보 밀도 (불변): 화면당 메시지 하나 + 그래픽 하나. 탭은 화면을 단순화하고, 모달을
  겹치지 않으며, Back 은 한 곳.

## 6. 화면 카탈로그 (2026-08-25 실측 — 사용자 화면 72)

전 라우트 등록부는 `src/lib/dev/screen-index.ts`(가드가 라우트 전수와 대조), 캐논은
`src/lib/canon/`. 아래는 여정 순 요약 — **[신]** = 2026-08-24 개편 산물, **[갱]** = 살아
있으나 서술·전제가 옛 구조(디자인 갱신 대상).

| 여정 | 화면 (라우트) |
|---|---|
| 가입·게이트 | `/onboarding` `/sign-up` `/sign-in` `/reset-password` `/oauth-callback` `/complete-profile` `/terms` `/privacy-policy` `/refund` `/consent-notice` `/manual` `/ttfv` |
| 홈·별 | **[신]** `/`(일곱 별 별자리) · **[신]** `/me/[star]`(별 요약) · **[신]** `/interview`(5층 드릴다운+진행판) |
| 북극성 | `/core-brain` · `/northstar` · **[신]** `/brightness`(8주) · **[갱]** `/review`(비준 — 시기 별 후보 추가됨) · **[갱]** `/ratifications`(이력) · `/share-card` |
| 세컨비·활용 | **[신]** `/secondb`(+대시보드 패널) · `/ops` `/imagine` `/reasoning` `/focus` `/srs` `/reading` `/meals` `/milestones` `/side-project` `/call-reflection` `/reminders` `/digest` `/insights` |
| 도메인 상세 | **[갱]** `/star/[domain]`(입구가 대시보드로 바뀜) · `/career` `/career-input` `/career-drilldown` `/people` `/rest` `/ledger` `/growth` |
| 검사·검증층 | `/persona` `/big-five` `/ipip-neo` `/rlss` `/values` `/strengths` `/motivation` `/attachment` `/esm` · **[갱]** `/seen`(피어 집계) · **[갱]** `/audit` |
| 기록·위키 | `/capture` `/capture-full` `/records` `/record/[id]` `/wiki` `/formats` `/import` `/import-hub` `/integrations` `/inbox` |
| 공유·커뮤니티 | `/community` `/community/[room]` `/community/join/[token]` `/peer-invites` `/peer/[token]`(무계정) `/museum` |
| 설정·계정 | `/settings` `/account` `/profile` · **[신]** `/profile-details` · `/change-password` `/theme` `/data` `/permissions` `/privacy` `/notices` `/support` `/plans` `/subscription` `/beyond` `/iden` |

리다이렉트 스텁(`/jarvis` `/journal` `/mbti` `/discover`)과 dev 전용 8개는 카탈로그 밖.
`/mbti` 는 dormant — 삭제도 리다이렉트도 금지(2026-08-23).

## 7. 시각 방향 — PIXEL-CLAY v4 (2026-08-19 확정)

SoT = `docs/PIXEL-CLAY-MIGRATION.md`, 인수 자료 = `design/pixel_clay_v4/`(착수 전
`REPO-NOTES.md` 필독). 개념(별자리·북극성·정직한 밝기·propose→ratify·세컨비)은 그대로,
시각 체계만 바뀐다.

- 절대 규칙 7: 정수 `rect` 만 · radius 0 · blur 금지(디더) · 정적 opacity 금지(밴딩/디더) ·
  `steps()` 이징만 · 4방향 베벨 · 토큰 색만.
- 폰트 Galmuri 4종, 팔레트 midnight 고정, 단위 `--u=2px`(D1), 별은 rect 이되 "4방향으로
  빛나는 별 모양"(#1309), 디더=타일 이미지(D4), hover 는 버리고 `:active` press 만.
- 이름 셋 구분: **cosmic-pixel**(폐기 스킨) ≠ **M3-deepspace**(현행/출발점) ≠
  **PIXEL-CLAY v4**(목적지). "레거시 픽셀이니 버린다"는 논증을 목적지에 적용하지 말 것.
- 이주 착수 전까지 화면에는 현행 M3-deepspace 규칙이 그대로 적용된다.

## 8. LLM (멀티벤더 — 벤더가 아니라 적합성)

- **C1 불변**: 모든 호출은 `src/lib/llm/boundary.ts` 단일 경계로. C9 분류가 선행, C3 감사
  기록이 후행. 경계는 벤더 무관.
- 벤더 (2026-08-29 갱신 — 배포 자세 실측): **openai**(추론 좌석 대부분 · 세컨비 대화 ·
  **OCR·음성 텍스트화** · 백본) · **claude**(persona_narrative · persona_synthesis ·
  crosscheck_defend — V-4, 2026-08-23) · xai(스위치 선택지, 바이너리 불가) ·
  ~~gemini(OCR·음성 텍스트화)~~ gemini 는 **9월 폐기 대상**, 구빌드 설치 앱의 실서빙과
  스위치 미설정 폴백 때문에만 살아 있다 — 프록시 4종(supabase functions).
  스위치는 `EXPO_PUBLIC_{LLM,CHAT,MULTIMODAL,BACKBONE,EMBED}_VENDOR` + `_FAILOVER_VENDOR`.
  모델 선택은 서버 소유(env), 항상 최신 모델, 좌석마다 effort 명시.
- 신규 좌석 추가 시: 프록시 허용목록 재배포가 클라이언트 변수 플립보다 **먼저**
  (`purpose_not_seated` 함정).

## 9. 안전·어휘·연령 (불변)

- **안전 3레인** (2026-08-16): 자살·자해=상담(미성년 1388→109/성인 109) · 진행 중 신체
  응급=119 · 타인에 의한 급박 위협=112(미성년 1388·117 병기). 자살 레인에 112 금지,
  애매하면 상담 레인 폴백. 학교폭력 117, 성폭력 1366.
- **어휘 정책**: 임상 용어 금지(`lexicon.ts` 단일 정본, CI 스캔 — 이 문서도 스캔 대상이라
  금지어는 여기에 예시로도 못 적는다). 금지는 **단어**이지 기능이 아니다 — 친구처럼 깊게
  듣고 파악하는 기능 자체는 제약 없음(Simon 2026-08-17). "렌즈"도 사용자 표면에서
  금지(결정 7).
- **연령**: C10 단계별 가입. 미성년 게이트(광고·건강·커뮤니티·결제)는 CLAUDE.md 해당
  절이 정본 — 임의 해제 금지.

## 10. 강제 조항 C1~C12

`docs/CONSTRAINTS.md` + CI (`npm run check:constraints`). **C2·C6·C12 는 대회 잔재** —
코드·CI 에서는 유효하니 깨뜨리지 말되, 새 기능의 근거로 인용 금지. 나머지(C1 경계 ·
C3 감사 · C4 매출 필드 · C5 동의 · C7 i18n 패리티 · C8 출처 검증 · C9 안전 분류 ·
C10 연령 · C11 SLA)는 현행 요건.

## 11. 수익화 (원칙 불변, 스택 갱신)

- **원칙**: Core 는 영구 무료, 게이트는 AI 호출량뿐, 어떤 티어도 "더 좋은 답"을 주지
  않는다.
- 티어: free / plus(항해자) / pro(북극성) — SoT `src/lib/entitlements/tier-map.ts`,
  reasoning 캡은 주간. soma 는 판매 종료. 별테마 명칭 확정(오픈 퀘스천 아님).
- 결제: **Paddle**(MoR, 웹훅 라이브) + 웹 전용 크레딧 상점(0133~0137). 네이티브 앱 안에
  충전 버튼 금지(스토어 3.1.3(f)). RevenueCat/IAP 서술(v3)은 무효.

## 12. 스택 (실측 2026-08-25)

- RN + Expo SDK 56, TS strict, Supabase(Postgres+Auth+Edge Functions), EAS Build.
- **웹 배포 = GitHub Pages** (`web-deploy.yml`, `baseUrl:/2nd-B`). Vercel 은 연결만 되어
  있고 아무것도 안 나간다.
- 분석 = GA4 + Clarity (PostHog 는 2026-08-11 제거). 네이티브 = RNFB(성인+동의 게이트).
- APK 배포 = GitHub Release. 백업 = 야간 age 암호화 pg_dump.

## 13. 측정 (새 계기 기준)

XPRIZE KPI 는 전부 폐기. 새 구조의 정직한 계기:

| 지표 | 계기 |
|---|---|
| 알아가기 깊이 | `interview_coverage` 열린 칸 수 (사용자·별·층별) |
| 별 점등 | `star_lit` 이벤트 (seven: 체계) · 활성 별 수 |
| 비준 도달 | `evidence_origin='ratify'` 행 (2026-08-25 개통 — 기준선 0) |
| 활용 | 세컨비 대화 세션 · `/ops` 수락률 · 대시보드 진입 |
| 소유 | 내보내기(`/iden`·`/data`) 사용 · autosave 동의율 |

## 14. 남은 것 (알려진 미결 — 착수 전 Simon 확인)

- 옛 축 원장 행 은퇴(rebuild 가 계속 쓰는 중 — Layer B 은퇴 본작업과 한 묶음).
- 꺼내기(resurface) 개인화 — 슬롯은 live(`/digest`), 규칙이 아직 전원 동일.
- 세컨비→허슬케이 / 앱 이름 — 하나의 네이밍 체계로 함께 결정(secondb_chat 좌석 함정).
- 미성년 개방 미결 항목(CLAUDE.md 정본) · PIXEL-CLAY 이주 착수.

## 15. 문서 지도 (무엇을 믿을 것인가)

| 문서 | 상태 |
|---|---|
| 루트 `CLAUDE.md` | **최상위 정본** (결정 로그 — 충돌 시 항상 이긴다) |
| 이 문서 (PRD v4) | 제품 정의 정본 |
| `docs/PIXEL-CLAY-MIGRATION.md` · `design/pixel_clay_v4/REPO-NOTES.md` | 시각 이주 정본 |
| `src/lib/persona/seven-stars.ts` · `src/lib/canon/` | 코드가 곧 정본인 것들 |
| `docs/CONSTELLATION-DESIGN.md` | ⚠ **역사 기록** — 6 도메인 별 골격, 2026-08-24 이전 |
| `docs/CONCEPT.md` | 반쪽 — 시각 방향 절만 최신, Layer A 서술은 낡음 |
| `legacy/docs/ui-audit/*` · v3 PRD | 역사 기록 |
