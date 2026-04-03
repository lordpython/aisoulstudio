/**
 * Suno Service — Internal config and proxy helper
 */

import { rateLimiter } from "./rateLimiter";
import { mapErrorCodeToError } from "./types";
import { getServerBaseUrl } from "../../cloud/serverBaseUrl";

const SUNO_API_BASE = "https://api.sunoapi.org/api/v1";

const getSunoApiKey = (): string => {
  if (typeof window !== "undefined") {
    const viteEnv = (import.meta as any).env;
    if (viteEnv?.VITE_SUNO_API_KEY) return viteEnv.VITE_SUNO_API_KEY;
  }
  return process.env.VITE_SUNO_API_KEY || "";
};

export const SUNO_API_KEY = getSunoApiKey();
export const isBrowser = typeof window !== "undefined";

if (isBrowser) {
  console.log(`[Suno] API Key configured: ${SUNO_API_KEY ? "YES" : "NO"}`);
}

export const SERVER_URL = getServerBaseUrl() || "http://localhost:3001";

export async function callSunoProxy(endpoint: string, body?: any, method: string = "POST"): Promise<any> {
  await rateLimiter.waitForSlot();

  const fetchOptions: any = { method, headers: { "Content-Type": "application/json" } };
  if (method !== "GET" && method !== "HEAD") {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${SERVER_URL}/api/suno/proxy/${endpoint}`, fetchOptions);
  const data = await response.json();

  if (!response.ok || (data.code && data.code !== 200)) {
    const errorCode = data.code || response.status;
    const errorMessage = data.msg || data.error || data.message || `Suno API error: ${endpoint}`;
    throw mapErrorCodeToError(errorCode, endpoint, errorMessage);
  }

  if (endpoint === "generate" && data.data?.taskId) return data.data.taskId;
  return data.data || data;
}
