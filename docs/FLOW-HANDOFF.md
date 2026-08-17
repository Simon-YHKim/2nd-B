# 2nd-B — 구조 핸드오프

> 새 세션은 **이 파일만 읽으면** 앱 구조를 안다. 2분이면 된다.
> 개별 화면을 건드릴 땐 [`docs/flow-map.json`](docs/flow-map.json) 를 조회한다(아래 §5).
> 자동 생성 — 손으로 고치지 말고 `make-handoff.js` 로 재생성할 것.

**88개 화면 · 529개 동작 · 서버/데이터 100종 · AI 14종**  
코드 좌표 830개 전부 실제 소스와 대조: **✔ 함수까지 확인 247** · **· 파일·줄만 확인 577** · ⚠ 6

**스택** — React Native + Expo Router (Expo SDK ~56) + Supabase(auth·db·rpc·edge·storage) + Gemini(gemini-proxy 엣지 함수 경유) + RevenueCat IAP. 프로덕션 UI = deep-space: src/app/*.tsx 의 상당수가 isDeepSpaceUI()(src/lib/ui-mode.ts:36, 기본값 deep-space)로 src/screens/deepspace/** · src/components/deep-space/** 에 위임한다 — src/app 의 legacy 본문은 프로덕션에서 렌더되지 않으니, 화면 수정은 코드 힌트의 (렌더: …) 파일에서 해야 빌드 통과와 화면 반영이 함께 된다. dev 전용 라우트(배포판 미개방): /trends /deepspace-home /deepspace-hub /deepspace-flowmap /deepspace-preview.

### 0. 먼저 — 이 문서가 아직 맞는지 30초 안에 확인

이 지도는 커밋 `7cc7db18` (+ 커밋 안 된 변경) 의 코드를 읽고 만들었다.
그 뒤로 코드가 바뀌었다면 아래 좌표들은 **틀린 채로 자신 있어 보인다.** 바로 확인할 것:

```bash
node <flow-debugger>/scripts/check-stale.js docs/flow-map.json . --strict
```
- **exit 0** — 앵커한 파일 166개가 그대로다. 이 문서를 믿고 시작해도 된다.
- **exit 1** — 바뀐 파일 목록이 그대로 출력된다. **그 화면들만** 다시 스캔하면 된다(§6 재생성).

---

## 1. 코드 만지기 전에 반드시 아는 3가지

이 셋을 모르고 시작하면 반나절을 버린다. 실제로 그렇게 됐다.

### 1. `src/app/*.tsx` 를 고치면 **화면이 안 바뀐다**

**`isDeepSpaceUI()`** (`src/lib/ui-mode.ts:36`) 가 어느 UI를 그릴지 고른다 — 라우트 4개가 이걸로 갈라진다.

사용자가 보는 건 **위임된 쪽**이다. 라우트 파일의 본문은 프로덕션에서 렌더되지 않는다.
거기를 고치면 **빌드는 초록인데 화면은 그대로**다.

**고칠 파일 찾는 법** — 화면 0개가 위임한다. 그 화면의 진짜 파일:

```bash
jq -r '.screens[] | select(.route=="/sign-in") | .rendersInProduction' docs/flow-map.json
```

### 2. 이 5개 화면은 **사용자가 못 연다**

배포판에서 열리지 않는다. **여기서 찾은 "버그"는 실사용자에게 안 보인다** — 고치기 전에 그것부터 확인할 것.
(전에 이걸 안 물어서 "저장 버튼이 가짜다, 데이터가 사라진다"는 확신에 찬 **허위 신고 4건**이 나갔다.)

| 화면 | 왜 | 근거 |
|---|---|---|
| `/deepspace-home` | 개발 전용 — 배포판에서는 열리지 않아요 | `src/app/deepspace-home.tsx:6` |
| `/deepspace-hub` | 개발 전용 — 배포판에서는 열리지 않아요 | `src/app/deepspace-hub.tsx:6` |
| `/deepspace-preview` | 개발 전용 — 배포판에서는 열리지 않아요 | `src/app/deepspace-preview.tsx:6` |
| `/deepspace-flowmap` | 개발 전용 — 배포판에서는 열리지 않아요 | `src/app/deepspace-flowmap.tsx:6` |
| `/trends` | 개발 전용 — 배포판에서는 열리지 않아요 | `src/app/trends.tsx:18` |

### 3. 겉보기와 다른 함수 — **호출 한 줄에 AI가 숨어 있다**

화면 코드엔 `createRecord(...)` 한 줄뿐인데 그 안에서 **AI를 부른다.** 화면 파일만 읽으면 절대 안 보인다.
(이걸 안 따라가서 서버 호출 66건·AI 7건이 통째로 지도에서 빠졌었다.)

**AI를 부르는 함수 26개** — 화면에 이 호출이 보이면 AI·비용·지연을 계산에 넣어라:

| 함수 | 위치 | 경유 |
|---|---|---|
| `useImportPendingCaptures()` | `src/lib/capture/use-import-pending.ts:15` | `createRecord` |
| `sendChatMessage()` | `src/lib/chat/conversation.ts:166` | `readChatUsage` |
| `retrieveChatContext()` | `src/lib/chat/rag.ts:40` | `embedTexts` |
| `buildIdenDoc()` | `src/lib/iden/build-iden.ts:257` | `buildPersona` |
| `exportIden()` | `src/lib/iden/iden-export.ts:89` | `buildIdenDoc` |
| `nextProbe()` | `src/lib/interview/probe.ts:239` | `callLlm` |
| `callLlm()` | `src/lib/llm/boundary.ts:464` | `callAdvisor` |
| `embedTexts()` | `src/lib/llm/boundary.ts:903` | 직접 |
| `transcribeAudio()` | `src/lib/llm/boundary.ts:1046` | `classifySafety` |
| `callAdvisor()` | `src/lib/llm/boundary.ts:1152` | `classifySafety` |
| `classifySafety()` | `src/lib/llm/safety.ts:254` | `insertAiAuditLog` |
| `buildOpsDailyBrief()` | `src/lib/ops/daily-brief.ts:142` | `callLlm` |

전체 26개: `jq '.aiHelpers | keys' docs/flow-map.json`

---

## 2. 앱 기능 지도

| 영역 | 화면 | 동작 | 주요 화면 |
|---|---|---|---|
| **인증·시작** | 10 | 46 | 로그인 `/sign-in` · 회원가입 `/sign-up` · 비밀번호 재설정 `/reset-password` · 가입 마무리(생년월일·동의) `/complete-profile` |
| **홈·별자리** | 10 | 47 | 홈 별자리 `/` · 허브 도크 (개발용 미리보기) `/deepspace-hub` · 도메인 별 렌즈 `/star/[domain]` · 북극성 문장 `/northstar` |
| **담기·기록** | 5 | 49 | 전체 담기 `/capture-full` · 위키 (기록 보관소) `/records` · 담기 `/capture` · 별가루 상세 `/record/[id]` |
| **검사·진단** | 10 | 79 | 성격 5요인 검사 `/big-five` · 동기 자기보고 `/motivation` · 애착 유형 `/attachment` · 성격 정밀검사 (120문항) `/ipip-neo` |
| **설정·계정** | 13 | 73 | 설정 `/settings` · 요금제 `/plans` · 오늘의 비서 (루틴 허브) `/ops` · 내보내기 형식 `/formats` |
| **삶의 영역** | 9 | 54 | 커리어 타임라인 `/career` · 주간 식단 `/meals` · 나의 변화 (주간 성장) `/growth` · 휴식 `/rest` |
| **AI 비서·상상** | 9 | 52 | 세컨비 대화 `/secondb` · 위키 `/wiki` · 리서치 (연결 찾기) `/research` · 심층 인터뷰 `/interview` |
| **돌아보기·통계** | 10 | 56 | 집중 타이머 `/focus` · AI 뮤지엄 `/museum` · 인사이트 `/insights` · 오늘의 정리 `/digest` |
| **가져오기·연결** | 9 | 53 | 가져오기 허브 `/import-hub` · 통화 녹음 (앱 안에 들어가는 길이 없는 화면) `/call-reflection` · 외부 가져오기 `/import` · 지인 응답 페이지 `/peer/[token]` |
| **옛 화면** | 3 | 20 | 북극성 (나의 종합 요약) `/core-brain` · 내 두뇌 지도 `/graph` · 내 영역 (4영역) `/trinity` |

전체 화면 목록: `jq -r '.screens[] | "\(.groupKo)  \(.title)  \(.route)"' docs/flow-map.json`

---

## 3. 알려진 문제 10건

손대기 전에 여기 있는지 먼저 본다. **코드 위치 = 결함이 있는 곳(화면)** — 액션이 부르는 lib(`impl`)이 아니다.

| 화면 | 안 되는 것 | 증상 | 결함 위치 |
|---|---|---|---|
| `/attachment` | 첫 저장 뒤 세컨비 대화로 자동 이동 | 버그(앱 전용): 앱을 껐다 켜면 '처음' 표시가 초기화돼서, 이미 한 번 안내를 받은 사람도 다음 저장 때… | `src/app/attachment.tsx:222` |
| `/research` | 첫 별가루 담기 (빈 화면일 때) | 기록 화면에서 저장한 메모는 '기록(records)' 으로 들어가고, 이 화면이 세는 '위키 페이지(wiki… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1485` |
| `/research` | 묶음 태그로 걸러 보기 | 이 칩은 지금 빌드에서 화면에 나오지 않아요 — 위키 페이지를 만드는 경로(generateSourcePage… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1385` |
| `/research` | AI 연결 제안 받기 | 이 버튼은 지금 빌드에서 화면에 나오지 않아요 — 위키 페이지를 만드는 경로(generateSourcePag… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1385` |
| `/research` | 연결 승인하기 | 이 버튼은 지금 빌드에서 화면에 나오지 않아요 — 위키 페이지를 만드는 경로(generateSourcePag… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1435` |
| `/research` | 연결 제안 거절하기 | 이 버튼은 지금 빌드에서 화면에 나오지 않아요 — 위키 페이지를 만드는 경로(generateSourcePag… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1450` |
| `/wiki` | 원문 열어 보기 | 이 줄을 누르면 항상 '기록을 찾을 수 없어요' 빈 화면이 열려요 — 위키 페이지 id 를 기록 id 로 잘… | `src/screens/deepspace/dds-wiki-records-screens.tsx:1368` |
| `/strengths` | '다음' 눌러 다음 문항 페이지로 넘어가기 | 게이트: 마지막 장이 아니면 저장 버튼 자체가 없어서, 다 답했는데도 저장을 못 찾는 것처럼 보여요 | `src/components/quant/QuantPager.tsx:122` |
| `/import-hub` | 가져온 데이터 삭제(철회) | 서버가 안 되면 '철회하지 못했어요'가 뜨고 목록에 그대로 남아요 | `src/screens/deepspace/import/ImportHubScreen.tsx:227` |
| `/settings` | '그래프 크루 (장식 로봇)' 밀도 바꾸기 (없음/적게/보통/많이) | 밀도를 '많이'로 해도 크루가 하나도 안 보입니다 — 이 설정이 붙어 있는 그래프 화면이 기본 화면에서 안 … | `src/app/settings.tsx:801` |

---

## 5. 필요할 때 찾아보는 법

읽는 건 여기까지다. 나머지는 **찾아 쓴다** — [`docs/flow-map.json`](docs/flow-map.json) 에 529개 동작 전부 있다.

```bash
# 한 화면이 무슨 일을 하는가
jq '.screens[] | select(.route=="/capture")' docs/flow-map.json

# 이 화면을 고치려면 어느 파일인가 (프로덕션 렌더 파일)
jq -r '.screens[] | select(.route=="/capture") | .rendersInProduction' docs/flow-map.json

# 어떤 동작이 이 테이블을 건드리나
jq -r '.screens[].actions[] | select(.apis[]? | contains("records")) | .action' docs/flow-map.json

# AI 쓰는 동작 전부
jq -r '.screens[] as $s | $s.actions[] | select(.ai) | "\($s.route)  \(.action)  \(.ai.purpose)"' docs/flow-map.json
```

---

## 6. 이 지도를 얼마나 믿어도 되나

| | 수 | 뜻 |
|---|---|---|
| **✔** | 247 | 그 줄에 **그 함수가 실제로 있음** — 출발점으로 신뢰해도 됨 |
| **·** | 577 | 파일·줄은 실재. **대조할 함수명이 없어 그 줄이 맞는지는 확인 못 함** — 근처를 읽고 판단 |
| **~** | 6 | 빈 줄/import/주석 — 로직은 다른 줄 |
| **⚠** | 0 | 대조 실패 — 믿지 말 것 |
| 위임 트랩 | 29 | 앵커가 가리키는 파일이 프로덕션에선 다른 걸 그림 |

**위임 트랩 — 이 좌표를 고쳐도 화면은 안 바뀐다:**

- `/capture-full` :: 화면 열기 (로그인 확인 + 최근 기록·등급 불러오기) → `src/app/capture.tsx` 는 프로덕션에서 `<DeepSpaceScreen/>` 를 렌더
- `/capture-full` :: 다른 형식 꺼내서 바꾸기 (더보기 → 메모·4W1H·링크·사진·음성·할 일·문서) → `src/app/capture.tsx` 는 프로덕션에서 `<DeepSpaceScreen/>` 를 렌더
- `/capture-full` :: 일기 담기 (기본 형식) — AI 조언은 클로드로 나가요 → `src/app/capture.tsx` 는 프로덕션에서 `<DeepSpaceScreen/>` 를 렌더
- `/capture-full` :: '일기 잠김'에서 벗어나기 ('입문 시작하기' → 입문 화면) → `src/app/capture.tsx` 는 프로덕션에서 `<DeepSpaceScreen/>` 를 렌더
- `/capture-full` :: 4W1H·할 일·음성 담기 → `src/app/capture.tsx` 는 프로덕션에서 `<DeepSpaceScreen/>` 를 렌더
- `/capture-full` :: 링크·클립·메모·사진 글자·파일 담기 (위험 신호면 안전 기록도 남아요) → `src/app/capture.tsx` 는 프로덕션에서 `<DeepSpaceScreen/>` 를 렌더
- `/capture-full` :: 읽을 사진 고르기 (카메라·갤러리) → `src/app/capture.tsx` 는 프로덕션에서 `<DeepSpaceScreen/>` 를 렌더
- `/capture-full` :: 사진에서 글자 뽑기 (추출하기) → `src/app/capture.tsx` 는 프로덕션에서 `<DeepSpaceScreen/>` 를 렌더

**앱을 고쳤으면 지도도 갱신한다** — 안 하면 이 파일이 거짓말을 시작한다:

```bash
# flow-debugger 스킬 폴더에서 (scan-prompts.md "RESCAN / PATCH" 참조)
node scripts/verify-anchors.js <graph.json> "C:\Users\202502\orca\workspaces\2ndB\260802_Function-Debugging" --fix <graph.json> --strict
node scripts/make-handoff.js <graph.json> "C:\Users\202502\orca\workspaces\2ndB\260802_Function-Debugging" --out docs/FLOW-HANDOFF.md --json docs/flow-map.json
```

