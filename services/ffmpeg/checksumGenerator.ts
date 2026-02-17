/**
 * Checksum Generator for Frame Validation
 *
 * Generates SHA-256 checksums for frames client-side
 * to enable server-side validation of uploaded data integrity.
 */

/**
 * Frame checksum data
 */
export interface FrameChecksum {
  frameIndex: number;
  checksum: string;
  size: number;
}

/**
 * Generate SHA-256 checksum for a Blob
 */
export async function generateBlobChecksum(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate checksum for an ArrayBuffer
 */
export async function generateBufferChecksum(
  buffer: ArrayBuffer
): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate checksums for a batch of frames
 */
export async function generateBatchChecksums(
  frames: Array<{ blob: Blob; index: number }>
): Promise<FrameChecksum[]> {
  const checksums: FrameChecksum[] = [];

  // Process in parallel for performance
  const promises = frames.map(async ({ blob, index }) => {
    const checksum = await generateBlobChecksum(blob);
    return {
      frameIndex: index,
      checksum,
      size: blob.size,
    };
  });

  return Promise.all(promises);
}

/**
 * Generate checksums with progress callback (for large batches)
 */
export async function generateBatchChecksumsWithProgress(
  frames: Array<{ blob: Blob; index: number }>,
  onProgress?: (completed: number, total: number) => void
): Promise<FrameChecksum[]> {
  const checksums: FrameChecksum[] = [];
  const total = frames.length;

  // Process in smaller parallel batches for memory efficiency
  const BATCH_SIZE = 10;

  for (let i = 0; i < frames.length; i += BATCH_SIZE) {
    const batch = frames.slice(i, i + BATCH_SIZE);
    const batchResults = await generateBatchChecksums(batch);
    checksums.push(...batchResults);

    onProgress?.(Math.min(i + BATCH_SIZE, total), total);
  }

  return checksums;
}

/**
 * Check if Web Crypto API is available
 */
export function isChecksumSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.digest === 'function'
  );
}

/**
 * Simple fallback checksum using basic hashing (less secure but works everywhere)
 * Only use if Web Crypto is not available
 */
export function generateSimpleChecksum(data: ArrayBuffer): string {
  const view = new Uint8Array(data);
  let hash = 0x811c9dc5; // FNV-1a offset basis

  for (let i = 0; i < view.length; i++) {
    hash ^= view[i]!;
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }

  // Return as hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Verify a checksum matches
 */
export async function verifyChecksum(
  blob: Blob,
  expectedChecksum: string
): Promise<boolean> {
  const actualChecksum = await generateBlobChecksum(blob);
  return actualChecksum === expectedChecksum;
}

/**
 * Create a manifest of all frame checksums (for sending with finalize request)
 */
export function createFrameManifest(
  checksums: FrameChecksum[]
): Record<number, FrameChecksum> {
  const manifest: Record<number, FrameChecksum> = {};

  for (const checksum of checksums) {
    manifest[checksum.frameIndex] = checksum;
  }

  return manifest;
}
