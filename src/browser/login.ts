import type { Page } from 'playwright';
import { config } from '../config.js';
import { pollFor, pollUntil, saveDebugContext } from '../utils/index.js';
import { dismissPopups } from './popups.js';

async function isInGame(page: Page): Promise<boolean> {
  // Check multiple indicators that we're in the game - use short timeouts for polling
  try {
    // Make sure we're NOT on login page first
    const loginScene = page.locator('.login-scene');
    if (await loginScene.isVisible({ timeout: 300 }).catch(() => false)) {
      return false; // Still on login page
    }

    // Check for buildings button (most reliable indicator)
    const buildingsBtn = page.getByRole('button', {
      name: 'Current building upgrades',
    });
    if (await buildingsBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      return true;
    }

    // Check for castle button
    const castleBtn = page.getByRole('button', { name: 'Castle' });
    if (await castleBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      return true;
    }

    // Check for resource bar (has actual content when in game)
    const resourceBar = page.locator('.resource-bar');
    if (await resourceBar.isVisible({ timeout: 500 }).catch(() => false)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function waitForGameLoad(
  page: Page,
  timeoutMs = 30000,
): Promise<boolean> {
  console.log('[Login] Waiting for game to load...');

  const loaded = await pollUntil(
    async () => {
      await dismissPopups(page);
      const inGame = await isInGame(page);
      if (inGame) {
        // Double-check we're really in game and not on login
        const loginScene = page.locator('.login-scene');
        const stillOnLogin = await loginScene
          .isVisible({ timeout: 300 })
          .catch(() => false);
        if (stillOnLogin) {
          console.log('[Login] Still on login scene, not in game yet');
          return false;
        }
        return true;
      }
      return false;
    },
    { timeout: timeoutMs, interval: 1000, description: 'game load' },
  );

  if (loaded) {
    console.log('[Login] Game loaded successfully');
    return true;
  }

  console.warn(`[Login] Game did not load within ${timeoutMs / 1000}s`);
  await saveDebugContext(page, 'game-load-timeout');
  return false;
}

async function isOnLoginPage(page: Page): Promise<boolean> {
  try {
    const loginForm = page.locator('form.form--login');
    return await loginForm.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

async function isOnPlayNow(page: Page): Promise<boolean> {
  try {
    const playNowBtn = page.getByText('PLAY NOW');
    return await playNowBtn.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

async function isOnServerSelect(page: Page): Promise<boolean> {
  try {
    const serverBtn = page.getByText(config.server);
    return await serverBtn.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

export async function login(page: Page, retryCount = 0): Promise<boolean> {
  if (retryCount >= config.maxLoginRetries) {
    console.error(`[Login] Failed after ${config.maxLoginRetries} attempts`);
    await saveDebugContext(page, 'login-max-retries-exceeded');
    return false;
  }

  console.log(
    `[Login] Checking state (attempt ${retryCount + 1}/${config.maxLoginRetries})...`,
  );
  console.log(`[Login] Current URL: ${page.url()}`);

  // Navigate to game if not already there
  const currentUrl = page.url();
  if (!currentUrl.includes('lordsandknights.com')) {
    console.log('[Login] Not on game site, navigating...');
    try {
      await page.goto('https://lordsandknights.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
      console.log(`[Login] Navigated to: ${page.url()}`);
    } catch (error) {
      console.warn(`[Login] Navigation failed: ${error}`);
      await saveDebugContext(page, 'login-navigation-failed');
    }
  }

  // Dismiss any popups first
  await dismissPopups(page);

  // Check if already in game
  if (await isInGame(page)) {
    console.log('[Login] Already in game!');
    return true;
  }

  // Check if on server select screen
  if (await isOnServerSelect(page)) {
    console.log('[Login] On server select, choosing server...');
    try {
      await page.getByText(config.server).click();
      return await waitForGameLoad(page);
    } catch (error) {
      console.warn(`[Login] Server select failed: ${error}`);
      await saveDebugContext(page, 'login-server-select-failed');
    }
  }

  // Check if on login page FIRST (priority over PLAY NOW)
  if (await isOnLoginPage(page)) {
    console.log('[Login] On login page, logging in...');

    try {
      // Fill login form
      await page.getByRole('textbox', { name: 'Email' }).click();
      await page.getByRole('textbox', { name: 'Email' }).fill(config.email);
      await page.getByRole('textbox', { name: 'Password' }).click();
      await page
        .getByRole('textbox', { name: 'Password' })
        .fill(config.password);
      await page.getByRole('button', { name: 'Log in' }).click();

      await page.waitForTimeout(3000);

      // Handle OK dialog if it appears
      const okButton = page.getByRole('button', { name: 'OK' });
      if (await okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[Login] OK dialog appeared, dismissing...');
        await okButton.click();
        await page.getByRole('button', { name: 'Log in' }).click();
        await page.waitForTimeout(2000);
      }

      // Select server if visible
      if (await isOnServerSelect(page)) {
        console.log('[Login] Selecting server...');
        await page.getByText(config.server).click();
      }

      return await waitForGameLoad(page);
    } catch (error) {
      console.warn(`[Login] Login form submission failed: ${error}`);
      await saveDebugContext(page, 'login-form-failed');
    }
  }

  // Check if "PLAY NOW" button is visible (no login form, already have session)
  if (await isOnPlayNow(page)) {
    console.log('[Login] Found PLAY NOW button, clicking...');
    try {
      const playNowBtn = page.getByText('PLAY NOW');
      await playNowBtn.click();

      // Wait for the login scene to disappear (indicates transition started)
      console.log('[Login] Waiting for login scene to disappear...');
      const loginGone = await pollUntil(
        async () => {
          const loginScene = page.locator('.login-scene');
          const isVisible = await loginScene
            .isVisible({ timeout: 300 })
            .catch(() => false);
          return !isVisible;
        },
        { timeout: 15000, interval: 500, description: 'login scene disappear' },
      );

      if (!loginGone) {
        console.warn(
          '[Login] Login scene did not disappear after PLAY NOW click',
        );
        await saveDebugContext(page, 'login-scene-stuck');
        // Try clicking again
        console.log('[Login] Retrying PLAY NOW click...');
        await playNowBtn.click({ force: true });
        await page.waitForTimeout(2000);
      }

      // Wait for server select or game load with polling
      const serverOrGame = await pollFor<'game' | 'server'>(
        async () => {
          await dismissPopups(page);
          if (await isInGame(page)) return 'game';
          if (await isOnServerSelect(page)) return 'server';
          return null;
        },
        {
          timeout: 15000,
          interval: 1000,
          description: 'server select or game',
        },
      );

      if (serverOrGame === 'game') {
        console.log('[Login] Already in game after PLAY NOW');
        return true;
      }

      if (serverOrGame === 'server') {
        console.log('[Login] Selecting server...');
        const serverBtn = page.getByText(config.server);
        await serverBtn.click();

        // Wait for server button to disappear
        const serverGone = await pollUntil(
          async () => {
            const isVisible = await serverBtn
              .isVisible({ timeout: 300 })
              .catch(() => false);
            return !isVisible;
          },
          {
            timeout: 10000,
            interval: 500,
            description: 'server button disappear',
          },
        );

        if (!serverGone) {
          console.warn('[Login] Server button did not disappear after click');
          await saveDebugContext(page, 'server-select-stuck');
        }
      }

      return await waitForGameLoad(page);
    } catch (error) {
      console.warn(`[Login] PLAY NOW click failed: ${error}`);
      await saveDebugContext(page, 'login-play-now-failed');
    }
  }

  // Unknown state - dump debug and retry
  console.warn(`[Login] Unknown page state, dumping debug info...`);
  await saveDebugContext(page, 'login-unknown-state');

  // Clear cache and cookies to start fresh
  console.log('[Login] Clearing cookies and reloading...');
  const context = page.context();
  await context.clearCookies();

  // Navigate fresh
  await page.goto('https://lordsandknights.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  return await login(page, retryCount + 1);
}
