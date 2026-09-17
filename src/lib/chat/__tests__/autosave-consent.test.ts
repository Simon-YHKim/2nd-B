// 대화 자동 저장 동의는 계정에 산다 - 먼저 나간 읽기가 늦게 와도 나중 관측을 덮지 못한다 (PR #1814 재설계 C1, 2026-09-16).
//
// 대화 화면이 동의를 ref 넷으로 들고 있을 때 틈이 차례로 났다.
//   · r3as2 R2-M1: 복귀 읽기가 옛 꺼짐을 들고 늦게 도착해, 그 사이 설정에서 켠 저장 소식을 덮었다.
//     못 읽은 복귀 읽기를 꺼짐으로 적어 켜 둔 사용자를 꺼짐에 가두기도 했다.
//   · r3as3 R3AS3-M1: 담기 직전 서버 확인이 켜짐을 읽어도 개정 번호를 올리지 않아, 먼저 나간 복귀 읽기의
//     옛 꺼짐이 그 켜짐을 덮었다.
//
// 여기서는 저장소(src/lib/chat/autosave-consent.ts)를 직접 구동한다. 읽기는 실제 readPrivacyPrefs 이고 DB 만
// 목이다. 목은 **호출된 순간의 서버 값**을 읽고, 응답은 풀어 줄 때까지 돌려주지 않는다 - 그래야 "옛 값을 들고
// 늦게 도착한 응답" 을 만들 수 있다. 늦은 응답마다 정말 옛 값을 싣고 왔는지 먼저 단언한다. 목이 관대해서
// 초록인 것이 아니라는 증거다.

const mockServer = {
  prefs: new Map<string, Record<string, unknown>>(),
  failReads: false,
  holdNext: 0,
  held: [] as Array<() => void>,
};

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "users") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => {
              // 서버는 호출된 순간의 값을 읽는다. 응답이 늦는 것은 그 뒤의 대기로 만든다.
              const row = mockServer.prefs.get(id);
              const response = mockServer.failReads
                ? { data: null, error: { message: "read failed" } }
                : { data: row ? { privacy_prefs: structuredClone(row) } : null, error: null };
              if (mockServer.holdNext > 0) {
                mockServer.holdNext -= 1;
                await new Promise<void>((release) => mockServer.held.push(release));
              }
              return response;
            },
          }),
        }),
      };
    },
  }),
}));

import { __resetAccountEpochForTests, beginAccountOwnerTransition, noteResolvedOwner } from "../../auth/account-epoch";
import { publishPrivacyPrefsSaved } from "../../privacy/pref-changes";
import { resolvePrivacyPrefs } from "../../privacy/prefs";
import { readPrivacyPrefs, type PrivacyPrefsRead } from "../../supabase/privacy";
import {
  __resetAutosaveConsentForTests,
  autosaveConsentFor,
  beginAutosaveConsentRead,
  finishAutosaveConsentRead,
  type AutosaveConsentRead,
} from "../autosave-consent";

const OWNER = "user-a";
const OTHER = "user-b";

beforeEach(() => {
  __resetAccountEpochForTests();
  __resetAutosaveConsentForTests();
  noteResolvedOwner(OWNER);
  mockServer.prefs = new Map([
    [OWNER, { chat_autosave: false }],
    [OTHER, { chat_autosave: false }],
  ]);
  mockServer.failReads = false;
  mockServer.holdNext = 0;
  mockServer.held = [];
});

/** 서버 값을 바꾼다. 소식이나 읽기가 이 값을 가져간다. */
function serverSays(ownerId: string, chatAutosave: boolean): void {
  mockServer.prefs.set(ownerId, { chat_autosave: chatAutosave });
}

/** 설정 화면의 저장이 확정됐을 때 같은 앱에 오는 소식 (pref-changes). */
function savedNews(ownerId: string, chatAutosave: boolean): void {
  publishPrivacyPrefsSaved(ownerId, resolvePrivacyPrefs({ chat_autosave: chatAutosave }));
}

