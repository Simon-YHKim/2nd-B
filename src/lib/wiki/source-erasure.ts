// 담아 둔 자료(sources) 행과 그 원문(raw-clippings 객체)을 함께 지운다 (R28, 2026-09-20).
//
// 왜. 행만 지우던 길 - 설정의 '정리하지 않은 캡처 삭제' · '전체 삭제', 가져오기 철회, 옛 한 건 삭제
// (queries.ts deleteSource) - 은 Storage 원문을 남겼다. 앱 목록은 행 기준이라 보이지 않지만 데이터
// 내보내기(supabase/functions/export-account)는 raw-clippings/<uid>/ 폴더를 나열해 그대로 내보낸다.
// 사용자가 지웠다고 믿은 것이 남는 개인정보 결함이었다. 서버에는 이를 대신 지우는 연쇄 · 트리거 · 버킷
// 수명 규칙 · 정리 크론이 없고, 원문 폴더를 쓰는 것은 계정 삭제(delete-account)뿐이다. 소유자 RLS 가
// 본인 폴더의 읽기와 삭제를 허락하므로(0188 의 raw_clippings_owner_select · _delete) 여기서 지운다.
//
// 행과 원문을 잇는 키는 sources.storage_path 하나다. 자료는 모두 captureFromMarkdown 을 지나고, 그 경로는
// rawClippingPath(userId, `${슬러그}-${내용 해시 12자}`) = `<uid>/<이름>.md` 로 평평하다(capture.ts).
// 같은 경로를 두 행이 가리킬 수 있다: 같은 글을 동시에 두 번 담으면 둘 다 게이트를 지나고, 뒤의 행은 업로드가
// 충돌해 _storage_pending 인 채 같은 경로를 든다. 그래서 지우지 않는 다른 행이 가리키는 원문은 남긴다.
//
// 순서가 계약이다.
//   골라 지울 때(정리하지 않은 캡처 · 가져오기 철회 · 한 건): 선점, 원문, 행. 원문 삭제가 실패하면 그 묶음의
//     행은 하나도 지우지 않고 던진다 - 행이 남아야 storage_path 를 다시 읽고 다시 할 수 있다. 원문을 지운 뒤
//     행에서 실패해도 행이 남아 다시 하면 이어서 끝난다(이미 없는 경로의 remove 는 오류가 아니라 지운 목록에서
//     빠진다고 읽는다 - delete-captured-source 와 같은 읽기이고, 실 Storage 로는 확인하지 않았다).
//     위키 페이지가 가리키는 행은 건드리지 않는다. wiki_pages_source_kind_pair CHECK(0022) 가 그 행의 삭제를
//     막는데, 원문만 먼저 지우면 페이지만 남고 원문을 잃는다. 원문도 행도 남기고 kept 로 센다(화면이 알린다).
//   전체 삭제: 행 먼저, 폴더 나중(eraseRawClippingFolder). 행이 모두 사라지므로 폴더 목록이 곧 다시 할 곳이다.
//     이 순서면 다른 기기에서 동시에 담긴 자료가 있어도 보이지 않는 원문(행 없는 원문)이 아니라 보이고 지울 수
//     있는 행(원문 없는 행)만 생길 수 있다 - 담기는 원문을 올린 뒤에 행을 쓴다.
//
// 실패는 던진다. 화면은 기존 실패 안내(다시 시도)를 띄운다 - 지우지 못한 것을 지웠다고 말하지 않는다.
//
// R30 (2026-09-20) - #1839 1차 게이트 대응. 세 가지를 더했다.
//
//   이름 계약(JZ-1839-1). 원문 경로는 `<uid>/` 에 정확히 붙은 한 단계 이름이어야 하고(. · .. · 구분자 · 역슬래시 ·
//     제어 문자 금지), 길이는 저장 쪽 계약 그대로 전체 키 UTF-8 1,024바이트까지다. 예전 255자 상한은 저장 계약에서
//     온 것이 아니었다 - 정상 담기가 240자 제목으로 256자 이름을 만들고, 선택 삭제는 그 원문만 빼고 행을 지웠으며
//     전체 삭제는 그 이름에서 매번 던져 기록 단계에 닿지 못했다. 본인 폴더 경로인데 계약 밖인 행은 이제 지우지
//     않고 포인터로 남긴 채 불완료(SourceErasureIncompleteError)로 끝난다. 남의 폴더를 가리키는 행은 예전처럼
//     원문을 Storage 에 보내지 않고 행만 지운다 - 그 경로에는 이 사람의 원문이 있을 수 없다.
//
//   세션 고정(JA-1839-3 · JZ-1839-2). 파괴 작업은 시작 시점의 세션(사용자 + 세션 id)에 묶인다. 계정 삭제
//     (records/delete-bulk.ts requestAccountDeletion)와 같은 계약이다: auth 변경 잠금(M) 안에서 돌고, 시작할 때
//     세션이 화면이 넘긴 계정이 아니면 한 줄도 쓰지 않고 멈추며, 요청마다 응답 뒤에 살아 있는 세션을 다시 읽는다.
//     바뀌었으면 AuthSessionOwnerChangedError 로 끝난다. 다른 세션의 요청은 RLS 때문에 아무것도 못 보고 못 지운다 -
//     그 빈 결과를 '다 지웠다'로 읽던 것이 결함이었다. 응답 뒤에 확인하므로 요청이 날아가는 도중의 전환도 잡힌다.
//
//   선점(JA-1839-2 · JA-1839-1). 골라 지우기는 행마다 sources.frontmatter._erasing 표식을 조건부 UPDATE 로
//     원자적으로 걸고(아래 casWrite), 표식을 건 행만 위키 참조 확인 → 원문 → 행으로 간다. 위키 생성(phase2)은 먼저
//     _generating 표식을 같은 방식으로 걸어야 원문을 읽고 페이지를 쓴다 - 삭제가 먼저 걸었으면 거부되고, 생성이
//     먼저 걸었으면 삭제가 그 행을 kept 로 남긴다. 그래서 '참조 확인과 원문 삭제 사이에 페이지가 생기는' 창이
//     닫힌다. frontmatter 를 통째로 쓰는 다른 작성자(phase1 의 __phase1__, 승격의 대기 표식 지우기)도 표식을 보존하는
//     조건부 쓰기만 한다 - 그들이 읽고 쓰는 틈에 걸린 표식을 지우지 못한다. 멈춘 선점(앱 종료)은
//     SOURCE_CLAIM_TTL_MS 뒤에 만료되고 다음 작업이 넘겨받는다. 승격(promote-pending)은 올리기 직전에 행을 다시 읽어
//     지워졌거나 삭제가 선점한 행에는 올리지 않고, 올린 뒤 대기 표식 지우기가 0행이면 방금 올린 객체를 되돌린다.
//
// 여기서 닫지 않는 것(서버 몫, S3 트랙): 이미 남아 있는 원문의 운영 정리 · 삭제 세대 · Storage 정리 outbox ·
// 보존 기한 크론(0056)의 원문 정리 · 승격 업로드와 그 되돌리기 사이에 앱이 죽는 경우 · 이 선점을 모르는 옛 앱과
// 서버 쪽 작성자 · 기기 시계가 TTL 이상 어긋난 경우의 만료 판단.
// 검사: src/lib/records/__tests__/delete-bulk-raw-clippings.test.ts

