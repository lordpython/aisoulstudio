// MUST be first import to load environment variables before other modules
import './env.js';

import express from 'express';
import cors from 'cors';
import os from 'os';
import { createLogger } from '../services/logger.js';
import { ensureTempDir, TEMP_DIR } from './utils/index.js';

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

const serverLog = createLogger('Server');
const PORT = process.env.PORT || 3001;

// --- App Initialization ---
const app = express();

// Ensure temp directory exists
ensureTempDir();

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

// Listen on all interfaces (0.0.0.0) for network access
app.listen(PORT, '0.0.0.0', () => {
  const networkIP = getNetworkIP();
  serverLog.info(`API server running on:`);
  serverLog.info(`  ➜  Local:   http://localhost:${PORT}`);
  serverLog.info(`  ➜  Network: http://${networkIP}:${PORT}`);
  serverLog.info(`Temp directory: ${TEMP_DIR}`);
});
