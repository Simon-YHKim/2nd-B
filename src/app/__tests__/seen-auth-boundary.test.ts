import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(__dirname, "..", "seen.tsx"), "utf8").replace(/\r\n/g, "\n");
const ROUTE = SOURCE.slice(SOURCE.indexOf("export default function Seen"));

describe("/seen auth ownership boundary", () => {
  it("holds and redirects before mounting the Deep Space subtree", () => {
    const loadingAt = ROUTE.indexOf("if (loading) return null;");
    const redirectAt = ROUTE.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const mountAt = ROUTE.indexOf("<SeenDeepSpace key={userId} />");

    expect(loadingAt).toBeGreaterThan(-1);
    expect(redirectAt).toBeGreaterThan(loadingAt);
    expect(mountAt).toBeGreaterThan(redirectAt);
  });

  it("keys the authenticated subtree by owner while preserving the legacy redirect", () => {
    const authAt = ROUTE.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const modeAt = ROUTE.indexOf("if (isDeepSpaceUI())");
    const legacyAt = ROUTE.indexOf('<Redirect href="/persona" />');

    expect(ROUTE).toContain("const { userId, loading } = useAuth();");
    expect(ROUTE).toContain("<SeenDeepSpace key={userId} />");
    expect(modeAt).toBeGreaterThan(authAt);
    expect(legacyAt).toBeGreaterThan(modeAt);
  });
});