import * as Crypto from "expo-crypto";
import { getSupabaseClient } from "../supabase/client";
import {
  AuthSessionOwnerChangedError,
  assertExpectedSessionInsideMutation,
  captureAuthSessionExpectation,
  getAuthStorageRuntime,
} from "../auth/session-mutation";

/** storage.ts 와 같은 버킷이다. */
const BUCKET = "raw-clippings";
/** 한 묶음의 행 수. id 와 경로 목록이 in.(...) 으로 URL 에 실리므로 작게 둔다. */
const ROW_CHUNK = 50;
/** 2만 행. 넘으면 던지고, 다시 하면 남은 행부터 이어서 지운다. */
const MAX_ROW_CHUNKS = 400;
/** export-account 가 같은 쪽 크기로 이 폴더를 읽는다. */
const FOLDER_PAGE = 100;
/** 2만 개. 넘으면 던지고, 다시 하면 이어서 지운다. 끝없이 새 객체를 보여 주는 응답도 여기서 멈춘다. */
const MAX_FOLDER_ROUNDS = 200;
/** 객체 키 전체의 상한. S3 키 계약(UTF-8 1,024바이트)이고, capture.ts 는 슬러그를 자르지 않는다. */
const MAX_KEY_BYTES = 1024;
/** 선점 표식의 수명. 위키 생성 한 번 · 승격 한 번 · 삭제 한 묶음보다 넉넉히 길다. 지나면 다음 작업이 넘겨받는다. */
export const SOURCE_CLAIM_TTL_MS = 10 * 60_000;
/** 선점은 행마다 요청 하나다. 한 묶음(ROW_CHUNK) 안에서 이만큼씩 함께 보낸다. */
const CLAIM_CONCURRENCY = 8;
/** 조건부 쓰기가 동시 작성자에게 계속 지면 이만큼 다시 읽고 다시 해 본 뒤 '바쁨'으로 멈춘다. */
const CAS_ATTEMPTS = 4;

