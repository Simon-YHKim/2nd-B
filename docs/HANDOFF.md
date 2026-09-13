# 2nd-Brain Handoff

> 가장 최신 섹션이 맨 위. 2026-06-16 이전 sprint 핸드오프는 [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) 로 아카이브됨(2026-07-03).
> Live: <https://simon-yhkim.github.io/2nd-B/>


## 이 로그는 기간으로 쪼개져 있다

단일 파일 100KB 상한(Simon 지침 §2 · §0-1)을 지키려고 **요약이 아니라 기간으로**
나눴다. 이 파일은 **활성 창**이고, 밀려난 블록은 아래 파일에 원문 그대로 있다.
한 글자도 요약하지 않았다.

| 덮는 기간 | 파일 | 블록 | 크기 |
|---|---|---|---|
| 2026-09-01 ~ 2026-09-06 | [handoff/HANDOFF-2026-09.md](handoff/HANDOFF-2026-09.md) | 12 | 55KB |
| 2026-08-25 ~ 2026-08-30 | [handoff/HANDOFF-2026-08-p4.md](handoff/HANDOFF-2026-08-p4.md) | 11 | 89KB |
| 2026-08-23 ~ 2026-08-25 | [handoff/HANDOFF-2026-08-p3.md](handoff/HANDOFF-2026-08-p3.md) | 21 | 85KB |
| 2026-08-20 ~ 2026-08-23 | [handoff/HANDOFF-2026-08-p2.md](handoff/HANDOFF-2026-08-p2.md) | 14 | 82KB |
| 2026-08-18 ~ 2026-08-20 | [handoff/HANDOFF-2026-08-p1.md](handoff/HANDOFF-2026-08-p1.md) | 7 | 46KB |
| 2026-07-03 ~ 2026-07-31 | [handoff/HANDOFF-2026-07-p3.md](handoff/HANDOFF-2026-07-p3.md) | 15 | 89KB |
| 2026-07-03 ~ 2026-07-11 | [handoff/HANDOFF-2026-07-p2.md](handoff/HANDOFF-2026-07-p2.md) | 16 | 88KB |
| 2026-07-01 ~ 2026-07-02 | [handoff/HANDOFF-2026-07-p1.md](handoff/HANDOFF-2026-07-p1.md) | 11 | 45KB |
| 2026-06-19 ~ 2026-06-27 | [handoff/HANDOFF-2026-06.md](handoff/HANDOFF-2026-06.md) | 20 | 86KB |
| ~2026-06-16 | [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) | - | - |

**새 블록은 이 파일 맨 위에 얹는다.** 이 파일이 100KB 에 닿으면 가장 오래된
블록부터 그 달의 보관 파일(부분이 있으면 번호가 가장 큰 것) 맨 위로 옮긴다.
절차는 `/simon-handoff` 가 갖는다. **요약은 어느 단계에서도 하지 않는다.**

## Latest — 2026-09-13 / 디스크 정리 끝(17곳 · 21.9 GB) — 재부팅 뒤 에뮬레이터 화면 검증

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

---
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


## 2026-09-08 / 에뮬레이터가 살아났다 — arm64 전용 APK 를 x86_64 에뮬에서 돌리는 법

**"에뮬은 못 쓴다"는 서술은 이제 틀렸다.** 막고 있던 것은 에뮬레이터가 아니라 **설치 경로 세 겹**이었고,
셋 다 풀린다. 출시된 `v0.8.0 preview` APK 를 그대로 돌렸다 — **EAS 빌드를 한 개도 쓰지 않았다**(무료
할당은 10-01 까지 15/15 소진 상태 그대로다).

전제: 에뮬 이미지에 arm64 번역이 켜져 있어야 한다. `ro.product.cpu.abilist` 가 `x86_64,arm64-v8a` 여야 하고,
`x86_64` 뿐이면 이 방법도 안 된다.

| 겹 | 증상 | 왜 |
|---|---|---|
| 1 | 그냥 설치 → 실행 즉시 `couldn't find DSO to load: libreactnative.so` | PM 이 기기 주 ABI 를 `x86_64` 로 보고, SoLoader 가 `base.apk!/lib/x86_64` 를 찾는다. arm64 전용 APK 엔 그 폴더가 없다 |
| 2 | `adb install --abi arm64-v8a` → `primaryCpuAbi=arm64-v8a` 가 되는데도 같은 죽음 | 요즘 APK 는 `extractNativeLibs=false` 라 `.so` 를 안 푼다. PM 이 `lib/arm64` 를 **빈 채로** 만든다 |
| 3 | 그 빈 폴더를 직접 채우면 뜬다 | SoLoader 의 `ApplicationSoSource` 가 정확히 그 경로를 본다. **APK 서명은 건드리지 않는다** |

```bash
adb install --abi arm64-v8a -r 2nd-Brain-v0.8.0-preview-*.apk
adb root
DIR=$(adb shell pm path com.simonk.secondbrain | tr -d '\r' | sed 's|package:||; s|/base.apk||')
# APK 안 lib/arm64-v8a/*.so 29개를 꺼내 push
adb push ./arm64libs/. "$DIR/lib/arm64/"
adb shell "chown -R system:system '$DIR/lib/arm64'
           chmod 755 '$DIR/lib/arm64'/*.so
           restorecon -R '$DIR/lib'"
adb shell monkey -p com.simonk.secondbrain -c android.intent.category.LAUNCHER 1
```

대가는 속도다. 화면 하나에 10~20초, 프레임 42~61장 스킵, 시스템 UI 가 스스로 ANR 경고를 띄운다.

### 실측한 것 (QA 계정으로 운영 Supabase 로그인)

