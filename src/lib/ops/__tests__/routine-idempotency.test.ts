import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rows = new Map<string, Record<string, unknown>>();
let mockLostResponse = false;
let mockSequence = 0;
let mockCurrent = true;
const signals: AbortSignal[] = [];
const mockFrom = jest.fn(() => {
  function write(input: Record<string, unknown>, conflict?: { onConflict: string }) {
    const query = {
      select: () => query,
      abortSignal: (signal: AbortSignal) => { signals.push(signal); return query; },
      single: async () => {
        const id = String(input.id ?? `server-${++mockSequence}`);
        if (rows.has(id) && conflict?.onConflict !== "id") return { error: { code: "23505" }, data: null };
        const row = { ...rows.get(id), ...input, id, created_at: "2026-10-10T00:00:00Z" };
        rows.set(id, row);
        if (mockLostResponse) { mockLostResponse = false; throw new Error("response lost after commit"); }
        return { error: null, data: row };
      },
    };
    return query;
  }
  return { insert: write, upsert: write };
});
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));
jest.mock("../../auth/account-epoch", () => ({ captureAccountOwnerLease: () => mockCurrent ? { isCurrent: () => mockCurrent } : null }));
import { createRoutineFromRecommendation } from "../routines";

const rec = { title: "Read a chapter", reason: "", recurrence: "daily" as const };
const controller = new AbortController();
// The extra option intentionally compiles against the pre-fix function too.
const options = { routineId: "00000000-0000-4000-8000-000000000001", signal: controller.signal };
beforeEach(() => { rows.clear(); signals.length = 0; mockSequence = 0; mockCurrent = true; mockLostResponse = false; jest.clearAllMocks(); });

test("G5-05 a committed write with a lost response retries into one persisted row", async () => {
  mockLostResponse = true;
  await expect(createRoutineFromRecommendation("owner-a", "reading_list", rec, options)).rejects.toThrow("response lost");
  const saved = await createRoutineFromRecommendation("owner-a", "reading_list", rec, options);
  expect(rows.size).toBe(1);
  expect(saved.id).toBe(options.routineId);
  expect(signals).toEqual([controller.signal, controller.signal]);
});

test("G5-05 editing an uncertain retry updates that same row to the visible reviewed fields", async () => {
  mockLostResponse = true;
  await expect(createRoutineFromRecommendation("owner-a", "reading_list", rec, options)).rejects.toThrow();
  const saved = await createRoutineFromRecommendation("owner-a", "home_reset", { ...rec, title: "Tidy desk" }, options);
  expect(rows.size).toBe(1);
  expect(saved).toMatchObject({ id: options.routineId, domain_id: "home_reset", title: "Tidy desk", user_id: "owner-a" });
});

test("G5-05 a new confirmation ID creates an independent routine and legacy calls retain server IDs", async () => {
  await createRoutineFromRecommendation("owner-a", "reading_list", rec, options);
  const next = { ...options, routineId: "00000000-0000-4000-8000-000000000002" };
  await createRoutineFromRecommendation("owner-a", "reading_list", rec, next);
  await createRoutineFromRecommendation("owner-a", "reading_list", rec);
  expect(rows.size).toBe(3);
});

test("G5-05 the new retry write requires the current owner and rejects stale requests before Supabase", async () => {
  mockCurrent = false;
  await expect(createRoutineFromRecommendation("owner-a", "reading_list", rec, options)).rejects.toThrow();
  expect(mockFrom).not.toHaveBeenCalled();
});

test("existing migration permits client UUIDs and owner-only insert/update without a server change", () => {
  const sql = readFileSync(resolve(__dirname, "../../../../db/migrations/0048_ops_routines.sql"), "utf8");
  expect(sql).toMatch(/id\s+uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
  expect(sql).toMatch(/CREATE POLICY ops_routines_owner_all ON ops_routines\s+FOR ALL TO authenticated\s+USING \(user_id = auth.uid\(\)\)\s+WITH CHECK \(user_id = auth.uid\(\)\)/);
});
