// 담아 둔 자료(sources) 한 건을 끝까지 지운다 (Q-260914-01 B, 2026-09-14).
//
// 왜 새 함수인가. 대화 자동 저장(chat/autosave.ts)은 wiki_pages 가 아니라 sources 에
// 쓴다. 배송 앱에는 그 한 건을 지우는 길이 없었고(deleteSource 를 부르는 곳은
// InboxLegacy 뿐), 있던 deleteSource 는 행만 지우고 raw-clippings 본문을 남긴다
// (queries.ts 의 deleteSource 주석). "되돌릴 수 있다"고 말하려면 셋 다 지워야 한다.
//
// 순서가 계약이다. r3as F-02 (2026-09-14) 로 원문을 맨 앞으로 옮겼다.
//   1. 본인 행인지 먼저 읽는다. storage_path 도 여기서 얻는다. 남의 id 와 이미 없는 id 는 같은
//      답(not_deleted)으로 멈추고 아무것도 지우지 않는다 - 남의 id 가 있는지 알려주지 않는다.
//      RLS 가 한 번 더 막는다.
//   2. raw-clippings 원문. 못 지우면 여기서 멈추고 행은 건드리지 않는다. 행이 남아 있어야
//      storage_path 를 다시 읽고 다시 시도할 수 있다. 이미 없는 경로는 오류가 아니라 지운 목록에서
//      빠지는 것으로 읽는다 - Supabase 문서는 remove 가 "지운 파일" 의 목록을 돌려준다고 적는다.
//      ⚠ 실 Storage 로는 확인하지 않았다. 그 읽기가 맞으면 다시 시도는 이 단계를 그대로 지나간다.
//      경로가 본인 폴더 밖이면 지운 척하지 않는다.
//   3. 이 자료로 만든 위키 페이지. wiki_pages.source_id 는 ON DELETE SET NULL 인데
//      CHECK((kind = 'source') = (source_id IS NOT NULL)) 가 있어서(0022 의
//      wiki_pages_source_kind_pair) 페이지가 남아 있으면 source 삭제가 막힌다.
//   4. source 행. 0행이면 오류가 없어도 성공이 아니다(RLS 거부가 그렇게 온다). 행이 남아 있으면
//      실패다.
//
// ⚠ 옛 순서(페이지 -> 행 -> 원문, 원문은 best-effort)는 원문 삭제가 실패해도 성공을 돌려줬다. 그때는
//   storage_path 를 가진 행이 이미 없어서 다시 시도할 길도 없었다 - 사용자는 원문까지 지웠다고 믿는데
//   원문이 고아로 남았다. 지금 순서의 대가는 반대편에 있다: 원문을 지운 뒤 페이지나 행에서 실패하면
//   "일부만 지워짐" 이 남는다. 그것도 성공이라 하지 않는다. 다시 시도하면 이어서 지울 수 있지만 늘 끝나지는
//   않는다 - 원인이 아래 M1(다른 계정의 페이지 참조)이면 서버 스키마가 고쳐질 때까지 매번 막힌다. 셋을 한
//   트랜잭션으로 묶는 것은 서버 RPC 몫이다(PR #1814 서버 후속).
//
// 결과는 넷이고, 화면은 deleted 일 때만 뒤로 간다.
//   deleted         원문 · 승격 페이지 · 행을 모두 지웠다.
//   not_deleted     페이지와 행은 하나도 지우지 않았다. 원문 삭제 요청이 응답 전에 끊겼다면 원문은
//                   이미 없을 수 있다 - 그래서 화면 문구도 "아무것도 지우지 않았다" 고 단정하지 않는다.
//   raw_removed     원문은 지웠는데(되돌릴 수 없다) 승격 페이지나 행 정리에서 멈췄다 (r3as2 R3AS2-03). 화면이
//                   "자료가 아직 남아 있다" 고 말하지 않도록 따로 돌려준다. 업로드가 실패해 본문이 행 안
//                   (frontmatter._body_fallback)에 실린 자료는 여기에 들지 않는다 - 행이 남으면 본문 사본도 남는다
//                   (r3as3 R3AS3-M2). 그 자료는 페이지를 지웠으면 partly_deleted, 아니면 not_deleted 다.
//   partly_deleted  원문 경로가 없던 자료에서 승격 페이지를 지웠는데 행 정리에서 멈췄다.
//
// ⚠ 보안 경계는 이 함수가 아니라 RLS 다. 여기서 거는 user_id 와 경로 접두사 확인은 두 번째 울타리다.
// 로그에는 실패 사실만 남긴다. 경로와 id 는 사용자 데이터를 가리키고, Storage 오류 문구에 경로가
// 섞여 올 수 있다.
//
// 사용자가 지우는 길은 조정하는 쪽을 지난다 (4차 재게이트 G3Z-1814-1). 대화 자동 저장 실행기
// (chat/autosave-runner.ts)는 같은 자료의 원문을 되살리는 업로드를 보낼 수 있고, 그 업로드는 거둘 수 없다.
// 그 업로드가 나가 있는 동안 기록 상세가 여기서 바로 지우면 늦게 도착한 업로드가 행 없는 원문을 만든다 -
// 앱 어디에도 보이지 않고 지울 곳도 없다. 그래서 실행기가 불러올 때 coordinateCapturedSourceDeletes 로
// 자기 계정 줄을 걸고, 그 뒤로 deleteCapturedSource 는 그 줄에서 돈다. 실행기를 불러오지 않은 런타임에는
// 되살리는 업로드도 없어서 바로 지운다. 이 파일이 실행기를 import 하지 않는 것은 실행기가 이 파일을
// import 하기 때문이다(require cycle).
//
// 승격의 되살리기와는 행마다 엇갈리지 않는다 (5차 재게이트 G4Z-1814-1). 승격(promote-pending.ts)은 업로드가
// 실패해 본문이 행 안에 든 자료의 본문을 원문으로 다시 올린다 - 보고 있는 자료만이 아니라 그 계정의 보류 행
// 전부를. 그 업로드가 이 삭제와 엇갈려 원문 -> 페이지 -> 행을 다 지운 뒤에 도착하면 행 없는 원문이 남는다. 그래서
// 이 런타임의 삭제와 승격은 행마다 표식을 본다. 조정하는 쪽이 있든 없든 여기를 지나는 삭제는 모두 같다.
//   · 지우는 동안(removing) 그 행은 승격이 건너뛴다. 이 런타임이 다 지운 행(removed)도 건너뛴다 - 승격의 목록은
//     삭제보다 먼저 읽혔을 수 있다. 행 id 는 다시 쓰이지 않는다(uuid).
//   · 승격이 그 행을 되살리는 중이면(restoring) 삭제는 표식을 먼저 세우고(새 승격은 건너뛴다) 그 되살리기가
//     끝난 뒤에 지운다.
// 다른 탭 · 다른 기기의 승격과 삭제는 이 표식을 모른다(서버 S3 몫).
// 검사: `src/lib/wiki/__tests__/delete-captured-source.test.ts` · 조정된 길은 `src/lib/chat/__tests__/autosave-runner.test.ts`

