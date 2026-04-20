/**
 * CheckpointOverlay
 *
 * Full-screen overlay that renders checkpoint approval UI during format pipeline
 * execution. Builds preview content and output preview from checkpoint data,
 * including scene lists, visual grids, research summaries, and a mini-timeline.
 *
 * Extracted from StoryWorkspace to keep it focused on orchestration.
 */

import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Pencil, Check } from 'lucide-react';
import { CheckpointApproval } from './CheckpointApproval';

export interface SceneEdit {
  sceneIndex: number;
  heading?: string;
  action?: string;
}

export interface CheckpointApprovalPayload {
  sceneEdits?: SceneEdit[];
}

export interface CheckpointData {
  checkpointId: string;
  phase: string;
  data?: Record<string, unknown>;
}

export interface CheckpointOverlayProps {
  checkpoint: CheckpointData;
  onApprove: (payload?: CheckpointApprovalPayload) => void;
  onReject: (changeRequest: string) => void;
}

// --- Preview Builders ---

// --- Editable Scene List ---

function EditableSceneItem({
  index,
  heading,
  action,
  onEdit,
}: {
  index: number;
  heading: string;
  action: string;
  onEdit: (index: number, field: 'heading' | 'action', value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editHeading, setEditHeading] = useState(heading);
  const [editAction, setEditAction] = useState(action);

  const handleSave = () => {
    if (editHeading !== heading) onEdit(index, 'heading', editHeading);
    if (editAction !== action) onEdit(index, 'action', editAction);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex gap-3 items-start">
        <span className="font-mono text-[10px] text-blue-400 shrink-0 mt-0.5">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <input
            type="text"
            value={editHeading}
            onChange={(e) => setEditHeading(e.target.value)}
            className="w-full px-2 py-1 text-sm text-zinc-200 font-medium bg-zinc-800 border border-zinc-600 rounded-sm focus:outline-none focus:border-blue-500"
          />
          <textarea
            value={editAction}
            onChange={(e) => setEditAction(e.target.value)}
            rows={2}
            className="w-full px-2 py-1 text-xs text-zinc-400 bg-zinc-800 border border-zinc-600 rounded-sm resize-none focus:outline-none focus:border-blue-500"
            dir="auto"
          />
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 rounded-sm hover:bg-emerald-500/20"
          >
            <Check className="w-3 h-3" /> Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-start group">
      <span className="font-mono text-[10px] text-blue-400 shrink-0 mt-0.5">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-200 font-medium">{heading}</p>
        <p className="text-xs text-zinc-500 line-clamp-2" dir="auto">{action}</p>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-zinc-500 hover:text-zinc-300"
        title="Edit scene"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}

interface BriefCharacterPreview {
  role: string;
  displayName: string;
  visualDesc: string;
}

interface BriefArcPreview {
  actIndex: number;
  emotionalTone: string;
  keyInfo?: string;
}

function BriefPreview({
  idea,
  audience,
  tone,
  characters,
  arc,
}: {
  idea?: string;
  audience?: string;
  tone?: string;
  characters: BriefCharacterPreview[];
  arc: BriefArcPreview[];
}) {
  return (
    <div className="space-y-4">
      {idea && (
        <div>
          <span className="font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-zinc-500 block mb-1">
            Idea
          </span>
          <p className="text-[13px] text-zinc-200">{idea}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {audience && (
          <div>
            <span className="font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-zinc-500 block mb-1">
              Audience
            </span>
            <p className="text-[13px] text-zinc-300">{audience}</p>
          </div>
        )}
        {tone && (
          <div>
            <span className="font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-zinc-500 block mb-1">
              Tone
            </span>
            <p className="text-[13px] text-zinc-300">{tone}</p>
          </div>
        )}
      </div>
      {characters.length > 0 && (
        <div>
          <span className="font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-zinc-500 block mb-2">
            Characters ({characters.length})
          </span>
          <ul className="space-y-2">
            {characters.map((c, i) => (
              <li key={i} className="px-3 py-2 rounded-sm border border-zinc-800 bg-zinc-950/60">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-blue-400">
                    {c.role}
                  </span>
                  <span className="text-[13px] text-zinc-200 font-medium">{c.displayName}</span>
                </div>
                <p className="text-xs text-zinc-400">{c.visualDesc}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {arc.length > 0 && (
        <div>
          <span className="font-mono text-[10px] font-medium tracking-[0.15em] uppercase text-zinc-500 block mb-2">
            Arc ({arc.length} beats)
          </span>
          <ol className="space-y-1.5">
            {arc.map((b, i) => (
              <li key={i} className="flex gap-3 items-start text-[12px]">
                <span className="font-mono text-[10px] text-blue-400 shrink-0 mt-0.5">
                  {String(b.actIndex + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-zinc-300">{b.emotionalTone}</span>
                  {b.keyInfo && <span className="text-zinc-500"> — {b.keyInfo}</span>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function buildPreviewContent(
  d: Record<string, unknown>,
  phase: string,
  onEditScene?: (index: number, field: 'heading' | 'action', value: string) => void,
): React.ReactNode {
  if (phase === 'brief-approval') {
    return (
      <BriefPreview
        idea={d.idea as string | undefined}
        audience={d.audience as string | undefined}
        tone={d.tone as string | undefined}
        characters={(d.characters as BriefCharacterPreview[] | undefined) ?? []}
        arc={(d.arc as BriefArcPreview[] | undefined) ?? []}
      />
    );
  }

  const scenes = d.scenes as { heading: string; action: string }[] | undefined;
  const visuals = d.visuals as { sceneId: string; imageUrl: string }[] | undefined;

  if (scenes && scenes.length > 0) {
    return (
      <div className="space-y-2">
        {d.sceneCount ? (
          <p className="text-xs text-zinc-500 mb-2">
            {String(d.sceneCount)} scenes {d.estimatedDuration ? `· ${d.estimatedDuration}` : ''}
          </p>
        ) : null}
        {scenes.map((s, i) => (
          <EditableSceneItem
            key={i}
            index={i}
            heading={s.heading}
            action={s.action}
            onEdit={onEditScene ?? (() => {})}
          />
        ))}
      </div>
    );
  }

  if (visuals && visuals.length > 0) {
    return (
      <div>
        {d.visualCount != null && (
          <p className="text-xs text-zinc-500 mb-2">
            {d.visualCount as number}/{(d.totalScenes as number) ?? '?'} visuals generated
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {visuals.map((v, i) => (
            <div key={v.sceneId} className="aspect-video bg-zinc-950 rounded-sm overflow-hidden border border-zinc-800">
              <img src={v.imageUrl} alt={`Scene ${i + 1}`} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (phase.includes('final') || phase.includes('assembly')) {
    const stats = [
      d.sceneCount != null && `${d.sceneCount} scenes`,
      d.visualCount != null && `${d.visualCount} visuals`,
      d.narrationCount != null && `${d.narrationCount} narrations`,
      d.totalDuration != null && `${Math.round(d.totalDuration as number)}s total`,
    ].filter(Boolean);
    if (stats.length > 0) {
      return (
        <div className="flex flex-wrap gap-3">
          {stats.map((s, i) => (
            <span key={i} className="px-2.5 py-1 bg-zinc-800 rounded-sm text-xs font-mono text-zinc-300">{s}</span>
          ))}
        </div>
      );
    }
  }

  if (d.sourceCount != null) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-zinc-300">{d.sourceCount as number} sources found</p>
        {d.confidence != null && (
          <p className="text-xs text-zinc-500">Confidence: {Math.round((d.confidence as number) * 100)}%</p>
        )}
      </div>
    );
  }

  return null;
}

interface TimelineItem {
  id: string;
  label: string;
}

function MiniTimeline({
  items,
  activeIndex,
  onClickItem,
}: {
  items: TimelineItem[];
  activeIndex: number | null;
  onClickItem: (index: number) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="h-12 rounded-sm border border-zinc-800 bg-[#030b1a] flex items-center justify-center text-[11px] text-zinc-500">
        Timeline will populate as output is generated.
      </div>
    );
  }

  return (
    <div className="relative h-12 rounded-sm border border-zinc-800 bg-[#030b1a] overflow-hidden">
      {items.map((item, index) => {
        const segmentCount = items.length;
        const widthPct = Math.max(14, 92 / segmentCount);
        const leftPct = (index / segmentCount) * 100;
        const isActive = activeIndex === index;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onClickItem(index)}
            className={`absolute top-2 h-8 rounded-sm border text-[10px] px-2 flex items-center transition-colors cursor-pointer ${
              isActive
                ? 'border-blue-400 bg-blue-500/40 text-blue-50 ring-1 ring-blue-400/50'
                : 'border-blue-400/40 bg-blue-500/25 text-blue-100 hover:bg-blue-500/35'
            }`}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            title={item.label}
          >
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PreviewVideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="h-full w-full relative">
      <video
        ref={videoRef}
        src={src}
        controls
        className="w-full h-full object-contain bg-black"
        playsInline
      />
    </div>
  );
}

function buildOutputPreview(
  d: Record<string, unknown>,
  phase: string,
  activeTimelineIndex: number | null,
  onTimelineClick: (index: number) => void,
): React.ReactNode {
  const scenes = d.scenes as { heading: string; action: string }[] | undefined;
  const visuals = d.visuals as { sceneId: string; imageUrl: string }[] | undefined;
  const videoUrl = d.videoUrl as string | undefined;

  // At final assembly, show video player if available
  const isFinalPhase = phase.includes('final') || phase.includes('assembly');
  const primaryVisual = visuals?.[activeTimelineIndex ?? 0]?.imageUrl ?? visuals?.[0]?.imageUrl;
  const timelineItems: TimelineItem[] = (
    scenes?.map((scene, index) => ({ id: `scene-${index}`, label: scene.heading }))
    ?? visuals?.map((visual, index) => ({ id: visual.sceneId || `visual-${index}`, label: `Visual ${index + 1}` }))
    ?? []
  ).slice(0, 7);

  return (
    <div className="h-full flex flex-col bg-[#08152d]">
      <div className="flex-1 p-4">
        <div className="h-full rounded-md border border-blue-900/50 bg-black overflow-hidden relative">
          {isFinalPhase && videoUrl ? (
            <PreviewVideoPlayer src={videoUrl} />
          ) : primaryVisual ? (
            <img src={primaryVisual} alt="Checkpoint output preview" className="w-full h-full object-cover" />
          ) : d.sourceCount != null ? (
            <div className="h-full w-full overflow-y-auto p-4 text-left">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded bg-blue-900/60 border border-blue-700/50 text-[11px] font-mono text-blue-300">
                  {d.sourceCount as number} sources
                </span>
                {d.confidence != null && (
                  <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[11px] font-mono text-zinc-400">
                    {Math.round((d.confidence as number) * 100)}% confidence
                  </span>
                )}
              </div>
              {Array.isArray(d.topics) && (d.topics as string[]).length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">Topics covered</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(d.topics as string[]).map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-sm bg-zinc-800/80 border border-zinc-700/60 text-[11px] text-zinc-300">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {d.summaryPreview != null && (
                <div>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1.5">Research summary</p>
                  <p className="text-xs text-zinc-400 leading-relaxed">{d.summaryPreview as string}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full w-full flex items-center justify-center text-zinc-500 text-sm">
              Waiting for generated output...
            </div>
          )}
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 border border-zinc-700 text-[10px] font-mono text-zinc-300">
            {d.estimatedDuration ? String(d.estimatedDuration) : 'Preview'}
          </div>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-blue-900/40 bg-[#091a37] flex items-center justify-between text-[11px] font-mono text-zinc-400">
        <span>{d.sourceCount != null ? `${d.sourceCount as number} sources` : `${timelineItems.length || visuals?.length || 0} clips`}</span>
        <span>{d.totalDuration != null ? `${Math.round(d.totalDuration as number)}s total` : 'Checkpoint output'}</span>
      </div>

      <div className="border-t border-blue-900/40 bg-[#07142a] p-3">
        <MiniTimeline items={timelineItems} activeIndex={activeTimelineIndex} onClickItem={onTimelineClick} />
      </div>
    </div>
  );
}

// --- Main Component ---

export function CheckpointOverlay({ checkpoint, onApprove, onReject }: CheckpointOverlayProps) {
  const [activeTimelineIndex, setActiveTimelineIndex] = useState<number | null>(null);
  const [sceneEdits, setSceneEdits] = useState<Map<number, { heading?: string; action?: string }>>(new Map());
  const d = checkpoint.data ?? {};

  // Apply scene edits to data for preview
  const editedData = { ...d };
  if (sceneEdits.size > 0 && Array.isArray(d.scenes)) {
    editedData.scenes = (d.scenes as { heading: string; action: string }[]).map((s, i) => {
      const edit = sceneEdits.get(i);
      return edit ? { ...s, ...edit } : s;
    });
  }

  const handleEditScene = useCallback((index: number, field: 'heading' | 'action', value: string) => {
    setSceneEdits(prev => {
      const next = new Map(prev);
      const existing = next.get(index) ?? {};
      next.set(index, { ...existing, [field]: value });
      return next;
    });
  }, []);

  const handleApprove = useCallback(() => {
    // If scenes were edited, pass edits to pipeline
    if (sceneEdits.size > 0) {
      const sceneEditsArray: SceneEdit[] = Array.from(sceneEdits.entries())
        .map(([index, edit]) => ({
          sceneIndex: index,
          ...edit,
        }));
      onApprove({ sceneEdits: sceneEditsArray });
    } else {
      onApprove();
    }
  }, [sceneEdits, onApprove]);

  const previewContent = buildPreviewContent(editedData, checkpoint.phase, handleEditScene);
  const outputPreview = buildOutputPreview(editedData, checkpoint.phase, activeTimelineIndex, setActiveTimelineIndex);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-[#020712]/90 backdrop-blur-sm p-3 sm:p-4 z-50"
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="w-full h-full max-w-7xl mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-full rounded-lg border border-blue-950/70 bg-[#040d1c] p-3 sm:p-4">
          <CheckpointApproval
            checkpointId={checkpoint.checkpointId}
            phase={checkpoint.phase}
            title={`Review: ${checkpoint.phase.replace(/-/g, ' ')}`}
            description={previewContent ? undefined : "Review the generated content before the pipeline continues to the next phase."}
            previewData={previewContent}
            outputPreview={outputPreview}
            outputLabel="Generated Output"
            layout="editor"
            className="h-full"
            onApprove={handleApprove}
            onRequestChanges={(_id, changeRequest) => onReject(changeRequest)}
          />
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default CheckpointOverlay;
