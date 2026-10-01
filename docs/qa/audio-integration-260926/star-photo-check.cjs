// Local QA navigation only: no AI requests, record creation, or account changes.
const { chromium } = require('playwright-core');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const baseUrl = process.env.QA_BASE_URL || 'http://localhost:8082';
const artifactDir = path.resolve(process.env.QA_ARTIFACT_DIR || 'Output/audio-integration-260926/browser');
require('node:fs').mkdirSync(artifactDir, { recursive: true });
const qa = Object.fromEntries(readFileSync('.env.test', 'utf8').split(/\r?\n/).filter(l => /^QA_TEST_/.test(l)).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')];
}));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 425, height: 812 } });
  let llmRequests = 0;
  await page.route(/\/functions\/v1\/(?:openai|gemini|claude|xai)-proxy/, async route => {
    llmRequests++; await route.abort('blockedbyclient');
  });
  page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.text().includes('[ui-sound]')) console.log('AUDIO_WARNING', msg.text()); });
  await page.addInitScript(() => {
    window.__cues = []; window.__mediaEvents = [];
    window.__cuePlayers = []; window.__cueRequests = [];
    const phase = () => document.querySelector('[data-testid^="star-camera-phase-"]')?.getAttribute('data-testid');
    const OriginalAudio = window.Audio;
    window.Audio = class extends OriginalAudio {
      constructor(...args) {
        super(...args);
        window.__cuePlayers.push(this);
        for (const event of ['loadstart', 'canplay', 'playing', 'pause', 'emptied', 'error']) this.addEventListener(event, () => window.__mediaEvents.push({event, src: String(args[0]), phase: phase(), time: performance.now(), ready: this.readyState}));
        // Metro carries the asset name in its query string, not the basename.
        this.addEventListener('playing', () => window.__cues.push({ src: decodeURIComponent(String(args[0])).match(/(?:observatory-(?:ratchet|focus-lock|shutter)|jrpg-text-blip)/)?.[0] ?? 'other', time: performance.now(), phase: phase() }));
      }
      play() {
        window.__cueRequests.push({ src: decodeURIComponent(this.src).match(/observatory-(?:ratchet|focus-lock|shutter)/)?.[0], phase: phase() });
        return super.play();
      }
    };
  });
  const ready = () => page.getByTestId('star-camera-phase-ready').waitFor();
  const select = () => page.getByRole('button', { name: '프로필', exact: true }).click();
  const travel = () => page.getByRole('button', { name: '여행하기', exact: true });
  const returnToSky = async () => {
    await page.getByRole('button', { name: '별자리로 돌아가기', exact: true }).last().click();
    await page.getByTestId('star-destination').waitFor({ state: 'detached' });
  };
  const sample = async () => page.evaluate(() => {
    window.__photoFrames = [];
    const start = performance.now();
    const frame = () => {
      const body = document.querySelector('[data-testid="star-body-profile"]')?.getBoundingClientRect();
      const phase = document.querySelector('[data-testid^="star-camera-phase-"]')?.getAttribute('data-testid')?.replace('star-camera-phase-', '');
      const flash = document.querySelector('[data-testid="star-camera-flash"]');
      const button = document.querySelector('button[aria-label="여행하기"]');
      window.__photoFrames.push({ time: performance.now() - start, phase, width: body?.width, x: body ? body.x + body.width / 2 : 0, y: body ? body.y + body.height / 2 : 0, travelEnabled: !!button && !button.disabled, flash: !!flash, opacity: flash ? Number(getComputedStyle(flash).opacity) : 0, path: location.pathname });
      if (performance.now() - start < 2200) requestAnimationFrame(frame);
    };
    frame();
  });
  try {
    await page.goto(`${baseUrl}/sign-in`);
    await page.getByRole('textbox', { name: '이메일', exact: true }).fill(qa.QA_TEST_EMAIL);
    await page.getByLabel('비밀번호', { exact: true }).fill(qa.QA_TEST_PASSWORD);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('sign-in'));
    await page.getByRole('button', { name: '지금', exact: true }).or(page.getByRole('button', { name: '건너뛰기', exact: true })).first().waitFor();
    if (page.url().includes('onboarding')) {
      await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
      await page.getByRole('button', { name: '계속', exact: true }).click();
    }
    await page.getByRole('button', { name: '지금', exact: true }).or(page.getByRole('button', { name: '맞아요', exact: true })).first().waitFor();
    if (page.url().includes('/ttfv')) await page.goto(`${baseUrl}/`);
    await page.getByRole('button', { name: '프로필', exact: true }).waitFor();
    const coach = page.getByRole('button', { name: '다시 보지 않기', exact: true });
    try { await coach.waitFor({ timeout: 10000 }); await coach.click(); } catch { /* already dismissed */ }
    const dismiss = page.getByRole('button', { name: '공지 닫기', exact: true });
    try { await dismiss.waitFor({ timeout: 10000 }); await dismiss.click({ position: { x: 4, y: 4 } }); } catch { /* no notice */ }

    await sample(); await select();
    await ready();
    assert.equal(await travel().isEnabled(), true);
    const frames = await page.evaluate(() => window.__photoFrames);
    const phases = [...new Set(frames.map(f => f.phase).filter(Boolean))];
    assert.deepEqual(phases, ['aim', 'zoom', 'focus', 'ready']);
    assert.ok(frames.filter(f => ['aim', 'zoom', 'focus'].includes(f.phase)).every(f => !f.travelEnabled), 'travel unavailable before focus lock, even before typewriter finishes');
    const widths = phase => frames.filter(f => f.phase === phase).map(f => f.width);
    assert.ok(Math.max(...widths('aim')) - Math.min(...widths('aim')) < 0.1, 'aim does not zoom');
    assert.ok(Math.max(...widths('zoom')) > Math.min(...widths('zoom')) * 2, 'zoom follows aim');
    const settled = frames.at(-1);
    assert.ok(Math.max(...widths('focus')) > settled.width * 1.015, 'visible lens breathing at focus');
    assert.ok(frames.filter(f => f.phase === 'focus').every(f => Math.abs(f.x - settled.x) < 0.2 && Math.abs(f.y - settled.y) < 0.2), 'autofocus never slides the star');
    const cues = await page.evaluate(() => window.__cues);
    for (const file of ['observatory-ratchet', 'observatory-focus-lock']) assert.ok(cues.some(c => c.src.includes(file)), `recorded cue played: ${file}`);
    const motorRequests = await page.evaluate(() => window.__cueRequests.filter(c => c.src === 'observatory-ratchet'));
    assert.equal(motorRequests.length, 1, 'aim and zoom share exactly one play request, not a phase restart');
    assert.equal(motorRequests[0].phase, 'star-camera-phase-aim', 'motor starts during aim, not a later phase');
    assert.ok(cues.filter(c => c.src === 'observatory-focus-lock').every(c => c.phase === 'star-camera-phase-ready'), 'double beep occurs at focus lock');
    assert.ok(await page.evaluate(() => window.__cuePlayers.filter(p => p.loop).every(p => p.paused)), 'motor stopped before focus lock');
    await page.screenshot({ path: path.join(artifactDir, 'star-photo-ready.png') });
    console.log('PHASES_OK', JSON.stringify({ phases, width: settled.width, frames: frames.length, cues: cues.map(c => c.src) }));

    await returnToSky();
    await page.evaluate(() => { window.__cues = []; });
    await select(); await page.waitForTimeout(150);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await ready(); await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => window.__cuePlayers.filter(p => p.loop).every(p => p.paused)), 'blur stops automatic motor');
    assert.ok(!(await page.evaluate(() => window.__cues)).some(c => c.src === 'observatory-focus-lock'), 'no delayed double beep after blur');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await returnToSky(); await select(); await ready();
    console.log('AUTOMATIC_BLUR_NO_STALE_BEEP_OK');

    // Escape and browser focus loss must never run a delayed navigation.
    for (const cancel of ['escape', 'blur']) {
      await travel().click();
      await page.getByTestId('star-camera-shutter').waitFor();
      if (cancel === 'escape') await page.keyboard.press('Escape');
      else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.getByTestId('star-camera-shutter').waitFor({ state: 'detached' });
      await page.waitForTimeout(550);
      assert.equal(new URL(page.url()).pathname, '/');
      assert.equal(await travel().isEnabled(), true);
      console.log('CANCEL_OK', cancel);
      if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    }

    // Rapid repeated clicks still produce one exposure and one route entry.
    await page.evaluate(() => {
      window.__entries = [];
      for (const name of ['pushState', 'replaceState']) {
        const original = history[name].bind(history);
        history[name] = (...args) => {
          if (String(args[2]).includes('/me/profile')) window.__entries.push({ flash: !!document.querySelector('[data-testid="star-camera-flash"]'), time: performance.now() });
          return original(...args);
        };
      }
    });
    await sample();
    const button = await travel().boundingBox();
    await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2, { clickCount: 2, delay: 25 });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-testid="star-camera-flash"]')).opacity) > 0.15);
    assert.equal(new URL(page.url()).pathname, '/', 'flash remains on the source screen');
    await page.screenshot({ path: path.join(artifactDir, 'star-photo-flash.png') });
    await page.waitForURL('**/me/profile');
    await page.waitForTimeout(450);
    const exposure = await page.evaluate(() => ({ frames: window.__photoFrames, entries: window.__entries, cues: window.__cues }));
    const lit = exposure.frames.filter(f => f.flash);
    assert.ok(lit.length > 2 && Math.max(...lit.map(f => f.opacity)) > 0.5, 'single visible flash pulse');
    assert.ok(lit.every(f => f.path === '/'), 'no route entry while flash is visible');
    assert.equal(exposure.entries.length, 1, 'exactly one navigation');
    assert.ok(exposure.cues.some(c => c.src.includes('observatory-shutter')), 'recorded shutter audio played');
    assert.equal(await page.getByTestId('star-camera-shutter').count(), 0);
    console.log('EXPOSURE_OK', JSON.stringify({ frames: lit.length, peak: Math.max(...lit.map(f => f.opacity)), entries: exposure.entries.length, destination: new URL(page.url()).pathname }));

    // Leave via navigation while exposing: the hidden home must not navigate back.
    await page.goBack(); await select(); await ready();
    await travel().click(); await page.getByTestId('star-camera-shutter').waitFor();
    await page.getByRole('tab', { name: '설정', exact: true }).click();
    await page.waitForURL('**/settings'); await page.waitForTimeout(600);
    assert.equal(new URL(page.url()).pathname, '/settings');
    console.log('ROUTE_EXIT_CANCEL_OK');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${baseUrl}/`);
    await select(); await ready();
    await page.evaluate(() => { window.__cues = []; });
    await sample(); await travel().click(); await page.waitForURL('**/me/profile');
    const reduced = await page.evaluate(() => ({ frames: window.__photoFrames, cues: window.__cues }));
    assert.ok(reduced.frames.every(f => !f.flash), 'no reduced-motion flash');
    assert.ok(!reduced.cues.some(c => c.src.includes('observatory-shutter')), 'no reduced-motion shutter sound');
    assert.deepEqual(errors, []);
    console.log('REDUCED_MOTION_OK'); console.log('PAGE_ERRORS', JSON.stringify(errors)); console.log('LLM_REQUESTS_BLOCKED', llmRequests); assert.equal(llmRequests, 0);
  } catch (e) {
    console.log('AUDIO_DEBUG', JSON.stringify(await page.evaluate(() => ({ cues: window.__cues, requests: window.__cueRequests, mediaEvents: window.__mediaEvents, hidden: document.hidden, focused: document.hasFocus(), players: window.__cuePlayers?.map(p => ({ src: p.src, loop: p.loop, volume: p.volume, paused: p.paused, ready: p.readyState, error: p.error?.message })) }))));
    await page.screenshot({ path: path.join(artifactDir, 'star-photo-error.png') });
    console.log('SCREEN', (await page.locator('body').innerText()).slice(0, 1400));
    throw e;
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
