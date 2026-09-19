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
//   골라 지울 때(정리하지 않은 캡처 · 가져오기 철회 · 한 건): 원문 먼저, 행 나중. 원문 삭제가 실패하면 그 묶음의
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
// 여기서 닫지 않는 것(서버 몫): 이미 남아 있는 원문의 운영 정리 · 삭제 트랜잭션과 Storage 정리 outbox(S3) ·
// 보존 기한 크론(0056)의 원문 정리 · 여러 기기와 탭이 동시에 담고 지우는 경합(업로드와 행 쓰기 사이,
// promote-pending 의 다시 올리기).
// 검사: src/lib/records/__tests__/delete-bulk-raw-clippings.test.ts

import { getSupabaseClient } from "../supabase/client";

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
/** export-account 의 SAFE_STORAGE_NAME 과 같은 규칙: 한 단계 이름, . · .. · 구분자 · 제어 문자 금지. */
const SAFE_NAME = /^(?!\.{1,2}$)[^/\\\u0000-\u001f\u007f]{1,255}$/u;

export type SourceErasureScope = { uningested: true } | { ids: string[] };

export interface SourceErasure {
  /** 원문과 함께 지운 행 수. */
  deleted: number;
  /** 위키 페이지가 가리켜 원문도 행도 남긴 행 수. */
  kept: number;
}

type SourcePointer = { id: string; storage_path: unknown };

function assertOwner(userId: string): void {
  if (!SAFE_NAME.test(userId)) throw new Error("source erasure needs an owner id");
}

/** 본인 폴더 안의 원문 경로인가. 밖이거나 . · .. 조각이 든 경로는 Storage 에 보내지 않는다(행은 지운다). */
function ownedRawPath(userId: string, path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith(`${userId}/`)) return false;
  return path.slice(userId.length + 1).split("/").every((segment) => SAFE_NAME.test(segment));
}

/**
 * 고른 sources 행을 원문과 함께 지운다. 원문 먼저, 행 나중(머리 주석). 던지면 그 묶음의 행은 남아 있다.
 *   { uningested: true } - ingested=false 인 행 전부(설정의 '정리하지 않은 캡처 삭제').
 *   { ids }              - 그 id 들(가져오기 철회 · 한 건 삭제). 없는 id 는 조용히 빠진다.
 */
