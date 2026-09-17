# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only). 지난 판(09-14 01:04 기준, 32KB)의 경과는 git 이력과 DECISIONS 에 있다 — 이번 판은 **지금 상태만** 남겼다.

최종 갱신 **2026-09-18 02:25 KST** · Claude Code `673dc58f` · 워크트리 `E:/2ndB/.worktrees/claude-disk-260913` · 브랜치 `claude/vibe-r260915a`(origin/main `82fdc474` 위, 기록 커밋 미푸시 — 세션 끝 docs PR)
소유자: 이 세션(09-13 `ttl-work-9a` 와 두 세션 합의, Simon 지명 아님). Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서 (최신 위)
- **새벽 정리 결정 시트 (09-17 03:17, 7문항 응답 대기)**: <https://claude.ai/artifact/WKmnvY5gMQ3MrxFs8uwwCw>
- **보안 점검 D3 · D1 (v2, 09-16 01:55)**: <https://claude.ai/code/artifact/77fc83d3-a258-4633-8ac5-3155d54fbf70>
- **#1814 자동 저장 재설계안 (09-16)**: <https://claude.ai/code/artifact/b7f2af2c-bef4-4440-8bf7-95c9e7856480>
- 남은 결정 세 가지 시트(09-16 00:35, 셋 다 확정됨): <https://claude.ai/code/artifact/95799def-2a11-41b1-8e00-d41efede712e>
- 옛 결정 시트 0913 밤(17판, 기록용): <https://claude.ai/code/artifact/6d5c0c58-e6cd-46b7-b1e6-84233a1bd04f>
- 보안 담당 전달 페이지(09-16, **대체됨** — Simon 지시로 /vibe 보안 담당 섹션이 직접 확인): <https://claude.ai/code/artifact/f87dff4a-970f-46c5-ba39-611c66e66549>
- 워커 산출물: `E:/Coding Infra/reports/vibe-r260917/{r10-sessions,r10-security,r10-1814-rd}/` · `vibe-r260916/{r7-1814-design,r8-sec,r9-1814-ra,rb,rc}/` · `vibe-r260914/*`

---

## 완료

