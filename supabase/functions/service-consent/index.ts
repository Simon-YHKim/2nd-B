// No provider calls. Deploy/canary all four mode-aware proxies before enabling
// collect or exposing this writer. This function's mode is not fleet readiness.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveLlmConsentMode } from '../_shared/llm-consent.ts';
import {
  corsPreflight, isLlmJsonObject, jsonResponse, LlmBodyError,
  readLlmProxyJsonObject, userIdFromJwt,
} from '../_shared/llm-proxy-common.ts';

const REVISION = 'service-v1';
const ACK_KEYS = ['service','llmProcessing','overseasTransfer','sensitiveData','safetyNotice'];
const STATUS_KEYS = ['contract_revision','consent_version','policy_version','terms_version','state','change_token','can_grant'];
const TOKEN = /^[a-f0-9]{64}$/;
const LOCALES = new Set(['en','ko','es','pt','id']);
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value,key));
}
function validStatus(value: unknown, writing: boolean): value is Record<string, unknown> {
  if (!isLlmJsonObject(value) || !exactKeys(value,writing ? [...STATUS_KEYS,'created'] : STATUS_KEYS)) return false;
  return value.contract_revision === REVISION &&
    ['consent_version','policy_version','terms_version'].every((key) => typeof value[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value[key])) &&
    ['uncovered','granted','revoked','blocked'].includes(value.state as string) &&
    typeof value.change_token === 'string' && TOKEN.test(value.change_token) &&
    typeof value.can_grant === 'boolean' && (!writing || value.created === true);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return jsonResponse(req,{error:'method_not_allowed'},405);
  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return jsonResponse(req,{error:'missing_authorization'},401);
  // verify_jwt=true at the gateway validates the signature; this checks role/sub.
  const userId = userIdFromJwt(authorization);
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return jsonResponse(req,{error:'invalid_jwt'},401);
  const mode = resolveLlmConsentMode((name) => Deno.env.get(name));
  if (mode === null || mode === 'off') return jsonResponse(req,{error:'service_consent_unavailable'},503);

  let body: Record<string, unknown>;
  try { body = await readLlmProxyJsonObject(req,4 * 1024); }
  catch (error) {
    return jsonResponse(req,{error:'invalid_request'},error instanceof LlmBodyError && error.code === 'request_body_too_large' ? 413 : 400);
  }
  const writing = body.action === 'grant' || body.action === 'revoke';
  const acks = body.requiredAcks;
  if (body.action === 'status') {
    if (!exactKeys(body,['action'])) return jsonResponse(req,{error:'invalid_request'},400);
  } else if (!writing || !exactKeys(body,['action','contractRevision','expectedChangeToken','requiredAcks','locale']) ||
    body.contractRevision !== REVISION || typeof body.expectedChangeToken !== 'string' || !TOKEN.test(body.expectedChangeToken) ||
    typeof body.locale !== 'string' || !LOCALES.has(body.locale) || !isLlmJsonObject(acks) ||
    (body.action === 'grant'
      ? !exactKeys(acks,ACK_KEYS) || ACK_KEYS.some((key) => acks[key] !== true)
      : !exactKeys(acks,[]))) {
    return jsonResponse(req,{error:'invalid_request'},400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return jsonResponse(req,{error:'service_consent_unavailable'},503);
  try {
    const admin = createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    // One owner-bound transaction verifies CAS, writes server provenance, and
    // returns the committed state. No direct client table insert is accepted.
    const {data,error} = writing
      ? await admin.rpc('write_llm_service_consent',{
        p_user_id:userId,p_contract_revision:REVISION,p_expected_change_token:body.expectedChangeToken,
        p_action:body.action,p_required_acks:body.requiredAcks,p_locale:body.locale,
      })
      : await admin.rpc('llm_service_consent_status',{p_user_id:userId});
    if (error) {
      if (error.code === '40001' && error.message === 'llm_service_consent_changed') {
        return jsonResponse(req,{error:'service_consent_changed'},409);
      }
      if (error.code === '22023' && error.message === 'llm_service_consent_contract_changed') {
        return jsonResponse(req,{error:'service_consent_contract_changed'},409);
      }
      if (error.code === '22023') return jsonResponse(req,{error:'invalid_request'},400);
      if (error.code === '42501') return jsonResponse(req,{error:'service_consent_ineligible'},403);
      return jsonResponse(req,{error:'service_consent_unavailable'},503);
    }
    if (!validStatus(data,writing)) return jsonResponse(req,{error:'service_consent_unavailable'},503);
    return jsonResponse(req,{mode,...data});
  } catch {
    // Never expose database exceptions, tokens, request bodies or credentials.
    return jsonResponse(req,{error:'service_consent_unavailable'},503);
  }
});
