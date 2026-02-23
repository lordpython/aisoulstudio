// MUST be first import to load environment variables before other modules
import './env.js';

import express from 'express';
import cors from 'cors';
import os from 'os';
import { createLogger } from '@studio/shared/src/services/logger.js';
import { ensureTempDir, ensureJobsDir, TEMP_DIR } from './utils/index.js';

// Import modular routes
import exportRoutes from './routes/export.js';
import importRoutes from './routes/import.js';
import healthRoutes from './routes/health.js';
import geminiRoutes from './routes/gemini.js';
import deapiRoutes from './routes/deapi.js';
import sunoRoutes from './routes/suno.js';
import cloudRoutes from './routes/cloud.js';
import videoRoutes from './routes/video.js';
import directorRoutes from './routes/director.js';

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

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Modular Routes ---
app.use('/api/export', exportRoutes);
app.use('/api/import', importRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/deapi', deapiRoutes);
app.use('/api/suno', sunoRoutes);
app.use('/api/cloud', cloudRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/director', directorRoutes);

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
