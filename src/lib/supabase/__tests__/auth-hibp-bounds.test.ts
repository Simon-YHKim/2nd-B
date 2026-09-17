// U2 (sec-port 2026-09-17): the HIBP range call that guards sign-up and every
// password change is bounded in time and size. Before this, a stalled
// api.pwnedpasswords.com answer held the form open with no limit and any
// response was buffered whole. Intent ported from
// fix/security-auth-pkce-260906 (ccd2211f); the fail-open policy is unchanged:
// a bound that trips counts as an HIBP failure and returns false.

import { createHash } from "node:crypto";

import { isPasswordBreached } from "../auth";

const PASSWORD = "correct horse battery staple";
const SUFFIX = createHash("sha1").update(PASSWORD).digest("hex").toUpperCase().slice(5);
const BREACH_LINE = `${SUFFIX}:42\r\n`;
const CAP_BYTES = 256 * 1024;

const realFetch = globalThis.fetch;

function installFetch(
  impl: (url: string, init?: RequestInit) => Promise<unknown>,
): jest.Mock {
  const mock = jest.fn(impl);
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

// React Native's fetch resolves with the whole body buffered and no stream.
function bufferedResponse(text: () => Promise<string>, headers: HeadersInit = {}) {
  return { ok: true, headers: new Headers(headers), body: null, text };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.useRealTimers();
});

describe("the bounds do not hide a real breach", () => {
  test("a small streamed range response still reports the breach", async () => {
    installFetch(async () => new Response(`${"0".repeat(35)}:0\r\n${BREACH_LINE}`));

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(true);
  });

  test("a small buffered range response still reports the breach", async () => {
    installFetch(async () => bufferedResponse(async () => BREACH_LINE));

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(true);
  });
});

describe("a response over 256 KiB is not trusted", () => {
  test("a declared length over the cap is refused before the body is read", async () => {
    const text = jest.fn(async () => BREACH_LINE);
    installFetch(async () =>
      bufferedResponse(text, { "content-length": String(CAP_BYTES + 1) }),
    );

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);
    expect(text).not.toHaveBeenCalled();
  });

  test("a stream that grows past the cap is cancelled before the breach line", async () => {
    // 40-byte decoy rows; seven 40 KiB chunks cross the cap, then the real row.
    const chunk = new TextEncoder().encode(`${"0".repeat(35)}:10\r\n`.repeat(1024));
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 7) {
          controller.enqueue(chunk);
          return;
        }
        controller.enqueue(new TextEncoder().encode(BREACH_LINE));
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    installFetch(async () => new Response(stream));

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);
    expect(cancelled).toBe(true);
  });

  test("a buffered body over the cap is not scanned", async () => {
    installFetch(async () =>
      bufferedResponse(async () => `${"0".repeat(CAP_BYTES)}\n${BREACH_LINE}`),
    );

    await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);
  });
});

describe("a stalled range call gives up at five seconds", () => {
  test("the request is aborted and the check fails open", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
    let signal: AbortSignal | undefined;
    const fetchMock = installFetch((_url, init) => {
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
});
