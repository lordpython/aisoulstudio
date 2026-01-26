/**
 * Environment loader - must be imported FIRST before any modules that use env vars
 */
import { config } from 'dotenv';

// Load environment variables from .env files
// .env.local takes precedence over .env
config({ path: '.env.local', debug: process.env.DEBUG === 'true' });
config({ path: '.env', debug: process.env.DEBUG === 'true' });

// Re-export for convenience
export const env = process.env;
