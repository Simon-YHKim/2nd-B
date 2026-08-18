// The canon data lives in TWO places and nothing kept them in sync.
//
//   design/proto_rev2/reference-app/data/  <- documented canon (CLAUDE.md)
//   public/proto/data/                     <- what src/lib/canon actually imports
//
// They were byte-identical at 2026-08-18 by discipline alone: no copy step, no
// build hook, no check. So editing the documented canon changed nothing in the
// app, and editing only public/ left the reference app describing a different
// product — both silent. This test makes the drift loud.
//
// If it fails, copy the source of truth over the mirror (design -> public) and
// re-run; do not "fix" it by editing whichever side happens to be wrong.

import fs from "fs";
import path from "path";

const REPO = path.resolve(__dirname, "../../../..");
const SOURCE = path.join(REPO, "design/proto_rev2/reference-app/data");
const MIRROR = path.join(REPO, "public/proto/data");

function jsonFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) out.push(path.relative(root, p).replace(/\\/g, "/"));
    }
  };
  walk(root);
  return out.sort();
}

describe("canon data mirror", () => {
  it("has the same file list on both sides", () => {
    expect(jsonFiles(MIRROR)).toEqual(jsonFiles(SOURCE));
  });

  it("has identical content on both sides", () => {
    // Compared as parsed JSON so a formatter or a line-ending flip is not a
    // false alarm; any real value difference still fails.
    const drifted = jsonFiles(SOURCE).filter((rel) => {
      const a = fs.readFileSync(path.join(SOURCE, rel), "utf8");
      const b = fs.readFileSync(path.join(MIRROR, rel), "utf8");
      return JSON.stringify(JSON.parse(a)) !== JSON.stringify(JSON.parse(b));
    });
    expect(drifted).toEqual([]);
  });
});
