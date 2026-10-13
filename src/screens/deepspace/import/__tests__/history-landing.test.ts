// A-Z first-use check, round 6 (Z92, Z93). "Import history · withdraw" on the connections
// screen opened the list of sources to import from, and the history's empty state wore a "NEW"
// badge under a bubble that still asked what to import.
import fs from "node:fs";
import path from "node:path";

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

const hub = read("src/screens/deepspace/import/ImportHubScreen.tsx");
const connections = read("src/app/data-connections.tsx");
const kit = read("src/components/deepspace/ops/kit.tsx");

describe("Z93: the history row lands on the history", () => {
  test("the row asks the hub for its history view", () => {
    expect(connections).toContain(
      '<PixelPressable onPress={() => router.push("/import-hub?view=history")} accessibilityLabel={t("ops:phone.importHistory")}',
    );
  });

  test("the hub starts on the step the route asked for", () => {
    expect(hub).toContain('const landedOnHistory = useScreenParams<{ view?: string }>().view === "history";');
    expect(hub).toContain('useState<Step>(landedOnHistory ? "history" : "hub")');
  });

  // The history is loaded when the screen mounts, not when the step is entered, so landing on it
  // shows the list without a visit to the hub first.
  test("the history loads on mount", () => {
    expect(hub).toMatch(/useEffect\(\(\) => \{\s*[^}]*void getImportHistory\(userId\)\.then\(setHistory\);/);
  });

  test("back leaves the screen until the reader has seen the hub, then returns to the hub", () => {
    expect(hub).toContain("const [sawHub, setSawHub] = useState(!landedOnHistory);");
    expect(hub).toContain('if (step === "hub") setSawHub(true);');
    expect(hub).toContain(
      'const back = () => (step === "hub" || (step === "history" && !sawHub) ? router.back() : setStep("hub"));',
    );
  });
});

describe("Z92: the history does not look like something new to import", () => {
  test("the what-to-import bubble is not drawn on the history step", () => {
    expect(hub).toContain('{step === "history" ? null : <SecondbStatusHeader text={t("hubBubble")} tip={t("hubTip")} />}');
    expect(hub.match(/<SecondbStatusHeader /g)).toHaveLength(1);
  });

  test("an empty state carries no badge; the other states keep theirs", () => {
    expect(kit).toContain('const STATE_BADGE: Record<Exclude<OpsStateVariant, "empty">, string> = {');
    expect(kit).not.toMatch(/^\s*empty: "/m);
    expect(kit).toContain('{props.variant === "empty" ? null : <RNText style={styles.stateBadge}>{STATE_BADGE[props.variant]}</RNText>}');
    for (const badge of ['error: "ERR"', 'unlinked: "LINK"', 'rate: "WAIT"']) expect(kit).toContain(badge);
  });
});
