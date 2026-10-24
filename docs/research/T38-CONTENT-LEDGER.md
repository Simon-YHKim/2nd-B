# T38 D3a: inactive content mutation ledger

This change implements the memory-only D3a foundation. It does not activate a
production content wipe, change the existing deletion helpers, or install a
default ledger instance. The approved R2 design hash is
`8b7c6b0bab9e845f40b873d21b0a3d13d7ff97e8a789766cc9b7ee6da253afe0`.
Its source manifest hash is
`3b14f674473cd9bcfaea089b03fb87fac8d345ea3f878d10aa89c2bbdbd008e0`.

## Ownership and facts

`createContentWipeLedger()` has no transport or subscriptions at construction.
Its only import is the `AccountOwnerLease` type. Each owner has a content
generation, immutable intent identities, and a retained set of mutation facts.
Tickets and deletion permits are opaque object identities; copied objects and
handles from another factory cannot issue or settle requests.

The shared ledger and snapshots contain metadata only. Bodies, JWTs, signals,
promises, session objects, original structured rows and Storage paths belong to
private adapters. Operation and step IDs must be opaque identifiers, never
filenames or body fragments. There is no timer, disposal reset or persistence
claim: process restart still requires the separate server authority work.

Mutation registration publishes its metadata, then checks owner, epoch,
generation and wipe state again. `issueMutation` checks again after the caller's
final gate, records `issued-pending`, and calls dispatch synchronously before any
publication or await. A thrown or rejected dispatch becomes `unknown`.
Resolution alone is not a commit receipt; the private adapter must classify it.
Only the original ticket can settle its original fact after an account change.
Settlement publication cannot start another mutation or deletion attempt.

Repeated identical terminal receipts are idempotent. Contradictory terminal
receipts preserve the original fact and block that owner for integrity review.
Pending or unknown work survives account A to B to A and prevents deletion or
a fresh start. An abort, a timeout and a day passing are not proof of non-commit.

## Wipe and deletion protocol

1. `beginWipe(owner, expectedGeneration, explicitIntentId)` advances generation,
   closes registered but unissued work, and blocks the body before notifying a
   fixed snapshot of boundary listeners. Every listener is called. Only
   synchronous `true` is ACK; false, throw, Promise and undefined remain sticky
   failures. ACK proves body retirement, not mutation drain.
2. `claimDeletionAttempt` requires all ACKs and zero unresolved owner tickets.
   The opaque permit binds owner epoch, wipe and generation. It is checked
   again after publication. A metadata snapshot alone cannot authorize I/O.
3. Each physical deletion request uses `acquireDeletion` and `issueMutation`.
   Required order is wiki pages, sources, records DB, record photo batches,
   usage, then self contexts and clipper templates. A required-stage definite
   failure stops that attempt. Unknown stops all subsequent requests.
4. After definite drain, `finishWipe` closes the attempt and derives its receipt
   from recorded facts. Required-stage failures remain blocked; only confirmed
   core cleanup plus attempted, terminal derived cleanup can become eligible.
   Derived definite failures yield an eligible partial result. Derived unknown
   or not-attempted work does not.
5. Retry is explicit: finish a drained attempt, then claim a new permit. Every
   stage consumes its physical ticket in that attempt, including derived refusal
   and a final caller gate's not-issued outcome. Neither can replace its ticket
   under the same permit. Another derived stage may still proceed. An old
   epoch permit cannot execute after account return. A current explicit resume
   may replace it only after its issued tickets settle. Late settlement never
   dispatches a next stage. Confirmed stages cannot be repeated.

The original records DELETE ticket receives its DB count independently of photo
cleanup. Its photo plan starts as `unconfirmed` before dispatch. The private
adapter must validate the complete original returned rows, build a deduplicated
immutable path manifest, and register only row and batch counts in the ledger.
Missing rows or count mismatch cannot be converted to a zero-photo receipt.
Batch sizes are 1 to 100; a confirmed empty plan has no photo requests. Batch
counts are copied densely before validation so missing slots are rejected before
the plan is fixed. A rejected plan leaves the original ticket available for a
valid plan, and it cannot report photo completion or throw on the next stage.

