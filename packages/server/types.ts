import { Request } from 'express';

export interface ApiProxyRequest extends Request {
    body: {
        prompt?: string;
        imageUrl?: string;
        options?: Record<string, unknown>;
        model?: string;
        contents?: unknown;
        config?: Record<string, unknown>;
        sceneDescription?: string;
        style?: string;
        mood?: string;
        globalSubject?: string;
        videoPurpose?: string;
        duration?: number;
        aspectRatio?: string;
        useFastModel?: boolean;
        skipRefine?: boolean;
        seed?: number;
        srtContent?: string;
        contentType?: string;
    };
}

export interface ExportRequest extends Request {
    sessionId?: string;
    files?: Express.Multer.File[];
}
