# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only · 09-13~09-16 은 기간 보관 파일 `DECISIONS-2026-09-*.md`). 지난 판의 경과는 git 이력과 DECISIONS 에 있다 — 이번 판은 **지금 상태만** 남겼다.

최종 갱신 **2026-09-19 11:31 KST** · Claude Code `673dc58f` · 워크트리 `E:/2ndB/.worktrees/claude-disk-260913` · 브랜치 `claude/vibe-r260919b`
소유자: 이 세션(09-13 `ttl-work-9a` 와 두 세션 합의, Simon 지명 아님). Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서 (최신 위)
- **Android 재실행 멈춤 보고 (09-19 11:03 · 결정 2건 응답 대기)**: <https://claude.ai/artifact/8qYXcdSTkMYNzUaN5ZXfbh>
- **공개 QA 빌드 `qa-260919-640db5bd`(수정 포함 · 09-18 빌드 위에 덮어 설치)**: <https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260919-640db5bd>
- **새벽 정리 결정 시트 v3 (09-17 05:40 · 확정 8건 실행 결과 · DB 백업 카드)**: <https://claude.ai/artifact/WKmnvY5gMQ3MrxFs8uwwCw>
- 옛 공개 QA 빌드 `qa-260918-84d6800c`(**두 번째 실행부터 멈춤** — 안내문이 새 릴리스를 가리킴): <https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260918-84d6800c>
- 보안 점검 D3 · D1 (v2, 09-16 01:55): <https://claude.ai/code/artifact/77fc83d3-a258-4633-8ac5-3155d54fbf70>
- #1814 자동 저장 재설계안 (09-16): <https://claude.ai/code/artifact/b7f2af2c-bef4-4440-8bf7-95c9e7856480>
- 워커 산출물: `E:/Coding Infra/reports/vibe-r260919/r13-boot-hang/` · `vibe-r260917/{r10-*,r11-sec-port-{a,b,c},r12-sec-n1}/` · `vibe-r260916/*` · QA 증거 `reports/qa-260919/`

---

## 완료

