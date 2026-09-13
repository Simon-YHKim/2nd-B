// 담아 둔 자료(sources) 한 건을 끝까지 지운다 (Q-260914-01 B, 2026-09-14).
//
// 왜 새 함수인가. 대화 자동 저장(chat/autosave.ts)은 wiki_pages 가 아니라 sources 에
// 쓴다. 배송 앱에는 그 한 건을 지우는 길이 없었고(deleteSource 를 부르는 곳은
// InboxLegacy 뿐), 있던 deleteSource 는 행만 지우고 raw-clippings 본문을 남긴다
// (queries.ts 의 deleteSource 주석). "되돌릴 수 있다"고 말하려면 셋 다 지워야 한다.
//
// 순서가 계약이다.
//   1. 본인 행인지 먼저 읽는다. storage_path 도 여기서 얻는다(지운 뒤에는 모른다).
//      남의 id 는 여기서 멈추고 아무것도 지우지 않는다. RLS 가 한 번 더 막는다.
//   2. 이 자료로 만든 위키 페이지를 먼저 지운다. wiki_pages.source_id 는
//      ON DELETE SET NULL 인데 CHECK((kind = 'source') = (source_id IS NOT NULL)) 가
//      있어서(0022 의 wiki_pages_source_kind_pair) 페이지가 남아 있으면 source 삭제가 막힌다.
//   3. source 행. 0행이면 오류가 없어도 성공이 아니다(RLS 거부가 그렇게 온다). 행이
//      남아 있으면 실패로 올린다.
//   4. raw-clippings 본문. best-effort 다. 행은 이미 지워졌고 그게 사용자의 뜻이라
//      실패해도 되돌리지 않는다. 로그에는 실패 사실만 남긴다. 경로와 id 는 사용자
//      데이터를 가리키고, Storage 오류 문구에 경로가 섞여 올 수 있다.
//
// ⚠ 보안 경계는 이 함수가 아니라 RLS 다. 여기서 거는 user_id 와 경로 접두사 확인은
//   두 번째 울타리다.
// 검사: `src/lib/wiki/__tests__/delete-captured-source.test.ts`

import { getSupabaseClient } from "../supabase/client";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import { deleteWikiPage } from "./queries";
import { deleteRawClipping } from "./storage";

/** 이 사용자의 자료가 아니거나 이미 없다. 둘을 가르지 않는다 - 남의 id 가 있는지 알려주지 않는다. */
export class CapturedSourceNotFoundError extends Error {
  constructor() {
    super("captured-source-not-found");
    this.name = "CapturedSourceNotFoundError";
  }
}

export async function deleteCapturedSource(userId: string, sourceId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: source, error: lookupError } = await supabase
    .from("sources")
    .select("id, storage_path")
    .eq("user_id", userId)
    .eq("id", sourceId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!source) throw new CapturedSourceNotFoundError();
  const path = (source as { storage_path: string | null }).storage_path;

  const { data: pages, error: pagesError } = await supabase
    .from("wiki_pages")
    .select("id")
    .eq("user_id", userId)
    .eq("source_id", sourceId);
  if (pagesError) throw pagesError;
  for (const page of (pages ?? []) as { id: string }[]) {
    await deleteWikiPage(userId, page.id);
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
  // 도메인 태그가 붙은 자료였다면 별 밝기가 바뀐다. deleteRecord 와 같은 자세다.
  invalidateDomainLevels(userId);

  if (path && path.startsWith(`${userId}/`)) {
    try {
      await deleteRawClipping(path);
    } catch {
      if (typeof console !== "undefined") {
        console.warn("[wiki] captured source deleted; raw clipping removal failed");
      }
    }
  }
}
