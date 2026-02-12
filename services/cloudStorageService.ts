/**
 * Cloud Storage Service - Google Cloud Storage integration
 *
 * Uploads production outputs to GCS bucket with organized folder structure
 * Format: gs://aisoul-studio-storage/YYYY-MM-DD_HH-mm-ss/
 *
 * This module has two parts:
 * 1. Direct GCS uploads (Node.js server-side only)
 * 2. Real-time autosave via server proxy (works in browser)
 */

// Configuration
const BUCKET_NAME = 'aisoul-studio-storage';

// Server API base URL for cloud autosave
// In browser: use relative URLs so requests go through Vite's dev proxy
// On server: use direct URL
const CLOUD_API_BASE = typeof window !== 'undefined'
  ? ''
  : 'http://localhost:3001';

/**
 * Convert a direct GCS URL to a proxy URL to avoid CORS issues.
 * Handles both storage.googleapis.com and direct bucket URLs.
 * 
 * @param url - The GCS URL to convert
 * @returns Proxy URL or original URL if not a GCS URL
 */
export function toProxyUrl(url: string): string {
  if (!url) return url;
  
  // Match https://storage.googleapis.com/BUCKET_NAME/path
  const gcsMatch = url.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/);
  if (gcsMatch) {
    const bucket = gcsMatch[1];
    const path = gcsMatch[2];
    if (bucket === BUCKET_NAME && path) {
      return `/api/cloud/file?path=${encodeURIComponent(path)}`;
    }
  }
  
  // Match gs://BUCKET_NAME/path (GCS URI format)
  const gsMatch = url.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (gsMatch) {
    const bucket = gsMatch[1];
    const path = gsMatch[2];
    if (bucket === BUCKET_NAME && path) {
      return `/api/cloud/file?path=${encodeURIComponent(path)}`;
    }
  }
  
  // Return original if not a GCS URL or different bucket
  return url;
}

// --- Upload Retry Configuration ---
const UPLOAD_TIMEOUT_MS = 60000; // 60 second timeout for uploads
const UPLOAD_MAX_RETRIES = 3;

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Upload with retry logic for transient network failures
 */
async function uploadWithRetry(
  url: string,
  formData: FormData,
  maxRetries: number = UPLOAD_MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Autosave] Upload attempt ${attempt + 1}/${maxRetries}`);

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        body: formData
      }, UPLOAD_TIMEOUT_MS);

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Classify error type for logging
      const isNetworkError =
        lastError.name === 'AbortError' ||
        lastError.message.includes('Failed to fetch') ||
        lastError.message.includes('NetworkError');

      console.warn(`[Autosave] Upload failed (attempt ${attempt + 1}):`, {
        error: lastError.message,
        isNetworkError,
        willRetry: attempt < maxRetries - 1
      });

      if (attempt < maxRetries - 1) {
        // Exponential backoff: 2s, 4s, 8s
        const delay = 2000 * Math.pow(2, attempt);
        console.log(`[Autosave] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Upload failed after retries');
}

// --- Real-Time Cloud Autosave (Browser-Compatible) ---

/**
 * Type for asset categories in cloud storage
 */
export type CloudAssetType = 'visuals' | 'audio' | 'music' | 'video_clips' | 'sfx' | 'subtitles' | 'ai_logs';

/**
 * Cloud autosave state tracker
 */
interface AutosaveState {
  sessionId: string | null;
  userId: string | null;
  initialized: boolean;
  uploadQueue: Promise<void>[];
  failedUploads: Array<{ filename: string; error: string }>;
}

const autosaveState: AutosaveState = {
  sessionId: null,
  userId: null,
  initialized: false,
  uploadQueue: [],
  failedUploads: [],
};

/**
 * Real-Time Cloud Autosave Service
 * Handles instant incremental backups of assets via server proxy.
 * Works in both browser and Node.js environments.
 */
