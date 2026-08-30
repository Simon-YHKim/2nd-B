# Portable Asset & Lineage Manifest — 2026-08-30

이 문서는 **다른 PC의 fresh clone만으로** 2nd-B의 P1 UI/UX 레퍼런스와 HustleK
오프닝 정본을 같은 바이트로 확인하고, 같은 결정적 산출물을 다시 만드는 계약이다.
로컬 `Downloads`, `.codex/visualizations`, 기존 worktree, ignored `Output/`은 정본이 아니다.

## 1. 한 줄 계약

```bash
node scripts/verify-portable-handoff.mjs
```

fresh clone에서 위 명령이 `PASS`면 다음이 모두 같다.

- Git이 추적하는 필수 인계 문서와 합성기
- 승인 HustleK v1 atlas, review GIF, 앱용 v2 rect atlas, 앱용 opening strip
- PIXEL-CLAY 레퍼런스 shell
- captures 93개와 structure 93개의 **파일명, 바이트, 390×820 기하**
- 금지된 계보 에셋이 Git에 들어오지 않았다는 사실
- ignored 재생성 경로가 추적되지 않고 `.gitignore` 경계를 유지한다는 사실

검사는 Node.js 내장 모듈과 Git만 사용한다. 네트워크, 시크릿, 이미지 생성 도구가 필요 없다.

## 2. 정본 우선순위

1. 시스템·현재 사용자 요청과 현재 `AGENTS.md`의 포인터, `CLAUDE.md`의 최신 결정
2. `docs/PRD.md` Draft v4, `src/lib/persona/seven-stars.ts`, `docs/CONCEPT.md`,
   `docs/CONSTRAINTS.md`, `DESIGN.md`
3. `docs/PIXEL-CLAY-MIGRATION.md`, `design/pixel_clay_260825/`
4. `docs/CONSTELLATION-DESIGN.md`는 현재 배너대로 역사 기록이며 새 모델의 정본이 아니다
5. `design/CODEX-START-HERE.md`, `design/CODEX-UIUX-260827.md`,
   `design/CODEX-OPENING-260827.md`
6. 이 manifest에 고정된 정본 에셋과 해시
7. 외부 ZIP·과거 세션 archive는 **계보 확인용 역사 자료**일 뿐 생산 입력이 아니다

문서가 충돌하면 위 순서를 따른다. 외부 사본으로 Git 파일을 덮어쓰지 않는다.

## 3. Git에 들어 있는 portable 정본

### HustleK opening

| 역할 | Git 경로 | SHA-256 |
|---|---|---|
| 승인 v1 atlas PNG | `design/hustlek-opening-v1/hustlek-opening-atlas.png` | `2780df89aa6f1d472ec82a03610a6d7e81a20dbf9e767103cd198233e44213be` |
| 승인 165-frame review GIF | `design/hustlek-opening-v1/hustlek-opening-preview.gif` | `0bb0053cff1eb830d1858e4021c9c09f80051bb28f995df23eac5a25f357b89f` |
| 앱용 v2 integer-rect atlas | `assets/deepspace/hustlek-opening-v2.json` | `b599f379db85305b0a2aa82db3f87d7682bc70e59369186bcdcac7c65a79664f` |
| 앱용 48-frame strip | `assets/opening/hustlek-opening-strip.png` | `4753a818e59970908c79f5e82416b4e8781ddf5f019e311b2fdbe3252de56bc5` |

추가 불변식은 `docs/HUSTLEK-OPENING.md`와 두 결정적 합성기가 소유한다.

- v1 PNG decoded RGBA SHA-256:
  `b077a2d1a4c77c320e92a18b92a722f4a2905340e7b1ba27c47d6a0cf2c8cc49`
- 165-frame decoded RGB stream SHA-256:
  `be712f383b207d0de5508f485481aa41d8fe8769b087220993a357342780ff33`
- v2 구조: 96×96 walk 12셀 + turn/contact 6셀 + telescope 1셀
- v1 atlas와 hash는 변경하지 않는다. 앱용 변화는 별도 버전·계약으로 만든다.

### P1 PIXEL-CLAY reference bundle

트리 해시는 OS checkout 줄바꿈이 아니라 **Git index blob bytes**를 기준으로 한다.
파일 경로를 code-point 순으로 정렬한 뒤 각 파일마다
`<repo-relative-path> NUL <git-blob-bytes-sha256> LF`를 SHA-256에 넣어 계산한다.
따라서 Windows `core.autocrlf=true`와 Linux checkout이 같은 정본으로 판정된다.

| 역할 | Git 경로 | 개수·기하 | Tree SHA-256 |
|---|---|---|---|
| 결정적 화면 캡처 | `design/pixel_clay_260825/captures/` | 93 PNG · 각 390×820 | `4cbc34c5d20e80a7431a17433d69ef59fdb93871baf942f992f7545cc470c84b` |
| 결정적 DOM 구조 | `design/pixel_clay_260825/data/structure/` | 93 JSON · root box 390×820 | `f83405a533cec09182c678718785934e3d33d825a164804388f17b876548c18d` |
| offline reference shell | `design/pixel_clay_260825/app-offline.html` | 1 HTML | `c69f32dd2b85abc969c63d9d0b77de322f8a9e138627e9aa1300a48d6a60f105` |

