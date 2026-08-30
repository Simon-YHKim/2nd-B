import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canPublishProfileIdentity,
  loadProfileIdentity,
  resolveProfileIdentity,
  type ProfileIdentityDeps,
} from "../dds-profile-identity";

const ROOT = join(__dirname, "..", "..", "..", "..");
const ROUTE = join(ROOT, "src", "app", "profile.tsx");
const SCREEN = join(ROOT, "src", "screens", "deepspace", "dds-profile-screen.tsx");
const IDENTITY = join(ROOT, "src", "screens", "deepspace", "dds-profile-identity.ts");
const PIXEL_RULES = join(ROOT, "scripts", "check-pixel-rules.ts");

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("PIXEL-CLAY /profile contract", () => {
  test("delegates only the gated renderer and leaves the legacy renderer body unchanged", () => {
    const route = read(ROUTE);
    expect(route).toContain("import { DeepSpaceProfileScreen }");
    expect(route).toContain("if (isDeepSpaceUI()) return <DeepSpaceProfileScreen />");
    expect(route).toContain("return <ProfileLegacy />");

    const marker = "function ProfileLegacy() {";
    const legacyStart = route.indexOf(marker);
    expect(legacyStart).toBeGreaterThan(-1);
    expect(createHash("sha256").update(route.slice(legacyStart + marker.length)).digest("hex")).toBe(
      "914e93c5f180bed953ae000516427e3faa70a5b5e17971e851c2e214e777af87",
    );
  });

  test("holds on auth loading and redirects only after a resolved signed-out session", () => {
    const source = read(SCREEN);
    expect(source).toContain("const { userId, loading } = useAuth()");
    expect(source).toMatch(/if \(loading\)[\s\S]*?<DeepSpaceLoader/);
    expect(source).toContain('if (!userId) return <Redirect href="/sign-in" />');
  });

  test("keeps the profile star plus every current profile route without reviving persona", () => {
    const source = read(SCREEN);
    const routes = [...source.matchAll(/route:\s*"(\/[^\"]+)"/g)].map((match) => match[1]);
    expect(routes).toEqual([
      "/core-brain",
      "/profile-details",
      "/insights",
      "/brightness",
      "/growth",
      "/big-five",
      "/ipip-neo",
      "/rlss",
      "/attachment",
      "/seen",
      "/esm",
      "/interview",
      "/audit",
    ]);
    expect(source).toContain('router.push("/settings")');
    expect(source).toContain('router.push("/plans")');
    expect(source).not.toContain('"/persona"');
  });

  test("renders the real progression tier and one disclosed route group at a time", () => {
    const source = read(SCREEN);
    expect(source).toContain("const progression = useProgression()");
    expect(source).toContain("const planKey = progression.tier");
    expect(source).toContain('tPlans(`tiers.${planKey}.name`)');
    expect(source).toContain("activeSection");
    expect(source).toContain("activeGroup.items.map");
    expect(source).not.toContain("StateRow");
    expect(source).not.toMatch(/\b(?:아리아|항해자|fixture|sample user)\b/i);
  });

  test("uses shared pixel primitives, bounded touch targets, and clipping-safe Korean text", () => {
    const source = read(SCREEN);
    expect(source).toContain("PixelSurface");
    expect(source).toContain("PixelPressable");
    expect(source).toContain("PixelGlyph");
    expect(source).toContain('variant="bevel"');
    expect(source).toContain('variant="inset"');
    expect(source).toContain("minHeight: m3.minTouch");
    expect(source).toContain("lineHeight:");
    expect(source).toContain("paddingBottom:");
    expect(source).not.toMatch(/<Pressable\b|<TouchableOpacity\b/);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\b(?:rgba|withAlpha)\s*\(/);
    expect(source).not.toMatch(/\bopacity\s*:\s*0?\.\d+/);
    expect(source).not.toMatch(/border(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*(?!m3\.shape\.none)/);
  });

  test("registers the dedicated screen with the PIXEL-CLAY rules gate", () => {
    expect(read(PIXEL_RULES)).toContain('"src/screens/deepspace/dds-profile-screen.tsx"');
  });

  test("reads display_name and a same-user local session without exposing backend errors", () => {
    const source = read(IDENTITY);
    expect(source).toContain('.from("users")');
    expect(source).toContain('.select("display_name")');
    expect(source).toContain("supabase.auth.getSession()");
    expect(source).toContain("withTimeout(");
    expect(source).not.toContain("console.");
  });

  test("resets identity ownership and guards every async publish against user changes", () => {
    const source = read(SCREEN);
    expect(source).toContain("const requestedUserId = userId");
    expect(source).toContain("setIdentity({ owner: requestedUserId, value: null, loading: true })");
    expect(source).toContain("canPublishProfileIdentity(cancelled, requestedUserId, activeUserRef.current)");
    expect(source).toContain("cancelled = true");
  });
});

describe("profile identity resolution", () => {
  const sameUserSession = { userId: "user-a", email: "local.name@example.com" };

  test("prefers a trimmed users.display_name over the session email", () => {
    expect(resolveProfileIdentity("  Actual Name  ", sameUserSession, "user-a")).toBe("Actual Name");
  });

  test("falls back to the local email part when display_name is missing", () => {
    expect(resolveProfileIdentity(null, sameUserSession, "user-a")).toBe("local.name");
    expect(resolveProfileIdentity("   ", sameUserSession, "user-a")).toBe("local.name");
  });

  test("never exposes another account's session email", () => {
    expect(resolveProfileIdentity(null, { userId: "user-b", email: "other@example.com" }, "user-a")).toBeNull();
  });

  test("rejects a stale result after an account switch or unmount", () => {
    expect(canPublishProfileIdentity(false, "user-a", "user-a")).toBe(true);
    expect(canPublishProfileIdentity(false, "user-a", "user-b")).toBe(false);
    expect(canPublishProfileIdentity(true, "user-a", "user-a")).toBe(false);
  });

  test("survives an offline display-name read and still uses the local session", async () => {
    const deps: ProfileIdentityDeps = {
      readDisplayName: jest.fn().mockRejectedValue(new Error("offline")),
      readLocalSession: jest.fn().mockResolvedValue(sameUserSession),
    };
    await expect(loadProfileIdentity("user-a", deps)).resolves.toBe("local.name");
  });

  test("returns no invented identity when both real sources fail", async () => {
    const deps: ProfileIdentityDeps = {
      readDisplayName: jest.fn().mockRejectedValue(new Error("offline")),
      readLocalSession: jest.fn().mockRejectedValue(new Error("session unavailable")),
    };
    await expect(loadProfileIdentity("user-a", deps)).resolves.toBeNull();
  });
});
