import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import {
  brightenCue, milestoneDoneCueAllowed, pocketPhoneCueAllowed, ratifyL5CueAllowed, replyCueAllowed, saveCueAllowed,
  welcomeCueAllowed,
} from '../app-cue-gates';
import { GLOBAL_CUE_IDS, onGlobalCue, requestGlobalCue } from '../global-cues';

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
    'Q-261006-12', 'Q-261006-13',
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

describe('star brighten cue', () => {
  test('a rise within L1-L4 plays once, however many stars rose', () => {
    const r = brightenCue({ school: 2, work: 1 }, { school: 3, work: 2 }, false);
    expect(r.play).toBe(true);
    expect(r.next).toEqual({ school: 3, work: 2 });
  });
  test('the first visit and a star seen for the first time only record', () => {
    expect(brightenCue(null, { school: 3 }, false)).toEqual({ play: false, next: { school: 3 } });
    expect(brightenCue({ school: 3 }, { school: 3, work: 2 }, false)).toEqual({ play: false, next: { school: 3, work: 2 } });
  });
  test('a failed read (everything L1) never lowers the record, so the next good read is not a rise', () => {
    const afterFailure = brightenCue({ school: 3 }, { school: 1 }, false);
    expect(afterFailure).toEqual({ play: false, next: { school: 3 } });
    expect(brightenCue(afterFailure.next, { school: 3 }, false).play).toBe(false);
  });
  test('L5 belongs to the ratify cue, and reduced motion silences but still records', () => {
    expect(brightenCue({ school: 3 }, { school: 5 }, false)).toEqual({ play: false, next: { school: 5 } });
    expect(brightenCue({ school: 2 }, { school: 3 }, true)).toEqual({ play: false, next: { school: 3 } });
  });
});

describe('onboarding welcome cue', () => {
  test('only entering the app without skipping plays', () => {
    expect(welcomeCueAllowed({ destination: '/', skipped: false })).toBe(true);
    expect(welcomeCueAllowed({ destination: '/', skipped: true })).toBe(false);
    expect(welcomeCueAllowed({ destination: '/sign-in', skipped: false })).toBe(false);
    expect(welcomeCueAllowed({ destination: '/sign-up', skipped: false })).toBe(false);
  });
  test('a global request reaches every host and stops after unsubscribe', () => {
    const heard: string[] = [];
    const off = onGlobalCue((id) => heard.push(id));
    requestGlobalCue('onboardingWelcome');
    off();
    requestGlobalCue('onboardingWelcome');
    expect(heard).toEqual(['onboardingWelcome']);
  });
});

test('brighten and welcome reach their sounds through the gate', () => {
  const shell = read('src/components/deep-space/DeepSpaceShell.tsx');
  expect(shell).toContain('const cue = brightenCue(seen, b.starLevels, brighten.current.reducedMotion);');
  expect(shell).toContain('if (cue.play) brighten.current.play();');
  expect(shell).toContain('await writeStarLastSeen(userId, cue.next);');
  const onboarding = read('src/app/onboarding.tsx');
  expect(onboarding).toContain('if (welcomeCueAllowed({ destination, skipped })) requestGlobalCue("onboardingWelcome");');
  expect(onboarding).toContain('onPress={() => { setSkipped(true); setStep(AUTH_STEP); }}');
  // The welcome cue must outlive router.replace, so it is played by the root host, never by the screen.
  expect(onboarding).not.toContain('useUiSound');
  expect(read('src/app/_layout.tsx')).toContain('<GlobalCueHost />');
  expect(read('src/components/audio/GlobalCueHost.tsx')).toContain('useGlobalCueHost();')
  for (const host of ['src/lib/audio/use-global-cue-host.ts', 'src/lib/audio/use-global-cue-host.web.ts']) {
    expect(read(host)).toContain('onGlobalCue((id) => {');
  }
  expect(read('src/lib/account/local-purge.ts')).toContain('observe(() => purgeStarLastSeenForDeletedAccount(owner)),');
});

