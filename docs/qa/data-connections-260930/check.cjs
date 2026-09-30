// /data-connections browser check (Simon 2026-09-30 localhost feedback).
// Session-only server (8082) evidence, not the app: run against
//   node scripts/app-parity.cjs serve --port=8082 --allow-diff
// Local QA navigation only: after sign-in every non-GET request to Supabase and every
// LLM proxy call is aborted, so nothing is written to the account. The refresh time is
// saved to this throwaway browser context's localStorage only.
//
//   QA_BASE_URL=http://localhost:8082/2nd-B QA_ARTIFACT_DIR=Output/data-conn-260930/browser node docs/qa/data-connections-260930/check.cjs
const { chromium } = require('playwright-core');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const baseUrl = process.env.QA_BASE_URL || 'http://localhost:8082/2nd-B';
const artifactDir = path.resolve(process.env.QA_ARTIFACT_DIR || 'Output/data-conn-260930/browser');
mkdirSync(artifactDir, { recursive: true });
const qa = Object.fromEntries(readFileSync('.env.test', 'utf8').split(/\r?\n/).filter((l) => /^QA_TEST_/.test(l)).map((l) => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')];
}));
const results = [];
const ok = (name, detail = '') => { results.push({ name, ok: true, detail }); console.log('OK', name, detail); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  let blockedWrites = 0;
  let signedIn = false;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\/functions\/v1\/(?:openai|gemini|claude|xai)-proxy/, (route) => route.abort('blockedbyclient'));
  await page.route(/supabase\.co\/(?:rest|functions|storage)\/v1\//, (route) => {
    if (signedIn && route.request().method() !== 'GET' && route.request().method() !== 'HEAD' && route.request().method() !== 'OPTIONS') {
      blockedWrites++; return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(120000);
  try {
    await page.goto(`${baseUrl}/sign-in`);
    await page.getByRole('textbox', { name: '이메일', exact: true }).fill(qa.QA_TEST_EMAIL);
    await page.getByLabel('비밀번호', { exact: true }).fill(qa.QA_TEST_PASSWORD);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.includes('sign-in'));
    signedIn = true;
    await page.waitForTimeout(4000);
    await page.goto(`${baseUrl}/data-connections`);
    const title = page.getByText('저장된 데이터 새로고침', { exact: true });
    await title.waitFor();
    await page.getByText(/최근 읽은 시각|아직 읽은 데이터가 없어요/).first().waitFor();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactDir, '01-refresh-card.png') });

    // 1-4, 7: removed controls and copy.
    assert.equal(await page.getByRole('radiogroup').count(), 0, 'interval radiogroup removed');
    for (const gone of ['켜짐 · 반복 간격과 기준 시각을 아래에서 정하세요.', '기준 시각 (24시간)', '기준 시각부터 선택한 간격마다', '직접 저장하거나 가져오기를 승인한 자료예요', '시각 저장']) {
      assert.equal(await page.getByText(gone).count(), 0, `removed: ${gone}`);
    }
    assert.equal(await page.locator('input').count(), 0, 'no typed time box');
    ok('removed-controls', 'radiogroup 0 · 문구 5종 0 · input 0');

    // 5: refresh is a full-width button.
    const refresh = page.getByRole('button', { name: '새로고침', exact: true });
    const card = page.getByRole('switch', { name: '자동 새로고침' });
    const trigger = page.getByRole('button', { name: /자동 새로고침 시각/ });
    const [refreshBox, triggerBox] = [await refresh.boundingBox(), await trigger.boundingBox()];
    assert.ok(refreshBox && triggerBox, 'boxes');
    assert.ok(Math.abs(refreshBox.width - triggerBox.width) <= 2, `refresh ${refreshBox.width} vs full-width trigger ${triggerBox.width}`);
    assert.ok(refreshBox.width > 300, `refresh is wide: ${refreshBox.width}`);
    ok('refresh-full-width', `${Math.round(refreshBox.width)}px`);
    assert.ok(await card.isVisible());

    // 6: the trigger shows the daily time and opens the wheel sheet.
    await page.getByText('매일 오전 7:00', { exact: true }).waitFor();
    ok('daily-default', '매일 오전 7:00');
    await trigger.click();
    const period = page.getByRole('slider', { name: '오전 또는 오후' });
    const hour = page.getByRole('slider', { name: '시', exact: true });
    const minute = page.getByRole('slider', { name: '분', exact: true });
    await minute.waitFor();
    const value = (slider) => slider.getAttribute('aria-valuetext');
    assert.deepEqual([await value(period), await value(hour), await value(minute)], ['오전', '7', '00']);
    const [pBox, hBox, mBox] = [await period.boundingBox(), await hour.boundingBox(), await minute.boundingBox()];
    assert.ok(pBox.x < hBox.x && hBox.x < mBox.x, 'Korean order: 오전/오후 · 시 · 분');
    await page.screenshot({ path: path.join(artifactDir, '02-sheet-open.png') });
    ok('sheet-order', 'period < hour < minute');

    // Tap the faded neighbour below, keyboard, mouse wheel and drag.
    await hour.getByText('8', { exact: true }).click();
    assert.equal(await value(hour), '8');
    await minute.focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await value(minute), '05');
    await minute.hover();
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(150);
    assert.equal(await value(minute), '10');
    const hb = await hour.boundingBox();
    const cx = hb.x + hb.width / 2; const cy = hb.y + hb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let dy = 0; dy >= -52; dy -= 4) await page.mouse.move(cx, cy + dy);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const dragged = await value(hour);
    await period.getByText('오후', { exact: true }).click();
    assert.equal(await value(period), '오후');
    ok('wheel-input', `tap 8 · ArrowUp 05 · wheel 10 · drag → ${dragged} · 오후`);
    await page.screenshot({ path: path.join(artifactDir, '03-sheet-changed.png') });

    await page.getByRole('button', { name: '저장', exact: true }).click();
    await minute.waitFor({ state: 'detached' });
    const expected = `매일 오후 ${dragged}:10`;
    await page.getByText(expected, { exact: true }).waitFor();
    ok('save', expected);

    // Persisted per account on this device, and re-opening starts from the saved value.
    await page.reload();
    await page.getByText(expected, { exact: true }).waitFor();
    ok('persisted', expected);

    // Escape and the scrim close without saving.
    await trigger.click(); await minute.waitFor();
    await minute.focus(); await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Escape');
    await minute.waitFor({ state: 'detached' });
    assert.equal(await page.getByText(expected, { exact: true }).count(), 1, 'escape did not save');
    await trigger.click(); await minute.waitFor();
    await page.mouse.click(195, 40);
    await minute.waitFor({ state: 'detached' });
    assert.equal(await page.getByText(expected, { exact: true }).count(), 1, 'scrim tap did not save');
    ok('cancel-paths', 'Escape · scrim');

    // 8: phone-first groups and the merged manual card.
    for (const heading of ['폰 권한으로 읽기', '가져오기가 필요한 자료', '직접 기록']) await page.getByText(heading, { exact: true }).waitFor();
    // Brand names carry no-break spaces so "Nike Run Club" stays on one line.
    await page.getByText(/^Instagram\s·\sFacebook\s·\sX\s·\sNike\sRun\sClub\s·\sLINE\s·\sWhatsApp$/).waitFor();
    // Headers render as heading elements, and PlainText keeps "·" off a line start with a
    // no-break space on web, so match by text pattern instead of exact DOM text.
    const labels = [/^폰 권한으로 읽기$/, /^건강\s·\s운동$/, /^Garmin Connect$/, /^가져오기가 필요한 자료$/, /^장소\s·\sGPS$/, /^일정$/, /^할 일$/, /^KakaoTalk$/, /^SMS$/, /^직접 기록$/];
    const order = [];
    for (const label of labels) {
      const box = await page.getByText(label).first().boundingBox();
      order.push(box ? box.y : -1);
    }
    assert.ok(order.every((y) => y >= 0), `all headings found: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'group order');
    ok('groups', order.map(Math.round).join(' < '));
    await page.getByText(/^Garmin Connect$/).first().scrollIntoViewIfNeeded();
    await page.getByText(/^가져오기가 필요한 자료$/).first().evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(artifactDir, '04-sources-import.png') });
    await page.getByText(/^직접 기록$/).first().evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(artifactDir, '05-sources-manual.png') });

    // No horizontal scroll at phone widths.
    for (const width of [320, 375, 425]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `no horizontal overflow at ${width}: ${overflow}`);
    }
    await page.setViewportSize({ width: 320, height: 700 });
    await trigger.click(); await minute.waitFor();
    await page.screenshot({ path: path.join(artifactDir, '06-sheet-320.png') });
    await page.keyboard.press('Escape');
    ok('widths', '320 · 375 · 425 overflow 0');

    assert.deepEqual(errors, [], 'no page errors');
    ok('page-errors', '0');
    console.log('BLOCKED_WRITES', blockedWrites);
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, 'failure.png') }).catch(() => {});
    console.error('FAIL', error.message);
    results.push({ name: 'failure', ok: false, detail: error.message });
    process.exitCode = 1;
  } finally {
    writeFileSync(path.join(artifactDir, 'results.json'), JSON.stringify({ baseUrl, results, errors, blockedWrites }, null, 2));
    await browser.close();
  }
})();
