// 되돌리기 대기 기록의 읽기 상한과 쓰기 실패 계약 (게이트 r260919 DA-1814-3 · DA-1814-2, 2026-09-19).
//
// 기록은 기기 저장소(웹 localStorage · 네이티브 AsyncStorage)에 사는 JSON 한 줄이고, 대화 화면이 뜰 때와 앱이 앞으로 올
// 때마다 읽힌다. 크기와 건수에 상한이 없으면 손상된 값 하나가 그 읽기를 메인 JS 에서 오래 붙잡는다 - JSON.parse 한 번에
// 항목마다 목록 전체를 다시 도는 중복 확인이 붙어 있었다(O(n²)). 아래 두 상한은 autosave-undo-queue.ts 의 값을 그대로
// 적는다. 여기 숫자가 바뀌면 그 파일의 근거 주석도 함께 바뀌어야 한다.
//
// 쓰기 실패 계약: 기록을 적지 못하면 false 다. 실행기(autosave-runner.ts)는 그 false 로 "기기에 남았다" 와 "이 런타임만
// 안다" 를 가른다(DA-1814-2). 웹 setItem 이 던질 때와 네이티브 setItem 이 거부할 때를 둘 다 돌린다.

const mockNative = {
  /** false 면 네이티브 모듈이 없는 빌드처럼 default 가 비어 온다(GZ-1814-1: 영속 저장소 부재). */
  present: true,
  backing: new Map<string, string>(),
  failWrites: false,
  getItem: jest.fn(async (key: string): Promise<string | null> => mockNative.backing.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string): Promise<void> => {
    if (mockNative.failWrites) throw new Error("native storage write rejected");
    mockNative.backing.set(key, value);
  }),
  removeItem: jest.fn(async (key: string): Promise<void> => {
    if (mockNative.failWrites) throw new Error("native storage write rejected");
    mockNative.backing.delete(key);
  }),
};
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  get default() {
    return mockNative.present ? mockNative : undefined;
  },
}));

import { __resetAccountLocalDeletionFencesForTests } from "../../account/local-deletion-fence";
import * as queueModule from "../autosave-undo-queue";
import {
  __resetAutosaveUndoQueueForTests,
  autosaveUndoStorageKey,
  forgetAutosaveUndo,
  listAutosaveUndo,
  rememberAutosaveUndo,
  type AutosaveUndoRecord,
} from "../autosave-undo-queue";

/** autosave-undo-queue.ts 의 MAX_UNDO_RECORDS 와 같은 값. */
const MAX_RECORDS = 100;
/** autosave-undo-queue.ts 의 MAX_QUEUE_CHARS(= MAX_UNDO_RECORDS × MAX_RECORD_CHARS 256)와 같은 값. */
const MAX_CHARS = 25_600;

// 실제 계정 id 는 uuid 다. 크기 상한을 실제 모양으로 재려고 같은 길이의 id 를 쓴다.
const OWNER = "5b0f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
const sourceId = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const record = (n: number): AutosaveUndoRecord => ({ ownerId: OWNER, sourceId: sourceId(n) });
const KEY = autosaveUndoStorageKey(OWNER);

const webValues = new Map<string, string>();
const webStorage = {
  getItem: (key: string): string | null => webValues.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    webValues.set(key, String(value));
  },
  removeItem: (key: string): void => {
    webValues.delete(key);
  },
};

