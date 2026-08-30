# CLAUDE.md — 2nd-Brain project instructions

Project-specific guidance for Claude Code sessions in this repo.

## Project context

- **What**: 2nd-Brain — *AI 시대 가장 가치있는 자산 = 나 자신* 을 데이터로 축적하고 개인 비서로 키우는 플랫폼. 세 축: (1) 알아가기 · (2) 개인 비서 기반 · (3) 공상 → 구체화.
- **Deadline**: 없음. 외부 마감에 맞춘 스코프 압축을 하지 말 것.

> ### XPRIZE 는 종료됐다 (Simon 결정, 2026-08-15)
>
> **이 프로젝트는 더 이상 XPRIZE 출품작이 아니다.** 어떤 세션도 XPRIZE, Build with Gemini,
> Devpost, 대회 규정집(rulebook), 심사 마감, 심사자 시연을 의사결정 근거로 삼지 말 것.
> 다음은 전부 **무효한 판단 근거**다:
>
> - "마감이 N일 남았으니 축소하자" / "심사 전에 끝내야 하니" — 마감은 없다.
> - "심사자가 보기에" / "데모에서 어떻게 보일까" — 심사자는 없다. 기준은 실사용자다.
> - "대회 규정상 필요하다" / "학술 인용 가능해야 한다" — 규정은 적용되지 않는다.
>   기능은 사용자에게 쓸모가 있어서 존재해야지, 인용 가능해서 존재하면 안 된다.
>
> 코드에 남은 대회 잔재(`src/lib/judge/domains.ts`, C6 judge mode 트리거, C12 README 절,
> `db/seed.sql` 의 demo@xprize.org, `manual.tsx` 의 XPRIZE 문구, `boundary.ts`/`routing.ts`
> 주석)는 **아직 제거되지 않았다.** 동작 중인 코드이므로 임의로 걷어내지 말고, 제거는 별도
> 작업으로 Simon 과 합의해서 진행한다. 다만 이것들을 *새 결정의 근거*로 인용하지는 말 것.
> ### 제품 의도 (Simon 직접 진술, 2026-08-17) — 새 세션은 이걸 먼저 읽을 것
>
> **"사용자와 소통해서 깊게 파악하고, 그를 기반으로 심리상담(친구 같은)·개인 비서 역할을 하게 하는 것."**
>
> 구조는 네 덩어리다. 이 밖의 층을 새로 발명하지 말 것:
>
> 1. **북두칠성 7별 = 입력** — 사용자가 자기 이야기를 카테고리별로 넣는 자리.
> 2. **북극성 = 그 요약(페르소나)** — 입력이 모여 만들어지는 "이 사람은 이런 사람".
> 3. **개인 비서 화면 = 활용** — 그 페르소나를 근거로 실제로 도와주는 자리(`/ops` 계열).
> 4. **커뮤니티·채팅 = 공유** — 그 내용을 남과 나누는 자리.
>
> **데이터 방향 (Simon 정정, 2026-08-17). 이 방향을 뒤집지 말 것:**
>
> ```
>   대화 · 입력  ──▶  LLM 위키 (상세 원문)  ──▶  상세 분석  ──▶  세컨비 발화
>                          └──────────────▶  북극성 페르소나 (요약, 파생물)
> ```
>
> - **위키가 원본이고 페르소나는 그 파생 요약이다.** 페르소나는 소스가 아니다.
> - **LLM 은 페르소나가 아니라 기록·위키를 읽고 말한다.** 요약을 읽으면 정확도가 떨어진다.
>   `conversation.ts` 가 이미 `exportUserWiki` + RAG 를 읽고 있고, **그게 맞는 설계다.**
> - **"페르소나"는 LLM 이 쓸 가면이 아니다.** 사용자의 실제 생활 속에 존재하는 그 사람의
>   모습을 대화로 알아낸 것이다. 캐릭터 설정으로 오해하지 말 것.
>
> **⚠ 2026-08-17 오전에 이 파일에 "대화가 페르소나를 안 읽는 것이 1순위 결함"이라고
> 적혀 있었다. 그건 틀린 진단이었다.** 그렇게 이으면 상세 원문 대신 요약을 읽게 되어
> 오히려 나빠진다. 그 문장을 근거로 삼지 말 것.
>
> **⚠ 2026-08-19 정정 — 아래 '1순위 결함' 서술은 낡았다. 그 배선은 이어졌다.**
>
> 여기 "대화가 위키에 아무것도 안 쓴다 … 이게 이 제품의 1순위 결함이다" 라고 적혀
> 있었다. **그 문장이 쓰인 바로 그날(2026-08-17) #1224 가 그걸 고쳤다.** 실측:
>
> | PR | 날짜 | 무엇 |
> |---|---|---|
> | **#1224** | 2026-08-17 | `src/lib/chat/keep-exchange.ts` 신설 — **대화를 위키로 보내는 길.** 파일 헤더가 스스로 "대화를 위키로 보내는 길 (Simon 1순위 결함, 2026-08-17)" 이라고 적고 있다. 수동 경로("담기" 칩) |
> | **#1236** | 2026-08-18 | `src/lib/chat/autosave.ts` 신설 — 그 길을 **자동으로** 돌리는 동의 게이트 |
>
> - `src/app/secondb.tsx:39-40` — `captureFromMarkdown` · `chatAutosaveAllowed` import
> - `src/app/secondb.tsx:520-556` `keepExchange()` — 대화 한 턴을 위키로 담는다
> - `src/app/secondb.tsx:675-687` — 동의가 켜져 있으면 마지막 턴을 자동으로 담는다
>
> ⚠ 2026-08-19 에 이 정정을 처음 쓸 때 **#1236 만 지목했는데 그건 부정확했다.**
> 배선을 이은 것은 #1224 고, #1236 은 그 위에 자동화를 얹었다.
>
> 즉 **대화는 이제 흔적을 남긴다.** 위키도 페르소나도 대화로부터 자랄 수 있다.
> "대화가 아무것도 안 쓴다" 를 새 판단의 근거로 인용하지 말 것 — 사실이 아니다.
>
> **다만 기본값은 OFF 다**(`chat_autosave`, `src/lib/privacy/prefs.ts:49`).
> `privacy/prefs.ts` 의 규율(보관·프로파일링은 명시적으로 켜기 전까지 OFF)을 따른 것이고,
> 이건 결함이 아니라 의도다. 그래서 **켜지 않은 사용자에게는 여전히 대화가 휘발한다.**
> 남은 질문은 "배선이 없다"가 아니라 **"기본값을 어떻게 안내하느냐"** 다.
>
> 자동 저장은 도메인 태그를 **일부러 안 붙인다**(`secondb.tsx:536-538`) — 대화가
> 저절로 별을 밝히지 않게 하기 위해서다. 밝기의 정직성이 우선이다.
>
> 원래 문단은 아래에 보존한다. **역사 기록이지 현황이 아니다.**
>
> > ~~진짜 끊어진 곳은 반대 방향이다 — 대화가 위키에 아무것도 안 쓴다(실측).
> > `src/lib/chat/conversation.ts` 에 기록/위키 쓰기 경로가 없고, `src/app/secondb.tsx` 에도
> > `createRecord`/`captureFromMarkdown` 호출이 없다. … 이게 이 제품의 1순위 결함이다.~~
>
> `src/lib/chat/conversation.ts` 쪽 서술은 **아직 맞다** — 대화 엔진 자체는 여전히
> 읽기만 한다(`exportUserWiki` + RAG). 쓰기는 화면(`secondb.tsx`)이 한다. 그게 맞는
> 분리다: 엔진은 LLM 호출에만 관여하고, 저장 동의 판단은 화면이 갖는다.
>
> **"렌즈층"에 시간을 쓰기 전에** 여전히 확인할 것이 있다 — 세컨비가 결정을 내리는
> 자리가 `/ops` 루틴 추천밖에 없어서 "결정 필드"를 세면 전부 일정 손잡이만 나온다.
> 렌즈 개수(3이냐 7이냐) 논쟁 전에 그 편중을 먼저 볼 것. 그건 설계가 아니라 증상이다.
>
> **"심리상담"은 단어만 금지고 기능은 금지가 아니다.** `scripts/check-forbidden-lexicon.ts`가
> 임상 용어를 막는 건 임상 서비스라고 **주장**하지 않기 위해서다. 친구처럼 깊게 듣고 파악하는
> **기능 자체는 제약 없음.** UI 문자열에 그 단어를 안 쓰면 된다.

