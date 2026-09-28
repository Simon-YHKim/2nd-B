import { EMPTY_PIXELS } from "../pixels";

const USER = "11111111-1111-4111-8111-111111111111";
const CREATOR = "22222222-2222-4222-8222-222222222222";
const ASSET = "33333333-3333-4333-8333-333333333333";
const validPixels = "0" + EMPTY_PIXELS.slice(1);
const row = {
  id: ASSET,
  owner_id: CREATOR,
  title: "Pixel hat",
  slot: "hair",
  pixels: validPixels,
  palette_version: 1,
  status: "approved",
  hidden_at: null,
  created_at: "2026-09-28T00:00:00Z",
};

const mockLimit = jest.fn();
const mockRange = jest.fn();
const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();
const mockEq = jest.fn();
const mockIs = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockDelete = jest.fn();
const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const query = {
  eq: mockEq,
  is: mockIs,
  order: mockOrder,
  limit: mockLimit,
  range: mockRange,
  maybeSingle: mockMaybeSingle,
  select: mockSelect,
};

jest.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ from: mockFrom, rpc: mockRpc, auth: { getUser: mockGetUser } }),
}));

import {
  blockAvatarShareCreator,
  AVATAR_SHARE_MAX_OWN_ASSETS,
  fetchAvatarShareAsset,
  listOwnAssets,
  listPublishedAssets,
  removeOwnAvatarShareAsset,
  reportAvatarShareAsset,
  submitAvatarShareAsset,
} from "../api";

beforeEach(() => {
  jest.clearAllMocks();
  mockEq.mockReturnValue(query);
  mockIs.mockReturnValue(query);
  mockOrder.mockReturnValue(query);
  mockSelect.mockReturnValue(query);
  mockDelete.mockReturnValue(query);
  mockLimit.mockResolvedValue({ data: [row], error: null });
  mockRange.mockResolvedValue({ data: [row], error: null });
  mockMaybeSingle.mockResolvedValue({ data: row, error: null });
  mockInsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: ASSET, error: null });
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, delete: mockDelete });
});

describe("Avatar Share Supabase access", () => {
  test("lists only server-approved gallery rows and validates the returned pixels", async () => {
    const assets = await listPublishedAssets("hair");
    expect(mockFrom).toHaveBeenCalledWith("avatar_share_assets");
    expect(mockEq).toHaveBeenCalledWith("status", "approved");
    expect(mockEq).toHaveBeenCalledWith("slot", "hair");
    expect(mockIs).toHaveBeenCalledWith("hidden_at", null);
    expect(mockRange).toHaveBeenCalledWith(0, 23);
    expect(assets[0]).toMatchObject({ id: ASSET, ownerId: CREATOR, title: "Pixel hat", slot: "hair" });
    mockRange.mockResolvedValueOnce({ data: [{ ...row, pixels: "<svg>" }], error: null });
    await expect(listPublishedAssets()).rejects.toThrow(/validation/);
    await listPublishedAssets(undefined, 2);
    expect(mockRange).toHaveBeenLastCalledWith(48, 71);
    await expect(listPublishedAssets(undefined, -1)).rejects.toThrow(/page/);
  });

  test("scopes own list to the verified signed-in account", async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      ...row,
      id: `33333333-3333-4333-8333-${index.toString(16).padStart(12, "0")}`,
    }));
    mockLimit.mockResolvedValueOnce({ data: rows, error: null });
    const assets = await listOwnAssets();
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith("owner_id", USER);
    expect(mockLimit).toHaveBeenCalledWith(AVATAR_SHARE_MAX_OWN_ASSETS);
    expect(assets).toHaveLength(30);
    expect(assets.at(-1)?.id).toBe(rows[29].id);
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(listOwnAssets()).rejects.toThrow(/signed-in/);
  });

  test("missing or RLS-hidden asset returns null; network failure is not mistaken for absence", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchAvatarShareAsset(ASSET)).resolves.toBeNull();
    const error = new Error("offline");
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error });
    await expect(fetchAvatarShareAsset(ASSET)).rejects.toBe(error);
  });

  test("submission records explicit versioned reuse consent and requires pending review", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { ...row, owner_id: USER, status: "pending" }, error: null });
    const created = await submitAvatarShareAsset({
      slot: "hair", title: " Pixel hat ", pixels: validPixels,
      rightsConfirmed: true, consentVersion: "avatar-share-v1",
    });
    expect(mockRpc).toHaveBeenCalledWith("submit_avatar_share_asset", {
      p_slot: "hair", p_title: "Pixel hat", p_pixels: validPixels,
      p_rights_confirmed: true, p_consent_version: "avatar-share-v1",
    });
    expect(created.status).toBe("pending");
    mockMaybeSingle.mockResolvedValueOnce({ data: row, error: null });
    await expect(submitAvatarShareAsset({
      slot: "hair", title: "Pixel hat", pixels: validPixels,
      rightsConfirmed: true, consentVersion: "avatar-share-v1",
    })).rejects.toThrow(/pending/);
  });

  test("refuses empty, invalid, or unconsented submissions before any RPC", async () => {
    const valid = { slot: "hair" as const, title: "hat", pixels: validPixels,
      rightsConfirmed: true as const, consentVersion: "avatar-share-v1" as const };
    await expect(submitAvatarShareAsset({ ...valid, pixels: EMPTY_PIXELS })).rejects.toThrow(/drawing/);
    await expect(submitAvatarShareAsset({ ...valid, title: "\n" })).rejects.toThrow(/title/);
    await expect(submitAvatarShareAsset({ ...valid, rightsConfirmed: false as never })).rejects.toThrow(/consent/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("report and block write only closed, owner-scoped fields; duplicate actions are idempotent", async () => {
    await reportAvatarShareAsset(ASSET, "spam");
    expect(mockFrom).toHaveBeenCalledWith("avatar_share_reports");
    expect(mockInsert).toHaveBeenCalledWith({ asset_id: ASSET, reporter_id: USER, target: "asset", reason: "spam" });
    await reportAvatarShareAsset(ASSET, "impersonation", "creator");
    expect(mockInsert).toHaveBeenLastCalledWith({
      asset_id: ASSET, reporter_id: USER, target: "creator", reason: "impersonation",
    });
    await expect(reportAvatarShareAsset(ASSET, "spam", "unknown" as never)).rejects.toThrow(/target/);
    mockInsert.mockResolvedValueOnce({ error: { code: "23505" } });
    await expect(blockAvatarShareCreator(CREATOR)).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith("avatar_share_blocks");
    expect(mockInsert).toHaveBeenLastCalledWith({ blocker_id: USER, blocked_owner_id: CREATOR });
    await expect(blockAvatarShareCreator(USER)).rejects.toThrow(/own/);
  });

  test("deletes only a matching owned row and detects RLS-denied removals", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: ASSET }, error: null });
    await removeOwnAvatarShareAsset(ASSET);
    expect(mockEq).toHaveBeenCalledWith("id", ASSET);
    expect(mockEq).toHaveBeenCalledWith("owner_id", USER);
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(removeOwnAvatarShareAsset(ASSET)).rejects.toThrow(/not owned/);
  });
});
