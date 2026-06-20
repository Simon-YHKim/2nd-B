import { parseGoogleTasks, googleTasksToOutcome } from "../tasks";

describe("parseGoogleTasks", () => {
  it("reads active task titles, skipping completed and empty rows", () => {
    const json = {
      items: [
        { title: "Buy milk", status: "needsAction" },
        { title: "Done thing", status: "completed" },
        { title: "   ", status: "needsAction" },
        { title: "Call dentist", status: "needsAction", due: "2026-06-25T00:00:00.000Z" },
      ],
    };
    expect(parseGoogleTasks(json).map((t) => t.title)).toEqual(["Buy milk", "Call dentist"]);
  });

  it("tolerates junk", () => {
    expect(parseGoogleTasks(null)).toEqual([]);
    expect(parseGoogleTasks({ items: "nope" })).toEqual([]);
  });
});

describe("googleTasksToOutcome", () => {
  it("maps tasks to non-sensitive record proposals with an events count", () => {
    const out = googleTasksToOutcome([{ title: "Buy milk" }, { title: "Call dentist" }]);
    expect(out.proposals).toHaveLength(2);
    expect(out.proposals[0]).toMatchObject({ label: "Buy milk", sensitive: false });
    expect(out.proposals[0].sub).toContain("할 일");
    expect(out.summary.events).toBe(2);
    expect(out.summary.health).toBe(0);
  });
});