> ### 보고 형식 (Simon 지시, 2026-08-17) — 항상 HTML
>
> **Simon 에게 하는 보고는 채팅 산문이 아니라 Artifact HTML 이다.**
> 진단·설계안·결정 요청·작업 결과 전부. 채팅에는 링크와 3~5줄 요약만 남긴다.
> (한 줄 확인·즉답은 예외. 매번 만들라는 뜻이 아니다.)
>
> 그림을 최대한 쓸 것 — 인라인 SVG 다이어그램, before/after 비교, 채팅 목업, 매트릭스.
> Simon 명시 요청: "이미지와 그래프 등등 텍스트로만 설명하지 말고 직관적으로".
> 한국어 본문은 Pretendard 서브셋을 base64 인라인하고, 게시 전 헤드리스 Chrome 으로
> light/dark 양쪽을 눈으로 확인한다(다크 토큰을 `[data-theme]` 안에만 정의하면
> 시스템 기본 상태에서 깨진다). 호칭은 중립적으로.

> ### LLM 정책 (Simon 결정, 2026-08-17) — 벤더가 아니라 적합성으로 고른다
>
> **원칙 셋.**
>
> 1. **제미나이를 쓰는 것은 더 이상 중요하지 않다.** "Build with Gemini"는 XPRIZE 잔재다.
>    **그 자리에 가장 적합한 LLM 을 쓴다.** ~~Gemini 로 남길 자리는 **OCR 과 음성 텍스트화**
>    정도다(그 둘은 gemini-proxy 만 이미지·오디오 inline data 를 전달해서 기술적으로도 그렇다).~~
>
>    **⚠ 2026-08-29 정정 — 그 예외는 없어졌다. OCR·음성에 Gemini 자리는 없다.** 위 취소선
>    문장은 2026-08-17 에 쓴 것이고, 엿새 뒤 Simon 이 직접 닫았다
>    (`docs/HANDOFF.md` 2026-08-23 "Simon 결정 2건 추가"):
>    **"OCR = openai 유지 (gemini 예외 없음, 9월 전체 폐기 원안 그대로)".**
>    기술적 근거도 함께 사라졌다 — openai-proxy 가 이미지·오디오 경로를 얻었고(#1300,
>    REQ-260821-01), `EXPO_PUBLIC_MULTIMODAL_VENDOR=openai` 가 웹(저장소 Variable, 08-22)과
>    네이티브(`eas.json`, #1370) **양쪽에** 걸려 있으며, 받는 쪽 openai-proxy 배포본(v109,
>    08-24)에 `capture_ocr`·`voice_transcribe` 좌석이 실재한다(2026-08-29 배포본 실측).
>    OCR 과 음성은 **한 스위치**로 같이 움직인다(`multimodal-vendor-exit.test.ts`).
>    gemini 값이 남은 곳은 둘뿐이고 둘 다 *자리*가 아니라 *기본값*이다 —
>    `EXPO_PUBLIC_SAFETY_VENDOR`(기능 자체가 OFF) 와 각 스위치의 미설정 폴백.
>    `gemini-proxy` 가 9월까지 살아 있는 이유는 **구빌드 설치 앱의 실서빙**과 그 폴백이지
>    OCR 이 아니다.
>    이 취소선 문장을 "OCR 은 Gemini 로 남긴다"의 근거로 인용하지 말 것.
> 2. **항상 최신 모델을 쓴다.** 모델 ID 를 오래 핀해두지 말 것. 모델 선택은 **서버 소유**라
>    (claude-proxy `ANTHROPIC_MODEL` / `ANTHROPIC_PURPOSE_MODELS`, openai-proxy 동형)
>    코드 배포 없이 env 로 올릴 수 있다. 클라이언트가 보내는 `model` 필드는 무시된다.
> 3. **비용과 리즈닝 effort 를 자리마다 최적화한다.** 사다리는 이미 있다 —
>    `PHASE2_EFFORT`(low/medium/high/xhigh, `src/lib/llm/routing.ts`)와
>    `PURPOSE_TIER`(`src/lib/llm/types.ts`). 새 좌석을 추가할 때 **effort 를 반드시 명시**하고,
>    비싼 등급은 근거를 주석으로 남길 것. 기본값으로 xhigh 를 뿌리지 말 것.
>
> **실측 현황(2026-08-18 정정).** 멀티벤더 **배선**은 돼 있다 —
> `LlmVendor = "gemini" | "claude" | "openai"`, 프록시 3종 배포·키 완료.
>
> ⚠ **여기 "추론 좌석 9개가 전부 OpenAI 로 나가 있다"고 적혀 있었는데 운영에서는 사실이
> 아니다.** `PHASE2_VENDOR` 맵이 9좌석을 `openai` 로 **선언**하고 있을 뿐이고, 그 맵은
> `EXPO_PUBLIC_LLM_PHASE=2` 에서만 켜지는데 **저장소 Variable 이 `1` 이다**(2026-07-05
> 설정, `EXPO_PUBLIC_LLM_VENDOR` 는 아예 없음). Phase 1 에서 `resolveVendorForPurpose` 는
> 전부 `gemini` 를 돌려준다. *(2026-08-31 정정: 그 미설정 폴백은 이제 `openai` 다 — 아래 T1 1단계
> 블록. 이 문단의 나머지는 08-18 시점 기록.)*
>
> **원장으로 확인했다**(`ai_audit_log`, 2026-08-18): 전체 행에서 `reasoning_vendor` 가
> **`gemini` 아닌 행이 0건**이다. `ops_recommend` 25 · `ops_daily_brief` 12 ·
> `self_model_propose`/`northstar_propose`/`axis_estimate` 각 6 — 전부 gemini.
> 즉 **OpenAI·Claude 로 나간 실호출은 아직 한 건도 없다.**
>
> 그래서 "Phase 2 를 켜면 대화만 옮겨진다"가 아니다 — **PHASE=2 를 켜는 순간 한 번도
> 운영에서 돌아본 적 없는 9좌석이 동시에 OpenAI 로 넘어간다.** 그게 이 정정의 실질적
> 의미다. 어느 벤더가 처리했는지는 `ai_audit_log.reasoning_vendor`(0095)에 남는다.
>
> **아직 Gemini 인데 옮겨야 할 자리:** `secondb_chat`(세컨비 대화). claude-proxy 에는
> **이미 `secondb_chat: 'claude-sonnet-5'` 좌석이 설정돼 있는데 라우팅이 안 붙어 있다.**
>
> ⚠ **여기 적혀 있던 "claude-proxy 스트리밍 미구현이 막고 있다"는 틀린 진단이었다
> (2026-08-18 실측).** 이 저장소에는 **스트리밍이 아예 없다** — `callLlm` 은
> `Promise<LlmResult<T>>` 를 돌려주고 `conversation.ts` 가 한 번 `await` 할 뿐이며,
> gemini-proxy 에 SSE 경로가 없고, `generateContentStream`·`streamGenerateContent`·
> `text/event-stream`·`EventSource`·`getReader()` 전부 **0건**이다. 대화 화면도 부분
> 렌더를 하지 않는다. 즉 대화는 **이미 비스트리밍 프록시 홉을 타고 있다.**
> 스트리밍을 구현해도 풀리는 것이 없다 — 막혀 있질 않기 때문이다.
>
> **[Simon 결정 2026-08-18] 대화는 Claude 가 아니라 OpenAI 로 간다.** "일단 gpt 쪽으로
> 가는게 좋아보여. 하지만 나중에 다시 선택할 여지를 남겨두자."
>
> 그래서 대화에 **전용 스위치**를 뒀다 — **`EXPO_PUBLIC_CHAT_VENDOR`**
> (`gemini`(기본·미설정) / `openai` / `claude`). `PHASE2_VENDOR` 에 넣지 않은 이유는
> 위 정정 그대로다: 그 맵은 PHASE=2 에서만 켜지고, 그걸 켜면 대화만이 아니라 9좌석이
> 같이 넘어간다. 목적 하나에 변수 하나면 **켜는 것도 되돌리는 것도 한 값**이고, 그게
> Simon 이 말한 "다시 선택할 여지"다. 코드 수정 불필요.
>
> ⚠ **순서를 지킬 것 — 배포가 먼저, 플립이 나중.** openai-proxy 는 허용목록 밖 purpose 를
> **아무것도 하기 전에** `400 purpose_not_seated` 로 자른다. 이 변경이 넣은
> `secondb_chat` 좌석은 **함수를 재배포해야** 생긴다. 변수를 먼저 켜면 대화가 전부 실패한다.
> (0127/0130 마이그레이션과 같은 함정이다.)
>
> 모델은 `gpt-5.4` 로 두되 **비용 조절은 effort ceiling `low`** 가 한다(대화는 추론
> 좌석이 아니라 최다 호출 표면). 더 싼 티어는 재배포 없이 `OPENAI_PURPOSE_MODELS` 로
> 바꿀 수 있다 — 단 모델 ID 존재 확인 후.
>
> Claude 로 가고 싶어지면 `EXPO_PUBLIC_CHAT_VENDOR=claude` — claude-proxy 에는
> `secondb_chat: 'claude-sonnet-5'` 좌석이 **이미 있다.** 단 Anthropic 크레딧이 있어야
> 한다(2026-07-06 소진 이력).
>
> **경계 모듈은 `src/lib/llm/boundary.ts` 다** (2026-08-17 `gemini.ts` 에서 개명. 함수도
> `callGemini` → `callLlm`). **모든 LLM 호출이 지나는 단일 지점**이고 감사 기록(C3)과
> 안전 분류(C9)가 전부 여기 걸려 있다. **지우거나 우회하지 말 것.** 벤더 선택은
> `routing.ts` 가 한다.
>
> 개명한 이유는 이름이 사실과 달라서다 — 이 모듈은 gemini·claude·openai 세 벤더를
> 모두 태우는데 한 벤더 이름을 달고 있었고, 그 이름 때문에 "우리는 Gemini 앱"이라는
> 오해가 세션마다 재생산됐다.
>
> **⚠ 2026-08-31 T1 1단계 — 미설정 기본값이 더는 Gemini 로 떨어지지 않는다.** `routing.ts` 의
> `RETIRED_DEFAULT = "openai"` 가 미설정 스위치 11곳의 착지점이고 failover 미설정은 `"none"` 이다.
> `"gemini"` 는 **명시값으로만** 살아 있다(콘솔이 `gemini-proxy` 를 지우기 전까지의 되돌리기 수단).
> 원장 기준 마지막 실제 Gemini 호출은 2026-08-24 07:31 KST 다. 남은 순서·결합 조건은
> `docs/LLM-VENDOR-PLACEMENT.md` "9월 폐기 체크리스트" · 전체 잔재는 `docs/GEMINI-RETIREMENT-INVENTORY.md`.
> 아래 "Phase 1 = 전부 gemini" 서술은 그 이전의 사실이다.
>
> **반대로 아직 `gemini` 인 채로 두는 것들은 일부러 그렇다:**
>
> - `supabase/functions/gemini-proxy` — **이름이 맞다.** claude-proxy·openai-proxy 와
>   나란한 **벤더별** 프록시다. ~~Gemini 는 OCR·음성 텍스트화에 계속 쓴다.~~
>   (2026-08-29 정정: OCR·음성도 openai 로 옮겨졌다 — 위 원칙 1 의 정정 참조. 이 함수가
>   9월 폐기 전까지 살아 있는 이유는 구빌드 설치 앱이 아직 이 이름으로 호출하고, 각 스위치의
>   미설정 폴백이 아직 이 이름이기 때문이다.)
> - `bump_gemini_spend` · `gemini_spend_daily` — 이름은 **틀렸다**(세 벤더 공용 지출
>   한도다). 그런데 설치된 앱과 프록시 3종이 이 이름으로 호출하고, 계정 삭제·내보내기
>   경로도 이 테이블을 참조한다. 개명은 호환 래퍼를 낀 마이그레이션이 필요한 별도 작업이다.
>   **혼자 바꾸지 말 것.**
> - `"gemini" | "claude" | "openai"` 같은 벤더 식별 문자열, `EMBED_MODEL` 의 실제 모델
>   ID — 전부 실제 이름이라 그대로다.
>
> **인용 금지:** "우리는 Gemini 앱이다" · "C2 가 Vertex 를 요구한다" · "Gemini 로 해야 한다".
> `docs/` 아래 여러 문서(`ARCHITECTURE.md`·`LLM-ROUTING.md`·`CONSTRAINTS.md` 등)에 남은
> Gemini 서술은 **역사 기록**이다. 충돌하면 이 절이 이긴다.

