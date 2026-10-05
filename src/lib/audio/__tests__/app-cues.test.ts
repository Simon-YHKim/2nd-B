import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { pocketPhoneCueAllowed, ratifyL5CueAllowed, replyCueAllowed, saveCueAllowed } from '../app-cue-gates';

// 효과음 3차 (Simon Q-261006-01~06). 소리마다 '울리면 안 되는 순간'을 순수 함수로 고정하고,
// 화면이 그 함수를 실제로 거쳐 소리를 내는지를 소스로 확인한다(렌더 테스트는 RN 0.85 에서 막혀 있다).

const root = resolve(__dirname, '../../../..');
// Windows checkouts may carry CRLF; CI checks out LF. Compare on LF.
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');

describe('reply cue', () => {
  test('a normal reply plays', () => {
    expect(replyCueAllowed({ zone: 'green', recording: false })).toBe(true);
    expect(replyCueAllowed({ zone: 'yellow', recording: false })).toBe(true);
    expect(replyCueAllowed({ zone: undefined, recording: false })).toBe(true);
  });
  test('a crisis reply and a reply during recording stay silent', () => {
    expect(replyCueAllowed({ zone: 'red', recording: false })).toBe(false);
    expect(replyCueAllowed({ zone: 'green', recording: true })).toBe(false);
  });
});

describe('save cue', () => {
  test('a record the user saved plays', () => {
    expect(saveCueAllowed({ crisis: false, recording: false })).toBe(true);
    expect(saveCueAllowed({ crisis: false, recording: false, automatic: false })).toBe(true);
  });
  test('crisis, recording and automatic keeps stay silent', () => {
    expect(saveCueAllowed({ crisis: true, recording: false })).toBe(false);
    expect(saveCueAllowed({ crisis: false, recording: true })).toBe(false);
    expect(saveCueAllowed({ crisis: false, recording: false, automatic: true })).toBe(false);
  });
});

describe('L5 ratify cue', () => {
  const base = { decision: 'ratify' as const, targetKind: 'sevenStar', persisted: true, wasL5Before: false };
  test('the first ratify that lands a life-period star at L5 plays', () => {
    expect(ratifyL5CueAllowed(base)).toBe(true);
  });
  test('decline, failed write, old-axis ratify and re-ratify stay silent', () => {
    expect(ratifyL5CueAllowed({ ...base, decision: 'decline' })).toBe(false);
    expect(ratifyL5CueAllowed({ ...base, persisted: false })).toBe(false);
    expect(ratifyL5CueAllowed({ ...base, targetKind: 'star' })).toBe(false);
    expect(ratifyL5CueAllowed({ ...base, wasL5Before: true })).toBe(false);
  });
});

describe('pocket phone cue', () => {
  const base = { wasRaised: false, raised: true, byUser: true, reducedMotion: false };
  test('raising and lowering by hand play', () => {
    expect(pocketPhoneCueAllowed(base)).toBe(true);
    expect(pocketPhoneCueAllowed({ ...base, wasRaised: true, raised: false })).toBe(true);
  });
  test('re-settling, programmatic moves and reduced motion stay silent', () => {
    expect(pocketPhoneCueAllowed({ ...base, wasRaised: true, raised: true })).toBe(false);
    expect(pocketPhoneCueAllowed({ ...base, byUser: false })).toBe(false);
    expect(pocketPhoneCueAllowed({ ...base, reducedMotion: true })).toBe(false);
  });
});

test('generated cues match their provenance record byte for byte', () => {
  const manifest = JSON.parse(read('assets/audio/GENERATED-SOURCES.json'));
  expect(manifest.license.name).toBe('Stability AI Community License');
  expect(manifest.generator.settings.dit).toBe('sm-sfx');
  expect(manifest.assets.map((a: { decision: string }) => a.decision)).toEqual([
    'Q-261006-01', 'Q-261006-02', 'Q-261006-03', 'Q-261006-04', 'Q-261006-05', 'Q-261006-06',
  ]);
  for (const asset of manifest.assets) {
    const wav = readFileSync(resolve(root, asset.file));
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.length).toBe(asset.bytes);
    expect(createHash('sha256').update(wav).digest('hex')).toBe(asset.sha256);
    expect(Math.round(((wav.length - 44) / 44100) * 1000)).toBe(asset.format.durationMs);
    expect(asset.generation.prompt.length).toBeGreaterThan(20);
    expect(asset.rawOutput.sha256).toMatch(/^[0-9a-f]{64}$/);
  }
  // The generated set has its own record. The recorded-sources file keeps exactly its two CC0 recordings.
  const recorded = JSON.parse(read('assets/audio/RECORDED-SOURCES.json'));
  for (const asset of manifest.assets) {
    expect(JSON.stringify(recorded)).not.toContain(asset.file.split('/').pop());
  }
  expect(read('docs/ASSETS.md')).toContain('Powered by Stability AI');
});

test('each screen reaches its sound only through the gate', () => {
  const secondb = read('src/app/secondb.tsx');
  expect(secondb).toContain('if (replyCueAllowed({ zone: result.reply.safety?.zone, recording: isRecordingAudioMode() })) playReplyCue();');
  expect(secondb).toContain('automatic: signal !== undefined })) playSaveCue();');
  const capture = read('src/app/capture.tsx');
  expect(capture.match(/if \(saveCueAllowed\(\{ crisis: [^}]+\}\)\) playSaveCue\(\);/g)).toHaveLength(3);
  expect(capture).toContain('saveCueAllowed({ crisis: memoCrisisDetected, recording: isRecordingAudioMode() })');
  expect(read('src/components/deep-space/DeepSpaceViews.tsx')).toContain(
    'if (saveCueAllowed({ crisis: res.followup?.zone === "red", recording: isRecordingAudioMode() })) playSaveCue();',
  );
  expect(read('src/app/interview.tsx')).toContain('if (saveCueAllowed({ crisis: false, recording: isRecordingAudioMode() })) playSaveCue();');
  const review = read('src/screens/deepspace/DeepSpaceDesignScreens.tsx');
  const wasL5 = review.indexOf('const wasL5Before = (await loadSevenRatified(userId))');
  const write = review.indexOf('persisted = await recordSevenTiers(userId, { [proposal.target.star]');
  expect(wasL5).toBeGreaterThan(0);
  // The ledger must be read before the write; read after, the new L5 row would always be there.
  expect(wasL5).toBeLessThan(write);
  expect(review).toContain('if (l5Cue) setTimeout(playRatifyCue, RATIFY_L5_CUE_DELAY_MS);');
  const phone = read('src/components/deep-space/PocketPhone.tsx');
  expect(phone).toContain('pocketPhoneCueAllowed({ wasRaised: expanded.current, raised: next, byUser: true, reducedMotion })');
  // The dashboard tap lowers the phone without settle(), so it stays silent.
  const activate = phone.slice(phone.indexOf('const activate = useCallback'), phone.indexOf('useEffect(() => {\n    if (active) return;'));
  expect(activate).not.toContain('playPhoneCue');
});
