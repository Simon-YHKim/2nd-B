# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only · 09-13~09-19 는 기간 보관 파일 `DECISIONS-2026-09-*.md`).

최종 갱신 **2026-09-20 20:16 KST** · Claude Code `673dc58f` · 워크트리 `E:/2ndB/.worktrees/claude-disk-260913` · 브랜치 `claude/records-260920c`
⚠ 앞선 기록의 `09-21` 날짜들은 **오기다**(쓸 때 시계가 +6h40m 앞섰다). 실제로는 전부 **09-20 저녁**이다 — `DECISIONS.md` 의 정정 줄 참조.
소유자: 이 세션(09-13 `ttl-work-9a` 와 두 세션 합의, Simon 지명 아님). Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서 (최신 위)
- **PR #1847 결정 보고 (7회차에서 멈춰 세움 · Simon 이 ① 선택)**: <https://claude.ai/artifact/G31qLaEceXPHeNZuvDczhV>
- **Simon 집행 카드 3장**(DB 백업 비밀값 · PostgREST 버전 · Paddle Content-Type): <https://claude.ai/artifact/YYEwq9tfHN6W7qyyWdpTQz>
- 09-19 밤 라운드 보고 (등급 M · 결정 7건 + 이월 Q-S1 — **Q-S1 은 09-20 에 global 로 닫힘**): <https://claude.ai/artifact/H7KGVqSjXj27NxEVdhQXWs>
- Android 재실행 멈춤 보고 (09-19 오전): <https://claude.ai/artifact/8qYXcdSTkMYNzUaN5ZXfbh>
- 새벽 정리 결정 시트 v3 (09-17 · DB 백업 카드): <https://claude.ai/artifact/WKmnvY5gMQ3MrxFs8uwwCw>
- 워커 산출물: `E:/Coding Infra/reports/vibe-r260919/`(r13~r37) · `vibe-r260920/`(r38~r48 · 게이트 8회차) · 콘솔 과제서 `E:/2ndB/.bots/`

---

## 완료

