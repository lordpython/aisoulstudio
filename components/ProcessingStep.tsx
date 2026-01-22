import React from 'react';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import { AppState } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ProcessingStepProps {
  currentStep: AppState;
}

export const ProcessingStep: React.FC<ProcessingStepProps> = ({ currentStep }) => {
  const steps = [
    { id: AppState.PROCESSING_AUDIO, label: 'Preparing audio...' },
    { id: AppState.TRANSCRIBING, label: 'Transcribing audio...' },
    { id: AppState.ANALYZING_LYRICS, label: 'Analyzing content...' },
    { id: AppState.GENERATING_PROMPTS, label: 'Generating visual prompts...' },
  ];

  // Helper to determine step status
  const getStatus = (stepId: AppState) => {
    // Define order with new granular states
    const order = [
      AppState.IDLE,
      AppState.PROCESSING_AUDIO,
      AppState.TRANSCRIBING,
      AppState.ANALYZING_LYRICS,
      AppState.GENERATING_PROMPTS,
      AppState.READY
    ];
    const currentIndex = order.indexOf(currentStep);
    const stepIndex = order.indexOf(stepId);

    if (currentStep === AppState.ERROR) return 'error';
    if (currentIndex > stepIndex) return 'completed';
    if (currentIndex === stepIndex) return 'active';
    return 'pending';
  };

  if (currentStep === AppState.IDLE || currentStep === AppState.READY || currentStep === AppState.ERROR) return null;

  return (
    <Card className="w-full max-w-md mx-auto my-8 bg-slate-800/50 backdrop-blur-sm border-slate-700">
      <CardHeader className="pb-4">
        <CardTitle className="text-center text-lg font-medium text-white">Processing your track...</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step) => {
          const status = getStatus(step.id);
          return (
            <div key={step.id} className="flex items-center gap-4">
              <div className="shrink-0">
                {status === 'completed' && <CheckCircle2 className="w-6 h-6 text-green-400" />}
                {status === 'active' && <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />}
                {status === 'pending' && <Circle className="w-6 h-6 text-slate-600" />}
              </div>
              <span className={cn(
                "text-sm font-medium transition-colors duration-300",
                status === 'active' ? 'text-cyan-100' :
                  status === 'completed' ? 'text-green-100/70 line-through' : 'text-slate-500'
              )}>
                {step.label}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
