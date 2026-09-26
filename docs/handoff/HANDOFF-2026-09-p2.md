# 2nd-Brain Handoff — 2026-09 보관 (p2)

> `docs/HANDOFF.md` 활성 창이 100KB 에 닿아 밀려난 블록을 **원문 그대로** 옮겨 둔 파일이다.
> 한 글자도 요약하지 않았다. `handoff/HANDOFF-2026-09.md`(p1)가 92KB 로 차서 이 파일을 열었다.
> 새 블록은 활성 창(`docs/HANDOFF.md`) 맨 위에 얹는다 — 이 파일에 직접 쓰지 않는다.

최초 생성 2026-09-21 03:45 KST · Claude Code `673dc58f`

---

## 2026-09-19 오전 / main 의 Android 빌드가 두 번째 실행부터 멈추던 결함을 고쳤다(#1833) — 머지는 오늘 밤 게이트 뒤

### 결론

- **#1807(09-13 보안 통합) 이후 main 의 모든 Android 빌드는 두 번째 실행부터 "Loading" 에서 영원히 멈춘다.** 첫 실행은 문제없이 열려서 부팅 확인으로는 안 보였다(09-18 공개 QA 빌드도 해당). 원인: `src/lib/storage/encrypted-native-storage.ts:905` 가 expo-crypto `AESSealedData.fromCombined` 에 base64 **문자열**을 넘긴다 — Android 는 바이트 전용(upstream `AesCryptoModule.kt:80`), iOS 는 문자열도 받는다(`AesCryptoModule.swift:78`). 복호화 실패 → fail-closed → 로컬 로그아웃도 같은 저장소라 실패 → `if (!closed) return` 으로 #1815 로더가 안 풀린다. 테스트 mock 이 "문자열이어야 한다"를 강제해 CI 는 초록이었다. iOS · 설치본 v0.8.0 · 웹은 무관.
- **수정은 draft PR [#1833](https://github.com/Simon-YHKim/2nd-B/pull/1833)** (`5931f140` · 2파일 · verify rc=0 · CI 초록): 봉인 값을 바이트로 풀어 넘긴다. 에뮬레이터 실측: 수정 전 100% 재현(재부팅 불필요 — force-stop 뒤 재실행만으로) → 수정 뒤 재실행 · 재부팅 정상 · **깨진 기기에 덮어 설치하면 데이터 삭제 없이 복구**.
- **공개 QA 빌드 [`qa-260919-640db5bd`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260919-640db5bd)** = main `a690b742` + 머지 대기 PR 11개(#1833 포함) · 테스트 키 · versionCode 40(v0.8.0 은 51 이라 그 위에 덮어 설치 안 됨). 09-18 QA 릴리스 안내문은 새 릴리스를 가리킨다.
- **남은 구조 구멍** — 저장소 읽기와 로컬 로그아웃이 **둘 다** 실패하면 여전히 출구가 없다(암호문 손상 · 키스토어 장애). Simon 이 결정 시트에서 고르지 않은 채 "남은 작업 모두 진행해"(09-19 11:2x)라 해서, 코디네이터가 추천안 ① A″(연속 3회 콜드 스타트 이중 실패 뒤에만 기존 복구 동의 화면)로 **draft 구현을 발주**했다(r14 · `claude/fix-auth-boot-exit-260919`). **머지는 Simon 확인 뒤.**

### 머지 대기 draft PR — 전부 보안 게이트 두 레인 대기

#1819 네이티브 부팅 · #1810 홈 별 이름 · #1814 자동 저장 재설계 · #1825 U5+U6 · #1826 U2+U3 · #1827 U4 · #1828 U1 · #1829 U7 · #1830 U8(#1829 위) · #1831 N1(#1828 위) · **#1833 Android 복호화** · r14 출구(Simon 확인 필요).
머지 전 확인 3건은 끝났다(#1825 · #1827 · #1829 코멘트): `secrets list -o json` 값 = 평문 SHA-256 · 운영 `PADDLE_API_BASE` 미설정 → 기본값 · Paddle 응답 `application/json`. 웹훅 요청의 Content-Type 은 간접 근거만(샌드박스 1회 — Simon).
⚠ **main 은 strict 보호**(필수 체크 `verify` + 최신 브랜치만 머지). BEHIND 인 PR 에 `gh pr merge --squash` 는 **머지되지 않고** 안내만 낸다 — `--auto` 를 쓰고 `state=MERGED` 를 확인한 뒤 다음으로 간다.

### 막힌 것

| 무엇 | 왜 | 풀리는 조건 |
|---|---|---|
| 보안 게이트 두 레인 · 머지 | codex 주간 99% | **09-19 19:47 KST 리셋** — 이 세션에 19:53 자기 예약(세션이 죽었으면 다음 세션이 손으로) |
| **DB 백업** | `Backup` 환경 비밀값 2개(`BACKUP_PGDUMP_DATABASE_URL` · `BACKUP_PGDUMP_AGE_PUBLIC_KEY`) 빈 값 — 09-13 부터 매일 실패 · 마지막 성공 09-12 · 보존 14일 | **Simon — 09-26 쯤 복원본 0** |
| r14 출구 머지 | 결정 시트 1번 미응답 | Simon 확인 |
| JWT 서버 조치(D3) · Paddle 샌드박스 · 출시 법역 Q-S1 · Grok 계정 · gstack 업그레이드 시점 | 사람 몫 | Simon |

### 다음 단일 작업 (19:47 KST 뒤)

1. `orca account list --json` 으로 codex 리셋 확인 → `python ~/.claude/skills/vibe/scripts/check_tooling.py`(codex 0.155.1 이 09-19 11:2x 기준 최신).
2. 게이트 두 레인(daybreak @xhigh 생성물 · astra @xhigh 인가)을 **#1833 부터** 돌린다. 코딩 레인이 claude 라 G1 충족.
3. 통과분 머지(쌓인 순서 #1828→#1831 · #1829→#1830). #1819 머지 전에는 main 에 `[ota]`/`[release]` 커밋 · Android 릴리스 금지.
4. 머지 뒤 main push 진단 APK 로 **설치 → 실행 → force-stop → 재실행**까지 본다(첫 실행만 보면 이번 결함을 못 잡는다).

### 로컬 QA 환경 (09-19 11:26 KST)

- 웹: <http://127.0.0.1:8765/2nd-B/> — 워크트리 `qa-integration-260918` 의 `dist/`(브랜치 `qa/integration-260919` = `640db5bd`) · 서버 `qa_static_server.js`(재부팅하면 꺼진다).
- 에뮬레이터: Orca 의 `2ndB_Codex_API36_260727`(emulator-5554)에는 **v0.8.0** · `Pixel_9_Pro_XL` 에는 **QA 빌드 `640db5bd`**. Orca 1.4.200 은 에뮬레이터에 GPU 옵션을 안 넘겨 AVD 설정으로 우회 중(`E:/Coding Infra/tools/avd-guard/` · 시작프로그램 감시자).
- 로컬 APK 빌드: `python "E:/Coding Infra/tools/qa_apk_build.py" --wt <워크트리> --abi x86_64|arm64-v8a --tag <이름> [--skip-prebuild]`.

### 증거

- 보고서: <https://claude.ai/artifact/8qYXcdSTkMYNzUaN5ZXfbh>(Android 멈춤 · 결정 2건) · `E:/Coding Infra/reports/vibe-r260919/r13-boot-hang/result.md` · QA 캡처 `E:/Coding Infra/reports/qa-260919/`.
- 결정 원장: `DECISIONS.md` 26.09.17 ~ 26.09.19 줄(09-13 ~ 09-16 은 `DECISIONS-2026-09-*.md` 보관) · 현황 `STATE.md`.
- 메모리: `reference_2ndb_android_relaunch_check` · `reference_2ndb_android_qc` · `feedback_2ndb_automerge`.

```text
2nd-Brain 09-19 게이트 라운드를 이어받아라.

1. E:/2ndB 의 git common dir 이 E:/2ndB/.git 인지 확인하고 CLAUDE.md · docs/HANDOFF.md Latest · DECISIONS.md 26.09.19 줄 · STATE.md 를 먼저 읽어라.
2. codex 주간 쿼터(usedPercent + resetsAt)가 풀렸는지 확인하라. 안 풀렸으면 게이트를 띄우지 마라.
3. /vibe 로 게이트 두 레인을 #1833 부터 draft PR 들에 돌려라. critical/high 0 · CI 초록이면 --auto squash 머지 뒤 state=MERGED 를 확인하라.
4. r14 출구 PR 은 Simon 확인 없이 머지하지 마라.
5. 머지 뒤 main 진단 APK 로 설치 → 실행 → force-stop → 재실행을 확인하고 DECISIONS 에 적어라.
6. DB 백업 비밀값 · JWT 서버 조치 · 운영 쓰기는 Simon/보안 담당 몫이다 — 대신 실행하지 마라.
```

---

## 2026-09-14 오후 / 안드로이드 두 결함의 원인을 좁혔고 수정은 draft PR #1819 — 게이트는 codex 리셋 뒤

### 결론

- **main 안드로이드 설치본은 켜자마자 멈춘다**(main 진단 APK `dbe4c1ab` 4/4 · `18ef7f43` 1/1, "Cannot read property 'add' of undefined"). 원인은 `e1fec159`(09-08)가 웹 탭 제목용 vendored `Helmet` 을 플랫폼 구분 없이 그린 것(`src/app/_layout.tsx`). **사용자 영향 0**: 최신 Release v0.8.0 = 09-07, 09-08 이후 OTA 발행 0회. ⚠ **수정이 main 에 들어가기 전에는 `[ota]`/`[release]` 커밋 · main 안드로이드 릴리스 금지.**
- **온보딩 Continue 뒤 백지(T1a 항목 1)** 는 v0.8.0 에서 재현되는 네이티브 결함이다. 기전(H1′): `PixelPressable` 누름/뗌 때 layout-only 래퍼의 평탄화가 바뀌어 자식이 재부모화되고, 그 커밋이 같은 제스처의 화면 제거(`router.replace`)와 한 마운트 배치로 병합되면 react-native-screens 제거 전환 때문에 `addViewAt … already has a parent` → RN 호스트 파괴. 실측: 탭 2/3 · 누른 채 떼기 3/3 · **키보드 ENTER 0/3** · 애니메이터 0 에서 2/3 · Ready 직후 탭 2/2.
- **수정은 draft PR [#1819](https://github.com/Simon-YHKim/2nd-B/pull/1819)** (HEAD `f7dcf30c`, 커밋 4 · verify rc=0 752 스위트 / 9,049 테스트 · CI 초록 · **머지 안 함**): Helmet 웹 전용 · `PixelPressable` 래퍼 `collapsable={false}` · 같은 누름 래퍼 5곳(설정 로그아웃 · 전체 삭제 경로 포함) · 저장소 전체 AST 재발 가드.
- **로그인 직후 `JWT issued at future`**(에뮬 로그인 24회 중 6): 시계 차가 아니라 PostgREST 시각 캐시로 보인다(Supabase 사건 `6q5902p2xd9f`, v14.18 리전별 적용 중 · 우리 프로젝트 해당은 추정). v0.8.0 · 09-07 웹은 재시도가 없어 로더에 멈출 수 있다. main #1811 재시도는 아직 어디에도 안 나갔다.

### 막힌 것

| 무엇 | 왜 | 풀리는 조건 |
|---|---|---|
| PR #1819 보안 게이트 둘 · 머지 | 게이트 두 레인(daybreak · astra)이 codex 주간 87% — /vibe G5 85% 금지선 | **토 19:47 KST 리셋** 또는 Simon 이 결정 시트 D2 ② 확정 |
| #1814 · #1810 · 후속 넷 | 같은 게이트 막힘 + Simon 결정(Q-260914-03 · Q-260914-02 · Q-260914-01 정정) | 리셋 + 결정 |
| JWT 서버 조치 | 운영 확인 · 지원 요청 · 재시작은 사람 몫 | 보안 담당/Simon — 결정 시트 D3 |
| main 웹 게시 | Simon 결정 D1(보안 담당 확인 뒤) | 결정 |

결정 시트(15판): <https://claude.ai/code/artifact/6d5c0c58-e6cd-46b7-b1e6-84233a1bd04f>

### 다음 단일 작업 (리셋 뒤)

1. `orca account list --json` 으로 codex `weekly.usedPercent` 와 `updatedAt` 을 **함께** 확인(낡은 값은 미확인 취급).
2. PR #1819 에 생성물 게이트(`gpt-daybreak-blue-latest` @xhigh) · 인가 게이트(`gpt-6-astra` @xhigh)를 띄운다 — 코딩 워커가 claude 라 G1 충족. codex 워커는 기동 뒤 입력창에 프롬프트가 걸려 있을 수 있으니 20초 뒤 Enter + 화면 `Working` 확인.
3. critical/high 0 · CI 초록이면 `gh pr ready` → `gh pr merge --squash --match-head-commit <HEAD>` (BEHIND 면 update-branch 뒤 CI 재대기).
4. 머지 뒤 main push 진단 APK(`android-release.yml` artifact)로 N0 부팅 3 · N1 Continue 탭 ≥3 · N2 누른 채 떼기 ≥3 · N3 Go to constellation ≥2 · N4 재기동 대조 2 · N5 설정 로그아웃. 절차: `E:/Coding Infra/reports/vibe-r260914/r4-t1a-e1/result.md`.

### 증거

- 보고서: `E:/Coding Infra/reports/vibe-r260914/` 의 `r4-t1a-onboarding` · `r4-t1a-addviewat` · `r4-t1a-e1` · `r5-jwt-future` (`result.md`).
- 결정 원장: `DECISIONS.md` 26.09.14 09:11 ~ 14:51 줄 · 현황: `STATE.md`.
- 메모리: `reference_2ndb_android_emu_dead`(누름/뗌 가르는 법 · 진단 APK 부팅 검사) · `reference_supabase_jwt_issued_at_future` · `reference_2ndb_legal_citation_line_drift`.

```text
2nd-Brain 안드로이드 수정 PR #1819 를 이어받아라.

1. E:/2ndB 의 git common dir 이 E:/2ndB/.git 인지 확인하고 CLAUDE.md · docs/HANDOFF.md Latest · DECISIONS.md 26.09.14 줄을 먼저 읽어라.
2. PR #1819 상태(draft · HEAD · CI)와 codex 주간 쿼터(usedPercent + updatedAt)를 재조회하라. 85% 이상이거나 값이 낡았으면 게이트를 띄우지 마라.
3. 게이트 둘(daybreak @xhigh · astra @xhigh)을 /vibe 로 띄우고 critical/high 0 · CI 초록이면 match-head-commit 으로 squash 머지하라.
4. 머지 전에는 main 에 [ota]/[release] 커밋 · 안드로이드 릴리스 금지.
5. 머지 뒤 main 진단 APK 로 N0~N5 를 r4-t1a-e1/result.md 절차대로 재고 결과를 DECISIONS 에 적어라.
6. JWT 서버 조치(결정 시트 D3)와 운영 쓰기는 보안 담당/Simon 몫이다 — 대신 실행하지 마라.
```

---

## 2026-09-14 / 보안 W1–W8 Git 통합 완료 — 운영 활성화는 별도 hold

### 결론

- 코드 PR **[#1807](https://github.com/Simon-YHKim/2nd-B/pull/1807)** 이 merge commit
  `18ef7f43cf735bc65e46da5c11334a9f688b475e`으로 `main`에 들어갔다.
- 중복 PKCE PR **[#1800](https://github.com/Simon-YHKim/2nd-B/pull/1800)** 은 `main`의
  PKCE + OTP-only recovery template/proof 경계를 확인하고 superseded로 닫았다. 브랜치는 보존했다.
- GitHub CI는 `lint` · `verify` · `web-export-smoke` · `sql` **4/4 성공**이다. `sql`은 아래
  번호 없는 draft 7개를 scratch PostgreSQL에서 실제 실행하고 rollback했다.
- 로컬 최종 검증은 `npm run verify` **740 suites / 8,865 tests**, `npm run verify:web`
  **126 static routes**, `npm audit` **취약점 0**이다. 런타임 require cycle도 0이다.
- D1 재고는 **35 branches / 95 occurrences**, evidence gap 0, 추가로 옮길 actionable patch 0이다.
  상세 Wave 기록은 아래 `2026-09-13 — 보안 W1–W8 로컬 통합 인계` 절에 있다.
- 이 결과는 **Git 소스 통합 완료**다. 운영 DB·Edge·Auth·secret·flag·Pages·live unit·canary·
  postflight는 실행하지 않았으므로 현재 상태는 **`productionComplete=false`**다.

### Simon 결정 D1–D5 반영

1. **D1** — 보안 재고를 W1–W8 큰 덩어리 순서로 전수 검토하고 #1807로 통합했다.
2. **D2** — Reward 자가지급 RPC의 운영 revoke는 이전 실행 기록만 있다. 이번 작업에서 재실행하거나
   운영 catalog로 재검증하지 않았다. 중복 실행하지 말고 catalog postflight로만 확인한다.
3. **D3** — `src/lib/supabase/client.ts`의 PKCE와 OTP-only recovery template/proof 경계가 함께 통합됐다.
4. **D4** — 낡은 Edge 함수의 운영 재배포는 미실행이며 광고 런치 전 필수다.
5. **D5** — Codex 전역 업데이트는 사후 승인됐다. 앞으로도 막혔을 때만 수행하고 사후 보고한다.

### 운영에 아직 적용되지 않은 DB draft 7개

1. `UNNUMBERED_account_deletion_completion_fence.sql`
2. `UNNUMBERED_effective_llm_consent_current_contract.sql`
3. `UNNUMBERED_oauth_naver_rate_limit_completion.sql`
4. `UNNUMBERED_paddle_refund_consequence_integrity.sql`
5. `UNNUMBERED_peer_response_rate_limit.sql`
6. `UNNUMBERED_reward_ssv_hardening.sql`
7. `UNNUMBERED_rss_proxy_quota.sql`

임의 번호를 붙이지 않는다. 모든 remote ref의 migration 번호를 다시 스캔하고 `max+1`을 예약한 뒤
reservation branch를 즉시 push한다. 각 draft는 behavior fixture와 rollout gate를 통과한 뒤에만
승격한다. 서버 활성화와 운영 쓰기는 계속 console owner 소유다.

### 다음 작업 큐

| # | 작업 | 판정 |
|---|---|---|
| A | remote migration 전수 스캔과 번호 예약 | **다음 단일 안전 작업** |
| B | Consent/Naver/RSS behavior fixture, Storage 2-connection race, Paddle 단일 `ON_ERROR_STOP` transaction, Deno-native check | 운영 전 필수 |
| C | console owner preflight → DB/Edge/Auth 순차 적용 | 별도 승인·중단 조건 준수 |
| D | Android/iOS live-unit QA → 제한 canary → postflight | 끝날 때까지 `productionComplete=false` |

### 증거와 새 세션 시작점

- 완료 보고서: `E:/2ndB/Output/260914_2ndB_security_pr_merge_handoff.html`
- 복사용 프롬프트: `E:/2ndB/Output/260914_2ndB_security_new_session_prompt.txt`
- Git 정본: 이 `docs/HANDOFF.md`

```text
2nd-Brain 보안 W1–W8 인계를 이어받아라.

1. E:/2ndB의 git common dir가 E:/2ndB/.git인지 확인하고 현재 checkout의 CLAUDE.md,
   session-start 정본, 최신 origin/main의 docs/HANDOFF.md Latest를 먼저 읽어라.
2. 최신 origin/main에서 E:/2ndB/.worktrees 아래 깨끗한 격리 worktree를 만들어라.
   정본 main이나 다른 세션 worktree를 편집하지 마라.
3. #1807의 merged 상태·merge SHA·CI 4개 성공과 main key files를 재조회하라.
4. #1800은 중복 PKCE PR이다. PKCE와 OTP-only recovery 경계 및 superseded closed 상태를 확인하라.
5. 7개 UNNUMBERED draft에 번호를 추측하지 마라. 모든 remote migration 번호를 재스캔하고
   max+1 reservation branch를 즉시 push하라.
6. 운영 DB·Edge·Auth·secret·flag·Pages·canary·live-unit은 console owner와 별도 승인 영역이다.
7. Reward RPC revoke는 기존 실행 기록만 있다. 재실행하지 말고 catalog postflight로 확인하라.
8. behavior fixture, Storage race, Paddle transaction, Deno-native check를 rollout gate로 완료하라.
9. DB/Edge/Auth/Android/iOS/canary/postflight 전에는 productionComplete=false이며
   “보안 완료”라고 보고하지 마라.
10. Git의 docs/HANDOFF.md가 정본이고 Output 보고서와 local state JSON은 보조 증거다.
11. 첫 응답에 현재 main SHA, merged PR, CI 4개 상태, console hold, 다음 단일 안전 작업을 보고하라.
```

---

## 2026-09-13 / 디스크 정리 끝(17곳 · 21.9 GB) — 재부팅 뒤 에뮬레이터 화면 검증

**재부팅 직후 새 세션이 이 블록 하나로 이어받게 썼다.** Simon 이 정리 뒤 컴퓨터를 한 번 껐다 켠다 — 떠 있던 claude · codex · 에뮬레이터는 전부 내려간다.

### 어디까지 왔나

- main HEAD: `586abb25` (이 블록을 담은 PR 머지 전 기준)
- 이번 세션: 디스크 정리 1·2차 끝. PR 은 이 인계 하나(브랜치 `claude/disk-cleanup-260913`)
- 📊 보고서: <https://claude.ai/code/artifact/db1d3e47-8280-426f-95d3-1cf67f2baf97> (요약 · 상세 · 결정 · 할 일 · 히스토리)
- 디스크(18:58 KST): **C: 24.8 → 28.6 GB · E: 22.4 → 35.5 GB 여유.** 지운 파일 크기 21.85 GiB
- 공용 `E:/2ndB/node_modules`: **747 → 747**(대상마다 정션 해제 뒤 · 삭제 뒤 두 번 셈) · `expo/package.json` 있음
- `STATE.md` 소유자: 이 세션(ttl-work-rev2-1c). ttl-work-9a 가 19:2x 에 넘겼다 — Simon 지명이 아니라 두 세션 합의(A7 은 여전히 Simon 몫)

### 무엇을 지웠나 — Simon 이 목록을 두 번 보고 승인

| 차수 | 대상 | 크기 |
|---|---|---|
| 1차 18:14~18:20 | 워크트리 12(pixelclay-260905 · runbook-1749 · capture-diag-260908 · 작은 것 9) + 미등록 클론 `portable-handoff-clone-260830-235814` | 7.7 GiB |
| 2차 18:50~18:57 | Orca Design(C:) · vibe-native-prep-260906 · vibe-clay-integration-260906(Orca 터미널 8개 닫고) · `E:/2ndB/android` 캐시 8폴더(07-04 이전) | 14.2 GiB |

로컬 브랜치는 하나도 안 지웠다. android 는 `app/build/outputs`(APK) · `src` · gradle 설정 · `debug.keystore` 를 남겼다.

### 구제본 — 지우지 말 것 (전부 저장소 밖)

```
E:/Coding Infra/_rescue/worktrees-260913-1807/     1차 · RESCUE_OK 13 · deleted.json · README
E:/Coding Infra/_rescue/worktrees-260913-1825-r2/  2차 · Design 미도달 커밋 9개 번들(verify 통과) · Output 421MB · 세션 ID 4
E:/Coding Infra/_rescue/skills-260913-1753/        ~/.claude/skills 의 vibe · simon-handoff 복사본 (git 에 없다)
E:/Coding Infra/_rescue/tools/cleanup-260913/      survey_v2 · rescue · delete 스크립트 + 조사 원본 JSON
```

⚠ `pixelclay-260905/ignored.tar` 안의 `.env` 는 시크릿이다. ⚠ `tar -tf` 는 경로 공백 때문에 셸에서 0건을 낸다 — python `tarfile` 로 볼 것.
지운 워크트리의 에이전트 세션은 다른 폴더에서 다시 열 수 있다: claude `4c781d42` · `5815969b` / codex `01a07681` · `01a07682` (전체 ID 는 2차 README).

### 손대지 않은 것과 이유

| 무엇 | 크기 | 이유 |
|---|---|---|
| security-* 104곳 | 16.8 GiB | 보안담당 소유. **이 기계에만 있는 커밋 162개**(37곳 합집합, 18:1x). 인계의 114 는 15:42 값 |
| TTL-Work | 15.2 GiB | claude 8 · codex 5 가동, 미커밋 771(구제본 있음) |
| `.npm-security-landing-260906` | 1.04 GiB | 등록 안 된 npm 사본. Simon 이 이번에 고르지 않음 |
| session-start-260906 | 0.15 GiB | `docs/session-start/setup.md` 가 이름으로 지목한 공유 자료 편집 워크트리 |
| prod-workflow-ref-gates-260913 | 0.15 GiB | codex 완료 작업, origin 에 없는 커밋 2 |
| handoff-split-260913 · legacy-archive-integrity-260913 | 0.3 GiB | 6시간 안 활동. handoff-split 은 ttl-work-9a 가 "clean · main 과 0줄 차이"라 알렸다 → 다음 라운드 후보 |

⚠ 선점 기록 `RELEASE-INTEGRATE-260906`(active, 주인 ttl-work-a1)은 **오늘 지운 vibe-native-prep-260906 을 가리킨다.** 남의 기록이라 고치지 않았다 — 그 워크트리를 찾지 말 것.
워크트리 수가 121(17:05) → 117(19:2x) 로 4개만 준 것은 모순이 아니다. 같은 구간에 `*-260913` 워크트리가 45 → 55 로 10개 늘었다(보안 세션). 등록됐는데 경로가 없는 워크트리는 0건이다.

### 인계 수치 정정 셋 (다음 세션이 헛수고하지 않도록)

- "위험 40곳 · 53.9GB" → **44곳 · 39.9GB.** 조사 도구가 E:/2ndB 를 잴 때 `.worktrees/*` 를 한 번 더 셌다
- 조사 도구의 `git status` 가 index.lock 을 잡았다. 두 버그 모두 ttl-work-9a 가 19:2x 에 `_rescue/tools/survey_worktrees.py` 에서 고쳤다(`.worktrees` 제외 · `--no-optional-locks`). ignored 파일 크기는 `survey_v2.py` 만 센다
- 보안 미푸시 114 → **162**(합집합, 18:1x). 계속 는다 — 인용할 때 잰 시각을 붙일 것

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **안드로이드 에뮬레이터 화면 검증** — 재부팅이 5일째 굳어 있던 에뮬을 풀었다 | M | ⭐ 볼 화면 6곳과 근거는 바로 아래 "새 워크트리로 넘긴다" 블록의 표. x86_64 에뮬은 `preview-emulator` 프로필로 빌드 |
| B | 보안담당에게 커밋 162개 push 요청 | S | Simon → 보안담당. 보안 워크트리 정리의 선행(보고서 Q-260913-02) |
| C | `/vibe` · `/simon-handoff` 를 SimonK-stack 에 커밋 | S | Simon 승인 필요(Q-260913-03). 지금은 복사본뿐 |
| D | TTL-Work 미커밋 771건 처분 | L | 각 작업 주인. 구제본 `_rescue/ttl-work-260913-1554` |
| E | 남은 정리 후보 — C: Orca codex 세션 기록 중복 7.9GB 등(Q-260906-04 ≈11GB) · handoff-split-260913 | S | Simon 선택 |

### 적용 중인 정책 (영구) — 이번에 더한 것

1. **파일 삭제는 실행 직전 목록을 다시 보여 주고 승인받는다**(DECISIONS D7 조건). 1·2차 모두 그렇게 했다
2. **워크트리 삭제는 폴더 삭제 + `git worktree remove <없는 경로>`.** `orca worktree rm` 은 로컬 브랜치 삭제까지 시도한다(help 원문) · `--force` · `prune` 은 쓰지 않는다. Orca 카드는 스스로 사라진다
3. **사용 중 판정은 같은 부모 안에서 이름 바꾸기로 한다.** `orca terminal close --all` 의 `terminal_stop_live` 는 "남았다"도 "끝났다"도 아니다 — 폴더를 쥔 프로세스를 psutil 로 따로 센다
4. **codex 활동은 rollout 파일 하나로 판정하지 않는다.** 같은 ID 가 여러 날짜 폴더와 `AppData/Roaming/orca/codex-runtime-home` 에 흩어져 있다

앞 블록의 정책 1~7 은 그대로 유효하다.

### 검증

```bash
git -C E:/2ndB worktree list | wc -l                  # 117 전후 (보안 세션이 계속 늘린다)
ls -A E:/2ndB/node_modules | wc -l                    # 747
grep -c '^## Latest' docs/HANDOFF.md                  # 1
cat E:/2ndB/.git/2ndb-session-state/DISK-CLEANUP-260913.json   # status done
```

### 다음 세션 시작하는 법 (재부팅 뒤)

```bash
git -C E:/2ndB fetch origin main
git -C E:/2ndB worktree add .worktrees/<이름>-260914 -b claude/<주제>-260914 origin/main
# node_modules 정션은 PowerShell 스크립트 파일로 New-Item -ItemType Junction 후 reparse 속성 확인 (CLAUDE.md "Worktrees & branches")
cat STATE.md ; head -150 docs/HANDOFF.md ; tail -12 DECISIONS.md
adb devices                                           # 비었으면 에뮬부터 띄운다
```

---

## 2026-09-13 / 새 워크트리로 넘긴다 — 첫 일은 디스크, 그다음은 에뮬레이터 화면 검증

**이 블록 하나로 다른 워크트리에서 처음부터 일할 수 있게 썼다.** 앞 블록을 안 읽어도 된다.

### 어디까지 왔나

- main HEAD: `93849c42`
- 이번 세션 머지: **#1801**(HANDOFF 732KB → 기간 분할) · **#1802**(인수인계·현황·결정 원장 갱신)
- 열린 PR: **#1800**(PKCE) 하나 — CI 3/3 초록, **머지 조건이 코드리뷰가 아니라 에뮬 로그인 5종 확인**이고 그 담당이 없다
- 검사: `npm run verify` CI 초록 · `/vibe` selftest **132 PASS / 0 FAIL**
- 디스크: **C: 24.9GB · E: 23.2GB 남음** (17:05 KST) — 그래서 첫 일이 정리다

### 📊 결정용 보고서 (먼저 읽을 것)

**<https://claude.ai/code/artifact/ad6208ec-285e-4f81-b0ef-da4f69a14060>**

요약/결정 8건/상세/할 일/히스토리 5탭. 코딩 지식 없이도 읽히게 썼다. 다른 세션이
**작업 결정을 내리는 근거**로 쓰라고 Simon 이 지시했다(09-13 17:0x). 메모 사이드바의
`[메모 → 프롬프트 복사]` 가 회신 프롬프트를 조립해 준다.

---

### 첫 작업 — 디스크 정리 (Simon 지시, 09-13 17:0x)

> *"현재 작업중인 codex 세션을 제외하고서는 모두 정리해서 하드의 용량을 정리하는 작업부터 시작하게 하자."*

### 실측 (2026-09-13 17:05 KST · 워크트리 121개)

| 분류 | 개수 | 크기 | 처분 |
|---|---|---|---|
| **dirty>0 또는 unpushed>0** | 40 | 53.9 GB | ⛔ **지우면 사라진다** |
| dirty=0 · unpushed=0 | 81 | 12.8 GB | 후보 — 단 아래 예외 |
| 그중 `security-*` 계열 | 65 | — | ⛔ **소유자가 보안담당이다** |
| **진짜 정리 가능** | **16** | **~2.5 GB** | 아래 목록 |

`node_modules` 는 121개 중 **105개가 이미 정션**이라 잘 관리돼 있다. 실물은 7개뿐이고
그중 6개가 회수 대상(**~6 GB**) — 정본 `E:/2ndB/node_modules` 는 **남겨야 한다**(모두가 이걸 가리킨다).

```
실물 node_modules 7개:
  E:/2ndB                                     ← 정본. 건드리지 말 것
  C:/Users/202502/orca/workspaces/2ndB/Design ← Orca 워크스페이스. 소유자 확인 후
  .worktrees/2ndB/TTL-Work                    ← dirty 771 (구제 완료, 아래 참조)
  .worktrees/2ndB/pixelclay-260905            ← clean
  .worktrees/2ndB/vibe-native-prep-260906     ← clean · 572.8MB 로 최대
  .worktrees/runbook-1749                     ← clean
  .worktrees/security-static-supply-fix2-260913 ← unpush 35 ⛔
```

### ⛔ 지우기 전에 반드시 — 순서를 지킬 것

**2026-09-13 에 TTL-Work 하나에서만 미커밋 771건이 나왔고, 기록은 "남은 워크트리 0"이라
적고 있었다.** 목록 없이 지우면 그게 반복된다.

```
① 조사   python "E:/Coding Infra/_rescue/tools/survey_worktrees.py"   (읽기만 · 121개 전수)
② 구제   dirty>0 또는 unpushed>0 인 것은 먼저 스냅샷 (아래 절차)
③ 삭제   ①②를 통과한 것만
```

**구제 절차** (TTL-Work 에 실제로 쓴 것 — 재사용 가능):

```bash
# 공유 워크트리에서는 git add/commit/checkout/stash/clean 을 쓰지 않는다.
# 통째로 뜨려면: python "E:/Coding Infra/_rescue/tools/rescue_ttlwork.py" (SRC 만 바꾼다)
git -C <worktree> diff HEAD --binary > <dest>/tracked.patch
git -C <worktree> status --porcelain | grep '^?? ' | sed 's/^?? //' \
  | grep -vE '^(Output/|node_modules|dist/|\.expo/)' > /tmp/untracked.txt
tar -C <worktree> -cf <dest>/untracked.tar -T /tmp/untracked.txt
# 전후로 dirty 개수가 같은지 확인한다
```

**삭제 절차** — `git worktree remove --force` 를 **쓰지 않는다**:

```bash
# 정션을 먼저 끊는다. 안 끊으면 정션을 따라가 공용 node_modules 를 지운다(전례 있음)
cmd /c rmdir "E:\2ndB\.worktrees\<name>\node_modules"      # 정션이면 rmdir
git -C E:/2ndB worktree remove .worktrees/<name>            # --force 없이
git -C E:/2ndB worktree prune
```

### 건드리면 안 되는 것 — 실측 근거

| 무엇 | 왜 |
|---|---|
| **`security-*` 워크트리 99개** | 09-13 09:00 에 Simon 이 **보안 담당에게 직접 이관**했다. 브랜치 처분·머지·삭제 금지. **33개에 미푸시 커밋이 있고 최대 101개**다 |
| **지금 작업 중인 것** | 09-13 16:58·16:41·16:28 에 커밋이 찍혔다. 17:05 기준 **최근 6시간 안에 커밋된 워크트리가 36개** — 살아 있다 |
| **codex 세션** | 프로세스 8개 가동 중(CPU 113s·110s·58s·25s). Simon 이 명시적으로 제외하라고 했다 |
| **`E:/2ndB/node_modules`** | 정본. 105개 워크트리가 이걸 가리킨다 |
| **스태시 22개** | 공유다. 내용 미평가 상태로 넘겨져 있다. `git stash drop` 금지 |

### 이미 구제해 둔 것 — 다시 뜨지 말 것

```
E:/Coding Infra/_rescue/ttl-work-260913-1554/
  tracked.patch    3,966,891 B   수정 577파일 (audit-write-outbox 725줄 재작성본 포함)
  untracked.tar  140,789,760 B   951파일 (docs/quality 34 포함)
  README.md · status.txt
기준 HEAD bcd051ae · origin/main ebf7a04a (당시)
```

⚠ `tar -tf` 가 셸에서 **0건**을 낸다(경로에 공백). 빈 아카이브가 **아니다** — python 으로 951파일 확인했다.
⚠ tar 만 보면 절반을 놓친다. **추적 파일 수정분은 patch 쪽**에 있다.
⚠ 저장소 **밖**에 뒀다 — 앞선 백업 둘(`.worktrees/_backup/ttl-work-260907-*`)은 워크트리 안이라
정리하면 **백업까지 같이 사라진다.**

**TTL-Work 는 이제 지워도 되는가?** 구제본은 떴지만 **처분 판단은 안 했다.** 771건 중
무엇이 완성이고 무엇이 폐기인지는 각 작업의 소유자만 안다. **지우기 전에 소유자 확인.**
(단 구제본이 있으므로 잘못 지워도 복구 가능하다 — 그게 이 스냅샷의 목적이다.)

---

### 그다음 — 에뮬레이터로 화면 검증 (Simon 지시)

> *"아이폰, 안드로이드 폰 에뮬레이터를 적극 이용해서 화면 검증까지 할수 있게"*

### 안드로이드 — **된다. 지금 붙어 있다**

```
adb devices        → emulator-5554  device
AVD 6개            2ndB_Codex_API36_260727 · 2ndB_Codex_Debug_API36_260831
                   2ndB_Codex_Release_API36_260902 · 2ndB_Copy_260906
                   2ndB_QA_009 · Pixel_9_Pro_XL
SDK                C:\Users\202502\AppData\Local\Android\Sdk
앱 id              com.simonk.secondbrain
```

⚠ **17:12 KST 에 `adb shell` 이 응답하지 않았다**(120초 초과). `adb devices` 는 `device` 로
보이는데 셸이 안 열린다 = **에뮬이 5일째 떠 있어서 굳었을 가능성**. 첫 명령이 걸리면
에뮬을 재시작하고 시작할 것:

```bash
adb -s emulator-5554 emu kill
emulator -avd Pixel_9_Pro_XL -no-snapshot-load &   # 또는 2ndB_QA_009
adb wait-for-device && adb shell getprop sys.boot_completed   # 1 이 나올 때까지
```

⚠ **arm64 전용 출시 APK 는 x86_64 에뮬에서 안 돈다.** 에뮬용은 `preview-emulator`
프로필로 따로 빌드한다(`eas.json` 에 있다). 이 함정으로 "에뮬 QA 불가"라고 한 달간
잘못 적혀 있었다 — 09-08 에 정정됐다.

### 아이폰 — **이 기계에서는 시뮬레이터가 불가능하다. 솔직히 적는다**

```
uname -s   MINGW64_NT-10.0-26200     (Windows)
xcrun      없음
simctl     없음
```

iOS 시뮬레이터는 **macOS + Xcode 가 있어야만** 돈다. 이 기계에는 없다.
"아이폰 에뮬레이터로 검증하라"는 지시를 그대로 실행할 방법이 없으므로, **대신 쓸 수 있는
셋을 순서대로** 적는다:

| | 방법 | 무엇이 검증되나 | 필요한 것 |
|---|---|---|---|
| ① | **실기 iPhone + Expo dev client** (`npx expo start`, 같은 LAN 에서 QR) | 진짜 iOS 런타임·제스처·안전영역 전부 | Simon 의 iPhone 1대. **가장 빠르다** |
| ② | **EAS Build → TestFlight** | 실제 배포본과 같은 빌드 | Apple 계정 동작. 설정은 이미 있다 — `ascAppId 6792266942` · `appleTeamId 7CP84WS5C6` (`eas.json` submit.production) |
| ③ | **웹을 iPhone 뷰포트로** (Playwright/CDP, 390×844 등) | 레이아웃·잘림·대비만. **iOS 런타임은 아니다** | 없음. 지금 바로 가능 |

⚠ `eas.json` 에 **`ios-simulator` 빌드 프로필이 있다** — 그건 EAS 의 macOS 머신에서
*빌드*는 되지만 **여기서 *실행*은 안 된다.** 프로필이 있다고 "여기서 된다"로 읽지 말 것.

**권고**: ③으로 레이아웃을 먼저 훑고(비용 0), 진짜 판정이 필요한 화면만 ① 또는 ②로 올린다.

### 화면 검증에서 먼저 볼 것 — 근거 있는 후보

| 화면 | 무엇을 볼 것 | 근거 |
|---|---|---|
| 온보딩 Continue 직후 | **백지 + 강제 종료**(3회 중 2회, 자력 복구 없음) | Fabric `addViewAt … View already has a parent` → ReactHost 파괴. 기전 확정·컴포넌트 미확정. 09-08 이후 main 에 관련 커밋 0건 |
| `/account` · `/data` | 프로필 프로브 8초 타임아웃 시 **재시도 없는 스피너** | `account.tsx:43-53` · `data.tsx:149` 에 `onRetry` 0건. 대조군 `dds-audit-screen.tsx:289-296` 에는 있다 |
| `/privacy` | 안심 문구가 **안 보이는 것이 맞는지** 눈으로 | 승인된 5개 언어 문구가 번들에 있는데 `PrivacyLegacy()` 분기라 배포 4곳 전부 안 탄다 |
| 영어 담기 실패 | 안내가 **화면에 없는 버튼 이름**을 부른다 | `en.keepToWiki`="Save to wiki" vs `en.keepFailed`="tap **Keep to wiki**" |
| 홈 별 라벨(영어) | "Thirties and after" 잘림 | `ConstellationHome` 라벨 `numberOfLines={1}` + 폭 80px 고정. 한국어는 안 남 |
| OAuth 로그인 5종 | **#1800 머지의 실제 게이트** | 소셜 5종 통과를 확인해야 PKCE 를 넣는다. 되돌리기가 "PR revert" 가 아니라 설치된 앱의 로그인이다 |

---

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **디스크 정리** — 조사 → 구제 → 삭제 (위 순서) | M | ⭐ Simon 이 "첫 일"로 지정. 남은 공간이 23GB 다 |
| B | **에뮬레이터 화면 검증** — 안드로이드부터, iPhone 은 ①③ 경로 | M | ⭐ 위 6개 후보에 근거가 다 붙어 있다 |
| C | 구제본 771건 **처분**(완성/폐기 가르기) | L | 유일본이다. 소유자 확인 필요 |
| D | 배송 홈이 `highlightRecordId` 를 읽게 | M | Simon 이 "받는 쪽부터"로 순서 지정. 되살리기 큐 전체의 선행 |
| E | 적대평가 2회차용 **어려운 probe** 추가 | S | 지금 자는 16/16 이라 레인을 못 가른다 |
| F | 미푸시 보안 커밋 114개 push | S | 보안담당 몫. 완성된 수정이 이 기계 한 대에만 있다 |

### Simon 결정 대기 8건 (나머지를 막는다)

A1 출시 법역(Q-S1 — DPIA A~H + 빌드 8종) · A2 마이그레이션 0171~0187 운영 적용 ·
A3 `community_is_member` 미바인딩(보안담당) · A4 웹 게시 승인(라이브가 **92커밋 뒤**) ·
A5 #1800 PKCE · A6 미확인 보안 브랜치 69갈래 방향 · A7 `STATE.md` 소유자 ·
A8 자살예방법 시행령 관찰자. **상세·선택지는 `STATE.md` 와 위 보고서 "결정 8" 탭.**

### 적용 중인 정책 (영구)

1. **공유 워크트리에서 `git add -A` · 맨 `stash`/`pop` · `checkout` · `restore` · `reset` 금지.**
   경로를 지정한 `add` 만. 남의 미커밋 작업을 끌고 가거나 삼킨다.
2. **`git worktree remove --force` 금지.** 정션을 따라가 공용 `node_modules` 를 지운다.
   정션을 먼저 `cmd /c rmdir` 로 끊는다.
3. **`docs/HANDOFF.md` 는 요약하지 않는다.** 100KB 에 닿으면 기간으로 굴린다
   (`/simon-handoff` Step 2-B). 활성 창 예산 80KB.
4. **`STATE.md` 는 한 세션만 쓴다**(덮어쓰기 파일). 다른 세션은 `DECISIONS.md` 에만 append.
5. **보안 트랙은 보안담당 소유**(09-13 Simon 직접 이관). 브랜치 처분·머지·삭제 금지.
   **피어를 경유한 승인은 승인이 아니다.**
6. **결정은 난 그 턴에 `DECISIONS.md` 에 쓴다**(§0-4). 세션 끝에 몰아 쓰면 그때는 날아가 있다.
7. **결정 시트는 `make_decision_sheet.py` 로만 만든다.** 손으로 조립하면 `decisions_run_*.json`
   이 안 나와 채택률 회수 경로가 통째로 없다(미회수 4건이 전부 이 경우였다).

### 핵심 파일 위치

```
STATE.md                          현황 네 절. 여기부터 읽는다
DECISIONS.md                      결정 원장 (append-only, 25행)
docs/HANDOFF.md                   이 로그의 활성 창
docs/handoff/HANDOFF-2026-*.md    기간 보관본 9개 (전부 100KB 미만)
E:/Coding Infra/_rescue/           워크트리 구제본 ← 지우지 말 것
~/.claude/skills/vibe/             4벤더 파이프라인 (git 밖이다 — 백업 없음)
~/.claude/skills/simon-handoff/    이 스킬 (git 밖이다)
eas.json                           build: preview-emulator / ios-simulator / production
```

⚠ **`~/.claude/skills/` 는 git 밖이다.** 오늘 `/vibe`(+29 검사)와 `/simon-handoff`(266→397줄)를
크게 고쳤는데 **버전 관리가 안 된다.** 백업 경로를 정하는 것이 미결 항목이다.

### 검증

```bash
npm run verify                                          # 저장소 전체
python ~/.claude/skills/vibe/scripts/selftest.py        # 132 PASS / 0 FAIL
python ~/.claude/skills/vibe/scripts/adversarial_eval.py --validate   # 8/8
grep -c '^## Latest' docs/HANDOFF.md                    # 1
find docs/HANDOFF.md docs/handoff -name 'HANDOFF-*.md' -size +100k    # 0건
adb devices                                             # emulator-5554 device
```

### 다음 세션 시작하는 법

```bash
# 1) 새 워크트리에서 (공유 워크트리에 들어가지 말 것)
git -C E:/2ndB worktree add .worktrees/<내이름>-260914 -b claude/<주제>-260914 origin/main
cd E:/2ndB/.worktrees/<내이름>-260914
cmd //c mklink /J node_modules E:\2ndB\node_modules      # 정션. 실물 복사 금지

# 2) 읽기 순서
cat STATE.md ; cat docs/HANDOFF.md ; tail -30 DECISIONS.md
# 결정 근거는 보고서: https://claude.ai/code/artifact/ad6208ec-285e-4f81-b0ef-da4f69a14060

# 3) A 작업(디스크 정리)부터 — 조사 → 구제 → 삭제 순서를 지킬 것
```

## 2026-09-13 / 감사 두 번을 돌렸더니, 기록이 "0"이라 적은 자리에 771건이 있었다

### 어디까지 왔나
- main HEAD: `ebf7a04a` (이 블록을 쓰는 시점)
- 이번 세션 머지된 PR: **#1801** docs(handoff): 732KB 로그를 기간 파일로 분할
- 열린 PR: **#1800**(PKCE) 하나 — CI 3/3 초록, 머지 조건이 코드리뷰가 아니라 **에뮬 검증**인데 담당이 없다
- 검사: `/vibe` selftest **132 PASS / 0 FAIL**(103 → 132, 적대평가 검사 29개 추가)

### 무엇을 했나

**① `docs/HANDOFF.md` 가 상한을 7.3배 넘고 있었다 → 기간으로 쪼갰다 (#1801)**

732,210B. 지침 §2 의 단일 파일 상한은 100KB 고, §0-1 이 처분까지 정해뒀다 —
**"요약하지 말고 기간으로 쪼갠다. 압축은 선택지가 아니다."**

§7 의 예시는 반기(`YYYYHn`)지만 2026-07·08·09 가 각각 226·307·110KB 라 반기로 묶으면
한 파일이 640KB 가 된다. **예시를 따르면 그 예시가 지키려는 규칙이 깨진다.** 월을 썼고,
월도 넘치면 부분(`-pN`, p1 이 가장 오래된 쪽)으로 더 쪼갰다. 부분 번호를 오래된 쪽부터
매기는 이유는 굴림 때 기존 파일 이름이 안 밀리게 하려는 것이다.

무손실은 git 오브젝트 수준에서 확인했다 — **137블록 → 137블록 · 소실 0 · 추가 0**,
제목 변경 2건(Latest 강등·승격)뿐. 재정렬도 중복 제거도 안 했다. 이 로그에는 날짜 역순이
아닌 자리가 실제로 있고 그것도 기록이며, **원본부터 완전히 같은 본문이 두 번 있는 블록**이
있어서 무손실 검증은 유일성이 아니라 **개수 보존**으로 해야 했다.

곁가지: `## Latest` 가 **2026-09-06 블록**에 붙어 있었고 그 위에 09-13 블록이 **넷** 있었다.
규약대로 Latest 를 찾는 세션은 일주일 낡은 판을 최신 현황으로 읽었다. 강등 규칙은 스킬에
처음부터 있었다 — **없던 것은 검사였다.** `/simon-handoff` 에 Step 2-C 로 넣었다.

**② `/vibe` 적대평가가 껍데기였다 → 메우고 돌렸다**

지난 라운드에 "만들었다"고 보고한 것의 두 곳이 비어 있었다:
- `--run` 이 "아직 수동 단계다"만 찍고 끝났다 — 실행 코드가 없었다
- `truth_post` 가 **선언만 있고 구현이 없었다** — 세는 문제에 파일 목록이 정답으로 들어가고,
  부재 확인 문제는 `cat-file -e` 의 종료코드 1 이 "정답 생성 실패"로 처리돼 **없는 파일을
  확인하는 문제인데 파일이 없다는 사실이 오류가 됐다.**

지금은 8 probe 전부 기계로 정답이 나오고(`8/8 통과`), 손으로 박아둔 정답 `manual:` 둘은
생성기(`eval/truth/*.py`)로 바꿨다 — 핀은 저장소가 바뀌어도 안 바뀌니 언젠가 반드시 거짓이
되고, 그때 평가가 **조용히 거꾸로 채점한다.**

1회차를 라이브로 돌렸다(`ae_260913_144139`): 8 probe · 24 호출 · 원장 16행 · **16/16 정답** ·
G10 위반 0. ⚠ **이건 좋은 결과가 아니다** — 전 레인이 다 맞혔다는 건 이 자가 레인을 못
가른다는 뜻이다. 사람이 매번 알아채길 기대하지 않게 `--report` 가 직접 말하게 했다.

실행 경로는 **Orca 워커가 아니라 벤더 CLI 직행**이다(`claude -p` · `codex exec` ·
`agy --print` · `grok -p`). 그래서 라우팅 표의 "grok·gemini 는 effort 지정 불가"가 여기에는
해당하지 않는다 — 그건 Orca 가 `--model` 을 거부한다는 뜻이고 CLI 에는 둘 다 있다.
**이 사실로 표를 고치지 말 것. 표는 워커 경로를 적는다.**

프리플라이트에서 벤더 둘이 죽어 있었다: **grok 402(잔액 소진)** · gemini 단독 CLI 는
`IneligibleTierError`(→ `agy` 로만 닿는다). **쿼터 %로는 둘 다 여유 있어 보인다** —
못 쓰는 이유가 쿼터가 아니기 때문이다. 가드 **G12** 로 박았다.

**③ 감사 두 번 — 1차가 빠뜨린 축을 2차가 메웠다**

1차(서브에이전트 24): 세션 8개 + 횡단 6종 → 182건 수집 → 적대 검증 → 마스터 TODO.
완결성 비판이 1차의 구멍을 잡았다 — **세션간 대화 528건(발신 20세션)과 Simon 프롬프트
원장 1,223행을 통째로 안 훑었다.** Simon 이 명시적으로 요구한 축인데 셋 중 '결정'만 봤다.

2차(서브에이전트 12)에서 **소실 임박 6건이 나왔다. 1차에는 하나도 없었다.**

### ⛔ 지금 가장 위험한 것 — 기록이 "0"이라 적은 자리

```
공유 워크트리 TTL-Work:  수정 575 · 미추적 196(132.7MB) · 스태시 22   @09-13 15:54 KST
docs/HANDOFF.md 서술:    "미push 커밋 0, 남은 워크트리 0"
```

그 기록을 믿고 정리하면 사라지는 것 — `audit-write-outbox.ts` **725줄 재작성본**(main 과 다른 판) ·
`purge-local-data.ts`(main 에 부재, 계정 삭제 영수증 경로) · Round21 회귀 310줄 ·
`docs/quality/` 33파일 36MB(품질 회차 195발견의 **유일한 재현 근거**) ·
`SignInStorageRecoveryCard.tsx` · `batches.json`.

**구제 스냅샷을 떴다. 판단 없이 보존만 했다:**

```
E:/Coding Infra/_rescue/ttl-work-260913-1554/
  tracked.patch    3,966,891 B   수정 577파일 (725줄 재작성본은 여기)
  untracked.tar  140,789,760 B   951파일 (docs/quality 34 포함)
  README.md · status.txt
```

`git add`·`commit`·`checkout`·`stash`·`clean` 을 **하나도 쓰지 않았다** — 공유 워크트리라
인덱스를 건드리면 다른 세션의 작업을 갈아탄다. 스냅샷 전후로 `196 / 575` 가 그대로임을 확인했다.

⚠ 저장소 **밖**에 뒀다. 앞선 백업 둘(`.worktrees/_backup/ttl-work-260907-*`)은 워크트리 안에
있어서 워크트리를 정리하면 백업까지 같이 사라진다.
⚠ `tar -tf` 가 셸에서 **0건**을 낸다(경로에 공백). 빈 아카이브가 아니다 — python 으로 확인할 것.

**남은 일은 보존이 아니라 처분이다.** 어느 것이 완성이고 어느 것이 폐기인지는 각 작업의
소유자만 안다. 이 세션은 판단하지 않았다.

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **구제 스냅샷 771건 처분** — 소유자별로 완성/폐기를 가른다 | L | ⭐ 유일본이고 되돌릴 수 없다 |
| B | P1 — 배송 홈이 `highlightRecordId` 를 읽게 | M | Simon 이 "받는 쪽부터"로 순서 지정 |
| C | 적대평가 2회차용 **어려운 probe** 추가 | S | 지금 자는 16/16 이라 아무것도 못 가른다 |
| D | 기록 정정 4건(아래 "기록이 사실과 다른 것") | S | 다음 세션의 헛수고를 막는다 |

### Simon 결정 대기 8건

A1 출시 법역(Q-S1, DPIA A~H + 빌드 8종을 막음) · A2 마이그레이션 0171~0187 운영 적용 ·
A3 `community_is_member` 미바인딩(보안담당) · A4 웹 게시 승인(라이브가 **92커밋 뒤**) ·
A5 PR #1800 PKCE · A6 미확인 보안 브랜치 69갈래 방향 · A7 `STATE.md` 소유자 ·
A8 자살예방법 시행령 관찰자. 상세는 `STATE.md`.

### 기록이 사실과 다른 것 — 다음 세션이 헛수고하지 않도록

- 활성 창이 **0148·0149·0150 을 "적용 대기"** 로 적는다 → 운영 적용 완료(09-07 20:07~20:11 UTC).
- 이 워크트리의 `CLAUDE.md` 는 웹 배포를 **gh-pages** 라 적는다 → main 은 `actions/deploy-pages`(#1657).
  여기서 시작하는 세션이 낡은 쪽을 프로젝트 지침으로 읽는다.
- `docs/WEB-PUBLISH-RUNBOOK.md` 가 게시 재현성을 **"Simon 확인 사항"** 으로 남긴다 → D4 로 닫혔고 #1795 가 고쳤다.
- `docs/handoff/HANDOFF-2026-08-p4.md:1348` 이 `auth.uid()` 없는 함수 **"0건 · 수정 불요"** 라
  적는다 → 같은 문단이 반례를 이름으로 적고 있다(A3).

### 검증
```bash
npm run verify                                   # 저장소
python ~/.claude/skills/vibe/scripts/selftest.py # 132 PASS / 0 FAIL
grep -c '^## Latest' docs/HANDOFF.md             # 1
find docs/HANDOFF.md docs/handoff -name 'HANDOFF-*.md' -size +100k   # 0건
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat STATE.md          # 현황 — 여기부터
cat docs/HANDOFF.md   # 이 블록
tail -30 DECISIONS.md # 오늘 결정 5줄
```

---

## 2026-09-13 / 빌드가 재현되지 않아 게시가 반반이었다 — 고쳤다 (#1795)

> 발행: Claude Code (워크트리 `font-holes-260906`, 기준 main `af5ede12` → `361d8280`).
> 이 세션은 결정 시트 260913 의 Simon 회신 8건을 집행하던 중 워크트리 이관 지시로 닫힌다.

### 무엇을 고쳤나

웹 게시 게이트는 **승인한 digest** 와 **방금 빌드한 digest** 를 대조한다. 그 대조는 빌드가
재현된다는 전제 위에 서 있었는데, 재현되지 않았다. 같은 커밋의 push 빌드를 `gh run rerun`
으로 다시 돌리면 digest 가 달라졌고, 두 산출물(351파일)을 풀어 보니 모든 JS 청크 해시가
달랐다. 39바이트짜리 청크가 원인을 그대로 보여줬다:

```
빌드 A:  __d(function(g,r,i,a,m,e,d){},3496,[]);
빌드 B:  __d(function(g,r,i,a,m,e,d){},2375,[]);
```

Metro 기본 id 팩토리는 **순번 카운터**다 — id 가 "어느 모듈인가"가 아니라 **"언제 닿였는가"**
를 담고, 그래프 순회는 워커 프로세스에 흩어져 돈다.

**배출 순서도 같은 것에 매달려 있었다.** 두 직렬화기가 모듈을 id 로 정렬하는데
(`metro/.../baseJSBundle.js:38`, `@expo/metro-config/.../serializeChunks.js:getSortedModules`)
**id 를 순회 순서로 매긴 다음** 정렬하므로 정렬이 무의미했다. 그래서 id 를 경로에 고정하면
**id 와 순서가 한 번에** 잡힌다 — 정렬이 드디어 순회와 무관한 기준을 갖는다.

`metro-module-id.js` 가 프로젝트 루트 기준 **상대 경로**를 해시한다(31비트, 충돌 시 두 경로를
이름으로 대며 throw). 상대 경로인 이유는 같은 커밋이 CI 러너·정본·워크트리 십여 개에서,
Windows 와 Linux 양쪽에서 빌드되기 때문이다.

### ⚠ 지문 소스 여부는 추측하지 말고 이 값으로 볼 것

```
@expo/fingerprint 0.19.5 · platform android · 소스 190개 (file 119 / dir 66 / contents 5)
루트 소스: .easignore .gitignore android assets/images/*4
           config-plugins/withAndroidAbiFilter.js eas.json google-services.json patches
contents:  expoAutolinkingConfig:android expoConfig package:react-native
           packageJson:scripts rncoreAutolinkingConfig:android
metro.config.js  없음        babel.config.js  없음
```

즉 `metro.config.js` 는 **지문 소스가 아니다.** 런타임 버전이 안 움직이므로 설치된 빌드의
OTA 호환이 깨지지 않는다. 청크 해시는 한 번 전부 바뀌고, 웹 export 는 내용 주소라 흡수한다.

### 낡아 있던 서술 6건 (기억으로 그리면 안 되는 이유)

5일 만에 목록을 다시 재니 여섯이 이미 끝나 있었다.

| 미결이라고 적혀 있던 것 | 실측 |
|---|---|
| 엣지 함수 9개 배포 | **완료** — 09-07 13:07 에 8건 + 이후 2건, 전부 success |
| 항목 4 og:image 절대 주소 | **해결** — 라이브 HTML 에 존재 |
| 동의 스택 6건(#1587~#1593) | **종결** — #1589 머지, 5건 클로즈 |
| 초안 PR 25개(Q-260906-02) | **종결** — 열린 PR 0건 |
| `0188` 운영 적용 필요 | **이미 적용됨** — `raw_clippings_owner_insert`/`update` 에 존재 검사가 붙어 있다 |
| 고아 객체 정리 필요 | **고아 0건** — 버킷 1개 · 객체 3개 · 240B, 전부 실재 사용자 |

`export-delivery.ts`·`export-session.ts` 도 main 에 있다(테스트까지). "어느 ref 에도 없는
유일본" 서술은 낡았다.

### 남긴 것 (다음 워크트리)

`DECISIONS.md` 의 "결정 시트 260913" 절에 Simon 회신 8건과 그중 무엇이 이미 닫혔는지가
전부 있다. 실행 대기는 넷이다.

1. **게시** — D4 가 고쳐졌으니 이제 정적에 덜 의존한다. 머지 후 push 빌드를 `gh run rerun`
   해서 digest 가 같은지 **먼저 확인**할 것. 그게 재현성의 진짜 증명이고, 애초에 결함을 잡은 방법이다.
2. **D3 HANDOFF 기간 분할** — 승인됐다. 단 **여러 세션이 prepend 중이 아닐 때** 할 것.
3. **D7 정리 묶음 6건** — 기본값 승인됨. 파일 삭제 건은 실행 직전 목록 재확인.
4. **D6 en 라운드 착지** — 회귀 2건 제외. 태그 `haeyo-5lang-snapshot`.
5. **D5 MFDS 고객센터 문의** — 로그인 필요. CLI 가 대리하지 않는다(§7). §4 작업 카드 몫.

### ⚠ `STATE.md` 는 덮어쓰기 파일인데 쓰는 세션이 여럿이다

지침 §0-1 이 경고한 그대로다 — 두 번째 쓰기가 첫 번째를 지운다. 지금 소유자는
`runbook-260907` 세션이고, 이 세션은 **건드리지 않았다.** 병렬 세션은 append-only 인
`DECISIONS.md` 에만 쓰는 것이 안전하다.


## 2026-09-13 / 레거시 은퇴가 되살리기로 방향을 바꿨다 — 그리고 Phase 1 이 배송에서 끊겨 있었다

**이 워크트리(`runbook-260907`)는 여기서 닫는다**(Simon 지시). 내 브랜치는 전부 origin 에
있다(미푸시 0). 상태는 `STATE.md`, 결정은 `DECISIONS.md` 가 갖는다 — 여기 중복해 적지 않는다.

### 한 줄

가져온 자료를 읽어 요약과 되새김 질문 넷을 만드는 단계(**Phase 1**)에 **배송 호출부가 0건**
이었다. 코드는 전부 있었고, 검사도 전부 초록이었다.

### 왜 아무도 못 봤나 — 네 겹이 겹쳤다

```
runPhase1 호출부        2곳, 둘 다 죽은 반쪽 안 (src/app/inbox.tsx:452 · src/app/wiki.tsx:318)
배송 megafile          listSources · generateSourcePage · runPhase1 을 import 만 하고 안 씀
eslint no-unused-vars  "warn" 이라 CI 가 안 섬
/import 화면 주석       "imported notes land in the inbox for Phase 1/2 later ($0)"
                       — 그 "나중" 이 오지 않았다
```

**Phase 2(위키 페이지 만들기)는 멀쩡했다** — 기록 상세와 자동 승격에서 부른다. 끊긴 것은
읽는 단계 하나뿐이다. 그래서 "AI 가 내 자료로 아무것도 안 한다"와 "코드는 다 있다"가 동시에
참이었다.

### 고친 것 (#1796)

`/sources` 신설 — 미리보기 펼치기 · 요약과 질문 넷 만들기/보기 · 위키 페이지 만들기.
알림 허브에는 **한 줄 신호**만 얹고 누르면 화면 전환한다(목록을 허브에 넣으면 145줄 허브가
858줄 목록이 된다 — 화면 하나에 메시지 하나 · O-7).

`/wiki?focusSourceId=` 점프는 **일부러 안 넣었다.** 배송 위키는 `focusPageId` 를 읽어서 그
파라미터는 받는 사람이 없다(#1782 이 고아 파라미터 셋 중 하나로 기록). 받는 쪽을 먼저 만든
뒤에 잇는다.

새 검사 `src/lib/wiki/__tests__/phase1-has-a-shipping-caller.test.ts` 가 이 구멍을 지킨다.
쓰다가 **매달린 import 를 일곱 개 더** 찾았다 — 손으로 셋, 검사가 일곱, 한 파일에 열.
**손으로 세면 늘 모자란다.** 변이 검증 7/7(물어야 할 넷은 물고, 자기 산문·로그 문자열·주석
셋은 안 흔들린다).

### 방향이 바뀌었다 — 은퇴 중단, 되살리기 집중 (Simon 결정 Q10)

Q3 에서 `capture`(4,636줄)를 다음 은퇴 묶음으로 골랐는데 **전제가 반증됐다. capture 는
배송된다** — `capture-full.tsx:6,14,18` 이 두 트랙 모두에서 `CaptureLegacy` 를 그리고,
Web Share Target 이 `/capture` 로 들어온다. 이름의 `Legacy` 는 **트랙 이름이지 상태가 아니다**
(`formats.tsx` 에서 한 번, 여기서 또 한 번 걸렸다).

→ **은퇴 후보를 줄 수로 고르지 말 것.** 가장 큰 파일이 가장 살아 있었다.

남은 죽은 핀 37(`wiki` 29 · `inbox` 8)은 은퇴가 아니라 **되살리기로** 해소된다. 배송 화면이
계약을 갖게 되면 검사가 그쪽을 가리킨다.

### 이미 끝나 있던 것 — `/ops`

Q4 가 "인용 갱신 후 은퇴를 이어간다" 였는데 **09-08 에 이미 끝났다.** `src/app/ops.tsx` 는
12줄 래퍼고 레거시 반쪽이 없으며 `legacy/screens/ops.tsx` 로 나갔다. DPIA 인용도 그때
재조준됐다(`dpia-crisis-rail-anchors.test.ts:147`). **다시 파지 말 것.**

### 다음 사람에게 (순서는 `STATE.md` 가 정본)

1. **P1 — 배송 홈이 `highlightRecordId` 를 읽게 한다.** 보내는 곳 둘, 읽는 곳은 아카이브된
   홈뿐이다. Simon 이 "받는 쪽부터" 로 순서를 지정했다.
2. Q11 — `/import` 붙여넣기 상자 + 우리 분류기(Simon "둘 다"). `$0` 주석은 #1796 에서 이미
   정정했다. 붙여넣은 것도 소스가 되니 `/sources` 가 그대로 받는다.
3. P2 `/data` 묶음(Q8 + Q7③) → P3 위키 삭제·검색·지표(Q7 ①②④) → P4 기록 상세 셋(Q6 ①②③).

### ⚠ 이 파일이 708KB 다

9,378줄. 지침의 100KB 상한을 7배 넘겼다. **요약하지 말고 기간으로 쪼갤 것**
(`docs/handoff/HANDOFF-2026H2.md`). 워크트리를 닫는 중에 즉흥으로 할 일이 아니라 손대지
않았다 — 새 워크트리의 첫 작업 후보다.

---

## 2026-09-13 / 게시 조기 중단 (#1792), 그리고 재보니 하면 안 되는 일이었던 것 둘

Simon 이 고른 "다음 회차" 4건 처리. 하나는 코드로 끝냈고, 둘은 §4 작업 카드로 넘겼고,
**하나는 재보니 하면 더 나빠지는 일이었다.**
작업 카드: <https://claude.ai/code/artifact/f32e6ec2-e2e0-496f-95f5-bbfe3f721035>

### 끝난 것 — #1792 게시 조기 중단

`origin/main == source_sha` 판정이 build 맨 앞과 deploy(승인 후) 두 곳에서 돌았고,
**그 사이 간격이 빌드 전체(실측 6~11분)** 다. 09-07 게시 7번 중 6번이 전부 거기서 죽었고
모양이 같았다 — 빌드 초록 → 사람에게 승인 요청 → 승인 → **그때서야** "main 이 이미 움직였다".

같은 검사를 **build 의 마지막 스텝**으로 넣었다. 이미 실패가 확정된 run 은 사람을 부르기 전에
죽고, 낡았다는 사실이 처음 감지 가능한 시점에 보고된다.

⚠ **창을 닫은 게 아니다.** 승인 대기 중에도 main 은 움직인다. 그걸 막으려면 실행 중 워크플로를
취소할 `actions: write` 가 필요한데 그 잡은 `actions: read` 다. **게이트를 편의로 넓히지 않기로
한 결정**(아래)과 충돌하므로 남는 창은 그대로 두고 deploy 의 기존 검사가 계속 잡는다.
빼거나 느슨하게 한 것 0.

### ⚠ 재제안 금지 1 — 플랜/요금제 "통일"

내가 09-08 에 *"라운드가 37곳을 요금제로 옮기고 두 줄만 플랜으로 남겼다 — 불일치다"* 라고
적었다. **`locales/` 만 세고 낸 말이다.** 전체를 세면 불일치가 아니라 **표면별로 갈린 용어**다:

| 표면 | 플랜 | 요금제 | |
|---|---:|---:|---|
| `locales/ko` | 4 | **37** | 앱 화면 |
| `src/lib/legal` | **8** | 1 | 환불방침 본문 |
| `docs/legal` | **6** | 1 | 같은 문서 원본 |

남은 그 두 줄은 자동갱신 **고지**라, 자기가 요약하는 환불방침의 `무료 플랜 범위` 와 같은 말을
쓴다. 바꾸면 **고지와 방침이 같은 것을 다르게 부르게 된다.** 전부 통일하려면 개정 이력이 달린
법률 문서를 건드려야 하므로 용어 정리가 아니라 **문서 개정**이다.

### ⚠ 재제안 금지 2 — 게시 권한 조이기(`workflow_dispatch` 제거)

09-08 에 내가 안을 냈고 Simon 승인까지 받았는데 **집행 직전에 재보고 철회했다.** 게시는 이미
막혀 있다:

```
Production 환경 보호규칙 : required_reviewers, branch_policy   (승인자 Simon-YHKim)
```

**사람 승인 없이는 deploy job 이 시작조차 못 한다.** 트리거가 아니라 환경이 게이트고,
`workflow_dispatch` 입력 넷(SHA·설정해시·콘텐츠해시·확인문자열)은 **build 산출과 대조되는
계약**이다(deploy 직전 재검증). 태그 push 로 바꾸면 그 대조가 사라진다.

### 스토어 문안이 main 에 없다

`docs/store-copy/drafts.json`(5개 언어 · 8필드 · `status: "draft-not-submitted"`)은
**`docs/session-start-260906` 브랜치에만** 있다. main 에는 그 경로가 0건이고,
`git log --diff-filter=D` 로도 안 나온다 — 들어온 적이 없어서 지운 커밋도 없다.

그래서 **main 에 죽은 인용이 하나 있다** — `src/lib/site-meta.ts:9` 가 사이트 제목·설명의
출처를 그 경로로 적는다. **값은 맞다**(대조 확인). 틀린 건 출처 표시고, 그 브랜치가 정리되면
문안 자체가 사라진다.

### 콘솔 접근은 세션이 아니라 API 키다

"이 머신에 Play·ASC 로그인 세션을 마련한다"는 **하지 않는 게 맞다.** 디버깅 포트는 인증이 없어
프로젝트 규칙이 민감 계정 로그인을 금지하고, Play·ASC 가 정확히 그 계정이다.

대신 **ASC API 키**(.p8 + 키 ID + 발급자 ID)와 **Play 서비스 계정 JSON**. 권한을 좁게 주고,
사람 계정과 분리되고, 회수 가능하고, 만료로 조용히 죽지 않는다. 현재 배선:

```
eas.json  submit.production.ios   ascAppId · appleTeamId      있음
ASC API 키 · Play 서비스 계정 · android submit 블록            전부 0건
```

### 다음 1개

**Play Console 첫 등록** — 문안 5개 언어가 칸별로 준비돼 있고 막는 건 붙여넣는 동작뿐이다.
작업 카드에 칸 이름·상한·글자수·복사 버튼이 다 들어 있다.

### 미해결 질문

- 스토어 첫 등록을 지금 할지, API 자격증명부터 만들지
- `site-meta.ts` 죽은 인용 — 파일을 main 으로 가져올지, 주석이 브랜치를 가리키게 할지
- 지침 v8.1 §0 이 요구하는 `DECISIONS.md`·`STATE.md` 가 저장소에 없다.
  `docs/HANDOFF.md` 와 역할이 겹쳐서 **구조 결정**이 필요하다 — 임의로 만들지 않았다
- (이월) 기존 계정에 동의 문구 정정을 알릴지 — 정정은 새 가입자에게만 닿는다

### 재보니 달랐던 것 둘이 같은 실수다

`플랜/요금제`도 `store-copy` 도 **좁은 범위에서 본 것을 전체라고 말한 것**이다. 이번 주에 같은
형태를 여러 번 밟았다 — `head -5` 로 자른 목록에서 "호출부가 하나뿐", 런타임 DOM 하나로
"빈 title 은 결함이 아니다", 그리고 이 둘. **측정은 매번 맞았고 틀린 건 그 측정이 답하는 질문의
범위였다.** 규율: **수를 말할 때 무엇을 세었는지 같이 말한다.** "37곳"이 아니라 "locales 에서 37곳".


## 2026-09-13 / Owner B 문서·시스템 트랙 종료 — 이월 6건은 전부 조건이 밖에 있다

TTL-Work 워크트리를 닫는다. 이 트랙의 코드·문서 변경은 **PR 5건으로 전부 main 에 들어갔고**
미push 커밋 0, 남은 워크트리 0이다. 이 블록은 **머지된 것의 요약이 아니라, 아직 안 한 것이
왜 안 됐는지**를 남긴다 — 근거 파일이 gitignored `Output/` 에만 있어서 워크트리와 함께 사라진다.

### 들어간 것

| PR | 무엇 |
|---|---|
| #1704 | `LLM-ROUTING.md` §0 이 뒤집힌 OCR 핀·XPRIZE Phase 경계를 현행으로 주장하던 것 |
| #1724 | `ASSETS.md` 가 폐지된 대회 규정집으로 자기 존재를 설명하던 것 (SIL OFL 의무는 살아 있다) |
| #1736 | 붙여넣기용 프롬프트가 새 세션에 죽은 마감·"웰니스 앱" 프레이밍을 주입하던 것 외 4건 |
| #1740 | C10 이 관할 분기 주체를 반대로 적던 것 + 싣는 검사 문항의 사용권 격차 |
| #1751 | `CLAUDE.md` 의 벤더 실호출 주장을 운영 원장으로 재측정 + 워크트리 정션 지시 정정 |

R1(미검토 제품문서 **131건 전수**) · R2 가입연령 격차 · R3 문항 사용권 · R5 운영 속도 닫음.

### 이월 — 착수하려면 무엇이 먼저 풀려야 하나

| 항목 | 막는 조건 | 다음 사람이 알아야 할 것 |
|---|---|---|
| **R3 원문 수치 대조** | 페이월 | 배치 28건 위험 순위는 산출됐었다. 재생성 필요. ⚠ 로그인·페이월은 뚫지 않고 "인증 필요"로 보고 |
| **R4 SDK Auth 경쟁** | 보안 게이트 2종이 codex 고정 | codex 주간 창이 **토 19:47** 로 바뀌었다(기존 일 15:45 아님). 조회는 `orca account list` |
| **R5 모델 품질** | 평가셋 부재 | 속도·토큰은 쟀다(아래). 품질만 남았고 그건 골든셋이 있어야 한다 |
| **R2 나머지** | 법무 판단 | 방침 후보 · 법정 전체 제공 · 정책 시행 · 재동의 |
| `docs/GATE-RUNBOOK.md` 유보 | 콘솔 지식 | 2026-06-20 런북의 열린 게이트가 아직 열려 있는지 모른다 |
| `gemini.ts` 를 지목하는 문서 10건 | — | 전부 감사 스냅샷·핸드오프 로그라 **일부러 안 고쳤다**. 그 시점 기준으로 맞는 기록이고, 고치면 오히려 틀려진다. 살아 있는 안내로 승격되면 그때 `agent-briefing.test.ts` 목록에 더한다 |

`EXTERNAL-API-INTEGRATION.md` 의 `places-search` 엣지 함수는 **끝내 안 착지했다**(`oauth-naver`
는 실재). 그 작업지시서는 절반만 유효하다.

### 다시 발견하지 말 것 — 이 트랙이 닫은 판정

- **legacy `AccountLegacy` 의 삭제 시 초안 정리 구멍은 고칠 것이 없다.** `UI_MODE` 기본값이
  deep-space 이고(명시적 `"legacy"` 만 옵트아웃) 배포 설정 4곳이 전부 deep-space 로 핀돼 있다.
  **어떤 빌드에서도 렌더되지 않는다.** 롤백 전용 스킨의 구멍을 막으려고 의도적 바이트 동결을
  깨는 것은 사용자 이득 0에 위험만 산다.
- **`0188` 은 운영 적용 완료다**(`schema_migrations` 행 확인, 고아 객체 0건). 콘솔 대기 아님.
- **문서가 스스로 날짜를 밝히면 그 날짜가 배너다.** 그런 문서의 죽은 경로는 그 시점 기준으로
  맞는 기록이라 고치면 틀려진다. 131건 중 배너가 실제로 필요했던 것은 `system-checkup.html`
  하나뿐이었다(파일명·머리말 모두 날짜 없음).

### 운영 원장 실측 (2026-09-08, `ai_audit_log` 집계)

323행 · 2026-05-25~09-07. **벤더 이행은 계획이 아니라 이미 끝난 일이다.**

```
gemini   109회   07-10 .. 08-23   p50 2,678ms  p95 9,407ms
openai    34회   08-19 .. 09-07   p50 2,513ms  p95 4,408ms
claude     0회   (행 자체가 없다 - group by 에 안 나온다)
```

**개선은 중앙값이 아니라 꼬리에 있다** — p95 는 절반 이하인데 p50 은 거의 같다. 평균이나
p50 만 보면 "차이 없음"으로 읽힌다. 재현은 `ai_audit_log` 를 벤더별로 집계하면 된다(집계만,
행·id·해시는 읽지 말 것).

### 이 트랙이 남긴 도구 규율 셋

1. **무엇이 "안정적인 좌표"인가는 대상마다 다르다.** 텍스트 편집은 내용이 안정적이고 위치가
   움직인다(줄 번호로 지목하면 판본이 달라 어긋난다). **깨진 바이트는 반대다** — 패턴이 안
   무니 줄 인덱스가 유일한 손잡이다.
2. **탐침이 재는 자리가 바뀌면 답이 뒤집힌다.** 가드에 `existsSync(ROOT/../../.git)` 를 넣으면
   워크트리에선 참, CI 루트에선 거짓이다 — **로컬 초록으로 CI 를 깬다.** 파일시스템에 묻지 말고
   문서·소스가 무엇을 선언하는지를 읽으면 실행 위치와 무관해진다.
3. **잰 것과 주장한 범위를 구분한다.** 한 스위트 31/31 통과로 전 게이트를 주장했다가 전체
   verify 가 exit 1 로 반증했다(두 테스트가 `readFileSync` 로 `node_modules` 를 명시 경로로
   읽는데, **모듈 해석은 위로 걷지만 `readFileSync` 는 안 걷는다**). 방어법은 하나 —
   **세는 도구에 양성 대조를 붙인다.**


## 2026-09-08 / Fabric 화면 백지 결함 — 기전은 확정, 컴포넌트는 미확정

**결론부터: 고치지 못했다.** 어느 컴포넌트가 원인인지 못 짚었고, 짚지 못한 채 고치면
"고쳐졌다"를 증명할 수 없어서 PR 을 올리지 않았다. 아래는 다음 사람이 **같은 곳을 다시 파지
않도록** 남기는 기록이다.

### 증상

v0.8.0 preview 를 에뮬에서 돌리면 화면 전환 중 **간헐적으로**(3회 중 2회) 화면이 하얗게 비고
**자력 복구되지 않는다.** 강제 종료 후 재실행해야 산다. 난 자리는 온보딩 `Continue` 직후와
`Go to constellation` 직후. 3회차에는 안 났다.

### 기전 (확정 — logcat 마운트 덤프 실측)

```
SurfaceMountingManager: Unhandled SoftException
java.lang.IllegalStateException: addViewAt: cannot insert view [690] into parent [728]:
  View already has a parent: [730]
Caused by: The specified child already has a parent. You must call removeView()...
  at ReactClippingViewManager.addView
→ ReactHost.handleHostException → RN 호스트 파괴 → 화면 백지
```

실패한 배치의 순서:

```
REMOVE [690..724] -> [730]   자식 11개를 730 에서 뗀다 (@10 … @0)
CREATE [728] - layoutable:1 - RCTView
INSERT [728] -> [730] @0     새 래퍼를 730 에 넣고
INSERT [690] -> [728] @0     뗐던 자식들을 새 래퍼로 옮긴다   ← 여기서 터진다
```

즉 **자식 11개가 새로 생긴 래퍼 View 로 재부모된다.** detach 가 끝나기 전에 attach 가 돌았다.

덤프에서 트리를 재구성하면 **730 은 이 배치에서 부모가 없다 = surface:1 의 루트**이고,
728 의 자식이 정확히 11개다. `INSERT` 1,339 · `REMOVE` 94 인 큰 전환 배치다.

### 함정 둘 — 여기서 미끄러졌다

- **`ReactClippingViewManager` 는 `removeClippedSubviews` 의 증거가 아니다.** 그 클래스는
  평범한 `<View>` 매니저의 **상위 클래스**다. 클래스 이름을 기능으로 읽어서 한 번 헛짚었다.
- **`<Modal>` grep 이 `HomeCoachmarks.tsx` 를 물었다.** 실제로는 65행 주석의
  "not a RN `<Modal>`" 이었다. 이 저장소 주석발 거짓양성 다섯 번째다.

### 탈락시킨 후보 (다시 파지 말 것)

| 후보 | 왜 아닌가 |
|---|---|
| Reanimated layout 애니메이션 | `entering=`/`exiting=`/`layout=` **0건** (양성 대조 235파일로 확인) |
| 코치마크의 `<Modal>` | RN Modal 이 아니라 평범한 View. 게다가 **형제**로 붙지 자식을 감싸지 않는다 |
| `removeClippedSubviews` | 위 함정 참조. 명시 사용 7곳은 전부 전환 경로 밖 |
| `ConstellationHome` 의 `stage` 게이트 | `stage` 는 `NeuralFieldBackdrop` **하나를 더할** 뿐 자식을 감싸지 않는다 |
| 조건부 `<G>` 래퍼 | deep-space 에 없음. `<G key=…>` 셋은 전부 `.map()` 안이고 다른 화면 |
| `DeepSpaceScreen` variant 전환 | `variant`/`header` 는 **정적 prop**(기본값 `fullbleed`/`companion`)이라 마운트 중 안 바뀐다 |
| `IntroGate` | 분기가 전부 `<>{children}</>` 또는 다른 화면으로 **교체**다. Fragment→View 교체는 자식을 언마운트하므로 태그가 보존되지 않는데, 덤프는 **같은 태그**가 옮겨진다 |

마지막 줄이 이 조사의 미해결 지점이다 — **평범한 래퍼 삽입은 태그를 보존하지 않는데
덤프는 보존한다.** 그래서 "조건부로 View 하나 끼우는 곳"을 찾는 방식으로는 안 잡힌다.

### 다음 수

1. **dev 빌드로 재현**해서 컴포넌트 이름을 얻는다. 릴리스 빌드는 `RCTView` 이상을 안 준다.
   uiautomator 는 RN 뷰를 5단계에서 접어버려 못 쓴다(실측).
2. **실기기 재현 여부**를 먼저 가른다. 에뮬은 arm64 를 번역해 돌려 매우 느리고
   (프레임 42~61장 스킵, 시스템 UI 가 자체 ANR 경고), 느림이 경합을 드러냈을 수 있다.
   다만 오류 자체는 속도가 아니라 **마운트 순서** 문제라 실기기에서는 확률만 낮을 수 있다.
3. 스택: RN `0.85.3` · React `19.2.3` · expo `~56.0.13` · react-native-screens `4.25.2`.
   상류 이슈 대조는 안 했다.

에뮬에서 돌리는 법은 이 문서 09-08 상단 절에 있다.

### 이 조사에서 쓴 도구와 그 한계 (다시 시도하기 전에 읽을 것)

| 시도한 것 | 결과 |
|---|---|
| logcat 마운트 덤프 | **유효.** 실패 배치의 mount item 순서를 그대로 준다 — 기전은 여기서 나왔다 |
| 덤프로 뷰 트리 재구성 | 부분적. 730 이 이 배치에서 부모가 없어 surface 루트임은 알았으나 그 위로 못 간다 |
| `uiautomator dump` | **무효.** RN 뷰를 5단계에서 접는다(FrameLayout/LinearLayout 만 나온다) |
| 캐논 JSON (`data/screens/*.json` 21개) | **무효.** 뷰 트리가 아니라 데이터 스펙이다(`domains`·`inputTemplates`·`moods`…) |
| 소스에서 "조건부 래퍼" 찾기 | **무효.** 평범한 래퍼 삽입은 태그를 보존하지 않는데 덤프는 보존한다 — 찾는 모양 자체가 틀렸다 |

⚠ `uiautomator` 와 캐논 둘 다 **"해봤더니 안 되더라"** 를 남긴다. 재시도 비용이 각각 1분이라
안 적어두면 다음 사람이 반드시 다시 한다.

