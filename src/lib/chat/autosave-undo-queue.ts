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
// 계정 삭제 뒤 로컬 정리(account/local-purge.ts)가 이 키를 지운다(purgeAutosaveUndoForDeletedAccount, PR 1814
// 재설계 C5). 정리는 삭제 표식을 먼저 세우므로 그 뒤로는 이 계정에 다시 적지 않는다.
//
// 읽기에는 상한이 있다 (게이트 r260919 DA-1814-3, 2026-09-19). 이 값은 대화 화면이 뜰 때와 앱이 앞으로 올 때마다 메인
// JS 에서 읽힌다. 전에는 크기 · 건수 상한 없이 JSON.parse 한 뒤 항목마다 목록 전체를 다시 돌며 중복을 골랐다(O(n²)) -
// 손상된 값 하나가 화면 진입을 붙잡을 수 있었다. 지금은 해석 전에 글자 수를, 해석 뒤에 건수를 자르고, 중복은 Set 으로
// 한 번에 가른다. 상한을 넘는 값은 크래시 없이 빈 목록으로 읽고, 다음 쓰기가 그 값을 갈아 끼운다.
//
// 쓰기 실패는 false 로 답한다(적기 · 빼기 모두). 실행기는 그 false 로 "기기에 남았다" 와 "이 런타임만 안다" 를 가른다
// (게이트 r260919 DA-1814-2 · DZ-1814-2) - 건수 상한에 걸려 적지 않은 것도 같은 false 다.

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
/**
 * 한 계정에 남기는 기록의 건수 상한. 기록 한 건은 "동의를 거둔 순간 진행 중이던 자동 저장 하나를 되돌리다 원격 삭제가
 * 실패했다" 는 뜻이라, 정상 사용에서 한 기기에 몇 건을 넘기 어렵다. 넘치면 더 적지 않고 false 로 답한다.
 */
const MAX_UNDO_RECORDS = 100;
/** 기록 한 건이 차지하는 글자 수의 넉넉한 윗선. 실제 한 건은 uuid 둘을 담은 {"ownerId":…,"sourceId":…} 로 약 100자다. */
const MAX_RECORD_CHARS = 256;
/** 저장된 값 전체의 글자 수 상한(25,600자). 이보다 긴 값은 해석하지 않는다. */
const MAX_QUEUE_CHARS = MAX_UNDO_RECORDS * MAX_RECORD_CHARS;

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

/**
 * 저장된 값을 읽는다. 글자 수 상한을 넘는 값 · JSON 이 아닌 값은 빈 목록이다(지울 것을 지어내지 않는다). 건수는 앞에서부터
 * 상한까지만 읽고, 중복은 Set 으로 가른다 - 입력 길이에 선형이다.
 */
function parse(ownerId: string, raw: string | null): AutosaveUndoRecord[] {
  if (raw === null || raw.length > MAX_QUEUE_CHARS) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const records: AutosaveUndoRecord[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (records.length >= MAX_UNDO_RECORDS) break;
    if (!item || typeof item !== "object") continue;
    const sourceId = (item as { sourceId?: unknown }).sourceId;
    if ((item as { ownerId?: unknown }).ownerId !== ownerId || typeof sourceId !== "string") continue;
    const record = { ownerId, sourceId };
    if (!isRecord(record) || seen.has(sourceId)) continue;
    seen.add(sourceId);
    records.push(record);
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

/** 읽고-고치고-쓴다. change 가 null 을 돌려주면 쓰지 않고 false 다. 쓰기가 실패해도 false 다. */
function update(
  record: AutosaveUndoRecord,
  change: (records: AutosaveUndoRecord[]) => AutosaveUndoRecord[] | null,
): Promise<boolean> {
  if (!isRecord(record)) return Promise.resolve(false);
  return serially(record.ownerId, async () => {
    const guarded = await runAccountLocalMutation(record.ownerId, async () => {
      const key = autosaveUndoStorageKey(record.ownerId);
      const next = change(parse(record.ownerId, await readRaw(key)));
      if (next === null) return false;
      await writeRaw(key, next.length > 0 ? serialize(next) : null);
      return true;
    });
    return guarded.executed && guarded.value;
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

/**
 * 되돌리기를 시작하기 전에 적는다. 적었으면(이미 있었으면) true. 삭제 표식이 선 계정 · 모양이 틀린 기록 · 건수 상한 ·
 * 저장 실패는 false 다.
 */
export function rememberAutosaveUndo(record: AutosaveUndoRecord): Promise<boolean> {
  return update(record, (records) => {
    if (records.some((known) => known.sourceId === record.sourceId)) return records;
    if (records.length >= MAX_UNDO_RECORDS) return null;
    return [...records, { ownerId: record.ownerId, sourceId: record.sourceId }];
  });
}

/**
 * 다 지웠거나, 사용자가 그 자료를 손으로 남기기로 했을 때 뺀다. 뺐거나 원래 없으면 true. 삭제 표식이 선 계정 · 저장
 * 실패는 false 다. 모양이 틀린 기록은 적힌 적이 없어서(적을 때 같은 검사를 지난다) 뺄 것도 없다 - true 다.
 */
export function forgetAutosaveUndo(record: AutosaveUndoRecord): Promise<boolean> {
  if (!isRecord(record)) return Promise.resolve(true);
  return update(record, (records) => records.filter((known) => known.sourceId !== record.sourceId));
}

/**
 * 계정 삭제 뒤 이 계정의 대기 기록을 지운다. 지웠거나 원래 없으면 true. 삭제 표식은 부르는 쪽(local-purge.ts)이
 * 먼저 세운다 - 그래서 이 뒤에 끝나는 기록 쓰기는 없다.
 */
export async function purgeAutosaveUndoForDeletedAccount(ownerId: string): Promise<boolean> {
  const owner = ownerId.trim();
  if (!owner) return false;
  const key = autosaveUndoStorageKey(owner);
  try {
    await writeRaw(key, null);
    return (await readRaw(key)) === null;
  } catch {
    return false;
  }
}

/** 테스트 전용. 메모리 저장소와 줄 세우기만 비운다. localStorage 는 테스트가 비운다. */
export function __resetAutosaveUndoQueueForTests(): void {
  memory.clear();
  tails.clear();
}
