# 2nd-Brain Handoff — 2026-08 (4/4)

> 덮는 기간: **2026-08-25 ~ 2026-08-30** · 블록 11개
> 기간 보관본. `docs/HANDOFF.md` 가 100KB 상한을 넘어 **기간으로 쪼갠 것**이고,
> 블록은 원문 그대로다(요약·재작성 없음, Simon 지침 §0-1).
> 최신이 위. 활성 창은 [../HANDOFF.md](../HANDOFF.md).
> 이 달의 더 오래된 블록: `HANDOFF-2026-08-p3.md`

## 2026-08-30 / 다른 PC에서도 같은 에셋·계보·검증으로 재개 가능

> 발행: Codex portable handoff 보강 세션. 작성 시각 `2026-08-30 22:11:36 KST`.
> 로컬 절대경로가 아니라 Git commit과 검증된 바이트를 동일성 기준으로 삼는다.

### 어디까지 왔나

- 작업 기준 `origin/main`: `e7c94f938356b955d693f4132cb62683b8775b41`
  (`docs: handoff P1 and release gates (#1503)`).
- canonical checkout `C:\2ndB`의 dirty `verify-adjustment-unknown`과 기존 worktree는 건드리지 않았다.
  최신 main에서 `.worktrees/codex/portable-handoff-20260830-2156`,
  `codex/portable-handoff-20260830-2156`를 새로 만들었다.
- 새 portable 계약:
  - `docs/handoff/PORTABLE-ASSET-LINEAGE-2026-08-30.md`
  - `docs/handoff/portable-handoff-report-260830.html`
  - `scripts/verify-portable-handoff.mjs`
  - `scripts/__tests__/portable-handoff-assets.test.ts`
- 새 바이너리를 복사해 넣지 않았다. 필요한 P1/HustleK 정본은 이미 일반 Git object로 추적되고
  있으며 Git LFS, Downloads, `.codex/visualizations`, ignored `Output/`에 의존하지 않는다.
- verifier RED→GREEN 확인:
  - Git index의 필수 파일 추적 여부
  - 승인 HustleK v1/v2/strip 해시
  - captures 93개와 structure 93개의 exact stem set·Git-blob tree hash·390×820 기하
  - checkout dirty·symlink/path escape
  - 금지 계보 에셋 반입 부재
  - ignored `Output/**`가 추적되지 않고 대표 재생성 경로가 계속 ignore되는지
- Windows `core.autocrlf=true`와 Linux checkout이 같게 판정되도록 text working-tree bytes가 아니라
  **Git index blob bytes**를 해시한다.
- 로컬 검증:
  - `node scripts/verify-portable-handoff.mjs` → `PASS`
  - targeted Jest 6/6 → PASS
  - `npm run verify` 종료코드 0 → **555 suites / 5,962 tests PASS**, Work0 70/70
  - 알려진 기존 lint warning과 Jest worker teardown warning만 있었고 실패는 0이다.

### 에셋·계보 portable 계약

| 범위 | 정본 | 동일성 기준 |
|---|---|---|
| HustleK v1 atlas | `design/hustlek-opening-v1/hustlek-opening-atlas.png` | SHA-256 `2780df89…13be` |
| HustleK v1 review | `design/hustlek-opening-v1/hustlek-opening-preview.gif` | SHA-256 `0bb0053c…b89f` |
| 앱용 v2 atlas | `assets/deepspace/hustlek-opening-v2.json` | SHA-256 `b599f379…964f` |
| 앱용 opening strip | `assets/opening/hustlek-opening-strip.png` | SHA-256 `4753a818…56bc5` |
| P1 captures | `design/pixel_clay_260825/captures/` | 93 PNG · exact Git-blob tree hash |
| P1 structure | `design/pixel_clay_260825/data/structure/` | 93 JSON · exact Git-blob tree hash |
| 전체 계보·재생성 계약 | `docs/handoff/PORTABLE-ASSET-LINEAGE-2026-08-30.md` | verifier schema 1 |

- 최초 `2ndBcodexhandoff260827.zip`은 SHA-256 `41cc0468…4821`, entry 222,
  경로 탈출 0, captures/structure 93/93으로 검증됐다. Git과 대조해 211개는 byte-identical,
  10개는 Git에서 이후 발전, `README-FIRST.md`만 비추적이었다.
- ZIP과 독립 Markdown 3개는 history/reference이며 다른 PC에 복사할 필요가 없다.
  Git 정본에 다시 병합하거나 덮어쓰지 않는다.
- 과거 `hustlek-session-master-archive-20260827`도 read-only 계보 참고일 뿐 필수 입력이나
  생산 경로가 아니다. archive가 없어도 위 tracked atlas·계약·합성기로 같은 결과를 만든다.
- `legacy-pixy`, `rejected-associated`, diagnostic 에셋, 삭제된
  `farm-character-32-native.png`, `.pix`, `pixy.spec.json`을 복원·반입하지 않는다.

### 다른 PC에서 실제 재생성한 계약

```bash
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening.py
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening-v2.py --check
uv run --with Pillow==12.2.0 scripts/build-opening-strip.py --out Output/portable-handoff/hustlek-opening-strip.png
node scripts/verify-portable-handoff.mjs --generated
```

- v1: 165 frames / 13,200ms / `validation.status = PASS` /
  decoded frame stream `be712f38…ff33`
- v2: source PNG·decoded RGBA·output JSON·12+6+1 셀·silhouette·floor anchor 전부 PASS
- strip: 48 frames / 320×180 cell / 8×6 / 3,840ms; 생성 PNG가 tracked strip과
  SHA-256 `4753a818…56bc5`로 byte-exact

### portable 경계

1. **tracked canonical**은 clone으로 받으며 verifier PASS가 기준이다.
2. `Output/hustlek-opening/**`, v2 validation·preview 등은 ignored 재생성물이다.
3. 기존 HUMAN review HTML, Home/Star live 캡처, diagnostic APK는 same-host evidence다.
   다른 PC에서는 현재 main·실제 환경으로 다시 캡처한다. 파일 복사로 HUMAN PASS를 대신하지 않는다.
4. GitHub Actions artifact는 보조 근거이며 만료될 수 있다. exact-final-main APK/AAB/IPA는
   최종 main에서 새로 만든다.
5. `.env`, GitHub/EAS 인증, signing credentials는 Git에 넣지 않는다. 새 PC에서 안전한
   secret store와 기존 계정으로 다시 연결한다.
