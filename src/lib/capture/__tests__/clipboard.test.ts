const hasStringAsync = jest.fn<Promise<boolean>, []>();
const getStringAsync = jest.fn<Promise<string>, []>();
const setStringAsync = jest.fn<Promise<void>, [string]>();

jest.mock("expo-clipboard", () => ({
  hasStringAsync: (...args: []) => hasStringAsync(...args),
  getStringAsync: (...args: []) => getStringAsync(...args),
  setStringAsync: (...args: [string]) => setStringAsync(...args),
}));

import { clipboardHasContent, readClipboardText, writeClipboardText } from "../clipboard";

function setNavigatorProduct(product: string | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    value: product === undefined ? undefined : { product },
    configurable: true,
    writable: true,
  });
}

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
  jest.clearAllMocks();
});

describe("capture clipboard helpers (O-R2 scrap track)", () => {
  test("outside React Native (web/node) both helpers refuse without touching the clipboard", async () => {
    setNavigatorProduct("Gecko");
    expect(await clipboardHasContent()).toBe(false);
    expect(await readClipboardText()).toBeNull();
    expect(hasStringAsync).not.toHaveBeenCalled();
    expect(getStringAsync).not.toHaveBeenCalled();
  });

  test("native presence probe reflects hasStringAsync", async () => {
    setNavigatorProduct("ReactNative");
    hasStringAsync.mockResolvedValueOnce(true);
    expect(await clipboardHasContent()).toBe(true);
    hasStringAsync.mockResolvedValueOnce(false);
    expect(await clipboardHasContent()).toBe(false);
  });

  test("native read trims, and empty/whitespace reads become null", async () => {
    setNavigatorProduct("ReactNative");
    getStringAsync.mockResolvedValueOnce("  https://example.com  ");
    expect(await readClipboardText()).toBe("https://example.com");
    getStringAsync.mockResolvedValueOnce("   ");
    expect(await readClipboardText()).toBeNull();
  });

  test("clipboard module failures degrade to unavailable instead of throwing", async () => {
    setNavigatorProduct("ReactNative");
    hasStringAsync.mockRejectedValueOnce(new Error("denied"));
    expect(await clipboardHasContent()).toBe(false);
    getStringAsync.mockRejectedValueOnce(new Error("denied"));
    expect(await readClipboardText()).toBeNull();
  });
});

// Write path (flow-map /secondb): long-press copy must WORK on native and
// report success honestly on both runtimes — no silent no-ops.
describe("writeClipboardText", () => {
  test("native write goes through expo-clipboard and reports success", async () => {
    setNavigatorProduct("ReactNative");
    setStringAsync.mockResolvedValueOnce(undefined);
    expect(await writeClipboardText("hello")).toBe(true);
    expect(setStringAsync).toHaveBeenCalledWith("hello");
  });

  test("native write failure reports false instead of pretending", async () => {
    setNavigatorProduct("ReactNative");
    setStringAsync.mockRejectedValueOnce(new Error("denied"));
    expect(await writeClipboardText("hello")).toBe(false);
  });

  test("web write uses navigator.clipboard and reports its outcome", async () => {
    const writeText = jest.fn<Promise<void>, [string]>().mockResolvedValueOnce(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    });
    expect(await writeClipboardText("hi")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
    writeText.mockRejectedValueOnce(new Error("blocked"));
    expect(await writeClipboardText("hi")).toBe(false);
  });

  test("no clipboard API anywhere reports false", async () => {
    setNavigatorProduct(undefined);
    expect(await writeClipboardText("hi")).toBe(false);
  });
});