- **Stack**: React Native + Expo SDK 56, TypeScript strict, Supabase (Postgres + Auth), Gemini via `@google/genai`, EAS Build, GitHub Actions.
- **Web deploy target — GitHub Pages, NOT Vercel.** `.github/workflows/web-deploy.yml` pushes the
  Expo static export to the `gh-pages` branch; live at <https://simon-yhkim.github.io/2nd-B/>, and
  `app.json` pins `baseUrl: "/2nd-B"` to that subpath. A Vercel project is still connected and
  builds PRs, but nothing ships from it and the `baseUrl` makes a Vercel root deploy wrong. Root
  `vercel.json` is an unused Sprint-0 leftover. Do not treat Vercel as the web target.
- **Solo build**: Simon Kim. Evenings + weekends only.
- **Vision**: `docs/VISION.md` (캐치프레이즈 + 3축 모델). 모든 새 기능은 어느 축에 속하는지 PR 설명에 명시.
- **Master blueprint**: `docs/ARCHITECTURE.md`. Hard constraints C1~C12: `docs/CONSTRAINTS.md`.

## ⚠ 일곱은 이제 한 벌이다 (Simon 결정 7, 2026-08-24) — 아래 "렌즈층" 절보다 **이 절이 이긴다**

**렌즈층은 별 안으로 들어갔다.** Simon 원문: *"앞으로 별, 렌즈 이런거 구분하지 말고
기능을 통합하도록 하자. 햇갈려."* 만든 사람이 헷갈리면 쓰는 사람은 못 쓴다.

계기는 Simon 이 직접 물은 것이다 — *"지금 렌즈가 맞는거야 별이 맞는거야? 기존에 있는
커리어, 성장 이런거는 뭐야?"* 저장소에 **"일곱"이 세 벌** 있었기 때문이다:

