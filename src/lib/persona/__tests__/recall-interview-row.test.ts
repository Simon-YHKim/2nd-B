// buildPersona / loadStarLevels keep recall-interview transcripts out of the short
// life-audit answers the Big Five proxy reads. Since 0218 the interview marker is
// the app's own column (records.system_tags): a user tag that says `interview` on
// an audit answer must not drop that answer from the proxy.
import { auditResponseColumns, isRecallInterviewRow } from "../build";

describe("isRecallInterviewRow", () => {
  it("reads the app's marker from system_tags when the row has the column", () => {
    expect(isRecallInterviewRow({ tags: ["domain:growth"], system_tags: ["interview", "recall", "screener"] })).toBe(true);
    expect(isRecallInterviewRow({ tags: ["life_audit", "values", "interview"], system_tags: [] })).toBe(false);
  });

  it("falls back to the pre-0218 reading when the database has no such column", () => {
    expect(isRecallInterviewRow({ tags: ["domain:growth", "interview", "recall"] })).toBe(true);
    expect(isRecallInterviewRow({ tags: ["life_audit", "values"] })).toBe(false);
  });
});

describe("auditResponseColumns", () => {
  it("asks for system_tags only when the database has it", () => {
    expect(auditResponseColumns(true)).toBe("id, prompt, body, created_at, tags, system_tags");
    expect(auditResponseColumns(false)).toBe("id, prompt, body, created_at, tags");
  });
});
