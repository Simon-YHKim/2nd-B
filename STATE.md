# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only).

최종 갱신 **2026-09-13 19:28 KST 기준** · Claude Code `673dc58f` (ListAgents `ttl-work-rev2-1c` · 워크트리 `E:/2ndB/.worktrees/claude-disk-260913`)
소유자: 이 세션 — `ttl-work-9a` 가 19:2x 에 넘겼다. **Simon 지명이 아니라 두 세션 합의**다(`DECISIONS.md` 26.09.13 19:28 줄).
Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서 둘
- 디스크 정리 결과(19:25): <https://claude.ai/code/artifact/db1d3e47-8280-426f-95d3-1cf67f2baf97>
- 결정 8건(16:20): <https://claude.ai/code/artifact/ad6208ec-285e-4f81-b0ef-da4f69a14060>

---

## 완료

- **디스크 정리 1·2차** — 17곳 · 지운 파일 크기 **21.85 GiB** · 사라진 작업 0. Simon 이 목록을 두 번 보고 승인했다.
  여유 **C: 24.8 → 28.6 GB · E: 22.4 → 35.5 GB**(18:58). 공용 `E:/2ndB/node_modules` **747 → 747**.
  1차: 워크트리 12 + 미등록 클론 1 · 2차: Orca Design(C:) · 쉬는 세션 워크트리 2(Orca 터미널 8개 닫고) · `E:/2ndB/android` 캐시 8폴더.
  구제본: `E:/Coding Infra/_rescue/worktrees-260913-1807` · `worktrees-260913-1825-r2` · 도구 `tools/cleanup-260913`
- **`~/.claude/skills` 복사본** — git 밖인 `vibe` · `simon-handoff` 를 `_rescue/skills-260913-1753` 에 떴다(35파일, 차이 0).
- **인계 수치 정정 셋** — 53.9GB 는 이중 계산(실측 39.9GB) · 조사 도구의 index.lock · 보안 미푸시 114 → 162(18:1x). 도구의 두 버그는 ttl-work-9a 가 고쳤다.
- (앞선 세션, 09-13) HANDOFF 732KB 기간 분할 #1801 · `/simon-handoff` 갱신 · `/vibe` 적대평가 1회차 · TTL-Work 구제 스냅샷.

## 진행중

없음. 열린 PR 은 **#1800(PKCE)** — 아래 "막힌 것" 2의 A5.

## 다음 (하나만)

**A — 안드로이드 에뮬레이터 화면 검증** (Simon 지시 09-13 17:0x: *"아이폰, 안드로이드 폰 에뮬레이터를 적극 이용해서 화면 검증까지"*). **재부팅 뒤 시작.**

