/**
 * Secure API Client
 * 
 * Handles API calls through backend proxy to avoid exposing API keys in client bundle.
 * In production, all API calls should go through the backend server.
 */

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Make a secure API call through the backend proxy
 */
async function secureApiCall<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error(`[SecureApiClient] ${endpoint} failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Gemini API calls through backend proxy
 */
export const geminiApi = {
  async generateContent(prompt: string, options?: any): Promise<ApiResponse> {
    return secureApiCall('/gemini/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, options }),
    });
  },

  async generateImage(prompt: string, options?: any): Promise<ApiResponse> {
    return secureApiCall('/gemini/image', {
      method: 'POST',
      body: JSON.stringify({ prompt, options }),
    });
  },
};

/**
 * DEAPI calls through backend proxy
 */
export const deapiApi = {
  async generateImage(prompt: string, options?: any): Promise<ApiResponse> {
    return secureApiCall('/deapi/image', {
      method: 'POST',
      body: JSON.stringify({ prompt, options }),
    });
  },

  async animateImage(imageUrl: string, options?: any): Promise<ApiResponse> {
    return secureApiCall('/deapi/animate', {
      method: 'POST',
      body: JSON.stringify({ imageUrl, options }),
    });
  },
};

/**
 * Check if we're in development mode with direct API access
 */
export function isDevelopmentWithDirectApi(): boolean {
  return import.meta.env.DEV && !!import.meta.env.VITE_GEMINI_API_KEY;
}

/**
 * Get API key for development mode only
 * @deprecated Use backend proxy instead
 */
export function getDevApiKey(service: 'gemini' | 'deapi'): string | null {
  if (!import.meta.env.DEV) {
    console.warn('[SecureApiClient] API keys not available in production - use backend proxy');
    return null;
  }

  switch (service) {
    case 'gemini':
      return import.meta.env.VITE_GEMINI_API_KEY || null;
    case 'deapi':
      return import.meta.env.VITE_DEAPI_API_KEY || null;
    default:
      return null;
  }
}