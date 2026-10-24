// What the wiki list's read puts on the wire, built by the REAL query builder (supabase-js), with
// only the network replaced.
//
// The second page's conditions never leave an ordinary account (every production account holds
// under 100 rows on 2026-10-14), so they cannot be seen by opening the app. They were checked
// against the real server once, read only, on 2026-10-14: the QA account's 46 rows walked five at a
// time with exactly the parameter values pinned below came back in the same order as one whole
// read, with no row twice and every answer 200. This test keeps the app sending those values.
import { createClient } from "@supabase/supabase-js";

const requests: URL[] = [];
let bodies: unknown[][] = [];

const mockCapture = jest.fn(async (input: unknown) => {
  requests.push(new URL(String(input instanceof Request ? input.url : input)));
  const rows = bodies.shift() ?? [];
  return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
});

jest.mock("../../supabase/client", () => {
  let client: unknown = null;
  return {
    getSupabaseClient: () => {
      client ??= createClient("https://wire.example.supabase.co", "anon-key", {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input: unknown) => mockCapture(input) as never },
      });
      return client;
    },
  };
});

import { WIKI_RECORDS_PAGE, listAllRecords } from "../list-all-records";

const OWNER = "22222222-2222-4222-8222-222222222222";
const LAST = { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-07-01T09:30:56.123456+00:00" };

beforeEach(() => {
  requests.length = 0;
  mockCapture.mockClear();
});

it("first page: the owner's rows, newest first, no date condition", async () => {
  bodies = [[LAST]];
  await listAllRecords(OWNER);
  expect(requests).toHaveLength(1);
  const [first] = requests;
  expect(first.pathname).toBe("/rest/v1/records");
  expect(first.searchParams.get("select")).toBe("id,kind,body,topic,summary,tags,system_tags,created_at,audit_period");
  expect(first.searchParams.get("user_id")).toBe(`eq.${OWNER}`);
  expect(first.searchParams.get("order")).toBe("created_at.desc,id.desc");
  expect(first.searchParams.get("limit")).toBe(String(WIKI_RECORDS_PAGE));
  expect(first.searchParams.has("created_at")).toBe(false);
  expect(first.searchParams.has("or")).toBe(false);
});

it("second page: the two conditions, in the shape the real server answered", async () => {
  const full = Array.from({ length: WIKI_RECORDS_PAGE - 1 }, (_, i) => ({ id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`, created_at: "2026-08-01T00:00:00+00:00" }));
  bodies = [[...full, LAST], []];
  await listAllRecords(OWNER);
  expect(requests).toHaveLength(2);
  const second = requests[1];
  expect(second.searchParams.get("user_id")).toBe(`eq.${OWNER}`);
  expect(second.searchParams.getAll("created_at")).toEqual([`lte.${LAST.created_at}`]);
  expect(second.searchParams.get("or")).toBe(
    `(created_at.lt."${LAST.created_at}",and(created_at.eq."${LAST.created_at}",id.lt."${LAST.id}"))`,
  );
  expect(second.searchParams.get("order")).toBe("created_at.desc,id.desc");
  expect(second.searchParams.get("limit")).toBe(String(WIKI_RECORDS_PAGE));
  // The time zone's plus sign must travel encoded: a bare "+" in a query string reads as a space.
  expect(second.search).toContain("%2B00%3A00");
  expect(second.search).not.toContain("+00:00");
});
