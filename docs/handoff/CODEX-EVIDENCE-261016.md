# 복구 코드와 검증 증거 · 2026-10-16

[비공개 보고서·첨부 페이지](https://chatgpt.com/space/page_0e9b1903468c81918160f4a21fa83ab2)에서 bundle·증거 ZIP·색인·최종 추가 증거를 받을 수 있다. 이 공개 문서는 개인 전화번호나 비밀값을 포함하지 않는다. 파일은 로컬 경로에만 두지 않고 사용자 페이지에 업로드했다.

## 증거 스냅샷

2026-10-15 23:21:51 UTC / 10-16 08:21:51 KST. 원본 4,049개 파일, 108,126,511 bytes. ZIP 네 개 각각10MiB 미만, 모든 포함파일 SHA/크기·CRC·중복0 검증. 같은 폴더에 모두 풀면 `scratch/`와 `reports/` 구조를 복원한다. README/MANIFEST/PART가 각 ZIP에 있다. 이후 마지막 통합/인수 문서 결과는 페이지의 추가 증거 묶음이 우선한다.

| 파일 | SHA256 |
|---|---|
| `simon-handoff-evidence-261016.zip` | `0f2c0e56d8206b626b15a8c79fdf4eb718eaa350114288cf911a117a1c5d1f07` |
| `simon-handoff-evidence-261016.part02.zip` | `9673a87729b447d76423884f832b982cfde140e31972324d695ed9f299e82d78` |
| `simon-handoff-evidence-261016.part03.zip` | `af6ae5897189229a9eefd88899ce51eea953d5839a3830898e4350f33e6f55e7` |
| `simon-handoff-evidence-261016.part04.zip` | `8d415e3df9d0a00beb922c9060b13ea35bf9dc2d76243efbc983582dca14ff67` |
| `simon-handoff-evidence-261016.index.json` | `67a3123176e1ad84af7dd69b453db96cf88a178b1c29b3d520069499a30869ec` |

토큰패턴18파일은 값 출력 없이 제외했고, 거대 생성bundle·node_modules·임시git·source복제 등도 이유별로 기록했다. 비밀이 없다는 완전한 보증이 아니며 원본은 로컬에 그대로 있다. 제외목록은 archive manifest에 있다. 원실패/negative/setup실패도 보존했다. 다음 누락참조3개를 원문 성공증거로 쓰지 않는다.

- `review-t16-s1-r1-extra.json`: 원스크립트가 인용하지만 해당 파일 없음.
- `review-t16-web-a-browser.json`: 이전 인수문서가 인용하지만 해당 파일 없음.
- `t43-reasoning-usage-baseline/recheck-result.json`: 재실행 예시의 출력이므로 현재 파일 없음. 실제 baseline result.json과 run.log는 존재·보존.

아래 bundle 복구 명세는 작성자가 별도 저장소에서 검증한 원문이다. 원문이 작성될 때 미업로드였으나 root가 이후 위 비공개 페이지에 업로드했다. 마지막 업로드SHA도 동일하다.

---

# 미병합 후보 보존 bundle — 2026-10-16 인계

제품 수정·공개 업로드·push·merge 없이, 원래 네 branch ref의 Git 객체만 보존했다.
사용자 비공개 Page에 첨부할 파일이며 공개 main에는 미병합 코드가 반영되지 않았다.

- Bundle: `/workspace/reports/simon-handoff-pending-261016.bundle`
- 크기: **135,489 bytes** (132.31 KiB), 10 MiB 미만.
- Bundle SHA-256: `54798e8c73b4a3630ceddb36af0f316fa23307bebf5342e11e8bbcfcde83448f`
- JSON manifest: `/workspace/scratch/handoff-pending-bundle-manifest.json`
- JSON manifest SHA-256: `7a8606fbec2b05937187a4e7bd69b19e65712024d13563947c138e542f9f1424`
- 기준 main: `fc15cf869521afa5898485ac40d6ee34e6d8b2a0`
- 생성 revision: 아래 **정확한 4개 refs를 양수**, `^fc15cf869521afa5898485ac40d6ee34e6d8b2a0`를 제외 대상으로 사용.
- **증분 bundle**이다. 이 main의 전체 commit 이력/prerequisite가 이미 있는 Git 저장소에 가져와야 한다. 이 파일 하나를 빈 저장소에 clone하는 방식은 지원하지 않는다.

| 후보 | 보존한 ref | Commit | Tree |
|---|---|---|---|
| S2b | `refs/heads/feat/interview-atomic-finalize-s2b-261016` | `a3a5f2b0e1c3aa49f0e2d839791009224f22ba52` | `25f588a670f5d267136871e0fe4c2e0fd4613be5` |
| C3 | `refs/heads/feat/chat-operation-captured-261016` | `c86cec9fb3f11bbbe3d255c2df4a24cb6cf4369f` | `a517ebb897d3064d27d964b7ff90b68db771614d` |
| P | `refs/heads/feat/content-wipe-transport-261016` | `dc1a4e3815a422aa6f7e1d7ada40aa99a2117138` | `4e76733542130d7efe560792ca16aa2fb38fd919` |
| O-prepared | `refs/heads/feat/content-wipe-execution-261016` | `406d1e204ece7ef749e680a9d42623ffc022ec76` | `d6906bf18ba0350cd5e5c8c04ef13bbb18e5b599` |

O-prepared는 실행 구현 완료가 아니다. `406d1e20`은 기존 준비본에 **P R1**을 담은 상태이며 최신 P R2 `dc1a4e38`은 아직 통합하지 않았다. 보존한 후보의 독립 검토/전체 검증 상태는 각 인계 보고서를 따르며, bundle 검증 PASS가 제품 검토 PASS를 뜻하지 않는다.

## 실제 복원 검증

- 원 저장소 `git bundle verify`: exit 0.
- 별도 bare 저장소: `/workspace/scratch/handoff-pending-import-prye9ei3`.
- 이 별도 저장소에 `main-local` remote를 `/workspace/2nd-B`로 등록하여 정확한 기준 main을 **로컬 fetch**했다. 원 저장소가 partial clone이라 과거 blob 일부가 없는 탓에 일반 fetch는 실패했으며, `--filter=blob:none`으로 commit/tree 전체 이력을 가져왔다. 이 한계를 감추지 않는다.
- 별도 저장소에서 `git bundle verify`: exit 0; 정확한 4 refs fetch: exit 0.
- source와 import 저장소의 4 commit, 4 tree, 전체 tree listing SHA-256 일치.
- 각 candidate의 main 대비 존재하는 변경 파일 내용 SHA-256 일치.
- 증분 bundle에 실제 들어간 **44개 blob 전부**를 별도 object DB에서 SHA-256 대조해 일치 확인. `.git/objects/info/alternates`가 없는 독립 object DB다.
- `git fsck --connectivity-only --no-reflogs`: exit 0. main의 옛 blob 전체를 복제한 검사는 아니며, GitHub main 이력이 새 환경의 선행 조건이다.
- source HEAD, worktree 목록/HEAD, 정확한 4 refs의 전후 값 일치. checkout·reset·commit·기존 ref 변경 없음.
- bundle은 Git에 기록된 객체만 포함한다. 작업트리/ignored 파일, Git config/hooks, 환경 파일, node_modules를 추가하지 않았다. 포함 blob 경로의 `.env*`·키/인증서/credential 파일·node_modules 검사 0건. private-key/GitHub-token/AWS-key/Google-key/JWT 형태 검사 0건. 이 패턴 검사를 모든 종류의 비밀 탐지 보증으로 확대하지 않는다.

검증 로그:

- `/workspace/scratch/handoff-pending-bundle-verify-source.log`
- `/workspace/scratch/handoff-pending-bundle-verify-import.log`
- `/workspace/scratch/handoff-pending-bundle-import-fsck.log`

## 새 환경 복구 명령

먼저 정상 GitHub main의 **전체 이력**을 받는다. `--depth`를 쓰지 않는다. 기존 shallow clone을 쓴다면 `git fetch --unshallow origin main`으로 먼저 이력을 보충한다. bundle과 JSON manifest는 비공개 첨부에서 별도로 내려받는다.

```sh
git clone --branch main --single-branch https://github.com/Simon-YHKim/2nd-B.git 2nd-B-recovery
cd 2nd-B-recovery
git cat-file -e fc15cf869521afa5898485ac40d6ee34e6d8b2a0^{commit}
sha256sum /path/to/simon-handoff-pending-261016.bundle
# Expected: 54798e8c73b4a3630ceddb36af0f316fa23307bebf5342e11e8bbcfcde83448f
git bundle verify /path/to/simon-handoff-pending-261016.bundle
git fetch --no-tags /path/to/simon-handoff-pending-261016.bundle \
  'refs/heads/feat/interview-atomic-finalize-s2b-261016:refs/heads/feat/interview-atomic-finalize-s2b-261016' \
  'refs/heads/feat/chat-operation-captured-261016:refs/heads/feat/chat-operation-captured-261016' \
  'refs/heads/feat/content-wipe-transport-261016:refs/heads/feat/content-wipe-transport-261016' \
  'refs/heads/feat/content-wipe-execution-261016:refs/heads/feat/content-wipe-execution-261016'
git show-ref --heads
```

반드시 위 표의 네 commit과 tree ID를 다시 대조한다. 검사 전후 main을 reset하거나 후보를 main에 merge할 필요가 없다. 필요한 후보를 읽을 때만 저장소 안의 `.worktrees/` 아래 별도 작업트리를 만든다.

```sh
git rev-parse refs/heads/feat/interview-atomic-finalize-s2b-261016^{tree}
git worktree add .worktrees/recovered-interview-s2b feat/interview-atomic-finalize-s2b-261016
```

후속 구현은 사용자가 계속 진행을 요청한 다음 시작한다. 후보별 독립 검토, 전체 검증, 최신 main 통합, CI가 남아 있으면 인계의 pending 상태를 그대로 유지한다.
