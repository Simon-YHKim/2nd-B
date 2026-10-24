#!/usr/bin/env python3
"""Optional native checks. All mutations stay inside a fresh temporary directory."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
from urllib.request import urlopen
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
PATCH = REPO / "patches" / "expo-local-authentication+56.0.5.patch"
PACKAGE = Path("node_modules/expo-local-authentication")
KOTLIN = Path("android/src/main/java/expo/modules/localauthentication")


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def fetch_artifacts(folder, args):
    entries = json.loads((HERE / "artifacts.json").read_text())["artifacts"]
    selected = [a for a in entries if args.mode != "runtime" or a["group"] != "api"]
    for entry in selected:
        name = entry["file"]
        if Path(name).name != name:
            raise ValueError("Artifact names must be plain filenames")
        target = folder / name
        candidates = [directory / name for directory in args.artifact_dir]
        cached = next((p for p in candidates if p.is_file()), None)
        if cached is not None:
            # Read only: never replace, repair, or write inside an artifact dir.
            shutil.copyfile(cached, target)
        elif args.offline:
            raise RuntimeError(f"Offline artifact missing: {name}")
        else:
            print(f"Downloading pinned public artifact: {name}", flush=True)
            with urlopen(entry["url"], timeout=60) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
        if digest(target) != entry["sha256"]:
            raise RuntimeError(f"SHA256 mismatch: {name}")
    return selected


def run_checked(command, cwd, log, show=False):
    # Git must not inherit a caller's index/worktree overrides. The patch is
    # applied only to the public package copy in our newly created directory.
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    result = subprocess.run(command, cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log.write_text(result.stdout)
    if show or result.returncode:
        print(result.stdout, end="", flush=True)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}); log: {log.name}")


def prepare_sources(workspace, artifacts):
    # Extract known regular files only. Do not extract tar paths, links or hooks.
    files = [KOTLIN / "LocalAuthenticationModule.kt", KOTLIN / "LocalAuthenticationRecords.kt",
             Path("android/src/main/AndroidManifest.xml"), Path("ios/LocalAuthenticationModule.swift")]
    with tarfile.open(artifacts / "expo-local-authentication-56.0.5.tgz", "r:gz") as archive:
        for relative in files:
            member = archive.getmember("package/" + relative.as_posix())
            if not member.isfile():
                raise RuntimeError(f"Unexpected package member: {relative}")
            target = workspace / PACKAGE / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
    # Snapshot once so concurrent edits cannot change what the reported hash means.
    snapshot = workspace / "input.patch"
    shutil.copyfile(PATCH, snapshot)
    run_checked(["git", "apply", "--check", str(snapshot)], workspace, workspace / "patch-check.log")
    run_checked(["git", "apply", str(snapshot)], workspace, workspace / "patch-apply.log")
    print(f"Checked-in patch SHA256: {digest(snapshot)}", flush=True)
    return workspace / PACKAGE / KOTLIN


def extract_jar(archive, member, output):
    with ZipFile(archive) as source:
        # Fixed member names, no filesystem path extraction.
        with source.open(member) as data, output.open("wb") as target:
            shutil.copyfileobj(data, target)


def compile_sources(workspace, artifacts, selected, sources, classpath, output, label):
    compiler = os.pathsep.join(str(artifacts / a["file"]) for a in selected if a["group"] == "compiler")
    command = ["java", "-cp", compiler, "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
               "-no-stdlib", "-no-reflect", "-classpath", os.pathsep.join(map(str, classpath)),
               "-d", str(output), *map(str, sources)]
    run_checked(command, workspace, workspace / f"{label}-compile.log")
    print(f"{label} compilation PASS (warnings, if any, are in {label}-compile.log)", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("all", "api", "runtime"), default="all")
    parser.add_argument("--artifact-dir", type=Path, action="append", default=[],
                        help="Optional read-only directory of pinned artifacts; repeatable")
    parser.add_argument("--offline", action="store_true", help="Fail instead of downloading missing artifacts")
    parser.add_argument("--keep-temp", action="store_true", help="Keep the generated temp directory for logs/debugging")
    args = parser.parse_args()
    for tool in ("java", "git"):
        if shutil.which(tool) is None:
            parser.error(f"Required command not found: {tool}")
    if not PATCH.is_file():
        parser.error(f"Checked-in patch is missing: {PATCH.name}")
    workspace = Path(tempfile.mkdtemp(prefix="polascope-native-auth-"))
    print(f"Temporary workspace: {workspace}", flush=True)
    try:
        artifacts = workspace / "artifacts"
        artifacts.mkdir()
        selected = fetch_artifacts(artifacts, args)
        native = prepare_sources(workspace, artifacts)
        stdlib = artifacts / "kotlin-stdlib-2.1.20.jar"
        annotations = artifacts / "annotation-jvm-1.9.1.jar"
        if args.mode in ("all", "api"):
            android = artifacts / "android-36.jar"
            with ZipFile(artifacts / "platform-36_r02.zip") as archive:
                members = [name for name in archive.namelist() if name.endswith("/android.jar")]
                if len(members) != 1:
                    raise RuntimeError("Expected exactly one official SDK android.jar")
                member = members[0]
            extract_jar(artifacts / "platform-36_r02.zip", member, android)
            biometric = artifacts / "biometric.jar"
            extract_jar(artifacts / "biometric.aar", "classes.jar", biometric)
            compile_sources(workspace, artifacts, selected,
                            sorted((HERE / "module-api-stubs").glob("*.kt")) + sorted(native.glob("*.kt")),
                            [stdlib, android, annotations, biometric], workspace / "native-api.jar", "api")
        if args.mode in ("all", "runtime"):
            output = workspace / "runtime.jar"
            compile_sources(workspace, artifacts, selected,
                            sorted((HERE / "runtime").glob("*.kt")) +
                            [native / "DeviceAuthenticationActivity.kt", native / "DeviceAuthenticationRequests.kt"],
                            [stdlib, annotations], output, "runtime")
            run_checked(["java", "-cp", os.pathsep.join(map(str, [output, stdlib])), "probe.HarnessKt"],
                        workspace, workspace / "runtime.log", show=True)
        print("PASS: optional checks completed; no APK, hardware, or Xcode validation claimed.", flush=True)
        return 0
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    finally:
        if args.keep_temp:
            print(f"Kept temporary files: {workspace}", flush=True)
        else:
            shutil.rmtree(workspace)


if __name__ == "__main__":
    sys.exit(main())
