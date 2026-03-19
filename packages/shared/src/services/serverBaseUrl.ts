import { isAndroid } from "../utils/platformUtils";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function getEnvServerUrl(): string | undefined {
  const browserEnv = typeof import.meta !== "undefined"
    ? (import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL
    : undefined;

  return browserEnv || process.env.VITE_SERVER_URL || process.env.SERVER_URL;
}

export function getServerBaseUrl(): string {
  const envUrl = getEnvServerUrl();
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }

  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  if (isAndroid()) {
    return "http://10.0.2.2:3001";
  }

  return "";
}

export function buildServerUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getServerBaseUrl()}${normalizedPath}`;
}

export function resolveServerAssetUrl(url: string): string {
  if (!url) return url;

  if (/^https?:\/\//i.test(url) || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }

  return buildServerUrl(url);
}
