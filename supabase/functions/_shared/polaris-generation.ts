// Provider success, grounded draft persistence, and quota settlement belong to
// the server. The client cannot mint a successful generation or refund a live one.
import { FORBIDDEN_TERMS, ANALYSIS_UNIVERSAL_FORBIDDEN } from '../../../src/lib/safety/lexicon.ts';
import { INJECTION_GUARD, sanitizeUntrusted } from '../../../src/lib/llm/untrusted.ts';

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data?: unknown; error?: unknown }>;
type Evidence = { id: string; domain: string; excerpt: string };
type PolarisPrompt = { system: string; user: string };
const NARRATIVE = 'self-reported narrative (same-source)';
const DOMAINS = new Set(['infancy','school','twenties','later','work','now']);

export const POLARIS_RESPONSE_SCHEMA = {
  type: 'OBJECT', properties: { personas: { type: 'ARRAY', items: {
    type: 'OBJECT', properties: {
      id: { type: 'STRING' }, label: { type: 'STRING' }, summary: { type: 'STRING' },
      advice: { type: 'STRING' }, strengths: { type: 'ARRAY', items: { type: 'STRING' } },
      evidence: { type: 'OBJECT', properties: {
        domains: { type: 'ARRAY', items: { type: 'STRING' } },
        constructs: { type: 'ARRAY', items: { type: 'STRING' } },
      }, required: ['domains','constructs'] },
    }, required: ['label','evidence','summary'],
  } } }, required: ['personas'],
};

function snapshotPrompt(evidence: Evidence[], locale: 'en' | 'ko'): PolarisPrompt {
  return {
    system: [
      'Propose 1-3 tentative roles from the saved life-star interview excerpts. Return JSON only.',
      'Every role must cite at least one supplied domain and the supplied construct. Do not invent evidence.',
      `The only construct is: ${NARRATIVE}. Describe self-reported patterns, never measured traits.`,
      'Never use clinical or medical vocabulary. Include id, label, summary, strengths, advice, and evidence {domains,constructs}.',
      locale === 'ko' ? 'Write labels, summaries, strengths and advice in Korean.' : 'Write labels, summaries, strengths and advice in English.',
      INJECTION_GUARD[locale],
    ].join('\n'),
    user: evidence.map((row) => `Domain: ${row.domain}; source: record:${row.id}\n<UNTRUSTED type="interview_excerpt">${sanitizeUntrusted(row.excerpt)}</UNTRUSTED>`).join('\n\n'),
  };
}

export function groundedPolarisCards(text: string, evidence: readonly Evidence[]) {
  let raw: unknown;
  try { raw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ''); } catch { return []; }
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { personas?: unknown }).personas)) return [];
  const ids = new Set<string>();
  return ((raw as { personas: unknown[] }).personas).flatMap((value, index) => {
    if (!value || typeof value !== 'object') return [];
    const p = value as Record<string, unknown>;
    const ev = p.evidence as { domains?: unknown; constructs?: unknown } | undefined;
    if (!Array.isArray(ev?.domains) || !Array.isArray(ev?.constructs) || !ev.constructs.includes(NARRATIVE)) return [];
    const domains = [...new Set(ev.domains.filter((domain): domain is string =>
      typeof domain === 'string' && DOMAINS.has(domain) && evidence.some((row) => row.domain === domain)))];
    if (!domains.length) return [];
    const label = typeof p.label === 'string' ? p.label.trim().slice(0, 60) : '';
    const summary = typeof p.summary === 'string' ? p.summary.trim().slice(0, 400) : '';
    const advice = typeof p.advice === 'string' ? p.advice.trim().slice(0, 280) : '';
    const strengths = Array.isArray(p.strengths) ? p.strengths.filter((s): s is string => typeof s === 'string').map((s) => s.slice(0,80)).slice(0,5) : [];
    const surface = [label,summary,advice,...strengths].join(' ').normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
    const blocked = [...FORBIDDEN_TERMS.en,...FORBIDDEN_TERMS.ko,...ANALYSIS_UNIVERSAL_FORBIDDEN.en,...ANALYSIS_UNIVERSAL_FORBIDDEN.ko];
    if (!label || !summary || blocked.some((term) => surface.includes(term.normalize('NFKC').toLowerCase()))) return [];
    const slug = (typeof p.id === 'string' ? p.id : label).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,48);
    const id = slug || `persona-${index+1}`;
    if (ids.has(id)) return [];
    ids.add(id);
    const refs = [...new Set(domains.flatMap((domain) => evidence.filter((row) => row.domain === domain).slice(0,3).map((row) => `record:${row.id}`)))];
    return [{ id,label,summary,advice,strengths,evidence:{domains,constructs:[NARRATIVE]},
      claimStrength:2,status:'proposed',evidenceRefs:refs }];
  }).slice(0,3);
}

/** Call once, with a claimed reservation. finally refunds every non-success. */
export async function runPolarisGeneration(
  rpc: Rpc, userId: string, generationId: string,
  handle: (prompt: PolarisPrompt) => Promise<Response>,
  locale: 'en' | 'ko' = 'en',
): Promise<Response> {
  const args = { p_user_id:userId,p_generation_id:generationId };
  const claim = await rpc('claim_polaris_generation',args);
  if (claim.error || !Array.isArray(claim.data)) return Response.json({error:'polaris_reservation_required'},{status:403});
  let settled = false;
  try {
    const evidence = claim.data as Evidence[];
    if (!evidence.length || evidence.length > 18 || evidence.some((row) =>
      !row || !/^[0-9a-f-]{36}$/i.test(row.id) || !DOMAINS.has(row.domain) ||
      typeof row.excerpt !== 'string' || !row.excerpt.trim() || row.excerpt.length > 580)) {
      return Response.json({error:'polaris_evidence_changed'},{status:409});
    }
    // SQL binds these excerpts to the reserved content hashes. Client-supplied
    // prompts are never used for metered generations or their evidence links.
    const response = await handle(snapshotPrompt(evidence,locale));
    if (!response.ok) return response;
    const body = await response.clone().json() as { text?: unknown };
    const cards = groundedPolarisCards(typeof body.text === 'string' ? body.text : '',claim.data as Evidence[]);
    if (!cards.length) return Response.json({error:'polaris_no_grounded_result'},{status:502});
    const result = await rpc('settle_polaris_generation',{...args,p_cards:cards});
    if (result.error || result.data !== true) return Response.json({error:'polaris_settlement_failed'},{status:503});
    settled = true;
    return response;
  } finally {
    if (!settled) await rpc('settle_polaris_generation',{...args,p_cards:null});
  }
}
