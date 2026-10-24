import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";

const { assertCatalogSnapshotUnchanged: unchanged } = require("../lib/catalog-snapshot.cjs") as {
  assertCatalogSnapshotUnchanged: (actual: string, expected: string, label?: string) => void;
};
const runner = readFileSync("scripts/test-deletion-receipt-arbitration.mjs", "utf8");
const source = runner.slice(runner.indexOf("function connection("), runner.indexOf("async function run("));
const routine = { oid: "17", proname: "existing_function", prosrc: "SELECT 1", proacl: ["=X/postgres"], prosecdef: false };
const trigger = { oid: "23", tgname: "RI_ConstraintTrigger_a_23", tgisinternal: true, tgfoid: "19", tgenabled: "O" };
const snapshot = (routines: unknown[] | null = [routine], triggers: unknown[] | null = [trigger]) =>
  JSON.stringify({ routines, triggers });

describe("catalog comparison reports only changed objects without losing columns", () => {
  test("unchanged catalogs, including empty collections, pass", () => {
    unchanged(snapshot(), snapshot());
    unchanged(snapshot(null, null), snapshot(null, null));
  });

  test.each(["prosrc", "proacl", "prosecdef", "prosupport", "proconfig", "proname", "future_column"])(
    "routine change to %s still fails", column => {
      const actual = snapshot([{ ...routine, [column]: "changed" }]);
      expect(() => unchanged(actual, snapshot())).toThrow(new RegExp(`routines oid=17.*columns=\\[${column}\\]`));
    },
  );

  test.each(["tgfoid", "tgenabled", "tgqual", "tgisinternal", "tgconstraint", "tgargs"])(
    "internal FK trigger change to %s still fails", column => {
      expect(() => unchanged(snapshot([routine], [{ ...trigger, [column]: "changed" }]), snapshot()))
        .toThrow(new RegExp(`triggers oid=23 name="RI_ConstraintTrigger_a_23" changed columns=\\[${column}\\]`));
    },
  );

  test("added, removed, and replaced OIDs fail even when the names match", () => {
    expect(() => unchanged(snapshot([{ ...routine, oid: "18" }]), snapshot())).toThrow(/oid=17.*removed[\s\S]*oid=18.*added/);
    expect(() => unchanged(snapshot([routine], []), snapshot())).toThrow(/triggers oid=23.*removed/);
    expect(() => unchanged(snapshot([routine], [trigger, { ...trigger, oid: "24" }]), snapshot())).toThrow(/triggers oid=24.*added/);
  });

  test("long function bodies do not hide the changed column behind Node's assertion truncation", () => {
    const body = "가나다".repeat(400000);
    let error: Error | undefined;
    try { unchanged(snapshot([{ ...routine, prosrc: body + "x" }]), snapshot([{ ...routine, prosrc: body }]), "repeat apply"); }
    catch (caught) { error = caught as Error; }
    expect(error?.message).toMatch(/repeat apply: 1 changed.*\nroutines oid=17 name="existing_function" changed columns=\[prosrc\]/);
    expect(error?.message).toContain("sha256=");
    expect(error?.message.length).toBeLessThan(500);
    expect(error?.message).not.toContain("triggers");
    expect(error).not.toHaveProperty("actual");
    expect(error).not.toHaveProperty("expected");
    // Exercise the uncaught-error path CI sees, not only Error.message.
    const run = spawnSync(process.execPath, ["-e", `
      const {assertCatalogSnapshotUnchanged: check} = require('./scripts/lib/catalog-snapshot.cjs');
      const before = {routines:[{oid:'1',proname:'probe',prosrc:'x'.repeat(1200000)}],triggers:null};
      const after = structuredClone(before); after.routines[0].prosrc += 'y';
      check(JSON.stringify(after), JSON.stringify(before));
    `], { encoding: "utf8" });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("columns=[prosrc]");
    expect(run.stderr.length).toBeLessThan(4000);
  });

  test("many changes have an explicit bounded report, without passing silently", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ ...routine, oid: String(i + 1) }));
    let message = "";
    try { unchanged(snapshot(rows.map(row => ({ ...row, prosrc: "SELECT 2" }))), snapshot(rows)); }
    catch (caught) { message = (caught as Error).message; }
    expect(message).toContain("1000 changed catalog object(s)");
    expect(message).toContain("more changed objects omitted");
    expect(message.length).toBeLessThan(13000);
  });

  test("a missing column differs from null; invalid JSON and duplicate OIDs fail closed", () => {
    expect(() => unchanged(snapshot([{ ...routine, proconfig: null }]), snapshot())).toThrow(/proconfig/);
    expect(() => unchanged("not JSON", snapshot())).toThrow("invalid catalog JSON");
    expect(() => unchanged('{}', snapshot())).toThrow("invalid catalog collections");
    expect(() => unchanged(snapshot([routine, routine]), snapshot())).toThrow("duplicate routines OID");
  });

  test("all three runner preservation checkpoints use the compact assertion", () => {
    expect(runner.match(/assertCatalogSnapshotUnchanged\(await ok\(existingSnapshot\), existing/g)).toHaveLength(3);
    expect(runner).not.toMatch(/assert\.equal\(await ok\(existingSnapshot\)/);
    expect(runner).toContain("to_jsonb(p) ORDER BY p.oid");
    expect(runner).toContain("to_jsonb(t) ORDER BY t.oid");
    const workflow = readFileSync(".github/workflows/supabase-dry-run.yml", "utf8");
    expect(workflow).toContain('"scripts/lib/catalog-snapshot.cjs"');
    expect(workflow).toContain('"scripts/__tests__/catalog-snapshot.test.ts"');
  });
});

describe("the actual psql connection preserves UTF-8 across Buffer boundaries", () => {
  test.each(["stdout", "stderr"] as const)("%s preserves every split of 2/3/4-byte characters", async channel => {
    // Evaluate the runner's real connection body with only its process boundary
    // replaced. No PG dependency or duplicate decoder implementation in Jest.
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(),
      stdin: { write: jest.fn(), end: jest.fn() },
    });
    const spawn = jest.fn(() => child);
    const connection = new Function("spawn", "args", "env", "root", `${source}; return connection;`)(spawn, () => [], {}, process.cwd());
    const c = connection("fixture");
    const expected = "é한😀";
    const bytes = Buffer.from(expected);
    // Split at every byte, then send a catalog-sized body over pipe-sized chunks.
    for (const byte of bytes) child[channel].write(Buffer.from([byte]));
    const large = "기록é😀".repeat(150000);
    const largeBytes = Buffer.from(large);
    for (let i = 0; i < largeBytes.length; i += 65536) child[channel].write(largeBytes.subarray(i, i + 65536));
    child.stdout.write("\nCATALOG_DONE\n");
    await c.marker("CATALOG_DONE");
    child.stdout.end(); child.stderr.end();
    child.emit("close", 0);
    const result = await c.done;
    expect(result.code).toBe(0);
    // Keep a regression failure bounded too; do not print the large payload.
    expect(result[channel === "stdout" ? "out" : "err"] === expected + large + (channel === "stdout" ? "\nCATALOG_DONE" : "")).toBe(true);
  });
});
