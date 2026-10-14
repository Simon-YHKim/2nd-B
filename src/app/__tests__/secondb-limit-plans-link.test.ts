// Every limit bubble comes with 요금제 보기 (Simon 2026-10-14, Q-261014-24: "the limit sentence and
// 요금제 보기 only"). The link used to follow the local count alone (atLimit). When the server's cap
// refused a send while the local count was still under the wall, sendChatMessage returned "blocked"
// with its own limit sentence, the bubble appeared, and the link did not (review r1 on #2497).
//
// Component render tests are blocked in this repo (RN upstream), so the screen is pinned by reading
// its source, the way chat-allowance-wiring.test.ts pins this same file.
import { readFileSync } from "node:fs";
import path from "node:path";

const screen = readFileSync(path.resolve(__dirname, "../secondb.tsx"), "utf8").replace(/\r\n/g, "\n");

function between(start: string, end: string): string {
  const from = screen.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = screen.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return screen.slice(from, to);
}

test("the plans link shows at the local wall or after any send the limit refused", () => {
  const link = between("{atLimit || limitRefused ? (", "</Pressable>");
  expect(link).toContain('router.push("/plans?from=ai_limit")');
  // One link, one condition: the old local-only gate is gone.
  expect(screen).not.toContain("{atLimit ? (");
  expect(screen.split('router.push("/plans?from=ai_limit")')).toHaveLength(2);
});

test("a blocked send marks the refusal, whichever way the limit refused it", () => {
  // Both blocked returns of sendChatMessage (the pre-check and the server's cap) land in this branch.
  const blocked = between('if (result.status === "blocked") {', "} else {");
  expect(blocked).toContain("text: result.hint, synthetic: true");
  expect(blocked).toContain("setLimitRefused(true);");
  expect(blocked).not.toContain("setLimitRefused(false)");
});

test("a reply that goes through, or a granted ad bonus, clears it", () => {
  const branches = between('if (result.status === "blocked") {', 'outcome: "ok"');
  expect(branches.slice(branches.indexOf("} else {"))).toContain("setLimitRefused(false);");
  const granted = between('if (outcome === "granted") {', "}");
  expect(granted).toContain("setLimitRefused(false);");
  // Exactly these three writes: set on a refusal, cleared by a reply or a grant.
  expect(screen.match(/setLimitRefused\(/g)).toHaveLength(3);
});
