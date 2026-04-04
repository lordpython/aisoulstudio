/**
 * Export Persistence Module
 *
 * Cloud upload and Firestore export record saving.
 * Non-throwing: logs warnings on failure and returns undefined.
 */

import { cloudAutosave } from "../cloud/cloudStorageService";
import { saveExportRecord } from "../project/projectService";
import { ExportConfig } from "./exportConfig";
import { ffmpegLogger } from '../infrastructure/logger';

const log = ffmpegLogger.child('Persistence');

/**
 * Upload the video blob to cloud storage and optionally save a Firestore export record.
 * Returns the public cloud URL on success, undefined on failure or if no cloudSessionId.
 */
export async function persistExport(
    cloudSessionId: string | undefined,
    videoBlob: Blob,
    config: ExportConfig,
    userId: string | undefined,
    projectId: string | undefined,
    duration: number,
    logPrefix = "[Export]"
): Promise<string | undefined> {
    if (!cloudSessionId) return undefined;

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `export_${timestamp}.mp4`;

        const result = await cloudAutosave.saveAsset(
            cloudSessionId,
            videoBlob,
            filename,
            "exports",
            true,  // waitForUpload
            true   // makePublic
        );

        if (!result.publicUrl) return undefined;

        const cloudUrl = result.publicUrl;
        log.info(`Final video uploaded to cloud: ${cloudUrl}`);

        if (userId && projectId) {
            const aspectRatio = config.orientation === "landscape" ? "16:9" : "9:16";
            await saveExportRecord(projectId, {
                format: "mp4",
                quality: config.quality || "standard",
                aspectRatio: aspectRatio as "16:9" | "9:16" | "1:1",
                cloudUrl,
                fileSize: videoBlob.size,
                duration,
            });
            log.info('Export record saved to Firestore');
        }

        return cloudUrl;
    } catch (err) {
        log.warn('Cloud upload/record failed (non-fatal)', err);
        return undefined;
    }
}
