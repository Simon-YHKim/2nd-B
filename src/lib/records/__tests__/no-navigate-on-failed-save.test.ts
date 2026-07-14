// Three more screens told the user their write had worked by moving on as if it had.
//
// career-drilldown.tsx: the router.push to /secondb sat OUTSIDE the try, so it ran whether
//   or not createRecord threw. A failed 3C4P drilldown -- several minutes of the user
//   structuring their own career experience -- was logged to a console nobody reads, and
//   the screen cheerfully carried on to 세컨비 as though it had been kept.
//
// peer-invites.tsx: revoke() had NO catch at all. A failed revoke rejected into the void:
//   reload() never ran, so the invitation stayed in the list, and nothing said it had
//   failed. For an invite that shares the user's self-model with a third party, "did that
//   work?" is not a question the app gets to leave open.
//
// ImportHubScreen.tsx: `catch { /* surfaced by returning to hub */ }` and then four lines
//   OUTSIDE the try that returned to the hub. It surfaced nothing. A failed import ended
//   exactly like a successful one -- after the user had walked a consent flow and picked a
//   file for it.
//
// The shared rule: navigation and "done" states are claims about a write. Only make them
// when the write actually landed.

import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string): string =>
  readFileSync(resolve(__dirname, "../../../", rel), "utf8").replace(/\r\n/g, "\n");

/** The body of `fn`, from its declaration to the first column-matching close. */
function fnBody(src: string, decl: string): string {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error(`not found: ${decl}`);
  const end = src.indexOf("\n  };", start);
  const end2 = src.indexOf("\n  }", start);
  const stop = end > 0 && (end2 < 0 || end < end2) ? end : end2;
  return src.slice(start, stop > 0 ? stop : src.length);
}

describe("career-drilldown does not navigate away from a failed save", () => {
  const src = read("app/career-drilldown.tsx");
  const submit = fnBody(src, "const submit = async () =>");

  test("the guard is reading the real handler", () => {
    expect(submit).toContain("createRecord");
    expect(submit.length).toBeGreaterThan(200);
  });

  test("the catch bails out instead of falling through to the push", () => {
    const katch = submit.slice(submit.indexOf("} catch"));
    expect(katch).toMatch(/setSaveErr\(true\)/);
    expect(katch).toMatch(/return;/);
  });

  test("the failure is rendered, not just stored", () => {
    // A state nobody reads is the shape of a fix that does nothing -- this session has
    // already produced one of those.
    expect(src).toMatch(/\{saveErr \?/);
    expect(src).toMatch(/careerDrilldown\.saveFailed/);
  });
});

describe("peer-invites surfaces a failed revoke", () => {
  const src = read("app/peer-invites.tsx");
  const revoke = fnBody(src, "async function revoke(id: string)");

  test("revoke has a catch at all", () => {
    expect(revoke).toMatch(/\} catch \{/);
    expect(revoke).toMatch(/setActionErr\(t\("revokeFailed"\)\)/);
  });

  test("the failure is rendered", () => {
    expect(src).toMatch(/\{actionErr \?/);
  });
});

describe("the import hub does not return to the hub on a failed import", () => {
  const src = read("screens/deepspace/import/ImportHubScreen.tsx");

  test("no catch body is just a comment claiming the error surfaces elsewhere", () => {
    // Scan catch BODIES, not the whole file: the fix's own comment quotes the old claim in
    // order to explain why it was false, and a file-wide search flags the explanation along
    // with the thing it explains. (It did, on the first run -- for the third time this
    // session. The lesson is sticking better than my regexes.)
    const CATCH_BODY = /\} catch(?: \([^)]*\))? \{([\s\S]*?)\n\s*\}/g;
    const liars: string[] = [];
    for (const [, body] of src.matchAll(CATCH_BODY)) {
      const code = (body ?? "")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("/*") && l.trim())
        .join("");
      if (code.length === 0) liars.push(body?.trim().slice(0, 60) ?? "");
    }
    expect(liars).toEqual([]);
  });

  test("the catch bails out instead of falling through to setStep('hub')", () => {
    const katch = src.slice(src.indexOf("setImportErr(true)"));
    expect(katch.slice(0, 120)).toMatch(/return;/);
  });

  test("the failure is rendered", () => {
    expect(src).toMatch(/\{importErr \?/);
    expect(src).toMatch(/importFailed/);
  });
});
