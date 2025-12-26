import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://lordsandknights.com/');
  await page.locator('label').click();
  await page.getByRole('button', { name: 'PLAY NOW' }).click();
  await page.locator('.icon.clickable').click();
  await page.locator('.icon.clickable').click();
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 864,
      y: 490
    }
  });
  await page.locator('.icon.clickable.icon-tutorial').click();
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 337,
      y: 325
    }
  });
  await page.locator('.icon.clickable.icon-tutorial').click();
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 365,
      y: 406
    }
  });
  await page.locator('.icon.clickable.icon-tutorial').click();
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 773,
      y: 301
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 389,
      y: 477
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 36,
      y: 86
    }
  });
  await page.locator('.icon.clickable').click();
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 473,
      y: 136
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 365,
      y: 226
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 744,
      y: 555
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 575,
      y: 555
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 26,
      y: 80
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 1240,
      y: 269
    }
  });
  await page.locator('.icon.clickable').click();
  await page.locator('.icon.clickable').click();
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 694,
      y: 392
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 193,
      y: 324
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 700,
      y: 133
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 698,
      y: 389
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 703,
      y: 397
    }
  });
  await page.locator('.dialog--title-container').click();
  await page.locator('.dialog--title-container').click();
  await page.locator('.dialog--title-container').click();
  await page.locator('#game-layer--tutorial-cover').dblclick({
    position: {
      x: 707,
      y: 397
    }
  });
  await page.getByText('Excellent! Now include a').click();
  await page.locator('div').filter({ hasText: 'Excellent! Now include a' }).nth(1).click();
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 1195,
      y: 92
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 875,
      y: 123
    }
  });
  await page.getByText('Excellent! Now include a').click();
  await page.locator('.icon.icon-tutorial').click();
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.locator('.event-pop-up-button').click();
  await page.locator('.icon.icon-resource').first().click();
  await page.locator('div:nth-child(15) > .widget-seek-bar-wrapper > .widget-seek-bar > .widget-seek-bar__content > .widget-seek-bar__line').dblclick();
  await page.locator('#game-layer--tutorial-cover').dblclick({
    position: {
      x: 598,
      y: 312
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 590,
      y: 304
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 607,
      y: 263
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 598,
      y: 267
    }
  });
  await page.locator('#game-layer--tutorial-cover').dblclick({
    position: {
      x: 611,
      y: 265
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 910,
      y: 331
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 911,
      y: 256
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 860,
      y: 320
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 597,
      y: 298
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 52,
      y: 58
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 1087,
      y: 346
    }
  });
  await page.locator('#game-layer--tutorial-cover').dblclick({
    position: {
      x: 1253,
      y: 462
    }
  });
  await page.locator('#game-layer--tutorial-cover').click({
    position: {
      x: 624,
      y: 223
    }
  });
  await page.getByRole('button', { name: 'PLAY NOW' }).click();
  await page.getByText('/26/2025, 11:38:33 AM').click();
  await page.getByRole('button', { name: 'Current building upgrades' }).click();
  await page.getByText('120').first().click();
  await page.getByTitle('Stone').click();
  await page.locator('.resource-progress-bar--bar').first().click();
  await page.locator('div:nth-child(3) > .resource-progress-bar--values-box > .resource-progress-bar--bar-wrapper > .resource-progress-bar--bar').click();
  await page.getByTitle('Ore').dblclick();
  await page.getByTitle('Ore').click();
  await page.getByTitle('Subjects').dblclick();
  await page.locator('.icon.resource-progress-bar--icon.icon-resource.icon-resource--icon-resource.icon-resource--5').click();
  await page.getByText('12012012014100100').dblclick();
  await page.getByText('12012012014100100').click();
  await page.getByTitle('Copper').dblclick();
  await page.getByTitle('Copper').click();
  await page.locator('div:nth-child(9) > .tabular-cell--upgrade-building > .upgrade-building--cell > .button').click();
  await page.getByText('minutes').click();
  await page.getByText('3', { exact: true }).nth(1).click();
  await page.locator('div:nth-child(2) > .button').click();
  await page.locator('div:nth-child(9) > .tabular-cell--upgrade-building > .upgrade-building--cell > .button').click();
  await page.locator('div:nth-child(2) > .button').click();
  await page.locator('div:nth-child(11) > .tabular-cell--upgrade-building > .upgrade-building--cell > .button').click();
  await page.locator('div:nth-child(2) > .button').click();
  await page.locator('div:nth-child(11) > .tabular-cell--upgrade-building > .upgrade-building--cell > .button').click();
  await page.locator('div:nth-child(2) > .button').click();
  await page.locator('div:nth-child(11) > .tabular-cell--upgrade-building > .upgrade-building--cell > .button').click();
  await page.locator('div:nth-child(2) > .button').click();
  await page.locator('div:nth-child(13) > .tabular-cell--upgrade-building > .upgrade-building--cell > .button').click();
  await page.locator('div:nth-child(2) > .button').click();
  await page.locator('div:nth-child(9) > .tabular-cell--upgrade-building > .upgrade-building--cell > .button').click();
  await page.getByRole('button', { name: 'Troop overview' }).click();
  await page.getByRole('button', { name: 'Recruitment list' }).click();
});