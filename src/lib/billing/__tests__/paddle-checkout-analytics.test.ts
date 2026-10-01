const mockStarted = jest.fn();
const mockCompleted = jest.fn();
const mockAttempt = jest.fn(() => ({ started: mockStarted, completed: mockCompleted }));
const mockBinding = {
  user_id: "11111111-1111-4111-8111-111111111111", issued_at: 1, nonce: "a".repeat(32), signature: "b".repeat(64),
  version: 2, environment: "production", audience: "https://project.supabase.test", price_id: "pri_01h00000000000000000000000",
};
const mockInvoke = jest.fn();
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("@/lib/analytics/paddle-conversions", () => ({ createPaddleAnalyticsAttempt: mockAttempt }));
jest.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: mockBinding.user_id, email: "private@example.invalid" } } }) },
  functions: { invoke: mockInvoke },
}) }));
import { __resetPaddleSdkForTests, openPaddleCheckout } from "../paddle-checkout";
import { clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";

const envKeys = ["EXPO_PUBLIC_PADDLE_ENVIRONMENT", "EXPO_PUBLIC_PADDLE_CLIENT_TOKEN", "EXPO_PUBLIC_PADDLE_PRICE_BRAIN_MONTHLY", "EXPO_PUBLIC_SUPABASE_URL"] as const;
const priorEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
let callback: (event: unknown) => void;
let open: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  __resetPaddleSdkForTests();
  noteResolvedOwner(mockBinding.user_id);
  clearAccountTransition(currentAccountEpoch());
  mockAttempt.mockImplementation(() => ({ started: mockStarted, completed: mockCompleted }));
  mockInvoke.mockResolvedValue({ data: mockBinding, error: null });
  process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT = "production";
  process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN = `live_${"a".repeat(27)}`;
  process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_MONTHLY = mockBinding.price_id;
  process.env.EXPO_PUBLIC_SUPABASE_URL = mockBinding.audience;
  open = jest.fn();
  (globalThis as { Paddle?: unknown }).Paddle = {
    Initialize: jest.fn(), Environment: { set: jest.fn() },
    Update: ({ eventCallback }: { eventCallback: (event: unknown) => void }) => { callback = eventCallback; },
    Checkout: { open },
  };
});
afterEach(() => {
  delete (globalThis as { Paddle?: unknown }).Paddle;
  for (const key of envKeys) {
    if (priorEnv[key] === undefined) delete process.env[key]; else process.env[key] = priorEnv[key];
  }
});

test("observes overlay opening after success and never gives analytics the account or binding", async () => {
  expect(await openPaddleCheckout({ tier: "brain" })).toEqual({ ok: true });
  expect(mockAttempt).toHaveBeenCalledWith({ tier: "brain", cadence: "monthly", priceId: mockBinding.price_id, environment: "production" });
  expect(mockStarted).toHaveBeenCalledTimes(1);
  expect(open.mock.invocationCallOrder[0]).toBeLessThan(mockStarted.mock.invocationCallOrder[0]);
});

test("matches the current binding nonce before forwarding completion with its original totals", async () => {
  await openPaddleCheckout({ tier: "brain" });
  const event = { name: "checkout.completed", data: {
    custom_data: { nonce: mockBinding.nonce }, totals: { subtotal: 30, discount: 5 },
    items: [{ price_id: mockBinding.price_id, quantity: 1, totals: { subtotal: 30, discount: 5 } }],
  } };
  callback({ ...event, data: { ...event.data, custom_data: { nonce: "old-overlay" } } });
  callback({ name: "checkout.completed" });
  expect(mockCompleted).not.toHaveBeenCalled();
  callback(event);
  expect(mockCompleted).toHaveBeenCalledWith(event);
});

test("failed overlay opening never emits begin_checkout", async () => {
  open.mockImplementationOnce(() => { throw new Error("overlay unavailable"); });
  expect(await openPaddleCheckout({ tier: "brain" })).toEqual({ ok: false, reason: "open_failed" });
  expect(mockStarted).not.toHaveBeenCalled();
});

test("analytics failures cannot change a successfully opened checkout", async () => {
  mockStarted.mockImplementationOnce(() => { throw new Error("optional observer failed"); });
  expect(await openPaddleCheckout({ tier: "brain" })).toEqual({ ok: true });
  mockCompleted.mockImplementationOnce(() => { throw new Error("optional observer failed"); });
  expect(() => callback({ data: { custom_data: { nonce: mockBinding.nonce } } })).not.toThrow();
});

test("sandbox context is explicit so the observer can suppress production revenue", async () => {
  process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT = "sandbox";
  process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN = `test_${"a".repeat(27)}`;
  mockInvoke.mockResolvedValue({ data: { ...mockBinding, environment: "sandbox" }, error: null });
  expect(await openPaddleCheckout({ tier: "brain" })).toEqual({ ok: true });
  expect(mockAttempt).toHaveBeenCalledWith(expect.objectContaining({ environment: "sandbox" }));
});
