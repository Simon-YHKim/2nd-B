import { loadSevenLevelsStrict } from "../load-seven-levels-strict";
import { loadSevenLevels } from "../load-seven-levels";
import { invalidateProfileStarLevel, loadProfileStarLevel } from "../load-profile-star";
import { DRILL_LAYERS, LIFE_PERIODS } from "../../interview/probe";

type Reply = { data: unknown; error: unknown };
type Query = { table: string; columns: string; eq: Record<string, unknown>; contains: unknown; order: unknown };
const mockQueries: Query[] = [];
let mockOverride: (q: Query) => Reply | Promise<Reply> | undefined;
let mockData: Record<string, unknown>;
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  from(table: string) {
    const query: Query = { table, columns: "", eq: {}, contains: null, order: null };
    const chain = {
      select(columns: string) { query.columns = columns; return chain; },
      eq(key: string, value: unknown) { query.eq[key] = value; return chain; },
      contains(key: string, value: unknown) { query.contains = { key, value }; return chain; },
      order(key: string, value: unknown) { query.order = { key, value }; return chain; },
      maybeSingle() { return chain; },
      then(resolve: (r: Reply) => unknown, reject?: (e: unknown) => unknown) {
        mockQueries.push(query);
        return Promise.resolve(mockOverride(query) ?? { data: mockData[table], error: null }).then(resolve, reject);
      },
    };
    return chain;
  },
}) }));
const tables = ["interview_coverage", "users", "records", "peer_invitations", "star_tier_history"];
const current = () => {};
beforeEach(() => {
  invalidateProfileStarLevel(); mockQueries.length = 0; mockOverride = () => undefined;
  mockData = {
    interview_coverage: [], users: { id: "owner-a", display_name: null, birth_date: null, profile_details: {} },
    records: [], peer_invitations: [], star_tier_history: [],
  };
});

