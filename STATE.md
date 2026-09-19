# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only · 09-13~09-18 은 기간 보관 파일 `DECISIONS-2026-09-*.md`). 지난 판의 경과는 git 이력과 DECISIONS 에 있다 — 이번 판은 **지금 상태만** 남겼다.

최종 갱신 **2026-09-20 08:50 KST** · Claude Code `673dc58f` · 워크트리 `E:/2ndB/.worktrees/claude-disk-260913` · 브랜치 `claude/decisions-260920`
소유자: 이 세션(09-13 `ttl-work-9a` 와 두 세션 합의, Simon 지명 아님). Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서 (최신 위)
- **09-19 밤 라운드 보고 (등급 M · 결정 7건 + 이월 Q-S1)**: <https://claude.ai/artifact/H7KGVqSjXj27NxEVdhQXWs>
- Android 재실행 멈춤 보고 (09-19 오전 · 결정 2건 — Simon 확정 11:4x): <https://claude.ai/artifact/8qYXcdSTkMYNzUaN5ZXfbh>
- 새벽 정리 결정 시트 v3 (09-17 · **DB 백업 카드**): <https://claude.ai/artifact/WKmnvY5gMQ3MrxFs8uwwCw>
- **공개 QA 빌드 `qa-260920-585aac5f`(= 지금 main · 머지 17개 · #1841 포함 · 앞 QA 앱 위에 덮어 설치 · #1814 는 빠짐)**: <https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260920-585aac5f>
- 앞 QA 빌드 `qa-260920-c91ebcbb`(머지 16개 · 본문 맨 위에 대체 안내): <https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260920-c91ebcbb>
- 옛 QA 빌드 `qa-260919-640db5bd`(통합 브랜치 · #1814 포함): <https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260919-640db5bd>
- 워커 산출물: `E:/Coding Infra/reports/vibe-r260919/`(r13~r37 · gate-* · regate-*) · QA 증거 `reports/qa-260919/` · APK `reports/apk/main-c423ba88-x86_64/` · `main-2d688ef0-arm64/`

---

## 완료

- **main 머지 17개(09-19 20:16 ~ 09-20 05:41)** — #1819 · #1810 · **#1833**(Android 두 번째 실행 Loading 멈춤) · #1828 · #1831 · #1826 · #1825 · #1827 · #1829 · #1830 · #1836(CI SDK) · **#1835**(이중 실패 출구 · Simon 확정 ① N=3) · #1837(HIBP 무한 대기) · #1838 · **#1840**(복구 세션 승격 울타리) · **#1842**(진행 중 이관 울타리) · **#1841**(가져오기 허브 중복 id 철회가 다른 행을 지우던 것). 전부 게이트 두 레인 통과(critical · high · medium 0) 뒤. 기능 머지의 끝은 `2dce7ead`, 기록 PR #1843 까지 실은 **main = `585aac5f`**.
- **main 네이티브 확인** — x86_64 `c423ba88` 에뮬레이터(Pixel_9_Pro_XL · 5556) 실행 1 + 강제 종료 재실행 3 = Loading 없음 · 세션 유지 · FATAL 0 · 인증 경고 0(09-20 03:33).
- **QA 산출물 둘 다 지금 main `585aac5f`** (06:0x 재빌드 — #1841 이전 동작을 QA 하게 되는 것을 막으려고):
  - **웹 QA 서버** `http://127.0.0.1:8765/2nd-B/`(워크트리 `qa-integration-260920` · 분석 · 오류 ID 비움 · `entry-a8d8d24d`). headless Chrome 으로 로그인 화면 렌더 · 콘솔 오류 0 확인. 재부팅하면 꺼진다 — 다시 띄우는 법은 `scratchpad/qa_static_server.js`.
  - **폰용 APK** 사전 릴리스 `qa-260920-585aac5f`(66.6MB · arm64-v8a · 서명 `6053a4c7…` · versionCode 40 = 앞 QA 앱 위에 데이터 유지 덮어 설치). 이번 커밋 자체의 에뮬레이터 확인은 없음(네이티브 파일 무변경 · `c423ba88` 확인으로 대신).
- **운영 실측(읽기 전용)** — raw-clippings 객체 3 · 고아 0(→ 결정 5번 폐기 제안) · `ingest_log` RLS SELECT/INSERT 본인 정책 확인.
- **G14 결정 시트** `E:/Coding Infra/reports/vibe-r260919/decision-sheet-run_e3a3e38558ab.html`(브라우저로 열어 채택/보류 저장 → 다음 /vibe 가 회수).
- **정리** — 머지 끝난 워크트리 10개 제거(브랜치 유지 · 공용 node_modules 745 매번 확인) · E: 56 → 64 GB · DECISIONS 2차 기간 분할(09-17~18 → `DECISIONS-2026-09-17_18.md` · 바이트 재조립 검증).

## 진행중

**Simon 이 결정 8건을 전부 「확정」으로 돌려줬다(08:45).** 내용은 `DECISIONS.md` 26.09.20 08:45 여덟 줄. 이 판은 그 집행 판이다.
활성 워커 **0**(06:0x · 디스패치 72개 전부 completed/failed) · run `run_e3a3e38558ab` 마감.
기록 파일 크기: `DECISIONS.md` 는 101KB 에 닿아 **3차 기간 분할**(09-19 → `DECISIONS-2026-09-19.md` · 32줄 · 바이트 재조립 검증) 후 **51KB**. ⚠ `docs/HANDOFF.md` **99.4KB** — **다음 블록을 얹기 전에 굴린다**(요약 금지 · 오래된 블록부터 `handoff/HANDOFF-2026-09.md` 맨 위로 옮겨 80KB 아래로 · 블록 수 보존).

draft PR 2개(둘 다 클라이언트 수정 라운드 멈춤 → **결정 1 로 서버 설계 재작업 대상**):
- **#1814** 자동 저장 되돌리기 — HEAD `93152b9e` · 8차 재게이트 M3 L2(**8차 수정의 회귀** G7A-1814-2: 10초 상한이 SDK 잠금을 못 풀어 로그인 · 로그아웃이 멈출 수 있음 — 다시 이어가면 이것부터 되돌린다) · 잔여 G2Z-1814-2(서버 S3) · M2.
- **#1839** 설정 삭제가 원문까지 — **클라이언트 수정 라운드 멈춤**(1차 5건 닫자 2차 새 6건 — 구조 한계). **결정 1번** 답 대기. #1814 와 `promote-pending.ts` 충돌(나중 머지 쪽이 합침).

## 다음 (하나만)

**결정 1 + 4 를 한 설계로 쓴다 — 삭제 · 복구를 서버가 소유하는 S3 설계서.** 네 갈래(참조 확인 + 삭제 단일 RPC · frontmatter 키 단위 갱신 · 삭제 의도 대기열 · 업로드 세대) + 계정 전체 삭제 정책(테이블 등록부)을 **한 벌의 마이그레이션**으로 잡는다. 그다음에야 #1814 · #1839 를 그 위에서 다시 만든다(#1814 는 8차 회귀 `93152b9e` 되돌리기부터).

## 막힌 것

### 1. Simon 이 직접 해야 풀리는 것 (결정 집행의 선행조건)
- ⛔ **결정 5(원문 폐기)의 선행조건 = DB 백업.** `db-backup.yml` 이 **09-14~09-19 6회 연속 실패**(08:0x 실측). 되돌릴 수단이 없는 상태에서 운영 데이터를 지우지 않는다. 순서: 비밀값 2개(`BACKUP_PGDUMP_DATABASE_URL` · `BACKUP_PGDUMP_AGE_PUBLIC_KEY`) → 백업 1회 성공 → 폐기.
- **결정 6** PostgREST 버전 확인(대시보드 Infrastructure) → 14.18 미만이면 업그레이드.
- **결정 7** Paddle 샌드박스 웹훅 1회 발사(로그인 필요) → 실제 Content-Type 관측.
- **Q-S1 출시 법역**: Simon 이 "메모에 적었다"고 했으나 **그 메모가 이 세션에 닿지 않았다**(붙여넣은 블록에 메모 절 없음 · 다운로드 폴더에 `decisions_run_*.json` 없음 · 아티팩트 코멘트 0). 한 줄 필요.

### 2. Simon 이 직접 할 것 (위 1번 외)
- `grok` 로그인 + xAI 잔액(402) — 웹 리서치 1순위 레인.
- DB 백업 카드 원문은 새벽 정리 시트(`WKmnvY5gMQ3MrxFs8uwwCw`)에 있다 — 위 1번의 ⛔ 와 같은 건이다.

### 3. 보안 담당 트랙(운영 승격)
운영 마이그레이션 0151~0187 중 0165 만 적용 · Edge 는 09-07 배포본 · 결제 · 네이버 복구는 마이그레이션 + 비밀값 + 엣지 배포가 함께 필요. Edge 는 머지로 배포되지 않는다. 서버 S3(결정 1번)도 이 트랙과 조율.

### 4. 후속(코디네이터가 이어 갈 것)
- #1841 Low: 기한 초과 뒤 인증 잠금이 남음(인가 3차).
- 같은 계열 후보: `recovery-proof-store.ts:309-313` 네이티브 직접 쓰기 · `import-pending.ts` runImport 늦은 `replacePendingCaptures` — 읽을 때 저장소 epoch · 쓸 때 대조하는 공통 설계.
- #1839 의 작은 독립 수정(예약 키 제거 · 살아 있는 생성 선점 거부 · null 비교) — 서버 설계가 덮지 않는 것만 남겨 따로 싣는다.
- **결정 2(HIBP 앱 소유 프록시)** — 엣지 함수 신설. ⚠ **배포가 먼저, 클라이언트 플립이 나중**(순서를 뒤집으면 가입 · 비밀번호 변경이 전부 실패). 배포는 3번 트랙과 조율.

### 5. 기록이 사실과 다른 것 · 주인이 따로 있어 남긴 것
- TTL-Work `CLAUDE.md` 가 웹 배포를 gh-pages 라 적는다 → `actions/deploy-pages`.
- `fix/security*` 로컬 브랜치 47개 · 공유 스태시 22 · TTL-Work 미커밋 구제본 `E:/Coding Infra/_rescue/ttl-work-260913-1554/` — 손대지 않음.
- ⚠ 09-20 01:4x 옛 QA 워크트리 `qa-integration-260918`(여기 '남긴 것'이었다)을 대조 없이 지웠다 — 브랜치 · 커밋 · 태그 · 서명 키(`E:/Coding Infra/tools/qa-test.keystore`) 무사, 빌드 환경만 사라짐.
- **남긴 것: QA APK 빌드 환경 워크트리 `E:/2ndB/.worktrees/qa-apk-260920`**(브랜치 `qa/apk-260920` · **정션 아닌 실제 node_modules** · 로컬 QA 빌드용) · 웹 QA 워크트리 `qa-integration-260920`(정션 · 8765 서버의 dist).
