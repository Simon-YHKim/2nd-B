# STATE

**덮어쓰기 파일.** 네 절만 — 완료 / 진행중 / 다음 / 막힌 것.
결정은 여기 쓰지 않는다. `DECISIONS.md` 가 소유한다(append-only · 09-13~09-19 는 기간 보관 파일 `DECISIONS-2026-09-*.md`).

최종 갱신 **2026-09-21 03:40 KST** · Claude Code `673dc58f` · 워크트리 `E:/2ndB/.worktrees/qa-integration-260920` · 브랜치 `claude/records-260921b`
소유자: 이 세션(09-13 `ttl-work-9a` 와 두 세션 합의, Simon 지명 아님). Simon 이 다르게 정하면 그게 이긴다. 다른 세션은 `DECISIONS.md` 에만 쓸 것.

📊 보고서 (최신 위)
- **PR #1847 결정 보고 (7회차에서 멈춰 세움 · Simon 이 ① 선택)**: <https://claude.ai/artifact/G31qLaEceXPHeNZuvDczhV>
- **Simon 집행 카드 3장**(DB 백업 비밀값 · PostgREST 버전 · Paddle Content-Type): <https://claude.ai/artifact/YYEwq9tfHN6W7qyyWdpTQz>
- 09-19 밤 라운드 보고 (등급 M · 결정 7건 + 이월 Q-S1 — **Q-S1 은 09-20 에 global 로 닫힘**): <https://claude.ai/artifact/H7KGVqSjXj27NxEVdhQXWs>
- Android 재실행 멈춤 보고 (09-19 오전): <https://claude.ai/artifact/8qYXcdSTkMYNzUaN5ZXfbh>
- 워커 산출물: `E:/Coding Infra/reports/vibe-r260920/`(r38~r57 · 게이트 · 법역 조사 · 페르소나)

---

## 완료

