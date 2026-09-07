#!/usr/bin/env bash
# Keep the fleet's shared checkout current — the folder every worktree's
# node_modules junction points at.
#
# Why this exists: on 2026-09-06 the shared checkout sat 168 commits behind
# origin/main. Its lockfile still asked for old versions, so every worktree
# resolved stale dependencies while looking perfectly healthy — CI was green and
# only the local box was wrong. The wrong diagnosis that followed cost a round.
#
# What it will and will not do:
#   - fast-forward ONLY. Never rebases, never merges divergent history, never
#     touches a dirty tree, never switches branches. If any of that is needed it
#     says so and stops — a human decides.
#   - lockfile change = WARN, never install. Reinstalling under a running
#     type-check corrupts the shared install, and a session that just started
#     has no idea what else is mid-flight.
#   - always exits 0. A session must never fail to start because of this.
#
# It is deliberately NOT part of .claude/hooks/session-start.sh: that file is
# vendored from SimonK-stack and edits there drift from upstream.

exec 2>&1
LOG() { echo "[shared-checkout] $*"; }

# Never let a failure here take the session down.
trap 'LOG "예상치 못한 오류 — 건너뜁니다"; exit 0' ERR

command -v git >/dev/null 2>&1 || { LOG "git 없음 — 건너뜁니다"; exit 0; }

# --- 1. Is this even the 2nd-B repo? ------------------------------------------
# Match on the git common dir, not the folder name (the project rule says so).
COMMON="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || {
  LOG "git 저장소가 아님 — 건너뜁니다"; exit 0; }
MAIN_TREE="$(dirname "$COMMON")"
case "$(echo "$MAIN_TREE" | tr 'A-Z\\' 'a-z/')" in
  */2ndb) ;;
  *) LOG "2nd-B 가 아님 ($MAIN_TREE) — 건너뜁니다"; exit 0 ;;
esac

# --- 2. One session at a time -------------------------------------------------
# mkdir is atomic, so two sessions starting together cannot both proceed.
LOCK="$COMMON/2ndb-shared-refresh.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  # A lock older than 10 minutes is a leftover from a killed session.
  if [ -d "$LOCK" ] && [ -z "$(find "$LOCK" -maxdepth 0 -mmin -10 2>/dev/null)" ]; then
    LOG "오래된 잠금 제거"
    rmdir "$LOCK" 2>/dev/null || true
    mkdir "$LOCK" 2>/dev/null || { LOG "다른 세션이 갱신 중 — 건너뜁니다"; exit 0; }
  else
    LOG "다른 세션이 갱신 중 — 건너뜁니다"
    exit 0
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

cd "$MAIN_TREE" 2>/dev/null || { LOG "공용 폴더로 이동 실패 — 건너뜁니다"; exit 0; }

# --- 3. Refuse to touch work in progress --------------------------------------
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ "$BRANCH" != "main" ]; then
  LOG "공용 폴더가 main 이 아니라 '$BRANCH' 입니다 — 손대지 않습니다"
  exit 0
fi
# Tracked edits mean someone is working here — stop. Untracked files do NOT
# block a fast-forward (git refuses on its own if one would be overwritten, and
# that case is handled below), and the shared checkout always carries a few
# stray build artefacts. Blocking on those would mean this never runs at all.
DIRTY="$(git status --porcelain --untracked-files=no 2>/dev/null | head -5)"
if [ -n "$DIRTY" ]; then
  LOG "공용 폴더에 커밋 안 된 수정이 있습니다 — 손대지 않습니다:"
  echo "$DIRTY" | sed 's/^/[shared-checkout]   /'
  exit 0
fi
UNTRACKED="$(git status --porcelain --untracked-files=normal 2>/dev/null | grep -c '^??' || true)"
[ "${UNTRACKED:-0}" -gt 0 ] && LOG "추적 안 되는 파일 ${UNTRACKED}개는 그대로 둡니다"

# --- 4. Fast-forward ----------------------------------------------------------
BEFORE="$(git rev-parse --short HEAD)"
LOCK_BEFORE="$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)"

if ! timeout 45 git fetch --quiet origin main 2>/dev/null; then
  LOG "fetch 실패(오프라인?) — 건너뜁니다"
  exit 0
fi

BEHIND="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
AHEAD="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"

if [ "$AHEAD" != "0" ]; then
  LOG "공용 폴더가 origin/main 보다 $AHEAD 커밋 앞섭니다 — 되감기가 필요하므로 멈춥니다"
  exit 0
fi
if [ "$BEHIND" = "0" ]; then
  LOG "이미 최신입니다 ($BEFORE)"
  exit 0
fi

if ! git merge --ff-only --quiet origin/main 2>/dev/null; then
  LOG "$BEHIND 커밋 뒤처졌지만 fast-forward 가 안 됩니다 — 사람이 볼 일입니다"
  exit 0
fi

AFTER="$(git rev-parse --short HEAD)"
LOG "$BEFORE → $AFTER ($BEHIND 커밋 앞으로 감았습니다)"

# --- 5. Lockfile: measure, report, never install -------------------------------
# "the lockfile changed" is NOT "the install is stale" - npm may already have the
# right versions on disk. On 2026-09-08 a peer read the first as the second, ran
# a targeted install to fix it, and npm removed ten packages nothing had asked it
# to touch; the real drift was one missing package. So report what was measured,
# and never install: another session's type-check may be running against this
# very node_modules.
LOCK_AFTER="$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)"
if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  if command -v node >/dev/null 2>&1; then
    node "$(dirname "$0")/lockfile-drift.mjs" "$BEFORE" "$AFTER" 2>/dev/null \
      | sed 's/^/[shared-checkout] /' \
      || LOG "락파일 실측 실패 — 판정 보류 (npm ci --legacy-peer-deps 로 맞출 수 있습니다)"
  else
    LOG "package-lock.json 이 바뀌었습니다. node 가 없어 실측은 못 했습니다"
    LOG "  맞추려면:  cd \"$MAIN_TREE\" && npm ci --legacy-peer-deps"
  fi
fi
exit 0