export const cloudAutosave = {
  /**
   * Check if cloud storage is available
   */
  async checkAvailability(): Promise<{ available: boolean; message: string }> {
    try {
      const response = await fetch(`${CLOUD_API_BASE}/api/cloud/status`);
      if (!response.ok) {
        return { available: false, message: 'Cloud service unavailable' };
      }
      return await response.json();
    } catch (e) {
      return { available: false, message: String(e) };
    }
  },

  /**
   * Initialize cloud session folder.
   * Call this when the user clicks "Start Production" or "Plan Video".
   *
   * @param sessionId - The production session ID (e.g., prod_TIMESTAMP_HASH)
   * @param userId - Optional user ID for user-specific storage paths
   */
  async initSession(sessionId: string, userId?: string): Promise<boolean> {
    if (!sessionId) {
      console.warn('[Autosave] No sessionId provided, skipping cloud init');
      return false;
    }

    autosaveState.sessionId = sessionId;
    autosaveState.userId = userId || null;
    autosaveState.failedUploads = [];

    try {
      const response = await fetch(`${CLOUD_API_BASE}/api/cloud/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userId })
      });

      const result = await response.json();

      if (result.success) {
        autosaveState.initialized = true;
        console.log(`[Autosave] ✓ Cloud session initialized: ${result.folderPath}`);
        return true;
      } else {
        console.warn('[Autosave] Cloud init failed:', result.error || result.warning);
        autosaveState.initialized = false;
        return false;
      }
    } catch (e) {
      console.warn('[Autosave] Cloud init error (non-fatal):', e);
      autosaveState.initialized = false;
      return false;
    }
  },

  /**
   * Save an individual asset to cloud storage.
   * This is fire-and-forget by default to keep the UI responsive.
   *
   * @param sessionId - The production session ID
   * @param blob - The file blob to upload
   * @param filename - Filename for the asset (e.g., "scene_0.png")
   * @param type - Asset type category
   * @param waitForUpload - If true, wait for upload to complete (default: false)
   * @param makePublic - If true, make file public and return public URL (default: false)
   */
  async saveAsset(
    sessionId: string,
    blob: Blob,
    filename: string,
    type: CloudAssetType,
    waitForUpload: boolean = false,
    makePublic: boolean = false
  ): Promise<{ success: boolean; path?: string; publicUrl?: string; error?: string }> {
    if (!sessionId) {
      return { success: false, error: 'No sessionId' };
    }

    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('assetType', type);
    formData.append('filename', filename);
    formData.append('file', blob, filename);
    formData.append('makePublic', String(makePublic));
    // Include userId for user-specific storage paths
    if (autosaveState.userId) {
      formData.append('userId', autosaveState.userId);
    }

    const uploadPromise = (async () => {
      try {
        // Use retry logic for transient network failures
        const response = await uploadWithRetry(
          `${CLOUD_API_BASE}/api/cloud/upload-asset`,
          formData
        );

        const result = await response.json();

        if (result.success) {
          console.log(`[Autosave] ✓ ${type}/${filename} saved to cloud${result.publicUrl ? ' (public)' : ''}`);
          return { success: true, path: result.path, publicUrl: result.publicUrl };
        } else {
          console.warn(`[Autosave] ${filename} not saved:`, result.warning || result.error);
          autosaveState.failedUploads.push({ filename, error: result.error || 'Unknown error' });
          return { success: false, error: result.error };
        }
      } catch (e) {
        const error = String(e);
        console.warn(`[Autosave] Upload failed for ${filename}:`, error);
        autosaveState.failedUploads.push({ filename, error });
        return { success: false, error };
      }
    })();

    if (waitForUpload) {
      return uploadPromise;
    }

    // Fire and forget - add to queue for tracking but don't wait
    autosaveState.uploadQueue.push(uploadPromise.then(() => {}));
    return { success: true, path: 'upload-pending' };
  },

  /**
   * Save image asset with scene metadata
   */
  async saveImage(
    sessionId: string,
    imageUrl: string,
    sceneIndex: number
  ): Promise<void> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const filename = `scene_${sceneIndex}.png`;
      await this.saveAsset(sessionId, blob, filename, 'visuals');
    } catch (e) {
      console.warn(`[Autosave] Failed to save image for scene ${sceneIndex}:`, e);
    }
  },

  /**
   * Save image and return public URL for persistence.
   * This waits for upload completion and returns the cloud URL.
   */
  async saveImageWithUrl(
    sessionId: string,
    imageUrl: string,
    shotId: string
  ): Promise<string | null> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      const filename = `shot_${shotId}.${ext}`;
      const result = await this.saveAsset(sessionId, blob, filename, 'visuals', true, true);
      return result.publicUrl || null;
    } catch (e) {
      console.warn(`[Autosave] Failed to save image for shot ${shotId}:`, e);
      return null;
    }
  },

  /**
   * Save audio/narration asset
   */
  async saveNarration(
    sessionId: string,
    audioBlob: Blob,
    sceneId: string
  ): Promise<void> {
    const filename = `narration_${sceneId}.wav`;
    await this.saveAsset(sessionId, audioBlob, filename, 'audio');
  },

  /**
   * Save narration audio and return public URL for persistence.
   */
  async saveNarrationWithUrl(
    sessionId: string,
    audioBlob: Blob,
    sceneId: string
  ): Promise<string | null> {
    try {
      const ext = audioBlob.type.includes('wav') ? 'wav' : 'mp3';
      const filename = `narration_${sceneId}.${ext}`;
      const result = await this.saveAsset(sessionId, audioBlob, filename, 'audio', true, true);
      return result.publicUrl || null;
    } catch (e) {
      console.warn(`[Autosave] Failed to save narration for scene ${sceneId}:`, e);
      return null;
    }
  },

  /**
   * Save video clip asset (from Veo)
   */
  async saveVideoClip(
    sessionId: string,
    videoUrl: string,
    sceneIndex: number
  ): Promise<void> {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const filename = `scene_${sceneIndex}_veo.mp4`;
      await this.saveAsset(sessionId, blob, filename, 'video_clips');
    } catch (e) {
      console.warn(`[Autosave] Failed to save video for scene ${sceneIndex}:`, e);
    }
  },

  /**
   * Save animated video and return public URL for persistence.
   */
  async saveAnimatedVideoWithUrl(
    sessionId: string,
    videoUrl: string,
    shotId: string
  ): Promise<string | null> {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const filename = `animated_${shotId}.mp4`;
      const result = await this.saveAsset(sessionId, blob, filename, 'video_clips', true, true);
      return result.publicUrl || null;
    } catch (e) {
      console.warn(`[Autosave] Failed to save animated video for shot ${shotId}:`, e);
      return null;
    }
  },

  /**
   * Save AI log entry to cloud storage as JSON.
   * Stores logs in the ai_logs folder within the session directory.
   *
   * @param sessionId - The production session ID
   * @param logEntry - The AI log entry to save
   */
  async saveAILog(
    sessionId: string,
    logEntry: {
      id: string;
      step: string;
      model: string;
      input: string;
      output: string;
      durationMs: number;
      timestamp: number;
      status: 'success' | 'error';
      error?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!sessionId) {
      return { success: false, error: 'No sessionId' };
    }

    try {
      // Create JSON blob from log entry
      const jsonContent = JSON.stringify(logEntry, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const filename = `${logEntry.step}_${logEntry.id}.json`;

      const result = await this.saveAsset(sessionId, blob, filename, 'ai_logs', false, false);

      if (result.success) {
        console.log(`[Autosave] ✓ AI log saved: ${logEntry.step}/${logEntry.id}`);
      }
      return result;
    } catch (e) {
      console.warn(`[Autosave] Failed to save AI log:`, e);
      return { success: false, error: String(e) };
    }
  },

  /**
   * Wait for all pending uploads to complete
   */
  async flush(): Promise<{ completed: number; failed: number }> {
    const pending = [...autosaveState.uploadQueue];
    autosaveState.uploadQueue = [];

    await Promise.allSettled(pending);

    return {
      completed: pending.length - autosaveState.failedUploads.length,
      failed: autosaveState.failedUploads.length
    };
  },

  /**
   * Get current autosave state
   */
  getState(): { sessionId: string | null; initialized: boolean; pendingUploads: number; failedUploads: number } {
    return {
      sessionId: autosaveState.sessionId,
      initialized: autosaveState.initialized,
      pendingUploads: autosaveState.uploadQueue.length,
      failedUploads: autosaveState.failedUploads.length
    };
  },

  /**
   * Reset autosave state (call when starting a new session)
   */
  reset(): void {
    autosaveState.sessionId = null;
    autosaveState.initialized = false;
    autosaveState.uploadQueue = [];
    autosaveState.failedUploads = [];
  }
};
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
      // Use proxy URL to avoid CORS issues
      publicUrl = `/api/cloud/file?path=${encodeURIComponent(filePath)}`;
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

    await Promise.all(files.map((file: any) => file.delete()));

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
