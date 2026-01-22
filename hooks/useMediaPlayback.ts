/**
 * useMediaPlayback - Shared media playback state and controls
 *
 * Provides unified playback controls for audio/video across components.
 * Used by StudioScreen, VisualizerScreen, and timeline components.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
}

export interface UseMediaPlaybackOptions {
  /** Initial volume (0-1) */
  initialVolume?: number;
  /** Auto-play on load */
  autoPlay?: boolean;
  /** Loop playback */
  loop?: boolean;
  /** Callback when playback ends */
  onEnded?: () => void;
  /** Callback when time updates */
  onTimeUpdate?: (time: number) => void;
}

export interface UseMediaPlaybackReturn {
  // State
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;

  // Ref to attach to audio/video element
  mediaRef: React.RefObject<HTMLAudioElement | HTMLVideoElement>;

  // Controls
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  seekRelative: (delta: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  reset: () => void;

  // Utilities
  formatTime: (seconds: number) => string;
  getProgress: () => number;
}

/**
 * Hook for managing audio/video playback state
 *
 * @example
 * ```tsx
 * const {
 *   mediaRef,
 *   isPlaying,
 *   togglePlayPause,
 *   seek,
 *   formatTime
 * } = useMediaPlayback({ onEnded: () => console.log('done') });
 *
 * return (
 *   <>
 *     <audio ref={mediaRef} src={audioUrl} />
 *     <button onClick={togglePlayPause}>
 *       {isPlaying ? 'Pause' : 'Play'}
 *     </button>
 *     <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
 *   </>
 * );
 * ```
 */
export function useMediaPlayback(options: UseMediaPlaybackOptions = {}): UseMediaPlaybackReturn {
  const {
    initialVolume = 1,
    autoPlay = false,
    loop = false,
    onEnded,
    onTimeUpdate,
  } = options;

  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: initialVolume,
    isMuted: false,
    playbackRate: 1,
  });

  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement>(null);
  const onEndedRef = useRef(onEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  // Keep callbacks fresh
  useEffect(() => {
    onEndedRef.current = onEnded;
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onEnded, onTimeUpdate]);

  // Set up media element event listeners
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handleTimeUpdate = () => {
      const time = media.currentTime;
      setState((prev) => ({ ...prev, currentTime: time }));
      onTimeUpdateRef.current?.(time);
    };

    const handleDurationChange = () => {
      setState((prev) => ({ ...prev, duration: media.duration || 0 }));
    };

    const handlePlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
    };

    const handleEnded = () => {
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
      onEndedRef.current?.();
    };

    const handleVolumeChange = () => {
      setState((prev) => ({
        ...prev,
        volume: media.volume,
        isMuted: media.muted,
      }));
    };

    const handleLoadedMetadata = () => {
      setState((prev) => ({ ...prev, duration: media.duration || 0 }));
      media.volume = initialVolume;
      media.loop = loop;
      if (autoPlay) {
        media.play().catch(() => {
          // Autoplay blocked by browser
        });
      }
    };

    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('durationchange', handleDurationChange);
    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('ended', handleEnded);
    media.addEventListener('volumechange', handleVolumeChange);
    media.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('durationchange', handleDurationChange);
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('ended', handleEnded);
      media.removeEventListener('volumechange', handleVolumeChange);
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [autoPlay, loop, initialVolume]);

  const play = useCallback(() => {
    mediaRef.current?.play().catch(() => {
      // Play was prevented
    });
  }, []);

  const pause = useCallback(() => {
    mediaRef.current?.pause();
  }, []);

  const togglePlayPause = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (media.paused) {
      media.play().catch(() => {});
    } else {
      media.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const media = mediaRef.current;
    if (!media) return;

    const clampedTime = Math.max(0, Math.min(time, media.duration || 0));
    media.currentTime = clampedTime;
    setState((prev) => ({ ...prev, currentTime: clampedTime }));
  }, []);

  const seekRelative = useCallback((delta: number) => {
    const media = mediaRef.current;
    if (!media) return;

    const newTime = media.currentTime + delta;
    seek(newTime);
  }, [seek]);

  const setVolume = useCallback((volume: number) => {
    const media = mediaRef.current;
    if (!media) return;

    const clampedVolume = Math.max(0, Math.min(1, volume));
    media.volume = clampedVolume;
    if (clampedVolume > 0 && media.muted) {
      media.muted = false;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;

    media.muted = !media.muted;
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const media = mediaRef.current;
    if (!media) return;

    const clampedRate = Math.max(0.25, Math.min(4, rate));
    media.playbackRate = clampedRate;
    setState((prev) => ({ ...prev, playbackRate: clampedRate }));
  }, []);

  const reset = useCallback(() => {
    const media = mediaRef.current;
    if (media) {
      media.pause();
      media.currentTime = 0;
    }
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: 0,
    }));
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const getProgress = useCallback((): number => {
    if (state.duration === 0) return 0;
    return (state.currentTime / state.duration) * 100;
  }, [state.currentTime, state.duration]);

  return useMemo(() => ({
    // State
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration,
    volume: state.volume,
    isMuted: state.isMuted,
    playbackRate: state.playbackRate,

    // Ref
    mediaRef: mediaRef as React.RefObject<HTMLAudioElement | HTMLVideoElement>,

    // Controls
    play,
    pause,
    togglePlayPause,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    reset,

    // Utilities
    formatTime,
    getProgress,
  }), [
    state,
    play,
    pause,
    togglePlayPause,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    reset,
    formatTime,
    getProgress,
  ]);
}

export default useMediaPlayback;
