// R4 (기술 흐름 정합성) — 계정 삭제 응답 유실.
//
// `delete-account` 는 세 값을 돌려준다 (supabase/functions/delete-account/index.ts:172):
//     { deleted, profile_erased, raw_clippings_erased }
// 뒤의 둘은 각각 프로필 안전망과 raw-clippings Storage 정리가 **끝났는지**를 말한다.
// 서버는 둘을 true 로 시작해 해당 정리가 실패하면 false 로 내린다(:128-169).
//
// 그런데 `requestAccountDeletion()` 은 `Promise<void>` 라서 그 둘을 읽고 버렸다.
// 그래서 두 호출부(src/app/account.tsx:136, DeepSpaceDesignScreens.tsx:643)는
// "계정은 지워졌지만 Storage 정리가 실패한 부분 완료" 를 "완전 성공" 과 구분하지
// 못한다. 사용자에게는 똑같이 삭제 완료로 보이고, 남은 객체가 있다는 사실이
// 아무 데도 남지 않는다.
//
// 그리고 없는 값과 false 를 구분해야 한다. 원장 규율 그대로다 —
// "후속 false 는 잔존 개수 확정이 아닌 미확인". 구버전 함수가 필드를 안 보내면
// 그건 **모름(null)** 이지 **정리 안 됨(false)** 이 아니다. 둘을 같게 만들면
// 멀쩡한 삭제를 실패로 보고하게 된다.

jest.mock("../../supabase/client", () => {
  const invoke = jest.fn().mockResolvedValue({ data: { deleted: true }, error: null });
  const mock = { from: jest.fn(), functions: { invoke } };
  return {
    getSupabaseClient: () => mock,
    __invoke: invoke,
    __reset: () => invoke.mockClear(),
  };
});

import { requestAccountDeletion } from "../delete-bulk";

const clientMock = require("../../supabase/client") as {
  __invoke: jest.Mock;
  __reset: () => void;
};

function serverSays(data: unknown) {
  clientMock.__invoke.mockResolvedValueOnce({ data, error: null });
}

describe("requestAccountDeletion returns a deletion receipt", () => {
  beforeEach(() => clientMock.__reset());

  test("a fully clean deletion reports both cleanups as done", async () => {
    serverSays({ deleted: true, profile_erased: true, raw_clippings_erased: true });
    const receipt = await requestAccountDeletion();
    expect(receipt.deleted).toBe(true);
    expect(receipt.profileErased).toBe(true);
    expect(receipt.rawClippingsErased).toBe(true);
    expect(receipt.complete).toBe(true);
  });

  test("a partial completion is distinguishable and does NOT throw", async () => {
    // The account IS gone — auth.users was deleted and the cascade ran. Only the
    // Storage sweep failed. Throwing here would tell the user deletion failed
    // when it did not, and would offer a destructive retry on a dead account.
    serverSays({ deleted: true, profile_erased: true, raw_clippings_erased: false });
    const receipt = await requestAccountDeletion();
    expect(receipt.deleted).toBe(true);
    expect(receipt.rawClippingsErased).toBe(false);
    expect(receipt.complete).toBe(false);
    expect(receipt.incomplete).toEqual(["rawClippings"]);
  });

  test("a failed profile safety net is reported on its own axis", async () => {
    serverSays({ deleted: true, profile_erased: false, raw_clippings_erased: true });
    const receipt = await requestAccountDeletion();
    expect(receipt.profileErased).toBe(false);
    expect(receipt.incomplete).toEqual(["profile"]);
  });

  test("both failing are both reported", async () => {
    serverSays({ deleted: true, profile_erased: false, raw_clippings_erased: false });
    const receipt = await requestAccountDeletion();
    expect(receipt.incomplete).toEqual(["profile", "rawClippings"]);
    expect(receipt.complete).toBe(false);
  });

  test("a missing field is unknown (null), never a reported failure", async () => {
    // An older deployed function returns { deleted: true } alone. Reading that
    // as false would report a residual that was never observed.
    serverSays({ deleted: true });
    const receipt = await requestAccountDeletion();
    expect(receipt.profileErased).toBeNull();
    expect(receipt.rawClippingsErased).toBeNull();
    expect(receipt.incomplete).toEqual([]);
    // Unknown is not "complete" either — nothing confirmed the sweeps.
    expect(receipt.complete).toBe(false);
    expect(receipt.unconfirmed).toEqual(["profile", "rawClippings"]);
  });

  test("a non-boolean value is treated as unknown, not as failure", async () => {
    serverSays({ deleted: true, profile_erased: "yes", raw_clippings_erased: 0 });
    const receipt = await requestAccountDeletion();
    expect(receipt.profileErased).toBeNull();
    expect(receipt.rawClippingsErased).toBeNull();
    expect(receipt.incomplete).toEqual([]);
  });

  test("the receipt carries the moment the client observed the outcome", async () => {
    serverSays({ deleted: true, profile_erased: true, raw_clippings_erased: true });
    const receipt = await requestAccountDeletion();
    expect(typeof receipt.observedAtIso).toBe("string");
    expect(Number.isNaN(Date.parse(receipt.observedAtIso))).toBe(false);
  });

  test("still throws when terminal erasure is not confirmed", async () => {
    serverSays({ deleted: false, profile_erased: true, raw_clippings_erased: true });
    await expect(requestAccountDeletion()).rejects.toBeDefined();
  });

  test("still throws on a transport error", async () => {
    clientMock.__invoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(requestAccountDeletion()).rejects.toBeDefined();
  });
});
