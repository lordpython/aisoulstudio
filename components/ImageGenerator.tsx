import React, { useState, useEffect } from "react";
import { ImagePrompt, GeneratedImage, AssetType } from "../types";
import {
  Wand2,
  Image as ImageIcon,
  Download,
  Loader2,
  Clock,
  Edit2,
  X,
  Check,
  RefreshCw,
  Sparkles,
  Film,
  ChevronDown,
} from "lucide-react";
import {
  generateImageFromPrompt,
  generateVideoFromPrompt,
  refineImagePrompt,
  generateMotionPrompt,
} from "../services/geminiService";
import { animateImageWithDeApi } from "../services/deapiService";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ImageGeneratorProps {
  prompt: ImagePrompt;
  onImageGenerated: (img: GeneratedImage) => void;
  existingImage?: string;
  existingType?: "image" | "video";
  existingBaseImage?: string;
  style?: string;
  globalSubject?: string;
  aspectRatio?: string;
  /** Default generation mode from global settings */
  generationMode?: "image" | "video";
  videoProvider?: "veo" | "deapi";
  /** Other scene prompts (excluding self) for cross-scene deduplication */
  siblingPromptTexts?: string[];
  /** Callback when asset type changes */
  onAssetTypeChange?: (promptId: string, assetType: AssetType) => void;
}

const ASSET_TYPE_OPTIONS: {
  value: AssetType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
    {
      value: "image",
      label: "Image",
      icon: <ImageIcon size={14} />,
      description: "Static scene",
    },
    {
      value: "video_with_image", // Use video_with_image internally for better quality
      label: "Video",
      icon: <Film size={14} />,
      description: "Animated clip",
    },
  ];

