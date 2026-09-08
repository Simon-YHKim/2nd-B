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

  test("capture renders the shared follow-up note surface", () => {
    const capture = read("src/app/capture.tsx");
    const component = read("src/components/records/AdvisorFollowupNote.tsx");

    expect(capture).toContain("setSavedFollowup(res.followup ?? null)");
    expect(capture).toContain('testID="capture-advisor-followup"');
    expect(capture).toContain('sources: t("saved.advisor.sources")');
    expect(component).toContain("labels.sources");
    expect(component).toContain("Linking.openURL");
    expect(normalizeRecordFollowup({ text: "x", zone: "green" })?.text).toBe("x");
  });

  /**
   * ⚠ 이 검사의 제목은 "capture 와 record detail 이 **둘 다** 후속 메모를 낸다"
   * 였고, 그건 배송되는 앱에서 **사실이 아니었다.** 초록이었던 이유는 검사가
   * src/app/record/[id].tsx - 어느 빌드도 안 그리는 반쪽 - 을 읽었기 때문이다.
   *
   * 실측(2026-09-08): 배송 화면 dds-record-detail-screen.tsx 에
   * AdvisorFollowupNote · record-advisor-followup · ai_followup · advisor.sources
   * 넷 다 0건이다.
   *
   * 그런데 **데이터는 화면까지 온다** - getRecordById 가 ai_followup 을 select 하고
   * (records/create.ts:388) PieceDetail 이 그 필드를 들고 있다(get-piece.ts:34).
   * 즉 행은 도착하고 화면이 안 그린다. 되살리는 비용은 이미 있는 컴포넌트를
   * 한 번 렌더하는 것이고, 데이터층은 손댈 필요가 없다.
   *
   * 되살릴지는 Simon 결정 대기(Q6). 그때까지 **없다는 사실**을 못박아 둔다 -
   * 배선이 돌아오면 이 검사가 먼저 울어서 결정이 기록되게 한다.
   */
  test("the shipped record detail does not render it yet - the row arrives, the screen drops it", () => {
    const detail = read("src/screens/deepspace/dds-record-detail-screen.tsx");
    const query = read("src/lib/records/create.ts");
    const piece = read("src/lib/records/get-piece.ts");

    // ⚠ 파일 전체에 대고 toContain 하면 **같은 select 가 두 곳에 있어서**(372·388)
    // 한쪽을 망가뜨려도 초록이다 — 변이 검증에서 잡혔다. 화면이 실제로 부르는
    // 함수로 잘라내고 거기서 확인한다.
    const byId = query.slice(query.indexOf("export async function getRecordById"));
    const bodyOfById = byId.slice(0, byId.indexOf("\nexport "));
    expect(bodyOfById).toContain(
      'select("id, kind, body, ai_followup, topic, summary, conclusion, tags, created_at, structured")',
    );
    expect(piece).toContain("ai_followup?: unknown;");
    expect(detail).not.toContain("AdvisorFollowupNote");
    expect(detail).not.toContain("record-advisor-followup");
  });
});
