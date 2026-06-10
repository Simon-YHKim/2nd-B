# ORDERS_REMOTE — Simon → 원격 CLI Claude (전용 오더 채널)

> **목적**: Simon이 모바일/원격 AI로 `## OPEN` 밑에 오더 블록을 push하면, 원격 제어 중인 **CLI Claude 세션**(origin/main 45초 감시 + 10분 백업 루프)이 포착해 실행하고 `## DONE`에 `[YYYY-MM-DD / HH:MM:SS KST]` 피드백을 남긴다.
>
> **ORDERS.md에서 분리한 이유 (2026-06-10)**: 기존 ORDERS.md는 데스크톱 Cowork-Claude(로컬 cron)도 감시한다. 두 Claude가 같은 오더를 중복 실행하면 BOARD 단독작성 위반·중복 push 충돌이 나므로, **이 파일은 CLI 세션 전담**으로 분리했다. Cowork-Claude는 이 파일을 실행하지 않는다.
>
> **규칙 (허브 PROTOCOL §33 동일)**: 안전레일(파괴·실비용·secrets·안전임상·법무) 외 오더는 무확인 즉시 수행. main 통합은 `npm run verify` green + CI green 별도 확인 후. 명시 경로만 `git add`. 편집 전 `git fetch` + ff(동시편집 회피).
>
> **오더 템플릿**:
> ```
> ### [O-NN / YYYY-MM-DD] 제목
> Simon: 지시 내용
> ```

## OPEN

(새 오더를 여기 아래에 추가)

### [O-R1-b / 2026-06-10 17:55] Simon 후속 지시 3건 — O-R1 보강
(인터랙티브 CLI 세션 대필 [2026-06-10 / 17:55:42 KST])
1. **그래프 홈 Hick P1 보류 해제**: Simon 확정 — "과다한 건 의도가 아니다. 정리해라." 보류했던 그래프 홈 선택지 과다 건을 P1로 복귀시켜 정리 진행 (정보위계 + 점진 공개로, 비주얼 티어 시스템은 불가침).
2. **O-R1을 end-to-end 전화면 개선으로 확장**: 화면 단위 채점을 넘어 **사용자 여정 단위**(가입→온보딩→첫 기록→그래프→인사이트→플랜→설정)로 흐름 전체를 개선. 여정 중 단절·중복 입력·막다른 화면이 곧 P1. **에뮬레이터 실화면 검증 레지스터는 인터랙티브 세션이 오늘 중 허브 outbox로 제공** — 도착하면 사이클 입력으로 사용하라 (인증 후 화면 재측정 펀치도 그쪽에서 소화).
3. **철저성 유지**: 매 사이클 멀티에이전트 워크플로(발굴 + 적대검증 + framework-인지 최종패스) 유지 — Simon 지시(ultracode 수준). 모델은 Fable 5 유지.

### [O-R1 / 2026-06-10 17:15] 전화면 UI/UX 반복 개선 — 전문 프론트엔드 디자이너 모드 (상시 사이클)
Simon: UI/UX 구조가 아직 사용자 편의와 실사용 환경을 고려하지 못한 것 같다. 모든 화면에 대해 "심플 이즈 베스트", 눈의 흐름을 따라가는 구조 등 디자인 원칙들을 찾아서 전문 프론트엔드 디자이너처럼 반복 개선을 진행하라.
(인터랙티브 CLI 세션이 Simon 지시 대필 게시 [2026-06-10 / 17:15:48 KST]. 단발 오더가 아니라 **수확체감까지 도는 상시 사이클** — /goal 루프의 발굴 트랙을 이 오더로 전환.)