`design/pixel_clay_260825/data/screens.json`이 93개 ID의 유일한 목록이다.
`port`·`stage`·route·score 데이터는 진행에 따라 바뀔 수 있으므로 이 manifest가 낡은 수치를
하드코딩하지 않는다. verifier는 현재 93개 ID가 capture와 structure의 basename에 정확히
일치하는지만 확인한다.

## 4. 원본 전달 번들의 역사적 위치

최초 전달 ZIP `2ndBcodexhandoff260827.zip`은 다음 상태로 검증됐다.

- ZIP SHA-256:
  `41cc0468316b3f7f20da69835bb95f15266a6b540e61557eb1afd0abca954821`
- entry 222개, 경로 탈출 0
- captures 93개, structure 93개
- Git 대조: 211개 byte-identical, 10개는 이후 Git에서 발전, `README-FIRST.md`만 비추적
- ZIP 내부 진입점: `design/CODEX-START-HERE.md`

ZIP과 독립 Markdown 3개는 **다른 PC에 복사할 필요가 없다.** 필요한 정본과 에셋은 Git에
이미 들어 있다. 독립 Markdown은 ZIP 내부 문서의 열람용 사본이므로 두 번 병합하지 않는다.

2026-08-30 비교 기준:

| 독립 사본 | Git 정본 | 관계 |
|---|---|---|
| `CODEXSTARTHERE.md` | `design/CODEX-START-HERE.md` | Git 정본이 이후 변경됨 · 덮어쓰기 금지 |
| `CODEXUIUX260827.md` | `design/CODEX-UIUX-260827.md` | 당시 byte-identical |
| `CODEXOPENING260827.md` | `design/CODEX-OPENING-260827.md` | Git 정본이 이후 변경됨 · 덮어쓰기 금지 |

## 5. 과거 HustleK archive 경계

과거 archive 식별자는 `hustlek-session-master-archive-20260827`이다. 원래 확인 대상은
다음 네 파일이었다.

```text
documentation/ASSET_LINEAGE.md
documentation/asset-manifest.json
final-pr/docs/HUSTLEK-OPENING.md
final-pr/Output/hustlek-opening/validation.json
```

이 archive는 Git 정본도 생산 경로도 아니며, 다른 PC의 필수 입력이 아니다. 현재 승인 결과는
Git의 v1 atlas, `docs/HUSTLEK-OPENING.md`, 결정적 합성기와 위 해시로 보존된다. archive를
별도로 전달받아도 읽기 전용 계보 대조에만 쓰고 앱으로 복사하지 않는다.

다음 항목은 어떤 archive나 ZIP에서도 복원·반입하지 않는다.

- `legacy-pixy`
- `rejected-associated`
- diagnostic 에셋
- 삭제된 `farm-character-32-native.png`
- 제3자 게임 sprite
- prompt로 새로 만든 대체 캐릭터

## 6. tracked / reproducible / external 경계

| 분류 | 예 | 다른 PC에서의 처리 |
|---|---|---|
| **tracked canonical** | 위 v1/v2 에셋, P1 93+93, 디자인 계약·합성기 | clone으로 받음. verifier PASS가 기준 |
| **ignored reproducible** | `Output/hustlek-opening/*`, v2 `validation.json`, review sheet | 합성기로 다시 생성. Git에 올리지 않음 |
| **same-host evidence** | HUMAN review HTML, live Home/Star 캡처, diagnostic APK | 정본이 아님. 새 PC에서는 현재 main으로 다시 캡처·검증 |
| **external history** | 최초 ZIP, 독립 MD, 과거 archive | 없어도 작업 가능. 받더라도 읽기 전용 비교만 |
| **release artifact** | exact-final-main EAS APK/AAB/IPA, OTA, GitHub Release | 최종 main에서 새로 생성·검증. diagnostic APK로 대체 금지 |

same-host evidence의 절대경로는 의도적으로 portable 계약에 넣지 않는다. 파일을 다른 PC로
복사해 HUMAN PASS를 재사용하면 환경·commit·시간이 달라져 검증 의미가 사라진다.

## 7. 다른 PC에서 처음 확인하는 순서

필수 도구는 Git과 Node.js다. 이 계약은 Node.js `v22.22.3`에서 검증했다. 오프닝을
재생성하려면 `uv`와 Pillow 12.2.0을 받을 네트워크 또는 사전 cache가 추가로 필요하다.
public HTTPS clone과 raw 문서 열람에는 GitHub 로그인이 필요 없지만, Actions/Release
다운로드에는 `gh auth status`가 성공하고 해당 저장소 read 권한이 있어야 한다. 토큰은
명령줄·문서·로그에 넣지 않는다.

### 공통

```bash
git clone https://github.com/Simon-YHKim/2nd-B.git
cd 2nd-B
git fetch origin main
git checkout main
git pull --ff-only origin main
node scripts/verify-portable-handoff.mjs
```

얕은 clone이라면 히스토리 확인 전에 다음을 먼저 실행한다.

