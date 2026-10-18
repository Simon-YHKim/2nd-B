const labels = { title: "Unlock", fallback: "Phone passcode", cancel: "Cancel" };

function setup(os = "android", missing = false) {
  jest.resetModules();
  const native = {
    authenticateAsync: jest.fn(async () => ({ success: true })), cancelAuthenticate: jest.fn(async () => {}), hasHardwareAsync: jest.fn(), isEnrolledAsync: jest.fn(),
    getEnrolledLevelAsync: jest.fn(async (): Promise<unknown> => 1),
    SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  };
  jest.doMock("react-native", () => ({ Platform: { OS: os } }));
  jest.doMock("expo-local-authentication", () => { if (missing) throw Error("module not installed"); return native; });
  const adapter = require("../native-device-auth") as typeof import("../native-device-auth");
  return { native, adapter };
}

test("PIN-only devices reach OS authentication with strong biometrics and fallback enabled", async () => {
  const { native, adapter } = setup();
  expect(await adapter.authenticateDevice(labels)).toEqual({ success: true });
  expect(native.authenticateAsync).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: false, biometricsSecurityLevel: "strong", cancelLabel: labels.fallback }));
  expect(native.hasHardwareAsync).not.toHaveBeenCalled();
  expect(native.isEnrolledAsync).not.toHaveBeenCalled();
});

test("web and an older APK without the module cannot grant an unlock", async () => {
  let f = setup("web");
  expect(await f.adapter.authenticateDevice(labels)).toEqual({ success: false, error: "unavailable" });
  expect(f.native.authenticateAsync).not.toHaveBeenCalled();
  f = setup("android", true);
  expect(await f.adapter.authenticateDevice(labels)).toEqual({ success: false, error: "unavailable" });
});

test("cancellation during lazy module loading prevents opening an obsolete prompt", async () => {
  const { native, adapter } = setup();
  const pending = adapter.authenticateDevice(labels);
  adapter.cancelDeviceAuthentication();
  expect(await pending).toEqual({ success: false, error: "cancelled" });
  expect(native.authenticateAsync).not.toHaveBeenCalled();
});

test("a late success after cancellation does not grant access", async () => {
  const { native, adapter } = setup();
  let finish!: (result: { success: boolean }) => void;
  native.authenticateAsync.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = adapter.authenticateDevice(labels);
  for (let i = 0; i < 8 && !finish; i++) await Promise.resolve();
  expect(finish).toBeDefined();
  adapter.cancelDeviceAuthentication(); finish({ success: true });
  expect(await pending).toEqual({ success: false, error: "cancelled" });
});

test("a new prompt waits for an already queued native cancellation", async () => {
  const { native, adapter } = setup("ios");
  await adapter.authenticateDevice(labels);
  let finishCancel!: () => void;
  native.cancelAuthenticate.mockImplementation(() => new Promise(resolve => { finishCancel = resolve; }));
  adapter.cancelDeviceAuthentication();
  const next = adapter.authenticateDevice(labels);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(native.authenticateAsync).toHaveBeenCalledTimes(1);
  finishCancel();
  expect(await next).toEqual({ success: true });
  expect(native.authenticateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ cancelLabel: labels.cancel }));
});

// Q-261018-47: the OS answer for "this phone has no screen lock" (PIN, pattern, password or biometrics).
const probe = (adapter: typeof import("../native-device-auth")) => adapter.deviceHasScreenLock();

test.each([[0, false], [1, true], [2, true], [3, true]] as const)("enrolled level %i means screen lock %s, with no prompt", async (level, expected) => {
  const { native, adapter } = setup();
  native.getEnrolledLevelAsync.mockResolvedValue(level);
  expect(await probe(adapter)).toBe(expected);
  expect(native.authenticateAsync).not.toHaveBeenCalled();
});

test("web, an older APK, a failing query and an unknown answer never report 'no screen lock'", async () => {
  expect(await probe(setup("web").adapter)).toBeNull();
  expect(await probe(setup("android", true).adapter)).toBeNull();
  let f = setup(); f.native.getEnrolledLevelAsync.mockRejectedValue(Error("native"));
  expect(await probe(f.adapter)).toBeNull();
  for (const odd of [undefined, null, "0", Number.NaN, -1, 7]) {
    f = setup(); f.native.getEnrolledLevelAsync.mockResolvedValue(odd);
    expect(await probe(f.adapter)).toBeNull();
  }
});

test.each([
  ["user_cancel", "cancelled"], ["app_cancel", "cancelled"], ["system_cancel", "cancelled"],
  ["not_enrolled", "not_enrolled"], ["passcode_not_set", "not_enrolled"], ["lockout", "failed"],
])("%s remains locked as %s", async (error, expected) => {
  const { native, adapter } = setup();
  native.authenticateAsync.mockResolvedValue({ success: false, error } as never);
  expect(await adapter.authenticateDevice(labels)).toEqual({ success: false, error: expected });
});
