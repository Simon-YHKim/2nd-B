/** Dormant web lifetime control. No production body writer or reader is exposed. */
export interface WebInterviewTicket {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly storageGeneration: string;
  readonly revision: number;
}

export interface WebInterviewPurgeReceipt extends WebInterviewTicket {
  readonly phase: "inactive";
  readonly logoutId: string;
}

export interface WebInterviewLogoutIntent {
  readonly v: 1;
  readonly kind: "web-interview-logout";
  readonly ownerId: string;
  readonly sessionId: string;
  readonly storageGeneration: string;
  readonly activeRevision: number;
  readonly logoutId: string;
  readonly scope: "global" | "local";
}

/** A fresh oncomplete observation, never permission to sign out later. */
export type WebInterviewObservation =
  | { readonly kind: "empty" }
  | { readonly kind: "active"; readonly ticket: WebInterviewTicket; readonly intent: WebInterviewLogoutIntent | null }
  | { readonly kind: "inactive"; readonly receipt: WebInterviewPurgeReceipt; readonly intent: WebInterviewLogoutIntent | null };

export interface WebInterviewLifecycle {
  readonly storageKey: string;
  inspect(): Promise<WebInterviewObservation>;
  prepareIntent(intent: WebInterviewLogoutIntent): Promise<WebInterviewLogoutIntent>;
  activate(
    identity: Omit<WebInterviewTicket, "revision">,
    previous: WebInterviewPurgeReceipt | null,
  ): Promise<WebInterviewTicket>;
  purge(ticket: WebInterviewTicket, logoutId: string, scope?: "global" | "local"): Promise<WebInterviewPurgeReceipt>;
  lookup(ticket: WebInterviewTicket, logoutId: string, scope?: "global" | "local"): Promise<WebInterviewPurgeReceipt | null>;
}

type Failure = "invalid" | "unsupported" | "unconfirmed" | "conflict" | "unconfirmed-missing-origin";

export class WebInterviewLifecycleError extends Error {
  constructor(readonly code: Failure) {
    super(`Web interview lifetime ${code}.`);
    this.name = "WebInterviewLifecycleError";
  }
}

interface Control extends WebInterviewTicket {
  readonly v: 1;
  readonly phase: "active" | "inactive";
  readonly logoutId: string | null;
}

const CONTROL_KEY = "current";
const BODY_KEY_PATH = ["ownerId", "sessionId", "storageGeneration"];
const CONTROL_FIELDS = ["v", ...BODY_KEY_PATH, "revision", "phase", "logoutId"].sort();

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function identityValid(value: Omit<WebInterviewTicket, "revision">): boolean {
  return identifier(value.ownerId) && identifier(value.sessionId) && identifier(value.storageGeneration);
}

function ticketValid(value: WebInterviewTicket): boolean {
  return identityValid(value) && Number.isSafeInteger(value.revision)
    && value.revision > 0 && value.revision < Number.MAX_SAFE_INTEGER;
}

function copyTicket(value: WebInterviewTicket): WebInterviewTicket {
  const copy = {
    ownerId: value?.ownerId,
    sessionId: value?.sessionId,
    storageGeneration: value?.storageGeneration,
    revision: value?.revision,
  };
  if (!ticketValid(copy)) throw new WebInterviewLifecycleError("invalid");
  return copy;
}

function copyReceipt(value: WebInterviewPurgeReceipt): WebInterviewPurgeReceipt {
  const copy = { ...copyTicket(value), phase: value.phase, logoutId: value.logoutId };
  if (copy.phase !== "inactive" || !identifier(copy.logoutId)) {
    throw new WebInterviewLifecycleError("invalid");
  }
  return copy;
}

function sameIdentity(a: WebInterviewTicket, b: WebInterviewTicket): boolean {
  return a.ownerId === b.ownerId && a.sessionId === b.sessionId
    && a.storageGeneration === b.storageGeneration;
}

function controlFrom(value: unknown): Control | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== CONTROL_FIELDS.join(",")) {
    throw new WebInterviewLifecycleError("unconfirmed");
  }
  const row = value as Control;
  if (!ticketValid(row) || row.v !== 1
    || (row.phase !== "active" && row.phase !== "inactive")
    || (row.phase === "active" ? row.logoutId !== null : !identifier(row.logoutId))) {
    throw new WebInterviewLifecycleError("unconfirmed");
  }
  return row;
}

