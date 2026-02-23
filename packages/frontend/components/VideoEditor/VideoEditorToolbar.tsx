/**
 * VideoEditorToolbar
 *
 * Left sidebar with tool icons that toggle media/property panels.
 */

import { Layers, LayoutTemplate, Music, Type, Image } from 'lucide-react';
import type { ToolPanel } from './types/video-editor-types';
import './video-editor.css';

interface ToolbarItem {
  panel: ToolPanel;
  icon: React.ElementType;
  label: string;
}

const TOOLS: ToolbarItem[] = [
  { panel: 'layers', icon: Layers, label: 'Layers' },
  { panel: 'templates', icon: LayoutTemplate, label: 'Templates' },
  { panel: 'audio', icon: Music, label: 'Audio' },
  { panel: 'text', icon: Type, label: 'Text' },
  { panel: 'media', icon: Image, label: 'Media' },
];

interface VideoEditorToolbarProps {
  activePanel: ToolPanel;
  onPanelToggle: (panel: NonNullable<ToolPanel>) => void;
}

export function VideoEditorToolbar({ activePanel, onPanelToggle }: VideoEditorToolbarProps) {
  return (
    <div className="ve-toolbar" role="toolbar" aria-label="Editor tools">
      {TOOLS.map(({ panel, icon: Icon, label }) => (
        <button
          key={panel}
          className={`ve-toolbar-btn ${activePanel === panel ? 'active' : ''}`}
          onClick={() => onPanelToggle(panel!)}
          title={label}
          aria-label={label}
          aria-pressed={activePanel === panel}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}
