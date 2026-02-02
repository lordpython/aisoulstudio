import { Router, Response, Request } from 'express';
import { createLogger } from '../../services/logger.js';
import fs from 'fs';
import multer from 'multer';

const sunoLog = createLogger('Suno');
const router = Router();
const upload = multer({ dest: 'temp/' });

router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
    }

    const SUNO_API_KEY = process.env.VITE_SUNO_API_KEY || process.env.SUNO_API_KEY;
    if (!SUNO_API_KEY) {
        res.status(500).json({ error: 'Suno API key not configured on server' });
        return;
    }

    const filePath = req.file.path;
    try {
        sunoLog.info(`Uploading file: ${req.file.originalname}`);
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: req.file.mimetype });

        const formData = new FormData();
        formData.append('file', blob, req.file.originalname);
        formData.append('uploadPath', 'custom_uploads');

        const response = await fetch('https://sunoapiorg.redpandaai.co/api/file-stream-upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUNO_API_KEY}` },
            body: formData,
        });

        const data = await response.json();
        fs.unlinkSync(filePath);
        res.json(data);
    } catch (error: any) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ error: error.message || 'Upload failed' });
    }
});

router.use('/proxy', async (req: Request, res: Response): Promise<void> => {
    const endpoint = req.path.startsWith('/') ? req.path.slice(1) : req.path;
    const SUNO_API_KEY = process.env.VITE_SUNO_API_KEY || process.env.SUNO_API_KEY;

    if (!SUNO_API_KEY) {
        res.status(500).json({ error: 'Suno API key not configured on server' });
        return;
    }

    try {
        const sunoUrl = `https://api.sunoapi.org/api/v1/${endpoint}`;
        sunoLog.info(`Proxying ${req.method} request to Suno: ${endpoint}`);
        const fetchOptions: RequestInit = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${SUNO_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(sunoUrl, fetchOptions);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Suno proxy failed' });
    }
});

export default router;
