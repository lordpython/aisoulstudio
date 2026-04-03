/**
 * Suno Service — Track manipulation (vocals, instrumental, cover, extend, replace)
 */

import { callSunoProxy } from "./config";
import { SunoGenerationConfig, SunoExtendConfig, SunoUploadConfig } from "./types";

export async function addVocals(config: SunoGenerationConfig & { uploadUrl: string }): Promise<string> {
  const requestBody = {
    prompt: config.prompt,
    uploadUrl: config.uploadUrl,
    title: config.title || "",
    negativeTags: config.negativeTags || "",
    style: config.style || "",
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.61,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.72,
    audioWeight: config.audioWeight ?? 0.65,
    model: config.model ?? "V4_5PLUS",
    callBackUrl: config.callBackUrl || "playground",
  };
  return callSunoProxy("add-vocals", requestBody);
}

export async function addInstrumental(config: SunoGenerationConfig & { uploadUrl: string }): Promise<string> {
  const requestBody = {
    uploadUrl: config.uploadUrl,
    title: config.title || "",
    negativeTags: config.negativeTags || "",
    tags: config.style || "Relaxing Piano, Ambient",
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.61,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.72,
    audioWeight: config.audioWeight ?? 0.65,
    model: config.model ?? "V4_5PLUS",
    callBackUrl: config.callBackUrl || "playground",
  };
  return callSunoProxy("add-instrumental", requestBody);
}

export async function uploadAndCover(config: SunoGenerationConfig & { uploadUrl: string }): Promise<string> {
  const requestBody = {
    uploadUrl: config.uploadUrl,
    customMode: true,
    instrumental: config.instrumental ?? true,
    model: config.model ?? "V4_5ALL",
    callBackUrl: config.callBackUrl || "playground",
    prompt: config.prompt,
    style: config.style || "",
    title: config.title || "",
    negativeTags: config.negativeTags || "",
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.65,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.65,
    audioWeight: config.audioWeight ?? 0.65,
  };
  return callSunoProxy("generate/upload-cover", requestBody);
}

export async function replaceSection(
  taskId: string,
  audioId: string,
  startTime: number,
  endTime: number,
  prompt: string,
  style?: string,
  title?: string
): Promise<string> {
  return callSunoProxy("replace-section", {
    taskId, audioId, prompt,
    tags: style || "",
    title: title || "",
    infillStartS: startTime,
    infillEndS: endTime,
    callBackUrl: "playground",
  });
}

export async function extendMusic(config: SunoExtendConfig): Promise<string> {
  const requestBody: any = {
    taskId: config.taskId,
    audioId: config.audioId,
    prompt: config.prompt || "",
    style: config.style || "",
    title: config.title || "",
    continueAt: config.continueAt,
    model: config.model ?? "V5",
    callBackUrl: config.callBackUrl || "playground",
  };
  Object.keys(requestBody).forEach(key => requestBody[key] === undefined && delete requestBody[key]);
  return callSunoProxy("extend", requestBody);
}

export async function uploadAndExtend(config: SunoUploadConfig): Promise<string> {
  const requestBody: any = {
    uploadUrl: config.uploadUrl,
    prompt: config.prompt || "",
    style: config.style || "",
    title: config.title || "",
    continueAt: config.continueAt ?? 0,
    instrumental: config.instrumental ?? false,
    model: config.model ?? "V5",
    defaultParamFlag: config.defaultParamFlag ?? false,
    negativeTags: config.negativeTags || "",
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.65,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.5,
    audioWeight: config.audioWeight ?? 0.65,
    callBackUrl: config.callBackUrl || "playground",
  };
  Object.keys(requestBody).forEach(key => requestBody[key] === undefined && delete requestBody[key]);
  return callSunoProxy("upload-and-extend", requestBody);
}
