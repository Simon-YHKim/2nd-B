const hasStringAsync = jest.fn<Promise<boolean>, []>();
const getStringAsync = jest.fn<Promise<string>, []>();

jest.mock("expo-clipboard", () => ({
  hasStringAsync: (...args: []) => hasStringAsync(...args),
  getStringAsync: (...args: []) => getStringAsync(...args),
}));

import { clipboardHasContent, readClipboardText } from "../clipboard";

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
