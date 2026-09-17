// 끄기는 누른 순간, 켜기는 확정된 순간 (PR #1814 재설계 C2, 2026-09-16).
//
// savePrivacyPref 는 읽고(왕복 1) 쓴 뒤(왕복 2)에야 확정 소식을 보낸다. 그 두 왕복 사이에 대화 화면의 담기 직전
// 서버 확인은 아직 커밋 전인 켜짐을 읽을 수 있고, 그러면 철회한 사용자의 대화가 저장된다(설계 §8 R8 · §3-3 N2).
// 그래서 저장은 첫 왕복 **전에** 의도를 알리고, 끝나면 확정이나 실패 중 하나를 알린다. 대화 자동 저장 동의
// 저장소(src/lib/chat/autosave-consent.ts)는 끄기 의도를 받는 즉시 꺼짐으로 반영하고, 켜기는 확정 소식에서만
// 반영한다.
//
// 저장 함수와 저장소는 진짜고 DB 만 목이다. 목은 **상태를 가진다**: 읽기는 요청된 순간의 서버 값을 싣고, 읽기와
// 쓰기를 각각 붙잡을 수 있으며, 쓰기는 풀린 뒤에야 커밋된다. 그래서 "첫 읽기가 붙잡힌 동안" 과 "쓰기가 커밋되기
// 전에 나간 읽기" 를 그대로 만들 수 있다. 붙잡힌 순간마다 서버가 아직 켜짐인지 먼저 단언한다.

type MockLedgerRow = { user_id: string; pref_key: string; event_type: string };

const mockDb = {
  prefs: new Map<string, Record<string, unknown>>(),
  ledger: [] as MockLedgerRow[],
  failRead: false,
  failUpdate: false,
  holdReads: 0,
  heldReads: [] as Array<() => void>,
  holdUpdates: 0,
  heldUpdates: [] as Array<() => void>,
};

jest.mock("../client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => {
                // 서버는 요청된 순간의 값을 읽는다. 응답이 늦는 것은 그 뒤의 대기로 만든다.
                const response = mockDb.failRead
                  ? { data: null, error: new Error("read failed") }
                  : {
                      data: mockDb.prefs.has(id) ? { privacy_prefs: structuredClone(mockDb.prefs.get(id)) } : null,
                      error: null,
                    };
                if (mockDb.holdReads > 0) {
                  mockDb.holdReads -= 1;
                  await new Promise<void>((release) => mockDb.heldReads.push(release));
                }
                return response;
              },
            }),
          }),
          update: (patch: { privacy_prefs: Record<string, unknown> }) => ({
            eq: async (_column: string, id: string) => {
              // 쓰기는 풀린 뒤에 커밋된다. 붙잡힌 동안의 읽기는 옛 값을 본다.
              if (mockDb.holdUpdates > 0) {
                mockDb.holdUpdates -= 1;
                await new Promise<void>((release) => mockDb.heldUpdates.push(release));
              }
              if (mockDb.failUpdate) return { error: new Error("update failed") };
              mockDb.prefs.set(id, structuredClone(patch.privacy_prefs));
              return { error: null };
            },
          }),
        };
      }
      if (table === "consent_changes") {
        return {
          insert: async (rows: MockLedgerRow[]) => {
            mockDb.ledger.push(...rows);
            return { error: null };
          },
        };
      }
      if (table === "consent_records") return { insert: async () => ({ error: null }) };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
import {
  __resetAutosaveConsentForTests,
  autosaveConsentFor,
  beginAutosaveConsentRead,
  finishAutosaveConsentRead,
  type AutosaveConsent,
} from "../../chat/autosave-consent";
import { defaultPrivacyPrefs } from "../../privacy/prefs";
import { readPrivacyPrefs, savePrivacyPref, savePrivacyPrefs } from "../privacy";

const OWNER = "user-a";

