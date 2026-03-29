// @ts-nocheck

import { expect, test } from '@playwright/test';

// Mode cards have role="listitem" — scopes to the 3 creation mode buttons only
const MAIN_NAV_SELECTOR = 'nav[aria-label="Main navigation"] button[role="listitem"]';

async function useEnglishLocale(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lyriclens-language', 'en');
  });
}

test.describe('Home routing smoke', () => {
  test.beforeEach(async ({ page }) => {
    await useEnglishLocale(page);
  });

  test('renders the home screen with the three creation modes', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'LyricLens' }).first()).toBeVisible();
    await expect(page.getByText('AI-Powered Video Production')).toBeVisible();
    await expect(page.locator(MAIN_NAV_SELECTOR)).toHaveCount(3);
    await expect(page.locator(`${MAIN_NAV_SELECTOR}[aria-label^="Create Video"]`)).toBeVisible();
    await expect(page.locator(`${MAIN_NAV_SELECTOR}[aria-label^="Generate Music"]`)).toBeVisible();
    await expect(page.locator(`${MAIN_NAV_SELECTOR}[aria-label^="Visualizer"]`)).toBeVisible();
  });

  test('navigates from Home to Studio when Create Video is chosen', async ({ page }) => {
    await page.goto('/');

    await page.locator(`${MAIN_NAV_SELECTOR}[aria-label^="Create Video"]`).click();

    await expect(page).toHaveURL(/\/studio\?mode=video$/);
    await expect(page.getByRole('heading', { name: 'Studio' })).toBeVisible();
  });

  test('navigates from Home to Visualizer when Visualizer is chosen', async ({ page }) => {
    await page.goto('/');

    await page.locator(`${MAIN_NAV_SELECTOR}[aria-label^="Visualizer"]`).click();

    await expect(page).toHaveURL(/\/visualizer$/);
    await expect(page.getByRole('heading', { name: 'Visualizer' })).toBeVisible();
  });
});