| | 무엇 | 어디에 있었나 | 지금 |
|---|---|---|---|
| ① | 도메인 별 (커리어·재정·성장·관계·건강·휴식) | 홈에 **보이던** 것 | 세컨비 **대시보드**로 내려갔다 |
| ② | 자기이해 축 (`persona/stars.ts`) | 북극성 밝기를 계산하던, 화면에 **없던** 것 | **검증층**으로 남았다 (별 아님) |
| ③ | 렌즈 (`lib/lenses/registry.ts`) | ②를 대체하려던 것 | **휴면.** 별 안으로 들어갔다 |

### 정본: `src/lib/persona/seven-stars.ts`

**별 = 나를 알아가는 자리.** 그뿐이다.

| # | 별 | 시기/주제 |
|---|---|---|
| 1 | 프로필 `profile` | 가입 정보·기본 개인정보 (인터뷰 없음) |
| 2 | 영유아기 `infancy` | 0~6 |
| 3 | 학창시절 `school` | **7~19** |
| 4 | 20대 `twenties` | 20~29 |
| 5 | 30대 이후 `later` | 30~ |
| 6 | 직장 `work` | 나이 무관 |
| 7 | 지금 `now` | 나이 무관 |

⚠ Simon 원안은 학창시절이 7~**18** 이라 **19세가 어느 칸에도 없었다.** 7~19 로 닫았다
(한국에서 19세는 고3·재수·대학 1학년). `interview/__tests__/periods.test.ts` 가 나이
경계에 구멍이 없는지를 **검사로** 지킨다.

**겹침을 막지 않는다.** [결정 1] *"30대든 20대든 10대든 얼마든지 직장 내용은 겹칠 수
있어."* 별을 재료로 가르지 않고 **질문의 결**로 가른다 — 같은 서른다섯 살 이야기라도
시기 별에서는 *그때 어떤 사람이었나*, 직장 별에서는 *일하는 나*를 묻는다.

### 밝기 = 판 만큼

그 자리에서 다섯 층(fact→feeling→meaning→belief→echo) 중 몇 층을 열었는가.
`interview_coverage` 가 센다(0143). **커버리지로는 L4 가 최대고, L5 는 비준으로만 온다.**

### ⚠ `now` 가 두 체계에 다 있다 — 원장에서 반드시 갈라 쓸 것

옛 자기이해 축의 `now` 는 "지금의 나"(Big Five 특성 상태)이고 새 별의 `now` 는
"지금"(현재의 나를 알아가는 자리)이다. **글자가 같고 뜻이 다르다.**
`star_tier_history.star_id` 는 제약 없는 text 라 섞이면 **예외도 안 나고 화면도 안 죽고
그냥 틀린 숫자가 뜬다.** 새 체계는 **`seven:` 접두사**를 달고 쓴다
(`persona/seven-tier-history.ts`). 접두사를 떼지 말 것.

### 진입 경로 (결정 4·6)

- **별을 누르면** → `/me/<star>` 요약이 먼저 열린다. 바로 인터뷰로 던지지 않는다.
- **세컨비 머리를 터치하면** → `/secondb?panel=dashboard`. 생활 여섯 영역이 **대화창
  안에** 펴진다. `/star/<domain>` 은 그대로 살아 있다(자세히 보기).

### 지우지 말 것

- **`persona/stars.ts`** — `now`·`relational`·`values` 셋은 실제 측정 도구(BFI/IPIP/
  ECR-S/가치)가 붙어 있고 **propose→ratify 가 그 위에 서 있다**(`ratifiable.ts`).
  지우면 사용자가 "그건 아닌데요" 라고 말할 자리가 사라진다. 나머지 넷
  (recall·seen·rhythm·possible)은 감사에서 걸린 쪽이니 **새 판단의 근거로 인용만 하지 말 것.**
- **`lib/lenses/*`** — 휴면. 관문 5개와 자율도 L1~L3 정의가 여기 있고 그 규율은 계속 쓰인다.
  ⚠ `LensId` 에도 `profile` 이 있다. 되살리는 사람은 접두사부터 정하고 시작할 것.

### 남은 것 — 2026-08-25 갱신

