"""T06 local replay and mutations; fresh loopback databases only, never dotenv.

python scripts/test-before-user-created-signup.py 55487 t06_signup_test_ci
Creates dedicated databases without dropping any. Stop the disposable cluster
afterwards. Mutation copies stay in memory; repository SQL is never modified.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DRAFT = ROOT / "db/migration-drafts/UNNUMBERED_before_user_created_signup.sql"
TEST = ROOT / "db/migration-drafts/tests/before-user-created-signup.sql"
PORT, DATABASE = sys.argv[1:]
if not re.fullmatch(r"[0-9]{4,5}", PORT) or not 1024 <= int(PORT) <= 65535:
    raise SystemExit("Use an explicit loopback port above 1023")
if not re.fullmatch(r"t06_signup_test_[a-z0-9_]{1,25}", DATABASE):
    raise SystemExit("Use a fresh t06_signup_test_* database prefix")
ENV = {key: value for key, value in os.environ.items()
       if not key.upper().startswith("PG") or key == "PGPASSWORD"}


def run(sql, database, success=True):
    result = subprocess.run(
        ["psql", "-X", "--no-password", "-h", "127.0.0.1", "-p", PORT,
         "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"],
        input="SET statement_timeout='20s';\n" + sql,
        text=True, encoding="utf-8", capture_output=True, env=ENV, timeout=60,
    )
    if success and result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result


def create(database):
    run(f'CREATE DATABASE "{database}";', "postgres")


def expand(path, installer):
    if path.resolve() == DRAFT:
        return installer
    return re.sub(r"^\\ir (.+)$", lambda match: expand((path.parent / match[1].strip()).resolve(), installer),
                  path.read_text(encoding="utf-8"), flags=re.M)


installer = DRAFT.read_text(encoding="utf-8")
fixture = expand(TEST, installer)
create(DATABASE)
baseline = run(fixture, DATABASE)
if "T06 SQL contract PASS" not in baseline.stdout:
    raise AssertionError("Missing baseline completion marker")
print("PASS SQL assertions: " + baseline.stdout.strip().splitlines()[-1], flush=True)
print("PASS replay: one IP 1000 requests = 10 allowed + 990 limited; fresh IP allowed", flush=True)
print("PASS replay: IPv6 /64 30 requests = 10 refusals + 20 limited; one IP row", flush=True)
print("PASS replay: distributed known/unknown aliases = 10 eligible + 2 limited each", flush=True)

# Each exact replacement must fail a behavioral assertion, not SQL parsing or
# setup. A missing anchor or surviving mutant makes the CI lane red.
mutants = [
    ("ip_budget", "IF v_count >= 10 THEN", "IF false THEN", "limited IP leaves global budget alone"),
    ("ipv6_128", "network(set_masklen(v_address, 64))::text", "host(v_address)", "IPv6 /64 shares one IP row"),
    ("mapped_ipv4", "family(v_address) = 6 AND v_address <<= inet '::ffff:0.0.0.0/96'", "false", "IPv4-mapped IPv6 shares IPv4 budget"),
    ("mailbox_limit", "-- spread over different IPs. Apply before existence lookup for every mailbox.\n  IF v_count > 10 THEN",
     "-- spread over different IPs. Apply before existence lookup for every mailbox.\n  IF false THEN", "distributed canonical mailbox repeat 11"),
    ("global_cap", "IF v_budget > 1000 THEN", "IF false THEN", "real global budget replay refuses overflow"),
]
for name, before, after, failure in mutants:
    if installer.count(before) != 1:
        raise AssertionError("Mutation anchor drift: " + name)
    database = DATABASE + "_" + name
    create(database)
    result = run(expand(TEST, installer.replace(before, after, 1)), database, success=False)
    if result.returncode == 0 or "T06 assertion: " + failure not in result.stderr:
        raise AssertionError("Mutant did not fail its expected assertion: " + name + "\n" + result.stdout + result.stderr)
    print("KILLED " + name + ": " + failure, flush=True)

# Distinct real connections also exercise the singleton's serialization. These
# are contention replays, not a claim that every race schedule was forced.
database = DATABASE + "_concurrent"
create(database)
run(fixture.split("CREATE TEMP TABLE t06_assertions")[0] + "\nUPDATE public.signup_hook_policy SET enabled = true;", database)


def event(email, ip):
    return json.dumps({"metadata": {"ip_address": ip}, "user": {
        "id": "10000000-0000-4000-8000-000000000001", "email": email}})


def call(payload):
    # Only the synthetic payloads above reach this literal, never caller input.
    result = run("SELECT public.before_user_created_signup('" + payload.replace("'", "''") + "'::jsonb);", database)
    return json.loads(result.stdout.strip().splitlines()[-1])


for name in ("same_ip", "same_mailbox", "last_global_slot"):
    run("TRUNCATE public.signup_hook_attempts; UPDATE public.signup_hook_policy SET budget_count=0, budget_window='-infinity';", database)
    if name == "last_global_slot":
        run("UPDATE public.signup_hook_policy SET budget_count=999, budget_window=date_bin(interval '10 minutes',clock_timestamp(),timestamptz '2000-01-01 UTC');", database)
    payloads = [event("owner+concurrent@gmail.com" if name != "last_global_slot" else f"parallel{n}@example.invalid",
                      "198.51.100.200" if name == "same_ip" else f"198.51.100.{n}") for n in range(1, 13)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(call, payloads))
    counts = {code: sum((item.get("error", {}).get("http_code", 200) == code) for item in results)
              for code in (200, 403, 429)}
    expected = {200: 1, 403: 0, 429: 11} if name == "last_global_slot" else {200: 0, 403: 10, 429: 2}
    if counts != expected:
        raise AssertionError(f"Concurrency replay {name}: {counts} != {expected}")
    if name == "same_ip":
        budget = run("SELECT budget_count FROM public.signup_hook_policy;", database).stdout.strip().splitlines()[-1]
        if budget != "10":
            raise AssertionError("Concurrent limited IP charged budget: " + budget)
    print(f"PASS concurrent {name}: {counts}", flush=True)
print(f"PASS T06: SQL, 3 contention replays, {len(mutants)}/{len(mutants)} killed mutants", flush=True)
