// 영역 화면이 pieceId 로 가리킨 조각을 읽는 길 (P1 · Simon 결정 2026-09-13 22:26).
//
// 이 읽기는 인가 게이트 대상이다 - 주소에는 누구든 아무 id 나 넣을 수 있다. 그래서 셋을 잰다:
//   1) 형식이 틀린 id 는 읽기 전에 버린다 - 주소 값을 받는 getPieceSummaryFromRoute 에서 DB 호출 수로 잰다
//   2) 읽기는 본인 행으로 좁힌다(명시적 user_id 필터 + owner RLS)
//   3) 가리키는 데 필요한 만큼만 읽는다 - 본문도, 스토리지의 원문 파일도 안 읽는다
import {
  getPieceSummary,
  getPieceSummaryFromRoute,
  parsePieceId,
  pieceIdFor,
  SOURCE_ID_PREFIX,
} from "../get-piece";

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

// 생성물 게이트 A1 (PR #1812, 2026-09-14): "형식이 틀린 pieceId 는 DB 에 닿지 않는다"가 화면 소스의
// 문자열 두 줄로만 지켜지고 있었다. 파싱 앞에 읽기를 끼워 넣어도 그 핀은 초록이었다. 그래서 그 순서를
// 주소 값을 받는 함수 하나에 두고, 여기서 DB 호출 수로 잰다. /star/[domain] 은 이 함수로만 읽는다.
describe("getPieceSummaryFromRoute - 주소의 값은 형식을 본 뒤에만 읽는다", () => {
  const MALFORMED: (string | string[] | undefined)[] = [
    undefined,
    "",
    "not-a-uuid",
    `${SOURCE_ID_PREFIX}not-a-uuid`,
    [],
    [`${UUID}?`, UUID],
    `${UUID}\n`,
  ];

  test("형식이 틀린 값은 null 이고 DB 를 한 번도 부르지 않는다 (DB 가 대답할 수 있어도)", async () => {
    // 읽으면 행이 돌아오게 해 둔다. 그래야 "안 물었다"와 "물었는데 없었다"가 갈린다.
    mockRow({
      data: { id: UUID, kind: "journal", topic: "오늘", created_at: "2026-09-13T10:00:00Z", tags: ["domain:career"] },
      error: null,
    });
    for (const value of MALFORMED) {
      const result = await getPieceSummaryFromRoute("user-1", value);
      expect({ value, result, from: from.mock.calls.length }).toEqual({ value, result: null, from: 0 });
    }
  });

  test("맞는 값은 그 표에서 본인 행으로 읽는다 (기록은 uuid, 조각은 src-<uuid>)", async () => {
    const recordChain = mockRow({
      data: { id: UUID, kind: "journal", topic: "오늘", created_at: "2026-09-13T10:00:00Z", tags: ["domain:career"] },
      error: null,
    });
    await expect(getPieceSummaryFromRoute("user-1", UUID)).resolves.toMatchObject({
      origin: "record",
      uuid: UUID,
      tags: ["domain:career"],
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("records");
    expect(recordChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(recordChain.eq).toHaveBeenCalledWith("id", UUID);

    from.mockClear();
    const sourceChain = mockRow({
      data: { id: UUID, kind: "memo", title: "읽은 글", captured_at: "2026-09-13T10:00:00Z", tags: [] },
      error: null,
    });
    // 같은 키가 두 번 오면 첫 값만 본다(parsePieceId 와 같다).
    await expect(
      getPieceSummaryFromRoute("user-1", [`${SOURCE_ID_PREFIX}${UUID}`, "junk"]),
    ).resolves.toMatchObject({ origin: "source", uuid: UUID });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("sources");
    expect(sourceChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(sourceChain.eq).toHaveBeenCalledWith("id", UUID);
  });

  test("읽기 실패는 그대로 던진다 (화면이 카드 없음으로 받는다)", async () => {
    mockRow({ data: null, error: new Error("offline") });
    await expect(getPieceSummaryFromRoute("user-1", UUID)).rejects.toThrow("offline");
  });
});
