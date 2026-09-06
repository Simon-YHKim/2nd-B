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
    expect(BODY).toContain("}, attempt.id, attempt.rev);");
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

  test("save identity survives retries and synchronous double presses are blocked", () => {
    expect(BODY).toContain("const attemptGenRef = useRef(0)");
    expect(BODY).toContain("const saveIdRef = useRef<PersonSaveIdentity | null>(null)");
    expect(BODY).toContain("const inFlightRef = useRef<PersonSaveIdentity | null>(null)");
    expect(BODY).toContain("beginPersonSaveAttempt(");
    expect(BODY).toContain("() => Crypto.randomUUID()");
  });

  test("closing invalidates only UI while the request keeps its id+revision lock", () => {
    const handleAdd = BODY.slice(BODY.indexOf("async function handleAdd"), BODY.indexOf("function closeAddForm"));
    expect(handleAdd.match(/isCurrentPersonSaveAttempt\(attemptGenRef, attempt\)/g)).toHaveLength(2);
    expect(handleAdd).toContain("completePersonSaveAttempt(saveIdRef, inFlightRef, attempt)");
    expect(handleAdd).toContain("releasePersonSaveAttempt(inFlightRef, attempt)");

    const closeForm = BODY.slice(BODY.indexOf("function closeAddForm"), BODY.indexOf("function toggleAddForm"));
    expect(closeForm).toContain("invalidatePersonSaveAttemptUi(attemptGenRef)");
    expect(closeForm).not.toContain("setSaving(false)");
    expect(closeForm).not.toContain("saveIdRef");
    expect(closeForm).not.toContain("inFlightRef");
    expect(BODY).toContain("onPress={toggleAddForm}");
    expect(BODY).toContain("disabled={!adding && saving}");
    expect(BODY).toContain("} else if (!saving) {");
    expect(BODY).not.toMatch(/set(?:Timeout|Interval)\s*\(/);
  });

  test("a hidden success consumes the draft while a hidden failure preserves it for retry", () => {
    const handleAdd = BODY.slice(BODY.indexOf("async function handleAdd"), BODY.indexOf("function closeAddForm"));
    const catchStart = handleAdd.indexOf("} catch (e) {");
    const success = handleAdd.slice(0, catchStart);
    const failure = handleAdd.slice(catchStart);

    const settle = success.indexOf("completePersonSaveAttempt(saveIdRef, inFlightRef, attempt)");
    const clearDraft = success.indexOf('setName("")');
    const visibleOnly = success.indexOf("if (isCurrentUi) {");
    expect(settle).toBeGreaterThan(-1);
    expect(clearDraft).toBeGreaterThan(settle);
    expect(visibleOnly).toBeGreaterThan(clearDraft);

    expect(failure).toContain("releasePersonSaveAttempt(inFlightRef, attempt)");
    expect(failure).not.toContain('setName("")');
  });
});
