import {
  avatarFirstRunDecision,
  avatarFirstRunSnapshot,
  markAvatarFirstRunDeferred,
  markAvatarFirstRunSaved,
  probeAvatarFirstRun,
  setAvatarFirstRunOwner,
} from "../first-run-store";

beforeEach(() => {
  setAvatarFirstRunOwner(null);
});

describe("first avatar setup gate", () => {
  test("only an authenticated profile owner with a confirmed SQL NULL enters setup", async () => {
    setAvatarFirstRunOwner("a");
    expect(avatarFirstRunDecision("a", true, "index", avatarFirstRunSnapshot())).toBe("hold");
    await probeAvatarFirstRun("a", async () => null);
    expect(avatarFirstRunSnapshot()).toEqual({ userId: "a", status: "missing" });
    expect(avatarFirstRunDecision("a", true, "index", avatarFirstRunSnapshot())).toBe("setup");
    for (const segment of ["(auth)", "onboarding", "avatar-studio"]) {
      expect(avatarFirstRunDecision("a", true, segment, avatarFirstRunSnapshot())).toBe("allow");
    }
    expect(avatarFirstRunDecision("a", false, "index", avatarFirstRunSnapshot())).toBe("allow");
    expect(avatarFirstRunDecision(null, null, "index", avatarFirstRunSnapshot())).toBe("allow");
  });

  test("a saved recipe or unreadable pre-migration column never traps entry", async () => {
    await probeAvatarFirstRun("a", async () => ({ v: 64 }));
    expect(avatarFirstRunDecision("a", true, "index", avatarFirstRunSnapshot())).toBe("allow");
    setAvatarFirstRunOwner(null);
    await probeAvatarFirstRun("a", async () => { throw new Error("column does not exist"); });
    expect(avatarFirstRunSnapshot().status).toBe("error");
    expect(avatarFirstRunDecision("a", true, "index", avatarFirstRunSnapshot())).toBe("allow");
  });

  test("a confirmed save immediately releases setup and a late NULL read cannot reopen it", async () => {
    let resolveRead!: (value: null) => void;
    const pending = new Promise<null>((resolve) => { resolveRead = resolve; });
    const read = probeAvatarFirstRun("a", () => pending);
    expect(avatarFirstRunSnapshot().status).toBe("loading");
    markAvatarFirstRunSaved("a");
    resolveRead(null);
    await read;
    expect(avatarFirstRunSnapshot()).toEqual({ userId: "a", status: "saved" });
    expect(avatarFirstRunDecision("a", true, "index", avatarFirstRunSnapshot())).toBe("allow");
  });

  test("a failed studio read can be deferred only for this session owner", async () => {
    await probeAvatarFirstRun("a", async () => null);
    markAvatarFirstRunDeferred("b");
    expect(avatarFirstRunSnapshot().status).toBe("missing");
    markAvatarFirstRunDeferred("a");
    expect(avatarFirstRunSnapshot().status).toBe("deferred");
    expect(avatarFirstRunDecision("a", true, "index", avatarFirstRunSnapshot())).toBe("allow");
    setAvatarFirstRunOwner(null);
    setAvatarFirstRunOwner("a");
    expect(avatarFirstRunSnapshot().status).toBe("idle");
  });

  test("an old owner's late read cannot decide a new owner's setup", async () => {
    let resolveRead!: (value: null) => void;
    const pending = new Promise<null>((resolve) => { resolveRead = resolve; });
    const oldRead = probeAvatarFirstRun("a", () => pending);
    setAvatarFirstRunOwner("b");
    resolveRead(null);
    await oldRead;
    expect(avatarFirstRunSnapshot()).toEqual({ userId: "b", status: "idle" });
    expect(avatarFirstRunDecision("b", true, "index", avatarFirstRunSnapshot())).toBe("hold");
  });

  test("a stalled avatar read releases the app after a bounded timeout", async () => {
    jest.useFakeTimers();
    try {
      const pending = probeAvatarFirstRun("a", () => new Promise<null>(() => undefined), 10);
      await jest.advanceTimersByTimeAsync(11);
      await pending;
      expect(avatarFirstRunSnapshot()).toEqual({ userId: "a", status: "error" });
    } finally {
      jest.useRealTimers();
    }
  });
});
