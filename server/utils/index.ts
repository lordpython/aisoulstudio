import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../services/logger.js';

const cleanupLog = createLogger('Cleanup');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMP_DIR = path.join(__dirname, '../../temp');
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILES = 10000;

// API Keys (server-side only)
// Note: These are evaluated at import time, so dotenv must be loaded first
// via the preload module (server/preload.ts)
export const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
export const DEAPI_API_KEY = process.env.VITE_DEAPI_API_KEY;

/**
 * Sanitize session ID to prevent path traversal
 */
export const sanitizeId = (id: string): string => {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
};

/**
 * Get the session directory path
 */
export const getSessionDir = (sessionId: string): string => {
  return path.join(TEMP_DIR, sanitizeId(sessionId));
};

/**
 * Cleanup a session directory
 */
export const cleanupSession = (sessionId: string): void => {
  const dir = getSessionDir(sessionId);
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      cleanupLog.info(`Successfully removed session ${sessionId}`);
    } catch (e) {
      cleanupLog.error(`Failed to remove session ${sessionId}:`, e);
    }
  }
};

/**
 * Ensure temp directory exists
 */
export const ensureTempDir = (): void => {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
};
