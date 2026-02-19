/**
 * useFormatPipeline Hook
 *
 * Orchestration hook bridging UI ↔ format-specific pipeline services.
 * Manages format selection, genre, idea, reference documents, pipeline execution,
 * checkpoint approval/rejection, and cancellation.
 *
 * movie-animation is excluded — it delegates to the existing useStoryGeneration hook.
 */

import { useState, useCallback, useRef } from 'react';
import type { VideoFormat, CheckpointState } from '@/types';
import type { IndexedDocument } from '@/services/documentParser';
import type { PipelineCallbacks, PipelineResult } from '@/services/formatRouter';
import { formatRouter } from '@/services/formatRouter';
import { formatRegistry } from '@/services/formatRegistry';
import type { CheckpointSystem } from '@/services/checkpointSystem';
import type { ExecutionProgress } from '@/services/parallelExecutionEngine';
import type { PipelineTask } from '@/components/PipelineProgress';

// Pipeline class imports (lazy-registered before each execute)
import { YouTubeNarratorPipeline } from '@/services/pipelines/youtubeNarrator';
import { AdvertisementPipeline } from '@/services/pipelines/advertisement';
import { EducationalPipeline } from '@/services/pipelines/educational';
import { ShortsPipeline } from '@/services/pipelines/shorts';
import { DocumentaryPipeline } from '@/services/pipelines/documentary';
import { MusicVideoPipeline } from '@/services/pipelines/musicVideo';
import { NewsPoliticsPipeline } from '@/services/pipelines/newsPolitics';

/**
 * Build a static task list from format metadata for progress display.
 */
function buildTaskList(formatId: VideoFormat): PipelineTask[] {
  const meta = formatRegistry.getFormat(formatId);
  if (!meta) return [];

  const tasks: PipelineTask[] = [];

  if (meta.requiresResearch) {
    tasks.push({ id: 'research', name: 'Research & Sources', type: 'research', status: 'queued' });
  }

  tasks.push({ id: 'script', name: 'Script Generation', type: 'script', status: 'queued' });
  tasks.push({ id: 'visual', name: 'Visual Generation', type: 'visual', status: 'queued' });
  tasks.push({ id: 'audio', name: 'Audio / Narration', type: 'audio', status: 'queued' });
  tasks.push({ id: 'assembly', name: 'Final Assembly', type: 'assembly', status: 'queued' });

  return tasks;
}

export interface UseFormatPipelineReturn {
  // Selection state
  selectedFormat: VideoFormat | null;
  selectedGenre: string | null;
  idea: string;
  referenceDocuments: IndexedDocument[];
  setFormat: (format: VideoFormat) => void;
  setGenre: (genre: string) => void;
  setIdea: (idea: string) => void;
  setReferenceDocuments: (docs: IndexedDocument[]) => void;

  // Execution state
  isRunning: boolean;
  isCancelling: boolean;
  currentPhase: string;
  executionProgress: ExecutionProgress | null;
  tasks: PipelineTask[];
  result: PipelineResult | null;
  error: string | null;

  // Checkpoint state
  activeCheckpoint: CheckpointState | null;

  // Actions
  execute: (userId: string, projectId: string) => Promise<void>;
  cancel: () => void;
  approveCheckpoint: () => void;
  rejectCheckpoint: (changeRequest?: string) => void;
  reset: () => void;
}

