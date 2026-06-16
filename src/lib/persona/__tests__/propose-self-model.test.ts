import { parseSelfModelProposal, buildSelfModelProposalPrompt } from "../propose-self-model";
import type { ProposalTarget } from "../proposal";

const target: ProposalTarget = { kind: "star", star: "now" };

describe("parseSelfModelProposal", () => {
  test("parses a well-formed, clean, changing proposal", () => {
    const raw = '{"after":"Openness: high","rationale":"recent entries show more curiosity","citations":["rec_1","rec_2"]}';
    const p = parseSelfModelProposal(raw, target, "Openness: medium", 4);
    expect(p).not.toBeNull();
    expect(p?.after).toBe("Openness: high");
    expect(p?.before).toBe("Openness: medium");
    expect(p?.targetLevel).toBe(4);
    expect(p?.citations).toEqual(["rec_1", "rec_2"]);
  });

  test("rejects forbidden clinical wording (C-vocabulary gate)", () => {
    const raw = '{"after":"You should seek therapy","rationale":"this reads like a diagnosis","citations":[]}';
    expect(parseSelfModelProposal(raw, target, "x", 4)).toBeNull();
  });

  test("rejects a no-op proposal (after == before)", () => {
    const raw = '{"after":"same value","rationale":"r","citations":[]}';
    expect(parseSelfModelProposal(raw, target, "same value", 4)).toBeNull();
  });

  test("returns null on an unparseable reply", () => {
    expect(parseSelfModelProposal("not json at all", target, "x", 4)).toBeNull();
  });

  test("prompt builder is pure and includes the target, current value, and JSON shape", () => {
    const { system, user } = buildSelfModelProposalPrompt(target, "Openness: medium", "some evidence", "en");
    expect(system).toContain("JSON");
    expect(system.toLowerCase()).toContain("star");
    expect(user).toContain("Openness: medium");
    expect(user).toContain("some evidence");
  });
});
