import React, { useRef, useEffect, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Activity,
  Circle,
  Waves,
  Sparkles,
} from "lucide-react";
import { SubtitleItem } from "../types";
import { Button } from "@/components/ui/button";
import { cn, isRTL } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface TimelinePlayerProps {
  audioUrl: string;
  subtitles: SubtitleItem[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
  /** Content mode - "music" shows visualizer, "story" hides it */
  contentMode?: "music" | "story";
}

type VisualizerMode = "bars" | "circular" | "wave" | "particles";

class ParticleSystem {
  particles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
  }[] = [];

  update(width: number, height: number, bassEnergy: number) {
    if (bassEnergy > 230) {
      const count = Math.floor(bassEnergy / 20);
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: width / 2,
          y: height / 2,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          life: 1.0,
          color: `hsl(${Math.random() * 60 + 180}, 100%, 70%)`,
          size: Math.random() * 4 + 1,
        });
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      p.size *= 0.95;

      if (p.life <= 0 || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = "lighter";
    this.particles.forEach((p) => {
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
  }
}

export const TimelinePlayer: React.FC<TimelinePlayerProps> = ({
  audioUrl,
  subtitles,
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
  onTimeUpdate,
  onDurationChange,
  onEnded,
  contentMode = "music",
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);

  const [waveformBuffer, setWaveformBuffer] = useState<AudioBuffer | null>(
    null,
  );
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>("wave");

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const particleSystemRef = useRef<ParticleSystem>(new ParticleSystem());

  // Only enable visualizer for music mode
  const showVisualizer = contentMode === "music";

  useEffect(() => {
    // Skip visualizer setup for story mode
    if (!showVisualizer) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    // Defer AudioContext initialization to avoid blocking the click handler
    const timeoutId = setTimeout(() => {
      const initAudioContext = () => {
        if (!audioRef.current) return;

        if (!audioContextRef.current) {
          audioContextRef.current = new (
            window.AudioContext || (window as any).webkitAudioContext
          )();
        }

        const ctx = audioContextRef.current;

        if (!sourceRef.current) {
          try {
            const source = ctx.createMediaElementSource(audioRef.current);
            sourceRef.current = source;
            const analyser = ctx.createAnalyser();
            analyserRef.current = analyser;
            
            analyser.fftSize = visualizerMode === "wave" ? 2048 : 256;
            analyser.smoothingTimeConstant = 0.8;

            source.connect(analyser);
            analyser.connect(ctx.destination);
          } catch (e) {
            console.warn("AudioContext already connected");
          }
        }

        if (analyserRef.current) {
          analyserRef.current.fftSize =
            visualizerMode === "circular"
              ? 512
              : visualizerMode === "wave"
                ? 2048
                : 256;
        }

        if (ctx.state === "suspended") {
          ctx.resume();
        }

        startRenderLoop();
      };

      initAudioContext();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, visualizerMode, showVisualizer]);

  const startRenderLoop = () => {
    const canvas = visualizerCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      switch (visualizerMode) {
        case "circular":
          drawCircular(ctx, width, height, dataArray, bufferLength);
          break;
        case "wave":
          drawWave(ctx, width, height, dataArray, bufferLength);
          break;
        case "particles":
          drawParticles(ctx, width, height, dataArray, bufferLength);
          break;
        default:
          drawBars(ctx, width, height, dataArray, bufferLength);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();
  };

  const drawBars = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    data: Uint8Array,
    len: number,
  ) => {
    const barWidth = (w / len) * 2.5;
    let x = 0;

    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, "rgba(34, 211, 238, 0.1)");
    gradient.addColorStop(0.5, "rgba(34, 211, 238, 0.8)");
    gradient.addColorStop(1, "rgba(167, 139, 250, 0.9)");

    ctx.fillStyle = gradient;

    for (let i = 0; i < len / 2; i++) {
      const val = data[i] ?? 0;
      const barHeight = (val / 255) * h;
      const centerX = w / 2;
      const offset = i * (barWidth + 1);

      ctx.fillRect(centerX + offset, h - barHeight, barWidth, barHeight);
      ctx.fillRect(
        centerX - offset - barWidth,
        h - barHeight,
        barWidth,
        barHeight,
      );

      x += barWidth + 1;
      if (x > w) break;
    }
  };

  const drawCircular = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    data: Uint8Array,
    len: number,
  ) => {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.3;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#22d3ee";

    const angleStep = (Math.PI * 2) / len;

    ctx.strokeStyle = "rgba(34, 211, 238, 0.8)";
    ctx.beginPath();
    for (let i = 0; i < len; i += 2) {
      const value = data[i] ?? 0;
      const barHeight = (value / 255) * radius * 0.8;
      const angle = i * angleStep - Math.PI / 2;

      const xStart = cx + Math.cos(angle) * radius;
      const yStart = cy + Math.sin(angle) * radius;
      const xEnd = cx + Math.cos(angle) * (radius + barHeight);
      const yEnd = cy + Math.sin(angle) * (radius + barHeight);

      ctx.moveTo(xStart, yStart);
      ctx.lineTo(xEnd, yEnd);
    }
    ctx.stroke();

    ctx.shadowBlur = 5;
    ctx.shadowColor = "#a78bfa";
    ctx.beginPath();
    for (let i = 0; i < len; i += 4) {
      const value = data[len - i - 1] ?? 0;
      const barHeight = (value / 255) * radius * 0.5;

      const angle = i * angleStep - Math.PI / 2;

      const rOuter = radius * 0.6;
      const xStart = cx + Math.cos(angle) * (rOuter - barHeight);
      const yStart = cy + Math.sin(angle) * (rOuter - barHeight);
      const xEnd = cx + Math.cos(angle) * rOuter;
      const yEnd = cy + Math.sin(angle) * rOuter;

      ctx.moveTo(xStart, yStart);
      ctx.lineTo(xEnd, yEnd);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  const drawWave = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    data: Uint8Array,
    len: number,
  ) => {
    ctx.lineWidth = 3;
    const gradient = ctx.createLinearGradient(0, h, 0, h / 2);
    gradient.addColorStop(0, "rgba(34, 211, 238, 0.0)");
    gradient.addColorStop(0.5, "rgba(34, 211, 238, 0.2)");
    gradient.addColorStop(1, "rgba(167, 139, 250, 0.4)");

    const strokeGradient = ctx.createLinearGradient(0, 0, w, 0);
    strokeGradient.addColorStop(0, "#22d3ee");
    strokeGradient.addColorStop(0.5, "#a78bfa");
    strokeGradient.addColorStop(1, "#22d3ee");

    const sliceWidth = w / (len / 3);
    let x = 0;

    ctx.beginPath();
    ctx.moveTo(0, h);

    let lastX = 0;
    let lastY = h;

    const step = 2;
    for (let i = 0; i < len / 3; i += step) {
      const value = data[i] ?? 0;
      const percent = value / 255;
      const y = h - percent * h * 0.6 - 20;

      const nextX = i * sliceWidth * step;
      const xc = (lastX + (x + sliceWidth * step)) / 2;
      const yc = (lastY + y) / 2;

      ctx.quadraticCurveTo(lastX, lastY, xc, yc);

      lastX = x + sliceWidth * step;
      lastY = y;
      x += sliceWidth * step;
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = strokeGradient;
    ctx.stroke();
  };

  const drawParticles = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    data: Uint8Array,
    _len: number,
  ) => {
    const bassEnergy = data.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    if (bassEnergy > 200) {
      ctx.fillStyle = `rgba(34, 211, 238, ${0.05 + (bassEnergy / 255) * 0.05})`;
      ctx.fillRect(0, 0, w, h);
    }
    const radius = 50 + (bassEnergy / 255) * 30;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(167, 139, 250, 0.2)";
    ctx.fill();
    particleSystemRef.current.update(w, h, bassEnergy);
    particleSystemRef.current.draw(ctx);
  };

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch((e) => console.error("Play error:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Sync audio element to currentTime prop when it changes externally (e.g., scene selection)
  // Using a smaller threshold (0.1s) to ensure accurate seeking when clicking thumbnails
  useEffect(() => {
    if (
      audioRef.current &&
      Math.abs(audioRef.current.currentTime - currentTime) > 0.1
    ) {
      audioRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  useEffect(() => {
    const loadAudioData = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
        setWaveformBuffer(decodedBuffer);
      } catch (error) {
        console.error("Failed to load audio waveform", error);
      }
    };
    loadAudioData();
  }, [audioUrl]);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !waveformBuffer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }
    const width = canvas.width;
    const height = canvas.height;
    const data = waveformBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#334155";
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j] ?? 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const barHeight = (max - min) * amp;
      const y = (1 + min) * amp;
      ctx.fillRect(i, y, 1, Math.max(1, barHeight));
    }
  }, [waveformBuffer]);

  const handleSeek = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    if (progressBarRef.current && duration > 0) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
      const x = clientX - rect.left;
      const percentage = Math.min(Math.max(x / rect.width, 0), 1);
      const newTime = percentage * duration;
      onSeek(newTime);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const activeSubtitle = subtitles.find(
    (s) => currentTime >= s.startTime && currentTime <= s.endTime,
  );

  let karaokeStyle: React.CSSProperties = {};
  const isActiveSubtitleRTL = activeSubtitle
    ? isRTL(activeSubtitle.text)
    : false;
  const isActiveTranslationRTL = activeSubtitle?.translation
    ? isRTL(activeSubtitle.translation)
    : false;

  if (activeSubtitle) {
    const totalDuration = activeSubtitle.endTime - activeSubtitle.startTime;
    const progress = Math.max(
      0,
      Math.min(1, (currentTime - activeSubtitle.startTime) / totalDuration),
    );
    const percent = Math.floor(progress * 100);
    // For RTL languages, reverse the gradient direction (270deg instead of 90deg)
    const gradientDirection = isActiveSubtitleRTL ? "270deg" : "90deg";
    karaokeStyle = {
      backgroundImage: `linear-gradient(${gradientDirection}, #22d3ee ${percent}%, #94a3b8 ${percent}%)`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      color: "transparent",
      direction: isActiveSubtitleRTL ? "rtl" : "ltr",
      unicodeBidi: "isolate",
    };
  }

  const visuals = [
    { id: "wave", icon: Waves, label: "Fluid" },
    { id: "circular", icon: Circle, label: "Radial" },
    { id: "particles", icon: Sparkles, label: "Particles" },
    { id: "bars", icon: Activity, label: "Bars" },
  ];

  return (
    <Card className="flex flex-col gap-4 bg-card border-border p-6 shadow-xl backdrop-blur-sm">
      <audio
        ref={audioRef}
        src={audioUrl}
        crossOrigin="anonymous"
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
        onEnded={onEnded}
      />

      <div className="aspect-video w-full flex items-center justify-center text-center p-8 bg-black rounded-xl border border-border relative overflow-hidden group">
        {/* Only render visualizer canvas in music mode */}
        {showVisualizer && (
          <canvas
            ref={visualizerCanvasRef}
            className="absolute inset-0 w-full h-full opacity-60 z-0 pointer-events-none"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background/90 via-transparent to-background/40 z-1 pointer-events-none"></div>

        {/* Only show visualizer controls in music mode */}
        {showVisualizer && (
          <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {visuals.map((v) => (
              <Button
                key={v.id}
                variant="outline"
                size="icon"
                onClick={() => setVisualizerMode(v.id as VisualizerMode)}
                className={cn(
                  "h-8 w-8 hover:bg-muted",
                  visualizerMode === v.id
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-black/40 border-border text-muted-foreground",
                )}
                title={v.label}
              >
                <v.icon size={16} />
              </Button>
            ))}
          </div>
        )}

        {/* Subtitles - positioned at bottom */}
        <div className="absolute bottom-6 left-4 right-4 z-10 flex flex-col items-center">
          {activeSubtitle ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[90%]">
              {/* Slim background bar that fits the text */}
              <div
                className="inline-block px-4 py-2 rounded-lg"
                style={{
                  background: "rgba(0, 0, 0, 0.75)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <p
                  className="text-lg md:text-xl lg:text-2xl font-semibold leading-snug"
                  style={{
                    direction: isActiveSubtitleRTL ? "rtl" : "ltr",
                    textAlign: "center",
                    color: "#ffffff",
                    textShadow: "1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8)",
                  }}
                >
                  <span
                    style={karaokeStyle}
                    className="transition-all duration-75"
                  >
                    {activeSubtitle.text}
                  </span>
                </p>
              </div>
              {activeSubtitle.translation && (
                <div
                  className="inline-block px-3 py-1 rounded-md mt-1"
                  style={{
                    background: "rgba(0, 0, 0, 0.6)",
                  }}
                >
                  <p
                    className="text-sm md:text-base text-cyan-300 font-medium"
                    style={{
                      direction: isActiveTranslationRTL ? "rtl" : "ltr",
                      textAlign: "center",
                      unicodeBidi: "isolate",
                      textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
                    }}
                  >
                    {activeSubtitle.translation}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 opacity-30">
              <div className="w-12 h-1 bg-muted-foreground rounded-full animate-pulse"></div>
              <div className="w-24 h-1 bg-muted-foreground rounded-full animate-pulse delay-75"></div>
            </div>
          )}
        </div>

        {/* Center content for music mode visualizer */}
        {showVisualizer && !activeSubtitle && (
          <div className="relative z-5 max-w-3xl flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 opacity-30">
              <div className="w-12 h-1 bg-muted-foreground rounded-full animate-pulse"></div>
              <div className="w-24 h-1 bg-muted-foreground rounded-full animate-pulse delay-75"></div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <div
          ref={progressBarRef}
          className="relative h-16 bg-muted/20 rounded-lg cursor-pointer group overflow-hidden border border-border/50"
          onClick={handleSeek}
          onTouchStart={handleSeek}
          onTouchMove={handleSeek}
          style={{ touchAction: "none" }}
        >
          <canvas
            ref={waveformCanvasRef}
            className="absolute inset-0 w-full h-full opacity-60"
          />

          <div className="absolute inset-0 w-full h-full">
            {subtitles.map((sub) => {
              const left = (sub.startTime / duration) * 100;
              const width = ((sub.endTime - sub.startTime) / duration) * 100;
              const isActive =
                currentTime >= sub.startTime && currentTime <= sub.endTime;

              return (
                <div
                  key={sub.id}
                  className={`absolute bottom-0 h-3 rounded-t-sm transition-all duration-200 pointer-events-none border-x border-background/20
                    ${isActive
                      ? "bg-primary z-10 h-4 shadow-[0_0_15px_rgba(34,211,238,0.6)]"
                      : "bg-accent hover:bg-accent/80 h-3"
                    }
                  `}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.2)}%`,
                  }}
                />
              );
            })}
          </div>

          <div
            className="absolute top-0 h-full bg-primary/20 pointer-events-none"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />

          <div
            className="absolute top-0 w-0.5 h-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.8)] z-20 pointer-events-none"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="font-mono text-xs text-muted-foreground tabular-nums w-24">
            {formatTime(currentTime)}
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSeek(0)}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="Reset to beginning"
            >
              <RotateCcw size={16} />
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={onPlayPause}
              className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-primary/30 border border-primary/20 p-0"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause size={24} fill="currentColor" />
              ) : (
                <Play size={24} fill="currentColor" className="ml-1" />
              )}
            </Button>
          </div>

          <span className="font-mono text-xs text-muted-foreground tabular-nums w-24 text-right">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </Card>
  );
};
