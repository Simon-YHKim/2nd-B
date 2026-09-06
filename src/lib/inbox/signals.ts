export const INBOX_READ_TIMEOUT_MS = 8_000;

export type InboxSourceKey = "proposals" | "peers";
export type InboxRoute = "/digest" | "/peer-invites";

export type InboxReadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "timeout" }
  | { status: "empty"; count: 0 }
  | { status: "ready"; count: number };

export interface InboxSignalSnapshot {
  proposals: InboxReadState;
  peers: InboxReadState;
}

export interface InboxAuthState {
  userId: string | null;
  loading: boolean;
  hasProfile: boolean | null;
  profileProbeFailed: boolean;
}

export type InboxAuthGate = "loading" | "signed-out" | "profile-error" | "incomplete" | "ready";

export interface InboxReader<T> {
  read: (ownerId: string) => Promise<readonly T[]>;
  count: (rows: readonly T[]) => number;
}

export interface InboxReaders<TProposal, TPeer> {
  proposals: InboxReader<TProposal>;
  peers: InboxReader<TPeer>;
}

interface InboxRequestTicket {
  ownerId: string;
  ownerEpoch: number;
  source: InboxSourceKey;
  requestId: number;
}

class InboxReadTimeout extends Error {}

export function inboxAuthGate(auth: InboxAuthState): InboxAuthGate {
  if (auth.loading) return "loading";
  if (!auth.userId) return "signed-out";
  if (auth.profileProbeFailed) return "profile-error";
  if (auth.hasProfile === null) return "loading";
  if (auth.hasProfile === false) return "incomplete";
  return "ready";
}

function withReadTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new InboxReadTimeout());
    }, timeoutMs);

    void promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function loadInboxCount<T>(
  ownerId: string,
  reader: InboxReader<T>,
  timeoutMs = INBOX_READ_TIMEOUT_MS,
): Promise<InboxReadState> {
  try {
    const rows = await withReadTimeout(reader.read(ownerId), timeoutMs);
    const selected = reader.count(rows);
    const count = Number.isFinite(selected) ? Math.max(0, Math.trunc(selected)) : 0;
    return count === 0 ? { status: "empty", count: 0 } : { status: "ready", count };
  } catch (error) {
    return error instanceof InboxReadTimeout ? { status: "timeout" } : { status: "error" };
  }
}

export function countPendingProposals(rows: readonly unknown[]): number {
  return rows.length;
}

export function countRespondedPeerInvites(
  rows: readonly { responded_at: string | null; status: string }[],
): number {
  return rows.filter(
    (row) => row.responded_at !== null && (row.status === "accepted" || row.status === "declined"),
  ).length;
}

export function summarizeInboxSignals(snapshot: InboxSignalSnapshot): {
  proposalCount: number;
  peerCount: number;
  genuineEmpty: boolean;
  hasPendingRead: boolean;
  failedSources: InboxSourceKey[];
} {
  const proposalCount = snapshot.proposals.status === "ready" ? snapshot.proposals.count : 0;
  const peerCount = snapshot.peers.status === "ready" ? snapshot.peers.count : 0;
  const failedSources: InboxSourceKey[] = [];
  if (snapshot.proposals.status === "error" || snapshot.proposals.status === "timeout") {
    failedSources.push("proposals");
  }
  if (snapshot.peers.status === "error" || snapshot.peers.status === "timeout") {
    failedSources.push("peers");
  }
  return {
    proposalCount,
    peerCount,
    genuineEmpty: snapshot.proposals.status === "empty" && snapshot.peers.status === "empty",
    hasPendingRead: snapshot.proposals.status === "loading" || snapshot.peers.status === "loading",
    failedSources,
  };
}

class InboxRequestGuard {
  private ownerId: string | null = null;
  private ownerEpoch = 0;
  private active = false;
  private requestIds: Record<InboxSourceKey, number> = { proposals: 0, peers: 0 };

  activate(ownerId: string): void {
    this.ownerEpoch += 1;
    this.ownerId = ownerId;
    this.active = true;
    this.requestIds = { proposals: 0, peers: 0 };
  }

  deactivate(): void {
    this.ownerEpoch += 1;
    this.ownerId = null;
    this.active = false;
  }

  begin(source: InboxSourceKey): InboxRequestTicket | null {
    if (!this.active || this.ownerId === null) return null;
    const requestId = this.requestIds[source] + 1;
    this.requestIds[source] = requestId;
    return {
      ownerId: this.ownerId,
      ownerEpoch: this.ownerEpoch,
      source,
      requestId,
    };
  }

  accepts(ticket: InboxRequestTicket): boolean {
    return (
      this.active &&
      this.ownerId === ticket.ownerId &&
      this.ownerEpoch === ticket.ownerEpoch &&
      this.requestIds[ticket.source] === ticket.requestId
    );
  }
}

const INITIAL_SNAPSHOT: InboxSignalSnapshot = {
  proposals: { status: "loading" },
  peers: { status: "loading" },
};

export class InboxSignalSession<TProposal, TPeer> {
  private readonly guard = new InboxRequestGuard();
  private ownerId: string | null = null;
  private snapshot: InboxSignalSnapshot = INITIAL_SNAPSHOT;

  constructor(
    private readonly readers: InboxReaders<TProposal, TPeer>,
    private readonly onChange: (snapshot: InboxSignalSnapshot) => void,
    private readonly timeoutMs = INBOX_READ_TIMEOUT_MS,
  ) {}

  activate(ownerId: string): void {
    this.ownerId = ownerId;
    this.guard.activate(ownerId);
    this.snapshot = {
      proposals: { status: "loading" },
      peers: { status: "loading" },
    };
    this.emit();
    this.start("proposals");
    this.start("peers");
  }

  deactivate(): void {
    this.ownerId = null;
    this.guard.deactivate();
  }

  retry(source: InboxSourceKey): boolean {
    const state = this.snapshot[source];
    if (state.status !== "error" && state.status !== "timeout") return false;
    this.setSource(source, { status: "loading" });
    this.start(source);
    return true;
  }

  getSnapshot(): InboxSignalSnapshot {
    return this.snapshot;
  }

  private start(source: InboxSourceKey): void {
    const ownerId = this.ownerId;
    const ticket = this.guard.begin(source);
    if (!ownerId || !ticket) return;
    const result = source === "proposals"
      ? loadInboxCount(ownerId, this.readers.proposals, this.timeoutMs)
      : loadInboxCount(ownerId, this.readers.peers, this.timeoutMs);
    void result.then((state) => {
      if (!this.guard.accepts(ticket)) return;
      this.setSource(source, state);
    });
  }

  private setSource(source: InboxSourceKey, state: InboxReadState): void {
    this.snapshot = { ...this.snapshot, [source]: state };
    this.emit();
  }

  private emit(): void {
    this.onChange(this.snapshot);
  }
}

export function syncInboxSessionWithAuth<TProposal, TPeer>(
  session: InboxSignalSession<TProposal, TPeer>,
  auth: InboxAuthState,
): InboxAuthGate {
  const gate = inboxAuthGate(auth);
  if (gate === "ready" && auth.userId) session.activate(auth.userId);
  else session.deactivate();
  return gate;
}

export function openInboxRoute(route: InboxRoute, push: (route: InboxRoute) => void): void {
  push(route);
}