beforeEach(() => {
  __resetAccountEpochForTests();
  __resetAutosaveConsentForTests();
  noteResolvedOwner(OWNER);
  mockDb.prefs = new Map([[OWNER, { chat_autosave: true, ads: false }]]);
  mockDb.ledger = [];
  mockDb.failRead = false;
  mockDb.failUpdate = false;
  mockDb.holdReads = 0;
  mockDb.heldReads = [];
  mockDb.holdUpdates = 0;
  mockDb.heldUpdates = [];
});

function releaseOne(held: Array<() => void>): void {
  const release = held.shift();
  if (!release) throw new Error("붙잡힌 요청이 없다");
  release();
}

/** 약속 사슬이 한 걸음씩 나아가게 두고, 조건이 설 때까지 기다린다. */
async function until(condition: () => boolean, what: string): Promise<void> {
  for (let step = 0; step < 50 && !condition(); step += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!condition()) throw new Error(`${what} 에 닿지 못했다`);
}

/** 대화 화면이 하는 읽기 하나: 나가기 전에 순번을 받고, 서버를 읽고, 결과를 넘긴다. 반영됐으면 true. */
async function chatReads(): Promise<boolean> {
  const read = beginAutosaveConsentRead(OWNER);
  return finishAutosaveConsentRead(read, await readPrivacyPrefs(OWNER));
}

/** 저장소가 서버의 지금 값을 알고 있는 상태로 만든다. */
async function known(expected: boolean): Promise<AutosaveConsent> {
  expect(await chatReads()).toBe(true);
  const consent = autosaveConsentFor(OWNER);
  expect(consent.value).toBe(expected);
  return consent;
}

