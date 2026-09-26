// Dedicated QA login. UI only; populated wiki responses are browser-local fixtures.
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
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__motorPlayers = []; window.__motorFrames = [];
    window.addEventListener('pointerup', () => { window.__lastPointerRelease = performance.now(); });
    const OriginalAudio = window.Audio;
    window.Audio = class extends OriginalAudio {
      constructor(...args) {
        super(...args); window.__motorPlayers.push(this);
        this.addEventListener('playing', () => {
          if (this.loop || !window.__stopNextOneShot) return;
          window.__stopNextOneShot = false;
          const wasPlaying = !this.paused;
          window.dispatchEvent(new Event('blur'));
          window.__oneShotProbe = { wasPlaying, stopped: this.paused, volume: this.volume };
        });
      }
    };
    const frame = () => {
      const active = window.__motorPlayers.filter(p => p.loop && !p.paused);
      if (active.length) window.__motorFrames.push({ time: performance.now(), count: active.length, cursor: active[0].currentTime, period: active[0].duration, volume: active[0].volume });
      requestAnimationFrame(frame);
    };
    frame();
  });
  const stick = page.getByTestId('telescope-joystick');
  const slider = page.getByTestId('telescope-zoom-slider');
  let mode = 'home';
  const origins = {};
  const pose = () => page.evaluate(mode => {
    if (mode === 'home') {
      const m = new DOMMatrix(getComputedStyle(document.querySelector('[data-testid="star-camera-world"]')).transform);
      return [m.e, m.f, m.a];
    }
    const svg = document.querySelector('svg[aria-label]');
    return svg.getAttribute('viewBox').split(/\s+/).map(Number);
  }, mode);
  const zoom = async () => Number(await slider.getAttribute('aria-valuenow')) / 100;
  const reset = async () => {
    await page.getByRole('button', { name: '전체 별자리로 돌아가기', exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal(await zoom(), 1, mode + ': origin return resets magnification');
    assert.deepEqual(await pose(), origins[mode], mode + ': origin return resets camera position');
  };
  async function hold(x, y, duration = 450) {
    await page.evaluate(() => { window.__motorFrames = []; });
    const b = await stick.boundingBox();
    const travel = (b.width - 28) / 2;
    const before = await pose();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + x * travel, b.y + b.height / 2 + y * travel, { steps: 4 });
    await page.waitForTimeout(duration / 2); const halfway = await pose();
    await page.waitForTimeout(duration / 2); const end = await pose();
    await page.mouse.up(); await page.waitForTimeout(160);
    const stopped = await pose(); await page.waitForTimeout(200);
    assert.deepEqual(await pose(), stopped, mode + ': release stops motion');
    const thumb = await page.getByTestId('telescope-stick-thumb').evaluate(el => {
      const m = new DOMMatrix(getComputedStyle(el).transform); return [m.e, m.f];
    });
    assert.deepEqual(thumb, [0, 0], 'stick returns to centre');
    const audio = await page.evaluate(() => ({ frames: window.__motorFrames, silent: window.__motorPlayers.filter(p => p.loop).every(p => p.paused) }));
    const distance = Math.hypot(end[0] - before[0], end[1] - before[1]);
    assert.ok(audio.silent, mode + ': release stops the motor');
    if (distance === 0) assert.equal(audio.frames.length, 0, 'dead zone is silent');
    else {
      assert.ok(audio.frames.length > 5, mode + ': recorded motor runs while holding');
      assert.ok(audio.frames.every(f => f.count === 1 && Math.abs(f.period - 0.16) < 0.001 && f.volume === 0.08), 'one quiet 160ms recorded loop');
      const wraps = audio.frames.filter((f, i) => i > 0 && f.cursor < audio.frames[i - 1].cursor).length;
      assert.ok(wraps >= 1, mode + ': ratchet repeats without new pointer events');
      console.log('MOTOR_LOOP_OK', JSON.stringify({ mode, frames: audio.frames.length, wraps, period: audio.frames[0].period, stop: audio.silent }));
    }
    return { before, halfway, end, distance: Math.hypot(end[0] - before[0], end[1] - before[1]) };
  }
  try {
    await page.goto(`${baseUrl}/sign-in`);
    await page.getByRole('textbox', { name: '이메일', exact: true }).fill(qa.QA_TEST_EMAIL);
    await page.getByLabel('비밀번호', { exact: true }).fill(qa.QA_TEST_PASSWORD);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('sign-in'));
    await stick.or(page.getByRole('button', { name: '건너뛰기', exact: true })).first().waitFor();
    if (page.url().includes('onboarding')) {
      await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
      await page.getByRole('button', { name: '계속', exact: true }).click();
      await stick.or(page.getByRole('button', { name: '맞아요', exact: true })).first().waitFor();
    }
    if (page.url().includes('/ttfv')) await page.goto(`${baseUrl}/`);
    await stick.waitFor();
    origins.home = await pose();
    const coach = page.getByRole('button', { name: '다시 보지 않기', exact: true });
    // Coaching loads asynchronously after the scene; do not start a canvas drag underneath it.
    try { await coach.waitFor({ timeout: 10000 }); await coach.click(); } catch { /* already dismissed */ }
    // Notices are gated behind coaching, so dismiss them second.
    const dismiss = page.getByRole('button', { name: '공지 닫기', exact: true });
    try { await dismiss.waitFor({ timeout: 10000 }); await dismiss.click({ position: { x: 4, y: 4 } }); } catch { /* no notice */ }

    for (const width of [425, 320, 768]) {
      await page.setViewportSize({ width, height: 812 }); await page.waitForTimeout(150);
      const panel = await page.getByTestId('telescope-remote').boundingBox();
      assert.ok(panel.width > 180 && panel.x >= 0 && panel.x + panel.width <= width, 'panel fits screen');
      assert.ok(panel.height <= 106, 'panel height at most half of the old 202px plus rounding');
      const j = await stick.boundingBox();
      const group = await page.getByTestId('telescope-zoom-group').boundingBox();
      assert.ok(j.x + j.width <= group.x && j.y < group.y + group.height && group.y < j.y + j.height, 'direction and zoom share one row');
      for (const name of ['축소', '확대', '전체 별자리로 돌아가기']) {
        const key = await page.getByRole('button', { name, exact: true }).boundingBox();
        assert.ok(key.width >= 44 && key.height >= 44, `${name}: touch area at least 44px`);
        assert.ok(key.x >= panel.x && key.x + key.width <= panel.x + panel.width, `${name}: inside panel`);
      }
      const phone = await page.getByRole('button', { name: '내 대시보드 열기', exact: true }).boundingBox();
      assert.ok(phone.x >= panel.x + panel.width && phone.x + phone.width <= width, 'phone does not overlap');
      const readout = await page.getByTestId('telescope-zoom-readout').evaluate(el => ({ width: el.clientWidth, text: el.scrollWidth }));
      assert.ok(readout.text <= readout.width, 'zoom value is not truncated');
      const b = await slider.boundingBox();
      await page.evaluate(() => { window.__motorFrames = []; });
      await page.mouse.move(b.x + b.width * 0.2, b.y + 32); await page.mouse.down();
      await page.waitForTimeout(50);
      const during = await zoom(); assert.ok(during > 1 && during < 3);
      // Jump to a new target immediately before release; a long stepped drag can
      // already have settled by the time Playwright returns under a busy CPU.
      await page.mouse.move(b.x + b.width * 0.75, b.y + 32);
      await page.mouse.up();
      const releasedAt = await page.evaluate(() => window.__lastPointerRelease);
      await page.waitForTimeout(350); const chosen = await zoom();
      const zoomAudio = await page.evaluate(() => ({ frames: window.__motorFrames, stopped: window.__motorPlayers.filter(p => p.loop).every(p => p.paused) }));
      assert.ok(zoomAudio.frames.some(f => f.time > releasedAt), 'ratchet follows zoom easing after pointer release');
      assert.ok(zoomAudio.stopped, 'ratchet stops when zoom settles');
      console.log('ZOOM_AUDIO_TAIL_OK', JSON.stringify({ width, afterReleaseFrames: zoomAudio.frames.filter(f => f.time > releasedAt).length, stopped: zoomAudio.stopped }));
      console.log('SLIDER', JSON.stringify({ width, b, during, chosen }));
      assert.ok(Math.abs(chosen - Math.pow(3, 0.75)) < 0.02, 'absolute slider mapping');
      await page.waitForTimeout(180); assert.equal(await zoom(), chosen, 'zoom stays after release');
      await slider.focus(); await page.keyboard.press('End'); await page.waitForTimeout(350); assert.equal(await zoom(), 3);
      await page.keyboard.press('Home'); await page.waitForTimeout(350); assert.equal(await zoom(), 1);
      // The accessible readout rounds to 2 decimals, before the easing tail
      // necessarily reaches its exact endpoint on a loaded browser.
      await page.waitForFunction(() => window.__motorPlayers.filter(p => p.loop).every(p => p.paused));
      await page.evaluate(() => { window.__motorFrames = []; });
      await page.keyboard.press('Home'); await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.__motorFrames.length), 0, 'zoom endpoint is silent');
      await reset();
      const dead = await hold(0.05, 0.02, 200); assert.equal(dead.distance, 0);
      const slow = await hold(0.35, 0); await reset(); const fast = await hold(1, 0); await reset();
      assert.ok(fast.distance > slow.distance * 3, 'outer stick is faster than precision region');
      assert.ok(fast.end[0] < fast.halfway[0] && fast.halfway[0] < fast.before[0], 'held stick continues moving right with no new event');
      const diagonal = await hold(0.8, -0.8); assert.ok(diagonal.end[0] < diagonal.before[0] && diagonal.end[1] > diagonal.before[1]);
      await reset();
      await page.screenshot({ path: path.join(artifactDir, 'remote-home-' + width + '.png') });
      console.log('REMOTE_HOME_OK', JSON.stringify({ width, panel, chosen, slow: slow.distance, fast: fast.distance, diagonal: diagonal.end }));
    }
    // Cancel/blur must not resume from stale pointer moves while still held.
    for (const event of ['pointercancel', 'blur']) {
      const b = await stick.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width - 14, b.y + b.height / 2);
      await page.waitForTimeout(180); await page.evaluate(event => window.dispatchEvent(new Event(event)), event);
      const stopped = await pose(); await page.mouse.move(b.x + b.width - 12, b.y + b.height / 2 + 2); await page.waitForTimeout(300);
      assert.deepEqual(await pose(), stopped, event + ' stops and rejects stale moves');
      await page.mouse.up();
      assert.ok(await page.evaluate(() => window.__motorPlayers.filter(p => p.loop).every(p => p.paused)), event + ' stops audio');
      if (event === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    }
    await reset(); await stick.focus(); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(220);
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(180); await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp');
    const keyed = await pose(); await page.waitForTimeout(200); assert.deepEqual(await pose(), keyed, 'keyboard release stops');
    assert.ok(keyed[0] < 0 && keyed[1] > 0); await reset();

    const touch = await page.context().newCDPSession(page);
    const tb = await stick.boundingBox(); const touchStart = await pose();
    const point = { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - 30, y: point.y + 30 }] });
    await page.waitForTimeout(350);
    const touchMoved = await pose(); assert.ok(touchMoved[0] > touchStart[0] && touchMoved[1] < touchStart[1], 'touch diagonal');
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100); const touchStopped = await pose(); await page.waitForTimeout(200);
    assert.deepEqual(await pose(), touchStopped, 'touch release stops'); await reset();
    console.log('REMOTE_TOUCH_KEYBOARD_CANCEL_BLUR_OK'); await touch.detach();
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.__stopNextOneShot = true; });
    await page.getByRole('button', { name: '전체 별자리로 돌아가기', exact: true }).click();
    await page.waitForFunction(() => window.__oneShotProbe);
    const stoppedCue = await page.evaluate(() => window.__oneShotProbe);
    assert.deepEqual(stoppedCue, { wasPlaying: true, stopped: true, volume: 0.08 });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => window.__motorPlayers.every(p => p.paused)), 'focus must not replay cancelled cue');
    console.log('ONE_SHOT_BLUR_NO_REPLAY_OK', JSON.stringify(stoppedCue));

    await page.getByRole('tab', { name: '위키', exact: true }).click(); mode = 'records'; await stick.waitFor();
    await page.setViewportSize({ width: 425, height: 812 }); await page.waitForTimeout(250);
    origins.records = await pose();
    await slider.focus(); await page.keyboard.press('End'); await page.waitForTimeout(350); assert.equal(await zoom(), 2.6);
    const graph = await hold(0.8, -0.8); assert.ok(graph.end[0] > graph.before[0] && graph.end[1] < graph.before[1]);
    await reset(); await page.screenshot({ path: path.join(artifactDir, 'remote-records.png') });
    console.log('REMOTE_RECORDS_OK', JSON.stringify(graph));

    // No persisted wiki writes. Fill the existing data contract in this browser only.
    await page.route('**/rest/v1/wiki_pages?*', route => route.fulfill({ json: [
      { id: 'remote-a', slug: 'remote-a', title: 'Camera fixture A', kind: 'concept', body_md: '', tags: [], updated_at: '2026-09-25T00:00:00Z' },
      { id: 'remote-b', slug: 'remote-b', title: 'Camera fixture B', kind: 'entity', body_md: '', tags: [], updated_at: '2026-09-25T00:00:00Z' },
    ] }));
    await page.route('**/rest/v1/wiki_links?*', route => route.fulfill({ json: [{ from_page: 'remote-a', to_page: 'remote-b' }] }));
    await page.goto(`${baseUrl}/wiki`); mode = 'wiki';
    await page.getByRole('radio', { name: '그래프', exact: true }).click(); await stick.waitFor();
    origins.wiki = await pose();
    await stick.scrollIntoViewIfNeeded();
    await slider.focus(); await page.keyboard.press('End'); await page.waitForTimeout(350); assert.equal(await zoom(), 2.6);
    const wiki = await hold(-0.8, 0.8); assert.ok(wiki.end[0] < wiki.before[0] && wiki.end[1] > wiki.before[1]);
    await reset(); await page.screenshot({ path: path.join(artifactDir, 'remote-wiki-fixture.png'), fullPage: true });
    console.log('REMOTE_WIKI_FIXTURE_OK', JSON.stringify(wiki));
    assert.deepEqual(errors, []); console.log('PAGE_ERRORS', JSON.stringify(errors)); console.log('LLM_REQUESTS_BLOCKED', llmRequests); assert.equal(llmRequests, 0);
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, 'remote-error.png'), fullPage: true });
    console.log('SCREEN', (await page.locator('body').innerText()).slice(0, 1500)); throw error;
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
