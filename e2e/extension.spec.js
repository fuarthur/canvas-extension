import {test, expect, chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';

test('built Manifest V3 extension mounts, schedules through its worker and persists a plan with simulated Canvas', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'canvas-extension-e2e-'));
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: {width: 1440, height: 1000}, timezoneId: 'Asia/Shanghai',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  try {
    const external = [];
    const now = new Date();
    const start = new Date(now.getTime() + 86400000).toISOString();
    const due = new Date(now.getTime() + 7 * 86400000).toISOString();
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'chrome-extension:') { await route.continue(); return; }
      if (url.origin !== 'https://canvas.illinois.edu') { external.push(url.origin); await route.abort(); return; }
      let value;
      if (url.pathname === '/api/v1/users/self/profile') value = {id: 900002, time_zone: 'America/Chicago'};
      else if (url.pathname === '/api/v1/courses') value = [{id: 101, name: 'SIMULATED 101'}];
      else if (url.pathname === '/api/v1/users/self/groups') value = [];
      else if (url.pathname === '/api/v1/account_calendars') value = {account_calendars: []};
      else if (url.pathname === '/api/v1/calendar_events') value = url.searchParams.get('type') === 'assignment' ? [
        {id: 'assignment_1001', title: 'Simulated integration lab', context_code: 'course_101', assignment: {due_at: due, unlock_at: start, user_submitted: false}}
      ] : [];
      else if (url.pathname === '/calendar') {
        await route.fulfill({contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Simulated Canvas</title><body><main><h1>Simulated Canvas calendar</h1><div class="calendar_view_buttons" role="tablist" aria-label="Calendar views"><button role="tab">Month</button></div></main></body></html>'}); return;
      } else { throw new Error(`Unexpected integration request: ${url.pathname}`); }
      await route.fulfill({contentType: 'application/json', body: JSON.stringify(value)});
    });
    const page = await context.newPage();
    await page.goto('https://canvas.illinois.edu/calendar');
    await page.getByRole('button', {name: 'Open planning calendar'}).click();
    await page.getByRole('tab', {name: 'Planner view'}).click();
    await page.locator('[data-control-id="New plan"]').click();
    await page.locator('[data-control-id="Generate balanced plan"]').click();
    await expect(page.locator('.generated-preview h3')).toHaveText('Generated plan preview');
    await page.locator('[data-control-id="Accept generated plan"]').click();
    await page.locator('[data-control-id="Save plan"]').click();
    await expect(page.locator('.planner-notice')).toContainText('Plan saved');
    await page.reload();
    await page.getByRole('button', {name: 'Open planning calendar'}).click();
    await page.getByRole('tab', {name: 'Planner view'}).click();
    await expect(page.locator('.plan-status')).toContainText('All tasks arranged');
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).hostname;
    await page.goto(`chrome-extension://${extensionId}/demo.html`);
    await expect(page.locator('#demo-status')).toContainText('Ready');
    await page.frameLocator('iframe').getByRole('tab', {name: 'Planner view'}).click();
    await page.frameLocator('iframe').locator('[data-control-id="Generate balanced plan"]').click();
    await expect(page.frameLocator('iframe').locator('.generated-preview h3')).toHaveText('Generated plan preview');
    expect(external).toEqual([]);
  } finally {
    await context.close();
    await rm(profile, {recursive: true, force: true});
  }
});
