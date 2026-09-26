import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const script = resolve(__dirname, '../rehearse-account-deletion-storage.mjs');
const preload = Buffer.from(`
  globalThis.fetch = () => {
    process.stdout.write('NETWORK_ATTEMPT');
    throw new Error('network must not be called');
  };
`).toString('base64');

describe('managed Storage rehearsal target guard', () => {
  test.each(['seed', 'assert-listed', 'assert-after-fence', 'cleanup', 'assert-empty'])(
    'rejects the production ref before networking in %s mode',
    (mode) => {
      const result = spawnSync(process.execPath, [
        '--import', `data:text/javascript;base64,${preload}`, script, mode,
      ], {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          REHEARSAL_PROJECT_REF: 'zoacryukmdeivmolvyhj',
          REHEARSAL_SUPABASE_URL: 'https://zoacryukmdeivmolvyhj.supabase.co',
          REHEARSAL_ANON_KEY: 'test-public-key',
          REHEARSAL_EMAIL: 'test@example.invalid',
          REHEARSAL_PASSWORD: 'dummy-password',
          REHEARSAL_TAG: 'fence-test',
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Only an explicitly identified isolated Supabase project is permitted');
      expect(result.stdout).not.toContain('NETWORK_ATTEMPT');
    },
  );
});