- **main 착지** — #1811 · #1812 · #1813 · #1815(09-14) · 보안 통합 #1807(09-13) · 스토어 문안 #1824 `a690b742`(09-17).
- **Simon 확정(원문은 DECISIONS)** — 09-15 D2 ①(#1819 게이트 뒤 머지) · 09-16 D3 ① · D1 ① · #1814 설계 ① · D-1 ② · 09-17 시트 7건 + N1 ① · 09-18 QA APK 를 머지 없이 공개 사전 릴리스로.
- **코딩 끝 · 게이트 대기(draft PR 10개, 전부 CI 초록)** — #1819 네이티브 부팅 · #1810 홈 별 이름 · #1814 자동 저장 재설계(HEAD `42d24cad`) · 보안 이식 #1825 U5+U6 · #1826 U2+U3 · #1827 U4 · #1828 U1 · #1829 U7 · #1830 U8(#1829 위) · #1831 N1(#1828 위).
- **09-17 새벽 정리** — 대기 세션 15 판정 → 14 닫음 · security 워크트리 115 판정(UNIQUE 18 · "#1807 이 전부 담았다"는 거짓) → 폴더 전부 제거 · 반영분 로컬 브랜치 68 삭제(번들 백업 2개) · 공개 Actions 로그의 비밀값 digest 실행 4건 삭제 · Lecture 로컬 정리.
- **QA 환경(09-18~19)** — localhost 웹 QA(`qa_web_build.py` + `qa_static_server.js`, 포트 8765 — 재부팅으로 꺼짐, 다시 띄우면 됨) · 로컬 APK 빌드(`E:/Coding Infra/tools/qa_apk_build.py`) · Orca 에뮬레이터 정상화(AVD 6개 host GPU · 콜드 부팅 · 4 GB + 감시자 `avd-guard -Watch` 시작프로그램 등록).
- **머지 전 확인 3건(09-19 09:55)** — `secrets list -o json` 모양 · digest = 평문 SHA-256 → #1825 검증 로직과 맞음 · 운영 `PADDLE_API_BASE` 미설정 → #1827 기본값 · Paddle 응답 `application/json`. 웹훅 요청 Content-Type 은 간접 근거까지(직접 확인 = 샌드박스 시뮬레이터, Simon).
- **DECISIONS.md 기간 분할(09-19 09:54)** — 보관 3개 + 활성, 바이트 재조립 검증.

## 진행중

활성 워커 **1** (11:31 KST) — **r14-boot-exit** `ctx_aedfc1071b45`(`claude-fable-5-1` @max · run `run_e3a3e38558ab` · 워크트리 `fix-auth-boot-exit-260919`): 저장소 읽기 + 로컬 로그아웃 이중 실패 때의 출구, 결정 시트 1번 추천안 ① A″(연속 3회 콜드 스타트 뒤 기존 복구 동의 화면) **draft 까지** — Simon 이 시트에서 고르지 않았으므로 머지는 Simon 확인 뒤. 수확 = G8 kill → worker-release → terminal close → 원장 → DECISIONS.

게이트 대기 draft PR 11개 — #1819 · #1810 · #1814 · #1825~#1831 · **#1833**(Android 두 번째 실행 멈춤 수정, CI 초록).

**로컬 QA 환경(Simon 이 13:00 claude 리셋 뒤 QA 예정)**: 웹 <http://127.0.0.1:8765/2nd-B/>(`qa/integration-260919` = `640db5bd`, 11:26 빌드) · Orca 에뮬레이터 5554(`2ndB_Codex_API36_260727`)는 **v0.8.0 그대로**(QA 빌드는 versionCode 40 < 51 이라 삭제 없이 못 올림) · 최신 QA 빌드는 AVD `Pixel_9_Pro_XL`.

## 다음 (하나만)

**r13 수확 → 19:47 KST codex 리셋 뒤 게이트 라운드.** 게이트 전 `npm install -g @openai/codex@latest`(check_tooling 이 뒤처짐 경고 — G11, 도는 codex 프로세스 없는지 먼저 확인). 게이트 두 레인(daybreak 산출물 · astra 비즈로직)을 PR 11개(#1833 포함 — 가장 먼저)에 → 통과분 머지(main 은 strict — BEHIND 면 `gh pr merge --auto --squash` 또는 브랜치 갱신 뒤 CI 재대기 · 머지 뒤 `state=MERGED` 확인 · 쌓인 순서 #1828→#1831 · #1829→#1830, 위 PR 은 base 를 main 으로) → main push 진단 APK 확인. 게임 노트: #1814 "새 대화 뒤 저장"은 D-1 ② 의도된 동작.

## 막힌 것

### 1. ⛔ codex 99% · grok 100% · gemini 워커 불가 — 보안 게이트 두 레인은 19:47 KST 뒤
claude 주간 82%(리셋 09-19 13:00) → 코딩은 fable 버킷(0%)으로. ⚠ #1819 머지 전: main 에 `[ota]`/`[release]` 커밋 금지 · main 에서 Android 릴리스 금지.

### 2. Simon 이 직접 할 것
- **DB 백업 비밀값 2개**(`Backup` 환경 `BACKUP_PGDUMP_DATABASE_URL` · `BACKUP_PGDUMP_AGE_PUBLIC_KEY`) — 09-13 부터 매일 실패, 마지막 성공 09-12 · 보존 14일 → **09-26 쯤 복원본 0**. 명령은 결정 시트 카드.
- D3: 대시보드 PostgREST 버전 확인 → (14.18 미만) 지원 요청 발송.
- Paddle 샌드박스 시뮬레이터로 웹훅 Content-Type 1회 확인(운영 승격 전).
- D1 관련(급하지 않음): 복구 · 가입 확인 템플릿 `{{ .Token }}` · Site URL · OTP 6자리. ⚠ `supabase config push` 금지.
- A1 출시 법역 Q-S1(법무 질의) — 여전히 열림 · 스토어 등록은 그 뒤(S-2).
- Grok 계정 · 구독 확인(HubDashMonitor 세션이 09-18 부터 대기) · MFDS 고객센터 문의(D5).

### 3. 보안 담당 트랙(운영 승격) — 웹 게시 D1 의 선행 조건
운영 마이그레이션 0151~0187 중 0165 만 적용 · Edge 는 09-07 배포본(#1807 뒤 0건) · 결제 복구 = 0184 + `PADDLE_CHECKOUT_BINDING_SECRET`(운영 미설정 확인 09-19) + main paddle-webhook · subscription-manage · 네이버 복구 = 0183 + completion 초안 + 비밀값 + main oauth-naver · #1814 서버 몫 S1~S6. Edge 는 머지로 배포되지 않는다(`deploy-edge-function.yml` 수동 전용).

### 4. ⛔ TTL-Work 미커밋 — 처분 대기
구제본 `E:/Coding Infra/_rescue/ttl-work-260913-1554/`. 공유 폴더라 손대지 않는다.

### 5. 스킬 · 도구
- /vibe C-realtime 레인 복구(grok 잔액 · gemini 워커 경로) · gstack 업그레이드는 게이트 라운드 뒤(시트 2번 미응답 → 추천대로).
- 게시 워크플로 · PR CI 가 게시물 CSP 검사(`verify:web`)를 안 돌린다(SEC-2 발견).
- Orca 1.4.200 은 에뮬레이터에 GPU 옵션을 안 넘긴다 — AVD 설정으로 우회 중(`E:/Coding Infra/tools/avd-guard/`).

### 6. 기록이 사실과 다른 것
- TTL-Work `CLAUDE.md` 가 웹 배포를 gh-pages 라 적는다 → `actions/deploy-pages`.

### 7. 주인이 따로 있어 남긴 것
`fix/security*` 로컬 브랜치 47개(이식 출처 18 · 기록된 폐기 28 · peer-rss-fresh 1 — 폴더는 전부 제거) · `.npm-security-landing-260906` · C: 후보 Q-260906-04 · 공유 스태시 22 · 워크트리 `qa-integration-260918`(공개 QA 릴리스 태그의 출처 · 로컬 빌드용 실제 node_modules).
