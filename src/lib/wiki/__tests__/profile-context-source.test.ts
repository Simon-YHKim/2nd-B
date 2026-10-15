jest.mock("../queries", () => ({
  getSource: jest.fn(), getWikiPage: jest.fn(), upsertWikiPage: jest.fn(),
  syncWikiLinks: jest.fn(), markSourceIngested: jest.fn(),
}));
jest.mock("../storage", () => ({ downloadRawClipping: jest.fn() }));
jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn() }));
jest.mock("../materialize", () => ({ materializeGraphFromPhase1: jest.fn() }));
jest.mock("../embeddings", () => ({ embedAndStorePage: jest.fn() }));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: jest.fn() }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "live" }) }));

import { isProfileContextImportSource, SourceImportManagedError } from "../profile-context-source";
import { runPhase1 } from "../phase1";
import { generateSourcePage } from "../phase2";
import { getSource, getWikiPage, upsertWikiPage, syncWikiLinks, markSourceIngested } from "../queries";
import { downloadRawClipping } from "../storage";
import { callLlm } from "../../llm/boundary";
import { materializeGraphFromPhase1 } from "../materialize";
import { embedAndStorePage } from "../embeddings";
import { getSupabaseClient } from "../../supabase/client";
import type { SourceRow } from "../types";

describe("profile import regeneration guard", () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(["batch-1", null, "", false])("an owned marker blocks regeneration even if its value is malformed: %p", (marker) => {
    expect(isProfileContextImportSource({ profile_context_import_id: marker })).toBe(true);
  });

  test.each([null, undefined, [], "profile_context_import_id", {}, { note: "profile_context_import_id" }])("ordinary or invalid frontmatter is not an import marker: %p", (frontmatter) => {
    expect(isProfileContextImportSource(frontmatter)).toBe(false);
  });

  test("an inherited property is not database frontmatter", () => {
    expect(isProfileContextImportSource(Object.create({ profile_context_import_id: "inherited" }))).toBe(false);
  });

  test.each(["phase1", "phase2"])("%s rejects a managed source before downloading, generating, or writing", async (phase) => {
    jest.mocked(getSource).mockResolvedValue({
      id: "source-1", user_id: "owner-a", title: "My selected story", kind: "self_knowledge",
      source_url: null, storage_path: "inline", tags: [], ingested: true,
      captured_at: "2026-10-09T00:00:00Z", ingested_at: "2026-10-09T00:00:00Z", simon_relevance: null,
      frontmatter: {
        profile_context_import_id: "batch-1", _body_fallback: "Already reviewed text.",
        __phase1__: { summary: "Old summary", entities: ["Person"], concepts: ["Concept"], questions: [], generated_at: "now", model: "old" },
      },
    } satisfies SourceRow);
    const run = phase === "phase1"
      ? runPhase1({ userId: "owner-a", sourceId: "source-1", locale: "en" })
      : generateSourcePage("owner-a", "source-1");
    await expect(run).rejects.toBeInstanceOf(SourceImportManagedError);
    expect(getSource).toHaveBeenCalledWith("owner-a", "source-1");
    expect(getSource).toHaveBeenCalledTimes(1);
    for (const sideEffect of [
      downloadRawClipping, callLlm, getWikiPage, upsertWikiPage, syncWikiLinks,
      markSourceIngested, materializeGraphFromPhase1, embedAndStorePage, getSupabaseClient,
    ]) expect(sideEffect).not.toHaveBeenCalled();
  });
});
