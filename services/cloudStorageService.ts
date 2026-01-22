/**
 * Cloud Storage Service - Google Cloud Storage integration
 *
 * Uploads production outputs to GCS bucket with organized folder structure
 * Format: gs://aisoul-studio-storage/YYYY-MM-DD_HH-mm-ss/
 *
 * NOTE: This module should only be loaded in Node.js environment.
 * It will throw errors if accessed in browser.
 */

// Configuration
const BUCKET_NAME = 'aisoul-studio-storage';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_GOOGLE_CLOUD_PROJECT;

// Storage client singleton
let storage: any = null;
let StorageClass: any = null;

/**
 * Initialize the Storage class (lazy loading)
 */
function getStorageClass(): any {
  if (StorageClass) return StorageClass;
  
  if (typeof window !== 'undefined') {
    throw new Error('Cloud Storage operations are not supported in browser. Use server-side export instead.');
  }
  
  try {
    const gcs = require('@google-cloud/storage');
    StorageClass = gcs.Storage;
    return StorageClass;
  } catch (error) {
    throw new Error(`Failed to load @google-cloud/storage: ${error}`);
  }
}

/**
 * Get or initialize storage client
 * NOTE: This only works in Node.js environment (server-side)
 */
function getStorageClient(): any {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    throw new Error('Cloud Storage operations are not supported in browser. Use server-side export instead.');
  }

  if (!storage) {
    const Storage = getStorageClass();
    if (PROJECT_ID) {
      storage = new Storage({ projectId: PROJECT_ID });
    } else {
      storage = new Storage(); // Uses ADC
    }
  }
  return storage;
}

/**
 * Reset storage client (for testing)
 */
export function _resetStorageClient(): void {
  storage = null;
  StorageClass = null;
}

/**
 * Set mock storage class (for testing)
 */
export function _setMockStorageClass(mockClass: any): void {
  StorageClass = mockClass;
  storage = null;
}

/**
 * Generate folder name from current date/time
 * Format: YYYY-MM-DD_HH-mm-ss
 */
export function generateProductionFolder(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Upload result for a single file upload
 */
export interface UploadResult {
  success: boolean;
  fileName: string;
  gsPath: string;
  publicUrl?: string;
  size: number;
  error?: string;
}

/**
 * Production upload bundle
 */
export interface ProductionBundle {
  /** Final video blob */
  video?: Blob;
  /** Narration audio blob (concatenated) */
  narrationAudio?: Blob;
  /** Mixed audio blob (with SFX/music) */
  mixedAudio?: Blob;
  /** Background music blob */
  backgroundMusic?: Blob;
  /** Visual images/videos */
  visuals?: Array<{ sceneId: string; blob: Blob; type: 'image' | 'video' }>;
  /** Subtitle files */
  subtitles?: { format: 'srt' | 'vtt'; content: string }[];
  /** Production logs */
  logs?: string[];
  /** Metadata */
  metadata?: {
    topic: string;
    duration: number;
    language: string;
    sceneCount: number;
    productionId: string;
  };
}

/**
 * Upload a single file to GCS
 *
 * @param blob - File blob to upload
 * @param folderName - Production folder name (e.g., "2024-01-15_14-30-00")
 * @param fileName - File name (e.g., "final-video.mp4")
 * @param makePublic - Whether to make file publicly accessible
 * @returns Upload result
 */
export async function uploadFile(
  blob: Blob,
  folderName: string,
  fileName: string,
  makePublic: boolean = false
): Promise<UploadResult> {
  try {
    const client = getStorageClient();
    const bucket = client.bucket(BUCKET_NAME);
    const filePath = `${folderName}/${fileName}`;
    const file = bucket.file(filePath);

    console.log(`[CloudStorage] Uploading ${fileName} to gs://${BUCKET_NAME}/${filePath}`);

    // Convert blob to buffer
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload with metadata
    await file.save(buffer, {
      metadata: {
        contentType: blob.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000',
      },
    });

    // Make public if requested
    let publicUrl: string | undefined;
    if (makePublic) {
      await file.makePublic();
      publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filePath}`;
    }

    console.log(`[CloudStorage] ✓ Uploaded ${fileName} (${Math.round(blob.size / 1024)}KB)`);

    return {
      success: true,
      fileName,
      gsPath: `gs://${BUCKET_NAME}/${filePath}`,
      publicUrl,
      size: blob.size,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[CloudStorage] ✗ Failed to upload ${fileName}:`, errorMessage);

    return {
      success: false,
      fileName,
      gsPath: `gs://${BUCKET_NAME}/${folderName}/${fileName}`,
      size: blob.size,
      error: errorMessage,
    };
  }
}