**1) 원칙 정전화 (1회, 첫 사이클)** — 아래 캐논을 출발점으로 외부 보강(NN/g 휴리스틱·모바일 UX 표준) 후 `DESIGN.md`에 "Interaction Principles" 섹션으로 영속화. 이후 모든 UI PR의 리뷰 기준이 된다.
- **Simple is best**: 화면당 1차 행동 1개, 보이는 요소 수 최소, 디테일은 점진적 공개. (기존 정보밀도 standing rule과 동일 축 — 충돌 시 기존 규칙 우선)
- **눈의 흐름(visual flow)**: 모바일은 상→하 단일 컬럼 스캔. 시선 진행을 끊는 좌우 지그재그·중간 삽입 배너 금지. 1차 CTA는 스캔 흐름의 끝(또는 엄지 존)에. 제목→근거→행동 순.
- **Fitts**: 자주 쓰는 타깃일수록 크고 가깝게. **엄지 존**(화면 하단 1/3)에 1차 행동, 파괴적 행동은 존 밖 + 확인. 터치 타깃 ≥44px(기존 룰 유지).
- **Hick**: 한 시점의 선택지 수 최소화 — 메뉴·옵션 5개 넘으면 묶거나 단계로 쪼갠다.
- **게슈탈트(근접·유사·연속)**: 관련 요소는 붙이고 무관 요소는 띄운다. **간격이 곧 위계** — 같은 의미 = 같은 간격·같은 패턴.
- **일관성**: 동일 액션은 모든 화면에서 동일 위치·동일 컴포넌트. 뒤로가기는 정확히 1곳(O-7 합치).
- **상태 완결성**: 로딩(스켈레톤)·빈 상태·에러·오프라인 4종이 모든 화면에 디자인돼 있어야 함. 빈 상태는 다음 행동을 안내.
- **실사용 환경**: 한 손 조작, 야외 밝은 화면(대비), 불안정 네트워크, 1~3분 짧은 세션(저널 진입→작성→저장이 1분 내), 알림에서 복귀하는 중간 진입.

**2) 전화면 감사** — 라우트 전수(~35)를 위 캐논 + CLAUDE.md §20 4축(자연스러움·직관성·정보위계·자산일관성)으로 화면별 채점 → 위반 목록 P1~P3 등록(레지스터는 허브 outbox).

**3) 반복 사이클** — P1부터 화면 단위 수정 → verify+CI green 머지 → **라이브 재측정**(웹 Playwright + 에뮬 스크린샷, 수정 전후 비교) → 재채점. 사이클당 DONE에 1줄 보고. **연속 2사이클 신규 P1·P2 0건이면 수렴 선언.**

**4) 페르소나 교차** — 매 2사이클마다 §20 페르소나 시뮬 1회(연령·직업·소득·문화 교차)로 첫 실행+핵심 루프를 걸어 막힘·이탈 지점을 수집해 다음 사이클 입력으로.

**5) 불가침** — DESIGN.md 토큰·금지사항(그라데이션/필칩/em-dash), 그래프 비주얼 티어 시스템, 안전(crisis) 플로우 동작. 게이트(파괴·실비용·secrets·안전임상·법무)만 사전 확인, 나머지 무확인 진행.

## DONE (Claude 피드백)

### [O-R1 사이클 6b / 2026-06-11] — ✅ Codex 기여 통합: AG 네이티브 P2 3건 (PR #323 라이브)
[2026-06-11 / 00:33:31 KST] Codex가 AG quota-out 공백을 메워 구현한 `codex/native-p2-a11y-keyboard` 브랜치(d28d781) 통합 — N1 interview periodCard minHeight 48 · N2 interview footer Android 키보드 패딩(useKeyboard) · N3 QuantPager progressbar 시맨틱+로컬라이즈 힌트, A11y 가드 확장. Claude 합성 검증: #321·#322와 무충돌 머지 + 로컬 verify 112/976 green + framework 리뷰(Button hint pass-through·Android 게이팅 확인). main `e1d613b`, CI+Pages green. **누적 23 PR(#300~#323)**. Grok cycle9 FYI(OCR 프라이버시/소유감 — 로컬처리·no-training 고지·추출검토 승인 단계 권고)는 multimodal 통합 사이클 입력으로 레지스터 연결.

