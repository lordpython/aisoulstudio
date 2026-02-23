/**
 * Environment loader - must be imported FIRST before any modules that use env vars
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Resolve paths relative to this file so they work regardless of process.cwd()
// packages/server/env.ts → ../../ → workspace root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../');

// Load environment variables from .env files
// .env.local takes precedence over .env
config({ path: path.join(root, '.env.local'), debug: process.env.DEBUG === 'true' });
config({ path: path.join(root, '.env'), debug: process.env.DEBUG === 'true' });

// Re-export for convenience
export const env = process.env;
