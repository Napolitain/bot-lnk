import { Page } from 'playwright';

export async function dismissPopups(page: Page): Promise<void> {
  // Dismiss any event popups or dialogs that appear
  try {
    // Event popup button
    const eventPopup = page.locator('div.event-pop-up-button');
    if (await eventPopup.isVisible({ timeout: 1000 }).catch(() => false)) {
      await eventPopup.click();
      console.log('Dismissed event popup');
      await page.waitForTimeout(500);
    }

    // OK button in dialogs
    const okBtn = page.getByRole('button', { name: 'OK' });
    if (await okBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await okBtn.click();
      console.log('Clicked OK on dialog');
      await page.waitForTimeout(500);
    }

    // Accept button
    const acceptBtn = page.getByText('Accept', { exact: true });
    if (await acceptBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await acceptBtn.click();
      console.log('Clicked Accept');
      await page.waitForTimeout(500);
    }

    // Red accept button
    const redAcceptBtn = page.locator('.event-pop-up-button.ButtonRedAccept');
    if (await redAcceptBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await redAcceptBtn.click();
      console.log('Clicked red accept button');
      await page.waitForTimeout(500);
    }
  } catch {
    // Ignore popup dismissal errors
  }
}
