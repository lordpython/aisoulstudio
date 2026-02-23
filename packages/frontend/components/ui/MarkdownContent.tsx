import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Lightweight markdown renderer for scene content.
 * Handles bold, headings, italic, and line breaks without
 * requiring a heavy markdown library.
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const rendered = useMemo(() => {
    if (!content) return '';

    let html = content
      // Escape HTML entities
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headings (### -> h4, ## -> h3)
      .replace(
        /^###\s+(.+)$/gm,
        '<h4 class="heading-card mt-4 mb-2">$1</h4>'
      )
      .replace(
        /^##\s+(.+)$/gm,
        '<h3 class="heading-section mt-4 mb-2">$1</h3>'
      )
      // Bold (**text** or __text__)
      .replace(
        /\*\*(.+?)\*\*/g,
        '<strong class="font-editorial font-semibold text-[oklch(0.95_0.01_60)]">$1</strong>'
      )
      .replace(
        /__(.+?)__/g,
        '<strong class="font-editorial font-semibold text-[oklch(0.95_0.01_60)]">$1</strong>'
      )
      // Italic (*text* or _text_) - must come after bold
      .replace(
        /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,
        '<em class="font-script italic text-[oklch(0.80_0.02_60)]">$1</em>'
      )
      // Bullet lists (- item or * item)
      .replace(
        /^[\-\*]\s+(.+)$/gm,
        '<li class="text-body-editorial ps-2">$1</li>'
      )
      // Line breaks
      .replace(/\n\n/g, '</p><p class="mt-3">')
      .replace(/\n/g, '<br />');

    // Wrap standalone li elements in ul
    html = html.replace(
      /(<li[^>]*>.*?<\/li>(?:\s*<br\s*\/?>\s*)?)+/g,
      (match) => `<ul class="space-y-1 my-2 list-none">${match.replace(/<br\s*\/?>/g, '')}</ul>`
    );

    return html;
  }, [content]);

  return (
    <div
      dir="auto"
      className={cn('text-body-editorial', className)}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

export default MarkdownContent;
