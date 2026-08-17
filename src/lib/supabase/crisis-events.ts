// C3-adjacent: RED-zone crisis events log to a SEPARATE restricted-access table
// (crisis_events, migration 0012). Categorical info only — never raw user text.
// Per docs/research/batches/crisis-detection.md §"Logging policy".
//
// Like audit.ts, this module is restricted by ESLint + boundary script —
// only src/lib/llm/gemini.ts may import it. Direct access would let a
// component bypass the wrapper's required pre-pass + fixed-template return.

import { getSupabaseClient } from "./client";

export interface CrisisEventInsert {
  classifierConfidence: number;
  triggerCategories: string[];
  cssrsLevel: number | null;
  routingTemplateVersion: string;
  locale: "en" | "ko";
}

// crisis_events is RLS deny-all (0012, service-role-only by design), so a direct
// authenticated client INSERT is silently denied -- that dropped every client-side
// RED log (re-audit H3). Writes now go through the log_crisis_event SECURITY
// DEFINER RPC (0040), which writes server-side, hardcodes zone='red', and stamps
// user_id_hash from auth.uid() (never client input). The callAdvisor input-RED and
// web-lexicon paths short-circuit before the proxy, so this client RPC -- not a
// proxy-only write -- is what actually fills the ledger.
export async function insertCrisisEvent(meta: CrisisEventInsert): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("log_crisis_event", {
    p_classifier_confidence: meta.classifierConfidence,
    p_trigger_categories: meta.triggerCategories,
    // 최소화 (법률 검토 Q4, 2026-08-17). cssrs_level 은 C-SSRS - 자살 위험도를
    // 재는 **임상 척도**다. 그 숫자를 사람마다 저장하면 PIPA 제23조 민감정보
    // (건강) 처리로 설계해야 하고, 검토 의견은 그 경우 §15①5호(긴급 생명·신체)
    // 를 원용할 수 없어 근거가 §23①1호 별도 동의뿐이라고 본다. 지금 그 동의는
    // 받고 있지 않다.
    //
    // 그리고 이 값을 **읽는 코드가 저장소 전체에 0건**이다(2026-08-17 확인).
    // 라우팅은 zone 이 하고, 그건 따로 남는다. 즉 쓸모는 없고 위험만 남는 항목
    // 이라 더 쓰지 않는다. 컬럼 자체와 기존 행의 처리는 Simon 결정 사항이라
    // 여기서 건드리지 않았다 - 파괴적이고 되돌릴 수 없다.
    p_cssrs_level: null,
    p_routing_template_version: meta.routingTemplateVersion,
    p_locale: meta.locale,
  });
  if (error) throw error;
}