export type SourceErasureScope = { uningested: true } | { ids: string[] };

export interface SourceErasure {
  /** 원문과 함께 지운 행 수. */
  deleted: number;
  /** 위키 페이지가 가리키거나 위키 생성이 선점해 원문도 행도 남긴 행 수. */
  kept: number;
}

/** 지우지 못한 행이 남았다: 계약 밖 경로라 원문을 지울 수 없는 행(blocked) · 다른 작업과 겹쳐 이번에 선점하지 못한
 *  행(busy). 그 행들은 포인터로 남아 있고, 다시 하면 이어서 지운다. 지운 것은 지운 대로다. */
export class SourceErasureIncompleteError extends Error {
  constructor(
    readonly deleted: number,
    readonly kept: number,
    readonly blocked: number,
    readonly busy: number,
  ) {
    super(`source erasure left ${blocked + busy} row(s) in place`);
    this.name = "SourceErasureIncompleteError";
  }
}

/** 삭제가 선점한 행이다. 그 원문은 지워지는 중이므로 페이지를 만들거나 frontmatter 를 쓰지 않는다. */
export class SourceErasingError extends Error {
  constructor(readonly sourceId: string) {
    super(`source ${sourceId} is being erased`);
    this.name = "SourceErasingError";
  }
}

/** 파괴 작업 안에서 요청 하나가 끝날 때마다 부른다. 세션이 시작 때와 다르면 AuthSessionOwnerChangedError. */
export type SessionGuard = () => Promise<void>;

type Frontmatter = Record<string, unknown>;
type SourceSnapshot = { id: string; storage_path: unknown; frontmatter: Frontmatter; ingested: unknown };
type ClaimKey = "_erasing" | "_generating";
type Claim = { token: string; at: string };
const CLAIM_KEYS: readonly ClaimKey[] = ["_erasing", "_generating"];
const SNAPSHOT_COLUMNS = "id, storage_path, frontmatter, ingested";

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** export-account 의 SAFE_STORAGE_NAME 과 같은 한 단계 규칙: . · .. · 구분자 · 역슬래시 · 제어 문자 금지. 길이는 여기서
 *  보지 않는다 - 전체 키로 본다(MAX_KEY_BYTES). */
function isSafeSegment(name: string): boolean {
  if (name.length === 0 || name === "." || name === "..") return false;
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || code === 0x2f || code === 0x5c) return false;
  }
  return true;
}

function assertOwner(userId: string): void {
  if (!isSafeSegment(userId) || utf8Bytes(userId) >= MAX_KEY_BYTES) throw new Error("source erasure needs an owner id");
}

/**
 * owned: 본인 폴더(`<uid>/`)에 정확히 붙은 한 단계 이름이고 전체 키가 1,024바이트 이내 - Storage 로 지운다.
 * foreign: 본인 폴더 밖(남의 폴더 · 비슷한 접두 · 빈 값) - 이 사람의 원문일 수 없으니 Storage 에 보내지 않는다.
 * invalid: 본인 폴더인데 계약 밖(하위 경로 · . · .. · 역슬래시 · 제어 문자 · 길이 초과) - 안전하게 지울 수 없으니
 *   행을 포인터로 남기고 불완료로 끝낸다.
 */
function classifyRawPath(userId: string, path: unknown): "owned" | "foreign" | "invalid" {
  if (typeof path !== "string" || !path.startsWith(`${userId}/`)) return "foreign";
  return isSafeSegment(path.slice(userId.length + 1)) && utf8Bytes(path) <= MAX_KEY_BYTES ? "owned" : "invalid";
}

/**
 * 파괴 작업을 시작 시점의 세션에 묶어 돌린다. auth 변경 잠금(M) 안에서 돌고 - 잠금 전제는 session-mutation.ts 의
 * *InsideMutation 계약 그대로다 - 시작할 때 살아 있는 세션이 `userId`(화면이 확인받은 계정)가 아니면 요청을 하나도
 * 보내지 않고 AuthSessionOwnerChangedError 로 멈춘다. work 는 요청마다 응답 뒤에 guard 를 불러야 하고, 끝나고
 * 돌려주기 전에 한 번 더 확인한다. 토큰 갱신(세션 id 가 같다)은 바뀐 것이 아니다.
 */
export async function runBoundToOwnerSession<T>(userId: string, work: (guard: SessionGuard) => Promise<T>): Promise<T> {
  assertOwner(userId);
  const auth = getSupabaseClient().auth;
  const runtime = getAuthStorageRuntime();
  return runtime.runMutation(async () => {
    const expected = await captureAuthSessionExpectation(auth, runtime);
    if (expected.userId !== userId) throw new AuthSessionOwnerChangedError();
    const guard: SessionGuard = () => assertExpectedSessionInsideMutation(auth, expected);
    const result = await work(guard);
    await guard();
    return result;
  });
}

