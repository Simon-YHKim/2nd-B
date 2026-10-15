import { createElement as h, Fragment } from "react";
const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup: (element: React.ReactElement) => string };

import { PhoneDesignProvider, usePhoneDesign } from "../phone-design-context";
import { phoneButtonColors, phoneStyle, phoneStyleSheet, phoneSurfaceColor, phoneTextColor } from "../phone-design";
import { phoneIos } from "../phone-ios";
import { m3 } from "../m3";
import { cosmic, deepSpace, semantic } from "../tokens";

function Probe({ id }: { id: string }) {
  return h("span", { id }, usePhoneDesign() ? "phone" : "standalone");
}

describe("phone design scope", () => {
  test("only the opted-in subtree changes, including a nested standalone override", () => {
    const html = renderToStaticMarkup(h(Fragment, null,
      h(Probe, { id: "before" }),
      h(PhoneDesignProvider, null,
        h(Probe, { id: "inside" }),
        h(PhoneDesignProvider, { enabled: false }, h(Probe, { id: "nested" })),
      ),
      h(Probe, { id: "after" }),
    ));
    expect(html).toContain('<span id="before">standalone</span>');
    expect(html).toContain('<span id="inside">phone</span>');
    expect(html).toContain('<span id="nested">standalone</span>');
    expect(html).toContain('<span id="after">standalone</span>');
  });
});

describe("phone colors and layout", () => {
  test("converts legacy surfaces and readable text but preserves explicit phone colors", () => {
    expect(phoneSurfaceColor(deepSpace.bgMid)).toBe(phoneIos.grouped);
    expect(phoneSurfaceColor(m3.color.surfaceContainerHigh)).toBe(phoneIos.cell);
    expect(phoneTextColor(cosmic.moonWhite)).toBe(phoneIos.label);
    expect(phoneTextColor(cosmic.mistGray)).toBe(phoneIos.label2);
    expect(phoneTextColor(phoneIos.onBlue)).toBe(phoneIos.onBlue);
    expect(phoneSurfaceColor("transparent")).toBe("transparent");
    expect(phoneSurfaceColor(semantic.zoneRed)).toBe(phoneIos.red);
    expect(phoneSurfaceColor(semantic.zoneGreen)).toBe(phoneIos.green);
    expect(phoneSurfaceColor(semantic.zoneYellow)).toBe(phoneIos.orange);
  });

  test("style adaptation preserves geometry, typography, and source objects", () => {
    const source = Object.freeze({ gap: 8, flex: 1, color: cosmic.moonWhite, backgroundColor: cosmic.panelBg,
      fontFamily: "Pretendard", fontSize: 15, elevation: 6, shadowOpacity: 1, borderRadius: 12 });
    const styles = Object.freeze({ card: source });
    expect(phoneStyleSheet(styles).card).toEqual(phoneStyle(source));
    expect(phoneStyle(source)).toMatchObject({ gap: 8, flex: 1, color: phoneIos.label,
      backgroundColor: phoneIos.cell, fontFamily: "Pretendard", fontSize: 15,
      elevation: 0, shadowOpacity: 0, borderRadius: 0 });
    expect(source.backgroundColor).toBe(cosmic.panelBg);
    expect(source.elevation).toBe(6);
  });

  test("primary, destructive, pressed, and disabled controls retain distinct states", () => {
    expect(phoneButtonColors({ primary: true })).toEqual({ background: phoneIos.blue, foreground: phoneIos.onBlue });
    expect(phoneButtonColors({ primary: true, pressed: true }).background).toBe(phoneIos.bluePressed);
    expect(phoneButtonColors({ destructive: true }).foreground).toBe(phoneIos.red);
    expect(phoneButtonColors({ primary: true, disabled: true, pressed: true }))
      .toEqual({ background: phoneIos.fill, foreground: phoneIos.label2 });
    expect(phoneButtonColors({ pressed: true }).background).toBe(phoneIos.fill);
  });
});
