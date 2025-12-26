import { Page } from 'playwright';
import { config } from '../config.js';
import { dismissPopups } from './popups.js';

async function isLoggedIn(page: Page): Promise<boolean> {
  // Check if we're already in the game (buildings button visible)
  try {
    const buildingsBtn = page.getByRole('button', { name: 'Current building upgrades' });
    return await buildingsBtn.isVisible({ timeout: 3000 });
  } catch {
    return false;
  }
}

async function isOnLoginPage(page: Page): Promise<boolean> {
  try {
    // Check for login form specifically
    const loginForm = page.locator('form.form--login');
    return await loginForm.isVisible({ timeout: 3000 });
  } catch {
    return false;
  }
}

async function isOnPlayNow(page: Page): Promise<boolean> {
  try {
    const playNowBtn = page.getByText('PLAY NOW');
    return await playNowBtn.isVisible({ timeout: 3000 });
  } catch {
    return false;
  }
}

async function isOnServerSelect(page: Page): Promise<boolean> {
  try {
    const serverBtn = page.getByText(config.server);
    return await serverBtn.isVisible({ timeout: 3000 });
  } catch {
    return false;
  }
}

export async function login(page: Page, retryCount = 0): Promise<boolean> {
  if (retryCount >= config.maxLoginRetries) {
    console.error(`Login failed after ${config.maxLoginRetries} attempts`);
    return false;
  }

  console.log('Checking login state...');

  // Navigate to game if not already there
  const currentUrl = page.url();
  if (!currentUrl.includes('lordsandknights.com')) {
    await page.goto('https://lordsandknights.com/');
    await page.waitForTimeout(2000);
  }

  // Dismiss any popups first
  await dismissPopups(page);

  // Check if already logged in
  if (await isLoggedIn(page)) {
    console.log('Already logged in!');
    return true;
  }

  // Check if on server select screen
  if (await isOnServerSelect(page)) {
    console.log('On server select, choosing server...');
    await page.getByText(config.server).click();
    await page.waitForTimeout(3000);
    await dismissPopups(page);
    return await isLoggedIn(page);
  }

  // Check if on login page FIRST (priority over PLAY NOW)
  if (await isOnLoginPage(page)) {
    console.log('On login page, logging in...');

    // Fill login form
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(config.email);
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill(config.password);
    await page.getByRole('button', { name: 'Log in' }).click();

    await page.waitForTimeout(2000);

    // Handle OK dialog if it appears
    const okButton = page.getByRole('button', { name: 'OK' });
    if (await okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await okButton.click();
      await page.getByRole('button', { name: 'Log in' }).click();
      await page.waitForTimeout(2000);
    }

    // Select server if visible
    if (await isOnServerSelect(page)) {
      await page.getByText(config.server).click();
      await page.waitForTimeout(3000);
    }

    await dismissPopups(page);
    console.log('Login completed!');
    return await isLoggedIn(page);
  }

  // Check if "PLAY NOW" button is visible (no login form, already have session)
  if (await isOnPlayNow(page)) {
    console.log('Found PLAY NOW button, clicking...');
    await page.getByText('PLAY NOW').click();
    await page.waitForTimeout(2000);
    await dismissPopups(page);

    // After PLAY NOW, we should be on server select
    if (await isOnServerSelect(page)) {
      await page.getByText(config.server).click();
      await page.waitForTimeout(3000);
      await dismissPopups(page);
    }
    return await isLoggedIn(page);
  }

  console.log(`Unknown page state (attempt ${retryCount + 1}/${config.maxLoginRetries}), navigating to login...`);
  await page.goto('https://lordsandknights.com/');
  await page.waitForTimeout(3000);
  return await login(page, retryCount + 1);
}