function frontmatterOf(value: unknown): Frontmatter {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? { ...(value as Frontmatter) } : {};
}

function claimOf(frontmatter: Frontmatter, key: ClaimKey): Claim | null {
  const value = frontmatter[key] as Partial<Claim> | null | undefined;
  if (!value || typeof value !== "object" || typeof value.token !== "string" || typeof value.at !== "string") return null;
  return { token: value.token, at: value.at };
}

/** 살아 있는 선점인가: 걸린 지 TTL 이 안 됐다. TTL 이상 미래로 찍힌 표식(시계가 크게 어긋났거나 손으로 고친 값)도
 *  살아 있다고 보지 않는다 - 어떤 표식도 행을 영원히 붙잡지 못한다. */
function claimHeld(frontmatter: Frontmatter, key: ClaimKey, now = Date.now()): boolean {
  const claim = claimOf(frontmatter, key);
  if (!claim) return false;
  const at = Date.parse(claim.at);
  return Number.isFinite(at) && Math.abs(now - at) < SOURCE_CLAIM_TTL_MS;
}

/** 승격이 올리기 직전에 묻는다: 삭제가 이 행을 선점하고 있나. */
export function isSourceBeingErased(frontmatter: unknown): boolean {
  return claimHeld(frontmatterOf(frontmatter), "_erasing");
}

function newClaim(): Claim {
  return { token: Crypto.randomUUID(), at: new Date().toISOString() };
}

type Pin = readonly [column: string, value: string | null];

/**
 * 조건부 쓰기의 조건: 이 스냅숏을 읽은 뒤 동시 작성자가 바꿨을 frontmatter 값이 그대로인가. "claims" 는 선점 표식만
 * (표식을 보존하는 최소 조건 - phase1 · 승격), "all" 은 선점을 거는 쪽이 쓰는 것으로 phase1 결과(__phase1__)와 승격의
 * 대기 표식(_storage_pending)까지 - 선점 쓰기가 그 사이에 쓰인 값을 덮지 않게. 필터로 못 박을 수 없는 값(손으로
 * 고친 표식)이면 null - 부른 쪽이 '바쁨'으로 멈춘다.
 */
function pinsFor(frontmatter: Frontmatter, scope: "claims" | "all"): Pin[] | null {
  const keys: string[] = scope === "all" ? [...CLAIM_KEYS, "__phase1__", "_storage_pending"] : [...CLAIM_KEYS];
  const pins: Pin[] = [];
  for (const key of keys) {
    const value = frontmatter[key];
    if (value === undefined || value === null) {
      pins.push([`frontmatter->${key}`, null]);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      const field = key === "__phase1__" ? "generated_at" : "token";
      const stamp = (value as Record<string, unknown>)[field];
      if (typeof stamp !== "string") return null;
      pins.push([`frontmatter->${key}->>${field}`, stamp]);
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      pins.push([`frontmatter->>${key}`, String(value)]);
    } else {
      return null;
    }
  }
  return pins;
}

type PinnableQuery = { eq(column: string, value: string): PinnableQuery; is(column: string, value: null): PinnableQuery };

function pin<Q>(query: Q, pins: readonly Pin[]): Q {
  let pinned = query as unknown as PinnableQuery;
  for (const [column, value] of pins) pinned = value === null ? pinned.is(column, null) : pinned.eq(column, value);
  return pinned as unknown as Q;
}

/**
 * frontmatter 를 스냅숏 기준으로 바꾸되, 스냅숏 이후 아무도 못 박은 값을 바꾸지 않았을 때만 쓴다. PostgREST 는
 * jsonb 를 합쳐 쓰지 못해 frontmatter 는 통째로 써야 하고, 그래서 이 조건이 선점 표식을 지키는 유일한 자리다.
 *   written: 한 행이 바뀌었다. lost: 누가 먼저 바꿨거나(다시 읽고 다시 한다) 행이 없다. unpinnable: 조건을 걸 수 없다.
 */
async function casWrite(
  userId: string,
  snapshot: SourceSnapshot,
  next: Frontmatter,
  options: { scope: "claims" | "all"; samePath?: boolean; stillUningested?: boolean; storagePath?: string },
): Promise<"written" | "lost" | "unpinnable"> {
  const pins = pinsFor(snapshot.frontmatter, options.scope);
  if (!pins) return "unpinnable";
  let query = getSupabaseClient()
    .from("sources")
    .update(
      { frontmatter: next, ...(options.storagePath !== undefined ? { storage_path: options.storagePath } : {}) },
      { count: "exact" },
    )
    .eq("user_id", userId)
    .eq("id", snapshot.id);
  if (options.samePath) {
    query = typeof snapshot.storage_path === "string"
      ? query.eq("storage_path", snapshot.storage_path)
      : query.is("storage_path", null);
  }
  if (options.stillUningested) query = query.eq("ingested", false);
  const { count, error } = await pin(query, pins);
  if (error) throw error;
  return count === 1 ? "written" : "lost";
}

