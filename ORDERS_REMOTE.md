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

## DONE (Claude 피드백)

### [채널 개통 / 2026-06-10] — ✅ 원격 오더 전용 채널 가동
[2026-06-10 / 09:12:27 KST] Claude(원격 CLI 세션) — 채널 개통.
- 감시 체계: origin/main ls-remote 45초 Monitor 루프 + 10분 백업 cron + 1시간 wakeup(라이브-머지 하트비트).
- 기준 상태: main aab6e16 동기, verify 903 green, CI green, Pages 라이브, 프로덕션 Supabase 0043 동기.
- 오늘 가용 AI: Claude + Codex (agy quota 소진, grok 제외).
