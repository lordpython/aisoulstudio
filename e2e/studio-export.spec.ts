import { expect, test } from '@playwright/test';

type StudioTestExportPayload = {
  config: {
    presetId: string;
    width: number;
    height: number;
    orientation: 'landscape' | 'portrait';
    quality: 'draft' | 'standard' | 'high';
  };
  title?: string;
  sceneCount: number;
  narrationCount: number;
  hasMergedAudio: boolean;
};

test.describe('Studio export flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lyriclens-language', 'en');
    });
  });

  test('opens export modal and completes export from a seeded ready state', async ({ page }) => {
    await page.goto('/studio?mode=video');

    await page.waitForFunction(() => {
      const win = window as typeof window & {
        __studioTestApi?: {
          seedExportReadyState: () => Promise<void>;
          setExportInterceptor: (interceptor: ((payload: unknown) => Promise<void> | void) | null) => void;
        };
      };
      return typeof win.__studioTestApi?.seedExportReadyState === 'function';
    });

    await page.evaluate(async () => {
      const win = window as typeof window & {
        __studioLastExportPayload?: unknown;
        __studioTestApi?: {
          seedExportReadyState: () => Promise<void>;
          setExportInterceptor: (interceptor: ((payload: unknown) => Promise<void> | void) | null) => void;
        };
      };

      win.__studioLastExportPayload = null;
      win.__studioTestApi?.setExportInterceptor(async (payload) => {
        win.__studioLastExportPayload = payload;
      });
      await win.__studioTestApi?.seedExportReadyState();
    });

    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
    await page.getByRole('button', { name: 'Export' }).click();

    await expect(page.getByRole('heading', { name: 'Export Video' })).toBeVisible();
    await expect(page.getByText('Playwright Export Demo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export Now' })).toBeVisible();

    await page.getByRole('button', { name: 'Export Now' }).click();

    await expect(page.getByText('Export Complete!')).toBeVisible();

    const payload = await page.evaluate(() => {
      const win = window as typeof window & { __studioLastExportPayload?: unknown };
      return win.__studioLastExportPayload;
    });

    const exportPayload = payload as StudioTestExportPayload;
    expect(exportPayload).toBeTruthy();
    expect(exportPayload.title).toBe('Playwright Export Demo');
    expect(exportPayload.sceneCount).toBe(3);
    expect(exportPayload.narrationCount).toBe(3);
    expect(exportPayload.hasMergedAudio).toBe(true);
    expect(exportPayload.config).toEqual({
      presetId: 'youtube',
      width: 1920,
      height: 1080,
      orientation: 'landscape',
      quality: 'high',
    });
  });
});
