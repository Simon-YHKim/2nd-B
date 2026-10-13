import { resolveLiveProposals, type ProposalTargetLookup } from "../proposal-targets";

type Stored = { key: string; refKind: "record" | "source"; refId: string; title: string };

const unread = (refKind: "record" | "source") => (refKind === "record" ? "Untitled record" : "Untitled source");

function lookupOf(records: Record<string, string>, sources: Record<string, string>): ProposalTargetLookup {
  return {
    record: async (refId) => (refId in records ? records[refId] : null),
    source: async (refId) => (refId in sources ? sources[refId] : null),
  };
}

describe("resolveLiveProposals", () => {
  it("drops a proposal whose record is gone and keeps the live one", async () => {
    const stored: Stored[] = [
      { key: "record:a", refKind: "record", refId: "a", title: "" },
      { key: "record:b", refKind: "record", refId: "b", title: "" },
    ];
    const live = await resolveLiveProposals(stored, lookupOf({ b: "Still here" }, {}), unread);
    expect(live.map((p) => p.key)).toEqual(["record:b"]);
  });

  it("takes the title from the live row, not from what was stored", async () => {
    const stored: Stored[] = [{ key: "record:a", refKind: "record", refId: "a", title: "opening text kept by an older row" }];
    const live = await resolveLiveProposals(stored, lookupOf({ a: "Renamed since" }, {}), unread);
    expect(live[0].title).toBe("Renamed since");
  });

  it("looks a source up in sources, so a live source is not taken for a deleted record", async () => {
    const stored: Stored[] = [{ key: "source:s", refKind: "source", refId: "s", title: "" }];
    // The same id is absent from records: a records-only lookup would drop this live proposal.
    const live = await resolveLiveProposals(stored, lookupOf({}, { s: "Clipped page" }), unread);
    expect(live.map((p) => p.title)).toEqual(["Clipped page"]);
  });

  it("looks a record up in records, so a source with the same id does not keep a deleted record", async () => {
    const stored: Stored[] = [{ key: "record:x", refKind: "record", refId: "x", title: "" }];
    const live = await resolveLiveProposals(stored, lookupOf({}, { x: "A source, not the record" }), unread);
    expect(live).toEqual([]);
  });

  it("keeps a proposal whose read failed, under a neutral name and never the stored title", async () => {
    const stored: Stored[] = [
      { key: "record:a", refKind: "record", refId: "a", title: "opening text kept by an older row" },
      { key: "source:s", refKind: "source", refId: "s", title: "stored source title" },
    ];
    const failing: ProposalTargetLookup = {
      record: async () => {
        throw new Error("network");
      },
      source: async () => {
        throw new Error("network");
      },
    };
    const live = await resolveLiveProposals(stored, failing, unread);
    expect(live.map((p) => p.title)).toEqual(["Untitled record", "Untitled source"]);
  });

  it("keeps the stored order and the other fields", async () => {
    const stored = [
      { key: "source:s", refKind: "source" as const, refId: "s", title: "", ordinal: 0 },
      { key: "record:gone", refKind: "record" as const, refId: "gone", title: "", ordinal: 1 },
      { key: "record:a", refKind: "record" as const, refId: "a", title: "", ordinal: 2 },
    ];
    const live = await resolveLiveProposals(stored, lookupOf({ a: "A" }, { s: "S" }), unread);
    expect(live.map((p) => [p.key, p.ordinal])).toEqual([
      ["source:s", 0],
      ["record:a", 2],
    ]);
  });

  it("returns nothing when every target is gone", async () => {
    const stored: Stored[] = [{ key: "record:a", refKind: "record", refId: "a", title: "" }];
    expect(await resolveLiveProposals(stored, lookupOf({}, {}), unread)).toEqual([]);
  });
});
