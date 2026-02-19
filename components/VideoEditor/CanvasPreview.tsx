/**
 * CanvasPreview
 *
 * Live canvas preview that composites visible clips at the current time.
 * Renders video frames, image overlays, and text elements onto a canvas.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { EditorClip, AspectRatio } from './types/video-editor-types';
import './video-editor.css';

const ASPECT_DIMENSIONS: Record<AspectRatio, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 720, h: 720 },
  '4:3': { w: 960, h: 720 },
};

interface CanvasPreviewProps {
  clips: EditorClip[];
  currentTime: number;
  aspectRatio: AspectRatio;
  isPlaying: boolean;
  className?: string;
}

export function CanvasPreview({
  clips,
  currentTime,
  aspectRatio,
  isPlaying,
  className = '',
}: CanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number>(0);

  const dims = ASPECT_DIMENSIONS[aspectRatio];

  // Get clips visible at the current time, sorted by track order
  const visibleClips = useMemo(() => {
    return clips.filter(c =>
      currentTime >= c.startTime && currentTime < c.startTime + c.duration
    );
  }, [clips, currentTime]);

  // Preload images for image/video clips
  const preloadImage = useCallback((url: string): HTMLImageElement | null => {
    const cached = imageCache.current.get(url);
    if (cached?.complete) return cached;
    if (!cached) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      imageCache.current.set(url, img);
      img.onload = () => renderFrame();
    }
    return null;
  }, []);

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, dims.w, dims.h);

    // Render clips bottom-to-top (first = background)
    for (const clip of visibleClips) {
      if (clip.type === 'video' && clip.thumbnailUrl) {
        const img = preloadImage(clip.thumbnailUrl);
        if (img?.complete) {
          ctx.drawImage(img, 0, 0, dims.w, dims.h);
        }
      } else if (clip.type === 'image' && clip.imageUrl) {
        const img = preloadImage(clip.imageUrl);
        if (img?.complete) {
          // Center the image preserving aspect ratio
          const scale = Math.min(dims.w / img.width, dims.h / img.height) * 0.8;
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          ctx.drawImage(img, (dims.w - drawW) / 2, (dims.h - drawH) / 2, drawW, drawH);
        }
      } else if (clip.type === 'text' && clip.text) {
        const style = clip.textStyle ?? {
          fontFamily: 'Inter',
          fontSize: 48,
          fontWeight: '700',
          color: '#ffffff',
          position: { x: 0.5, y: 0.5 },
          alignment: 'center' as const,
        };

        ctx.save();
        ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
        ctx.fillStyle = style.color;
        ctx.textAlign = style.alignment;
        ctx.textBaseline = 'middle';

        // Draw text shadow/outline
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        const x = style.position.x * dims.w;
        const y = style.position.y * dims.h;
        ctx.strokeText(clip.text, x, y);
        ctx.fillText(clip.text, x, y);
        ctx.restore();
      }
      // Audio clips don't render on canvas
    }
  }, [dims, visibleClips, preloadImage]);

  // Render on time change or clip change
  useEffect(() => {
    renderFrame();
  }, [renderFrame]);

  // Animation loop when playing
  useEffect(() => {
    if (!isPlaying) return;
    const animate = () => {
      renderFrame();
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, renderFrame]);

  return (
    <div className={`ve-preview ${className}`}>
      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        className="ve-preview-canvas"
        aria-label="Video preview"
      />
      <div className="ve-aspect-badge">{aspectRatio}</div>
    </div>
  );
}
