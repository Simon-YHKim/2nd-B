import {
  decideIngest,
  runIngestGate,
  RELEVANCE_KEEP_THRESHOLD,
  type IngestCandidate,
  type IngestDropRecord,
  type GateDeps,
} from "../gate";
import { contentHash, minhashSignature } from "../dedup";

const KEPT_TEXT = "A reflective note about how morning sunlight shifts my focus and energy through the week.";

function candidateFor(id: string, text: string): IngestCandidate {
  return { id, contentHash: contentHash(text), signature: minhashSignature(text) };
}

describe("decideIngest (pure)", () => {
  it("keeps a novel, relevant clip and returns its hash + signature", () => {
    const d = decideIngest({ text: KEPT_TEXT, relevance: 4, keepFlag: true, candidates: [] });
    expect(d.keep).toBe(true);
    if (d.keep) {
      expect(d.contentHash).toBe(contentHash(KEPT_TEXT));
      expect(d.signature).toHaveLength(minhashSignature(KEPT_TEXT).length);
    }
  });

  it("drops an exact duplicate and points at the survivor", () => {
    const survivor = candidateFor("src-1", KEPT_TEXT);
    const d = decideIngest({ text: KEPT_TEXT, relevance: 5, candidates: [survivor] });
    expect(d.keep).toBe(false);
    if (!d.keep) {
      expect(d.stage).toBe("exact_duplicate");
      expect(d.survivorId).toBe("src-1");
    }
  });

  it("drops a near-duplicate reworded clip at the highest-similarity survivor", () => {
    const original = "I went to the store today to buy milk eggs bread and a dozen ripe bananas for the week";
    const reworded = "I went to the store today to buy milk eggs bread and a dozen ripe bananas this week";
    const d = decideIngest({
      text: reworded,
      relevance: 5,
      candidates: [candidateFor("near", original), candidateFor("unrelated", "quarterly tax filing checklist")],
    });
    expect(d.keep).toBe(false);
    if (!d.keep) {
      expect(d.stage).toBe("near_duplicate");
      expect(d.survivorId).toBe("near");
    }
  });

  it("drops below-threshold relevance", () => {
    const d = decideIngest({ text: KEPT_TEXT, relevance: RELEVANCE_KEEP_THRESHOLD - 1, candidates: [] });
    expect(d.keep).toBe(false);
    if (!d.keep) expect(d.stage).toBe("low_relevance");
  });

  it("drops a phase1 keep=false (spam) clip even when relevance is unknown", () => {
    const d = decideIngest({ text: KEPT_TEXT, keepFlag: false, candidates: [] });
    expect(d.keep).toBe(false);
    if (!d.keep) {
      expect(d.stage).toBe("low_relevance");
      expect(d.survivorId).toBeNull();
    }
  });

  it("does not drop on relevance when the score is unknown", () => {
    expect(decideIngest({ text: KEPT_TEXT, candidates: [] }).keep).toBe(true);
  });

  it("prefers exact over near over relevance when several would fire", () => {
    // Exact match present AND low relevance — exact wins (checked first).
    const d = decideIngest({
      text: KEPT_TEXT,
      relevance: 1,
      candidates: [candidateFor("exact", KEPT_TEXT)],
    });
    expect(d.keep).toBe(false);
    if (!d.keep) expect(d.stage).toBe("exact_duplicate");
  });
});

describe("runIngestGate (orchestration)", () => {
  function deps(candidates: IngestCandidate[]) {
    const drops: IngestDropRecord[] = [];
    let bandKeysSeen: string[] | null = null;
    const gateDeps: GateDeps = {
      findCandidates: (bandKeys) => {
        bandKeysSeen = bandKeys;
        return Promise.resolve(candidates);
      },
      recordDrop: (row) => {
        drops.push(row);
        return Promise.resolve();
      },
    };
    return { gateDeps, drops, getBandKeys: () => bandKeysSeen };
  }

  it("records no drop and returns keep for a novel clip", async () => {
    const { gateDeps, drops, getBandKeys } = deps([]);
    const d = await runIngestGate({ text: KEPT_TEXT, relevance: 4 }, gateDeps);
    expect(d.keep).toBe(true);
    expect(drops).toHaveLength(0);
    // candidate fetch was driven by real LSH band keys (16 bands).
    expect(getBandKeys()).toHaveLength(16);
  });

  it("appends an ingest_log drop record on an exact duplicate", async () => {
    const { gateDeps, drops } = deps([candidateFor("dup", KEPT_TEXT)]);
    const d = await runIngestGate({ text: KEPT_TEXT, relevance: 5 }, gateDeps);
    expect(d.keep).toBe(false);
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({
      stage: "exact_duplicate",
      survivor_id: "dup",
      content_hash: contentHash(KEPT_TEXT),
    });
  });
});
