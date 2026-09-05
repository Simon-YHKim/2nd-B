// `/review`의 production renderer가 PIXEL-CLAY 기준 화면의 정보 순서를
// 유지하는지 지킨다. 데이터가 없는 후보를 꾸며서 렌더하지는 않되, 후보가
// 있을 때의 그룹 순서와 형태는 reference capture를 따라야 한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const source = readFileSync(
  join(ROOT, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const styleSource = readFileSync(
  join(ROOT, "src/screens/deepspace/dds-styles.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const reviewStart = source.indexOf("function DeepSpaceReviewSession");
const reviewEnd = source.indexOf(
  'export { DeepSpaceInboxScreen, DeepSpaceImportScreen }',
  reviewStart,
);
const review = source.slice(reviewStart, reviewEnd);

describe("/review PIXEL-CLAY structure", () => {
  it("uses one lead instead of repeating it in a companion bubble", () => {
    expect(reviewStart).toBeGreaterThan(-1);
    expect(reviewEnd).toBeGreaterThan(reviewStart);
    expect(review).not.toContain("<SecondbStatusHeader");
    expect(review).toContain('{t("review.status")}');
    expect(review).not.toContain('t("review.lead")');
  });

  it("shows period-star candidates before assessment candidates", () => {
    const sevenGroup = review.indexOf('t("review.groupSeven")');
    const assessmentGroup = review.indexOf('t("review.groupTest")');

    expect(sevenGroup).toBeGreaterThan(-1);
    expect(assessmentGroup).toBeGreaterThan(sevenGroup);

    const sevenBlock = review.slice(sevenGroup, assessmentGroup);
    expect(sevenBlock).toContain("sevenTargets.map");
    expect(sevenBlock).toContain("<View style={styles.filterRow}>");
    expect(sevenBlock).toContain("style={[styles.fchip, styles.fchipActive]}");
    expect(sevenBlock).toContain("generateSeven(st.star)");
    expect(sevenBlock).toContain(
      "disabled={loading || ratifyPending || isMinor === null}",
    );
    expect(sevenBlock).toContain(
      "accessibilityState={{ disabled: loading || ratifyPending || isMinor === null }}",
    );
    expect(styleSource).toMatch(/fchip:\{minHeight:44,/);
  });

  it("groups measured candidates into honest actionable rows", () => {
    const assessmentGroup = review.indexOf('t("review.groupTest")');
    const result = review.indexOf("{result ?", assessmentGroup);
    const assessmentBlock = review.slice(assessmentGroup, result);

    expect(assessmentBlock).toContain("<Card>");
    expect(assessmentBlock).toContain("targets.map");
    expect(assessmentBlock).toContain("style={styles.action}");
    expect(assessmentBlock).toContain("generate(rt.target.star)");
    expect(assessmentBlock).toContain(
      "disabled={loading || ratifyPending || isMinor === null}",
    );
    expect(assessmentBlock).toContain(
      "accessibilityState={{ disabled: loading || ratifyPending || isMinor === null }}",
    );
    expect(assessmentBlock).not.toContain("L3");
    expect(assessmentBlock).not.toContain("L4");
    expect(styleSource).toMatch(/action:\{minHeight:48,/);
  });

  it("does not reintroduce opacity styling in candidate actions", () => {
    const sevenGroup = review.indexOf('t("review.groupSeven")');
    const result = review.indexOf("{result ?", sevenGroup);
    expect(review.slice(sevenGroup, result)).not.toContain("opacity");
  });
});
