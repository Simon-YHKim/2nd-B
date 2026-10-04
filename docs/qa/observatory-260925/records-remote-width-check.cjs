const { chromium } = require('playwright-core');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const qa = Object.fromEntries(readFileSync('.env.test', 'utf8').split(/\r?\n/)
  .filter(line => /^QA_TEST_/.test(line))
  .map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')];
  }));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 425, height: 812 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(30000);

  try {
    await page.goto('http://localhost:8081/sign-in');
    await page.getByRole('textbox', { name: '이메일', exact: true }).fill(qa.QA_TEST_EMAIL);
    await page.getByLabel('비밀번호', { exact: true }).fill(qa.QA_TEST_PASSWORD);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('sign-in'));
    await page.goto('http://localhost:8081/records');

    const remote = page.getByTestId('telescope-remote');
    await remote.waitFor();
    for (const width of [320, 425, 768]) {
      await page.setViewportSize({ width, height: 812 });
      await page.waitForTimeout(200);
      const bounds = await remote.boundingBox();
      const expectedWidth = Math.min(440, width - 16);
      assert.ok(Math.abs(bounds.width - expectedWidth) <= 2,
        `remote width ${bounds.width} at ${width}px should match home ${expectedWidth}px`);
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'remote stays inside viewport');
      assert.equal(await page.getByRole('switch', { name: /연결/ }).count(), 0, 'link toggle is gone');
      console.log('RECORDS_REMOTE', JSON.stringify({ viewport: width, ...bounds }));
      if (width === 425) {
        await page.screenshot({ path: path.join(__dirname, 'records-remote-full-width-425.png') });
        await page.getByRole('button', { name: '확대', exact: true }).click();
        assert.ok(Number(await page.getByTestId('telescope-zoom-slider').getAttribute('aria-valuenow')) > 100,
          'zoom still works');
      }
    }
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('RECORDS_REMOTE_OK');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
