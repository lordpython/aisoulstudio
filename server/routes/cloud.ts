import { Router, Response, Request } from 'express';
import { createLogger } from '../../services/logger.js';
import multer from 'multer';
import path from 'path';
import type { Storage } from '@google-cloud/storage';

const cloudLog = createLogger('Cloud');
const router = Router();
const GCS_BUCKET_NAME = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'aisoul-studio-storage';

let gcsStorage: Storage | null = null;
let GcsStorageClass: any = null;

async function getGcsStorageClient(): Promise<Storage> {
    if (gcsStorage) return gcsStorage;
    try {
        if (!GcsStorageClass) {
            const gcs = await import('@google-cloud/storage');
            GcsStorageClass = gcs.Storage;
        }
        const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_GOOGLE_CLOUD_PROJECT;
        gcsStorage = projectId ? new GcsStorageClass({ projectId }) : new GcsStorageClass();
        return gcsStorage!;
    } catch (error) {
        cloudLog.error('Failed to initialize GCS:', error);
        throw error;
    }
}

const memoryUpload = multer({ storage: multer.memoryStorage() });

router.post('/init', async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.body;
    if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
    }

    try {
        const storage = await getGcsStorageClient();
        const bucket = storage.bucket(GCS_BUCKET_NAME);
        const [exists] = await bucket.exists();
        if (!exists) {
            res.status(404).json({ error: 'Bucket not found' });
            return;
        }

        await bucket.file(`production_${sessionId}/_session_started.txt`).save(
            `Session Started: ${new Date().toISOString()}\nSessionId: ${sessionId}`
        );

        res.json({ success: true, message: `Session ${sessionId} initialized` });
    } catch (error: any) {
        cloudLog.error('Cloud init error:', error);
        res.status(500).json({ error: error.message || 'Cloud init failed' });
    }
});

router.post('/upload-asset', memoryUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
    const { sessionId, assetType, filename, makePublic } = req.body;
    if (!req.file || !sessionId) {
        res.status(400).json({ error: 'Missing file or sessionId' });
        return;
    }

    const validAssetTypes = ['visuals', 'audio', 'music', 'video_clips', 'sfx', 'subtitles'];
    const safeAssetType = validAssetTypes.includes(assetType) ? assetType : 'misc';
    const safeFilename = path.basename(filename || `asset_${Date.now()}`);
    const destination = `production_${sessionId}/${safeAssetType}/${safeFilename}`;
    const shouldMakePublic = makePublic === 'true' || makePublic === true;

    try {
        const storage = await getGcsStorageClient();
        const bucket = storage.bucket(GCS_BUCKET_NAME);
        const blob = bucket.file(destination);

        const blobStream = blob.createWriteStream({
            resumable: false,
            metadata: { contentType: req.file.mimetype || 'application/octet-stream' }
        });

        blobStream.on('error', (err: any) => res.status(500).json({ error: err.message }));
        blobStream.on('finish', async () => {
            let publicUrl: string | undefined;
            if (shouldMakePublic) {
                try {
                    await blob.makePublic();
                    publicUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${destination}`;
                } catch (_e) {
                    const [signedUrl] = await blob.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
                    publicUrl = signedUrl;
                }
            }
            res.json({ success: true, publicUrl, gsUri: `gs://${GCS_BUCKET_NAME}/${destination}` });
        });
        blobStream.end(req.file.buffer);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/status', async (req: Request, res: Response): Promise<void> => {
    try {
        const storage = await getGcsStorageClient();
        const bucket = storage.bucket(GCS_BUCKET_NAME);
        const [exists] = await bucket.exists();
        res.json({ available: exists, bucketName: GCS_BUCKET_NAME });
    } catch (error: any) {
        res.json({ available: false, message: error.message });
    }
});

export default router;

