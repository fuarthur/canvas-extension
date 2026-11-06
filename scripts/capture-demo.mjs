import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const server = spawn(process.execPath, ['scripts/preview.mjs', '--port=4174', '--timeout=120'], {stdio: ['ignore', 'pipe', 'pipe']});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.on('data', data => { if (data.toString().includes('Fictional demo:')) resolve(); });
    server.stderr.on('data', data => reject(new Error(data.toString())));
    server.on('error', reject);
    server.on('exit', code => { if (code) reject(new Error(`Demo server exited (${code}).`)); });
  });
  await mkdir('docs/demo', {recursive: true});
  browser = await chromium.launch({channel: 'chromium', headless: true});
  for (const scenario of ['standard', 'capacity']) {
    const context = await browser.newContext({viewport: {width: 1440, height: 1040}, timezoneId: 'Asia/Shanghai'});
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4174/?scenario=${scenario}`);
    await page.locator('#demo-status').filter({hasText: 'Ready'}).waitFor();
    const frame = page.frameLocator('iframe');
    await frame.getByRole('tab', {name: 'Planner view'}).click();
    await frame.locator('[data-control-id="Generate balanced plan"]').click();
    await frame.locator('.generated-preview').waitFor();
    if (scenario === 'standard') {
      await frame.locator('[data-control-id="Accept generated plan"]').click();
      await frame.locator('[data-control-id="Save plan"]').click();
      await frame.locator('.planner-notice').filter({hasText: 'Plan saved'}).waitFor();
      await page.screenshot({path: 'docs/demo/planner-desktop.png', fullPage: true});
      await frame.getByRole('tab', {name: 'Task list view'}).click();
      await page.screenshot({path: 'docs/demo/tasks-desktop.png', fullPage: true});
      await page.setViewportSize({width: 390, height: 844});
      await page.screenshot({path: 'docs/demo/tasks-narrow.png', fullPage: true});
    } else {
      await frame.locator('.generated-preview').evaluate(node => node.scrollIntoView({block: 'start'}));
      await page.screenshot({path: 'docs/demo/capacity-conflict.png', fullPage: true});
    }
    await context.close();
  }
  console.log('Saved 4 screenshots from fictional demo data to docs/demo/.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
