// relation_people upsert from kakao signals (연동 P0③): idempotent by
// subject:<key> tag, rename-safe, collision-probing.

import type { Person } from "../people";

const calls: { created: unknown[]; updated: { id: string; patch: Record<string, unknown> }[] } = {
  created: [],
  updated: [],
};
let existingPeople: Person[] = [];

jest.mock("../people", () => ({
  listPeople: async () => existingPeople,
  createPerson: async (_userId: string, input: unknown) => {
    calls.created.push(input);
    return input as Person;
  },
  updatePerson: async (_userId: string, id: string, patch: Record<string, unknown>) => {
    calls.updated.push({ id, patch });
    return {} as Person;
  },
}));

import { upsertKakaoRelationPeople, KAKAO_IMPORT_TAG } from "../import-signals";
import { starAliasFor, subjectKeyFor } from "../star-alias";
import type { KakaoRelationSignal } from "../../import/kakao";

function person(partial: Partial<Person>): Person {
  return {
    id: "p1",
    display_name: "이름",
    relation_kind: "other",
    closeness: null,
    contact_cadence: null,
    last_interaction_on: null,
    note: null,
    tags: [],
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...partial,
  } as Person;
}

function signal(partial: Partial<KakaoRelationSignal>): KakaoRelationSignal {
  return {
    subjectKey: subjectKeyFor("지수"),
    messageCount: 6,
    activeDays: 4,
    firstIso: "2026-07-01T06:00:00.000Z",
    lastIso: "2026-07-14T06:00:00.000Z",
    cadence: "weekly",
    ...partial,
  };
}

beforeEach(() => {
  calls.created.length = 0;
  calls.updated.length = 0;
  existingPeople = [];
});

describe("upsertKakaoRelationPeople", () => {
  test("a new subject becomes a star-alias person with the subject tag", async () => {
    const key = subjectKeyFor("지수");
    const touched = await upsertKakaoRelationPeople("u1", true, [signal({ subjectKey: key })]);
    expect(touched).toBe(1);
    expect(calls.created).toHaveLength(1);
    const created = calls.created[0] as { display_name: string; tags: string[]; last_interaction_on: string };
    expect(created.display_name).toBe(starAliasFor(key, true));
    expect(created.tags).toContain(KAKAO_IMPORT_TAG);
    expect(created.tags).toContain(`subject:${key}`);
    expect(created.last_interaction_on).toBe("2026-07-14");
  });

  test("an existing subject updates recency/cadence but NEVER display_name (rename-safe)", async () => {
    const key = subjectKeyFor("지수");
    existingPeople = [
      person({ id: "px", display_name: "내가 바꾼 이름", tags: [KAKAO_IMPORT_TAG, `subject:${key}`], last_interaction_on: "2026-07-02" }),
    ];
    await upsertKakaoRelationPeople("u1", true, [signal({ subjectKey: key })]);
    expect(calls.created).toHaveLength(0);
    expect(calls.updated).toHaveLength(1);
    expect(calls.updated[0].id).toBe("px");
    expect(calls.updated[0].patch).not.toHaveProperty("display_name");
    expect(calls.updated[0].patch.last_interaction_on).toBe("2026-07-14");
  });

  test("recency never moves backwards on a stale re-import", async () => {
    const key = subjectKeyFor("지수");
    existingPeople = [
      person({ id: "px", tags: [`subject:${key}`], last_interaction_on: "2026-07-20" }),
    ];
    await upsertKakaoRelationPeople("u1", true, [signal({ subjectKey: key })]);
    expect(calls.updated[0].patch).not.toHaveProperty("last_interaction_on");
  });

  test("an alias collision probes to a different combination", async () => {
    const key = subjectKeyFor("지수");
    existingPeople = [person({ id: "py", display_name: starAliasFor(key, true, 0), tags: [] })];
    await upsertKakaoRelationPeople("u1", true, [signal({ subjectKey: key })]);
    const created = calls.created[0] as { display_name: string };
    expect(created.display_name).toBe(starAliasFor(key, true, 1));
  });
});
