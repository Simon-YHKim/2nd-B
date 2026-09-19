# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only · 09-13~09-18 은 기간 보관 파일 `DECISIONS-2026-09-*.md`). 지난 판의 경과는 git 이력과 DECISIONS 에 있다 — 이번 판은 **지금 상태만** 남겼다.

최종 갱신 **2026-09-20 04:55 KST** · Claude Code `673dc58f` · 워크트리 `E:/2ndB/.worktrees/claude-disk-260913` · 브랜치 `claude/vibe-r260919c`
소유자: 이 세션(09-13 `ttl-work-9a` 와 두 세션 합의, Simon 지명 아님). Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서 (최신 위)
- **09-19 밤 라운드 보고 (등급 M · 결정 7건 + 이월 Q-S1)**: <https://claude.ai/artifact/H7KGVqSjXj27NxEVdhQXWs>
- Android 재실행 멈춤 보고 (09-19 오전 · 결정 2건 — Simon 확정 11:4x): <https://claude.ai/artifact/8qYXcdSTkMYNzUaN5ZXfbh>
- 새벽 정리 결정 시트 v3 (09-17 · **DB 백업 카드**): <https://claude.ai/artifact/WKmnvY5gMQ3MrxFs8uwwCw>
- **공개 QA 빌드 `qa-260920-c91ebcbb`(main · 머지 16개 · 09-19 QA 앱 위에 덮어 설치 · #1814 는 빠짐)**: <https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260920-c91ebcbb>
- 옛 QA 빌드 `qa-260919-640db5bd`(통합 브랜치 · #1814 포함): <https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260919-640db5bd>
- 워커 산출물: `E:/Coding Infra/reports/vibe-r260919/`(r13~r37 · gate-* · regate-*) · QA 증거 `reports/qa-260919/` · APK `reports/apk/main-c423ba88-x86_64/` · `main-2d688ef0-arm64/`

---

## 완료

- **main 머지 16개(09-19 20:16 ~ 09-20 03:40)** — #1819 · #1810 · **#1833**(Android 두 번째 실행 Loading 멈춤) · #1828 · #1831 · #1826 · #1825 · #1827 · #1829 · #1830 · #1836(CI SDK) · **#1835**(이중 실패 출구 · Simon 확정 ① N=3) · #1837(HIBP 무한 대기) · #1838 · **#1840**(복구 세션 승격 울타리) · **#1842**(진행 중 이관 울타리). 전부 게이트 두 레인 통과(critical · high · medium 0) 뒤. main = `c91ebcbb`.
- **main 네이티브 확인** — x86_64 `c423ba88` 에뮬레이터(Pixel_9_Pro_XL · 5556) 실행 1 + 강제 종료 재실행 3 = Loading 없음 · 세션 유지 · FATAL 0 · 인증 경고 0(09-20 03:33).
- **웹 QA 서버** `http://127.0.0.1:8765/2nd-B/` = main `c91ebcbb`(워크트리 `qa-integration-260920`, 분석 · 오류 ID 비움). 재부팅하면 꺼진다 — 다시 띄우는 법은 `scratchpad/qa_static_server.js`.
- **운영 실측(읽기 전용)** — raw-clippings 객체 3 · 고아 0(→ 결정 5번 폐기 제안) · `ingest_log` RLS SELECT/INSERT 본인 정책 확인.
- **정리** — 머지 끝난 워크트리 7개 제거(브랜치 유지 · 공용 node_modules 745 매번 확인) · E: 56 → 64 GB · DECISIONS 2차 기간 분할(09-17~18 → `DECISIONS-2026-09-17_18.md` · 바이트 재조립 검증).

## 진행중

활성 워커(04:35): **r37**(#1841 3차 수정) · **#1814 8차 재게이트 두 레인**(`regate-1814-*-r8`). run `run_e3a3e38558ab`.

draft PR 3개:
- **#1814** 자동 저장 되돌리기 — 8차 수정 `93152b9e` 재게이트 중. 회차마다 medium 1(최근은 전체 PR 잔여 · 자기 회귀). 잔여 G2Z-1814-2(서버 S3) · M2 → **결정 1번**.
- **#1839** 설정 삭제가 원문까지 — **클라이언트 수정 라운드 멈춤**(1차 5건 닫자 2차 새 6건 — 구조 한계). **결정 1번** 답 대기. #1814 와 `promote-pending.ts` 충돌(나중 머지 쪽이 합침).
- **#1841** 가져오기 허브 중복 id 철회가 다른 행을 지움 — 3차 수정 중. 통과하면 **#1839 보다 먼저** 머지.

## 다음 (하나만)

**r37 · #1814 8차 판정 수확 → (둘 다 medium 0 이면) 머지 기차.** 그다음: 결정 시트(G14 · `scratchpad/build_g14_items.py` → `make_decision_sheet.py`) · 기록 PR **#1843**(draft) 마무리 머지(머지 전 `npm run check:lexicon`).

## 막힌 것

### 1. Simon 결정 대기 (보고서 결정 탭)
① 삭제 · 복구 서버 조정(S3) — 추천 **①**(02:53 에 ②에서 바꿈 · #1814 · #1839 가 여기에 걸림) · ② HIBP 네이티브 선버퍼 상한(추천 그대로 두기) · ③ 규칙 해석 "원래 있던 medium"(추천 ① 새로 싣는 것만 막음 — #1837 을 그렇게 머지함) · ④ 전체 삭제 뒤 남는 personas 등(추천 문구 먼저) · ⑤ 이미 남은 원문 정리(폐기 제안 · 고아 0) · ⑥ PostgREST 14.18(추천 버전 확인 뒤 업그레이드) · ⑦ Paddle 웹훅 헤더(추천 결제 출시 체크리스트) · 이월 **Q-S1 출시 법역**(DPIA · 빌드 8종 · 스토어 등록을 막음).

### 2. Simon 이 직접 할 것
- **DB 백업 비밀값 2개**(`Backup` 환경 `BACKUP_PGDUMP_DATABASE_URL` · `BACKUP_PGDUMP_AGE_PUBLIC_KEY`) — 09-13 부터 실패 · **09-26 쯤 복원본 0**. 카드는 새벽 정리 시트.
- `grok` 로그인 + xAI 잔액(402) — 웹 리서치 1순위 레인.
- PostgREST 버전 확인(대시보드 Infrastructure).

### 3. 보안 담당 트랙(운영 승격)
운영 마이그레이션 0151~0187 중 0165 만 적용 · Edge 는 09-07 배포본 · 결제 · 네이버 복구는 마이그레이션 + 비밀값 + 엣지 배포가 함께 필요. Edge 는 머지로 배포되지 않는다. 서버 S3(결정 1번)도 이 트랙과 조율.

### 4. 후속(코디네이터가 이어 갈 것)
- 같은 계열 후보: `recovery-proof-store.ts:309-313` 네이티브 직접 쓰기 · `import-pending.ts` runImport 늦은 `replacePendingCaptures` — 읽을 때 저장소 epoch · 쓸 때 대조하는 공통 설계.
- #1839 의 작은 독립 수정(예약 키 제거 · 살아 있는 생성 선점 거부 · null 비교) — 결정 1번이 "클라이언트로 계속"이면.

### 5. 기록이 사실과 다른 것 · 주인이 따로 있어 남긴 것
- TTL-Work `CLAUDE.md` 가 웹 배포를 gh-pages 라 적는다 → `actions/deploy-pages`.
- `fix/security*` 로컬 브랜치 47개 · 공유 스태시 22 · TTL-Work 미커밋 구제본 `E:/Coding Infra/_rescue/ttl-work-260913-1554/` — 손대지 않음.
- ⚠ 09-20 01:4x 옛 QA 워크트리 `qa-integration-260918`(여기 '남긴 것'이었다)을 대조 없이 지웠다 — 브랜치 · 커밋 · 태그 · 서명 키(`E:/Coding Infra/tools/qa-test.keystore`) 무사, 빌드 환경만 사라짐.
- **남긴 것: QA APK 빌드 환경 워크트리 `E:/2ndB/.worktrees/qa-apk-260920`**(브랜치 `qa/apk-260920` · **정션 아닌 실제 node_modules** · 로컬 QA 빌드용) · 웹 QA 워크트리 `qa-integration-260920`(정션 · 8765 서버의 dist).
