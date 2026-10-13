// A-Z first-use check, round 5 (Z86). A record with no title of its own drew the start of its
// body as a five-line headline and then the body itself right under it.
import fs from "node:fs";
import path from "node:path";

import { DERIVED_TOPIC_LENGTH, editedBodyPatch, titleRepeatsBody } from "../piece-title";

const BODY =
  "[QA-261009 그림과 쉬는 시간] 가상 QA 사용자의 휴식 기록이다. 어릴 때 색연필로 창밖 풍경을 그리는 것을 좋아했고, 성인이 된 뒤에도 작은 스케치북을 들고 카페에 가는 시간이 즐겁다.";

describe("titleRepeatsBody", () => {
  test("a first-line fallback cut at 80 characters repeats the body", () => {
    const fallback = `${BODY.slice(0, 80).trimEnd()}…`;
    expect(titleRepeatsBody(fallback, BODY)).toBe(true);
  });

  test("a one-line note is its own title", () => {
    expect(titleRepeatsBody("오늘 산책했다", "오늘 산책했다")).toBe(true);
  });

  test("the title is one line while the body wraps", () => {
    expect(titleRepeatsBody("첫 줄 둘째 줄", "첫 줄\n둘째 줄\n셋째 줄")).toBe(true);
  });

  test("a title of its own is kept", () => {
    expect(titleRepeatsBody("1턴 회상 인터뷰", "질문: 학창시절을 떠올리면 기억나는 장소나 소리가 있나요?")).toBe(false);
    expect(titleRepeatsBody("그림과 쉬는 시간", BODY)).toBe(false);
  });

  test("nothing to compare is not a repeat", () => {
    expect(titleRepeatsBody("", BODY)).toBe(false);
    expect(titleRepeatsBody("메모", null)).toBe(false);
    expect(titleRepeatsBody("메모", "")).toBe(false);
  });
});

describe("the record detail draws a repeated title once", () => {
  const screen = fs
    .readFileSync(path.join(process.cwd(), "src/screens/deepspace/dds-record-detail-screen.tsx"), "utf8")
    .replace(/\r\n/g, "\n");

  test("the headline is skipped when the body right under it starts with the same words", () => {
    expect(screen).toContain("{bodyRepeatsTitle ? null : (");
    expect(screen).toContain(
      "const bodyRepeatsTitle = !piece.profileImportManaged && !assessment.isAssessment && titleRepeatsBody(displayTitle, piece.body);",
    );
  });

  // Those two kinds do not draw the body under the title, so there is nothing to repeat and the
  // title is the only name on the screen.
  test("pieces that draw no body keep their title", () => {
    const at = screen.indexOf("const bodyRepeatsTitle =");
    expect(screen.slice(at, at + 120)).toContain("!piece.profileImportManaged && !assessment.isAssessment");
  });
});

// Round 4 (Z48). A note saved from the capture screen stores the first 80 characters of its body
// as its topic. Editing the body left that copy behind, so the list and the detail kept the old
// words: "did my edit not save?"
describe("editedBodyPatch", () => {
  const OLD = "오늘은 비가 와서 산책을 못 했다. 대신 창가에서 책을 읽었다.";

  test("a topic copied from the old body follows the new body", () => {
    const next = "어제는 비가 와서 산책을 못 했다. 대신 창가에서 책을 읽었다.";
    expect(editedBodyPatch({ topic: OLD.slice(0, DERIVED_TOPIC_LENGTH), body: OLD }, next)).toEqual({
      body: next,
      topic: next.slice(0, DERIVED_TOPIC_LENGTH),
    });
  });

  test("the new topic is cut where the capture screen cuts it", () => {
    const long = "가".repeat(200);
    expect(editedBodyPatch({ topic: OLD, body: OLD }, long).topic).toHaveLength(80);
    const capture = fs
      .readFileSync(path.join(process.cwd(), "src/components/deep-space/DeepSpaceViews.tsx"), "utf8");
    expect(capture).toContain("topic = body.slice(0, 80);");
    expect(DERIVED_TOPIC_LENGTH).toBe(80);
  });

  test("a topic of its own stays", () => {
    expect(editedBodyPatch({ topic: "산책 일기", body: OLD }, "새 본문")).toEqual({ body: "새 본문" });
  });

  test("no topic, nothing to follow", () => {
    expect(editedBodyPatch({ topic: null, body: OLD }, "새 본문")).toEqual({ body: "새 본문" });
    expect(editedBodyPatch({ topic: "  ", body: OLD }, "새 본문")).toEqual({ body: "새 본문" });
    expect(editedBodyPatch({ body: OLD }, "새 본문")).toEqual({ body: "새 본문" });
  });
});

describe("the record detail saves the topic with the edited body", () => {
  const screen = fs
    .readFileSync(path.join(process.cwd(), "src/screens/deepspace/dds-record-detail-screen.tsx"), "utf8")
    .replace(/\r\n/g, "\n");

  test("what is shown at once and what is sent are the same patch", () => {
    expect(screen).toContain("updateReadyPiece({ ...previous, ...editedBodyPatch(previous, nextBody) });");
    expect(screen).toContain("await updateRecord(userId, recordId, editedBodyPatch(previous, nextBody));");
    expect(screen).not.toContain("{ body: nextBody }");
  });

  // A failed save puts the whole previous piece back, topic included.
  test("a failed save restores the previous piece", () => {
    const at = screen.indexOf("await updateRecord(userId, recordId, editedBodyPatch(previous, nextBody));");
    expect(screen.slice(at, at + 200)).toContain("updateReadyPiece(previous);");
  });
});
