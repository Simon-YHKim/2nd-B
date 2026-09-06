import { __setSupabaseClientForTests } from "../client";
import {
  createProcessingLogWindow,
  listProcessingLogPage,
  normalizeProcessingLogModel,
  normalizeProcessingLogProvider,
  normalizeProcessingLogPurpose,
  PROCESSING_LOG_PAGE_SIZE,
  PROCESSING_LOG_SELECT,
} from "../audit-reader";

describe("개인정보 처리 기록 reader", () => {
  function installReaderClient(...results: Array<{ data: unknown[] | null; error: unknown }>) {
    const builder = {
      select: jest.fn(),
      eq: jest.fn(),
      gte: jest.fn(),
      lte: jest.fn(),
      order: jest.fn(),
      range: jest.fn(),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.gte.mockReturnValue(builder);
    builder.lte.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    let resultIndex = 0;
    builder.range.mockImplementation(() => Promise.resolve(
      results[resultIndex++] ?? results[results.length - 1],
    ));
    const from = jest.fn().mockReturnValue(builder);
    __setSupabaseClientForTests({ from } as never);
    return { from, ...builder };
  }

  afterEach(() => {
    __setSupabaseClientForTests(null);
  });

  it("7일 고정 창을 사용자별로 50건씩 읽고 내부 필드는 조회하지 않는다", async () => {
    const now = Date.parse("2026-09-01T12:00:00.000Z");
    const window = createProcessingLogWindow(now);
    const data = Array.from({ length: PROCESSING_LOG_PAGE_SIZE + 1 }, (_, index) => ({
      id: `row-${index}`,
      created_at: new Date(now - index * 1000).toISOString(),
      purpose: index === 0 ? "secondb_chat" : "future_internal_purpose",
      reasoning_vendor: index === 0 ? "openai" : "unexpected-vendor",
      model_used: index === 0 ? "gpt-5.6+refusal" : "mock:gemini-2.5-flash",
    }));
    const query = installReaderClient({ data, error: null });

    const page = await listProcessingLogPage({ userId: "user-1", window });
    expect(page).toMatchObject({
      rows: expect.arrayContaining([
        expect.objectContaining({
          id: "row-0",
          purpose: "conversation",
          provider: "openai",
          model: "gpt-5.6",
        }),
        expect.objectContaining({
          id: "row-1",
          purpose: "other",
          provider: null,
          model: null,
        }),
      ]),
      hasMore: true,
      nextOffset: PROCESSING_LOG_PAGE_SIZE,
    });
    expect(page.rows).toHaveLength(PROCESSING_LOG_PAGE_SIZE);
    expect(page.rows.some((row) => row.id === `row-${PROCESSING_LOG_PAGE_SIZE}`)).toBe(false);

    expect(window).toEqual({
      sinceIso: "2026-08-25T12:00:00.000Z",
      untilIso: "2026-09-01T12:00:00.000Z",
    });
    expect(query.from).toHaveBeenCalledWith("ai_audit_log");
    expect(query.select).toHaveBeenCalledWith(PROCESSING_LOG_SELECT);
    expect(PROCESSING_LOG_SELECT.split(/,\s*/)).toEqual([
      "id",
      "created_at",
      "purpose",
      "reasoning_vendor",
      "model_used",
    ]);
    for (const forbidden of ["prompt_hash", "output_hash", "key_combo", "user_id", "vertex_backend"]) {
      expect(PROCESSING_LOG_SELECT).not.toContain(forbidden);
    }
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.gte).toHaveBeenCalledWith("created_at", window.sinceIso);
    expect(query.lte).toHaveBeenCalledWith("created_at", window.untilIso);
    expect(query.order.mock.calls).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(query.range).toHaveBeenCalledWith(0, PROCESSING_LOG_PAGE_SIZE);
  });

  it("페이지 오류를 숨기지 않고 호출자에게 전달하며 잘못된 범위를 거부한다", async () => {
    const dbError = { code: "42501", message: "row level security" };
    const query = installReaderClient({ data: null, error: dbError });
    const window = createProcessingLogWindow(0);

    await expect(listProcessingLogPage({ userId: "user-1", window, offset: 50 })).rejects.toBe(dbError);
    expect(query.range).toHaveBeenCalledWith(50, 50 + PROCESSING_LOG_PAGE_SIZE);
    await expect(listProcessingLogPage({ userId: "   ", window })).rejects.toThrow("user id");
    await expect(listProcessingLogPage({ userId: "user-1", window, offset: -1 })).rejects.toThrow("offset");
    expect(() => createProcessingLogWindow(Number.NaN)).toThrow("clock");
  });

  it("look-ahead 행을 다음 페이지 첫 행으로 이어 받아 마지막까지 중복 없이 읽는다", async () => {
    const window = createProcessingLogWindow(Date.parse("2026-09-01T12:00:00.000Z"));
    const allRows = Array.from({ length: 62 }, (_, index) => ({
      id: `paged-${index}`,
      created_at: new Date(Date.parse(window.untilIso) - index * 1000).toISOString(),
      purpose: "source_ingest",
      reasoning_vendor: "gemini",
      model_used: "gemini-2.5-flash",
    }));
    const query = installReaderClient(
      { data: allRows.slice(0, PROCESSING_LOG_PAGE_SIZE + 1), error: null },
      { data: allRows.slice(PROCESSING_LOG_PAGE_SIZE), error: null },
    );

    const first = await listProcessingLogPage({ userId: "user-1", window });
    const second = await listProcessingLogPage({
      userId: "user-1",
      window,
      offset: first.nextOffset,
    });
    const combined = [...first.rows, ...second.rows];

    expect(first).toMatchObject({ hasMore: true, nextOffset: 50 });
    expect(second).toMatchObject({ hasMore: false, nextOffset: 62 });
    expect(combined).toHaveLength(62);
    expect(new Set(combined.map((row) => row.id)).size).toBe(62);
    expect(query.range.mock.calls).toEqual([[0, 50], [50, 100]]);
  });

  it("purpose·provider·model 자유문자열을 화면용 allowlist로 축소한다", () => {
    expect(normalizeProcessingLogPurpose("safety_classify")).toBe("safety");
    expect(normalizeProcessingLogPurpose("old_internal_label")).toBe("other");
    expect(normalizeProcessingLogProvider("GEMINI")).toBe("google-gemini");
    expect(normalizeProcessingLogProvider("xai")).toBe("xai");
    expect(normalizeProcessingLogProvider("internal-router")).toBeNull();
    expect(normalizeProcessingLogModel("claude-opus-4-1+truncated", "anthropic-claude")).toBe("claude-opus-4-1");
    expect(normalizeProcessingLogModel("grok-4-1-fast-reasoning+refusal", "xai")).toBe("grok-4-1-fast-reasoning");
    expect(normalizeProcessingLogModel("gpt-private-tenant-x", null)).toBeNull();
    expect(normalizeProcessingLogModel("gpt-5.6", "google-gemini")).toBeNull();
    expect(normalizeProcessingLogModel("mock:gemini-2.5-flash", "google-gemini")).toBeNull();
    expect(normalizeProcessingLogModel("none-crisis-routed", "openai")).toBeNull();
  });
});
