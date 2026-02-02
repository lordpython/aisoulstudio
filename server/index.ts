// MUST be first import to load environment variables before other modules
import './env.js';

import express from 'express';
import cors from 'cors';
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

app.listen(PORT, () => {
  serverLog.info(`FFmpeg export server running on http://localhost:${PORT}`);
  serverLog.info(`Temp directory: ${TEMP_DIR}`);
});
