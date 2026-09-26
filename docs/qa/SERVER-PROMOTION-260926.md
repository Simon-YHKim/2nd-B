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

The two 0172 statement arrays differ by one byte but have the same
whitespace-stripped MD5 (`e6a302e6a6937f8cf78d88944030bf06`). A read-only
post-duplicate query matched all 13 expected reward function body/ACL
fingerprints in the local design-order replay. This does not prove current
Edge flag, signed callback behavior, or the cause of the duplicate entry.
`rewarded-ssv` Edge v91 was observed at about 14:28 KST after v89 earlier;
its version and `REWARD_SSV_ENABLED` must be reread immediately before a canary.

The Supabase CLI will not equate these timestamp/name rows with new four-digit
source filenames automatically. **Do not run a bulk production `db push` or
reapply Reward SQL.** The console owner must first capture a restorable backup,
prove a restore on an isolated clone, reconcile each ledger alias and the
remaining numbered prerequisites, and execute the reviewed per-file plan from a
fixed commit. The declined paid development branch is not assumed available.
Keep Reward and public client features OFF until their own canaries pass.

Scratch CI replays all numbered files on a fresh PostgreSQL database. It proves
source order and contracts only; it cannot establish compatibility with live
data, a restorable production backup, the current Edge secrets, or device and
payment behavior. See [live remaining work](REMAINING-WORK-260926.html) and
[session ownership](../SESSION-OWNERSHIP.md).