**L5 비준 경로는 열렸다(#1384).** 여기 "아무도 L5 에 갈 수 없다"고 적혀 있던 것은
2026-08-25 에 해소됐다 — 두 층 이상 판 시기 별에 세컨비가 그 시기의 인터뷰 원문을
근거로 "그때의 나" 요약을 제안하고, `/review` 에서 비준하면 `recordSevenTiers`
(origin `ratify`, `seven:` 접두사, `record:<id>` 인용)로 원장에 남아 홈 밝기가 L5 로
오른다. 재료는 `persona/seven-proposal-context.ts`(문턱 `SEVEN_RATIFY_MIN_CELLS=2` —
낮추면 사건 목록으로 사람을 지어내게 된다). ⚠ 새 별 비준 쓰기에 `recordStarTiers`
재사용 금지(옛 마일스톤 오염) — `seven-ratify-path.test.ts` 가 변이 검증으로 지킨다.
운영 `ratify` 행 기준선 0 — 여기서부터 새 계기다.

PRD 는 **Draft v4**(#1385, 2026-08-25)가 정본이다 — 일곱 한 벌·화면 카탈로그 72종·
새 KPI. `docs/CONSTELLATION-DESIGN.md` 는 역사 기록 배너가 붙었다. Claude Design
재발주 프롬프트는 `design/CLAUDE-DESIGN-BRIEF-260825.md`.

세컨비 → 허슬케이 개명은 구조가 자리 잡은 뒤로 미뤘다(Simon 명시). 앱 이름(Polar
Scope 검토 → 충돌 2건 검증됨, Merak 등 대안 후보)과 **한 체계로 함께** 결정한다.

---

## (역사 기록) 렌즈층 재정의 (Simon 결정, 2026-08-15) — **개수 해소됨 2026-08-21: 7개, 착수 가능**

> ⚠ **아래는 2026-08-24 결정 이전의 서술이다.** 렌즈 7개 표(때·크기·복귀·묻기·담기·꺼내기·프로필)는
> 더 이상 정본이 아니다. 위 절이 이긴다. 관문 5개와 자율도 L1~L3 의 **정의**는 여전히 유효하다.

**감사 결과 확정된 사실:** 기존 7렌즈의 숫자 7은 심리학이 아니라 **북두칠성 별 개수**에서 왔다
(Simon 원본 메모 `git show c7f36982:260617생각정리.txt` 가 "7가지 축으로 가려고 해"로 개수를 먼저
선언하고 "현재 북두칠성의 6번째, 7번째가 비어있음. 고민 필요"로 끝난다). 7개 중 5개의 등급이 구인이
아니라 "행이 들어왔는가 / 몇 번 눌렀는가"를 쟀다. 상세: `docs/HANDOFF.md` 및 세션 보고서.

### 새 정의 (정본)

> 렌즈층은 나를 재는 층이 아니라, **세컨비가 나를 대신해 결정을 내릴 때 채워야 하는 파라미터를
> 나에게 맞게 굴절시키고, 그 굴절이 맞았는지를 내 행동 원장으로 채점받는 층**이다.
> 렌즈 하나 = 세컨비가 반복해서 채우는 **결정 필드 하나를 독점하는 추정기**.

렌즈 자격 = 관문 5개 전부 통과. ① **슬롯**(바꾸는 필드가 코드에 실재. 프롬프트 형용사 한 줄은 불인정)
② **반전**(값을 뒤집으면 화면이 달라진다) ③ **채점**(LLM 없이 기존 원장으로 적중 판정 가능)
④ **관측 우위**(물은 값보다 관측한 값이 정확. 진술이 더 정확하면 렌즈가 아니라 **설정**)
⑤ **귀속**(두 렌즈가 같은 필드를 다투지 않는다).

**관문 통과 결과는 3개(때 · 크기 · 복귀)였다. 그러나 Simon 이 2026-08-16 발주서 G3 에서
`렌즈 7개`를 선택했다(추천안에서 명시적으로 [변경]).** 이 절의 나머지(렌즈의 정의, 관문 5개,
L1~L3 자율도 등급)는 개수와 무관하게 유효하다.

### ✅ 개수 해소 (Simon 결정 2026-08-21) — 7개, 그리고 **착수 금지는 풀렸다**

여기 있던 "미해소 긴장 / 착수하지 말 것" 문단은 **해소됐다.** 선택지 셋 중 **②(새 후보를
발굴해 7을 채운다)** 로 갔다. 원문: *"b 로 진행하고, 마지막 7은 사용자 프로필을 띄울꺼야."*

**관문은 하나도 완화하지 않았고, 탈락한 다섯도 되살리지 않았다.** 대신 조사에서 나온 사실이
길을 열었다 — 관문을 통과한 셋(때·크기·복귀)이 하필 `OpsRecommendation` 의 필드 셋과
정확히 같았다. 즉 **"3"은 사람을 잰 수가 아니라 세컨비가 결정을 내리는 자리가 `/ops`
하나뿐이라는 사실의 그림자**였다. 그래서 렌즈를 `/ops` 밖으로 내보내 새 자리에서 넷을 찾았다.

**정본은 문서가 아니라 코드다: `src/lib/lenses/registry.ts`.**
`registry.test.ts` 가 관문 ①③⑤ 를 **실행 가능한 검사**로 지킨다 — 특히 ①은 각 렌즈의 필드
선언이 지목한 소스 파일에 **실제로 있는지 읽어서** 확인하므로, 슬롯이 사라지면 빌드가 깨진다.

| # | 렌즈 | 독점 필드 | 자리 | 슬롯 |
|---|---|---|---|---|
| 1 | 때 `when` | `startsAtIso` | `ops_recommend` | 있음 |
| 2 | 크기 `size` | `durationMinutes` | `ops_recommend` | 있음 |
| 3 | 복귀 `return` | `recurrence` | `ops_recommend` | 있음 |
| 4 | 묻기 `ask` | `layer` (`DrillLayer`) | `interview_probe` · `nextLayerSuggestion` | 있음 |
| 5 | 담기 `file` | `domain:` 태그 | `clipper_classify` · `import_ingest` | 있음 |
| 6 | 꺼내기 `resurface` | (미정) | `digest_weekly` · `ttfv_first_insight` | **없음** |
| 7 | **프로필** `profile` | `target` (`ProposalTarget`) | `self_model_propose` · `northstar_propose` | 있음 |

⚠ **꺼내기는 아직 켜지 말 것.** `digest_weekly`/`ttfv_first_insight` 는 purpose 로 선언만 돼
있고 `src/lib` 안에 **호출부가 0건**이다(실측 2026-08-21). **슬롯이 먼저고 렌즈가 나중이다** —
바꿀 것이 없는 추정기를 켜는 것이 원래 7개가 저지른 실수 그 자체다.

**자율도 L1~L3 은 `src/lib/lenses/autonomy.ts`.** 오르는 유일한 경로는 예측 적중(연속 3회),
되돌리면 즉시 강등, 빗나감(miss)은 강등이 아니다. **호출 횟수로는 절대 오르지 않는다** —
그게 감사에서 걸린 원래 문제다.

**감사에서 확인된 사실은 결정과 무관하게 그대로다:** 원래의 7 은 심리학이 아니라 북두칠성
별 개수에서 왔고, 7개 중 5개의 등급은 구인이 아니라 입력 횟수를 쟀다.

등급 L1~L3 은 "내가 나를 아는 양"이 아니라 **"이 결정을 세컨비가 혼자 정해도 되는 정도"**다
(L1 매번 묻기 → L2 선택지 두 개 → L3 기본값 채워 오기). 오르는 유일한 경로는 예측 적중이고,
사용자가 되돌리면 자동 강등된다.

### 확정된 부수 결정

- **세컨비 = 개인 매니저.** `src/lib/chat/conversation.ts` 의 `SYSTEM_PROMPT_HEADER` 가 못박은
  "비서나 동반자, 친구가 아니라 자기 자신의 종합" 불변식을 **Simon 이 뒤집기로 승인했다(2026-08-15)**.
  이 문장을 매니저 프레이밍으로 재작성해도 된다. 단 근거 없는 단정 금지·임상어휘 금지·과잉
  자기지식 주장 금지는 **그대로 유효**하다(anti-anthro CI 가드는 로케일 JSON 만 스캔한다).
- **`star_tier_history` 의 기존 7종 star_id 행은 새 렌즈로 재매핑한다**(Simon 결정: "어차피 테스트로
  임의로 만든 것"). 폐기가 아니라 재매핑이다.
- **북두칠성 ↔ 북극성 연속성은 렌즈와 무관하게 그대로다.** 캐논에 이미
  `polarisGuide: "M230,131 L228,90 L140,-16"` 이 있고 이는 실제 지극성(Merak→Dubhe→Polaris)
  경로다. ⚠ **2026-08-19 정정: 그 선은 화면에 그려지고 있다.** `canonPolarisGuide`
  **상수**를 읽는 코드가 0건인 것이지, 선이 없는 것이 아니다 —
  `src/components/deep-space/ConstellationHome.tsx:85,646` 이 `finance→career→POLARIS` 를
  점선(45% 알파)으로 그리고, 좌표가 캐논 문자열과 **숫자까지 같다**. 다만 캐논에서
  읽지 않고 로컬 상수에서 다시 계산하며, 파리티 테스트도 별 좌표만 보고 선은 안 본다.
  즉 문제는 "안 그린다"가 아니라 **"캐논과 따로 논다"**이다. 렌즈는 별이 아니라
  **이 선 위의 보정**이다. 새 별을 추가해 연속성을 만들려 하지 말 것.

## 미성년 개방 — 2026-08-16 결정 상태

Simon 이 결정 콘솔로 항목별 판단을 냈고, 외부 법률·시장 조사(WebSearch 7주제)로 검증했다.

### 확정 (그대로 진행)

- **안전장치 3레인 채택.** 자살·자해 = 상담(미성년 1388→109 / 성인 109), 진행 중 신체 응급 = 119,
  타인에 의한 급박한 위협 = 112(미성년은 1388·117 병기). **자살 레인에 112 를 붙이지 말 것.**
  판정이 애매하면 항상 상담 레인으로 폴백. 학교폭력 117, 성폭력 1366.
- **"범죄 낌새"는 위해(harm) 축으로 재정의.** 앱은 "누가 범죄자인가"를 판단하지 않고
  "지금 누군가의 안전이 위험한가"만 본다. 피해 진술에만 안내, 가해 판정·자수 권유 배제.
- **표현 규율.** UI·스토어·마케팅에서 "감지"·"보호"·"모니터링" 금지. 사실 서술만.
  약관에 "응급 서비스가 아니며 대신 신고하지 않는다" 신설.
- **AI 능력·자동 리즈닝은 미성년에게 그대로.** (원래 연령 불변이라 풀 것이 없다.)
- **건강·이메일 임포트 타일 불일치는 열고 문서 정렬** 방향으로 해소.
- **리워드 광고는 서버 연령 검증 먼저, 그다음 개방.**
- **현행 불일치 즉시 정렬 + 동의 인프라 정비**를 개방 여부와 무관하게 진행.
- **라벨링(검사 6종 정직성 라벨)은 보류.** 렌즈 구조·역할 확립이 우선.

### 2026-08-16 F그룹 재결정 결과 (확정)

- **F1 미성년 개인화 광고 → 18세 미만 차단 유지.** `src/lib/ads/policy.ts:58,95` 그대로.
  광고 런치 시 TFAT 마이그레이션만 추가.
- **F2 상시 녹음 → 반려.** 로드맵에서 제외. 재론 금지.
- **F3 통화녹음 → 파일 업로드 경로로 전환.** Simon: "현재 통화녹음 파일 업로드 할 수 있는
  상태인데, 정확하고 확실한 퍼포먼스를 낼 수 있도록 보완 작업만 하자."
  **⚠ 사실 정정: 그 기능은 현재 없다.** `src/app/call-reflection.tsx` 는 `useAudioRecorder` 로
  **기기 마이크 직접 녹음**(스피커폰)이고, `src/lib/import/file-read.ts` 의 `NATIVE_ACCEPT_MIME`
  은 텍스트 계열만 받아 오디오 MIME 이 없다. 즉 보완이 아니라 **신설**이다.
  다만 부품은 있다(`expo-document-picker` 설치됨 · `transcribeAudio` · `recordingUriToBase64`).
  그리고 이 방식이 현재 마이크 방식보다 **법적으로 안전**하다 — 앱이 녹음하지 않으므로
  Play 의 서드파티 통화녹음 금지와 무관해진다.
- **F4 미성년 건강 → 별도 동의 갖추고 전부 수집.** 3종 전제: PIPA 제23조 별도 동의 UI(거부해도
  앱 사용 가능) + **광고·분석 스택과 물리적 분리**(Apple 5.1.3(i)·Google Health Permissions 가
  건강데이터의 광고 전용을 금지하고 우리는 성인 광고를 켠다) + 처리방침 §1 개정.
  Q1 자문 회신이 선행 조건.
- **F5 미성년 결제 → 열되 보호장치 갖춤.** ⚠ 단 "법정대리인 사전 동의 게이트"를 넣으면
  Simon 의 "14세 이상 평등" 원칙과 충돌한다. 최소안(카카오 약관 제11조식 **고지**만)이
  평등 의도와 가장 잘 맞는다. 어느 강도인지 Simon 확인 필요.
- **F6 EU 연령 → 국가별 표 구현.** ⚠ **선결 조건: 국가 신호가 없다.**
  `src/lib/auth/consent-age.ts:8-10,43-46` 이 스스로 적어놨다 — "does not yet collect a reliable
  jurisdiction signal (locale en/ko is not a country)". 후보는 SIM 지역 / IP 지오 / 프로필 필드 /
  스토어 계정 국가. 이걸 먼저 정해야 표가 의미를 갖는다. GDPR 제8조 국가별 표의 1차 출처가
  2021년 스냅샷이라 재확인도 필요.

### 외부 조사 근거 (뒤집힌 배경)

- **미성년 개인화 광고**: 한국 *법률*로는 위법이 아니지만 **Google Ads 정책이 18세 미만
  개인 맞춤 광고를 계약으로 금지**한다(2022-08-15 시행). 위반 결과는 과징금이 아니라
  계정 정지·수익 몰수. `src/lib/ads/policy.ts:58,95` 의 fail-closed 미성년 차단을
  **되돌리지 말 것.** 광고 런치 시 deprecated 된 TFUA/TFCD 대신 **TFAT** 을 쓴다.
- **상시 녹음(화면 꺼도 지속)**: 통비법 제3조 위반 시 제16조 제1항 **1년 이상 10년 이하 징역,
  벌금형 없음.** 대법원 2020도1538(2024-01-11)이 정확히 같은 구조를 유죄로 봤다.
  게다가 iOS·Android 모두 **백그라운드에서 녹음을 시작할 수 없어** 구현 자체가 불가능하다.
  우리 `docs/CALL-RECORDING-SPEC.md:32` 가 이미 "No ambient/mic-spy mode" 로 결론냈다.
  **제안하지도, 착수하지도 말 것.**
- **통화녹음**: Android 는 Play 정책상 서드파티 금지(2022-05-11), iOS 는 공개 API 부재.
  이미 구현된 `src/app/call-reflection.tsx`(통화 직후 회고)가 이 영역의 최종 형태다.
- **미성년 건강 "전부 수집"**: 삼성 헬스 논거는 성립하지 않는다(삼성도 민감항목은 별도 동의로
  분리). Apple 5.1.3(i)·Google Health Permissions 가 건강데이터의 광고·분석 전용(轉用)을
  금지하므로 광고 스택과 물리적 분리가 전제. Strava 는 16세 미만에게 심박 항목 자체를 끈다.

### 지금 실제로 뚫려 있는 구멍 2건 (개방 결정과 무관하게 시정)

- `src/lib/billing/`·페이월에 **`isMinor` 게이트가 없다.** 미성년이 지금 결제 가능하고,
  민법 제5조 취소권은 제146조상 **최장 8년** 남는다(만 14세 결제 기준).
- `src/lib/auth/consent-age.ts:55 resolveJurisdiction()` 이 **항상 "KR" 을 반환**해
  `DIGITAL_CONSENT_AGE` 의 EU=16 값이 프로덕션에서 한 번도 쓰이지 않는다.
  배포를 넓게 유지하기로 했으므로 EU 16세국의 14~15세가 무효 동의로 가입 가능한 상태다.

### 여전히 미결 (건드리지 말 것)

미성년 건강 OS 연동 · 통신/위치 임포트 · 커뮤니티 채팅 · Clarity · 미성년 결제 ·
EU 최소 가입연령 상향. 확정 전까지 해당 게이트(prefs 클램프, RLS, `reject_minor_*` 트리거,
커뮤니티 성인 한정)를 **임의로 풀지 말 것.** Simon 은 "L1 고정 같은 회피책"을 명시 거부했으므로
그 방향 제안도 금지.

## QA test account — AI agents: sign in and test freely

A shared test account is **committed** so any AI agent (local, cloud, or headless) can
sign in and exercise the real app during QA. **Reuse it — do not create another.**

- **Credentials**: `.env.test` (committed at repo root) → `QA_TEST_EMAIL` / `QA_TEST_PASSWORD`.
- **Account**: `qa.ai.b18807@example.com` — email/password sign-in, free tier, adult, `judge_mode=false`, RLS-isolated (only its own rows).
- Disposable and non-secret (the Supabase anon key is already public). Revoke anytime by deleting the user in Supabase Auth. Real secrets (service_role, API keys, `.env`) still never go in git.
- To test paywalled features, set `EXPO_PUBLIC_FORCE_TIER` in `.env` (e.g. `brain` unlocks everything) — the account itself stays free.

## Canonical concept & direction (read first)

The concept and direction is **deep-space constellation** (a character-led home shell). The
canonical concept SoT is **`docs/PRD.md` (Draft v3)**; the detailed model spec is
**`docs/CONSTELLATION-DESIGN.md`**; **`docs/CONCEPT.md`** names canonical vs legacy. Read these
before any concept, IA, or visual decision. Canonical model = **3-layer 별자리**: A) 7 DOMAIN
stars (커리어·재정·성장·관계·건강·휴식·담아내기 = input; 담아내기 is a DATA domain that is
NOT drawn on home, so the home constellation shows 6 domains + 뮤지엄), B) the psychological constructs in
`stars.ts` (the hidden validation layer behind the output — NOT home stars), C) 북극성 (Polaris)
= the aggregate output / persona synthesis (drop the "Soul Core" name; **the ROUTE is `/core-brain` and it is LIVE** — the file's own header says "user-facing name is 북극성", home's Polaris tap and the deep-space `lens` dock slot both point at it. Only the *name* Core Brain / Soul Core is legacy, never the screen) + the L1~L5 brightness
ladder + propose->ratify.

