import { readFileSync } from "node:fs";
import { join } from "node:path";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { getGithubUsername, setGithubUsername } from "../github-link";

const mockBacking = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockAsyncStorage = jest.mocked(AsyncStorage);
const SRC = join(__dirname, "..", "..", "..");

beforeEach(() => {
  mockBacking.clear();
  mockAsyncStorage.getItem.mockReset().mockImplementation(
    async (key: string) => mockBacking.get(key) ?? null,
  );
  mockAsyncStorage.setItem.mockReset().mockImplementation(async (key: string, value: string) => {
    mockBacking.set(key, value);
  });
  mockAsyncStorage.removeItem.mockReset().mockImplementation(async (key: string) => {
    mockBacking.delete(key);
  });
});

describe("GitHub username ownership", () => {
  it("stores and restores each account independently", async () => {
    await setGithubUsername(" user-a ", " octocat-a ");
    await setGithubUsername("user-b", "octocat-b");

    expect(await getGithubUsername("user-a")).toBe("octocat-a");
    expect(await getGithubUsername("user-b")).toBe("octocat-b");
    expect(mockBacking).toEqual(
      new Map([
        ["ops.github.username:user-a", "octocat-a"],
        ["ops.github.username:user-b", "octocat-b"],
      ]),
    );
  });

  it("clears only the requesting account", async () => {
    await setGithubUsername("user-a", "octocat-a");
    await setGithubUsername("user-b", "octocat-b");
    await setGithubUsername("user-a", "   ");

    expect(await getGithubUsername("user-a")).toBe("");
    expect(await getGithubUsername("user-b")).toBe("octocat-b");
  });

  it("fails closed without a valid owner", async () => {
    expect(await getGithubUsername("   ")).toBe("");
    await setGithubUsername("", "octocat");
    await setGithubUsername("\t", "");

    expect(mockAsyncStorage.getItem).not.toHaveBeenCalled();
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it("does not assign the ambiguous legacy key to the next account", async () => {
    mockBacking.set("ops.github.username", "legacy-owner-unknown");

    expect(await getGithubUsername("user-a")).toBe("");
    expect(mockAsyncStorage.getItem).toHaveBeenCalledWith("ops.github.username:user-a");
    expect(mockAsyncStorage.getItem).not.toHaveBeenCalledWith("ops.github.username");
  });
});

describe("/side-project ownership wiring", () => {
  it("guards auth before keyed child mount and propagates the owner", () => {
    const source = readFileSync(join(SRC, "app", "side-project.tsx"), "utf8");
    const loadingAt = source.indexOf("if (loading) return null;");
    const redirectAt = source.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const mountAt = source.indexOf("<SideProjectScreen key={userId} userId={userId} />");

    expect(loadingAt).toBeGreaterThan(-1);
    expect(redirectAt).toBeGreaterThan(loadingAt);
    expect(mountAt).toBeGreaterThan(redirectAt);
  });

  it("uses the owner for restore, save, and effect lifecycle", () => {
    const source = readFileSync(join(SRC, "screens", "deepspace", "ops", "screens.tsx"), "utf8");
    const start = source.indexOf("export function SideProjectScreen");
    const end = source.indexOf("export function MealsScreen", start);
    const screen = source.slice(start, end);

    expect(screen).toContain("SideProjectScreen({ userId }: { userId: string })");
    expect(screen).toContain("getGithubUsername(userId)");
    expect(screen).toContain("setGithubUsername(userId, username)");
    expect(screen).toContain("}, [userId]);");
  });

  it("declares the route as authenticated in the screen registry", () => {
    const source = readFileSync(join(SRC, "lib", "dev", "screen-index.ts"), "utf8");
    expect(source).toContain(
      '{ file: "side-project", href: "/side-project", label: "사이드 프로젝트", auth: true }',
    );
  });
});
