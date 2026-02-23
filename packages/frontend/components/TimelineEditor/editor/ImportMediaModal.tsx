"use client";

import type React from "react";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video, ImageIcon, FileText, Upload, Link, X } from "lucide-react";
import type { MediaFile, SubtitleCue } from "@/types/audio-editor";

interface ImportMediaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportVideo: (file: MediaFile) => void;
  onImportImage: (file: MediaFile) => void;
  onImportSubtitles: (cues: SubtitleCue[]) => void;
}

export function ImportMediaModal({
  open,
  onOpenChange,
  onImportVideo,
  onImportImage,
  onImportSubtitles,
}: ImportMediaModalProps) {
  const [activeTab, setActiveTab] = useState("video");
  const [urlInput, setUrlInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const mediaFile: MediaFile = {
        id: `media-${Date.now()}`,
        type: activeTab as "video" | "image" | "subtitle",
        name: file.name,
        url,
      };

      if (activeTab === "video") {
        onImportVideo(mediaFile);
      } else if (activeTab === "image") {
        onImportImage(mediaFile);
      } else if (activeTab === "subtitle") {
        // Parse subtitle file (simplified SRT parsing)
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          const cues = parseSubtitles(content);
          onImportSubtitles(cues);
        };
        reader.readAsText(file);
      }

      onOpenChange(false);
    },
    [activeTab, onImportVideo, onImportImage, onImportSubtitles, onOpenChange]
  );

  const handleUrlImport = useCallback(() => {
    if (!urlInput.trim()) return;

    const mediaFile: MediaFile = {
      id: `media-${Date.now()}`,
      type: activeTab as "video" | "image" | "subtitle",
      name: urlInput.split("/").pop() || "Imported Media",
      url: urlInput,
    };

    if (activeTab === "video") {
      onImportVideo(mediaFile);
    } else if (activeTab === "image") {
      onImportImage(mediaFile);
    }

    setUrlInput("");
    onOpenChange(false);
  }, [activeTab, urlInput, onImportVideo, onImportImage, onOpenChange]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const mediaFile: MediaFile = {
        id: `media-${Date.now()}`,
        type: activeTab as "video" | "image" | "subtitle",
        name: file.name,
        url,
      };

      if (activeTab === "video" && file.type.startsWith("video/")) {
        onImportVideo(mediaFile);
        onOpenChange(false);
      } else if (activeTab === "image" && file.type.startsWith("image/")) {
        onImportImage(mediaFile);
        onOpenChange(false);
      } else if (activeTab === "subtitle") {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          const cues = parseSubtitles(content);
          onImportSubtitles(cues);
          onOpenChange(false);
        };
        reader.readAsText(file);
      }
    },
    [activeTab, onImportVideo, onImportImage, onImportSubtitles, onOpenChange]
  );

  const getAcceptTypes = () => {
    switch (activeTab) {
      case "video":
        return "video/*";
      case "image":
        return "image/*";
      case "subtitle":
        return ".srt,.vtt,.txt";
      default:
        return "*/*";
    }
  };

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case "video":
        return <Video className="h-4 w-4" />;
      case "image":
        return <ImageIcon className="h-4 w-4" />;
      case "subtitle":
        return <FileText className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Media</DialogTitle>
          <DialogDescription>
            Upload or link video files, images, or subtitle files to your
            project.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="video" className="gap-2">
              {getTabIcon("video")}
              Video
            </TabsTrigger>
            <TabsTrigger value="image" className="gap-2">
              {getTabIcon("image")}
              Image
            </TabsTrigger>
            <TabsTrigger value="subtitle" className="gap-2">
              {getTabIcon("subtitle")}
              Subtitles
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 space-y-4">
            {/* Drag and drop zone */}
            <div
              className={`relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={getAcceptTypes()}
                onChange={handleFileSelect}
                className="sr-only"
                aria-label={`Upload ${activeTab} file`}
              />
              <Upload className="mb-2 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">
                Drag and drop or click to upload
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTab === "video" && "MP4, WebM, MOV up to 500MB"}
                {activeTab === "image" && "PNG, JPG, GIF up to 10MB"}
                {activeTab === "subtitle" && "SRT, VTT, or TXT files"}
              </p>
            </div>

            {/* URL import (not for subtitles) */}
            {activeTab !== "subtitle" && (
              <div className="space-y-2">
                <Label htmlFor="url-input" className="text-sm">
                  Or import from URL
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="url-input"
                      placeholder={`Paste ${activeTab} URL...`}
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="pl-9"
                    />
                    {urlInput && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                        onClick={() => setUrlInput("")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Button onClick={handleUrlImport} disabled={!urlInput.trim()}>
                    Import
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Simple SRT/VTT subtitle parser
 * Parses subtitle files and returns an array of SubtitleCue objects
 */
function parseSubtitles(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const trackId = `subtitle-${Date.now()}`;

  // Try to detect format and parse
  const lines = content.trim().split("\n");
  let i = 0;

  // Skip VTT header if present
  if (lines[0]?.includes("WEBVTT")) {
    i = 1;
    while (i < lines.length && lines[i]?.trim() === "") i++;
  }

  while (i < lines.length) {
    const currentLine = lines[i];
    if (!currentLine) {
      i++;
      continue;
    }

    // Skip cue number for SRT
    if (/^\d+$/.test(currentLine.trim())) {
      i++;
    }

    // Look for timestamp line
    const timestampLine = lines[i];
    if (!timestampLine) {
      i++;
      continue;
    }

    const timestampMatch = timestampLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );

    if (timestampMatch) {
      const startTime =
        Number.parseInt(timestampMatch[1] || "0") * 3600 +
        Number.parseInt(timestampMatch[2] || "0") * 60 +
        Number.parseInt(timestampMatch[3] || "0") +
        Number.parseInt(timestampMatch[4] || "0") / 1000;

      const endTime =
        Number.parseInt(timestampMatch[5] || "0") * 3600 +
        Number.parseInt(timestampMatch[6] || "0") * 60 +
        Number.parseInt(timestampMatch[7] || "0") +
        Number.parseInt(timestampMatch[8] || "0") / 1000;

      i++;

      // Collect text lines until empty line
      const textLines: string[] = [];
      while (i < lines.length) {
        const textLine = lines[i];
        if (!textLine || textLine.trim() === "") break;
        textLines.push(textLine.trim());
        i++;
      }

      if (textLines.length > 0) {
        cues.push({
          id: `cue-${Date.now()}-${cues.length}`,
          trackId,
          startTime,
          endTime,
          text: textLines.join(" "),
        });
      }
    }

    i++;
  }

  return cues;
}