**LEGACY (rollback skin only, never the reference for new work):** the gameboy track, the
*Cosmic Pixel Graph Village* system, *phytoncide* tokens, *Brain Trinity* naming, **the "Soul
Core" name, the 5 Pattern Core layer + Pattern Tesseract, the village graph `/graph` +
`/trinity`, the v3 tesseract art, the character voices (아치/가디/루루/모모/루미),
and the old 4-tier Visual Tier node-names** (Soul Core 128px / Pattern Core x5 / snowflake /
crystal). Preserved behind `EXPO_PUBLIC_UI=legacy`; superseded concept docs remain in git history.

## The 12 hard constraints

Never weaken these. They're enforced at code/schema/CI level:

| ID | Rule |
|---|---|
| C1 | All LLM calls go through **one boundary module** (`src/lib/llm/boundary.ts`, renamed from `gemini.ts` 2026-08-17); ESLint blocks vendor SDK imports anywhere else. **The rule is the single boundary, NOT the vendor** — see "제미나이는 더 이상 요건이 아니다" below. |
| C2 | ~~`@google/genai` with `vertexai: true`~~ **대회 잔재. 요건 아님.** Vertex 분기는 코드에 남아 있고 CI가 존재만 확인한다. 새 기능의 근거로 인용 금지. |
| C3 | `ai_audit_log` INSERT on every Gemini call (including mock + crisis). |
| C4 | `revenue_events` has `month_bucket` + `is_related_party` + `customer_relation_type`. |
| C5 | `testimonials.consent_given_at NOT NULL`. |
| C6 | Judge mode auto-flag for `@xprize.org`, `@devpost.com`, `@hacker.fund`. **(대회 잔재: 코드·CI 에서는 계속 유효하니 깨뜨리지 말 것. 단 새 기능의 근거로 인용 금지 — 위 XPRIZE 블록 참조.)** |
| C7 | i18n EN ↔ KO key parity. EN is canonical. |
| C8 | `knowledge_sources` requires DOI/URL + verification pair. |
| C9 | `classifyInput()` runs before any LLM call. Red zone short-circuits. |
| C10 | Age-tiered sign-up: 14-17 self-consent minors and adult users register direct; under-14 needs verifiable guardian consent (PIPA §22-2/COPPA). Phased rollout; see docs/CONSTRAINTS.md. |
| C11 | Support SLA = 2 business days (KST). |
| C12 | README "Pre-existing assets used" section per rulebook §04. **(대회 잔재: 위 C6 과 동일 취급.)** |