describe('milestone done cue', () => {
  test('only the tap that lands on done plays', () => {
    expect(milestoneDoneCueAllowed({ from: 'doing', to: 'done' })).toBe(true);
    expect(milestoneDoneCueAllowed({ from: 'todo', to: 'doing' })).toBe(false);
    expect(milestoneDoneCueAllowed({ from: 'done', to: 'todo' })).toBe(false);
    // A write that leaves it done (no change) is not a new completion.
    expect(milestoneDoneCueAllowed({ from: 'done', to: 'done' })).toBe(false);
  });
});

test('every global cue id has a sound file, and each request site is gated by success', () => {
  const cues = read('src/lib/audio/app-cues.ts');
  for (const id of GLOBAL_CUE_IDS) expect(cues).toMatch(new RegExp(`\\n  ${id}: [A-Z_0-9]+_CUE,`));
  const native = read('src/lib/audio/use-global-cue-host.ts');
  for (const id of GLOBAL_CUE_IDS) expect(native).toContain(`${id}: useCuePlayer(GLOBAL_CUE_SOUNDS.${id}),`);
  // North Star sentence: after the crisis branch returned, right before leaving.
  const northstar = read('src/app/northstar.tsx');
  const nsCue = northstar.indexOf('requestGlobalCue("polarisRatified");');
  expect(nsCue).toBeGreaterThan(northstar.indexOf('if (res.followup?.zone === "red") {'));
  expect(nsCue).toBeLessThan(northstar.indexOf('router.back();\n    } catch {'));
  // Role card: only after the ratify write resolved for the same owner.
  const core = read('src/app/core-brain.tsx');
  expect(core.indexOf('requestGlobalCue("polarisRatified");')).toBeGreaterThan(core.indexOf('const next = await ratifyRoleCard(userId, card);'));
  expect(read('src/components/quant/QuantSaveCelebration.tsx')).toContain('requestGlobalCue("quantSaved");');
  // Purchase: the store-confirmed branch only.
  const plans = read('src/screens/deepspace/dds-plans-screen.tsx');
  const purchased = plans.indexOf('if (outcome.status === "purchased") {');
  const cancelled = plans.indexOf('} else if (outcome.status === "cancelled") {');
  const buyCue = plans.indexOf('requestGlobalCue("planPurchased");');
  expect(buyCue).toBeGreaterThan(purchased);
  expect(buyCue).toBeLessThan(cancelled);
  // Reward: only when the grant itself said granted (an unattributable watch returns before the grant).
  expect(plans).toContain('if (grant === "granted") requestGlobalCue("rewardCredited");');
  expect(read('src/app/secondb.tsx')).toContain('await grantChatAdBonus(userId);\n              // 보상 소리');
  // Import: only when something new landed.
  expect(read('src/screens/deepspace/import/ImportHubScreen.tsx')).toContain('if (landedNew) playImportCue();');
  expect(read('src/screens/deepspace/dds-import-inbox-screens.tsx')).toContain('if (tally.imported > 0) playImportCue();');
  // Wiki link: confirm only, throttled.
  expect(read('src/app/digest.tsx')).toContain('playLinkCue(); // 위키 연결 확인 소리(Q-261006-14). 거절은 무음.');
  expect(read('src/screens/deepspace/DeepSpaceDesignScreens.tsx')).toContain('playLinkCue(); // 위키 연결 확인 소리(Q-261006-14)');
  expect(cues).toContain('export const WIKI_LINK_CUE: AppCue = {\n  source: SECONDB_REPLY_CUE.source,\n  volume: 0.08,\n  minIntervalMs: 1500,');
  // Milestone: after the write, gated on landing on done.
  expect(read('src/screens/deepspace/ops/screens.tsx')).toContain('if (milestoneDoneCueAllowed({ from: m.status, to: NEXT_STATUS[m.status] })) playDoneCue();');
});
