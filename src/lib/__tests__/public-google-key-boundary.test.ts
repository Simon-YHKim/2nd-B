import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const read = (relativePath: string): string =>
  readFileSync(resolve(ROOT, relativePath), "utf8").replace(/\r\n?/g, "\n");

const PUBLIC_GOOGLE_KEY = ["EXPO", "PUBLIC", "GOOGLE", "API", "KEY"].join("_");
const ENV_SOURCE = read("src/lib/env.ts");
const WEB_DEPLOY = read(".github/workflows/web-deploy.yml");

describe("public web builds keep Google API credentials server-only", () => {
  test("the environment module has no public Google key consumption path", () => {
    expect(ENV_SOURCE).not.toContain(PUBLIC_GOOGLE_KEY);
    expect(ENV_SOURCE).toMatch(/GOOGLE_API_KEY:\s*proc\.GOOGLE_API_KEY/);
  });

  test("the web workflow never injects either Google API key form", () => {
    expect(WEB_DEPLOY).not.toContain(PUBLIC_GOOGLE_KEY);
    expect(WEB_DEPLOY).not.toMatch(/^\s+GOOGLE_API_KEY:\s*/m);
  });

  test("web LLM mode stays configurable while every build uses the Edge Function", () => {
    expect(WEB_DEPLOY).toMatch(
      /EXPO_PUBLIC_LLM_MODE:\s*\$\{\{\s*vars\.EXPO_PUBLIC_LLM_MODE\s*\|\|\s*'mock'\s*\}\}/,
    );
    const edgeAssignments =
      WEB_DEPLOY.match(/^\s+EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION:.*$/gm)?.map((line) => line.trim()) ?? [];
    expect(edgeAssignments).toEqual(['EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: "true"']);
  });

  test("intentionally public Supabase and Google OAuth values remain wired", () => {
    expect(WEB_DEPLOY).toContain(
      "EXPO_PUBLIC_SUPABASE_URL: ${{ vars.EXPO_PUBLIC_SUPABASE_URL }}",
    );
    expect(WEB_DEPLOY).toContain(
      "EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ vars.EXPO_PUBLIC_SUPABASE_ANON_KEY }}",
    );
    expect(WEB_DEPLOY).toContain(
      "EXPO_PUBLIC_GOOGLE_CLIENT_ID: ${{ vars.EXPO_PUBLIC_GOOGLE_CLIENT_ID }}",
    );
    expect(ENV_SOURCE).toContain("process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID");
  });
});
