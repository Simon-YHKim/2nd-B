import { subscribeRecoveryStorageEvent } from "../recovery-storage-events";

describe("subscribeRecoveryStorageEvent", () => {
  const listener = jest.fn();

  beforeEach(() => {
    listener.mockClear();
  });

  test.each([undefined, null, {}, globalThis])(
    "is a no-op for a React Native-shaped target (%p)",
    (target) => {
      const cleanup = subscribeRecoveryStorageEvent(target, listener);

      expect(() => cleanup()).not.toThrow();
      expect(() => cleanup()).not.toThrow();
    },
  );

  test("does not subscribe when the target cannot remove the listener", () => {
    const addEventListener = jest.fn();
    const cleanup = subscribeRecoveryStorageEvent({ addEventListener }, listener);

    expect(addEventListener).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  test("subscribes and removes the same web storage listener exactly once", () => {
    const addEventListener = jest.fn();
    const removeEventListener = jest.fn();
    const target = { addEventListener, removeEventListener };

    const cleanup = subscribeRecoveryStorageEvent(target, listener);

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith("storage", listener);

    cleanup();
    cleanup();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith("storage", listener);
  });
});
