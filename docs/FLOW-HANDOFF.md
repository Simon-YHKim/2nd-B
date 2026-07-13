# 2nd-B — 구조 핸드오프 (flow-debugger)

> **새 세션은 이 파일 하나로 앱 구조를 파악한다.**
> 여기 있는 모든 코드 좌표는 **실제 소스트리와 대조·검증**된 것이다(빌드 때 자동 생성).
> 자동 생성: `node scripts/make-handoff.js` — 손으로 고치지 말고 재생성할 것.

규모: **86개 화면 · 342개 동작 · 서버/데이터 77종 · AI 10종**  
코드 좌표 신뢰도: **✔ 함수까지 대조 253** · **· 파일·줄만 확인 355** · ⚠ 0

## 0. 새 세션 시작하는 법 (그대로 붙여넣기)

```bash
git pull origin main
cat docs/FLOW-HANDOFF.md          # 이 파일 — 앱 구조 파악
# 클릭해서 보는 흐름도(선택): docs/flow-debugger.html
```

그리고 에이전트에게: **"`docs/FLOW-HANDOFF.md` 읽고 구조 파악한 다음 이어서 작업해"**

## 1. 이 앱에서 새 세션이 가장 많이 저지르는 실수 두 가지

### ① 프로덕션이 렌더하지 않는 파일을 고친다

**`isDeepSpaceUI()`** (`src/lib/ui-mode.ts:36`) 가 어느 UI를 그릴지 고른다 — 라우트 파일 4개가 이걸로 갈라진다.

**사용자가 보는 화면은 이 함수가 고르는 쪽이다.** 라우트 파일의 다른 본문은 프로덕션에서
렌더되지 않는다 — 거기를 고치면 **빌드는 초록인데 화면은 그대로**다.
아래 화면 표의 `프로덕션 렌더 파일` 열을 보고 그 파일을 고쳐라.

### ② 사용자가 열 수도 없는 화면의 "버그"를 고친다

아래 **5개 화면은 게이트 뒤에 있어** 일반 사용자가 못 연다.
여기서 발견한 문제는 **실제 사용자에게는 보이지 않는다.** 고치기 전에 그 사실부터 확인할 것.

| 화면 | 게이트 | 근거 |
|---|---|---|
| `/trends` | dev-only | `src/app/trends.tsx:18` |
| `/deepspace-home` | dev-only | `src/app/deepspace-home.tsx:6` |
| `/deepspace-hub` | dev-only | `src/app/deepspace-hub.tsx:6` |
| `/deepspace-flowmap` | dev-only | `src/app/deepspace-flowmap.tsx:6` |
| `/deepspace-preview` | dev-only | `src/app/deepspace-preview.tsx:6` |

### ③ 겉보기와 다른 헬퍼 (화면 코드만 읽으면 절대 안 보인다)

화면에 아래 함수 호출이 한 줄 있으면, 그 안에서 **AI를 부른다.** (총 27개)

| 함수 | 위치 | 안에서 하는 일 |
|---|---|---|
| `useImportPendingCaptures()` | `src/lib/capture/use-import-pending.ts:15` | AI + db:memorized_patterns:insert, db:records:insert, edge:gemini-proxy |
| `sendChatMessage()` | `src/lib/chat/conversation.ts:166` | AI + db:chat_usage:select, db:records:select, db:wiki_pages:select |
| `retrieveChatContext()` | `src/lib/chat/rag.ts:40` | AI + db:wiki_pages:select, rpc:match_wiki_pages, edge:gemini-proxy |
| `buildIdenDoc()` | `src/lib/iden/build-iden.ts:257` | AI + db:records:select, db:personas:select, db:memorized_patterns:select |
| `exportIden()` | `src/lib/iden/iden-export.ts:89` | AI + db:records:select, db:personas:select, db:memorized_patterns:select |
| `nextProbe()` | `src/lib/interview/probe.ts:239` | AI + edge:gemini-proxy, db:knowledge_sources:select |
| `classifyRecordTextForCrisis()` | `src/lib/llm/gemini.ts:388` | AI |
| `callGemini()` | `src/lib/llm/gemini.ts:464` | AI + edge:gemini-proxy, db:knowledge_sources:select, rpc:log_ai_audit |
| `embedTexts()` | `src/lib/llm/gemini.ts:903` | AI + edge:gemini-proxy |
| `transcribeAudio()` | `src/lib/llm/gemini.ts:1046` | AI + rpc:log_ai_audit |
| `callAdvisor()` | `src/lib/llm/gemini.ts:1152` | AI + edge:gemini-proxy, db:knowledge_sources:select, rpc:log_ai_audit |
| `classifySafety()` | `src/lib/llm/safety.ts:254` | AI + rpc:log_ai_audit |
| `buildOpsDailyBrief()` | `src/lib/ops/daily-brief.ts:142` | AI + db:ops_daily_brief:upsert, edge:gemini-proxy, db:wiki_pages:select |
| `recommendForDomain()` | `src/lib/ops/recommend.ts:163` | AI + db:star_tier_history:select, edge:gemini-proxy, db:wiki_pages:select |
| `buildPersona()` | `src/lib/persona/build.ts:527` | AI + db:records:select, db:personas:select, db:memorized_patterns:select |
| `synthesizePersonas()` | `src/lib/persona/persona-synthesis.ts:243` | AI + edge:gemini-proxy, db:knowledge_sources:select, rpc:log_ai_audit |
| `proposeSelfModelChange()` | `src/lib/persona/propose-self-model.ts:82` | AI + edge:gemini-proxy, db:knowledge_sources:select, rpc:log_ai_audit |
| `createRecord()` | `src/lib/records/create.ts:100` | AI + db:memorized_patterns:insert, db:records:insert, edge:gemini-proxy |
| `embedAndStoreRecord()` | `src/lib/records/records-embeddings.ts:94` | AI + edge:gemini-proxy, db:records:update |
| `backfillRecordEmbeddings()` | `src/lib/records/records-embeddings.ts:161` | AI + db:records:select, edge:gemini-proxy, db:records:update |
| `ocrImageAsset()` | `src/lib/wiki/capture-image.ts:501` | AI + edge:gemini-proxy, db:knowledge_sources:select, rpc:log_ai_audit |
| `classifyClipper()` | `src/lib/wiki/classify-clipper.ts:211` | AI + db:clipper_templates:select, edge:gemini-proxy, db:knowledge_sources:select |
| `embedAndStorePage()` | `src/lib/wiki/embeddings.ts:82` | AI + edge:gemini-proxy, db:wiki_pages:update |
| `backfillEmbeddings()` | `src/lib/wiki/embeddings.ts:108` | AI + db:wiki_pages:select, edge:gemini-proxy, db:wiki_pages:update |
| … | | 나머지 3개 |

## 2. 스택

