import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACCOUNT_DOB_LOAD_TIMEOUT_MS,
  ACCOUNT_DESTINATIONS,
  ACCOUNT_EXPORT_TIMEOUT_MS,
  accountToolFromParam,
  exportAccountData,
  loadAccountDob,
  saveAccountDob,
  type AccountExportDeps,
} from "../dds-account-actions";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SCREEN = join(ROOT, "src", "screens", "deepspace", "dds-account-screen.tsx");
const ROUTE = join(ROOT, "src", "app", "account.tsx");
// AccountLegacy 는 2026-09-08 에 아카이브로 나갔다. 바이트 핀은 **지우지 않고
// 따라간다** — 같은 마커, 같은 해시, 다른 파일이면 그 핀이 "옮기면서 안 고쳤다"를
// 증명한다. /ops 와 같은 처리다.
const LEGACY = join(ROOT, "legacy", "screens", "account.tsx");

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("PIXEL-CLAY /account contract", () => {
  test("keeps the six real destinations and never revives the prototype widget route", () => {
    expect(ACCOUNT_DESTINATIONS.map(({ route }) => route)).toEqual([
      "/profile",
      "/change-password",
      "/settings",
      "/data",
      "/iden",
      "/beyond",
    ]);

    const source = read(SCREEN);
    expect(source).toContain('router.push("/privacy")');
    expect(source).not.toMatch(/deleteAllUserData|requestAccountDeletion|signOut/);
    expect(source).not.toContain('"/widget"');
    expect(source).not.toContain("StateRow");
  });

  test("holds on auth loading and redirects a resolved signed-out session", () => {
    const source = read(SCREEN);
    expect(source).toContain("const { userId, loading, refresh } = useAuth()");
    expect(source).toMatch(/if \(loading\)[\s\S]*?<DeepSpaceLoader/);
    expect(source).toContain('if (!userId) return <Redirect href="/sign-in" />');
  });

  test("uses the personalized status copy without fixed PII or fixture controls", () => {
    const source = read(SCREEN);
    const ko = read(join(ROOT, "locales", "ko", "deepspace.json"));
    expect(source).toContain('t("deepspace:account.status")');
    expect(ko).toContain("{{who}}");
    expect(source).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(source).not.toMatch(/\b(?:fixture|demo user|sample user|아리아)\b/i);
  });

  test("uses shared pixel primitives, token sizing, and Fabric-safe press handling", () => {
    const source = read(SCREEN);
    expect(source).toContain("PixelSurface");
    expect(source).toContain("PixelPressable");
    expect(source).toContain("PixelGlyph");
    expect(source).toContain('variant="bevel"');
    expect(source).toContain('variant="inset"');
    expect(source).toContain("fullWidth");
    expect(source).not.toContain("style={styles.fullWidth}");
    expect(source).toContain("minHeight: m3.minTouch");
    expect(source).not.toMatch(/<Pressable\b/);
    expect(source).not.toMatch(/style=\{\s*\(\{?\s*pressed\b/);
    expect(source).not.toMatch(/\b(?:rgba|withAlpha)\s*\(/);
    expect(source).not.toMatch(/\bopacity\s*:\s*0?\.\d+/);
    expect(source).not.toMatch(/border(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*(?!m3\.shape\.none)/);
  });

  test("exposes navigation, disclosure, and busy states to assistive technology", () => {
    const source = read(SCREEN);
    expect(source).toContain('accessibilityRole="link"');
    expect(source).toContain("accessibilityState={{ expanded: dobOpen }}");
    expect(source).toContain("accessibilityState={{ expanded: exportOpen }}");
    expect(source).toContain("accessibilityState={{ busy: dobBusy }}");
    expect(source).toContain("accessibilityState={{ busy: exporting }}");
  });

  // Digest re-pinned during the #1522 integration merge: the old value was the
  // 5b6bbe71 fork-base body, and main has since landed #1554 (terminal,
  // race-safe deletion), #1583 (sign-out history) and the deep-space route
  // guards. The merged slice is byte-identical to main's, so this still proves
  // the extraction touched nothing in the legacy path -- only the baseline moved.
  //
  // Re-pinned for the legacy export session fix, and THE PROPOSITION CHANGED
  // WITH IT. This pin no longer says "the PIXEL-CLAY extraction left the
  // rollback skin alone". It says: the extraction left it alone, AND exactly
  // one recorded change has gone in since - the one below. Read it as the
  // former and you will conclude the migration touched the shell, which it did
  // not. Anyone re-pinning after this adds their line here, or the pin stops
  // asserting anything a reader can check.
  //
  // The one change: the legacy export delivered user A's whole account bundle
  // after the session had changed, had no owner check, and had no time bound,
  // while the deletion path forty lines above already did all three. A rollback
  // skin exists to be turned on; handing someone else's export to whoever is
  // signed in is worse than a stale skin. onExportData sits inside the slice
  // this pin covers, so fixing it and moving the pin are the same act.
  test("leaves AccountLegacy and its styles byte-for-byte unchanged", () => {
    // 대상만 아카이브로 바꿨다. **digest 는 한 글자도 안 바꿨다** — 그게 증거다:
    // 같은 마커, 같은 해시, 다른 파일이면 옮기면서 고치지 않았다는 뜻이다.
    const route = read(LEGACY);
    const start = route.indexOf("function AccountLegacy()");
    const end = route.indexOf("\nexport default function Account()");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(createHash("sha256").update(route.slice(start, end)).digest("hex")).toBe(
      "4bf7c841c65aa9ae3fc3a12333f7e1d7580905a6efb3d0fad0301f564f6ed038",
    );
  });

  test("delivers the same complete export through web download and native share", () => {
    const source = read(SCREEN);
    expect(source).toContain('Platform.OS !== "web"');
    expect(source).toContain("Share.share({ message: json, title: filename })");
    expect(source).toContain("new Blob([json]");
    expect(source).toContain('document.createElement("a")');
    expect(source).toContain("anchor.download = filename");
    expect(source).toContain("URL.revokeObjectURL(url)");
  });

  test("offers a bounded DOB load retry and never logs raw backend messages", () => {
    const source = read(SCREEN);
    expect(source).toContain("dobLoadFailed ? (");
    expect(source).toContain("setDobLoadAttempt((attempt) => attempt + 1)");
    expect(source).toContain("common:actions.retry");
    expect(source).not.toContain("error.message");
    expect(source).not.toContain("String(error)");
  });

  test("allowlists tool deep links as disclosure-only navigation", () => {
    expect(accountToolFromParam("export")).toBe("export");
    expect(accountToolFromParam("dob")).toBe("dob");
    expect(accountToolFromParam("delete")).toBeNull();
    expect(accountToolFromParam(["export", "dob"])).toBeNull();
    expect(accountToolFromParam(undefined)).toBeNull();

    const source = read(SCREEN);
    expect(source).toContain("useLocalSearchParams");
    expect(source).toContain('setExportOpen(requestedTool === "export")');
    expect(source).toContain('setDobOpen(requestedTool === "dob")');
    expect(source).toMatch(/setDobOpen\(\(open\) => !open\);\s*setExportOpen\(false\);/);
    expect(source).toMatch(/setExportOpen\(\(open\) => !open\);\s*setDobOpen\(false\);/);
    expect(source).not.toMatch(/requestedTool[\s\S]{0,180}(?:onExportData|onSaveDob)\(/);
  });

  test("binds session-owned async work to an auth epoch, not only a reusable user id", () => {
    const source = read(SCREEN);
    expect(source).toContain("const authEpochRef = useRef(0)");
    expect(source).toContain("authEpochRef.current += 1");
    expect(source).toContain("authEpochRef.current === requestedEpoch");
  });
});

describe("account DOB load workflow", () => {
  test("turns a rejected read into an explicit failure and succeeds on retry", async () => {
    const error = new Error("backend details must stay private");
    const fetch = jest.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("1990-02-03");
    const deps = { fetchBirthDate: fetch };

    await expect(loadAccountDob("user-a", () => true, deps)).resolves.toEqual({ status: "failed", error });
    await expect(loadAccountDob("user-a", () => true, deps)).resolves.toEqual({
      status: "loaded",
      dob: "1990-02-03",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("cancels a read that resolves after the active account changes", async () => {
    let active = true;
    const fetch = jest.fn().mockImplementation(async () => {
      active = false;
      return "1990-02-03";
    });

    await expect(loadAccountDob("user-a", () => active, { fetchBirthDate: fetch })).resolves.toEqual({
      status: "cancelled",
    });
  });

  test("fails a stalled read at a bounded deadline so retry becomes available", async () => {
    jest.useFakeTimers();
    try {
      const pending = loadAccountDob(
        "user-a",
        () => true,
        { fetchBirthDate: () => new Promise<string | null>(() => {}) },
      );
      const assertion = expect(pending).resolves.toMatchObject({
        status: "failed",
        error: { name: "TimeoutError" },
      });
      jest.advanceTimersByTime(ACCOUNT_DOB_LOAD_TIMEOUT_MS);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  test("treats the helper's fail-soft null as unavailable instead of an editable blank", async () => {
    const result = await loadAccountDob("user-a", () => true, {
      fetchBirthDate: jest.fn().mockResolvedValue(null),
    });
    expect(result.status).toBe("failed");
  });
});

describe("account DOB workflow", () => {
  const validDob = "1990-02-03";

  test("updates a valid correction and refreshes auth-derived age state", async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const refresh = jest.fn().mockResolvedValue(undefined);

    await expect(
      saveAccountDob(
        { userId: "user-a", current: "1990-02-02", next: validDob, refresh, isActive: () => true },
        { updateBirthDate: update },
      ),
    ).resolves.toEqual({ status: "saved" });
    expect(update).toHaveBeenCalledWith("user-a", validDob);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("reports an update failure and never publishes a stale auth refresh", async () => {
    const error = new Error("write failed");
    const update = jest.fn().mockRejectedValue(error);
    const refresh = jest.fn().mockResolvedValue(undefined);

    await expect(
      saveAccountDob(
        { userId: "user-a", current: "1990-02-02", next: validDob, refresh, isActive: () => true },
        { updateBirthDate: update },
      ),
    ).resolves.toEqual({ status: "failed", error });
    expect(refresh).not.toHaveBeenCalled();
  });

  test("rejects an unchanged correction before any write", async () => {
    const update = jest.fn().mockResolvedValue(undefined);

    await expect(
      saveAccountDob(
        { userId: "user-a", current: validDob, next: validDob, refresh: jest.fn(), isActive: () => true },
        { updateBirthDate: update },
      ),
    ).resolves.toEqual({ status: "invalid" });
    expect(update).not.toHaveBeenCalled();
  });

  test("blocks an auth refresh when the account changes after the write", async () => {
    let active = true;
    const update = jest.fn().mockImplementation(async () => {
      active = false;
    });
    const refresh = jest.fn().mockResolvedValue(undefined);

    await expect(
      saveAccountDob(
        { userId: "user-a", current: "1990-02-02", next: validDob, refresh, isActive: () => active },
        { updateBirthDate: update },
      ),
    ).resolves.toEqual({ status: "cancelled" });
    expect(update).toHaveBeenCalledWith("user-a", validDob);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("full account export workflow", () => {
  const bundle = {
    schema_version: 1,
    kind: "2nd-b-account-export",
    exported_at: "2026-08-31T12:34:56.000Z",
    user_id: "user-a",
    tables: {},
    storage: [],
    excluded: {},
    errors: {},
  };

  function deps(overrides: Partial<AccountExportDeps> = {}): AccountExportDeps {
    return {
      requestAccountExport: jest.fn().mockResolvedValue(bundle),
      buildExportFilename: jest.fn().mockReturnValue("account.json"),
      deliver: jest.fn().mockResolvedValue(undefined),
      expectedUserId: "user-a",
      isActive: () => true,
      ...overrides,
    };
  }

  test("serializes and delivers the structured bundle with its own summary", async () => {
    const actionDeps = deps();

    // `done` now carries what the server reported. This fixture reports nothing
    // failed; account-export-partial.test.ts covers the bundle that does.
    await expect(exportAccountData(actionDeps)).resolves.toEqual({
      status: "done",
      summary: { tableCount: 0, fileCount: 0, failedItems: 0, excludedCategories: 0 },
    });
    expect(actionDeps.requestAccountExport).toHaveBeenCalledTimes(1);
    expect(actionDeps.buildExportFilename).toHaveBeenCalledWith(bundle.exported_at);
    expect(actionDeps.deliver).toHaveBeenCalledWith(JSON.stringify(bundle, null, 2), "account.json");
  });

  test("surfaces request and delivery failures without a false success", async () => {
    const requestError = new Error("edge unavailable");
    const requestDeps = deps({ requestAccountExport: jest.fn().mockRejectedValue(requestError) });
    await expect(exportAccountData(requestDeps)).resolves.toEqual({ status: "failed", error: requestError });
    expect(requestDeps.deliver).not.toHaveBeenCalled();

    const deliveryError = new Error("share failed");
    const deliveryDeps = deps({ deliver: jest.fn().mockRejectedValue(deliveryError) });
    await expect(exportAccountData(deliveryDeps)).resolves.toEqual({ status: "failed", error: deliveryError });
  });

  test("never delivers a completed bundle after the active account changes", async () => {
    let active = true;
    const actionDeps = deps({
      requestAccountExport: jest.fn().mockImplementation(async () => {
        active = false;
        return bundle;
      }),
      isActive: () => active,
    });

    await expect(exportAccountData(actionDeps)).resolves.toEqual({ status: "cancelled" });
    expect(actionDeps.buildExportFilename).not.toHaveBeenCalled();
    expect(actionDeps.deliver).not.toHaveBeenCalled();
  });

  test("never delivers after an A to B to A auth cycle reuses the same user id", async () => {
    let activeUser = "user-a";
    let authEpoch = 0;
    const requestedEpoch = authEpoch;
    const actionDeps = deps({
      requestAccountExport: jest.fn().mockImplementation(async () => {
        activeUser = "user-b";
        authEpoch += 1;
        activeUser = "user-a";
        authEpoch += 1;
        return bundle;
      }),
      isActive: () => activeUser === "user-a" && authEpoch === requestedEpoch,
    });

    await expect(exportAccountData(actionDeps)).resolves.toEqual({ status: "cancelled" });
    expect(actionDeps.buildExportFilename).not.toHaveBeenCalled();
    expect(actionDeps.deliver).not.toHaveBeenCalled();
  });

  test("never delivers a bundle owned by a different account", async () => {
    const actionDeps = deps({
      requestAccountExport: jest.fn().mockResolvedValue({ ...bundle, user_id: "user-b" }),
    });

    await expect(exportAccountData(actionDeps)).resolves.toEqual({
      status: "failed",
      error: expect.objectContaining({ message: "account export owner mismatch" }),
    });
    expect(actionDeps.buildExportFilename).not.toHaveBeenCalled();
    expect(actionDeps.deliver).not.toHaveBeenCalled();
  });

  test("fails a stalled export at a bounded deadline without handing off a file", async () => {
    jest.useFakeTimers();
    try {
      const actionDeps = deps({
        requestAccountExport: () => new Promise<typeof bundle>(() => {}),
      });
      const pending = exportAccountData(actionDeps);
      const assertion = expect(pending).resolves.toMatchObject({
        status: "failed",
        error: { name: "TimeoutError" },
      });
      jest.advanceTimersByTime(ACCOUNT_EXPORT_TIMEOUT_MS);
      await assertion;
      expect(actionDeps.deliver).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
