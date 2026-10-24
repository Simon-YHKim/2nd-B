/** Dormant O completion observation. No singleton, SDK, dispatch or runtime caller.
 * P (#2627) commit counts are request facts, never account-completion evidence.
 * Future wiring must establish an operation-owned fence and drain issued writes;
 * the gateway commit contract must be verified before O/H activation.
 */
export type ReceiptObservationScope = Readonly<{
  ownerId: string;
  operationId: string;
  executionId: string;
  startedAt: string;
}>;

type ReadResult = { data: unknown; error: unknown };
export type ReceiptObservationPorts = Readonly<{
  // Implementations must use authoritative, uncached exact-owner reads.
  readScope(scope: ReceiptObservationScope): Promise<unknown>;
  readAuth(ownerId: string): Promise<ReadResult>;
  readProfile(ownerId: string): Promise<ReadResult>;
  listStorage(bucket: 'raw-clippings' | 'record-photos', options: Readonly<{
    prefix: string; limit: 1; with_delimiter: false;
  }>): Promise<ReadResult>;
  now(): string;
}>;

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emptyPage = ({ data, error }: ReadResult): boolean => error === null && object(data)
  && data.hasNext === false && Array.isArray(data.objects) && data.objects.length === 0
  && Array.isArray(data.folders) && data.folders.length === 0;
const authAbsent = ({ data, error }: ReadResult): boolean => object(data) && data.user === null
  && object(error) && error.code === 'user_not_found' && error.status === 404;
const profileAbsent = ({ data, error }: ReadResult): boolean =>
  error === null && Array.isArray(data) && data.length === 0;
const sealed = (value: unknown, scope: ReceiptObservationScope): boolean => object(value)
  && value.ownerId === scope.ownerId && value.operationId === scope.operationId
  && value.executionId === scope.executionId && value.startedAt === scope.startedAt
  && value.phase === 'executing' && value.writesDrained === true && value.fenceOwned === true;

export type ReceiptCompletionObservation = Readonly<{
  scope: ReceiptObservationScope;
  state: 'observed' | 'unknown';
  observedAt: string | null;
  observations: Readonly<{ auth: 'absent' | 'unknown'; profile: 'absent' | 'unknown';
    raw: 'empty' | 'unknown'; photos: 'empty' | 'unknown' }>;
}>;

/** Read-only observer for the future executor. A 200 delete/count/cascade is not
 * a substitute for these independent observations. Never infers failed/abandoned.
 * Two fresh first-page reads bracket Auth/profile checks; no offset/cursor reuse.
 * Even two empty pages require an unchanged sealed scope: pages alone cannot
 * rule out a late overwrite or an already-issued remote request.
 */
export async function observeReceiptCompletion(
  input: ReceiptObservationScope, ports: ReceiptObservationPorts,
): Promise<ReceiptCompletionObservation> {
  const scope = Object.freeze({ ownerId: input.ownerId, operationId: input.operationId,
    executionId: input.executionId, startedAt: input.startedAt });
  const unknown = (): ReceiptCompletionObservation => Object.freeze({ scope, state: 'unknown', observedAt: null,
    observations: Object.freeze({ auth: 'unknown', profile: 'unknown', raw: 'unknown', photos: 'unknown' }) });
  if (![scope.ownerId, scope.operationId, scope.executionId].every(v => typeof v === 'string' && uuid.test(v))
    || !Number.isFinite(Date.parse(scope.startedAt))) return unknown();
  const options = Object.freeze({ prefix: `${scope.ownerId}/`, limit: 1 as const, with_delimiter: false as const });
  try {
    if (!sealed(await ports.readScope(scope), scope)) return unknown();
    if (!emptyPage(await ports.listStorage('raw-clippings', options))
      || !emptyPage(await ports.listStorage('record-photos', options))) return unknown();
    if (!authAbsent(await ports.readAuth(scope.ownerId))) return unknown();
    if (!profileAbsent(await ports.readProfile(scope.ownerId))) return unknown();
    // A late upload between the first page and the Auth response stays unknown.
    if (!emptyPage(await ports.listStorage('raw-clippings', options))
      || !emptyPage(await ports.listStorage('record-photos', options))) return unknown();
    if (!sealed(await ports.readScope(scope), scope)) return unknown();
    const observedAt = ports.now();
    if (!Number.isFinite(Date.parse(observedAt)) || Date.parse(observedAt) < Date.parse(scope.startedAt)) return unknown();
    return Object.freeze({ scope, state: 'observed', observedAt,
      observations: Object.freeze({ auth: 'absent', profile: 'absent', raw: 'empty', photos: 'empty' }) });
  } catch { return unknown(); }
}