export async function eraseSourcesWithRawClippings(
  userId: string,
  scope: SourceErasureScope,
): Promise<SourceErasure> {
  assertOwner(userId);
  const supabase = getSupabaseClient();
  const ids = "ids" in scope ? [...new Set(scope.ids)] : null;
  let deleted = 0;
  let kept = 0;
  let after: string | null = null;

  for (let round = 0; ; round += 1) {
    if (round >= MAX_ROW_CHUNKS) throw new Error("source erasure bound exhausted");

    // 1. 이 묶음의 행과 원문 경로. 정리하지 않은 캡처는 id 순서로 이어 읽는다 - 남긴 행을 다시 읽지 않는다.
    let rows: SourcePointer[];
    if (ids) {
      const chunk = ids.slice(round * ROW_CHUNK, (round + 1) * ROW_CHUNK);
      if (chunk.length === 0) break;
      const { data, error } = await supabase
        .from("sources")
        .select("id, storage_path")
        .eq("user_id", userId)
        .in("id", chunk);
      if (error) throw error;
      rows = (data ?? []) as SourcePointer[];
      if (rows.length === 0) continue;
    } else {
      let page = supabase
        .from("sources")
        .select("id, storage_path")
        .eq("user_id", userId)
        .eq("ingested", false)
        .order("id", { ascending: true })
        .limit(ROW_CHUNK);
      if (after !== null) page = page.gt("id", after);
      const { data, error } = await page;
      if (error) throw error;
      rows = (data ?? []) as SourcePointer[];
      if (rows.length === 0) break;
      after = rows[rows.length - 1].id;
    }

    // 2. 위키 페이지가 가리키는 행은 원문도 행도 남긴다.
    const { data: pages, error: pagesError } = await supabase
      .from("wiki_pages")
      .select("source_id")
      .eq("user_id", userId)
      .in("source_id", rows.map((row) => row.id));
    if (pagesError) throw pagesError;
    const pinned = new Set(((pages ?? []) as { source_id: unknown }[]).map((page) => page.source_id));
    const targets = rows.filter((row) => !pinned.has(row.id));
    kept += rows.length - targets.length;
    if (targets.length === 0) continue;
    const targetIds = targets.map((row) => row.id);

    // 3. 원문. 지우지 않는 다른 행이 같은 경로를 가리키면 남긴다. 실패하면 이 묶음의 행은 그대로 둔 채 던진다.
    const paths = [...new Set(targets.map((row) => row.storage_path))].filter(
      (path): path is string => ownedRawPath(userId, path),
    );
    if (paths.length > 0) {
      const { data: holders, error: holdersError } = await supabase
        .from("sources")
        .select("id, storage_path")
        .eq("user_id", userId)
        .in("storage_path", paths);
      if (holdersError) throw holdersError;
      const leaving = new Set(targetIds);
      const shared = new Set(
        ((holders ?? []) as SourcePointer[]).filter((row) => !leaving.has(row.id)).map((row) => row.storage_path),
      );
      const removable = paths.filter((path) => !shared.has(path));
      if (removable.length > 0) {
        const { error: removeError } = await supabase.storage.from(BUCKET).remove(removable);
        if (removeError) throw removeError;
      }
    }

    // 4. 행. 모자라게 지워졌는데 지웠어야 할 행이 그대로면(RLS 거부 등) 성공으로 끝내지 않는다. 그 사이 정리됐거나
    //    다른 곳에서 먼저 지워진 행은 실패가 아니다.
    let removal = supabase.from("sources").delete({ count: "exact" }).eq("user_id", userId).in("id", targetIds);
    if (!ids) removal = removal.eq("ingested", false);
    const { count, error: deleteError } = await removal;
    if (deleteError) throw deleteError;
    deleted += count ?? 0;
    if ((count ?? 0) < targets.length) {
      let check = supabase.from("sources").select("id").eq("user_id", userId).in("id", targetIds);
      if (!ids) check = check.eq("ingested", false);
      const { data: survivors, error: survivorsError } = await check;
      if (survivorsError) throw survivorsError;
      if ((survivors ?? []).length > 0) throw new Error("sources were not deleted");
    }
  }
  return { deleted, kept };
}

/**
 * 본인 원문 폴더(raw-clippings/<uid>/)를 비운다. 전체 삭제가 행을 모두 지운 뒤에 부른다.
 * 지울 때마다 첫 쪽부터 다시 읽는다: 지우면 뒤쪽 offset 이 당겨져 한 쪽을 건너뛸 수 있다(delete-account 의
 * 쓸기와 같은 이유). 새로 읽은 첫 쪽이 비어 있을 때만 끝낸다. 진척은 remove 의 응답 모양이 아니라 목록으로 본다 -
 * 지운 뒤 같은 첫 쪽이 그대로 돌아오면 지워지지 않는 것이다. 목록 · 삭제 실패, 지워지지 않는 객체, 하위 폴더
 * (담기는 평평하게만 쓴다 - 한 단계 목록으로는 다 볼 수 없어 비웠다고 말하지 않는다), 횟수 상한은 모두 던진다.
 */
export async function eraseRawClippingFolder(userId: string): Promise<void> {
  assertOwner(userId);
  const bucket = getSupabaseClient().storage.from(BUCKET);
  let previous: string | null = null;

  for (let round = 0; round < MAX_FOLDER_ROUNDS; round += 1) {
    const { data, error } = await bucket.list(userId, {
      limit: FOLDER_PAGE,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("raw clipping listing is not a list");

    const paths: string[] = [];
    let folders = 0;
    for (const item of data as unknown[]) {
      const entry = (item ?? {}) as { name?: unknown; id?: unknown };
      if (typeof entry.name !== "string" || !SAFE_NAME.test(entry.name)) {
        throw new Error("raw clipping listing has an unsafe name");
      }
      if (typeof entry.id === "string") paths.push(`${userId}/${entry.name}`);
      else folders += 1;
    }
    if (paths.length === 0) {
      if (folders > 0) throw new Error("raw clipping folder still has nested folders");
      return;
    }

    const page = paths.join("\n");
    if (page === previous) throw new Error("raw clippings were not removed");
    previous = page;
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) throw removeError;
  }
  throw new Error("raw clipping sweep bound exhausted");
}
