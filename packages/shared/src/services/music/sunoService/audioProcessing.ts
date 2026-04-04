/**
 * Suno Service — Audio file upload and stem separation
 */

import { callSunoProxy, SERVER_URL } from "./config";
import { SunoStemSeparationResult, SunoApiError } from "./types";
import { isFailedStatus } from "./generation";
import { sunoLogger } from '../../infrastructure/logger';

const log = sunoLogger.child('Audio');

export async function uploadAudioFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${SERVER_URL}/api/suno/upload`, { method: "POST", body: formData });
  const data = await response.json();

  if (!response.ok || data.code !== 200) {
    throw new Error(data.error || data.msg || data.message || "File upload failed");
  }

  return data.data?.fileUrl || data.data?.url || data.url;
}

export async function convertToWav(taskId: string, audioId: string): Promise<string> {
  return callSunoProxy("convert-to-wav", { taskId, audioId, callBackUrl: "playground" });
}

export async function separateVocals(taskId: string, audioId: string): Promise<string> {
  return callSunoProxy("separate-vocals-from-music", { taskId, audioId, callBackUrl: "playground" });
}

export async function getStemSeparationStatus(taskId: string): Promise<SunoStemSeparationResult> {
  const data = await callSunoProxy(`separate-vocals-from-music/record-info?taskId=${taskId}`, null, "GET");
  const status = data.status || "PENDING";

  let vocalsUrl: string | undefined;
  let instrumentalUrl: string | undefined;

  if (status === "SUCCESS" && data.response) {
    vocalsUrl = data.response.vocalsUrl || data.response.vocals_url || data.response.vocalUrl;
    instrumentalUrl = data.response.instrumentalUrl || data.response.instrumental_url || data.response.instrumentUrl;
  }

  return {
    taskId, status, vocalsUrl, instrumentalUrl,
    errorMessage: status === "FAILED" ? (data.errorMessage || "Stem separation failed") : undefined,
  };
}

export async function waitForStemSeparation(taskId: string, maxWaitMs = 5 * 60 * 1000): Promise<SunoStemSeparationResult> {
  const pollIntervalMs = 15 * 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getStemSeparationStatus(taskId);

    if (result.status === "SUCCESS") {
      log.info('Stem separation completed successfully');
      return result;
    }

    if (isFailedStatus(result.status)) {
      throw new Error(result.errorMessage || `Stem separation failed with status: ${result.status}`);
    }

    log.info(`Stem separation status: ${result.status}, waiting...`);
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Stem separation timed out. Please try again.");
}

export async function uploadFileBase64(base64Data: string, fileName: string): Promise<string> {
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const result = await callSunoProxy("upload/base64", { base64Data: cleanBase64, fileName });
  const fileUrl = result?.fileUrl || result?.url || result;

  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new SunoApiError('Upload failed: No file URL returned', 500, 'upload/base64');
  }

  log.info(`File uploaded via Base64: ${fileName}`);
  return fileUrl;
}

export async function uploadFileUrl(sourceUrl: string): Promise<string> {
  const result = await callSunoProxy("upload/url", { url: sourceUrl });
  const fileUrl = result?.fileUrl || result?.url || result;

  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new SunoApiError('Upload failed: No file URL returned', 500, 'upload/url');
  }

  log.info(`File uploaded via URL: ${sourceUrl.substring(0, 50)}...`);
  return fileUrl;
}
