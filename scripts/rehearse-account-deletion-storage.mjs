// Managed Storage API probe for the isolated 0192 account-deletion rehearsal.
// Reads credentials from the operator's process environment; never prints them.
import { createClient } from '@supabase/supabase-js';

const mode = process.argv[2];
if (!['seed', 'assert-listed', 'assert-after-fence', 'cleanup', 'assert-empty'].includes(mode)) {
  throw new Error('Usage: node scripts/rehearse-account-deletion-storage.mjs seed|assert-listed|assert-after-fence|cleanup|assert-empty');
}

const required = [
  'REHEARSAL_PROJECT_REF', 'REHEARSAL_SUPABASE_URL', 'REHEARSAL_ANON_KEY',
  'REHEARSAL_EMAIL', 'REHEARSAL_PASSWORD', 'REHEARSAL_TAG',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const ref = process.env.REHEARSAL_PROJECT_REF;
const url = new URL(process.env.REHEARSAL_SUPABASE_URL);
if (!/^[a-z0-9]{20}$/.test(ref)
    || ref === 'zoacryukmdeivmolvyhj'
    || url.origin !== `https://${ref}.supabase.co`
    || url.pathname !== '/') {
  throw new Error('Only an explicitly identified isolated Supabase project is permitted');
}
const tag = process.env.REHEARSAL_TAG;
if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(tag)) {
  throw new Error('REHEARSAL_TAG must be 3-40 lowercase letters, digits, or hyphens');
}

const client = createClient(url.origin, process.env.REHEARSAL_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signedIn, error: authError } = await client.auth.signInWithPassword({
  email: process.env.REHEARSAL_EMAIL,
  password: process.env.REHEARSAL_PASSWORD,
});
if (authError || !signedIn.user || !signedIn.session) {
  throw new Error(`Test-account sign-in failed: ${authError?.code ?? 'missing_session'}`);
}

const userId = signedIn.user.id;
const path = `${userId}/${tag}-probe.md`;
const afterPath = `${userId}/${tag}-after.md`;
const bucket = client.storage.from('raw-clippings');

if (mode === 'seed') {
  const { error } = await bucket.upload(path, new TextEncoder().encode('# fence rehearsal\n'), {
    contentType: 'text/markdown', upsert: false,
  });
  if (error) throw new Error(`Seed upload failed: ${error.status ?? 'unknown'} ${error.name}`);
  const payload = JSON.parse(Buffer.from(signedIn.session.access_token.split('.')[1], 'base64url'));
  if (payload.sub !== userId || typeof payload.session_id !== 'string') {
    throw new Error('Auth session did not expose the expected user/session identifiers');
  }
  console.log(JSON.stringify({ result: 'seeded', projectRef: ref, userId,
    sessionId: payload.session_id, path }));
}

if (mode === 'assert-listed' || mode === 'assert-empty') {
  if (typeof bucket.listV2 !== 'function') {
    throw new Error('The pinned Storage client does not expose listV2');
  }
  const { data, error } = await bucket.listV2({
    prefix: `${userId}/`, limit: 1000, with_delimiter: false,
  });
  if (error || !data || data.hasNext !== false || !Array.isArray(data.folders)
      || data.folders.length !== 0 || !Array.isArray(data.objects)) {
    throw new Error(`Unexpected listV2 contract: ${error?.status ?? 'invalid_shape'} ${error?.code ?? ''}`);
  }
  const names = data.objects.map((item) => item.name);
  if (mode === 'assert-listed' && (names.length !== 1 || names[0] !== path)) {
    throw new Error('listV2 did not return the exact pre-fence probe path');
  }
  if (mode === 'assert-empty' && names.length !== 0) {
    throw new Error('listV2 still reports owner objects after probe cleanup');
  }
  console.log(JSON.stringify({ result: mode === 'assert-listed' ? 'probe_listed' : 'owner_empty',
    projectRef: ref, userId, count: names.length }));
}

if (mode === 'assert-after-fence') {
  const { error } = await bucket.upload(afterPath,
    new TextEncoder().encode('# must be rejected\n'), {
      contentType: 'text/markdown', upsert: false,
    });
  if (!error || !String(error.message).includes('account_deletion_in_progress')) {
    throw new Error(`Expected deletion-fence rejection; got ${error?.status ?? 'success'} ${error?.code ?? ''}`);
  }
  console.log(JSON.stringify({ result: 'blocked_by_deletion_fence', projectRef: ref,
    userId, status: error.status, code: error.code ?? null }));
}

if (mode === 'cleanup') {
  const { data, error } = await bucket.remove([path]);
  if (error || !data?.some((item) => item.name === path)) {
    throw new Error(`Probe cleanup failed: ${error?.status ?? 'unconfirmed'} ${error?.code ?? ''}`);
  }
  console.log(JSON.stringify({ result: 'probe_removed', projectRef: ref, userId, path }));
}
