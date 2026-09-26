# Server-first SQL numbering and live-ledger reconciliation

2026-09-26 KST. Draft PR #1865; numbered-source commit `3fd677dfc0883bb43b3fcc336bd0ae530546d920`.
This is a source and scratch-CI map, **not an
instruction to apply all eight files to production**. The original frozen draft
inventory and its two manifests remain intact. The numbered files copy the SQL
draft bytes exactly; their `INACTIVE DRAFT` headers are historical labels.

## Numbered source map

Each right-hand SHA-256 covers the Git blob bytes, independent of Windows
checkout line endings. The source draft with the same stem after
`UNNUMBERED_` has the same blob byte count and digest. At 14:35 KST,
`git ls-remote --heads origin` matched all 707 locally fetched remote heads and
`git rev-list --objects --all -- db/migrations` found no `0191`–`0198` file.
This is a collision check, not a reservation until the branch is pushed.

| File in `db/migrations` | Bytes | SHA-256 |
| --- | ---: | --- |
| `0191_signup_consent_admob_20260925.sql` | 6074 | `7a21c7ee2795487e5c46e0f75647e248293ca64812be1b2ac5e9d057df9fa9f8` |
| `0192_account_deletion_completion_fence.sql` | 9517 | `9ecee8a61fec82fa707b0873a251472da0979b3d9b39e2536a7c97ed5c286cef` |
| `0193_effective_llm_consent_current_contract.sql` | 17380 | `9403b773bc02539b8b17ca57a948c5b016fc6f2dc954a6895da84965f68e51a3` |
| `0194_llm_service_consent_management.sql` | 11664 | `5ea93e1165b357daff9a8d3c44f55e9b4e4f9aeb1a1f7b973a7b3d853cdddc36` |
| `0195_polaris_generation_allowance.sql` | 23446 | `0c11f829d35c1a4357753e0d30d4d775076e2aa5869f9fb66403f276027cb7fd` |
| `0196_reward_ssv_hardening.sql` | 25810 | `4a637061a2374666c6a5e3322340db6c58fdd7e2806c0beee79dc9ce3dd1246d` |
| `0197_paddle_refund_consequence_integrity.sql` | 62477 | `94d2b1f38673555e57b94d7b7b12b19391989e45fad28c1fce3a104207473e61` |
| `0198_service_contract_erasure_registry.sql` | 3526 | `51a5b807cbbdaa6d4064d77fe7e2ed016a5df3ba7534f60f4e8dd8d2297b9b3e` |

`0198` only adds four registry rows after its four product tables exist. The
canonical `db/erasure-registry.json` declares those rows in `forwardAdditions`.
The historical 0189 seed remains 66 rows. The 0189 rollback's ledger replay
list includes `service_contract_erasure_registry`, because dropping the registry
removes 0198's effect. Product provisioning files are not in that replay list.

## Production ledger is different from source numbering

The older 05:43 [console preflight](CONSOLE-PREFLIGHT-1865-260926.md) is a
historical snapshot. Subsequent authenticated, read-only queries found:

| Source effect | Observed production ledger | Required handling |
| --- | --- | --- |
| `0177_reward_ssv_tickets.sql` | `20260926031508 reward_ssv_tickets` | Match exact statements, catalog and ACL; do not replay by filename. |
| `0196_reward_ssv_hardening.sql` | `20260926031610 reward_ssv_hardening` | Match exact statements, catalog and ACL; exclude from apply list if verified. |
| `0172_reward_authorization_hardening.sql` | `20260926050258` and `20260926050638`, both named `0172_reward_authorization_hardening` | Investigate duplicate ledger entries; never apply a third time. |

The two 0172 ledger statement arrays differed by one serialized byte in our
read-only query but have the same whitespace-stripped MD5
(`e6a302e6a6937f8cf78d88944030bf06`). Main #1868 records that one attested
Simon GO reached two paths; do not remove either ledger row. A read-only
post-duplicate query matched all 13 expected reward function body/ACL
fingerprints in the local design-order replay. This does not prove current
Edge flag, signed callback behavior, or the cause of the duplicate entry.
`rewarded-ssv` listed as v91 at about 14:28 KST; main #1868 records its
`updated_at` remained 12:23:51, so the listing change is not a new deployment.
Main records `REWARD_SSV_ENABLED=1` under Simon's GO at 14:19. An unauthenticated
POST returned 401 after the enable check, but no signed callback canary has been
recorded. Recheck the current version and flag before any canary.