export function useFormatPipeline(): UseFormatPipelineReturn {
  // Selection state
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [idea, setIdea] = useState('');
  const [referenceDocuments, setReferenceDocuments] = useState<IndexedDocument[]>([]);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('');
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress | null>(null);
  const [tasks, setTasks] = useState<PipelineTask[]>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Checkpoint state
  const [activeCheckpoint, setActiveCheckpoint] = useState<CheckpointState | null>(null);

  // Refs for bridging callbacks to React state
  const checkpointSystemRef = useRef<CheckpointSystem | null>(null);
  const cancelFnRef = useRef<(() => void) | null>(null);

  const setFormat = useCallback((format: VideoFormat) => {
    setSelectedFormat(format);
    setSelectedGenre(null); // Reset genre when format changes
    setResult(null);
    setError(null);
  }, []);

  const setGenre = useCallback((genre: string) => {
    setSelectedGenre(genre);
  }, []);

  /**
   * Register all 7 non-movie pipelines on the format router with fresh callback closures.
   * Called before each execute() to avoid stale React closures.
   */
  const registerPipelines = useCallback((callbacks: PipelineCallbacks) => {
    // We don't pass callbacks to constructors — callbacks are passed via execute()
    formatRouter.registerPipeline('youtube-narrator', new YouTubeNarratorPipeline());
    formatRouter.registerPipeline('advertisement', new AdvertisementPipeline());
    formatRouter.registerPipeline('educational', new EducationalPipeline());
    formatRouter.registerPipeline('shorts', new ShortsPipeline());
    formatRouter.registerPipeline('documentary', new DocumentaryPipeline());
    formatRouter.registerPipeline('music-video', new MusicVideoPipeline());
    formatRouter.registerPipeline('news-politics', new NewsPoliticsPipeline());
  }, []);

  /**
   * Update task statuses based on checkpoint phase.
   */
  const updateTaskFromPhase = useCallback((phase: string) => {
    setTasks(prev => {
      const updated = [...prev];
      // Simple heuristic: map checkpoint phases to task types
      if (phase.includes('research')) {
        const task = updated.find(t => t.id === 'research');
        if (task) task.status = 'completed';
        const scriptTask = updated.find(t => t.id === 'script');
        if (scriptTask && scriptTask.status === 'queued') scriptTask.status = 'in-progress';
      } else if (phase.includes('script') || phase.includes('cta')) {
        const researchTask = updated.find(t => t.id === 'research');
        if (researchTask && researchTask.status === 'queued') researchTask.status = 'completed';
        const scriptTask = updated.find(t => t.id === 'script');
        if (scriptTask) scriptTask.status = 'completed';
        const visualTask = updated.find(t => t.id === 'visual');
        if (visualTask && visualTask.status === 'queued') visualTask.status = 'in-progress';
      } else if (phase.includes('visual') || phase.includes('preview')) {
        const researchTask = updated.find(t => t.id === 'research');
        if (researchTask) researchTask.status = 'completed';
        const scriptTask = updated.find(t => t.id === 'script');
        if (scriptTask) scriptTask.status = 'completed';
        const visualTask = updated.find(t => t.id === 'visual');
        if (visualTask) visualTask.status = 'completed';
        const audioTask = updated.find(t => t.id === 'audio');
        if (audioTask && audioTask.status === 'queued') audioTask.status = 'in-progress';
      } else if (phase.includes('assembly') || phase.includes('final')) {
        for (const t of updated) {
          if (t.id !== 'assembly') t.status = 'completed';
        }
        const assemblyTask = updated.find(t => t.id === 'assembly');
        if (assemblyTask) assemblyTask.status = 'in-progress';
      }
      return updated;
    });
  }, []);

  const execute = useCallback(async (userId: string, projectId: string) => {
    if (!selectedFormat || selectedFormat === 'movie-animation') return;
    if (isRunning) return;

    setIsRunning(true);
    setIsCancelling(false);
    setError(null);
    setResult(null);
    setActiveCheckpoint(null);
    setCurrentPhase('Initializing...');

    // Build static task list from format metadata
    const taskList = buildTaskList(selectedFormat);
    setTasks(taskList);

    // Set first task as in-progress
    if (taskList.length > 0) {
      taskList[0]!.status = 'in-progress';
      setTasks([...taskList]);
    }

    // Build callbacks with fresh closures
    const callbacks: PipelineCallbacks = {
      onCheckpointCreated: (checkpoint: CheckpointState) => {
        setActiveCheckpoint(checkpoint);
        setCurrentPhase(`Checkpoint: ${checkpoint.phase}`);
        updateTaskFromPhase(checkpoint.phase);
      },
      onCheckpointSystemCreated: (system: CheckpointSystem) => {
        checkpointSystemRef.current = system;
      },
      onProgress: (progress: ExecutionProgress) => {
        setExecutionProgress(progress);
      },
      onCancelRequested: (cancelFn: () => void) => {
        cancelFnRef.current = cancelFn;
      },
    };

    // Register fresh pipeline instances
    registerPipelines(callbacks);

    try {
      const pipelineResult = await formatRouter.dispatch(
        {
          formatId: selectedFormat,
          idea,
          genre: selectedGenre ?? undefined,
          language: 'en', // TODO: detect from idea
          referenceDocuments: referenceDocuments.length > 0 ? referenceDocuments : undefined,
          userId,
          projectId,
        },
        callbacks,
      );

      setResult(pipelineResult);

      if (pipelineResult.success) {
        // Mark all tasks as completed
        setTasks(prev => prev.map(t => ({ ...t, status: 'completed' as const })));
        setCurrentPhase('Complete');
      } else {
        setError(pipelineResult.error ?? 'Pipeline failed');
        setCurrentPhase('Failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setCurrentPhase('Failed');
    } finally {
      setIsRunning(false);
      checkpointSystemRef.current = null;
      cancelFnRef.current = null;
    }
  }, [selectedFormat, selectedGenre, idea, referenceDocuments, isRunning, registerPipelines, updateTaskFromPhase]);

  const cancel = useCallback(() => {
    if (!isRunning) return;
    setIsCancelling(true);
    cancelFnRef.current?.();
    // Mark remaining tasks as cancelled
    setTasks(prev => prev.map(t =>
      t.status === 'queued' || t.status === 'in-progress'
        ? { ...t, status: 'cancelled' as const }
        : t
    ));
  }, [isRunning]);

  const approveCheckpoint = useCallback(() => {
    if (!activeCheckpoint || !checkpointSystemRef.current) return;
    checkpointSystemRef.current.approveCheckpoint(activeCheckpoint.checkpointId);
    setActiveCheckpoint(null);
  }, [activeCheckpoint]);

  const rejectCheckpoint = useCallback((changeRequest?: string) => {
    if (!activeCheckpoint || !checkpointSystemRef.current) return;
    checkpointSystemRef.current.rejectCheckpoint(activeCheckpoint.checkpointId, changeRequest);
    setActiveCheckpoint(null);
  }, [activeCheckpoint]);

  const reset = useCallback(() => {
    setSelectedFormat(null);
    setSelectedGenre(null);
    setIdea('');
    setReferenceDocuments([]);
    setIsRunning(false);
    setIsCancelling(false);
    setCurrentPhase('');
    setExecutionProgress(null);
    setTasks([]);
    setResult(null);
    setError(null);
    setActiveCheckpoint(null);
    checkpointSystemRef.current = null;
    cancelFnRef.current = null;
  }, []);

  return {
    selectedFormat,
    selectedGenre,
    idea,
    referenceDocuments,
    setFormat,
    setGenre,
    setIdea,
    setReferenceDocuments,

    isRunning,
    isCancelling,
    currentPhase,
    executionProgress,
    tasks,
    result,
    error,

    activeCheckpoint,

    execute,
    cancel,
    approveCheckpoint,
    rejectCheckpoint,
    reset,
  };
}
