/**
 * MessageBubble - Chat message display component
 *
 * Renders individual chat messages with support for:
 * - User and assistant message styling
 * - Quick action buttons
 * - Progress indicators
 * - RTL layout support
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message, QuickAction } from '@/stores/appStore';

export interface ChatMessageStatus {
  status?: 'thinking' | 'generating' | 'complete' | 'error';
  progress?: number;
  videoReady?: boolean;
}

export interface ChatMessage extends Message, ChatMessageStatus {
  quickActions?: Array<{
    id: string;
    label: string;
    labelAr?: string;
    action: QuickAction['action'];
    variant?: 'primary' | 'secondary';
  }>;
}

export interface FeedbackData {
  helpful: boolean;
  rating: number;
  comment?: string;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  isRTL?: boolean;
  onQuickAction?: (action: QuickAction['action']) => void;
  onFeedback?: (messageId: string, feedback: FeedbackData) => void;
  className?: string;
}

/**
 * Renders a single chat message bubble
 */
export function MessageBubble({
  message,
  isRTL = false,
  onQuickAction,
  onFeedback,
  className,
}: MessageBubbleProps) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');

  const isUser = message.role === 'user';
  const hasQuickActions = !isUser && message.quickActions && message.quickActions.length > 0;

  const handleFeedback = (helpful: boolean) => {
    if (helpful) {
      onFeedback?.(message.id, { helpful: true, rating: 5 });
    } else {
      setShowFeedbackForm(true);
    }
  };

  const submitFeedback = () => {
    onFeedback?.(message.id, {
      helpful: false,
      rating: 2,
      comment: feedbackComment,
    });
    setShowFeedbackForm(false);
    setFeedbackComment('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex gap-4',
        isUser ? 'justify-end' : 'justify-start',
        isRTL && 'flex-row-reverse',
        className
      )}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0 mt-1"
          aria-hidden="true"
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Message Content */}
      <div className={cn('max-w-[80%]', isUser && (isRTL ? 'text-start' : 'text-end'))}>
        <div
          className={cn(
            'inline-block px-4 py-3 text-[15px] leading-relaxed',
            isUser
              ? 'bg-violet-600 text-white rounded-2xl rounded-te-md'
              : 'bg-white/5 text-white/90 rounded-2xl rounded-ts-md border border-white/10'
          )}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>

        {/* Quick Action Buttons */}
        {hasQuickActions && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={cn('mt-3 flex flex-wrap gap-2', isRTL && 'flex-row-reverse')}
          >
            {message.quickActions!.map((qa) => (
              <button
                key={qa.id}
                onClick={() => onQuickAction?.(qa.action)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                  'hover:scale-105 active:scale-95',
                  qa.variant === 'primary'
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500'
                    : 'bg-white/10 text-white/90 border border-white/20 hover:bg-white/20'
                )}
              >
                {isRTL && qa.labelAr ? qa.labelAr : qa.label}
              </button>
            ))}
          </motion.div>
        )}

        {/* Progress Indicator */}
        {message.status === 'generating' && message.progress !== undefined && (
          <div className={cn('mt-3 flex items-center gap-3', isRTL && 'flex-row-reverse')}>
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden max-w-[200px]">
              <motion.div
                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                initial={{ width: 0 }}
                animate={{ width: `${message.progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-xs text-white/40 tabular-nums">
              {Math.round(message.progress)}%
            </span>
          </div>
        )}

        {/* Thinking Indicator */}
        {message.status === 'thinking' && (
          <div
            className={cn(
              'mt-2 flex items-center gap-2 text-white/40 text-sm',
              isRTL && 'flex-row-reverse'
            )}
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            <span>...</span>
          </div>
        )}

        {/* Video Ready Badge */}
        {message.videoReady && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium"
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            Ready
          </motion.div>
        )}

        {/* Feedback Buttons (only for assistant messages) */}
        {!isUser && onFeedback && (
          <div className={cn('mt-2 flex gap-2', isRTL && 'flex-row-reverse')}>
            <button
              onClick={() => handleFeedback(true)}
              className="text-xs text-white/40 hover:text-green-400 transition-colors flex items-center gap-1"
              aria-label="Mark as helpful"
            >
              <span>👍</span>
              <span>Helpful</span>
            </button>
            <button
              onClick={() => handleFeedback(false)}
              className="text-xs text-white/40 hover:text-red-400 transition-colors flex items-center gap-1"
              aria-label="Mark as not helpful"
            >
              <span>👎</span>
              <span>Not helpful</span>
            </button>
          </div>
        )}

        {/* Feedback Form */}
        {showFeedbackForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 p-3 bg-white/5 rounded-lg border border-white/10"
          >
            <label htmlFor={`feedback-${message.id}`} className="text-xs text-white/60 block mb-2">
              What could be improved?
            </label>
            <textarea
              id={`feedback-${message.id}`}
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Your feedback helps us improve..."
              className="w-full bg-white/10 rounded p-2 text-sm text-white placeholder:text-white/30 border border-white/10 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 min-h-[60px]"
              dir={isRTL ? 'rtl' : 'ltr'}
            />
            <div className={cn('mt-2 flex gap-2', isRTL && 'flex-row-reverse')}>
              <button
                onClick={submitFeedback}
                disabled={!feedbackComment.trim()}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 disabled:text-white/30 rounded text-sm transition-colors"
              >
                Submit
              </button>
              <button
                onClick={() => setShowFeedbackForm(false)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-1 text-white/60 text-sm font-medium"
          aria-hidden="true"
        >
          U
        </div>
      )}
    </motion.div>
  );
}

export default MessageBubble;
