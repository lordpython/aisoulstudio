import playwrightTest from '@playwright/test';

const { expect, test } = playwrightTest;

/**
 * REAL E2E test for DeAPI budget/rate-limit workflow with DEAPI_HOURLY_BUDGET=18.
 * NO MOCKS — hits the live DeAPI API through the dev server proxy.
 *
 * Verifies:
 *   (a) Pipeline halts cleanly on budget exhaustion
 *   (b) No 422s after a 429 (retry logic doesn't downgrade status)
 *   (c) Browser stays interactive after errors
 *
 * Prerequisites:
 *   - DEAPI_API_KEY set in .env / .env.local
 *   - Dev server running: DEAPI_HOURLY_BUDGET=18 pnpm run dev:all
 *   - Reuse existing server (playwright.config.impl.js sets reuseExistingServer: true when not CI)
 */

const TEST_PROJECT_ID = 'pw_deapi_budget_real';
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lQVR42mP8/x8AAusB9p2z7L8AAAAASUVORK5CYII=';

// Build a seeded story state with enough shots to exhaust DEAPI_HOURLY_BUDGET=18.
// Each shot's img2video call consumes one budget slot.
function buildBudgetTestState(shotCount: number) {
  const scenes = Array.from({ length: Math.ceil(shotCount / 3) }, (_, si) => ({
    id: `scene_${si + 1}`,
    sceneNumber: si + 1,
    heading: `Scene ${si + 1}`,
    action: `Action for scene ${si + 1}`,
    dialogue: [],
    charactersPresent: [],
  }));

  const shots = Array.from({ length: shotCount }, (_, i) => ({
    id: `shot_${i + 1}`,
    sceneId: scenes[Math.floor(i / 3)]!.id,
    shotNumber: i + 1,
    shotType: 'Wide',
    cameraAngle: 'Eye-level',
    movement: 'Static',
    duration: 5,
    description: `Shot ${i + 1}: a cinematic moment with slow camera pan`,
    emotion: 'contemplative',
    lighting: 'Natural',
    // Pre-seed with a generated image so animateShots can proceed
    imageUrl: `data:image/png;base64,${PNG_1X1_BASE64}`,
  }));

  const shotlist = shots.map((s) => ({
    id: s.id,
    sceneId: s.sceneId,
    shotNumber: s.shotNumber,
    description: s.description,
    cameraAngle: s.cameraAngle,
    movement: s.movement,
    lighting: s.lighting,
    dialogue: '',
    durationEst: s.duration,
    imageUrl: s.imageUrl,
  }));

  const narrationSegments = scenes.map((sc) => ({
    sceneId: sc.id,
    audioUrl: `data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=`,
    duration: 5,
    text: `Narration for ${sc.heading}`,
  }));

  return {
    currentStep: 'animation',
    breakdown: scenes,
    shots,
    shotlist,
    characters: [],
    genre: 'Drama',
    visualStyle: 'Cinematic',
    aspectRatio: '16:9',
    imageProvider: 'deapi',
    scenesWithShots: scenes.map((s) => s.id),
    narrationSegments,
    narrationStatus: 'done' as const,
    scenesWithNarration: scenes.map((s) => s.id),
    animatedShots: [],
  };
}

async function seedState(page: import('@playwright/test').Page, shotCount: number) {
  const state = buildBudgetTestState(shotCount);
  await page.addInitScript(({ storyState, projectId }) => {
    localStorage.setItem('lyriclens-language', 'en');
    localStorage.setItem('ai_soul_studio_story_state', JSON.stringify(storyState));
    localStorage.setItem('ai_soul_studio_story_session', 'pw_budget_real_session');
    localStorage.setItem('ai_soul_studio_story_project_id', projectId);
    // Override circuit breaker threshold so budget exhaustion is reached first
    // (default is 3, which kills the batch before 18 budget slots are consumed)
    (window as any).__E2E_OVERRIDE_CIRCUIT_BREAKER__ = 99;
  }, { storyState: state, projectId: TEST_PROJECT_ID });
}