function snapshotOf(row: unknown): SourceSnapshot {
  const value = row as { id: string; storage_path: unknown; frontmatter: unknown; ingested: unknown };
  return { id: value.id, storage_path: value.storage_path, frontmatter: frontmatterOf(value.frontmatter), ingested: value.ingested };
}

async function readSource(userId: string, id: string): Promise<SourceSnapshot | null> {
  const { data, error } = await getSupabaseClient()
    .from("sources")
    .select(SNAPSHOT_COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? snapshotOf(data) : null;
}

async function forEachLimited<T>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await work(items[index], index);
    }
  });
  // 하나가 던져도 나머지가 끝날 때까지 기다린다 - 잠금을 놓은 뒤에 요청이 계속 날아가지 않게.
  const settled = await Promise.allSettled(lanes);
  const failed = settled.find((lane): lane is PromiseRejectedResult => lane.status === "rejected");
  if (failed) throw failed.reason;
}

/** 이 호출이 건 표식만 걷는다. 남의 표식이나 이미 없는 행은 그대로 둔다. 계속 지면 false - 표식은 TTL 뒤에 풀린다. */
async function releaseClaim(userId: string, sourceId: string, key: ClaimKey, token: string): Promise<boolean> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const row = await readSource(userId, sourceId);
    if (!row || claimOf(row.frontmatter, key)?.token !== token) return true;
    const next = { ...row.frontmatter };
    delete next[key];
    const outcome = await casWrite(userId, row, next, { scope: "all" });
    if (outcome === "written") return true;
    if (outcome === "unpinnable") return false;
  }
  return false;
}

type ErasureClaim = { status: "claimed"; row: SourceSnapshot } | { status: "kept" | "busy" | "gone" };

/** 골라 지울 행 하나에 삭제 표식을 건다. 살아 있는 위키 생성 표식이 있으면 그 행은 kept(곧 페이지가 가리킨다).
 *  다른 삭제의 표식(앱이 멈췄거나 다른 탭)과 만료된 생성 표식은 넘겨받는다 - 삭제끼리는 서로 막을 까닭이 없다. */
async function claimForErasure(userId: string, first: SourceSnapshot, claim: Claim, uningested: boolean): Promise<ErasureClaim> {
  let row: SourceSnapshot | null = first;
  for (let attempt = 0; attempt < CAS_ATTEMPTS && row; attempt += 1) {
    if (claimHeld(row.frontmatter, "_generating")) return { status: "kept" };
    // 고르는 사이 위키로 정리됐다 - 더는 정리하지 않은 캡처가 아니다.
    if (uningested && row.ingested !== false) return { status: "kept" };
    const next: Frontmatter = { ...row.frontmatter, _erasing: claim };
    delete next._generating;
    const outcome = await casWrite(userId, row, next, { scope: "all", samePath: true, stillUningested: uningested });
    if (outcome === "written") return { status: "claimed", row: { ...row, frontmatter: next } };
    if (outcome === "unpinnable") return { status: "busy" };
    row = await readSource(userId, row.id);
  }
  return row ? { status: "busy" } : { status: "gone" };
}

/**
 * 고른 sources 행을 원문과 함께 지운다. 선점, 원문, 행(머리 주석). 던지면 그 묶음의 행은 남아 있다.
 *   { uningested: true } - ingested=false 인 행 전부(설정의 '정리하지 않은 캡처 삭제').
 *   { ids }              - 그 id 들(가져오기 철회 · 한 건 삭제). 없는 id 는 조용히 빠진다.
 * 시작한 세션에 묶여 돈다(runBoundToOwnerSession). 남은 행이 있으면 SourceErasureIncompleteError.
 */
export async function eraseSourcesWithRawClippings(userId: string, scope: SourceErasureScope): Promise<SourceErasure> {
  return runBoundToOwnerSession(userId, (guard) => eraseSourcesInSession(userId, scope, guard));
}

