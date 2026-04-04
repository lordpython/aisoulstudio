/**
 * Suno Service — Types, interfaces, and error classes
 */

import type { SubtitleItem } from "../../../types";

export type SunoModel = "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5";

export type SunoTaskStatus =
  | "PENDING"
  | "PROCESSING"
  | "TEXT_SUCCESS"
  | "FIRST_SUCCESS"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_AUDIO_FAILED"
  | "CALLBACK_EXCEPTION"
  | "SENSITIVE_WORD_ERROR"
  | "FAILED";

export interface SunoGenerationConfig {
  prompt: string;
  title?: string;
  style?: string;
  instrumental?: boolean;
  model?: SunoModel;
  vocalGender?: "m" | "f";
  negativeTags?: string;
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
  callBackUrl?: string;
  customMode?: boolean;
  personaId?: string;
}

export interface SunoExtendConfig {
  taskId: string;
  audioId: string;
  prompt?: string;
  style?: string;
  title?: string;
  continueAt: number;
  model?: SunoModel;
  callBackUrl?: string;
}

export interface SunoUploadConfig extends SunoGenerationConfig {
  uploadUrl: string;
  continueAt?: number;
  defaultParamFlag?: boolean;
}

export interface SunoPersonaConfig {
  name: string;
  description: string;
  style: string;
  callBackUrl?: string;
}

export interface SunoStemSeparationResult {
  taskId: string;
  status: SunoTaskStatus;
  vocalsUrl?: string;
  instrumentalUrl?: string;
  errorMessage?: string;
}

export interface SunoGeneratedTrack {
  id: string;
  title: string;
  audio_url: string;
  duration: number;
  style?: string;
  lyrics?: string;
}

export interface SunoTaskResult {
  taskId: string;
  status: SunoTaskStatus;
  tracks?: SunoGeneratedTrack[];
  errorMessage?: string;
  errorCode?: number;
}

export interface SunoTrackData {
  id: string;
  audioUrl: string;
  streamAudioUrl: string;
  imageUrl: string;
  prompt: string;
  modelName: string;
  title: string;
  tags: string;
  createTime: string;
  duration: number;
  status: string;
  type: string;
  errorCode?: number;
  errorMessage?: string;
}

export interface SunoDetailedTaskResult extends SunoTaskResult {
  parentMusicId?: string;
  param?: Record<string, any>;
  response?: {
    taskId: string;
    sunoData: SunoTrackData[];
  };
  type?: string;
  errorCode?: number;
}

export interface SunoLyricsResult {
  taskId: string;
  status: SunoTaskStatus;
  title?: string;
  text?: string;
  errorMessage?: string;
}

export interface SunoCredits {
  credits: number;
}

// --- Custom Error Classes ---

export class SunoApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public endpoint: string
  ) {
    super(message);
    this.name = 'SunoApiError';
  }
}

export class InsufficientCreditsError extends SunoApiError {
  constructor(endpoint: string) {
    super('Insufficient credits. Please top up your account.', 429, endpoint);
    this.name = 'InsufficientCreditsError';
  }
}

export class RateLimitError extends SunoApiError {
  constructor(endpoint: string) {
    super('Rate limit exceeded. Please try again later.', 430, endpoint);
    this.name = 'RateLimitError';
  }
}

export class MaintenanceError extends SunoApiError {
  constructor(endpoint: string) {
    super('System is under maintenance. Please try again later.', 455, endpoint);
    this.name = 'MaintenanceError';
  }
}

export function mapErrorCodeToError(
  errorCode: number,
  endpoint: string,
  errorMessage?: string
): SunoApiError {
  switch (errorCode) {
    case 429: return new InsufficientCreditsError(endpoint);
    case 430: return new RateLimitError(endpoint);
    case 455: return new MaintenanceError(endpoint);
    default: return new SunoApiError(errorMessage || `Suno API error: ${endpoint}`, errorCode, endpoint);
  }
}
