import { Router, Response, Request } from 'express';
import { createLogger } from '@studio/shared/src/services/logger.js';
import multer from 'multer';
import path from 'path';
import type { Storage } from '@google-cloud/storage';
import { MAX_FILE_SIZE } from '../utils/index.js';

const cloudLog = createLogger('Cloud');
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

const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE }
});

type CloudStorageClient = {
    bucket: (name: string) => {
        exists: () => Promise<[boolean]>;
        file: (filePath: string) => {
            save: (content: string) => Promise<void>;
            createWriteStream: (options: { resumable: boolean; metadata: { contentType: string } }) => NodeJS.WritableStream;
            exists: () => Promise<[boolean]>;
            getMetadata: () => Promise<[Record<string, unknown>]>;
            createReadStream: () => NodeJS.ReadableStream;
        };
    };
};

interface CloudRouteDependencies {
    getStorageClient: () => Promise<CloudStorageClient>;
}

function sanitizeStorageSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '');
}

function isValidStoragePath(filePath: string): boolean {
    if (!filePath) return false;
    if (filePath.includes('..')) return false;
    if (filePath.includes('\\')) return false;
    if (filePath.startsWith('/')) return false;
    if (!/^(users\/[A-Za-z0-9._-]+\/projects\/[A-Za-z0-9._-]+|production_[A-Za-z0-9._-]+)/.test(filePath)) {
        return false;
    }

    return filePath.split('/').every((segment) => segment.length > 0);
}

/**
 * Build storage path based on whether userId is provided.
 * User-aware path: users/{userId}/projects/{sessionId}/
 * Legacy path: production_{sessionId}/
 */
function buildStoragePath(sessionId: string, userId?: string, assetType?: string, filename?: string): string {
    const safeSessionId = sanitizeStorageSegment(sessionId);
    const safeUserId = userId ? sanitizeStorageSegment(userId) : undefined;
    const basePath = userId
        ? `users/${safeUserId}/projects/${safeSessionId}`
        : `production_${safeSessionId}`;

    if (assetType && filename) {
        return `${basePath}/${sanitizeStorageSegment(assetType)}/${path.posix.basename(filename)}`;
    }
    if (assetType) {
        return `${basePath}/${sanitizeStorageSegment(assetType)}`;
    }
    return basePath;
}

export function createCloudRouter(
    overrides: Partial<CloudRouteDependencies> = {},
): Router {
    const router = Router();
    const deps: CloudRouteDependencies = {
        getStorageClient: async () => getGcsStorageClient() as unknown as CloudStorageClient,
        ...overrides,
    };

    router.post('/init', async (req: Request, res: Response): Promise<void> => {
        const { sessionId, userId } = req.body;
        if (!sessionId) {
            res.status(400).json({ error: 'sessionId is required' });
            return;
        }

        try {
            const storage = await deps.getStorageClient();
            const bucket = storage.bucket(GCS_BUCKET_NAME);
            const [exists] = await bucket.exists();
            if (!exists) {
                res.status(404).json({ error: 'Bucket not found' });
                return;
            }

            const folderPath = buildStoragePath(sessionId, userId);
            const markerContent = userId
                ? `Session Started: ${new Date().toISOString()}\nSessionId: ${sessionId}\nUserId: ${userId}`
                : `Session Started: ${new Date().toISOString()}\nSessionId: ${sessionId}`;

            await bucket.file(`${folderPath}/_session_started.txt`).save(markerContent);

            res.json({
                success: true,
                message: `Session ${sessionId} initialized`,
                folderPath,
                userAware: !!userId
            });
        } catch (error: any) {
            cloudLog.error('Cloud init error:', error);
            res.status(500).json({ error: error.message || 'Cloud init failed' });
        }
    });

    router.post('/upload-asset', memoryUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
        const { sessionId, assetType, filename, makePublic, userId } = req.body;
        if (!req.file || !sessionId) {
            res.status(400).json({ error: 'Missing file or sessionId' });
            return;
        }

        const validAssetTypes = ['visuals', 'audio', 'music', 'video_clips', 'sfx', 'subtitles', 'exports', 'ai_logs'];
        const safeAssetType = validAssetTypes.includes(assetType) ? assetType : 'misc';
        const safeFilename = path.basename(filename || `asset_${Date.now()}`);
        const destination = buildStoragePath(sessionId, userId, safeAssetType, safeFilename);
        const shouldMakePublic = makePublic === 'true' || makePublic === true;

        try {
            const storage = await deps.getStorageClient();
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
                    publicUrl = `/api/cloud/file?path=${encodeURIComponent(destination)}`;
                }
                res.json({ success: true, publicUrl, gsUri: `gs://${GCS_BUCKET_NAME}/${destination}` });
            });
            blobStream.end(req.file.buffer);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/status', async (_req: Request, res: Response): Promise<void> => {
        try {
            const storage = await deps.getStorageClient();
            const bucket = storage.bucket(GCS_BUCKET_NAME);
            const [exists] = await bucket.exists();
            res.json({ available: exists, bucketName: GCS_BUCKET_NAME });
        } catch (error: any) {
            res.json({ available: false, message: error.message });
        }
    });

    /**
     * Proxy endpoint to serve GCS files - avoids CORS issues
     * Query params:
     *   - path: The GCS file path (e.g., production_story_1770746549079/audio/narration_scene_0.wav)
     *
     * Supports both user-aware and legacy paths:
     * - User-aware: users/{userId}/projects/{sessionId}/{assetType}/{filename}
     * - Legacy: production_{sessionId}/{assetType}/{filename}
     */
    router.get('/file', async (req: Request, res: Response): Promise<void> => {
        const filePath = req.query.path as string;

        if (!filePath) {
            res.status(400).json({ error: 'File path is required (use ?path=...)' });
            return;
        }

        if (!isValidStoragePath(filePath)) {
            res.status(400).json({ error: 'Invalid file path' });
            return;
        }

        try {
            const storage = await deps.getStorageClient();
            const bucket = storage.bucket(GCS_BUCKET_NAME);
            const file = bucket.file(filePath);

            const [exists] = await file.exists();
            if (!exists) {
                res.status(404).json({ error: 'File not found' });
                return;
            }

            const [metadata] = await file.getMetadata();
            const contentType =
                typeof metadata.contentType === 'string'
                    ? metadata.contentType
                    : 'application/octet-stream';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000');

            file.createReadStream().pipe(res);
        } catch (error: any) {
            cloudLog.error('File proxy error:', error);
            res.status(500).json({ error: error.message || 'Failed to retrieve file' });
        }
    });

    return router;
}

export default createCloudRouter();