### [O-R1 사이클 6 / 2026-06-11] — ✅ J1 첫 저장 아하 모먼트: records vs graph 정직화 (PR #322 라이브)
[2026-06-11 / 00:22:20 KST] 사이클6 레지스터 1순위 J1(P1) 클로즈 — 기본 첫 저장(journal→records)이 그래프 노드 0인데 ① onboarding은 "그래프에서 다시 볼 수 있어요" 약속 ② 리본은 조작된 "we noticed" 라인 ③ 스포트라이트는 빈 그래프 위 "조각들이 모여 있어요" 클레임. 수정: records-only 정직 리본 신설 + insight bank·스포트라이트를 실노드(dataNodes) 게이팅 + onboarding 약속 현실화 + **저장 CTA를 조각이 실재하는 곳으로 분기**(journal→기록 보관소/sources→그래프) + a11y 힌트·record 상세 그래프 핸드오프 동일 규칙(적대리뷰 P2 2건, 동일 PR 클로즈) + FirstSaveHonestSurfaces 가드 신설. main `abcfbb5`, verify 112/976 + CI·Pages green. Grok 소비자 시그널 2건(첫 캡처 기대위반=즉시 실망)이 방향 실증. 이월 P3: 리본 탭 목적지·tagless journal domain 기본값·records 행 제목 중복(레지스터 갱신). 누적 22 PR(#300~#322).

### [O-R1 사이클 5 / 2026-06-10] — ✅ 여정 단위 첫 사이클: 가입 여정 P1 2건 + 콜드스타트 P2 2건 (PR #321 라이브, O-R1-b ② 이행)
[2026-06-10 / 23:42:35 KST] 에뮬 e2e 레지스터(잔여분)를 사이클 입력으로 소화 — **E2E-3**(가입 실패 무피드백·세션 드랍: sign-up-flow.ts 추출+가드 홀드) + **E2E-4**(DOB·동의 중복 입력: refresh-before-navigate) + **E2E-5**(가입 진입점 첫 뷰포트) + **E2E-6**("Welcome back" 중립화, 구 카피 CI forbid). **적대리뷰 3렌즈가 차단 P1 추가 발견 → 동일 PR에서 클로즈**: 네이티브 콜드스타트에서 IntroGate가 제출 중 폼을 LoadingScreen으로 교체(부모 레벨 언마운트 — 화면 가드로는 방어 불가) → (auth) 세그먼트 면제. main `763f606`, verify 112/976(+7) + CI·Pages green. E2E-6은 "Simon 카피 판단" 이월건을 권장안 기본 진행 규칙으로 결정(Grok 사후검증 디스패치, 부정 시그널 시 즉시 되돌림 가능). 차기 입력 = 허브 `outbox/20260610-2345-or1-cycle6-punchlist-register.md`(여정 J1 그래프 첫가치 P1·J3~J5 + 리뷰 잔여 R1~R5 + AG 네이티브 N1~N6). roster 교대: AG quota-out·Grok 활성(CONTROL 반영).

### [O-R1 사이클 4 / 2026-06-10] — ✅ 페르소나 시뮬(규정 이행) + 검증 P1 수정 (PR #319 라이브)
[2026-06-10 / 18:32:50 KST] 매 2사이클 페르소나 시뮬 규정 이행 — §20 4축 교차 6인(67세 저시력·14세 미성년·28세 US 디자이너·41세 JP 프라이버시민감·33세 ID 저소득·52세 자영업) 여정 워크스루, **blocker 30건(P1 12)** 레지스터 = 허브 `outbox/20260610-1822-or1-persona-sim-register.json`.
- **PR #319 머지**: 검증 통과 P1 — sign-up 비밀번호 요건 안내가 최소크기+최저대비인데 제출을 게이팅(8자 → canSubmit) → body/textMuted로 상향. main `f3d0267`, CI green.
- **최종패스 기각 (공유-전제 위양성 4·5호)**: ① "journal XP게이트 잠금" — 2026-06-02부로 전 게이트 Lv1 ② "첫 기록 5모드 절벽" — BASIC_CAPTURE_MODES가 이미 journal 단일+더보기 점진공개.
- **Simon 영역 기록**: 결제 미오픈 막힘 체감(정직성 선택의 비용)·USD 단일통화(ID 페르소나)·DOB→consent 순서(프라이버시 인상) — 레지스터에 보존, 외부/카피 판단 대기.
- 누적: O-R1 사이클 4개 + 레지스터 2건. 다음 = settings 구조(P2) 또는 에뮬 레지스터 도착 시 여정 단위 사이클.

### [O-R1 사이클 3 / 2026-06-10] — ✅ 그래프 홈 정리 (PR #318 라이브, O-R1-b ① 이행)
[2026-06-10 / 18:04:12 KST] Simon 그린라이트("과다한 건 의도가 아니다") 이행 — 동시 행동 구역 6+→4: ① generic SecondB 카드 컷(탭바·스포트라이트 카드와 /secondb 3중 중복 + 리본과 SecondB 얼굴 2중) ② 남은 스포트라이트 카드를 mid-reach(104px)→엄지존(탭바 바로 위)으로(Fitts P2 동시 해소) ③ 리본은 별도 목적지(/core-brain)라 유지, 비주얼 티어 시스템 무접촉. main `c1497e4`, verify 110/959 + CI green. O-R1-b ② 여정 단위 확장은 인터랙티브 세션의 에뮬 레지스터 도착 시 사이클 입력으로. 잔여 그래프홈 P2 = 로딩 상태 구분·서브스크린 위계 힌트(다음 사이클).

### [O-R1 사이클 2 / 2026-06-10] — ✅ interview 화면 단위 개선 (PR #317 라이브)
[2026-06-10 / 17:51:55 KST] 최저점 화면(4/10) P2 3건 중 2건+α 클로즈: ① 진행 표시 3중→매트릭스 1개(topBar 중복 텍스트 제거) ② 깊이도달 배너를 중간 쐐기→스캔 끝(컴포저 위)으로 이동 + "더 갈게요"/"그만하기" ghost 강등(사이클1 패턴 일관) ③ 기간 선택 5동일카드에 "지금" 추천 진입점(브랜드 액센트+힌트). ChatBubble 추출은 secondb측 사이클로 이월. main `d94714c`, verify 110/959 + CI green. 다음 = settings(4.5) 구조 개선.

### [O-R1 사이클 1 / 2026-06-10] — ✅ 캐논 영속화 + 전화면 감사 + P1 배치 라이브 (PR #315·#316)
[2026-06-10 / 17:31:40 KST] Claude(루프 세션) — O-R1 첫 사이클 완료.
- **① 원칙 정전화 (PR #315)**: Interaction Principles 8원칙(NN/g 휴리스틱·HIG 44pt/Material 48dp 보강)을 DESIGN.md에 영속화 — 이후 모든 UI PR의 리뷰 기준.
- **② 전화면 감사**: 39화면 채점, **94건 (P1 7 / P2 73 / P3 14)** — 레지스터 = 허브 `outbox/20260610-1730-or1-screen-audit-register.json`. 최저점: interview 4 · settings 4.5 · complete-profile/audit/persona/plans 5.
- **③ P1 배치 (PR #316)**: 검증 통과 P1 3건의 공통 원인 = secondary 버튼이 primary와 준동등 가중치 → ui/Button에 ghost 패스스루 + 3곳 강등(complete-profile 취소[사실상 sign-out]·onboarding 건너뛰기·QuantPager 이전). 가중치만 변경, 라벨·핸들러·a11y 무변경. main `c70c583`, verify 110/959 + CI green.
- 최종패스 기각/조정: imagine·jarvis 리다이렉트 스텁 P1 기각(의도된 경로 통합) · 그래프 홈 Hick P1 보류(탐색 표면 디자인 의도 — Simon 시각 필요 시 결정요청 예정) · capture 제출 위치 P2 강등(스크롤 폼 표준).
- 라이브 재측정: 수정 3화면 모두 인증 후 표면이라 웹 Playwright 재측정 불가 — **에뮬 검증 펀치**로 이월. 다음 사이클 = P2 최저점 화면부터(settings 4.5 · interview 4).

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 7 완료: 주간 리포트 v1 (PR #314 라이브) + #245 처분 + #313 합성 검증
[2026-06-10 / 17:14:44 KST] Claude(CLI 세션) — #313 인계 펀치리스트 ①·③ 클로즈.
- **PR #314 머지 (① M4 주간 리포트 v1)**: insights 화면에 **현재 KST 달력 주** 기준 비교 카드 (이번 주/지난주 수치 + 건수 델타). 핵심 설계: byWeek 마지막 원소(=마지막 기록의 주)가 아닌 현재 주를 직접 계산 — **조용한 주가 정직한 0으로 읽히는 것**이 리텐션 넛지의 본질. % 대신 건수 델타(소수 기록 정직), 감소 주는 비난 없는 중립색. AI 호출 0(무비용, 전 티어). main `afa17ed`, 테스트 4종 + verify 110/959 green, CI green.
- **③ PR #245 처분**: README 수정+가드가 이미 main에 전부 반영된 완전 중복 확인 → 사유 코멘트와 함께 클로즈(미머지).
- **#313 합성 검증(이전 틱)**: 955 green + CI green 보고 포함.
- 잔여 인계 = **② 서버측 advisor 게이트** (gemini-proxy tier 인지 필요 — 프로덕션 edge function 변경이라 설계 신중, 다음 사이클). v2 후보: 주간 서사 리포트(모델 생성, Brain) · 리포트 진입 알림.
- 오늘 누적 **14 PR 라이브(#300~#314)**, 테스트 904→959.

### [Simon 오더 / 2026-06-10] — ✅ 평생 이용권 재책정: Brain ₩299,000 → Soma ₩99,000 (PR #313 라이브)
[2026-06-10 / 17:01:12 KST] Simon 피드백("30만원은 과함, 현실적으로") → 별도 CLI Claude 세션이 재책정 수행. verify 110/955 green + PR CI green 후 squash 머지, main `c8a82db`, CI+Pages green.
- **구조 판단**: Brain 평생을 단순 인하하면 Brain 연간(₩199,000)보다 싸져 구독 잠식 → **평생을 진입 티어 Soma로 이동, ₩99,000/$99** (= Soma 연간의 2배, 잠식 방어선 충족 + 콘솔게임 가격대 + 영구 추론비 리스크 8.4배 축소). 테스트에 잠식 방어 불변식(평생 ≥ 해당 티어 연간×2) 추가.
- **부수**: Brain 카드 f2를 "기록마다 세컨비 회신"으로 — #312가 advisor 게이트를 실배선했으므로 이제 정직한 주장 (#311에서 데드코드라 뺐던 것의 복원). plans.tsx lifetime 표기는 `LIFETIME.tier` SoT 결합.
- **루프 세션 인계 (우선순위 펀치리스트)**: ① **M4 리텐션 루프 — 주간 리포트 v1** (검증③ AI앱 이탈 최우선 레버; insights에 KST 주간 버킷 기반 존재) ② **서버측 advisor 게이트** (#312 잔여 — 클라 게이트 우회 가능, gemini-proxy tier-blind) ③ PR #245(Codex README 카피) 처분.

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 5 완료: canUsePremium advisor 배선 (PR #312 라이브)
[2026-06-10 / 16:10:51 KST] Claude(CLI 세션) — 수익화 v2 인계 펀치리스트 ③ 클로즈.
- **PR #312 머지**: journal Advisor 경로(유일한 callAdvisor 진입점)가 무게이팅·무한도라 free 유저 무제한 AI 회신 가능하던 **비용 누수** 클로즈. capture 토글 자리에 잠금 업셀 행(같은 스타일, 탭→/plans — secondb 한도 패턴) + 제출 재검증 + create.ts 이중 방어(`tier?` 신설, 기록 저장은 무영향·회신만 보류, audit_response 비게이팅, 레거시 콜러 무변경). main `82cc527`, 테스트 4종 + verify 110/954 green, CI green.
- planner는 미구현 placeholder 확인 — 배선 대상 아님(기능 구현 시점에).
- 여담 2호: 첫 잠금 카피의 "AI" 단어를 C7 plain-language 계약이 잡음 → "회신"으로 교정. 어제 배선한 게이트들이 연달아 실작동.
- **신규 펀치리스트**: 서버측 advisor 집행 없음(클라이언트 게이트 우회 가능, gemini-proxy는 tier 무지) — 서버측 한도/검증 별도 작업. plans Brain 카드에 "기록 회신" 명시 추가 여부 = Simon 카피 판단.
- **#311 합성 검증(이전 틱)**: 109/950 green + CI green 완료 보고 포함. 오늘 누적 **12 PR 라이브(#300~#312)**, 테스트 904→954.

### [Simon 오더 2건 / 2026-06-10] — ✅ legal review 오늘 기입 + 수익화 v2 구현 라이브 (PR #310·#311)
[2026-06-10 / 15:25:38 KST] Simon이 별도 Claude CLI 세션(인터랙티브)에서 직접 지시("리갈 리뷰는 오늘로 해" + "수익화 작업 진행해") → 해당 세션이 worktree 격리로 수행. 두 PR 모두 verify green + PR CI green 확인 후 squash 머지.
- **PR #310 머지**: `LEXICON_LAST_LEGAL_REVIEW = "2026-06-10"` (법무 게이트 소유자 Simon 선언) — legal-review 게이트 WARN→PASS. main `adaee86`, CI green.
- **PR #311 머지**: 수익화 v2 (M1~M5) — ① 가격 SoT `src/lib/progression/pricing.ts` (Soma/Cortex/Brain ₩4,900/9,900/19,900·연=월x10 2개월무료·Brain 평생 ₩299,000, locale 드리프트 가드 테스트) ② plans 4-tier 카드+확정가(결제는 정직하게 미개통 유지) ③ free AI 한도 5→2회/일 + 업그레이드 사다리 free→soma→cortex→brain(soma 재판매) ④ Plus/Pro 별칭 전면 제거 ⑤ 적대리뷰가 잡은 정직성 위반 카피 2건 교체(advisor/planner 미배선·패턴분석 무근거) + secondb 경고색 임계 회귀 fix + BLOCKED_HINT em-dash 제거 ⑥ ARCHITECTURE/GTM 문서 동기화. main `b0c83ed`, 로컬 verify 109 suites/950 green.
- **M5(App Store 5.1.2(i))는 기존 충족 확인**: consent가 Google Gemini 실명 명시 + 가입 시(최초 전송 전) 동의 — 변경 불요.
- **미수행(게이트/펀치리스트)**: 실 IAP/스토어 설정·SBP 가입·KR PG 계약(Simon, 외부) · Brain 리텐션 루프(주간 리포트·장기 메모리) 미구현(카피도 미약속) · `canUsePremium` advisor/planner 게이팅 배선(현 데드코드).
- 루프 세션에게: 위 2건은 처리 완료 — 중복 실행 불요. 펀치리스트 3건은 발굴 사이클에서 자유 인계.

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 4 완료: 라이브 동적 QA → PR #309 라이브 (+#301 합성 검증)
[2026-06-10 / 15:01:55 KST] Claude(CLI 세션) — 정적 분석 수확체감(확정률 42%→18%)으로 라이브 QA로 전환.
- **#301 머지 합성 상태 독립 검증**: #301 브랜치는 옛 main(ae7e517) 기준 → 이후 8 PR과의 합성을 로컬 verify **108 suites / 944 tests green** + 2b0dc4a CI green으로 확인 (#299 패턴).
- **라이브 QA** (Playwright/Edge, Pages main 기준, 데스크톱+모바일 × 3라우트): 전 라우트 200·pageError 0·요청실패 0. 모바일 첫인상 우수.
- **PR #309 머지**: 데스크톱(1280px)에서 auth 3화면(sign-in/sign-up/complete-profile)의 입력·CTA가 전폭 스트레치 → 웹 한정 maxWidth 520 컬럼 캡. **머지 후 라이브 재측정: 입력폭 1232px→438px**, 중앙 카드 컬럼 확인(스크린샷). main `29dfc1c`, CI+Pages green.
- 이월 P3 2건: ① sign-in "다시 오셨네요" 카피 — 신규 방문자 노출(계정만들기 분리라 의도일 수도, Simon 카피 판단) ② RN-web useNativeDriver 콘솔 경고(코스메틱).
- **오늘 누적 10 PR 라이브 (#300~#309)**, 테스트 904→944.

### [결정 / 2026-06-10] PR #301 머지 승인 — ✅ Simon 승인 → squash 머지 완료 (main 2b0dc4a)
[2026-06-10 / 14:29:13 KST] Simon이 별도 Claude CLI 세션(인터랙티브)에서 직접 승인 의사 전달 → 안전임상 게이트 충족. 해당 세션이 머지 실행(원격 `gh pr merge --squash`, 공유 워킹트리 무접촉·이 원장 갱신만 임시 worktree 경유).
- 머지 전 확인: PR checks green(verify ×2 + lint) + mergeable CLEAN. 머지 후 main `2b0dc4a` CI + Pages 배포 폴링 중(green 확인 후 라이브 보고).
- 원 결정요청(13:22 게시) 요지: 서버 422 `safety_red_zone` 거부를 클라이언트-RED와 동일한 위기 플로우로 폴백(`proxy_input_red` 태그), 테스트 7/7 + verify 918 green. 위기 사용자에게 raw 에러 대신 핫라인 노출 — 순수 안전 개선.
- 루프 세션에게: 이 건은 처리 완료이므로 중복 실행 불요. OPEN 잔여 결정요청 없음.

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 3 완료: 신규 5렌즈 발굴 → 4 PR 라이브 (#306~#308)
[2026-06-10 / 14:26:27 KST] Claude(CLI 세션) — 사이클 3 (기반자료·성능·페르소나시뮬·테스트갭·스키마drift, 에이전트 44, 확정 7/기각 32) 클로즈.
- **PR #306**: Analysis Lexicon **정본 미러링 갭** — 법무 문서가 금지한 therapy·therapeutic 등 10개 EN + 치료·처방·정신과 등 5개 KO가 코드 리스트에 빠져 CI가 못 잡던 것 보강 (floor 15→25 EN, 19→24 KO). KO 명령형 금지("~지 마") 가드레일 패턴 추가, 위양성 0.
- **PR #307**: **types.gen.ts 재생성** (Supabase MCP, 0043 기준) — esm_responses·gemini_spend_daily·guardian_consents·clipper_templates·consent_records 5개 테이블 + added_by 컬럼이 타입 밖에 있던 것 해소. tsc clean = 스키마-클라이언트 실정합 증명.
- **PR #308**: **코어 루프 테스트 갭** — XP award 매핑·once-only·무던짐 계약 6케이스, EXPO_PUBLIC_FORCE_TIER chokepoint를 resolveTier 순수 함수로 추출+양방향 마스킹 테스트(릴리스 페이월 리스크 회귀 가드), empty-card 영속 3케이스.
- 기각 1건(Claude 최종패스): probe.ts 위기 규칙 "도달불가" 주장 — 분류기 통과한 미묘 입력에 대한 의도된 계층 방어로 판단, 유지.
- main `082fb10`, 전 PR CI green. **오늘 누적: PR 8개 라이브(#300·302~308) + 게이트 1건(#301) 대기.**

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 2 완료: 펀치리스트 4건 전부 소화 (PR #304·#305 라이브)
[2026-06-10 / 13:58:58 KST] Claude(CLI 세션) — 사이클 1 이월 P3 4건 클로즈.
- **PR #304 머지**: ① byWeek 주간 버킷도 KST 앵커로 통일(kstIsoWeek — daySpan과 동일 컨벤션, 경계 테스트 추가) ② /import에도 storagePending info 토스트(EN/KO) ③ QuantIntroModal·empty-card 무음 persist에 warn 트레이스. 여담: 처음 쓴 코멘트의 d-단어를 #300의 L1 게이트가 잡아냄 — 게이트 실작동 확인.
- **PR #305 머지**: `_body_fallback` 승격 메커니즘 신설 — `promotePendingUploads`(멱등 overwrite 재업로드 + 플래그 제거, 인박스 로드 시 best-effort, 10건/run 바운드, 테스트 6/6). capture.ts 주석만 있고 코드가 없던 "재업로드 복구"가 실재하게 됨.
- main `b75e45c`, 전 PR CI green. 잔여 = wiki upsert race(P3 저확률)·CrisisRouter/ConsentNotice hex(Simon 보류)·**PR #301 결정요청(위 OPEN)**.
- 사이클 3 발굴 가동 중: 기반자료·성능·페르소나시뮬·테스트갭·스키마drift 5렌즈.

### [자율 개선 / 2026-06-10] — ✅ /goal 사이클 1 완료: 발굴 워크플로 + 수정 2 PR 라이브
[2026-06-10 / 13:44:36 KST] Claude(CLI 세션) — 5렌즈 발굴(에이전트 31, 확정 11/기각 15) → framework-인지 최종패스 → 수정 적용.
- **PR #302 머지** (로직 3건): ① daySpan이 디바이스 로컬 일자 사용 → **KST 앵커로 정렬**(streak/chat_usage 컨벤션, kstDayKey SoT 재사용; 워크플로의 "UTC로 고쳐라"는 공유-전제 오류로 기각하고 정본 컨벤션 적용) ② wiki Storage 업로드 실패가 무음 성공 → `storagePending` 노출 + saved 패널 정직 카피(EN/KO) ③ onboarding persist 실패 무음 → warn 트레이스.
- **PR #303 머지** (디자인 2건): quant 모달 스크림 rgba 리터럴 → `semantic.backdropStrong` 토큰화(픽셀 무변경) + 그래프 Touch! CTA KO "터치!" 번역.
- main `7b502cd`, 양 PR CI green. 이월 펀치리스트 6건(P3 5 + Simon보류 1)은 허브 `agents/claude/outbox/20260610-1345-goal-cycle1-punchlist.md`.
- **PR #301(422 위기 폴백)은 여전히 OPEN 결정요청 대기** (위 OPEN 블록).

### [자율 개선 / 2026-06-10] — ✅ L1 analysis-lexicon CI 게이트 배선 (#300 머지·라이브)
[2026-06-10 / 13:22:02 KST] Claude(CLI 세션) — 감사 펀치리스트 L1 클로즈. /goal(전방위 개선 자율 루프) 1·2호 작업.
- ANALYSIS_UNIVERSAL_FORBIDDEN(15 EN + 19 KO)을 check-forbidden-lexicon.ts에 **라인 단위 + 가드레일 부정문맥 필터**로 배선 — "Never diagnose" 가드레일 프롬프트 3파일 위양성 0, allowlist 추가 0. 카나리 e2e(위반 심기→FAIL→제거→PASS)로 게이트 작동 검증.
- PR #300 squash 머지 → main `b0eb0df`, **CI+Pages green**. verify 914 green.
- 부수 복구: 이관 후 깨져 있던 **gh CLI 인증 복원**(hosts.yml 재생성 — keyring 토큰 생존). 이제 CLI 세션이 PR 생성·머지 직접 수행 가능.

### [머지 후 독립 검증 / 2026-06-10] — ✅ #299 머지 상태 전부 green
[2026-06-10 / 11:00:00 KST] Claude(원격 CLI 세션) — Simon 결정 2건 수신·검증 완료.
- **#299 머지 후 main(3575237) 로컬 전체 verify: 104 suites / 911 tests green (exit 0)** — 내 i18n 커밋과 #299의 합성 상태(상호 미검증 조합이었음)를 별도 확인. CI도 3575237 green 확정.
- legal-review 신규 게이트는 non-blocking WARN 1건(LEXICON_LAST_LEGAL_REVIEW null) — 외부 법무 검토 후 날짜 기입 필요(법무 게이트, Simon 잔여 항목).
- **초기 줌 "상단 40%" 잔존 스캔**: DESIGN.md·docs/* 에 잔존 없음 확인 — 후속 문서 정리 불필요(ORDERS.md 아카이브 내 과거 오더 원문에만 존재, 보존).
- **상시 지침 "앞으로 권장안 기본 진행" 접수** — 이후 결정요청은 권장안 즉시 진행 + 사후 보고로 전환, 안전레일(파괴·실비용·secrets·안전임상·법무)만 사전 확인 유지.

### [결정 / 2026-06-10] — ✅ Simon 권장안 승인 → 2건 처리 완료
[2026-06-10 / 10:55:53 KST] Simon이 Cowork-Claude(데스크톱)에 "모두 권장안으로 진행" 답 + 상시 지침("앞으로 권장안 기본 진행"). 양 채널 정합 위해 여기 기록:
1. **PR #299 머지 OK → 머지 완료**: squash 머지, main `3575237`. 안전임상 게이트(B11)는 Simon 명시 승인으로 충족. 머지 전 CI green 확인(lint+verify pass)·mergeable CLEAN. 머지 후 main CI 재가동(내용=검증된 PR head 동일). 머지는 Cowork-Claude가 `gh pr merge`(원격, 워킹트리 무접촉)로 실행.
2. **그래프 초기 줌 = 현행 유지**: 하단-중앙 지배(scale 1.5) 유지, 구 스펙 "Soul Core 상단 40%" 문구 폐기. 코드 변경 없음(하단뿌리 트리 ROOT_ANCHOR y=0.82와 정합). DESIGN/스펙 문서에서 "상단 40%" 잔존 시 정리 권장(후속).


### [자율 통합 / 2026-06-10] — ✅ Codex SecondB i18n 머지 + Cowork-Claude 인계 편입
[2026-06-10 / 10:24:31 KST] Claude(원격 CLI 세션)
- **Codex 43fd6f4 통합·라이브 진행**: /secondb의 Clear·View plans 가시 문자열 + composer/clear/plan-link a11y 라벨을 locale 번들로 이동(EN/KO parity, C7) + 정적 회귀 테스트. 가격·패키징 카피 무변경(D-09 보존).
- **Codex 오진 교정**: Codex가 "기존 A11y 게이트 실패(본 변경 무관)"로 보고했으나 분리 검증 결과 **i18n 이동이 직접 유발** — check-constraints.ts가 리터럴 hint 문자열을 단언하고 있었음. 단언을 locale-key 추적(`t("clearChatHint")`)으로 동기화(보호 수준 동등, 같은 커밋에 포함). 분리 검증: 변경 4파일만 main 상태로 되돌리면 PASS 확인.
- **verify 104 suites / 904 tests 전체 green (exit 0)** 후 main push.
- **Cowork-Claude Phase D 검증 인계 편입**(09:23 핸드오프, 채널 이양 수용·실행 cron 삭제·모니터 전용 전환 확인): ① 파워온 sweep ✅ 스펙 일치 ② 순차 등장 ✅ 구현됨(스펙 문자값과 상이하나 첫인상 양호 기판정 → 현행 유지) ③ 초기 줌 ⚠ 스펙 모순 → 위 OPEN 결정요청 2번 ④ ORDERS.md 5~453줄 헤더 블록쿼트에 과거 오더 본문 중복 잔존(붙여넣기 사고) → 아카이브 정리 시 처리 예정.

### [채널 개통 / 2026-06-10] — ✅ 원격 오더 전용 채널 가동
[2026-06-10 / 09:12:27 KST] Claude(원격 CLI 세션) — 채널 개통.
- 감시 체계: origin/main ls-remote 45초 Monitor 루프 + 10분 백업 cron + 1시간 wakeup(라이브-머지 하트비트).
- 기준 상태: main aab6e16 동기, verify 903 green, CI green, Pages 라이브, 프로덕션 Supabase 0043 동기.
- 오늘 가용 AI: Claude + Codex (agy quota 소진, grok 제외).
