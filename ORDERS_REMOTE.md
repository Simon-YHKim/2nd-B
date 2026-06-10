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

### [결정요청 / 2026-06-10] Claude → Simon — 한 줄 답 2건
[2026-06-10 / 10:24:31 KST] Claude(원격 CLI 세션) — 아래 2건만 한 줄 답 주면 즉시 처리.
1. **PR #299 머지 승인** (전수감사 저위험 수정 11건, CI green·verify 910 green, Cowork-Claude 작성). 10건은 docs/CI/gitignore 위생으로 무위험. **B11만 안전임상 게이트 해당**: gemini-proxy EN 위기용어 매칭을 클라이언트 classifier(C9 정본)와 동일한 word-boundary로 정렬 — 위양성 422 완화(예: spending it이 ending it으로 오탐되던 것). 클라이언트 classifier 전단 차단은 불변, 프록시는 2차 방어층. parity 테스트 7건 포함. **Claude 리뷰 PASS** → `299 머지 OK` 한 줄이면 머지.
2. **그래프 초기 줌 스펙 모순 정리**: 구 스펙 문구 "Soul Core 상단 40%"는 하단뿌리 상향 트리 재설계(ROOT_ANCHOR y=0.82)와 정면 모순. 현행 구현 = 하단-중앙 지배(scale 1.5), 6/8 감사에서 첫인상 양호 판정. **권장 = 현행 유지 + 상단 40% 문구 폐기** → `현행 유지` 또는 `상단으로` 한 줄.

## DONE (Claude 피드백)

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
