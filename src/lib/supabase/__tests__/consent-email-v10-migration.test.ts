// 0262 re-creates five functions that 0215 defined last, plus a v5 twin of 0215's v4 status
// RPC. This pins the change to exactly the email-v10 / service-v5 rows and branches: each 0262
// body must equal the 0215 body with only the listed edits applied (review #2624 r1). The
// migration's own preflight additionally refuses to run unless the live bodies are still 0215's.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const V9 = read("db/migrations/0215_consent_email_v9_20261006.sql");
const V10 = read("db/migrations/0262_consent_email_v10_20261018.sql");

/** The full CREATE statement of one function, through its closing dollar tag. */
function functionBlock(sql: string, create: string): string {
  const start = sql.indexOf(create);
  if (start < 0 || sql.indexOf(create, start + 1) >= 0) throw new Error(`expected one ${create}`);
  const tag = /\bAS\s+(\$[A-Za-z0-9_]*\$)/.exec(sql.slice(start))?.[1];
  if (!tag) throw new Error(`no body for ${create}`);
  const bodyStart = sql.indexOf(tag, start);
  const end = sql.indexOf(`${tag};`, bodyStart + tag.length);
  return sql.slice(start, end + tag.length + 1);
}

function applyEdits(block: string, edits: readonly (readonly [string, string])[]): string {
  return edits.reduce((text, [from, to]) => {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`edit applies ${count} times: ${from}`);
    return text.replace(from, to);
  }, block);
}

const CASES: { name: string; v9: string; v10: string; edits: [string, string][] }[] = [
  {
    name: "signup_consent_contract",
    v9: "CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)",
    v10: "CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)",
    edits: [[
      "    ('email-v9'::text, '2026-10-06'::text, '2026-10-06'::text, '2026-10-05'::text, true)\n",
      "    ('email-v9'::text, '2026-10-06'::text, '2026-10-06'::text, '2026-10-05'::text, true),\n"
        + "    ('email-v10'::text, '2026-10-18'::text, '2026-10-07'::text, '2026-10-05'::text, true)\n",
    ]],
  },
  {
    name: "signup_consent_contract_status",
    v9: "CREATE OR REPLACE FUNCTION public.signup_consent_contract_status()",
    v10: "CREATE OR REPLACE FUNCTION public.signup_consent_contract_status()",
    edits: [["('email-v7'), ('email-v9')) AS revision(id)", "('email-v7'), ('email-v9'), ('email-v10')) AS revision(id)"]],
  },
  {
    name: "capture_llm_consent_provenance",
    v9: "CREATE OR REPLACE FUNCTION public.capture_llm_consent_provenance()",
    v10: "CREATE OR REPLACE FUNCTION public.capture_llm_consent_provenance()",
    edits: [[
      "        ('email-v9'::text, 1),\n        ('email-v7'::text, 2),\n        ('email-v6'::text, 3),\n"
        + "        ('email-v5'::text, 4),\n        ('email-v4'::text, 5),\n        ('email-v3'::text, 6),\n"
        + "        ('email-v2'::text, 7),\n        ('complete-profile-v1'::text, 8)\n",
      "        ('email-v10'::text, 1),\n        ('email-v9'::text, 2),\n        ('email-v7'::text, 3),\n"
        + "        ('email-v6'::text, 4),\n        ('email-v5'::text, 5),\n        ('email-v4'::text, 6),\n"
        + "        ('email-v3'::text, 7),\n        ('email-v2'::text, 8),\n        ('complete-profile-v1'::text, 9)\n",
    ]],
  },
  {
    name: "llm_consent_current_decision",
    v9: "CREATE OR REPLACE FUNCTION public.llm_consent_current_decision(p_user_id uuid)",
    v10: "CREATE OR REPLACE FUNCTION public.llm_consent_current_decision(p_user_id uuid)",
    edits: [
      ["    -- 공지형(D3-4): email-v9 를 더하되 email-v4~v7 도 계속 '현재'로 인정한다.\n",
        "    -- 공지형: email-v10 을 더하되 email-v4~v9 도 계속 '현재'로 인정한다.\n"],
      ["('email-v7'::text), ('email-v9'::text)) AS revision(id)",
        "('email-v7'::text), ('email-v9'::text), ('email-v10'::text)) AS revision(id)"],
    ],
  },
  {
    name: "write_llm_service_consent",
    v9: "CREATE OR REPLACE FUNCTION public.write_llm_service_consent(",
    v10: "CREATE OR REPLACE FUNCTION public.write_llm_service_consent(",
    edits: [
      ["  IF p_contract_revision = 'service-v4' THEN\n",
        "  IF p_contract_revision = 'service-v5' THEN\n    current_status := public.llm_service_consent_status_v5(p_user_id);\n"
          + "  ELSIF p_contract_revision = 'service-v4' THEN\n"],
      ["      CASE p_contract_revision WHEN 'service-v4' THEN 'email-v9'\n",
        "      CASE p_contract_revision WHEN 'service-v5' THEN 'email-v10'\n        WHEN 'service-v4' THEN 'email-v9'\n"],
      ["    WHEN 'service-v4' THEN public.llm_service_consent_status_v4(p_user_id)\n",
        "    WHEN 'service-v5' THEN public.llm_service_consent_status_v5(p_user_id)\n"
          + "    WHEN 'service-v4' THEN public.llm_service_consent_status_v4(p_user_id)\n"],
    ],
  },
  {
    name: "llm_service_consent_status_v5 (from v4)",
    v9: "CREATE FUNCTION public.llm_service_consent_status_v4(p_user_id uuid)",
    v10: "CREATE FUNCTION public.llm_service_consent_status_v5(p_user_id uuid)",
    edits: [
      ["CREATE FUNCTION public.llm_service_consent_status_v4(", "CREATE FUNCTION public.llm_service_consent_status_v5("],
      ["jsonb_build_array('service-v4',p_user_id,", "jsonb_build_array('service-v5',p_user_id,"],
      ["'2026-10-06','2026-10-06','2026-10-05')::text", "'2026-10-18','2026-10-07','2026-10-05')::text"],
      ["'contract_revision','service-v4','consent_version','2026-10-06',\n    'policy_version','2026-10-06',",
        "'contract_revision','service-v5','consent_version','2026-10-18',\n    'policy_version','2026-10-07',"],
    ],
  },
];

