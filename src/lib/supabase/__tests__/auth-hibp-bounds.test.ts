// U2 (sec-port 2026-09-17): the HIBP range call that guards sign-up and every
// password change is bounded in time and size. Before this, a stalled
// api.pwnedpasswords.com answer held the form open with no limit and any
// response was buffered whole. Intent ported from
// fix/security-auth-pkce-260906 (ccd2211f); the fail-open policy is unchanged:
// a bound that trips counts as an HIBP failure and returns false.
//
// AA-1826-1 follow-up (gate A, 2026-09-19): the body is read only as a stream,
// never buffered whole, and every early exit aborts the request, because on
// native only the abort stops the transfer. The fakes below count the bytes a
// transport actually hands over, since a mock that returns a finished string
// cannot tell a stopped download from a completed one. This mitigates, and
// does not close, the finding: expo/fetch still buffers natively whatever
// arrives before the first read, and only the timeout bounds that window.
//
// HZ-1837-1 follow-up (re-gate of #1837, 2026-09-19): the abort stops the
// transfer but does not promise that a waiting read settles. On iOS a first
// read whose startStreaming reaches native after the abort never does, and the
// check used to wait with it for as long as the app ran. The five-second
// deadline now settles the check itself. The transport fake below replays
// expo's native order, because a fetch that rejects on abort cannot show it.

import { createHash } from "node:crypto";

import { isPasswordBreached } from "../auth";

// Native reads the range body through expo/fetch. The factory reads the
// current fake on each access so a test can also make loading it fail.
const mockExpoFetch: { load: () => unknown } = { load: () => undefined };
jest.mock("expo/fetch", () => ({
  get fetch() {
    return mockExpoFetch.load();
  },
}));

const PASSWORD = "correct horse battery staple";
const HASH = createHash("sha1").update(PASSWORD).digest("hex").toUpperCase();
const PREFIX = HASH.slice(0, 5);
const BREACH_LINE = `${HASH.slice(5)}:42\r\n`;
const CAP_BYTES = 256 * 1024;
// 40-byte decoy rows, 1024 to a chunk: seven chunks cross the cap.
const DECOY_CHUNK = new TextEncoder().encode(`${"0".repeat(35)}:10\r\n`.repeat(1024));

const realFetch = globalThis.fetch;

type FetchImpl = (url: string, init?: RequestInit) => Promise<unknown>;

// React Native defines `window` but no `document`, and auth.ts keys its web
// branch on both.
function useNativeRuntime(): void {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
}

function useWebRuntime(): void {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
}