The Supabase CLI will not equate these timestamp/name rows with new four-digit
source filenames automatically. **Do not run a bulk production `db push` or
reapply Reward SQL.** The console owner must prove that the current encrypted
backup restores on an isolated clone, reconcile each ledger alias and the
remaining numbered prerequisites, and execute the reviewed per-file plan from a
fixed commit. The declined paid development branch is not assumed available.
Keep public AdMob and client features OFF until their own canaries pass. The
Reward server switch is already ON under the separate, recorded Simon GO.

### Authenticated read-only recheck, 2026-09-26 15:19 KST

The Supabase project `2nd-brain` still had 152 migration rows. The last four
were the two Reward aliases and the two 0172 rows above; no 0191–0198 source
name appeared. The aliases were compared with **Git blob** SQL, rather than the
Windows checkout's line endings:

| Local source → live ledger name | Local / live bytes | Exact MD5 | Whitespace-stripped MD5 |
| --- | ---: | --- | --- |
| 0177 → `reward_ssv_tickets` | 11541 / 11540 | differs | `e703cf9ddec3eb636cec9752574ae28a` matches |
| 0196 → `reward_ssv_hardening` | 25810 / 25810 | `a4d87d82fd7e8bda4f0cf3c1f930b025` matches | `9d9afb5a9489309e8cace1c04cb2222c` matches |
| 0172 → first and second 0172 rows | 9767 / 9765, 9766 | differs | `e6a302e6a6937f8cf78d88944030bf06` matches both |

The four current Reward RPCs (issue, issue limit, callback claim, settlement)
exist and are executable by `service_role`, not `anon` or `authenticated`.
The three checked legacy grant/consume RPCs exist but none of those three roles
can execute them. Both Reward tables exist; issued and consumed ticket counts
were zero. The Edge list still showed `rewarded-ssv` v91 with `updated_at`
12:23:51 KST. These checks support the source-to-ledger map; they do not prove
the live secret value, signed callback canary, or that the current encrypted
backup can be restored.

The live Paddle preflight counted four webhook rows, zero adjustment source or
legacy consequence rows, and zero self-service billing rows. This reduces the
known historical mapping risk for 0197; it does not prove a safe write window
or full compatibility with production data. `signup_consent_contract_status`,
`llm_consent_receipts`, account-deletion tombstones, and Polaris generation
tables were still absent. Supabase listed no development branches. No production
write was made in this recheck. Draft PR #1865 head `d506ad6d` had all four
required checks passing (lint, SQL, verify, web export).

### Encrypted backup evidence, 2026-09-26

The existing [daily backup workflow](../../.github/workflows/db-backup.yml)
ran on 2026-09-26 06:44–06:47 KST: `pg_dump`, age encryption, and artifact upload
all passed in [run 36193185108](https://github.com/Simon-YHKim/2nd-B/actions/runs/36193185108).
That artifact predates the 14:19 KST Reward server switch. A single manual run
on `main` at 16:16–16:19 KST passed the same three steps in
[run 36226292412](https://github.com/Simon-YHKim/2nd-B/actions/runs/36226292412).
GitHub lists one artifact, `db-backup-36226292412` (1,629,137 ZIP bytes),
unexpired until 2026-10-10 07:19 UTC. The extracted age file is 1,628,467 bytes,
starts with `age-encryption.org/v1`, and has SHA-256
`bebf8fc9e1448bbcd93cf480fd95ecf25a137e807cf50a4a843958abce3a05ea`.
The Backup environment lists the dedicated DB URL and age public-key **secret
names**; their values were not read. This establishes a newer encrypted dump
artifact, not a restore test. The older
[restore runbook](../DB-RESTORE-RUNBOOK.md) records an August drill, which cannot
prove this September artifact or the latest migration ledger is restorable.
The paid development branch remains declined; Docker's local daemon is stopped.
The live cost quote for a new scratch project in the existing 2ndB organization
(`Learner-thepoorman's Org`) is $0/month. No project was created; its creation,
restore of production user data, and later deletion await a separate user decision.
An isolated restore with the private key and a compatible Supabase scratch
environment is still required before production migration writes.

The same-day console policy dispatch `run_96f6b59c55e4` /
`ctx_cf18e2f35bd7` set the GitHub `Backup` and `ModelRefreshReadOnly`
environments to custom branch policy `main` only. Independent API reads found
exactly one branch rule and no tag rules in each; the `Production` environment
kept its existing `main` rule and required reviewer. The dispatch did not read
secret values or trigger a backup. See the
[credential boundary status](../GITHUB-ACTIONS-CREDENTIAL-BOUNDARIES.md).

Scratch CI replays all numbered files on a fresh PostgreSQL database. It proves
source order and contracts only; it cannot establish compatibility with live
data, restoration of the current production backup, current Edge secrets,
or device and payment behavior. See [live remaining work](REMAINING-WORK-260926.html) and
[session ownership](../SESSION-OWNERSHIP.md).
