#!/usr/bin/env bash
# Manual SimonK Stack bootstrap. This file is intentionally not a SessionStart
# hook. Run it only after reporting the need for an update:
#   bash .claude/hooks/session-start.sh --run

set -euo pipefail
umask 077

readonly DEFAULT_SIMON_STACK_REF="8fc4f42fef463228945b1871c3eca2b195a55b09"
readonly SIMON_STACK_REPO="https://github.com/Simon-YHKim/SimonK-stack"
SIMON_STACK_REF="${SIMON_STACK_REF:-$DEFAULT_SIMON_STACK_REF}"
TMP_ROOT="${TMPDIR:-${TMP:-/tmp}}"
STAGING_DIR=""

if [[ $# -ne 1 || "$1" != "--run" ]]; then
  printf '%s\n' "[simon-stack-bootstrap] Manual action required. Re-run with --run to install the pinned SimonK Stack."
  exit 2
fi

if [[ ! "$SIMON_STACK_REF" =~ ^[0-9a-f]{40}$ ]]; then
  printf '%s\n' "[simon-stack-bootstrap] ERROR: SIMON_STACK_REF must be a lowercase 40-character commit SHA"
  exit 2
fi

# External commands are forbidden above this line.

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_INDEX_FILE \
  GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES \
  GIT_CONFIG GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_TEMPLATE_DIR

log() {
  printf '[simon-stack-bootstrap] %s\n' "$*"
}

safe_git() {
  GIT_CONFIG_NOSYSTEM=1 \
  GIT_CONFIG_GLOBAL=/dev/null \
  GIT_TERMINAL_PROMPT=0 \
    command git -c core.hooksPath=/dev/null \
      -c maintenance.auto=false \
      -c fetch.autoMaintenance=false \
      -c protocol.allow=never \
      -c protocol.https.allow=always \
      -c fetch.fsckObjects=true \
      -c transfer.fsckObjects=true \
      "$@"
}

cleanup() {
  if [[ -z "$STAGING_DIR" ]]; then
    return
  fi

  case "$STAGING_DIR" in
    "${TMP_ROOT%/}"/simon-stack-bootstrap.*)
      rm -rf -- "$STAGING_DIR"
      ;;
    *)
      log "ERROR: refusing to clean unexpected staging path"
      return 1
      ;;
  esac
}

if [[ ! -d "$TMP_ROOT" ]]; then
  log "ERROR: temporary directory does not exist"
  exit 1
fi

TMP_ROOT="$(cd "$TMP_ROOT" && pwd -P)"
STAGING_DIR="$(mktemp -d "${TMP_ROOT%/}/simon-stack-bootstrap.XXXXXXXX")"
trap cleanup EXIT
STAGING_DIR="$(cd "$STAGING_DIR" && pwd -P)"

case "$STAGING_DIR" in
  "${TMP_ROOT%/}"/simon-stack-bootstrap.*) ;;
  *)
    log "ERROR: mktemp returned an unexpected staging path"
    exit 1
    ;;
esac

readonly CHECKOUT_DIR="$STAGING_DIR/repo"
readonly EMPTY_TEMPLATE_DIR="$STAGING_DIR/empty-template"
mkdir -m 700 "$CHECKOUT_DIR"
mkdir -m 700 "$EMPTY_TEMPLATE_DIR"
safe_git init --quiet --template="$EMPTY_TEMPLATE_DIR" "$CHECKOUT_DIR"
safe_git -C "$CHECKOUT_DIR" remote add origin "$SIMON_STACK_REPO"

log "Fetching immutable SimonK Stack commit $SIMON_STACK_REF"
safe_git -C "$CHECKOUT_DIR" fetch --no-tags --no-recurse-submodules --depth 1 origin "$SIMON_STACK_REF"
FETCHED_SHA="$(safe_git -C "$CHECKOUT_DIR" rev-parse --verify "FETCH_HEAD^{commit}")"

if [[ "$FETCHED_SHA" != "$SIMON_STACK_REF" ]]; then
  log "ERROR: fetched SHA mismatch"
  exit 1
fi

safe_git -C "$CHECKOUT_DIR" checkout --detach --quiet "$FETCHED_SHA"

readonly UPSTREAM_HOOK="$CHECKOUT_DIR/.claude/hooks/session-start.sh"
if [[ ! -f "$UPSTREAM_HOOK" || -L "$UPSTREAM_HOOK" ]]; then
  log "ERROR: pinned upstream session hook is missing or is a symlink"
  exit 1
fi

readonly UPSTREAM_HOOK_DIR="$(cd -P "$(dirname "$UPSTREAM_HOOK")" && pwd)"
if [[ "$UPSTREAM_HOOK_DIR" != "$CHECKOUT_DIR/.claude/hooks" ]]; then
  log "ERROR: upstream session hook resolved outside the staged checkout"
  exit 1
fi

log "Delegating to the verified pinned checkout"
CLAUDE_PROJECT_DIR="$CHECKOUT_DIR" bash "$UPSTREAM_HOOK"
log "Bootstrap completed"
