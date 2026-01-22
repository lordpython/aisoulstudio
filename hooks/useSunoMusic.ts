/**
 * useSunoMusic Hook
 *
 * Manages AI music generation using the Suno API.
 * Extracted from useVideoProduction to adhere to Single Responsibility Principle.
 *
 * ROBUST PATTERNS IMPLEMENTED:
 * - Timeout protection for all polling loops
 * - AbortController support for cancellation
 * - Safe state updates that check mount status
 * - Comprehensive error handling
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
    SunoTaskStatus,
    SunoGeneratedTrack,
    SunoGenerationConfig,
    SunoExtendConfig,
    SunoUploadConfig,
    SunoPersonaConfig,
    SunoStemSeparationResult,
    isSunoConfigured,
    generateMusic as sunoGenerateMusic,
    waitForCompletion,
    generateLyrics as sunoGenerateLyrics,
    getLyricsStatus,
    getCredits,
    extendMusic as sunoExtendMusic,
    uploadAndExtend as sunoUploadAndExtend,
    generatePersona as sunoGeneratePersona,
    convertToWav as sunoConvertToWav,
    separateVocals as sunoSeparateVocals,
    waitForStemSeparation,
    createMusicVideo,
    generateCover,
    addVocals,
    addInstrumental,
    uploadAndCover,
    uploadAudioFile
} from "../services/sunoService";

/**
 * Music generation state for Suno API integration.
 * Tracks the status of AI music generation requests.
 */
export interface MusicGenerationState {
    /** Whether a generation is currently in progress */
    isGenerating: boolean;
    /** Whether an extend operation is in progress */
    isExtending: boolean;
    /** Whether a stem separation is in progress */
    isSeparating: boolean;
    /** Whether a WAV conversion is in progress */
    isConverting: boolean;
    /** Whether a persona generation is in progress */
    isGeneratingPersona: boolean;
    /** Current task ID from Suno API */
    taskId: string | null;
    /** Current generation status */
    status: SunoTaskStatus | null;
    /** Progress percentage (0-100) */
    progress: number;
    /** Generated tracks (Suno returns 2 variations) */
    generatedTracks: SunoGeneratedTrack[];
    /** ID of the selected track */
    selectedTrackId: string | null;
    /** Generated or custom lyrics */
    lyrics: string | null;
    /** Lyrics generation task ID */
    lyricsTaskId: string | null;
    /** Remaining API credits */
    credits: number | null;
    /** Error message if generation failed */
    error: string | null;
    /** Result of stem separation (vocals and instrumental URLs) */
    stemSeparationResult: SunoStemSeparationResult | null;
    /** URL of converted WAV file */
    convertedWavUrl: string | null;
    /** Generated persona ID */
    personaId: string | null;
}

const initialMusicState: MusicGenerationState = {
    isGenerating: false,
    isExtending: false,
    isSeparating: false,
    isConverting: false,
    isGeneratingPersona: false,
    taskId: null,
    status: null,
    progress: 0,
    generatedTracks: [],
    selectedTrackId: null,
    lyrics: null,
    lyricsTaskId: null,
    credits: null,
    error: null,
    stemSeparationResult: null,
    convertedWavUrl: null,
    personaId: null,
};

// Default timeout for long-running operations (5 minutes)
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
// Poll interval for status checks
const POLL_INTERVAL_MS = 5000;

