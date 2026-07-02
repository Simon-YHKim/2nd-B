# ORDERS-ARCHIVE — 완료 오더 원문 보관 (2026-07-03 위생 이동)

> `ORDERS.md` OPEN 섹션에 물리 잔존하던 완료 오더 원문(O-4~O-31)과 구 프리앰블 중복 블록의 보관소. **검색·참조 전용** — 신규 오더는 ORDERS.md `## OPEN`에만 쓴다. 폴러는 이 파일을 읽지 않는다.

---

## 이동분 A — 구 ## OPEN 섹션 원문 (2026-06-15~06-17 오더 + 재가동 공지)

### [재가동 공지 / 2026-06-15] ✅ ORDERS.md 단일 채널 복귀 — 4-AI 풀가동 + 단일 실행자
[2026-06-15 / 01:46:31 KST] Simon 디렉터(모바일 원격) — **원격 오더 채널을 이 파일(ORDERS.md) 하나로 재통합한다.**
- **셋업**: Simon이 모바일로 디렉터 세션에 지시 → 디렉터가 이 파일 `## OPEN` 최상단(이 공지 바로 아래)에 `O-13`부터 오더 블록 작성. PC의 **Claude `/loop` 세션이 유일한 실행자** — 매 사이클 `## OPEN`을 읽어 수행하고 `## DONE`에 `[YYYY-MM-DD / HH:MM:SS KST]` 피드백을 남긴 뒤 그 블록을 OPEN→DONE 이동.
- **채널 단일화**: 6/10의 `ORDERS_REMOTE.md` 분리는 폐지(그땐 두 Claude 동시 감시 회피용). 이제 실행자 = PC Claude `/loop` **하나**이므로 이 파일이 단일 채널. ⚠️ 실행자는 **이 ORDERS.md `## OPEN`만** 본다 — `ORDERS_REMOTE.md`는 읽지 않는다.
- **역할 경계 (single-writer 충돌 방지)**: 디렉터(모바일 세션)는 이 파일 `## OPEN`에 **오더만 추가** — `BOARD.md`/`CONTROL.md`/`agents/claude/`·온라인 git은 건드리지 않는다(= PC 실행자 단독 소유). 실행자(PC Claude)는 OPEN 수행 → OPEN→DONE 이동 → BOARD/CONTROL/git 단독 관리.
- **4-AI 풀가동**: Codex(UI·이미지)·Antigravity(에뮬 네이티브 QA)·Grok(소셜 리서치)도 런치팩(`HUB-STARTUP.html`)으로 가동. 오더 수행 중 레인 작업은 PC Claude가 각 AI `agents/<ai>/outbox`로 분배.
- **첫 사이클 트리아지**: `ORDERS_REMOTE.md`의 미처리 OPEN(O-R1 전화면 UI/UX 상시개선·O-R2 일관성/글로벌/저사양·O-R3 생활관리 비서 축·O-R1-b·HANDOFF-CRASH)을 **이미 라이브 반영분은 DONE 정리**, **살아있는 방향은 `BOARD.md`에 반영 후 계속**. 아래 구 블록(O-12 등)은 완료분 → 재실행 금지.

### [O-31 / 2026-06-17] 🎯 GOAL(P0): deep-space 캐릭터 = 단일 본체 앱(사용자 사용가능 수준) — 화면 진입·기능 작동까지
[2026-06-17 / 14:01 KST] Simon 디렉터(원격, /goal) — **최우선 P0. persona §memo 백엔드보다 deep-space 본체화를 먼저 끝낸다.** 정본 시각/IA 스펙 = `C:\2ndB\2ndb-thought-organization-synthesis.html` §4(화면별 구조). 핵심 결정: **"캐노니컬 셸 = deep-space(캐릭터 주도), gameboy 그래프는 같은 별자리 홈의 스킨으로 강등(평행 내비 아님)"** → 앱본체/랜딩 2분할 제거, deep-space 단일 진입.

**현 상태(감사됨)**: `EXPO_PUBLIC_UI=deep-space` 시 `DeepSpaceShell`(정적 PNG 캐릭터+말풍선+4버튼)만 노출. 40+ 라우트 마운트됐으나 — (A1)2차 네비 미연결, (A3)서브화면 gameboy 테마 잔존, (A5)셸 복귀/Back 단일화 없음, (A4)3D 캐릭터 미구현(정적 PNG), (A8)E2E 미갱신. 멋진 Three.js 캐릭터는 `public/landing/`에만 있고 본체엔 없음.

**스테이지(각 단계 verify + DONE 보고)**:
1. **IA 정렬(§4)**: 42라우트 → 북극성 별자리 홈 1 + 자기이해 7별 + 5허브. 역할/액션/지식 = 별에서 목표트리로 강등. 매핑표 산출.
2. **2차 네비 연결(A1, P0)**: 셸/허브에서 전 라우트 진입로 노출 (capture→formats/import/inbox/manual, profile→core-brain/persona/insights/big-five/mbti/attachment/trinity/audit/interview, 마을→records/wiki). 진입 누락 0.
3. **셸 복귀·Back 단일화(A5)**: Back은 항상 별자리 홈 한 곳. 노드 위 모달 금지(bottom-sheet/화면전환만).
4. **테마 통일(A3)**: 서브화면 deep-space 팔레트(눈색 cyan 모노톤 3색). gameboy는 별자리 홈의 한 스킨으로 강등.
5. **캐릭터(A4)**: landing Three.js 캐릭터를 본체 포팅 또는 D-23 하이브리드(저사양=정적 fallback, 고사양=3d). `EXPO_PUBLIC_CHARACTER` 실배선.
6. **정보밀도**: 한 화면=한 메시지+한 그래픽, 디테일은 탭 뒤(progressive disclosure).
7. **검증(A8)**: nav-contract §5 E2E 7항목 + persona-simulation(연령·문화 교차) + `npm run verify` + `expo export --platform web` green.

**제약**: CLAUDE.md C1~C12 + 금지어휘 lexicon + semantic 토큰만(hex/gradient/em-dash 금지). 레거시 gameboy 삭제 금지(스킨 보존·롤백 가능). 게이트(과금·법무·미성년 DPIA·secrets)=설계만, 라이브 금지. IA/네이밍 결정=§35 ai-debate.

**진행**: 4-AI 분산(Claude=구현·머지, Codex=UI·캐릭터 에셋, AG=에뮬 QA, Grok=소비자검증). 직전 분배 오더와 연동.

**수용 기준**: `EXPO_PUBLIC_UI=deep-space`에서 (a)전 메뉴/라우트 진입 가능(누락0) (b)기능 실작동 (c)단일 deep-space 셸 + Back 한 곳 (d)서브화면 테마 통일 (e)캐릭터 본체 반영 (f)verify/export green (g)persona-sim findings 수정. DONE에 라이브 SHA + 스크린샷.

**[디렉터 진행로그 2026-06-21 01:48 KST]**: Stage1·2·4 기머지 + 금번 #457(Stage2/3 강화)·#477(Stage6 정보밀도) 머지·라이브(origin/main `e5926214`). 잔여 = Stage5(landing Three.js 캐릭터 본체 포팅/하이브리드) · Stage7(nav-contract E2E + persona-sim + verify/export green). 상세 = DONE 섹션 디렉터 사이클 로그.

### [O-30 / 2026-06-17] 4-AI 풀 분배 재가동 — Codex/AG/Grok 레인 급양 + Codex 워크트리 복원 + tty-block 해소
[2026-06-17 / 13:04 KST] Simon 디렉터(원격) — 점검 결과 **오케스트레이터가 단독으로만 머지 중이고 Codex/AG/Grok에 레인 작업이 분배되지 않음**. Codex는 inbox에 06-06 legacy 3건뿐(신규 open 0), 워크트리 `C:\Coding Infra\_worktrees\2ndB-codex` 미존재, `codex --yolo` 자가기동이 `stdin is not a terminal`로 즉시 종료(07:43 codex 보고). CONTROL=running인데 4-AI 중 오케스트레이터 1좌석만 일하는 상태. **풀 분배로 재가동하라.**

**1. Codex 워크트리 복원**: `C:\Coding Infra\_worktrees\2ndB-codex`를 origin/main 기준으로 재생성(`git worktree add`). 복원 후 Codex가 앱 탐색/수정 루프 진입 가능하게.

**2. Codex tty-block 해소**: `codex --yolo` 직접 spawn이 TTY 없이 죽는 문제 → AG의 ConPTY 헤드리스 방식과 동일하게 pty 래퍼로 기동하거나, TTY 없이도 도는 **파일-루프(inbox 폴링)** 경로로 전환. Codex가 매 사이클 `agents/codex/inbox`를 읽어 수행하도록.

