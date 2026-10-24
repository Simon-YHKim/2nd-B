import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";

jest.mock("@/lib/llm/boundary", () => ({
  callLlm: jest.fn(async () => ({ text: "ok", safety: { zone: "green" }, audit: { modelUsed: "fixture" } })),
  classifyChatTextForCrisis: jest.fn(async () => null),
}));
jest.mock("../usage", () => ({
  readChatUsageDetail: jest.fn(async () => ({ used: 0, adBonus: 0 })),
  bumpChatUsageIfUnderCap: jest.fn(async () => 1), ChatLimitExceededError: class extends Error {},
}));
jest.mock("../../records/load-structured", () => ({ loadStructuredContext: jest.fn(async () => "Existing form") }));
jest.mock("../../persona/profile-context", () => ({ loadProfileContext: jest.fn(async () => ["Existing profile"]) }));
jest.mock("../rag", () => ({
  retrieveChatContext: jest.fn(async () => []), formatRagPages: jest.fn(() => "Existing RAG"),
}));
jest.mock("../../wiki/export", () => ({ exportUserWiki: jest.fn(async (_user, options) => ({
  prompt: options.includeRecords ? "PRIVATE_DIARY_SENTINEL" : "Existing wiki",
  recordCount: options.includeRecords ? 1 : 0, pageCount: 1, sourceCount: 0, pageCountsByKind: {},
})) }));

import { sendChatMessage } from "../conversation";
import { callLlm } from "../../llm/boundary";
import { exportUserWiki } from "../../wiki/export";
import { retrieveChatContext } from "../rag";
import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
import { RECORD_READ_ENABLED } from "../record-read";

const root = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

beforeEach(() => { jest.clearAllMocks(); __resetAccountEpochForTests(); noteResolvedOwner("owner"); });

test.each(["en", "ko"] as const)("unchanged request bytes in %s across RAG hit/miss/error and both modes", async locale => {
  const requests: string[] = [];
  expect(RECORD_READ_ENABLED).toBe(false);
  for (const mode of ["analytic", "divergent"] as const) {
    for (const rag of ["hit", "miss", "error"] as const) {
      if (rag === "error") jest.mocked(retrieveChatContext).mockRejectedValueOnce(new Error("fixture"));
      else jest.mocked(retrieveChatContext).mockResolvedValueOnce(rag === "hit" ? [{} as never] : []);
      const result = await sendChatMessage({ userId: "owner", message: "Help with my project.", locale, tier: "free", mode,
        displayName: "Alex", history: [{ role: "user", text: "I saved a page." }] });
      expect(result.status).toBe("ok");
      const request = JSON.stringify(jest.mocked(callLlm).mock.calls.at(-1)![0]);
      expect(request).not.toContain("PRIVATE_DIARY_SENTINEL");
      expect(jest.mocked(exportUserWiki).mock.calls.at(-1)![1]).not.toHaveProperty("includeRecords");
      requests.push(sha(request));
    }
  }
  // Recorded against untouched conversation.ts at baseline 533d0a01. No model/network runs.
  expect(requests).toMatchSnapshot();
});

test("dormant modules are not imported by chat or settings; existing prefs are untouched", () => {
  for (const path of ["src/lib/chat/conversation.ts", "src/app/secondb.tsx", "src/screens/deepspace/DeepSpaceDesignScreens.tsx",
    "src/lib/privacy/prefs.ts"]) {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
    const imports = source.statements.filter(ts.isImportDeclaration).map(n => (n.moduleSpecifier as ts.StringLiteral).text);
    expect(imports.some(value => /record-read|RecordReadConsent/.test(value))).toBe(false);
    expect(read(path)).not.toContain("llm_record_body");
  }
});

test("UI is gated, five-line copy is required, settings and submit remain disabled", () => {
  const ui = read("src/components/consent/RecordReadConsent.tsx");
  expect(ui).toContain("if (!RECORD_READ_ENABLED || isMinor !== false || !copy || copy.lines.length !== 5) return null;");
  expect(ui).toContain("if (!RECORD_READ_ENABLED) return null;");
  expect(ui).toContain("lines: readonly [ConsentLine, ConsentLine, ConsentLine, ConsentLine, ConsentLine]");
  expect(ui).toContain("value={false} disabled");
  expect(ui).toContain('label={t("recordRead.agree")} disabled');
  expect(ui).not.toMatch(/\.rpc\(|fetch\(|savePrivacyPrefs|set_record_body_consent/);
});

test("approved labels have five locale key sets; unreviewed consent languages retain the EN gate", () => {
  const packs = ["en", "ko", "es", "pt", "id"].map(locale => JSON.parse(read(`locales/${locale}/consent.json`)).recordRead);
  expect(packs[1].title).toBe("대화에서 내 기록을 읽어도 될까요?");
  expect(packs[1].setting).toBe("기록 읽기");
  for (const pack of packs) expect(Object.keys(pack)).toEqual(["title", "ack", "agree", "notNow", "setting"]);
  for (const pack of packs.slice(2)) expect(pack).toEqual(packs[0]);
});
