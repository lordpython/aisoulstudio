/**
 * Suno Service — Music generation, lyrics, status polling, and utility functions
 */

import type { SubtitleItem } from "@/types";
import { callSunoProxy, isBrowser, SUNO_API_KEY } from "./config";
import { sunoLogger } from '../../infrastructure/logger';

import {
  SunoModel,
  SunoTaskStatus,
  SunoGenerationConfig,
  SunoPersonaConfig,
  SunoGeneratedTrack,
  SunoTaskResult,
  SunoDetailedTaskResult,
  SunoLyricsResult,
  SunoCredits,
} from "./types";

const log = sunoLogger.child('Generation');

export function isSunoConfigured(): boolean {
  if (isBrowser) return true;
  return !!SUNO_API_KEY;
}

export function mapToSunoTaskStatus(rawStatus: string | undefined): SunoTaskStatus {
  if (!rawStatus) return "PENDING";
  const statusMap: Record<string, SunoTaskStatus> = {
    "PENDING": "PENDING", "PROCESSING": "PROCESSING", "TEXT_SUCCESS": "TEXT_SUCCESS",
    "FIRST_SUCCESS": "FIRST_SUCCESS", "SUCCESS": "SUCCESS", "CREATE_TASK_FAILED": "CREATE_TASK_FAILED",
    "GENERATE_AUDIO_FAILED": "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION": "CALLBACK_EXCEPTION",
    "SENSITIVE_WORD_ERROR": "SENSITIVE_WORD_ERROR", "FAILED": "FAILED",
  };
  return statusMap[rawStatus.toUpperCase()] || "PENDING";
}

export function isFailedStatus(status: SunoTaskStatus): boolean {
  return ["FAILED", "CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"].includes(status);
}

export function isIntermediateStatus(status: SunoTaskStatus): boolean {
  return ["PENDING", "PROCESSING", "TEXT_SUCCESS", "FIRST_SUCCESS"].includes(status);
}

function getDefaultErrorMessage(status: SunoTaskStatus): string {
  switch (status) {
    case "CREATE_TASK_FAILED": return "Failed to create generation task. Please try again.";
    case "GENERATE_AUDIO_FAILED": return "Audio generation failed. Please try again with different parameters.";
    case "CALLBACK_EXCEPTION": return "Callback processing failed. The task may have completed but notification failed.";
    case "SENSITIVE_WORD_ERROR": return "Content flagged for sensitive words. Please modify your prompt and try again.";
    default: return "Generation failed. Please try again.";
  }
}

export async function generateMusic(config: SunoGenerationConfig): Promise<string> {
  const autoTitle = config.title || config.prompt.slice(0, 50) || "AI Generated Track";
  const requestBody: any = {
    prompt: config.prompt,
    customMode: true,
    style: config.style || "",
    title: autoTitle,
    instrumental: config.instrumental ?? false,
    model: config.model ?? "V5",
    callBackUrl: "playground",
    negativeTags: config.negativeTags || "",
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.65,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.5,
    audioWeight: config.audioWeight ?? 0.65,
    personaId: config.personaId,
  };
  Object.keys(requestBody).forEach(key => requestBody[key] === undefined && delete requestBody[key]);
  return callSunoProxy("generate", requestBody);
}

export async function getTaskStatus(taskId: string): Promise<SunoTaskResult> {
  const data = await callSunoProxy(`generate/record-info?taskId=${taskId}`, null, "GET");
  const status = mapToSunoTaskStatus(data.status);

  let tracks: SunoGeneratedTrack[] | undefined;
  if (status === "SUCCESS" && data.response?.sunoData) {
    tracks = data.response.sunoData.map((track: any) => ({
      id: track.id, title: track.title || "Untitled", audio_url: track.audioUrl,
      duration: track.duration || 0, style: track.tags, lyrics: track.prompt,
    }));
  }

  const result: SunoTaskResult = { taskId, status, tracks };
  if (isFailedStatus(status)) {
    result.errorCode = data.errorCode || data.code || data.response?.sunoData?.[0]?.errorCode;
    result.errorMessage = data.errorMessage || data.msg || data.response?.sunoData?.[0]?.errorMessage || getDefaultErrorMessage(status);
  }
  return result;
}

