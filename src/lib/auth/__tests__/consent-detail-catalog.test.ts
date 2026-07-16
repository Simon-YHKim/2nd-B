// The consent-notice screen builds its i18n keys dynamically
// (t(`detail.${key}.title`)), which the static C7 parity check cannot trace.
// Pin the canonical EN catalog to the selection keys so renaming a selection
// key or a catalog entry fails here instead of rendering raw keys in the app.
import en from "../../../../locales/en/consent.json";
import { REQUIRED_ACK_KEYS } from "../consent-selections";

const ITEMS = [...REQUIRED_ACK_KEYS, "marketing"] as const;
const catalog = en as {
  notice: Record<string, unknown>;
  detail: Record<string, { title?: unknown; body?: unknown } | unknown>;
};

describe("consent detail catalog (EN canonical)", () => {
  test("the sign-up rows' chevron label exists", () => {
    expect(typeof catalog.notice.detailLink).toBe("string");
  });

  test.each([...ITEMS])("detail.%s carries a title and a body", (key) => {
    const entry = catalog.detail[key] as { title?: unknown; body?: unknown } | undefined;
    expect(typeof entry?.title).toBe("string");
    expect(typeof entry?.body).toBe("string");
  });

  test("the screen chrome strings exist", () => {
    for (const k of ["title", "intro", "footer"] as const) {
      expect(typeof catalog.detail[k]).toBe("string");
    }
  });
});