async function eraseSourcesInSession(userId: string, scope: SourceErasureScope, guard: SessionGuard): Promise<SourceErasure> {
  const supabase = getSupabaseClient();
  const ids = "ids" in scope ? [...new Set(scope.ids)] : null;
  const uningested = ids === null;
  const claim = newClaim();
  let deleted = 0;
  let kept = 0;
  let blocked = 0;
  let busy = 0;
  let after: string | null = null;

  for (let round = 0; ; round += 1) {
    if (round >= MAX_ROW_CHUNKS) throw new Error("source erasure bound exhausted");

    // 1. 이 묶음의 행. 정리하지 않은 캡처는 id 순서로 이어 읽는다 - 남긴 행을 다시 읽지 않는다.
    let rows: SourceSnapshot[];
    if (ids) {
      const chunk = ids.slice(round * ROW_CHUNK, (round + 1) * ROW_CHUNK);
      if (chunk.length === 0) break;
      const { data, error } = await supabase.from("sources").select(SNAPSHOT_COLUMNS).eq("user_id", userId).in("id", chunk);
      await guard();
      if (error) throw error;
      rows = (data ?? []).map(snapshotOf);
      if (rows.length === 0) continue;
    } else {
      let page = supabase
        .from("sources")
        .select(SNAPSHOT_COLUMNS)
        .eq("user_id", userId)
        .eq("ingested", false)
        .order("id", { ascending: true })
        .limit(ROW_CHUNK);
      if (after !== null) page = page.gt("id", after);
      const { data, error } = await page;
      await guard();
      if (error) throw error;
      rows = (data ?? []).map(snapshotOf);
      if (rows.length === 0) break;
      after = rows[rows.length - 1].id;
    }

    // 2. 선점. 계약 밖 경로의 행은 건드리지 않는다(포인터로 남긴다). 선점한 행만 다음으로 간다.
    const candidates = rows.filter((row) => classifyRawPath(userId, row.storage_path) !== "invalid");
    blocked += rows.length - candidates.length;
    const outcomes: ErasureClaim[] = new Array(candidates.length);
    await forEachLimited(candidates, CLAIM_CONCURRENCY, async (row, index) => {
      outcomes[index] = await claimForErasure(userId, row, claim, uningested);
    });
    await guard();
    const claimed: SourceSnapshot[] = [];
    for (const outcome of outcomes) {
      if (outcome.status === "claimed") claimed.push(outcome.row);
      else if (outcome.status === "kept") kept += 1;
      else if (outcome.status === "busy") busy += 1;
    }
    if (claimed.length === 0) continue;

    // 3. 위키 페이지가 가리키는 행은 원문도 행도 남긴다. 선점한 뒤라 이 사이에 새 페이지가 생기지 않는다.
    const { data: pages, error: pagesError } = await supabase
      .from("wiki_pages")
      .select("source_id")
      .eq("user_id", userId)
      .in("source_id", claimed.map((row) => row.id));
    await guard();
    if (pagesError) throw pagesError;
    const pinned = new Set(((pages ?? []) as { source_id: unknown }[]).map((row) => row.source_id));
    for (const row of claimed.filter((candidate) => pinned.has(candidate.id))) {
      kept += 1;
      // 걷지 못해도 행과 원문은 그대로다. 표식은 TTL 뒤에 풀린다.
      await releaseClaim(userId, row.id, "_erasing", claim.token).catch(() => false);
      await guard();
    }
    let targets = claimed.filter((row) => !pinned.has(row.id));
    if (targets.length === 0) continue;

    // 4. 선점이 아직 이 호출의 것인가. 앱이 TTL 보다 오래 멈춰 있던 사이 넘겨받힌 행은 이번에 지우지 않는다.
    const { data: held, error: heldError } = await supabase
      .from("sources")
      .select("id")
      .eq("user_id", userId)
      .in("id", targets.map((row) => row.id))
      .eq("frontmatter->_erasing->>token", claim.token);
    await guard();
    if (heldError) throw heldError;
    const ours = new Set(((held ?? []) as { id: string }[]).map((row) => row.id));
    if (ours.size < targets.length) {
      const { data: present, error: presentError } = await supabase
        .from("sources")
        .select("id")
        .eq("user_id", userId)
        .in("id", targets.filter((row) => !ours.has(row.id)).map((row) => row.id));
      await guard();
      if (presentError) throw presentError;
      busy += (present ?? []).length;
      targets = targets.filter((row) => ours.has(row.id));
      if (targets.length === 0) continue;
    }
    const targetIds = targets.map((row) => row.id);

    // 5. 원문. 지우지 않는 다른 행이 같은 경로를 가리키면 남긴다. 실패하면 이 묶음의 행은 그대로 둔 채 던진다.
    const paths = [...new Set(targets.map((row) => row.storage_path))].filter(
      (path): path is string => classifyRawPath(userId, path) === "owned",
    );
    if (paths.length > 0) {
      const { data: holders, error: holdersError } = await supabase
        .from("sources")
        .select("id, storage_path")
        .eq("user_id", userId)
        .in("storage_path", paths);
      await guard();
      if (holdersError) throw holdersError;
      const leaving = new Set(targetIds);
      const shared = new Set(
        ((holders ?? []) as { id: string; storage_path: unknown }[])
          .filter((row) => !leaving.has(row.id))
          .map((row) => row.storage_path),
      );
      const removable = paths.filter((path) => !shared.has(path));
      if (removable.length > 0) {
        const { error: removeError } = await supabase.storage.from(BUCKET).remove(removable);
        await guard();
        if (removeError) throw removeError;
      }
    }

    // 6. 행. 이 호출의 표식이 남은 행만 지운다. 모자라게 지워졌는데 지웠어야 할 행이 그대로면(RLS 거부 등) 성공으로
    //    끝내지 않는다. 그 사이 다른 곳에서 먼저 지워진 행은 실패가 아니다.
    let removal = supabase
      .from("sources")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .in("id", targetIds)
      .eq("frontmatter->_erasing->>token", claim.token);
    if (uningested) removal = removal.eq("ingested", false);
    const { count, error: deleteError } = await removal;
    await guard();
    if (deleteError) throw deleteError;
    deleted += count ?? 0;
    if ((count ?? 0) < targets.length) {
      const { data: survivors, error: survivorsError } = await supabase
        .from("sources")
        .select("id")
        .eq("user_id", userId)
        .in("id", targetIds);
      await guard();
      if (survivorsError) throw survivorsError;
      if ((survivors ?? []).length > 0) throw new Error("sources were not deleted");
    }
  }
  if (blocked > 0 || busy > 0) throw new SourceErasureIncompleteError(deleted, kept, blocked, busy);
  return { deleted, kept };
}