function verifyBodies(control: Control | null, keys: IDBValidKey[]): void {
  // A supports one exact generation. Stray rows are evidence of an unsupported
  // or damaged writer, not permission to clear some other session's content.
  if (keys.length === 0) return;
  const key = keys[0];
  if (!control || control.phase !== "active" || keys.length !== 1 || !Array.isArray(key)
    || key.length !== 3 || key[0] !== control.ownerId || key[1] !== control.sessionId
    || key[2] !== control.storageGeneration) {
    throw new WebInterviewLifecycleError("unconfirmed");
  }
}

const INTENT_FIELDS = ["v", "kind", ...BODY_KEY_PATH, "activeRevision", "logoutId", "scope"].sort();

export function copyWebInterviewLogoutIntent(value: WebInterviewLogoutIntent): WebInterviewLogoutIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== INTENT_FIELDS.join(",")) {
    throw new WebInterviewLifecycleError("invalid");
  }
  const copy = { v: value.v, kind: value.kind, ownerId: value.ownerId, sessionId: value.sessionId,
    storageGeneration: value.storageGeneration, activeRevision: value.activeRevision,
    logoutId: value.logoutId, scope: value.scope };
  if (copy.v !== 1 || copy.kind !== "web-interview-logout"
    || !ticketValid({ ...copy, revision: copy.activeRevision }) || !identifier(copy.logoutId)
    || (copy.scope !== "global" && copy.scope !== "local")) {
    throw new WebInterviewLifecycleError("invalid");
  }
  return copy;
}

function verifyIntent(control: Control | null, value: unknown): WebInterviewLogoutIntent | null {
  if (value === undefined) return null;
  let intent: WebInterviewLogoutIntent;
  try { intent = copyWebInterviewLogoutIntent(value as WebInterviewLogoutIntent); }
  catch { throw new WebInterviewLifecycleError("unconfirmed"); }
  if (!control || !sameIdentity(control, { ...intent, revision: intent.activeRevision })
    || (control.phase === "active" ? control.revision !== intent.activeRevision
      : control.revision !== intent.activeRevision + 1 || control.logoutId !== intent.logoutId)) {
    throw new WebInterviewLifecycleError("unconfirmed");
  }
  return intent;
}

function requireOriginal(intent: WebInterviewLogoutIntent | null, ticket: WebInterviewTicket, logoutId: string, scope?: "global" | "local"): void {
  if (intent && (!sameIdentity(ticket, { ...intent, revision: intent.activeRevision })
    || ticket.revision !== intent.activeRevision || logoutId !== intent.logoutId
    || (scope !== undefined && scope !== intent.scope))) {
    throw new WebInterviewLifecycleError("conflict");
  }
}

function verifySchema(db: IDBDatabase, tx: IDBTransaction, withIntent: boolean): void {
  if ([...db.objectStoreNames].sort().join(",") !== (withIntent ? "bodies,control,logoutIntents" : "bodies,control")) {
    throw new WebInterviewLifecycleError("unconfirmed");
  }
  const controls = tx.objectStore("control");
  const bodies = tx.objectStore("bodies");
  if (controls.keyPath !== null || controls.autoIncrement || controls.indexNames.length
    || !Array.isArray(bodies.keyPath) || bodies.keyPath.join(",") !== BODY_KEY_PATH.join(",")
    || bodies.autoIncrement || bodies.indexNames.length) throw new WebInterviewLifecycleError("unconfirmed");
  if (withIntent) {
    const intents = tx.objectStore("logoutIntents");
    if (intents.keyPath !== null || intents.autoIncrement || intents.indexNames.length) {
      throw new WebInterviewLifecycleError("unconfirmed");
    }
  }
}

