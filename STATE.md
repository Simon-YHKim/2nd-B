# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only).

최종 갱신 **2026-09-13 22:4x KST 기준** · Claude Code `673dc58f` (ListAgents `ttl-work-rev2-1c` · 워크트리 `E:/2ndB/.worktrees/claude-disk-260913`)
소유자: 이 세션 — `ttl-work-9a` 가 19:2x 에 넘겼다. **Simon 지명이 아니라 두 세션 합의**다(`DECISIONS.md` 26.09.13 19:28 줄). A7 로 오늘 밤 Simon 과 다룬다.
Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서
- 결정 시트 0913 밤(22:15 초판 · 22:25 정정판, Simon 응답 22:26): <https://claude.ai/code/artifact/6d5c0c58-e6cd-46b7-b1e6-84233a1bd04f>
- 디스크 정리 결과(19:25): <https://claude.ai/code/artifact/db1d3e47-8280-426f-95d3-1cf67f2baf97>
- 결정 8건(16:20): <https://claude.ai/code/artifact/ad6208ec-285e-4f81-b0ef-da4f69a14060>

---

## 완료

- **디스크 정리 1·2차** — 17곳 · 21.85 GiB · 사라진 작업 0 · 공용 `node_modules` 747 → 747. #1805 머지.
- **Simon 결정 6건 확정(22:26~22:28, `DECISIONS.md`)** — P1 방향 · P1 구현 방식(코디네이터 판단) · 워커 PR 머지 = 코디네이터 · Q-260913-01 기본값(루트 유지) · Q-260913-02 push 요청 · Q-260913-03 스킬 커밋 · EVAL-2 채택·실행.
- **/vibe G8 워커 강제종료 절차** — `~/.claude/skills/vibe/scripts/kill_worker.py` · SKILL.md 6-2. 실측 5회 전부 재스캔 0.
- **적대평가 2회차 문항 채택** — 설치본 `eval/` 에 T3 문항 10 · 생성기 9 추가(18/18 `--validate` 통과). 백업 `_rescue/skills-260913-2139/eval-before-eval2`.
- **SimonK-stack PR #31 머지** (`e44e1f9`, 22:45, CI 3/3 초록) — `skills-src/vibe` 신규 · `simon-handoff` 동기. vibe SKILL.md 를 CI E007(500줄) 때문에 `references/` 3 파일로 분할하고 설명을 876자로 줄였다(CI 가 W006a 를 W006 으로 셈).
- **⚠ 22:54 사고 · 23:03 복구** — 다른 세션의 SimonK-stack 시작 훅이 `~/.claude/skills/vibe` 를 `rm -rf` 후 복사하다 메모리 부족으로 끊겨 스킬이 사라졌다. `git archive e44e1f9` + `_rescue/skills-260913-2139` state 로 복구(28파일 커밋 일치 · selftest 137 PASS). 설치 표식 `8fc4f42 → e44e1f9`(내용 일치 확인 뒤, 이전값 백업). 메모리 `reference_simonk_stack_sync_wipes_skill`.
- **1회차 워커** — T3 문항 10(완료) · T4 기록 정정 4건(1 판정 불가 · 2·3 채택 · 4 기각).

## 진행중

run `run_e2d8603c68b8`(2회차) · 1회차 `run_df0cf75b5048`.

