// The records_embedding consent copy names the processor the text is sent to.
// That name must come from the switch the call follows, not from a literal —
// on 2026-08-31 the live screen said "Gemini" while the ledger recorded the
// same opt-in's first embed as openai / text-embedding-3-large.

import { embedVendor } from "../../llm/routing";
import { embedVendorLabel } from "../records-embeddings";

const KEY = "EXPO_PUBLIC_EMBED_VENDOR";
const saved = process.env[KEY];

afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

describe("embedVendorLabel follows EXPO_PUBLIC_EMBED_VENDOR", () => {
  test("openai → OpenAI", () => {
    process.env[KEY] = "openai";
    expect(embedVendorLabel()).toBe("OpenAI");
  });

  test("gemini → Gemini", () => {
    process.env[KEY] = "gemini";
    expect(embedVendorLabel()).toBe("Gemini");
  });

  test("unset → the label of whatever embedVendor() resolves, never a third name", () => {
    // The unset default is routing.ts's to decide (it moves with the Gemini
    // retirement); this only pins that the label and the call agree.
    delete process.env[KEY];
    const expected = embedVendor() === "gemini" ? "Gemini" : "OpenAI";
    expect(embedVendorLabel()).toBe(expected);
  });

  test("case and whitespace are the operator's, not the label's", () => {
    process.env[KEY] = "  OpenAI ";
    expect(embedVendorLabel()).toBe("OpenAI");
  });
});