test("confirmed empty inputs produce the same levels as the existing reader", async () => {
  expect(await loadSevenLevelsStrict("owner-a", current)).toEqual(await loadSevenLevels("owner-a"));
});
test("actual coverage, profile inputs and newest ratified lifts preserve the legacy formula", async () => {
  mockData.interview_coverage = LIFE_PERIODS.flatMap((period, index) => DRILL_LAYERS.slice(0, index % 6)
    .map((layer) => ({ period, layer, answers: 2 })));
  mockData.users = { id: "owner-a", display_name: "A", birth_date: "1990-01-01", profile_details: {} };
  mockData.records = [{ id: "goal1" }, { id: "goal2" }];
  mockData.peer_invitations = [{ id: "peer1" }];
  mockData.star_tier_history = [{ star_id: "seven:infancy", level: 5 }, { star_id: "seven:infancy", level: 1 },
    { star_id: "seven:school", level: 2 }, { star_id: "seven:school", level: 5 }, { star_id: "now", level: 5 }];
  const strict = await loadSevenLevelsStrict("owner-a", current);
  expect(strict).toEqual(await loadSevenLevels("owner-a"));
  expect(strict.starLevels.infancy).toBe(5);
  expect(strict.starLevels.school).toBe(2);
});
test("profile is excluded from the headline and every request retains its owner and filters", async () => {
  const empty = await loadSevenLevelsStrict("owner-a", current);
  mockData.peer_invitations = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));
  mockData.users = { id: "owner-a", display_name: "A", birth_date: "1990-01-01", profile_details: {} };
  mockData.records = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }));
  const full = await loadSevenLevelsStrict("owner-a", current);
  expect(full.starLevels.profile).toBeGreaterThan(empty.starLevels.profile);
  expect(full.northStarBrightness).toBe(empty.northStarBrightness);
  expect(mockQueries).toHaveLength(10);
  for (const q of mockQueries) expect(q.eq[q.table === "users" ? "id" : "user_id"]).toBe("owner-a");
  expect(mockQueries.find((q) => q.table === "peer_invitations")!.eq.status).toBe("accepted");
  expect(mockQueries.find((q) => q.table === "records")!.contains).toEqual({ key: "tags", value: ["northstar_sentence"] });
  const ratified = mockQueries.find((q) => q.table === "star_tier_history")!;
  expect(ratified.eq.evidence_origin).toBe("ratify");
  expect(ratified.order).toEqual({ key: "recorded_at", value: { ascending: false } });
});
test.each(tables)("%s error rejects immediately while another input hangs", async (table) => {
  const error = new Error(`${table} unavailable`);
  const peer = tables.find((name) => name !== table)!;
  mockOverride = (q) => q.table === table ? { data: null, error } : q.table === peer ? new Promise(() => {}) : undefined;
  let seen: unknown;
  void loadSevenLevelsStrict("owner-a", current).catch((e) => { seen = e; });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(seen).toBe(error);
});
test.each(tables)("%s rejected transport remains a failure", async (table) => {
  const error = new Error("network");
  mockOverride = (q) => q.table === table ? Promise.reject(error) : undefined;
  await expect(loadSevenLevelsStrict("owner-a", current)).rejects.toBe(error);
});
test.each(tables)("%s error with plausible stale data still fails", async (table) => {
  const error = new Error("read denied");
  mockOverride = (q) => q.table === table ? { data: mockData[table], error } : undefined;
  await expect(loadSevenLevelsStrict("owner-a", current)).rejects.toBe(error);
});
test.each(["interview_coverage", "records", "peer_invitations", "star_tier_history"])("%s rejects malformed and sparse rows", async (table) => {
  for (const data of [[null], [[]], Array(1)]) {
    mockData[table] = data;
    await expect(loadSevenLevelsStrict("owner-a", current)).rejects.toThrow("rows");
  }
});
test.each(tables)("%s null response cannot fabricate empty data", async (table) => {
  mockData[table] = null;
  await expect(loadSevenLevelsStrict("owner-a", current)).rejects.toThrow();
});
test.each([null, false, "", "1", NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("known coverage count %s fails before a hanging peer", async (answers) => {
  mockData.interview_coverage = [{ period: "infancy", layer: "fact", answers }];
  mockOverride = (q) => q.table === "users" ? new Promise(() => {}) : undefined;
  let seen: unknown;
  void loadSevenLevelsStrict("owner-a", current).catch((e) => { seen = e; });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(seen).toEqual(new Error("Brightness coverage was invalid"));
});
test("zero and unknown coverage keys keep the successful empty semantics", async () => {
  const empty = await loadSevenLevelsStrict("owner-a", current);
  mockData.interview_coverage = [{ period: "infancy", layer: "fact", answers: 0 },
    { period: "future-key", layer: "fact", answers: "unknown" }];
  expect(await loadSevenLevelsStrict("owner-a", current)).toEqual(empty);
});
test.each([
  { table: "interview_coverage", row: {} },
  { table: "interview_coverage", row: { period: null, layer: "fact", answers: 1 } },
  { table: "interview_coverage", row: { period: "infancy", layer: 7, answers: 1 } },
  { table: "interview_coverage", row: { period: "", layer: "fact", answers: 1 } },
  { table: "interview_coverage", row: { period: "infancy", layer: "", answers: 1 } },
  { table: "star_tier_history", row: { level: 5 } },
  { table: "star_tier_history", row: { star_id: null, level: 5 } },
  { table: "star_tier_history", row: { star_id: 7, level: 5 } },
  { table: "star_tier_history", row: { star_id: "", level: 5 } },
])("missing or malformed $table identifiers cannot confirm L1", async ({ table, row }) => {
  mockData[table] = [row];
  await expect(loadSevenLevelsStrict("owner-a", current)).rejects.toThrow("identifiers");
});
test.each([null, "5", NaN, Infinity])("known ratified level %s cannot imply revoked ratification", async (level) => {
  mockData.star_tier_history = [{ star_id: "seven:infancy", level }];
  await expect(loadSevenLevelsStrict("owner-a", current)).rejects.toThrow("ratified level");
});
test.each(["records", "peer_invitations"])("%s malformed identities cannot count as profile input", async (table) => {
  mockData[table] = [{}];
  await expect(loadSevenLevelsStrict("owner-a", current)).rejects.toThrow("ids");
});
test.each([
  { id: "owner-b", display_name: null, birth_date: null, profile_details: {} },
  { id: "owner-a", display_name: null, birth_date: null },
  { id: "owner-a", display_name: 7, birth_date: null, profile_details: {} },
  { id: "owner-a", display_name: null, birth_date: false, profile_details: {} },
])("missing or mismatched profile fields reject", async (user) => {
  mockData.users = user;
  await expect(loadSevenLevelsStrict("owner-a", current)).rejects.toThrow("profile fields");
});
test("a cached legacy failed L1 cannot satisfy a subsequent strict read", async () => {
  mockOverride = () => ({ data: null, error: new Error("offline") });
  expect(await loadProfileStarLevel("owner-a")).toBe(1);
  mockOverride = () => undefined;
  mockData.users = { id: "owner-a", display_name: "A", birth_date: "1990-01-01", profile_details: {} };
  mockData.records = [{ id: "goal" }];
  const before = mockQueries.length;
  expect((await loadSevenLevelsStrict("owner-a", current)).starLevels.profile).toBeGreaterThan(1);
  expect(mockQueries.length - before).toBe(5);
  expect(await loadProfileStarLevel("owner-a")).toBe(1);
});
test("a strict request does not join a hanging legacy profile read", async () => {
  mockOverride = () => new Promise(() => {});
  void loadProfileStarLevel("owner-a");
  for (let i = 0; i < 5; i++) await Promise.resolve();
  mockOverride = () => undefined;
  await expect(loadSevenLevelsStrict("owner-a", current)).resolves.toBeDefined();
});
test("missing owner and an initially revoked scope start no requests", async () => {
  await expect(loadSevenLevelsStrict("", current)).rejects.toThrow("owner");
  await expect(loadSevenLevelsStrict("owner-a", () => { throw new Error("revoked"); })).rejects.toThrow("revoked");
  expect(mockQueries).toHaveLength(0);
});
test("revocation before queued dispatch starts no requests", async () => {
  let active = true;
  const pending = loadSevenLevelsStrict("owner-a", () => { if (!active) throw new Error("revoked"); });
  active = false;
  await expect(pending).rejects.toThrow("revoked");
  expect(mockQueries).toHaveLength(0);
});
test("revocation inside the first dispatch suppresses the other four requests and the result", async () => {
  let active = true;
  mockOverride = () => { active = false; return undefined; };
  await expect(loadSevenLevelsStrict("owner-a", () => { if (!active) throw new Error("revoked"); })).rejects.toThrow("revoked");
  expect(mockQueries).toHaveLength(1);
});
test("a completed old read cannot return after ownership changes", async () => {
  let active = true;
  let finish!: (reply: Reply) => void;
  mockOverride = (q) => q.table === "users" ? new Promise((resolve) => { finish = resolve; }) : undefined;
  const pending = loadSevenLevelsStrict("owner-a", () => { if (!active) throw new Error("revoked"); });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  active = false;
  finish({ data: mockData.users, error: null });
  await expect(pending).rejects.toThrow("revoked");
  expect(mockQueries).toHaveLength(5);
});
