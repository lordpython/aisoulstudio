/**
 * Export Formats Service
 * 
 * Provides additional export formats for Story Mode projects:
 * - SRT/VTT subtitles
 * - JSON project export/import
 * - WebM video export
 */

import type { StoryState, StoryShot } from '@/types';

export interface SubtitleEntry {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface ProjectExport {
  version: string;
  exportedAt: string;
  projectName: string;
  state: StoryState;
  metadata: {
    totalScenes: number;
    totalShots: number;
    totalCharacters: number;
    visualStyle?: string;
    aspectRatio?: string;
    duration?: number;
  };
}

const EXPORT_VERSION = '1.0.0';

function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function formatVTTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function generateSubtitlesFromShots(shots: StoryShot[]): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  let currentTime = 0;
  
  shots.forEach((shot, index) => {
    const duration = shot.duration || 4; // Default 4 seconds per shot
    const text = shot.description || '';
    
    if (text.trim()) {
      entries.push({
        index: entries.length + 1,
        startTime: currentTime,
        endTime: currentTime + duration,
        text: text.trim(),
      });
    }
    
    currentTime += duration;
  });
  
  return entries;
}

export function generateSubtitlesFromDialogue(state: StoryState): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  let currentTime = 0;
  
  if (!state.script?.scenes) return entries;
  
  for (const scene of state.script.scenes) {
    for (const dialogue of scene.dialogue || []) {
      const text = `${dialogue.speaker}: ${dialogue.text}`;
      const duration = Math.max(2, text.length / 15); // ~15 chars per second reading speed
      
      entries.push({
        index: entries.length + 1,
        startTime: currentTime,
        endTime: currentTime + duration,
        text,
      });
      
      currentTime += duration + 0.5; // 0.5s gap between lines
    }
  }
  
  return entries;
}

export function exportToSRT(entries: SubtitleEntry[]): string {
  return entries.map(entry => {
    return [
      entry.index.toString(),
      `${formatSRTTime(entry.startTime)} --> ${formatSRTTime(entry.endTime)}`,
      entry.text,
      '', // Empty line separator
    ].join('\n');
  }).join('\n');
}

export function exportToVTT(entries: SubtitleEntry[]): string {
  const header = 'WEBVTT\n\n';
  
  const content = entries.map(entry => {
    return [
      entry.index.toString(),
      `${formatVTTTime(entry.startTime)} --> ${formatVTTTime(entry.endTime)}`,
      entry.text,
      '', // Empty line separator
    ].join('\n');
  }).join('\n');
  
  return header + content;
}

export function downloadSubtitles(
  state: StoryState,
  format: 'srt' | 'vtt',
  source: 'shots' | 'dialogue' = 'shots'
): void {
  const entries = source === 'shots' 
    ? generateSubtitlesFromShots(state.shots || [])
    : generateSubtitlesFromDialogue(state);
  
  const content = format === 'srt' ? exportToSRT(entries) : exportToVTT(entries);
  const mimeType = format === 'srt' ? 'text/plain' : 'text/vtt';
  const extension = format;
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.script?.title || 'story'}_subtitles.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportProjectToJSON(state: StoryState, projectName?: string): ProjectExport {
  const shots = state.shots || [];
  let totalDuration = 0;
  
  for (const shot of shots) {
    totalDuration += shot.duration || 4;
  }
  
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    projectName: projectName || state.script?.title || 'Untitled Project',
    state: JSON.parse(JSON.stringify(state)), // Deep clone
    metadata: {
      totalScenes: state.breakdown?.length ?? 0,
      totalShots: shots.length,
      totalCharacters: state.characters?.length ?? 0,
      visualStyle: state.visualStyle,
      aspectRatio: state.aspectRatio,
      duration: totalDuration,
    },
  };
}