로그인 · 온보딩 4장 · 만 14세 안내 · 첫 기록 회고(실제 08-30 기록을 읽어옴) · **홈 별자리**(북극성 우세 +
일곱 별 + 시안 링크 + 지극성 점선 + 세컨비 말풍선) · 설정 전 항목 · 세컨비 인트로. 전부 렌더 정상.

⚠ **홈이 "빈 상자"로 보이면 코치마크다.** 1/4 스포트라이트 프레임이 별자리를 덮는다. 렌더 실패로
오진하지 말 것 — 코치마크를 닫으면 별자리가 그대로 있다.

### 찾은 결함 — 화면 전환 중 백지, 자력 복구 안 됨 (간헐, 3회 중 2회)

```
SurfaceMountingManager: java.lang.IllegalStateException:
  addViewAt: cannot insert view [690] into parent [728]: View already has a parent: [730]
→ ReactHost.handleHostException → RN 호스트 파괴 → 화면 백지 (강제 종료해야 살아남)
```

난 자리: ① 온보딩 `Continue` 직후 ② `Go to constellation` 직후. 3회차에는 안 났다.
**실기기에서도 나는지는 미확인** — 번역 때문에 느려서 드러난 타이밍 문제일 수 있다. 다만 오류 자체는
속도가 아니라 **마운트 순서** 문제라 실기기에서는 확률만 낮을 가능성이 크다. 실기기 한 바퀴가 필요하다.

사소한 것: 홈의 `Thirties and af…` 라벨이 1440px 폭에서도 잘린다(영어에서만).

### 운영 DB — 0148 · 0149 · 0150 만 진짜 미적용 (승인 대기)

저장소 155 파일 vs 원장 145 행이라 이름 대조로는 11건이 비어 보이지만, **8건은 원장에 안 남았을 뿐
적용돼 있다**(과거 대시보드 직접 적용). 스키마를 읽어 확인했다 — `0102`(정책 81개가 initplan 래핑,
안 감싼 것 1개) · `0104`(search_path 없는 SECURITY DEFINER 0개) · `0092`(`runtime_flags` 존재).

진짜 미적용은 셋뿐이고 함수 본문까지 읽어 확인했다:

- `0148` — `complete_verified_email_signup()` 이 아직 `2026-06-02` 를 박고 `safety_notice_ack` 를 안 쓴다
- `0149` — `complete_profile_signup_consent` 함수 **부재**
- `0150` — `signup_consent_contract` 함수 **부재**

즉 **이메일 확인 가입자는 화면에서 09-07 판에 동의하는데 원장엔 06-02 판이 찍힌다.** 규모는 작다
(동의 원장 13행, 마지막 신규 08-23). 0148 은 **과거 행을 일부러 안 고친다** — 0130 이 `NULL` 을
"안 물어봄"으로 정의했으므로 `false` 로 덮으면 없던 사실을 만든다. **적용은 Simon 승인 대기.**

### #1724 — 충돌은 표시가 아니라 세 판본에서 푼다

두 PR 이 같은 테스트 파일 끝에 각자 `describe` 를 덧붙여 충돌했다. **충돌 표시만 보고 이어붙이면 안 된다** —
git 이 끝의 `});` 두 줄을 **공통 꼬리로 빼내서**, 그대로 이으면 앞 블록이 안 닫히고 뒤 `describe` 가
그 안으로 들어간다(파싱 에러). 잘못된 판본을 실제로 돌려 실패를 확인한 뒤, 병합 세 판본(`:1`/`:2`/`:3`)에서
"양쪽이 정말 덧붙이기만 했는가"를 단언하고 이어붙였다. 검증은 **PR 원본 대비 +70/−0 줄**(우리 쪽 삭제 0)과
`npm run verify` 종료코드 0(669 스위트 / 7,565 테스트).

### v0.7.1 후속 일곱 결정 — 여섯 마감

