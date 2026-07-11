import { hasOwnBack, registerOwnBack, subscribeOwnBack } from "../own-back";

describe("own-back registry", () => {
  test("counts mounted own-back affordances", () => {
    expect(hasOwnBack()).toBe(false);
    const off1 = registerOwnBack();
    const off2 = registerOwnBack();
    expect(hasOwnBack()).toBe(true);
    off1();
    expect(hasOwnBack()).toBe(true);
    off2();
    expect(hasOwnBack()).toBe(false);
  });

  test("unregister is idempotent (a double cleanup cannot underflow)", () => {
    const off = registerOwnBack();
    off();
    off();
    expect(hasOwnBack()).toBe(false);
  });

  test("notifies subscribers on register and unregister", () => {
    const seen: boolean[] = [];
    const unsub = subscribeOwnBack(() => seen.push(hasOwnBack()));
    const off = registerOwnBack();
    off();
    unsub();
    expect(seen).toEqual([true, false]);
  });
});
