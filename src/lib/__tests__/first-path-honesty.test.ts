// First-experience-path honesty contracts (flow-map /northstar + /secondb).
// Render tests are blocked in this repo (RN 0.85 + jest), so these pin the
// screen-layer wiring as source contracts — the same fixes regressed silently
// before precisely because nothing read the screens.
//
// Rule for every source-scan guard here: normalize CRLF FIRST (a \r\n file
// once turned a slice guard into a 2-character no-op that passed forever).
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

describe("/northstar failure surfaces (flow-map bugs 2+3)", () => {
  const src = read("src/app/northstar.tsx");

  it("keeps propose failure distinct from the thin-base card", () => {
    expect(src).toContain("setProposeError(true)");
    // thinBase turns on in exactly ONE place: the lib's honest null (else
    // branch). A second site would be the catch sneaking the lie back in.
    // (Counting beats a brace-matching regex: nested braces truncated one of
    // these guards into a forever-PASS before.)
    expect(src.match(/setThinBase\(true\)/g) ?? []).toHaveLength(1);
    expect(src).toContain("ds.northstar.proposeFailed");
  });

  it("says so when the save fails instead of just un-spinning the button", () => {
    expect(src).toContain("setSaveErr(true)");
    expect(src).toContain("ds.northstar.saveFailed");
  });

  it("routes a red-zone sentence to the hotline modal before leaving", () => {
    expect(src).toContain("CrisisRouter");
    expect(src).toContain('followup?.zone === "red"');
  });
});

describe("/secondb resilience (flow-map bugs 5+6)", () => {
  const src = read("src/app/secondb.tsx");

  it("holds the loader on a FAILED profile probe instead of ejecting the account", () => {
    expect(src).toContain("hasProfile === false && profileProbeFailed");
  });

  it("copies through expo-clipboard (native + web), never navigator-only", () => {
    expect(src).toContain("writeClipboardText");
    expect(src).not.toContain("navigator.clipboard.writeText");
  });

  it("treats an unreadable usage count as unknown, never as zero", () => {
    expect(src).not.toContain("setUsedToday(0)");
  });

  it("persists the intro dismissal on native, not just web localStorage", () => {
    expect(src).toContain("@react-native-async-storage/async-storage");
  });
});

describe("AuthContext probe failures stay distinguishable", () => {
  const src = read("src/lib/auth/AuthContext.tsx");

  it("flags failed probes instead of publishing a fake hasProfile:false", () => {
    expect(src).toContain("probeFailed: true");
    expect(src).toContain("profileProbeFailed");
  });
});
