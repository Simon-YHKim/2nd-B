const mockIn = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

import { listRecordsByIds } from "../create";

beforeEach(() => {
  jest.clearAllMocks();
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ in: mockIn });
  mockIn.mockResolvedValue({ data: [{ id: "old-record" }], error: null });
});

it("loads cited historical records by id without applying the timeline date window", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect(await listRecordsByIds("owner-1", [id, id, "not-a-uuid"])).toEqual([{ id: "old-record" }]);
  expect(mockFrom).toHaveBeenCalledWith("records");
  expect(mockEq).toHaveBeenCalledWith("user_id", "owner-1");
  expect(mockIn).toHaveBeenCalledWith("id", [id]);
});

it("does not query without an owner or valid cited id", async () => {
  expect(await listRecordsByIds("", ["11111111-1111-4111-8111-111111111111"])).toEqual([]);
  expect(await listRecordsByIds("owner-1", ["not-a-uuid"])).toEqual([]);
  expect(mockFrom).not.toHaveBeenCalled();
});
