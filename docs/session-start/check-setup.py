"""Validate the local session read chain without model calls or network access."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
REF = "refs/heads/docs/session-start-260906"
checks = []


def check(label, condition):
    if not condition:
        raise RuntimeError(label)
    checks.append(label)
    print("PASS " + label)


def git(cwd, *args):
    return subprocess.check_output(["git", "-C", str(cwd), *args])


def read(path):
    return path.read_text(encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--local-only", action="store_true")
    args = parser.parse_args()
    start = ROOT / "docs/session-start"
    check("AGENTS points to CLAUDE", "CLAUDE.md" in read(ROOT / "AGENTS.md"))
    check("CLAUDE points to startup", "docs/session-start/README.md" in read(ROOT / "CLAUDE.md"))
    queue = json.loads(read(start / "tasks.json"))
    ids = [task["id"] for task in queue["tasks"]]
    check("unique safe task IDs", len(ids) == len(set(ids)) and all(re.fullmatch(r"[A-Z0-9-]+", i) for i in ids))
    for task in queue["tasks"]:
        check(task["id"] + " entry", (start / task["entry"]).is_file())
        check(task["id"] + " actionable", bool(task["firstAction"] and task["doneWhen"]))
    docs = [*start.glob("*.md"), ROOT / "docs/store-copy/README.md"]
    for doc in docs:
        # Local Markdown links; external references and headings aren't filesystem paths.
        for target in re.findall(r"\]\(([^)]+)\)", read(doc)):
            if "://" not in target and not target.startswith("#"):
                check(doc.name + " -> " + target, (doc.parent / target.split("#")[0]).exists())
    store = ROOT / "docs/store-copy"
    observed = json.loads(read(store / "review-checks.json"))
    for file, key in [("drafts.json", "draftSha256"), ("review.html", "reportSha256")]:
        check("review evidence bytes: " + file, hashlib.sha256((store / file).read_bytes()).hexdigest() == observed[key])
    with tempfile.TemporaryDirectory(prefix="2ndb-claim-check-") as temp:
        claim = Path(temp) / "task.json"
        with claim.open("x", encoding="utf-8") as out:
            out.write('{"owner":"first"}')
        refused = False
        try:
            with claim.open("x", encoding="utf-8"):
                pass
        except FileExistsError:
            refused = True
        check("duplicate exclusive claim refused", refused and json.loads(read(claim))["owner"] == "first")
    if not args.local_only:
        home = Path.home()
        bridge = read(start / "bridge.md").strip()
        codex = home / ".codex/AGENTS.md"
        check("Codex global bridge installed", bridge in read(codex))
        override = home / ".codex/AGENTS.override.md"
        check("Codex override cannot hide bridge", not override.exists() or not read(override).strip() or bridge in read(override))
        check("Claude user rule installed", read(home / ".claude/rules/2ndb-session-start.md").strip() == bridge)
        sha = git(ROOT, "rev-parse", "--verify", REF + "^{commit}").decode().strip()
        locations = [Path("E:/2ndB"), Path("E:/2ndB/.worktrees/2ndB/TTL-Work"), ROOT]
        for location in locations:
            common = git(location, "rev-parse", "--path-format=absolute", "--git-common-dir").decode().strip()
            check(str(location) + " shared Git identity", Path(common).resolve() == Path("E:/2ndB/.git").resolve())
            for path in ["docs/session-start/README.md", "docs/session-start/tasks.json", "docs/store-copy/drafts.json"]:
                blob = git(location, "show", sha + ":" + path)
                expected = (ROOT / path).read_bytes().replace(b"\r\n", b"\n")
                check(str(location) + " reads " + path, blob.replace(b"\r\n", b"\n") == expected)
        for path in ["docs/store-copy/drafts.json", "docs/store-copy/review.html"]:
            check("Git preserves evidence bytes: " + path, git(ROOT, "show", sha + ":" + path) == (ROOT / path).read_bytes())
    print(f"{len(checks)} checks passed")


if __name__ == "__main__":
    main()