beforeEach(() => {
  __resetAutosaveUndoQueueForTests();
  __resetAccountLocalDeletionFencesForTests();
  webValues.clear();
  (globalThis as { localStorage?: unknown }).localStorage = { ...webStorage };
});
afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("읽기 상한 (DA-1814-3)", () => {
  test("상한 개수까지 적고, 그다음은 적지 않고 false 다 - 적지 못한 것으로 답한다", async () => {
    for (let n = 0; n < MAX_RECORDS; n += 1) expect(await rememberAutosaveUndo(record(n))).toBe(true);
    expect(await rememberAutosaveUndo(record(MAX_RECORDS))).toBe(false);
    const listed = await listAutosaveUndo(OWNER);
    expect(listed).toHaveLength(MAX_RECORDS);
    expect(listed.some((known) => known.sourceId === sourceId(MAX_RECORDS))).toBe(false);
    // 이미 있는 id 를 다시 적는 것은 꽉 차 있어도 성공이다(늘지 않는다).
    expect(await rememberAutosaveUndo(record(0))).toBe(true);
  });

  test("저장된 값이 크기 상한을 넘으면 해석하지 않고 빈 목록이다 - 크래시 없이, 다음 쓰기가 그 값을 갈아 끼운다", async () => {
    const valid = JSON.stringify([record(1)]);
    const oversized = valid + " ".repeat(MAX_CHARS + 1 - valid.length);
    expect(oversized).toHaveLength(MAX_CHARS + 1);
    webValues.set(KEY, oversized);
    const parse = jest.spyOn(JSON, "parse");
    expect(await listAutosaveUndo(OWNER)).toEqual([]);
    expect(parse.mock.calls.some(([text]) => text === oversized)).toBe(false);
    parse.mockRestore();

    expect(await rememberAutosaveUndo(record(2))).toBe(true);
    expect(JSON.parse(webValues.get(KEY) ?? "null")).toEqual([record(2)]);
  });

  test("상한 바로 아래 크기는 그대로 읽는다", async () => {
    const valid = JSON.stringify([record(1)]);
    webValues.set(KEY, valid + " ".repeat(MAX_CHARS - valid.length));
    expect(await listAutosaveUndo(OWNER)).toEqual([record(1)]);
  });

  test("상한 개수보다 많은 목록은 앞에서부터 상한까지만 읽는다", async () => {
    const stored = Array.from({ length: MAX_RECORDS + 50 }, (_, n) => record(n));
    const raw = JSON.stringify(stored);
    expect(raw.length).toBeLessThan(MAX_CHARS); // 크기 상한이 아니라 건수 상한에 걸리는 입력이다
    webValues.set(KEY, raw);
    expect(await listAutosaveUndo(OWNER)).toEqual(stored.slice(0, MAX_RECORDS));
  });

  test("같은 id 는 몇 번 나와도 한 번만 읽는다", async () => {
    const stored = Array.from({ length: 200 }, (_, n) => record(n % 2));
    webValues.set(KEY, JSON.stringify(stored));
    expect(await listAutosaveUndo(OWNER)).toEqual([record(0), record(1)]);
  });
});

describe("쓰기 실패 계약 (DA-1814-2)", () => {
  test("웹 setItem 이 던지면 적지 못한 것이다(false)", async () => {
    (globalThis as { localStorage: { setItem: unknown } }).localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(await rememberAutosaveUndo(record(1))).toBe(false);
    expect(webValues.has(KEY)).toBe(false);
  });

  test("웹 removeItem 이 던지면 빼지 못한 것이다(false) - 기록은 그대로 남는다", async () => {
    expect(await rememberAutosaveUndo(record(1))).toBe(true);
    (globalThis as { localStorage: { removeItem: unknown } }).localStorage.removeItem = () => {
      throw new Error("SecurityError");
    };
    expect(await forgetAutosaveUndo(record(1))).toBe(false);
    expect(JSON.parse(webValues.get(KEY) ?? "null")).toEqual([record(1)]);
  });

  test("네이티브 setItem 이 거부하면 적지 못한 것이다(false), 거부하지 않으면 적는다", async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    delete (globalThis as { localStorage?: unknown }).localStorage;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: "ReactNative" } });
    mockNative.backing.clear();
    try {
      mockNative.failWrites = true;
      expect(await rememberAutosaveUndo(record(1))).toBe(false);
      expect(mockNative.setItem).toHaveBeenCalled();
      expect(mockNative.backing.has(KEY)).toBe(false);

      mockNative.failWrites = false;
      expect(await rememberAutosaveUndo(record(1))).toBe(true);
      expect(JSON.parse(mockNative.backing.get(KEY) ?? "null")).toEqual([record(1)]);
    } finally {
      mockNative.failWrites = false;
      if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  test("모양이 틀린 기록을 빼라고 하면 true 다 - 그런 기록은 적힌 적이 없다(적을 때 같은 검사를 지난다)", async () => {
    expect(await rememberAutosaveUndo({ ownerId: OWNER, sourceId: "row-9" })).toBe(false);
    expect(await forgetAutosaveUndo({ ownerId: OWNER, sourceId: "row-9" })).toBe(true);
  });
});

