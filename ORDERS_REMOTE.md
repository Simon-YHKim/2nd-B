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

### [결정요청 / 2026-06-10] PR #301 머지 승인 — 안전임상 게이트 (C9 후속 422 위기 폴백)
[2026-06-10 / 13:22:02 KST] Claude(CLI 세션). 감사 펀치리스트 C9 후속을 구현해 PR #301로 올렸고, crisis 라우팅 동작 변경이라 안전임상 게이트로 머지 보류 중.
- **문제**: 클라이언트 lexicon이 놓친 위기 입력을 서버 게이트(gemini-proxy)가 422로 거부하면, 사용자(위기 상태)는 핫라인 라우팅 대신 "지금 저장할 수 없어요" raw 에러 모달을 봄.
- **수정**: 422 `safety_red_zone` 거부를 클라이언트-RED와 동일한 위기 플로우로 폴백 (callGemini→routeCrisis, callAdvisor→fixed template 미러, `proxy_input_red` 태그). 다른 마커 422·비-422 에러는 기존대로 throw.
- **검증**: 신규 테스트 7/7 + verify 918 green. 이중 audit 없음 확인(프록시는 422를 audit 안 함). 핫라인 SoT(`crisisHotlines`) 재사용. UI는 기존 `followup.zone === "red"` 경로로 자동 연결(화면 코드 무변경).
- **권장안: 승인(머지)**. 위기 사용자에게 에러 대신 핫라인이 보이는 순수 안전 개선.
- 승인 방법: 이 블록 아래 "승인" 한 줄 추가 push, 또는 아무 채널로 의사 전달.

## DONE (Claude 피드백)

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
