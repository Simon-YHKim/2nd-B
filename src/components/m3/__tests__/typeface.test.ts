// Unit guard for the M3 chrome typeface resolver (rev2 migration, P1b).
import { m3 } from "@/lib/theme/m3";

import { m3TextStyle, robotoFor } from "../typeface";

describe("robotoFor — weight to loaded family", () => {
  test("maps each M3 weight to its registered Roboto family", () => {
    expect(robotoFor("400")).toBe("Roboto");
    expect(robotoFor("500")).toBe("RobotoMedium");
    expect(robotoFor("700")).toBe("RobotoBold");
  });

  test("the mapped families are exactly the ones the chrome font declares", () => {
    // m3.font.chrome is the 400 family; medium/bold are weight-suffixed keys.
    expect(robotoFor(m3.font.weight.regular)).toBe(m3.font.chrome);
    expect(robotoFor(m3.font.weight.medium)).toBe("RobotoMedium");
    expect(robotoFor(m3.font.weight.bold)).toBe("RobotoBold");
  });
});

describe("m3TextStyle — type role to RN text style", () => {
  test("labelLarge (weight 500) resolves to RobotoMedium with its metrics", () => {
    expect(m3TextStyle("labelLarge")).toEqual({
      fontFamily: "RobotoMedium",
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 0.1,
    });
  });

  test("bodyLarge (weight 400) resolves to Roboto", () => {
    const s = m3TextStyle("bodyLarge");
    expect(s.fontFamily).toBe("Roboto");
    expect(s.fontSize).toBe(16);
    expect(s.lineHeight).toBe(24);
  });
});
