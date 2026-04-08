import playwrightTest from '@playwright/test';

const { expect, test } = playwrightTest;

type ImageProvider = 'gemini' | 'deapi';

const TEST_PROJECT_ID = 'playwright_api_proxy_project';
const SHOT_DESCRIPTION = 'A hero walks through neon rain';
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p2z7L8AAAAASUVORK5CYII=';

function buildSeedState(imageProvider: ImageProvider) {
  return {
    currentStep: 'storyboard',
    breakdown: [
      {
        id: 'scene_1',
        sceneNumber: 1,
        heading: 'Scene 1',
        action: 'A rainy city street at night.',
        dialogue: [],
        charactersPresent: [],
      },
    ],
    shots: [
      {
        id: 'shot_1',
        sceneId: 'scene_1',
        shotNumber: 1,
        shotType: 'Wide',
        cameraAngle: 'Eye-level',
        movement: 'Static',
        duration: 5,
        description: SHOT_DESCRIPTION,
        emotion: 'tense',
        lighting: 'Neon',
      },
    ],
    shotlist: [
      {
        id: 'shot_1',
        sceneId: 'scene_1',
        shotNumber: 1,
        description: SHOT_DESCRIPTION,
        cameraAngle: 'Eye-level',
        movement: 'Static',
        lighting: 'Neon',
        dialogue: '',
        durationEst: 5,
      },
    ],
    characters: [],
    genre: 'Drama',
    visualStyle: 'Cinematic',
    aspectRatio: '16:9',
    imageProvider,
    scenesWithShots: ['scene_1'],
  };
}

async function seedStoryboardState(page: import('@playwright/test').Page, imageProvider: ImageProvider) {
  const state = buildSeedState(imageProvider);
  await page.addInitScript(({ storyState, projectId }) => {
    localStorage.setItem('lyriclens-language', 'en');
    localStorage.setItem('ai_soul_studio_story_state', JSON.stringify(storyState));
    localStorage.setItem('ai_soul_studio_story_session', 'playwright_story_session');
    localStorage.setItem('ai_soul_studio_story_project_id', projectId);
  }, { storyState: state, projectId: TEST_PROJECT_ID });
}

/**
 * Mock the Gemini text-generation endpoint used by refineImagePrompt,
 * compressPromptForGeneration, and extractVisualStyle.
 */
async function mockTextGeneration(page: import('@playwright/test').Page) {
  await page.route('**/api/gemini/proxy/generateContent', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'mock refined prompt' }] } }],
        text: 'mock refined prompt',
      }),
    });
  });
}

/**
 * Mock cloud endpoints to prevent ECONNREFUSED errors from the backend.
 */
async function mockCloudEndpoints(page: import('@playwright/test').Page) {
  await page.route('**/api/cloud/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

test.describe('API proxy integrations (Gemini + DeAPI)', () => {
  test('Gemini visuals: sends /api/gemini request and renders generated image on success', async ({ page }) => {
    await seedStoryboardState(page, 'gemini');
    await mockTextGeneration(page);
    await mockCloudEndpoints(page);

    const geminiRequests: unknown[] = [];
    await page.route('**/api/gemini/proxy/generateImages', async (route) => {
      const body = route.request().postDataJSON();
      geminiRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedImages: [{ image: { imageBytes: PNG_1X1_BASE64 } }],
        }),
      });
    });

    await page.goto(`/studio?mode=story&project=${TEST_PROJECT_ID}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Generate All Visuals' }).click();

    await expect(page.locator(`img[alt="${SHOT_DESCRIPTION}"]`).first()).toBeVisible({ timeout: 15000 });
    await expect.poll(() => geminiRequests.length).toBeGreaterThan(0);

    const firstRequest = geminiRequests[0] as { model?: string };
    expect(firstRequest.model).toBeTruthy();
  });

  test('Gemini visuals: no image rendered when /api/gemini returns failure', async ({ page }) => {
    await seedStoryboardState(page, 'gemini');
    await mockTextGeneration(page);
    await mockCloudEndpoints(page);

    let callCount = 0;
    await page.route('**/api/gemini/proxy/generateImages', async (route) => {
      callCount++;
      await route.fulfill({
        status: 400, // 400 is non-retryable by withRetry
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Gemini mock failure' }),
      });
    });

    await page.goto(`/studio?mode=story&project=${TEST_PROJECT_ID}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Generate All Visuals' }).click();

    // ParallelExecutionEngine handles per-shot failures without a global error banner.
    // Wait for all engine retries to complete, then verify no image was rendered.
    await expect.poll(() => callCount, { timeout: 20000 }).toBeGreaterThanOrEqual(1);

    // Give the engine time to finish its retry cycle
    await page.waitForTimeout(3000);

    // No image should have been rendered
    await expect(page.locator(`img[alt="${SHOT_DESCRIPTION}"]`)).toHaveCount(0);
    // The "No Visual Generated" placeholder should still be visible
    await expect(page.getByText('No Visual Generated')).toBeVisible();
  });

  test('DeAPI visuals: sends /api/deapi request and renders generated image on success', async ({ page }) => {
    await seedStoryboardState(page, 'deapi');
    await mockTextGeneration(page);
    await mockCloudEndpoints(page);

    const deapiRequests: unknown[] = [];
    await page.route('**/api/deapi/proxy/txt2img', async (route) => {
      const body = route.request().postDataJSON();
      deapiRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'done',
          result_url: 'https://mock.deapi.local/generated.png',
        }),
      });
    });

    await page.route('https://mock.deapi.local/generated.png', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(PNG_1X1_BASE64, 'base64'),
      });
    });

    await page.goto(`/studio?mode=story&project=${TEST_PROJECT_ID}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Generate All Visuals' }).click();

    await expect(page.locator(`img[alt="${SHOT_DESCRIPTION}"]`).first()).toBeVisible({ timeout: 15000 });
    await expect.poll(() => deapiRequests.length).toBeGreaterThan(0);

    const firstRequest = deapiRequests[0] as { prompt?: string };
    expect(firstRequest.prompt).toContain(SHOT_DESCRIPTION);
  });

  test('DeAPI visuals: shows error banner when /api/deapi returns failure', async ({ page }) => {
    await seedStoryboardState(page, 'deapi');
    await mockCloudEndpoints(page);

    await page.route('**/api/deapi/proxy/txt2img', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'DeAPI mock failure' }),
      });
    });

    await page.goto(`/studio?mode=story&project=${TEST_PROJECT_ID}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Generate All Visuals' }).click();

    // DeAPI errors propagate directly to the error banner (no parallel engine wrapper)
    await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('DeAPI mock failure')).toBeVisible();
  });
});