function installGlobalFetch(impl: FetchImpl): jest.Mock {
  const mock = jest.fn(impl);
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function installExpoFetch(impl: FetchImpl): jest.Mock {
  const mock = jest.fn(impl);
  mockExpoFetch.load = () => mock;
  return mock;
}

function signalOf(fetchMock: jest.Mock): AbortSignal | undefined {
  return (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal ?? undefined;
}

// React Native's built-in fetch: the whole body arrives buffered, with no
// stream. Native must never take this path again, so reaching it is recorded.
function installBufferedBuiltInFetch(): { fetch: jest.Mock; text: jest.Mock } {
  const text = jest.fn(async () => `${"0".repeat(CAP_BYTES)}\n${BREACH_LINE}`);
  const builtIn = installGlobalFetch(async () => ({
    ok: true,
    headers: new Headers(),
    body: null,
    text,
  }));
  return { fetch: builtIn, text };
}

// A transport body that counts every byte it hands over. highWaterMark 0 means
// nothing is pulled ahead of a read, so the count is exactly what was taken.
function countingStream(next: (pull: number) => Uint8Array | null): {
  stream: ReadableStream<Uint8Array>;
  state: { bytes: number; cancelled: boolean };
} {
  const state = { bytes: 0, cancelled: false };
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        const chunk = next(pulls);
        if (!chunk) {
          controller.close();
          return;
        }
        state.bytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

const endless = () => DECOY_CHUNK;

function breachThenEnd(pull: number): Uint8Array | null {
  return pull === 1 ? new TextEncoder().encode(`${"0".repeat(35)}:0\r\n${BREACH_LINE}`) : null;
}

// The shape expo/fetch resolves with: status, headers and a streaming body.
// Its text() would buffer the whole body, so reaching it is recorded too.
function streamedResponse(
  stream: ReadableStream<Uint8Array> | null,
  init: { ok?: boolean; headers?: HeadersInit } = {},
): { ok: boolean; headers: Headers; body: ReadableStream<Uint8Array> | null; text: jest.Mock } {
  return {
    ok: init.ok ?? true,
    headers: new Headers(init.headers ?? {}),
    body: stream,
    text: jest.fn(async () => BREACH_LINE),
  };
}

type NativeState = "responseReceived" | "bodyStreamingStarted" | "errorReceived";

// expo/fetch as its iOS native side drives a response (expo 56.0.13). The
// first read asks native to start streaming (FetchResponse.ts pull) and waits
// for that call. An abort that native handles before streaming has started
// marks the response failed with no error event (NativeResponse.swift
// emitRequestCanceled), and the late startStreaming then answers null, which
// pull also takes as "started": no data, completion or error follows, so the
// read never settles. After streaming has started the abort does emit the
// error and the waiting read rejects. The test runs the native queue itself,
// so the order is fixed rather than timed. With `headers: "on demand"` native
// already has the headers but their answer reaches JS only when delivered.
function expoNativeTransport(headers: "at once" | "on demand" = "at once"): {
  fetch: FetchImpl;
  native: { state: NativeState; startRequests: number; startsRun: number; errorEvents: number };
  runNative: () => void;
  deliverHeaders: () => void;
} {
  const native = {
    state: "responseReceived" as NativeState,
    startRequests: 0,
    startsRun: 0,
    errorEvents: 0,
  };
  const nativeQueue: (() => void)[] = [];
  const headerAnswers: (() => void)[] = [];
  let body: ReadableStreamDefaultController<Uint8Array> | undefined;
  const fetchImpl: FetchImpl = (_url, init) => {
    // fetch.ts subscribes before the request starts and keeps the listener
    // after resolving: an abort cancels the native request.
    init?.signal?.addEventListener("abort", () => {
      if (native.state === "bodyStreamingStarted") {
        native.errorEvents += 1;
        body?.error(new Error("canceled"));
      }
      native.state = "errorReceived";
    });
    const stream = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          body = controller;
        },
        pull() {
          native.startRequests += 1;
          return new Promise<void>((resolve) => {
            nativeQueue.push(() => {
              native.startsRun += 1;
              // startStreaming is valid only from responseReceived. From any
              // other state it answers null, which pull reads as started too.
              if (native.state === "responseReceived") native.state = "bodyStreamingStarted";
              resolve();
            });
          });
        },
      },
      { highWaterMark: 0 },
    );
    const response = streamedResponse(stream);
    if (headers === "at once") return Promise.resolve(response);
    return new Promise((resolve) => headerAnswers.push(() => resolve(response)));
  };
  return {
    fetch: fetchImpl,
    native,
    runNative: () => nativeQueue.splice(0).forEach((run) => run()),
    deliverHeaders: () => headerAnswers.splice(0).forEach((answer) => answer()),
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

afterEach(() => {
  globalThis.fetch = realFetch;
  mockExpoFetch.load = () => undefined;
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
  jest.useRealTimers();
});

describe("native reads the range body as a stream and aborts when it stops", () => {
  test("an endless body with no declared length stops one chunk past the cap", async () => {
    useNativeRuntime();
    const builtIn = installBufferedBuiltInFetch();
    const { stream, state } = countingStream(endless);
    const response = streamedResponse(stream);
    const expoFetch = installExpoFetch(async () => response);

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);

    expect(state.bytes).toBeGreaterThan(CAP_BYTES);
    expect(state.bytes).toBeLessThanOrEqual(CAP_BYTES + DECOY_CHUNK.byteLength);
    const taken = state.bytes;
    await flushMicrotasks();
    expect(state.bytes).toBe(taken);
    expect(state.cancelled).toBe(true);
    // Cancelling the read does not stop a native transfer; the abort does.
    expect(signalOf(expoFetch)?.aborted).toBe(true);
    expect(response.text).not.toHaveBeenCalled();
    expect(builtIn.fetch).not.toHaveBeenCalled();
    expect(builtIn.text).not.toHaveBeenCalled();
  });

  test("a small declared length does not let the body run past the cap", async () => {
    useNativeRuntime();
    installBufferedBuiltInFetch();
    const { stream, state } = countingStream(endless);
    const expoFetch = installExpoFetch(async () =>
      streamedResponse(stream, { headers: { "content-length": "64" } }),
    );

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);

    expect(state.bytes).toBeGreaterThan(CAP_BYTES);
    expect(state.bytes).toBeLessThanOrEqual(CAP_BYTES + DECOY_CHUNK.byteLength);
    expect(signalOf(expoFetch)?.aborted).toBe(true);
  });

  test("a small streamed range response still reports the breach and is not aborted", async () => {
    useNativeRuntime();
    const builtIn = installBufferedBuiltInFetch();
    const { stream } = countingStream(breachThenEnd);
    const expoFetch = installExpoFetch(async () => streamedResponse(stream));

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(true);

    expect(expoFetch).toHaveBeenCalledTimes(1);
    const [url, init] = expoFetch.mock.calls[0] as [string, RequestInit];
    // Still only the five-character prefix leaves the device, padded.
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(init.headers).toEqual({ "Add-Padding": "true" });
    expect(signalOf(expoFetch)?.aborted).toBe(false);
    expect(builtIn.fetch).not.toHaveBeenCalled();
  });

  test("a declared length over the cap is refused before the body is read", async () => {
    useNativeRuntime();
    installBufferedBuiltInFetch();
    const { stream, state } = countingStream(endless);
    const response = streamedResponse(stream, {
      headers: { "content-length": String(CAP_BYTES + 1) },
    });
    const expoFetch = installExpoFetch(async () => response);

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);

    expect(state.bytes).toBe(0);
    expect(response.text).not.toHaveBeenCalled();
    // A body cancelled before its first read keeps downloading natively.
    expect(signalOf(expoFetch)?.aborted).toBe(true);
  });

  test("a non-OK answer is not read and its transfer is aborted", async () => {
    useNativeRuntime();
    installBufferedBuiltInFetch();
    const { stream, state } = countingStream(endless);
    const response = streamedResponse(stream, { ok: false });
    const expoFetch = installExpoFetch(async () => response);

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);

    expect(state.bytes).toBe(0);
    expect(response.text).not.toHaveBeenCalled();
    expect(signalOf(expoFetch)?.aborted).toBe(true);
  });

  test("a response with no stream to read is not read at all", async () => {
    useNativeRuntime();
    const builtIn = installBufferedBuiltInFetch();
    const response = streamedResponse(null);
    const expoFetch = installExpoFetch(async () => response);

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);

    expect(expoFetch).toHaveBeenCalledTimes(1);
    // Without a stream nothing could stop the download partway, so the body
    // is left unread and the check fails open like any tripped bound.
    expect(response.text).not.toHaveBeenCalled();
    expect(signalOf(expoFetch)?.aborted).toBe(true);
    expect(builtIn.fetch).not.toHaveBeenCalled();
  });

  test("if expo/fetch cannot load, the check fails open instead of buffering", async () => {
    useNativeRuntime();
    const builtIn = installBufferedBuiltInFetch();
    mockExpoFetch.load = () => {
      throw new Error("native fetch module unavailable");
    };

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);

    expect(builtIn.fetch).not.toHaveBeenCalled();
    expect(builtIn.text).not.toHaveBeenCalled();
  });
});

