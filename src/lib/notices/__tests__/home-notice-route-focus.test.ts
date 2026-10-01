import { readFileSync } from "node:fs";
import { join } from "node:path";

// Regression: the first-record coach marks itself seen while /capture is on top.
// A still-mounted home must not open its notice Modal over that flow.
const home = readFileSync(
  join(__dirname, "..", "..", "..", "components", "deep-space", "ConstellationHome.tsx"),
  "utf8",
);

describe("home notice route focus", () => {
  test("tracks whether the home route is focused", () => {
    expect(home).toMatch(/useFocusEffect\(/);
    expect(home).toMatch(/const \[homeFocused, setHomeFocused\] = useState\(false\)/);
  });

  test("never mounts a notice dialog over another route", () => {
    expect(home).toMatch(/visible=\{homeFocused && \(autoNoticeVisible \|\| manualNoticeVisible\)\}/);
  });
});
