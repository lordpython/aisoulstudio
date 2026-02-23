/**
 * ChatInput - Chat message input component
 *
 * Provides a styled textarea with send button for chat interfaces.
 * Supports RTL layout and keyboard shortcuts.
 */

import React, { useRef, useCallback, KeyboardEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isRTL?: boolean;
  hintText?: string;
  className?: string;
  inputId?: string;
}

/**
 * Chat input with auto-resizing textarea and send button
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type a message...',
  disabled = false,
  isLoading = false,
  isRTL = false,
  hintText,
  className,
  inputId = 'chat-input',
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && !isLoading && value.trim()) {
          onSubmit();
        }
      }
    },
    [disabled, isLoading, value, onSubmit]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!disabled && !isLoading && value.trim()) {
        onSubmit();
      }
    },
    [disabled, isLoading, value, onSubmit]
  );

  const isSubmitDisabled = !value.trim() || disabled || isLoading;

  return (
    <div className={cn('border-t border-white/5 bg-black/20 backdrop-blur-xl', className)}>
      <div className="max-w-3xl mx-auto px-4 py-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white/5 rounded-2xl border border-white/10 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all"
        >
          <label htmlFor={inputId} className="sr-only">
            {placeholder}
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              'w-full bg-transparent border-0 focus:ring-0 resize-none text-sm text-white placeholder:text-white/30 min-h-[52px] max-h-[200px] px-4 py-3',
              isRTL && 'text-right'
            )}
            rows={1}
            disabled={disabled || isLoading}
            dir={isRTL ? 'rtl' : 'ltr'}
            aria-describedby={hintText ? `${inputId}-hint` : undefined}
          />
          <div
            className={cn(
              'flex justify-between items-center px-3 pb-3',
              isRTL && 'flex-row-reverse'
            )}
          >
            {hintText && (
              <span
                id={`${inputId}-hint`}
                className="text-[10px] text-white/20 uppercase tracking-wider"
              >
                {hintText}
              </span>
            )}
            {!hintText && <span />}
            <Button
              type="submit"
              disabled={isSubmitDisabled}
              size="sm"
              className={cn(
                'rounded-xl transition-all',
                value.trim()
                  ? 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'bg-white/10 text-white/30'
              )}
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChatInput;
