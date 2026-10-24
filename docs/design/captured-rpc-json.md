# Captured JSON RPC preparation (T38 C1a)

This dormant helper returns the JSON value of one PostgREST RPC using the
caller's captured JWT and original AbortSignal. It does not reread auth, refresh
the token, retry, interpret a quota, or authorize a mutation. There is no runtime
caller in this preparation. Existing Edge invocation and error-only audit RPC
helpers remain unchanged.

`rpcJsonWithCapturedSession<T = unknown>` validates the route and token using the
existing transport primitives. A successful JSON response returns its value,
including `null`. `T` is only a TypeScript annotation; the future caller must
validate the actual response shape and range. It must not treat malformed JSON,
empty/204 responses, unexpected values, or a network failure as usage zero.

Non-success HTTP responses and malformed successful responses return the stable
request error with a non-enumerable Response context. The context retains the
status and original body so the caller can validate an expected SQL rejection.
Transport exceptions remain exceptions. No class of error alone proves that an
issued write did not commit, and the helper does not create a rollback receipt.

The transport does not inspect current account or content ownership after a
response. A late response can belong to an already-issued mutation. C1b must
validate and settle that original mutation ticket before checking the current
body/publication gate. The ticket must already exist before issuing fetch; a
timeout, abort, malformed response or uncertain outcome remains unknown, without
automatic resend or expiry. A valid result does not permit stale UI publication.
Owner/content fences before issuance and after settlement belong to that caller.

The full sequence remains C0/C1a/context preparation, then the shared D3a content
mutation ledger, C1b actual usage participation, C1c conversation and C3 supervisor.
Keep/capture/delete participation and full screen adoption are also required.
This helper does not activate T39, change server caps, or add a free retry.

Validation extends the existing transport suite with actual fetch request
inspection, JSON values, invalid routes/token, HTTP error context, malformed and
204 responses, rejection and late settlement. Fetch is the only I/O boundary;
these deterministic checks are not a live server, app parity or phone test.