React Native + Expo Router (Expo SDK ~56) + Supabase(auth·db·rpc·edge·storage) + Gemini(gemini-proxy 엣지 함수 경유) + RevenueCat IAP. 프로덕션 UI = deep-space: src/app/*.tsx 의 상당수가 isDeepSpaceUI()(src/lib/ui-mode.ts:36, 기본값 deep-space)로 src/screens/deepspace/** · src/components/deep-space/** 에 위임한다 — src/app 의 legacy 본문은 프로덕션에서 렌더되지 않으니, 화면 수정은 코드 힌트의 (렌더: …) 파일에서 해야 빌드 통과와 화면 반영이 함께 된다. dev 전용 라우트(배포판 미개방): /trends /deepspace-home /deepspace-hub /deepspace-flowmap /deepspace-preview.

## 3. 화면 인벤토리

### 인증·시작  `auth`  (7)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 로그인 | `/sign-in` | 6 | `src/screens/deepspace/dds-auth-screens.tsx:156` · |  |
| 회원가입 | `/sign-up` | 5 | `src/screens/deepspace/dds-auth-screens.tsx:405` · |  |
| 비밀번호 재설정 | `/reset-password` | 4 | `src/screens/deepspace/dds-auth-screens.tsx:597` · |  |
| 프로필 완성 | `/complete-profile` | 3 | — |  |
| 소셜 로그인 처리 중 | `/oauth-callback` | 2 | — |  |
| 가입 전 빠른 메모 | `/jot` | 3 | — |  |
| 권한 안내 | `/permissions` | 2 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1194` · |  |

### 메인 화면  `home-shell`  (8)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 홈 (별자리) | `/` | 5 | `src/components/deep-space/DeepSpaceShell.tsx:25` · |  |
| 세컨비 대화 | `/secondb` | 5 | — |  |
| 담기 (자료 저장) | `/capture` | 4 | `src/components/deep-space/DeepSpaceViews.tsx:200` · |  |
| 전체 담기 (링크·사진·파일) | `/capture-full` | 4 | `src/app/capture.tsx:273` · |  |
| 위키 (서재) | `/wiki` | 5 | `src/screens/deepspace/dds-wiki-records-screens.tsx:1259` · |  |
| 설정 | `/settings` | 5 | — |  |
| 계정 (나 허브) | `/account` | 2 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:463` · |  |
| 프로필 | `/profile` | 5 | — |  |

### 시작하기·둘러보기  `onboarding-nav`  (8)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 온보딩 소개 화면 | `/onboarding` | 4 | — |  |
| 첫 통찰(첫날 자기이해) | `/ttfv` | 5 | `src/screens/deepspace/onboarding/TTFVScreen.tsx:74` · |  |
| 받은편지함(딥스페이스) | `/inbox` | 1 | `src/screens/deepspace/dds-import-inbox-screens.tsx:79` · |  |
| 발견(트렌드) | `/discover` | 3 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1221` · |  |
| 사용 설명서 | `/manual` | 4 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1075` · |  |
| 지원(고객지원) | `/support` | 5 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:408` · |  |
| 테마·화면 설정 | `/theme` | 4 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1043` · |  |
| 없는 페이지(404) | `/+not-found` | 5 | — |  |

### 별자리·지식맵  `constellation`  (9)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 영역 별 렌즈 | `/star/[domain]` | 4 | — |  |
| 소울 코어 / 북극성 | `/core-brain` | 6 | `src/app/core-brain.tsx:338` · |  |
| 북극성 문장 | `/northstar` | 4 | — |  |
| 북극성 종합 (나) | `/persona` | 5 | `src/components/deep-space/DeepSpaceViews.tsx:1766` · |  |
| 신원 파일 내보내기 | `/iden` | 4 | `src/app/iden.tsx:88` · |  |
| 밝기 변화 | `/brightness` | 3 | — |  |
| 보여지는 나 | `/seen` | 4 | `src/components/deep-space/DeepSpaceViews.tsx:1135` · |  |
| 앱 밖에서 | `/beyond` | 4 | — |  |
| 내 영역 (건강·앱·뇌·재정) | `/trinity` | 4 | `src/app/trinity.tsx:349` · |  |

### 검사·진단  `assessments`  (8)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 성격 5요인 검사 | `/big-five` | 6 | `src/app/big-five.tsx:308` · |  |
| 성격 정밀검사 (IPIP-NEO-120) | `/ipip-neo` | 4 | `src/app/ipip-neo.tsx:254` · |  |
| MBTI (폐지됨 → 자동 이동) | `/mbti` | 1 | — |  |
| 애착 유형 검사 (ECR-S) | `/attachment` | 5 | `src/app/attachment.tsx:313` · |  |
| 가치 자기보고 | `/values` | 4 | `src/components/deep-space/AxisCheck.tsx:382` · |  |
| 강점 자기보고 | `/strengths` | 4 | `src/components/deep-space/AxisCheck.tsx:382` · |  |
| 동기 자기보고 | `/motivation` | 4 | `src/components/deep-space/AxisCheck.tsx:382` · |  |
| 삶의 만족도 검사 (RLSS) | `/rlss` | 4 | `src/app/rlss.tsx:256` · |  |

### 나 알아가기  `self-model`  (8)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 그때그때 마음 체크인 | `/esm` | 5 | — |  |
| 심층 인터뷰 | `/interview` | 5 | — |  |
| 성장 · 과거의 나 | `/audit` | 3 | `src/components/deep-space/DeepSpaceViews.tsx:1566` · |  |
| 리뷰 · 제안하고 승인하기 | `/review` | 4 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1254` · |  |
| 승인 이력 | `/ratifications` | 5 | — |  |
| 프로토 캐논 (개발용 참고) | `/canon` | 2 | — |  |
| 내 데이터 리뷰 | `/data` | 4 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:978` · |  |
| 내보내기 형식 | `/formats` | 5 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1625` · |  |

### 기록·위키  `records-graph`  (8)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 기록 모아보기 | `/records` | 6 | `src/screens/deepspace/dds-wiki-records-screens.tsx:269` · |  |
| 기록 자세히 보기 | `/record/[id]` | 6 | `src/screens/deepspace/dds-wiki-records-screens.tsx:755` · |  |
| 연결 지도 | `/graph` | 5 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:281` · |  |
| 오늘의 정리 | `/digest` | 6 | — |  |
| 관계 찾기 | `/research` | 6 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1385` · |  |
| 이번 주 돌아보기 | `/insights` | 5 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:787` · |  |
| 밝기 추이 (개발용 데모) | `/trends` | 2 | `src/screens/deepspace/trends/TrendsScreen.tsx:40` · | 🔒 dev-only |
| 나의 변화 | `/growth` | 6 | `src/screens/deepspace/growth/WeeklyGrowthScreen.tsx:61` · |  |

### 성장·운영  `ops`  (9)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 오늘의 비서 | `/ops` | 6 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1770` · |  |
| 재정 점검 | `/ledger` | 2 | `src/screens/deepspace/ops/screens.tsx:476` · |  |
| 주간 식단 | `/meals` | 4 | `src/screens/deepspace/ops/screens.tsx:678` · |  |
| 목표 | `/milestones` | 3 | `src/screens/deepspace/ops/screens.tsx:381` · |  |
| 예약 알림 | `/reminders` | 3 | `src/screens/deepspace/ops/screens.tsx:863` · |  |
| 내 책장 | `/reading` | 3 | `src/screens/deepspace/ops/screens.tsx:277` · |  |
| 오늘의 복습 | `/srs` | 3 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2459` · |  |
| 집중 타이머 | `/focus` | 4 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2270` · |  |
| 휴식 담기 | `/rest` | 3 | — |  |

### 영역·사람  `domain-social`  (9)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 커리어 타임라인 | `/career` | 5 | — |  |
| 커리어 드릴다운 (3C4P) | `/career-drilldown` | 4 | — |  |
| 관계 인물맵 | `/people` | 3 | — |  |
| AI 뮤지엄 | `/museum` | 5 | `src/screens/deepspace/museum/MuseumTimelineScreen.tsx:69` · |  |
| 사이드 프로젝트 | `/side-project` | 2 | `src/screens/deepspace/ops/screens.tsx:573` · |  |
| 지인 평가 (응답 화면) | `/peer/[token]` | 4 | — |  |
| 지인 초대 | `/peer-invites` | 3 | — |  |
| 통화 성찰 (통화 녹음) | `/call-reflection` | 4 | — |  |
| 공유 카드 | `/share-card` | 4 | — |  |

### 가져오기·구독·약관  `import-monetize-legal`  (12)

| 화면 | route | 동작 | 프로덕션 렌더 파일 | 게이트 |
|---|---|---|---|---|
| 외부 자기지식 가져오기 | `/import` | 5 | `src/screens/deepspace/dds-import-inbox-screens.tsx:162` · |  |
| 개인 데이터 가져오기 허브 | `/import-hub` | 6 | `src/screens/deepspace/import/ImportHubScreen.tsx:80` · |  |
| 소스 연결 | `/integrations` | 2 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:300` · |  |
| 요금제 | `/plans` | 5 | `src/screens/deepspace/dds-plans-screen.tsx:103` · |  |
| 개인정보·데이터 관리 | `/privacy` | 4 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:493` · |  |
| 공상하기 | `/imagine` | 4 | `src/components/deep-space/DeepSpaceViews.tsx:1433` · |  |
| 자비스(이동용) | `/jarvis` | 1 | — |  |
| 일기(이동용) | `/journal` | 1 | — |  |
| 딥스페이스 홈(개발용 미리보기) | `/deepspace-home` | 5 | `src/screens/deepspace/DeepSpaceHomeScreen.tsx:141` · | 🔒 dev-only |
| 딥스페이스 허브(개발용 미리보기) | `/deepspace-hub` | 4 | `src/screens/deepspace/DeepSpaceHubDockScreen.tsx:17` · | 🔒 dev-only |
| 화면 관계 지도(개발용 QA) | `/deepspace-flowmap` | 3 | `src/screens/deepspace/DeepSpaceFlowMapScreen.tsx:93` · | 🔒 dev-only |
| 컴포넌트 미리보기(개발용) | `/deepspace-preview` | 1 | `src/screens/deepspace/DeepSpaceComponentsPreview.tsx:7` · | 🔒 dev-only |

## 4. 화면 이동 그래프

```mermaid
flowchart LR
  S1["로그인"] -->|화면 열기(로그인 상태 확인)| S2["홈 (별자리)"]
  S1["로그인"] -->|회원가입 화면으로 이동| S3["회원가입"]
  S3["회원가입"] -->|화면 열기(로그인 상태 확인)| S2["홈 (별자리)"]
  S3["회원가입"] -->|간편 가입(구글·애플·카카오 등)| S4["프로필 완성"]
  S3["회원가입"] -->|로그인 화면으로 이동| S1["로그인"]
  S5["비밀번호 재설정"] -->|완료 후 앱으로 들어가기| S2["홈 (별자리)"]
  S5["비밀번호 재설정"] -->|로그인 화면으로 (만료 시)| S1["로그인"]
  S4["프로필 완성"] -->|화면 열기(계정·프로필 확인)| S2["홈 (별자리)"]
  S4["프로필 완성"] -->|취소(로그아웃)| S1["로그인"]
  S6["소셜 로그인 처리 중"] -->|화면 열기(네이버 로그인 마무리)| S2["홈 (별자리)"]
  S6["소셜 로그인 처리 중"] -->|실패 시 다시 로그인| S1["로그인"]
  S7["가입 전 빠른 메모"] -->|계정 만들기| S3["회원가입"]
  S2["홈 (별자리)"] -->|북극성 누르기| S8["소울 코어 / 북극성"]
  S2["홈 (별자리)"] -->|세컨비 얼굴 누르고 메뉴 선택| S9["세컨비 대화"]
  S2["홈 (별자리)"] -->|종(받은편지함) 누르기| S10["받은편지함(딥스페이스)"]
  S9["세컨비 대화"] -->|근거(참고 자료) 칩 누르기| S11["위키 (서재)"]
  S9["세컨비 대화"] -->|다음 단계 제안 '담기'| S12["담기 (자료 저장)"]
  S9["세컨비 대화"] -->|한도 초과 → 요금제 보기| S13["요금제"]
  S12["담기 (자료 저장)"] -->|사진·음성 → 전체 담기 열기| S14["전체 담기 (링크·사진·파일)"]
  S12["담기 (자료 저장)"] -->|저장 후 → 기록 열기| S15["기록 모아보기"]
  S11["위키 (서재)"] -->|페이지 펼쳐 원본 열기| S16["기록 자세히 보기"]
  S11["위키 (서재)"] -->|비었을 때 → 담으러 가기| S12["담기 (자료 저장)"]
  S17["설정"] -->|하위 화면으로 이동| S18["계정 (나 허브)"]
  S17["설정"] -->|로그아웃| S1["로그인"]
  S18["계정 (나 허브)"] -->|이동 버튼 누르기| S19["내 데이터 리뷰"]
  S20["프로필"] -->|구독 카드 누르기| S13["요금제"]
  S20["프로필"] -->|설정·뒤로 아이콘| S17["설정"]
  S20["프로필"] -->|허브 링크 누르기| S8["소울 코어 / 북극성"]
  S21["온보딩 소개 화면"] -->|시작하기(가입/로그인으로)| S1["로그인"]
  S22["첫 통찰(첫날 자기이해)"] -->|시작하기(홈으로)| S2["홈 (별자리)"]
  S10["받은편지함(딥스페이스)"] -->|화면 열릴 때| S1["로그인"]
  S23["발견(트렌드)"] -->|첫 번째 카드 열기| S24["애착 유형 검사 (ECR-S)"]
  S23["발견(트렌드)"] -->|두 번째 카드 열기| S12["담기 (자료 저장)"]
  S25["사용 설명서"] -->|시작 관련 질문 누르기| S26["지원(고객지원)"]
  S25["사용 설명서"] -->|세컨비에게 바로 묻기| S9["세컨비 대화"]
  S26["지원(고객지원)"] -->|세컨비에게 묻기| S9["세컨비 대화"]
  S26["지원(고객지원)"] -->|설명서 보기| S25["사용 설명서"]
  S27["없는 페이지(404)"] -->|홈으로 가기| S2["홈 (별자리)"]
  S27["없는 페이지(404)"] -->|캡처로 가기| S12["담기 (자료 저장)"]
  S27["없는 페이지(404)"] -->|돌아보기로 가기| S28["성장 · 과거의 나"]
  S27["없는 페이지(404)"] -->|페르소나로 가기| S29["북극성 종합 (나)"]
  S27["없는 페이지(404)"] -->|설명서로 가기| S25["사용 설명서"]
  S30["영역 별 렌즈"] -->|이 영역에 기록 담기| S12["담기 (자료 저장)"]
  S30["영역 별 렌즈"] -->|더 깊이 보기 또는 기록 전체 보기| S15["기록 모아보기"]
  S30["영역 별 렌즈"] -->|기록 하나 열기| S16["기록 자세히 보기"]
  S8["소울 코어 / 북극성"] -->|이 중심으로 세컨비에게 묻기| S9["세컨비 대화"]
  S8["소울 코어 / 북극성"] -->|이걸 만든 근거 조각 보기| S15["기록 모아보기"]
  S8["소울 코어 / 북극성"] -->|내 모습 더 보기 또는 정식 검사로 측정| S31["성격 5요인 검사"]
  S8["소울 코어 / 북극성"] -->|밝기 변화 보기| S32["밝기 변화"]
  S8["소울 코어 / 북극성"] -->|다음 한 걸음 제안 검토| S33["리뷰 · 제안하고 승인하기"]
  S34["북극성 문장"] -->|세컨비 제안 받기| S13["요금제"]
  S29["북극성 종합 (나)"] -->|북극성 문장 다듬기| S34["북극성 문장"]
  S29["북극성 종합 (나)"] -->|영역별 기록 보기| S15["기록 모아보기"]
  S29["북극성 종합 (나)"] -->|별자리 홈으로 돌아가기| S2["홈 (별자리)"]
  S29["북극성 종합 (나)"] -->|검증 자료 보기 (빅파이브)| S31["성격 5요인 검사"]
  S35["신원 파일 내보내기"] -->|내보내기 (전달·복사·PDF)| S36["심층 인터뷰"]
  S35["신원 파일 내보내기"] -->|AI에 전달 대상 고르기| S37["소스 연결"]
  S32["밝기 변화"] -->|중심(소울 코어)으로 가기| S8["소울 코어 / 북극성"]
  S32["밝기 변화"] -->|인정 기록 보기| S38["승인 이력"]
  S39["보여지는 나"] -->|설문 보내기(인터뷰)| S36["심층 인터뷰"]
  S39["보여지는 나"] -->|지인에게 공유·초대| S40["지인 초대"]
  S41["앱 밖에서"] -->|담기 시연| S12["담기 (자료 저장)"]
  S41["앱 밖에서"] -->|알림 설정| S17["설정"]
  S42["내 영역 (건강·앱·뇌·재정)"] -->|영역 하나 열기| S15["기록 모아보기"]
  S42["내 영역 (건강·앱·뇌·재정)"] -->|데이터 추가| S12["담기 (자료 저장)"]
  S31["성격 5요인 검사"] -->|기록 더하기| S12["담기 (자료 저장)"]
  S31["성격 5요인 검사"] -->|다른 검사 해보기| S24["애착 유형 검사 (ECR-S)"]
  S43["MBTI (폐지됨 → 자동 이동)"] -->|화면 열기(자동 이동)| S29["북극성 종합 (나)"]
  S24["애착 유형 검사 (ECR-S)"] -->|첫 결과 → 대화로 이어가기| S9["세컨비 대화"]
  S44["삶의 만족도 검사 (RLSS)"] -->|저장 후 페르소나로 이동| S29["북극성 종합 (나)"]
  S45["그때그때 마음 체크인"] -->|화면 열기| S1["로그인"]
  S45["그때그때 마음 체크인"] -->|홈으로| S2["홈 (별자리)"]
  S36["심층 인터뷰"] -->|화면 열기| S4["프로필 완성"]
  S36["심층 인터뷰"] -->|승인하고 반영| S31["성격 5요인 검사"]
  S28["성장 · 과거의 나"] -->|시기 누르기| S36["심층 인터뷰"]
  S33["리뷰 · 제안하고 승인하기"] -->|근거 기록 열기| S16["기록 자세히 보기"]
  S38["승인 이력"] -->|코어 화면으로 (빈 화면일 때)| S8["소울 코어 / 북극성"]
  S19["내 데이터 리뷰"] -->|내 데이터 전체 내보내기| S35["신원 파일 내보내기"]
  S19["내 데이터 리뷰"] -->|파생 신호만 초기화| S46["개인정보·데이터 관리"]
  S47["내보내기 형식"] -->|화면 열기| S1["로그인"]
  S15["기록 모아보기"] -->|기록 하나 열기| S16["기록 자세히 보기"]
  S15["기록 모아보기"] -->|정리할 기록 보기(인박스)| S10["받은편지함(딥스페이스)"]
  S15["기록 모아보기"] -->|기록 담으러 가기| S12["담기 (자료 저장)"]
  S16["기록 자세히 보기"] -->|연결된 기록 열기| S16["기록 자세히 보기"]
  S16["기록 자세히 보기"] -->|근거 보기| S8["소울 코어 / 북극성"]
  S16["기록 자세히 보기"] -->|기록 수정하기| S12["담기 (자료 저장)"]
  S16["기록 자세히 보기"] -->|검사 결과 화면 열기| S31["성격 5요인 검사"]
  S48["연결 지도"] -->|가운데 '나' 누르기| S18["계정 (나 허브)"]
  S48["연결 지도"] -->|영역 별 누르기| S15["기록 모아보기"]
  S48["연결 지도"] -->|'연결 찾기' 버튼| S49["관계 찾기"]
  S50["오늘의 정리"] -->|제안한 기록 열기| S16["기록 자세히 보기"]
  S50["오늘의 정리"] -->|담으러 가기 / 다시 시도| S12["담기 (자료 저장)"]
  S49["관계 찾기"] -->|연결/제안 기록 열기| S16["기록 자세히 보기"]
  S49["관계 찾기"] -->|담으러 가기| S12["담기 (자료 저장)"]
  S51["이번 주 돌아보기"] -->|이번 주 카드 누르기| S15["기록 모아보기"]
  S51["이번 주 돌아보기"] -->|'발견' 카드 누르기| S49["관계 찾기"]
  S51["이번 주 돌아보기"] -->|첫 주 안내에서 담으러 가기| S12["담기 (자료 저장)"]
  S52["밝기 추이 (개발용 데모)"] -->|화면 열 때 (개발 여부 확인)| S2["홈 (별자리)"]
  S52["밝기 추이 (개발용 데모)"] -->|'공유 카드' 버튼| S53["공유 카드"]
  S54["나의 변화"] -->|'왜 밝아졌나' 근거 칩| S24["애착 유형 검사 (ECR-S)"]
  S54["나의 변화"] -->|'상상을 계획으로' 누르기| S55["공상하기"]
  S54["나의 변화"] -->|첫 주 안내에서 담기/루틴| S12["담기 (자료 저장)"]
  S56["예약 알림"] -->|비서에서 알림 추가하러 가기| S57["오늘의 비서"]
  S58["커리어 타임라인"] -->|드릴다운 화면으로 이동| S59["커리어 드릴다운 (3C4P)"]
  S58["커리어 타임라인"] -->|성과 카드 눌러 상세 보기| S16["기록 자세히 보기"]
  S59["커리어 드릴다운 (3C4P)"] -->|제출하기 (세컨비 대화로 이어가기)| S9["세컨비 대화"]
  S60["AI 뮤지엄"] -->|별자리로 돌아가기| S2["홈 (별자리)"]
  S61["통화 성찰 (통화 녹음)"] -->|텍스트 담기 (저장)| S15["기록 모아보기"]
  S37["소스 연결"] -->|소스 연결하기| S62["개인 데이터 가져오기 허브"]
  S13["요금제"] -->|문의하기| S26["지원(고객지원)"]
  S46["개인정보·데이터 관리"] -->|계정 영구 삭제| S1["로그인"]
  S55["공상하기"] -->|씨앗·걸음을 담기로 보내기| S12["담기 (자료 저장)"]
  S55["공상하기"] -->|더 이야기하기| S9["세컨비 대화"]
  S63["자비스(이동용)"] -->|화면 열 때| S9["세컨비 대화"]
  S64["일기(이동용)"] -->|화면 열 때| S12["담기 (자료 저장)"]
  S65["딥스페이스 홈(개발용 미리보기)"] -->|북극성 누르기| S8["소울 코어 / 북극성"]
  S65["딥스페이스 홈(개발용 미리보기)"] -->|세컨비 머리 누르기(메뉴)| S9["세컨비 대화"]
  S65["딥스페이스 홈(개발용 미리보기)"] -->|알림 벨| S10["받은편지함(딥스페이스)"]
  S66["딥스페이스 허브(개발용 미리보기)"] -->|오늘의 정리 열기| S50["오늘의 정리"]
```

## 5. 서버·데이터 작업

**auth** (12)  `auth:getSession` · `auth:signInWithPassword` · `auth:signInWithOAuth` · `auth:resetPasswordForEmail` · `auth:signUp` · `auth:setSession` · `auth:updateUser` · `auth:getUser` · `auth:signOut` · `auth:session` · `auth:notification-permission` · `auth:signout`

**db** (53)  `db:users:insert` · `db:consent_records:insert` · `db:users:select` · `db:records:select` · `db:chat_usage:select` · `db:usage_counters:select` · `db:usage_counters:update` · `db:records:insert` · `db:sources:insert` · `db:wiki_pages:select` · `db:wiki_links:select` · `db:records:delete` · `db:wiki_pages:delete` · `db:sources:delete` · `db:chat_usage:delete` · `db:relation_people:select` · `db:recreation_items:select` · `db:sources:select` · `db:health_samples:select` · `db:personas:select` · `db:star_tier_history:select` · `db:bfi_results:select` · `db:esm_responses:insert` · `db:personas:insert` · `db:star_tier_history:insert` · `db:wiki_links:update` · `db:wiki_links:delete` · `db:wiki_links:insert` · `db:ops_routine_logs:select` · `db:ops_milestones:select` · `db:ops_routines:insert` · `db:ops_routines:select` · `db:ops_routine_logs:insert` · `db:ops_ledger:select` · `db:ops_ledger:insert` · `db:ops_meal_plan:select` · `db:ops_meal_plan:update` · `db:ops_milestones:insert` · `db:ops_milestones:update` · `db:ops_reading:select` · `db:ops_reading:update` · `db:srs_cards:select` · `db:srs_cards:update` · `db:srs_reviews:insert` · `db:srs_cards:insert` · `db:recreation_items:insert` · `db:relation_people:insert` · `db:peer_invitations:select` · `db:peer_invitations:insert` · `db:peer_invitations:update` · `db:users:update` · `db:health_samples:upsert` · `db:records:update`

**edge** (3)  `edge:oauth-naver` · `edge:peer-respond` · `edge:delete-account`

**external** (3)  `external:MFDS-food-api` · `external:google-books-api` · `external:github:events`

**rpc** (4)  `rpc:t5_seen_aggregate` · `rpc:award_xp` · `rpc:match_wiki_pages` · `rpc:bump_reward_credits_if_under_cap`

**storage** (2)  `storage:sources:upload` · `storage:raw-clippings:upload`

## 6. AI 기능

| 목적 | 모델 | 경유 | 쉬운 이름 |
|---|---|---|---|
| `chat` | gemini | callGemini | 세컨비 대화 |
| `classify` | gemini | callGemini | 자동 분류 |
| `ocr` | gemini | callGemini | 사진 글자 읽기 |
| `transcribe` | gemini | callGemini | 음성 받아쓰기 |
| `persona_narrative` | openai (proxy) | callGemini | 나의 요약 만들기 |
| `northstar_propose` | openai (proxy) | callGemini | 북극성 문장 제안 |
| `gap_synthesize` | openai (proxy) | callGemini | 시선 차이 읽기 |
| `self_model_propose` | gemini-2.5-flash | callGemini | 다음 한 걸음 제안 |
| `embedding` | gemini embedding | gemini-proxy | 의미로 기록 잇기 |
| `ops_recommend` | gemini | callGemini | 루틴 아이디어 추천 |

## 7. 검증된 코드 좌표 (화면 → 동작 → file:line)

마크: **✔** 파일·줄·**함수까지** 대조 완료 · **·** 파일·줄은 실재(대조할 함수명 없음) · **⚠** 못 믿음

<details><summary><b>로그인</b> <code>/sign-in</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(로그인 상태 확인) | `src/screens/deepspace/dds-auth-screens.tsx:180 (useSignInForm)` ✔ | `src/lib/auth/useSignInForm.ts:71` · | 저장된 로그인 상태 확인 |
| 이메일 입력칸 펼치기 | `src/screens/deepspace/dds-auth-screens.tsx:185 (setEmailOpen)` ✔ | — | — |
| 이메일로 로그인 | `src/screens/deepspace/dds-auth-screens.tsx:313 (handleSubmit)` ✔ | `src/lib/auth/useSignInForm.ts:154` · | 이메일·비밀번호로 로그인 |
| 간편 로그인(구글·애플·카카오 등) | `src/screens/deepspace/dds-auth-screens.tsx:203 (handleOAuth)` ✔ | `src/lib/auth/useSignInForm.ts:114` · | 소셜 계정으로 로그인 |
| 비밀번호 재설정 메일 보내기 | `src/screens/deepspace/dds-auth-screens.tsx:324 (handleForgotPassword)` ✔ | `src/lib/auth/useSignInForm.ts:171` · | 비밀번호 재설정 메일 보내기 |
| 회원가입 화면으로 이동 | `src/screens/deepspace/dds-auth-screens.tsx:346` · | — | — |

</details>

<details><summary><b>회원가입</b> <code>/sign-up</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(로그인 상태 확인) | `src/screens/deepspace/dds-auth-screens.tsx:430 (useSignUpForm)` ✔ | `src/lib/auth/useSignUpForm.ts:89` · | 저장된 로그인 상태 확인 |
| 이메일로 회원가입 | `src/screens/deepspace/dds-auth-screens.tsx:579 (handleSubmit)` ✔ | `src/lib/auth/useSignUpForm.ts:152` · | 새 계정 만들기, 이메일·비밀번호로 로그인, 내 프로필 만들기, 동의 내역 저장 |
| 필수 동의 체크 | `src/screens/deepspace/dds-auth-screens.tsx:382 (toggle)` ✔ | `src/lib/auth/consent-selections.ts:51` · | — |
| 간편 가입(구글·애플·카카오 등) | `src/screens/deepspace/dds-auth-screens.tsx:552 (handleOAuth)` ✔ | `src/lib/auth/useSignUpForm.ts:207` · | 소셜 계정으로 로그인 |
| 로그인 화면으로 이동 | `src/screens/deepspace/dds-auth-screens.tsx:589` · | — | — |

</details>

<details><summary><b>비밀번호 재설정</b> <code>/reset-password</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(재설정 링크 확인) | `src/screens/deepspace/dds-auth-screens.tsx:612 (useResetPasswordForm)` ✔ | `src/lib/auth/useResetPasswordForm.ts:64` · | 저장된 로그인 상태 확인, 임시 로그인 상태 만들기 |
| 새 비밀번호 저장 | `src/screens/deepspace/dds-auth-screens.tsx:681 (handleSubmit)` ✔ | `src/lib/auth/useResetPasswordForm.ts:69` · | 계정 정보(비밀번호) 바꾸기 |
| 완료 후 앱으로 들어가기 | `src/screens/deepspace/dds-auth-screens.tsx:642` · | — | — |
| 로그인 화면으로 (만료 시) | `src/screens/deepspace/dds-auth-screens.tsx:637` · | — | — |

</details>

<details><summary><b>프로필 완성</b> <code>/complete-profile</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(계정·프로필 확인) | `src/app/(auth)/complete-profile.tsx:35 (useAuth)` ✔ | `src/lib/auth/AuthContext.tsx:99` · | 저장된 로그인 상태 확인, 내 프로필 정보 불러오기 |
| 생년월일·동의 저장하고 시작 | `src/app/(auth)/complete-profile.tsx:91 (handleSubmit)` ✔ | `src/lib/auth/complete-profile-flow.ts:46` · | 서버에서 내 계정 확인, 내 프로필 정보 불러오기, 내 프로필 만들기, 동의 내역 저장 |
| 취소(로그아웃) | `src/app/(auth)/complete-profile.tsx:147 (handleCancel)` ✔ | `src/lib/auth/complete-profile-flow.ts:74` · | 로그아웃 |

</details>

<details><summary><b>소셜 로그인 처리 중</b> <code>/oauth-callback</code> — 동작 2</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(네이버 로그인 마무리) | `src/app/(auth)/oauth-callback.tsx:23 (run)` ✔ | `src/lib/supabase/auth.ts:501` · | 네이버 로그인 처리, 임시 로그인 상태 만들기 |
| 실패 시 다시 로그인 | `src/app/(auth)/oauth-callback.tsx:65` · | — | — |

</details>

<details><summary><b>가입 전 빠른 메모</b> <code>/jot</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(저장된 메모 불러오기) | `src/app/(auth)/jot.tsx:41 (refresh)` ✔ | `src/lib/capture/preauth-pending.ts:153` · | — |
| 메모 저장 | `src/app/(auth)/jot.tsx:51 (onSave)` ✔ | `src/lib/capture/preauth-pending.ts:192` · | — |
| 계정 만들기 | `src/app/(auth)/jot.tsx:139` · | — | — |

</details>

<details><summary><b>권한 안내</b> <code>/permissions</code> — 동작 2</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(안내 표시) | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1194` · | — | — |
| 돌아가기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1211` · | — | — |

</details>

<details><summary><b>홈 (별자리)</b> <code>/</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 자동 실행 | `src/components/deep-space/DeepSpaceShell.tsx:55 (loadDomainLevels)` ✔ | `src/lib/persona/load-domain-levels.ts:202` · | 내 기록 불러오기 |
| 별 누르고 '여행하기' | `src/components/deep-space/DeepSpaceShell.tsx:89 (onStarTravel)` ✔ | `src/components/deep-space/DeepSpaceShell.tsx:89` · | — |
| 북극성 누르기 | `src/components/deep-space/DeepSpaceShell.tsx:92 (onPolarisPress)` ✔ | `src/components/deep-space/DeepSpaceShell.tsx:92` · | — |
| 세컨비 얼굴 누르고 메뉴 선택 | `src/components/deep-space/DeepSpaceShell.tsx:93 (onChatPress)` ✔ | — | — |
| 종(받은편지함) 누르기 | `src/components/deep-space/DeepSpaceShell.tsx:95 (onBellPress)` ✔ | `src/components/deep-space/DeepSpaceShell.tsx:95` · | — |

</details>

<details><summary><b>세컨비 대화</b> <code>/secondb</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 자동 실행 | `src/app/secondb.tsx:400 (readChatUsage)` ✔ | `src/lib/chat/usage.ts:6` · | 오늘 대화 사용량 확인, 남은 AI 사용량 확인 |
| 메시지 보내기 | `src/app/secondb.tsx:462 (handleSend)` ✔ | `src/lib/chat/conversation.ts:166` · | AI 사용량 올리기 / AI:chat |
| 근거(참고 자료) 칩 누르기 | `src/app/secondb.tsx:743 (setRefDrawer)` ✔ | — | — |
| 다음 단계 제안 '담기' | `src/app/secondb.tsx:777` · | — | — |
| 한도 초과 → 요금제 보기 | `src/app/secondb.tsx:835` · | — | — |

</details>

<details><summary><b>담기 (자료 저장)</b> <code>/capture</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 형식 고르기 | `src/components/deep-space/DeepSpaceViews.tsx:331 (setMode)` ✔ | — | — |
| 저장하기 | `src/components/deep-space/DeepSpaceViews.tsx:244 (savePiece)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장 |
| 사진·음성 → 전체 담기 열기 | `src/components/deep-space/DeepSpaceViews.tsx:420` · | — | — |
| 저장 후 → 기록 열기 | `src/components/deep-space/DeepSpaceViews.tsx:504` · | — | — |

</details>

<details><summary><b>전체 담기 (링크·사진·파일)</b> <code>/capture-full</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 자동 실행 | `src/app/capture.tsx:471 (loadCaptureDraftState)` ✔ | `src/lib/capture/draft.ts:145` · | 내 기록 불러오기 |
| 링크·클립·메모 저장 | `src/app/capture.tsx:1129 (handleSubmit)` ✔ | — | 가져온 자료 저장, 원본 자료 파일 올리기 / AI:classify |
| 사진 골라 글자 추출 | `src/app/capture.tsx:777 (runExtract)` ✔ | `src/lib/wiki/capture-image.ts:501` · | AI:ocr |
| 음성 녹음 후 받아쓰기 | `src/app/capture.tsx:1079 (handleStopRecording)` ✔ | `src/lib/llm/gemini.ts:1046` · | AI:transcribe |

</details>

<details><summary><b>위키 (서재)</b> <code>/wiki</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 자동 실행 | `src/screens/deepspace/dds-wiki-records-screens.tsx:1262 (useWikiGraphData)` ✔ | `src/screens/deepspace/dds-wiki-records-screens.tsx:61` · | 위키 페이지 불러오기, 위키 연결 불러오기 |
| 태그 필터 누르기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:1321 (setActiveTag)` ✔ | — | — |
| 목록/그래프 보기 전환 | `src/screens/deepspace/dds-wiki-records-screens.tsx:1310 (setWikiView)` ✔ | — | — |
| 페이지 펼쳐 원본 열기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:1368` · | — | — |
| 비었을 때 → 담으러 가기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:1341` · | — | — |

</details>

<details><summary><b>설정</b> <code>/settings</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 다크 모드·기능 켜고 끄기 | `src/app/settings.tsx:589 (setMode)` ✔ | `src/app/settings.tsx:414` · | — |
| 하위 화면으로 이동 | `src/app/settings.tsx:659` · | — | — |
| 언어 바꾸기 | `src/app/settings.tsx:776 (changeLanguage)` ✔ | — | — |
| 데이터 삭제 (위험 구역) | `src/app/settings.tsx:512 (runFullWipe)` ✔ | `src/lib/records/delete-bulk.ts:170` · | 기록 삭제, 위키 페이지 삭제, 가져온 자료 삭제, 대화 사용 기록 삭제 |
| 로그아웃 | `src/app/settings.tsx:1033 (signOut)` ✔ | `src/lib/supabase/auth.ts:352` · | 로그아웃 |

</details>

<details><summary><b>계정 (나 허브)</b> <code>/account</code> — 동작 2</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:463` · | — | — |
| 이동 버튼 누르기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:479` · | — | — |

</details>

<details><summary><b>프로필</b> <code>/profile</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 자동 실행 | `src/app/profile.tsx:148 (getSession)` ✔ | — | 저장된 로그인 상태 확인 |
| 구독 카드 누르기 | `src/app/profile.tsx:267` · | — | — |
| 설정·뒤로 아이콘 | `src/app/profile.tsx:254` · | — | — |
| 묶음 탭 전환 | `src/app/profile.tsx:349 (setActiveDeepSpaceSection)` ✔ | — | — |
| 허브 링크 누르기 | `src/components/deep-space/DeepSpaceLinks.tsx:68` · | — | — |

</details>

<details><summary><b>온보딩 소개 화면</b> <code>/onboarding</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열릴 때 | `src/app/onboarding.tsx:83 (useOnboardingComplete)` ✔ | `src/lib/onboarding/state.ts:87` · | 로그인 상태 확인 |
| 다음 슬라이드 | `src/app/onboarding.tsx:189 (setStep)` ✔ | — | — |
| 건너뛰기 | `src/app/onboarding.tsx:130 (setStep)` ✔ | — | — |
| 시작하기(가입/로그인으로) | `src/app/onboarding.tsx:110 (goToAuth)` ✔ | `src/lib/onboarding/state.ts:48` · | — |

</details>

<details><summary><b>첫 통찰(첫날 자기이해)</b> <code>/ttfv</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열릴 때 | `src/app/ttfv.tsx:13 (markTTFVSeen)` ✔ | `src/lib/onboarding/ttfv-gate.ts:50` · | — |
| '맞아요' 답하기 | `src/screens/deepspace/onboarding/TTFVScreen.tsx:107 (ratify)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장 |
| '조금 달라요' 답하기 | `src/screens/deepspace/onboarding/TTFVScreen.tsx:107 (ratify)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장 |
| 근거 펼쳐보기 | `src/screens/deepspace/onboarding/TTFVScreen.tsx:189 (setShowWhy)` ✔ | — | — |
| 시작하기(홈으로) | `src/screens/deepspace/onboarding/TTFVScreen.tsx:267 (router.replace)` ✔ | — | — |

</details>

<details><summary><b>받은편지함(딥스페이스)</b> <code>/inbox</code> — 동작 1</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열릴 때 | `src/screens/deepspace/dds-import-inbox-screens.tsx:81 (useAuth)` ✔ | `src/lib/auth/AuthContext.tsx:251` · | 로그인 상태 확인 |

</details>

<details><summary><b>발견(트렌드)</b> <code>/discover</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열릴 때 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1222` · | — | — |
| 첫 번째 카드 열기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1228 (router.push)` ✔ | — | — |
| 두 번째 카드 열기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1239 (router.push)` ✔ | — | — |

</details>

<details><summary><b>사용 설명서</b> <code>/manual</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열릴 때 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1076` · | — | — |
| 시작 관련 질문 누르기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1084 (router.push)` ✔ | — | — |
| 데이터 관련 질문 누르기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1090 (router.push)` ✔ | — | — |
| 세컨비에게 바로 묻기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1092 (router.push)` ✔ | — | — |

</details>

<details><summary><b>지원(고객지원)</b> <code>/support</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 세컨비에게 묻기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:415 (router.push)` ✔ | — | — |
| 설명서 보기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:415 (router.push)` ✔ | — | — |
| 이메일 보내기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:415 (Linking.openURL)` ✔ | — | — |
| 버그 신고 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:415 (Linking.openURL)` ✔ | — | — |
| 자주 묻는 질문 펼치기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:427 (setOpenFaq)` ✔ | — | — |

</details>

<details><summary><b>테마·화면 설정</b> <code>/theme</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열릴 때 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1048 (useTheme)` ✔ | `src/lib/theme/ThemeContext.tsx:111` · | — |
| 테마 바꾸기(어둡게/밝게) | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1048 (setMode)` ✔ | `src/lib/theme/ThemeContext.tsx:97` · | — |
| 글꼴 바꾸기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1049 (setFontStyle)` ✔ | `src/lib/settings/readable-font.ts:65` · | — |
| 움직임 줄이기 켜고 끄기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1069 (setLiteMode)` ✔ | `src/lib/settings/lite-mode.ts:95` · | — |

</details>

<details><summary><b>없는 페이지(404)</b> <code>/+not-found</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 홈으로 가기 | `src/app/+not-found.tsx:26` · | — | — |
| 캡처로 가기 | `src/app/+not-found.tsx:38` · | — | — |
| 돌아보기로 가기 | `src/app/+not-found.tsx:50` · | — | — |
| 페르소나로 가기 | `src/app/+not-found.tsx:62` · | — | — |
| 설명서로 가기 | `src/app/+not-found.tsx:74` · | — | — |

</details>

<details><summary><b>영역 별 렌즈</b> <code>/star/[domain]</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 이 영역 기록과 밝기 불러오기 | `src/app/star/[domain].tsx:105 (refresh)` ✔ | `src/app/star/[domain].tsx:62` · | 내 기록 불러오기, 내 사람들(관계) 불러오기, 휴식 항목 불러오기 |
| 이 영역에 기록 담기 | `src/app/star/[domain].tsx:176` · | — | — |
| 더 깊이 보기 또는 기록 전체 보기 | `src/app/star/[domain].tsx:182` · | — | — |
| 기록 하나 열기 | `src/app/star/[domain].tsx:212` · | — | — |

</details>

<details><summary><b>소울 코어 / 북극성</b> <code>/core-brain</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 조각 모으고 나의 요약 만들기 | `src/app/core-brain.tsx:48 (loadCoreBrainEvidence)` ✔ | `src/lib/persona/build.ts:527` · | 내 기록 불러오기, 가져온 자료 불러오기 / AI:persona_narrative |
| 이 중심으로 세컨비에게 묻기 | `src/app/core-brain.tsx:341 (askPolaris)` ✔ | — | — |
| 이걸 만든 근거 조각 보기 | `src/app/core-brain.tsx:496 (setDrawerOpen)` ✔ | `src/app/core-brain.tsx:281` · | — |
| 내 모습 더 보기 또는 정식 검사로 측정 | `src/app/core-brain.tsx:458 (isMeasuredSource)` ✔ | `src/lib/persona/build.ts:60` · | — |
| 밝기 변화 보기 | `src/app/core-brain.tsx:372` · | — | — |
| 다음 한 걸음 제안 검토 | `src/app/core-brain.tsx:549` · | — | — |

</details>

<details><summary><b>북극성 문장</b> <code>/northstar</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 지금 문장과 사용량 불러오기 | `src/app/northstar.tsx:87 (fetchCurrentNorthstar)` ✔ | `src/lib/persona/northstar.ts:23` · | 내 기록 불러오기 |
| 세컨비 제안 받기 | `src/app/northstar.tsx:98 (propose)` ✔ | `src/lib/persona/northstar.ts:77` · | 내 기록 불러오기 / AI:northstar_propose |
| 제안 문장 고르기 | `src/app/northstar.tsx:189 (setDraft)` ✔ | — | — |
| 이 문장으로 저장 | `src/app/northstar.tsx:126 (save)` ✔ | `src/lib/persona/northstar.ts:37` · | 기록 저장 |

</details>

<details><summary><b>북극성 종합 (나)</b> <code>/persona</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 영역별 밝기 불러오기 | `src/app/persona.tsx:611 (loadDomainLevels)` ✔ | `src/lib/persona/load-domain-levels.ts:202` · | 내 기록 불러오기, 내 사람들(관계) 불러오기, 건강 데이터 불러오기 |
| 북극성 문장 다듬기 | `src/components/deep-space/DeepSpaceViews.tsx:1795` · | — | — |
| 영역별 기록 보기 | `src/components/deep-space/DeepSpaceViews.tsx:1826` · | — | — |
| 별자리 홈으로 돌아가기 | `src/components/deep-space/DeepSpaceViews.tsx:1810` · | — | — |
| 검증 자료 보기 (빅파이브) | `src/components/deep-space/DeepSpaceViews.tsx:1846` · | — | — |

</details>

<details><summary><b>신원 파일 내보내기</b> <code>/iden</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 내 신원 문서 만들기 | `src/app/iden.tsx:119 (buildIdenDoc)` ✔ | `src/lib/iden/build-iden.ts:257` · | 내 기록 불러오기, 저장된 나의 요약 불러오기 / AI:persona_narrative |
| 담을 항목 켜고 끄기 | `src/app/iden.tsx:303 (setExcluded)` ✔ | — | — |
| 내보내기 (전달·복사·PDF) | `src/app/iden.tsx:206 (handleExport)` ✔ | `src/lib/iden/iden-export.ts:89` · | 내 기록 불러오기, 저장된 나의 요약 불러오기 / AI:persona_narrative |
| AI에 전달 대상 고르기 | `src/app/iden.tsx:335` · | — | — |

</details>

<details><summary><b>밝기 변화</b> <code>/brightness</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 주간 관찰 기록 불러오기 | `src/app/brightness.tsx:43 (loadTierObservations)` ✔ | `src/lib/persona/load-tier-observations.ts:8` · | 별 밝기 기록 불러오기 |
| 중심(소울 코어)으로 가기 | `src/app/brightness.tsx:91` · | — | — |
| 인정 기록 보기 | `src/app/brightness.tsx:174` · | — | — |

</details>

<details><summary><b>보여지는 나</b> <code>/seen</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 내 성향과 지인 합산 시선 불러오기 | `src/components/deep-space/DeepSpaceViews.tsx:1158 (loadSeenAggregate)` ✔ | `src/lib/peer/invite.ts:103` · | 지인들의 평가 익명 합산, 성격 검사 결과 불러오기 |
| 간극 읽기 (AI) | `src/components/deep-space/DeepSpaceViews.tsx:1185 (synthesizeGap)` ✔ | `src/lib/llm/gemini.ts:464` · | AI:gap_synthesize |
| 설문 보내기(인터뷰) | `src/components/deep-space/DeepSpaceViews.tsx:1289` · | — | — |
| 지인에게 공유·초대 | `src/components/deep-space/DeepSpaceViews.tsx:1295` · | — | — |

</details>

<details><summary><b>앱 밖에서</b> <code>/beyond</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 로그인 확인하고 미리보기 표시 | `src/app/beyond.tsx:40 (useAuth)` ✔ | — | 로그인 상태 확인 |
| 담기 시연 | `src/app/beyond.tsx:90` · | — | — |
| 음성으로 담기 | `src/app/beyond.tsx:98` · | — | — |
| 알림 설정 | `src/app/beyond.tsx:138` · | — | — |

</details>

<details><summary><b>내 영역 (건강·앱·뇌·재정)</b> <code>/trinity</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 기록·자료 모아 4영역으로 나누기 | `src/app/trinity.tsx:360` · | `src/app/trinity.tsx:78` · | 내 기록 불러오기, 가져온 자료 불러오기 |
| 영역 하나 열기 | `src/app/trinity.tsx:420 (openArea)` ✔ | — | — |
| 데이터 추가 | `src/app/trinity.tsx:422 (addData)` ✔ | — | — |
| 오류일 때 다시 시도 | `src/app/trinity.tsx:460 (setReloadKey)` ✔ | — | 내 기록 불러오기, 가져온 자료 불러오기 |

</details>

<details><summary><b>성격 5요인 검사</b> <code>/big-five</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(예전 결과 불러오기) | `src/app/big-five.tsx:328 (loadLatestBfi)` ✔ | `src/lib/persona/build.ts:263` · | 내 기록 불러오기 |
| 검사 시작하기 | `src/app/big-five.tsx:389 (onStart)` ✔ | `src/app/big-five.tsx:53` · | — |
| 문항에 답하기 | `src/app/big-five.tsx:98 (setResponse)` ✔ | `src/app/big-five.tsx:98` · | — |
| 제출하고 저장하기 | `src/app/big-five.tsx:102 (handleSubmit)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |
| 기록 더하기 | `src/app/big-five.tsx:391 (onAddData)` ✔ | — | — |
| 다른 검사 해보기 | `src/app/big-five.tsx:392 (onExtraFrameworks)` ✔ | — | — |

</details>

<details><summary><b>성격 정밀검사 (IPIP-NEO-120)</b> <code>/ipip-neo</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(예전 결과 불러오기) | `src/app/ipip-neo.tsx:272 (loadLatestIpip)` ✔ | `src/lib/persona/build.ts:455` · | 내 기록 불러오기 |
| 검사 시작/다시하기 | `src/app/ipip-neo.tsx:324 (onStart)` ✔ | `src/app/ipip-neo.tsx:51` · | — |
| 문항에 답하기 | `src/app/ipip-neo.tsx:81 (setResponse)` ✔ | `src/app/ipip-neo.tsx:81` · | — |
| 제출하고 저장하기 | `src/app/ipip-neo.tsx:85 (handleSubmit)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |

</details>

<details><summary><b>MBTI (폐지됨 → 자동 이동)</b> <code>/mbti</code> — 동작 1</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(자동 이동) | `src/app/mbti.tsx:17 (Mbti)` ✔ | — | — |

</details>

<details><summary><b>애착 유형 검사 (ECR-S)</b> <code>/attachment</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(예전 결과 불러오기) | `src/app/attachment.tsx:329 (loadLatestAttachment)` ✔ | `src/lib/persona/build.ts:232` · | 내 기록 불러오기 |
| 검사 시작하기 | `src/app/attachment.tsx:371 (onStart)` ✔ | `src/app/attachment.tsx:56` · | — |
| 문항에 답하기 | `src/app/attachment.tsx:101 (setResponse)` ✔ | `src/app/attachment.tsx:101` · | — |
| 제출하고 저장하기 | `src/app/attachment.tsx:105 (handleSubmit)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |
| 첫 결과 → 대화로 이어가기 | `src/app/attachment.tsx:227 (markFirstStarChatNudged)` ✔ | `src/lib/onboarding/state.ts:73` · | — |

</details>

<details><summary><b>가치 자기보고</b> <code>/values</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(예전 결과 불러오기) | `src/app/values.tsx:286 (loadLatestValues)` ✔ | `src/lib/persona/build.ts:302` · | 내 기록 불러오기 |
| 검사 시작하고 답하기 | `src/app/values.tsx:98 (setResponse)` ✔ | `src/app/values.tsx:98` · | — |
| 제출하고 저장하기 | `src/app/values.tsx:102 (handleSubmit)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |
| 다른 축 검사로 이동 | `src/components/deep-space/AxisCheck.tsx:367` · | — | — |

</details>

<details><summary><b>강점 자기보고</b> <code>/strengths</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(예전 결과 불러오기) | `src/app/strengths.tsx:287 (loadLatestStrengths)` ✔ | `src/lib/persona/build.ts:350` · | 내 기록 불러오기 |
| 검사 시작하고 답하기 | `src/app/strengths.tsx:99 (setResponse)` ✔ | `src/app/strengths.tsx:99` · | — |
| 제출하고 저장하기 | `src/app/strengths.tsx:103 (handleSubmit)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |
| 다른 축 검사로 이동 | `src/components/deep-space/AxisCheck.tsx:367` · | — | — |

</details>

<details><summary><b>동기 자기보고</b> <code>/motivation</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(예전 결과 불러오기) | `src/app/motivation.tsx:294 (loadLatestMotivation)` ✔ | `src/lib/persona/build.ts:403` · | 내 기록 불러오기 |
| 검사 시작하고 답하기 | `src/app/motivation.tsx:100 (setResponse)` ✔ | `src/app/motivation.tsx:100` · | — |
| 제출하고 저장하기 | `src/app/motivation.tsx:104 (handleSubmit)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |
| 다른 축 검사로 이동 | `src/components/deep-space/AxisCheck.tsx:367` · | — | — |

</details>

<details><summary><b>삶의 만족도 검사 (RLSS)</b> <code>/rlss</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기(로그인 확인) | `src/app/rlss.tsx:256 (RlssDeepSpace)` ✔ | — | — |
| 검사 시작하고 답하기 | `src/app/rlss.tsx:81 (setResponse)` ✔ | `src/app/rlss.tsx:81` · | — |
| 제출하고 저장하기 | `src/app/rlss.tsx:85 (handleSubmit)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |
| 저장 후 페르소나로 이동 | `src/app/rlss.tsx:259 (onComplete)` ✔ | — | — |

</details>

<details><summary><b>그때그때 마음 체크인</b> <code>/esm</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 | `src/app/esm.tsx:22 (EsmCheckInScreen)` ✔ | — | — |
| 질문 종류 바꾸기 | `src/app/esm.tsx:113 (setKind)` ✔ | — | — |
| 답 고르기 | `src/app/esm.tsx:59 (toggleTag)` ✔ | — | — |
| 체크인 저장 | `src/app/esm.tsx:66 (handleSubmit)` ✔ | — | 그때그때 상태 저장 |
| 홈으로 | `src/app/esm.tsx:203` · | — | — |

</details>

<details><summary><b>심층 인터뷰</b> <code>/interview</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 | `src/app/interview.tsx:76 (InterviewScreen)` ✔ | — | — |
| 질문에 답하기 | `src/app/interview.tsx:126 (pickAnswer)` ✔ | — | — |
| 다시 하기 | `src/app/interview.tsx:131 (restart)` ✔ | — | — |
| 승인하고 반영 | `src/app/interview.tsx:136 (approveAndReflect)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장 |
| 뒤로 | `src/app/interview.tsx:107` · | — | — |

</details>

<details><summary><b>성장 · 과거의 나</b> <code>/audit</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 | `src/components/deep-space/DeepSpaceViews.tsx:1566 (PastMeErasView)` ✔ | — | — |
| 시기 누르기 | `src/components/deep-space/DeepSpaceViews.tsx:1582` · | — | — |
| 뒤로 | `src/app/audit.tsx:401` · | — | — |

</details>

<details><summary><b>리뷰 · 제안하고 승인하기</b> <code>/review</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1254 (DeepSpaceReviewScreen)` ✔ | — | — |
| 제안 받기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1278 (generate)` ✔ | `src/lib/persona/propose-self-model.ts:82` · | 내 기록 불러오기, 저장된 나의 요약 불러오기, 나의 요약 저장 / AI:self_model_propose |
| 승인 또는 보류 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1303 (handleDecision)` ✔ | `src/lib/persona/proposal.ts:61` · | 별 밝기 변화 저장 |
| 근거 기록 열기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1356` · | — | — |

</details>

<details><summary><b>승인 이력</b> <code>/ratifications</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 | `src/app/ratifications.tsx:98 (loadTierObservations)` ✔ | `src/lib/persona/load-tier-observations.ts:8` · | 별 밝기 기록 불러오기 |
| 결정별 걸러보기 | `src/app/ratifications.tsx:92 (setFilter)` ✔ | — | — |
| 변화 없는 항목 보기 | `src/app/ratifications.tsx:231 (setShowUnchanged)` ✔ | — | — |
| 코어 화면으로 (빈 화면일 때) | `src/app/ratifications.tsx:180` · | — | — |
| 뒤로 | `src/app/ratifications.tsx:146` · | — | — |

</details>

<details><summary><b>프로토 캐논 (개발용 참고)</b> <code>/canon</code> — 동작 2</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 | `src/app/canon.tsx:21 (CanonReference)` ✔ | — | — |
| 라이브 프로토타입 열기 | `src/app/canon.tsx:71` · | — | — |

</details>

<details><summary><b>내 데이터 리뷰</b> <code>/data</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:978 (DeepSpaceDataDesignScreen)` ✔ | — | — |
| 내 데이터 전체 내보내기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:982` · | — | — |
| 파생 신호만 초기화 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:983` · | — | — |
| 계정·데이터 영구 삭제 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:984` · | — | — |

</details>

<details><summary><b>내보내기 형식</b> <code>/formats</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1625 (DeepSpaceFormatsScreen)` ✔ | — | — |
| 형식 고르기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1707 (setFormat)` ✔ | — | — |
| 내보내기 실행 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1636 (runExport)` ✔ | `src/lib/iden/iden-export.ts:89` · | 내 기록 불러오기 |
| 복사 또는 공유 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1662 (copyOrShare)` ✔ | — | — |
| 다운로드 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1676 (download)` ✔ | — | — |

</details>

<details><summary><b>기록 모아보기</b> <code>/records</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 기록 불러오기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:353 (listRecentRecords)` ✔ | `src/lib/records/create.ts:309` · | 내 기록 불러오기, 가져온 자료 불러오기 |
| 기록 하나 열기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:402 (openRecord)` ✔ | — | — |
| 목록/그래프 보기 전환 | `src/screens/deepspace/dds-wiki-records-screens.tsx:463 (setView)` ✔ | `src/lib/records/records-graph.ts:106` · | — |
| 종류별로 거르기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:303 (setTypeFilter)` ✔ | — | — |
| 정리할 기록 보기(인박스) | `src/screens/deepspace/dds-wiki-records-screens.tsx:490` · | — | — |
| 기록 담으러 가기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:571` · | — | — |

</details>

<details><summary><b>기록 자세히 보기</b> <code>/record/[id]</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 기록 불러오기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:879 (getRecordById)` ✔ | `src/lib/records/create.ts:332` · | 내 기록 불러오기 |
| 연결된 기록 열기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:1104` · | — | — |
| 근거 보기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:1061` · | — | — |
| 기록 수정하기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:850 (submitEdit)` ✔ | `src/lib/records/create.ts:367` · | — |
| 기록 삭제하기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:917 (handleDelete)` ✔ | `src/lib/records/create.ts:388` · | 기록 삭제 |
| 검사 결과 화면 열기 | `src/screens/deepspace/dds-wiki-records-screens.tsx:998 (assessmentRoute)` ✔ | — | — |

</details>

<details><summary><b>연결 지도</b> <code>/graph</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 지도 데이터 불러오기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:286 (useWikiGraphData)` ✔ | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:162` · | 위키 페이지 불러오기, 위키 연결 불러오기 |
| 가운데 '나' 누르기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:292` · | — | — |
| 영역 별 누르기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:292` · | — | — |
| '묶음 보기' 버튼 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:292` · | — | — |
| '연결 찾기' 버튼 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:292` · | — | — |

</details>

<details><summary><b>오늘의 정리</b> <code>/digest</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 제안 불러오기 | `src/app/digest.tsx:48 (refresh)` ✔ | `src/lib/wiki/queries.ts:451` · | 위키 연결 불러오기, 위키 페이지 불러오기 |
| 제안한 기록 열기 | `src/app/digest.tsx:190` · | — | — |
| '맞아요' 눌러 연결 확정 | `src/app/digest.tsx:66 (decide)` ✔ | `src/lib/wiki/queries.ts:479` · | 연결을 확정으로 바꾸기 |
| '아니에요' 눌러 제안 버리기 | `src/app/digest.tsx:66 (decide)` ✔ | `src/lib/wiki/queries.ts:492` · | 연결 제안 지우기 |
| 매일 알림 켜기/끄기 | `src/app/digest.tsx:103 (toggleReminder)` ✔ | `src/lib/ops/daily-review.ts:63` · | — |
| 담으러 가기 / 다시 시도 | `src/app/digest.tsx:168` · | — | — |

</details>

<details><summary><b>관계 찾기</b> <code>/research</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 관계 데이터 불러오기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1402 (loadProposals)` ✔ | `src/lib/wiki/queries.ts:451` · | 위키 페이지 불러오기, 위키 연결 불러오기 |
| '연결 찾기' 눌러 새 제안 만들기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1415 (findProposals)` ✔ | `src/lib/wiki/embeddings.ts:234` · | 뜻이 비슷한 기록 찾기, 새 연결 저장 / AI:embedding |
| 제안에 '맞아요' | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1435 (ratify)` ✔ | `src/lib/wiki/queries.ts:479` · | 연결을 확정으로 바꾸기 |
| 제안에 '아니에요' | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1450 (reject)` ✔ | `src/lib/wiki/queries.ts:492` · | 연결 제안 지우기 |
| 연결/제안 기록 열기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1581` · | — | — |
| 담으러 가기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1485` · | — | — |

</details>

<details><summary><b>이번 주 돌아보기</b> <code>/insights</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 주간 데이터 불러오기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:805 (listRecentRecords)` ✔ | `src/lib/records/create.ts:309` · | 내 기록 불러오기 |
| 오류 시 다시 시도 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:852 (setReloadKey)` ✔ | — | 내 기록 불러오기 |
| 이번 주 카드 누르기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:929` · | — | — |
| '발견' 카드 누르기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:957` · | — | — |
| 첫 주 안내에서 담으러 가기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:874` · | — | — |

</details>

<details><summary><b>밝기 추이 (개발용 데모)</b> <code>/trends</code> — 동작 2</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 (개발 여부 확인) | `src/screens/deepspace/trends/TrendsScreen.tsx:48 (chartPaths)` ✔ | `src/screens/deepspace/trends/TrendsScreen.tsx:27` · | — |
| '공유 카드' 버튼 | `src/screens/deepspace/trends/TrendsScreen.tsx:161` · | — | — |

</details>

<details><summary><b>나의 변화</b> <code>/growth</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 변화 데이터 모으기 | `src/screens/deepspace/growth/WeeklyGrowthScreen.tsx:76 (gatherWeeklyGrowth)` ✔ | `src/lib/growth/gather.ts:42` · | 별 밝기 기록 불러오기, 루틴 완료 기록 불러오기, 목표 불러오기, 내 기록 불러오기 |
| '루틴 추가'로 다음 걸음 저장 | `src/screens/deepspace/growth/WeeklyGrowthScreen.tsx:112 (saveStep)` ✔ | `src/lib/ops/routines.ts:149` · | 루틴 저장 |
| '다시 분석' 누르기 | `src/screens/deepspace/growth/WeeklyGrowthScreen.tsx:95 (reanalyze)` ✔ | `src/lib/growth/gather.ts:42` · | 별 밝기 기록 불러오기, 내 기록 불러오기 |
| '왜 밝아졌나' 근거 칩 | `src/screens/deepspace/growth/WeeklyGrowthScreen.tsx:206` · | — | — |
| '상상을 계획으로' 누르기 | `src/screens/deepspace/growth/WeeklyGrowthScreen.tsx:221` · | — | — |
| 첫 주 안내에서 담기/루틴 | `src/screens/deepspace/growth/WeeklyGrowthScreen.tsx:245` · | — | — |

</details>

<details><summary><b>오늘의 비서</b> <code>/ops</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 오늘 정보 불러오기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1808 (loadToday)` ✔ | `src/lib/ops/routines.ts:188` · | 내 프로필 정보 불러오기, 내 루틴 불러오기, 루틴 완료 기록 불러오기 |
| AI 루틴 추천받기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1847 (runRecommend)` ✔ | `src/lib/ops/recommend.ts:163` · | 내 프로필 정보 불러오기 / AI:ops_recommend |
| 루틴 완료 체크 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1941 (completeRoutine)` ✔ | `src/lib/ops/routines.ts:215` · | 루틴 완료 기록 저장 |
| 추천을 내 루틴으로 저장 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1909 (saveRoutine)` ✔ | `src/lib/ops/routines.ts:149` · | 루틴 저장, 알림 권한 요청 |
| 구글 캘린더에 추가 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1887 (addToCalendar)` ✔ | `src/lib/ops/push.ts:83` · | — |
| 추천 공유하기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1898 (shareStep)` ✔ | — | — |

</details>

<details><summary><b>재정 점검</b> <code>/ledger</code> — 동작 2</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 이번 달·지난달 가계부 불러오기 | `src/screens/deepspace/ops/screens.tsx:484 (listEntriesForMonth)` ✔ | `src/lib/finance/ledger.ts:127` · | 가계부 불러오기 |
| 빠른 지출 기록 추가 | `src/screens/deepspace/ops/screens.tsx:504 (onQuickRecord)` ✔ | `src/lib/finance/ledger.ts:109` · | 지출 기록 추가 |

</details>

<details><summary><b>주간 식단</b> <code>/meals</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 이번 주 식단 불러오기 | `src/screens/deepspace/ops/screens.tsx:692 (listWeek)` ✔ | `src/lib/nutrition/meal-plan.ts:126` · | 식단표 불러오기 |
| 식단 칸 열고 아이디어 받기 | `src/screens/deepspace/ops/screens.tsx:703 (openCell)` ✔ | `src/lib/nutrition/foods.ts:123` · | 식약처 영양정보 검색 |
| 식단 칸 저장 | `src/screens/deepspace/ops/screens.tsx:713 (saveCell)` ✔ | `src/lib/nutrition/meal-plan.ts:100` · | 식단 칸 저장 |
| 주 이동 | `src/screens/deepspace/ops/screens.tsx:697 (shiftWeek)` ✔ | — | 식단표 불러오기 |

</details>

<details><summary><b>목표</b> <code>/milestones</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 목표 목록 불러오기 | `src/screens/deepspace/ops/screens.tsx:389 (listMilestones)` ✔ | `src/lib/ops/milestones.ts:109` · | 목표 불러오기 |
| 목표 추가 | `src/screens/deepspace/ops/screens.tsx:403 (onAdd)` ✔ | `src/lib/ops/milestones.ts:88` · | 새 목표 만들기 |
| 목표 상태 바꾸기 | `src/screens/deepspace/ops/screens.tsx:417 (onAdvance)` ✔ | `src/lib/ops/milestones.ts:134` · | 목표 상태 바꾸기 |

</details>

<details><summary><b>예약 알림</b> <code>/reminders</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 알림 있는 루틴 불러오기 | `src/screens/deepspace/ops/screens.tsx:868 (listActiveRoutines)` ✔ | `src/lib/ops/routines.ts:175` · | 내 루틴 불러오기 |
| 알림 켜고 끄기 | `src/screens/deepspace/ops/screens.tsx:898 (toggle)` ✔ | `src/lib/ops/reminders.ts:259` · | 알림 권한 요청 |
| 비서에서 알림 추가하러 가기 | `src/screens/deepspace/ops/screens.tsx:936` · | — | — |

</details>

<details><summary><b>내 책장</b> <code>/reading</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 내 책장 불러오기 | `src/screens/deepspace/ops/screens.tsx:283 (listShelf)` ✔ | `src/lib/reading/shelf.ts:106` · | 내 책장 불러오기 |
| 책 검색 | `src/screens/deepspace/ops/screens.tsx:288 (onSearch)` ✔ | `src/lib/reading/books.ts:140` · | 구글에서 책 검색 |
| 책장에 담기 | `src/screens/deepspace/ops/screens.tsx:295 (onAdd)` ✔ | `src/lib/reading/shelf.ts:78` · | 책장에 책 담기 |

</details>

<details><summary><b>오늘의 복습</b> <code>/srs</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 오늘 복습할 카드 불러오기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2476 (listDueCards)` ✔ | `src/lib/srs/queries.ts:66` · | 복습 카드 불러오기 |
| 카드 채점 (난이도 선택) | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2496 (grade)` ✔ | `src/lib/srs/queries.ts:95` · | 복습 카드 불러오기, 카드 복습 상태 저장, 복습 기록 남기기, 루틴 완료 기록 저장 |
| 카드 추가 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2514 (addCard)` ✔ | `src/lib/srs/queries.ts:39` · | 새 복습 카드 만들기 |

</details>

<details><summary><b>집중 타이머</b> <code>/focus</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 오늘 집중 횟수 불러오기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2270 (DeepSpaceFocusScreen)` ✔ | — | — |
| 집중 시작·일시정지 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2402 (start)` ✔ | `src/lib/ops/pomodoro.ts:81` · | — |
| 집중 완료 시 자동 기록+알림 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2296 (applyFocusSessionComplete)` ✔ | `src/lib/ops/routines.ts:265` · | 내 루틴 불러오기, 루틴 완료 기록 저장, 알림 권한 요청 |
| 시간·연결 별 선택 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2344 (setPreset)` ✔ | — | — |

</details>

<details><summary><b>휴식 담기</b> <code>/rest</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 휴식 목록 불러오기 | `src/app/rest.tsx:42 (refresh)` ✔ | `src/lib/recreation/items.ts:122` · | 휴식 항목 불러오기 |
| 휴식 항목 추가 | `src/app/rest.tsx:76 (handleAdd)` ✔ | `src/lib/recreation/items.ts:103` · | 휴식 항목 추가 |
| 추가 입력창 열고 닫기 | `src/app/rest.tsx:103 (setAdding)` ✔ | — | — |

</details>

<details><summary><b>커리어 타임라인</b> <code>/career</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 (내 성과 불러오기) | `src/app/career.tsx:59 (refresh)` ✔ | `src/app/career.tsx:30` · | 내 기록 불러오기 |
| 성과 담기 (저장) | `src/app/career.tsx:91 (handleAdd)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |
| 드릴다운 화면으로 이동 | `src/app/career.tsx:134` · | — | — |
| 성과 카드 눌러 상세 보기 | `src/app/career.tsx:261` · | — | — |
| 메인/사이드 트랙 전환 | `src/app/career.tsx:199 (setTrack)` ✔ | — | — |

</details>

<details><summary><b>커리어 드릴다운 (3C4P)</b> <code>/career-drilldown</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 (로그인 확인만) | `src/app/career-drilldown.tsx:111` · | — | — |
| 경험 유형 고르기 | `src/app/career-drilldown.tsx:193 (setExpType)` ✔ | — | — |
| 3C·4P 칸 채우기 | `src/app/career-drilldown.tsx:113 (setField)` ✔ | — | — |
| 제출하기 (세컨비 대화로 이어가기) | `src/app/career-drilldown.tsx:119 (submit)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |

</details>

<details><summary><b>관계 인물맵</b> <code>/people</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 (내 사람들 불러오기) | `src/app/people.tsx:46 (refresh)` ✔ | `src/lib/relation/people.ts:128` · | 내 사람들(관계) 불러오기 |
| 사람 담기 (저장) | `src/app/people.tsx:77 (handleAdd)` ✔ | `src/lib/relation/people.ts:111` · | 사람 추가 |
| 사람 점 눌러 상세 보기 | `src/app/people.tsx:223 (setSelectedId)` ✔ | — | — |

</details>

<details><summary><b>AI 뮤지엄</b> <code>/museum</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 (연표 그리기) | `src/screens/deepspace/museum/MuseumTimelineScreen.tsx:76 (placeMuseumNodes)` ✔ | `src/screens/deepspace/museum/museum-timeline-data.ts:147` · | — |
| 사건 카드 눌러 설명 보기 | `src/screens/deepspace/museum/MuseumTimelineScreen.tsx:269 (setSelId)` ✔ | — | — |
| 연도 이동 (다이얼·좌우 스크롤) | `src/screens/deepspace/museum/MuseumTimelineScreen.tsx:154 (seekToDialX)` ✔ | — | — |
| 연결된 사건으로 이동 | `src/screens/deepspace/museum/MuseumTimelineScreen.tsx:128 (jumpTo)` ✔ | — | — |
| 별자리로 돌아가기 | `src/screens/deepspace/museum/MuseumTimelineScreen.tsx:475` · | — | — |

</details>

<details><summary><b>사이드 프로젝트</b> <code>/side-project</code> — 동작 2</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 (저장된 깃허브 자동 연결) | `src/screens/deepspace/ops/screens.tsx:592 (getGithubUsername)` ✔ | `src/lib/projects/github-link.ts:11` · | 깃허브 공개 활동 가져오기 |
| 깃허브 아이디 연결 | `src/screens/deepspace/ops/screens.tsx:604 (onConnect)` ✔ | `src/lib/projects/github.ts:107` · | 깃허브 공개 활동 가져오기 |

</details>

<details><summary><b>지인 평가 (응답 화면)</b> <code>/peer/[token]</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 링크 열기 (초대 상태 확인) | `src/app/peer/[token].tsx:51 (callPeerRespond)` ✔ | `src/app/peer/[token].tsx:20` · | 지인 평가 응답 처리 |
| 성향 매기기 · 동의 체크 | `src/app/peer/[token].tsx:143 (setRatings)` ✔ | — | — |
| 응답 제출 | `src/app/peer/[token].tsx:69 (submit)` ✔ | `src/app/peer/[token].tsx:20` · | 지인 평가 응답 처리 |
| 응답 철회 | `src/app/peer/[token].tsx:92 (withdraw)` ✔ | `src/app/peer/[token].tsx:20` · | 지인 평가 응답 처리 |

</details>

<details><summary><b>지인 초대</b> <code>/peer-invites</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 (내 초대 목록 불러오기) | `src/app/peer-invites.tsx:36 (reload)` ✔ | `src/lib/peer/invite.ts:73` · | 내가 보낸 초대 불러오기 |
| 초대 만들고 링크 공유 | `src/app/peer-invites.tsx:51 (create)` ✔ | `src/lib/peer/invite.ts:49` · | 지인 초대 만들기 |
| 초대 취소 | `src/app/peer-invites.tsx:68 (revoke)` ✔ | `src/lib/peer/invite.ts:86` · | 초대 취소 |

</details>

<details><summary><b>통화 성찰 (통화 녹음)</b> <code>/call-reflection</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 (사용 가능 여부 확인) | `src/app/call-reflection.tsx:51 (useProgression)` ✔ | `src/lib/progression/useProgression.ts:24` · | — |
| 녹음 시작 | `src/app/call-reflection.tsx:96 (startRecording)` ✔ | — | — |
| 멈추고 글로 바꾸기 | `src/app/call-reflection.tsx:121 (stopAndTranscribe)` ✔ | `src/lib/llm/gemini.ts:1046` · | AI:transcribe |
| 텍스트 담기 (저장) | `src/app/call-reflection.tsx:161 (approve)` ✔ | `src/lib/records/create.ts:100` · | 기록 저장, 경험치 지급 |

</details>

<details><summary><b>공유 카드</b> <code>/share-card</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열기 (내 별·조각 수 불러오기) | `src/app/share-card.tsx:39 (loadDomainLevels)` ✔ | `src/lib/persona/load-domain-levels.ts:202` · | 내 기록 불러오기, 내 사람들(관계) 불러오기 |
| 카드 종류 바꾸기 (A/B) | `src/app/share-card.tsx:29 (setVariant)` ✔ | — | — |
| 이미지 저장 | `src/app/share-card.tsx:91 (handleSave)` ✔ | `src/lib/share/insight-card.ts:104` · | — |
| 공유하기 | `src/app/share-card.tsx:72 (handleShare)` ✔ | `src/lib/share/insight-card.ts:104` · | — |

</details>

<details><summary><b>외부 자기지식 가져오기</b> <code>/import</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/dds-import-inbox-screens.tsx:187 (getImportHistory)` ✔ | `src/lib/import/history.ts:22` · | 내 프로필 정보 불러오기 |
| 파일 선택해서 가져오기 | `src/screens/deepspace/dds-import-inbox-screens.tsx:194 (handlePickFiles)` ✔ | `src/lib/wiki/capture.ts:78` · | 가져온 원본 글 파일 올리기, 가져온 자료 저장 |
| 계정 모드로 가져오기 | `src/screens/deepspace/dds-import-inbox-screens.tsx:167 (setMode)` ✔ | — | 가져온 원본 글 파일 올리기, 가져온 자료 저장 |
| 애플 건강 연결·오늘 반영 | `src/screens/deepspace/dds-import-inbox-screens.tsx:287 (handleHealthIngest)` ✔ | `src/lib/health/ingest.ts:62` · | 내 설정·프로필 바꾸기, 동의 내역 저장, 오늘 건강 데이터 저장 |
| 가져오기 철회 | `src/screens/deepspace/dds-import-inbox-screens.tsx:248 (revokeImport)` ✔ | `src/lib/records/delete-bulk.ts:76` · | 가져온 자료 삭제 |

</details>

<details><summary><b>개인 데이터 가져오기 허브</b> <code>/import-hub</code> — 동작 6</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/import/ImportHubScreen.tsx:103 (getImportHistory)` ✔ | `src/lib/import/history.ts:22` · | — |
| 소스 고르고 동의 | `src/screens/deepspace/import/ImportHubScreen.tsx:106 (openSource)` ✔ | — | — |
| 파일 선택·붙여넣고 분석 | `src/screens/deepspace/import/ImportHubScreen.tsx:118 (runAnalyze)` ✔ | `src/lib/import/proposals.ts:42` · | — |
| 구글 연결(캘린더·할 일) | `src/screens/deepspace/import/ImportHubScreen.tsx:157 (connectGoogle)` ✔ | `src/lib/google/calendar.ts:113` · | — |
| 고른 항목 반영 | `src/screens/deepspace/import/ImportHubScreen.tsx:185 (ratify)` ✔ | `src/lib/wiki/capture.ts:78` · | 가져온 원본 글 파일 올리기, 가져온 자료 저장 |
| 내역에서 철회 | `src/screens/deepspace/import/ImportHubScreen.tsx:218 (removeHistory)` ✔ | `src/lib/records/delete-bulk.ts:76` · | 가져온 자료 삭제 |

</details>

<details><summary><b>소스 연결</b> <code>/integrations</code> — 동작 2</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:300 (DeepSpaceIntegrationsScreen)` ✔ | — | — |
| 소스 연결하기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:310 (toggle)` ✔ | — | — |

</details>

<details><summary><b>요금제</b> <code>/plans</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/dds-plans-screen.tsx:133 (getOfferings)` ✔ | `src/lib/payments/purchases.ts:99` · | 남은 AI 사용량 확인 |
| 요금제 시작(구매) | `src/screens/deepspace/dds-plans-screen.tsx:247 (onStart)` ✔ | `src/lib/payments/purchases.ts:115` · | — |
| 구매 복원 | `src/screens/deepspace/dds-plans-screen.tsx:196 (restore)` ✔ | `src/lib/payments/purchases.ts:131` · | — |
| 광고 보고 무료로 늘리기 | `src/screens/deepspace/dds-plans-screen.tsx:371 (addRewardCredits)` ✔ | `src/lib/entitlements/usage.ts:100` · | 광고 보상으로 무료 횟수 늘리기 |
| 문의하기 | `src/screens/deepspace/dds-plans-screen.tsx:352` · | — | — |

</details>

<details><summary><b>개인정보·데이터 관리</b> <code>/privacy</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:530 (fetchPrivacyPrefs)` ✔ | `src/lib/supabase/privacy.ts:12` · | 내 프로필 정보 불러오기 |
| 맞춤 추천 켜기·끄기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:545 (enableRecommendations)` ✔ | `src/lib/supabase/privacy.ts:31` · | 내 설정·프로필 바꾸기, 동의 내역 저장 |
| 기록 의미 연결 켜기·끄기 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:580 (enableEmbedding)` ✔ | `src/lib/supabase/privacy.ts:31` · | 내 설정·프로필 바꾸기, 기록 내용 바꾸기 |
| 계정 영구 삭제 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:511 (runDeleteAccount)` ✔ | `src/lib/records/delete-bulk.ts:205` · | 기록 삭제, 가져온 자료 삭제, 계정 완전 삭제 처리, 로그아웃 |

</details>

<details><summary><b>공상하기</b> <code>/imagine</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/components/deep-space/DeepSpaceViews.tsx:1433 (ImagineDivergentView)` ✔ | — | — |
| 관점(씨앗) 고르기 | `src/components/deep-space/DeepSpaceViews.tsx:1435 (setPicked)` ✔ | — | — |
| 씨앗·걸음을 담기로 보내기 | `src/components/deep-space/DeepSpaceViews.tsx:1522` · | — | — |
| 더 이야기하기 | `src/components/deep-space/DeepSpaceViews.tsx:1528` · | — | — |

</details>

<details><summary><b>자비스(이동용)</b> <code>/jarvis</code> — 동작 1</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/app/jarvis.tsx:7 (JarvisRedirect)` ✔ | — | — |

</details>

<details><summary><b>일기(이동용)</b> <code>/journal</code> — 동작 1</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/app/journal.tsx:15 (JournalRedirect)` ✔ | — | — |

</details>

<details><summary><b>딥스페이스 홈(개발용 미리보기)</b> <code>/deepspace-home</code> — 동작 5</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/DeepSpaceHomeScreen.tsx:154 (loadDomainLevels)` ✔ | `src/lib/persona/load-domain-levels.ts:202` · | 내 기록 불러오기 |
| 영역 별 누르기 | `src/screens/deepspace/DeepSpaceHomeScreen.tsx:167 (travel)` ✔ | — | — |
| 북극성 누르기 | `src/screens/deepspace/DeepSpaceHomeScreen.tsx:167 (travel)` ✔ | — | — |
| 세컨비 머리 누르기(메뉴) | `src/screens/deepspace/DeepSpaceHomeScreen.tsx:146 (setMenuOpen)` ✔ | — | — |
| 알림 벨 | `src/screens/deepspace/DeepSpaceHomeScreen.tsx:212` · | — | — |

</details>

<details><summary><b>딥스페이스 허브(개발용 미리보기)</b> <code>/deepspace-hub</code> — 동작 4</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/DeepSpaceHubDockScreen.tsx:17 (DeepSpaceHubDockScreen)` ✔ | — | — |
| 탭 전환 | `src/screens/deepspace/DeepSpaceHubDockScreen.tsx:18 (setActive)` ✔ | — | — |
| 담기·전송 데모 | `src/screens/deepspace/DeepSpaceHubDockScreen.tsx:20 (setCaptured)` ✔ | — | — |
| 오늘의 정리 열기 | `src/screens/deepspace/DeepSpaceHubDockScreen.tsx:183` · | — | — |

</details>

<details><summary><b>화면 관계 지도(개발용 QA)</b> <code>/deepspace-flowmap</code> — 동작 3</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/DeepSpaceFlowMapScreen.tsx:93 (DeepSpaceFlowMapScreen)` ✔ | — | — |
| 화면 열기 | `src/screens/deepspace/DeepSpaceFlowMapScreen.tsx:148` · | — | — |
| 로딩 시스템 미리보기 | `src/screens/deepspace/DeepSpaceFlowMapScreen.tsx:103 (runLoadingDemo)` ✔ | `src/lib/tasks/store.ts:66` · | — |

</details>

<details><summary><b>컴포넌트 미리보기(개발용)</b> <code>/deepspace-preview</code> — 동작 1</summary>

| 동작 | 코드 위치 | 실제 로직 | 의존 |
|---|---|---|---|
| 화면 열 때 | `src/screens/deepspace/DeepSpaceComponentsPreview.tsx:7 (DeepSpaceComponentsPreview)` ✔ | — | — |

</details>

## 8. 위험 프로필

- **인터넷 필요** — 127개 동작
- **로그인 필요** — 73개 동작
- **조용한 실패 위험** — 36개 동작
- **외부 서비스 의존** — 29개 동작
- **기본 꺼짐/권한** — 17개 동작
- **비용 발생** — 16개 동작
- **AI(가끔 틀림)** — 13개 동작

## 9. 이 맵의 신뢰도

| | 수 | 뜻 |
|---|---|---|
| ✔ VERIFIED | 253 | 그 줄에 그 함수가 실제로 있음 |
| · LOCATED | 355 | 파일·줄은 실재. **대조할 함수명이 없어 그 줄이 맞는지는 확인 못 함** |
| ~ CAUTION | 0 | 빈 줄 / import / 주석 / 맨 JSX 렌더 줄 |
| ⚠ 못 믿음 | 0 | 대조 실패 |
| 위임 트랩 | 0 | 앵커가 가리키는 파일이 프로덕션에선 다른 걸 그림 |

## 10. 이 맵 갱신하는 법

앱을 고쳤으면 맵도 다시 만든다(안 그러면 이 파일이 거짓말을 시작한다):

```bash
# flow-debugger 스킬 폴더에서
node scripts/prescan.js "E:\2ndB" --graph <graph.json>
node scripts/verify-anchors.js <graph.json> "E:\2ndB" --fix <graph.json> --strict
node scripts/build.js assets/flow-debugger.template.html <graph.json> <glossary.json> <out.html> --app-root "E:\2ndB"
node scripts/make-handoff.js <graph.json> "E:\2ndB" --out E:/2ndB/docs/FLOW-HANDOFF.md
```

앵커가 많이 틀어졌으면 그 화면만 **RESCAN** 한다 — `references/scan-prompts.md` "RESCAN / PATCH".

