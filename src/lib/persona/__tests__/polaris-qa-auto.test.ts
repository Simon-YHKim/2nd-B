import { claimQaPolarisAuto } from "../role-cards";

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockReadUser = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "live", EXPO_PUBLIC_FORCE_TIER: "brain" }) }));
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getUser: mockGetUser }, rpc: mockRpc,
    from: (table: string) => ({ select: (columns: string) => {
      mockSelect(table, columns);
      return { eq: (column: string, userId: string) => {
        mockEq(column, userId);
        return { maybeSingle: () => mockReadUser(userId) };
      } };
    } }),
  }),
}));

describe("QA one-shot automatic generation claim", () => {
  const storage = new Map<string, string>();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDev = Object.getOwnPropertyDescriptor(globalThis, "__DEV__");
  beforeAll(() => {
    Object.defineProperty(globalThis, "__DEV__", { configurable: true, value: true });
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      localStorage: { getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); } },
    } });
  });
  afterAll(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDev) Object.defineProperty(globalThis, "__DEV__", originalDev);
    else Reflect.deleteProperty(globalThis, "__DEV__");
  });
  beforeEach(() => {
    storage.clear(); mockGetUser.mockReset(); mockSelect.mockClear(); mockEq.mockClear();
    mockRpc.mockReset().mockResolvedValue({ data: { available: true, intro_remaining: 2, tier: "brain" }, error: null });
    mockReadUser.mockReset().mockImplementation(async (id: string) => ({
      data: { id, subscription_tier: "brain", subscription_expires_at: null }, error: null,
    }));
  });

  it("claims at most once across simultaneous route mounts and later reloads", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "qa-once", email: "qa.ai.b18807@example.com" } } });
    expect(await Promise.all([claimQaPolarisAuto("qa-once", false, true), claimQaPolarisAuto("qa-once", false, true)]))
      .toEqual([true, false]);
    expect(storage.get("polaris.qa-auto.v2:qa-once")).toBe("attempted");
    expect(await claimQaPolarisAuto("qa-once", false, true)).toBe(false);
    expect(mockSelect).toHaveBeenCalledWith("users", "id, subscription_tier, subscription_expires_at");
    expect(mockEq).toHaveBeenCalledWith("id", "qa-once");
    expect(mockRpc).toHaveBeenCalledWith("polaris_generation_status", { p_user_id: "qa-once" });
  });

  it("keeps the one-shot available until the server reservation contract exists", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "qa-wait", email: "qa.ai.b18807@example.com" } } });
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "missing RPC", status: 404 } });
    expect(await claimQaPolarisAuto("qa-wait", false, true)).toBe(false);
    expect(storage.size).toBe(0);
    expect(await claimQaPolarisAuto("qa-wait", false, true)).toBe(true);
    expect(storage.get("polaris.qa-auto.v2:qa-wait")).toBe("attempted");
  });

  it("rechecks persistent attempt state after asynchronous authentication", async () => {
    let resolveAuth!: (value: unknown) => void;
    mockGetUser.mockImplementation(() => new Promise((resolve) => { resolveAuth = resolve; }));
    const claim = claimQaPolarisAuto("qa-race", false, true);
    storage.set("polaris.qa-auto.v2:qa-race", "attempted");
    resolveAuth({ data: { user: { id: "qa-race", email: "qa.ai.b18807@example.com" } } });
    expect(await claim).toBe(false);
  });

  it("does not mark or run other accounts or unfunded QA accounts", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "other", email: "other@example.com" } } });
    expect(await claimQaPolarisAuto("other", false, true)).toBe(false);
    mockGetUser.mockResolvedValue({ data: { user: { id: "qa-free", email: "qa.ai.b18807@example.com" } } });
    mockReadUser.mockResolvedValue({ data: { id: "qa-free", subscription_tier: "free", subscription_expires_at: null }, error: null });
    expect(await claimQaPolarisAuto("qa-free", false, true)).toBe(false);
    expect(storage.size).toBe(0);
  });

  it.each([
    { label: "missing row", data: null, error: null },
    { label: "failed read", data: null, error: { message: "network" } },
    { label: "expired", data: { id: "qa-invalid", subscription_tier: "brain", subscription_expires_at: "2000-01-01T00:00:00Z" }, error: null },
    { label: "invalid expiry", data: { id: "qa-invalid", subscription_tier: "brain", subscription_expires_at: "invalid" }, error: null },
    { label: "missing expiry", data: { id: "qa-invalid", subscription_tier: "brain" }, error: null },
    { label: "wrong owner", data: { id: "other", subscription_tier: "brain", subscription_expires_at: null }, error: null },
  ])("fails closed on $label despite the local Brain override", async ({ data, error }) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "qa-invalid", email: "qa.ai.b18807@example.com" } } });
    mockReadUser.mockResolvedValue({ data, error });
    expect(await claimQaPolarisAuto("qa-invalid", false, true)).toBe(false);
    expect(storage.size).toBe(0);
  });

  it("accepts a server-written Brain grant with a future expiry", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "qa-future", email: "qa.ai.b18807@example.com" } } });
    mockReadUser.mockResolvedValue({ data: { id: "qa-future", subscription_tier: "brain", subscription_expires_at: "2999-01-01T00:00:00Z" }, error: null });
    expect(await claimQaPolarisAuto("qa-future", false, true)).toBe(true);
  });
});