/**
 * Upload text content as a file
 *
 * @param content - Text content to upload
 * @param folderName - Production folder name
 * @param fileName - File name (e.g., "subtitles.srt")
 * @param contentType - MIME type (default: text/plain)
 * @returns Upload result
 */
export async function uploadTextFile(
  content: string,
  folderName: string,
  fileName: string,
  contentType: string = 'text/plain; charset=utf-8'
): Promise<UploadResult> {
  const blob = new Blob([content], { type: contentType });
  return uploadFile(blob, folderName, fileName, false);
}

/**
 * Upload entire production bundle to GCS
 *
 * Creates organized folder structure:
 * - final-video.mp4          (main output)
 * - narration.wav            (narration audio)
 * - mixed-audio.wav          (final mixed audio)
 * - background-music.mp3     (background music if any)
 * - visuals/scene-1.png      (scene visuals)
 * - visuals/scene-2.png
 * - subtitles.srt            (subtitles if any)
 * - subtitles.vtt
 * - production.log           (production logs)
 * - metadata.json            (production metadata)
 *
 * @param bundle - Production bundle to upload
 * @param makePublic - Whether to make files publicly accessible
 * @returns Array of upload results
 */
export async function uploadProductionBundle(
  bundle: ProductionBundle,
  makePublic: boolean = false
): Promise<{
  folderName: string;
  results: UploadResult[];
  publicUrls: Record<string, string>;
  errors: string[];
}> {
  const folderName = generateProductionFolder();
  const results: UploadResult[] = [];
  const publicUrls: Record<string, string> = {};
  const errors: string[] = [];

  console.log(`[CloudStorage] Starting production upload to folder: ${folderName}`);

  // Upload video
  if (bundle.video) {
    const ext = bundle.video.type.includes('webm') ? 'webm' : 'mp4';
    const result = await uploadFile(bundle.video, folderName, `final-video.${ext}`, makePublic);
    results.push(result);
    if (result.success && result.publicUrl) {
      publicUrls.video = result.publicUrl;
    } else if (!result.success) {
      errors.push(`Video upload failed: ${result.error}`);
    }
  }

  // Upload narration audio
  if (bundle.narrationAudio) {
    const result = await uploadFile(bundle.narrationAudio, folderName, 'narration.wav', makePublic);
    results.push(result);
    if (result.success && result.publicUrl) {
      publicUrls.narration = result.publicUrl;
    } else if (!result.success) {
      errors.push(`Narration upload failed: ${result.error}`);
    }
  }

  // Upload mixed audio
  if (bundle.mixedAudio) {
    const result = await uploadFile(bundle.mixedAudio, folderName, 'mixed-audio.wav', makePublic);
    results.push(result);
    if (result.success && result.publicUrl) {
      publicUrls.mixedAudio = result.publicUrl;
    } else if (!result.success) {
      errors.push(`Mixed audio upload failed: ${result.error}`);
    }
  }

  // Upload background music
  if (bundle.backgroundMusic) {
    const ext = bundle.backgroundMusic.type.includes('wav') ? 'wav' : 'mp3';
    const result = await uploadFile(bundle.backgroundMusic, folderName, `background-music.${ext}`, makePublic);
    results.push(result);
    if (result.success && result.publicUrl) {
      publicUrls.music = result.publicUrl;
    } else if (!result.success) {
      errors.push(`Music upload failed: ${result.error}`);
    }
  }

  // Upload visuals
  if (bundle.visuals && bundle.visuals.length > 0) {
    for (const visual of bundle.visuals) {
      const ext = visual.type === 'video' ? 'mp4' : 'png';
      const fileName = `visuals/${visual.sceneId}.${ext}`;
      const result = await uploadFile(visual.blob, folderName, fileName, makePublic);
      results.push(result);
      if (!result.success) {
        errors.push(`Visual ${visual.sceneId} upload failed: ${result.error}`);
      }
    }
  }

  // Upload subtitles
  if (bundle.subtitles && bundle.subtitles.length > 0) {
    for (const subtitle of bundle.subtitles) {
      const contentType = subtitle.format === 'vtt' ? 'text/vtt' : 'text/plain';
      const result = await uploadTextFile(
        subtitle.content,
        folderName,
        `subtitles.${subtitle.format}`,
        contentType
      );
      results.push(result);
      if (result.success && result.publicUrl) {
        publicUrls[`subtitles_${subtitle.format}`] = result.publicUrl;
      } else if (!result.success) {
        errors.push(`Subtitles (${subtitle.format}) upload failed: ${result.error}`);
      }
    }
  }

  // Upload production logs
  if (bundle.logs && bundle.logs.length > 0) {
    const logContent = bundle.logs.join('\n');
    const result = await uploadTextFile(logContent, folderName, 'production.log', 'text/plain');
    results.push(result);
    if (!result.success) {
      errors.push(`Logs upload failed: ${result.error}`);
    }
  }

  // Upload metadata
  if (bundle.metadata) {
    const metadataContent = JSON.stringify(bundle.metadata, null, 2);
    const result = await uploadTextFile(metadataContent, folderName, 'metadata.json', 'application/json');
    results.push(result);
    if (!result.success) {
      errors.push(`Metadata upload failed: ${result.error}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const totalSize = results.reduce((sum, r) => sum + r.size, 0);

  console.log(`[CloudStorage] Upload complete: ${successCount}/${results.length} files (${Math.round(totalSize / 1024 / 1024)}MB)`);
  console.log(`[CloudStorage] Folder: gs://${BUCKET_NAME}/${folderName}`);

  if (errors.length > 0) {
    console.warn(`[CloudStorage] ${errors.length} upload errors occurred`);
  }

  return {
    folderName,
    results,
    publicUrls,
    errors,
  };
}

/**
 * List all production folders in the bucket
 *
 * @param limit - Maximum number of folders to return
 * @returns Array of folder names
 */
export async function listProductionFolders(limit: number = 100): Promise<string[]> {
  try {
    const client = getStorageClient();
    const bucket = client.bucket(BUCKET_NAME);

    const [files] = await bucket.getFiles({ prefix: '', delimiter: '/' });

    // Extract unique folder prefixes
    const folders = new Set<string>();
    for (const file of files) {
      const parts = file.name.split('/');
      if (parts.length > 1) {
        folders.add(parts[0]);
      }
    }

    return Array.from(folders)
      .sort()
      .reverse()
      .slice(0, limit);
  } catch (error) {
    console.error('[CloudStorage] Failed to list folders:', error);
    return [];
  }
}

/**
 * Delete a production folder and all its contents
 *
 * @param folderName - Folder name to delete
 * @returns Number of files deleted
 */
export async function deleteProductionFolder(folderName: string): Promise<number> {
  try {
    const client = getStorageClient();
    const bucket = client.bucket(BUCKET_NAME);

    const [files] = await bucket.getFiles({ prefix: `${folderName}/` });

    console.log(`[CloudStorage] Deleting ${files.length} files from ${folderName}`);

    await Promise.all(files.map(file => file.delete()));

    console.log(`[CloudStorage] ✓ Deleted folder ${folderName}`);

    return files.length;
  } catch (error) {
    console.error('[CloudStorage] Failed to delete folder:', error);
    return 0;
  }
}

/**
 * Check if GCS is configured and accessible
 */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    const client = getStorageClient();
    const bucket = client.bucket(BUCKET_NAME);
    await bucket.exists();
    return true;
  } catch (error) {
    console.warn('[CloudStorage] Storage not available:', error);
    return false;
  }
}