describe("0262 changes 0215's function bodies only by the email-v10 / service-v5 additions", () => {
  test("preserves the LF bytes applied by Relay on 2026-10-23", () => {
    // The checksum is for the $mig0262$ body, not the surrounding apply block.
    expect(createHash("md5").update(V10).digest("hex")).toBe("c1e5913eced9d6d947dedf879528a6de");
  });

  test.each(CASES)("$name", ({ v9, v10, edits }) => {
    expect(functionBlock(V10, v10)).toBe(applyEdits(functionBlock(V9, v9), edits));
  });

  test("no migration after 0215 and before 0262 redefines a function 0262 re-creates", () => {
    const names = ["signup_consent_contract", "signup_consent_contract_status", "capture_llm_consent_provenance",
      "llm_consent_current_decision", "write_llm_service_consent", "llm_service_consent_status_v4"];
    const between = readdirSync(resolve(ROOT, "db/migrations"))
      .filter((file) => /^\d{4}_.+\.sql$/.test(file) && Number(file.slice(0, 4)) > 215 && Number(file.slice(0, 4)) < 262);
    expect(between.length).toBeGreaterThan(30);
    const redefining = between.filter((file) => {
      const sql = read(`db/migrations/${file}`).replace(/^\s*--.*$/gm, "");
      return names.some((name) => new RegExp(`\\b(?:create|alter|drop)\\s+(?:or\\s+replace\\s+)?function\\s+(?:if\\s+exists\\s+)?public\\.${name}\\s*\\(`, "i").test(sql));
    });
    expect(redefining).toEqual([]);
  });

  test("the edit list catches an unlisted change", () => {
    const tampered = functionBlock(V10, CASES[4].v10).replace("'40001'", "'40002'");
    expect(tampered).not.toBe(applyEdits(functionBlock(V9, CASES[4].v9), CASES[4].edits));
  });
});
