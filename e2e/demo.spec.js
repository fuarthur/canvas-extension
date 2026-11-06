import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const control = (frame, id) => frame.locator(`[data-control-id="${id}"]`);
async function openDemo(page, scenario = 'standard') {
  await page.goto(`/?scenario=${scenario}`);
  await expect(page.getByRole('status')).toContainText('Ready');
  const frame = page.frameLocator('iframe');
  await frame.getByRole('tab', {name: 'Planner view'}).click();
  return frame;
}
async function generate(frame) {
  await control(frame, 'Generate balanced plan').click();
  await expect(frame.locator('.generated-preview')).toBeVisible();
}
async function acceptAndSave(frame) {
  await control(frame, 'Accept generated plan').click();
  await control(frame, 'Save plan').click();
  await expect(frame.locator('.planner-notice')).toContainText('Plan saved');
}

test('sample import → estimates → availability → generate → complete → replan → reload', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const frame = await openDemo(page);
  await frame.getByRole('tab', {name: 'Task list view'}).click();
  await expect(frame.locator('[data-task-row]')).toHaveCount(8); // 6 pending assignments + 2 fixed events
  await control(frame, 'Open Reading reflection').click();
  await control(frame, 'Estimated effort minutes').fill('75');
  await control(frame, 'Save estimated effort').click();
  await expect(frame.locator('[data-effort-status]')).toContainText('Effort saved');
  await control(frame, 'Close details').click();
  await frame.getByRole('tab', {name: 'Planner view'}).click();
  await control(frame, 'Update plan task data').click();
  await control(frame, 'Expand plan settings').click();
  await control(frame, 'Thu capacity minutes').fill('150');
  await control(frame, 'Thu capacity minutes').press('Tab');
  await generate(frame);
  await expect(frame.locator('.generated-preview h3')).toHaveText('Generated plan preview');
  await acceptAndSave(frame);
  await expect(frame.locator('.plan-status')).toContainText('All tasks arranged');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Ready');
  await frame.getByRole('tab', {name: 'Planner view'}).click();
  await expect(frame.locator('.plan-status')).toContainText('All tasks arranged');
  await frame.getByRole('tab', {name: 'Task list view'}).click();
  await frame.locator('[data-task-row="assignment:101"]').getByRole('button', {name: /Complete Reading reflection/}).click();
  await frame.getByRole('tab', {name: 'Planner view'}).click();
  await generate(frame);
  await acceptAndSave(frame);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Ready');
  await frame.getByRole('tab', {name: 'Task list view'}).click();
  await expect(frame.locator('[data-task-row="assignment:101"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('insufficient time shows every missing task and minute and persists a partial plan', async ({page}) => {
  const frame = await openDemo(page, 'capacity');
  await generate(frame);
  const preview = frame.locator('.generated-preview');
  await expect(preview).toContainText('Partial plan preview');
  await expect(preview).toContainText('Systems lab');
  await expect(preview).toContainText('120 min missing');
  await expect(preview).toContainText('Design critique');
  await expect(preview).toContainText('90 min missing');
  await acceptAndSave(frame);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Ready');
  await frame.getByRole('tab', {name: 'Planner view'}).click();
  await expect(frame.locator('.plan-status')).toContainText('3h 30m unassigned');
  await expect(frame.locator('.plan-status')).not.toContainText('All tasks arranged');
});

test('a failed save preserves the draft, permits retry, and restores the saved plan', async ({page}) => {
  const frame = await openDemo(page);
  await control(frame, 'Expand plan settings').click();
  await control(frame, 'Plan name').fill('Retry demonstration');
  await control(frame, 'Plan name').press('Tab');
  await page.getByRole('button', {name: 'Fail next save'}).click();
  await control(frame, 'Save plan').click();
  await expect(frame.locator('.planner-notice')).toContainText('Could not save');
  await expect(control(frame, 'Plan name')).toHaveValue('Retry demonstration');
  await control(frame, 'Save plan').click();
  await expect(frame.locator('.planner-notice')).toContainText('Plan saved');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Ready');
  await frame.getByRole('tab', {name: 'Planner view'}).click();
  await expect(control(frame, 'Plan name')).toHaveValue('Retry demonstration');
});

test('narrow layout supports keyboard tabs and has no serious accessibility violations', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  const frame = await openDemo(page);
  await expect(frame.locator('.plan-status')).toBeVisible();
  const plannerAudit = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(plannerAudit.violations.filter(issue => ['serious', 'critical'].includes(issue.impact))).toEqual([]);
  await frame.getByRole('tab', {name: 'Planner view'}).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(frame.getByRole('tab', {name: 'Planning calendar view'})).toHaveAttribute('aria-selected', 'true');
  const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter(issue => ['serious', 'critical'].includes(issue.impact))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a changed deadline invalidates the saved task basis and can be replanned explicitly', async ({page}) => {
  const frame = await openDemo(page);
  await generate(frame);
  await acceptAndSave(frame);
  await page.getByRole('button', {name: 'Simulate deadline change'}).click();
  await expect(control(frame, 'Update plan task data')).toBeVisible();
  await control(frame, 'Generate balanced plan').click();
  await expect(frame.locator('.planner-notice')).toContainText('Update plan task data');
  await expect(frame.locator('.generated-preview')).toHaveCount(0);
  await control(frame, 'Update plan task data').click();
  await generate(frame);
  await expect(frame.locator('.generated-preview h3')).toHaveText('Partial plan preview');
  await expect(frame.locator('.generated-preview')).toContainText('Systems lab');
  await expect(frame.locator('.generated-preview')).toContainText('120 min missing');
  await acceptAndSave(frame);
});

test('demo loads and generates without making external requests', async ({page}) => {
  const external = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.origin); await route.abort(); }
    else await route.continue();
  });
  const frame = await openDemo(page);
  await generate(frame);
  await acceptAndSave(frame);
  expect(external).toEqual([]);
});

test('two demo tabs preserve a plan save and a concurrent task estimate', async ({page, context}) => {
  const frame = await openDemo(page);
  await control(frame, 'Expand plan settings').click();
  await control(frame, 'Plan name').fill('Two-tab study plan');
  await control(frame, 'Plan name').press('Tab');
  const other = await context.newPage();
  const otherFrame = await openDemo(other);
  await otherFrame.getByRole('tab', {name: 'Task list view'}).click();
  await control(otherFrame, 'Open Reading reflection').click();
  await control(otherFrame, 'Estimated effort minutes').fill('90');
  // Effort already saves on blur. Drive that contract directly; an explicit
  // click can race the blur save's replacement of its now-disabled button.
  await Promise.all([control(frame, 'Save plan').click(), control(otherFrame, 'Estimated effort minutes').press('Tab')]);
  await expect(frame.locator('.planner-notice')).toContainText('Plan saved');
  await expect(otherFrame.locator('[data-effort-status]')).toContainText('Effort saved');
  await other.close();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Ready');
  await frame.getByRole('tab', {name: 'Planner view'}).click();
  await control(frame, 'Expand plan settings').click();
  await expect(control(frame, 'Plan name')).toHaveValue('Two-tab study plan');
  await frame.getByRole('tab', {name: 'Task list view'}).click();
  await control(frame, 'Open Reading reflection').click();
  await expect(control(frame, 'Estimated effort minutes')).toHaveValue('90');
});
