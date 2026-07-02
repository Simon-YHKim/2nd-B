// Home coachmarks gate (Screen-Spec 04/09). Pins the persisted write/clear
// contract on the native AsyncStorage path — the same idiom as ttfv-gate.test
// (node jest env has no localStorage; navigator.product pins the RN branch).

const mockSetItem = jest.fn().mockResolvedValue(undefined);
const mockGetItem = jest.fn().mockResolvedValue(null);
const mockRemoveItem = jest.fn().mockResolvedValue(undefined);

jest.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: mockGetItem, setItem: mockSetItem, removeItem: mockRemoveItem },
}));

import {
  COACHMARKS_SEEN_KEY,
  __resetCoachmarksGateForTests,
  markCoachmarksSeen,
  resetCoachmarks,
} from "../coachmarks-gate";

const originalNavigator = globalThis.navigator;
beforeAll(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: { ...(originalNavigator ?? {}), product: "ReactNative" },
    configurable: true,
    writable: true,
  });
});
afterAll(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
});

describe("coachmarks gate (Screen-Spec 04/09)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCoachmarksGateForTests();
  });

  test("mark persists a seenAt timestamp under the versioned key", () => {
    markCoachmarksSeen();
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const [key, value] = mockSetItem.mock.calls[0];
    expect(key).toBe(COACHMARKS_SEEN_KEY);
    expect(Number.isFinite(Date.parse(String(value)))).toBe(true);
  });

  test("reset removes the flag so the guide shows again (settings 코치마크 리셋)", () => {
    markCoachmarksSeen();
    resetCoachmarks();
    expect(mockRemoveItem).toHaveBeenCalledWith(COACHMARKS_SEEN_KEY);
  });
});
