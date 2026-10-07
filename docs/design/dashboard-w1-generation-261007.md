# Dashboard W1 generation boundary

Implementation branch: feat/dashboard-w1-generation-261007, based on
9a8fd1b5 and the eight assistant decisions recorded in 8a34f7f3.

The next assistant work depends on W1, the model change and D6. The model
policy and D6 have existing owners. This change implements W1's deterministic
generation preflight and data boundary without editing those owners' paths.
It adds no model call, database write, permission prompt or background task.

Completion checks:

- User-local 06/13/20 slots, including fractional offsets, DST and opening
  after midnight; inactivity, repeat-slot and daily-call preflight.
- A fresh allowlisted model payload; flow-2 objects and raw device content
  cannot be copied into it, and record excerpts require their own consent.
- Unknown model output is schema checked and may only refer to supplied
  evidence. Midday reminders and duplicate/foreign inbox IDs are refused.
- Focused tests first, repository verification, local commit, _sync handoff.

The server must still atomically reserve a (user, slot key) and daily quota,
check current auth/consents/deletion status and call through the existing LLM
boundary. A preflight result does not grant permission to make a paid call.
Server storage, seats, cron installation, UI activation and deployment are
outside this deterministic boundary change and are not reported as complete.

## Implemented behavior

- generation-plan.ts reads slot hours and inactivity days from the W0 threshold
  registry. Hourly ticks qualify during the slot's first local hour, so UTC
  hourly ticks work in half-hour and quarter-hour zones. Opening may generate
  the current slot at any time. Before 06:00, the evening key belongs to the
  preceding calendar date; the daily quota date remains today's local date.
- A morning-push opt-in is the recorded exemption from the inactive-user skip.
  This preserves scheduled generation; this module sends no push or audio.
- generation-input.ts takes an owner-scoped reader snapshot. It constructs new
  nested objects for allowed fields, requires the separate record-use consent,
  omits weather place/coordinates, and exposes an evidence catalog inside the
  existing untrusted-data fence. W1 inbox accepts app sources only; mail and
  notification intake stay rejected until their later gates are implemented.
- generation-output.ts accepts unknown JSON, checks the W0 shape and supplied
  evidence references, rejects midday reminder suggestions, extra properties,
  duplicate/foreign inbox IDs, external action URLs and model-labelled rules.
  The generated tail_counts must be empty. Numeric totals must come from the
  reader and can be attached by application code after output validation.
- No thrown parser details, source text or supplied IDs are returned in errors.

## Limits before activation

The structured allowlist is not semantic DLP: authored reminder titles or
record prose could themselves mention a numeric amount. The source reader must
exclude forbidden material before a real call. Sender/title-only does not by
itself establish permission to read mail, nor does a reference establish the
truth of generated text.

The code has no runtime caller yet. Keep the three W1 purposes uncalled until
their existing policy/quota/consent owners finish the server integration.
Atomic quota reservation, the travel/time-zone quota policy, account deletion,
cache storage/expiry, external OTP/payment filtering, safety classification and
audit logging remain requirements of that integration. This change introduces
neither a general rule engine nor an alternative LLM wrapper.

## Validation

- RED: slot preflight assertions failed 30/30 before implementation; input/output
  tests failed 12/31 before implementation, then the additional evidence-catalog
  and generated-total checks failed 2/32 before their fixes.
- GREEN: 62 new tests pass. Full npm run verify with --runInBand passes all
  static gates and 940 suites / 12,770 tests. TDD staging guard and diff check pass.
- No UI change, native recording/location exercise, model API call, production
  DB write, migration application, deployment or dedicated branch APK build.
- app:parity reports the existing origin/main service equal at 8fabe684 with
  APK build 37583012047. This is service parity, not publication of this branch.