import { getSupabaseClient } from "../supabase/client";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import { deleteWikiPage } from "./queries";
import { deleteRawClipping } from "./storage";

export type DeleteCapturedSourceOutcome = "deleted" | "not_deleted" | "raw_removed" | "partly_deleted";

/** 사용자의 한 건 삭제를 받아 조정하는 쪽(대화 자동 저장 실행기의 계정 줄). */
export type CapturedSourceDeleteCoordinator = (userId: string, sourceId: string) => Promise<DeleteCapturedSourceOutcome>;

let coordinator: CapturedSourceDeleteCoordinator | null = null;

/** 사용자의 한 건 삭제를 조정하는 쪽을 건다. 대화 자동 저장 실행기가 불러올 때 한 번 건다(머리 주석). */
export function coordinateCapturedSourceDeletes(next: CapturedSourceDeleteCoordinator): void {
  coordinator = next;
}

// 행 표식 (머리 주석 "승격의 되살리기와는 행마다"). 키는 계정과 행 id 다.
/** 지우는 중인 행과 그 삭제 수. */
const removing = new Map<string, number>();
/** 이 런타임이 다 지운 행. */
const removed = new Set<string>();
/** 승격이 본문을 되살리는 중인 행과 나가 있는 그 일들. */
const restoring = new Map<string, Set<Promise<void>>>();

