// Web Notifications wrapper tests. The Notification global is jsdom-mocked
// per test to cover the four code paths: not supported, denied, granted,
// default-after-request.

import { currentPermission, notify } from "../web";

describe("currentPermission", () => {
  const ORIG = (globalThis as { Notification?: unknown }).Notification;

  afterEach(() => {
    (globalThis as { Notification?: unknown }).Notification = ORIG;
  });

  test("not_supported when Notification global missing", () => {
    delete (globalThis as { Notification?: unknown }).Notification;
    expect(currentPermission()).toBe("not_supported");
  });

  test("granted / denied / default mapped through", () => {
    (globalThis as { Notification?: unknown }).Notification = Object.assign(
      function MockNotification() {
        /* noop */
      },
      { permission: "granted", requestPermission: jest.fn() },
    );
    expect(currentPermission()).toBe("granted");

    (globalThis as { Notification?: unknown }).Notification = Object.assign(
      function MockNotification() {
        /* noop */
      },
      { permission: "denied", requestPermission: jest.fn() },
    );
    expect(currentPermission()).toBe("denied");

    (globalThis as { Notification?: unknown }).Notification = Object.assign(
      function MockNotification() {
        /* noop */
      },
      { permission: "default", requestPermission: jest.fn() },
    );
    expect(currentPermission()).toBe("default");
  });
});

describe("notify", () => {
  const ORIG = (globalThis as { Notification?: unknown }).Notification;

  afterEach(() => {
    (globalThis as { Notification?: unknown }).Notification = ORIG;
  });

  test("not_supported when Notification global missing", async () => {
    delete (globalThis as { Notification?: unknown }).Notification;
    const r = await notify("title", "body");
    expect(r.status).toBe("not_supported");
  });

  test("already-granted → fires + returns granted", async () => {
    const ctor = jest.fn();
    (globalThis as { Notification?: unknown }).Notification = Object.assign(ctor, {
      permission: "granted",
      requestPermission: jest.fn().mockResolvedValue("granted"),
    });
    const r = await notify("t", "b");
    expect(r.status).toBe("granted");
    expect(ctor).toHaveBeenCalledWith("t", expect.objectContaining({ body: "b" }));
  });

  test("default → requests permission → granted", async () => {
    const ctor = jest.fn();
    const request = jest.fn().mockResolvedValue("granted");
    (globalThis as { Notification?: unknown }).Notification = Object.assign(ctor, {
      permission: "default",
      requestPermission: request,
    });
    const r = await notify("t", "b");
    expect(request).toHaveBeenCalled();
    expect(r.status).toBe("granted");
    expect(ctor).toHaveBeenCalled();
  });

  test("denied (already or after request) → returns denied, no fire", async () => {
    const ctor = jest.fn();
    (globalThis as { Notification?: unknown }).Notification = Object.assign(ctor, {
      permission: "denied",
      requestPermission: jest.fn().mockResolvedValue("denied"),
    });
    const r = await notify("t", "b");
    expect(r.status).toBe("denied");
    expect(ctor).not.toHaveBeenCalled();
  });

  test("default stays default after request → returns 'default'", async () => {
    const ctor = jest.fn();
    (globalThis as { Notification?: unknown }).Notification = Object.assign(ctor, {
      permission: "default",
      requestPermission: jest.fn().mockResolvedValue("default"),
    });
    const r = await notify("t", "b");
    expect(r.status).toBe("default");
    expect(ctor).not.toHaveBeenCalled();
  });

  test("constructor throw → error status with detail", async () => {
    const ctor = jest.fn(() => {
      throw new Error("blocked by host");
    });
    (globalThis as { Notification?: unknown }).Notification = Object.assign(ctor, {
      permission: "granted",
      requestPermission: jest.fn().mockResolvedValue("granted"),
    });
    const r = await notify("t", "b");
    expect(r.status).toBe("error");
    expect(r.detail).toContain("blocked");
  });
});