When uncertain whether a change weakens a constraint, run `npm run check:constraints`.

## Vocabulary policy (blueprint §3)

This is **not** a mental-health, therapy, or wellness app. Avoid clinical terminology in all surfaces (code, UI strings, comments, docs).

- **Forbidden** (CI-enforced via `scripts/check-forbidden-lexicon.ts`): mental health, therapy, counseling, diagnosis, treatment, healing, cure, 정신건강, 심리치료, 심리상담, 치유, 우울증.
- **Use instead**: self-understanding, growth, reflection, self-knowledge, 자기 이해, 성장.

The single source of truth for both runtime classification and CI scan is `src/lib/safety/lexicon.ts`.

## Design system

> ### ACTIVE MIGRATION (2026-08-19) — M3-deepspace → **PIXEL-CLAY v4**
>
> **Simon 결정 2026-08-19 (결정 콘솔 V1): 시각 방향은 PIXEL-CLAY v4 다.**
> SoT = **`docs/PIXEL-CLAY-MIGRATION.md`**. 인수 자료 = `design/pixel_clay_v4/`
> (프로토타입 · 디자인 시스템 번들 · 실제 화면 12장). **착수 전에
> `design/pixel_clay_v4/REPO-NOTES.md` 를 먼저 읽을 것** — 받은 문서와 저장소가
> 어긋나는 곳 6건과 이식 함정 5건이 실측으로 적혀 있다.
>
> **개념은 그대로다** (별자리 · 북극성 · 북두칠성 7별 · 정직한 밝기 L1~L5 ·
> propose→ratify · 세컨비). 바뀌는 것은 시각 체계뿐이다 — "레이아웃 자유, 의미 고정".
>
> 여섯 항목이 정반대로 뒤집힌다: 폰트 Roboto/Pretendard → **Galmuri** · 라운드
> 4~28 → **0** · 불투명도 rgba → **디더/색 밴딩** · 이징 M3 곡선 → **`steps()`** ·
> 도형 자유 → **정수 `rect`** · 깊이 그림자/블러 → **4방향 베벨 + z-index**.
>
> ⚠ **이름 세 개를 갈라 부른다 (V5). "픽셀" 단독 사용 금지:**
> **cosmic-pixel** = 폐기된 원래 스킨 (`EXPO_PUBLIC_UI=legacy` 롤백으로만 생존) ·
> **M3-deepspace** = 지금 배포돼 있는 것, 이주의 **출발점** ·
> **PIXEL-CLAY v4** = 이주의 **목적지**.
> cosmic-pixel 과 PIXEL-CLAY v4 는 둘 다 픽셀아트지만 **같은 물건이 아니다.**
> "레거시 픽셀이니까 버린다" 는 논증을 PIXEL-CLAY v4 에 적용하지 말 것.
>
> **이주는 아직 착수 전이다.** 화면이 PIXEL-CLAY 로 옮겨지기 전까지는 그 화면에
> **아래의 현행 M3-deepspace 규칙이 그대로 적용된다.** 토큰을 혼자 바꾸지 말 것 —
> `src/lib/canon/__tests__/canon-tokens.test.ts` 가 현행 팔레트 값을 박아두고 있어서
> 캐논 JSON 과 같은 PR 에서 함께 바꿔야 한다.
>
> `docs/REV2-MIGRATION.md`(목적지가 M3 였던 계획)는 **이 결정으로 대체됐다.** 역사 기록이다.

**Read `docs/CONCEPT.md` (concept/direction) and `DESIGN.md` (visual discipline) before any visual or UI decision.** DESIGN.md's Cosmic Pixel Graph Village is the legacy skin; deep-space visuals use `deepSpace.*` tokens + `docs/deep-space-nav-contract.md`. Font, color, spacing, and aesthetic rules are defined there.

**Canonical reference design (always honor): `design/proto_rev2/reference-app/`.** The rev2/M3
canon is the reference app there — `m3-theme.css` (tokens) plus `data/index.json` +
`data/{app,core,screens}/*.json` (per-screen spec). It is not a document you read and reproduce by
hand: **the code already consumes it.** `src/lib/canon/` loads those JSONs, 13 source files import
them, and `src/lib/canon/__tests__/canon.test.ts` + `canon-tokens.test.ts` fail the build if the
code drifts from the canon. So a visual change means changing the canon JSON and the code together,
not eyeballing a mockup.

- `design/proto_rev2/reference-app/README.md` — how the reference app is structured.
- `design/proto_rev2/reference-app/data/index.json` — which screen spec maps to which route.

**STALE — do not use as the reference for new work:** `legacy/design/*.dc.html` and the `legacy/docs/ui-audit/`
trio (`DESIGN_INDEX.md` / `SCREEN_TREE_SPEC.md` / `CLONE_PROTOCOL.md`). Those are a pre-M3 snapshot
(2026-06-24) from the deep-space cosmic-pixel era, superseded by the reference app above. They are
kept for history. `SCREEN_TREE_SPEC.md`'s route table in particular is badly out of date (it lists
40 routes; the app has 85).

- Do not introduce hex literals in components. Always go through `semantic.*` from `src/lib/theme/tokens.ts`.
- Do not add glassmorphism, pill chips, or em dashes in UI strings. Gradients are allowed only within the deep-space cyan/soul identity via `deepSpaceGradients` (`src/lib/theme/tokens.ts`); off-palette or decorative gradients stay forbidden. See DESIGN.md "Color rules".
- Do not deviate from `DESIGN.md` without explicit user approval.
- In QA mode, flag any code that doesn't match `DESIGN.md`.