- **Simon 결정 8건 집행**(09-20 08:45 확정) — 1·4 는 PR #1847 로 착지, 3 은 이미 적용 중, 2·5·6·7 은 아래 '다음'·'막힌 것'.
- **PR #1847 머지 `623cb0a9`**(09-20 19:20 · git author 시각) — 삭제 등록부 66행(client_erasable 26 / retained 27 / account_delete_only 13) · `erase_my_data` RPC(**권한 0 으로 배송 · SHIPS LOCKED**) · 공개 영수증 계약 · CI 실DB 회귀(26표 전수 · 무조건 DELETE 탐침 · 양방향 sweep) · 정적 가드(G1~G10) · 한계 전량 명시. 게이트 **8회차**(인가 · 생성물 각 8회) 뒤 Simon 확정 ① 로 머지.
- **Q-S1(출시 법역) 닫힘 → `global`**(Simon, 09-20 저녁). 이월 3회차 질문이었다.
- **출시 차단 실측 41행**(막음 7 · 불명 17 · 안막음 17) · **버그 인벤토리 51행**(닿음 26).
- **HANDOFF 기간 굴리기** — 활성 79KB(블록 4개를 `handoff/HANDOFF-2026-09.md` 로 원문 이동 · 블록 수 32 보존) · `DECISIONS.md` 3차 분할(09-19 → 기간 파일).
- **R48 게이트 둘 착지** — 생성물 high 1 · medium 1 · low 1 / 비즈로직 신규 C·H·M **0** · low 2. PR #1849 는 CI 3종 초록이지만 **머지 보류**(high 먼저).
- **법역 조사 완료**(r48 · fable @max · 371줄 · 11개 시장 + EU 31개국 1차 원문). 코드 주석 둘을 뒤집었다: "DEFAULT 16 이 가장 보수적"(→ 인도 18 · 인니 17) · Paddle 약관 연령 조항 0건. **결정 시트 발행 → Simon 대기.**
- **F-02 운영 실측 확인** — `REVOKE ... FROM PUBLIC, anon` 은 authenticated 를 막지 못한다(함수 291개 중 242개가 `authenticated=X`; anon 만 REVOKE 한 6개 전부 실행 가능). **0189 는 운영에 미적용**이라 아직 살아 있는 구멍은 아니다.
- QA 산출물은 main `585aac5f` 기준(웹 8765 · 사전 릴리스 `qa-260920-585aac5f`) — **그 뒤 머지 2건(#1846 · #1847)은 미반영**.

## 진행중

워커 2기(r49) · 콘솔 봇 2기 대기.
- **`r49-wiki-owner-fence`**(opus @ultracode · 워크트리 `fix-bugs-260921` · PR #1849) — R48 생성물 게이트의 **high 1**(계정 A→B 전환 뒤 A 의 위키 행이 B 화면에 남음) + OBS-01 + F-03(변이가 살아남은 공허한 인용 테스트) + BL-01·BL-02(문서·주석 사실 오류). 고친 뒤 머지.
- **`r49-lock-erase-authenticated`**(fable @max · 워크트리 `s3-erasure-260920` · 브랜치 `claude/lock-erase-authenticated-260920`) — 새 마이그레이션 **0190** 으로 `erase_my_data` 를 authenticated 에서도 REVOKE + **CI scratch DB 에 Supabase default privilege 바닥을 깔아** 단언을 공허하지 않게. `0189` 는 고치지 않는다.
- **Grok Bot 콘솔 과제서 2장**(한 줄씩 보내면 시작): Play Console `vb-a53e2ef2` · App Store Connect `vb-dbaec979`. 회수는 `make_bot_spec.py --collect`.

## 다음 (하나만)

**global 출시의 실제 경로 셋을 연다** — ① DPIA 완성 · 서명(사람) ② 법역 신호 보정(코드 — 조사 결과를 받아 폴백 · 매핑 결정) ③ 백업 복구(Simon 카드). 나머지 차단 넷은 '그 기능을 켤 때' 조건이라 출시를 막지 않는다.

## 막힌 것

### 1. Simon 이 직접 해야 풀리는 것
- ⛔ **DB 백업 비밀값 2개**(`Backup` 환경 · 09-14~09-19 6회 연속 실패 · 마지막 성공 09-12). 결정 5(운영 원문 폐기)가 여기 걸려 있다.
- **PostgREST 버전 확인** → 14.18 미만이면 업그레이드(결정 6).
- **Paddle 샌드박스 `Content-Type` 관측**(결정 7) — ⚠ 우리 엔드포인트로 쏘면 IP 목록 때문에 안 된다. 대시보드 전송 기록에서 읽는다.
- **콘솔 과제서 2장 전달**(위 진행중) · `grok` 로그인 + xAI 잔액(402).

### 2. Simon 결정 대기 (코드가 기다린다)
- **미매핑 국가 폴백** — 지금은 미인식 → KR(14). global 이면 일본 · 브라질 · 인도 등의 14세가 한국 기준으로 자기동의한다. 선택지는 조사 결과와 함께 올린다.
- **미성년 결제 게이트 강도** — `src/lib/billing/` 에 연령 참조 0건. F5(2026-08-16)는 "열되 보호장치" 인데 강도 미확정.
- **전체 삭제 뒤 남는 데이터**(personas 등) · **신고 원장 연쇄 삭제**(Q-260920-01) · **영수증 공개 카테고리**.

### 3. 보안 담당 트랙(운영 승격)
운영 draft 7개 · Edge 09-07 배포본 · Rewarded SSV 순서 · LLM 동의 v2 조건. ⚠ 그리고 **public 실표 68개 중 56개가 anon · authenticated 에 TRUNCATE 를 허용**한다(09-20 실측 · 도달 경로는 미확인 = 방어 깊이 결손). 권한 회수는 마이그레이션이라 이 트랙 소유다.

### 4. 후속(코디네이터)
- #1814 · #1839 를 서버 설계(S3) 위에서 다시 만든다(#1814 는 8차 회귀 `93152b9e` 되돌리기부터).
- #1847 이 남긴 별도 작업: A8 교차 스키마 정책 충돌 · A6 `U&'...'` 미 fail-closed · 서버 울타리(S3-C)가 들어오면 RPC GRANT 를 연다.
- Android 규율 15건 이상은 **미판정 grep 후보** — 파일을 열어 판정하는 라운드 필요.

### 5. 기록이 사실과 다른 것 · 주인이 따로 있어 남긴 것
- TTL-Work `CLAUDE.md` — 웹 배포를 gh-pages 라 적는다(→ `actions/deploy-pages`) · **법역 판정이 항상 KR 이라 적는다(→ 기기 지역을 읽는다. 미매핑만 KR)**.
- `fix/security*` 로컬 브랜치 47개 · 공유 스태시 22 · `_rescue/ttl-work-260913-1554/` — 손대지 않음.
- **남긴 것**: QA APK 빌드 환경 `qa-apk-260920`(실제 node_modules) · 웹 QA `qa-integration-260920`(정션 · 8765) · 버그 수정 `fix-bugs-260921`(정션 · 작업 중) · 기록 `claude-disk-260913`.