1 (0188+고아정리) 완료 · 2 (웹 제목) 완료, 단 **서빙되는 HTML 은 빈 `<title data-rh>` 가 먼저 나가** 링크
미리보기·크롤러에는 제목이 빈다(JS 가 런타임에 고친다) · 3 (동의·법무) **#1707 로 통합 재작성 머지**,
초안 5건은 대체됨 처리로 닫힘, DB 만 위와 같이 대기 · 4 (#1645) 재작성되어 머지 · 5 (머지 정지 창)
`docs/WEB-PUBLISH-RUNBOOK.md` 에 절차+소요시간 표로 못박힘 · 6 (실기기 검사) 위 방법으로 열림 ·
7 (다음 릴리스) v0.7.2·v0.8.0 이 09-07 에 이미 출시.


## 2026-09-08 / 공공데이터 키 두 개를 프록시 뒤로 옮기고 공개 변수를 은퇴시켰다 (#1705 → #1731)

**`EXPO_PUBLIC_*` 는 "공개해도 되는 값"이 아니라 "반드시 공개되는 값"이다.** Metro 가 빌드 때
값으로 치환하므로 예외가 없다. 2026-09-07 실측: 라이브 웹 번들 `entry-*.js` 의 `searchFoods`
안에 식약처 서비스키가 64자 리터럴로 있었다 — 2026-06-20(#498)부터 계속. 두 키 모두 계정
단위 발급 + 할당량이라 가져다 쓰면 우리 몫이 준다.

⚠ **이름 기반 grep 으로는 노출을 측정할 수 없다.** 번들에 남는 것은 값이고 이름은 사라진다.
첫 측정에서 "번들에 `EXPO_PUBLIC_MFDS_FOOD_KEY` 0건"이 나왔지만 안전하다는 뜻이 아니었다.

| PR | 무엇 |
|---|---|
| #1705 | `public-data-proxy` Edge Function 신설 + 배포(ACTIVE v1, `verify_jwt=true`). 클라이언트는 **매개변수만** 보내고 URL 은 서버가 상수로 조립 → SSRF 표면 자체가 없다. anon 키도 유효한 토큰이라 함수 안에서 `role === 'authenticated'` 를 한 번 더 본다 |
| #1731 | 클라이언트 전환(`foods.ts`·`fx.ts` → `src/lib/public-data/invoke.ts`), `web-deploy.yml` 주입 제거, 은퇴 기록 문서 |

### 지우지 않고 은퇴시킨다 (Simon 규칙 2026-09-08)

*"필요없는게 발견되면 (secret, api 등등) 지우기보단, 참고용 문서를 만들어서 향후 작업시
알수 있게 하자."* 저장소 Variable 두 개는 **그대로 둔다** — 읽는 곳이 없어 빌드에 영향이
없고, 지우면 값이 무엇이었는지 확인할 길이 사라진다. 정본: **`docs/PUBLIC-DATA-KEY-RETIREMENT.md`**
(이름·경로·상태만, **값은 없다**).

### 미결

1. **MFDS 키 회전 미완.** 2026-09-07 로그인 실측 — **data.go.kr 에 셀프 재발급 경로가 없다.**
   마이페이지에 계정 단위 인증키 하나와 복사 버튼뿐이고 활용 메뉴는 활용연장·활용중지·만료/중지만
   있다. "재발급"이라는 단어가 화면 어디에도 없다. 남은 길: 고객센터 문의 · 새 계정 · 그대로 두기.
   피해가 할당량 도용에 한정되므로 급하지 않다.
2. **수출입은행 재발급 미확인**(콘솔 로그인 이력 없음). 웹 번들에 실린 적은 없다.
3. **EAS 서버 환경은 그대로.** `eas-update.yml` 의 `allowedServerOnlyByChannel` 은 두 이름이
   EAS 채널 환경에 **존재할 것**을 요구한다. 지우려면 `eas env:delete` 가 먼저, 목록 제거가
   나중 — 뒤집으면 검증 스텝이 죽는다. 네이티브 번들에는 어차피 값이 안 실린다(Metro 는
   참조가 있어야 치환한다). 순서를 워크플로 주석에 못박아 뒀다.

### 가드 함정 — 주석을 세면 자기 설명문에 걸린다

`public-credential-surface.test.ts` 는 이제 **주석을 걷고** 센다. 인라인되는 것은 코드의
참조뿐이고, 은퇴한 이름일수록 "왜 옮겼는지" 설명 주석에 자주 나온다. 이 저장소에서 주석發
거짓양성이 이미 네 번 났다. 대신 **변이 검증**으로 무디지 않음을 확인했다 —
`process.env.EXPO_PUBLIC_EXIM_FX_KEY` 를 코드로 되돌리니 3건이 즉시 실패했다.



## 2026-09-08 / 말투 라운드는 한국어만 착지했다 (#1711)

2026-09-07 문구 라운드를 키 단위로 main 에 옮겼다. **한국어 1,520키 / 42파일만** 들어갔고,
en/es/pt/id 는 보류, 문구 4개는 거절했다.
보고서: <https://claude.ai/code/artifact/d2a43c6e-5dae-460b-96eb-907cbf3c66aa>
보류 상태 스냅샷: 태그 `haeyo-5lang-snapshot`(5개 언어 전부 적용된 트리).

### 라운드는 "한국어 말투"가 아니라 5개 언어 재작성이었다

| 언어 | 라운드가 바꾸는 값 | 그중 철자·악센트만 | 이번에 넣은 것 |
|---|---:|---:|---:|
| ko | 1,520 | — | **1,520** |
| en | 840 | 8 | 0 |
| es | 617 | 40 | 0 |
| pt | 573 | 5 | 0 |
| id | 421 | 3 | 0 |

Simon 답 두 개가 여기서 충돌한다 — 항목 2 "한국어 말투를 가져온다" 와 항목 8
"ES/PT/ID 감수는 없다". 교집합이 ko 다. en 동의 화면 11키만 읽어도 회귀 2건이 나왔다
(`account.export.done` 이 "No read failures were reported for the returned scope",
`account.export.failed` 가 확인되지 않은 rate-limit 을 원인으로 단정). **버린 것이 아니라
보류**이고, 감수가 되면 태그에서 한 번에 올린다.

### 거절한 문구 4개 — 말투가 아니라 뜻이 바뀐 것

| 키 | 라운드 값 | 왜 |
|---|---|---|
| `auth signUp.existingAccountBody` | "이미 가입한 이메일로는 새 계정을 만들 수 없어요." | **가입 화면이 계정 존재를 확정**한다 → 계정 열거(enumeration) |
| `interview drill.intro` · `drill.scaffoldNote` | "넘어가도 돼요 … 다른 질문으로 이어갈게요" | #1357/#1358 결정과 반대. **"모르겠다"는 칸을 안 채우고 같은 층에서 각도만 바꾼다**가 원칙 |
| `capture saved.recordsOwnership` | "기록 보관소에서 다시 읽거나 내보낼 수 있어요." | "작심이틀도 괜찮습니다"가 통째로 사라짐. en 은 여전히 "One sentence is enough for today." |

네 기준점 규칙(FORK/BASE/COPY/MAIN)이 `notice.*` 9개를 자동으로 막았다 — #1589 법률 정정이고
`CONSENT_VERSION`(`2026-09-07`)이 그 문구를 동의 원장에 고정한다.

### ⚠ 가드를 옮길 때의 규칙 — 문구 핀은 두 종류다

문구를 바꾸면 제약 검사 23개가 깨진다(기준선: main `1434e9cc` 실패 0). "초록이 될 때까지
가드를 고친다"가 가장 쉬운 유혹이고 그게 이 가드들이 막으려는 실패다. 핀을 **옮기기 전에**
분류했다:

- **번들 증인 핀** — 문구가 로케일 번들에서 온다는 증거일 뿐. 새 값으로 재지정(50건).
- **성질 핀** — 문구가 어떤 약속을 나른다. **새 문구에 그 약속이 남아 있는지 확인한 뒤에만** 이동:
  `ConsentTrust`(기록 본문 미전송) · `CaptureStorageLanguage`(첨부 잔존 고지) ·
  `SettingsDataDeleteWizard`(전체 삭제 후 남는 것) · `AuthEntrySupplemental`(가입 여부 비노출) ·
  `paywall-no-dead-cta`(미청구) · `visible-trust-copy`(AI 는 스위치 켰을 때만).

**금지어가 새로 들어온 사례는 0건**이었다 — 실패는 전부 "있어야 할 증인 문구가 다시 쓰였다"였다.

정규식 하나는 표현이 아니라 **주장**을 보게 고쳤다:
`/청구되지 않습니다|…/` → `/청구(되지|하지)\s?않|…/`. 다음 말투 변경에는 안 깨지고,
"청구 안 된다"는 말을 지우면 깨진다.

### 도구 함정 2건 (다시 밟지 말 것)

- **중괄호 세기로 검사 블록을 자르면 안 된다.** 박아둔 문구 안에도 `{ }` 가 있어서
  `ResearchI18nCopy` 뒤의 검사가 전부 한 덩어리로 묶였다. 문자열·주석을 건너뛰게 해야 갈린다.
- **앞부분 일치 핀을 새 값의 앞부분으로 잘라 붙이면 뜻이 뒤집힌다.** `"기록 본문이 아니라"`
  가 `"앱을 어떻게 쓰는지"` 로 바뀌었다. 그 자동 규칙은 없애고 손으로 판정하는 것이 맞다.
- `JSON.stringify` 재작성은 `⁠` 이스케이프를 **보이지 않는 생문자**로 바꾼다.
  로케일을 프로그램으로 다시 쓸 때는 보이지 않는 문자를 이스케이프로 되돌릴 것(이번 1건).

### 검증

```
npm run verify   EXIT=0
664 suites / 7,509 tests   ·   제약 검사 50/50
```

### 남은 것 — 전부 Simon 결정 대기

- **en/es/pt/id 라운드** — 태그 `haeyo-5lang-snapshot`. en 만 추천(기준 언어, 회귀 2건 제외).
- **항목 5 웹 게시 권한** — `workflow_dispatch` 제거 + 태그 push 안 제시함. 미적용.
- **항목 10 공용 폴더 자동 최신화** — 세션 시작 훅 `fetch` + `merge --ff-only`, 잠금파일은 경고만. 미적용.
- **동의 문구 정정본 웹 게시**(`9e456932`) — 라이브는 아직 정정 전 판.
- **항목 4 og:image** — 절대 주소 필요. 미결.
- **플랜/요금제 용어** — 라운드가 37곳을 `요금제` 로 옮겼는데 `ko/deepspace.json` 의
  자동갱신 고지 두 줄만 `플랜` 으로 남았다. **라운드 원본에도 있는 불일치**다. 법적 고지라 미적용.

### 항목 6·7·9 는 못 한 게 아니라 전제가 없다

`play.google.com` 상세 404(ko·en·US) · `apps.apple.com` 404 ·
`itunes.apple.com/lookup?id=6792266942` → `"resultCount": 0`.
**앱이 어느 스토어에도 출시된 적이 없다.** `eas.json` 의 ASC 앱 id 는 *레코드 생성*이지
출시가 아니고, GitHub Release 는 *저장소* 릴리즈다. 그래서 첫 출시에는 "이번 버전 변경사항"
칸 자체가 없고(준비된 5개 언어 초안은 두 번째 출시부터), 콘솔 확인은 로그인이 필요한데
이 머신에 Play·ASC 세션이 없다(대리 로그인 금지 → §4 작업 카드로 넘긴다).


## 2026-09-07 / TTL-Work 여섯 세션 통합 종료 — v0.7.1 출시 · 유일본 구제 · 남은 것은 사람 결정뿐

공유 워크트리 `TTL-Work` 를 쓰던 여섯 세션(codex 유산 포함)을 한 세션이 통합 관리해 닫았다.
결정 시트: <https://claude.ai/code/artifact/017fa268-7413-4ec2-aef6-85cd552970c0>
처분 원장: `.worktrees/_legacy/DISPOSITION-260907.md`(gitignore 밖, 로컬).

### 끝난 것

| | |
|---|---|
| 릴리즈 | **v0.7.1** 공개. 빌드 3종 · 웹 · OTA 가 `94450c38` **한 커밋**에서 나갔다 |
| 머지 | 그날 28건. 세션 종료 시 **열린 non-draft PR 0** |
| 유일본 구제 | `#1677` 웹 스페이스키 헬퍼 · `#1679` 엣지 요청 본문 상한 |
| 미푸시 자산 | A/B/C 3분류 후 origin push 67건(실패 0) + 번들 3개 보존 |

### ⚠ 이번 라운드가 뒤집은 규칙 하나 — 판본이 아니라 배선을 옮긴다

`Output/quality-260906/round21-helper-landing-set.json` 의 `landingRule` 이
*"helper 와 **그 소비자들의 워크트리 판본**을 한 벌로 착지시키거나 아무것도 하지 말라"*
고 적고 있는데, **뒤 절반은 존재하지 않는 선택지다.** 공유 워크트리의 소비자 판본은
main 의 낡은 분기라 그대로 올리면 이미 착지한 작업을 되돌린다 — 실측으로
`MdChip.tsx` 의 `disabled` prop·`m3.disabled.*`·`minWidth: m3.minTouch` 가 사라지고
`dds-auth-screens` −356 · `DeepSpaceDesignScreens` −372 이 된다.

**공유 워크트리에서 무엇을 착지시킬 때는 `git diff origin/main` 을 먼저 본다.**
집합의 크기(몇 개인가)와 방향(main 대비 무엇을 지우는가)은 다른 질문이고,
세는 것만으로는 두 번째를 알 수 없다.

### 지금 열려 있는 구멍 하나 — `0188` 이 운영 DB 에 없다

`db/migrations/0188_raw_clippings_deleted_account_fence.sql` 은 main 에 있으나
**운영에 적용되지 않았다.** 원장 부재가 아니라 **정책 본문을 직접 읽어** 확인했다:

```
raw_clippings_owner_insert  WITH CHECK
  (bucket_id = 'raw-clippings' AND (storage.foldername(name))[1] = auth.uid()::text)
0188 의 울타리 EXISTS (SELECT 1 FROM public.users …) : 없음
```

즉 **삭제된 계정의 아직 유효한 JWT 가 쓸어낸 뒤에 새 파일을 올릴 수 있다.**
같은 방법으로 ledger 미기록 6건도 검사했는데 그쪽은 효과가 이미 운영에 있다
(0141 GRANT 존재 · 0106 advisory lock 존재 · 0104 search_path 미설정 함수 0건).
**대시보드로 적용한 마이그레이션은 원장에 안 남으므로 원장 부재만으로 판단하지 말 것.**

### 다음 1개

**`0188` 을 고아 객체 정리와 같은 창에서 운영에 적용한다** (Simon 승인 필요).
울타리만 먼저 치면 이미 생긴 고아는 그대로 남는다.

### TODO

- [ ] `0188` 운영 적용 + 고아 객체 정리 — 위 참조
- [ ] 엣지 함수 9개 배포 — `#1679` 는 코드만 착지했다. **머지는 배포가 아니다**
- [ ] 동의 스택 6건(`#1587` `#1588` `#1589` `#1590` `#1591` `#1593`) — 지금 머지하면
      처리방침 시행일이 **09-04 → 09-02 로 후퇴**한다(main 09-04 / 브랜치 09-02 실측)
- [ ] `score-baseline.json` 의 **C축(구조일치, 가중치 20)이 64행 전부 null** — 총점이
      80점짜리 자를 100점처럼 읽고 있다
- [ ] `src/lib/account/export-delivery.ts` · `export-session.ts` — 어느 ref 에도 없는
      유일본. 계정 삭제 감사와 같은 표면이라 `0188` 과 함께 판정
- [ ] `ImportHubScreen` 의 제안 행에 `accessibilityRole` 부여 (ttl-work-45 몫)

### 미해결 질문

- **Q-260907-07** 앱 전체 한국어 말투를 해요체로 바꿀 것인가.
  실측 `main 습니다 644 : 해요 17` vs `TTL 47 : 736`(서술문 종결만, 명령형 제외).
  버튼 `keepToWiki` "Keep to wiki" → "Save to wiki" 도 같은 트랙.
- **웹 게시를 누가 언제 누를 것인가.** 게시는 "현재 main"에 고정되는데 그 고정이
  유지되는 시간(머지 간격 2~8분)보다 작업이 길다(실측 5m58s~11m29s). 통보로는 안 되고
  **무장된 auto-merge 는 통보를 듣지 않는다.**

### 방법으로 남길 것

- **가드가 실패하는 네 번째 모양: 막을 자격을 잃었는데 면제가 남음.** 지금은 맞고
  미래에만 뚫린다. 기준은 "이 면제가 아직 지킬 대상을 갖고 있나".
- **라이브 판정법은 대상마다 다르다** — 빌드 산출물은 서빙 번들 해시, 정적 마크업은
  HTML fetch, 런타임이 그리는 것은 **실제 브라우저**. `document.title` 은 세 번째다.
- **계약 검사는 자기 주장만큼 넓은지 확인할 것.** 구제한 `request-json` 계약 검사가
  9함수 중 6개만 덮고 있었고 빠진 셋이 하필 상한 8MB 인 가장 큰 표면이었다.


## 2026-09-07 / Codex 문구 라운드 main 통합 (#1650) · 스토어·공개 페이지 검토

Codex 가 공유 `TTL-Work` 에 미커밋으로 남긴 문구 라운드를 main 에 통합했다. 인수 자료는
`docs/session-start/claude-handoff-260906/`(공유 ref `docs/session-start-260906`)다.
머지 커밋 `ab2ee2c4`, CI 3종 통과, **머지된 main 에서 재검증 626묶음 / 7,024테스트 전부 통과.**

### 파일이 아니라 키로 옮겼다 — 기준점 넷

원본 브랜치가 main 보다 100커밋 넘게 뒤였다. 파일을 통째로 옮기면 그 사이 다른 세션이 머지한
변경이 조용히 되돌아간다. 그래서 각 키를 기준점 넷으로 판정했다.

| | |
|---|---|
| FORK | 원본 브랜치와 main 의 merge-base (`72180031`) |
| BASE | 문구 작업 시작 직전 스냅샷 (`Output/plain-language-260906/baseline-path.txt`) |
| COPY | 작업이 끝난 원본 워크트리 |
| MAIN | 현재 정본 |

`main == BASE` 또는 `main == FORK` 일 때만 옮겼다(= main 이 그 키를 건드린 적이 없다는 증거).
셋 다 아니면 진짜 충돌로 보고 손대지 않았다. **274키 중 137 은 `main == BASE`, 137 은
`main == FORK`, 진짜 충돌 0건.**

⚠ **`main == FORK` 케이스를 빠뜨리면 안 된다.** BASE 자체가 더 이른 미커밋 라운드를 담고 있어서,
`main == BASE` 만 보면 그 라운드가 통째로 "충돌"로 오판된다(처음 돌렸을 때 90건이 가짜 충돌이었다).

**파일 단위 충돌 수는 상한선이다.** 파일 교집합으로 세면 52건이지만 키 단위로 내려가면 문구 트랙
충돌은 0이었다. 3-way 필요 여부에는 파일 단위가, 되돌림 위험에는 키 단위가 맞다.

### 들어간 것

- 로케일 **274키 / 39파일** — 2026-09-06 라운드 227키 + `check-mascot-voice.ts` 가 실제로
  검사하는 사용자 대면 문구 47키. 5개 언어.
- **어휘 검사** — 줄 전체를 면제하던 부정문 처리를 절 단위로 바꿨다. 한 문장 안의 "하지 마세요"
  하나가 뒤의 다른 주장까지 가려주지 않는다. `scripts/lib/lexicon-copy.ts` 신설.
  `LEXICON_NON_CLINICAL_CONTEXTS` 는 소프트웨어 동음이의어의 정확한 구간만 가린다(CI 전용).
- **마스코트 말투 검사** — 두 벽이 `src/lib/safety/mascot-voice.ts` 로 나오고 절 단위로 본다.
- `anthro.ts` ES/PT/ID 애착 패턴 18개. 인용된 질문은 그 구절만 면제한다.
- 프롬프트 문구(대화·인터뷰·ops·위키), `STYLE.md`, 금지어 문서 법적 과장 정정 2건.
- **공개 사이트 공유 문구** — 라이브 루트가 빈 `<title>` 에 description·OG 0건이라 링크 공유가
  전부 빈 카드였다. `+html.tsx` 는 하이드레이션 전이라 `t()` 를 못 써 `KOREAN_BY_DESIGN` 에 등록.

### ⚠ 안전 표면 — 위기 응답 문구 (Simon 승인 2026-09-07)

앱이 물러나는 문장이 빠지고 감사 버전이 `red-ko-v2→v3` · `red-ko-minor-v1→v2` · `red-en-v1→v2`
로 오른다. **상담 번호와 응급실 안내는 그대로다** — `fixedCrisisResponse` 를 실행해 확인했다
(미성년 1388+109, 성인 109, 영문 988+findahelpline, 세 템플릿 모두 응급실 안내 유지).
버전은 INSERT 시점 값이고 마이그레이션·백필 0건이라 **기존 원장 행은 바뀌지 않는다.**

### 검사 핀 2개를 문구와 함께 옮겼다

`check-constraints.ts` 의 WorldviewConceptCoherence 와 `worldview-naming.test.ts` 가
`"inner-world patterns"` 를 글자 그대로 박아두고 있었는데 이번 라운드가 그 표현을 retire 했다.
가드를 끄지 않고 같은 뜻의 현재 문구로 핀만 옮기고 이유를 주석에 남겼다. 가드가 지키는 것은
Relia 의 담당 등록이지 특정 문장이 아니다. **로케일 값을 리터럴로 박는 가드가 이 저장소에
여럿 있으니, 문구를 고치면 가드도 같은 PR 에서 옮겨야 한다.**

### 일부러 안 옮긴 것 — 재발견해서 다시 시도하지 말 것

1. **한국어 해요체 전환.** 원본에 로케일 **4,067키** 짜리 해요체 라운드가 더 있는데 이번 인수
   문서에 기록이 없고 `locales/ko/consent.json` 23키를 포함한다. 프롬프트만 해요체로 돌리면
   화면과 답변의 말투가 갈린다(`identity-prompt.test.ts` 의 불변식). 실측(**서술문 종결만**,
   명령형 제외): **main 습니다 644 : 해요 17 / 원본 47 : 736.**
   ⚠ 명령형 `주세요`·`하세요` 는 이 저장소의 **정상 형태**다(main 217건). 해요체로 세면 자가
   망가진다 — 선례는 `copyFailed` = "복사하지 못했**습니다**. 글자를 선택해 복사해 **주세요**."
   이 라운드는 **버튼 이름도 바꾼다**(`en.keepToWiki` "Keep to wiki" → "Save to wiki").
2. **그 4,067키 라운드 자체** — 동의 문구를 포함하고 검증 기록이 없다.
3. **다른 세션 미커밋 파일에 얹힌 수정 5건** — `encrypted-native-storage.ts`(+테스트) ·
   `SignInStorageRecoveryCard.tsx` · `supabase .../request-json.test.ts` ·
   `knowledge/generated/batches.json` · `research.*` 로케일 4키×5언어.
   main 에 파일·키 자체가 없어 단독 통합이 불가능하다. 원 소유 세션 몫이다.
4. **대화 잔여 횟수 버그** — `conversation.ts` 가 `Math.max(0, limit - newCount)` 인데
   `checkChatLimit(tier, used, adBonus).remaining` 이어야 한다. `checkChatLimit` 의 `limit` 에
   광고 보너스가 없어(`limits.ts:65-67`) 리워드로 늘어난 한도가 잔여 횟수에 안 보인다.
   **진짜 버그지만 문구가 아니라** 뺐다. 결제·광고 트랙 몫.

### 스토어 초안 검토 — 로컬까지만

`docs/store-copy/drafts.json` 5개 언어를 현재 코드와 대조했다. 일치 확인: 앱 이름 ·
식별자(`com.simonk.secondbrain`, ASC `6792266942`) · 언어 5종(`AVAILABLE_UI_LOCALES` 와 동일,
es/pt/id 는 beta) · 글자 수 제한 전부 · **앱 자체 검사(의인화·금지어·분석어휘) 65개 문자열 전부 통과** ·
스크린샷 화면 6개 실재 · "질문과 답변을 함께 저장" 주장은 `keepExchange` 코드로 확인.

⚠ **`releaseNotes` 는 아직 제출하면 안 된다.** `app.json` 이 0.7.0(2026-08-28)이고
CHANGELOG `[Unreleased]` 가 비어 있어 이번 문구 변경은 **어떤 빌드에도 없다.** v0.7.0 출시
노트에도 적지 않았다. 문구가 들어간 빌드가 나온 뒤 그 버전의 노트로 쓴다.

콘솔 대조·저장·제출·공개는 **미실행**이다(이 PC 에 Play·ASC 브라우저 세션 없음, 대리 로그인 안 함).
출시용 Android/iOS 빌드 확인과 원어민 감수도 미실행이다.

### 공개 페이지 — 실제로 나가는 것을 실측했다

`public/` 전체가 공개 페이지라고 가정하지 않고 라이브에 직접 요청했다.

| 주소 | 판정 |
|---|---|
| `/2nd-B/` | 루트 `<title>` 이 비어 있었다. 수정은 `ab2ee2c4` 에 들어갔으나 **미게시** |
| `/2nd-B/legal/*.html` 4종 | 정상. 개인정보처리방침이 2026-09-04 정정으로 OpenAI 를 명시해 실제 처리 경로와 맞다 |
| `/2nd-B/proto/` | **의도된 공개**(#746·#748, `src/lib/canon` 이 `public/proto/data/` 를 import). 손대지 말 것 |
| `/2nd-B/landing/` | **결정 필요** — 아래 |

⚠ **`/2nd-B/landing/` 은 제품 페이지가 아닌데 게시마다 나간다.** `<title>` 이 `Elian Voss`
(johwska.com 구조 습작, 이름·연락처 전부 지어낸 값)이고 앱 어디서도 링크하지 않는다.
낡은 잔재가 아니다 — **03:03 `4038300d` 게시에 그대로 실려 나갔고, 배포에서 빼기 전까지
게시할 때마다 다시 공개된다.** 옆의 `/proto/` 는 반대로 의도된 공개이므로 **둘을 묶어
"미사용 공개 폴더"로 처리하면 안 된다.** 이 결정을 받기 전에 게시하면 한 번 더 나가고 다음
게시에서 또 빼야 한다.

### 남은 것

- **웹 게시** — 문구·메타 태그가 main 에 있으나 머지로는 웹이 안 바뀐다
  (`workflow_dispatch` + `mode=publish` 로만). 게시 전에 위 랜딩 결정을 받는다.
- **스토어 콘솔 대조** — 화면 작업. Play 는 개발자 계정 번호가 저장소에 없어 딥링크를 만들 수
  없다(그 화면 주소를 한 번 받으면 이후 원클릭). ASC 는 앱 id `6792266942` 로 딥링크가 된다.
  둘 다 **먼저 현재 등록값을 읽는 것**부터다 — 초안이 현재 콘솔과 같다고 가정하지 않는다.
- `og:image` — 절대 주소가 필요한데 셸에 원본 도메인이 없어 **지어내지 않고 비워 뒀다.**
  공유 자산과 서빙 도메인을 함께 정해야 한다.

### 이 라운드에서 반복된 실수 — 기준점 착오

수치·문자열·행 번호가 **어느 트리에서 잰 것인지**를 안 적어서 네 번 어긋났다(`keepToWiki` 계보,
한국어 말투 비율, 가드 시뮬레이션 표, `CLAUDE.md` 행 번호). 넷 중 셋은 다른 세션이 잡았다.

> **수치·문자열을 보고할 때 기준 트리를 문장에 박는다** — `main <SHA>` / `TTL 작업본` /
> `<세션> 워크트리`. 파일 내용이 트리마다 다르면 **행 번호는 인용문 없이 쓰지 않는다.**
> 해시는 방식을 앞에 적는다(`git hash-object` blob SHA-1 vs `sha256sum` 파일 해시).

⚠ **공용 `node_modules` 는 정본 체크아웃 `E:/2ndB` 의 락파일을 따른다.** 그 체크아웃이 168커밋
뒤여서 낡은 의존성이 깔려 있었고, `decode-uri-component-security-patch.test.ts` 가 **로컬에서만**
빨갰다(CI 는 `origin/main` 을 새로 깔아 초록). 워크트리를 최신으로 맞춰도 소용없다 —
`E:/2ndB` 를 먼저 ff 한 뒤 재설치해야 한다. 설치본 소스에서 **패치 표식을 grep 해 판정하지 말 것**:
그 패치는 ESM→CJS 전환뿐이고 옛 버전은 이미 CJS 라 안 걸린 설치도 정상처럼 보인다.
볼 것은 설치본 `package.json` 의 version · 락파일 요구 버전 · **정본 체크아웃의 HEAD** 셋이다.

---

## 2026-09-13 — 보안 W1–W8 로컬 통합 인계

### 결론과 소유 경계

- 격리 브랜치 `fix/security-wave8-monetization-260913`에서 W1–W7은 아래 7개 커밋으로 고정했고,
  W8은 이 절을 포함하는 후속 커밋 한 개로 고정한다. 기준은 `586abb25`다.
- 이 라운드에서 운영 DB·Auth/Pages 콘솔·secret/flag·Edge 배포·광고 활성화 쓰기는 **0회**다.
  서버 활성화와 운영 canary는 계속 console owner 소유다.
- 사용자 작업본 `E:/2ndB/.worktrees/2ndB/TTL-Work`의 미커밋 변경은 수정·정리하지 않았다.
- 로컬 소스 완료와 프로덕션 완료는 다르다. 아래 draft의 번호 예약, PR의 격리 DB 회귀,
  운영 순차 적용과 postflight가 끝날 때까지 **프로덕션 보안 완료라고 주장하지 않는다.**

| Wave | 로컬 커밋 | 범위 |
|---|---|---|
| W1 | `2c462a68` | 공급망, Actions SHA pin, 배포·자격증명 gate |
| W2 | `21a33bc8` | 브라우저·정적 산출물·공개 경계 |
| W3 | `d553f816` | 로컬 미디어와 임시 파일의 계정 귀속 |
| W4 | `8f062176` | 인증 세션·복구·PKCE |
| W5 | `d0872261` | 계정 삭제·내보내기·로컬 purge |
| W6 | `ff6a2963` | 서버 데이터, OAuth, peer/RSS quota |
| W7 | `0c05d407` | LLM 복원력, audit outbox, consent/vendor 경계 |
| W8 | 이 절을 포함한 커밋 | Paddle 결제·환불·chargeback, Rewarded SSV |

### W8에서 닫은 경계

- **Paddle:** checkout 소유 binding, adjustment 상태 순서, adjustment 단위 consequence의 exactly-once,
  ownerless tombstone, durable review queue, 구 Edge의 `eventId:consequence` 혼합 버전 손실을 막았다.
  self-service API 응답과 webhook이 경쟁해도 서로 다른 `provider_ref`를 덮어쓰지 못한다.
- **Rewarded SSV:** 클라이언트 자가지급을 제거하고 opaque ticket의 서버 원자 정산만 허용한다.
  ticket 발급 제한, bounded retention, reasoning/chat 단일 지급자, live ad-unit 계약을 묶었다.
  무작위 `key_id`는 verifier-key fetch 전에 exact ticket/계약 DB preflight에서 거절되고,
  유효 ticket도 Google 원본+재시도 합계인 6회까지만 isolate 공통으로 시도할 수 있다.
- **사용자 표시:** SSV 콜백 대기 상태를 실패와 구분한 `processing`으로 표시하며,
  처리 중 또는 확인 불가 상태에는 중복 시청 CTA를 다시 열지 않는다.
- 집중 회귀는 W8 변경 테스트 15 suites / 459 tests를 통과했다. TypeScript, 5개 언어
  3,756키 패리티, DEFINER grant, workflow YAML, DB shell 구문 검사도 통과했다.
  전체 `npm run verify`와 `npm run verify:web`의 최종 수치는 세션 상태 JSON과 Output 보고서를 따른다.

### 번호 없는 DB draft 7개

`db/migration-drafts/`의 아래 파일은 운영에 적용된 migration이 아니다.

1. `UNNUMBERED_account_deletion_completion_fence.sql`
2. `UNNUMBERED_effective_llm_consent_current_contract.sql`
3. `UNNUMBERED_oauth_naver_rate_limit_completion.sql`
4. `UNNUMBERED_paddle_refund_consequence_integrity.sql`
5. `UNNUMBERED_peer_response_rate_limit.sql`
6. `UNNUMBERED_reward_ssv_hardening.sql`
7. `UNNUMBERED_rss_proxy_quota.sql`

번호를 붙이기 직전에 remote migration을 다시 스캔하고, 예약 커밋을 즉시 push해야 한다.
이 절의 파일명을 보고 번호를 추측하거나 로컬 예약만 남기지 않는다.

### W8의 중단선과 순서

1. PR에서 `supabase-dry-run` scratch PostgreSQL 회귀를 통과하기 전에는 두 draft를 운영 후보로 승인하지 않는다.
   로컬의 `localhost:5432`는 소유·격리가 확인되지 않아 기능 SQL을 실행하지 않았다.
2. **Paddle:** webhook OFF → in-flight 0 확인 → 번호 migration → 새 Edge → postflight → 제한 canary → ON.
   checkout binding은 한 signer/two verifier 회전 절차를 지키며, 실패 시 DB down이 아니라 OFF 상태의
   roll-forward를 사용한다. 상세 명령과 중단 조건은 `docs/SESSION-OWNERSHIP.md`가 정본이다.
3. **Reward SSV:** `REWARD_SSV_ENABLED=0`과 client capability OFF → 번호 migration → 새 Edge →
   contract/live unit 일치 확인 → 제한 canary → server 유지 또는 OFF roll-forward → client activation.
   DB down migration은 금지한다.
4. 로컬에 Deno CLI가 없어 `deno check`는 실행하지 않았다. 실제 Android/iOS live-unit QA와
   운영 smoke/canary도 미실행이다.

### 재고 증거

- 최종 35행 처분 자료: `E:/2ndB/Output/260913_2ndB_security_disposition_manifest.json`
- 두 원본은 branch key로 join해야 하며 배열 index로 묶으면 안 된다. 총 35 branch / 95 occurrence다.
- 원본에 commit SHA가 없어 기존 `89 unique SHA` 주장은 재현하지 않는다. 현재 로컬 refs로 재구성한
  tip-N 집합은 91 unique SHA다. `ratchet-up`의 빠진 non-merge는 reflog와 첫 부모에서 `2326445c`로
  복구했고 현재 후보와 patch-equivalent임을 확인해, 35행 모두 처분 근거를 갖는다.
