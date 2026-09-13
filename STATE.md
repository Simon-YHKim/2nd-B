# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only).

최종 갱신 **2026-09-14 00:58 KST 기준** · Claude Code `673dc58f` (ListAgents `ttl-work-rev2-1c` · 워크트리 `E:/2ndB/.worktrees/claude-disk-260913`, 브랜치 `claude/vibe-r260914` = main `ed4ef001` 위)
소유자: 이 세션 — `ttl-work-9a` 가 09-13 19:2x 에 넘겼다. **Simon 지명이 아니라 두 세션 합의**다(`DECISIONS.md` 26.09.13 19:28 줄). A7 로 Simon 확인 대기.
Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서
- **결정 시트 0913 밤 — 4판(09-14 00:01)**: <https://claude.ai/code/artifact/6d5c0c58-e6cd-46b7-b1e6-84233a1bd04f> (초판 22:15 · 정정판 22:25 · 3판 23:47 · Simon 응답 22:26)
- 디스크 정리 결과(09-13 19:25): <https://claude.ai/code/artifact/db1d3e47-8280-426f-95d3-1cf67f2baf97>
- 결정 8건(09-13 16:20): <https://claude.ai/code/artifact/ad6208ec-285e-4f81-b0ef-da4f69a14060>
- 워커 산출물: `E:/Coding Infra/reports/vibe-r260913/{T1a,T3,T4,P1-tagprobe,A-status}/` · `P1-pr-body.md`

---

## 완료

