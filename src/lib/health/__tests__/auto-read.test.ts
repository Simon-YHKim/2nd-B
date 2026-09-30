// Automatic health read (Simon 2026-09-30: "권한을 부여해서 작업할수 있게 … 자동으로 읽어낼수
// 있게"). Every skip is pinned, and no path may ever ask for an OS permission.
const store = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { store.delete(key); }),
  },
}));
const fenced = new Set<string>();
jest.mock("../../account/local-deletion-fence", () => ({
  runAccountLocalMutation: jest.fn(async (owner: string, mutation: () => unknown) =>
    fenced.has(owner) ? { executed: false } : { executed: true, value: await mutation() }),
}));

import type { RefreshSettings } from "../../dashboard/refresh-schedule";
import type { GrantedRead, HealthSample, HealthSource } from "../HealthSource";
import {
  AUTO_READ_CATCH_UP_DAYS,
  AUTO_READ_CHUNK,
  AUTO_READ_METRICS,
  armHealthAutoRead,
  autoReadHealth,
  autoReadWindow,
  loadAutoReadMarks,
  markAutoReadRun,
  nextAutoReadCheck,
  purgeHealthAutoReadForDeletedAccount,
  type AutoReadDeps,
  type AutoReadMarks,
} from "../auto-read";

const at = (day: number, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute);
const sep = (day: number, hour = 0, minute = 0) => new Date(2026, 8, day, hour, minute);
const NOW = at(1, 20);
const daily: RefreshSettings = { enabled: true, intervalMinutes: 1440, anchorTime: "07:00" };
const sample: HealthSample = { source: "health_connect", metricType: "steps", value: 4200, unit: "count", startedAt: "2026-10-01T01:00:00.000Z", externalId: "s1" };
const armedOnly: AutoReadMarks = { armed: at(1, 9), attempted: null, readThrough: null };

type TestSource = HealthSource & { requestPermission: jest.Mock; read: jest.Mock; readGranted: jest.Mock };

function source(result: GrantedRead | null = { samples: [sample], complete: true }): TestSource {
  return {
    id: "health_connect",
    isAvailable: () => true,
    requestPermission: jest.fn(async () => "granted" as const),
    read: jest.fn(async () => [sample]),
    readGranted: jest.fn(async () => result),
  } as TestSource;
}

/** Sources that cannot read without asking, as the registry lists them before Health Connect. */
function tapOnly(id: "manual" | "mock"): HealthSource & { read: jest.Mock; requestPermission: jest.Mock } {
  return { id, isAvailable: () => true, requestPermission: jest.fn(async () => "granted" as const), read: jest.fn(async () => [sample]) };
}

function deps(overrides: Partial<AutoReadDeps> = {}, sources: HealthSource[] = [source()], marks: AutoReadMarks = armedOnly) {
  const runs: { attempted: Date; readThrough: Date | null }[] = [];
  const value: AutoReadDeps = {
    now: () => NOW,
    loadSettings: jest.fn(async () => daily),
    loadMarks: jest.fn(async () => marks),
    markRun: jest.fn(async (_owner: string, attempted: Date, readThrough: Date | null) => {
      runs.push({ attempted, readThrough });
    }),
    consented: jest.fn(async () => true),
    sources: () => sources,
    ingest: jest.fn(async () => ({ inserted: [], autoCompleted: [] })),
    assertCurrent: jest.fn(),
    ...overrides,
  };
  return { value, runs };
}

beforeEach(() => {
  store.clear();
  fenced.clear();
});

describe("who and when", () => {
  test("a minor or an unconfirmed age never reads, and nothing is even looked up", async () => {
    for (const isMinor of [true, null]) {
      const { value } = deps();
      await expect(autoReadHealth("owner", isMinor, value)).resolves.toBe("skipped:minor");
      expect(value.loadSettings).not.toHaveBeenCalled();
      expect(value.consented).not.toHaveBeenCalled();
    }
  });

  test("automatic refresh switched off means no automatic health read and no marks", async () => {
    const { value, runs } = deps({ loadSettings: jest.fn(async () => ({ ...daily, enabled: false })) });
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("skipped:off");
    expect(runs).toEqual([]);
  });

  test("a phone this account never connected is not read: another account's OS grant is not inherited", async () => {
    const native = source();
    const { value, runs } = deps({}, [native], { armed: null, attempted: null, readThrough: null });
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("skipped:not-armed");
    expect(value.consented).not.toHaveBeenCalled();
    expect(native.readGranted).not.toHaveBeenCalled();
    expect(runs).toEqual([]);
  });

  test("once per daily slot: not again the same evening, again after the next 07:00", async () => {
    const sameDay = deps({}, [source()], { ...armedOnly, attempted: at(1, 8) });
    await expect(autoReadHealth("owner", false, sameDay.value)).resolves.toBe("skipped:not-due");
    const nextDay = deps({}, [source()], { ...armedOnly, attempted: sep(30, 21) });
    await expect(autoReadHealth("owner", false, nextDay.value)).resolves.toBe("ingested");
  });

  test("an attempt dated in the future (the clock moved back) does not block the read", async () => {
    const native = source();
    const { value } = deps({}, [native], { ...armedOnly, attempted: at(31, 9), readThrough: at(31, 9) });
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("ingested");
    expect(native.readGranted.mock.calls[0][0]).toEqual({ startIso: sep(30).toISOString(), endIso: NOW.toISOString() });
  });
});