```bash
git fetch --unshallow --tags origin
```

의존성은 **저장소당 한 번만** 설치한다.

```bash
npm ci --legacy-peer-deps
npm run verify
```

실제 변경은 clean `origin/main`에서 repo 내부 worktree로 분리한다.

```bash
git fetch origin main
NAME=portable-next-260830
mkdir -p .worktrees/codex
git worktree add ".worktrees/codex/$NAME" -b "codex/$NAME" origin/main
```

같은 branch나 경로가 있으면 삭제·재사용하지 말고 `NAME`을 새 고유값으로 바꾼다.
일반 개발 worktree는 루트에서 한 번 설치한 `node_modules`를 공유한다.

```bash
ln -s "$(pwd)/node_modules" ".worktrees/codex/$NAME/node_modules" # macOS/Linux
```

```powershell
$HandoffName = 'portable-next-260830'
New-Item -ItemType Directory -Force -Path '.worktrees/codex' | Out-Null
git worktree add ".worktrees/codex/$HandoffName" -b "codex/$HandoffName" origin/main
New-Item -ItemType Junction -Path ".worktrees/codex/$HandoffName/node_modules" `
  -Target (Resolve-Path './node_modules')
```

EAS local build처럼 fingerprint가 junction의 루트 밖 경로를 거부하는 경우만 이 공유 규칙의
예외다. 그 전용 worktree에서 별도 설치하거나 repository의 remote EAS workflow를 사용한다.

### 오프닝 결정적 재생성

```bash
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening.py && \
uv run --with Pillow==12.2.0 scripts/build-hustlek-opening-v2.py --check && \
uv run --with Pillow==12.2.0 scripts/build-opening-strip.py \
  --out Output/portable-handoff/hustlek-opening-strip.png && \
node scripts/verify-portable-handoff.mjs --generated
```

확인 기준:

- `Output/hustlek-opening/validation.json` → `status: "PASS"`
- `Output/hustlek-opening-v2/validation.json` → `status: "PASS"`
- strip 출력 → 48 frames, 320×180 cell, 8×6, 3,840ms
- 마지막 `--generated` verifier → 두 validation과 생성 strip의 tracked hash 모두 `PASS`

## 8. 다른 PC에서 받을 수 있는 보조 산출물

현재 기준 main `e7c94f938356b955d693f4132cb62683b8775b41`의 exact APK/AAB/IPA는 없다.
가장 가까운 arm64 진단 APK는 [Actions run 33297727914](https://github.com/Simon-YHKim/2nd-B/actions/runs/33297727914)의
`2ndb-android-4a54d76ff458391735d38f674c16bcb1ec047625`이며 2026-09-29에 만료된다.
앱 소스는 당시 main과 같지만 exact commit provenance가 아니므로 최종 산출물로 쓰지 않는다.

```bash
gh auth status
gh run download 33297727914 \
  -n 2ndb-android-4a54d76ff458391735d38f674c16bcb1ec047625
```

오래된 공개 fallback은 [v0.6.0 APK](https://github.com/Simon-YHKim/2nd-B/releases/tag/v0.6.0)와
[v0.0.9 AAB](https://github.com/Simon-YHKim/2nd-B/releases/tag/v0.0.9)다. 공개 Release IPA는 0개다.
모두 진단·역사 확인용이며 exact-final-main release artifact를 대체하지 않는다.

진행 중 HUMAN gate는 [Home PR #1500](https://github.com/Simon-YHKim/2nd-B/pull/1500)과
[Star PR #1502](https://github.com/Simon-YHKim/2nd-B/pull/1502)다. 다른 PC에서는 먼저
`gh pr checks 1500`과 `gh pr checks 1502`로 상태를 읽고, 캡처와 HUMAN PASS는 현재 commit에서
다시 수행한다.

## 9. 히스토리 재현

```bash
git log --follow -- design/hustlek-opening-v1/hustlek-opening-atlas.png
git log --follow -- assets/deepspace/hustlek-opening-v2.json
git log --follow -- design/pixel_clay_260825/data/screens.json
git log --all -- docs/HANDOFF.md
git show origin/main:docs/handoff/ARCHIVE-2026-05-25_to_2026-06-16.md
```

핵심 opening 구현 계보는 PR `#1458`, portable handoff 계보는 이 문서를 도입한 PR에서
확인한다. GitHub PR·Actions artifact는 보조 근거이며, 만료 가능한 artifact URL을 정본으로
삼지 않는다.

## 10. 실패 시 규칙

verifier가 `FAIL`이면:

1. expected hash를 먼저 바꾸지 않는다.
2. `git status --short`, 현재 branch, `git rev-parse HEAD`를 확인한다.
3. `git diff -- <failed-path>`와 해당 파일의 `git log --follow`를 확인한다.
4. 승인된 새 에셋 변경이라면 에셋·합성기·검사·이 manifest를 같은 전용 PR에서 갱신한다.
5. 승인 근거가 없으면 파일을 생산 경로에 넣지 않고 차이를 보고한다.

이 계약은 “어느 PC인가”가 아니라 **Git commit + 검증된 바이트인가**로 동일성을 판정한다.
