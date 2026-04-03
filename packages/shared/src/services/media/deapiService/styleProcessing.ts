/**
 * DeAPI style processing: background removal and style consistency (img2img)
 */

import { cloudAutosave } from '../../cloud/cloudStorageService';
import { enhanceImg2ImgPrompt } from '../deapiPromptService';
import {
  DEAPI_DIRECT_BASE,
  isBrowser,
  API_KEY,
  base64ToBlob,
  getDeApiDimensions,
  pollRequest,
} from './config';
import { isDeApiConfigured } from './apiConfig';
import type { DeApiResponse } from './types';

export const removeImageBackground = async (
  base64Image: string,
  sessionId?: string,
  sceneIndex?: number,
): Promise<string> => {
  if (!isDeApiConfigured()) {
    throw new Error('DeAPI is not configured.');
  }

  if (!base64Image || (!base64Image.startsWith('data:image/') && !base64Image.startsWith('data:application/'))) {
    throw new Error('removeImageBackground requires a valid image data URL.');
  }

  const imageBlob = await base64ToBlob(base64Image);
  const formData = new FormData();
  formData.append('image', imageBlob, 'image.png');
  formData.append('model', 'Ben2');

  let response: Response;
  if (isBrowser) {
    response = await fetch('/api/deapi/img-rmbg', { method: 'POST', body: formData });
  } else {
    response = await fetch(`${DEAPI_DIRECT_BASE}/img-rmbg`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AISoulStudio/1.0',
      },
      body: formData,
    });
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeAPI img-rmbg failed (${response.status}): ${errText.substring(0, 200)}`);
  }

  const rawData = await response.json();
  const data: DeApiResponse = rawData.data || rawData;

  let imageUrl: string;
  if (data.result_url) {
    imageUrl = data.result_url;
  } else if (data.status === 'error') {
    throw new Error(data.error || 'Background removal failed at provider');
  } else if (data.request_id) {
    console.log(`[DeAPI] Polling for bg removal: ${data.request_id}`);
    imageUrl = await pollRequest(data.request_id);
  } else {
    throw new Error('No request_id or result_url from DeAPI img-rmbg');
  }

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) {
    throw new Error(`Failed to download bg-removed image: ${imgResp.status}`);
  }

  const imgBlob = await imgResp.blob();
  console.log(`[DeAPI] Background removed: ${(imgBlob.size / 1024).toFixed(2)} KB`);

  if (sessionId && sceneIndex !== undefined) {
    cloudAutosave.saveAsset(
      sessionId,
      imgBlob,
      `scene_${sceneIndex}_rmbg.png`,
      'visuals'
    ).catch(err => console.warn('[DeAPI] Cloud upload failed (non-fatal):', err));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert bg-removed image to base64'));
    reader.readAsDataURL(imgBlob);
  });
};

export const applyStyleConsistency = async (
  referenceImageBase64: string,
  prompt: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
): Promise<string> => {
  if (!isDeApiConfigured()) {
    throw new Error('DeAPI is not configured.');
  }

  if (!referenceImageBase64 || !referenceImageBase64.startsWith('data:image/')) {
    throw new Error('Reference image must be a valid data URL.');
  }

  const { width, height } = getDeApiDimensions(aspectRatio);

  const enhancedPrompt = await enhanceImg2ImgPrompt(prompt);

  const imageBlob = await base64ToBlob(referenceImageBase64);
  const formData = new FormData();
  formData.append('image', imageBlob, 'reference.png');
  formData.append('prompt', enhancedPrompt);
  formData.append('model', 'Flux_2_Klein_4B_BF16');
  formData.append('guidance', '5');
  formData.append('steps', '4');
  formData.append('seed', '-1');
  formData.append('width', width.toString());
  formData.append('height', height.toString());

  let response: Response;
  if (isBrowser) {
    response = await fetch('/api/deapi/img2img', { method: 'POST', body: formData });
  } else {
    response = await fetch(`${DEAPI_DIRECT_BASE}/img2img`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AISoulStudio/1.0',
      },
      body: formData,
    });
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeAPI img2img failed (${response.status}): ${errText.substring(0, 200)}`);
  }

  const rawData = await response.json();
  const data: DeApiResponse = rawData.data || rawData;

  let imageUrl: string;
  if (data.result_url) {
    imageUrl = data.result_url;
  } else if (data.status === 'error') {
    throw new Error(data.error || 'Style consistency pass failed at provider');
  } else if (data.request_id) {
    console.log(`[DeAPI] Polling for img2img: ${data.request_id}`);
    imageUrl = await pollRequest(data.request_id);
  } else {
    throw new Error('No request_id or result_url from DeAPI img2img');
  }

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) {
    throw new Error(`Failed to download style-consistent image: ${imgResp.status}`);
  }

  const imgBlob = await imgResp.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert style-consistent image to base64'));
    reader.readAsDataURL(imgBlob);
  });
};