describe("what it reads", () => {
  test("only a source that reads without asking is used; the registry's manual and mock entries are never read", async () => {
    const manual = tapOnly("manual");
    const mock = tapOnly("mock");
    const native = source();
    const { value } = deps({}, [manual, mock, native]);
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("ingested");
    expect(mock.read).not.toHaveBeenCalled();
    expect(manual.read).not.toHaveBeenCalled();
    expect(native.readGranted).toHaveBeenCalledTimes(1);
  });

  test("no such source (web, iOS for now) skips before the server is asked, and marks the attempt only", async () => {
    const { value, runs } = deps({}, [tapOnly("manual"), tapOnly("mock")]);
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("skipped:unavailable");
    expect(value.consented).not.toHaveBeenCalled();
    expect(runs).toEqual([{ attempted: NOW, readThrough: null }]);
  });

  test("without consent it skips before touching the OS", async () => {
    const native = source();
    const { value, runs } = deps({ consented: jest.fn(async () => false) }, [native]);
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("skipped:no-consent");
    expect(native.readGranted).not.toHaveBeenCalled();
    expect(runs).toEqual([{ attempted: NOW, readThrough: null }]);
  });

  test("nothing granted in the OS is a skip, never a request", async () => {
    const native = source(null);
    const { value, runs } = deps({}, [native]);
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("skipped:no-permission");
    expect(native.requestPermission).not.toHaveBeenCalled();
    expect(native.read).not.toHaveBeenCalled();
    expect(runs).toEqual([{ attempted: NOW, readThrough: null }]);
  });

  test("steps, workouts and sleep only: raw heart-rate readings stay with the tap", () => {
    expect([...AUTO_READ_METRICS].sort()).toEqual(["sleep", "steps", "workout"]);
  });

  test("a complete read ingests through the gate from yesterday's start and moves both marks", async () => {
    const native = source();
    const { value, runs } = deps({}, [native]);
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("ingested");
    expect(native.readGranted).toHaveBeenCalledWith({ startIso: sep(30).toISOString(), endIso: NOW.toISOString() }, AUTO_READ_METRICS);
    expect(value.ingest).toHaveBeenCalledWith("owner", [sample], { isMinor: false, pref: true });
    expect(runs).toEqual([{ attempted: NOW, readThrough: NOW }]);
    expect(native.requestPermission).not.toHaveBeenCalled();
  });

  test("the window starts at the day of the last complete read", async () => {
    const native = source();
    const { value } = deps({}, [native], { ...armedOnly, readThrough: sep(29, 8) });
    await autoReadHealth("owner", false, value);
    expect(native.readGranted.mock.calls[0][0].startIso).toBe(sep(29).toISOString());
  });

  test("a complete read with nothing in it is 'empty' and still moves the read-through date", async () => {
    const { value, runs } = deps({}, [source({ samples: [], complete: true })]);
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("empty");
    expect(value.ingest).not.toHaveBeenCalled();
    expect(runs).toEqual([{ attempted: NOW, readThrough: NOW }]);
  });

  test("a partial read keeps what it got but not the read-through date, so the next read covers the gap", async () => {
    const partial = deps({}, [source({ samples: [sample], complete: false })], { ...armedOnly, readThrough: sep(29, 8) });
    await expect(autoReadHealth("owner", false, partial.value)).resolves.toBe("partial");
    expect(partial.value.ingest).toHaveBeenCalledTimes(1);
    expect(partial.runs).toEqual([{ attempted: NOW, readThrough: null }]);
    // Failed outright (every page refused): no samples, and it is not called empty.
    const failed = deps({}, [source({ samples: [], complete: false })]);
    await expect(autoReadHealth("owner", false, failed.value)).resolves.toBe("partial");
    expect(failed.runs).toEqual([{ attempted: NOW, readThrough: null }]);
  });
});

