// External Chromium pixel check complements Orca's interaction checks.
// Only the checked-in QA account is used; credentials never appear in output.
const { chromium } = require('playwright-core');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const qa = Object.fromEntries(readFileSync(path.join(process.cwd(), '.env.test'), 'utf8').split(/\r?\n/).filter(l => /^QA_TEST_/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')]; }));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 425, height: 812 }, deviceScaleFactor: 1 });
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('http://localhost:8081/sign-in');
    await page.getByRole('textbox', { name: '이메일', exact: true }).waitFor({ timeout: 60000 });
    await page.getByRole('textbox', { name: '이메일', exact: true }).fill(qa.QA_TEST_EMAIL);
    await page.getByLabel('비밀번호', { exact: true }).fill(qa.QA_TEST_PASSWORD);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('sign-in'), { timeout: 60000 });
    console.log('AFTER_LOGIN', new URL(page.url()).pathname);
    await page.getByRole('button', { name: '내 대시보드 열기' }).or(page.getByRole('button', { name: '건너뛰기', exact: true })).first().waitFor({ timeout: 30000 });
    if (page.url().includes('onboarding')) {
      const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
      if (await skip.count()) await skip.click();
      await page.getByRole('button', { name: '계속', exact: true }).click();
    }
    await page.getByRole('button', { name: '내 대시보드 열기' }).or(page.getByRole('button', { name: '맞아요', exact: true })).first().waitFor({ timeout: 30000 });
    // The first-day review marks itself seen only once its real record loads.
    // Return without submitting a verdict or creating another QA record.
    if (page.url().includes('/ttfv')) await page.goto('http://localhost:8081/');
    await page.getByRole('button', { name: '내 대시보드 열기' }).waitFor({ timeout: 30000 });
    const coachDismiss = page.getByRole('button', { name: '다시 보지 않기', exact: true });
    if (await coachDismiss.count()) await coachDismiss.click();
    const noticeDismiss = page.getByRole('button', { name: '공지 닫기', exact: true });
    try { await noticeDismiss.waitFor({ timeout: 3000 }); await noticeDismiss.click({ position: { x: 4, y: 4 } }); } catch { /* no notice */ }
    await page.screenshot({ path: path.join(__dirname, 'home-verified.png') });
    await page.getByRole('button', { name: '지금', exact: true }).click();
    await page.getByTestId('star-destination').waitFor();
    await page.waitForTimeout(700);
    assert.equal(await page.getByRole('button', { name: '학창시절', exact: true }).count(), 0);
    await page.screenshot({ path: path.join(__dirname, 'star-focused.png') });
    await page.getByRole('button', { name: '별자리로 돌아가기', exact: true }).last().click();
    await page.getByTestId('star-destination').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '확대', exact: true }).click();
    assert.ok(Number(await page.getByRole('slider', { name: '배율 다이얼' }).getAttribute('aria-valuenow')) > 100);
    const dial = page.getByRole('slider', { name: '배율 다이얼' });
    const bounds = await dial.boundingBox();
    const beforeTurn = Number(await dial.getAttribute('aria-valuenow'));
    await page.mouse.move(bounds.x + 44, bounds.y + 12);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 68, bounds.y + 22, { steps: 6 });
    await page.mouse.move(bounds.x + 76, bounds.y + 44, { steps: 6 });
    await page.mouse.up();
    assert.ok(Number(await dial.getAttribute('aria-valuenow')) > beforeTurn, 'clockwise dial increases zoom');
    await page.getByRole('button', { name: '망원경 오른쪽으로', exact: true }).click();
    await page.getByRole('button', { name: '전체 별자리로 돌아가기', exact: true }).click();
    await page.getByRole('button', { name: '내 대시보드 열기' }).click();
    await page.waitForURL('**/dashboard');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(__dirname, 'dashboard-verified.png') });
    console.log('DASHBOARD_TEXT', (await page.locator('body').innerText()).slice(0, 3500));
    for (const tab of ['데이터', '앱', '오늘']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      assert.equal(await page.getByRole('tab', { name: tab, exact: true }).getAttribute('aria-selected'), 'true');
    }
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto('http://localhost:8081/');
      await page.getByRole('button', { name: '내 대시보드 열기' }).waitFor({ timeout: 30000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `home overflow ${width}`);
      const phone = await page.getByRole('button', { name: '내 대시보드 열기' }).boundingBox();
      assert.ok(phone.x >= 0 && phone.x + phone.width <= width, `phone in viewport ${width}`);
      await page.screenshot({ path: path.join(__dirname, `home-${width}.png`) });
    }
    await page.setViewportSize({ width: 425, height: 812 });
    await page.goto('http://localhost:8081/records');
    const graph = page.locator('svg[aria-label="기록 연결 그래프"]');
    await graph.waitFor();
    const initialBox = await graph.getAttribute('viewBox');
    for (let step = 0; step < 12; step++) await page.getByRole('button', { name: '망원경 오른쪽으로', exact: true }).click();
    assert.notEqual(await graph.getAttribute('viewBox'), initialBox);
    assert.ok(Number((await graph.getAttribute('viewBox')).split(' ')[0]) > 1000, 'pan passes original graph extent');
    await page.getByRole('button', { name: '전체 별자리로 돌아가기', exact: true }).click();
    assert.equal(await graph.getAttribute('viewBox'), initialBox);
    const graphBox = await graph.boundingBox();
    await page.mouse.move(graphBox.x + 150, graphBox.y + 180);
    await page.mouse.down();
    await page.mouse.move(graphBox.x + 230, graphBox.y + 220, { steps: 8 });
    await page.mouse.up();
    assert.equal(await graph.getAttribute('viewBox'), initialBox, 'canvas does not capture pan');
    await page.getByRole('button', { name: '확대', exact: true }).click();
    assert.notEqual(await graph.getAttribute('viewBox'), initialBox);
    await page.screenshot({ path: path.join(__dirname, 'records-instruments.png') });
    await page.goto('http://localhost:8081/wiki');
    await page.getByRole('radio', { name: '그래프', exact: true }).click();
    await page.waitForTimeout(2000);
    const wikiGraph = page.locator('svg[aria-label="위키 연결 그래프"]');
    if (await wikiGraph.count()) {
      const wikiBox = await wikiGraph.getAttribute('viewBox');
      await page.getByRole('button', { name: '확대', exact: true }).click();
      assert.notEqual(await wikiGraph.getAttribute('viewBox'), wikiBox);
      await page.getByRole('button', { name: '망원경 오른쪽으로', exact: true }).click();
      await page.getByRole('button', { name: '전체 별자리로 돌아가기', exact: true }).click();
      assert.equal(await wikiGraph.getAttribute('viewBox'), wikiBox);
    } else console.log('WIKI_EMPTY_NO_GRAPH_INTERACTION');
    console.log('WIKI_TEXT', (await page.locator('body').innerText()).slice(0, 1500));
    await page.screenshot({ path: path.join(__dirname, 'wiki-verified.png') });
    await page.goto('http://localhost:8081/core-brain');
    await page.getByText('현장 조건 검증자', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await page.getByRole('button', { name: '이 페르소나 승인', exact: true }).count(), 2);
    await page.screenshot({ path: path.join(__dirname, 'polaris-verified.png') });
    console.log('PAGE_ERRORS', JSON.stringify(errors));
    console.log('BROWSER_FLOW_OK');
  } catch (error) {
    await page.screenshot({ path: path.join(__dirname, 'external-browser-error.png') });
    console.log('ERROR_PATH', new URL(page.url()).pathname);
    console.log('ERROR_SCREEN', (await page.locator('body').innerText()).slice(0, 3000));
    throw error;
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