- **디스크 정리 1·2차** — 17곳 · 21.85 GiB · 사라진 작업 0 · 공용 `node_modules` 747 → 747. #1805.
- **Simon 확정 여섯 건(09-13 22:26~22:28)** — P1 방향 · 워커 PR 머지 = 코디네이터(게이트 둘 + CI) · Q-260913-01 기본값(루트 유지) · Q-260913-02 push 요청 · Q-260913-03 스킬 커밋 · EVAL-2. 결정 기록은 **PR #1806 머지(`ed4ef001`, 09-14 00:33)**.
- **/vibe G8 워커 강제종료 절차** — `kill_worker.py` · SKILL.md 6-2. 오늘 워커 여섯 전부 이 절차로 내림(재스캔 0).
- **SimonK-stack PR #31 머지** (`e44e1f9`, 22:45) — `skills-src/vibe` 신규 · `simon-handoff` 동기. SKILL.md 를 CI E007 때문에 `references/` 3 파일로 분할, 설명 876자.
- **⚠ 22:54 사고 · 23:03 복구** — 다른 세션의 SimonK-stack 시작 훅이 설치본 `/vibe` 를 `rm -rf` 후 복사하다 메모리 부족으로 끊겼다. `git archive e44e1f9` + `_rescue/skills-260913-2139` state 로 복구, 설치 표식 `8fc4f42 → e44e1f9`. 메모리 `reference_simonk_stack_sync_wipes_skill`.
- **워커 결과** (산출물 폴더 위)
  - **T1a 에뮬레이터 검증**(claude-opus-5 ultracode, 23:54) — 재현: 1 온보딩 Continue 뒤 빈 화면(유효 3 중 2) · 2 `/account`·`/data` 재시도 없는 스피너(3경로) · 3 `/privacy` 안심 문구 안 보임 · 5 영어 별 라벨 `Thirties and af…` 잘림 / 재현 안 됨: 4 영어 담기 실패 문구 · 6 OAuth 버튼·공급자 도달 5/5 / PKCE 판정 불가(APK 에 #1800 없음). 부수 발견: 빌드 줄이 내장 번들을 `OTA` 로 표시 · 채팅 저장 배너가 `/privacy` 에 없는 스위치를 가리킴 · 로그인 직후 `JWT issued at future` 프로브 실패.
  - **T3** 적대평가 문항 10 · **T4** 기록 정정 4건(1 판정 불가 · 2·3 채택 · 4 기각).
  - **P1 코딩**(23:46) — 브랜치 `claude/p1-highlight-record-260913` = `eacc2c8a`(커밋 5 · 27파일 · verify rc=0 · 691 스위트 7,765 테스트 · 변이 1회). PR 미개설.
  - **P1 태그 실측**(23:59) — 기록 저장은 domain 태그 늘 1개 · 조각은 `/capture-full` 영역 카드 선택 · frontmatter 말고는 태그 없음 · 독 '담기'(CaptureView)는 저장 후 버튼 없음 · 별 렌즈 '담기'는 기록 모드로 강제 · `entry=firstRun` 송신 0. ⚠ 하위 에이전트 13(G3 상한 8 초과, 원장 기록).
  - **A1~A8 재측정**(gpt-6-astra xhigh 탐색 슬롯, 23:37) — 19:28 서술 중 여섯 건 정정. 코디네이터가 A1 · A3 · A4 재확인. ⚠ 발주 응답 `turnStart: observed` 가 거짓이라 50분 입력창에 걸려 있었다(Enter 로 풀림, SKILL.md 6-2 설치본에 기록).
- **적대평가 2회차**(00:56) — 문항 18개 전부 실행(8개는 메모리 고갈로 한 번 건너뛰었다가 `--only` 재실행). 누적 정답률 전 레인 **100%(62/62)** — 레인을 못 갈랐다. **라우팅 표는 바꾸지 않는다**(DECISIONS 26.09.14 00:57).

## 진행중

없음. 떠 있는 워커 0 · 백그라운드 작업 0. Simon 의 결정을 기다린다.

## 다음 (하나만)

**Simon 이 결정 시트 4판에서 두 절을 고른다.**
- **P1·다시** — ① 기록 버튼까지 같은 규칙으로 넓힌 뒤 PR(코디네이터 추천) · ② 지금 브랜치 그대로 PR(조각 버튼만) · ③ 조각 저장에도 도메인 자동 감지 · ④ 보류.
  ① 이면: 코딩 워커 1회(기록 핸들러에서 도메인 · id 남기기 · 기록 버튼 · 문구 · 테스트) → `P1-pr-body.md` 의 틀린 별 렌즈 행과 머리말을 고쳐 draft PR → `vibe_r2_dispatch.py gates <PR_URL>`(게이트 스펙의 배경 문구를 22:26 확정 · `pieceId` 설계로 먼저 고친다) → CI → 코디네이터 머지.
- **A1–A8** — 항목별 처리(시트 칩). A3 · A6 · A2 의 실행 주체는 보안담당이다.

## 막힌 것

### 1. ⛔ TTL-Work 미커밋 771건 — 처분 대기

구제본 `E:/Coding Infra/_rescue/ttl-work-260913-1554/`. 각 작업의 주인만 처분을 안다. TTL-Work 는 공유 폴더라 손대지 않는다.

### 2. Simon 이 직접 할 것

- **Q-260913-02** 보안담당에게 이 기계에만 있는 커밋(합집합 162 @09-13 18:1x) push 요청 — 피어 경유 승인은 승인이 아니다.

### 3. Simon 결정 대기

- **P1·다시** · **A1~A8**(위 "다음").
- A1 출시 법역(Q-S1) — "항상 KR"은 틀렸다(US·EU 분기 있음). 막는 것은 출시 국가 · 연령 · 노출 범위와 법무 서명.
- A2 마이그레이션 0171~0187 — 운영 적용 0/17. 번호 순 일괄 재생은 위험(0188 이 0186 과 정책 재정의 겹침 · down 파일 0).
- A3 `community_is_member` — 수정은 이미 main 의 0172 에 있다. 운영엔 0172 가 없다(A2 와 묶임, 보안담당).
- A4 웹 게시 — 라이브가 main 보다 95커밋 뒤(마지막 게시 `e98c9caf` 09-08).
- A5 PR #1800 PKCE — T1a 로는 게이트가 안 풀린다. 비밀번호 재설정 교차 클라이언트 회귀 리뷰(P2) 미해결.
- A6 보안 브랜치 — 로컬 113 · 원격 69 · 원격 없는 로컬 44 · 원격 67갈래 Actions 기록 0(보안담당).
- A7 `STATE.md` 소유자 — 두 세션 합의 그대로.
- A8 자살예방법 — 법률 시행일 2026-11-12 확인 · 시행령안 입법예고 확인 · 공포 관찰자 미지정.

### 4. 기다리는 것 (결정은 났고 조건이 밖에 있다)

- **설치본 `/vibe` SKILL.md 6-2 수정분(codex 입력창 걸림 사례) → SimonK-stack PR** — 머지가 모든 세션의 동기화 `rm -rf` 를 부르므로 **메모리 여유가 있을 때** 올린다. 구조 문제(스킬 폴더 안 `state/` 를 동기화가 지운다)도 같은 PR 에서 다룬다.
- `DECISIONS.md` 26.09.14 00:57 줄과 이 STATE 는 **미커밋** — Simon 결정 줄과 함께 PR.

### 5. 주인이 따로 있어 남긴 것

security-* 104곳 16.8 GiB · `.npm-security-landing-260906` 1.04 GiB · C: 후보 Q-260906-04 ≈11GB · SimonK-stack 메인 체크아웃 `feat/instructions-v8.1-s0` 로컬 ref 가 시작 훅의 `reset --hard origin/main` 에 끌려감(원격 PR #30 head `dc4e2229` 무사).

### 6. 기록이 사실과 다른 것

- `docs/HANDOFF.md` 활성 창이 0148 · 0149 · 0150 을 "적용 대기"로 적는다 → 운영 적용 완료(09-07, 09-13 22:31 목록으로 재확인)
- TTL-Work 의 `CLAUDE.md` 는 웹 배포를 gh-pages 라 적는다 → main 은 `actions/deploy-pages`
- 2ndB `CLAUDE.md` 의 "앱 화면 100" → 실측 101(T3 `app-screen-files`)
- `route-params-have-a-reader` 가드 주석과 결정 시트 초판의 "보내는 곳 둘" → 배송 발신처는 capture 하나(`CaptureLegacy` 저장 카드). `capture.tsx:447` 주석의 `entry=firstRun` 진입은 보내는 배송 코드 0곳
- `P1-pr-body.md` 의 "별 렌즈 '담기' → 영역 화면" 행 → 별 렌즈 '담기'는 기록 저장이라 브랜치의 조각 버튼과 무관
