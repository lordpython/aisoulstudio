import { expect, test } from '@playwright/test';

import { formatRegistry } from '../packages/shared/src/services/formatRegistry';

const FORMATS = formatRegistry.getAllFormats();
const FORMAT_PLACEHOLDERS: Record<string, string> = {
  'youtube-narrator': 'Describe a topic you want to narrate about... e.g., "The hidden history of the Silk Road"',
  advertisement: 'Describe your product or service... e.g., "A new fitness app that uses AI to create personalized workouts"',
  'movie-animation': 'Describe your story concept... e.g., "A young robot dreams of becoming a painter"',
  educational: 'Describe what you want to teach... e.g., "How photosynthesis works at the molecular level"',
  shorts: 'Describe a short, punchy idea... e.g., "3 mind-blowing facts about the ocean"',
  documentary: 'Describe your documentary subject... e.g., "The rise and fall of a forgotten civilization"',
  'music-video': 'Describe the song mood and theme... e.g., "An upbeat pop song about chasing your dreams"',
  'news-politics': 'Describe the news topic... e.g., "The impact of AI regulation on global tech industries"',
};

async function openStudioFormatSelector(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lyriclens-language', 'en');
  });

  await page.goto('/studio?mode=story');
  await expect(page.getByRole('heading', { name: 'What will you create?' })).toBeVisible();
}

test.describe('Studio format selector coverage', () => {
  for (const format of FORMATS) {
    test(`supports ${format.name}`, async ({ page }) => {
      await openStudioFormatSelector(page);

      await page.getByRole('button', { name: format.name }).click();

      if (format.id === 'movie-animation') {
        await expect(page.locator('#topic-input')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Begin Story' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Start Production' })).toHaveCount(0);
        return;
      }

      const placeholder = FORMAT_PLACEHOLDERS[format.id];
      const ideaInput = page.getByPlaceholder(placeholder);

      await expect(ideaInput).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Production' })).toBeDisabled();

      const testIdea = `Test concept for ${format.name}`;
      await ideaInput.fill(testIdea);

      await expect(page.getByRole('button', { name: 'Start Production' })).toBeEnabled();
      await expect(page.getByText('Genre', { exact: true })).toBeVisible();

      for (const genre of format.applicableGenres) {
        await expect(page.getByRole('button', { name: genre, exact: true })).toBeVisible();
      }

      if (format.requiresResearch) {
        await expect(page.getByText('Reference Documents (Optional)', { exact: true })).toBeVisible();
      } else {
        await expect(page.getByText('Reference Documents (Optional)', { exact: true })).toHaveCount(0);
      }
    });
  }
});
