import { Router, Response, Request } from 'express';
import { createLogger } from '@studio/shared/src/services/logger.js';
import multer from 'multer';
import path from 'path';
import type { Storage } from '@google-cloud/storage';
import { MAX_FILE_SIZE } from '../utils/index.js';
import { sendError } from './routeUtils.js';

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
            sendError(res, 'sessionId is required', 400);
            return;
        }

        try {
            const storage = await deps.getStorageClient();
            const bucket = storage.bucket(GCS_BUCKET_NAME);
            const [exists] = await bucket.exists();
            if (!exists) {
                sendError(res, 'Bucket not found', 404);
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
            sendError(res, error.message || 'Cloud init failed', 500);
        }
    });

    router.post('/upload-asset', memoryUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
        const { sessionId, assetType, filename, makePublic, userId } = req.body;
        if (!req.file || !sessionId) {
            sendError(res, 'Missing file or sessionId', 400);
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

            blobStream.on('error', (err: any) => sendError(res, err.message, 500));
            blobStream.on('finish', async () => {
                let publicUrl: string | undefined;
                if (shouldMakePublic) {
                    publicUrl = `/api/cloud/file?path=${encodeURIComponent(destination)}`;
                }
                res.json({ success: true, publicUrl, gsUri: `gs://${GCS_BUCKET_NAME}/${destination}` });
            });
            blobStream.end(req.file.buffer);
        } catch (error: any) {
            sendError(res, error.message, 500);
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
            sendError(res, 'File path is required (use ?path=...)', 400);
            return;
        }

        if (!isValidStoragePath(filePath)) {
            sendError(res, 'Invalid file path', 400);
            return;
        }

        try {
            const storage = await deps.getStorageClient();
            const bucket = storage.bucket(GCS_BUCKET_NAME);
            const file = bucket.file(filePath);

            const [exists] = await file.exists();
            if (!exists) {
                sendError(res, 'File not found', 404);
                return;
            }

            const [metadata] = await file.getMetadata();
            const contentType = typeof metadata.contentType === 'string' && metadata.contentType
                ? metadata.contentType
                : 'application/octet-stream';
            const totalSize = Number(metadata.size || 0);
            const range = req.headers.range;

            // Set response headers
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Disposition', 'inline');

            if (range && totalSize > 0) {
                const match = /^bytes=(\d*)-(\d*)$/.exec(range);
                if (!match) {
                    res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
                    res.end();
                    return;
                }

                const start = match[1] ? parseInt(match[1], 10) : 0;
                const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

                if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= totalSize || start > end) {
                    res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
                    res.end();
                    return;
                }

                const chunkSize = end - start + 1;
                res.status(206);
                res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
                res.setHeader('Content-Length', chunkSize.toString());

                const createRangeReadStream = file.createReadStream as unknown as (options?: { start?: number; end?: number }) => NodeJS.ReadableStream;

                createRangeReadStream({ start, end })
                    .on('error', (err) => {
                        cloudLog.error('File proxy range stream error:', err);
                        if (!res.headersSent) res.status(500).end();
                        else res.end();
                    })
                    .pipe(res);
                return;
            }

            if (totalSize > 0) {
                res.setHeader('Content-Length', totalSize.toString());
            }

            file.createReadStream()
                .on('error', (err) => {
                    cloudLog.error('File proxy stream error:', err);
                    if (!res.headersSent) res.status(500).end();
                    else res.end();
                })
                .pipe(res);
        } catch (error: any) {
            cloudLog.error('File proxy error:', error);
            sendError(res, error.message || 'Failed to retrieve file', 500);
        }
    });

    return router;
}

export default createCloudRouter();