function rowKey(userId: string, sourceId: string): string {
  return `${userId}\n${sourceId.toLowerCase()}`;
}

/** 이 런타임이 그 행을 다 지웠는가. 정확 중복으로 돌려받은 행이 그 뒤에 지워졌는지 가를 때 쓴다(대화 자동 저장 실행기). */
export function capturedSourceRemoved(userId: string, sourceId: string): boolean {
  return removed.has(rowKey(userId, sourceId));
}

/**
 * 행 안에 보류된 본문을 원문으로 되살리는 일 하나를 돌린다 - 승격(promote-pending.ts)이 부른다. 그 행을 지우는 중이거나 이 런타임이
 * 이미 지웠으면 돌리지 않고 false 다(지워지는 행이다). 도는 동안 그 행의 삭제는 이 일이 끝난 뒤에 지운다. work 가 던지면 그대로 던진다.
 */
export async function restoreCapturedSourceBody(
  userId: string,
  sourceId: string,
  work: () => Promise<void>,
): Promise<boolean> {
  const key = rowKey(userId, sourceId);
  if (removing.has(key) || removed.has(key)) return false;
  const running = work();
  const writes = restoring.get(key) ?? new Set<Promise<void>>();
  writes.add(running);
  restoring.set(key, writes);
  try {
    await running;
    return true;
  } finally {
    writes.delete(running);
    if (writes.size === 0 && restoring.get(key) === writes) restoring.delete(key);
  }
}

/** 그 행을 되살리는 승격의 일이 모두 끝날 때까지 기다린다(실패도 끝이다). */
async function restoresSettled(key: string): Promise<void> {
  for (let writes = restoring.get(key); writes && writes.size > 0; writes = restoring.get(key)) {
    await Promise.all([...writes].map((write) => write.then(noop, noop)));
  }
}

function noop(): void {}

/** 테스트 전용. 이 런타임의 행 표식을 비운다. */
export function __resetCapturedSourceRowsForTests(): void {
  removing.clear();
  removed.clear();
  restoring.clear();
}

function warnWithoutDetails(message: string): void {
  if (typeof console !== "undefined") console.warn(message);
}

/**
 * 사용자가 담아 둔 자료 한 건을 지운다 - 기록 상세가 부른다. 조정하는 쪽이 걸려 있으면 그 줄에서 돈다: 원문을 되살리는
 * 업로드가 나가 있는 자료는 지운 것으로 끝내지 않고(not_deleted, 아무것도 지우지 않았다) 업로드가 돌아온 뒤 마저 지운다.
 * 줄의 시간 상한은 줄만 넘기고 이 답은 보낸 삭제가 끝난 뒤에 온다 - 그동안 화면의 삭제 잠금이 남아 승격을 누를 수 없다(5차
 * 재게이트 G4Z-1814-1). 삭제를 보내기 전에 상한이 지나면 던진다(아무것도 지우지 않았다 - 화면은 일반 실패 안내다).
 */
export function deleteCapturedSource(userId: string, sourceId: string): Promise<DeleteCapturedSourceOutcome> {
  return coordinator ? coordinator(userId, sourceId) : removeCapturedSource(userId, sourceId);
}

/**
 * 지금 지운다. 조정하는 쪽이 자기 줄 안에서 부른다 - 화면은 deleteCapturedSource 를 부른다. 지우는 동안 그 행은 지우는 중이고(승격이
 * 건너뛴다), 승격이 그 행을 되살리는 중이면 그 일이 끝난 뒤에 지운다(머리 주석 "승격의 되살리기와는 행마다").
 */
