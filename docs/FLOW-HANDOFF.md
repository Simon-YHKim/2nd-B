# 2nd-B — 구조 핸드오프

> 새 세션은 **이 파일만 읽으면** 앱 구조를 안다. 2분이면 된다.
> 개별 화면을 건드릴 땐 [`docs/flow-map.json`](docs/flow-map.json) 를 조회한다(아래 §5).
> 자동 생성 — 손으로 고치지 말고 `make-handoff.js` 로 재생성할 것.

**86개 화면 · 522개 동작 · 서버/데이터 100종 · AI 14종**  
코드 좌표 820개 전부 실제 소스와 대조: **✔ 함수까지 확인 240** · **· 파일·줄만 확인 574** · ⚠ 6

**스택** — React Native + Expo Router (Expo SDK ~56) + Supabase(auth·db·rpc·edge·storage) + Gemini(gemini-proxy 엣지 함수 경유) + RevenueCat IAP. 프로덕션 UI = deep-space: src/app/*.tsx 의 상당수가 isDeepSpaceUI()(src/lib/ui-mode.ts:36, 기본값 deep-space)로 src/screens/deepspace/** · src/components/deep-space/** 에 위임한다 — src/app 의 legacy 본문은 프로덕션에서 렌더되지 않으니, 화면 수정은 코드 힌트의 (렌더: …) 파일에서 해야 빌드 통과와 화면 반영이 함께 된다. dev 전용 라우트(배포판 미개방): /trends /deepspace-home /deepspace-hub /deepspace-flowmap /deepspace-preview.

### 0. 먼저 — 이 문서가 아직 맞는지 30초 안에 확인

이 지도는 커밋 `7dd5bdd4` (+ 커밋 안 된 변경) 의 코드를 읽고 만들었다.
그 뒤로 코드가 바뀌었다면 아래 좌표들은 **틀린 채로 자신 있어 보인다.** 바로 확인할 것:

```bash
node <flow-debugger>/scripts/check-stale.js docs/flow-map.json . --strict
```
- **exit 0** — 앵커한 파일 163개가 그대로다. 이 문서를 믿고 시작해도 된다.
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
| `nextProbe()` | `src/lib/interview/probe.ts:239` | `callGemini` |
| `callGemini()` | `src/lib/llm/gemini.ts:464` | `callAdvisor` |
| `embedTexts()` | `src/lib/llm/gemini.ts:903` | 직접 |
| `transcribeAudio()` | `src/lib/llm/gemini.ts:1046` | `classifySafety` |
| `callAdvisor()` | `src/lib/llm/gemini.ts:1152` | `classifySafety` |
| `classifySafety()` | `src/lib/llm/safety.ts:254` | `insertAiAuditLog` |
| `buildOpsDailyBrief()` | `src/lib/ops/daily-brief.ts:142` | `callGemini` |

전체 26개: `jq '.aiHelpers | keys' docs/flow-map.json`

---

## 2. 앱 기능 지도

| 영역 | 화면 | 동작 | 주요 화면 |
|---|---|---|---|
| **인증·시작** | 8 | 39 | 회원가입 `/sign-up` · 로그인 `/sign-in` · 비밀번호 재설정 `/reset-password` · 가입 마무리(생년월일·동의) `/complete-profile` |
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

## 3. 알려진 문제 43건

손대기 전에 여기 있는지 먼저 본다. **코드 위치 = 결함이 있는 곳(화면)** — 액션이 부르는 lib(`impl`)이 아니다.

| 화면 | 안 되는 것 | 증상 | 결함 위치 |
|---|---|---|---|
| `/reset-password` | 화면 열기(재설정 링크 확인) | 메일 링크로 앱이 새로 켜질 때(콜드 스타트) 로딩이 끝나는 순간 화면이 오류로 죽습니다 — dds-auth… | `src/screens/deepspace/dds-auth-screens.tsx:581` |
| `/star/[domain]` | 담기 버튼 누르기 | 담고 돌아왔는데 이 별의 목록에 그 기록이 없어요 (다른 별로 붙었어요) | `src/app/star/[domain].tsx:176` |
| `/northstar` | 세컨비 제안 받기 | 인터넷이 끊기거나 AI가 형식에 안 맞는 답을 해도 화면은 똑같이 '아직 기록이 얕아서 제안하기 조심스러워요… | `src/app/northstar.tsx:98` |
| `/northstar` | 이 문장으로 저장 | 저장이 실패하면 버튼만 다시 눌리게 풀릴 뿐, 실패했다는 안내가 안 떠요 — 화면이 안 넘어가면 저장이 안 … | `src/app/northstar.tsx:126` |
| `/capture` | 전체 담기 화면 열기 (사진·음성) | '카메라·앨범 열기'를 눌러도 카메라도 앨범도 안 열려요. 화면만 전체 담기 화면으로 바뀌어요 | `src/components/deep-space/DeepSpaceViews.tsx:420` |
| `/capture-full` | 음성 녹음하고 받아쓰기 | 현재 배포된 실제 앱에서는 받아쓰기가 항상 '녹음을 글로 바꾸지 못했어요…'로 끝나요. 음성 받아쓰기만 안전… | `src/app/capture.tsx:1886` |
| `/capture-full` | 어디로 보낼지 고르기 (일상 Wiki · Pro Wiki) — AI가 덮어써요 | 직접 고른 트랙이 저장할 때 AI가 고른 트랙으로 조용히 바뀌어요 (아무 안내가 없어요 — 실제 약점이에요) | `src/app/capture.tsx:1564` |
| `/records` | 정리함 열기 | 카드를 눌러도 정리를 못 해요. 태그·보관·삭제 버튼이 있는 화면이 아니라 비어 있는 '알림' 화면으로 가요… | `src/screens/deepspace/dds-wiki-records-screens.tsx:490` |
| `/record/[id]` | 검사 결과 보러 가기 | 약점: 검사 이름표가 다섯 가지(동기·강점·가치·성격·애착) 중 하나와 정확히 맞지 않으면 버튼이 아예 안 … | `src/screens/deepspace/dds-wiki-records-screens.tsx:998` |
| `/inbox` | 알림 화면 열기 (로그인 확인 후 빈 목록) | 담아둔 자료가 아무리 많아도 알림 목록은 항상 비어 있어요 - 화면이 서버에서 데이터를 전혀 읽지 않고, 목… | `src/screens/deepspace/dds-import-inbox-screens.tsx:78` |
| `/attachment` | 첫 저장 뒤 세컨비 대화로 자동 이동 | 버그(앱 전용): 앱을 껐다 켜면 '처음' 표시가 초기화돼서, 이미 한 번 안내를 받은 사람도 다음 저장 때… | `src/app/attachment.tsx:222` |
| `/manual` | 화면 열기 | 검색창을 눌러도 글자가 입력되지 않아요 (원래 동작하지 않는 장식이에요) | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1074` |
| `/formats` | 원본 기록 포함 스위치 | 실제 결함: .iden / PDF / JSON을 고른 상태에서 이 스위치를 켜도 아무 차이가 없어요. 코드가… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1722` |
| `/secondb` | 화면 열기 (로그인·가입정보 확인 + 인사 모달 + 오늘 쓴 횟수 불러오기) | 구글 로그인만 하고 생년월일·동의를 아직 안 채웠으면 세컨비 화면이 아예 열리지 않고 정보 입력 화면(/co… | `src/app/secondb.tsx:393` |
| `/secondb` | 음성 입력 마이크 누르기 (동작하지 않음) | 마이크 아이콘은 눌러도 아무 동작이 없어요 (핸들러가 아예 없는 미완성 버튼) | `src/app/secondb.tsx:248` |
| `/secondb` | 근거 보기 (참고한 기록 열기) | 누른 그 페이지로 이동하지 않고 위키 목록만 열려요. 어떤 기록을 눌렀는지 정보가 그냥 버려집니다 (코드에 … | `src/app/secondb.tsx:1006` |
| `/secondb` | 답변을 길게 눌러 복사하기 | 휴대폰 앱에서는 꾹 눌러도 자동 복사가 안 돼요 — 자동 복사는 웹 브라우저에서만 동작해요 (src/app/… | `src/app/secondb.tsx:716` |
| `/beyond` | 음성으로 담기 (마이크 버튼) | 마이크 버튼을 눌러도 녹음이 안 시작돼요 — 그냥 글 쓰는 담기 화면만 열려요 | `src/app/beyond.tsx:96` |
| `/beyond` | 알림 설정 열기 | 이 화면에서는 알림을 못 꺼요 — 설정 화면으로 넘어가야 해요 | `src/app/beyond.tsx:135` |
| `/research` | 첫 별가루 담기 (빈 화면일 때) | 기록 화면에서 저장한 메모는 '기록(records)' 으로 들어가고, 이 화면이 세는 '위키 페이지(wiki… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1485` |
| `/research` | 묶음 태그로 걸러 보기 | 이 칩은 지금 빌드에서 화면에 나오지 않아요 — 위키 페이지를 만드는 경로(generateSourcePage… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1385` |
| `/research` | AI 연결 제안 받기 | 이 버튼은 지금 빌드에서 화면에 나오지 않아요 — 위키 페이지를 만드는 경로(generateSourcePag… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1385` |
| `/research` | 연결 승인하기 | 이 버튼은 지금 빌드에서 화면에 나오지 않아요 — 위키 페이지를 만드는 경로(generateSourcePag… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1435` |
| `/research` | 연결 제안 거절하기 | 이 버튼은 지금 빌드에서 화면에 나오지 않아요 — 위키 페이지를 만드는 경로(generateSourcePag… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1450` |
| `/research` | 페이지 열어 보기 | 위키 페이지 번호를 기록 화면에 그대로 넘겨요 — 두 번호는 서로 다른 체계라 거의 항상 '기록을 찾을 수 … | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:1524` |
| `/wiki` | 원문 열어 보기 | 이 줄을 누르면 항상 '기록을 찾을 수 없어요' 빈 화면이 열려요 — 위키 페이지 id 를 기록 id 로 잘… | `src/screens/deepspace/dds-wiki-records-screens.tsx:1368` |
| `/ipip-neo` | 검사 시작하기 | 안내 창이 안 뜨고 바로 문항이 나오면, 예전에 '다음부터 이 안내 건너뛰기'를 체크해 둔 거예요 (고장이 … | `src/app/ipip-neo.tsx:375` |
| `/strengths` | '다음' 눌러 다음 문항 페이지로 넘어가기 | 게이트: 마지막 장이 아니면 저장 버튼 자체가 없어서, 다 답했는데도 저장을 못 찾는 것처럼 보여요 | `src/components/quant/QuantPager.tsx:122` |
| `/digest` | 제안 줄 눌러 원본 기록 열기 (지금은 항상 '기록을 찾을 수 없어요. 보관소로 돌아가 다시 열어보세요.'가 떠요) | 언제나 '기록을 찾을 수 없어요. 보관소로 돌아가 다시 열어보세요.' 화면 — 기록이 지워져서가 아니라 10… | `src/app/digest.tsx:190` |
| `/milestones` | 목표 추가 (＋ 버튼) | 저장이 실패해도 오류 문구가 전혀 안 떠요 (조용한 실패 — screens.tsx:409-411 의 빈 ca… | `src/screens/deepspace/ops/screens.tsx:403` |
| `/milestones` | 상태 칩 눌러 진행 상태 바꾸기 | 저장이 실패해도 오류 안내가 없어서 그냥 안 눌린 것처럼 보여요 (screens.tsx:423-425 의 빈… | `src/screens/deepspace/ops/screens.tsx:417` |
| `/focus` | '어떤 별을 위해?' 별 고르기 | 고른 별이 저장되지 않아 별 밝기나 영역별 통계에 전혀 반영되지 않아요 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2424` |
| `/import-hub` | 가져온 데이터 삭제(철회) | 서버가 안 되면 '철회하지 못했어요'가 뜨고 목록에 그대로 남아요 | `src/screens/deepspace/import/ImportHubScreen.tsx:227` |
| `/import-hub` | '이 기기에서만 처리' 스위치 | 스위치를 어느 쪽에 두든 저장하면 서버 업로드는 그대로 일어나요 (스위치가 동작하지 않는 버그) | `src/screens/deepspace/import/ImportHubScreen.tsx:343` |
| `/integrations` | 소스 연결 누르기 | 가져오기를 취소하거나 뒤로 나와도 줄이 '연결됨'으로 남아, 연결되지 않은 데이터가 연결된 것처럼 보여요 | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:310` |
| `/call-reflection` | '녹음 멈추고 분석' 누르기 — 배포본에서는 100% 실패 (다만 이 화면 자체에 들어오는 길이 없음) | 지금 배포된 앱에서는 '녹음 멈추고 분석'이 100% 실패해요. 매번 '받아 적기에 실패했어요.'만 뜨고 처… | `src/app/call-reflection.tsx:134` |
| `/reminders` | 알림 켜기/끄기 | 스위치를 꺼도 폰 알림이 예정대로 계속 울려요 - 화면은 꺼진 것으로 보이는데 알림만 계속 와서 앱이 내 설… | `src/screens/deepspace/ops/screens.tsx:1044` |
| `/share-card` | 화면 열기 | 내가 쓴 북극성 문장과 상관없이 카드 문장이 항상 '깊이 이해하고, 더 나답게 산다.' 로 고정돼요 (서버·… | `src/app/share-card.tsx:70` |
| `/settings` | 다크 모드·강조색 바꾸기, '기능' 스위치 5개 켜고 끄기 | '앱 잠금'을 켜도 앱이 잠기지 않습니다 — 남에게 폰을 건네도 그대로 열립니다 (생체 인증 기능 자체가 앱… | `src/app/settings.tsx:414` |
| `/settings` | '데이터 연동'의 연결 버튼 누르기 (Google 캘린더 · Apple 건강 · Notion) | '연결됨 · 동기화 중'이라고 표시되지만 실제 동기화는 전혀 일어나지 않습니다 (화면이 거짓말을 합니다) | `src/app/settings.tsx:415` |
| `/settings` | '그래프 크루 (장식 로봇)' 밀도 바꾸기 (없음/적게/보통/많이) | 밀도를 '많이'로 해도 크루가 하나도 안 보입니다 — 이 설정이 붙어 있는 그래프 화면이 기본 화면에서 안 … | `src/app/settings.tsx:801` |
| `/plans` | 무료 요금제(별바라기) 카드의 버튼 누르기 — 유료 이용자에게만 눌리는 버튼 | 버튼을 눌러도 아무 반응이 없습니다 (앱이 멈춘 것처럼 보입니다) | `src/app/plans.tsx:187` |
| `/graph` | 화면 열자마자 개수 세어 오기 | 별의 위치·개수·이름이 전부 고정된 가짜 그림입니다. 내 글이 늘어도 별은 하나도 안 늘고 자리도 안 바뀝니… | `src/screens/deepspace/DeepSpaceDesignScreens.tsx:164` |

---

## 5. 필요할 때 찾아보는 법

읽는 건 여기까지다. 나머지는 **찾아 쓴다** — [`docs/flow-map.json`](docs/flow-map.json) 에 522개 동작 전부 있다.

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

**클릭해서 보기:** [`docs/flow-debugger.html`](docs/flow-debugger.html) — 화면별 플로우 / 시스템 플로우, 버그 신고서 생성.

---

## 6. 이 지도를 얼마나 믿어도 되나

| | 수 | 뜻 |
|---|---|---|
| **✔** | 240 | 그 줄에 **그 함수가 실제로 있음** — 출발점으로 신뢰해도 됨 |
| **·** | 574 | 파일·줄은 실재. **대조할 함수명이 없어 그 줄이 맞는지는 확인 못 함** — 근처를 읽고 판단 |
| **~** | 6 | 빈 줄/import/주석 — 로직은 다른 줄 |
| **⚠** | 0 | 대조 실패 — 믿지 말 것 |
| 위임 트랩 | 37 | 앵커가 가리키는 파일이 프로덕션에선 다른 걸 그림 |

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
node scripts/verify-anchors.js <graph.json> "E:\2ndB" --fix <graph.json> --strict
node scripts/make-handoff.js <graph.json> "E:\2ndB" --out docs/FLOW-HANDOFF.md --json docs/flow-map.json
```

