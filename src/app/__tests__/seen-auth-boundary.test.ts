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

  it("keys the authenticated subtree by owner", () => {
    // 레거시 트랙일 때 /persona 로 보내던 분기가 있었고 이 테스트는 그 순서까지
    // 봤다. 그 분기는 은퇴했고(legacy/screens/INDEX.md), 남은 성질 — 인증을 훅으로
    // 읽고 구독 트리를 소유자로 키잉한다 — 는 그대로 지킨다.
    expect(ROUTE).toContain("const { userId, loading } = useAuth();");
    expect(ROUTE).toContain("<SeenDeepSpace key={userId} />");
  });
});