- **main 착지(09-14)** — #1811 `8ca2251d` · #1812 `c95242dc` · #1813 `00bd342c` · #1815 `dbe4c1ab`. 보안 통합 #1807(09-13 15:46Z, `productionComplete=false`).
- **Simon 확정 09-15** — D2 ①(#1819 는 리셋 뒤 게이트 둘 → 머지) · Q-260914-01 정정 B(토글 + 위키 한 장 + 조각 한 건) · Q-260914-02 ①(#1810 상한 제거).
- **Simon 확정 09-16** — D3 ①(서버 버전 확인 → 안 고쳐졌으면 지원 요청) · D1 ①(보안 담당 확인 뒤 게시) · Q-260914-03 ①(#1814 흐름 전체 재설계, 설계안 먼저).
- **PR #1810 코딩 끝** — HEAD `730e8eb6` · H 규칙(main 대비 겹침 ⊆ · 잘림 ≤) · verify rc=0 · draft · 재게이트 대기.
- **PR #1819 네이티브 수정** — HEAD `f7dcf30c` · Helmet 웹 가드 · `PixelPressable` `collapsable={false}` · CI 초록 · draft · 게이트 대기.
- **`JWT issued at future` 원인 · 재측정(09-14)** — PostgREST 시각 캐시, 오후 12회 중 3회 거절.
- **/vibe 보안 담당 섹션(09-16 00:57~01:55, Simon 지시 "스킬 시험 겸")** — 운영은 코디네이터가 읽기만(쓰기 0) → 워커 둘:
  - **SEC-1 D3 공개자료**: 사고 `6q5902p2xd9f` 여전히 identified · 수정은 PostgREST v14.18 에 실재 · **09-02 뒤 서울 적용 완료 문장 0** · 09-13·15 호스팅 14.5 → 코디네이터 판단 "수정 전 가능성 높음(추정)". 로그 거절 0행은 트래픽 2건이라 무의미.
  - **SEC-2 D1 판정**: 지금 main 게시하면 **웹 결제 전부 · 네이버 로그인 버튼**이 깨진다(복구 = 운영 승격) · 이메일 · 가입 · 구글/애플/카카오/깃허브 · 첫 화면은 동작 · 비밀번호 찾기는 운영 복구 템플릿 `{{ .Token }}` 에 달림 → **권고 ③ 승격까지 게시 보류**(D1 ① 에 비추면 기존 결정 그대로).
  - 피해 크기(운영 읽기): 네이버 가입자 0 · 웹 결제 1건(08-08, 다음 날 해지) · 최근 30일 로그인 2명 / 전체 19.
  - 스킬 시험 발견: C-realtime 레인 둘 다 불가(grok 402 · gemini 워커 불가) · 로그 문구 검색 거짓 0 · 결제 원장 `occurred_at` NULL 거짓 0.
- **#1814 재설계안 완료(09-16 01:56)** — `design.md` 72KB(흐름 지도 · 17건 대응표 · 서버 몫 S1~S6 · 커밋 8 · 반증 R1~R9) · 전제 절반 반증 → 서버 몫 S2 추가 · Simon 결정 D-1(Q-260916-01).
- **원장** — r7-1814-design · r8-sec1 · r8-sec2 행 기록, 이번 run 대기 0. G8 강제종료 셋 모두 남은 것 0.
- **SimonK-stack PR #33 머지**(`8af57ff5`, pitfalls +6).
- **Simon 확정 09-16 02:58** — #1814 설계 ① 이대로 코딩 · D-1 ② 새 대화에도 앞 대화는 그대로 저장.
- **#1814 코딩 1~3회차** — C1·C2·C3·C6·C4·C7 커밋, HEAD `594c6156`, CI 초록(상세 DECISIONS 09-16).
- **09-17 새벽 정리(Simon 자리 비움 지시)** — 앱 정리(Chrome·ChatGPT·Telegram·WebView) · 대기 세션 15 판정 → 14 닫음(메모는 DECISIONS 03:00 줄) · security 워크트리 115 판정(UNIQUE 18, 전제 거짓) → 폴더 96개 제거 · 브랜치 0 삭제 · 번들 백업 · 결정 시트 발행. 여유 메모리 1.96 → 8.03 GB.

## 진행중

활성 워커 **0** (05:39 KST). 보안 draft PR 7개 전부 CI 초록 · 게이트 대기 — #1825 U5+U6 · #1826 U2+U3 · #1827 U4 · #1828 U1 · #1829 U7 · #1830 U8(#1829 위) · #1831 N1(#1828 위). #1814 코딩 끝(HEAD `42d24cad`).

## 다음 (하나만)

**2026-09-19(토) 19:47 KST codex 리셋 뒤 게이트 라운드 → 머지 → QA APK 비공개 초안 릴리스** (Simon 확정 09-18 03:02). 순서: 게이트 두 레인 → PR 10개 머지(#1828→#1831 · #1829→#1830) → main push 진단 APK 수령·확인(서명·ABI·에뮬 부팅) → `gh release create --draft` 로 APK + SHA256SUMS 첨부 → 링크 전달. 머지 전 확인 3건: Paddle 웹훅 Content-Type · `secrets list --output json` 형식 · 운영 PADDLE_API_BASE.

## 막힌 것

### 1. ⛔ codex 주간 쿼터 99% — 보안 게이트 두 레인 불가
리셋 **2026-09-19(토) 19:47 KST**. 그 뒤: #1819 게이트 둘 → CI → 머지 → main 진단 APK N0~N5(E5 재기동 대조 포함) · #1810 재게이트 → 머지 · #1814 코딩 끝나면 게이트.
⚠ #1819 머지 전: main 에 `[ota]`/`[release]` 커밋 금지 · main 에서 Android 릴리스 금지.

### 2. Simon 이 직접 할 것
- D3: 대시보드 PostgREST 버전 확인 → (14.18 미만) 지원 요청 발송. 프로젝트 재시작은 따로 승인.
- D1 관련(급하지 않음): 복구 · 가입 확인 템플릿 `{{ .Token }}` · Site URL · OTP 6자리 확인. ⚠ `supabase config push` 금지.
- #1814 설계안 응답.
- A1 출시 법역 Q-S1(법무 질의) — 여전히 열림.

### 3. 보안 담당 트랙(운영 승격) — 웹 게시 D1 의 선행 조건
운영 마이그레이션 0151~0187 중 0165 만 적용 · Edge 는 09-07 배포본(#1807 뒤 0건) · 결제 복구 = 0184 + `PADDLE_CHECKOUT_BINDING_SECRET` + main paddle-webhook · subscription-manage · 네이버 복구 = 0183 + completion 초안 + 비밀값 + main oauth-naver · #1814 서버 몫 S1~S6. 브랜치 처분 · 머지 · 삭제는 보안 담당 소유(피어 경유 승인은 승인이 아니다).

### 4. ⛔ TTL-Work 미커밋 771건 — 처분 대기
구제본 `E:/Coding Infra/_rescue/ttl-work-260913-1554/`. 공유 폴더라 손대지 않는다.

### 5. 스킬 · 도구
- /vibe C-realtime 레인 복구(grok 잔액 · gemini 워커 경로) — 스킬 개선 후보.
- 게시 워크플로 · PR CI 가 게시물 CSP 검사(`verify:web`)를 안 돌린다(SEC-2 발견).

### 6. 기록이 사실과 다른 것
- `docs/HANDOFF.md` 활성 창이 0148 · 0149 · 0150 을 "적용 대기"로 적는다 → 운영 적용 완료(09-07).
- TTL-Work `CLAUDE.md` 가 웹 배포를 gh-pages 라 적는다 → `actions/deploy-pages`.
- 2ndB `CLAUDE.md` "앱 화면 100" → 실측 101.
- 메모리의 "v14.18 지역별 적용"은 상태 페이지 문장이 아니었다(09-16 정정 반영함).

### 7. 주인이 따로 있어 남긴 것
security-* 워크트리 19개(UNIQUE 18 + 미커밋 1 — 시트 X-2·X-4 응답 전까지 유지) · `.npm-security-landing-260906` · C: 후보 Q-260906-04 · 공유 스태시 22 · codex 세션.
