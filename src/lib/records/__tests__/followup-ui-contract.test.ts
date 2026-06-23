import { advisorFollowupViewModel } from "../followup";

describe("Advisor follow-up UI contract", () => {
  test("non-red follow-up text and evidence survive normalization for the rendered note", () => {
    const followup = advisorFollowupViewModel({
      text: "You returned to the same work pattern twice this week.",
      zone: "green",
      matchedBatches: ["sdt"],
      evidence: [
        { title: "Self-determination overview", doi: "10.123/example", summary: "Autonomy and competence cues." },
      ],
    });

    expect(followup).toMatchObject({
      text: "You returned to the same work pattern twice this week.",
      zone: "green",
      evidence: [
        { title: "Self-determination overview", doi: "10.123/example", summary: "Autonomy and competence cues." },
      ],
    });
  });

  test("empty evidence keeps the Advisor text but leaves no disclosure content to render", () => {
    const followup = advisorFollowupViewModel({
      text: "A short follow-up without sources.",
      zone: "yellow",
      evidence: [],
    });

    expect(followup?.text).toBe("A short follow-up without sources.");
    expect(followup?.evidence).toEqual([]);
  });

  test("red fixed-template follow-up with empty evidence also has no disclosure content", () => {
    const followup = advisorFollowupViewModel({
      text: "Use the crisis handoff already selected by safety routing.",
      zone: "red",
      fixedTemplate: true,
      evidence: [
        { title: "Should not render beside crisis copy", doi: "10.123/crisis", summary: "Hidden for red-zone." },
      ],
    });

    expect(followup).toMatchObject({ zone: "red", fixedTemplate: true, evidence: [] });
  });

  // Legacy UI track removed 2026-06-23: the capture-success + record-detail
  // render-integration case pinned the legacy src/app/capture.tsx and
  // src/app/record/[id].tsx screens wiring up AdvisorFollowupNote (testIDs
  // capture-advisor-followup / record-advisor-followup). Those routes are now thin
  // deep-space wrappers; the deep-space CaptureView and DeepSpaceRecordDetailScreen do
  // not render the follow-up note surface, so this UI-render contract has no surviving
  // equivalent and is removed. The view-model guarantees it depended on
  // (normalizeRecordFollowup / advisorFollowupViewModel) stay covered by the cases
  // above. AdvisorFollowupNote.tsx itself is still exercised via its own component.
});
