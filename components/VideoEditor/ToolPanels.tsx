/**
 * ToolPanels
 *
 * Content panels that appear when toolbar icons are toggled.
 * Layers, Templates, Audio, Text, and Media panels.
 */

import { useState } from 'react';
import {
  Plus, Video, Image as ImageIcon, Type, Music, Trash2,
  Eye, EyeOff, GripVertical,
} from 'lucide-react';
import type { EditorTrack, EditorTrackType, ToolPanel } from './types/video-editor-types';
import { DEFAULT_TEXT_STYLE } from './types/video-editor-types';
import './video-editor.css';

// ============================================================================
// Layers Panel
// ============================================================================

interface LayersPanelProps {
  tracks: EditorTrack[];
  onToggleVisibility: (trackId: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onAddTrack: (type: EditorTrackType) => void;
}

function LayersPanel({ tracks, onToggleVisibility, onRemoveTrack, onAddTrack }: LayersPanelProps) {
  const sorted = [...tracks].sort((a, b) => a.order - b.order);

  return (
    <div className="ve-tool-panel">
      <div className="ve-tool-panel-header">Layers</div>
      <div style={{ padding: '8px' }}>
        {sorted.map(track => (
          <div
            key={track.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 8px', borderRadius: '6px',
              background: 'rgba(255,255,255,0.03)', marginBottom: '4px',
            }}
          >
            <GripVertical size={12} style={{ opacity: 0.3, cursor: 'grab' }} />
            <span style={{ flex: 1, fontSize: '12px' }}>{track.name}</span>
            <button
              onClick={() => onToggleVisibility(track.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '2px' }}
              aria-label={track.isVisible ? 'Hide' : 'Show'}
            >
              {track.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button
              onClick={() => onRemoveTrack(track.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}
              aria-label="Remove track"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
          {(['video', 'image', 'text', 'audio'] as const).map(type => (
            <button
              key={type}
              onClick={() => onAddTrack(type)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 8px', borderRadius: '4px', fontSize: '11px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'inherit', cursor: 'pointer',
              }}
            >
              <Plus size={10} /> {type}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Text Panel
// ============================================================================

interface TextPanelProps {
  onAddTextClip: (text: string) => void;
}

function TextPanel({ onAddTextClip }: TextPanelProps) {
  const [text, setText] = useState('');

  const presets = [
    'Title Text',
    'Subtitle',
    'Lower Third',
    'Call to Action',
  ];

  return (
    <div className="ve-tool-panel">
      <div className="ve-tool-panel-header">Text</div>
      <div style={{ padding: '12px' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text..."
          style={{
            width: '100%', padding: '8px', borderRadius: '6px',
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: '13px', marginBottom: '8px',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              onAddTextClip(text.trim());
              setText('');
            }
          }}
        />
        <button
          onClick={() => {
            if (text.trim()) {
              onAddTextClip(text.trim());
              setText('');
            }
          }}
          style={{
            width: '100%', padding: '8px', borderRadius: '6px',
            background: 'rgba(59, 130, 246, 0.3)', border: '1px solid rgba(59, 130, 246, 0.5)',
            color: '#fff', fontSize: '12px', cursor: 'pointer', marginBottom: '12px',
          }}
        >
          <Type size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
          Add Text
        </button>

        <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Presets
        </div>
        {presets.map(preset => (
          <button
            key={preset}
            onClick={() => onAddTextClip(preset)}
            style={{
              display: 'block', width: '100%', padding: '8px',
              borderRadius: '6px', marginBottom: '4px', textAlign: 'left',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              color: '#ccc', fontSize: '12px', cursor: 'pointer',
            }}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Media Panel
// ============================================================================

interface MediaPanelProps {
  onAddTrack: (type: EditorTrackType) => void;
}

function MediaPanel({ onAddTrack }: MediaPanelProps) {
  return (
    <div className="ve-tool-panel">
      <div className="ve-tool-panel-header">Media</div>
      <div style={{ padding: '12px' }}>
        <div className="ve-empty-state" style={{ height: '120px', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '8px' }}>
          <p style={{ fontSize: '12px' }}>Drop files here or import</p>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => onAddTrack('video')}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', borderRadius: '6px', fontSize: '11px',
              background: 'rgba(20, 184, 166, 0.15)', border: '1px solid rgba(20, 184, 166, 0.3)',
              color: '#14b8a6', cursor: 'pointer',
            }}
          >
            <Video size={12} /> Video
          </button>
          <button
            onClick={() => onAddTrack('image')}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', borderRadius: '6px', fontSize: '11px',
              background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)',
              color: '#22c55e', cursor: 'pointer',
            }}
          >
            <ImageIcon size={12} /> Image
          </button>
          <button
            onClick={() => onAddTrack('audio')}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', borderRadius: '6px', fontSize: '11px',
              background: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.3)',
              color: '#f97316', cursor: 'pointer',
            }}
          >
            <Music size={12} /> Audio
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Audio Panel
// ============================================================================

function AudioPanel() {
  return (
    <div className="ve-tool-panel">
      <div className="ve-tool-panel-header">Audio</div>
      <div style={{ padding: '12px' }}>
        <div className="ve-empty-state" style={{ height: '80px' }}>
          <Music size={24} style={{ opacity: 0.3 }} />
          <p style={{ fontSize: '12px' }}>No audio files imported</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Templates Panel
// ============================================================================

function TemplatesPanel() {
  return (
    <div className="ve-tool-panel">
      <div className="ve-tool-panel-header">Templates</div>
      <div style={{ padding: '12px' }}>
        <div className="ve-empty-state" style={{ height: '80px' }}>
          <p style={{ fontSize: '12px' }}>Templates coming soon</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Panel Router
// ============================================================================

interface ToolPanelRouterProps {
  activePanel: ToolPanel;
  tracks: EditorTrack[];
  onToggleVisibility: (trackId: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onAddTrack: (type: EditorTrackType) => void;
  onAddTextClip: (text: string) => void;
}

export function ToolPanelRouter({
  activePanel,
  tracks,
  onToggleVisibility,
  onRemoveTrack,
  onAddTrack,
  onAddTextClip,
}: ToolPanelRouterProps) {
  if (!activePanel) return null;

  switch (activePanel) {
    case 'layers':
      return <LayersPanel tracks={tracks} onToggleVisibility={onToggleVisibility} onRemoveTrack={onRemoveTrack} onAddTrack={onAddTrack} />;
    case 'text':
      return <TextPanel onAddTextClip={onAddTextClip} />;
    case 'media':
      return <MediaPanel onAddTrack={onAddTrack} />;
    case 'audio':
      return <AudioPanel />;
    case 'templates':
      return <TemplatesPanel />;
    default:
      return null;
  }
}
