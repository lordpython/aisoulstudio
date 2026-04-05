// MUST be first import to load environment variables before other modules
import './env.js';

import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import os from 'os';
import { createLogger } from '@studio/shared/src/services/infrastructure/logger.js';
import { ensureTempDir, ensureJobsDir, TEMP_DIR } from './utils/index.js';

// Import modular routes
import exportRoutes from './routes/export.js';
import importRoutes from './routes/import.js';
import healthRoutes from './routes/health.js';
import geminiRoutes from './routes/gemini.js';
import deapiRoutes from './routes/deapi.js';
import sunoRoutes from './routes/suno.js';
import cloudRoutes from './routes/cloud.js';
import directorRoutes from './routes/director.js';
import productionRoutes from './routes/production.js';

// Import job queue and worker pool
import { jobQueue } from './services/jobQueue/index.js';
import { workerPool } from './workers/workerPool.js';
import { detectEncoders } from './services/encoding/encoderStrategy.js';

const serverLog = createLogger('Server');
const PORT = process.env.PORT || 3001;

// --- App Initialization ---
const app = express();

// Ensure directories exist
ensureTempDir();
ensureJobsDir();

// --- CORS ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, mobile apps, Capacitor)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' is not allowed`));
  },
  credentials: true,
}));

// --- Rate limiters ---
// Generic API limiter: 120 requests / 1 minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});

// Heavy AI generation routes: stricter limits
const geminiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Gemini rate limit exceeded. Try again in a minute.', code: 'RATE_LIMIT_EXCEEDED' },
});

const productionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Production run limit reached (5/hour). Try again later.', code: 'RATE_LIMIT_EXCEEDED' },
  skip: (req) => req.method !== 'POST' || !req.path.includes('/start'),
});

const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Export limit reached (10/hour). Try again later.', code: 'RATE_LIMIT_EXCEEDED' },
  skip: (req) => !['POST', 'PUT'].includes(req.method),
});

const deapiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'DeAPI rate limit reached (20/hour). Try again later.', code: 'RATE_LIMIT_EXCEEDED' },
  skip: (req) => req.method === 'GET',
});

// --- Body parsing (global, conservative limit) ---
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    (req as { rawBody?: string }).rawBody = buf.toString('utf8');
  },
}));

// --- Modular Routes (with rate limiting) ---
app.use('/api/export', apiLimiter, exportLimiter, exportRoutes);
app.use('/api/import', apiLimiter, importRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/gemini', apiLimiter, geminiLimiter, geminiRoutes);
app.use('/api/deapi', apiLimiter, deapiLimiter, deapiRoutes);
app.use('/api/suno', apiLimiter, sunoRoutes);
app.use('/api/cloud', apiLimiter, cloudRoutes);
app.use('/api/director', apiLimiter, directorRoutes);
app.use('/api/production', apiLimiter, productionLimiter, productionRoutes);

// Global error handler — must be registered after all routes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  serverLog.error('Unhandled route error:', err);
  res.status(500).json({ success: false, error: message });
});

// Get network IP for display
function getNetworkIP(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (!interfaces) continue;
    for (const net of interfaces) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Initialize rendering infrastructure
async function initializeRenderingInfrastructure(): Promise<void> {
  try {
    // Detect available encoders
    await detectEncoders();

    // Initialize worker pool
    workerPool.setMessageHandler((msg) => {
      // Forward worker messages to job queue
      switch (msg.type) {
        case 'PROGRESS':
          if (msg.data) {
            jobQueue.updateJobProgress(
              msg.jobId,
              msg.data.progress || 0,
              msg.data.currentFrame
            );
          }
          break;

        case 'COMPLETE':
          jobQueue.updateJobStatus(msg.jobId, 'complete', {
            outputPath: msg.data?.outputPath,
            outputSize: msg.data?.outputSize,
            progress: 100,
          });
          break;

        case 'STARTED':
          // Worker confirmed it received the job — start the stall timer now,
          // not when the job entered "encoding" status (worker may have been busy).
          jobQueue.recordHeartbeat(msg.jobId);
          break;

        case 'HEARTBEAT':
          jobQueue.recordHeartbeat(msg.jobId);
          break;

        case 'ERROR':
          jobQueue.handleJobError(msg.jobId, new Error(msg.data?.error || 'Unknown error'));
          break;
      }
    });
    await workerPool.initialize();

    // Initialize job queue with worker pool as processor
    jobQueue.setJobProcessor(async (job) => {
      await jobQueue.updateJobStatus(job.jobId, 'encoding');
      await workerPool.submitJob(job);
    });
    await jobQueue.initialize();

    serverLog.info('Rendering infrastructure initialized');
  } catch (error) {
    serverLog.error('Failed to initialize rendering infrastructure:', error);
    // Continue without rendering - server can still handle other routes
  }
}

// Listen on all interfaces (0.0.0.0) for network access
app.listen(Number(PORT), '0.0.0.0', async () => {
  const networkIP = getNetworkIP();
  serverLog.info(`API server running on:`);
  serverLog.info(`  ➜  Local:   http://localhost:${PORT}`);
  serverLog.info(`  ➜  Network: http://${networkIP}:${PORT}`);
  serverLog.info(`Temp directory: ${TEMP_DIR}`);

  // Initialize rendering infrastructure after server starts
  await initializeRenderingInfrastructure();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  serverLog.info('SIGTERM received, shutting down gracefully...');
  jobQueue.shutdown();
  await workerPool.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  serverLog.info('SIGINT received, shutting down gracefully...');
  jobQueue.shutdown();
  await workerPool.shutdown();
  process.exit(0);
});