describe("영속 저장소가 없거나 막히면 적었다고 답하지 않는다 (게이트 r260919 재게이트 GZ-1814-1)", () => {
  // 전에는 localStorage 접근자가 던지면(SecurityError) 저장소가 없는 것으로 보고 이 런타임의 메모리에 쓴 뒤 true 로 답했다.
  // 실행기는 그 true 를 "기기에 남았다" 로 읽고 조용한 undo_pending 으로 끝냈고, 저장소가 돌아오면 디스크만 읽어서 그 기록을
  // 다시 보지 못했다. 메모리에 쓴 것은 앱을 다시 시작하면 사라진다 - 적었다는 답이 아니다.
  type Lookup = (record: AutosaveUndoRecord) => Promise<boolean | null>;
  const isRecorded: Lookup = (value) => {
    const lookup = (queueModule as { isAutosaveUndoRecorded?: Lookup }).isAutosaveUndoRecorded;
    return lookup ? lookup(value) : Promise.reject(new Error("isAutosaveUndoRecorded 가 없다"));
  };

  function denyWebStorage(): () => void {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    return () => {
      if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    };
  }

  test("웹 접근자가 거부되면 적기도 빼기도 false 다 - 메모리에 썼어도 기기 기록이 아니고, 적혀 있는지는 모름(null)이다", async () => {
    expect(await rememberAutosaveUndo(record(1))).toBe(true); // 저장소가 될 때 적은 기록
    const restore = denyWebStorage();
    try {
      expect(await rememberAutosaveUndo(record(2))).toBe(false);
      expect(await forgetAutosaveUndo(record(1))).toBe(false);
      expect(await isRecorded(record(1))).toBeNull(); // 읽지 못한 것은 없음이 아니다
    } finally {
      restore();
    }
    // 저장소가 돌아오면: 막힌 동안의 적기는 디스크에 없고, 막힌 동안의 빼기도 디스크에 닿지 않았다
    expect(JSON.parse(webValues.get(KEY) ?? "null")).toEqual([record(1)]);
    expect(await isRecorded(record(1))).toBe(true);
    expect(await isRecorded(record(2))).toBe(false);
  });

  test("웹도 네이티브도 아니면(영속 저장소 없음) 적었다고 답하지 않는다", async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(await rememberAutosaveUndo(record(1))).toBe(false);
    expect(await forgetAutosaveUndo(record(1))).toBe(false);
    expect(await isRecorded(record(1))).toBeNull();
  });

  test("네이티브 모듈이 없는 빌드면 적었다고 답하지 않는다 - 모듈이 있으면 적는다", async () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    delete (globalThis as { localStorage?: unknown }).localStorage;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: "ReactNative" } });
    mockNative.backing.clear();
    mockNative.present = false;
    try {
      expect(await rememberAutosaveUndo(record(1))).toBe(false);
      expect(await isRecorded(record(1))).toBeNull();
      mockNative.present = true;
      expect(await rememberAutosaveUndo(record(1))).toBe(true);
      expect(await isRecorded(record(1))).toBe(true);
    } finally {
      mockNative.present = true;
      if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  test("적혀 있는지 묻기: 적힌 것은 true, 읽었는데 없으면 false, 깨진 값은 비우기와 같이 빈 목록으로 본다(false)", async () => {
    expect(await isRecorded(record(1))).toBe(false);
    expect(await rememberAutosaveUndo(record(1))).toBe(true);
    expect(await isRecorded(record(1))).toBe(true);
    expect(await isRecorded(record(2))).toBe(false);
    webValues.set(KEY, "not json");
    expect(await isRecorded(record(1))).toBe(false);
  });
});