describe("sending and stopping", () => {
  test("many samples go to the server in chunks, checking the account after each", async () => {
    const many = Array.from({ length: AUTO_READ_CHUNK * 2 + 500 }, (_, i) => ({ ...sample, externalId: `s${i}` }));
    const { value, runs } = deps({}, [source({ samples: many, complete: true })]);
    await expect(autoReadHealth("owner", false, value)).resolves.toBe("ingested");
    const chunks = (value.ingest as jest.Mock).mock.calls.map(([, chunk]) => chunk as HealthSample[]);
    expect(chunks.map((chunk) => chunk.length)).toEqual([AUTO_READ_CHUNK, AUTO_READ_CHUNK, 500]);
    expect(chunks.flat()).toEqual(many);
    // Four checks up to the read (settings, marks, consent, read), then one per chunk.
    expect(value.assertCurrent).toHaveBeenCalledTimes(4 + 3);
    expect(runs).toEqual([{ attempted: NOW, readThrough: NOW }]);
  });

  test("a chunk that fails leaves no marks, so the next run reads the same window again", async () => {
    const many = Array.from({ length: AUTO_READ_CHUNK + 1 }, (_, i) => ({ ...sample, externalId: `s${i}` }));
    const marks = { ...armedOnly, readThrough: sep(29, 8) };
    let call = 0;
    const first = source({ samples: many, complete: true });
    const failing = deps({
      ingest: jest.fn(async () => {
        call += 1;
        if (call === 2) throw new Error("timeout");
        return { inserted: [], autoCompleted: [] };
      }),
    }, [first], marks);
    await expect(autoReadHealth("owner", false, failing.value)).rejects.toThrow("timeout");
    expect(failing.runs).toEqual([]);
    const second = source({ samples: many, complete: true });
    const retry = deps({}, [second], marks);
    await expect(autoReadHealth("owner", false, retry.value)).resolves.toBe("ingested");
    expect(second.readGranted.mock.calls[0][0]).toEqual(first.readGranted.mock.calls[0][0]);
  });

  test("an account switch mid-run stops before anything is sent or marked", async () => {
    let checks = 0;
    const switched = deps({ assertCurrent: jest.fn(() => { if (++checks === 3) throw new Error("aborted"); }) });
    await expect(autoReadHealth("owner", false, switched.value)).rejects.toThrow("aborted");
    expect(switched.value.ingest).not.toHaveBeenCalled();
    expect(switched.runs).toEqual([]);
  });
});

describe("the window", () => {
  test("from the read-through day, clamped to yesterday at the latest and the catch-up floor at the earliest", () => {
    const now = at(10, 7, 30);
    const start = (readThrough: Date | null) => autoReadWindow(now, readThrough).startIso;
    expect(autoReadWindow(now, null)).toEqual({ startIso: at(9).toISOString(), endIso: now.toISOString() });
    expect(start(at(9, 7, 30))).toBe(at(9).toISOString());
    expect(start(at(8, 22))).toBe(at(8).toISOString());
    expect(AUTO_READ_CATCH_UP_DAYS).toBe(3);
    expect(start(at(1, 9))).toBe(at(7).toISOString());
  });

  test("morning reads follow each other without a gap, and the evening before is inside the next one", () => {
    const first = autoReadWindow(at(10, 7, 30), at(9, 7, 10));
    const second = autoReadWindow(at(11, 7, 40), at(10, 7, 30));
    expect(new Date(second.startIso).getTime()).toBeLessThanOrEqual(new Date(first.endIso).getTime());
    expect(new Date(second.startIso).getTime()).toBeLessThanOrEqual(at(10, 21).getTime());
  });
});

describe("marks on this phone", () => {
  test("armed, attempted and read-through are per account, dates only, fenced and purged", async () => {
    expect(await loadAutoReadMarks("owner")).toEqual({ armed: null, attempted: null, readThrough: null });
    expect(await armHealthAutoRead("owner", at(1, 9))).toBe(true);
    await markAutoReadRun("owner", at(1, 10), null);
    expect(await loadAutoReadMarks("owner")).toEqual({ armed: at(1, 9), attempted: at(1, 10), readThrough: null });
    await markAutoReadRun("owner", at(2, 10), at(2, 10));
    expect(await loadAutoReadMarks("owner")).toEqual({ armed: at(1, 9), attempted: at(2, 10), readThrough: at(2, 10) });
    expect(await loadAutoReadMarks("someone-else")).toEqual({ armed: null, attempted: null, readThrough: null });

    store.set("health.autoread.attempted.v1:broken", "not a date");
    expect((await loadAutoReadMarks("broken")).attempted).toBeNull();

    fenced.add("deleting");
    expect(await armHealthAutoRead("deleting", NOW)).toBe(false);
    await markAutoReadRun("deleting", NOW, NOW);
    expect(await loadAutoReadMarks("deleting")).toEqual({ armed: null, attempted: null, readThrough: null });

    expect(await purgeHealthAutoReadForDeletedAccount("owner")).toBe(true);
    expect(await loadAutoReadMarks("owner")).toEqual({ armed: null, attempted: null, readThrough: null });
    expect(await purgeHealthAutoReadForDeletedAccount("  ")).toBe(false);
  });

  test("the runner looks again at the next slot, and not at all when off or not armed", async () => {
    const base = { now: () => NOW, loadSettings: jest.fn(async () => daily), loadMarks: jest.fn(async () => armedOnly) };
    expect(await nextAutoReadCheck("owner", base)).toEqual(at(2, 7));
    expect(await nextAutoReadCheck("owner", { ...base, loadSettings: jest.fn(async () => ({ ...daily, enabled: false })) })).toBeNull();
    expect(await nextAutoReadCheck("owner", { ...base, loadMarks: jest.fn(async () => ({ ...armedOnly, armed: null })) })).toBeNull();
  });
});
