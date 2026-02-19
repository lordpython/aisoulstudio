/**
 * Reference Document Upload Component
 *
 * Drag-and-drop upload for PDF, TXT, DOCX reference documents.
 * Parses documents into indexed chunks for the Research Service.
 *
 * Requirements: 22.4
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  Check,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseDocument,
  getSupportedTypes,
  DocumentParseError,
  type IndexedDocument,
} from '@/services/documentParser';

export interface ReferenceDocumentUploadProps {
  documents: IndexedDocument[];
  onDocumentsChange: (docs: IndexedDocument[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  className?: string;
}

interface UploadStatus {
  filename: string;
  status: 'parsing' | 'done' | 'error';
  error?: string;
}

const ACCEPT = '.pdf,.txt,.docx';

export function ReferenceDocumentUpload({
  documents,
  onDocumentsChange,
  maxFiles = 5,
  maxSizeMB = 10,
  className,
}: ReferenceDocumentUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = maxFiles - documents.length;

      if (remaining <= 0) {
        setUploadStatuses([
          { filename: '', status: 'error', error: `Maximum ${maxFiles} files allowed` },
        ]);
        return;
      }

      const toProcess = fileArray.slice(0, remaining);
      const newStatuses: UploadStatus[] = toProcess.map((f) => ({
        filename: f.name,
        status: 'parsing' as const,
      }));

      setUploadStatuses(newStatuses);

      const results: IndexedDocument[] = [];

      for (let i = 0; i < toProcess.length; i++) {
        const file = toProcess[i]!;

        // Size check
        if (file.size > maxSizeBytes) {
          newStatuses[i] = {
            filename: file.name,
            status: 'error',
            error: `File exceeds ${maxSizeMB}MB limit`,
          };
          setUploadStatuses([...newStatuses]);
          continue;
        }

        try {
          const doc = await parseDocument(file);
          results.push(doc);
          newStatuses[i] = { filename: file.name, status: 'done' };
        } catch (err) {
          const msg =
            err instanceof DocumentParseError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Unknown parsing error';
          newStatuses[i] = { filename: file.name, status: 'error', error: msg };
        }

        setUploadStatuses([...newStatuses]);
      }

      if (results.length > 0) {
        onDocumentsChange([...documents, ...results]);
      }

      // Clear statuses after a delay
      setTimeout(() => setUploadStatuses([]), 3000);
    },
    [documents, onDocumentsChange, maxFiles, maxSizeBytes, maxSizeMB],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleRemove = useCallback(
    (docId: string) => {
      onDocumentsChange(documents.filter((d) => d.id !== docId));
    },
    [documents, onDocumentsChange],
  );

  return (
    <div className={cn('w-full', className)}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-sm border-2 border-dashed cursor-pointer transition-colors duration-200',
          dragOver
            ? 'border-blue-500/50 bg-blue-500/10'
            : 'border-zinc-700 bg-zinc-900/40 hover:border-zinc-500',
        )}
        role="button"
        aria-label="Upload reference documents"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <Upload
          className={cn(
            'w-5 h-5',
            dragOver ? 'text-blue-400' : 'text-zinc-500',
          )}
        />
        <div className="text-center">
          <span className="text-[13px] text-zinc-300">
            Drop files here or click to browse
          </span>
          <span className="block font-mono text-[10px] text-zinc-500 mt-1">
            PDF, TXT, DOCX — max {maxSizeMB}MB, {maxFiles} files
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {/* Upload statuses */}
      <AnimatePresence>
        {uploadStatuses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-1 overflow-hidden"
          >
            {uploadStatuses.map((s, i) => (
              <div
                key={`${s.filename}-${i}`}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs font-mono',
                  s.status === 'parsing'
                    ? 'border-zinc-700 text-zinc-400'
                    : s.status === 'done'
                      ? 'border-emerald-500/30 text-emerald-400'
                      : 'border-red-500/30 text-red-400',
                )}
              >
                {s.status === 'parsing' && <Loader2 className="w-3 h-3 animate-spin" />}
                {s.status === 'done' && <Check className="w-3 h-3" />}
                {s.status === 'error' && <AlertCircle className="w-3 h-3" />}
                <span className="truncate">{s.filename || s.error}</span>
                {s.error && s.filename && (
                  <span className="text-red-500 truncate ml-auto">{s.error}</span>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document list */}
      {documents.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <span className="font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-zinc-500">
            Reference Documents ({documents.length}/{maxFiles})
          </span>
          {documents.map((doc) => (
            <motion.div
              key={doc.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-3 px-3 py-2 rounded-sm border border-zinc-700 bg-zinc-900/60"
            >
              <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[13px] text-zinc-200 truncate block">
                  {doc.filename}
                </span>
                <span className="font-mono text-[10px] text-zinc-500">
                  {doc.chunks.length} chunks, {doc.metadata.wordCount ?? '?'} words
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(doc.id)}
                className={cn(
                  'shrink-0 p-1 rounded-sm border border-transparent',
                  'text-zinc-500 hover:text-red-400 hover:border-red-500/30',
                  'transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500',
                )}
                aria-label={`Remove ${doc.filename}`}
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReferenceDocumentUpload;
