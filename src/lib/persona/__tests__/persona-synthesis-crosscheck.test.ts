// The cross-check is WIRED, and it cannot cost the user their personas.
//
// This repo has an orphan-module problem it has hit more than once: a module
// with tests, no call site, and everything green. So the wiring gets its own
// test - "the pipeline exists" and "the pipeline runs" are different claims.
//
// The second half matters more. persona_synthesis emits structured JSON, the
// defender rewrites free-form, and a rewrite that does not parse yields zero
// personas. That failure would not look like a bug: an empty 북극성 reads as
// "we do not know you yet", which is a sentence this app says legitimately.

import { synthesizePersonas } from "../persona-synthesis";
import { callLlm } from "../../llm/boundary";
import { crosscheck } from "../../llm/crosscheck";

jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
jest.mock("../../llm/crosscheck", () => ({ crosscheck: jest.fn() }));

const mockCall = callLlm as unknown as jest.Mock;
const mockCross = crosscheck as unknown as jest.Mock;

// Two personas that parsePersonaSynthesis will accept, grounded in the input
// below. The exact shape is the surface's own; what matters here is the COUNT.
const reply = (labels: string[]) =>
  JSON.stringify({
    personas: labels.map((label) => ({
      label,
      summary: `${label} summary, long enough that the parser keeps it.`,
      // Both must exist in the input or the parser drops the persona (C8
      // grounding), which would make every count below zero for the wrong
      // reason.
      evidence: { domains: ["career"], constructs: ["conscientiousness"] },
    })),
  });

const INPUT = {
  domainSummaries: [{ domain: "career", summary: "works late", level: 3 }],
  constructEstimates: [{ construct: "conscientiousness", estimate: 0.7, level: 3 }],
} as unknown as Parameters<typeof synthesizePersonas>[1];

beforeEach(() => {
  mockCall.mockReset();
  mockCross.mockReset();
});

describe("it is actually wired", () => {
  test("the cross-check is called after a successful synthesis", async () => {
    mockCall.mockResolvedValue({ text: reply(["A", "B"]) });
    mockCross.mockResolvedValue({ text: reply(["A", "B"]), skipped: "disabled" });

    await synthesizePersonas("u1", INPUT, "ko");
    expect(mockCross).toHaveBeenCalledTimes(1);
    const arg = mockCross.mock.calls[0][0];
    expect(arg.purpose).toBe("persona_synthesis");
    // The evidence handed to both sides is the prompt the draft came from, not
    // a summary of it - a critic given less than the drafter had would object
    // to things it simply cannot see.
    expect(typeof arg.evidence).toBe("string");
    expect(arg.evidence.length).toBeGreaterThan(0);
    expect(arg.outputContract).toMatch(/JSON only/);
  });

  test("nothing to check means nothing is spent", async () => {
    mockCall.mockResolvedValue({ text: JSON.stringify({ personas: [] }) });
    const out = await synthesizePersonas("u1", INPUT, "ko");
    expect(out).toEqual([]);
    expect(mockCross).not.toHaveBeenCalled();
  });
});

describe("it cannot cost the user their personas", () => {
  test("a rewrite that parses to FEWER personas is discarded", async () => {
    // The failure that would read as a thin corpus rather than as a bug.
    mockCall.mockResolvedValue({ text: reply(["A", "B"]) });
    mockCross.mockResolvedValue({ text: reply(["A"]) });

    const out = await synthesizePersonas("u1", INPUT, "ko");
    expect(out).toHaveLength(2);
  });

  test("a rewrite that does not parse at all is discarded", async () => {
    mockCall.mockResolvedValue({ text: reply(["A", "B"]) });
    mockCross.mockResolvedValue({ text: "I have revised the claim as follows: ..." });

    const out = await synthesizePersonas("u1", INPUT, "ko");
    expect(out).toHaveLength(2);
  });

  test("a rewrite that keeps the count is taken", async () => {
    // Otherwise the guard would make the whole feature inert - the point is to
    // accept a genuine improvement, only refusing a destructive one.
    mockCall.mockResolvedValue({ text: reply(["A", "B"]) });
    mockCross.mockResolvedValue({ text: reply(["Revised A", "Revised B"]) });

    const out = await synthesizePersonas("u1", INPUT, "ko");
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.label)).toEqual(["Revised A", "Revised B"]);
  });

  test("a skipped check returns the original without re-parsing", async () => {
    mockCall.mockResolvedValue({ text: reply(["A", "B"]) });
    mockCross.mockResolvedValue({ text: reply(["A", "B"]), skipped: "vendors_collapsed" });

    const out = await synthesizePersonas("u1", INPUT, "ko");
    expect(out).toHaveLength(2);
  });
});
