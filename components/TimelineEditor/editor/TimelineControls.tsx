"use client";

import type React from "react";
import {
  Play,
  Pause,
  Volume2,
  PlusCircle,
  Upload,
  Video,
  ImageIcon,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface TimelineControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  zoom: number;
  onZoomChange: (value: number) => void;
  volume: number;
  onVolumeChange: (value: number) => void;
  selectedClipId: string | null;
  onAddVoiceoverTrack: () => void;
  onAddSfxTrack: () => void;
  onAddSubtitleTrack: () => void;
  onOpenImportModal: () => void;
}

export function TimelineControls({
  isPlaying,
  onPlayPause,
  zoom,
  onZoomChange,
  volume,
  onVolumeChange,
  selectedClipId,
  onAddVoiceoverTrack,
  onAddSfxTrack,
  onAddSubtitleTrack,
  onOpenImportModal,
}: TimelineControlsProps) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
      {/* Left controls */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings2Icon className="h-4 w-4" />
        </Button>
      </div>

      {/* Center - Play button and track actions */}
      <div className="flex flex-col items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </Button>

        {/* Track action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs bg-transparent"
            onClick={onAddVoiceoverTrack}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Voiceover Track
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs bg-transparent"
            onClick={onAddSfxTrack}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add SFX Track
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs bg-transparent"
            onClick={onAddSubtitleTrack}
          >
            <FileText className="h-3.5 w-3.5" />
            Add Subtitle Track
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs bg-transparent"
              >
                <Upload className="h-3.5 w-3.5" />
                Import Media
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuLabel className="text-xs">
                Import Files
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenImportModal} className="gap-2">
                <Video className="h-4 w-4" />
                Import Video
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenImportModal} className="gap-2">
                <ImageIcon className="h-4 w-4" />
                Import Image
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenImportModal} className="gap-2">
                <FileText className="h-4 w-4" />
                Import Subtitles
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Zoom control */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Slider
            value={[zoom]}
            onValueChange={([value]) => onZoomChange(value ?? 10)}
            min={10}
            max={100}
            step={1}
            className="w-24"
            aria-label="Timeline zoom"
          />
        </div>

        {/* Selection info */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">
            {selectedClipId ? "1 Clip Selected" : "No Selection"}
          </span>

          {/* Volume control */}
          <div className="flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            <Slider
              value={[volume]}
              onValueChange={([value]) => onVolumeChange(value ?? 100)}
              min={0}
              max={100}
              step={1}
              className="w-20"
              aria-label="Volume"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs bg-transparent"
            disabled={!selectedClipId}
          >
            Create Voice from Selection
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs bg-transparent"
          >
            Generate Audio
          </Button>
        </div>
      </div>
    </div>
  );
}

function Settings2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </svg>
  );
}
