import { readFileSync } from "node:fs";
import { join } from "node:path";

import { advisorFollowupViewModel, normalizeRecordFollowup } from "../followup";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

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

  test("capture success and record detail both render the shared follow-up note surface", () => {
    const capture = read("src/app/capture.tsx");
    const detail = read("src/app/record/[id].tsx");
    const component = read("src/components/records/AdvisorFollowupNote.tsx");

    expect(capture).toContain("setSavedFollowup(res.followup ?? null)");
    expect(capture).toContain('testID="capture-advisor-followup"');
    expect(capture).toContain('sources: t("saved.advisor.sources")');
    expect(detail).toContain('.select("id, kind, topic, body, ai_followup, created_at, tags")');
    expect(detail).toContain('testID="record-advisor-followup"');
    expect(detail).toContain('sources: t("advisor.sources")');
    expect(component).toContain("labels.sources");
    expect(component).toContain("Linking.openURL");
    expect(normalizeRecordFollowup({ text: "x", zone: "green" })?.text).toBe("x");
  });
});