describe("web keeps the browser fetch and its reader, and aborts on the same exits", () => {
  function refuseExpoFetch(): jest.Mock {
    return installExpoFetch(async () => {
      throw new Error("web must not load expo/fetch");
    });
  }

  test("a small streamed range response still reports the breach and is not aborted", async () => {
    useWebRuntime();
    const expoFetch = refuseExpoFetch();
    const { stream } = countingStream(breachThenEnd);
    const fetchMock = installGlobalFetch(async () => new Response(stream));

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(true);

    expect(signalOf(fetchMock)?.aborted).toBe(false);
    expect(expoFetch).not.toHaveBeenCalled();
  });

  test("an endless body is cancelled one chunk past the cap", async () => {
    useWebRuntime();
    refuseExpoFetch();
    const { stream, state } = countingStream(endless);
    const fetchMock = installGlobalFetch(async () => new Response(stream));

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);

    expect(state.bytes).toBeGreaterThan(CAP_BYTES);
    expect(state.bytes).toBeLessThanOrEqual(CAP_BYTES + DECOY_CHUNK.byteLength);
    expect(state.cancelled).toBe(true);
    expect(signalOf(fetchMock)?.aborted).toBe(true);
  });

  test("a declared length over the cap is refused before the body is read", async () => {
    useWebRuntime();
    refuseExpoFetch();
    const { stream, state } = countingStream(endless);
    const fetchMock = installGlobalFetch(async () =>
      streamedResponse(stream, { headers: { "content-length": String(CAP_BYTES + 1) } }),
    );

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);

    expect(state.bytes).toBe(0);
    expect(signalOf(fetchMock)?.aborted).toBe(true);
  });

  test("a non-OK answer is not read and its transfer is aborted", async () => {
    useWebRuntime();
    refuseExpoFetch();
    const { stream, state } = countingStream(endless);
    const fetchMock = installGlobalFetch(async () => new Response(stream, { status: 503 }));

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);

    expect(state.bytes).toBe(0);
    expect(signalOf(fetchMock)?.aborted).toBe(true);
  });
});