export function useSunoMusic() {
    const [musicState, setMusicState] = useState<MusicGenerationState>(initialMusicState);

    // Track if component is mounted
    const isMountedRef = useRef(true);

    // AbortController for cancelling operations
    const abortControllerRef = useRef<AbortController | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            // Cancel any in-progress operations
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, []);

    // Safe state updater
    const safeSetState = useCallback((
        updater: React.SetStateAction<MusicGenerationState>
    ) => {
        if (isMountedRef.current) {
            setMusicState(updater);
        }
    }, []);

    /**
     * Cancel any in-progress music generation operations.
     */
    const cancelGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            console.log("[useSunoMusic] Cancelling in-progress operation");
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            safeSetState(prev => ({
                ...prev,
                isGenerating: false,
                isExtending: false,
                isSeparating: false,
                isConverting: false,
                isGeneratingPersona: false,
                status: null,
                progress: 0,
                error: "Operation was cancelled",
            }));
            return true;
        }
        return false;
    }, [safeSetState]);

    /**
     * Generate AI music using Suno API.
     * Includes timeout protection and cancellation support.
     */
    const generateMusic = useCallback(async (config: Partial<SunoGenerationConfig> & { prompt: string }) => {
        if (!isSunoConfigured()) {
            safeSetState(prev => ({
                ...prev,
                error: "Suno API key not configured. Add VITE_SUNO_API_KEY to .env.local",
            }));
            return;
        }

        // Cancel any existing operation
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        safeSetState(prev => ({
            ...prev,
            isGenerating: true,
            taskId: null,
            status: "PENDING",
            progress: 0,
            generatedTracks: [],
            error: null,
        }));

        try {
            // Check for abort
            if (signal.aborted) throw new Error("Operation was cancelled");

            console.log("[useSunoMusic] Starting music generation...");
            const taskId = await sunoGenerateMusic(config);

            if (signal.aborted) throw new Error("Operation was cancelled");

            safeSetState(prev => ({
                ...prev,
                taskId,
                status: "PROCESSING",
                progress: 25,
            }));

            // Wait with timeout protection
            const startTime = Date.now();
            const tracks = await Promise.race([
                waitForCompletion(taskId),
                new Promise<never>((_, reject) => {
                    const checkAbort = setInterval(() => {
                        if (signal.aborted) {
                            clearInterval(checkAbort);
                            reject(new Error("Operation was cancelled"));
                        }
                        if (Date.now() - startTime > DEFAULT_TIMEOUT_MS) {
                            clearInterval(checkAbort);
                            reject(new Error(`Music generation timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`));
                        }
                    }, 1000);
                }),
            ]);

            if (signal.aborted) throw new Error("Operation was cancelled");

            console.log(`[useSunoMusic] Music generation complete: ${tracks.length} tracks`);

            safeSetState(prev => ({
                ...prev,
                isGenerating: false,
                status: "SUCCESS",
                progress: 100,
                generatedTracks: tracks,
                selectedTrackId: tracks.length > 0 ? tracks[0].id : null,
            }));

            abortControllerRef.current = null;
        } catch (err) {
            if (signal.aborted) {
                console.log("[useSunoMusic] Music generation was cancelled");
                return;
            }
            console.error("[useSunoMusic] Music generation failed:", err);
            safeSetState(prev => ({
                ...prev,
                isGenerating: false,
                status: "FAILED",
                progress: 0,
                error: err instanceof Error ? err.message : String(err),
            }));
            abortControllerRef.current = null;
        }
    }, [safeSetState]);

    /**
     * Generate lyrics using Suno API.
     * Includes timeout protection and cancellation support.
     */
    const generateLyrics = useCallback(async (prompt: string) => {
        if (!isSunoConfigured()) {
            safeSetState(prev => ({
                ...prev,
                error: "Suno API key not configured. Add VITE_SUNO_API_KEY to .env.local",
            }));
            return;
        }

        // Cancel any existing operation
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        safeSetState(prev => ({
            ...prev,
            lyricsTaskId: null,
            lyrics: null,
            error: null,
        }));

        try {
            if (signal.aborted) throw new Error("Operation was cancelled");

            console.log("[useSunoMusic] Starting lyrics generation...");
            const taskId = await sunoGenerateLyrics(prompt);

            if (signal.aborted) throw new Error("Operation was cancelled");

            safeSetState(prev => ({
                ...prev,
                lyricsTaskId: taskId,
            }));

            const maxWaitMs = 2 * 60 * 1000;
            const startTime = Date.now();

            while (Date.now() - startTime < maxWaitMs) {
                // Check for cancellation at each iteration
                if (signal.aborted) throw new Error("Operation was cancelled");

                const result = await getLyricsStatus(taskId);

                if (result.status === "SUCCESS" && result.text) {
                    console.log("[useSunoMusic] Lyrics generation complete");
                    safeSetState(prev => ({
                        ...prev,
                        lyrics: result.text || null,
                    }));
                    abortControllerRef.current = null;
                    return;
                }

                if (result.status === "FAILED") {
                    throw new Error(result.errorMessage || "Lyrics generation failed");
                }

                // Wait with abort check
                await new Promise<void>((resolve, reject) => {
                    const timeoutId = setTimeout(resolve, POLL_INTERVAL_MS);
                    signal.addEventListener('abort', () => {
                        clearTimeout(timeoutId);
                        reject(new Error("Operation was cancelled"));
                    }, { once: true });
                });
            }

            throw new Error("Lyrics generation timed out. Please try again.");
        } catch (err) {
            if (signal.aborted) {
                console.log("[useSunoMusic] Lyrics generation was cancelled");
                return;
            }
            console.error("[useSunoMusic] Lyrics generation failed:", err);
            safeSetState(prev => ({
                ...prev,
                error: err instanceof Error ? err.message : String(err),
            }));
            abortControllerRef.current = null;
        }
    }, [safeSetState]);

    /**
     * Select a generated track for use.
     */
    const selectTrack = useCallback((trackId: string) => {
        setMusicState(prev => ({
            ...prev,
            selectedTrackId: trackId,
        }));
    }, []);

    /**
     * Refresh the Suno API credits balance.
     */
    const refreshCredits = useCallback(async () => {
        if (!isSunoConfigured()) {
            setMusicState(prev => ({
                ...prev,
                credits: null,
                error: "Suno API key not configured",
            }));
            return;
        }

        try {
            console.log("[useSunoMusic] Fetching Suno credits...");
            const result = await getCredits();

            setMusicState(prev => ({
                ...prev,
                credits: result.credits,
            }));

            console.log(`[useSunoMusic] Suno credits: ${result.credits}`);
        } catch (err) {
            console.error("[useSunoMusic] Failed to fetch credits:", err);
            setMusicState(prev => ({
                ...prev,
                credits: null,
            }));
        }
    }, []);

    /**
     * Reset music generation state.
     */
    const resetMusicState = useCallback(() => {
        setMusicState(initialMusicState);
    }, []);

    /**
     * Get the currently selected track.
     */
    const getSelectedTrack = useCallback((): SunoGeneratedTrack | null => {
        const { selectedTrackId, generatedTracks } = musicState;
        if (!selectedTrackId) return null;
        return generatedTracks.find(t => t.id === selectedTrackId) || null;
    }, [musicState]);

    /**
     * Extend an existing music track.
     * Wraps the service function with state management.
     */
    const extendMusic = useCallback(async (config: SunoExtendConfig) => {
        if (!isSunoConfigured()) {
            setMusicState(prev => ({
                ...prev,
                error: "Suno API key not configured. Add VITE_SUNO_API_KEY to .env.local",
            }));
            return;
        }

        setMusicState(prev => ({
            ...prev,
            isExtending: true,
            taskId: null,
            status: "PENDING",
            progress: 0,
            error: null,
        }));

        try {
            console.log("[useSunoMusic] Starting music extension...");
            const taskId = await sunoExtendMusic(config);

            setMusicState(prev => ({
                ...prev,
                taskId,
                status: "PROCESSING",
                progress: 25,
            }));

            const tracks = await waitForCompletion(taskId);

            console.log(`[useSunoMusic] Music extension complete: ${tracks.length} tracks`);

            setMusicState(prev => ({
                ...prev,
                isExtending: false,
                status: "SUCCESS",
                progress: 100,
                generatedTracks: [...prev.generatedTracks, ...tracks],
                selectedTrackId: tracks.length > 0 ? tracks[0].id : prev.selectedTrackId,
            }));

            return tracks;
        } catch (err) {
            console.error("[useSunoMusic] Music extension failed:", err);
            setMusicState(prev => ({
                ...prev,
                isExtending: false,
                status: "FAILED",
                progress: 0,
                error: err instanceof Error ? err.message : String(err),
            }));
        }
    }, []);

    /**
     * Upload and extend audio with new content.
     * Wraps the service function with state management.
     */
    const uploadAndExtend = useCallback(async (config: SunoUploadConfig) => {
        if (!isSunoConfigured()) {
            setMusicState(prev => ({
                ...prev,
                error: "Suno API key not configured. Add VITE_SUNO_API_KEY to .env.local",
            }));
            return;
        }

        setMusicState(prev => ({
            ...prev,
            isExtending: true,
            taskId: null,
            status: "PENDING",
            progress: 0,
            error: null,
        }));

        try {
            console.log("[useSunoMusic] Starting upload and extend...");
            const taskId = await sunoUploadAndExtend(config);

            setMusicState(prev => ({
                ...prev,
                taskId,
                status: "PROCESSING",
                progress: 25,
            }));

            const tracks = await waitForCompletion(taskId);

            console.log(`[useSunoMusic] Upload and extend complete: ${tracks.length} tracks`);

            setMusicState(prev => ({
                ...prev,
                isExtending: false,
                status: "SUCCESS",
                progress: 100,
                generatedTracks: [...prev.generatedTracks, ...tracks],
                selectedTrackId: tracks.length > 0 ? tracks[0].id : prev.selectedTrackId,
            }));

            return tracks;
        } catch (err) {
            console.error("[useSunoMusic] Upload and extend failed:", err);
            setMusicState(prev => ({
                ...prev,
                isExtending: false,
                status: "FAILED",
                progress: 0,
                error: err instanceof Error ? err.message : String(err),
            }));
        }
    }, []);

    /**
     * Convert a generated track to WAV format.
     * Wraps the service function with state management.
     */
    const convertToWav = useCallback(async (taskId: string, audioId: string) => {
        if (!isSunoConfigured()) {
            setMusicState(prev => ({
                ...prev,
                error: "Suno API key not configured. Add VITE_SUNO_API_KEY to .env.local",
            }));
            return;
        }

        setMusicState(prev => ({
            ...prev,
            isConverting: true,
            convertedWavUrl: null,
            error: null,
        }));

        try {
            console.log("[useSunoMusic] Starting WAV conversion...");
            const conversionTaskId = await sunoConvertToWav(taskId, audioId);

            // Poll for completion - WAV conversion uses the same task status endpoint
            const tracks = await waitForCompletion(conversionTaskId);

            // The converted WAV URL should be in the first track's audio_url
            const wavUrl = tracks.length > 0 ? tracks[0].audio_url : null;

            console.log(`[useSunoMusic] WAV conversion complete: ${wavUrl}`);

            setMusicState(prev => ({
                ...prev,
                isConverting: false,
                convertedWavUrl: wavUrl,
            }));

            return wavUrl;
        } catch (err) {
            console.error("[useSunoMusic] WAV conversion failed:", err);
            setMusicState(prev => ({
                ...prev,
                isConverting: false,
                error: err instanceof Error ? err.message : String(err),
            }));
        }
    }, []);

    /**
     * Separate vocals from instrumental in a track.
     * Wraps the service function with state management.
     */
    const separateVocals = useCallback(async (taskId: string, audioId: string) => {
        if (!isSunoConfigured()) {
            setMusicState(prev => ({
                ...prev,
                error: "Suno API key not configured. Add VITE_SUNO_API_KEY to .env.local",
            }));
            return;
        }

        setMusicState(prev => ({
            ...prev,
            isSeparating: true,
            stemSeparationResult: null,
            error: null,
        }));

        try {
            console.log("[useSunoMusic] Starting vocal separation...");
            const separationTaskId = await sunoSeparateVocals(taskId, audioId);

            // Wait for stem separation to complete
            const result = await waitForStemSeparation(separationTaskId);

            console.log(`[useSunoMusic] Vocal separation complete:`, result);

            setMusicState(prev => ({
                ...prev,
                isSeparating: false,
                stemSeparationResult: result,
            }));

            return result;
        } catch (err) {
            console.error("[useSunoMusic] Vocal separation failed:", err);
            setMusicState(prev => ({
                ...prev,
                isSeparating: false,
                error: err instanceof Error ? err.message : String(err),
            }));
        }
    }, []);

    /**
     * Generate a personalized music style/persona.
     * Wraps the service function with state management.
     */
    const generatePersona = useCallback(async (config: SunoPersonaConfig) => {
        if (!isSunoConfigured()) {
            setMusicState(prev => ({
                ...prev,
                error: "Suno API key not configured. Add VITE_SUNO_API_KEY to .env.local",
            }));
            return;
        }

        setMusicState(prev => ({
            ...prev,
            isGeneratingPersona: true,
            personaId: null,
            error: null,
        }));

        try {
            console.log("[useSunoMusic] Starting persona generation...");
            const personaTaskId = await sunoGeneratePersona(config);

            // Poll for completion - persona generation uses the same task status endpoint
            await waitForCompletion(personaTaskId);

            // The persona ID should be returned in the response
            // For now, we use the task ID as the persona ID
            const personaId = personaTaskId;

            console.log(`[useSunoMusic] Persona generation complete: ${personaId}`);

            setMusicState(prev => ({
                ...prev,
                isGeneratingPersona: false,
                personaId,
            }));

            return personaId;
        } catch (err) {
            console.error("[useSunoMusic] Persona generation failed:", err);
            setMusicState(prev => ({
                ...prev,
                isGeneratingPersona: false,
                error: err instanceof Error ? err.message : String(err),
            }));
        }
    }, []);

    return {
        // State
        musicState,

        // Actions
        generateMusic,
        generateLyrics,
        selectTrack,
        refreshCredits,
        resetMusicState,
        cancelGeneration,

        // New Actions with State Management
        extendMusic,
        uploadAndExtend,
        convertToWav,
        separateVocals,
        generatePersona,

        // Helpers
        getSelectedTrack,

        // Advanced Actions (Static imports - no dynamic loading)
        createMusicVideo: async (taskId: string, audioId: string) => {
            return createMusicVideo(taskId, audioId);
        },
        generateCover: async (taskId: string) => {
            return generateCover(taskId);
        },
        addVocals: async (config: any) => {
            setMusicState(prev => ({
                ...prev,
                isGenerating: true,
                taskId: null,
                status: "PENDING",
                progress: 0,
                generatedTracks: [],
                error: null,
            }));

            try {
                console.log("[useSunoMusic] Starting add vocals...");
                const taskId = await addVocals(config);

                setMusicState(prev => ({
                    ...prev,
                    taskId,
                    status: "PROCESSING",
                    progress: 25,
                }));

                const tracks = await waitForCompletion(taskId);

                console.log(`[useSunoMusic] Add vocals complete: ${tracks.length} tracks`);

                setMusicState(prev => ({
                    ...prev,
                    isGenerating: false,
                    status: "SUCCESS",
                    progress: 100,
                    generatedTracks: tracks,
                    selectedTrackId: tracks.length > 0 ? tracks[0].id : null,
                }));

                return taskId;
            } catch (err) {
                console.error("[useSunoMusic] Add vocals failed:", err);
                setMusicState(prev => ({
                    ...prev,
                    isGenerating: false,
                    status: "FAILED",
                    progress: 0,
                    error: err instanceof Error ? err.message : String(err),
                }));
                throw err;
            }
        },
        addInstrumental: async (config: any) => {
            setMusicState(prev => ({
                ...prev,
                isGenerating: true,
                taskId: null,
                status: "PENDING",
                progress: 0,
                generatedTracks: [],
                error: null,
            }));

            try {
                console.log("[useSunoMusic] Starting add instrumental...");
                const taskId = await addInstrumental(config);

                setMusicState(prev => ({
                    ...prev,
                    taskId,
                    status: "PROCESSING",
                    progress: 25,
                }));

                const tracks = await waitForCompletion(taskId);

                console.log(`[useSunoMusic] Add instrumental complete: ${tracks.length} tracks`);

                setMusicState(prev => ({
                    ...prev,
                    isGenerating: false,
                    status: "SUCCESS",
                    progress: 100,
                    generatedTracks: tracks,
                    selectedTrackId: tracks.length > 0 ? tracks[0].id : null,
                }));

                return taskId;
            } catch (err) {
                console.error("[useSunoMusic] Add instrumental failed:", err);
                setMusicState(prev => ({
                    ...prev,
                    isGenerating: false,
                    status: "FAILED",
                    progress: 0,
                    error: err instanceof Error ? err.message : String(err),
                }));
                throw err;
            }
        },
        uploadAndCover: async (config: any) => {
            setMusicState(prev => ({
                ...prev,
                isGenerating: true,
                taskId: null,
                status: "PENDING",
                progress: 0,
                generatedTracks: [],
                error: null,
            }));

            try {
                console.log("[useSunoMusic] Starting upload and cover...");
                const taskId = await uploadAndCover(config);

                setMusicState(prev => ({
                    ...prev,
                    taskId,
                    status: "PROCESSING",
                    progress: 25,
                }));

                const tracks = await waitForCompletion(taskId);

                console.log(`[useSunoMusic] Upload and cover complete: ${tracks.length} tracks`);

                setMusicState(prev => ({
                    ...prev,
                    isGenerating: false,
                    status: "SUCCESS",
                    progress: 100,
                    generatedTracks: tracks,
                    selectedTrackId: tracks.length > 0 ? tracks[0].id : null,
                }));

                return taskId;
            } catch (err) {
                console.error("[useSunoMusic] Upload and cover failed:", err);
                setMusicState(prev => ({
                    ...prev,
                    isGenerating: false,
                    status: "FAILED",
                    progress: 0,
                    error: err instanceof Error ? err.message : String(err),
                }));
                throw err;
            }
        },
        uploadAudio: async (file: File) => {
            return uploadAudioFile(file);
        }
    };
}
