// QA UI checks; may dismiss notices/onboarding, but no AI calls or record writes.
const { chromium } = require('playwright-core');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const qa = Object.fromEntries(readFileSync('.env.test', 'utf8').split(/\r?\n/).filter(l => /^QA_TEST_/.test(l)).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')];
}));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 425, height: 812 } });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const OriginalAudio = window.Audio;
    window.__cameraAudio = [];
    window.__cameraPlayers = [];
    window.Audio = class extends OriginalAudio {
      constructor(...args) {
        super(...args);
        window.__cameraPlayers.push(this);
        const source = String(args[0]).split('?')[0].split('/').pop();
        for (const event of ['playing', 'pause', 'ended', 'error']) this.addEventListener(event, () => {
          window.__cameraAudio.push({ event, src: source, rate: this.playbackRate, volume: this.volume });
        });
      }
    };
  });
  const focus = () => page.getByRole('button', { name: '지금', exact: true }).click();
  const back = () => page.getByRole('button', { name: '별자리로 돌아가기', exact: true }).last().click();
  const target = page.getByTestId('star-camera-target');
  try {
    await page.goto('http://localhost:8081/sign-in');
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
    if (page.url().includes('/ttfv')) await page.goto('http://localhost:8081/');
    await page.getByRole('button', { name: '지금', exact: true }).waitFor();
    const coach = page.getByRole('button', { name: '다시 보지 않기', exact: true });
    if (await coach.count()) await coach.click();
    const dismiss = page.getByRole('button', { name: '공지 닫기', exact: true });
    try { await dismiss.waitFor({ timeout: 2500 }); await dismiss.click({ position: { x: 4, y: 4 } }); } catch { /* no notice */ }
    for (const width of [425, 320, 768]) {
      await page.setViewportSize({ width, height: 812 });
      if (width === 320) {
        await page.getByRole('button', { name: '확대', exact: true }).click();
        await page.getByRole('button', { name: '확대', exact: true }).click();
        await page.getByRole('button', { name: '망원경 오른쪽으로', exact: true }).click();
      }
      const id = width === 768 ? 'profile' : 'now';
      const name = width === 768 ? '프로필' : '지금';
      const world = page.getByTestId('star-camera-world');
      const startMatrix = await world.evaluate(el => getComputedStyle(el).transform);
      const startBody = await page.getByTestId(`star-body-${id}`).boundingBox();
      await page.evaluate(id => {
        const world = document.querySelector('[data-testid="star-camera-world"]');
        const body = document.querySelector(`[data-testid="star-body-${id}"]`);
        const started = performance.now();
        window.__flightFrames = [];
        const sample = () => {
          const b = body.getBoundingClientRect();
          const [halo, core] = [...body.children].map(el => el.getBoundingClientRect());
          window.__flightFrames.push({
            x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width,
            sameWorld: world === document.querySelector('[data-testid="star-camera-world"]'),
            sameBody: body === document.querySelector(`[data-testid="star-body-${id}"]`),
            stars: document.querySelectorAll('[data-testid^="star-body-"]').length,
            dx: (halo.x + halo.width / 2) - (core.x + core.width / 2),
            dy: (halo.y + halo.height / 2) - (core.y + core.height / 2),
          });
          if (performance.now() - started < 1450) requestAnimationFrame(sample);
        };
        sample();
      }, id);
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(220);
      const movingSky = await page.getByTestId('star-camera-sky').evaluate(el => getComputedStyle(el).transform);
      if (width === 425) await page.screenshot({ path: path.join(__dirname, 'star-continuity-moving.png') });
      await page.waitForTimeout(1100);
      const settledSky = await page.getByTestId('star-camera-sky').evaluate(el => getComputedStyle(el).transform);
      assert.notEqual(movingSky, settledSky, 'background aim/roll progresses');
      const frame = await page.getByTestId('star-destination').boundingBox();
      const star = await target.boundingBox();
      const physicalStar = await page.getByTestId(`star-body-${id}`).boundingBox();
      const previous = Math.max(80, Math.min(frame.width - 32, frame.height - 100) * 0.92);
      assert.ok(Math.abs(star.width - previous / 2) < 0.1, 'exact half-size destination');
      assert.ok(Math.abs(physicalStar.width - star.width) < 0.1, 'the original star, not a replacement, has the target size');
      assert.ok(Math.abs(physicalStar.x - star.x) < 0.1 && Math.abs(physicalStar.y - star.y) < 0.1, 'physical star and hitbox stay aligned');
      const frames = await page.evaluate(() => window.__flightFrames);
      assert.ok(frames.length > 10);
      assert.ok(frames.every(f => f.sameWorld && f.sameBody && f.stars === 7), 'world and all neighbours stay mounted');
      assert.ok(frames.every(f => Math.abs(f.dx) < 0.1 && Math.abs(f.dy) < 0.1), 'halo and core share a centre every frame');
      assert.ok(Math.abs(frames[0].x - (startBody.x + startBody.width / 2)) < 0.1, 'flight starts at actual instrument pose');
      assert.equal(await page.getByRole('button', { name: '학창시절', exact: true }).count(), 0);
      assert.ok(await world.locator('button').evaluateAll(buttons => buttons.length === 8 && buttons.every(b => b.disabled)), 'hidden world targets cannot receive keyboard taps');
      await target.click({ position: { x: star.width / 2, y: star.height / 2 } });
      assert.equal(await page.getByTestId('star-destination').count(), 1, 'star touch stays focused');
      await page.screenshot({ path: path.join(__dirname, `star-continuity-${width}.png`) });
      await page.mouse.click(frame.x + 8, frame.y + frame.height - 8);
      await page.getByTestId('star-destination').waitFor({ state: 'detached' });
      assert.equal(await world.evaluate(el => getComputedStyle(el).transform), startMatrix, 'return restores the exact jog and zoom pose');
      const returned = await page.getByTestId(`star-body-${id}`).boundingBox();
      assert.ok(Math.abs(returned.x - startBody.x) < 0.1 && Math.abs(returned.y - startBody.y) < 0.1, 'return has no layout jump');
      console.log('CAMERA_OK', JSON.stringify({ width, id, diameter: star.width, frames: frames.length, startMatrix, start: [frames[0].x, frames[0].y], finish: [physicalStar.x + physicalStar.width / 2, physicalStar.y + physicalStar.height / 2], movingSky, settledSky }));
    }
    const normalAudio = await page.evaluate(() => window.__cameraAudio);
    assert.ok(normalAudio.some(e => e.event === 'playing' && e.rate === 0.95), 'approach sound played');
    assert.ok(normalAudio.some(e => e.event === 'playing' && e.rate === 1.3), 'retreat sound played');
    assert.ok(normalAudio.some(e => e.event === 'playing' && e.volume === 0.16), 'focus lock sound played');
    await page.evaluate(() => { window.__cameraAudio = []; });
    await focus();
    await page.waitForTimeout(140);
    await back();
    await page.getByTestId('star-destination').waitFor({ state: 'detached' });
    await page.waitForTimeout(400);
    const cancelledAudio = await page.evaluate(() => window.__cameraAudio);
    assert.ok(!cancelledAudio.some(e => e.event === 'playing' && e.volume === 0.16), 'no stale focus lock after cancellation');
    // load() resets playbackRate before queued pause events fire. Inspect the
    // released elements directly rather than assigning a pause to that rate.
    const released = await page.evaluate(() => window.__cameraPlayers.filter(p => p.volume === 0.12).every(p => p.paused && !p.getAttribute('src')));
    assert.ok(released, 'all completed/cancelled camera media are paused and released');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.getByRole('button', { name: '지금', exact: true }).waitFor();
    await page.evaluate(() => { window.__cameraAudio = []; });
    await focus();
    await page.waitForTimeout(150);
    const immediate = await target.boundingBox();
    await page.waitForTimeout(300);
    const later = await target.boundingBox();
    assert.equal(immediate.width, later.width, 'reduced motion has no animated zoom');
    const reducedAudio = await page.evaluate(() => window.__cameraAudio);
    assert.ok(!reducedAudio.some(e => e.rate === 0.95 || e.rate === 1.3 || e.volume === 0.16), 'reduced motion suppresses camera sounds');
    await back();
    await page.getByTestId('star-destination').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('AUDIO_CANCEL_REDUCED_MOTION_OK');
    console.log('PAGE_ERRORS', JSON.stringify(errors));
  } catch (error) {
    await page.screenshot({ path: path.join(__dirname, 'star-camera-error.png') });
    console.log('SCREEN', (await page.locator('body').innerText()).slice(0, 1600));
    throw error;
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
