import {
  prepareProposalsForReview,
  resolveProposalTargets,
  type ProposalTargetLookup,
} from "../proposal-targets";

type Stored = { key: string; refKind: "record" | "source"; refId: string; title: string; runId: string; ordinal: number };

function stored(key: string, runId = "run-1", ordinal = 0, title = ""): Stored {
  const [refKind, refId] = key.split(":") as ["record" | "source", string];
  return { key, refKind, refId, title, runId, ordinal };
}

function lookupOf(records: Record<string, string>, sources: Record<string, string>): ProposalTargetLookup {
  return {
    record: async (refId) => (refId in records ? records[refId] : null),
    source: async (refId) => (refId in sources ? sources[refId] : null),
  };
}

const failing: ProposalTargetLookup = {
  record: async () => {
    throw new Error("network");
  },
  source: async () => {
    throw new Error("network");
  },
};

describe("resolveProposalTargets", () => {
  it("separates a live record from a deleted one", async () => {
    const targets = await resolveProposalTargets(
      [stored("record:a"), stored("record:b", "run-1", 1)],
      lookupOf({ b: "Still here" }, {}),
    );
    expect(targets.live.map((p) => p.key)).toEqual(["record:b"]);
    expect(targets.missing.map((p) => p.key)).toEqual(["record:a"]);
    expect(targets.unreadable).toEqual([]);
  });

  it("takes the title from the live row, not from what was stored", async () => {
    const targets = await resolveProposalTargets(
      [stored("record:a", "run-1", 0, "opening text kept by an older row")],
      lookupOf({ a: "Renamed since" }, {}),
    );
    expect(targets.live[0].title).toBe("Renamed since");
  });

  it("looks a source up in sources, so a live source is not taken for a deleted record", async () => {
    // The same id is absent from records: a records-only lookup would report this live proposal gone.
    const targets = await resolveProposalTargets([stored("source:s")], lookupOf({}, { s: "Clipped page" }));
    expect(targets.live.map((p) => p.title)).toEqual(["Clipped page"]);
    expect(targets.missing).toEqual([]);
  });

  it("looks a record up in records, so a source with the same id does not keep a deleted record", async () => {
    const targets = await resolveProposalTargets([stored("record:x")], lookupOf({}, { x: "A source, not the record" }));
    expect(targets.live).toEqual([]);
    expect(targets.missing.map((p) => p.key)).toEqual(["record:x"]);
  });

  it("reports a failed read as unreadable, neither live nor missing", async () => {
    const targets = await resolveProposalTargets(
      [stored("record:a", "run-1", 0, "opening text kept by an older row"), stored("source:s", "run-1", 1)],
      failing,
    );
    expect(targets.live).toEqual([]);
    expect(targets.missing).toEqual([]);
    expect(targets.unreadable.map((p) => p.key)).toEqual(["record:a", "source:s"]);
  });

  it("keeps the stored order", async () => {
    const targets = await resolveProposalTargets(
      [stored("source:s", "run-1", 0), stored("record:gone", "run-1", 1), stored("record:a", "run-1", 2)],
      lookupOf({ a: "A" }, { s: "S" }),
    );
    expect(targets.live.map((p) => [p.key, p.ordinal])).toEqual([
      ["source:s", 0],
      ["record:a", 2],
    ]);
  });
});

describe("prepareProposalsForReview", () => {
  it("dismisses every ordinal of a run whose targets are all gone, and shows nothing", async () => {
    const dismiss = jest.fn().mockResolvedValue(undefined);
    const ready = await prepareProposalsForReview(
      [stored("record:a", "run-1", 0), stored("record:b", "run-1", 1)],
      lookupOf({}, {}),
      dismiss,
    );
    expect(ready).toEqual({ live: [], unreadable: 0 });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("run-1", [0, 1]);
  });

  it("dismisses only the missing ordinal of a partly deleted run, so the shown ones are all that is left to decide", async () => {
    const dismiss = jest.fn().mockResolvedValue(undefined);
    const ready = await prepareProposalsForReview(
      [stored("record:a", "run-1", 0), stored("record:gone", "run-1", 1), stored("source:s", "run-1", 2)],
      lookupOf({ a: "A" }, { s: "S" }),
      dismiss,
    );
    expect(ready.live.map((p) => p.ordinal)).toEqual([0, 2]);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("run-1", [1]);
  });

  it("groups missing ordinals by run", async () => {
    const dismiss = jest.fn().mockResolvedValue(undefined);
    await prepareProposalsForReview(
      [stored("record:a", "run-1", 0), stored("record:b", "run-2", 0), stored("record:c", "run-2", 3)],
      lookupOf({}, {}),
      dismiss,
    );
    expect(dismiss.mock.calls).toEqual([
      ["run-1", [0]],
      ["run-2", [0, 3]],
    ]);
  });

  it("neither shows nor dismisses a proposal whose target could not be read", async () => {
    const dismiss = jest.fn().mockResolvedValue(undefined);
    const ready = await prepareProposalsForReview(
      [stored("record:a", "run-1", 0, "opening text kept by an older row"), stored("source:s", "run-1", 1)],
      failing,
      dismiss,
    );
    expect(ready).toEqual({ live: [], unreadable: 2 });
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("still returns the live ones when the dismiss fails", async () => {
    const dismiss = jest.fn().mockRejectedValue(new Error("rpc"));
    const ready = await prepareProposalsForReview(
      [stored("record:a", "run-1", 0), stored("record:gone", "run-1", 1)],
      lookupOf({ a: "A" }, {}),
      dismiss,
    );
    expect(ready.live.map((p) => p.key)).toEqual(["record:a"]);
    expect(ready.unreadable).toBe(0);
  });

  it("writes nothing when every target is live", async () => {
    const dismiss = jest.fn().mockResolvedValue(undefined);
    const ready = await prepareProposalsForReview([stored("record:a")], lookupOf({ a: "A" }, {}), dismiss);
    expect(ready.live.map((p) => p.title)).toEqual(["A"]);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
