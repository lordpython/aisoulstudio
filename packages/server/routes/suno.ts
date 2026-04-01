import { Router, Response, Request } from 'express';
import { createLogger } from '@studio/shared/src/services/logger.js';
import fs from 'fs';
import multer from 'multer';
import { MAX_SINGLE_FILE } from '../utils/index.js';
import {
    buildProxyUrl,
    isAllowedProxyEndpoint,
    isSafeProxyEndpoint,
    normalizeProxyEndpoint,
    sendError,
    type ProxyEndpointRule,
} from './routeUtils.js';

const sunoLog = createLogger('Suno');
const router = Router();
const upload = multer({
    dest: 'temp/',
    limits: { fileSize: MAX_SINGLE_FILE }
});

const SUNO_PROXY_RULES: ProxyEndpointRule[] = [
    { methods: ['POST'], pattern: /^generate$/ },
    { methods: ['GET'], pattern: /^generate\/record-info$/ },
    { methods: ['POST'], pattern: /^generate-lyrics$/ },
    { methods: ['GET'], pattern: /^generate-lyrics\/record-info$/ },
    { methods: ['GET'], pattern: /^get-timestamped-lyrics$/ },
    { methods: ['GET'], pattern: /^generate\/credit$/ },
    { methods: ['POST'], pattern: /^create-music-video$/ },
    { methods: ['POST'], pattern: /^cover$/ },
    { methods: ['POST'], pattern: /^boost-music-style$/ },
    { methods: ['POST'], pattern: /^add-vocals$/ },
    { methods: ['POST'], pattern: /^add-instrumental$/ },
    { methods: ['POST'], pattern: /^generate\/upload-cover$/ },
    { methods: ['POST'], pattern: /^replace-section$/ },
    { methods: ['POST'], pattern: /^extend$/ },
    { methods: ['POST'], pattern: /^upload-and-extend$/ },
    { methods: ['POST'], pattern: /^generate-persona$/ },
    { methods: ['POST'], pattern: /^convert-to-wav$/ },
    { methods: ['POST'], pattern: /^separate-vocals-from-music$/ },
    { methods: ['GET'], pattern: /^separate-vocals-from-music\/record-info$/ },
    { methods: ['POST'], pattern: /^upload\/base64$/ },
    { methods: ['POST'], pattern: /^upload\/url$/ },
];

router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
        sendError(res, 'No file provided', 400);
        return;
    }

    const SUNO_API_KEY = process.env.VITE_SUNO_API_KEY || process.env.SUNO_API_KEY;
    if (!SUNO_API_KEY) {
        sendError(res, 'Suno API key not configured on server', 500);
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
        sendError(res, error.message || 'Upload failed', 500);
    }
});

router.use('/proxy', async (req: Request, res: Response): Promise<void> => {
    const endpoint = normalizeProxyEndpoint(req.path);
    const SUNO_API_KEY = process.env.VITE_SUNO_API_KEY || process.env.SUNO_API_KEY;

    if (!SUNO_API_KEY) {
        sendError(res, 'Suno API key not configured on server', 500);
        return;
    }

    if (!isSafeProxyEndpoint(endpoint)) {
        sendError(res, 'Invalid proxy endpoint', 400);
        return;
    }

    if (!isAllowedProxyEndpoint(endpoint, req.method, SUNO_PROXY_RULES)) {
        sunoLog.warn('Rejected disallowed Suno proxy request', {
            method: req.method,
            endpoint,
        });
        sendError(res, 'Proxy endpoint is not allowed', 403);
        return;
    }

    try {
        const sunoUrl = buildProxyUrl('https://api.sunoapi.org/api/v1', endpoint, req.query);
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
        sendError(res, error.message || 'Suno proxy failed', 500);
    }
});

export default router;