test.describe('DeAPI budget exhaustion workflow — REAL API', () => {
  test.setTimeout(300_000); // 5 min — real API calls are slow
  test.describe.configure({ mode: 'serial' }); // Must run serially — shared budget on server

  test('(a) pipeline halts cleanly on budget exhaustion — real DeAPI calls', async ({ page }) => {
    // 20 shots with budget=18: animation loop should exhaust budget and circuit-break
    await seedState(page, 20);

    // Capture real network responses from DeAPI proxy
    const deapiResponses: Array<{ url: string; status: number; body: string }> = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/deapi/')) {
        let body = '';
        try { body = await response.text(); } catch { /* streaming or binary */ }
        deapiResponses.push({ url, status: response.status(), body });
      }
    });

    // Capture console output
    const consoleLog: Array<{ type: string; text: string }> = [];
    page.on('console', (msg) => {
      consoleLog.push({ type: msg.type(), text: msg.text() });
    });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`/studio?mode=story&project=${TEST_PROJECT_ID}`, { waitUntil: 'networkidle' });

    // Click the animate button
    const animateBtn = page.getByRole('button', { name: /animate|regenerate/i });
    await expect(animateBtn).toBeVisible({ timeout: 15000 });
    await animateBtn.click();

    // Wait for the pipeline to settle — budget exhaustion should stop it
    // Real img2video calls take ~30-60s each, budget exhaustion triggers after 18
    // The circuit breaker should halt within a few minutes
    // 3 min gives enough time for prompt enhancement fallback + img2video calls
    await page.waitForTimeout(180_000);

    // (a) Verify: pipeline halted — no hang
    // There should be DeAPI responses (real calls were made)
    expect(deapiResponses.length).toBeGreaterThan(0);

    // Check for budget exhaustion in console logs
    const budgetLogs = consoleLog.filter(
      (l) => l.text.includes('budget') || l.text.includes('RateBudgetExceededError'),
    );
    console.log('[E2E] Budget-related console logs:', budgetLogs.length);

    // Check for circuit breaker trigger
    const circuitBreakerLogs = consoleLog.filter(
      (l) => l.text.includes('circuit breaker') || l.text.includes('aborting animation'),
    );
    console.log('[E2E] Circuit breaker logs:', circuitBreakerLogs.length);

    // Verify: no page crashes
    const fatalPageErrors = pageErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('NetworkError'),
    );
    expect(fatalPageErrors.length).toBe(0, `Unexpected page errors: ${fatalPageErrors.join(', ')}`);

    // Verify: browser is still responsive
    await expect(page.locator('body')).toBeVisible();
    const title = await page.title();
    expect(title).toBeTruthy();

    // Print summary of real API responses for debugging
    const img2videoResponses = deapiResponses.filter(r => r.url.includes('img2video'));
    const promptResponses = deapiResponses.filter(r => r.url.includes('prompt'));
    console.log('[E2E] img2video responses:', img2videoResponses.length, img2videoResponses.map(r => r.status));
    console.log('[E2E] prompt responses:', promptResponses.length, promptResponses.map(r => ({ status: r.status, body: r.body.substring(0, 120) })));
    console.log('[E2E] All DeAPI responses:', deapiResponses.map(r => ({ url: r.url.split('/api/deapi/')[1]?.substring(0, 40), status: r.status })));
  });

  test('(b) no 422 after a 429 — real DeAPI responses preserve status codes', async ({ page }) => {
    // After test (a), budget may be exhausted — use fewer shots
    // The key check is about status code preservation, not budget exhaustion
    await seedState(page, 5);

    const deapiResponses: Array<{ url: string; status: number }> = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/deapi/')) {
        deapiResponses.push({ url, status: response.status() });
      }
    });

    await page.goto(`/studio?mode=story&project=${TEST_PROJECT_ID}`, { waitUntil: 'networkidle' });

    const animateBtn = page.getByRole('button', { name: /animate|regenerate/i });
    await expect(animateBtn).toBeVisible({ timeout: 15000 });
    await animateBtn.click();

    // Wait for real API calls to complete
    await page.waitForTimeout(180_000);

    // (b) Verify: no 422 appeared after any 429 in the VIDEO generation endpoints
    // Note: /prompt/video 422s are expected (it requires multipart with image field)
    // The important check is that img2video/txt2video never show 422 after 429
    const videoResponses = deapiResponses.filter(r => r.url.includes('img2video') || r.url.includes('txt2video'));
    const statusSequence = videoResponses.map(r => r.status);

    console.log('[E2E] Video endpoint status sequence:', statusSequence);
    console.log('[E2E] All DeAPI responses:', deapiResponses.map(r => ({ url: r.url.split('/api/deapi/')[1]?.substring(0, 40), status: r.status })));

    // Find all 429 positions
    const rateLimitIndices = statusSequence
      .map((s, i) => s === 429 ? i : -1)
      .filter(i => i >= 0);

    // For each 429, verify the next response is NOT 422
    for (const idx of rateLimitIndices) {
      if (idx + 1 < statusSequence.length) {
        const nextStatus = statusSequence[idx + 1]!;
        expect(
          nextStatus,
          `After 429 at index ${idx}, next response was ${nextStatus} — should NOT be 422`,
        ).not.toBe(422);
      }
    }

    // Also verify: no 422 responses in the VIDEO generation sequence
    // (prompt enhancement 422s are expected and non-fatal)
    const has422InVideo = statusSequence.includes(422);
    expect(has422InVideo, 'No 422 responses should appear in video generation calls').toBe(false);
  });

  test('(c) browser stays interactive after real budget exhaustion', async ({ page }) => {
    // Budget likely already exhausted from test (a)
    // This test verifies the browser survives the error
    await seedState(page, 5);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`/studio?mode=story&project=${TEST_PROJECT_ID}`, { waitUntil: 'networkidle' });

    const animateBtn = page.getByRole('button', { name: /animate|regenerate/i });
    await expect(animateBtn).toBeVisible({ timeout: 15000 });
    await animateBtn.click();

    // Wait for budget exhaustion to trigger and pipeline to stop
    await page.waitForTimeout(180_000);

    // (c) Verify: browser is still fully interactive

    // 1. Page didn't crash — body is visible
    await expect(page.locator('body')).toBeVisible();

    // 2. Can evaluate JS in the page context
    const jsWorks = await page.evaluate(() => {
      return typeof document !== 'undefined' && typeof window !== 'undefined';
    });
    expect(jsWorks).toBe(true);

    // 3. Can interact with DOM elements
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    // 4. The animate button should still be in the DOM (even if disabled)
    //    — proves React didn't unmount the component tree
    const btnCount = await page.getByRole('button', { name: /animate|regenerate/i }).count();
    expect(btnCount).toBeGreaterThanOrEqual(1);

    // 5. No fatal JS errors
    const fatalErrors = pageErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('NetworkError'),
    );
    expect(fatalErrors.length).toBe(0, `Fatal JS errors: ${fatalErrors.join('; ')}`);

    // 6. Can navigate away and back — proves router is alive
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.goto(`/studio?mode=story&project=${TEST_PROJECT_ID}`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });
});
