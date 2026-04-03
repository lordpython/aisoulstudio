/**
 * DeAPI public API configuration helpers
 */

import { isBrowser, API_KEY, getDetectedTier, detectTierInternal, img2videoRateLimiter } from './config';
import type { DeApiTier } from './types';

export const isDeApiConfigured = (): boolean => {
  if (isBrowser) return true;
  return Boolean(API_KEY && API_KEY.trim().length > 0);
};

export const getDeApiConfigMessage = (): string => {
  if (isDeApiConfigured()) {
    return "DeAPI is configured and ready to use.";
  }
  return (
    "DeAPI is not configured on the server. To enable video animation:\n" +
    "1. Get an API key from https://deapi.ai\n" +
    "2. Add VITE_DEAPI_API_KEY=your_key to your .env.local file\n" +
    "3. Restart the development server"
  );
};

export const detectTier = (wasRateLimited: boolean): DeApiTier => {
  return detectTierInternal(wasRateLimited) as DeApiTier;
};

export const getRecommendedConcurrency = (): number => {
  const tier = getDetectedTier();
  switch (tier) {
    case "premium": return 10;
    case "basic": return 2;
    default: return 5;
  }
};

export const getCurrentTier = (): DeApiTier => getDetectedTier() as DeApiTier;

export const getImg2VideoWaitTime = (): number => img2videoRateLimiter.getEstimatedWaitTime();
export const getImg2VideoQueueLength = (): number => img2videoRateLimiter.getQueueLength();

export { withExponentialBackoff } from './config';