6. exact-current APK/AAB/IPA는 없다. 만료 전 진단 APK는
   [Actions run 33297727914](https://github.com/Simon-YHKim/2nd-B/actions/runs/33297727914)에서
   `gh run download`할 수 있지만 exact-final-main 산출물은 아니다. 공개 Release IPA는 0개다.

### 남아 있는 작업

- 아래 17:18 KST Latest 블록의 제품 상태와 HUMAN/비용/릴리스 게이트는 그대로 유효하다.
- [#1500 Home](https://github.com/Simon-YHKim/2nd-B/pull/1500)과
  [#1502 Star](https://github.com/Simon-YHKim/2nd-B/pull/1502)는 여전히 사용자 HUMAN PASS 전에는
  ready/merge하지 않는다. 새 PC에서는 `gh pr checks 1500`과 `gh pr checks 1502`부터 읽는다.
- 실제 LLM 검증, EAS build, production OTA는 명시된 비용 상한·외부 변경 승인을 먼저 받는다.
- P1 전체 80개 `port:true` 화면을 한 화면씩 98+ + HUMAN PASS로 닫는 작업은 계속 남아 있다.

### 핵심 파일 위치

```text
docs/HANDOFF.md                                        최신 작업·게이트·재개 순서
docs/handoff/PORTABLE-ASSET-LINEAGE-2026-08-30.md     cross-PC asset/history 정본
docs/handoff/portable-handoff-report-260830.html       한·영/쉬운·전문 완료 보고
scripts/verify-portable-handoff.mjs                   dependency-free fail-closed verifier
scripts/__tests__/portable-handoff-assets.test.ts     PASS·empty-clone failure 계약
docs/HUSTLEK-OPENING.md                               opening 의미·타임라인·해시 계약
docs/ASSETS.md                                        앱 에셋 registry·권리·계보
design/pixel_clay_260825/data/screens.json            P1 93화면 유일 목록
```

### 다음 PC에서 시작하는 법

Git과 Node.js가 필요하며 이 verifier는 Node.js `v22.22.3`에서 검증했다. 일반 public clone과
raw 문서에는 로그인이 필요 없고, Actions/Release 다운로드는 `gh auth status`와 read 권한이
필요하다. `uv` 재생성은 Pillow를 받을 네트워크 또는 사전 cache가 필요하다.

```bash
git clone https://github.com/Simon-YHKim/2nd-B.git
cd 2nd-B
git fetch origin main
git switch main
git pull --ff-only origin main
node scripts/verify-portable-handoff.mjs
cat docs/HANDOFF.md
```

full history가 필요한데 shallow clone이라면 먼저:

```bash
git fetch --unshallow --tags origin
```

검증·변경 준비:

```bash
npm ci --legacy-peer-deps
npm run verify
NAME=portable-next-260830
mkdir -p .worktrees/codex
git worktree add ".worktrees/codex/$NAME" -b "codex/$NAME" origin/main
ln -s "$(pwd)/node_modules" ".worktrees/codex/$NAME/node_modules"
```

Windows PowerShell에서는 마지막 symlink 대신 다음 junction을 사용한다.

```powershell
$HandoffName = 'portable-next-260830'
New-Item -ItemType Directory -Force -Path '.worktrees/codex' | Out-Null
git worktree add ".worktrees/codex/$HandoffName" -b "codex/$HandoffName" origin/main
New-Item -ItemType Junction -Path ".worktrees/codex/$HandoffName/node_modules" `
  -Target (Resolve-Path './node_modules')
```

같은 branch/path가 있으면 삭제·재사용하지 말고 이름을 바꾼다. EAS local build만 fingerprint
제약 때문에 junction 예외로 별도 install 또는 remote workflow를 사용한다.

`node scripts/verify-portable-handoff.mjs`가 `FAIL`이면 expected hash를 고치지 말고
manifest의 실패 절차에 따라 현재 commit·diff·file history부터 확인한다.

---


## 2026-08-30 / P2·P3·Work0·릴리스 계약 정리, HUMAN PASS와 전체 P1·최종 배포 대기

> 발행: Codex 2nd-B 장기 인계 세션. 작성 시각 `2026-08-30 17:18:50 KST`.
> 이 블록은 현재 저장소·GitHub·EAS 실측을 요약한다. 완료되지 않은 항목을 완료로 해석하지 말 것.

### 어디까지 왔나

- `origin/main` HEAD: `4a54d76ff458391735d38f674c16bcb1ec047625`
  (`ci: verify IPA and OTA release contracts (#1501)`).
- canonical checkout `C:\2ndB`는 `verify-adjustment-unknown`, `origin/main`보다 291 behind / 1 ahead,
  미추적 10개다. **checkout/reset/clean/stash/delete하지 말 것.** 작업은 최신 `origin/main`에서
  `.worktrees/codex/*` 새 worktree를 사용한다.
- `.worktrees/codex/p1-star-screen-final2-20260829`도 4개 파일
  (`deviations.json`, `nav.json`, `score-baseline.json`, `tokens.json`)이 dirty다.
  계보 자료이므로 **수정·삭제·재사용하지 말 것.**
- 이번 장기 인계 흐름에서 확인된 주요 머지:
  - #1458 `feat(opening): 승인 HustleK를 4초 정수 프레임으로 재생`
  - #1464 `fix(p1): attest Work 0 capture handoff`
  - #1465 `fix(ci): harden release artifact provenance`
  - #1467 `fix(p1): harden Work 0 live scoring proof`
  - #1479 `feat(llm): failover leaves Gemini, and the diagnostic APK can finally install over build 35`
  - #1480 `fix(ui): verify scroll compositor text`
  - #1481 `fix(release): harden AAB archive verification`
  - #1482·#1484·#1486·#1488 persona/IDEN/review read·ratification 안전 계약
  - #1487 interview scaffold·crisis routing 안전 계약
  - #1490~#1493 Stage 1 chat/core-brain 기준선과 내비게이션 계약
  - #1494 LLM residue/ledger 검증
  - #1495~#1497 Work0 notice/font/baseline 보강
  - #1498 x86_64 Android 진단 빌드
  - #1499 canonical seven-stars Polaris summary
  - #1501 IPA·OTA 릴리스 계약 검증
- `P2` 원본 진단 완료: 결정적 합성기 165프레임, 종료코드 0,
  `validation.json.status = PASS`; 1×/nearest-neighbor 4× 및 F55–80·경계 프레임을 검토했다.
  추적 대상 원본·atlas·타임라인은 P2에서 수정하지 않았다.
- `P3` 완료·머지(#1458): 사용자 결정 **(a) 허슬케이 전신**을 앱용 v2 atlas로 구현했고,
  v1 atlas/hash를 보존했다. 96×96 정수 격자, 보행 12셀 + 회전·접안 6셀,
  보간 없는 정수 프레임 전환, 최대 4초 구조를 유지했으며 Android 실제 모션까지 확인했다.
- `P1 Work0` 하네스는 fail-closed route/effect·실제 DOM·A/B/C/D/E 근거를 갖췄다.
  `screens.json` 실측은 93개 중 `port:true` 80, `port:false` 7, 기타 6이다.
  `score-baseline.json`은 64행 중 36행만 98점 이상, 28행은 98점 미만이다.
  즉 **전체 P1 이주는 아직 완료가 아니다**; 측정되지 않은 `port:true` 화면도 남아 있다.
- Stage 1 8화면 중 main 기준 5개는 98점 이상이다:
  `chat 98.8`, `me 98.8`, `interview 99.3`, `me-star 98.6`, `trend 99.0`.
  main 기준 `home 91.0`, `star 90.8`, `review 93.5`이나 Home/Star 개선 PR은 아래처럼 열려 있다.
- 릴리스 hardening #1501은 main에 머지됐지만, **exact-main `.aab`·`.ipa`·production OTA는 아직 없다.**

### 열려 있는 HUMAN 게이트

| PR | 상태 | 자동 근거 | 사람 검토 |
|---|---|---|---|
| [#1500 Home](https://github.com/Simon-YHKim/2nd-B/pull/1500) | Draft · OPEN · MERGEABLE · head `fabc4c7f` | 모든 5 checks SUCCESS · 공식 score `98.0` | `reviewedPass:false`; **`홈 PASS` 필요** |
| [#1502 Star](https://github.com/Simon-YHKim/2nd-B/pull/1502) | Draft · OPEN · MERGEABLE · head `7364e8b6` | 모든 5 checks SUCCESS · 공식 score `99.1` · 7 exact routes + post-effect 1 | `reviewedPass:false`; **`별 PASS` 필요** |

- 사용자 승인 전에는 두 PR을 ready/merge하지 않는다. PASS를 꾸며내지 않는다.
- 로컬 승인 도구(ignored, **same-host only**): `C:\2ndB\Output\human-review-home-star-20260830.html`
  - SHA-256 `1DA74B293A76947606C2B6F7EFA061196937AB3DBA497465AB6274AF00573FC3`
  - PNG 2개 내장, 외부 요청 0, secret-like 패턴 0, 렌더 오류 0.
- Home 캡처(ignored, same-host only):
  `.worktrees/codex/p1-home-token-closure-20260830/Output/home-live-captures-55d934451c16417582c047f81334258c/home.png`
- Star 캡처(ignored, same-host only):
  `.worktrees/codex/p1-star-contract-20260830/Output/work0-live-captures-a4962ad0352042eb95f2785dbdd666c0/star.png`
- `review`의 93.5점은 `학창시절`·`지금` 두 unsafe action을 실제 계정에서 검증해야 닫힌다.
  최대 4회의 실제 `self_model_propose` 호출이 필요할 수 있으므로 **명시적 USD 상한 승인 전 호출 금지**.

재개에 필요한 권장 사용자 응답:

```text
홈 PASS / 별 PASS / LLM 최대 USD 1 승인 / iOS 무료 production build 승인 / Android 9월 1일 이후 무료 preview APK + production AAB 2건 승인 / 최종 production OTA 승인
```

### 현재 검증·릴리스 상태

- exact-main GitHub runs:
  - CI `33297727973` — SUCCESS
  - EAS Update `33297727924` — gate/report SUCCESS, `update` job SKIPPED; OTA 미게시
  - Web preview `33297727987` — SUCCESS / GitHub Pages
  - Android Diagnostic Build `33297727914` — SUCCESS
- exact-main APK(ignored):
  `Output/exact-main-4a54d76-android-run-33297727914/extracted/2ndb-4a54d76.apk`
  - ZIP/APK CRC PASS, 경로 탈출 없음, 서명 검증 PASS
  - package `com.simonk.secondbrain`, version `0.7.0`, versionCode `40`
  - target/compileSdk 36, arm64-v8a only
  - 이것은 진단 APK이며 Play용 `.aab`를 대신하지 않는다.
- EAS Free 실측(2026-08-30):
  - Android 15/15 소진; `2026-09-01 09:00 KST` 무료 주기 갱신
  - iOS 0/15 사용; 알려진 과금 0
  - OTA updater 9/1000, bandwidth 436 MiB/100 GiB
  - 최종 GitHub Release에는 exact-final-main EAS **preview APK와 production AAB 두 Android 빌드**가
    모두 필요하다. 현재 진단 APK로 대체할 수 없다.
  - iOS production은 과거 remote-signing 성공 이력이 있지만 현재 인증서 만료일 자체는 재검증하지 않았다.
- 환경값은 저장소 규칙대로 `.env`/EAS·GitHub secrets에 둔다. QA 계정은 `.env.test`를 재사용한다.
  민감값·계정 식별자·서명 지문을 HANDOFF, 로그, PR body에 복사하지 않는다.

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 사용자에게 Home/Star HUMAN PASS와 LLM USD 상한·빌드 시점·OTA 승인을 받는다 | small | ⭐ 이 입력 없이는 병합·유료 검증 금지 |
| B | 승인 후 #1500 → #1502를 한 번에 하나씩 ready/merge하고 main CI를 확인한다 | medium | 각 PR 상태·head SHA를 다시 읽은 뒤 수행 |
| C | 별도 1-file PR로 Home/Star `score-baseline.json` 최신 근거를 반영한다 | small | PR당 최대 5파일 규칙과 화면 분리 유지 |
| D | 별도 Review worktree에서 실제 환경·USD 상한 안에서 최대 4회 검증, 98+와 HUMAN PASS까지 닫는다 | medium | `capture-app.mjs --print-env`; mock/404/로그인 월 금지 |
| E | P1 전체 범위를 계속한다: `port:true` 80개를 현재 데이터에서 산출하고 한 화면씩 98+ + HUMAN PASS | large | 동일 화면 3회 무개선이면 구조/harness 문제를 보고하고 중단 |
| F | 모든 요청 변경이 main에 들어간 뒤 exact-final-main CI → EAS preview `.apk` → production `.aab` → iOS `.ipa` → production OTA → GitHub Release | large | Android는 9/1 09:00 KST 이후 무료 2건이 기본; 즉시 유료는 별도 승인 |
| G | 요구사항별 완료 감사와 KO/EN easy/expert 자체완결 HTML 완료 보고서 | medium | 모든 artifact·hash·run·release URL을 실제 상태로 대조 |

### 적용 중인 정책 (영구)

1. 정본 우선순위: 현재 `AGENTS.md`의 포인터 → **`CLAUDE.md` 최신 결정 절** →
   `docs/PRD.md` Draft v4 → `docs/CONCEPT.md`·`docs/CONSTRAINTS.md`·`DESIGN.md` → design bundle.
   `docs/CONSTELLATION-DESIGN.md`는 2026-08-24 별 개편 이전 **역사 문서**다.
2. canonical home의 visible 일곱 별(A)은 **프로필·영유아기·학창시절·20대·30대 이후·직장·지금**이다.
   hidden validation constructs(B)와 Polaris(C)를 구분한다. 생활 도메인 여섯
   (커리어·재정·성장·관계·건강·휴식)은 세컨비 대시보드이며 home stars가 아니다.
   deprecated 7-lens/Soul Core/legacy village 모델로 되돌리지 않는다.
3. P3 주인공은 확정된 **(a) 허슬케이 전신**이다. SecondB 머리 추천이나 (b)/(c)를 다시 묻지 않는다.
4. P1 UI/UX와 P3 opening은 별도 worktree·branch·PR. 한 세션 최대 추적 파일 5개,
   한 화면씩 진행하고 worktree는 `.worktrees/` 안에만 둔다.
5. `C:\2ndB`의 dirty checkout을 checkout/reset/clean/stash/delete하지 않는다.
   새 작업은 최신 `origin/main`의 `codex/` branch에서 시작한다.
6. `node_modules`는 `C:\2ndB\node_modules`를 worktree에 junction/symlink로 공유하고 worktree마다 `npm ci`하지 않는다.
7. main 직접 push, `git add -A`, force push, hard reset, destructive delete 금지.
8. Pixy, Pixy CLI, `.pix`, `pixy.spec.json`, gstack 사용 금지. `C:\2ndB\.codex\hooks\session-start.sh`도 실행하지 않는다.
9. HUMAN visual PASS를 자동 점수로 대체하지 않는다. intentional deviation은 비어 있지 않은 `why`와 함께 기록한다.
10. 실제 DOM으로 위반을 센다. 새 guard는 의도적 red → 원복 → green으로 검증한다.
11. LLM·EAS 등 비용 가능 호출은 구체적 USD 상한을 받은 뒤에만 실행한다. 시크릿을 출력·요청·하드코딩하지 않는다.
12. `npm run verify`는 pipe 없이 종료코드 0을 확인하고, `npm run check:constraints`·관련 해시·Android 콜드 스타트를 함께 본다.
13. Android 구조/UI/lifecycle/data 변경 전 `ANDROID_QA_GUIDELINES.md`를 읽는다. owner 0 사용자·AVD를 wipe/uninstall/delete하지 않는다.
14. PIXEL-CLAY: 정수 좌표, radius 0, blur/AA/보간 금지, 4방향 bevel, deep-space accent/token만 사용한다.

### 핵심 파일 위치

```text
docs/HANDOFF.md                                      이 세션 정본 인계
AGENTS.md                                            프로젝트·Git·안전 규칙
CLAUDE.md                                            최신 결정 정본(AGENTS가 가리키는 우선 문서)
docs/PRD.md                                          canonical product model
docs/CONCEPT.md                                      canonical vs legacy
docs/CONSTELLATION-DESIGN.md                         2026-08-24 이전 역사 기록(정본 아님)
docs/CONSTRAINTS.md                                  C1~C12 hard constraints
DESIGN.md                                            시각 규율
ANDROID_QA_GUIDELINES.md                             Android 구조·UI·lifecycle 안전
design/pixel_clay_260825/data/screens.json           93화면/port/stage 정본
design/pixel_clay_260825/data/score-baseline.json    현재 64행 점수 기준선
design/pixel_clay_260825/tools/score.mjs             A/B/C/D/E fail-closed 채점기
design/pixel_clay_260825/tools/capture-app.mjs       실제 EXPO_PUBLIC_* 전달·마스킹
design/pixel_clay_260825/data/nav.json                route/effect 계약
design/pixel_clay_260825/data/deviations.json         intentional deviations
docs/HUSTLEK-OPENING.md                              P2/P3 opening 계약
scripts/build-hustlek-opening.py                     v1 결정적 합성기
scripts/build-hustlek-opening-v2.py                  v2 결정적 합성기
src/components/ui/LoadingScreen.tsx                  앱 opening 재생
docs/ASSETS.md                                       asset registry
docs/RELEASE-PROCESS.md                              release 절차
docs/ANDROID-BUILD.md                                APK/AAB·서명 계약
```

### 검증

```bash
# 항상 최신 main과 dirty 상태를 먼저 읽기 전용 확인
git fetch origin main
git rev-parse --show-toplevel
git branch --show-current
git status --short
git remote -v
git worktree list

# 변경 PR마다(출력 pipe 금지)
npm run verify
npm run check:constraints
git diff --check
git status --short

# Opening을 건드린 경우
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening.py
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening-v2.py
# 각 Output/.../validation.json status가 PASS인지 확인

# Work0 실제 캡처는 반드시 환경 마스킹 helper부터
node design/pixel_clay_260825/tools/capture-app.mjs --print-env
# 출력된 실제 EXPO_PUBLIC_* 환경을 전달한 뒤 score.mjs 실행
```

### 다음 세션 시작하는 법

```bash
# 현재 same-host dirty checkout에서 안전하게 최신 인계만 읽기
git fetch origin main && git show origin/main:docs/HANDOFF.md

# fresh clone 또는 이미 clean main checkout인 경우에만
git fetch origin main && git pull --ff-only origin main && cat docs/HANDOFF.md

# 위 Latest 블록의 A부터 시작한다.
# HUMAN PASS·USD 상한이 아직 없으면 #1500/#1502 merge, real LLM, 유료 Android build를 실행하지 않는다.
```

---


## 2026-08-29 / 0.7.0 나갔다 — 웹에만. 폰을 막는 문은 **둘**이고 하나는 새로 생겼다

> 발행: CLI 코딩 세션. 브랜치 `Simon-YHKim/p1-deviations`(머지 완료) → `release/0.7.0`(머지 완료).
> 보고서: [자가 두 번 틀렸다](https://claude.ai/code/artifact/feffd35e-c652-44cc-b0f8-a9a7fb50dafa) ·
> [EAS 키스토어 이관](https://claude.ai/code/artifact/0123cd40-729a-417a-b9d9-8f23e7206c2e)

### ⚠ 새 세션이 먼저 할 일 — 여전히 **작업이 아니라 결정**이다

앞 블록(2026-08-28)의 Simon 지시가 **아직 유효하다**: *"작업을 먼저 하기보다 … 결정 내릴수
있게 해줘. 각각이 의미하는게 무엇인지, 왜 해야하는지, 하면 어떤게 바뀌는지."*

**결정 넷은 그대로 대기 중이고**(시드 · B축 램프 양자화 · `/capture` 양식·날짜 · 대화 이력)
그 설명 재료는 아래 §2026-08-28 블록에 있다. **여기에 다섯째가 붙었다** — 안드로이드 서명키.

---

### 어디까지 왔나

- `origin/main` = `0cef9fff` · **`app.json` version = `0.7.0`**
- 이번 세션 머지: **#1456**(P1 배치 36커밋) · **#1461** · **#1462** · **#1470** · **#1471**(0.7.0 릴리스)
- `npm run verify` **종료코드 0** · 547 스위트 **5790 테스트** 통과
- `npm run notice:release` → `classified minor` → **SILENT** (팝업 없음, R5 완료)

| 지표 | 전 | 후 |
|---|---|---|
| P1 98점 이상 | 6 / 64 | **37 / 64** |
| A축(픽셀 규율) 만점 | 48 / 64 | **64 / 64** |
| 픽셀 래칫(규칙 2·3·4·5) | 333 | **165** |
| 규칙 1(곡선) | 0 | **0** (무관용 유지) |

래칫 165 구성(검사기 집계): 규칙 4 **114**(기계적 60 · 상태색 33 · 그림 16 · SVG 5) ·
규칙 3 **39** · 규칙 5 7 · 규칙 2 3 · PRD § 2.

---

### 0.7.0 은 **웹에만 나갔다** — 폰을 막는 문이 둘이다

`web-deploy.yml` 성공 → <https://simon-yhkim.github.io/2nd-B/> 에 0.7.0 이 올라가 있다.
**설치된 폰(build 35, 0.6.0)에는 안 갔다.** 이유가 둘이고 **둘 다 따로 풀어야 한다.**

#### 문 ① EAS 무료 플랜 할당량 소진 — 2026-09-01 초기화

`eas-preview-build.yml`(run 33122536870) 이 이것 때문에 실패했다. 코드 문제가 아니다:

```
This account has used its Android builds from the Free plan this month,
which will reset in 4 days (on Tue Sep 01 2026)
```

⚠ 실패 전에 `versionCode` 가 원격에서 **35 → 36 으로 이미 올라갔다**(version source remote).
다음 성공 빌드는 37 이다. 릴리스 노트에서 36 을 찾지 말 것.

#### 문 ② ~~새로 생겼다 — 서명 지문 시크릿 두 개가 없다~~ → **닫혔다** (2026-08-29 등록 · preflight PASS)

> **2026-08-31 갱신 (콘솔 위임분, CLI 집행):** 아래 표는 08-29 오전 실측이었고 **같은 날 11:11 KST
> (`2026-08-29T02:11Z`) 에 두 시크릿이 등록**됐다 — 콘솔이 자기 손이라고 회신했다(TO-CLI 08-30 22:52).
> 값은 EAS 업로드 키스토어 SHA-256 `0fb37bc0…ce570`(공개 지문). APK·AAB 가 같은 키라는 것은 EAS Build
> Credentials 가 Default 하나뿐이라는 콘솔 확인에서 **추정**한 것이고 AAB 자체는 측정하지 않았다 —
> preflight 가 그 동일성을 단언한다. **`android-signer-preflight.yml` 첫 실행(run 33234958667, 08-29
> 13:55 KST = `04:55Z`) 이 `match / match / PASS`** 로 실제 릴리스 APK 서명과 대조해 검증했다(#1485). 남은 조건은
> **9/1 EAS 할당량**뿐이다. 두 지문의 측정값은 `docs/ANDROID-BUILD.md` "Signer identities" 에 있다.
> (⚠ 이 갱신의 첫 판은 UTC `02:11` 을 KST 로 잘못 적었다 — 검토가 잡아 정정.)

| 시크릿 | 상태 (08-29 11:11 KST 이후) |
|---|---|
| `ANDROID_APK_SIGNER_SHA256` | **등록됨 · preflight match** |
| `ANDROID_AAB_SIGNER_SHA256` | **등록됨 · preflight match** |

(원문 보존 — 역사 기록) **#1472** 가 `github-release.yml` 에 서명 지문 게이트를 붙였는데 그 시점엔
시크릿이 없었고, `verifyReleaseSigners` 는 **fail-closed** 라 `apk-expected-digest-invalid` 로 거부했다.
`github-release.yml` 은 #1472 이후 한 번도 안 돌았다(마지막 성공 8/26~27). 게이트 자체의 첫 실행은
9/1 릴리스가 하지만, 시크릿 값이 맞는지는 preflight 가 이미 답했다.
같은 키스토어면 APK 와 AAB 지문이 같다. 콜론 있는 형식과 64자 소문자 둘 다 받는다.

#### OTA 로는 못 간다 — 지문이 두 번 움직였다

커밋마다 `@expo/fingerprint` 를 다시 떠서 짚었다:

| 커밋 | 지문 | |
|---|---|---|
| `8ff452ec` #1455 | `0bccbba5…` | 기준 |
| `99a6881a` #1458 · `7f7a622b` #1459 | `0bccbba5…` | 안 움직였다 |
| **`2c9d3941` #1460** | **`b2cbfc87…`** | `.easignore` **한 파일**. 여기서 build 35 가 좌초 |
| **`9afcc482` #1456** | **`fbd41747…`** | `package.json` **스크립트 한 줄** |

⚠ **`package.json` 의 `scripts` 한 줄도 지문을 움직인다** — `@expo/fingerprint` 는
그 파일을 통째로 해시한다. "의존성을 안 건드렸으니 OTA 로 간다"는 **틀린 추론**이다.
⚠ #1456 을 되돌려도 소용없다 — #1460 이 이미 좌초시킨 뒤였다.

---

### 결정 다섯 — Simon 이 정해야 움직인다

앞 블록의 **넷**(시드 · B축 램프 양자화 · `/capture` 양식·날짜 · 대화 이력)은
설명 재료와 함께 아래 §2026-08-28 에 그대로 있다. **다섯째가 새로 붙었다:**

#### E. 안드로이드 서명키를 하나로 합칠 것인가

**① 무엇인지.** GitHub 의 `android-release.yml` 은 `expo prebuild → 로컬 gradle` 로
**EAS 할당량 없이** APK 를 만든다. main push 마다 이미 돌고 초록이다. 그런데
`docs/ANDROID-BUILD.md:74` 가 적은 대로 **"a stable, separate keystore"** — EAS 와 다른 키다.
그래서 그 APK 는 build 35 **위에 덮이지 않고**, 기존 앱을 지워야 설치된다.

**② 왜 정해야 하나.** EAS 할당량이 매달 바닥나는 한, 폰 QA 가 매번 이 문에 걸린다.

**③ 정하면 무엇이 바뀌나.** 두 길이다:
- **(가) 그냥 지우고 설치한다** — 오늘 바로 되고 **위험 0**. 기기에 남은 상태(온보딩
  플래그·임시 저장)만 날아가고 계정 데이터는 서버라 안전하다.
- **(나) EAS 키스토어를 GitHub 시크릿 넷에 옮긴다** — 앞으로 계속 덮어 설치되고
  EAS 할당량과 영영 무관해진다. 절차는 [키스토어 이관 프롬프트](https://claude.ai/code/artifact/0123cd40-729a-417a-b9d9-8f23e7206c2e) 에 복붙용으로 있다.

**④ 위험.** (나)는 **릴리스 서명키를 진단 워크플로가 쓰는 시크릿에 두는 일**이다. 저장소에
write 권한이 있는 누구나 이 앱으로 서명할 수 있게 된다. 지금은 혼자 쓰니 실질 위험이 낮지만
**Play 등록 뒤에는 달라진다** — Play 앱 서명을 켜면 교체 가능한 업로드 키지만, 안 켜면
유출 시 교체가 불가능하다. **스토어 전에 정하는 편이 낫다.**

⚠ **어느 쪽을 골라도 문 ②(서명 지문 시크릿)는 채워야 한다.** 그건 공개 릴리스 경로의
게이트라 키 이관 여부와 무관하다.

---

### 이 세션이 알아낸 것 — 먼저 읽어야 오판을 안 한다

1. **래칫 28건이 내려갔는데 절반은 고친 게 아니라 잘못 세던 것이다.**
   `opacity: 0`·`1` 은 위반이 아니고(완전 불투명은 미리 합성할 것이 없다),
   `android_ripple` 안의 알파도 아니다(퍼져 나가는 애니메이션이라 불투명하게 만들면
   누르는 순간 표면이 통째로 덮인다). **둘 다 변이 검증했고 근거가
   `scripts/check-pixel-rules.ts` 주석에 있다. 되돌리지 말 것.**
2. **`data/structure/*.json` 다이제스트는 깊이 6에서 잘린다**(`capture-bundle.mjs`).
   `nav.json` 은 깊이 제한이 없다. **어긋나면 `nav.json` 쪽이 레퍼런스에 더 가깝다.**
3. **이탈(deviation)은 축마다 따로 달아야 한다.** D축에만 달면 D 는 15/15 로 오르고
   E 는 0 으로 남는다 — E축은 레퍼런스의 *모든* 텍스트를 센다.
4. **법률 세 화면에 독이 없는 건 의도다.** `(auth)` 그룹이라 로그아웃 상태에서 열려야 하고,
   그 상태에서 독의 다섯 목적지는 전부 로그인이 필요하다.
5. **`TraitRadar` 는 고아다.** 규칙 4 위반 4건이 잡히지만 렌더되지 않고, 오히려
   `polaris-deck.test.ts` 가 "없어야 한다"를 검사한다. 손대지 말 것.
6. **대화는 저장되지 않는다 — 기본값 문제가 아니다.** `useState<ChatTurn[]>([])` 뿐이고
   `autosave.ts` 헤더가 스스로 *"저장소에 대화 테이블이 없다"* 고 적고 있다.
   `chat_autosave` 를 켜도 남는 건 **위키 기록**이지 되돌아갈 대화가 아니다.
7. ⚠ **#1452 의 "C축 복구"는 폐기된 눈금이다.** 그 밴드 서명은 앱 캡처에게 자기 짝을
   고르게 했을 때 **0/6**(무작위 1/6보다 낮다)이었다. DOM 에서 이미지로 옮겨도 **같은
   함수라 결과가 같다.** 지금 main 은 `const C = null` 이고 그게 근거 있는 쪽이다.
   다시 켜려는 사람은 **자기 짝 찾기부터 통과시킬 것.**

---

### ⚠ 로컬 환경 함정 — `npm run verify` 가 이것 때문에 빨갛게 뜬다

`test:ui-work0`(#1464·#1467 이 verify 체인에 넣었다)가 `playwright-core` 를 요구하는데,
**낡은 워크트리 설치에는 없다.** 없으면 `score.mjs` 가 import 시점에 죽어 52개가 전부 실패한다.

```bash
npm i --no-save --legacy-peer-deps playwright-core@1.62.1   # lockfile 이 고정한 버전
```

⚠ **전역 playwright 를 정션으로 빌려오지 말 것.** 버전이 다르면
`browser version does not match pinned Playwright Chromium` 으로 막힌다(이 세션에서 실제로 겪었다).
스크린샷 때문에 잠깐 빌려야 하면 **쓰고 나서 반드시 걷을 것.**

---

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 래칫 **기계적 60건** — `SecondbStatusHeader`(테두리) · `AdvisorFollowupNote`(root 배경) · `FacetBreakdown`(트랙). 바탕만 정하면 된다 | small | ⭐ **결정 없이 지금 할 수 있는 유일한 덩어리** |
| B | 규칙 3 **39건 = 그림자 → 4방향 베벨**. `PixelSurface` 를 화면에 들이는 이주 | large | 화면 하나를 끝까지 하고 본을 만들 것. 반쯤 옮기지 말 것 |
| C | 상태색 33건(`PixelPressable`) · 그림 16건(디더) · SVG 알파 5건 | medium | B 다음 |
| D | 서명 지문 시크릿 둘 채우기 | small | 9/1 릴리스의 **선행 조건** |

⚠ **래칫은 양방향 실패다.** 줄이면 같은 PR 에서 `RATCHET_BASELINE` 을 내려야 한다.
⚠ **main 이 빠르게 움직인다.** 다른 세션이 이 세션 동안 #1463~#1477 을 올렸다.
브랜치를 오래 들고 있지 말 것.

### 적용 중인 정책 (영구)

1. `main` 직접 push 금지 · `git add -A` 금지 · 시크릿 하드코딩/값 요청 금지.
2. `npm run verify` 는 **파이프 없이 종료코드로** 확인 (`| grep` 은 grep 의 종료코드다).
3. 카피는 `locales` 5로케일 **값**으로. 키를 바꾸면 `check:constraints` 가 깨진다.
4. 새 가드를 만들면 **변이 검증**하고 결과를 주석에 적는다.
5. 정규식이 든 스크립트는 heredoc·`node -e` 로 넘기지 않는다(백슬래시가 사라진다). **파일로 쓴다.**
6. 보고는 항상 **Artifact HTML**. 채팅에는 링크 + 3~5줄 요약.
7. **점수를 올리려고 시드하거나 기능을 지어내지 않는다.**
8. **유료 결제를 임의로 하지 않는다** (EAS Starter 업그레이드 등은 Simon 결정).

### 핵심 파일 위치

```
design/pixel_clay_260825/tools/score.mjs           P1 채점기 (A·B·D·E, C는 꺼져 있음)
design/pixel_clay_260825/tools/capture-bundle.mjs  레퍼런스 캡처 — ⚠ 다이제스트 depth 6 절단
design/pixel_clay_260825/tools/serve-sub.mjs       baseUrl(/2nd-B) 앱 서빙 (npx serve -s 로는 안 됨)
design/pixel_clay_260825/data/deviations.json      이탈 20건 — 축마다 따로 달 것
design/pixel_clay_260825/data/nav.json             D축 라벨 — 다이제스트와 어긋나면 이쪽이 맞다
scripts/check-pixel-rules.ts                       픽셀 래칫 (RATCHET_BASELINE = 165)
scripts/check-android-release-signatures.js        서명 지문 게이트 (#1472, fail-closed)
docs/RELEASE-PROCESS.md                            버전 자리수 → 팝업 여부. minor 는 조용히 나간다
docs/ANDROID-BUILD.md                              EAS vs 진단 빌드 서명 — ⚠ 74행 "separate keystore"
```

### 검증

```bash
npm i --no-save --legacy-peer-deps playwright-core@1.62.1   # 처음 한 번
npm run verify && echo "exit=$?"                            # 파이프 없이

# P1 재측정 (전체 64화면, 약 40분)
node design/pixel_clay_260825/tools/capture-app.mjs --print-env > /tmp/webenv.sh
source /tmp/webenv.sh && EXPO_PUBLIC_FORCE_TIER=brain \
  npx expo export --platform web --output-dir distN --clear   # ⚠ --clear 없으면 이전 env 를 물려받는다
node design/pixel_clay_260825/tools/serve-sub.mjs distN 8979 &
BASE_URL=http://localhost:8979 node design/pixel_clay_260825/tools/score.mjs
```

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md

# ⚠ 코드를 건드리기 전에 — 위 §결정 다섯을 Simon 에게 설명하고 답을 받는다.
```

---


## 2026-08-28 / 자가 두 번 틀렸다 — P1 채점 37/64, 래칫 165, 그리고 **결정 넷이 대기 중**

> 발행: CLI 코딩 세션(PIXEL-CLAY P1 측정 트랙).
> 보고서(Artifact): <https://claude.ai/code/artifact/feffd35e-c652-44cc-b0f8-a9a7fb50dafa>
>
> **갱신 2026-08-28: PR #1456 머지됨(`9afcc482`), OTA 발행됨 — 그러나 도달 0.** 아래 §OTA 참조.


## ⚠ OTA 는 발행됐지만 **어떤 기기에도 안 닿았다** — 새 EAS 빌드가 필요하다

`gh workflow run eas-update.yml`(run 33092014063) 은 **성공**했다. 그런데 도달 보고가
`OTA reach: NOTHING. No build on 'preview' carries 81be7b98….` 다.

**"발행됨"을 "도달함"으로 읽지 말 것.** `eas update` 는 한 대도 못 받아도 0 으로 끝난다.

### 무엇이 지문을 움직였나 (실측)

로컬에서 커밋마다 `@expo/fingerprint` 를 다시 떴다:

| 커밋 | 지문 | |
|---|---|---|
| `8ff452ec` #1455 | `0bccbba5…` | 기준 |
| `99a6881a` #1458 · `7f7a622b` #1459 | `0bccbba5…` | 안 움직였다 |
| **`2c9d3941` #1460** | **`b2cbfc87…`** | ← **여기서 build 35 가 좌초했다.** 바꾼 파일은 `.easignore` **하나뿐**인데, 그 파일이 EAS 가 보는 파일 집합을 바꾸므로 지문 소스다 |
| **`9afcc482` #1456** | **`fbd41747…`** | 또 움직였다 — `package.json` 에 `design:structure` **스크립트 한 줄**을 더한 것 때문 |

⚠ **`package.json` 의 `scripts` 한 줄도 지문을 움직인다.** `@expo/fingerprint` 는
`package.json` 을 통째로 해시한다. "의존성을 안 건드렸으니 OTA 로 간다"는 **틀린 추론**이다.

⚠ 그리고 #1456 을 되돌려도 소용없다 — **#1460 이 이미 좌초시킨 뒤**였다.

### 그래서 지금 상태

- 웹(GitHub Pages)에는 이 작업이 **반영된다** — `web-deploy.yml` 은 지문과 무관하다.
- **설치된 preview APK(build 35, 0.6.0)에는 안 간다.** 받으려면 **새 EAS preview 빌드**가
  필요하다: `gh workflow run eas-preview-build.yml` → 새 APK → 폰에 설치.
  그 뒤로는 지문이 다시 바뀌기 전까지 OTA 가 다시 통한다.

### ⛔ 그 빌드는 **지금 못 뜬다 — EAS 무료 플랜 할당량 소진** (2026-08-28 실측)

`eas-preview-build.yml` 을 돌렸고(run 33122536870, `9a31a28f`) **실패했다.**
코드 문제가 아니다:

```
This account has used its Android builds from the Free plan this month,
which will reset in 4 days (on Tue Sep 01 2026)
Run eas billing:subscribe starter --account simon_k to upgrade to the Starter plan.
```

**길은 둘뿐이고 둘 다 Simon 이 정할 일이다:**

1. **2026-09-01 까지 기다린다** — 무료 할당량이 초기화된다. 그때 다시 돌리면 된다.
2. **EAS Starter 로 올린다** — `eas billing:subscribe starter --account simon_k`.
   유료다. **AI 가 임의로 결제하지 않는다.**

⚠ 실패하기 전에 `versionCode` 가 **원격에서 35 → 36 으로 이미 올라갔다**
(`version source: remote`). 다음 성공 빌드는 37 이 된다. 번호가 하나 비는 것뿐이라
해가 되진 않지만, 릴리스 노트에서 36 을 찾다가 헤매지 말 것.

⚠ 그동안 **웹은 정상이다.** GitHub Pages 배포는 지문과 무관하므로
<https://simon-yhkim.github.io/2nd-B/> 에서 이번 작업을 볼 수 있다.



### ⚠ 새 세션이 **가장 먼저** 할 일 — 작업이 아니라 설명이다

Simon 지시(2026-08-28): *"그 세션에서 작업을 먼저 하기보다, 방금전 발행한 리포트와
'Simon 결정이 있어야 움직이는 것'에 대해 상세히 설명해서 결정 내릴수 있게 해줘.
각각이 의미하는게 무엇인지, 왜 해야하는지, 하면 어떤게 바뀌는지 설명해야해."*

**그러니 코드를 건드리기 전에 아래 결정 넷을 Simon 에게 설명하고 답을 받는다.**
설명은 아래 §결정 넷에 이미 재료가 다 있다. 답이 오기 전에 A~D 어느 것도 착수하지 말 것.

설명할 때 지킬 것:
- 각 항목마다 **① 무엇인지 ② 왜 지금 정해야 하는지 ③ 정하면 무엇이 바뀌는지
  ④ 안 정하면 무엇이 막히는지** 를 다 말한다. 하나라도 빠지면 결정이 안 된다.
- 점수는 근거지 목적이 아니다. "몇 점 오른다"만 말하지 말고 **사용자에게 무엇이 달라지는지**를 같이 말한다.
- 보고 형식은 Artifact HTML (Simon 상시 지시). 채팅에는 링크 + 3~5줄 요약만.

---

### 어디까지 왔나

- `origin/main` HEAD: `2c9d3941` (#1460)
- **작업 브랜치 `Simon-YHKim/p1-deviations` 는 main 보다 35 커밋 앞서 있고 PR #1456 이 열려 있다.**
  이 핸드오프 블록은 main 에 따로 머지된다(브랜치 상태와 무관하게 읽히도록).
- 이번 세션 커밋 2건: `4cc1ebab`(픽셀 규칙) · `ce572a3c`(채점 기준선)
- `npm run verify` **종료코드 0** (파이프 없이 확인)
- working tree clean (untracked `score.json`, `supabase/.temp/` 만)

| 지표 | 전 | 후 |
|---|---|---|
| P1 98점 이상 | 34 / 64 | **37 / 64** (오름 3 · **내림 0**) |
| `terms` · `consent-notice` · `refund` | 75.8 · 76.6 · 80.2 | **100 · 100 · 100** |
| 픽셀 래칫(규칙 2·3·4·5) | 193 | **165** |
| 규칙 1(곡선) | 0 | **0** (무관용, 유지) |

래칫 165의 구성(검사기 집계): 규칙 4 **114** · 규칙 3 **39** · 규칙 5 7 · 규칙 2 3 · PRD § 2.

---

### 이번 세션이 알아낸 것 — 새 세션이 **먼저 읽어야** 오판을 안 한다

1. **래칫 28건이 내려갔는데 절반은 고친 게 아니라 잘못 세던 것이다.**
   - `opacity: 0` 과 `1` 은 위반이 아니다(3건). 완전 불투명은 미리 합성할 것이 없고
     (`flattenAlpha(c, 1, 바탕)` 은 `c` 를 그대로 돌려준다), `0` 은 섞일 색이 없다.
   - `android_ripple` 안의 알파도 위반이 아니다(13건). 안드로이드 `RippleDrawable` 은
     누른 지점에서 퍼져 나가며 사라지는 **애니메이션**이라, 불투명하게 만들면 누르는 순간
     표면 전체가 그 색으로 덮인다. 규칙 5(동적 불투명도)를 처음부터 뺀 것과 같은 부류다.
   - **둘 다 변이 검증했고 근거·결과가 `scripts/check-pixel-rules.ts` 주석에 있다. 되돌리지 말 것.**

2. **`data/structure/*.json` 다이제스트는 깊이 6에서 잘린다** (`capture-bundle.mjs` 의
   `if (depth > 6) return null`). 같은 페이지에서 뽑는 `nav.json` 은 깊이 제한이 없다.
   **둘이 어긋나면 `nav.json` 쪽이 레퍼런스에 더 가깝다.** 다이제스트만 보고
   "레퍼런스에 없다"고 판단하면 틀린다(이번에 `capture` 에서 실제로 그럴 뻔했다).

3. **이탈(deviation)은 축마다 따로 달아야 한다.** `terms` 에 D축 면제만 달았더니
   D 는 5.6 → 15/15 로 올랐는데 **E 는 0 그대로**였다. E축(카피)은 레퍼런스의 *모든*
   텍스트를 세므로 독 라벨도 거기 들어 있다. 두 축에 달고 나서야 100 이 됐다.

4. **법률 세 화면에 독(dock)이 없는 건 의도다.** `(auth)` 그룹이라 로그아웃 상태에서
   열려야 하고(가입 전에 약관을 읽어야 하니까), 그 상태에서 독의 다섯 목적지는 전부
   로그인이 필요하다. 레퍼런스 프레임은 로그인한 사용자를 그렸다.

5. **`TraitRadar` 는 고아다.** 규칙 4 위반 4건이 잡히지만 **어디서도 렌더되지 않고**,
   오히려 `polaris-deck.test.ts` 가 `expect(screen).not.toMatch(/<TraitRadar/)` 로
   "없어야 한다"를 검사한다. 손대지 말 것.

6. **대화는 저장되지 않는다 — 기본값 문제가 아니다.** `secondb.tsx` 의 대화는
   `useState<ChatTurn[]>([])` 뿐이고 불러오지도 저장하지도 않는다. `지우기` 는
   `setTurns([])` 이다. `autosave.ts` 헤더가 스스로 *"저장소에 대화 테이블이 없다"* 고 적고 있다.

---

### 결정 넷 — Simon 이 정해야 움직인다

> 아래 넷은 **점수가 아니라 제품의 방향**을 정하는 것들이다. 각 항목의
> ①무엇 ②왜 ③바뀌는 것 ④안 하면 을 그대로 설명 재료로 쓸 것.

#### A. 계정에 비교 가능한 내용을 넣을 것인가 (시드) — 걸린 점수 **가장 큼**

**① 무엇인지.** 측정에 쓰는 QA 계정(`qa.ai.b18807@example.com`)에는 기록이 거의 없다.
그래서 화면 여럿이 *빈 상태*로 찍히고, 레퍼런스가 그린 손잡이·목록·요약이 "없음"으로 세어진다.
지금 D축(내비 도달) 손실이 **149.4점**, E축(카피) 손실이 **39.9점**이다. 상위:

| 화면 | D 손실 | E 손실 | 총점 |
|---|---|---|---|
| `museum` | 15 (전부) | 0 | 76.8 |
| `records` | 11.9 | 1.7 | 82.8 |
| `research` | 10.6 | 0 | 86.8 |
| `ratify` | 8.6 | 1.2 | 87.7 |
| `wiki` | 7.5 | 5 | 84.4 |
| `ops` · `inbox` | 각 7.5 | 0 | 각 90.6 |

**② 왜 지금 정해야 하나.** 지금 이 숫자들은 **디자인 충실도가 아니라 계정이 비었다는 사실**을
재고 있다. 즉 P1 채점의 3분의 1 가까이가 "우리가 얼마나 닮았나"가 아니라 "테스트 계정에
데이터가 없다"를 말한다. 이걸 안 정하면 남은 P1 작업의 우선순위를 못 세운다 — 어느 화면이
진짜로 덜 닮았고 어느 화면이 그냥 비어 있는지 구별이 안 되기 때문이다.

**③ 정하면 무엇이 바뀌나.** 시드를 넣으면 그 화면들이 **실제 사용자가 보는 모습**으로 찍히고,
그때 남는 차이가 진짜 디자인 격차다. 그러면 "여기는 만들 게 있다 / 여기는 이미 됐다"를 가른다.
부수적으로 QA 도 쉬워진다 — 지금은 사람이 손으로 채워야 화면 절반을 볼 수 있다.

**④ 안 하면 무엇이 막히나.** `museum`(76.8) 같은 화면은 **영원히 못 올라간다.** 뮤지엄은 D 15점을
통째로 잃는데, 큐레이션할 기록이 하나도 없으면 그릴 것이 없기 때문이다. 즉 A를 안 정하면
P1 의 상한이 약 **93점 부근**에서 막힌다.

**⚠ 이 결정의 진짜 위험.** Simon 이 앞서 못박은 규율이 있다 — *"점수를 올리려고 시드하지 말 것.
그건 눈금을 속이는 것이다."* 그래서 정해야 할 것은 **"넣느냐"가 아니라 "어떤 성격으로,
어디까지"** 다. 후보 셋:
- **(가) 실사용 시드** — Simon 이 실제로 며칠 써서 자연스럽게 쌓는다. 가장 정직하고 가장 느리다.
- **(나) 대표 시나리오 시드** — "30대 직장인 6개월치" 같은 **가상의 한 사람**을 정하고 그 사람으로
  일관되게 채운다. 화면 간 앞뒤가 맞고, 데모·QA 에도 그대로 쓰인다. 다만 **가상 인물이지
  Simon 이 아니다** — 그걸 문서에 못박아야 나중에 페르소나 판단의 근거로 오용되지 않는다.
- **(다) 화면별 최소 시드** — 각 화면이 비지 않을 만큼만. 가장 싸고 가장 위험하다(화면끼리
  앞뒤가 안 맞아 눈금이 다시 거짓이 된다).

권장은 **(나)** 다. 단 "이 계정의 데이터는 가상이다"를 `docs/` 와 시드 스크립트 머리에 박는 조건.

---

#### B. B축 램프 양자화 — 앱 전체 색조를 10단으로 반올림할 것인가

**① 무엇인지.** B축은 "칠한 면적 중 캐논 램프(`--c00`~`--c09` 열 단)로 해결되는 비율"이다.
64화면에서 램프 밖 색이 **52종** 나왔는데, 조사해보니 대부분이 고정 토큰이 아니라
`flattenAlpha(레인 강조색, 알파, 바탕)` 의 **결과**였다. 즉 어떤 값 하나를 고쳐서 붙일 수가 없다.

| 색 | 면적 비중 | 가장 가까운 램프 단까지 거리 | 어디 |
|---|---|---|---|
| `#202243` | 24.3% | 12 | `me` |
| `#181a2f` | 10.9% | **4** | `museum` |
| `#101626` | 10.7% | 8 | `reasoning` |
| `#121c2f` | 7.8% | **2** | `museum` |
| `#0d142e` | 7.5% | 7 | `esm` |
| `#293e6a` | 3.6% | **20** | 6개 화면 (`m3.disabled.primary`) |

거리 2~4 는 어두운 바탕에서 사실상 안 보인다. 정말 먼 건 `#293e6a` 하나뿐이다.

**② 왜 지금 정해야 하나.** B축 총손실은 **18.2점**으로 셋 중 가장 작다. 그런데 이걸 정하지
않으면 `reasoning`(97.6) · `import-hub`(96.8) 같은 근접 화면이 **영영 98을 못 넘는다** —
남은 감점이 전부 B축이기 때문이다.

**③ 정하면 무엇이 바뀌나.** 합성 지점(`flattenAlpha`)에 램프 양자화를 한 겹 얹으면
**파생 색 전부가 한꺼번에** 10단 위로 떨어진다. 그게 PIXEL-CLAY 의 원래 정신이기도 하다 —
제한된 팔레트. 결과적으로 앱의 **색 결이 더 단단해지고 밴딩이 의도적으로 보인다.**

**④ 안 하면 무엇이 막히나.** 근접 화면 둘이 98 아래에 남는다. 그것뿐이다 — 작다.

**⚠ 이 결정의 진짜 위험.** 양자화는 **되돌리기 어려운 전역 변경**이다. 한 화면씩 확인할 수
없고, `canon-tokens.test.ts` 가 현행 팔레트를 박아두고 있어 캐논 JSON 과 같은 PR 에서
움직여야 한다. 그리고 거리 12~20 짜리 색은 **눈에 보이게** 바뀐다. 선택지:
- **(가) 전면 양자화** — 헬퍼 한 겹. 일관되지만 앱 전체가 한 번에 달라진다.
- **(나) 먼 것만** — `#293e6a`(거리 20) 같은 몇 개만 램프 단으로 교체. 작고 안전하다.
- **(다) 안 한다** — B축 손실 18.2 를 이탈로 기록하고 둔다. 근거는 "우리 표면은 M3
  surface container 사다리를 쓰고 그건 10단보다 촘촘하다"이다.

권장은 **(나)** — 눈에 보이는 것부터, 전역 변경은 나중에.

---

#### C. `/capture` 에 양식·날짜를 만들 것인가 — 새 기능이다

**① 무엇인지.** 레퍼런스의 담기 화면에는 **자유 양식 · W4H1 양식 · 날짜를 골라요** 라는 손잡이가
있다. 앱의 `/capture` 에는 **셋 다 없다.** `clipper-templates.ts` 의 여덟 종(`article`·`video`·
`paper`·`reddit`·`code`…)은 전부 **콘텐츠 유형**이지 서술 양식이 아니고, 날짜 손잡이는 아예 없다.

**② 왜 지금 정해야 하나.** 이건 카피 차이가 아니라 **없는 기능**이다. 이번 세션에서 `capture`
(95.8)와 `careerinput`(97.9)을 안 민 이유가 이것이다 — 점수를 올리려고 기능을 지어내는 건
시드로 점수를 올리는 것과 같은 일이라 손대지 않았다.

**③ 정하면 무엇이 바뀌나.** 점수로는 약 **4점**. 그런데 진짜 값어치는 다른 데 있다 —
**W4H1(육하원칙)은 담기의 품질을 바꾼다.** 지금 담기는 자유 텍스트라 나중에 위키가 읽을 때
"언제·어디서·누가"가 빠져 있는 경우가 많다. 양식이 그걸 물으면 **대화 → 위키 → 페르소나**
파이프라인의 입력이 좋아진다. 날짜 손잡이도 마찬가지다 — 담는 시점이 아니라 **일어난 시점**을
넣을 수 있어야 시기별 별(영유아기·학창시절·20대…)에 제대로 꽂힌다.

**④ 안 하면 무엇이 막히나.** 두 화면이 95~98 에 남는다. 그리고 과거 일을 담을 때
"언제 일이었는지"를 앱이 못 받는 상태가 유지된다.

**⚠ 짚을 것.** 날짜 손잡이는 **일곱 별 구조와 직결**된다. `interview/periods` 가 나이로 시기를
가르는데, 담기가 날짜를 안 받으면 과거 기록이 전부 "지금"으로 들어간다. C를 하기로 하면
날짜부터 하고 양식은 나중이어도 된다.

---

#### D. 대화 이력을 저장할 것인가 — **점수와 무관한 순수 제품 결정**

**① 무엇인지.** 레퍼런스 대화 화면 머리에는 대화 **제목**이 있다. 이름 붙은 대화를 저장하고
되돌아간다는 뜻이다. 앱에는 **대화 테이블이 아예 없다.** `useState<ChatTurn[]>([])` 뿐이고,
`지우기` 는 `setTurns([])` 이며, 화면을 벗어나면 같은 일이 공짜로 일어난다.

**⚠ 흔한 오해를 먼저 끊을 것.** `chat_autosave` 를 켜도 **되돌아갈 대화는 안 생긴다.**
그 스위치가 담는 건 **위키 기록**(주고받은 한 쌍)이지 대화록이 아니다. 즉 "기본값이 OFF 라서"가
아니라 **기능 자체가 없다.**

**② 왜 지금 정해야 하나.** 점수 압박은 **없다** — `chat` 은 이미 99.8(D 15/15 · E 10/10)이다.
그래서 서두를 이유가 없고, 오히려 그래서 **편하게 정할 수 있는** 유일한 항목이다.
정해야 하는 이유는 다른 데 있다: 지금 상태에서 `지우기` 를 `새 대화` 로 바꾸면
**지킬 수 없는 약속**이 된다(돌아갈 이전 대화가 없으니까). 카피를 못 고치고 있다.

**③ 정하면 무엇이 바뀌나.**
- 만든다면: 어제 나눈 대화로 돌아갈 수 있고, `새 대화` 라는 말이 정직해진다.
  제품 의도("소통해서 깊게 파악")와도 맞는다 — 세컨비가 이어서 말할 수 있게 된다.
- 안 만든다면: 카피를 **지금 상태에 맞게** 고치면 된다(`지우기` 유지, 또는 "이 대화 비우기"처럼
  휘발성이 드러나는 말). 레퍼런스의 대화 제목은 이탈로 기록한다.

**④ 안 정하면 무엇이 막히나.** 대화 화면 카피가 계속 애매하게 남는다. 그리고 사용자는
자기 대화가 사라진다는 걸 **화면 어디에서도 못 읽는다** — 지금이 그 상태다.

**⚠ 만들기로 하면 따라오는 것.** 대화록은 새 저장 표면이라 `src/lib/privacy/prefs.ts` 의 규율
(보관·프로파일링은 명시적으로 켜기 전까지 OFF)이 그대로 걸린다. 즉 "저장할까요?" 동의,
보관 기간, 내보내기·삭제 경로가 같이 와야 한다. 작은 일이 아니다.

---

### 결정이 난 뒤의 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 래칫 **기계적 60건** — `SecondbStatusHeader`(테두리) · `AdvisorFollowupNote`(root 배경) · `FacetBreakdown`(트랙). 바탕만 정하면 된다 | small | ⭐ 결정 없이 지금 할 수 있는 유일한 덩어리 |
| B | 규칙 3 **39건 = 그림자 → 4방향 베벨**. `PixelSurface` 를 화면에 들이는 이주 | large | 화면 하나를 끝까지 하고 본을 만들 것. 반쯤 옮기지 말 것 |
| C | 상태색 33건 (`PixelPressable`) · 그림 16건(디더) · SVG 알파 5건 | medium | B 다음 |
| D | PR **#1456 머지** (35커밋, P1 측정 트랙 전체) | — | CI 초록 확인 후 |

⚠ **래칫은 양방향 실패다.** 줄이면 같은 PR 에서 `RATCHET_BASELINE` 을 내려야 한다.
안 내리면 다음 사람이 그만큼 되돌려도 안 걸린다.

### 적용 중인 정책 (영구)

1. `main` 직접 push 금지 · `git add -A` 금지 · 시크릿 하드코딩/값 요청 금지.
2. `npm run verify` 는 **파이프 없이 종료코드로** 확인 (`| grep` 은 grep 의 종료코드다).
3. 카피는 반드시 `locales` 5로케일 **값**으로. 키를 바꾸면 `check:constraints` 가 깨진다.
4. 새 가드를 만들면 **변이 검증**하고 결과를 주석에 적는다.
5. 정규식이 든 스크립트는 heredoc·`node -e` 로 넘기지 않는다(백슬래시가 사라진다). **파일로 쓴다.**
6. 보고는 항상 **Artifact HTML** (Simon 상시 지시). 채팅에는 링크 + 3~5줄 요약.
7. 점수를 올리려고 **시드하거나 기능을 지어내지 않는다.** 그건 눈금을 속이는 것이다.

### 핵심 파일 위치

```
design/pixel_clay_260825/tools/score.mjs          P1 채점기 (A·B·D·E 축, C축은 꺼져 있음)
design/pixel_clay_260825/tools/capture-bundle.mjs 레퍼런스 캡처 — ⚠ 다이제스트 depth 6 절단
design/pixel_clay_260825/tools/serve-sub.mjs      baseUrl(/2nd-B) 앱 서빙 (npx serve -s 로는 안 됨)
design/pixel_clay_260825/data/deviations.json     이탈 기록 20건 — 축마다 따로 달 것
design/pixel_clay_260825/data/score-baseline.json 직전 측정값 (오름/내림 비교용)
design/pixel_clay_260825/data/nav.json            D축 라벨 — 다이제스트와 어긋나면 이쪽이 맞다
scripts/check-pixel-rules.ts                      픽셀 래칫 (RATCHET_BASELINE = 165 on the p1 branch)
src/lib/theme/tokens.ts                           flattenAlpha · 팔레트 · FX_GROUND
```

### 검증

```bash
npm run verify                       # 파이프 없이. 종료코드 0 이어야 한다
echo $?

# 재측정 (전체 64화면, 약 40분)
node design/pixel_clay_260825/tools/capture-app.mjs --print-env > /tmp/webenv.sh
source /tmp/webenv.sh && EXPO_PUBLIC_FORCE_TIER=brain \
  npx expo export --platform web --output-dir distN --clear   # ⚠ --clear 없으면 이전 env 를 물려받는다
node design/pixel_clay_260825/tools/serve-sub.mjs distN 8979 &
BASE_URL=http://localhost:8979 node design/pixel_clay_260825/tools/score.mjs
```

⚠ `playwright` 는 이 워크트리에 없고 **전역**에 있다. 없으면
`mklink /J node_modules\playwright <전역경로>\playwright` (그리고 `playwright-core`).

### 다음 세션 시작하는 법

```bash
git fetch origin main && git pull origin main
cat docs/HANDOFF.md

# ⚠ 코드를 건드리기 전에 — 위 §결정 넷을 Simon 에게 설명하고 답을 받는다.
# 작업 브랜치를 보려면:
git fetch origin Simon-YHKim/p1-deviations
git checkout Simon-YHKim/p1-deviations
```

---


## 2026-08-26 / 일곱 규칙 중 다섯이 끝났다 (#1423~#1427, v0.3.0 릴리스)

> 발행: CLI 코딩 세션. Simon 지시 "인계가 불가능한 상황이니 최종 목표까지 진행".
> 코덱스에 넘기는 대신 **직접 완주**로 전환한 배치.

**PIXEL-CLAY 절대 규칙 7개 중 다섯(2·3·5·6·7)이 끝났고, 가드가 그것을 붙든다.**

### 무엇이 끝났나

| # | 규칙 | 전 | 후 | PR |
|---|---|---|---|---|
| 2 | 라운드 0 | 14 | **0** | #1423 |
| 3 | 블러 금지 | 1 | **0** | #1423 |
| 6 | 4방향 베벨 | 9 | **0** | #1423 |
| 5 | 계단 이징 | 46 | **0** | #1424 |
| 7 | 색 토큰만 | 0 | 0 | — |
| 1 | 정수 rect | ~304 | 탭 아이콘 9개 완료 | #1425 |
| 4 | 불투명도 | 358 | 토큰층 14개 완료 | #1426 |

`check:pixel-rules` 가 **108파일**을 본다(전 89) — 규칙 2·3·**5**를 막는다.

### ⚠ 새 세션이 먼저 알아야 할 정정 셋

1. **"이주 착수 전"이 아니었다.** 재보니 일곱 중 넷이 사실상 끝나 있었고,
   `check:pixel-rules` 라는 **래칫 가드가 이미 있었다**(이식 완료 89파일 목록).
   딥스페이스 tsx 54개 중 19개가 목록 밖이었는데 **그중 17개는 이미 위반 0건**이었다 —
   코드가 아니라 목록이 문제였다.
2. **규칙 1 을 135건으로 센 것은 오측이다.** 아이콘을 SVG **마크업 문자열**로 들고
   `SvgXml` 에 넘기는 레지스트리가 따로 있어 소문자 `<path>` 가 grep 에 안 잡혔다.
   문자열까지 세면 **304건 / 24파일**. 다섯 아이콘은 두 곳에 글자까지 같은 **두 벌**이었다.
3. **도구가 없는 게 아니라 채택이 안 됐다.** PIXEL-CLAY 프리미티브 4종
   (`PixelSurface`·`PixelDither`/`PixelScrim`·`PixelPressable`)이 P4 에서 만들어졌는데
   **쓰는 파일이 2개**다. 규칙 4 의 디더가 필요할 때 새로 만들지 말 것.

### ⚠ 세는 방법 함정 — 두 번 밟았다

- `m3Shape` 아홉 값이 **이미 전부 0**(`m3.ts:331`)이라 `m3.shape.large` 는 이미 준수다.
  이걸 위반으로 세면 규칙 2 가 14 대신 **363**으로 부푼다.
- `m3Elevation` level0~5 도 전부 0인데 `shadowOffset: {` 가 정규식에 걸려 규칙 6 이
  9 대신 **102**로 부풀었다.
- 토큰 파일 **안**의 hex 리터럴은 위반이 아니다 — 거기가 색이 정의되는 곳이다.
- → **"0 이 아닌 값을 실제로 만드는 참조"만 세라.**

### 캐릭터를 어떻게 옮겼나 (가장 위험했던 곳)

`SecondbHead` 의 눈·입이 **블러 그림자로 빛나고** 있었다(규칙 3·6 위반). 그냥
지우면 캐릭터가 죽는다 — 파일 주석이 스스로 "glowing cyan eyes" 라고 적고 있었다.
**픽셀아트에서 빛은 흐림이 아니라 한 칸 어두운 테두리다:**

- 눈: 둥근 사각 + 블러 → **정사각 + `accentGlow` 2px 테두리**
  (RN 의 border 는 안쪽으로 그려지므로 상자를 2칸 키우고 위치를 당겨 **심의 크기와
  자리는 그대로** 두었다)
- 감은 눈(호)·입: 같은 획을 **두 번** — 굵은 밴드 아래, 얇은 심 위
- 새 토큰 `deepSpace.accentGlow = #2d6896`(단색. 알파가 아니다)

전후 화소 대조로 확인: home 591 · chat 198 · capture 357 화소만 달라졌고
영역이 전부 헤더/캐릭터 자리다. 글자 대조는 100% 불변.

### 계단 이징은 직접 만들어야 했다

**RN 의 `Easing` 에는 CSS `steps()` 가 없다**(step0/step1 뿐). 그래서
`lib/motion/pixel-physical.ts` 에 `pixelSteps(n)` 을 만들었다. 사다리는 레퍼런스가
정해 놓았다 — `60ms/2칸 · 120ms/3칸 · 240ms/6칸`.

주기 동작(숨쉬기 1100ms 등)은 그 사다리에 안 맞아서 **칸당 40ms**(캐논 비율에서
유도, ≈25fps)로 칸수를 만드는 `pixelStepsFor(ms)` 를 뒀다.

⚠ **`useNativeDriver` 는 위반이 아니다** — 성능 플래그다.

### 리터럴 핀 하나를 불변식으로 바꿨다

`auto-intro-and-orbit.test.ts` 가 `Easing.linear` 를 grep 해서 "궤도 링이 등속"임을
지키고 있었다. 규칙 5 로 옮기니 그 핀이 **거짓으로** 깨졌다(계단도 등속이다).
리터럴 대신 불변식을 보게 고쳤다 — `toValue: 1` · 등속 이징 계열 · 진행률 낱말 없음.
⚠ 그 과정에서 **`duration` 안에 `ratio` 가 들어 있어** 자기 자신에게 걸렸다.
낱말 경계(`\b`)로 막았다.

### 릴리스 v0.3.0 + OTA

`app.json` 0.2.0 → **0.3.0**, versionCode 9 → 10. APK 83.8MB 가 GitHub Release 에
붙었다. CHANGELOG `[0.3.0]` 절을 새로 썼다(사용자가 보는 것만).

⚠ **OTA 는 이 빌드 이전 설치에 닿지 않는다.** fingerprint 입력 3개
(`eas.json`·`package.json`·`package-lock.json`)가 v0.2.0 이후 전부 바뀌었다.
그래서 **빌드가 먼저, OTA 가 나중**이다 — 순서를 뒤집으면 OTA 는 "성공"이라고
말하면서 아무 기기에도 안 간다(`scripts/check-ota-reach.js` 헤더의 2026-08-24 사고).

⚠ `eas.json` 이 `appVersionSource: "remote"` 라 **Android versionCode 는 EAS 원격
카운터가 매긴다.** app.json 의 10 은 기록용이다.

⚠ OTA 워크플로는 `concurrency: cancel-in-progress` 다 — main 에 다른 머지가 들어오면
**진행 중인 OTA 가 취소된다.** 실제로 한 번 취소됐다. 머지 큐가 조용할 때 걸 것.

### 점수판 도구도 고쳤다 (#1421)

전 화면 대조에서 **가장 낮은 다섯 중 넷이 디자인 문제가 아니었다.**
`record`/`records` 가 **둘 다 `/records`** 에 매핑돼 있었고(앱 DOM md5 동일),
`auth`·`signup` 은 로그인된 세션이라 홈으로 리다이렉트되고, `peer-token` 은
유효한 토큰이 없어 오류 상태를 그렸다. `app-routes.json` 에 `unmapped` ·
`unmeasurable` 구획을 만들고 도구가 **숫자 대신 사유를 출력**하게 했다.
`check:design-ref` 에 검사 4개 추가(중복 매핑·미등록 id·사유 없는 제외·양쪽 등재).

**지금 점수판: 잰 화면 34장 · 100% 가 18장 · 평균 89% · 측정 불가 3장.**

### 남은 것

- **규칙 1** ~290 — 문자열 아이콘 레지스트리(`shell/SbIcon` 32 ·
  `dds-import-inbox-screens` 25 · `DeepSpaceViews` 47) + 진행 링 2개.
  좌표 정본은 `src/components/pixel/pixel-glyphs.ts`, 문자열은 `glyphMarkup()`.
- **규칙 4** ~340 — 그중 **230건이 `withAlpha(` 호출부**라 자리마다 어떤 바탕 위에
  얹히는지를 봐야 한다. 한 번에 밀 수 없다.
- 규칙 1·4 는 **가드가 없다.** 위반이 0 이 된 뒤에 켤 것.
- Simon 결정 대기 넷: 매뉴얼 문 이름 · '렌즈' 대체어 · 강조색(#46B6FF↔#5b8def) ·
  정책 목차 화면.

`npm run verify` 종료코드 0 · 537 suites / 5246 tests.


## 2026-08-30 / 잘못된 자와 빠진 껍데기 (#1409~#1416, 일곱 발주 배치)

> 발행: CLI 코딩 세션. 보고 아티팩트 "잘못된 자와 빠진 껍데기"(프롬프트 생성기 포함,
> 복사 버튼은 샌드박스 iframe 에서 붙여넣기까지 실증).

**발주서에 적힌 원인이 셋 다 틀렸고, 재보니 일이 달랐다.**

일곱 건을 받아 PR 여덟 개를 냈는데, 실제로 한 일의 절반은 발주서에 적힌 일이 아니다.
낮은 점수 일곱 개 중 **넷은 측정 도구가 틀린 것**이었고 **둘은 화면이 껍데기를 통째로
잃은 것**이었다. 카피를 옮겨 채워야 할 자리는 하나뿐이었다.

### ⚠ 새 세션이 먼저 알아야 할 정정 3건

1. **`variant="windowed"` 는 독을 숨기지 않는다.** 발주 1 이 그렇게 지목했지만
   `MdNavBar` 는 variant 분기 **밖**에 있다(`DeepSpaceScreen.tsx` ~183). `/settings`
   가 windowed 인데 독 5칸이 다 있다. 진짜 원인은 화면들이 **공용 셸을 안 쓰고 자기
   프레임을 세운 것**이었다.
2. **옛 대조 수치를 근거로 인용하지 말 것.** 앱은 한국어 줄바꿈용 워드 조이너
   `U+2060` 를 글자 사이에 심는다(`src/lib/i18n/keep-all.ts`). 눈에는 안 보이는데
   문자열 비교에는 잡혀서 **화면에 있는 문장이 "없다"고 세어졌다.** 도구를 고치자
   코드 한 줄 안 고치고 import-hub 33→55 · peer-invites 58→64 · capture-full 47→50.
3. **"0% 화면은 우리 카피가 정본이라 작업 대상 아님"은 반만 맞다.** privacy·support·
   permissions 가 0% 였던 건 카피가 아니라 **독이 없어서**였다. 먼저 구조를 의심하고,
   카피 판정은 그 다음이다(`CODEX-HANDOFF.md` §② 에 반영).

### 무엇이 랜딩했나

| PR | 무엇 | 근거 수치 |
|---|---|---|
| **#1409** | `Shell` → `DockShell` 위임 — **13 화면**이 잃고 있던 하단 탭바 | privacy/support/permissions 0%→ |
| **#1411** | 그 이동을 내비 레지스트리에 반영(11 라우트) | 증상 없는 어긋남이라 더 위험했다 |
| **#1414** | stage 2 — 자 수정 + `/profile`·`/import-hub` 독 + 담기 사유 노출 | profile 17→**100** · import-hub 33→**100** |
| **#1415** | 표면 토큰을 캐논 midnight 램프로 + 새 가드 | 캐논 램프 점유율 평균 34→62% |
| **#1418** | `#0d1825` 의 정체 = **두 번째 토큰 사본** | 평균 62→**74%** (ref 76%) |
| **#1419** | 독이 없던 **16번째** 화면 `/digest` (라우트 전수 조사) | 독 0/5 → 5/5 |
| **#1412** | 처리방침에 GA4·Clarity 수탁사 + 국외이전 고지 | Simon 승인 |
| #1410 · #1413 · #1416 | Clarity 관측 · QA 커버리지 시드 · MyPola | 열림 |

### 껍데기를 되찾은 화면은 통틀어 15장

- `/profile` 은 **딥스페이스로 전환된 적이 없었다.** `/account` 는 전용 화면으로
  갈아탔는데(`account.tsx:395` 이른 return) profile 은 색만 덧칠하고 레거시
  `PremiumAppShell` 위에 서 있었다. **레퍼런스 profile 프레임의 글자 6개 중 5개가
  독 라벨**이라 독이 없으면 자동으로 17% 가 된다.
- `/import-hub` 은 자기 `SafeAreaView` 로 프레임을 세웠다.
- 둘 다 **안은 손대지 않고 껍데기만** 공용 `DeepSpaceScreen` 으로 돌렸다.
  ⚠ `active` 가 TABS 밖이거나 pathname 이 탭 루트와 달라서 '루트 탭 → 홈' 하드웨어
  뒤로가기 특례는 안 걸린다. 뒤로 동선 불변.
- **profile 전용 딥스페이스 화면 전환은 아직 안 했다** — 별건이다.

### 전수 조사 결과 — 같은 결함은 하나 더였고, 하나는 일부러다

15장을 고친 뒤 라우트를 전수로 훑었다. `src/app/*.tsx` 중 `SafeAreaView` 로 프레임을
직접 세우면서 `DeepSpaceScreen` 을 안 쓰는 곳은 **셋**:

| 라우트 | 판정 |
|---|---|
| `/review` | **정상** — 딥스페이스에서 전용 화면으로 갈아탄다(`review.tsx:219`). 독 5/5 |
| `/onboarding` | **일부러 없다** — 첫 실행에서 탭으로 빠져나가면 안 된다. **되살리지 말 것** |
| `/digest` | **결함** → #1419 (독 0/5 → 5/5, 대조 0→56%) |

⚠ `/digest` 의 남은 44% 는 결함이 아니다 — 레퍼런스 `digest` 프레임은 **화면 목업이
아니라 설계 비교 페이지**다("새 · 브리프 판" vs "기존 · 현재 앱"). 그 문구를 앱에 옮기지 말 것.

### 토큰 이주가 다른 화면을 안 깨뜨렸다 (회귀 점검)

카드 채움을 반투명 시안 → 단색 네이비로 바꿨으니 옛 채움 위에서만 읽히던 글자가
있었다면 지금 안 보일 것이다. **손대지 않은 화면 11장**을 더 쟀다:

home·me·plans·settings·trend·ops·growth **100%** · review 92% · records 83% ·
account 75%. **회귀 0건 · 콘솔 오류 0건.**

### 색 출처가 셋이었다 (발주 6)

레퍼런스 프레임의 최대 면적 색은 `#232e4a`(38~47%)인데 앱 스크린샷 상위 5색에는
**한 번도 안 나왔다.** 즉 "값이 조금 다르다"가 아니라 **패널 층이 통째로 없었다.**

| 파일 | 상태 | 읽는 파일 |
|---|---|---|
| `src/lib/theme/m3.ts` | midnight 이주 완료 — 단 바닥 두 값 예외 | 105 |
| `src/lib/theme/tokens.ts` | rev2 시안/네이비, **가드 0건** → 이번에 표면만 이주 | 158 |
| `src/theme/tokens.ts` | **디자인 화면의 카드를 실제로 칠하는 곳** (아래) | 11 |

앞의 둘을 **동시에** import 하는 파일이 79개다.

**가장 큰 한 방은 tokens.ts 밖에 있었다** — `m3.accent.cosmicBase`(#060912)와
`stageFloor`(#070A13)가 성운 바닥과 홈 무대를 칠하는데 캐논 바닥(#0a0e18)보다 어둡다.
표면 토큰을 다 맞춰도 이 둘이 화면 전체를 끌어내렸다. 평균 46→**62%** 는 이 둘이 낸 것이다.

새 가드 `src/lib/theme/__tests__/deepspace-surface-canon.test.ts` 는 값을 박지 않고
**캐논 JSON 램프 소속만** 본다. 변이 4건으로 확인(카드색·성운바닥·워시스톱 하나만·
캐논에서 `--c02` 삭제 → 넷 다 잡힘). 기존 `constellation-home-m3` 도 거울 한쪽만
옮긴 것을 잡아냈다 — **`deepSpace.bgMid` 와 `m3.accent.skySurface` 는 같이 움직인다.**

### ⚠ `src/theme/tokens.ts` 는 잔재가 아니었다 (#1418)

#1415 를 내면서 `#0d1825`(manual 45% · formats 27%)를 **"출처 미확인"** 으로 남기고,
`src/theme/tokens.ts` 를 "정리하면 좋을 두 번째 사본"처럼 적었다. **둘 다 틀렸다.**

역산: `#0d1825` = rgb(13,24,37)을 바탕 `#0a0e18` 위 알파 합성으로 풀면
**alpha 0.06 → rgb(60,181,241) ≈ #46B6FF**, 즉 `rgba(70,182,255,0.06)`.
픽셀 위치로 배경이 아니라 **카드**임도 확인했다(x 32~357, 창 안쪽).

`src/screens/deepspace/dds-styles.ts` 가 이 파일에서 `colors` 를 읽고, 그 `ddsStyles`
가 `DeepSpaceDesignScreens.tsx` 의 **딥스페이스 디자인 화면 전부**의 카드·경계·배경을
칠한다(`card`·`statBox`·`searchBox`·`formatCard`·`domainCard`·`wikiPageRow` …).

⚠ **파일 이름이 `src/lib/theme/tokens.ts` 와 거의 같다.** 착각하지 말 것 — 둘 다 살아
있고 서로 다른 것을 칠한다.

**이 한 파일이 표면 토큰 전체보다 크게 움직였다:** 평균 62→**74%**
(manual 46→**92** · formats 60→**88** · insights 85→**91**). 레퍼런스 76% 에 사실상 닿았다.
`src/theme/__tests__/theme.test.ts` 의 `bgDeep`·`bgMid` 핀도 같은 PR 에서 옮겼다
(강조색 핀은 **일부러 그대로**).

### 일부러 안 한 것 (Simon 결정 대기)

- **매뉴얼 문 이름이 다섯이다** — 매뉴얼·도움말(deepspace) / 앱 안내서·1분 안내서(auth) /
  사용 안내서(notFound) / 매뉴얼(BackArrow) / 사용 매뉴얼(dev-index). 진짜 결함이지만
  **제품 목소리 결정**이라 혼자 정하지 않았다. manual 71% 에서 멈춤.
- **peer-invites 는 레퍼런스가 '보여지는 나 렌즈'라고 쓴다** — 렌즈층은 결정 7 로
  휴면이다. 수치를 올리자고 폐기한 어휘를 되살리지 않았다. 64% 에서 멈춤.
- **강조색** 시안 `#46B6FF` ↔ 캐논 `#5b8def` — 앱 정체성 색이라 별건.
- capture-full 은 기능을 고쳤는데(비활성 사유를 눈에 보이게) **수치는 안 올랐다** —
  우리 문장과 레퍼런스 문장이 달라서다. 수치를 올리려고 문구를 바꾸지 않았다.

### MyPola (발주 4, #1416)

- **판례 닫힘: 대법원 2017. 2. 9. 선고 `2015후1690` 판결** [등록무효(상)]. 앞선
  "2015**마**1690" 은 파싱 오류. ⚠ **이 판례는 우리에게 유리하지 않다** — 요부 판단에
  '거래실정'이 들어가는데 앱은 결국 문자로 불린다. **결합안이 아니라 워드마크가 통과해야 한다.**
- **예규 번호는 못 닫았다.** 현행판은 「상표심사기준」(2025-12-10 시행, 지식재산처)인데
  게시 페이지가 번호를 안 싣고 law.go.kr 은 구판(예규 제66호, 2012)을 준다.
  **번호 대신 시행일로 인용**하도록 바꿨다. 추정 번호 금지.
- 표장 3종 `design/brand/`. **도형 좌표는 캐논의 실제 별 좌표 1:1** — 앱이 그리는 그
  도형이라 "쓰는 표장 = 출원 표장". **소문자 `mypola` 제안**(카멜은 눈에 `My`+`Pola` 로
  갈라져 선등록이 걸린 문자를 강조한다). 최소 크기 실측: 110px 에서 별이 뭉개진다 → 160px/12mm 이상.
- **글꼴 라이선스 확인 완료** — OFL-FAQ Q1.1/Q1.1.1: 로고 제작·상표 등록 가능,
  결과물 저작권자는 우리, RFN 은 폰트 파일 파생 규칙이지 그림을 제한하지 않는다.
  ⚠ 폰트 파일 자체를 "MyPola체" 로 개작·배포하는 것은 위반.
- ⚠ **SVG 는 출원본이 아니다** — 글자가 `<text>` 라 아웃라인 변환 필수.
  **KIPRIS 정식 검색은 여전히 미확인**이고 그것이 변리사 의뢰의 핵심 사유다.

### 재측정하는 법

```
BASE_URL=<정적서버> OUT=<경로> SCREENS=<쉼표목록>   node design/pixel_clay_260825/tools/capture-app.mjs
```

⚠ 로컬 export 에 `EXPO_PUBLIC_*` 를 안 넘기면 앱이 **조용히 mock 으로** 돈다.
색 면적은 `pngjs` 히스토그램으로 센다(캐논 램프 = `--c00`~`--c03`).

`npm run verify` 종료코드 0 · 534 suites / 5196 tests.


## 2026-08-29 / 이제 숫자로 말한다 (#1404~#1407, 앱 대조 + stage 1)

> 발행: CLI 코딩 세션. 일곱 발주 배치. 보고 아티팩트 "이제 숫자로 말한다"(프롬프트 생성기 포함).

**측정이 생겼고, 그 수치로 이식했다.**

| PR | 무엇 |
|---|---|
| **#1404** | **앱 캡처 파이프라인** — `tools/capture-app.mjs` 가 웹 export 를 헤드리스로 순회해 레퍼런스와 같은 눈금(390×820)으로 앱을 찍고 텍스트 대조 수치를 낸다. **40화면.** PNG 는 커밋 안 함(`.app-shots/`), 수치만 `data/app-compare.json`. ⚠ **레퍼런스 93장을 다시 떴다 — 정본이 틀려 있었다**: 공지 팝업 게이트가 `sb_notice_read` 가 아니라 **`sb_notice_seen`**(최신 id `n_140`)이라 첫 캡처는 93장 전부에 모달이 덮여 있었다(chat 대조가 50→83으로 바뀌었다 = 그만큼 거짓 수치였다) |
| **#1405** | **웹 PDF 를 실제로 되게 했다** — `GlobalWorkerOptions` 대입은 ESM 네임스페이스라 TypeError 를 던지고 try/catch 가 삼켜서, **한 번도 동작한 적이 없었다**(5.x·6.x 양쪽 재현). 고침은 워커 모듈 import 로 **메인스레드 핸들러 등록**. **브라우저 실증 + 반증 대조** 완료. pdfjs 6.2.108 + 패치 재생성. ⚠ 이 권고는 AnnotationLayer 표면이라 **우리 경로에 도달하지 않는다**(직전 HANDOFF 서술 정정). 캐논 P6 은 **가산으로 종결**(캐논은 출발점 스냅샷이라 덮으면 안 됨) |
| **#1406** | **PIXEL-CLAY stage 1** — 수치로 짚어 그 자리만 채웠다. home 83→**100** · chat 83→**100** · interview 86→**100** · trend 67→**100** · me-star 56→75 · review 7→31 |
| **#1407** | **코덱스 인계** `design/pixel_clay_260825/CODEX-HANDOFF.md` — 재현 절차·우선순위 넷·작업 지시 템플릿·절대 하지 말 것 다섯 |

**⚠ 다음 세션이 반드시 알아야 할 것**

- **캡처 도구 함정 다섯**(도구 헤더·프로토콜에 기록): baseUrl `/2nd-B` · `/2nd-B/` 로 진입(`.html` 은 not-found) · **시각을 고정하면 로그인이 조용히 깨진다**(토큰 만료로 보여 전 화면이 로그인 월, 캡처는 6/6 성공인데 대조만 0%) · 앱은 DOM 깊이 24(RN-web) · 온보딩은 매 이동마다 다시 뜬다.
- **0% 인 화면은 대부분 작업 대상이 아니다** — auth·signup·privacy·privacy-policy·support·permissions·digest 는 **우리 카피가 정본**이다. 수치를 올리려고 문구를 레퍼런스로 바꾸지 말 것.
- **남은 stage 1 격차 둘**: (a) me-star·review 의 잔여는 **QA 계정에 인터뷰 커버리지가 없어서**다(정직한 빈 상태) (b) 레퍼런스는 **스택 화면에서도 하단 탭바를 유지**하는데 앱은 감춘다 — review 31%의 절반이 이것. 셸·뒤로가기 정책이라 손대지 않고 코덱스 1번 항목으로 넘겼다.

**발주 4(이름) — 세 번째 반전**: 대안 12종 중 **Merak·Mizar·Alcor·Alkaid·Dubhe 다섯이 이미 선점**돼 탈락했고(소프트웨어 업계), 도메인 3종이 모두 열린 후보는 신조어 **Bukdoo·Chilbyeol** 둘뿐이다. MyPola 는 CNAI 선등록만 빼면 모든 축에서 최고 후보. 변리사 의뢰서 = `docs/legal/trademark-clearance-brief-260825.md`. **갈래는 Simon 결정**이고 KIPRIS 정식 조회는 자동 경로가 없다(사람 또는 변리사).

**발주 7(Clarity) — 관측이 막혀 있다**: 고리 11개 중 블로커는 코드가 아니라 **빌드 배선**이다. Clarity 네이티브는 Android 전용인데 릴리스 APK 는 `__DEV__=false` 이고 `android-release.yml` 이 `EXPO_PUBLIC_ALLOW_DEV_TIER` 를 안 넘겨 **개발자 화면이 폰에서 안 열린다** — 디버그를 넣어도 안 보인다. 워크플로 입력 한 줄이 선행(push 빌드엔 안 켜지게). `confirmedAdult` 는 `users.birth_date` 파생이고 프로젝트 id 는 repo Variable 에 실재.

**발주 6(처리방침) — 착수 안 함**: 발주가 "내 결정을 메모에서 확인하고 진행"인데 메모에 없었다. GA4·Clarity 가 §4 수탁사 표에 없는 것은 사실이고 패치는 준비돼 있다 — 시행일·고지 기간이 법적 판단이라 **임의로 고치지 않았다.**

---


## 2026-08-27 / 레퍼런스를 데이터로 (#1399~#1402, 키트 + 결함 넷)

> 발행: CLI 코딩 세션. 아홉 발주 배치. 보고 아티팩트 "레퍼런스를 데이터로"(프롬프트 생성기 포함).

**Simon 지시의 핵심**: *"디자인은 번들이 레퍼런스. 스타일·화면 구조·화면 연결 모두
따라갔으면. 이후 코덱스로 점검하고 파인튜닝할 것 — 그렇게 할 수 있는 배경과 방향을."*

그 답이 **#1401 레퍼런스 키트**다. `design/pixel_clay_260825/` 에 캡처 93장(전부
390×820, 콘솔 에러 0건) · 런타임 토큰 157개 · 화면별 DOM 다이제스트 · `screens.json`
(port true/false/deferred + 사유, 이식 금지 7종이 여기 박힘) · `tools/capture-bundle.mjs`
· `check:design-ref`(verify 편입, 변이 검증 완료). 판정은 3층으로 갈랐다 —
Tier1 CI 강제 / Tier2 구조 다이제스트 diff(SSIM 대체물) / Tier3 사람 눈.
프로토콜은 `design/pixel_clay_260825/FINE-TUNING-PROTOCOL.md`.

> **⚠ 규율: 화면이 실제로 쓰는 값만이 레퍼런스다.** 토큰은 CSS 텍스트가 아니라
> `getComputedStyle` 에서 뜬다 — 정규식 추출기(`gen-tokens.mjs`)는 `@media` 안의
> `:root` 를 바깥과 합쳐 `--u` 를 4px 로 잘못 뽑는다(실측). 지난 인수의 오판이 그것이다.

**⚠ 키트의 빈 칸**: **앱 쪽 자동 캡처는 0장**이다. 지금 가능한 것은 "레퍼런스가
무엇인지"의 고정이지 "얼마나 닮았는지"의 자동 측정이 아니다. 그리고 메모리에 있던
**"recapture CI 가 렌더를 검증한다"는 서술은 이 저장소 현황이 아니다**(워크플로에
screenshot/playwright 히트 0건) — 계획의 전제로 쓰지 말 것.

**사용자에게 보이던 결함 넷을 잡았다:**

| 무엇 | 왜 안 잡혔나 | PR |
|---|---|---|
| **홈 말풍선 여섯 별이 원시 키를 뱉음**(`ds.home.star.infancy.line` 이 화면에) | 별 id 는 #1376 에서 새 일곱으로 갔는데 카피 키는 옛 도메인 id 로 남았다. i18next 는 없는 키를 **키 문자열로** 돌려주므로 화면이 안 죽는다 | #1400 (+ 코드↔데이터를 잇는 검사) |
| **`/review` 진입 0건** — L5 가 제품에서 도달 불가 | core-brain 의 버튼이 legacy 스킨 분기 안 | #1400 (밝기 화면에 문) |
| **온보딩에 `{{who}}` 가 그대로** | 문구에 보간 변수가 있는데 화면이 값을 안 넘김 | #1402 |
| **웹 PDF 텍스트 추출 불가**(5.x·6.x 양쪽 재현) | 워커 배선이 ESM 네임스페이스 대입이라 조용히 튕기고 try/catch 가 삼킴 | 미착수 — 배선이 범프보다 먼저 |

**전제 정정 셋(새 판단의 근거로 옛 서술을 쓰지 말 것):**

1. **토큰 이식은 이미 끝나 있었다.** `m3.ts` 가 midnight 팔레트·2px 격자·radius 0·
   Galmuri 를 담고 있고 폰트·디더도 완료(P2~P4). 남은 것은 캐논 **P6** 와 rev2 시안이
   남은 `tokens.ts`(167파일 import — 별건).
2. **pdfjs 권고는 우리 코드에 도달하지 않는다.** 취약 표면 `enableScripting` 은
   AnnotationLayer 파라미터이고 우리는 `getTextContent` 만 쓴다. 직전 HANDOFF 의
   "유일한 실도달 고위험" 서술은 **틀렸다.**
3. **MyPola 의 진짜 장애물이 바뀌었다.** 폴라리스오피스(암호화폐 지정상품, 심사 착수 전)가
   아니라 **(주)씨앤에이아이의 등록 상표** `pola`(9류 4021638440000)·`Pola`(42류
   4021638420000)다 — 2024-03-06 등록, "핸드폰용 컴퓨터 응용 소프트웨어"·"서비스형
   플랫폼업" 으로 **같은 유사군(G390802)**, Pola Studio 실사용 중이라 불사용취소 불가.
   "유일 인접은 일본 화장품" 판정은 이중으로 틀렸다(그 건들은 전부 소멸).

**그 밖에 랜딩:** 보여지는 나 (b)안(#1399, `seen-rows.ts` + 유닛 12건 — 지인이 답한 것만
그린다) · 포지셔닝 확정 반영(#1402, 한 줄 = "AI 시대의 자산은 나 자신…", GTM.md §1 갱신) ·
Clarity 재동기화(#1400 — 네이티브는 플래그 도착 후 Clarity 를 다시 묻지 않아 동의를 켠
화면에 머무는 사용자에게 영원히 시작되지 않았다) · Dependabot #2·#25·#26 dismiss +
fast-xml-parser 근거를 검사로 박음.

**Simon 확인 대기**: MyPola 갈래(유지+변리사 / 대안) · 인수 확인 3건 중 인터뷰 저장 동의
(나머지 둘은 권고안으로 진행: 코너 버튼은 번들대로, 대화 3모드는 PRD 편입) · 처리방침에
GA4·Clarity 수탁사 추가(§4 표에 둘 다 없다 — 시행일·고지 기간이 법적 판단).

---


## 2026-08-26 / 번들 인수 + 두 반전 (#1395~#1397, 디자인 260825 반입)

> 발행: CLI 코딩 세션. 일곱 발주 배치(알파 검증·MyPola·보여지는 나·포지셔닝·심 통합·
> 번들 인수·Dependabot). 보고 아티팩트 "번들 인수와 두 반전"(프롬프트 생성기 포함).

**PR 셋(auto-merge 장전):**

| PR | 무엇 |
|---|---|
| **#1395** | `EXPO_PUBLIC_REASONING_PROVIDER` 심을 `resolveVendorForPurpose` 의 **마지막 rung** 으로 통합(값 변경 0건, 기존 seam 테스트 무수정 초록 = 동작 보존 증명). 잠재 결함 봉합: 구 구조는 pro+이미지에서 심이 멀티모달 핀을 이길 수 있었다(라이브 0건). **걷어내기 조건 3개는 LLM-ROUTING.md** — eas.json 은 키 삭제로만(빈 문자열 = eas 전면 사망) |
| **#1396** | **Claude Design 2차 번들 인수** — `design/pixel_clay_260825/` (원본 10MB + REPO-NOTES + 실화면 캡처 5장). **브리프 3대 검증 3/3 통과**: 새 일곱 정확(세부까지 저장소 규율 일치) · `--u=2px` 고정(⚠ 스타일시트 **꼬리** 재정의가 이긴다 — 반응형 블록만 보고 위반이라 오판하지 말 것, 390/1400px 런타임 실측) · 커뮤니티 별 없음. **핵심 경고 = 카피는 자산이 아니라 재검수 대상**: 금지 어휘 4종(직업 아바타 224종 안에!)·도메인 "별" 호칭 30+곳·옛 시기표 ERAS·localStorage 모델·CallRec 실녹음(F3 충돌)·em dash·"렌즈" 노출. 이식 금지 7종은 REPO-NOTES. ⚠ 번들 모듈은 **로드 순서가 정의를 덮어쓴다** — 뒤가 정본(Interview/Review=be641bed, Museum=7c9abfca) |
| **#1397** | Dependabot 25건 중 **21건 해소**(범위 내 lock-only `npm update`). 남는 4건: pdfjs-dist 메이저(유일한 실도달 고위험, 웹 PDF QA 동반 별도 발주) · dismiss 후보 3건(uuid/image-size — Simon 결정 대기) |

**반전 2건:**

- **MyPola** — "유일 인접 = 일본 화장품(카테고리 다름)" 판정이 **반증됐다.** KIPRIS 실측:
  주식회사 **폴라리스오피스가 "POLA" 를 9류·36류·42류에 2025년 출원 중**
  (4020250116118/9/20, 심사 중; 빗썸 POLA 토큰 실사용). MyPola 자체는 0건·도메인 5종
  미등록·mypola.com 은 GoDaddy 매물. **확정 전 변리사 선행조사 필요** — Simon 갈래 선택
  대기(유지+조사 vs 대안 재평가).
- **알파 크래시는 앱이 아니라 에뮬레이터** — 빌드 30 설치 크래시(`libreactnative.so`)의
  원인은 **EAS preview APK 가 arm64 전용**(실기기 정상)이라 x86_64 에뮬레이터와 ABI
  불일치. 같은 커밋으로 `preview-emulator`(차이 = ABI 에 x86_64 추가뿐) 재발주해 검증
  계속. **릴리스 v0.2.0 에셋은 빌드 30 으로 교체 완료**(dl=0 확인 후 --clobber — 릴리스
  워크플로는 기존 태그를 거부하는 설계라 직접 교체가 경로다). 원장은 08-24 12:00Z 이후
  0행(아무도 아직 안 씀). ⚠ **AVD 함정: 2ndB_QA_009 는 부팅 불능(2회 15분+), 
  2ndB_Codex_API36_260727 은 30초 부팅** — 에뮬레이터 QA 는 후자로.

**결정 재료 완성(집행은 Simon 답 대기):** 보여지는 나 = **(b)안 권고**(aggregate 합류 렌더 —
(a)는 SOKA 전제를 깨 solo 상태 거짓 표시) · 포지셔닝 4지점 파일·키·함정 맵 완성(문구가
메모에 없어 대기 — 온보딩 슬라이드는 flows.json 2벌+SLIDE_EN+constraints 핀 4파일 동시,
manual 은 \bAI\b 핀 때문에 로케일 JSON 에만) · 인수 확인 3건(코너 버튼 구성 · 인터뷰 저장
동의 기본 ON · 대화 3모드 편입).

---


## 2026-08-25 / 발주 6건 배치 + 알파 번들 (#1389~#1393, 0144~0146 운영 적용)

> 발행: CLI 코딩 세션. Simon 발주 6건(세션01 카피·피어 (a)안·MyPola 검증·꺼내기 원장·
> 옛 축 은퇴·포지셔닝) + 콘솔 추가 발주서(알파 빌드·어드바이저·A-2 전수). 상세와
> 복붙 프롬프트 생성기는 보고 아티팩트("여섯 발주와 알파 번들") 참조.

**랜딩한 PR 다섯:**

| PR | 무엇 |
|---|---|
| **#1389** | 0144 — `interview_coverage` RLS 3정책 `(select auth.uid())` initplan 최적화. **운영 적용 + 어드바이저 재실행으로 WARN 3건 소멸 확인.** A-1 완료 |
| **#1390** | 세션 01 실증 카피 4건 이식 — 인터뷰 인트로 "모르겠다도 데이터"(`drill.intro`) · 발판 문구 · 영유아기/학창시절 씨앗을 감각 앵커형으로 · 비준 거절 명시 철회 + 시트 거울 카피(`mirrorNote`). 5로케일·어휘 게이트 통과 |
| **#1391** | **꺼내기 채점 원장**(0145 `resurface_ledger`, 운영 적용) — shown→ratified/rejected 를 append-only 로, 'ignored' 는 파생. `resurface/ledger.ts`(fail-soft 기록) + `score.ts`(채점, **plan.ts 는 아직 안 건드림** — 개인화는 데이터가 쌓인 뒤). export-account 에 내보내기 행 추가(재배포 완료) |
| **#1392** | **피어 Big Five 5완성((a)안)** — 개방성·신경성 2문항. ⚠ 순서가 본질: **옛 엣지 서버는 미지 키를 400 이 아니라 조용히 버린다**(실측) → peer-respond 재배포(5키 검증)와 0146(키별 min-N≥3 집계 — 섞인 3키/5키 데이터에서 재식별 방지가 뚫리는 구멍을 막음)을 **클라이언트 머지 전에** 운영 적용했다 |
| **#1393** | **옛 축 원장 쓰기 은퇴((b)안)** — build.ts rebuild 쓰기 중지(계산은 유지) · `activation_milestone` 을 `recordSevenTiers`(일곱 전체·`northStarBrightness`)로 이사 · `/growth`·lens-signal 이 `seven:` 행만 읽음. **값 마이그레이션 안 씀**(id 재매핑 함정 회피). `retire-old-axis.test.ts` 가 되돌림 방지 |

**콘솔 발주서 처리 현황:**

- **A-2 전수 대조표**: SECURITY DEFINER 함수 72개 전수 — `p_user_id` 류 인자를 받으면서
  `auth.uid()` 대조 없는 함수 **0건**(구멍 없음). `community_is_member` 는 멤버십 존재만
  노출(저위험, 수정 불요 판단). 정적 분석 한계는 UNVERIFIED 로 표기.
- **하이젠 반전 ⚠**: 발주서는 `EXPO_PUBLIC_REASONING_PROVIDER` 를 사문으로 가정했는데
  **살아 있다**(`boundary.ts:116` 이 읽음). 값 변경 없이 사실만 기록 — 지우지 말 것.
- **B-1+B-2 알파 빌드**: eas.json preview 프로필에 벤더 번들(CHAT/EMBED 등 openai)과
  Clarity(#1387) 가 이미 실려 있음을 실측 확인. **빌드 트리거는 #1392 머지 후 최신
  main 에서 한 번** — APK 하나가 전부를 싣는다. 완료조건(원장 openai 행·Clarity 대시보드)
  검증은 설치 후.
- **B-3**: Firebase/GA4 재작업 안 함(발주서 지시). AAB 비공개 게시·사전 출시 보고서·
  테스트계정 입력은 Simon 몫(Play 콘솔).
- **gemini 정리 발주는 철회됨**(콘솔 발주서): 유출 키는 죽은 키, 회전 불요. **gemini 는
  9월 일괄 정리까지 유지** — 이전 "gemini 삭제" 발주를 근거로 걷어내지 말 것.

**MyPola 검증(발주 3):** 갈 만한 이름. 유일한 실위험 = POLA(일본 화장품) 인접인데 카테고리가
다름. My Polar 는 Polar Electro(건강 카테고리 정면)라 비추천. **KIPRIS 9류·42류 정식 조회만
UNVERIFIED** — 확정 전 필수. 캐릭터 체계 2안('-비' 가족 유지 vs 별 이름 가족)은 보고서에.
개명 실행은 별도 발주(프록시 재배포 먼저, scheme 불변).

**포지셔닝(발주 6):** '내 기록의 편집권' 한 줄 3안 + 스토어 첫 문단 2안 + 온보딩 반영 지점을
보고서에 실었다. Simon 선택 대기.

**미결(Simon 결정 대기):** MyPola 확정(KIPRIS 조회) · 캐릭터 안 A/B · 피어 새 2특성 표시
위치 · 포지셔닝 안 선택 · B-3 Play 게시 · 꺼내기 개인화(원장 데이터 쌓인 뒤).

---

