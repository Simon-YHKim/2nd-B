import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_AVATAR_SPEC, resolveAvatarSpec, type AvatarSpec } from "@/lib/avatar";
import { avatarFirstRunSnapshot, setAvatarFirstRunOwner } from "@/lib/avatar/first-run-store";

const readMaybeSingle = jest.fn();
const readEq = jest.fn(() => ({ maybeSingle: readMaybeSingle }));
const select = jest.fn(() => ({ eq: readEq }));
const updateMaybeSingle = jest.fn();
const updateSelect = jest.fn(() => ({ maybeSingle: updateMaybeSingle }));
const updateEq = jest.fn(() => ({ select: updateSelect }));
const update = jest.fn(() => ({ eq: updateEq }));
const from = jest.fn(() => ({ select, update }));

jest.mock("../client", () => ({ getSupabaseClient: () => ({ from }) }));

import { fetchAvatarSpec, saveAvatarSpec } from "../avatar-spec";

describe("user-owned avatar persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAvatarFirstRunOwner(null);
    readMaybeSingle.mockReset();
    updateMaybeSingle.mockReset().mockResolvedValue({ data: { id: "user-a" }, error: null });
  });

  test("a real SQL NULL means no saved avatar", async () => {
    readMaybeSingle.mockResolvedValue({ data: { avatar_spec: null }, error: null });
    await expect(fetchAvatarSpec("user-a")).resolves.toBeNull();
    expect(from).toHaveBeenCalledWith("users");
    expect(select).toHaveBeenCalledWith("avatar_spec");
    expect(readEq).toHaveBeenCalledWith("id", "user-a");
  });

  test("narrows stored JSONB before returning it to the renderer", async () => {
    const raw = { ...DEFAULT_AVATAR_SPEC, face: "not-a-face", injected: "ignored" };
    readMaybeSingle.mockResolvedValue({ data: { avatar_spec: raw }, error: null });
    await expect(fetchAvatarSpec("user-a")).resolves.toEqual(resolveAvatarSpec(raw));
  });

  test("read errors and missing owner rows never masquerade as an empty avatar", async () => {
    const error = new Error("offline");
    readMaybeSingle.mockResolvedValueOnce({ data: null, error });
    await expect(fetchAvatarSpec("user-a")).rejects.toBe(error);
    readMaybeSingle.mockRejectedValueOnce(error);
    await expect(fetchAvatarSpec("user-a")).rejects.toBe(error);
    readMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchAvatarSpec("user-a")).rejects.toThrow("Avatar owner row was not found");
    readMaybeSingle.mockResolvedValueOnce({ data: {}, error: null });
    await expect(fetchAvatarSpec("user-a")).rejects.toThrow("Avatar field was not returned");
  });

  test("writes one narrowed recipe to only the requested owner row", async () => {
    const spec = { ...DEFAULT_AVATAR_SPEC, job: "chef", garmentId: "hoodie" } as AvatarSpec;
    setAvatarFirstRunOwner("user-a");
    await saveAvatarSpec("user-a", spec);
    expect(from).toHaveBeenCalledWith("users");
    expect(update).toHaveBeenCalledWith({ avatar_spec: resolveAvatarSpec(spec) });
    expect(updateEq).toHaveBeenCalledWith("id", "user-a");
    expect(updateSelect).toHaveBeenCalledWith("id");
    expect(update).toHaveBeenCalledTimes(1);
    expect(avatarFirstRunSnapshot()).toEqual({ userId: "user-a", status: "saved" });
  });

  test("surfaces rejected writes and owner rows hidden by RLS", async () => {
    setAvatarFirstRunOwner("user-a");
    const error = new Error("write denied");
    updateMaybeSingle.mockResolvedValueOnce({ data: null, error });
    await expect(saveAvatarSpec("user-a", DEFAULT_AVATAR_SPEC)).rejects.toBe(error);
    updateMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(saveAvatarSpec("user-b", DEFAULT_AVATAR_SPEC)).rejects.toThrow("Avatar owner row was not found");
    expect(updateEq).toHaveBeenLastCalledWith("id", "user-b");
    expect(avatarFirstRunSnapshot()).toEqual({ userId: "user-a", status: "idle" });
  });
});

describe("avatar storage draft boundary", () => {
  const root = process.cwd();
  const draft = readFileSync(join(root, "db/migration-drafts/UNNUMBERED_users_avatar_spec.sql"), "utf8");
  const rls = readFileSync(join(root, "db/migrations/0009_rls_policies.sql"), "utf8");
  const executable = draft.replace(/^\s*--.*$/gm, "");

  test("stores only a bounded versioned object and keeps unsaved users NULL", () => {
    expect(executable).toMatch(/ADD COLUMN IF NOT EXISTS avatar_spec jsonb;/);
    expect(executable).toMatch(/IF NOT EXISTS \([\s\S]*?conname = 'users_avatar_spec_shape'[\s\S]*?ADD CONSTRAINT users_avatar_spec_shape/);
    expect(executable).toMatch(/avatar_spec IS NULL OR/);
    expect(executable).toMatch(/avatar_spec IS NULL OR COALESCE\(\([\s\S]*?\), false\)/);
    expect(executable).toMatch(/jsonb_typeof\(avatar_spec\) = 'object'/);
    expect(executable).toMatch(/avatar_spec ->> 'v' = '64'/);
    expect(executable).toMatch(/octet_length\(avatar_spec::text\) <= 4096/);
    expect(executable).not.toMatch(/avatar_spec jsonb NOT NULL|DEFAULT '[^']+'/);
  });

  test("grants only authenticated writes and inherits existing owner-only RLS", () => {
    expect(executable).toMatch(/GRANT UPDATE \(avatar_spec\) ON public\.users TO authenticated;/);
    expect(executable).not.toMatch(/GRANT[^;]*TO anon|CREATE POLICY|GRANT SELECT/);
    expect(rls).toMatch(/CREATE POLICY users_self_select ON users\s+FOR SELECT TO authenticated USING \(id = auth\.uid\(\)\)/);
    expect(rls).toMatch(/CREATE POLICY users_self_update ON users\s+FOR UPDATE TO authenticated USING \(id = auth\.uid\(\)\)/);
  });
});