describe("동의 저장은 첫 왕복 전에 철회를 알린다", () => {
  test("왕복 중 철회: 끄기의 첫 읽기가 붙잡혀 있는 동안 저장소는 이미 꺼짐이고 세대가 +1 이다", async () => {
    const on = await known(true);

    mockDb.holdReads = 1;
    const saving = savePrivacyPref(OWNER, "chat_autosave", false);
    expect(mockDb.heldReads).toHaveLength(1); // 첫 읽기가 서버에 닿아 붙잡혀 있다
    expect(mockDb.prefs.get(OWNER)).toEqual({ chat_autosave: true, ads: false }); // 서버는 아직 켜짐이다
    expect(autosaveConsentFor(OWNER)).toEqual({ value: false, generation: on.generation + 1 });

    releaseOne(mockDb.heldReads);
    await expect(saving).resolves.toMatchObject({ chat_autosave: false });
    expect(mockDb.prefs.get(OWNER)).toEqual({ chat_autosave: false, ads: false });
    expect(mockDb.ledger).toEqual([{ user_id: OWNER, pref_key: "chat_autosave", event_type: "revoke" }]);
    expect(autosaveConsentFor(OWNER)).toEqual({ value: false, generation: on.generation + 1 }); // 확정 소식은 같은 값이다
  });

  test("철회가 왕복 중일 때 그 뒤에 나간 읽기가 커밋 전의 켜짐을 읽어도 저장소를 다시 켜지 못한다", async () => {
    const on = await known(true);

    mockDb.holdUpdates = 1;
    const saving = savePrivacyPref(OWNER, "chat_autosave", false);
    await until(() => mockDb.heldUpdates.length === 1, "끄기의 UPDATE");
    const withdrawn = autosaveConsentFor(OWNER);
    expect(withdrawn).toEqual({ value: false, generation: on.generation + 1 });

    // 대화 화면이 다시 읽는다(복귀 읽기나 담기 직전 서버 확인). 끄기 의도보다 나중에 나갔지만 커밋 전이다.
    const read = beginAutosaveConsentRead(OWNER);
    const stale = await readPrivacyPrefs(OWNER);
    expect(stale).toMatchObject({ ok: true, prefs: { chat_autosave: true } }); // 정말 커밋 전의 켜짐을 읽었다
    expect(finishAutosaveConsentRead(read, stale)).toBe(false);
    expect(autosaveConsentFor(OWNER)).toEqual(withdrawn);

    releaseOne(mockDb.heldUpdates);
    await saving;
    expect(autosaveConsentFor(OWNER)).toEqual(withdrawn);

    // 철회가 확정되면 막음이 걷힌다. 그 뒤 다른 기기에서 다시 켠 값은 읽기로 반영된다.
    mockDb.prefs.set(OWNER, { chat_autosave: true, ads: false });
    expect(await chatReads()).toBe(true);
    expect(autosaveConsentFor(OWNER)).toEqual({ value: true, generation: withdrawn.generation + 1 });
  });

  test("켜기는 확정에서만: 켜기 저장이 왕복 중인 동안 저장소는 그대로이고, 커밋된 뒤에 켜짐이 된다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: false, ads: false });
    const off = await known(false);

    mockDb.holdUpdates = 1;
    const saving = savePrivacyPref(OWNER, "chat_autosave", true);
    expect(autosaveConsentFor(OWNER)).toEqual(off); // 누른 순간
    await until(() => mockDb.heldUpdates.length === 1, "켜기의 UPDATE");
    expect(mockDb.prefs.get(OWNER)).toEqual({ chat_autosave: false, ads: false }); // 서버는 아직 꺼짐이다
    expect(autosaveConsentFor(OWNER)).toEqual(off); // 읽기가 돌아오고 쓰기가 나간 뒤에도 커밋 전에는 그대로

    releaseOne(mockDb.heldUpdates);
    await saving;
    expect(autosaveConsentFor(OWNER)).toEqual({ value: true, generation: off.generation + 1 });
  });

  test("저장 실패 -> 모름: 끄기의 UPDATE 가 실패하면 커밋됐는지 모르므로 모름이고, 다음 읽기가 채운다", async () => {
    const on = await known(true);

    mockDb.failUpdate = true;
    await expect(savePrivacyPref(OWNER, "chat_autosave", false)).rejects.toThrow("update failed");
    const unknown = autosaveConsentFor(OWNER);
    expect(unknown.value).toBeNull();
    expect(unknown.generation).toBeGreaterThan(on.generation);

    mockDb.failUpdate = false; // 서버는 켜짐 그대로다
    expect(await chatReads()).toBe(true);
    expect(autosaveConsentFor(OWNER)).toEqual({ value: true, generation: unknown.generation + 1 });
  });

  test("저장 실패 -> 모름: 켜기의 첫 읽기가 실패해도 모름이다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: false, ads: false });
    await known(false);

    mockDb.failRead = true;
    await expect(savePrivacyPref(OWNER, "chat_autosave", true)).rejects.toThrow("read failed");
    expect(autosaveConsentFor(OWNER).value).toBeNull();
  });

  test("전체 저장 savePrivacyPrefs 도 대화 저장이 꺼짐인 객체면 첫 왕복 전에 철회를 알린다", async () => {
    const on = await known(true);

    mockDb.holdReads = 1;
    // 다른 화면이 든 전체 객체. 대화 저장은 꺼짐으로 적혀 있고 그대로 서버에 쓰인다.
    const saving = savePrivacyPrefs(OWNER, { ...defaultPrivacyPrefs(), ads: true });
    expect(mockDb.heldReads).toHaveLength(1);
    expect(mockDb.prefs.get(OWNER)).toEqual({ chat_autosave: true, ads: false }); // 서버는 아직 켜짐이다
    expect(autosaveConsentFor(OWNER)).toEqual({ value: false, generation: on.generation + 1 });

    releaseOne(mockDb.heldReads);
    await saving;
    expect(mockDb.prefs.get(OWNER)).toMatchObject({ chat_autosave: false, ads: true });
    expect(autosaveConsentFor(OWNER)).toEqual({ value: false, generation: on.generation + 1 });
  });
});
