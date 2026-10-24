import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createReportSender, inAppReportsEnabled, reportCanRetry, supportDestination, REPORT_TIMEOUT_MS, type ReportState } from "../report";

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
  test.each([["", true], ["   ", true], ["\n", true], ["\t", true], ["\u3000", true], [" \r\n\t\u3000", true],
    ["\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff", true],
    ["hello", false], ["x".repeat(2001), true]])("rejects empty/long/unconsented input %j", async (body, consent) => {
    const { sender, deps } = setup();
    await sender.submit(body as string, consent as boolean, "bug", metadata);
    expect(sender.state).toEqual({ phase: "failed", reason: "invalid" });
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.online).not.toHaveBeenCalled();
    expect(reportCanRetry(sender.state)).toBe(false);
  });
  test("local validation remains editable and accepts a corrected body", async () => {
    const { sender, deps, submit } = setup();
    await sender.submit("\u3000", true, "bug", metadata);
    expect(sender.locked).toBe(false);
    await submit();
    expect(sender.state).toEqual({ phase: "sent", receipt });
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
  test.each(["22023", "22021", "22P02", "23514", "42501", "42883", "PGRST202", "PGRST301", "PGRST302"])("permanent rejection %s cannot redispatch the locked request", async code => {
    const { sender, deps, submit } = setup();
    deps.send.mockRejectedValueOnce({ code });
    await submit();
    expect(sender.state).toEqual({ phase: "failed", reason: "rejected" });
    expect(sender.locked).toBe(true);
    expect(reportCanRetry(sender.state)).toBe(false);
    await submit();
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
  test.each(["08006", "40001", "40P01", "53300", "57014", "57P01", "PGRST000", "PGRST003"])("transient rejection %s retries the original envelope", async code => {
    const { sender, deps, submit } = setup();
    deps.send.mockRejectedValueOnce({ code });
    await submit();
    expect(sender.state).toEqual({ phase: "failed", reason: "unconfirmed" });
    expect(reportCanRetry(sender.state)).toBe(true);
    await submit();
    expect(deps.send.mock.calls[1][0]).toEqual(deps.send.mock.calls[0][0]);
    expect(sender.state).toEqual({ phase: "sent", receipt });
  });
  test("an expired owner lease cannot be retried", async () => {
    const { sender, deps, submit } = setup();
    deps.assertOwner.mockImplementation(() => { throw Object.assign(new Error("stale"), { name: "AbortError" }); });
    await submit();
    expect(sender.state).toEqual({ phase: "failed", reason: "rejected" });
    await submit();
    expect(deps.assertOwner).toHaveBeenCalledTimes(1);
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
  const flow = read("src/screens/deepspace/SupportScreen.tsx");
  expect(flow).toContain('const reportsEnabled = inAppReportsEnabled()');
  expect(flow).toContain('if (reportsEnabled && reportKind) return <SupportReportForm');
  expect(flow).toContain('<DeepSpaceSupportDesignScreen onReport={reportsEnabled ? setReportKind : undefined} />');
  expect(flow).toContain('export function SupportScreen()');
  expect(read("src/app/support.tsx")).toContain('@/screens/deepspace/SupportScreen');
  expect(source).toContain('onReport ? onReport("inquiry") : Linking.openURL(\'mailto:kim0405@hayangzip.com\')');
  expect(source).toContain('onReport ? onReport("bug") : Linking.openURL(\'mailto:kim0405@hayangzip.com?subject=Bug%20report\')');
  expect(source).toContain('onReport ? t("support:report.inquiryTitle") : t("support.emailUs")');
  expect(source).toContain('onReport ? t("support:report.bugTitle") : t("support.reportBug")');
});

test("all active DPIA citations still name the original screen evidence", () => {
  const doc = read("docs/legal/DPIA-2ndB-minors-draft.md");
  const source = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx").split(/\r?\n/);
  const citations = [...doc.matchAll(/`src\/screens\/deepspace\/DeepSpaceDesignScreens\.tsx:(\d+)-(\d+)`/g)];
  expect(citations).toHaveLength(3);
  const subjects = ["setAnalyticsConsent(false", "buildPersona(userId, locale, isMinor === true)", "captureSignOutExpectation()"];
  citations.forEach((citation, i) => {
    expect(source.slice(Number(citation[1]) - 1, Number(citation[2])).join("\n")).toContain(subjects[i]);
  });
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

test("form exposes checked/expanded state and excludes only decorative glyphs from speech", () => {
  const source = read("src/screens/deepspace/SupportReportForm.tsx");
  const checkbox = source.match(/<Pressable\s+accessibilityRole="checkbox"[^>]*>/)?.[0];
  expect(checkbox).toContain('aria-checked={consent}');
  expect(checkbox).toContain('aria-disabled={locked}');
  expect(checkbox).toContain('accessibilityLabel={t("report.consent")}');
  const toggle = source.match(/<Pressable\s+accessibilityRole="button"[^>]*>/)?.[0];
  expect(toggle).toContain('aria-expanded={details}');
  expect(toggle).toContain('accessibilityLabel={t("report.details")}');
  for (const expression of ['{details ? "⌄" : "›"}', '{consent ? "☑" : "☐"}']) {
    expect(source).toContain('<Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>' + expression + '</Text>');
  }
});

test("permanent rejection offers email while retry is limited to transient failures", () => {
  const source = read("src/screens/deepspace/SupportReportForm.tsx");
  expect(source).toContain('const rejected = state.phase === "failed" && state.reason === "rejected"');
  expect(source).toContain('{rejected ? <Button label={t("deepspace:support.emailUs")}');
  expect(source).toContain('Linking.openURL(supportDestination(kind, false))');
  expect(source).toContain('reportCanRetry(state) ? "report.retry" : "report.send"');
  expect(reportCanRetry({ phase: "editing" })).toBe(false);
  for (const reason of ["offline", "unconfirmed", "limited"] as const) expect(reportCanRetry({ phase: "failed", reason })).toBe(true);
  expect(source.match(/t\("report.reply"\)/g)).toHaveLength(2); // before consent submission and after receipt
});