export async function removeCapturedSource(userId: string, sourceId: string): Promise<DeleteCapturedSourceOutcome> {
  const key = rowKey(userId, sourceId);
  removing.set(key, (removing.get(key) ?? 0) + 1);
  try {
    await restoresSettled(key);
    const outcome = await removeNow(userId, sourceId);
    if (outcome === "deleted") removed.add(key);
    return outcome;
  } finally {
    const left = (removing.get(key) ?? 1) - 1;
    if (left > 0) removing.set(key, left);
    else removing.delete(key);
  }
}

async function removeNow(userId: string, sourceId: string): Promise<DeleteCapturedSourceOutcome> {
  const supabase = getSupabaseClient();

  let path: string | null;
  let hasInlineCopy: boolean;
  try {
    const { data: source, error: lookupError } = await supabase
      .from("sources")
      .select("id, storage_path, frontmatter")
      .eq("user_id", userId)
      .eq("id", sourceId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!source) return "not_deleted";
    const row = source as { storage_path: string | null; frontmatter: unknown };
    path = row.storage_path;
    // 업로드가 실패한 자료는 본문을 행 안에 든다(capture 의 _body_fallback). 원문 객체를 지워도 사본은 행에 남는다.
    const fallback =
      row.frontmatter && typeof row.frontmatter === "object"
        ? (row.frontmatter as Record<string, unknown>)._body_fallback
        : undefined;
    hasInlineCopy = typeof fallback === "string" && fallback.length > 0;
  } catch {
    return "not_deleted";
  }

  if (path) {
    if (!path.startsWith(`${userId}/`)) {
      warnWithoutDetails("[wiki] captured source not deleted; raw clipping is outside the owner folder");
      return "not_deleted";
    }
    try {
      await deleteRawClipping(path);
    } catch {
      warnWithoutDetails("[wiki] captured source not deleted; raw clipping removal failed");
      return "not_deleted";
    }
  }

  // 여기서부터 실패하면 무엇을 이미 지웠는지로 답이 갈린다. 본문 사본이 행에 있으면 행이 남는 한 원문도 남은 것이다.
  const rawRemoved = Boolean(path) && !hasInlineCopy;
  let pageRemoved = false;
  try {
    const { data: pages, error: pagesError } = await supabase
      .from("wiki_pages")
      .select("id")
      .eq("user_id", userId)
      .eq("source_id", sourceId);
    if (pagesError) throw pagesError;
    for (const page of (pages ?? []) as { id: string }[]) {
      await deleteWikiPage(userId, page.id);
      pageRemoved = true;
    }

    const { count, error: deleteError } = await supabase
      .from("sources")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("id", sourceId);
    if (deleteError) throw deleteError;
    if (!count) {
      const { data: survivor, error: survivorError } = await supabase
        .from("sources")
        .select("id")
        .eq("user_id", userId)
        .eq("id", sourceId)
        .maybeSingle();
      if (survivorError) throw survivorError;
      if (survivor) throw new Error("captured-source-not-deleted");
    }
  } catch {
    // 행 단계의 실패는 원인을 로그에 남기지 않고 화면에서 따로 말하지도 않는다 (r3as M1).
    // wiki_pages.source_id FK 에 소유자가 없어서(db/migrations/0022_wiki_rag.sql) 다른 계정의 위키
    // 페이지가 이 자료를 참조할 수 있다. 그 페이지는 RLS 때문에 위 조회에 안 보인 채 source 삭제를
    // CHECK 23514 로 막는다. 그 원인을 기기 로그에 적거나 구분해 말하면 남의 계정 데이터가 있다는
    // 신호가 된다 - 연결이 끊긴 실패와 같은 답으로 닫는다. 남의 행은 여기서 지우지 않는다.
    // 스키마 보강(소유자를 포함한 복합 FK)은 서버 후속이다(PR #1814).
    return rawRemoved ? "raw_removed" : pageRemoved ? "partly_deleted" : "not_deleted";
  }
  // 도메인 태그가 붙은 자료였다면 별 밝기가 바뀐다. deleteRecord 와 같은 자세다.
  invalidateDomainLevels(userId);
  return "deleted";
}
