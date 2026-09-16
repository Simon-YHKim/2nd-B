// 대화 자동 저장의 되돌리기 대기 기록 (PR 1814 재설계 C4, 2026-09-17).
//
// 자동 저장 작업이 취소됐는데 이미 보낸 쓰기(원문 업로드 · sources 행)를 그 자리에서 다 지우지 못할 수 있다.
// 앱이 꺼지거나, 연결이 끊기거나, 지우는 도중에 계정이 바뀌는 경우다. 그때 무엇을 마저 지워야 하는지 기기에
// 남긴다. 실행기(autosave-runner.ts)는 되돌리기를 시작하기 **전에** 적고, 다 지운 뒤에 지운다. 그래서 지우는
// 도중에 앱이 꺼져도 같은 계정이 돌아왔을 때 이어서 지울 수 있다(drainAutosaveUndoQueue).
//
// 남기는 것은 {ownerId, sourceId} 둘뿐이다. 제목 · 본문 · 원문 경로는 남기지 않는다.
//   · 원문 경로는 두 id 로 다시 만든다(<ownerId>/chat-<sourceId>.md). 따로 적으면 같은 사실이 두 곳에 산다.
//   · 제목과 본문은 되돌리기에 필요 없다. 기기에 남기면 지우려던 대화가 기기에 남는다.
//   · 같은 기기의 다른 계정이 이 기록을 읽어도 불투명한 id 둘이고, RLS 때문에 그 행을 보거나 지울 수 없다.
// 부르는 쪽이 무엇을 더 들고 와도 적는 것은 두 필드뿐이다(serialize).
//
// 쓰기는 계정 삭제와 한 줄로 선다(runAccountLocalMutation). 삭제 표식이 선 계정에는 적지 않는다. 키는 계정마다
// 따로다. 저장소는 웹 localStorage, 네이티브 AsyncStorage, 둘 다 없으면 이 런타임의 메모리다. 암호화 저장소를
// 쓰지 않는 이유: 담는 것이 사용자 글이 아니라 id 둘이다(capture/draft.ts 는 본문이라 암호화한다).
//
// ⚠ 계정 삭제 때 이 키를 지우는 정리 경로에는 아직 넣지 않았다. 남는 것은 id 둘이고, 삭제된 계정으로는 더
// 적지 않는다.

import {
  isAccountLocalDeletionFencedInMemory,
  runAccountLocalMutation,
} from "../account/local-deletion-fence";

export interface AutosaveUndoRecord {
  readonly ownerId: string;
  readonly sourceId: string;
}

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const KEY_PREFIX = "chat.autosaveUndo.v1.";
/** 실행기가 만드는 모양(소문자 uuid)만 받는다. 손으로 고친 기록으로 엉뚱한 행을 지우지 않는다. */
const SOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const memory = new Map<string, string>();
const tails = new Map<string, Promise<unknown>>();

export function autosaveUndoStorageKey(ownerId: string): string {
  return `${KEY_PREFIX}${ownerId}`;
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function webStorage(): Storage | null {
  if (isReactNativeRuntime()) return null;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function nativeStorage(): AsyncStorageLike | null {
  if (!isReactNativeRuntime()) return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

async function readRaw(key: string): Promise<string | null> {
  const web = webStorage();
  if (web) return web.getItem(key);
  const native = nativeStorage();
  if (native) return native.getItem(key);
  return memory.get(key) ?? null;
}

async function writeRaw(key: string, value: string | null): Promise<void> {
  const web = webStorage();
  if (web) {
    if (value === null) web.removeItem(key);
    else web.setItem(key, value);
    return;
  }
  const native = nativeStorage();
  if (native) {
    if (value === null) await native.removeItem(key);
    else await native.setItem(key, value);
    return;
  }
  if (value === null) memory.delete(key);
  else memory.set(key, value);
}

function isRecord(record: AutosaveUndoRecord): boolean {
  return typeof record.ownerId === "string" && record.ownerId.trim().length > 0 && SOURCE_ID.test(record.sourceId);
}

function parse(ownerId: string, raw: string | null): AutosaveUndoRecord[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const records: AutosaveUndoRecord[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const sourceId = (item as { sourceId?: unknown }).sourceId;
    if ((item as { ownerId?: unknown }).ownerId !== ownerId || typeof sourceId !== "string") continue;
    const record = { ownerId, sourceId };
    if (isRecord(record) && !records.some((known) => known.sourceId === sourceId)) records.push(record);
  }
  return records;
}

function serialize(records: readonly AutosaveUndoRecord[]): string {
  return JSON.stringify(records.map((record) => ({ ownerId: record.ownerId, sourceId: record.sourceId })));
}

/** 같은 계정의 읽고-고치고-쓰기를 이 런타임에서 한 줄로 세운다. 앞의 실패가 뒤를 막지 않는다. */
function serially<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(ownerId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(work);
  const tail = result.catch(() => undefined);
  tails.set(ownerId, tail);
  void tail.then(() => {
    if (tails.get(ownerId) === tail) tails.delete(ownerId);
  });
  return result;
}

function update(
  record: AutosaveUndoRecord,
  change: (records: AutosaveUndoRecord[]) => AutosaveUndoRecord[],
): Promise<boolean> {
  if (!isRecord(record)) return Promise.resolve(false);
  return serially(record.ownerId, async () => {
    const guarded = await runAccountLocalMutation(record.ownerId, async () => {
      const key = autosaveUndoStorageKey(record.ownerId);
      const next = change(parse(record.ownerId, await readRaw(key)));
      await writeRaw(key, next.length > 0 ? serialize(next) : null);
    });
    return guarded.executed;
  }).catch(() => false);
}

/** 이 계정에 남은 되돌리기. 못 읽으면 빈 목록이다(지울 것을 지어내지 않는다). */
export async function listAutosaveUndo(ownerId: string): Promise<AutosaveUndoRecord[]> {
  if (isAccountLocalDeletionFencedInMemory(ownerId)) return [];
  try {
    return parse(ownerId, await readRaw(autosaveUndoStorageKey(ownerId)));
  } catch {
    return [];
  }
}

/** 되돌리기를 시작하기 전에 적는다. 적었으면 true. 삭제 표식이 선 계정 · 모양이 틀린 기록 · 저장 실패는 false. */
export function rememberAutosaveUndo(record: AutosaveUndoRecord): Promise<boolean> {
  return update(record, (records) =>
    records.some((known) => known.sourceId === record.sourceId)
      ? records
      : [...records, { ownerId: record.ownerId, sourceId: record.sourceId }],
  );
}

/** 다 지웠거나, 사용자가 그 자료를 손으로 남기기로 했을 때 지운다. */
export function forgetAutosaveUndo(record: AutosaveUndoRecord): Promise<boolean> {
  return update(record, (records) => records.filter((known) => known.sourceId !== record.sourceId));
}

/** 테스트 전용. 메모리 저장소와 줄 세우기만 비운다. localStorage 는 테스트가 비운다. */
export function __resetAutosaveUndoQueueForTests(): void {
  memory.clear();
  tails.clear();
}
