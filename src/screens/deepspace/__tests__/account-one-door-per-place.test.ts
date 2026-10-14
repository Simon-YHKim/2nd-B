// Z77 (A-Z first-use check): the account screen had a "Settings" row that led back to where the
// visitor came from, a "My data" row that opened the same screen as settings' "Data management",
// and an export row that My data also linked to. Simon picked "remove the three and name the
// settings row My data" (2026-10-13, Q-261013-17), under the 2026-10-10 rule of one top-level
// door per place.
//
// What the code turned out to hold (2026-10-14 morning): the export TOOL lived only on the account
// screen and My data's card was a door to it. Simon then moved the tool itself into My data
// (Q-261014-61, 2026-10-14 20:33): the card runs it, and an old link to the account screen's tool
// is sent on to that card.
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

// One place runs the export: My data's export card. The manual's shortcut and the old link open it.
describe("the export lives in My data (Q-261014-61, Simon 2026-10-14)", () => {
  const screen = read("src/screens/deepspace/dds-account-screen.tsx");
  const dataScreen = read("src/screens/deepspace/dds-data-screen.tsx");
  const panel = read("src/screens/deepspace/dds-account-export.tsx");

  it("the account screen draws no export, and an old link to it opens My data's export card", () => {
    expect(screen).not.toContain('t("consent:account.export.label")');
    expect(screen).not.toContain('t("consent:account.export.button")');
    expect(screen).not.toContain("exportAccountData");
    expect(screen).toContain('if (requestedTool === "export") return <Redirect href="/data?open=account-export" />;');
    // The redirect comes after the signed-out redirect, so a visitor who is not signed in goes to sign-in.
    expect(screen.indexOf('if (!userId) return <Redirect href="/sign-in" />;')).toBeLessThan(screen.indexOf('if (requestedTool === "export")'));
  });

  it("keeps the birth-date tool and the delete row on the account screen", () => {
    expect(screen).toContain('t("consent:account.dob.label")');
    expect(screen).toContain('router.push("/privacy?section=delete")');
  });

  it("takes the tool from the route's query", () => {
    expect(screen).toContain("const { tool } = useScreenParams<{ tool?: string | string[] }>();");
    expect(screen).toContain("const requestedTool = accountToolFromParam(tool);");
    expect(screen.split("const requestedTool").length - 1).toBe(1);
    expect(screen.split("requestedTool = ").length - 1).toBe(1);
    expect(accountToolFromParam("export")).toBe("export");
    expect(accountToolFromParam(["export"])).toBeNull();
    expect(accountToolFromParam("settings")).toBeNull();
  });

  it("My data's export card runs the export in place, and the manual's shortcut opens that card", () => {
    const card = DATA_RIGHTS.find((item) => item.id === "account-export");
    expect(card?.route).toBeUndefined();
    expect(dataScreen).toContain('{item.id === "account-export" ? (');
    expect(dataScreen).toContain("<AccountExportPanel />");
    expect(dataScreen).toContain("const { open } = useScreenParams<{ open?: string }>();");
    expect(dataScreen).toContain("() => DATA_RIGHTS.find((item) => item.id === open)?.id ?? null,");
    expect(read("src/screens/deepspace/dds-manual-content.ts")).toContain('routes: ["/privacy", "/iden", "/data?open=account-export", "/support"],');
  });

  // The account row in settings opens the screen without the query.
  it("settings opens the account screen without the query", () => {
    const settings = read("src/app/settings.tsx");
    expect(settings).toContain('router.push("/account")');
    expect(settings).not.toContain("/account?tool=");
  });

  it("exactly one screen file runs the export", () => {
    expect(panel.split("exportAccountData(").length - 1).toBe(1);
    expect(screen).not.toContain("exportAccountData(");
    expect(dataScreen).not.toContain("exportAccountData(");
  });

  it("folding the export card hides its detail without removing it", () => {
    expect(dataScreen).toContain('{expanded || item.id === "account-export" ? (');
    expect(dataScreen).toContain("style={[styles.detailSurface, !expanded && styles.detailFolded]}");
    expect(dataScreen).toContain('detailFolded: { display: "none" },');
  });

  // The export's owner checks moved with it, unchanged.
  it("keeps the export call and its owner checks as they were", () => {
    expect(panel).toContain("const result = await exportAccountData({");
    expect(panel).toContain("expectedUserId: requestedUser,");
    expect(panel).toContain("activeUserRef.current === requestedUser &&");
    expect(panel).toContain("authEpochRef.current === requestedEpoch,");
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

  // The public account-deletion page names the path to export; it has to be the path that exists.
  it("the public account-deletion page names the path that exists", () => {
    const page = read("docs/legal/account-deletion.md");
    expect(page).toContain("**설정 → 내 데이터 → 계정 데이터 내보내기**");
    expect(page).toContain("**Settings → My data → Account data export**");
    expect(page).not.toMatch(/설정 → 계정 → 데이터 내보내기|Settings → Account → Export data|설정 → 데이터 관리|Settings → Data management/);
  });

  // The hub's tip named export as something that starts on this screen. It no longer does.
  it.each(LOCALES)("%s: the account tip no longer promises export on this screen", (lng) => {
    const tip = (JSON.parse(read(`locales/${lng}/deepspace.json`)) as { account: Record<string, string> }).account.tip;
    expect(tip.length).toBeGreaterThan(0);
    expect(tip).not.toMatch(/export|내보내|exportar|ekspor/i);
  });
});