- **0.9.0 컷 · 머지** — `8f7743c4`(#1857). v0.8.0 이후 **172개**(머지 커밋 제외) 중 **69개(40%)** 가 보안 · 법무 · 인증 · 가드(법무 28 · 보안 18 · 가드 12 · 인증 11). `app.json` version 한 줄 + `CHANGELOG.md` 뿐 — `versionCode`·`buildNumber` 는 EAS 가 소유한다(`appVersionSource: remote`). CHANGELOG 의 주장은 전부 커밋으로 확인했다.
- **나라별 가입 연령 착지** — `225cf7eb`(#1855). 3덩어리 → **63개국 표**(값 있는 행의 1차 출처 100%). 나라를 못 놓으면 **18**(KR 14 아님). 표는 **생성물**(`consent-age-table.ts` — 원본 `age-table.json` 의 sha256 이 머리에 박혀 있다). 화면 문구도 **그 사람에게 실제 적용된 나이**를 말한다(5개 로케일 × 6키, `i18n/index.ts` 한 곳에서 주입).
- **재게이트 두 판 완주** — #1855 는 신규 medium 3 · low 2 를 닫고 머지. #1853 은 신규 medium 2 가 나와 **세 번째 라운드 유통기한 발동**(아래 진행중).
- **로컬호스트 갱신** — <http://127.0.0.1:8765/2nd-B/> 가 **0.9.0 의 main**(`8f7743c4`)을 서빙한다. `expo export --clear` rc=0 · 347파일 · root/legal 200 · 공유 카드 메타 확인.
- **PR #1849 · #1850 · #1851 · #1852 · #1854 · #1856 머지** — 인용이 여는 문서 · 동의한 초기화의 마지막 단계 · `0190` authenticated 잠금 + CI 바닥/프로브 · Android 권한 규칙 좁히기 + 라우트/위키 계정 울타리 · 기록.
- **F-02 운영 실측** — `REVOKE ... FROM PUBLIC, anon` 은 authenticated 를 막지 못한다(함수 291개 중 242개가 `authenticated=X`). **0189 는 운영 미적용**이라 아직 살아 있는 구멍은 아니다.
- **DB 백업은 살아났다** — 09-20 22:39 성공(1.6MB). ⚠ 이전 실패 원인은 비밀값 부재가 아니라 **풀러 5432 연결 실패**였다(내가 "비밀값 0개"라고 보고한 것은 틀렸다). **복구 훈련은 아직 안 했다.**

## 진행중

워커 2 · 클라우드 빌드 3 · 콘솔 봇 4기 대기.

- **R57 — #1853 규칙 축소**(fable @max · 워크트리 `s3-erasure-260920`). 게이트 둘이 수렴한 판정대로 *일반화된 정적 의존 추론*을 걷어내고 DB 왕복으로 줄인다. 함께 닫을 것: 무관 migration 재실행 허용 · 소유 시퀀스의 `RESTART WITH` 상태와 **ACL** 이 fingerprint 밖. 끝나면 게이트 둘 재기동.
- **R54 — 페르소나 시뮬레이션**(opus · 워크트리 `gate-review-260919`). 유아~90대 첫 실행 · 핵심 루프 · 접근성 · 문화 축.
- **EAS 빌드 3건**(유료 · 클라우드): APK `35529329922` · AAB `35529336717` · IPA `35529343237`. 끝나면 `github-release.yml` 에 세 build id 를 넣어 Release 에 단다.
- **Grok Bot 콘솔 과제서 4장**(한 줄씩 보내면 시작): Play Console `vb-a53e2ef2` · App Store Connect `vb-dbaec979` · PostgREST `vb-9a66f449` · Paddle `vb-a58737aa`.

## 다음 (하나만)

**세 빌드가 끝나면 `github-release.yml` 을 `profile=paired` 로 디스패치해 APK · AAB · IPA 를 0.9.0 Release 에 단다.** 그게 이번 목표의 마지막 칸이다.

## 막힌 것

### 1. Simon 이 직접 해야 풀리는 것
- **DB 백업 복구 훈련** — 백업은 09-20 22:39 부터 다시 성공한다. 받아서 복원해 본 적은 없다. 복구가 안 되는 백업은 백업이 아니다.
- **`backup_age.key` 가 안전한 곳에 있는지 확인** · 떠도는 저장소 비밀값 `BACKUP_AGE_PUBLIC_KEY` 를 지울지 결정.
- **PostgREST 버전 확인** → 14.18 미만이면 업그레이드 · **Paddle 샌드박스 `Content-Type` 관측**(대시보드 전송 기록에서 읽는다).
- **콘솔 과제서 4장 전달**(위) · `grok` 로그인 + xAI 잔액(402).

### 2. Simon 결정 대기 (코드가 기다린다)
- **약관 판본 라운드** — 약관 본문의 연령 자격 서술은 **아직 옛 문장**이다. 고치려면 새 판본 + signup revision + 서버 허용 튜플(`0150` `email-v3`) 마이그레이션이 **한 단위로** 움직여야 한다. `locales/*/consent.json:29,37` 의 "14 to 17"·"14 or older" 도 같은 묶음. ⚠ **`CONSENT_VERSION` 을 바꿔도 기존 가입자 재고지는 자동으로 안 걸린다**(`consent.ts:55-58,84-85`) — 재고지는 별개 결정이다.
- **거주국 자기신고 UI** — 지역은 기기 설정이지 거주 증명이 아니다. 출시 전에 물어야 폴백 18 의 과잉 차단과 "읽혔지만 틀린 지역"을 둘 다 닫는다.
- **미성년 결제 게이트 강도** — `src/lib/billing/` 에 연령 참조 0건. F5(2026-08-16)는 "열되 보호장치" 인데 강도 미확정.
- **전체 삭제 뒤 남는 데이터**(personas 등) · **신고 원장 연쇄 삭제**(Q-260920-01) · **영수증 공개 카테고리**.

### 3. 보안 담당 트랙(운영 승격)
운영 draft 7개 · Edge 09-07 배포본 · Rewarded SSV 순서 · LLM 동의 v2 조건. ⚠ **public 실표 68개 중 56개가 anon · authenticated 에 TRUNCATE 를 허용**한다(09-20 실측 · 도달 경로는 미확인 = 방어 깊이 결손). 권한 회수는 마이그레이션이라 이 트랙 소유다.

### 4. 후속(코디네이터)
- **병렬 jest 레이스** — `check-no-emdash.test.ts:24` 의 임시 프로브를 `src/**` 열거 스위트가 집어 `ENOENT` 로 죽는다. `--runInBand` 는 767/9,838 초록. `one-seven.test.ts:68` 이 **같은 함정을 이미 이름으로 제외**하고 있다 — 계열 수정은 별도 PR.
- #1814 · #1839 를 서버 설계(S3) 위에서 다시 만든다(#1814 는 8차 회귀 `93152b9e` 되돌리기부터).
- #1847 이 남긴 별도 작업: A8 교차 스키마 정책 충돌 · A6 `U&'...'` 미 fail-closed · 서버 울타리(S3-C)가 들어오면 RPC GRANT 를 연다.
- Android 규율 15건 이상은 **미판정 grep 후보** — 파일을 열어 판정하는 라운드 필요.

### 5. 기록이 사실과 다른 것 · 주인이 따로 있어 남긴 것
- TTL-Work `CLAUDE.md` — 웹 배포를 gh-pages 라 적는다(→ `actions/deploy-pages`). ⚠ **"법역 판정이 항상 KR" 서술은 #1855 에서 취소선 정정됐다** — 더 이상 이 목록의 항목이 아니다.
- `fix/security*` 로컬 브랜치 47개 · 공유 스태시 22 · `_rescue/ttl-work-260913-1554/` — 손대지 않음.
- **남긴 것**: QA APK 빌드 환경 `qa-apk-260920`(실제 node_modules) · 웹 QA + 기록 `qa-integration-260920`(정션 · 8765 · 이 세션이 쓰는 중) · 게이트/페르소나 `gate-review-260919` · 삭제 등록부 `s3-erasure-260920`(R57 작업 중) · `claude-disk-260913`.
