# 클론 /loop 운영 플레이북 (세션 인수인계용)

> **목적**: 새 세션의 Claude가 이전 세션과 동일한 성능으로 클론 루프를 이어가기 위한 운영 매뉴얼.
> 상태(어디까지 했나)는 `docs/HANDOFF.md` 최상단 Latest 블록, **방법(어떻게 하나)은 이 문서**가 정본.
> 마지막 갱신: 2026-07-11 (17회차 종료 시점, PR #907까지 머지).

---

## 1. 루프 정의와 재개 방법

Simon이 `/loop`(dynamic 모드)로 발주한 자율 루프. **머지가 완료되면 5분 뒤 재가동**이 기본 케이던스.

### 루프 원문 프롬프트 (재개 시 이 전문을 그대로 사용 — 한 글자도 바꾸지 말 것)

```
/loop 이 루프작업은 기본적으로 머지가 완료되면 5분뒤 재가동 하는 루프야. 목표는 "레퍼런스(E:\2ndB\design\2ndB proto_rev2 (Copy)_rev2.zip)와 같은 화면을 구현하고, 의도된 기능을 구현하기"이다. 방법은, 가상 디바이스는 활용해서 모든 실제 화면을 확인하고, 레퍼런스는 어떻게 생겼는지 대조 하여 차이점을 확인하고 그 갭을 매꾸는 것이다. 만약 글자나 아이콘 등이 겹쳐보인다면 그것은 수정해야할 내용이며, 시스템과 ai와의 기동이 알맞은 페이지에서 알맞은 기동을 하지 않는다면 그것은 꼭 개선해야할 부분(내가 크레딧을 충전하지 않아서 생기는 문제는 제외한다)이다. 어느정도 수정이 진행되면, 'E:\Coding Infra\SimonK-Plugins' 경로에 있는 스킬들을 활용하여 모든 화면에 대해, 모든 기능에 대해 검증한다. 특히, simonkstack의 페르소나 스킬은 전연령대의 의견을 확인하기에 용이하니 참고하여 작업한다. 추가로, simonkstack으로 검증한 뒤에는 'https://github.com/Simon-YHKim/2nd-B'에 푸시, 머지까지 진행한다.
```

### 루프 규칙 (해석 정본)

| 규칙 | 의미 |
|---|---|
| 머지 완료 → 5분 재가동 | ScheduleWakeup `delaySeconds: 270`, `prompt` = 위 원문 verbatim |
| 위임 에이전트 대기 중 | ScheduleWakeup `delaySeconds: 1200` (fallback 하트비트 — 에이전트 완료 알림이 1차 웨이크 신호) |
| 겹친 글자/아이콘 | 무조건 수정 대상 |
| 페이지별 시스템/AI 기동 오류 | 수정 대상 (단, **크레딧 부족으로 인한 실패는 제외**) |
| 어느 정도 수정 누적 시 | persona-simulation 등 SimonK 스킬로 전화면 검증 → 이후 푸시+머지까지 |
| 게이트 (Simon 확인 필수) | 파괴적 작업 · 비용 발생 · secrets · 임상 방법론 · 법무. **그 외 전부 무확인 ship** |

### ScheduleWakeup 사용 예 (매 턴 마지막 액션)

```
ScheduleWakeup({
  delaySeconds: 270,              // 머지 직후 재가동. 에이전트 대기면 1200
  reason: "#9XX 머지 완료 — 5분 후 N회차 재가동",
  prompt: "<위 루프 원문 전문>"   // verbatim — 다음 발화가 /loop 스킬로 재진입
})
```

턴 도중 teammate 메시지/task-notification으로 깨어나면: 이벤트 처리 후 같은 방식으로 재암. 기존 예약된 wakeup은 발화 전까지 유지되므로 이벤트 턴에서 재암을 생략해도 죽지 않는다.

---

## 2. 이터레이션 표준 사이클 (16~17회차에서 확립)

```
① 에뮬 실기 캡처 (직전 머지분 화면 재검증 포함)
② 레퍼런스 대조 — 소스 우선 원칙 (아래 §3)
③ 갭 픽스 (직접) 또는 배치 위임 (서브에이전트, §5)
④ npm run verify 단독 실행, exit 0 확인
⑤ 명시 경로 git add → Conventional Commit → push → gh pr create
⑥ gh pr merge --squash --auto → MERGED 폴링 → main pull
⑦ 워크트리 정리 (junction 먼저, §6)
⑧ ScheduleWakeup 270s 재암
```

- **주기적으로**(픽스 수 회 누적 시) persona-simulation 스킬로 회귀검증 패스를 돌린다 (§7).
- 이터레이션 중 발견하되 이번에 못 고치는 것은 트리아지에 남긴다 (HANDOFF 다음 큐로).

## 3. 레퍼런스 대조 — 진실 위계 (오탐 방지 핵심)

1. **1순위 = 레퍼런스 소스**: zip 안의 `reference-app/*.jsx` (추출 위치 예: `scratchpad/ref_rev2/design_handoff_2nd_brain/reference-app/`; 새 세션은 zip을 재추출)
2. 2순위 = 캡처 이미지 (`docs/Screen-Spec/captures/`) — **소스보다 구버전**. 캡처에만 있는 갭은 소스 재대조 없이 수정 금지 (16회차에서 홈 5건 전부 캡처-온리 오탐이었음)
3. 실기 증거 > 비교 에이전트 판단. 특히 #680 Fabric 패턴(함수형 Pressable style이 소스는 멀쩡한데 런타임에서 드롭)은 소스만 읽은 에이전트가 "이미 일치"로 오판한다.
4. 프로드 표면 = deep-space 전용. `src/app/*.tsx`는 `isDeepSpaceUI()` 위임 — **화면 수정 전 위임 grep 필수**, legacy 분기만 고치면 프로드에 안 보인다.

## 4. 에뮬레이터 운영 레시피 (전부 이번 세션 실전 검증)

```bash
# 상태 점검
adb devices                                  # emulator-5554 device 여야 함
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/status   # metro 200

# adb offline/행 복구 (순서대로 — 이 세션에서 1회 발생)
adb kill-server && sleep 2 && adb devices    # 그래도 offline이면 ↓ 콜드부트
# PowerShell로 에뮬 프로세스 kill 후:
"$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" -avd Pixel_9_Pro_XL -no-snapshot-load -no-boot-anim   # run_in_background
# 부팅 폴링: adb shell getprop sys.boot_completed == "1" (약 3분)
adb reverse tcp:8081 tcp:8081                # 콜드부트 후 필수 (metro 연결)

# 앱 실행/재시작 — 패키지명 정본: com.simonk.secondbrain (simonyhkim 아님!)
adb shell am force-stop com.simonk.secondbrain
adb shell am start -a android.intent.action.VIEW -d "secondbrain:///"     # 첫 로드 ~30s
# 딥링크 순회 (라우트 존재는 src/app/*.tsx 로 확인)
adb shell am start -a android.intent.action.VIEW -d "secondbrain:///digest" && sleep 6
adb exec-out screencap -p > "$CLAUDE_JOB_DIR/tmp/capture.png"             # Read 툴로 열어 픽셀 판정
```

함정 모음:
- **metro를 파이프로 감싸지 말 것**: `npx expo start | head -N`은 N줄 도달 시 SIGPIPE로 metro가 죽는다. 파일 리다이렉트 + run_in_background. 캐시 에러("Unable to deserialize")는 `--clear`.
- metro는 **메인 트리에서만** (워크트리는 metro.config blockList에 막힘).
- dev 경고 토스트가 하단 UI를 가림 — 캡처 전 ✕ 탭 (좌표 예: 1251,2781 @1344px 폭).
- 에뮬 불안정기에 딥링크가 **조용히 실패**해 직전 화면이 찍힘 — "엉뚱한 화면" P0는 재캡처 먼저.
- 다른 에이전트가 arm64-only APK를 덮어씌우면 "keeps stopping"(SoLoader ABI 크래시) → 전 ABI debug APK(`android/app/build/outputs/apk/debug/app-debug.apk`)로 uninstall-first 재설치 → QA 재로그인.
- QA 로그인: 온보딩 Skip(우상단) → "Log in to begin" → "Continue with email" → `adb shell input text`로 `E:\2ndB\.env.test`의 QA_TEST_EMAIL/QA_TEST_PASSWORD → Sign in → Google 시트 "Never". 계정 새로 만들지 말 것.
- 콜드부트는 데이터 보존 (로그인 유지). uninstall만 로그인이 날아감.

## 5. 서브에이전트 위임 (i18n 배치에서 3회 검증된 패턴)

**언제**: 기계적·대량·독립 작업 (i18n 삼항 추출, 다파일 스윕). **직접 할 것**: 판단이 필요한 것 (법무 인접 카피 분류, 시각 결함 판정, 커밋/PR/머지).

### 스폰 템플릿 (Agent 툴, 실전 예제 — 배치17에서 그대로 사용)

```
Agent({
  description: "i18n batch N: <files>",
  name: "i18n-batch-N",                      // 이름 있으면 SendMessage로 후속 질의 가능
  subagent_type: "general-purpose",
  prompt: `Work EXCLUSIVELY in the worktree E:/2ndB/.worktrees/loop-emu-N (branch claude/loop-emu-fixes-N,
node_modules is a junction — do NOT run npm install). Do NOT commit or push.

TASK: convert inline ko/en copy ternaries to i18n keys in exactly these files: <list>.

⚠️ HARD EXCLUSIONS — leave byte-identical, add no comments: <법무/약속 문자열 file:line 목록>.
Also DO NOT convert: canon bilingual data selects, locale derivations.

CONVENTIONS: check each file's useTranslation() ns first and match siblings; ko/en byte-preserved;
es/pt/id authored fresh (no em dash U+2014, no clinical vocab, mascot 세컨비→SecondB);
NEVER name an interpolation variable "count" (i18next plural-suffix), use {{n}};
locale JSON = CRLF + 2-space, write with byte-safe node script (rebuild entries in order,
(JSON.stringify(j,null,2)+'\n').replace(/\n/g,'\r\n')); C7 parity must hold (npm run check:i18n).

VERIFY: npm run verify must exit 0. Guard 실패 시 자기 변경을 고치거나 되돌릴 것 (가드 약화 금지).

REPORT (final message, plain text): ns choices + rationale, new keys per ns (key = ko value),
reused keys, ternaries left with reasons, decisions, check results, verify tail.`
})
```

### 회수 절차 (오케스트레이터=나의 몫)

1. 에이전트 보고 수신 (idle 알림만 오고 보고 유실 시 → `SendMessage({to:"i18n-batch-N", ...})`로 재요청; 에이전트는 완료 후에도 이름으로 재개 가능)
2. **스팟체크**: `git status --porcelain`(범위 밖 파일 없나), 플래그 문자열 보존 grep, 로케일 churn(`git diff --numstat locales/ | awk '$1>150'`), ko byte 표본
3. **범위 밖 변경은 커밋에서 제외** — 단정 전에 에이전트에 출처 질의 (17회차: 범위 밖 2건이 에이전트 것이 아니라 워크트리의 기존 dirty였음. mtime으로 판별)
4. 최종 verify를 **내가 단독 재실행** (`npm run verify > log; echo EXIT=$?` — 파이프로 exit 마스킹 금지)
5. 명시 경로 add → 커밋(아래 트레일러) → push → PR → auto-merge
6. 위임 중 대기는 ScheduleWakeup 1200s (완료 알림이 먼저 깨움)

### 병렬 fan-out이 필요할 때 (대규모 감사/스윕)

Workflow 툴 사용 (ultracode 세션 = 실질 작업에 기본 사용). 주의: `agent({schema})` 검증 서브에이전트가 자주 미호출 실패 — **verify는 schema 없이 텍스트 회수** 후 내가 종합. 적대적 verify가 "N confirmed"라 해도 finder와 같은 프레임워크 오해를 공유하면 위양성 — 적용 전 내 framework-aware 최종 패스 필수 (특히 isDeepSpaceUI 위임).

## 6. 워크트리 규율 (사고 이력 있음 — 정확히 지킬 것)

```bash
# 생성 (레포 내부 .worktrees/ 에만)
cd /e/2ndB && git worktree add .worktrees/<name> -b <branch> origin/main
cmd //c "mklink /J E:\\2ndB\\.worktrees\\<name>\\node_modules E:\\2ndB\\node_modules"

# 삭제 — 반드시 3단계 분리, 출력 억제 금지 (한 줄로 묶고 출력 버렸다가 공유 node_modules 전멸 사고 1회)
cmd //c "rmdir E:\\2ndB\\.worktrees\\<name>\\node_modules"          # ① junction만 rmdir
if [ -e "/e/2ndB/.worktrees/<name>/node_modules" ]; then echo ABORT; fi   # ② 부재 확인
git worktree remove .worktrees/<name> && git branch -D <branch>     # ③ 그 다음에 remove
ls /e/2ndB/node_modules | wc -l                                     # ④ 공유 693 무결 확인
```

## 7. 스킬 활용법

- **persona-simulation** (`C:\Users\202502\.claude\skills\persona-simulation`): 픽스 누적 시 회귀검증 패스. 4축(연령×직업×소득×문화) 매트릭스로 **실제 화면 코드를 Read**하며 file:line 근거 발견만 채택. 호출 시 args에 "직전 픽스 회귀 확인 우선 + 이미 접수된 게이트 재보고 불요"를 명시하면 노이즈가 준다. 산출 = HTML 리포트(다크, 색 3, `<details>`) + SendUserFile.
- **simon-handoff**: 세션 마감 시. docs/HANDOFF.md prepend → 커밋 → PR → **main 머지까지** (푸시만으론 실패). 성공 기준: `git show origin/main:docs/HANDOFF.md` 첫 H2가 오늘 날짜.
- **/compact**: 컨텍스트 무거워지면 70~80%에서 선제 압축. 방향 잘못 갔으면 Rewind 우선.
- 완료 보고는 HTML(카드+details+인라인SVG, 1파일 자기완결) → SendUserFile — Simon 표준.

## 8. 커밋/PR 규격

- Conventional Commits. 커밋 트레일러(현 세션 기준 — 새 세션은 자기 세션 URL로 교체):
  ```
  Co-Authored-By: Claude <담당 모델명> <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_<현재세션ID>
  ```
- PR 본문 끝: `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + 세션 링크.
- `git add`는 **명시 경로만** (`-A`/`.` 금지 — stray 휩쓸림 사고 이력).
- 머지 정책: verify×2 + lint green이면 머지 가능 (Vercel 프리뷰 rate-limit 실패는 외부 요인, 게이트 아님). `gh pr merge --squash --auto` → MERGED 폴링. BEHIND면 `gh pr update-branch`, DIRTY면 워크트리에서 origin/main 머지 후 both-keep 해소.
- 로케일 파일 커밋 시 autocrlf churn 주의: 기본 `add -u`+commit, `-c core.autocrlf=false` 강제 금지.

## 9. i18n 컨벤션 (배치 15~17 누적 정본)

- ko/en = 소스 byte 보존. es/pt/id 신규 작성 (em dash 금지 — check:emdash가 잡음, 임상어휘 금지, 세컨비→SecondB).
- 보간 변수명 `count` 금지 (i18next plural-suffix 조회 발동) — `{{n}}` 사용. 복수형은 키 분리(briefingCountOne/briefingCount).
- ns 선택 = 파일의 `useTranslation()` 선언 + 형제 화면 관례 따름 (call-reflection→capture, iden→iden `ds.*`).
- check-i18n C7 = 로케일↔로케일 패리티만 검사 (코드→키 존재는 `i18n-static-keys.test.ts` 가드가 담당).
- 별 이름 캐논: `home:ds.home.domainName.*`(7 도메인) / `starName.*`(7 자기이해 별), 상대시간: `deepspace:time.*`.
- 변환 금지 대상: 법무/프라이버시 약속 문자열(게이트), canon 이중언어 데이터 select, check-constraints가 고정한 리터럴(onboarding "건너뛰기").

## 10. 함정 사전 (이 세션에서 밟은 것)

| 함정 | 대응 |
|---|---|
| `verify > out; tail` 이 exit 0으로 보임 | 단독 실행 또는 `echo EXIT=$?` |
| 패키지명 `com.simonyhkim.*`로 착각 | 정본 `com.simonk.secondbrain`, `pm list packages`로 확인 |
| Python 멀티라인 앵커가 CRLF 파일에서 미스 | `\r\n` 고려 또는 Edit 툴 사용 |
| JSX 속성 리스트 안 주석 | 문법 오류 — JSX 밖으로 |
| 워크트리에 출처 불명 dirty 파일 | 에이전트 탓으로 단정 금지, mtime 대조. 커밋에서 제외하고 출처 질의 |
| gh pr merge가 체크 실패에도 통과 | 머지 전 CI green 별도 확인 (--auto는 안전) |
| grep 한 패턴 스윕은 거의 미완 | 인벤토리→적대검증→가드테스트→회귀주입 |