describe("a stalled range call gives up at five seconds", () => {
  test.each([
    ["native", useNativeRuntime, installExpoFetch],
    ["web", useWebRuntime, installGlobalFetch],
  ] as const)("%s: the request is aborted and the check fails open", async (label, useRuntime, install) => {
    useRuntime();
    if (label === "native") installBufferedBuiltInFetch();
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
    let signal: AbortSignal | undefined;
    const fetchMock = install((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    });

    let outcome: boolean | "pending" = "pending";
    void isPasswordBreached(PASSWORD).then((value) => {
      outcome = value;
    });
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(4_999);
    await flushMicrotasks();
    expect(outcome).toBe("pending");

    jest.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(signal?.aborted).toBe(true);
    expect(outcome).toBe(false);
  });

  // HZ-1837-1: the abort reaches native after the headers and before the first
  // read has started streaming, so nothing will ever settle that read.
  test("native: an abort that lands before streaming starts still settles at five seconds", async () => {
    useNativeRuntime();
    installBufferedBuiltInFetch();
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
    const transport = expoNativeTransport();
    const expoFetch = installExpoFetch(transport.fetch);

    let outcome: boolean | "pending" = "pending";
    void isPasswordBreached(PASSWORD).then((value) => {
      outcome = value;
    });
    await flushMicrotasks();
    // The headers are in and the first read is waiting on startStreaming.
    expect(transport.native.startRequests).toBe(1);
    expect(transport.native.startsRun).toBe(0);

    jest.advanceTimersByTime(4_999);
    await flushMicrotasks();
    expect(outcome).toBe("pending");

    jest.advanceTimersByTime(1);
    await flushMicrotasks();
    const atDeadline = outcome;
    // The abort was handled first: the request is cancelled, and no error
    // event went out because nothing had started streaming.
    expect(signalOf(expoFetch)?.aborted).toBe(true);
    expect(transport.native.state).toBe("errorReceived");
    expect(transport.native.errorEvents).toBe(0);

    // Only now does native get to the queued startStreaming, and a minute on
    // nothing has woken the read.
    transport.runNative();
    await flushMicrotasks();
    jest.advanceTimersByTime(60_000);
    await flushMicrotasks();
    expect(transport.native.startsRun).toBe(1);
    expect({ atDeadline, afterNative: outcome }).toEqual({ atDeadline: false, afterNative: false });
  });

  test("native: an abort after streaming has started errors the waiting read", async () => {
    useNativeRuntime();
    installBufferedBuiltInFetch();
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
    const transport = expoNativeTransport();
    installExpoFetch(transport.fetch);

    let outcome: boolean | "pending" = "pending";
    void isPasswordBreached(PASSWORD).then((value) => {
      outcome = value;
    });
    await flushMicrotasks();
    // Native starts streaming before the deadline, but no bytes come.
    transport.runNative();
    await flushMicrotasks();
    expect(transport.native.state).toBe("bodyStreamingStarted");
    expect(outcome).toBe("pending");

    jest.advanceTimersByTime(5_000);
    await flushMicrotasks();
    // In this order the abort errors the stream and the waiting read rejects.
    expect(transport.native.errorEvents).toBe(1);
    expect(outcome).toBe(false);
  });

  test("native: headers that reach JS after the deadline are not read", async () => {
    useNativeRuntime();
    installBufferedBuiltInFetch();
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
    const transport = expoNativeTransport("on demand");
    installExpoFetch(transport.fetch);

    let outcome: boolean | "pending" = "pending";
    void isPasswordBreached(PASSWORD).then((value) => {
      outcome = value;
    });
    await flushMicrotasks();
    jest.advanceTimersByTime(5_000);
    await flushMicrotasks();
    expect(outcome).toBe(false);

    // Native had the headers before the abort; their answer reaches JS after.
    transport.deliverHeaders();
    await flushMicrotasks();
    // No read starts once the request is aborted: it could be stranded too.
    expect(transport.native.state).toBe("errorReceived");
    expect(transport.native.startRequests).toBe(0);
  });
});
