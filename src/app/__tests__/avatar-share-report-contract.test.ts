import { readFileSync } from "node:fs";
import { join } from "node:path";

const screen = readFileSync(join(process.cwd(), "src/app/avatar-share.tsx"), "utf8");

describe("Avatar Share report and terms controls", () => {
  test("approved public assets offer separate asset and creator reports plus blocking", () => {
    expect(screen).toContain('selected.status === "approved" && !selected.hiddenAt');
    expect(screen).toContain('setAction({ kind: "report", asset: selected })');
    expect(screen).toContain('setAction({ kind: "creatorReport", asset: selected })');
    expect(screen).toContain('setAction({ kind: "block", asset: selected })');
    expect(screen).toContain('t("avatarShare:creatorReport")');
  });

  test("a selected reason is required and the API receives the distinct target", () => {
    expect(screen).toContain('useState<AvatarShareReportReason | null>(null)');
    expect(screen).toContain('setReportReason(null); setAction({ kind: "creatorReport"');
    expect(screen).toContain('kind === "creatorReport" ? "creator" : "asset"');
    expect(screen).toContain('t(`avatarShare:${action.kind}Confirm`)');
    expect(screen).toContain('setNotice(t(`avatarShare:${kind}Done`))');
  });

  test("a reported asset is hidden immediately and cannot reappear from another page", () => {
    expect(screen).toContain("reportedAssetIdsRef.current.add(asset.id)");
    expect(screen).toContain("setSelected(null)");
    expect(screen).toContain("setPublished((previous) => previous.filter((item) => item.id !== asset.id))");
    expect(screen).toContain("nextPublished.filter((asset) => !reportedAssetIdsRef.current.has(asset.id))");
    expect(screen).toContain("!known.has(asset.id) && !reportedAssetIdsRef.current.has(asset.id)");
    expect(screen).toContain("reportedAssetIdsRef.current.clear()");
  });

  test("users can read terms beside the posting rules before submission", () => {
    const rules = screen.indexOf('t("avatarShare:postingRules")');
    const terms = screen.indexOf('t("avatarShare:terms")');
    const submit = screen.indexOf('t("avatarShare:submit")');
    expect(rules).toBeGreaterThan(-1);
    expect(terms).toBeGreaterThan(rules);
    expect(submit).toBeGreaterThan(terms);
    expect(screen).toContain('router.push("/terms")');
  });
});