Each logical photo batch retains its opaque identity across physical retries.
Photo commit requires a private adapter's exact original path-set confirmation
and the matching observed count. Error-null or a short Storage response is
insufficient. An unknown first batch blocks the next batch, usage, derived
cleanup and new start. Losing an incomplete private manifest blocks further
cleanup; repeating the already committed records DELETE cannot reconstruct it.
The leaf trusts the adapter's scope proof and does not parse rows or paths.

## Atomic fresh session

`ChatContentBoundary.startAfterWipe` now requires a boolean commit ACK. The
ledger remains closed while A creates a candidate. Only synchronous true plus
the final owner/wipe/fact checks can clear the wipe. False, throw, Promise,
account hold and contradictory facts retain the receipt. A removes an already
created candidate if the producer rejects the commit, and restores the explicit
start requirement. A later bare attach cannot open a session after failure.
There is no synchronous boundary notification during opening.

A successful start creates empty turns, work and draft through the actual A
registry. Old wipe permits and reused intent IDs cannot delete newly entered
content. Another wipe requires a fresh explicit intent and generation check.

## Execution evidence and remaining adapters

The D3a integration suite executes the actual ledger, A registry, B controller,
account epoch and account session lease. Auth and terminal I/O are controlled
doubles. Its C3 supervisor is explicitly a future-adapter fixture: it preserves
an issued write's signal during content wipe, aborts immediately on account
hold, settles the fact before body checks, and releases the real lease once.
It is not evidence that C3 is already integrated into the app.

At the R2 implementation freeze, targeted execution is 189 PASS: D3a 65, existing
A 58, existing B 59, existing lease 7. The existing suites are unchanged.
Scoped ESLint, TypeScript, lexicon and runtime require-cycle checks pass
(runtime cycles: zero). The first run's 166 PASS / 1 FAIL is preserved: that
fixture did not cancel the pre-publication hold through the real epoch API.

The R1 implementation review blocked on two findings: same-permit derived/gate
refusal retries reused a physical step, and sparse photo arrays were accepted,
reported complete and then threw during stage lookup. The latter did not bypass
deletion. R1's 6 PASS / 3 assertion FAIL reviewer result remains preserved. R2
passes all nine original reviewer cases, with only the observations output path
changed to protect the original evidence. Implementation BLOCK 1 and the separate
design BLOCK 1 remain recorded; R2 independent review is still required.

Seven preserved R1 negative controls detect omitted registration fencing, premature issued
publication, omitted drain protection, false photo completion, non-boolean
start ACK, implicit required-stage retry, and retained failed session candidates.
All detections are assertion failures with zero suite runtime errors. Removing
only the first drain guard survives because a second check still blocks the
permit; removing both is detected. Controls substitute scratch source copies,
not product files, and do not weaken the retained tests. Two R2 controls separately
remove the same-permit check and dense plan copy. Both are detected by the new
actual-function retry matrix and sparse-plan tests.

| Approved design groups | Evidence in this step | Remaining gate |
| --- | --- | --- |
| L01-L09 | Opaque tickets, registration/final publication races, one issue, unknown retention, late facts and conflicts | Production I/O adapters must preserve the protocol |
| W01-W18 | Actual A/B and lease with the explicit C3 fixture; drain/ACK/reentry, deletion receipts and atomic fresh start | Re-run W02/W03/W09 against actual C3 |
| P01-P04 | Actual leaf with 100+1 and 100+100+1 batch metadata, unknown/failure and explicit retry | Actual private Storage adapter |
| P05 | Actual photo ticket, account epoch and real lease preserve facts across hold/A/B/A; late receipt sends no next request | Actual production photo supervisor integration |
| P06 | DB count/plan mismatch and incomplete photo proof remain blocked | Complete original row/path parsing in D3b |
| I01/I02/P07/P08 | Not implemented or counted as passed here | C1b/C3/D3b/D4 actual transport/capture/delete integration |

The design's 37 groups are a plan, not 37 additional executed passes. The R1
actual `deleteAllRecords` photo-helper reproduction remains unchanged at
3 PASS / 2 FAIL. Those two failures must pass after D3b connects real deletion
helpers; the dormant leaf does not fix them. No full verification, CI, server
SQL, deployment, model call, browser or phone result is claimed by this step.
