export * from './types';
export { JSONExtractor } from './jsonExtractor';
export { FallbackProcessor } from './fallbackProcessor';

// Singleton instances for convenience
import { JSONExtractor } from './jsonExtractor';
import { FallbackProcessor } from './fallbackProcessor';

export const jsonExtractor = new JSONExtractor();
export const fallbackProcessor = new FallbackProcessor();