**3. 레인 급양(ROUTING.md대로 분배)**: 현재 OPEN의 살아있는 작업을 각 AI `agents/<ai>/inbox`로 분해·투입:
- **Codex (UI·이미지)**: 미착수 **O-24 배경 시안 4종 그리기**(AG 구상 기반) + O-25/O-28 시안 ⑤/⑤-rev 산출물 확인 + 화면 UI/아이콘.
- **Antigravity (네이티브/에뮬 QA)**: O-23 새 UI 본체 + 최근 머지분(#428~#433 persona/core-brain) 에뮬레이터 터치 플로우 QA.
- **Grok (소비자·소셜 리서치)**: deep-space IA·세계관 정본(북극성/7별/L1-L5) 소비자 검증.

**4. 보고**: 분배 결과(각 AI에 무엇을 줬는지) + Codex 워크트리/tty 복구 여부를 `## DONE`에 `[YYYY-MM-DD / HH:MM:SS KST]`로 회신. 게이트(파괴·실비용·secrets·법무·과금)는 그대로 보류 — 분배 대상 아님.

**수용 기준**: Codex 워크트리 존재 + Codex가 inbox 오더로 실작업(O-24 시안 등) 착수 + AG/Grok 각 inbox에 신규 open 투입 + DONE에 분배 로그. (디렉터는 이 오더만 추가 — BOARD/CONTROL/git/agents는 실행자 단독.)

### [O-29 / 2026-06-16] Simon 취침 전 원격 지시 — 결정대기 항목 권장안으로 진행 + HTML 보고 + 최종 push/merge
[2026-06-16 / 04:28 KST] Simon 디렉터(취침 전 원격) — "내 결정 기다리는 게 있으면 **권장안으로 진행**해라. 그 내용을 **HTML로 보고**하고, **최종 마지막엔 GitHub push + merge까지** 잊지 마라."

**0. 재개 승인**: 현재 `CONTROL=paused`(UI 완성 전 중단). 이 오더 처리를 위해 **Simon이 재개를 승인** — 실행자(PC Claude)는 필요 시 `CONTROL→running` 복원 후 진행해도 된다(이 오더 처리 + 권장안 반영까지). 처리 후 상태는 실행자 판단(계속 가동 vs 다시 pause).

**1. Simon 결정 대기 항목 = 각 권장안(판정/verdict)으로 진행** (비게이트만):
- **최우선 = D-22** (deep-space 캐릭터트랙 앱 IA)의 **Simon 결정 4건** → §35 토론 판정의 권장 방향으로 확정·구현:
  - 리서치 유지/병합, inbox=담기/그래프 귀속, audit 검사=통찰 귀속, ops 라벨/노출.
  - 이게 pause 사유("UI 완성")의 핵심 블로커 → 확정 후 deep-space IA 완주.
- **D-01**(EXPO_PUBLIC_FORCE_TIER 기본값) · **D-07**(consent durable 큐) 등 투표대기 항목도 4-AI 합의 권장안으로 결론·진행.
- 그 외 `DECISIONS.md`에 판정이 이미 선 비게이트 항목은 권장대로 진행.

**2. 🔒 하드게이트는 권장 진행 금지 — 그대로 보류** (§11-5: 파괴·실비용·secrets·안전임상·법무. 합의/이 오더로 우회 불가):
- **D-17 Lever B(계정 전 캡처) 빌드**, **수익화 M1~M5(가격/PG/구독)**, **미성년 DPIA·동의·법무 카피**, social provider 실등록(D-05), consent 법무 사인오프(D-03) = **설계/권고만, 빌드·라이브·실결제·실설정은 Simon 명시 승인 전까지 금지.** 자는 동안 법무/과금 항목을 라이브로 밀지 말 것.

**3. HTML 보고**: 무엇을 어떤 권장안으로 결정·구현했는지, 결과·라이브 SHA·보류 항목을 **HTML 보고서**로 산출(`Output/` 또는 `agents/claude/outbox/preview/`, 기존 관행). 아침에 Simon이 한눈에 읽게.

**4. ✅ 최종 마무리 = GitHub push + merge (필수, 누락 금지)**: 각 코드 변경은 `npm run verify` green → PR → CI green → **squash merge**(auto-merge 정책) → origin/main 라이브 반영 확인. 머지 안 된 채로 끝내지 말 것. DONE에 머지된 PR/SHA + HTML 보고서 링크 기록.

**수용 기준**: D-22 4결정 확정·구현 라이브 + 기타 비게이트 권장안 반영 + 하드게이트 항목은 보류 유지(라이브 안 됨) + HTML 보고서 산출 + 모든 변경 origin/main 머지 완료. (디렉터는 이 오더만 추가 — BOARD/CONTROL/git/agents는 실행자 단독.)

### [O-28 / 2026-06-15] 배경 시안 ⑤ 채택 + 개정(⑤-rev) — 밝기 2/3 상향 · 랜덤성↑ · 거리/크기/밝기 다양화
[2026-06-15 / 21:21 KST] Simon 디렉터 — **배경 방향 = 시안 ⑤(신경망+우주 혼합·저자극) 확정.** 단 아래 5가지 조정 후 갱신본을 보드에 반영(⑤ vs ⑤-rev 비교 가능하게).

**조정 사항**
1. **밝기 상향(2/3 지점)** — 현 ⑤(저휘도)는 너무 어둠. **원본 밝기(①②)=100%, 현 ⑤=0% 기준으로 약 67%(2/3) 지점까지 올림.** ⑤보다 분명히 밝되 원본 풀밝기보단 차분. 눈부심(bloom/aberration)은 계속 억제 — 밝기만 올리고 글레어는 아님.
2. **랜덤성 강화** — 광원(별·노드) 배치·점멸·드리프트에 더 큰 랜덤성. 규칙적 그리드/대칭 느낌 제거, 자연스러운 산포(시드 다양).
3. **거리감(깊이) 다양화** — 광원을 가까움↔멂 여러 레이어로(3단계 이상 depth). 가까운 건 크고 또렷·밝게, 먼 건 작고 흐릿(블러·저투명)·어둡게. 약한 parallax 허용.
4. **크기 다양화** — 광원 크기 편차 크게(작은 점 ~ 큰 보케까지 분포). 균일 크기 금지.
5. **밝기 다양화** — 광원마다 밝기 편차 크게(어두운 점 ~ 밝은 하이라이트 혼재). 균일 밝기 금지.

**역할 (멀티모달 §19)**: 🟩 AG=구상(분포·깊이·랜덤 파라미터 무드 명세), 🟨 Codex=그림(`concept-5b-hybrid-rev.html` 신규 또는 ⑤ 갱신 + 썸네일, 비교보드 `public/landing/bg-concepts/`에 반영).
**제약**: deep-space·cyan(`#46B6FF`/`#CCFAFF`/`#5FD4FF`) 일관, 저자극 유지(밝기만 ↑, 눈부심 ↓ 유지), em-dash·과잉장식 금지, 저사양 경량.
**수용 기준**: 갱신 시안이 라이브 비교보드에 반영 → 밝기 ~2/3 상향 + 광원 거리/크기/밝기 분포가 눈에 띄게 다양 + 랜덤성↑ 확인. DONE에 보드 링크. (이게 본체 배경 채택 후보 — 확정 시 별도 오더로 `buildBackdrop` 반영.)

### [O-27 / 2026-06-15] WoW 레벨업 연출 — 글·데이터 축적 / 새 구조물 생성 시 (색 = 로봇 눈색 cyan)
[2026-06-15 / 21:03 KST] Simon 디렉터 — 게이미피케이션 보상 피드백. "글·데이터 등이 하나씩 쌓일 때마다, 또는 새 구조물이 만들어질 때마다 **World of Warcraft 레벨업 효과**. 단 색상은 로봇의 눈색으로."

**트리거 이벤트 (2종)**
- **(a) 데이터 1건 적립** — 당기(캡처) 저장, 기록/소스 추가, 인터뷰 답변 등 글·데이터가 하나 쌓이는 순간.
- **(b) 새 구조물 생성** — 그래프에 신규 노드 출현(tier-2 Pattern Core / tier-3 눈송이 Pattern Data / tier-4 크리스털 Pattern Link) 또는 새 패턴·카테고리 구조 형성 순간.

**연출 (WoW "딩" 레벨업 시그니처 차용 → cyan화)**
- 대상 요소 둘레로 **수직 광주(light pillar) 솟구침 + 확장 링(ring burst) + 스파클 파티클**을 짧게(0.6~1.0s). WoW의 그 골든 연출을 그대로, 단 **색만 교체**.
- **색 = 로봇 눈색 cyan 토큰**(`#46B6FF`/`#CCFAFF`/`#5FD4FF`) — 반드시 `semantic.*` 경유(컴포넌트 hex 직접 금지). 골드·무지개 금지.
- 끝나면 화면은 다시 "한 화면 한 메시지"로 복귀(정보밀도 규칙) — 잔상·지속 장식 금지.

**강도 차등 (Visual Tier System 준수)**
- 효과가 **tier-1 Soul Core를 시각적으로 잡아먹지 않게**. tier-2 코어 생성=강한 연출 / tier-3·4 데이터=약한 미니 버스트로 차등.

**피드백·접근성·성능**
- 라이트 햅틱(expo-haptics) 동반. 사운드는 옵션(**기본 OFF** — 무음·저사양 배려).
- **reduced-motion 폴백 필수**(앱에서 이미 Reanimated reduced-motion 감지됨): 모션 줄이기 ON이면 광주/파티클 생략 → 짧은 정적 글로우 펄스로 대체.
- **저사양 Android 경량**(ANDROID_QA_GUIDELINES: OOM·SVG 렌더락 주의) — 연속 파티클·매 프레임 SVG 리렌더 금지, 단발·재사용.

**제약**: DESIGN.md 준수(gradient/글래스 금지 가드 — glow는 토큰·opacity 레이어링으로). C1~C12·금지어휘 무관(순수 연출). `npm run verify` + `expo export --platform web` green.
**수용 기준**: (a)·(b) 두 트리거에서 **cyan 레벨업 버스트 재생**(데모) + tier 강도 차등 + reduced-motion 정적 폴백 + 저사양 경량 + verify/export green. DONE에 트리거 위치(파일·이벤트명)와 데모(스크린샷/짧은 캡처) 첨부.

### [O-26 / 2026-06-15] 에뮬레이터 dev 서버 연결 환경이슈 영구 해결 — "Cannot connect to Expo CLI" (10.0.2.2:8081)
[2026-06-15 / 20:03 KST] Simon 디렉터 — AG 네이티브 QA(O-23 Stage④) 에뮬 콘솔에서 dev 서버 연결 끊김. Simon: "환경이슈는 무조건 해결." 앱 버그 아님(번들 로드 성공·크래시 아님), **dev 환경 연결 문제**라 영구 차단 필요.

**증상 (콘솔 근거)**
- `Cannot connect to Expo CLI` / URL `10.0.2.2:8081` / `Error: undefined`. 안드로이드 에뮬레이터가 PC의 Metro·Expo dev 서버(8081)에 못 붙음. (`10.0.2.2` = 에뮬레이터에서 본 PC localhost.)
- 동반(무관·무시 가능): Reanimated `Reduced motion setting is enabled` = 에뮬 접근성 '동작 줄이기' 탓 dev 경고. 버그 아님. 애니메이션 실측 필요 시 에뮬에서 동작-줄이기 OFF 권고.

**원인 후보**
- `adb reverse tcp:8081 tcp:8081` 매핑 부재 / Metro(dev 서버) 미기동 / 8081 포트 점유 / 에뮬 미인식(`adb devices`).

**해결 (재발방지·영구화)**
1. **pre-QA 보장 스크립트화** — 매 에뮬 QA 사이클 시작 전 자동 실행: ① `adb reverse tcp:8081 tcp:8081` ② Metro 헬스체크(`curl http://127.0.0.1:8081/status` → `packager-status:running`, 없으면 dev 서버 기동) ③ `adb devices`로 에뮬 인식 확인(미인식 시 재기동).
2. **런북 명문화** — 위 절차를 AG QA 런북(또는 `scripts/`·hub `tools/` 프리QA 훅)에 편입해 매 네이티브 QA 전 자동 적용. 1회성 수동 `adb reverse`로 끝내지 말 것.

**수용 기준**: 에뮬레이터가 dev 서버 번들을 받아 `Cannot connect to Expo CLI` **미발생** + AG의 O-23 네이티브 QA가 연결 끊김 없이 진행. pre-QA 보장 절차가 스크립트/런북에 반영(재발방지). DONE에 확인 로그(에뮬 정상 연결 + 절차 반영 위치).

### [O-25 / 2026-06-15] 배경 시안 추가 (5번) — 신경망+우주 혼합·저휘도·저눈부심 (구상=AG, 그림=Codex)
[2026-06-15 / 19:22 KST] Simon 디렉터 — O-24 비교보드 후속. Simon이 시안 ①·② 보고 새 변형 요청.
- **시안 ⑤**: O-24의 **①하늘색 신경망 + ②파란빛 우주를 적당히 혼합** + **밝기 낮춤 + 눈부심(bloom/glow/blur/aberration) 대폭 감소**. → 눈이 편한 차분·저자극 버전.
- **🟩 AG = 구상**: 신경망 노드/엣지 + 우주 nebula/starfield 혼합 무드. 저휘도(어두운 deep-space 톤), bloom/글로우 최소, subtle 모션. cyan 토큰 유지하되 채도·밝기 낮춤. 살짝 귀여움 유지.
- **🟨 Codex = 그림**: AG 스펙 기반 혼합 HTML 렌더러 `concept-5-hybrid-dim.html`(O-24와 동일 self-contained, 캐릭터 rim 오버레이). 기존 비교보드(`public/landing/bg-concepts/`)에 5번으로 추가 + 썸네일.
- **제약**: deep-space·cyan 일관, **눈부심 최소가 핵심**, slop 0, 경량.
- **수용 기준**: 시안 ⑤ 렌더러 + 썸네일이 **비교보드(bg-concepts/)에 추가**돼 ①~⑤ 비교 가능. AG 구상 문서. DONE에 보드 링크.

### [O-24 / 2026-06-15] landing 배경 시안 4종 — 구상=Antigravity, 그림=Codex (멀티모달 §19)
[2026-06-15 / 17:51 KST · ⚡병렬 갱신 18:36] Simon 디렉터 — 배경 컨셉 시안 제작. Simon이 시안 보고 방향 결정. (O-23 새 UI 배경에 채택본 반영 가능, 단 시안 먼저.)
> **⚡ 병렬 즉시 (Simon 지시 18:36)**: O-23(Claude 메인 구현) 완료를 기다리지 말고 **지금 즉시 AG(구상)·Codex(그림) lane에서 병렬 착수**. 이 작업은 Claude의 O-23 구현과 독립 lane(멀티모달 §19)이라 동시 진행 가능. 오케스트레이터는 AG/Codex에 O-24를 바로 디스패치 — O-23은 Claude+AG-persona 계속, O-24는 AG-구상+Codex-그림 병행.

**시안 4종**
1. **하늘색 신경망** (neural net, cyan nodes/edges)
2. **파란빛 우주** (blue cosmos — 현재 채택본 buildBackdrop, 비교 기준)
3. **파란빛 중력장** (gravity field / 휜 공간 blue)
4. **로봇 내부** (robot interior — 추가; 캐릭터 몸통 회로/내부 뷰 느낌, "몸통 화면" 컨셉과 호응)

**역할 분담 (Simon 명시 지정)**
- **🟩 Antigravity = 구상**: 4종 각 컨셉의 무드/디테일 명세 — 색(눈색 cyan `#46B6FF`/`#CCFAFF`/`#5FD4FF` 토큰 일관)·모션·캐릭터 rim-light 조화·**살짝 귀여운 톤**·저사양 Android 성능(정적 fallback 고려). 4종 방향 문서.
- **🟨 Codex = 그림**: AG 구상 기반 각 시안 **이미지 생성**(4종). §19 멀티모달 페어로 AG와 상호평가(렌더 충실도·심미) 후 수렴.

**산출**: 시안 4종 이미지 → **Simon이 볼 수 있는 비교 보드**(HTML 또는 라이브 경로/스크린샷)로 제시. 채택은 Simon이.
**제약**: deep-space·cyan 일관, 귀여운 톤, em-dash·과잉장식 금지. 채택본의 본 배경 반영은 별도 오더.
**수용 기준**: AG 구상 문서(4종) + Codex 시안 이미지(4종) + Simon 확인용 비교 보드. DONE에 보드 링크/경로.

### [O-23 / 2026-06-15] 새 UI 본체 승격 + 기존 UI 레거시화 + 전기능 연결 + 페르소나 검증 (대규모·비가역)
[2026-06-15 / 15:26 KST] Simon 디렉터 — 대규모·근본·비가역. AI 허브 전체(4-AI) + SimonK 스택 검증 스킬 총동원. **허브 정상 확인됨**(running·데몬3·hub-health 14P/0F·모니터 작동).

**목표**
1. **기존 본체 UI/UX(gameboy 트랙) 레거시 분리** — 별도 폴더/플래그(예: `EXPO_PUBLIC_UI=legacy`)로 보존, **삭제 금지·롤백 가능**. 기존 자산·타인 작업 삭제 금지.
2. **새 UI(deep-space 캐릭터, landing 컨셉 O-16~O-22 완성본) 본체 메인 승격** — 앱 진입 시 새 UI가 기본. (현 `public/landing/`은 정적, 이를 expo 본체 라우팅/화면으로 정식 편입.)
3. **모든 메뉴·기능 빠짐없이 연결** — 2nd-B 전 라우트(`src/app/_layout.tsx`: index·capture·secondb·profile·records·wiki·core-brain·persona·audit·interview·insights·big-five·mbti·trinity·attachment·formats·import·inbox·settings·privacy·account·plans 등) **진입 가능 + 정상 작동. 누락 0.**
4. **페르소나 검증** — `persona-simulation` 스킬(연령·직업·소득·문화 4축 교차)로 첫실행+핵심루프 막힘·이탈·불신 점검. qa/design-review/accessibility 등 허브 검증 스킬 병행. **KR + 글로벌**. 고령/유아 포함.

**제약**: expo SDK56/RN, `npm run verify` + `expo export --platform web` green 필수. 새 UI=deep-space 독립 트랙. CLAUDE.md 가드(C1~C12, 금지어휘 lexicon, semantic 토큰만·hex/gradient/em-dash 금지) 준수.

**진행**: 4-AI 분산(Claude=구현·머지, Codex=UI/에셋, AG=네이티브/에뮬 QA, Grok=소비자검증). **앱 전체 UI 교체=비가역 → §35 ai-debate 필수**(레거시 보존·롤백 경로 확정 후 착수). 단계적: ① 레거시 분리+롤백 플래그 → ② 새 UI 본체 골격 → ③ 전 기능 연결 → ④ persona-sim 검증 라운드 → ⑤ findings 수정 반복. 각 단계 `## DONE` 보고.

**수용 기준**: 새 UI 본체 메인 + 전 기능 진입·작동(빠짐0) + 기존 UI 레거시 롤백가능 + 페르소나 검증 리포트(막힘/이탈 findings + 수정 완료) + verify/export green.

### [O-22 / 2026-06-15] landing 라이브 버그 2건 (머리 복귀·hero 메뉴 오터치) + 캐시버스팅
[2026-06-15 / 13:00 KST] Simon 디렉터 — 라이브(`/2nd-B/landing/`) 버그. 대상=`public/landing/` (정본). 디렉터가 코드 진단함.

**버그1: 머리 복귀 안 됨 (트래킹 대상 없으면 정면 복귀해야)**
- 진단: `main.js:413-421`에 `recenterGaze()`(pointer.x=0,y=0) + `touchend`/`touchcancel`/`blur`/`mouseleave`/`pointerleave` 바인딩이 **이미 존재**(O-18). 그런데 Simon이 라이브에서 미작동 보고.
- → 점검: ① GitHub Pages가 `main.js`를 캐시해 recenter 이전 구버전 노출(버그3 cache-bust로 우선 배제) ② `touchmove`/`pointermove`가 touchend 이후 stale pointer를 유지하는지, 또는 nav/screen 모드의 head offset 때문에 hero 중앙 정면으로 안 돌아오는지. **트래킹 대상 없으면(손 뗌·idle·포인터 이탈) 반드시 hero 중앙 정면으로 ease 복귀**. 필요시 일정시간 입력 없을 때도 recenter.

**버그2: hero에서 숨은 메뉴 오터치 (실제 코드 버그 확정)**
- 진단: `.home-item { pointer-events: auto }`(styles.css:313)가 **항상 켜짐**. hero에서는 `applyMode`가 `#home-ui`에 `aria-hidden`만 토글(main.js:1163-1164)하고 pointer-events는 차단 안 함 → 시각만 숨고 **숨은 메뉴 버튼이 클릭 가능**. 그래서 hero에서 메뉴가 뜰 위치를 터치하면 그 메뉴가 눌림.
- 수정: `mode !== "nav"`(hero/screen)일 때 `#home-ui` 및 home-item/home-icon에 `pointer-events: none`, nav일 때만 `auto`. (`body[data-mode]` 기반 CSS 또는 applyMode에서 직접 토글.) hero에서 메뉴 영역 터치는 **메뉴 클릭 없이 nav 전환만**.

**버그3(겸): 캐시버스팅** — `main.js?v=head-follow-v7c` 고정 쿼리라 브라우저/Pages가 캐시. 빌드 해시/타임스탬프로 버전 쿼리 갱신(또는 빌드 시 자동) → Simon이 새로고침 없이 항상 최신 로드. (이게 "결과물 안 보임"의 핵심 원인일 수 있음.)

**수용 기준**: 손 떼면 머리 정면 복귀(라이브 검증) / hero에서 메뉴 위치 터치 시 메뉴 무반응·nav 전환만 / main.js 캐시 안 됨(버전 자동 갱신).

### [O-21 / 2026-06-15] landing-clone → 2nd-B GitHub 정식 통합 + 진짜 라이브 (expo 호환, 실행자 판단)
[2026-06-15 / 11:21 KST] Simon 디렉터 — 터널/로컬 프로토타입 대신 **진짜 GitHub 라이브**를 원함. 근본 차단 = `landing-clone`이 **gitignored**라 GitHub에 안 올라감.
- **요청**: `landing-clone`(HTML + Three.js 프로토타입)을 **2nd-B 레포에 정식 통합 → push → CI → main 머지 → 라이브 배포**. 터널/로컬 8778 서빙 졸업.
- **제약 (핵심)**: **현재 Expo 시스템에서 잘 돌아가게**. 2nd-B는 Expo SDK56/RN web-deploy(GitHub Pages, `web-deploy.yml`). Three.js/HTML을 어떻게 얹을지 = **실행자가 기존 시스템 맥락 보고 판단**:
  - 후보 ① Expo web `public/`(또는 정적 자산)로 호스팅 → web export에 포함 → Pages의 한 경로(예: `/landing/`).
  - 후보 ② expo-router 웹 전용 라우트에서 iframe/정적 임베드.
  - 후보 ③ Three.js 씬을 RN/web 컴포넌트로 포팅(대공사 — 비용 대비 판단).
  - → §35 토론 가능. **`npm run verify` + `expo export --platform web` green 필수**(2nd-B CLAUDE.md 빌드 게이트).
- **정리**: `.gitignore`에서 landing-clone 해제(또는 적절 위치 이동), O-16~O-20(landing 작업) 반영본을 통합, 기존 web-deploy 파이프라인에 태움.
- **수용 기준**: 2nd-B main에 통합 머지 + CI green + 기존 web 배포(GitHub Pages 등)에 **진짜 라이브 URL** + expo verify/export green. 라이브 URL을 `## DONE`에 회신.

### [O-20 / 2026-06-15] landing 요구사항 감사(ultracode 8항목) — 누락·부분 보강 + 추가 2건
[2026-06-15 / 11:13 KST] Simon 디렉터 — ultracode 멀티에이전트 감사(8 agents, 코드 대조) 결과. 대상=`landing-clone`. 이전 O-17 + 추가 요청 빠짐없이 점검.

**감사 결과 (코드 근거)**
- ✅ 완료: 배경 rim-light(`buildBackdrop()` 파란빛 우주, AG candidate2) · 감정 모션(`REACTIONS` 성공=기쁨/실패=짜증/반복=화남, `failStreak` 에스컬레이션)
- △ 부분 → 보강 / ❌ 누락 → 구현 (아래 작업)

**보강·구현 작업**
1. **idle 오물오물 상시화** — 현재 neutral/curious의 `mouthMotion:"idle"`이라 입 완전정지(main.js EXPRESSIONS). idle 무드에도 미세 입 ambient(약한 펄스) + 숨쉬기 bob(`LOOK.bob` 0→양수). 감정 무관 상시 생동감.
2. **표정 연령대 차원** — 16표정 듀오링고풍은 OK, 그러나 연령축(어린아이·청소년·청년·어른) 0%. 같은 감정을 연령대별 다른 포즈/스케일/모션으로(에셋 한계 시 포즈 변형). 듀오링고풍 유지.
3. **채팅 감정연동 정정** — 현재 사용자 입력 텍스트만 휴리스틱 분석(세컨비 응답 톤 미반영, mock 채팅). 프로토타입: 세컨비 mock 응답 생성 → 그 응답의 톤 분류 → 표정. (실제 LLM은 2ndb 본체 gemini.ts.)
4. **얼굴 터치 복귀 (O-18 우선)** — 현재 빈 공간 클릭도 복귀(요구와 반대, main.js click 핸들러 hit-test 없음). 머리(headMesh) Raycaster/bbox hit-test → **머리 적중 시만 복귀, 빈 공간 무시**. touchend 머리 탭도.
5. **(추가) 프로필 + 사진 업로드** — nav 화면 **로봇 오른쪽에 프로필 카드(아바타+이름) 표시** + **본인 사진 업로드**(`<input type=file>`/FileReader/createObjectURL → 아바타 image, localStorage 영속). 현재 아바타는 변경불가 단색 원(styles.css).
6. **(추가) 모든 버튼 직관적** — `chat__send`(◯→) aria-label="보내기"+title, 프로필 아이콘 `◓`→사람/아바타 글리프, `home-icons` 가시 라벨/title. 나머지는 직관적 확인됨.

**수용 기준**: 6건 코드 반영. 동일 감사 재실행 시 partial/missing → implemented. 폰·데스크톱 스크린샷 + 표정/프로필/얼굴터치 동작.

### [O-19 / 2026-06-15] hub-health git락 hang 근본수정 (모니터 헬스탭 차단)
[2026-06-15 / 11:01 KST] Simon 디렉터 — 허브 도구 개선. 대상=`tools/hub-health.ps1` (실행자/허브 single-writer 작업).
- **증상**: `hub-health -Json`이 hub-repo git락(데몬 커밋 중)에 **22초+ hang** → 폰 모니터링 헬스 탭 갱신 차단. (현재 디렉터가 대시보드 쪽에서 별도 백그라운드+timeout으로 회피 중이나, 근본은 hub-health.)
- **원인**: hub-health의 git 검사(status/log/fsck 등)가 다른 AI 커밋의 `index.lock` 대기.
- **수정**: git 호출에 `--no-optional-locks` 적용 또는 짧은 timeout + 락 감지 시 즉시 skip/직전 결과. 19 셀프테스트 전체가 락에 안 막히게.
- **검증**: 데몬이 hub repo에 커밋하는 중에도 `hub-health.ps1 -Json`이 5초 이내 반환.

### [O-18 / 2026-06-15] landing 머리 추적 버그 — 손가락 떼면 정면 복귀 안 함 (작은 버그·우선)
[2026-06-15 / 09:37 KST] Simon 디렉터 — 작은 버그, 우선 처리. 대상=`landing-clone/main.js`.
- **증상**: 터치로 머리가 포인터를 잘 따라가나, **손가락을 떼도(touchend) 마지막 위치를 계속 바라봄**. 원래(정면/중앙)로 복귀해야 함.
- **원인**: pointer 추적이 `touchmove`로만 갱신됨 → **`touchend`/`touchcancel`(+ 데스크톱 `pointerleave`/window `blur`) 시 pointer를 중앙(0,0)으로 리셋하지 않아** 머리 gaze가 마지막 위치에 고정.
- **수정**: `touchend`·`touchcancel`(+ `mouseleave`/`pointerleave`·window `blur`)에서 `pointer.x = 0; pointer.y = 0` → 기존 ease(LOOK.ease)로 머리가 부드럽게 정면 복귀. (마우스 hover는 유지가 자연스러우니 데스크톱은 창 떠날 때만 복귀 권장.)
- **검증**: 터치해서 머리 돌린 뒤 손가락 떼면 정면으로 부드럽게 복귀.

### [O-17 / 2026-06-15] landing 캐릭터 — 배경 rim-light(AG 조언) + 표정 상황연동 + 표정 다양화(듀오링고) + 얼굴터치 복귀
[2026-06-15 / 09:25 KST] Simon 디렉터 — O-13/14 landing 캐릭터 폴리시. 대상=`landing-clone`, 8777. 검증=스크린샷+동작.

**1. 배경 — 캐릭터 rim-light(파란빛) 살리기**
- 현 캐릭터 아웃라인에 하늘색 림(뒤에서 파란빛 비추는 느낌)이 있음 → 이를 배경 컨셉으로 확장.
- 후보: ① 하늘색 신경망 ② 파란빛 우주 ③ 파란빛 중력장. **→ Antigravity에게 조언 요청**(캐릭터 rim과 조화·구현 적합성 평가) 후 채택·구현. §35 토론 가능.
- 톤: 딱딱하지 않고 **살짝 귀여운**(캐릭터 분위기 계승). deep-space 유지, 과장·slop 금지.

**2. 표정 상황 연동 (현재 감정이 나열만 됨 → 맥락 반응으로)**
- **idle 모션**(감정 무관): 눈깜박·하품·오물오물 등 평상시 생동감.
- **감정 모션**(상황별): 데이터 축적/저장 성공=기뻐함 · 실패=짜증 · 반복 실패=화남 · 그 외 상황별.
- **LLM 채팅 연동**: 세컨비 대화 내용(톤/감정)에 따라 로봇 표정 변화.
- 훅: 저장/실패/채팅 이벤트 → setExpression (현 `EXPRESSIONS`/`behavior` 확장, 이벤트 트리거).

**3. 표정 다양화 (듀오링고 참고)**
- 어린아이·청소년·청년·어른이 많이 짓는 표정 추가. **Duolingo 캐릭터의 풍부한 표정·표현을 레퍼런스**로. 현 9종 → 확장.
- Codex(표정 스프라이트) + AG(렌더 충실도) §19 멀티모달 페어 활용.

**4. 조작감 — 복귀 트리거 변경**
- 현재: 메뉴/스크린에서 **빈 공간** 터치 → 메인 복귀.
- 변경: **캐릭터 얼굴(머리) 터치로만** 복귀. 빈 공간 터치는 복귀 비활성(오터치 방지). main.js 클릭 핸들러를 머리 hit-area 판정으로.

**진행**: 배경 컨셉 = §35 + **AG 조언 필수**. 표정 = Codex+AG 페어. design-first. 단계별 `## DONE` 보고.
**수용 기준**: rim-light 배경(AG 채택안·귀여운 톤) / idle+감정+채팅연동 표정 / 연령대 표정 추가(듀오링고풍) / 얼굴터치 복귀(빈공간 비활성). 스크린샷 + 표정 연속샷.

### [O-16 🔄 Stage①완료 2026-06-15 09:11 · 다단계 진행중] landing-clone → 2ndb 전기능 작동 앱 (독립 deep-space, simple-is-best)
[2026-06-15 / 08:51 KST] Simon 디렉터 — **대규모. AI Hub 전체(오케스트레이터→Codex/AG/Grok 분산)** 작업. O-14 완료된 landing(hero↔nav↔screen 3-state)을 기반으로 확장.

**목표**: landing 캐릭터 컨셉을 확장해 **2ndb 현재 앱 기능을 사용자가 빠짐없이 쓸 수 있는 작동 앱**으로. 기존 본체 UI/UX(gameboy)와 **독립된 디자인 컨셉**(deep-space 캐릭터 트랙).

**원칙 (불변)**
- **Simple is the best** — 한 화면 = 하나의 목적 + 그 목적 달성 최소 기능·디자인. (= Simon 정보밀도: 화면당 핵심 1 + 그래픽 1, progressive disclosure.)
- **독립 트랙** — 본체 gameboy와 섞지 않음. deep-space + 캐릭터 일관 유지.
- **기능 빠짐없이** — 아래 2ndb 전 라우트 매핑, 진입 누락 0.

**레이아웃 (요청1) — nav(탭 후 축소) 화면 배치 순서 (위→아래)**
1. 좌상단: 캐릭터 머리
2. 머리 **바로 오른쪽**: 프로필 버튼 + 설정 버튼 (작은 아이콘 2개)
3. 그 아래: 캐릭터 말풍선
4. 그 아래로: 메뉴 출력
(현 nav 좌상단머리+우측말풍선 구조를 이 순서로 재배치.)

**색상 (요청2) — "캐릭터 몸통 화면" 컨셉**
- 글자색 + UI 구성색 = **캐릭터 눈 색과 일치**. 현 눈 스프라이트 = cyan 계열 outer `rgb(70,182,255)` / inner `rgb(204,250,255)`, 입 `rgb(95,212,255)`.
- 컨셉: 이 UI가 캐릭터 몸통에 박힌 화면에 표시됨 → accent=눈 cyan · 배경=deep-space · 텍스트=눈색 계열. **모노톤 3색 이내.**

**기능 매핑 (2ndb 전수 — 정본 `src/app/_layout.tsx` + `src/components/premium/tab-bar.tsx`)**
- Primary 4: 그래프(`/`)·담기(`/capture`)·세컨비(`/secondb`)·나(`/profile`).
- 나(profile) 허브 하위: core-brain · persona · 자기검사(big-five/mbti/attachment/trinity/audit/interview) · insights · account/privacy/settings/plans.
- 그래프 마을: 기록(records)·위키(wiki). 기타: formats · import · inbox · journal · manual · research.
- → 실행자가 전 라우트 조사 후 simple 원칙으로 화면·하위 구조 설계(각 화면 1목적). 프로필/설정 버튼(요청1)=profile/settings 직통.

**진행 방식**
- 대규모·다화면 → **4-AI 분산**: Codex=화면 UI·아이콘·에셋 · AG=반응형/디바이스 QA · Grok=정보구조 소비자 검증. 오케스트레이터 통합·머지.
- IA/디자인/네이밍 결정 = **§35 ai-debate**(혼자 결정 X). UI=design-first.
- **단계적**(각 단계 `## DONE` 보고): ① IA 맵 + 디자인 토큰(눈색 팔레트) → ② 레이아웃(요청1 적용) → ③ 전 기능 simple 화면 스켈레톤 → ④ 작동 와이어링.

**수용 기준**: 2ndb 전 기능 진입 가능(누락0) / 화면당 1목적·최소 / nav 레이아웃 = 머리→(프로필·설정)→말풍선→메뉴 / 색=눈 cyan 모노톤 3색 / 독립 트랙(gameboy 미혼입) / 반응형(O-14 계승). 단계별 폰·데스크톱 스크린샷.

### [O-15 ✅ COMPLETED 2026-06-15 08:29 KST] 허브 자가점검 — 에러수정 + 규칙화 (실행 완료 → ## DONE)
[2026-06-15 / 07:49 KST] Simon 디렉터 — 허브 헬스 점검 결과(디렉터 read-only 진단). **데몬 중복만 디렉터가 즉시 정리**, 나머지는 허브 single-writer(실행자/각 AI)가 수정+규칙화. 정본: 규칙=`PROTOCOL` · 복구=`RUNBOOK` · 원장=`INCIDENTS`(append) · 반복패턴=SimonKWiki §18.

**발견 에러 + 조치**
1. 🔴 **데몬 중복**(각 AI 2개=6, 03:22+03:23 이중 런치 → cycle 중복·git race) — 디렉터가 즉시 각 AI 1개로 정리(now 3개). ▶재발방지(실행자): `tools/hub-daemon.ps1`/런처가 기동 시 동일 `-Only <ai>` 데몬이 이미 살아있으면 spawn 스킵(PID/mutex 가드). `HUB-STARTUP.html` 모드A에 "이미 떠있으면 skip" 명시. RUNBOOK에 "데몬 중복→나중 PID kill" 룩업.
2. 🟠 **codex `agents/codex/STATUS.md` 116KB 비대**(§28 size-guard 위반인데 통과) — codex가 STATUS 잘라 `.gitignore`된 `*.log`로 회전 + `commit.ps1` size-guard가 왜 통과시켰는지 조사(STATUS는 .md라 256KB 미만이면 통과 → STATUS 전용 더 낮은 캡 검토).
3. 🟠 **`tools/.watchdog-state.json` BOM**(UTF-8 no-BOM FAIL) — `hub-watchdog.ps1` 상태 저장을 UTF-8(no BOM)로 수정 + 현재 BOM 제거.
4. 🟡 **outbox frontmatter 225/1757 malformed/missing keys** — 점진 정리 또는 frontmatter 필수키 contract 명확화.
5. 🟡 **claude(실행자) `agents/claude/STATUS.md` stale(06-14)** — 실행자가 매 사이클 STATUS 1줄 갱신(§12 루프 step).

**규칙화(학습 — 핵심)**: 1~5 각각 `INCIDENTS.md`에 `[KST] | 신호 | 원인 | 복구 | 재발방지` 한 줄. 반복성(데몬중복·STATUS비대·BOM)은 `RUNBOOK` FAIL→복구 룩업 + `PROTOCOL`/per-AI `RULES` 재발방지 규칙으로 승격. hub-health가 잡는 항목(BOM/frontmatter/size)이 와치독→Claude inbox→사이클 처리(responder)로 닫히는지 확인(§13 신호→대응 루프).

**수용 기준**: 데몬 중복0 + 재기동 중복가드 / codex STATUS <캡 / watchdog-state BOM 제거 / `hub-health.ps1 -Json` FAIL=0 / INCIDENTS 5건 기록 + RUNBOOK·규칙 반영. DONE에 `hub-health -Json` 결과 첨부.

### [O-14 ✅ COMPLETED 2026-06-15 08:17 KST] landing-clone — 반응형 + 메뉴 IA + SPA 화면작동 (실행 완료 → ## DONE)
[2026-06-15 / 07:42 KST, 07:57 갱신] Simon 디렉터(모바일) — O-13 라이브 확인 후 피드백 + 07:57 추가지시(작동 화면화). 대상 동일(`landing-clone`, 8777). 검증 = 다양한 뷰포트 스크린샷 + 버튼 클릭 동작.

**A. 반응형 — 사용자 화면 비율에 적응 (현재 "중앙쯤 고정" 느낌이 문제)**
- ⚠️ Simon 피드백: 현재 nav 메뉴가 **화면 비율/크기를 고려 안 하고 그냥 중앙쯤 띄우는 느낌**. → 뷰포트 폭·높이·**aspect-ratio·orientation**에 따라 캐릭터·말풍선·메뉴의 위치와 크기를 실제 적응(고정 px/중앙 anchor 금지, vw/vh/clamp 기반 + resize 재계산).
- 캐릭터(머리) hero/nav 크기 + 말풍선 + 메뉴가 뷰포트에 맞게 스케일. 작은 폰(360) ~ 큰 데스크톱(1280+) 모두 정상.
- **좌우 여백 각 10%만** — 콘텐츠가 화면 폭 약 80%를 채운다. nav 좌상단 머리·말풍선·메뉴가 그 80% 안에, 서로 겹치지 않게. 세로(폰)면 메뉴를 머리 아래로 등 레이아웃 재배치.

**B. 메뉴 = 2ndb 정식 IA로 재구성** (현 당기/세컨비/기록/위키는 IA와 불일치)
- 정본 = `src/components/premium/tab-bar.tsx` 4 primary 탭: **그래프(`/`) · 담기(`/capture`) · 세컨비(`/secondb`) · 나(`/profile`)** (VISION 3축 IA). `당기`→**담기**, **그래프·나 추가**(누락). `기록`/`위키`는 그래프 마을 경유 2차 → **2차 그룹 시각 분리**(완전 제거는 Simon 확인).
- ⚠️ landing이 곧 홈이면 "그래프"가 자기 자신일 수 있음 — 그래프 항목 목적지는 실행자 판단 후 `## DONE`에 기재.

**C. 진입 화면 스타일 일관성**
- 연결 화면 전부 현 landing 언어(deep-space · Space Mono · 모노톤 3색 이내 · crisp, bounce/elastic 금지). 2ndb 본체 gameboy 트랙과 섞지 말 것(이 프로토타입=deep-space 독립 트랙). 모호하면 `## DONE`에 질문.

**D. 메뉴 버튼 실제 작동 — "랜딩"에서 "제어 가능한 화면"으로 (신규 핵심)**
- 각 메뉴 버튼 클릭 시 **실제로 해당 화면으로 전환**(현재 무동작 → 작동). landing-clone 단일 페이지를 **경량 SPA(클라이언트 뷰 라우팅)** 로: nav 메뉴 → 선택 화면 표시 + **뒤로(홈/머리 복귀)**. 히스토리/뒤로가기(popstate) 연동 권장.
- 1차(이번): 4개 화면(그래프·담기·세컨비·나) 각각 deep-space **기능 스켈레톤** — 담기=입력창, 세컨비=대화 UI, 그래프=노드/리스트, 나=프로필 카드. 실제 데이터 연동은 후속 오더.
- 마스코트(머리)는 각 화면에서 작은 동행 요소로 유지. **hero(중앙) ↔ nav(메뉴) ↔ screen(기능) 3-state** 전환, 전부 부드러운 ease(bounce 금지).
- ⚠️ 프로토타입 내 화면 — 2ndb 본체(RN) 이식은 별도 트랙. 여기선 인터랙션·레이아웃 검증이 목표.

**수용 기준**: (반응형) 360/768/1280px + 가로/세로에서 **중앙고정 느낌 없이 비율 적응** / (메뉴) primary 4탭(앱 라벨)+records/wiki 2차 / (작동) 각 버튼 클릭→해당 화면 전환 + 뒤로 동작 / 모노톤·crisp·ease 유지. 스크린샷: 폰세로·데스크톱에서 각 화면 전환 전후.

### [O-13 ✅ COMPLETED 2026-06-15 04:08 KST] landing-clone hero→nav 상태 전환 (실행 완료 → ## DONE)
[2026-06-15 / 03:42 KST] Simon 디렉터(모바일) — 로그인 후 홈 화면 인터랙션 구현.
- **대상**: `E:\2ndB\landing-clone` (gitignored 프로토타입). 서빙 = `http://127.0.0.1:8777/index.html?head-follow-v7c` (python http.server). 검증 = 8777 스크린샷.
- **비전 (Simon)**: 로그인 후 진입하면 화면 **한가운데 로봇 머리가 사용자를 바라본다**(현 hero 상태). 사용자가 **화면을 터치하면** 로봇이 **좌상단으로 "확!"** 옮겨지고, 그 **오른쪽에 말풍선**, 그 **하단에 각 기능 진입 메뉴**가 뜬다.

**구현 스펙 (디렉터 설계 — anti-slop: 기존 deep-space·Space Mono·crisp 유지, bounce/elastic 금지)**
- 상태머신 `mode: 'hero' | 'nav'` 를 `main.js`에 추가.
  - `hero`: 머리 중앙 + 포인터 응시(현행 유지).
  - 터치(빈 화면/머리 클릭) → `nav` 전환: 머리 **좌상단 이동 + 축소(~45%)**, ease-out ~300ms("확!"; bounce 금지). 좌상단에서도 포인터 계속 응시.
  - `nav`: 머리 **우측 말풍선**(fade+slide-in) → 그 **하단 기능 메뉴**(stagger fade-in). 머리 이동 먼저 → 말풍선/메뉴 순차 등장.
  - 복귀: 빈 영역/머리 재클릭 → hero 중앙 복귀.
- **메뉴 항목 (2ndb 핵심 4)**: 당기(capture) · 세컨비(secondb) · 기록(records) · 위키(wiki). 라벨만이라 추후 조정 가능.
- **말풍선**: 환영/안내 placeholder(예: "무엇을 기록해볼까?"). 최종 카피는 후속 오더.
- 현 `click=cycleExpression`(표정순환)은 전환 클릭과 충돌 금지 — nav 상태 머리 클릭으로 옮기거나 자율행동에 양보.
- **파일**: `landing-clone/index.html`(말풍선·메뉴 DOM) · `main.js`(상태머신·전환) · `styles.css`(nav 레이아웃, deep-space 토큰 유지).
- ⚠️ landing-clone은 **gitignored** → git 커밋엔 안 들어감. 결과는 **8777 before/after 스크린샷 2컷**으로 회신.

**수용 기준**: hero에서 터치 → 머리 좌상단 "확" 이동 + 말풍선 + 메뉴 4개 노출 → 복귀 동작. 모노톤·crisp 유지, 부드러운 ease(즉각 cut/바운스 금지), 60fps. 디버그훅(`data-second-b-head-*`) 깨지지 않게.

### [O-12 follow-up / 2026-06-08] 폰트 A 확정 + Phase C/D 나머지 완주
Simon: 폰트 A(2.5MB 유지). 나머지 Phase 진행.

**폰트 결정**: Galmuri11 subset 2.5MB 현행 유지 (tofu 없음, 안전). 추가 축소 불필요.

---

#### Phase D 나머지

**초기 줌 — Soul Core 중앙·크게**
- 앱 첫 진입 시 초기 zoom 레벨: Soul Core가 화면 상단 40% 영역을 차지하도록 설정
- 현재 기본 zoom이 너무 축소돼 노드가 작게 보이면 → initialScale 값 올리기
- Soul Core가 첫 시선을 완전히 지배해야 함

**픽셀 파워온 스캔라인 sweep**
- 첫 그래프 진입 시 (로그인 후 또는 앱 재개 시):
  - 검정 화면에서 시안 스캔라인이 위→아래 sweep (duration 180ms)
  - sweep 완료 후 그래프 순차 fade-in (Soul Core 0ms → Pattern Core 150ms → Snowflake 300ms → Links 450ms)
  - reduced-motion: sweep 생략, 그래프 즉시 표시
- 구현: `PowerOnOverlay` 컴포넌트 (useEffect + Animated)

---

#### Phase C — 전화면 상호작용 감사 (browse + AG)

browse 도구로 실제 사이트 접속, 모든 화면 인터랙션 수행 후 결과 스크린샷 첨부.

**감사 대상 + 체크포인트**:

1. **홈(그래프) 첫 로드** — 파워온 sweep 동작 / 첫 화면 깔끔한가 / Soul Core 지배적인가
2. **코어 탭 → 드릴다운** — recede 즉각적인가 / bottom sheet 노드 안 가리는가
3. **눈송이 탭** — bottom sheet로만 노출되는가 / 배경 dim 되는가
4. **당기(캡처)** — 입력창 1st-CTA / 키보드 가림 없는가
5. **세컨비** — 입력창 겹침 없는가 / 헤더 최소화 확인
6. **나(프로필)** — 구독 카드 1st 시선 / 설정 1-depth 확인
7. **에셋 크기** — 아이콘·노드·버튼 크기가 서로 대비 있고 균형 맞는가
8. **게임보이 스타일** — 모든 화면 픽셀 마커·테두리·폰트 적용됐는가

발견된 모든 문제 즉시 수정 → 원자 커밋 → 재확인.
최종 before/after 스크린샷 6컷 + 라이브 URL.


### [O-12 / 2026-06-08] 게임보이 강화 + 전화면 상호작용 감사 + 첫인상 수정
Simon:
- 게임보이 폰트 유지 (Galmuri11 subset 300KB)
- 게임보이 현행 유지 + 픽셀 느낌 더 강하게
- 모든 화면 상호작용하고 결과 관찰 (겹침·크기·UI/UX 재확인)
- 메인화면 첫 로드부터 뒤죽박죽 → 터치하고 싶게 만들어라

---

#### Phase A — 폰트 subset (즉시)
- Galmuri11 5.25MB → 한글 완성형+자모+라틴 기본만 추출 subset (~300KB)
- subset 도구: `pyftsubset` 또는 `fonttools` (Codex 담당)
- subset 범위: U+AC00-D7A3 (한글 완성형) + U+0020-007E (라틴 기본) + U+3131-318E (자모)
- 결과 파일: `assets/fonts/Galmuri11-subset.ttf` + `Galmuri11-subset.woff2`
- typography.ts fontFamily 참조 경로 업데이트

---

#### Phase B — 게임보이 픽셀 강도 UP

현재 값들을 더 강하게:

**테두리·섀도**
- pixel-shadow: 3px 3px → **4px 4px** (더 두꺼운 오프셋)
- gb-border opacity: 0.35 → **0.55** (더 선명한 테두리)
- 버튼 press translateY: 2px → **3px** (더 눌리는 느낌)

**스캔라인·배경**
- scanline-opacity: 0.04 → **0.07** (LCD 느낌 강화)
- dot-matrix 배경: opacity 0.05 → **0.08**, 간격 8px → **6px** (더 촘촘한 픽셀 격자)

**카드·패널 픽셀 코너 마커 추가**
- 카드 4 모서리에 3×3px 시안 픽셀 마커 (L자 꺾인 선) — 게임보이 UI 트레이드마크
- 구현: `PixelCorner` 컴포넌트 (absolute, 4 corners)

**그래프 dash 강화**
- 엣지 dash: 4px/4px → **3px/3px** (더 세밀한 픽셀 점선)
- 픽셀 글로우 halo: 현재 3겹 → **4겹** (1/2/3/5px, opacity 0.65/0.35/0.18/0.06)

**폰트 적용 확대**
- 현재 라벨·버튼만 Galmuri11 → 탭바 타이틀·섹션 헤더·카드 제목도 Galmuri11로

---

#### Phase C — 전화면 상호작용 감사 (browse + AG 에뮬)

**관찰 방식**: browse 도구로 각 화면 스크린샷 + 모든 인터랙션 수행 후 결과 캡처.

**화면별 체크리스트:**

**[홈 — 그래프 메인]**
- [ ] 첫 로드 순간 스크린샷 → 뭐가 보이는가
- [ ] Soul Core 위치·크기 — 화면에서 지배적인가
- [ ] 노드 라벨 겹침 없는가
- [ ] 카드 2개 — 노드 가리는가
- [ ] 첫 터치 유도 요소가 명확한가 (시선이 1곳으로 모이는가)

**[드릴다운 — 코어 탭]**
- [ ] 탭 후 recede 즉각적인가
- [ ] 선택 코어 + 눈송이만 남는가
- [ ] bottom sheet 위치 — 노드 가리는가
- [ ] 뒤로 가기 1곳만인가

**[당기 — 캡처]**
- [ ] 입력창이 첫 시선을 받는가
- [ ] 키보드 올라올 때 상단 가려지는가 (재확인)
- [ ] 블록 목록 스크롤 영역 겹침 없는가

**[세컨비]**
- [ ] 입력창이 메시지 영역 가리는가
- [ ] 메시지 버블 크기 적정한가
- [ ] 타이핑 중 화면 레이아웃 변화 관찰

**[나 — 프로필]**
- [ ] 구독 카드가 1st 시선 받는가
- [ ] 설정 진입 경로 1곳인가
- [ ] 에셋(아바타·아이콘) 크기 다른 요소와 균형 맞는가

**[온보딩]**
- [ ] 게임보이 스타일 적용됐는가 아니면 exempt인가
- [ ] CTA 1개인가

**에셋 크기 체크**
- 각 화면 아이콘 시각적 크기 — 텍스트와 대비 정합한가
- 터치 타깃 48dp 실제 눈으로 확인

---

#### Phase D — 메인화면 첫인상 수정 (최우선)

Simon 피드백: "메인화면 뜨는 순간부터 뒤죽박죽"

진단 후 수정:
1. **로드 시퀀스**: 모든 노드 동시 등장 → **순차 fade-in**
   - Soul Core 먼저(0ms) → Pattern Core(150ms) → Snowflake(300ms) → Links(450ms)
   - 첫 로드에 "살아나는" 느낌, chaos 제거
2. **초기 줌 레벨**: 첫 로드 시 Soul Core를 화면 중심으로 충분히 크게
   - 배율이 낮으면 노드들이 작아 구분 안 됨 → 적정 초기 배율 고정
3. **카드 초기 상태**: 로드 직후 카드 2개 자동 노출 → **숨김 기본, 첫 터치 후 등장**
   - 첫 화면 = 그래프만 (최소화)
4. **라벨**: 로드 직후 전 라벨 표시 → **hover/탭 후 노출** (기본 숨김)
5. **픽셀 부팅 애니메이션**: 첫 진입 시 게임보이 파워온 효과
   - 화면이 위아래로 스캔라인 sweep → 그래프 등장 (100ms)

각 수정 원자 커밋 + before/after 스크린샷.
수정 후 최종 라이브 URL: https://simon-yhkim.github.io/2nd-B/


### [O-11 / 2026-06-08] 4-AI 리뷰 — 코드 + 디자인 (PR #266-#275)
Simon: 4AI 리뷰 진행해. 코드 및 디자인 관련해서.

**리뷰 범위**: PR #266-#275 (O-7 터치단순화 ~ O-9/10 게임보이 완주)
**변경 파일**: NavGraph.tsx · surfaces.tsx · tab-bar.tsx · graph-bits.tsx · capture.tsx · secondb.tsx · profile.tsx · settings.tsx · gameboy-tokens.ts · tokens.ts · typography.ts · pixel-physical.ts · Input.tsx · Text.tsx · SceneHero.tsx · DrillProgress.tsx (37개)

---

#### AI 분담

**[Claude — 디자인 시스템 정합성]**
- gameboy-tokens.ts ↔ DESIGN.md 스펙 1:1 대조 (토큰명·값 일치 여부)
- 수정된 37개 파일 중 하드코딩 hex/rgba 잔존 검사 (tokens.ts 미경유 값)
- 4-tier 시각 규칙 회귀 체크 (128/82/38/30px, tier2≥tier1 금지, 링크 전부 시안)
- 정보밀도 규칙 회귀 (화면당 핵심 1개, 겹침 제로) 전 화면 교차 확인
- Galmuri11/Press Start 2P 실제 적용 범위 — 미적용 라벨 잔존 목록

**[Codex — 코드 품질 adversarial 리뷰]**
- PR #266-#275 diff 전체 독립 리뷰 (pass/fail gate)
- TypeScript 타입 오류·any 사용 탐지
- 렌더 내 무거운 연산·불필요한 리렌더 탐지
- pixel-physical.ts steps() easing 구현 정확성
- 애니메이션 Animated.Value/useNativeDriver 정합성 (크래시 위험 — #251 회귀)
- 새 컴포넌트 테스트 커버리지 갭
- 결과: PASS / FAIL + 수정 필요 항목 목록

**[AG — Android 디바이스 QA]**
에뮬레이터 전체 터치 플로우:
1. 홈(그래프) — 게임보이 스타일 렌더링 (직각 테두리·픽셀 글로우·dash 엣지 가시성)
2. 코어 탭 → 드릴다운 — recede 0.12 정상·카드 가림 없음·bottom sheet
3. 당기(캡처) — 키보드 올라올 때 가림 없음·입력창 1st-CTA
4. 세컨비 — 입력창 메시지 비겹침·헤더 최소화
5. 나(프로필) — 설정 1-depth 진입 정상
6. 폰트: Galmuri11(한글)·Press Start 2P(영문) Android 로드 확인
7. 터치 타깃 48dp 실측
8. 픽셀 drop shadow Android 렌더 확인 (iOS와 다를 수 있음)
스크린샷 각 화면 첨부

**[Grok — 전략 + 접근성 크로스컷]**
- 게임보이 스타일이 제품 비전("듣기 먼저") + XPRIZE 심사 인상과 정합하는가
- WCAG AA 대조비 새 gb-* 토큰으로 재산정 (gb-screen bg + gb-ink text, gb-accent)
- 번들 사이즈 영향: Galmuri11+Press Start 2P 폰트 추가 (KB)
- 게임보이 스타일 미적용 화면 누락 탐지 (온보딩·에러·빈 상태)
- simon-design-first AI slop 최종 잔존 탐지

---

#### 합성 + 산출물
4개 AI 결과 취합 → 우선순위 수정 목록:
- P0 (크래시/접근성): 즉시 수정
- P1 (시각 회귀): 다음 커밋
- P2 (polish): 별도 정리 커밋

결과 리포트: `agents/claude/outbox/20260608-4ai-review-report.md`
라이브 재확인 URL: https://simon-yhkim.github.io/2nd-B/


### [O-10 / 2026-06-08] GOAL — 디자인 완성형 (O-8 결정 + O-9 Phase 2-4 완주)
Simon: 디자인을 완성형으로. /goal.

**미션**: O-8 보류 5개 항목 → Dispatch 결정 적용. O-9 Phase 2-4 완주. 결과 = 모든 화면 게임보이 픽셀 완성형.

---

#### ① O-8 보류 결정사항 — Dispatch에서 확정, PC-Claude 즉시 적용

**1. 정보 IA (화면당 핵심 1개)**
- 당기(캡처): 1st-CTA = "기록 시작" 텍스트 입력영역. 나머지(카테고리·태그·이전 기록) → 탭 후 노출
- 세컨비: 1st-CTA = 메시지 입력창. 헤더 정보는 최소화 (1줄)
- 나(프로필): 1st-CTA = 구독 상태 카드. 설정 진입은 아이콘 하나로
- 홈: 그래프 자체가 CTA — 별도 버튼/텍스트 추가 금지
- 프로필↔설정 중복 네비: **나(プロフィール) 탭이 허브**. 설정은 나 탭 내 1-depth

**2. Danger 버튼 색**
- DESIGN.md 스펙대로 → solid zoneRed(#FF7A90) + white 텍스트로 교체

**3. 타입스케일**
- 정본: 12/14/16/20/25/31/39px (cosmic tokens 기준) — 11/13 인스턴스 전부 12/14로 스냅

**4. 카피·라벨**
- "Touch!" 영문 유지 (브랜드 보이스, 의도적)
- 7자 초과 한국어 라벨 → PC-Claude 자율 축약 권한 부여
- 화면 제목: 최대 5자 (당기/세컨비/나/그래프 — 이미 짧음)

**5. ✕/✓ SVG**
- 신규 제작 말고 react-native-svg Path 재사용 (X = `M 4 4 L 12 12 M 12 4 L 4 12`, ✓ = `M 3 7 L 7 11 L 13 5`)

---

#### ② O-9 Phase 2 — 컴포넌트 픽셀화 (gameboy-tokens 적용)

gameboy-tokens.ts는 존재. 이제 실제 컴포넌트에 적용:

**버튼 (PrimaryButton, SecondaryButton, DangerButton)**
- borderRadius: 0 (gb.radii.none)
- border: 2px solid gb.border
- pressedStyle: { transform: [{ translateY: 2 }], boxShadow: 'none' }
- resting: boxShadow: `3px 3px 0px ${gb.border}` (no blur)
- 폰트: Galmuri11 (라벨), 사이즈 12-14px

**카드·BottomSheet·모달 헤더**
- borderRadius: 0
- border: 1px solid gb.border (상단만 2px)
- 내부 padding: 16px (8px 그리드)
- 제목: Galmuri11, 본문: Pretendard readable

**TextInput·입력창**
- borderRadius: 0
- border: 1px solid gb.borderDim
- focus: border 2px solid gb.accent
- 플레이스홀더: mistGray

**탭 바·네비게이션**
- 활성 탭: backgroundColor gb.ink, color gb.screen (반전 블록)
- 비활성: backgroundColor transparent, color gb.ink + border gb.borderDim
- 언더라인 제거

---

#### ③ O-9 Phase 3 — 그래프 노드 픽셀 글로우

테서랙트 큐브 아트는 유지. 픽셀 글로우만 교체:
- 글로우: CSS shadow(blur) → 1px solid border 중첩 3겹 + 알파 체감
  - 겹 1: 1px, opacity 0.6
  - 겹 2: 2px, opacity 0.3  
  - 겹 3: 4px, opacity 0.1
- 링크(edge): 현재 실선 → dash 4px gap 4px (시안 유지)
- 배경: dot-matrix 오버레이 (1px dot, 8px 간격, opacity 0.05)

---

#### ④ O-9 Phase 4 — 애니메이션 픽셀 피지컬

- 화면 전환: duration 100ms, easing 'steps(3)' 또는 Easing.linear
- 드릴다운 recede: duration 80ms (현재보다 2배 빠르게)
- 버튼 press: duration 60ms, no spring
- reduced-motion: 모든 steps() → 즉시(duration 0)

---

#### ⑤ 완성 검증

- 화면별 before/after 스크린샷 6컷 (홈/당기/세컨비/나/드릴다운/온보딩)
- 라이브 URL: https://simon-yhkim.github.io/2nd-B/
- CI green 확인
- DESIGN.md 최종 업데이트 (gameboy section + 결정사항 반영)


### [O-9 / 2026-06-08] 전체 UI — 게임보이 스타일 리팩토링 (모든 화면)
Simon: UI 스타일 전체를 게임보이 스타일로. 모든 화면에 대해.

**디자인 방향**: 다크 우주 배경은 유지. 그 위에 픽셀 아트 게임보이 레이어.
현재 cosmic 팔레트 + 픽셀 미학 결합 = "Deep Space Game Boy"

---

#### Phase 1 — 토큰 + 타이포그래피 (기반)
**폰트 교체**:
- Display/헤더/주요 라벨: `Galmuri11` (오픈소스 한국어 픽셀폰트, Google Fonts)
  - 영문 전용 UI: `Press Start 2P` (Google Fonts, 레트로 픽셀)
- Body(긴 본문): Pretendard 유지 (가독성 — 픽셀폰트는 소체에서 읽기 어려움)
- 적용 위계: 화면 제목·버튼·탭·레이블 → 픽셀폰트 / 일기본문·챗·설명 → Pretendard
- @expo-google-fonts 또는 assets/fonts에 번들

**게임보이 토큰 추가** (`src/lib/theme/gameboy-tokens.ts`):
```
px border: 2px solid (no anti-alias feel)
border-radius: 0px (sharp corners — pixel 정사각 픽셀)
pixel-shadow: 3px 3px 0px (offset drop shadow, no blur)
scanline-opacity: 0.04
grid: 8px (4px → 8px로 확대)
```

**팔레트 매핑** (cosmic 토큰은 유지, pixel-semantic 추가):
- `gb-screen`: #070A18 (현재 space950, LCD 화면색)
- `gb-ink`: #E8ECF8 (현재 moonWhite, 픽셀 텍스트)
- `gb-accent`: #4CC9F0 (현재 signalBlue, 시안 액센트)
- `gb-power`: #72F2C7 (현재 signalMint, 활성 파워 표시)
- `gb-amber`: #FFD166 (현재 pixelLamp, 픽셀 경고/강조)
- `gb-border`: rgba(76,201,240,0.35) (픽셀 아트 테두리)

---

#### Phase 2 — 컴포넌트 픽셀화 (버튼·카드·입력창)
**버튼**:
- border-radius: 0px
- border: 2px solid gb-border
- pixel drop shadow: 3px 3px 0px gb-border (pressed → shadow 0, translate +3+3)
- active 상태: 블록이 눌리는 느낌 (translateY(2px))
- 픽셀폰트 라벨

**카드·Sheet·모달**:
- 날카로운 직각 모서리
- 상단 바 (게임보이 스크린 프레임) 2px 테두리
- 내부 여백 16px (8px 그리드)
- 제목 픽셀폰트, 내용 Pretendard

**입력창(TextInput)**:
- 1px inset border (recessed look)
- 포커스 시 테두리 gb-accent 2px
- 커서: 1px 블리크(blink) 커서

**탭·네비게이션**:
- 활성 탭: 반전(bg=gb-ink, text=gb-screen) 픽셀 블록
- 비활성: 아웃라인만
- 선택 표시: 2px 언더라인 대신 픽셀 블록 채우기

---

#### Phase 3 — 그래프 노드 픽셀 아트
**노드 렌더링**:
- Soul Core(tier1 128px): 8×8 픽셀 큐브 아트 또는 현재 테서랙트 유지 + 픽셀 글로우
- Pattern Core(tier2 82px): 6×6 픽셀 다이아몬드 또는 크리스탈 픽셀화
- Pattern Data(tier3 38px): 픽셀 눈송이 (현재 SVG를 픽셀 그리드 버전으로)
- Pattern Link(tier4 30px): 픽셀 크리스탈 점
- 링크(edge): 1px 점선 또는 픽셀 파선 (시안, 대시 4px·갭 4px)
- 글로우: CSS shadow가 아닌 픽셀 halo (1px border 중첩 4개, 알파 체감)

**배경**:
- 미세 dot-matrix 패턴 (1px dot, 8px 간격, opacity 0.06) — LCD 화면 느낌
- 현재 파티클은 8px 스냅 이동으로 교체

---

#### Phase 4 — 애니메이션 게임보이 피지컬
- duration: 80-120ms (빠르고 스냅)
- easing: steps(4) 또는 linear (픽셀 프레임 전환 느낌)
- 화면 전환: 8px 블록 슬라이드 (smooth scroll 대신)
- 드릴다운 recede: opacity step (0.15 즉시, 트윈 없이) 또는 2-frame tween
- reduced-motion: steps() → 즉시 전환

---

#### 산출물
- DESIGN.md 게임보이 섹션 추가 (폰트·토큰·컴포넌트 가이드)
- gameboy-tokens.ts 신규
- 화면별 before/after (당기·세컨비·나·그래프)
- 라이브 URL 갱신
- 모든 수정 원자적 커밋 (Phase별)


### [Standing Rule — 정보 밀도] 화면당 핵심 1개 + 그래픽 1개
Simon: 한 번에 너무 많은 정보가 있는 것도 문제. 전달하고 싶은 내용과 그래픽만 간단하게.

**규칙 (O-8 및 모든 화면에 적용)**:
- 화면당 전달 핵심 메시지 1개만 — 나머지 텍스트/라벨은 제거
- 그래픽(비주얼) 1개가 그 메시지를 보조 — 그래픽이 곧 설명
- 설명 텍스트가 필요하다면 그래픽이 실패한 것 → 그래픽을 바꿀 것
- 정보는 탭·드릴다운 후에만 노출 (최초 화면 = 미끼, 세부 = 낚시)


### [O-8 / 2026-06-08] simon-design-first 감사 + 비그래프 화면 UX 간소화 (O-6 통합)
Simon: SimonK Stack 디자인 스킬을 전 화면에 적용해서 감사·수정하자. O-6(비그래프 화면 UX 간소화)도 함께 통합.

**배경**: E:\SimonK-stack의 simon-design-first·design-review·design-chapters 스킬 원칙 적용.

#### Phase 1 — 비그래프 화면 UX 간소화 (당기·세컨비·나·온보딩)
**원칙**: "처음 3초 안에 손이 가는 곳이 1개만 보여야 한다"
- 각 화면 첫 CTA → 단 1개만 남김 (나머지는 2차 동선)
- 레이블 최대 7자, 설명 텍스트 2줄 이하
- 여백 충분히 — 4px 그리드 기반, density 낮춤
- 빈 상태(empty state) 전 화면 문구 정의

#### Phase 2 — simon-design-first AI Slop 감사 · 수정
**폰트**
- Pretendard Variable 사용 확인 (Inter·System UI 금지)
- word-break: keep-all 전 한국어 텍스트 확인
- 타입 스케일 준수: 12/14/16/20/25/31/39px (1.25배율) — 임의 사이즈 제거

**색상**
- 한 화면 활성 브랜드 컬러 3개 이하 준수
- 보라→핑크 그라디언트 패턴 탐색·제거
- 순수 #000/#fff 하드코딩 탐색 → cosmic 팔레트 토큰으로 교체

**계층 (4가지 도구만: Scale·Color·Weight·Spacing)**
- 그림자·테두리·아이콘·배지로 계층 나타내는 패턴 제거
- 정당화 못 하는 요소 삭제 (존재 이유 없으면 OUT)
- 가운데 정렬(all-center) 패턴 → 좌정렬 개편

**인터랙션 상태**
- 버튼/탭/입력창 8상태: rest·hover·focus·active·disabled·loading·success·error
- 로딩·에러·빈 상태 전 화면 정의 확인

**AI 슬롭 패턴 제거**
- emoji 아이콘 → SVG 아이콘으로 교체
- bouncy/spring easing → ease-in-out cubic으로 교체
- 모든 요소 4px 스냅 확인 (8px 기본 여백, 16/24/32 spacing ladder)

**접근성**
- WCAG AA: 텍스트 4.5:1 / UI 컴포넌트 3:1 대조비
- 터치 타깃 44×44dp 이상 (O-7 48dp 기준과 정합)
- reduced-motion 미처리 애니메이션 전수 확인

#### 산출물
- 화면별 before/after 스크린샷 (당기·세컨비·나·그래프 드릴다운)
- 위반 항목 목록 + 수정 커밋 (원자적, 한 커밋 = 한 범주)
- 라이브 확인 URL 갱신


### [O-7 / 2026-06-08] 터치 인터랙션 단순화 — 겹침·가림 제로
Simon: 터치할 때마다 너무 복잡하다. 겹치는 것 없게, 가려지는 것 없게.

**핵심 원칙:** 터치 1회 → 화면이 단순해져야 한다.

1. **그래프 드릴다운 탭 시**
   - 선택 코어 + 하위 데이터 노드만 남김. 나머지 opacity 0.15 이하 완전 recede
   - 인사이트 카드가 노드를 절대 가리지 않음 — 카드는 하단 고정 영역
   - 라벨·카드·노드 3중 겹침 구간 제거

2. **눈송이(데이터 노드) 탭 시**
   - 상세 내용은 bottom sheet으로만 (모달이 노드를 가리는 패턴 금지)
   - 배경 노드는 dim/blur로 뒤로

3. **전체 공통**
   - 터치 영역 48dp 이상 확보 (오인 터치 방지)
   - 새 요소가 기존 요소 위에 겹쳐 올라오는 패턴 금지 → 화면 전환 or bottom sheet
   - 뒤로 가기는 단 1곳에만

4. **당기(캡처)**
   - 키보드 올라올 때 상단 요소 가려지는 문제 수정

5. **세컨비**
   - 입력창이 메시지에 겹치지 않도록 KeyboardAvoidingView 점검

검증: AG Android 에뮬 전체 터치 플로우 + 라이브 URL + before/after 스크린샷
<!-- Simon(또는 모바일 AI)이 여기에 추가. 템플릿:
### [O-<번호> / <YYYY-MM-DD HH:MM>] <짧은 제목>
<오더 내용. 어떤 화면/기능/수정인지 구체적으로. 라이브 확인 원하면 명시.>
-->

### [O-4 part2] NavGraph 트리 재설계 — 🔄 단계별 진행중 (P1·P7 라이브)
P1(구조 재루팅)·P7(눈송이 홈노출) 머지·라이브 완료 → DONE 참조. 남은 단계 P2(크기위계)·P5(시안링크)·P3(주황제거+큐브색)·P6(글로우)·P9(카드)·P11(모션) 계속 진행 중. 완료 시 DONE 갱신.
(O-4 part1 애널리틱스 ✅·O-5 ✅ → DONE. 추가 오더는 여기에.)

---

---

## 이동분 B — 구 프리앰블 중복 블록 (O-8~O-12 사본, 06-08 빈티지)

### [O-12 follow-up / 2026-06-08] 폰트 A 확정 + Phase C/D 나머지 완주
Simon: 폰트 A(2.5MB 유지). 나머지 Phase 진행.

**폰트 결정**: Galmuri11 subset 2.5MB 현행 유지 (tofu 없음, 안전). 추가 축소 불필요.

---

#### Phase D 나머지

**초기 줌 — Soul Core 중앙·크게**
- 앱 첫 진입 시 초기 zoom 레벨: Soul Core가 화면 상단 40% 영역을 차지하도록 설정
- 현재 기본 zoom이 너무 축소돼 노드가 작게 보이면 → initialScale 값 올리기
- Soul Core가 첫 시선을 완전히 지배해야 함

**픽셀 파워온 스캔라인 sweep**
- 첫 그래프 진입 시 (로그인 후 또는 앱 재개 시):
  - 검정 화면에서 시안 스캔라인이 위→아래 sweep (duration 180ms)
  - sweep 완료 후 그래프 순차 fade-in (Soul Core 0ms → Pattern Core 150ms → Snowflake 300ms → Links 450ms)
  - reduced-motion: sweep 생략, 그래프 즉시 표시
- 구현: `PowerOnOverlay` 컴포넌트 (useEffect + Animated)

---

#### Phase C — 전화면 상호작용 감사 (browse + AG)

browse 도구로 실제 사이트 접속, 모든 화면 인터랙션 수행 후 결과 스크린샷 첨부.

**감사 대상 + 체크포인트**:

1. **홈(그래프) 첫 로드** — 파워온 sweep 동작 / 첫 화면 깔끔한가 / Soul Core 지배적인가
2. **코어 탭 → 드릴다운** — recede 즉각적인가 / bottom sheet 노드 안 가리는가
3. **눈송이 탭** — bottom sheet로만 노출되는가 / 배경 dim 되는가
4. **당기(캡처)** — 입력창 1st-CTA / 키보드 가림 없는가
5. **세컨비** — 입력창 겹침 없는가 / 헤더 최소화 확인
6. **나(프로필)** — 구독 카드 1st 시선 / 설정 1-depth 확인
7. **에셋 크기** — 아이콘·노드·버튼 크기가 서로 대비 있고 균형 맞는가
8. **게임보이 스타일** — 모든 화면 픽셀 마커·테두리·폰트 적용됐는가

발견된 모든 문제 즉시 수정 → 원자 커밋 → 재확인.
최종 before/after 스크린샷 6컷 + 라이브 URL.


### [O-12 / 2026-06-08] 게임보이 강화 + 전화면 상호작용 감사 + 첫인상 수정
Simon:
- 게임보이 폰트 유지 (Galmuri11 subset 300KB)
- 게임보이 현행 유지 + 픽셀 느낌 더 강하게
- 모든 화면 상호작용하고 결과 관찰 (겹침·크기·UI/UX 재확인)
- 메인화면 첫 로드부터 뒤죽박죽 → 터치하고 싶게 만들어라

---

#### Phase A — 폰트 subset (즉시)
- Galmuri11 5.25MB → 한글 완성형+자모+라틴 기본만 추출 subset (~300KB)
- subset 도구: `pyftsubset` 또는 `fonttools` (Codex 담당)
- subset 범위: U+AC00-D7A3 (한글 완성형) + U+0020-007E (라틴 기본) + U+3131-318E (자모)
- 결과 파일: `assets/fonts/Galmuri11-subset.ttf` + `Galmuri11-subset.woff2`
- typography.ts fontFamily 참조 경로 업데이트

---

#### Phase B — 게임보이 픽셀 강도 UP

현재 값들을 더 강하게:

**테두리·섀도**
- pixel-shadow: 3px 3px → **4px 4px** (더 두꺼운 오프셋)
- gb-border opacity: 0.35 → **0.55** (더 선명한 테두리)
- 버튼 press translateY: 2px → **3px** (더 눌리는 느낌)

**스캔라인·배경**
- scanline-opacity: 0.04 → **0.07** (LCD 느낌 강화)
- dot-matrix 배경: opacity 0.05 → **0.08**, 간격 8px → **6px** (더 촘촘한 픽셀 격자)

**카드·패널 픽셀 코너 마커 추가**
- 카드 4 모서리에 3×3px 시안 픽셀 마커 (L자 꺾인 선) — 게임보이 UI 트레이드마크
- 구현: `PixelCorner` 컴포넌트 (absolute, 4 corners)

**그래프 dash 강화**
- 엣지 dash: 4px/4px → **3px/3px** (더 세밀한 픽셀 점선)
- 픽셀 글로우 halo: 현재 3겹 → **4겹** (1/2/3/5px, opacity 0.65/0.35/0.18/0.06)

**폰트 적용 확대**
- 현재 라벨·버튼만 Galmuri11 → 탭바 타이틀·섹션 헤더·카드 제목도 Galmuri11로

---

#### Phase C — 전화면 상호작용 감사 (browse + AG 에뮬)

**관찰 방식**: browse 도구로 각 화면 스크린샷 + 모든 인터랙션 수행 후 결과 캡처.

**화면별 체크리스트:**

**[홈 — 그래프 메인]**
- [ ] 첫 로드 순간 스크린샷 → 뭐가 보이는가
- [ ] Soul Core 위치·크기 — 화면에서 지배적인가
- [ ] 노드 라벨 겹침 없는가
- [ ] 카드 2개 — 노드 가리는가
- [ ] 첫 터치 유도 요소가 명확한가 (시선이 1곳으로 모이는가)

**[드릴다운 — 코어 탭]**
- [ ] 탭 후 recede 즉각적인가
- [ ] 선택 코어 + 눈송이만 남는가
- [ ] bottom sheet 위치 — 노드 가리는가
- [ ] 뒤로 가기 1곳만인가

**[당기 — 캡처]**
- [ ] 입력창이 첫 시선을 받는가
- [ ] 키보드 올라올 때 상단 가려지는가 (재확인)
- [ ] 블록 목록 스크롤 영역 겹침 없는가

**[세컨비]**
- [ ] 입력창이 메시지 영역 가리는가
- [ ] 메시지 버블 크기 적정한가
- [ ] 타이핑 중 화면 레이아웃 변화 관찰

**[나 — 프로필]**
- [ ] 구독 카드가 1st 시선 받는가
- [ ] 설정 진입 경로 1곳인가
- [ ] 에셋(아바타·아이콘) 크기 다른 요소와 균형 맞는가

**[온보딩]**
- [ ] 게임보이 스타일 적용됐는가 아니면 exempt인가
- [ ] CTA 1개인가

**에셋 크기 체크**
- 각 화면 아이콘 시각적 크기 — 텍스트와 대비 정합한가
- 터치 타깃 48dp 실제 눈으로 확인

---

#### Phase D — 메인화면 첫인상 수정 (최우선)

Simon 피드백: "메인화면 뜨는 순간부터 뒤죽박죽"

진단 후 수정:
1. **로드 시퀀스**: 모든 노드 동시 등장 → **순차 fade-in**
   - Soul Core 먼저(0ms) → Pattern Core(150ms) → Snowflake(300ms) → Links(450ms)
   - 첫 로드에 "살아나는" 느낌, chaos 제거
2. **초기 줌 레벨**: 첫 로드 시 Soul Core를 화면 중심으로 충분히 크게
   - 배율이 낮으면 노드들이 작아 구분 안 됨 → 적정 초기 배율 고정
3. **카드 초기 상태**: 로드 직후 카드 2개 자동 노출 → **숨김 기본, 첫 터치 후 등장**
   - 첫 화면 = 그래프만 (최소화)
4. **라벨**: 로드 직후 전 라벨 표시 → **hover/탭 후 노출** (기본 숨김)
5. **픽셀 부팅 애니메이션**: 첫 진입 시 게임보이 파워온 효과
   - 화면이 위아래로 스캔라인 sweep → 그래프 등장 (100ms)

각 수정 원자 커밋 + before/after 스크린샷.
수정 후 최종 라이브 URL: https://simon-yhkim.github.io/2nd-B/


### [O-11 / 2026-06-08] 4-AI 리뷰 — 코드 + 디자인 (PR #266-#275)
Simon: 4AI 리뷰 진행해. 코드 및 디자인 관련해서.

**리뷰 범위**: PR #266-#275 (O-7 터치단순화 ~ O-9/10 게임보이 완주)
**변경 파일**: NavGraph.tsx · surfaces.tsx · tab-bar.tsx · graph-bits.tsx · capture.tsx · secondb.tsx · profile.tsx · settings.tsx · gameboy-tokens.ts · tokens.ts · typography.ts · pixel-physical.ts · Input.tsx · Text.tsx · SceneHero.tsx · DrillProgress.tsx (37개)

---

#### AI 분담

**[Claude — 디자인 시스템 정합성]**
- gameboy-tokens.ts ↔ DESIGN.md 스펙 1:1 대조 (토큰명·값 일치 여부)
- 수정된 37개 파일 중 하드코딩 hex/rgba 잔존 검사 (tokens.ts 미경유 값)
- 4-tier 시각 규칙 회귀 체크 (128/82/38/30px, tier2≥tier1 금지, 링크 전부 시안)
- 정보밀도 규칙 회귀 (화면당 핵심 1개, 겹침 제로) 전 화면 교차 확인
- Galmuri11/Press Start 2P 실제 적용 범위 — 미적용 라벨 잔존 목록

**[Codex — 코드 품질 adversarial 리뷰]**
- PR #266-#275 diff 전체 독립 리뷰 (pass/fail gate)
- TypeScript 타입 오류·any 사용 탐지
- 렌더 내 무거운 연산·불필요한 리렌더 탐지
- pixel-physical.ts steps() easing 구현 정확성
- 애니메이션 Animated.Value/useNativeDriver 정합성 (크래시 위험 — #251 회귀)
- 새 컴포넌트 테스트 커버리지 갭
- 결과: PASS / FAIL + 수정 필요 항목 목록

**[AG — Android 디바이스 QA]**
에뮬레이터 전체 터치 플로우:
1. 홈(그래프) — 게임보이 스타일 렌더링 (직각 테두리·픽셀 글로우·dash 엣지 가시성)
2. 코어 탭 → 드릴다운 — recede 0.12 정상·카드 가림 없음·bottom sheet
3. 당기(캡처) — 키보드 올라올 때 가림 없음·입력창 1st-CTA
4. 세컨비 — 입력창 메시지 비겹침·헤더 최소화
5. 나(프로필) — 설정 1-depth 진입 정상
6. 폰트: Galmuri11(한글)·Press Start 2P(영문) Android 로드 확인
7. 터치 타깃 48dp 실측
8. 픽셀 drop shadow Android 렌더 확인 (iOS와 다를 수 있음)
스크린샷 각 화면 첨부

**[Grok — 전략 + 접근성 크로스컷]**
- 게임보이 스타일이 제품 비전("듣기 먼저") + XPRIZE 심사 인상과 정합하는가
- WCAG AA 대조비 새 gb-* 토큰으로 재산정 (gb-screen bg + gb-ink text, gb-accent)
- 번들 사이즈 영향: Galmuri11+Press Start 2P 폰트 추가 (KB)
- 게임보이 스타일 미적용 화면 누락 탐지 (온보딩·에러·빈 상태)
- simon-design-first AI slop 최종 잔존 탐지

---

#### 합성 + 산출물
4개 AI 결과 취합 → 우선순위 수정 목록:
- P0 (크래시/접근성): 즉시 수정
- P1 (시각 회귀): 다음 커밋
- P2 (polish): 별도 정리 커밋

결과 리포트: `agents/claude/outbox/20260608-4ai-review-report.md`
라이브 재확인 URL: https://simon-yhkim.github.io/2nd-B/


### [O-10 / 2026-06-08] GOAL — 디자인 완성형 (O-8 결정 + O-9 Phase 2-4 완주)
Simon: 디자인을 완성형으로. /goal.

**미션**: O-8 보류 5개 항목 → Dispatch 결정 적용. O-9 Phase 2-4 완주. 결과 = 모든 화면 게임보이 픽셀 완성형.

---

#### ① O-8 보류 결정사항 — Dispatch에서 확정, PC-Claude 즉시 적용

**1. 정보 IA (화면당 핵심 1개)**
- 당기(캡처): 1st-CTA = "기록 시작" 텍스트 입력영역. 나머지(카테고리·태그·이전 기록) → 탭 후 노출
- 세컨비: 1st-CTA = 메시지 입력창. 헤더 정보는 최소화 (1줄)
- 나(프로필): 1st-CTA = 구독 상태 카드. 설정 진입은 아이콘 하나로
- 홈: 그래프 자체가 CTA — 별도 버튼/텍스트 추가 금지
- 프로필↔설정 중복 네비: **나(プロフィール) 탭이 허브**. 설정은 나 탭 내 1-depth

**2. Danger 버튼 색**
- DESIGN.md 스펙대로 → solid zoneRed(#FF7A90) + white 텍스트로 교체

**3. 타입스케일**
- 정본: 12/14/16/20/25/31/39px (cosmic tokens 기준) — 11/13 인스턴스 전부 12/14로 스냅

**4. 카피·라벨**
- "Touch!" 영문 유지 (브랜드 보이스, 의도적)
- 7자 초과 한국어 라벨 → PC-Claude 자율 축약 권한 부여
- 화면 제목: 최대 5자 (당기/세컨비/나/그래프 — 이미 짧음)

**5. ✕/✓ SVG**
- 신규 제작 말고 react-native-svg Path 재사용 (X = `M 4 4 L 12 12 M 12 4 L 4 12`, ✓ = `M 3 7 L 7 11 L 13 5`)

---

#### ② O-9 Phase 2 — 컴포넌트 픽셀화 (gameboy-tokens 적용)

gameboy-tokens.ts는 존재. 이제 실제 컴포넌트에 적용:

**버튼 (PrimaryButton, SecondaryButton, DangerButton)**
- borderRadius: 0 (gb.radii.none)
- border: 2px solid gb.border
- pressedStyle: { transform: [{ translateY: 2 }], boxShadow: 'none' }
- resting: boxShadow: `3px 3px 0px ${gb.border}` (no blur)
- 폰트: Galmuri11 (라벨), 사이즈 12-14px

**카드·BottomSheet·모달 헤더**
- borderRadius: 0
- border: 1px solid gb.border (상단만 2px)
- 내부 padding: 16px (8px 그리드)
- 제목: Galmuri11, 본문: Pretendard readable

**TextInput·입력창**
- borderRadius: 0
- border: 1px solid gb.borderDim
- focus: border 2px solid gb.accent
- 플레이스홀더: mistGray

**탭 바·네비게이션**
- 활성 탭: backgroundColor gb.ink, color gb.screen (반전 블록)
- 비활성: backgroundColor transparent, color gb.ink + border gb.borderDim
- 언더라인 제거

---

#### ③ O-9 Phase 3 — 그래프 노드 픽셀 글로우

테서랙트 큐브 아트는 유지. 픽셀 글로우만 교체:
- 글로우: CSS shadow(blur) → 1px solid border 중첩 3겹 + 알파 체감
  - 겹 1: 1px, opacity 0.6
  - 겹 2: 2px, opacity 0.3  
  - 겹 3: 4px, opacity 0.1
- 링크(edge): 현재 실선 → dash 4px gap 4px (시안 유지)
- 배경: dot-matrix 오버레이 (1px dot, 8px 간격, opacity 0.05)

---

#### ④ O-9 Phase 4 — 애니메이션 픽셀 피지컬

- 화면 전환: duration 100ms, easing 'steps(3)' 또는 Easing.linear
- 드릴다운 recede: duration 80ms (현재보다 2배 빠르게)
- 버튼 press: duration 60ms, no spring
- reduced-motion: 모든 steps() → 즉시(duration 0)

---

#### ⑤ 완성 검증

- 화면별 before/after 스크린샷 6컷 (홈/당기/세컨비/나/드릴다운/온보딩)
- 라이브 URL: https://simon-yhkim.github.io/2nd-B/
- CI green 확인
- DESIGN.md 최종 업데이트 (gameboy section + 결정사항 반영)


### [O-9 / 2026-06-08] 전체 UI — 게임보이 스타일 리팩토링 (모든 화면)
Simon: UI 스타일 전체를 게임보이 스타일로. 모든 화면에 대해.

**디자인 방향**: 다크 우주 배경은 유지. 그 위에 픽셀 아트 게임보이 레이어.
현재 cosmic 팔레트 + 픽셀 미학 결합 = "Deep Space Game Boy"

---

#### Phase 1 — 토큰 + 타이포그래피 (기반)
**폰트 교체**:
- Display/헤더/주요 라벨: `Galmuri11` (오픈소스 한국어 픽셀폰트, Google Fonts)
  - 영문 전용 UI: `Press Start 2P` (Google Fonts, 레트로 픽셀)
- Body(긴 본문): Pretendard 유지 (가독성 — 픽셀폰트는 소체에서 읽기 어려움)
- 적용 위계: 화면 제목·버튼·탭·레이블 → 픽셀폰트 / 일기본문·챗·설명 → Pretendard
- @expo-google-fonts 또는 assets/fonts에 번들

**게임보이 토큰 추가** (`src/lib/theme/gameboy-tokens.ts`):
```
px border: 2px solid (no anti-alias feel)
border-radius: 0px (sharp corners — pixel 정사각 픽셀)
pixel-shadow: 3px 3px 0px (offset drop shadow, no blur)
scanline-opacity: 0.04
grid: 8px (4px → 8px로 확대)
```

**팔레트 매핑** (cosmic 토큰은 유지, pixel-semantic 추가):
- `gb-screen`: #070A18 (현재 space950, LCD 화면색)
- `gb-ink`: #E8ECF8 (현재 moonWhite, 픽셀 텍스트)
- `gb-accent`: #4CC9F0 (현재 signalBlue, 시안 액센트)
- `gb-power`: #72F2C7 (현재 signalMint, 활성 파워 표시)
- `gb-amber`: #FFD166 (현재 pixelLamp, 픽셀 경고/강조)
- `gb-border`: rgba(76,201,240,0.35) (픽셀 아트 테두리)

---

#### Phase 2 — 컴포넌트 픽셀화 (버튼·카드·입력창)
**버튼**:
- border-radius: 0px
- border: 2px solid gb-border
- pixel drop shadow: 3px 3px 0px gb-border (pressed → shadow 0, translate +3+3)
- active 상태: 블록이 눌리는 느낌 (translateY(2px))
- 픽셀폰트 라벨

**카드·Sheet·모달**:
- 날카로운 직각 모서리
- 상단 바 (게임보이 스크린 프레임) 2px 테두리
- 내부 여백 16px (8px 그리드)
- 제목 픽셀폰트, 내용 Pretendard

**입력창(TextInput)**:
- 1px inset border (recessed look)
- 포커스 시 테두리 gb-accent 2px
- 커서: 1px 블리크(blink) 커서

**탭·네비게이션**:
- 활성 탭: 반전(bg=gb-ink, text=gb-screen) 픽셀 블록
- 비활성: 아웃라인만
- 선택 표시: 2px 언더라인 대신 픽셀 블록 채우기

---

#### Phase 3 — 그래프 노드 픽셀 아트
**노드 렌더링**:
- Soul Core(tier1 128px): 8×8 픽셀 큐브 아트 또는 현재 테서랙트 유지 + 픽셀 글로우
- Pattern Core(tier2 82px): 6×6 픽셀 다이아몬드 또는 크리스탈 픽셀화
- Pattern Data(tier3 38px): 픽셀 눈송이 (현재 SVG를 픽셀 그리드 버전으로)
- Pattern Link(tier4 30px): 픽셀 크리스탈 점
- 링크(edge): 1px 점선 또는 픽셀 파선 (시안, 대시 4px·갭 4px)
- 글로우: CSS shadow가 아닌 픽셀 halo (1px border 중첩 4개, 알파 체감)

**배경**:
- 미세 dot-matrix 패턴 (1px dot, 8px 간격, opacity 0.06) — LCD 화면 느낌
- 현재 파티클은 8px 스냅 이동으로 교체

---

#### Phase 4 — 애니메이션 게임보이 피지컬
- duration: 80-120ms (빠르고 스냅)
- easing: steps(4) 또는 linear (픽셀 프레임 전환 느낌)
- 화면 전환: 8px 블록 슬라이드 (smooth scroll 대신)
- 드릴다운 recede: opacity step (0.15 즉시, 트윈 없이) 또는 2-frame tween
- reduced-motion: steps() → 즉시 전환

---

#### 산출물
- DESIGN.md 게임보이 섹션 추가 (폰트·토큰·컴포넌트 가이드)
- gameboy-tokens.ts 신규
- 화면별 before/after (당기·세컨비·나·그래프)
- 라이브 URL 갱신
- 모든 수정 원자적 커밋 (Phase별)


### [Standing Rule — 정보 밀도] 화면당 핵심 1개 + 그래픽 1개
Simon: 한 번에 너무 많은 정보가 있는 것도 문제. 전달하고 싶은 내용과 그래픽만 간단하게.

**규칙 (O-8 및 모든 화면에 적용)**:
- 화면당 전달 핵심 메시지 1개만 — 나머지 텍스트/라벨은 제거
- 그래픽(비주얼) 1개가 그 메시지를 보조 — 그래픽이 곧 설명
- 설명 텍스트가 필요하다면 그래픽이 실패한 것 → 그래픽을 바꿀 것
- 정보는 탭·드릴다운 후에만 노출 (최초 화면 = 미끼, 세부 = 낚시)


### [O-8 / 2026-06-08] simon-design-first 감사 + 비그래프 화면 UX 간소화 (O-6 통합)
Simon: SimonK Stack 디자인 스킬을 전 화면에 적용해서 감사·수정하자. O-6(비그래프 화면 UX 간소화)도 함께 통합.

**배경**: E:\SimonK-stack의 simon-design-first·design-review·design-chapters 스킬 원칙 적용.

#### Phase 1 — 비그래프 화면 UX 간소화 (당기·세컨비·나·온보딩)
**원칙**: "처음 3초 안에 손이 가는 곳이 1개만 보여야 한다"
- 각 화면 첫 CTA → 단 1개만 남김 (나머지는 2차 동선)
- 레이블 최대 7자, 설명 텍스트 2줄 이하
- 여백 충분히 — 4px 그리드 기반, density 낮춤
- 빈 상태(empty state) 전 화면 문구 정의

#### Phase 2 — simon-design-first AI Slop 감사 · 수정
**폰트**
- Pretendard Variable 사용 확인 (Inter·System UI 금지)
- word-break: keep-all 전 한국어 텍스트 확인
- 타입 스케일 준수: 12/14/16/20/25/31/39px (1.25배율) — 임의 사이즈 제거

**색상**
- 한 화면 활성 브랜드 컬러 3개 이하 준수
- 보라→핑크 그라디언트 패턴 탐색·제거
- 순수 #000/#fff 하드코딩 탐색 → cosmic 팔레트 토큰으로 교체

**계층 (4가지 도구만: Scale·Color·Weight·Spacing)**
- 그림자·테두리·아이콘·배지로 계층 나타내는 패턴 제거
- 정당화 못 하는 요소 삭제 (존재 이유 없으면 OUT)
- 가운데 정렬(all-center) 패턴 → 좌정렬 개편

**인터랙션 상태**
- 버튼/탭/입력창 8상태: rest·hover·focus·active·disabled·loading·success·error
- 로딩·에러·빈 상태 전 화면 정의 확인

**AI 슬롭 패턴 제거**
- emoji 아이콘 → SVG 아이콘으로 교체
- bouncy/spring easing → ease-in-out cubic으로 교체
- 모든 요소 4px 스냅 확인 (8px 기본 여백, 16/24/32 spacing ladder)

**접근성**
- WCAG AA: 텍스트 4.5:1 / UI 컴포넌트 3:1 대조비
- 터치 타깃 44×44dp 이상 (O-7 48dp 기준과 정합)
- reduced-motion 미처리 애니메이션 전수 확인

#### 산출물
- 화면별 before/after 스크린샷 (당기·세컨비·나·그래프 드릴다운)
- 위반 항목 목록 + 수정 커밋 (원자적, 한 커밋 = 한 범주)
- 라이브 확인 URL 갱신
` 밑에 새 오더 블록 추가(아래 템플릿). Claude는 수행 후 그 블록을 `## DONE` 으로 옮기고 결과/PR/커밋 + 타임스탬프를 적는다.
>
> **규칙(허브 PROTOCOL §33 연동)**: Claude는 안전레일(파괴·실비용·secrets·안전임상·법무) 외 오더는 무확인 수행. 각 응답에 `[YYYY-MM-DD / HH:MM:SS KST]`. 머지는 CI green 별도확인 후. ORDERS.md 편집 전 `git fetch`+ff로 충돌 회피(Simon과 동시편집 가능).

---