export function downloadProjectJSON(state: StoryState, projectName?: string): void {
  const exportData = exportProjectToJSON(state, projectName);
  const content = JSON.stringify(exportData, null, 2);
  
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exportData.projectName.replace(/[^a-z0-9]/gi, '_')}_project.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importProjectFromJSON(file: File): Promise<{
  success: boolean;
  state?: StoryState;
  metadata?: ProjectExport['metadata'];
  error?: string;
}> {
  try {
    const content = await file.text();
    const data = JSON.parse(content) as ProjectExport;
    
    // Validate structure
    if (!data.version || !data.state) {
      return {
        success: false,
        error: 'Invalid project file format. Missing version or state.',
      };
    }
    
    // Check version compatibility
    const [major] = data.version.split('.');
    const [currentMajor] = EXPORT_VERSION.split('.');
    
    if (major !== currentMajor) {
      return {
        success: false,
        error: `Incompatible project version. File: ${data.version}, Current: ${EXPORT_VERSION}`,
      };
    }
    
    // Validate state has required fields
    if (!data.state.currentStep) {
      data.state.currentStep = 'idea';
    }
    
    return {
      success: true,
      state: data.state,
      metadata: data.metadata,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse project file',
    };
  }
}

export async function convertToWebM(
  videoBlob: Blob,
  options?: {
    quality?: number; // 0-1, default 0.8
    width?: number;
    height?: number;
  }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    
    const url = URL.createObjectURL(videoBlob);
    video.src = url;
    
    video.onloadedmetadata = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      const width = options?.width || video.videoWidth;
      const height = options?.height || video.videoHeight;
      
      canvas.width = width;
      canvas.height = height;
      
      const quality = options?.quality ?? 0.8;
      
      // Use MediaRecorder to capture the video as WebM
      const stream = canvas.captureStream(30);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: Math.floor(2500000 * quality),
      });
      
      const chunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        URL.revokeObjectURL(url);
        const webmBlob = new Blob(chunks, { type: 'video/webm' });
        resolve(webmBlob);
      };
      
      mediaRecorder.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(new Error('MediaRecorder error'));
      };
      
      mediaRecorder.start();
      
      video.onended = () => {
        mediaRecorder.stop();
      };
      
      const drawFrame = () => {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, width, height);
        requestAnimationFrame(drawFrame);
      };
      
      video.play().then(() => {
        drawFrame();
      }).catch(reject);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };
  });
}

export async function downloadAsWebM(
  videoBlob: Blob,
  filename: string,
  options?: {
    quality?: number;
    width?: number;
    height?: number;
  }
): Promise<void> {
  try {
    const webmBlob = await convertToWebM(videoBlob, options);
    
    const url = URL.createObjectURL(webmBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.webm') ? filename : `${filename}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[Export] WebM conversion failed:', error);
    throw error;
  }
}

export function getExportFormats(): Array<{
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  description: string;
  category: 'video' | 'subtitle' | 'project';
}> {
  return [
    {
      id: 'mp4',
      name: 'MP4 Video',
      extension: '.mp4',
      mimeType: 'video/mp4',
      description: 'Standard video format, compatible with most devices',
      category: 'video',
    },
    {
      id: 'webm',
      name: 'WebM Video',
      extension: '.webm',
      mimeType: 'video/webm',
      description: 'Web-optimized video format for embedding',
      category: 'video',
    },
    {
      id: 'srt',
      name: 'SRT Subtitles',
      extension: '.srt',
      mimeType: 'text/plain',
      description: 'SubRip subtitle format, widely supported',
      category: 'subtitle',
    },
    {
      id: 'vtt',
      name: 'WebVTT Subtitles',
      extension: '.vtt',
      mimeType: 'text/vtt',
      description: 'Web Video Text Tracks, HTML5 native subtitles',
      category: 'subtitle',
    },
    {
      id: 'json',
      name: 'Project File',
      extension: '.json',
      mimeType: 'application/json',
      description: 'Full project backup, can be imported later',
      category: 'project',
    },
  ];
}
