# Profile star import

Pending integrity follow-up: [G4IMPORT-261010](handoff/G4IMPORT-261010.md).
0242 alone adds per-field undo, atomic import limits and server enforcement of
confirmation for every new item, regardless of external `reported_basis` claims.
Simon approved the single-step rollout on 2026-10-10: only after daybreak PASS
with no new medium findings, apply 0242, verify it and immediately merge the client.
Old partial-confirmation requests are rejected between application and merge;
RPC signatures, receipts, history, withdrawal and profile saving remain compatible.
This PR is still a draft and 0242 has not been applied by this session.
The older behavior below describes #2187 and its separate 0239/0240 approval.

Implementation target: the approved constellation profile and an actual import flow on localhost:8081.

1. Parse the common `polascope.user-context` contract locally. Reject malformed, oversized and unsupported input. Keep drafts in memory only.
2. Let the person edit, confirm and select individual statements. Bulk selection excludes unconfirmed AI interpretations. Upload only selected statements and their cited sources.
3. Atomically save an authenticated, idempotent import batch and its source wiki page. Basic profile changes are explicit, optional and checked against the loaded revision.
4. Keep server history. Withdrawal removes the dedicated source page and imported text; restore previous profile values only while their revision is unchanged and their predecessor is still active.
5. Test parser, selection, retry, ownership, profile conflicts and withdrawal on a disposable local database. Run the repository verification, release preview and browser flow. Apply the reviewed server change before merging the client, then confirm localhost:8081 and app parity.

The import does not call an AI service, award brightness, create goals or schedule tasks. Existing AI consent still governs later chat use. The source wiki page is a direct transcription of the person's selected statements; automatic source expansion is disabled for these pages so withdrawal has no shared generated entities to erase. Previously sent chat messages are not retracted.

## Server application and compatibility

Simon explicitly approved production migrations and merge/8081 delivery on 2026-10-09. Reviewed migrations `0239_profile_context_import` and `0240_profile_context_import_erasure_registry` were applied to the 2nd-brain project before client activation. Production checks confirmed forced owner RLS, authenticated-only RPC execution, the erasure registry entry and unchanged user count. The QA account successfully applied and withdrew fictional selected statements; withdrawal cleared the document and undo text and unlinked the dedicated source.

Changed `profile_details` writes now require the revision-aware RPC. An older client cannot overwrite a newer profile; it must update before editing profile details. Unrelated profile updates retain their existing paths. Client rollback must keep this RPC integration. Do not disable the revision trigger while active import batches exist.

## Validation and operation

- Account-export follow-up (G4-05): [G4EXPORT-261010](handoff/G4EXPORT-261010.md).
  After 0243 and the exporter deployment, `tables.profile_context_imports` includes
  the batch ID, owner ID, creation time, item count, profile-change count, status,
  withdrawal time and profile-restored flag. It excludes internal receipt fields,
  document and undo copies; imported text already travels with sources/wiki pages.
  The existing export format and account-erasure classification are unchanged.

- Local PostgreSQL 18 regression runner: contract validation, account ownership, duplicate/replayed requests, original evidence confirmation, conditional profile restoration, source erasure and concurrent requests passed. Run `node scripts/test-profile-import-sql.mjs <local-port> <local-role> <disposable-db>` against a disposable loopback database only.
- Browser release preview: common prompt copying, review and bulk selection, confirmation, actual save and withdrawal passed on the existing QA account.
- Final repository verification, PR/merge, localhost:8081 and APK parity evidence are recorded in shared session state `PROFILE-STAR-IMPORT-261009.json`.
- Native Android device/file-picker interaction still requires device QA. Web uses the same release configuration and source as the automatically built APK after merge.
