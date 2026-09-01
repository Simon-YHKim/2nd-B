import fs from "node:fs";
import path from "node:path";

const SRC = fs
  .readFileSync(path.resolve(__dirname, "..", "people.tsx"), "utf8")
  .replace(/\r\n/g, "\n");
const BODY = SRC.slice(SRC.indexOf("function PeopleMapBody"));

describe("people map load failures stay distinct from an empty account", () => {
  test("an account switch remounts the complete owner-bound state tree", () => {
    expect(SRC).toContain("<PeopleMapBody key={userId} userId={userId} />");

    const loadingGate = SRC.indexOf("if (loading)");
    const authGate = SRC.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const ownerBody = SRC.indexOf("<PeopleMapBody key={userId}");
    expect(loadingGate).toBeGreaterThan(-1);
    expect(loadingGate).toBeLessThan(authGate);
    expect(authGate).toBeLessThan(ownerBody);
    expect(BODY).not.toContain("useAuth(");
    expect(BODY).toContain("await createPerson(userId");
  });

  test("overlapping loads use the shared latest-wins owner guard", () => {
    expect(BODY).toContain("useRef(createLatestWins())");
    expect(BODY).toContain("const token = loadGuardRef.current.begin()");
    expect(BODY.match(/loadGuardRef\.current\.isStale\(token\)/g)).toHaveLength(2);
  });

  test("a rejected load preserves the last successful people list", () => {
    const catchBlock = SRC.match(/catch \(e\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
    expect(catchBlock).toContain("setLoadFailed(true)");
    expect(catchBlock).not.toContain("setPeople([])");
  });

  test("the visible failure state explains the network problem and offers retry", () => {
    expect(SRC).toContain('t("common:errors.network")');
    expect(SRC).toContain('label={t("common:actions.retry")}');
    expect(SRC).toContain("onPress={refresh}");
    expect(SRC).toMatch(/people === null[\s\S]{0,80}loadFailed \? null/);
  });

  test("a confirmed save is merged before the background reconciliation", () => {
    expect(BODY).toContain("const created = await createPerson(userId");
    expect(BODY).toContain("previous.filter((person) => person.id !== created.id)");
    const merge = BODY.indexOf("setPeople((previous)");
    const refresh = BODY.indexOf("void refresh();", merge);
    expect(merge).toBeGreaterThan(-1);
    expect(refresh).toBeGreaterThan(merge);
  });

  test("a timed-out save reconciles because the underlying write may land late", () => {
    const handleAdd = BODY.slice(BODY.indexOf("async function handleAdd"));
    expect(SRC).toContain('import { isTimeoutError } from "@/lib/async/with-timeout"');
    expect(handleAdd).toContain("if (isTimeoutError(e)) void refresh();");
  });
});