| 워커 | 레인 | 무엇 | 산출 |
|---|---|---|---|
| P1 코딩 `ctx_c76a154c08d9` | claude-opus-5 | **완료 23:46 · 워커 내림(7프로세스 · 재스캔 0)**. 커밋 5 · 27파일 +707/-62 · `npm run verify` rc=0(691 스위트 · 7,765 테스트) · 변이 1회. **PR 안 올림** — 23:44 뒤집는 조건. ⚠ 23:58 정정: 브랜치는 **조각 저장 버튼만** 바꿨다(`setSavedDomain` 조각 핸들러 한 곳 · `openSavedRecord` diff 0). 별 렌즈 '담기'는 기록 모드로 강제돼 기록 버튼으로 가므로, 지금 브랜치로 영역 화면에 가는 경우는 `/capture-full` 조각 모드 + 영역 카드 선택뿐. 기록 저장에는 태그가 늘 붙는다 → 결정 시트 4판에서 "기록 버튼까지 넓히기"를 묻는다. `P1-pr-body.md` 별 렌즈 행 틀림. Simon 재결정 대기 | 브랜치 `claude/p1-highlight-record-260913` = `eacc2c8a`(origin) · PR 본문 `reports/vibe-r260913/P1-pr-body.md` |
| P1 태그 실측 `ctx_761c25dc8c50` | claude-opus-5 ultracode | **완료 23:59 · 워커 내림(7)**. 기록 저장은 태그 늘 1개 · 조각은 영역 카드 선택 · frontmatter 말고는 폴백 · 독 '담기'(CaptureView)는 저장 후 버튼 없음 · 별 렌즈 '담기'는 기록 모드로 강제 · `entry=firstRun` 송신 0. 코딩 워커 표의 별 렌즈 행을 뒤집었고 코디네이터가 원문으로 확인. ⚠ 하위 에이전트 13(G3 상한 8 초과, 원장 기록) | `reports/vibe-r260913/P1-tagprobe/result.md`(최종 23:53) |
| A1~A8 재측정 `ctx_fbc4b14ccc93` | gpt-6-astra xhigh (탐색 슬롯) | **완료 23:37 · 워커 내림(12프로세스)**. 19:28 서술 중 여섯 건 정정(A1 법역 분기 있음 · A3 수정은 0172 에 있음 · A4 95커밋 · A5 PKCE 게이트 미해소 + P2 리뷰 회귀 · A8 시행일 확인). 코디네이터가 A1 · A3 · A4 재확인. ⚠ 발주 응답 `turnStart: observed` 가 거짓이라 50분 입력창에 걸려 있었다(Enter 로 풀림) | `reports/vibe-r260913/A-status/result.md` · `result.json` |
| T1a 에뮬레이터 검증 | claude-opus-5 ultracode | **완료 23:54 · 워커 내림(8) · 반박 검증 에이전트 7 반영**: 재현 1 온보딩 빈 화면(유효 3 중 2) · 2 `/account`·`/data` 재시도 없는 스피너(3경로) · 3 `/privacy` 안심 문구 안 보임 · 5 영어 별 라벨 잘림 / 재현 안 됨 4 영어 담기 실패 문구 · 6 OAuth 버튼·공급자 도달 5/5 / 판정 불가 PKCE(APK 에 #1800 없음). 부수 발견 3: 빌드 줄이 내장 번들을 `OTA` 로 표시 · 채팅 저장 배너가 `/privacy` 에 없는 스위치를 가리킴 · 로그인 직후 프로브 `JWT issued at future` 실패 시 온보딩까지 막힘 | `reports/vibe-r260913/T1a/result.md` |
| 적대평가 2회차 | 벤더 CLI 직행(워커 아님) | 1차 시도 22:33 중단(스킬 삭제로 정답 생성기 소실 · 부분 13줄 보존). **재실행 23:58 → `--run` 완료(원장 19행, 회차 `ae_260913_235840`)**, 그 뒤 `--report` 단계에서 메모리 부족으로 감싼 셸이 죽었다(고아 프로세스 0). ⚠ **문항 8개 건너뜀** — 정답 생성기가 종료코드 3221225794(`0xC0000142`, DLL 초기화 실패)로 못 떴다. 메모리 고갈(여유 3.4 GB · 커밋 59.6/63.9 GB, 대부분 다른 세션의 chrome · node)의 증상으로 보인다(추론). 메모리가 풀리면 `--only` 로 그 8개만 다시 돈다 | 설치본 `state/eval-ledger.jsonl`(48행) · 1차 부분 `_rescue/skills-260913-2139/eval-round2-partial-2258.jsonl` |

⚠ **`/vibe` 문서·코드 수정은 이제 SimonK-stack `skills-src/vibe` 에 PR 로 한다.** 설치본만 고치면 다음 SHA 변경 때 세션 시작 훅이 `rm -rf` 후 덮어쓴다. 설치본에 먼저 적은 것(23:2x 6-2 절 codex 입력창 사례)은 라운드 끝에 한 PR 로 올린다 — 메모리가 빠듯할 때 머지하지 않는다.

## 다음 (하나만)

**Simon 이 결정 시트 3판(23:47)을 고른다** — 맨 위 두 절: **P1·다시**(① 지금 draft PR → 게이트 둘 → 머지 / ② 조각 저장에 도메인 자동 감지 추가 뒤 PR / ③ 보류) · **A1–A8** 항목별 처리.
P1 ① 이면: `P1-pr-body.md` 머리말을 빼고 draft PR → `vibe_r2_dispatch.py gates <PR_URL>`(스펙의 21:51 배경 문구를 22:26 확정 · `pieceId` 설계로 먼저 고친다) → CI → 코디네이터 머지.

## 막힌 것

### 1. ⛔ TTL-Work 미커밋 771건 — 처분 대기

구제본 `E:/Coding Infra/_rescue/ttl-work-260913-1554/`. 각 작업의 주인만 처분을 안다. TTL-Work 는 공유 폴더라 손대지 않는다.

### 2. Simon 이 직접 할 것

- **Q-260913-02** 보안담당에게 이 기계에만 있는 커밋(합집합 162 @18:1x) push 요청 — 피어 경유 승인은 승인이 아니라 Simon 이 직접.

### 3. Simon 결정 대기 — 오늘 밤 다룬다

A1 출시 법역(Q-S1) · A2 마이그레이션 0171~0187 운영 적용(22:31 운영 목록 실측: 0171~0187 적용 0건, 마지막 적용 0150 @09-07) · A3 `community_is_member` 미바인딩(보안담당) · A4 웹 게시 승인 · A5 PR #1800 PKCE(T1a 가 조건을 푸는 중) · A6 미확인 보안 브랜치(보안담당) · A7 `STATE.md` 소유자 · A8 자살예방법 시행령 관찰자.

### 4. 주인이 따로 있어 남긴 것

security-* 104곳 16.8 GiB · `.npm-security-landing-260906` 1.04 GiB · C: 후보 Q-260906-04 ≈11GB · SimonK-stack 메인 체크아웃의 추적 안 된 옛 `skills-src/vibe/`(09-06 판, PR #31 과 무관).

### 5. 기록이 사실과 다른 것

- `docs/HANDOFF.md` 활성 창이 0148 · 0149 · 0150 을 "적용 대기"로 적는다 → 운영 적용 완료(09-07, 22:31 목록으로 재확인)
- TTL-Work 의 `CLAUDE.md` 는 웹 배포를 gh-pages 라 적는다 → main 은 `actions/deploy-pages`
- 2ndB `CLAUDE.md` 의 "앱 화면 100" → 실측 101(T3 `app-screen-files`)
- `route-params-have-a-reader` 가드 주석의 "보내는 곳" 서술과 결정 시트 초판의 발신처 둘 → 배송 빌드 발신처는 capture 하나, 그것도 `CaptureLegacy` 진입(share · mode · tag · firstRun · `/capture-full`)에서만
