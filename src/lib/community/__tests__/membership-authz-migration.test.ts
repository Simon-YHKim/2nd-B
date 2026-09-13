import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const migrationDir = path.join(root, "db", "migrations");
const migrationFiles = readdirSync(migrationDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

const membershipSignature =
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.community_is_member\s*\(\s*p_room\s+uuid\s*,\s*p_user\s+uuid\s*\)[\s\S]*?\$\$;/gi;

function finalMembershipDefinition(): { file: string; sql: string } {
  let finalDefinition: { file: string; sql: string } | null = null;

  for (const file of migrationFiles) {
    const sql = readFileSync(path.join(migrationDir, file), "utf8");
    for (const match of sql.matchAll(membershipSignature)) {
      finalDefinition = { file, sql: match[0] };
    }
  }

  if (!finalDefinition) {
    throw new Error("community_is_member definition is missing");
  }
  return finalDefinition;
}

function isCallerBound(sql: string): boolean {
  return (
    /SECURITY\s+DEFINER/i.test(sql) &&
    /SET\s+search_path\s*=\s*''/i.test(sql) &&
    /auth\.uid\(\)\s+IS\s+NOT\s+NULL/i.test(sql) &&
    /p_user\s*=\s*auth\.uid\(\)/i.test(sql) &&
    /m\.user_id\s*=\s*auth\.uid\(\)/i.test(sql)
  );
}

describe("community_is_member authorization migration", () => {
  it("binds the final SECURITY DEFINER implementation to the authenticated caller", () => {
    const definition = finalMembershipDefinition();

    expect(definition.file).toBe("0172_reward_authorization_hardening.sql");
    expect(isCallerBound(definition.sql)).toBe(true);

    // Mutation proof: removing the caller/target equality must trip this guard.
    const crossUserMutant = definition.sql.replace(/p_user\s*=\s*auth\.uid\(\)/i, "TRUE");
    expect(isCallerBound(crossUserMutant)).toBe(false);
  });

  it("keeps direct RPC execution authenticated-only", () => {
    const allSql = migrationFiles
      .map((file) => readFileSync(path.join(migrationDir, file), "utf8"))
      .join("\n");
    const grants = [
      ...allSql.matchAll(
        /GRANT\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+public\.community_is_member\s*\(\s*uuid\s*,\s*uuid\s*\)\s+TO\s+([^;]+);/gi,
      ),
    ].flatMap((match) => match[1].split(",").map((role) => role.trim().toLowerCase()));

    expect(new Set(grants)).toEqual(new Set(["authenticated"]));
    expect(allSql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.community_is_member\s*\(\s*uuid\s*,\s*uuid\s*\)\s+FROM\s+PUBLIC;/i,
    );
    expect(allSql).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.community_is_member\s*\(\s*uuid\s*,\s*uuid\s*\)\s+FROM\s+anon;/i,
    );
  });
});