/** All catalog reads share D, including during versionchange. No payload reads. */
function readCatalog(
  tx: IDBTransaction, withIntent: boolean,
  ready: (control: Control | null, intent: WebInterviewLogoutIntent | null) => void,
  fail: (error?: unknown) => void,
): void {
  const controls = tx.objectStore("control");
  const rows = controls.getAll();
  const keys = controls.getAllKeys();
  const bodies = tx.objectStore("bodies").getAllKeys();
  const intents = withIntent ? tx.objectStore("logoutIntents").getAll() : null;
  const intentKeys = withIntent ? tx.objectStore("logoutIntents").getAllKeys() : null;
  const requests = [rows, keys, bodies, intents, intentKeys].filter((request) => request !== null);
  let remaining = requests.length;
  const read = () => {
    if (--remaining !== 0) return;
    try {
      if (rows.result.length > 1 || (rows.result.length === 1 && rows.result[0] === undefined)
        || keys.result.length !== rows.result.length
        || (keys.result.length === 1 && keys.result[0] !== CONTROL_KEY)
        || (intents && (intents.result.length > 1 || (intents.result.length === 1 && intents.result[0] === undefined)
          || intentKeys!.result.length !== intents.result.length
          || (intentKeys!.result.length === 1 && intentKeys!.result[0] !== CONTROL_KEY)))) {
        throw new WebInterviewLifecycleError("unconfirmed");
      }
      const control = controlFrom(rows.result[0]);
      verifyBodies(control, bodies.result);
      ready(control, verifyIntent(control, intents?.result[0]));
    } catch (error) { fail(error); }
  };
  for (const request of requests) { request.onsuccess = read; request.onerror = () => fail(); }
}

function receiptFor(control: Control, ticket: WebInterviewTicket, logoutId: string) {
  if (!sameIdentity(control, ticket)) throw new WebInterviewLifecycleError("conflict");
  if (control.phase === "inactive" && control.logoutId === logoutId
    && control.revision === ticket.revision + 1) {
    return { ...copyTicket(control), phase: "inactive" as const, logoutId };
  }
  if (control.phase !== "active" || control.revision !== ticket.revision) {
    throw new WebInterviewLifecycleError("conflict");
  }
  return null;
}

export function webInterviewDatabaseName(storageKey: string): string {
  if (!identifier(storageKey)) throw new WebInterviewLifecycleError("invalid");
  return `secondB.interviewWeb.v1:${storageKey}`;
}

/** Actual IndexedDB adapter; injection permits unavailable/late-open fault tests.
 * The timeout bounds the whole operation. Unknown commit requires the SAME
 * logoutId lookup; rejection never authorizes a later SDK signOut. */
