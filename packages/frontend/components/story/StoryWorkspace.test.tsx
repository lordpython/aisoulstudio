import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StoryWorkspace } from './StoryWorkspace';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, initial, animate, exit, transition, layout, ...props }: any) => (
      <div className={className} {...props}>{children}</div>
    ),
    span: ({ children, className, initial, animate, exit, transition, layout, ...props }: any) => (
      <span className={className} {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('./StepProgressBar', () => ({
  StepProgressBar: () => <div data-testid="step-progress-bar" />,
}));

vi.mock('@/i18n/useLanguage', () => ({
  useLanguage: () => ({
    isRTL: false,
    t: (key: string) => ({
      'story.storyIdea': 'Story Idea',
      'story.breakdown': 'Breakdown',
      'story.storyboard': 'Storyboard',
      'story.continueToBreakdown': 'Continue to Breakdown',
    }[key] ?? key),
  }),
}));

describe('StoryWorkspace', () => {
  it('shows a continue action for completed format-pipeline results', () => {
    const onContinueFromFormatPipeline = vi.fn();

    render(
      <StoryWorkspace
        storyState={{
          currentStep: 'idea',
          breakdown: [],
          script: null,
          characters: [],
          shotlist: [],
        }}
        onNextStep={vi.fn()}
        isProcessing={false}
        progress={{ message: '', percent: 0 }}
        onContinueFromFormatPipeline={onContinueFromFormatPipeline}
        formatPipelineHook={{
          selectedFormat: 'shorts',
          selectedGenre: 'Drama',
          idea: 'Ocean fact short',
          referenceDocuments: [],
          setFormat: vi.fn(),
          setGenre: vi.fn(),
          setIdea: vi.fn(),
          setReferenceDocuments: vi.fn(),
          isRunning: false,
          isCancelling: false,
          currentPhase: 'Complete',
          executionProgress: null,
          tasks: [],
          result: {
            success: true,
            partialResults: {
              screenplay: [
                {
                  id: 'scene_1',
                  sceneNumber: 1,
                  heading: 'Hook',
                  action: 'A short opening scene.',
                  dialogue: [],
                  charactersPresent: [],
                },
              ],
              visuals: [],
              narrationSegments: [],
            },
          },
          error: null,
          activeCheckpoint: null,
          execute: vi.fn(),
          cancel: vi.fn(),
          approveCheckpoint: vi.fn(),
          rejectCheckpoint: vi.fn(),
          reset: vi.fn(),
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue to Breakdown' }));

    expect(onContinueFromFormatPipeline).toHaveBeenCalledTimes(1);
  });
});
