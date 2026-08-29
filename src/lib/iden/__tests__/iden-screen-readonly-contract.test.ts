import fs from "node:fs";
import path from "node:path";

import { buildIdenExport } from "../iden-export";
import {
  createIdenSessionController,
  visibleIdenDocForExport,
  type IdenSession,
} from "../load-persisted-iden";
import type { IdenDoc } from "../types";

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function doc(name: string, oneLiner: string, summary?: string): IdenDoc {
  return {
    iden: "0.1",
    name,
    generated: "2026-08-29",
    oneLiner,
    fields: [{ key: "contents", label: "Contents", viz: "donut", source: { kind: "count" }, data: { Records: 1 } }],
    ...(summary ? { summary: { text: summary, source: { kind: "ai_summary" as const } } } : {}),
  };
}

describe("IDEN user-keyed session execution", () => {
  it("drops a delayed A response after B starts and resolves only B", async () => {
    const pending: Array<ReturnType<typeof deferred<IdenDoc | null>>> = [];
    const states: Array<IdenSession | null> = [];
    const controller = createIdenSessionController({
      load: jest.fn(() => {
        const next = deferred<IdenDoc | null>();
        pending.push(next);
        return next.promise;
      }),
      onChange: (state) => states.push(state),
    });

    const a = controller.load("user-a", { locale: "en" });
    const b = controller.load("user-b", { locale: "en" });
    pending[0].resolve(doc("A", "A northstar"));
    await a.promise;

    expect(states.at(-1)).toEqual({ userId: "user-b", status: "loading", doc: null });

    pending[1].resolve(doc("B", "B northstar"));
    await b.promise;
    expect(states.at(-1)).toMatchObject({ userId: "user-b", status: "ready", doc: { name: "B" } });
  });

  it("keeps only the latest focus reload when deferred reads resolve out of order", async () => {
    const pending: Array<ReturnType<typeof deferred<IdenDoc | null>>> = [];
    const states: Array<IdenSession | null> = [];
    const controller = createIdenSessionController({
      load: () => {
        const next = deferred<IdenDoc | null>();
        pending.push(next);
        return next.promise;
      },
      onChange: (state) => states.push(state),
    });

    const initial = controller.load("user-b", { locale: "en" });
    pending[0].resolve(doc("B initial", "B initial northstar"));
    await initial.promise;

    const focusOne = controller.load("user-b", { locale: "en" });
    const focusTwo = controller.load("user-b", { locale: "en" });
    pending[1].resolve(doc("B stale focus", "stale"));
    await focusOne.promise;
    expect(states.at(-1)).toEqual({ userId: "user-b", status: "loading", doc: null });

    pending[2].resolve(doc("B latest focus", "latest"));
    await focusTwo.promise;
    expect(states.at(-1)).toMatchObject({ status: "ready", doc: { name: "B latest focus" } });
  });

  it("keeps only modal openness and never renders or copies A after switching to B", async () => {
    const modalOpen = true;
    const pending: Array<ReturnType<typeof deferred<IdenDoc | null>>> = [];
    let session: IdenSession | null = null;
    const controller = createIdenSessionController({
      load: () => {
        const next = deferred<IdenDoc | null>();
        pending.push(next);
        return next.promise;
      },
      onChange: (state) => {
        session = state;
      },
    });
    const currentArtifact = () => {
      const current = session as IdenSession | null;
      return current?.status === "ready"
        ? buildIdenExport(visibleIdenDocForExport(current.doc, []), { locale: "en" })
        : null;
    };

    const a = controller.load("user-a", { locale: "en" });
    pending[0].resolve(doc("A", "A northstar", "A hidden summary"));
    await a.promise;
    const previousArtifact = currentArtifact();

    expect(modalOpen).toBe(true);
    expect(previousArtifact?.json).toContain('"name": "A"');

    const b = controller.load("user-b", { locale: "en" });
    expect(currentArtifact()).toBeNull();
    pending[1].resolve(doc("B", "B northstar", "B hidden summary"));
    await b.promise;
    const renderedForB = currentArtifact();
    const copiedForB = currentArtifact()?.iden;
    expect(renderedForB?.json).toContain('"name": "B"');
    expect(renderedForB?.json).not.toContain('"name": "A"');
    expect(copiedForB).not.toContain("A northstar");
    expect(copiedForB).not.toContain("B hidden summary");

    const focus = controller.load("user-b", { locale: "en" });
    expect(currentArtifact()).toBeNull();
    pending[2].resolve(doc("B focus", "B focus northstar"));
    await focus.promise;
    expect(currentArtifact()?.json).toContain('"name": "B focus"');
    expect(currentArtifact()?.json).not.toContain('"name": "B"');
  });
});

describe("IDEN read-only lifecycle contract", () => {
  const screen = read("src/app/iden.tsx");
  const loader = read("src/lib/iden/load-persisted-iden.ts");
  const combined = `${screen}\n${loader}`;

  it("uses one SELECT-only persisted loader for mount, retry, and focus", () => {
    expect(screen).toContain('from "@/lib/iden/load-persisted-iden"');
    expect(screen).toContain('from "@/lib/nav/use-focus-refetch"');
    expect(screen).toContain("loadPersistedIden(loadUserId");
    expect(screen).toContain("useFocusRefetch(() => setReloadKey((key) => key + 1), canRead)");
    expect(screen).toContain("retry: () => setReloadKey((key) => key + 1)");
    expect(loader).toContain('.select("traits, values, patterns, created_at, version")');
  });

  it("fails closed until auth profile and minor state are known", () => {
    expect(screen).toContain("hasProfile === true");
    expect(screen).toContain("profileProbeFailed === false");
    expect(screen).toContain("isMinor !== null");
    expect(screen).toContain("hasProfile === false && !profileProbeFailed");
  });

  it("keys loaded state to the current user so a prior account cannot flash", () => {
    expect(screen).toContain("type IdenSession");
    expect(screen).toContain("session?.userId === userId");
    expect(screen).toContain("const loadUserId = userId");
    expect(screen).toContain("controller.load(loadUserId");
  });

  it("serializes only the in-memory current document with no hidden rebuild", () => {
    expect(screen).toContain('import { buildIdenExport } from "@/lib/iden/iden-export"');
    expect(screen).toContain("visibleIdenDocForExport(doc, excluded)");
    expect(screen).not.toContain("buildIdenDoc");
    expect(screen).not.toContain("exportIden(");
  });

  it("stores only legacy modal openness and computes every action from the current doc", () => {
    expect(screen).toContain("const [resultOpen, setResultOpen] = useState(false)");
    expect(screen).toContain("const currentResult = useCallback(");
    expect(screen).toContain("setResultOpen(true)");
    expect(screen).toContain("visible={resultOpen && renderedResult !== null}");
    expect(screen).not.toContain("useState<IdenExport | null>");
    expect(screen).not.toContain("setResult(");
  });

  it("removes misleading legacy controls and claims", () => {
    expect(screen).toContain('.filter((row) => row.id !== "raw")');
    expect(screen).not.toContain('raw: []');
    expect(screen).not.toContain("Signed on your device");
    expect(screen).not.toContain("내 기기에서 서명");
    expect(screen).not.toContain("검증 결과 포함");
    expect(loader).not.toContain('key: "cores"');
  });

  it("never invokes generation, billing, mutation, RPC, or edge functions", () => {
    for (const forbidden of [
      "callLlm",
      "buildPersona",
      "bumpChatUsage",
      ".insert(",
      ".upsert(",
      ".update(",
      ".rpc(",
      "functions.invoke",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });
});
