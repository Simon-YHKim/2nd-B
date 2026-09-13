// 영역 화면이 pieceId 로 가리킨 조각을 읽는 길 (P1 · Simon 결정 2026-09-13 22:26).
//
// 이 읽기는 인가 게이트 대상이다 - 주소에는 누구든 아무 id 나 넣을 수 있다. 그래서 셋을 잰다:
//   1) 형식이 틀린 id 는 읽기 전에 버린다
//   2) 읽기는 본인 행으로 좁힌다(명시적 user_id 필터 + owner RLS)
//   3) 가리키는 데 필요한 만큼만 읽는다 - 본문도, 스토리지의 원문 파일도 안 읽는다
import { getPieceSummary, parsePieceId, pieceIdFor, SOURCE_ID_PREFIX } from "../get-piece";

const from = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: (...args: unknown[]) => from(...args) }),
}));
jest.mock("../create", () => ({
  getRecordById: jest.fn(),
}));

const UUID = "2b1f6c1e-8a55-4c1e-9f0e-6f1d2a3b4c5d";

function mockRow(result: { data: unknown; error: unknown }): Record<string, jest.Mock> {
  const chain: Record<string, jest.Mock> = {};
  for (const m of ["select", "eq"]) chain[m] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => result);
  from.mockReturnValue(chain);
  return chain;
}

afterEach(() => jest.clearAllMocks());

describe("parsePieceId - 읽기 전에 형식부터 본다", () => {
  test("uuid 는 기록 조각, src-<uuid> 는 소스 조각이다", () => {
    expect(parsePieceId(UUID)).toEqual({ origin: "record", uuid: UUID });
    expect(parsePieceId(`${SOURCE_ID_PREFIX}${UUID}`)).toEqual({ origin: "source", uuid: UUID });
  });

  test("같은 키가 두 번 오면 첫 값만 본다", () => {
    expect(parsePieceId([`${SOURCE_ID_PREFIX}${UUID}`, "junk"])).toEqual({
      origin: "source",
      uuid: UUID,
    });
  });

  test("형식이 틀리면 조각이 없다", () => {
    const bad: (string | string[] | null | undefined)[] = [
      undefined,
      null,
      "",
      [],
      SOURCE_ID_PREFIX,
      "not-a-uuid",
      `${UUID}x`,
      `${UUID};drop`,
      `${SOURCE_ID_PREFIX}${SOURCE_ID_PREFIX}${UUID}`,
      ["junk", UUID],
    ];
    for (const value of bad) {
      expect({ value, parsed: parsePieceId(value) }).toEqual({ value, parsed: null });
    }
  });
});

describe("pieceIdFor - 경로에 싣는 id", () => {
  test("소스는 src- 를 붙이고, 이미 붙어 있으면 그대로 둔다", () => {
    expect(pieceIdFor(UUID, "source")).toBe(`${SOURCE_ID_PREFIX}${UUID}`);
    expect(pieceIdFor(`${SOURCE_ID_PREFIX}${UUID}`, "source")).toBe(`${SOURCE_ID_PREFIX}${UUID}`);
  });

  test("기록은 id 그대로다", () => {
    expect(pieceIdFor(UUID, "record")).toBe(UUID);
  });

  test("parsePieceId 와 짝이 맞는다", () => {
    expect(parsePieceId(pieceIdFor(UUID, "source"))).toEqual({ origin: "source", uuid: UUID });
    expect(parsePieceId(pieceIdFor(UUID, "record"))).toEqual({ origin: "record", uuid: UUID });
  });
});

describe("getPieceSummary - 본인 행만, 가리키는 데 필요한 만큼만", () => {
  test("소스는 sources 에서 본인 행으로 좁혀 읽고 원문 파일은 안 받는다", async () => {
    const chain = mockRow({
      data: {
        id: UUID,
        kind: "memo",
        title: "오늘 읽은 글",
        captured_at: "2026-09-13T10:00:00Z",
        tags: ["domain:career"],
      },
      error: null,
    });

    await expect(getPieceSummary("user-1", { origin: "source", uuid: UUID })).resolves.toEqual({
      origin: "source",
      uuid: UUID,
      kind: "memo",
      title: "오늘 읽은 글",
      created_at: "2026-09-13T10:00:00Z",
      tags: ["domain:career"],
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("sources");
    expect(chain.select).toHaveBeenCalledWith("id, kind, title, captured_at, tags");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.eq).toHaveBeenCalledWith("id", UUID);
  });

  test("기록은 records 에서 본인 행으로 좁혀 읽고 본문은 안 읽는다", async () => {
    const chain = mockRow({
      data: { id: UUID, kind: "journal", topic: null, created_at: "2026-09-12T10:00:00Z", tags: null },
      error: null,
    });

    await expect(getPieceSummary("user-1", { origin: "record", uuid: UUID })).resolves.toEqual({
      origin: "record",
      uuid: UUID,
      kind: "journal",
      title: null,
      created_at: "2026-09-12T10:00:00Z",
      tags: [],
    });
    expect(from).toHaveBeenCalledWith("records");
    expect(chain.select).toHaveBeenCalledWith("id, kind, topic, created_at, tags");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.eq).toHaveBeenCalledWith("id", UUID);
  });

  test("본인 행이 아니면(RLS 로 안 보이면) 없는 조각과 같다", async () => {
    mockRow({ data: null, error: null });
    await expect(getPieceSummary("user-1", { origin: "source", uuid: UUID })).resolves.toBeNull();
  });

  test("읽기 실패는 부른 쪽이 알 수 있게 던진다", async () => {
    mockRow({ data: null, error: new Error("offline") });
    await expect(getPieceSummary("user-1", { origin: "record", uuid: UUID })).rejects.toThrow(
      "offline",
    );
  });
});