export function createWebInterviewLifecycle(options: {
  storageKey: string;
  indexedDB?: IDBFactory | null;
  timeoutMs?: number;
}): WebInterviewLifecycle {
  const storageKey = options.storageKey;
  const name = webInterviewDatabaseName(storageKey);
  const factory = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
  const timeoutMs = options.timeoutMs ?? 4_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new WebInterviewLifecycleError("invalid");
  }

  function transaction<T>(
    mode: IDBTransactionMode,
    operation: (control: Control | null, tx: IDBTransaction, intent: WebInterviewLogoutIntent | null) => T,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!factory) { reject(new WebInterviewLifecycleError("unsupported")); return; }
      let live = true;
      let database: IDBDatabase | undefined;
      let tx: IDBTransaction | undefined;
      let result: T;
      let hasResult = false;
      const finish = (failure?: unknown) => {
        if (!live) return;
        live = false;
        clearTimeout(timer);
        database?.close();
        if (failure) reject(failure);
        else resolve(result);
      };
      const fail = (error: unknown = new WebInterviewLifecycleError("unconfirmed")) => {
        // Abort first, but never reinterpret abort failure as a deletion ACK.
        try { tx?.abort(); } catch { /* A commit may already have completed. */ }
        finish(error instanceof WebInterviewLifecycleError
          ? error : new WebInterviewLifecycleError("unconfirmed"));
      };
      const timer = setTimeout(() => fail(), timeoutMs);
      let request: IDBOpenDBRequest;
      try { request = factory.open(name, 2); }
      catch { fail(); return; }
      request.onerror = () => fail();
      request.onblocked = () => fail();
      request.onupgradeneeded = (event) => {
        const db = request.result;
        tx = request.transaction!;
        if (!live) { tx.abort(); db.close(); return; }
        tx.onabort = () => fail();
        tx.onerror = () => fail();
        try {
          if (event.oldVersion === 0 && db.objectStoreNames.length === 0) {
            db.createObjectStore("control");
            db.createObjectStore("bodies", { keyPath: BODY_KEY_PATH });
            db.createObjectStore("logoutIntents");
          } else if (event.oldVersion === 1) {
            verifySchema(db, tx, false);
            readCatalog(tx, false, () => {
              if (!live) { try { tx?.abort(); } catch { /* Already ended. */ } return; }
              db.createObjectStore("logoutIntents");
            }, fail);
          } else throw new WebInterviewLifecycleError("unconfirmed");
        } catch (error) { fail(error); }
      };
      request.onsuccess = () => {
        database = request.result;
        if (!live) { database.close(); return; }
        database.onversionchange = () => database?.close();
        try {
          if (database.version !== 2) throw new WebInterviewLifecycleError("unconfirmed");
          tx = database.transaction(["control", "bodies", "logoutIntents"], mode);
          verifySchema(database, tx, true);
          tx.onabort = () => fail();
          tx.onerror = () => fail();
          tx.oncomplete = () => {
            if (!hasResult) fail();
            else finish(); // The sole ACK, including prepare and read-only inspection.
          };
          readCatalog(tx, true, (control, intent) => {
            if (!live) return;
            result = operation(control, tx!, intent);
            hasResult = true;
          }, fail);
        } catch (error) { fail(error); }
      };
    });
  }

  return {
    storageKey,
    async inspect() {
      return transaction("readonly", (control, _tx, intent): WebInterviewObservation => {
        if (!control) return { kind: "empty" };
        if (control.phase === "active") return { kind: "active", ticket: copyTicket(control), intent };
        return { kind: "inactive", receipt: copyReceipt({ ...control, phase: "inactive", logoutId: control.logoutId! }), intent };
      });
    },
    async prepareIntent(value) {
      const intent = copyWebInterviewLogoutIntent(value);
      return transaction("readwrite", (control, tx, existing) => {
        const ticket = { ...intent, revision: intent.activeRevision };
        if (!control || control.phase !== "active" || !sameIdentity(control, ticket)
          || control.revision !== ticket.revision) throw new WebInterviewLifecycleError("conflict");
        if (existing) {
          requireOriginal(existing, ticket, intent.logoutId);
          if (existing.scope !== intent.scope) throw new WebInterviewLifecycleError("conflict");
          return existing;
        }
        tx.objectStore("logoutIntents").put(intent, CONTROL_KEY);
        return intent;
      });
    },
    async activate(identity, previous) {
      const next = { ownerId: identity?.ownerId, sessionId: identity?.sessionId,
        storageGeneration: identity?.storageGeneration };
      const prior = previous === null ? null : copyReceipt(previous);
      if (!identityValid(next)) throw new WebInterviewLifecycleError("invalid");
      return transaction("readwrite", (control, tx, intent) => {
        if (prior === null ? control !== null : !control || control.phase !== "inactive"
          || !sameIdentity(control, prior) || control.revision !== prior.revision
          || control.logoutId !== prior.logoutId || control.storageGeneration === next.storageGeneration) {
          throw new WebInterviewLifecycleError("conflict");
        }
        const ticket = { ...next, revision: (control?.revision ?? 0) + 1 };
        if (!ticketValid(ticket)) throw new WebInterviewLifecycleError("conflict");
        tx.objectStore("control").put({ ...ticket, v: 1, phase: "active", logoutId: null }, CONTROL_KEY);
        if (intent) tx.objectStore("logoutIntents").delete(CONTROL_KEY);
        return ticket;
      });
    },
    async purge(value, logoutId, scope) {
      const ticket = copyTicket(value);
      if (!identifier(logoutId) || (scope !== undefined && scope !== "global" && scope !== "local")) {
        throw new WebInterviewLifecycleError("invalid");
      }
      return transaction("readwrite", (control, tx, intent) => {
        if (!control) throw new WebInterviewLifecycleError("unconfirmed");
        requireOriginal(intent, ticket, logoutId, scope);
        const existing = receiptFor(control, ticket, logoutId);
        if (existing) return existing;
        const receipt = { ...ticket, revision: ticket.revision + 1, phase: "inactive" as const, logoutId };
        if (!ticketValid(receipt)) throw new WebInterviewLifecycleError("conflict");
        tx.objectStore("control").put({ ...receipt, v: 1 }, CONTROL_KEY);
        tx.objectStore("bodies").delete([ticket.ownerId, ticket.sessionId, ticket.storageGeneration]);
        return receipt;
      });
    },
    async lookup(value, logoutId, scope) {
      const ticket = copyTicket(value);
      if (!identifier(logoutId) || (scope !== undefined && scope !== "global" && scope !== "local")) {
        throw new WebInterviewLifecycleError("invalid");
      }
      return transaction("readonly", (control, _tx, intent) => {
        if (!control) throw new WebInterviewLifecycleError("unconfirmed");
        requireOriginal(intent, ticket, logoutId, scope);
        return receiptFor(control, ticket, logoutId);
      });
    },
  };
}