- 에뮬레이터는 5일째 떠 있다가 17:12 에 `adb shell` 이 굳었다. 재부팅으로 내려가니 새로 띄운다. AVD 6개.
- ⚠ arm64 전용 출시 APK 는 x86_64 에뮬에서 안 돈다 → `eas.json` 의 `preview-emulator` 프로필로 빌드한다.
- ⚠ 아이폰 시뮬레이터는 이 기계(Windows)에서 불가능하다. 대안 셋: 실기 iPhone + Expo dev client / EAS → TestFlight / 웹 390×844 뷰포트(레이아웃만).
- 볼 화면 6곳과 근거: `docs/HANDOFF.md` 의 "새 워크트리로 넘긴다" 블록 표(온보딩 백지 · `/account`·`/data` 스피너 · `/privacy` 문구 · 영어 담기 실패 문구 · 별 라벨 잘림 · OAuth 5종 = #1800 게이트).

### 그 뒤 (되살리기 큐)

**P1 — 배송 홈이 `highlightRecordId` 를 읽는다.** 보내는 곳 둘(`src/app/capture.tsx:2254` · `src/app/record/[id].tsx:224`), 읽는 곳은 아카이브된 홈(`legacy/screens/index.tsx:303,308`)뿐이다. 되살리기 큐(Q11 · P2 · P3 · P4) 전체의 선행.

## 막힌 것

### 1. ⛔ TTL-Work 미커밋 771건 — 처분 대기

구제본 `E:/Coding Infra/_rescue/ttl-work-260913-1554/`(tracked.patch 577파일 · untracked.tar 951파일). 어느 것이 완성이고 폐기인지는 각 작업의 주인만 안다.
TTL-Work 는 지금도 claude 8 · codex 5 가 쓰는 공유 폴더라 디스크 정리에서도 뺐다(15.2 GiB).

### 2. Simon 결정 대기

| | 무엇 | 막고 있는 것 |
|---|---|---|
| A1 | 출시 법역(Q-S1) | DPIA A~H 전부 + 빌드 8종 |
| A2 | 마이그레이션 0171~0187 운영 적용 | 레이트리밋 · 인가 · 감사 하드닝 17건이 코드에만 있다 |
| A3 | `community_is_member` 미바인딩 | 로그인한 누구나 타인 멤버십 조회(보안담당) |
| A4 | 웹 게시 승인(D1) | 라이브가 main 보다 92커밋 뒤(16:20 기준) |
| A5 | PR #1800(PKCE) | 머지 조건이 에뮬 로그인 5종 확인 — **다음 A 가 이걸 푼다** |
| A6 | 미확인 보안 브랜치 방향 | CI 를 한 번도 안 탄 갈래가 다수 |
| A7 | `STATE.md` 소유자 | 지금은 합의로 이 세션. Simon 확인 |
| A8 | 자살예방법 시행령 공포 관찰자 | 시행 2026-11-12(미확인)인데 배정 없음 |
| Q-260913-02 | 보안담당에게 커밋 162개 push 요청 | 보안 워크트리 104곳(16.8 GiB) 정리 판정 |
| Q-260913-03 | `/vibe` · `/simon-handoff` 를 SimonK-stack 에 커밋 | 지금은 복사본뿐 — 재설치 시 덮일 수 있다 |

### 3. 주인이 따로 있어 남긴 디스크

security-* 104곳 16.8 GiB(이 기계에만 있는 커밋 162 @18:1x) · `.npm-security-landing-260906` 1.04 GiB(Simon 미선택) ·
C: 후보 Q-260906-04 ≈11GB(Orca codex 세션 기록 중복 7.9GB 등) · `handoff-split-260913`(clean, main 과 0줄 차이 — 다음 라운드).
⚠ 선점 기록 `RELEASE-INTEGRATE-260906`(active, 주인 ttl-work-a1)이 **지운 vibe-native-prep-260906 을 가리킨다.** 남의 기록이라 안 고쳤다.

### 4. 이월된 질문

- **Q-260908-01** `/privacy` 안심 문구 — 3회 이월 → **기본값으로 진행 통보(19:25)**: 지금처럼 안 띄우고, 공백을 드러내는 가드는 떼지 않는다
- **Q-260908-02** 기존 가입자 재고지 — 3회 이월 → **기본값**: 출시 법역(Q-S1)과 함께 정한다
- **Q-260913-01** `DECISIONS.md` · `STATE.md` 거처 — 2회 이월 · 권고: 루트 유지

### 5. 기록이 사실과 다른 것 (17:2x 기록을 옮겼다 — 이번 세션은 재확인하지 않았다)

- `docs/HANDOFF.md` 활성 창이 0148 · 0149 · 0150 을 "적용 대기"로 적는다 → 09-07 운영 적용 완료
- TTL-Work 의 `CLAUDE.md` 는 웹 배포를 gh-pages 라 적는다 → main 은 `actions/deploy-pages`(#1657)
- `docs/WEB-PUBLISH-RUNBOOK.md` 의 "Simon 확인 사항" → D4 로 닫혔고 #1795 로 고쳐졌다
- `docs/handoff/HANDOFF-2026-08-p4.md:1348` 의 "0건 · 수정 불요" → 같은 문단이 반례를 적는다(A3)