/** 읽기 하나를 끝까지 돌린다: 보내기 전에 순번을 받고, 서버를 읽고, 결과를 넘긴다. 반영됐으면 true. */
async function readNow(ownerId: string): Promise<boolean> {
  const read = beginAutosaveConsentRead(ownerId);
  return finishAutosaveConsentRead(read, await readPrivacyPrefs(ownerId));
}

/** 서버는 지금 값을 읽었는데 응답은 arrive() 전까지 돌아오지 않는 읽기. 순번은 보내기 전에 받는다. */
function slowRead(ownerId: string): { token: AutosaveConsentRead; arrive: () => Promise<PrivacyPrefsRead> } {
  const token = beginAutosaveConsentRead(ownerId);
  mockServer.holdNext += 1;
  const response = readPrivacyPrefs(ownerId);
  const release = mockServer.held.shift();
  if (!release) throw new Error("읽기가 서버에 닿지 않았다 - 목의 대기가 걸리지 않았다");
  return {
    token,
    arrive: () => {
      release();
      return response;
    },
  };
}

describe("대화 자동 저장 동의 저장소 - 순번 · 세대 · 계정", () => {
  test("(a) 옛 꺼짐을 들고 늦게 온 복귀 읽기는 그 사이 도착한 켜짐 저장 소식을 덮지 못한다 (R2-M1)", async () => {
    expect(await readNow(OWNER)).toBe(true);
    const off = autosaveConsentFor(OWNER);
    expect(off.value).toBe(false);

    const back = slowRead(OWNER); // 화면에 돌아와 다시 읽는다. 서버는 아직 꺼짐이다
    serverSays(OWNER, true);
    savedNews(OWNER, true); // 그 사이 설정에서 켠 저장이 확정됐다
    const on = autosaveConsentFor(OWNER);
    expect(on).toEqual({ value: true, generation: off.generation + 1 });

    const late = await back.arrive();
    expect(late).toMatchObject({ ok: true, prefs: { chat_autosave: false } }); // 정말 옛 꺼짐을 싣고 왔다
    expect(finishAutosaveConsentRead(back.token, late)).toBe(false);
    expect(autosaveConsentFor(OWNER)).toEqual(on);
  });

  test("(b) 먼저 나간 복귀 읽기의 옛 꺼짐은 나중에 나간 담기 직전 서버 확인의 켜짐을 덮지 못한다 (R3AS3-M1)", async () => {
    expect(await readNow(OWNER)).toBe(true);
    const off = autosaveConsentFor(OWNER);
    expect(off.value).toBe(false);

    const back = slowRead(OWNER); // 복귀 읽기가 먼저 나갔다. 서버는 아직 꺼짐이다
    serverSays(OWNER, true); // 다른 기기에서 켰다
    const check = beginAutosaveConsentRead(OWNER); // 담기 직전 서버 확인은 나중에 나가 먼저 돌아온다
    const fresh = await readPrivacyPrefs(OWNER);
    expect(fresh).toMatchObject({ ok: true, prefs: { chat_autosave: true } });
    expect(finishAutosaveConsentRead(check, fresh)).toBe(true); // 확인이 읽은 켜짐도 관측이다
    const on = autosaveConsentFor(OWNER);
    expect(on).toEqual({ value: true, generation: off.generation + 1 });

    const late = await back.arrive();
    expect(late).toMatchObject({ ok: true, prefs: { chat_autosave: false } }); // 정말 옛 꺼짐을 싣고 왔다
    expect(finishAutosaveConsentRead(back.token, late)).toBe(false);
    expect(autosaveConsentFor(OWNER)).toEqual(on);
  });

  test("(c) 읽기 실패는 관측이 아니다: 모름은 모름 그대로, 켜짐은 켜짐 그대로이고 세대도 오르지 않는다 (R2-M1)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      mockServer.failReads = true;
      const unknown = autosaveConsentFor(OWNER);
      expect(unknown.value).toBeNull(); // 한 번도 못 읽었다
      expect(await readNow(OWNER)).toBe(false);
      expect(autosaveConsentFor(OWNER)).toEqual(unknown); // 못 읽은 것을 꺼짐으로 적지 않는다

      mockServer.failReads = false;
      serverSays(OWNER, true);
      expect(await readNow(OWNER)).toBe(true);
      const on = autosaveConsentFor(OWNER);
      expect(on).toEqual({ value: true, generation: unknown.generation + 1 });

      mockServer.failReads = true;
      const read = beginAutosaveConsentRead(OWNER);
      const failed = await readPrivacyPrefs(OWNER);
      expect(failed).toEqual({ ok: false });
      expect(finishAutosaveConsentRead(read, failed)).toBe(false);
      expect(autosaveConsentFor(OWNER)).toEqual(on); // 켜 둔 사용자를 복귀 한 번에 꺼짐에 가두지 않는다
    } finally {
      warn.mockRestore();
    }
  });

  test("(d) 세대는 값이 바뀔 때만 오른다: 같은 값을 다시 보면 그대로, 켜짐 -> 꺼짐 -> 켜짐은 +2", async () => {
    serverSays(OWNER, true);
    expect(await readNow(OWNER)).toBe(true);
    const on = autosaveConsentFor(OWNER);
    expect(on.value).toBe(true);

    expect(await readNow(OWNER)).toBe(true); // 같은 켜짐을 읽기로 다시 봤다
    savedNews(OWNER, true); // 같은 켜짐을 소식으로 다시 봤다
    expect(autosaveConsentFor(OWNER)).toEqual(on);

    serverSays(OWNER, false);
    savedNews(OWNER, false); // 끔
    expect(autosaveConsentFor(OWNER)).toEqual({ value: false, generation: on.generation + 1 });
    expect(await readNow(OWNER)).toBe(true); // 같은 꺼짐을 다시 봤다
    expect(autosaveConsentFor(OWNER)).toEqual({ value: false, generation: on.generation + 1 });

    serverSays(OWNER, true);
    expect(await readNow(OWNER)).toBe(true); // 다시 켬
    expect(autosaveConsentFor(OWNER)).toEqual({ value: true, generation: on.generation + 2 });
  });

  test("(e) 계정이 바뀌면 모름이다: 전환이 시작되기만 해도 비우고, 돌아온 계정에도 옛 켜짐과 옛 읽기를 되살리지 않는다", async () => {
    serverSays(OWNER, true);
    serverSays(OTHER, true);
    expect(await readNow(OWNER)).toBe(true);
    const aOn = autosaveConsentFor(OWNER);
    expect(aOn.value).toBe(true);
    const inflight = slowRead(OWNER); // A 의 읽기가 켜짐을 싣고 대기 중이다

    beginAccountOwnerTransition(OTHER); // B 세션을 봤다. A 는 아직 공개된 계정이지만 전환 hold 가 시작됐다
    expect(autosaveConsentFor(OWNER).value).toBeNull();

    noteResolvedOwner(OTHER);
    expect(autosaveConsentFor(OTHER).value).toBeNull(); // A 의 켜짐이 B 에게 넘어가지 않는다
    savedNews(OWNER, true); // A 의 늦은 저장 소식
    expect(autosaveConsentFor(OTHER).value).toBeNull();
    expect(autosaveConsentFor(OWNER).value).toBeNull(); // 공개되지 않은 계정의 값은 모름이다

    noteResolvedOwner(OWNER); // 다시 A
    expect(autosaveConsentFor(OWNER).value).toBeNull(); // 옛 켜짐을 되살리지 않는다
    const late = await inflight.arrive();
    expect(late).toMatchObject({ ok: true, prefs: { chat_autosave: true } }); // 정말 켜짐을 싣고 왔다
    expect(finishAutosaveConsentRead(inflight.token, late)).toBe(false); // 전환 전에 나간 읽기다
    const back = autosaveConsentFor(OWNER);
    expect(back.value).toBeNull();
    expect(back.generation).toBeGreaterThan(aOn.generation);

    expect(await readNow(OWNER)).toBe(true); // 돌아온 뒤 새로 나간 읽기가 채운다
    expect(autosaveConsentFor(OWNER)).toEqual({ value: true, generation: back.generation + 1 });
  });
});
