import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createReportSender, inAppReportsEnabled, supportDestination, REPORT_TIMEOUT_MS, type ReportState } from "../report";

const id = "10000000-0000-4000-8000-000000000001";
const receipt = "20000000-0000-4000-8000-000000000002";
const metadata = { app_version: "1.0", screen_path: "/support" as const, locale: "ko" };
const read = (p: string) => readFileSync(resolve(__dirname, "../../../..", p), "utf8");
function setup() {
  const states: ReportState[] = [];
  const deps = {
    enabled: jest.fn(() => true), assertOwner: jest.fn(),
    online: jest.fn(async () => true), uuid: jest.fn(() => id),
    send: jest.fn(async (_request: unknown, _signal: AbortSignal): Promise<unknown> => receipt),
    changed: (state: ReportState) => states.push(state),
  };
  const sender = createReportSender(deps);
  const submit = () => sender.submit(" report ", true, "bug", metadata);
  return { deps, sender, submit, states };
}

describe("T53 dormant support submission", () => {
  test.each([undefined, "false", "1", "TRUE", "", " true "])("flag %s stays off", value => {
    expect(inAppReportsEnabled(value)).toBe(false);
  });
  test("explicit true routes both entries into form; off preserves mail bytes", () => {
    expect(inAppReportsEnabled("true")).toBe(true);
    expect(supportDestination("bug", false)).toBe("mailto:kim0405@hayangzip.com?subject=Bug%20report");
    expect(supportDestination("inquiry", false)).toBe("mailto:kim0405@hayangzip.com");
    expect(supportDestination("bug", true)).toBe("form");
    expect(supportDestination("inquiry", true)).toBe("form");
  });
  test("disabled sends nothing even if called directly", async () => {
    const { deps, submit } = setup(); deps.enabled.mockReturnValue(false);
    await submit(); expect(deps.send).not.toHaveBeenCalled(); expect(deps.online).not.toHaveBeenCalled();
  });
  test.each([["", true], ["   ", true], ["hello", false], ["x".repeat(2001), true]])("rejects empty/long/unconsented input", async (body, consent) => {
    const { sender, deps } = setup();
    await sender.submit(body as string, consent as boolean, "bug", metadata);
    expect(sender.state).toEqual({ phase: "failed", reason: "invalid" });
    expect(deps.send).not.toHaveBeenCalled();
  });
  test("offline fails without dispatch and can retry online", async () => {
    const { deps, sender, submit } = setup(); deps.online.mockResolvedValueOnce(false);
    await submit(); expect(sender.state).toEqual({ phase: "failed", reason: "offline" });
    expect(sender.locked).toBe(false); expect(deps.send).not.toHaveBeenCalled();
    await submit(); expect(sender.state).toEqual({ phase: "sent", receipt });
  });
  test("success waits for a receipt and sends only the defined envelope", async () => {
    const { deps, sender, submit } = setup();
    let finish!: (value: string) => void;
    deps.send.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    const pending = submit();
    await jest.advanceTimersByTimeAsync(0);
    expect(sender.state).toEqual({ phase: "sending" });
    expect(deps.send.mock.calls[0][0]).toEqual({ p_request_id: id, p_kind: "bug", p_body: "report", p_metadata: metadata, p_consent_version: "support-v1" });
    finish(receipt); await pending;
    expect(sender.state).toEqual({ phase: "sent", receipt });
  });
  test.each([null, {}, "", "ok", [receipt]])("malformed receipt %s never means sent", async value => {
    const { deps, sender, submit } = setup(); deps.send.mockResolvedValue(value);
    await submit(); expect(sender.state).toEqual({ phase: "failed", reason: "unconfirmed" });
  });
  test("a failed or ambiguous request reuses the original ID and body", async () => {
    const { deps, sender, submit } = setup(); deps.send.mockRejectedValueOnce(new Error("network"));
    await submit(); expect(sender.locked).toBe(true);
    await sender.submit("changed", true, "inquiry", { ...metadata, locale: "en" });
    expect(deps.send.mock.calls[1][0]).toEqual(deps.send.mock.calls[0][0]);
    expect(deps.uuid).toHaveBeenCalledTimes(1); expect(sender.state).toEqual({ phase: "sent", receipt });
  });
  test("duplicate presses while waiting or after success dispatch once", async () => {
    const { deps, submit } = setup(); await Promise.all([submit(), submit()]); await submit();
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
  test("rate limiting has a retryable result", async () => {
    const { deps, sender, submit } = setup(); deps.send.mockRejectedValueOnce({ code: "P0053" });
    await submit(); expect(sender.state).toEqual({ phase: "failed", reason: "limited" });
    await submit(); expect(sender.state.phase).toBe("sent");
  });
  test("stalled dispatch times out, aborts, and retries the same request", async () => {
    const { deps, sender, submit } = setup(); deps.send.mockImplementationOnce(() => new Promise(() => {}));
    const pending = submit(); await jest.advanceTimersByTimeAsync(REPORT_TIMEOUT_MS + 1); await pending;
    expect(sender.state).toEqual({ phase: "failed", reason: "unconfirmed" });
    expect(deps.send.mock.calls[0][1].aborted).toBe(true);
    await submit(); expect(deps.send.mock.calls[1][0]).toEqual(deps.send.mock.calls[0][0]);
  });
  test("stalled connectivity probe is bounded too", async () => {
    const { deps, sender, submit } = setup(); deps.online.mockImplementationOnce(() => new Promise(() => {}));
    const pending = submit(); await jest.advanceTimersByTimeAsync(REPORT_TIMEOUT_MS + 1); await pending;
    expect(sender.state.phase).toBe("failed"); expect(deps.send).not.toHaveBeenCalled();
  });
  test("owner transition while probing prevents dispatch", async () => {
    const { deps, submit } = setup();
    deps.online.mockImplementationOnce(async () => { deps.assertOwner.mockImplementation(() => { throw new Error("stale"); }); return true; });
    await submit(); expect(deps.send).not.toHaveBeenCalled();
  });
  test("owner transition after dispatch cannot announce success", async () => {
    const { deps, sender, submit } = setup();
    deps.send.mockImplementationOnce(async () => { deps.assertOwner.mockImplementation(() => { throw new Error("stale"); }); return receipt; });
    await submit(); expect(sender.state.phase).toBe("failed");
  });
  test("unmount while probing prevents dispatch and later UI updates", async () => {
    const { deps, sender, states, submit } = setup();
    deps.online.mockImplementationOnce(async () => { sender.dispose(); return true; });
    await submit(); expect(deps.send).not.toHaveBeenCalled(); expect(states).toEqual([{ phase: "sending" }]);
  });
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
});

test("support screen wires both switched entries and preserves existing copy keys", () => {
  const source = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
  expect(source).toContain('supportDestination(kind, reportsEnabled)');
  expect(source).toContain('if (reportsEnabled && reportKind) return <SupportReportForm');
  expect(source).toContain('onPress:()=>openReport("inquiry")');
  expect(source).toContain('onPress:()=>openReport("bug")');
  expect(source).toContain('else void Linking.openURL(destination)');
  expect(source).toContain('t("support.emailUs")');
});

test("form has keyboard/back/owner boundaries and a single accessible send action", () => {
  const source = read("src/screens/deepspace/SupportReportForm.tsx");
  for (const marker of ['<OwnedReportForm key={userId}', 'captureLiveOwnerCheck(ownerId)', 'sender.dispose()',
    '<KeyboardAvoidingArea', 'spacing.xl + keyboardHeight', 'useHardwareBack(', 'accessibilityRole="checkbox"',
    'editable={!locked}', 'disabled={busy || !consent || !body.trim()}', 'sender.submit(body, consent, kind, metadata)',
    'state.phase === "sent"', 'state.receipt']) expect(source).toContain(marker);
  const rpc = read("src/lib/support/report-rpc.ts");
  expect(rpc).toContain('withLiveOwnerSignal(assertOwner, signal');
  expect(rpc).toContain('.rpc("submit_support_report", request).abortSignal(ownedSignal!)');
});

test("five languages have all report keys and no em dash", () => {
  const en = JSON.parse(read("locales/en/support.json")).report;
  for (const language of ["ko", "en", "es", "pt", "id"]) {
    const strings = JSON.parse(read(`locales/${language}/support.json`)).report;
    expect(Object.keys(strings)).toEqual(Object.keys(en));
    expect(Object.values(strings).every(v => typeof v === "string" && v.length > 0 && !v.includes("\u2014"))).toBe(true);
  }
});
