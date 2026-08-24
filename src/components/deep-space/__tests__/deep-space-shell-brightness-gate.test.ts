import fs from "node:fs";
import path from "node:path";

/**
 * Home brightness auth gate — parity-QA finding from the authenticated capture
 * pass: DeepSpaceShell fired loadDomainLevels on userId alone, racing the boot
 * session restore. The Supabase reads went out without the restored access
 * token (anon) → RLS 401 on recreation_items, and the swallowed catch left the
 * first paint silently missing relation/recreation brightness with no retry.
 *
 * Pins (source discipline, like the sibling deep-space guards): the effect must
 * wait for BOTH the auth `loading` flag and `userId`, and re-fire when loading
 * settles — so the read always carries the session token.
 */
const SRC = fs.readFileSync(path.resolve(__dirname, "..", "DeepSpaceShell.tsx"), "utf8");

describe("deep-space home brightness auth gate", () => {
  test("loadDomainLevels waits for the session restore (loading) as well as userId", () => {
    expect(SRC).toMatch(/if \(loading \|\| !userId\) return;/);
  });

  test("the brightness effect re-fires when the session restore settles", () => {
    // 2026-08-24: 의존 배열이 정확히 `[loading, userId]` 여야 한다고 박혀 있었다.
    // 그러면 **다른 이유로 다시 읽는 것**을 영원히 막는다 — 인터뷰를 마치고
    // 돌아왔을 때 밝기를 갱신하려면 방아쇠가 하나 더 필요했다. 지키려던 것은
    // 배열의 길이가 아니라 `loading` 이 그 안에 있다는 사실이므로, 그 사실만 잰다.
    const deps = /\}, \[([^\]]*)\]\);/.exec(SRC)?.[1] ?? "";
    expect(deps).toContain("loading");
    expect(deps).toContain("userId");
  });

  test("화면에 돌아올 때 다시 읽는다 (인터뷰가 판 자리가 하늘에 떠야 한다)", () => {
    // 홈은 한 번 뜬 뒤 마운트된 채로 남는다. 이게 없으면 앱을 껐다 켜야 별이
    // 밝아진다 — 판 보람이 없는 하늘이 된다.
    expect(SRC).toMatch(/useFocusEffect\(/);
    expect(SRC).toMatch(/setRefreshTick\(/);
  });
});
