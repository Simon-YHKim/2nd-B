// The case this file exists for: a locale chunk that never answers.
//
// #1626's gate was `ensureLocalePack(lng).catch(() => {}).then(settleInitialPack)`.
// That covers a chunk that REJECTS. A web fetch that connects and then goes
// quiet neither resolves nor rejects, so neither handler ever runs and the app
// stays on <InlineLoader /> for the session. No test could catch it because
// nothing in src/lib/i18n/** had a timeout to test.
//
// So the first test below is the whole point: a promise that is never settled,
// and the gate has to open anyway. Delete the bound in pack-gate.ts and that
// test stops passing -- verified by mutation, see the last describe block.

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  LOCALE_PACK_ATTACHED_EVENT,
  LOCALE_PACK_GATE_TIMEOUT_MS,
  openGateWhenSettledOrTimedOut,
} from "../pack-gate";

/** A promise that never settles -- the failure mode, not a slow one. */
function neverSettles(): Promise<never> {
  return new Promise<never>(() => {});
}

describe("locale pack gate", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("opens on the bound when the chunk never answers", async () => {
    const settle = jest.fn();
    const gate = openGateWhenSettledOrTimedOut({ load: neverSettles(), settle, timeoutMs: 4000 });

    await jest.advanceTimersByTimeAsync(3999);
    expect(settle).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(settle).toHaveBeenCalledTimes(1);
    await expect(gate).resolves.toBeUndefined();
  });

  it("opens immediately when the chunk attaches, without waiting out the bound", async () => {
    const settle = jest.fn();
    const gate = openGateWhenSettledOrTimedOut({
      load: Promise.resolve(),
      settle,
      timeoutMs: 4000,
    });

    await gate;
    expect(settle).toHaveBeenCalledTimes(1);

    // Nothing left armed: advancing past the bound must not settle twice.
    await jest.advanceTimersByTimeAsync(10_000);
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("opens when the chunk rejects, because EN is a real answer", async () => {
    const settle = jest.fn();
    const gate = openGateWhenSettledOrTimedOut({
      load: Promise.reject(new Error("chunk 404")),
      settle,
      timeoutMs: 4000,
    });

    await expect(gate).resolves.toBeUndefined();
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("repaints when a chunk lands after the bound already opened the gate", async () => {
    const settle = jest.fn();
    const onLateAttach = jest.fn();
    let attach: () => void = () => {};
    const load = new Promise<void>((resolve) => {
      attach = resolve;
    });

    const gate = openGateWhenSettledOrTimedOut({ load, settle, onLateAttach, timeoutMs: 4000 });
    await jest.advanceTimersByTimeAsync(4000);
    await gate;

    expect(settle).toHaveBeenCalledTimes(1);
    expect(onLateAttach).not.toHaveBeenCalled();

    // The chunk was un-awaited, not abandoned. When it lands, consumers repaint.
    attach();
    await Promise.resolve();
    await Promise.resolve();
    expect(onLateAttach).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("does not repaint when a chunk fails after the bound opened the gate", async () => {
    const settle = jest.fn();
    const onLateAttach = jest.fn();
    let fail: (e: Error) => void = () => {};
    const load = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });

    const gate = openGateWhenSettledOrTimedOut({ load, settle, onLateAttach, timeoutMs: 4000 });
    await jest.advanceTimersByTimeAsync(4000);
    await gate;

    fail(new Error("chunk 404"));
    await Promise.resolve();
    await Promise.resolve();
    // EN is already painted and is the correct end state.
    expect(onLateAttach).not.toHaveBeenCalled();
  });

  it("defaults the bound rather than leaving it undefined", async () => {
    const settle = jest.fn();
    openGateWhenSettledOrTimedOut({ load: neverSettles(), settle });

    await jest.advanceTimersByTimeAsync(LOCALE_PACK_GATE_TIMEOUT_MS - 1);
    expect(settle).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(settle).toHaveBeenCalledTimes(1);
  });
});

describe("locale pack gate wiring", () => {
  const root = path.resolve(__dirname, "../../../..");
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

  it("keeps the repaint event bound, or a late chunk would never show", () => {
    // The gate emits LOCALE_PACK_ATTACHED_EVENT when a timed-out chunk lands.
    // If it is dropped from bindI18n the emit is inert and the user stays in EN
    // for the session -- a silent regression with no error anywhere.
    const source = read("src/lib/i18n/index.ts");
    expect(source).toContain(`bindI18n: \`languageChanged \${ADDRESS_VARIABLES_CHANGED_EVENT} \${LOCALE_PACK_ATTACHED_EVENT}\``);
    expect(source).toContain("onLateAttach: () => i18next.emit(LOCALE_PACK_ATTACHED_EVENT)");
  });

  it("does not force the repaint through changeLanguage", () => {
    // changeLanguage fires the languageChanged handler, which PERSISTS the
    // locale as an explicit preference. The locale here was only DETECTED, and
    // initI18n is explicit that detection must not be persisted.
    // Assert on CODE, not prose: this module's header explains at length why it
    // avoids changeLanguage, so a naive substring check matches its own comment.
    const code = read("src/lib/i18n/pack-gate.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("changeLanguage");
  });

  it("still bounds the wait in the shipped module", () => {
    // Mutation anchor: removing the timer is exactly the regression this file
    // exists to catch, and the first test above fails when it is gone.
    const source = read("src/lib/i18n/pack-gate.ts");
    expect(source).toContain("setTimeout(");
    expect(source).toContain("clearTimeout(timer)");
  });
});
