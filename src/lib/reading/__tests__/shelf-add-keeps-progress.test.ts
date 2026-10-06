// R2C-08 (2026-10-05): adding a book that was already on the shelf reset it.
//
// addToShelf upserted `{ status: "want", current_page: 0 }` on (user_id, volume_id).
// The UNIQUE(user_id, volume_id) constraint (0053) turned a second add into an UPDATE,
// so a book being read, 120 pages in, silently went back to "want" at page 0 when the
// user tapped its search result again. These tests drive addToShelf against a recorded
// fake client and assert that an existing row is returned untouched: no upsert, no
// insert, no update.

type Call = [string, ...unknown[]];
const mockCalls: Call[] = [];
let mockExisting: Record<string, unknown> | null = null;
let mockInsertError: { code: string } | null = null;
let mockRaceRow: Record<string, unknown> | null = null;

jest.mock("@/lib/persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));
jest.mock("@/lib/supabase/client", () => {
  const make = () => {
    const builder: Record<string, unknown> = {};
    let mode: "select" | "insert" | "other" = "other";
    const rec = (m: string) => (...a: unknown[]) => {
      mockCalls.push([m, ...a]);
      if (m === "insert") mode = "insert";
      if (m === "select" && mode !== "insert") mode = "select";
      return builder;
    };
    for (const m of ["from", "select", "eq", "insert", "upsert", "update", "delete"]) builder[m] = rec(m);
    builder.maybeSingle = async () => {
      mockCalls.push(["maybeSingle"]);
      if (mockInsertError && mockRaceRow && mockCalls.some((c) => c[0] === "insert")) {
        return { data: mockRaceRow, error: null };
      }
      return { data: mockExisting, error: null };
    };
    builder.single = async () => {
      mockCalls.push(["single"]);
      if (mode === "insert" && mockInsertError) return { data: null, error: mockInsertError };
      return { data: { id: "new", user_id: "u", volume_id: "v", title: "T", status: "want", current_page: 0 }, error: null };
    };
    return builder;
  };
  return { getSupabaseClient: () => make() };
});

import { addToShelf } from "../shelf";

const book = { id: "vol-1", title: "Demian", authors: ["Hesse"], pageCount: 200 };
const writes = () => mockCalls.filter((c) => ["insert", "upsert", "update", "delete"].includes(c[0]));

beforeEach(() => {
  mockCalls.length = 0;
  mockExisting = null;
  mockInsertError = null;
  mockRaceRow = null;
});

describe("addToShelf never rewrites a book that is already on the shelf", () => {
  test("an existing row comes back as it is, with no write at all", async () => {
    mockExisting = {
      id: "row-1",
      user_id: "u",
      volume_id: "vol-1",
      title: "Demian",
      status: "reading",
      current_page: 120,
      total_pages: 200,
    };
    const got = await addToShelf("u", book, "want");
    expect(got.status).toBe("reading");
    expect(got.current_page).toBe(120);
    expect(writes()).toEqual([]);
  });

  test("the lookup is scoped to this user and this volume", async () => {
    mockExisting = { id: "row-1", user_id: "u", volume_id: "vol-1", title: "Demian", status: "done" };
    await addToShelf("u", book);
    expect(mockCalls).toContainEqual(["eq", "user_id", "u"]);
    expect(mockCalls).toContainEqual(["eq", "volume_id", "vol-1"]);
  });

  test("a new book is inserted (never upserted over an existing row)", async () => {
    const got = await addToShelf("u", book, "want");
    expect(got.id).toBe("new");
    expect(writes().map((c) => c[0])).toEqual(["insert"]);
    const [, payload] = writes()[0]!;
    expect(payload).toMatchObject({ user_id: "u", volume_id: "vol-1", status: "want", current_page: 0, total_pages: 200 });
  });

  test("a lost race on the unique constraint returns the row the other tap made", async () => {
    mockInsertError = { code: "23505" };
    mockRaceRow = { id: "row-2", user_id: "u", volume_id: "vol-1", title: "Demian", status: "want" };
    const got = await addToShelf("u", book);
    expect(got.id).toBe("row-2");
  });

  test("any other insert failure still throws, so the screen can say so", async () => {
    mockInsertError = { code: "42501" };
    await expect(addToShelf("u", book)).rejects.toEqual({ code: "42501" });
  });
});
