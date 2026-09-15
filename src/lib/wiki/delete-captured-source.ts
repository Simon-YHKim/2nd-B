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
//                   "자료가 아직 남아 있다" 고 말하지 않도록 따로 돌려준다.
//   partly_deleted  원문 경로가 없던 자료에서 승격 페이지를 지웠는데 행 정리에서 멈췄다.
//
// ⚠ 보안 경계는 이 함수가 아니라 RLS 다. 여기서 거는 user_id 와 경로 접두사 확인은 두 번째 울타리다.
// 로그에는 실패 사실만 남긴다. 경로와 id 는 사용자 데이터를 가리키고, Storage 오류 문구에 경로가
// 섞여 올 수 있다.
// 검사: `src/lib/wiki/__tests__/delete-captured-source.test.ts`

import { getSupabaseClient } from "../supabase/client";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import { deleteWikiPage } from "./queries";
import { deleteRawClipping } from "./storage";

export type DeleteCapturedSourceOutcome = "deleted" | "not_deleted" | "raw_removed" | "partly_deleted";

function warnWithoutDetails(message: string): void {
  if (typeof console !== "undefined") console.warn(message);
}

export async function deleteCapturedSource(userId: string, sourceId: string): Promise<DeleteCapturedSourceOutcome> {
  const supabase = getSupabaseClient();

  let path: string | null;
  try {
    const { data: source, error: lookupError } = await supabase
      .from("sources")
      .select("id, storage_path")
      .eq("user_id", userId)
      .eq("id", sourceId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!source) return "not_deleted";
    path = (source as { storage_path: string | null }).storage_path;
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

  // 여기서부터 실패하면 무엇을 이미 지웠는지로 답이 갈린다.
  const rawRemoved = Boolean(path);
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