export async function getDetailedTaskStatus(taskId: string): Promise<SunoDetailedTaskResult> {
  const data = await callSunoProxy(`generate/record-info?taskId=${taskId}`, null, "GET");
  const status = mapToSunoTaskStatus(data.status);

  let tracks: SunoGeneratedTrack[] | undefined;
  if (status === "SUCCESS" && data.response?.sunoData) {
    tracks = data.response.sunoData.map((track: any) => ({
      id: track.id, title: track.title || "Untitled", audio_url: track.audioUrl,
      duration: track.duration || 0, style: track.tags, lyrics: track.prompt,
    }));
  }

  const result: SunoDetailedTaskResult = {
    taskId, status, tracks,
    parentMusicId: data.parentMusicId || data.response?.parentMusicId,
    param: data.param,
    response: data.response ? { taskId: data.response.taskId || taskId, sunoData: data.response.sunoData || [] } : undefined,
    type: data.type || data.taskType,
  };

  if (isFailedStatus(status)) {
    result.errorCode = data.errorCode || data.code || data.response?.sunoData?.[0]?.errorCode;
    result.errorMessage = data.errorMessage || data.msg || data.response?.sunoData?.[0]?.errorMessage || getDefaultErrorMessage(status);
  }
  return result;
}

export async function waitForCompletion(taskId: string, maxWaitMs = 10 * 60 * 1000): Promise<SunoGeneratedTrack[]> {
  const pollIntervalMs = 30 * 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getTaskStatus(taskId);

    if (result.status === "SUCCESS" && result.tracks) {
      log.info('Generation completed successfully');
      return result.tracks;
    }

    if (isFailedStatus(result.status)) {
      const errorDetails = result.errorCode ? ` (code: ${result.errorCode})` : '';
      throw new Error(result.errorMessage || `Music generation failed with status: ${result.status}${errorDetails}`);
    }

    if (isIntermediateStatus(result.status)) {
      log.info(`Status: ${result.status}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    log.warn(`Unknown status: ${result.status}, continuing to poll...`);
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Music generation timed out. Please try again.");
}

export async function generateLyrics(prompt: string): Promise<string> {
  return callSunoProxy("generate-lyrics", { prompt, callBackUrl: "playground" });
}

export async function getLyricsStatus(taskId: string): Promise<SunoLyricsResult> {
  const data = await callSunoProxy(`generate-lyrics/record-info?taskId=${taskId}`, null, "GET");
  const status = data.status || "PENDING";
  const lyricsData = data.response?.data?.[0];
  return {
    taskId, status,
    title: status === "SUCCESS" ? lyricsData?.title : undefined,
    text: status === "SUCCESS" ? lyricsData?.text : undefined,
    errorMessage: status === "FAILED" ? (data.errorMessage || lyricsData?.errorMessage || "Lyrics generation failed") : undefined,
  };
}

export async function getTimestampedLyrics(taskId: string, audioId: string): Promise<SubtitleItem[]> {
  try {
    const data = await callSunoProxy(`get-timestamped-lyrics?taskId=${taskId}&audioId=${audioId}`, null, "GET");
    return parseTimestampedLyrics(data.response?.lyrics || []);
  } catch (e) {
    log.warn('Failed to get timestamped lyrics', e);
    return [];
  }
}

export function parseTimestampedLyrics(lyricsData: Array<{ start: number; end: number; text: string }>): SubtitleItem[] {
  return lyricsData.map((item, index) => ({ id: index + 1, startTime: item.start, endTime: item.end, text: item.text }));
}

export async function getCredits(): Promise<SunoCredits> {
  const result = await callSunoProxy("generate/credit", null, "GET");
  const credits = typeof result === "number" ? result : (result?.credits ?? 0);
  log.info(`Credits: ${credits}`);
  return { credits };
}

export async function testSunoAPI(): Promise<void> {
  log.info('=== Suno API Test ===');
  log.info(`API Key configured: ${isSunoConfigured() ? 'YES' : 'NO'}`);
  if (!isSunoConfigured()) {
    log.error('Suno API key not found. Add VITE_SUNO_API_KEY to .env.local');
    return;
  }
  try {
    log.info('Testing credits endpoint...');
    const credits = await getCredits();
    log.info(`Credits check successful! Remaining: ${credits.credits}`);
  } catch (error) {
    log.error('Test failed', error);
  }
}

export async function createMusicVideo(taskId: string, audioId: string, author?: string, domainName?: string): Promise<string> {
  try {
    const requestBody: any = { taskId, audioId, callBackUrl: "playground" };
    if (author) requestBody.author = author;
    if (domainName) requestBody.domainName = domainName;
    return await callSunoProxy("create-music-video", requestBody);
  } catch (e) {
    log.warn('create-music-video failed');
    throw e;
  }
}

export async function generateCover(taskId: string): Promise<string> {
  return callSunoProxy("cover", { taskId, callBackUrl: "playground" });
}

export async function boostMusicStyle(style: string): Promise<string> {
  const result = await callSunoProxy("boost-music-style", { content: style });
  return result?.result || result?.content || result || style;
}

export async function generatePersona(config: SunoPersonaConfig): Promise<string> {
  return callSunoProxy("generate-persona", {
    name: config.name,
    description: config.description,
    style: config.style,
    callBackUrl: config.callBackUrl || "playground",
  });
}