export const ImageGenerator = React.memo<ImageGeneratorProps>(({
  prompt,
  onImageGenerated,
  existingImage,
  existingType = "image",
  existingBaseImage,
  style = "Cinematic",
  globalSubject = "",
  aspectRatio = "16:9",
  generationMode = "image",
  videoProvider = "veo",
  siblingPromptTexts = [],
  onAssetTypeChange,
}) => {
  // Determine initial asset type from prompt or global setting
  const getInitialAssetType = (): AssetType => {
    if (prompt.assetType) return prompt.assetType;
    // For video mode, always use video_with_image (image → animate) for best quality
    if (generationMode === "video") {
      return "video_with_image";
    }
    return "image";
  };

  const [assetType, setAssetType] = useState<AssetType>(getInitialAssetType());
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPromptText, setCurrentPromptText] = useState(prompt.text);
  const [generationProgress, setGenerationProgress] = useState<string>("");

  // Update asset type when global settings change (only if not explicitly set on prompt)
  useEffect(() => {
    if (!prompt.assetType) {
      setAssetType(getInitialAssetType());
    }
  }, [generationMode, videoProvider]);

  const handleAssetTypeChange = (newType: AssetType) => {
    setAssetType(newType);
    onAssetTypeChange?.(prompt.id, newType);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setGenerationProgress("");

    try {
      let resultBase64: string;
      let baseImageUrl: string | undefined;
      let resultType: "image" | "video" = "image";

      if (assetType === "video") {
        // Direct video generation (Veo)
        setGenerationProgress("Generating video...");
        resultBase64 = await generateVideoFromPrompt(
          currentPromptText,
          style,
          globalSubject,
          aspectRatio as "16:9" | "9:16",
        );
        resultType = "video";
      } else if (assetType === "video_with_image") {
        // Three-step: Image first, generate motion prompt, then animate
        setGenerationProgress("Step 1/3: Generating base image...");

        // Check if we already have a base image to reuse
        let sourceImage =
          existingBaseImage ||
          (existingType === "image" ? existingImage : undefined);

        if (!sourceImage) {
          sourceImage = await generateImageFromPrompt(
            currentPromptText,
            style,
            globalSubject,
            aspectRatio,
          );
        }
        baseImageUrl = sourceImage;

        // Generate motion-optimized prompt
        setGenerationProgress("Step 2/3: Creating motion prompt...");
        const motionPrompt = await generateMotionPrompt(
          currentPromptText,
          prompt.mood || "cinematic",
          globalSubject,
        );

        // Animate the image using DeAPI with motion-focused prompt
        setGenerationProgress("Step 3/3: Animating image...");

        resultBase64 = await animateImageWithDeApi(
          sourceImage,
          motionPrompt,
          aspectRatio as "16:9" | "9:16" | "1:1",
        );
        resultType = "video";
      } else {
        // Standard image generation
        setGenerationProgress("Generating image...");
        resultBase64 = await generateImageFromPrompt(
          currentPromptText,
          style,
          globalSubject,
          aspectRatio,
        );
        resultType = "image";
      }

      onImageGenerated({
        promptId: prompt.id,
        imageUrl: resultBase64,
        type: resultType,
        baseImageUrl,
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate asset.");
    } finally {
      setLoading(false);
      setGenerationProgress("");
    }
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
  };

  const handleRegeneratePrompt = async () => {
    setRefining(true);
    setError(null);
    try {
      const { refinedPrompt } = await refineImagePrompt({
        promptText: currentPromptText,
        style,
        globalSubject,
        aspectRatio,
        intent: "auto",
        previousPrompts: siblingPromptTexts,
      });
      setCurrentPromptText(refinedPrompt);
    } catch (err) {
      setError("Failed to regenerate prompt.");
    } finally {
      setRefining(false);
    }
  };

  const handleCancelEdit = () => {
    setCurrentPromptText(prompt.text);
    setIsEditing(false);
  };

  const currentAssetOption = ASSET_TYPE_OPTIONS.find(
    (o) => o.value === assetType,
  )!;

  const getGenerateButtonLabel = () => {
    if (loading) return generationProgress || "Generating...";
    return assetType === "image" ? "Generate Image" : "Generate Video";
  };

  const getRegenerateButtonLabel = () => {
    return assetType === "image" ? "Regenerate" : "Regenerate";
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="h-full"
    >
      <Card className="group relative bg-card border-border overflow-hidden flex flex-col h-full hover:border-primary/50 transition-all shadow-lg hover:shadow-xl hover:shadow-primary/10">
        {/* Header / Badges */}
        <div className="absolute top-3 left-3 z-10 flex gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="bg-primary/20 text-primary-foreground border-primary/20 backdrop-blur-md font-medium uppercase tracking-wider hover:bg-primary/30"
          >
            {prompt.mood}
          </Badge>
          {prompt.timestamp && (
            <Badge
              variant="outline"
              className="bg-muted/90 text-muted-foreground border-border backdrop-blur-md flex items-center gap-1 hover:bg-muted"
            >
              <Clock size={10} />
              {prompt.timestamp}
            </Badge>
          )}
        </div>

        {/* Asset Type Selector - Top Right */}
        <div className="absolute top-3 right-3 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs bg-background/80 backdrop-blur-md border border-border hover:bg-muted gap-1"
                disabled={loading}
              >
                {currentAssetOption.icon}
                <span className="hidden sm:inline">
                  {currentAssetOption.label}
                </span>
                <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {ASSET_TYPE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => handleAssetTypeChange(option.value)}
                  className={cn(
                    "flex items-center gap-2 cursor-pointer",
                    assetType === option.value && "bg-primary/10",
                  )}
                >
                  <span className="text-muted-foreground">{option.icon}</span>
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </div>
                  {assetType === option.value && (
                    <Check size={14} className="ml-auto text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Media Area */}
        <div className="aspect-video bg-muted w-full relative overflow-hidden">
          {existingImage ? (
            existingType === "video" ? (
              <video
                src={existingImage}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={existingImage}
                alt={prompt.mood}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            )
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center bg-[url('/cubes.png')] bg-opacity-5">
              {loading ? (
                <>
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-2" />
                  <p className="text-sm">
                    {generationProgress || "Processing..."}
                  </p>
                </>
              ) : (
                <>
                  {assetType === "image" ? (
                    <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                  ) : (
                    <Film className="w-12 h-12 mb-2 opacity-20" />
                  )}
                  <p className="text-sm">No asset generated yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {currentAssetOption.description}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Show base image thumbnail for video_with_image */}
          {existingBaseImage && existingType === "video" && (
            <div className="absolute bottom-2 left-2 w-16 h-12 rounded border border-border overflow-hidden shadow-lg">
              <img
                src={existingBaseImage}
                alt="Base frame"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <ImageIcon size={12} className="text-white" />
              </div>
            </div>
          )}
        </div>

        {/* Prompt & Actions */}
        <CardContent className="p-4 flex flex-col grow">
          <div className="mb-4 relative group/text">
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={currentPromptText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCurrentPromptText(e.target.value)}
                  className="min-h-25 text-sm bg-muted border-input text-foreground focus:ring-primary"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={handleCancelEdit}
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  >
                    <X size={14} />
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-primary"
                  >
                    <Check size={14} />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-muted-foreground text-sm italic line-clamp-3 group-hover:line-clamp-none transition-all pr-6">
                  "{currentPromptText}"
                </p>
                {!loading && !existingImage && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="absolute top-0 right-0 p-1 text-muted-foreground hover:text-primary opacity-0 group-hover/text:opacity-100 transition-opacity"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-2">
            {error && (
              <div className="text-destructive text-xs bg-destructive/10 p-2 rounded border border-destructive/20">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 items-center flex-wrap">
              {existingImage ? (
                <>
                  <Button
                    onClick={handleRegeneratePrompt}
                    disabled={loading || refining || isEditing}
                    variant="secondary"
                    size="sm"
                    className="text-xs h-8 bg-secondary text-secondary-foreground hover:bg-muted"
                    title="Rewrite the prompt for better quality and consistency"
                  >
                    {refining ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="w-3 h-3 mr-2" />
                    )}
                    {refining ? "Refining..." : "Refine Prompt"}
                  </Button>

                  <Button
                    onClick={handleGenerate}
                    disabled={loading || refining}
                    variant="secondary"
                    size="sm"
                    className="text-xs h-8 bg-secondary text-secondary-foreground hover:bg-muted"
                  >
                    {loading ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-3 h-3 mr-2" />
                    )}
                    {loading ? "Generating..." : getRegenerateButtonLabel()}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    asChild
                    className="text-xs h-8"
                  >
                    <a
                      href={existingImage}
                      download={`lyric-art-${prompt.mood}.${existingType === "video" ? "mp4" : "png"}`}
                    >
                      <Download className="mr-2 h-3 w-3" />
                      Download
                    </a>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleRegeneratePrompt}
                    disabled={loading || refining || isEditing}
                    variant="secondary"
                    size="sm"
                    className="text-xs h-8 bg-secondary text-secondary-foreground hover:bg-muted"
                    title="Rewrite the prompt for better quality and consistency"
                  >
                    {refining ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="w-3 h-3 mr-2" />
                    )}
                    {refining ? "Refining..." : "Refine Prompt"}
                  </Button>

                  <Button
                    onClick={handleGenerate}
                    disabled={loading || refining || isEditing}
                    size="sm"
                    className="text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold border-0 shadow-lg shadow-primary/20"
                  >
                    {loading ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-2" />
                    ) : (
                      <Wand2 className="w-3 h-3 mr-2" />
                    )}
                    {getGenerateButtonLabel()}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});
