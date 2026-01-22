"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Track } from "@/types/audio-editor";

interface TrackSidebarProps {
  tracks: Track[];
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onGenerateAudio: (id: string) => void;
}

export function TrackSidebar({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onUpdateText,
  onGenerateAudio,
}: TrackSidebarProps) {
  return (
    <ScrollArea className="w-[400px] border-r border-border bg-card lg:w-[480px]">
      <div className="flex flex-col gap-3 p-4">
        {tracks.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            isSelected={track.id === selectedTrackId}
            onSelect={() => onSelectTrack(track.id)}
            onUpdateText={(text) => onUpdateText(track.id, text)}
            onGenerateAudio={() => onGenerateAudio(track.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface TrackCardProps {
  track: Track;
  isSelected: boolean;
  onSelect: () => void;
  onUpdateText: (text: string) => void;
  onGenerateAudio: () => void;
}

function TrackCard({
  track,
  isSelected,
  onSelect,
  onUpdateText,
  onGenerateAudio,
}: TrackCardProps) {
  const isNarrator = track.type === "narrator";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border-2 bg-card p-3 transition-all",
        isSelected
          ? "border-primary shadow-sm"
          : "border-transparent hover:border-border"
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      {/* Track header */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            isNarrator ? "bg-narrator" : "bg-sfx"
          )}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-muted-foreground">
          {track.name}
        </span>
      </div>

      {/* Text input */}
      <Textarea
        value={track.text}
        onChange={(e) => onUpdateText(e.target.value)}
        placeholder={
          isNarrator
            ? "Enter narration text..."
            : "Enter sound effect description..."
        }
        className="min-h-[60px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Generate button */}
      <Button
        variant="ghost"
        size="sm"
        className="self-end text-xs text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onGenerateAudio();
        }}
      >
        Generate Audio
      </Button>
    </div>
  );
}