/**
 * 본인 원문 폴더(raw-clippings/<uid>/)를 비운다. 전체 삭제가 행을 모두 지운 뒤, 시작한 세션에 묶인 채(guard) 부른다.
 * 지울 때마다 첫 쪽부터 다시 읽는다: 지우면 뒤쪽 offset 이 당겨져 한 쪽을 건너뛸 수 있다(delete-account 의
 * 쓸기와 같은 이유). 새로 읽은 첫 쪽에 지울 것이 없을 때 끝낸다. 진척은 remove 의 응답 모양이 아니라 목록으로 본다 -
 * 지운 뒤 같은 첫 쪽이 그대로 돌아오면 지워지지 않는 것이다. 지울 수 없는 항목(하위 폴더 - 담기는 평평하게만 쓴다 -
 * 과 계약 밖 이름)은 건너뛰고 나머지를 다 지운 뒤, 비웠다고 말하지 않고 던진다. 목록 · 삭제 실패, 지워지지 않는
 * 객체, 횟수 상한도 모두 던진다.
 */
export async function eraseRawClippingFolder(userId: string, guard: SessionGuard): Promise<void> {
  assertOwner(userId);
  const bucket = getSupabaseClient().storage.from(BUCKET);
  let previous: string | null = null;

  for (let round = 0; round < MAX_FOLDER_ROUNDS; round += 1) {
    const { data, error } = await bucket.list(userId, {
      limit: FOLDER_PAGE,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    await guard();
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("raw clipping listing is not a list");

    const paths: string[] = [];
    let unremovable = 0;
    for (const item of data as unknown[]) {
      const entry = (item ?? {}) as { name?: unknown; id?: unknown };
      const path = typeof entry.name === "string" ? `${userId}/${entry.name}` : null;
      if (path !== null && typeof entry.id === "string" && classifyRawPath(userId, path) === "owned") paths.push(path);
      else unremovable += 1;
    }
    if (paths.length === 0) {
      if (unremovable > 0) throw new Error("raw clipping folder keeps entries this sweep cannot remove");
      return;
    }

    const page = JSON.stringify(paths);
    if (page === previous) throw new Error("raw clippings were not removed");
    previous = page;
    const { error: removeError } = await bucket.remove(paths);
    await guard();
    if (removeError) throw removeError;
  }
  throw new Error("raw clipping sweep bound exhausted");
}

// --- 선점을 아는 다른 작성자들 ---------------------------------------------------------------

export type GenerationClaim =
  | { status: "claimed"; token: string }
  | { status: "missing" }
  | { status: "erasing" }
  | { status: "busy" };

/**
 * 위키 생성(phase2)이 원문을 읽거나 페이지를 쓰기 전에 건다. 살아 있는 삭제 표식이 있으면 거부(erasing) - 그 원문은
 * 지워지는 중이다. 만료된 삭제 표식은 넘겨받는다. 다른 생성의 표식은 덮어쓴다(같은 자료를 두 번 만들어도 된다).
 */
export async function claimSourceForGeneration(
  userId: string,
  source: { id: string; storage_path: unknown; frontmatter: unknown; ingested?: unknown },
): Promise<GenerationClaim> {
  const claim = newClaim();
  let row: SourceSnapshot | null = snapshotOf(source);
  for (let attempt = 0; attempt < CAS_ATTEMPTS && row; attempt += 1) {
    if (claimHeld(row.frontmatter, "_erasing")) return { status: "erasing" };
    const next: Frontmatter = { ...row.frontmatter, _generating: claim };
    delete next._erasing;
    const outcome = await casWrite(userId, row, next, { scope: "all" });
    if (outcome === "written") return { status: "claimed", token: claim.token };
    if (outcome === "unpinnable") return { status: "busy" };
    row = await readSource(userId, source.id);
  }
  return row ? { status: "busy" } : { status: "missing" };
}

/** 위키 생성이 끝나면(성공이든 실패든) 자기 표식을 걷는다. 걷지 못하면 TTL 뒤에 풀린다. */
export async function releaseGenerationClaim(userId: string, sourceId: string, token: string): Promise<boolean> {
  return releaseClaim(userId, sourceId, "_generating", token);
}

/**
 * 선점이 아닌 작성자(phase1 의 __phase1__)가 frontmatter 를 지금 값에서 바꿔 쓴다. 선점 표식이 읽은 그대로일 때만
 * 쓰므로 그 사이에 걸린 표식을 지우거나 되돌리지 못한다 - 대신 다시 읽고 다시 한다. 삭제가 선점한 행에는 쓰지
 * 않는다(SourceErasingError). 행이 없으면 false.
 */
export async function writeSourceFrontmatter(
  userId: string,
  sourceId: string,
  change: (current: Frontmatter) => Frontmatter,
): Promise<boolean> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const row = await readSource(userId, sourceId);
    if (!row) return false;
    if (claimHeld(row.frontmatter, "_erasing")) throw new SourceErasingError(sourceId);
    const outcome = await casWrite(userId, row, change(row.frontmatter), { scope: "claims" });
    if (outcome === "written") return true;
    if (outcome === "unpinnable") break;
  }
  throw new Error(`source ${sourceId} frontmatter kept changing`);
}

