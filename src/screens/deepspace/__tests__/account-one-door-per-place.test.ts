// Z77 (A-Z first-use check): the account screen had a "Settings" row that led back to where the
// visitor came from, a "My data" row that opened the same screen as settings' "Data management",
// and an export row that My data also linked to. Simon picked "remove the three and name the
// settings row My data" (2026-10-13, Q-261013-17), under the 2026-10-10 rule of one top-level
// door per place.
//
// What the code turned out to hold (2026-10-14): the export TOOL lives only on the account screen.
// My data's export card is a door to it (/account?tool=export). So the tool stays where it is and
// is drawn only for the visitor who came through that door.
// Source contracts: render tests are not available here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNT_DESTINATIONS, accountToolFromParam } from "../dds-account-actions";
import { DATA_RIGHTS } from "../dds-data-content";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

describe("the account hub keeps one door per place", () => {
  it("no longer lists settings or My data", () => {
    const routes = ACCOUNT_DESTINATIONS.map(({ route }) => route as string);
    expect(routes).toEqual(["/profile", "/change-password", "/iden", "/beyond"]);
    expect(routes).not.toContain("/settings");
    expect(routes).not.toContain("/data");
  });

  it("settings still has the one row that opens My data", () => {
    const settings = read("src/app/settings.tsx");
    expect(settings.split('router.push("/data")').length - 1).toBe(1);
    expect(settings).toContain('label={t("nav.data")} hint={t("nav.dataHint")} onPress={() => router.push("/data")}');
  });
});

describe("the export tool has one door: the card on My data", () => {
  const screen = read("src/screens/deepspace/dds-account-screen.tsx");
  const guard = screen.indexOf('{requestedTool === "export" ? (');
  const guardEnd = screen.indexOf("              </>\n            ) : null}", guard);
  const guarded = screen.slice(guard, guardEnd);

  it("draws the export row and its body only for the visitor who came for it", () => {
    expect(guard).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(guard);
    expect(guarded).toContain('accessibilityLabel={t("consent:account.export.label")}');
    expect(guarded).toContain("onPress={() => void onExportData()}");
    // Nothing of the export tool is drawn outside the guard.
    const outside = screen.slice(0, guard) + screen.slice(guardEnd);
    expect(outside).not.toContain('t("consent:account.export.label")');
    expect(outside).not.toContain('t("consent:account.export.button")');
  });

  it("keeps the birth-date tool and the delete row outside that guard", () => {
    expect(guarded).not.toContain('t("consent:account.dob.label")');
    expect(guarded).not.toContain('router.push("/privacy?section=delete")');
    expect(screen.indexOf('t("consent:account.dob.label")')).toBeLessThan(guard);
    expect(screen.indexOf('router.push("/privacy?section=delete")')).toBeGreaterThan(guardEnd);
  });

  it("still opens the tool when the visitor arrives with the query", () => {
    expect(screen).toContain('setExportOpen(requestedTool === "export");');
    expect(accountToolFromParam("export")).toBe("export");
    expect(accountToolFromParam(["export"])).toBeNull();
    expect(accountToolFromParam("settings")).toBeNull();
  });

  it("My data's export card is that door", () => {
    const card = DATA_RIGHTS.find((item) => item.id === "account-export");
    expect(card?.route).toBe("/account?tool=export");
  });

  // The export owner checks are untouched: the tool moved nowhere.
  it("leaves the export call and its two owner checks as they were", () => {
    expect(screen).toContain("const result = await exportAccountData({");
    expect(screen).toContain("expectedUserId: requestedUser,");
    expect(screen).toContain("activeUserRef.current === requestedUser &&");
  });
});

describe("one name for the screen: My data", () => {
  it.each(LOCALES)("%s: the settings row, the screen title and its eyebrow say the same name", (lng) => {
    const settings = JSON.parse(read(`locales/${lng}/settings.json`)) as { nav: Record<string, string> };
    const deepspace = JSON.parse(read(`locales/${lng}/deepspace.json`)) as { account: Record<string, string> };
    const data = JSON.parse(read(`locales/${lng}/data.json`)) as { hero: Record<string, string> };
    const profile = JSON.parse(read(`locales/${lng}/profile.json`)) as { sections: { account: { items: { data: { hint: string } } } } };
    const name = deepspace.account.navData;
    expect(settings.nav.data).toBe(name);
    expect(settings.nav.dataHint).toContain(name);
    expect(data.hero.eyebrow).toBe(`08-1. ${name}`);
    expect(profile.sections.account.items.data.hint).toContain(name);
  });

  it("Korean reads 내 데이터 everywhere, including the dev list and the canon", () => {
    const ko = (JSON.parse(read("locales/ko/settings.json")) as { nav: Record<string, string> }).nav;
    expect(ko.data).toBe("내 데이터");
    expect(ko.dataHint).toBe("내 데이터를 엽니다.");
    expect(read("src/lib/dev/screen-index.ts")).toContain('{ file: "data", href: "/data", label: "내 데이터", auth: true },');
    for (const canon of ["public/proto/data/app/screens.json", "design/proto_rev2/reference-app/data/app/screens.json"]) {
      expect(read(canon)).toContain('"title": "내 데이터",\n      "route": "data"');
    }
  });

  // The hub's tip named export as something that starts on this screen. It no longer does.
  it.each(LOCALES)("%s: the account tip no longer promises export on this screen", (lng) => {
    const tip = (JSON.parse(read(`locales/${lng}/deepspace.json`)) as { account: Record<string, string> }).account.tip;
    expect(tip.length).toBeGreaterThan(0);
    expect(tip).not.toMatch(/export|내보내|exportar|ekspor/i);
  });
});
