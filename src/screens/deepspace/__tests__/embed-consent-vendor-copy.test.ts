// Source-level pin: the records_embedding consent copy in the privacy screen
// must not hardcode a vendor name. It read "Gemini(해외)" / "sent to Gemini"
// until 2026-08-31 while EXPO_PUBLIC_EMBED_VENDOR had said openai since
// 2026-08-23 — measured on the live web with the QA account (privacy → 의미
// 연결 켜기 → 담기 → ai_audit_log: embed_index / openai). Component render
// tests are blocked in this repo (RN 0.85 upstream), so this reads the source.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
  "utf8",
);

describe("records_embedding consent copy names the vendor from the switch", () => {
  test("no hardcoded vendor name in the consent sentence (ko or en)", () => {
    expect(SRC).not.toMatch(/Gemini\(해외\)/);
    expect(SRC).not.toMatch(/OpenAI\(해외\)/);
    expect(SRC).not.toMatch(/sent to (Gemini|OpenAI) \(processed overseas\)/);
  });

  test("both locales interpolate embedVendorLabel() at the processor slot", () => {
    expect(SRC).toMatch(/기록 텍스트가 \$\{embedVendorLabel\(\)\}\(해외\)로 전송됩니다/);
    expect(SRC).toMatch(/record text is sent to \$\{embedVendorLabel\(\)\} \(processed overseas\)/);
  });

  test("the label is imported from the module that owns the embed consent gate", () => {
    expect(SRC).toMatch(
      /import \{[^}]*\bembedVendorLabel\b[^}]*\} from "@\/lib\/records\/records-embeddings"/,
    );
  });
});