export type PendingClear = "cleared" | "gone" | "erasing" | "moved";

/**
 * 승격(promote-pending)이 올린 뒤 대기 표식(_storage_pending · _body_fallback)을 지운다 - 안전한 키로 고쳐 올렸으면 함께
 * 가리킨다. 행이 아직 있고, 올린 쪽이 본 경로를 그대로 가리키고, 삭제가 선점하지 않았을 때만. 선점 표식을 보존하는
 * 조건부 쓰기다. cleared 가 아니면 부른 쪽이 방금 올린 객체를 되돌린다(removeRawClippingUnlessHeld).
 */
export async function clearStoragePending(
  userId: string,
  sourceId: string,
  expectedPath: string,
  healedPath?: string,
): Promise<PendingClear> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const row = await readSource(userId, sourceId);
    if (!row) return "gone";
    if (claimHeld(row.frontmatter, "_erasing")) return "erasing";
    if (row.storage_path !== expectedPath) return "moved";
    const next = { ...row.frontmatter };
    delete next._storage_pending;
    delete next._body_fallback;
    const outcome = await casWrite(userId, row, next, { scope: "claims", samePath: true, storagePath: healedPath });
    if (outcome === "written") return "cleared";
    if (outcome === "unpinnable") return "moved";
  }
  return "moved";
}

/**
 * 대기 표식을 못 지운 승격의 업로드를 되돌린다. 그 객체를 아직 쓰는 행 - 삭제가 선점하지 않은 행, 또는 위키 페이지가
 * 가리키는 행 - 이 있으면 남긴다(같은 원문을 두 행이 가리킬 수 있다). 지웠으면 true.
 */
export async function removeRawClippingUnlessHeld(userId: string, path: string): Promise<boolean> {
  assertOwner(userId);
  if (classifyRawPath(userId, path) !== "owned") return false;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("sources")
    .select("id, frontmatter")
    .eq("user_id", userId)
    .eq("storage_path", path);
  if (error) throw error;
  const holders = (data ?? []) as { id: string; frontmatter: unknown }[];
  if (holders.some((row) => !isSourceBeingErased(row.frontmatter))) return false;
  if (holders.length > 0) {
    const { data: pages, error: pagesError } = await supabase
      .from("wiki_pages")
      .select("source_id")
      .eq("user_id", userId)
      .in("source_id", holders.map((row) => row.id));
    if (pagesError) throw pagesError;
    if ((pages ?? []).length > 0) return false;
  }
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
  if (removeError) throw removeError;
  return true;
}