## Android Native QA Guidelines

**CRITICAL**: Always read and adhere to `ANDROID_QA_GUIDELINES.md` before making any structural, UI, lifecycle, or data management changes.
This document contains hard-learned prevention measures for Android runtime crashes (OOM, SVG rendering locks, AsyncStorage 2MB limits) and severe UX bugs (Shine-through z-index inversion, hardware BackHandler leaks). Failure to follow it will break the Android build.

## Verification

`npm run verify` runs the full gauntlet: lint + type-check + i18n + lexicon + crisis-layer
parity + legal-review + LLM boundary + constraints + em dash + anti-anthro + mascot-voice +
**require cycles** + jest.

Always run `npm run verify` before pushing. CI calls `npm run verify` directly (not a copy of the
steps), so a new check added there is automatically enforced in CI.

**`check:cycles` is a zero-tolerance gate, not a ratchet.** The repo has 0 runtime require cycles
and must keep it that way: a cycle lets a component evaluate before `lib/theme/m3`, and 35 files
still dereference `m3.*` at module scope inside `StyleSheet.create` — so one cycle re-arms all of
them. That is exactly what shipped to users on 2026-07-03 (#711 `[ota]`, live redbox on
`/settings`). Note the gate excludes `import type` edges: they are erased at compile time and
cannot cycle at runtime, which is why `madge --circular` reports 10 while the true count is 0.

## Skill routing (SimonK Stack / gstack)

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

- Product ideas/brainstorming → `/office-hours`
- Strategy/scope → `/plan-ceo-review`
- Architecture → `/plan-eng-review`
- Design system / plan review → `/design-consultation` or `/plan-design-review`
- Full review pipeline → `/autoplan`
- Bugs/errors → `/investigate`
- QA / testing site behavior → `/qa` or `/qa-only`
- Code review / diff check → `/review`
- Visual polish → `/design-review`
- Ship / deploy / PR → `/ship` or `/land-and-deploy`
- Security audit → `/cso`
- Save progress → `/checkpoint` (snapshot work state)
- Resume context → `/checkpoint` (resume) or `/context-guardian` (recovery mode after disconnect)


## Visual Tier System — always enforce (Simon standing rule)

The app uses the **3-layer constellation hierarchy** (canonical = PRD §4.1 +
`docs/CONSTELLATION-DESIGN.md`). ALL visual changes must respect it. The OLD 4-tier node names
(Soul Core 128px / Pattern Core ×5 / snowflake / crystal) are **DEPRECATED** — the tier
*principle* (one dominant root, sub-nodes recede) carries over; the *names* do not.

| Layer | Node | Brightness/Glow | Notes |
|------|------|--------------|-------|
| C (출력) | 북극성 (Polaris) | Full brightness, max glow bloom | Root/hero — aggregate of the 7 domain stars, must be clearly dominant. Internal key `soulCoreBrightness`, display "북극성" |
| A (입력) | 북두칠성 7 별 | baseline magnitude × domain L1~L5 | The 7 stars actually drawn on home = 6 life domains (커리어·재정·관계·성장·건강·휴식) + **뮤지엄**. Brighter as the domain fills. 뮤지엄 is a curated surface pinned at L4, not a data domain |
| link | cyan Pattern Link | Subtle, recedes | All links = cyan (Big Dipper shape + 2-star pointer → 북극성) |

> **⚠ Layer B 는 2026-08-15 재정의됐다. 아래 설명은 구버전이다.** `stars.ts` 의 심리 구인 7개는
> 폐기 대상이고, Layer B 는 **렌즈**로 바뀐다. **개수는 2026-08-21 에 7로 확정됐고 착수 금지도
> 풀렸다** (일곱 번째 = 프로필). 정본은 `src/lib/lenses/registry.ts` 이고, 배경은 위
> "렌즈층 재정의" 절에 있다.
> Layer A(북두칠성 7별)와 Layer C(북극성)는 **그대로**다.

(구버전 설명: Layer B = the psychological constructs in `stars.ts`, the hidden validation layer behind
북극성 — NOT rendered as stars.)

**Rules:**
- Never make a domain star (layer A) look as large/bright as 북극성 (layer C)
- In drilldown (focused) view: tapped domain star = promoted near 북극성; others recede (scale↓, desaturation, opacity↓)
- Link colors: ALL links = cyan (no green trunks, no violet leaves)
- Brightness = "how much of this domain I know" (DIKW L1~L5); depth falloff and star brightness must not contradict each other
- This hierarchy applies to size, glow intensity, opacity, animation amplitude

## Information Density — one message + one graphic per screen (Simon standing rule)

Too much at once is as bad as overlap. Every screen earns attention with ONE thing.

- **One core message per screen** — strip the rest of the text/labels.
- **One graphic supports it** — the visual IS the explanation. If you need explanatory text, the graphic failed → change the graphic, not add copy.
- **Progressive disclosure** — detail appears only AFTER a tap/drilldown. First screen = the lure, detail = the catch.
- Pairs with the touch rule (O-7): one touch should SIMPLIFY the screen, never add an overlapping layer (use a screen transition or bottom sheet, never a modal over the node). Back lives in exactly one place.

## Worktrees & branches (Simon standing rule)

The canonical checkout is `C:\2ndB` on `main`. ALL git worktrees live INSIDE this
repo under `.worktrees/<name>` (gitignored). Never create a worktree as a sibling
folder (e.g. `C:\2ndB-dev`) or under `C:\Coding Infra\_worktrees\`. This applies to
every agent: Claude, Codex, Antigravity, Grok.

- Create from the repo root: `git worktree add .worktrees/<name> -b <branch>`.
  Remove: `git worktree remove .worktrees/<name>`. Move an existing one in:
  `git worktree move <old-path> C:/2ndB/.worktrees/<name>`.
- Share the install: symlink the worktree's `node_modules` to the canonical
  `C:\2ndB\node_modules` rather than a per-worktree `npm ci`.
- Tooling already excludes `.worktrees/` (gitignore, jest, metro, tsconfig,
  eslint). Keep those excludes: they stop the nested copies from polluting
  `npm run verify` and the Metro bundler.

## What never to do in this repo

- Commit `.env`. (gitignored — verify before staging.)
- Create git worktrees outside `.worktrees/` (no sibling folders, none under
  `C:\Coding Infra\_worktrees\`). See **Worktrees & branches** above.
- Push to `main` directly. Always PR.
- Use `git rebase -i` or `git push --force` without explicit user confirmation.
- Add a dependency without checking the free-tier impact (blueprint §5 promises $0/mo).
- Skip the safety classifier in any LLM call path.
- Stage `.claude/settings.local.json` (per-user, gitignored).

<!-- context-guardian-rules:v1 -->
## Context Guardian Rules (auto-inserted)

### 작업 범위 제한
- 한 세션에서 수정 파일 최대 5 개
- 한 번에 하나의 기능/파일 단위로만 작업
- 작업 완료 즉시 git commit 후 세션 종료 권고

### 파일 읽기 제한
- node_modules/, .next/, dist/, .git/ 절대 읽지 않기
- 목적 없는 디렉토리 스캔 금지
- 대용량 파일 (1000 줄 이상) 전체 읽기 금지 — Read offset+limit 사용

### 작업 요청 방식
- 광범위 요청은 작은 단위로 분해 후 사용자 확인
  예: "Auth 전체 마이그레이션" → "어떤 파일부터 시작할까요?"
- Plan 모드로 먼저 계획 수립 → 승인 후 실행

### 컨텍스트 보호
- 80% 도달 시 SESSION_RECOVERY.md 생성 + 새 세션 전환 권고
- 90% 도달 시 즉시 작업 마무리 + 새 세션 강제

