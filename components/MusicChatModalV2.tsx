/**
 * MusicChatModalV2 Component
 * 
 * Enhanced chat interface using MusicProducerAgentV2 with direct Suno API integration.
 * The agent can directly generate music after the conversation.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Send,
  Sparkles,
  Loader2,
  AlertCircle,
  Play,
  Pause,
  Check,
  Plus,
  MessageSquare,
  Bot,
  User,
  Coins,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  MusicProducerAgentV2,
  createMusicProducerAgentV2,
  type PendingToolCall,
} from "@/services/musicProducerAgentV2";
import { getCredits, getTaskStatus, type SunoGeneratedTrack } from "@/services/sunoService";

interface MusicChatModalV2Props {
  open: boolean;
  onClose: () => void;
  onMusicGenerated?: (track: SunoGeneratedTrack) => void;
  initialPrompt?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isGenerating?: boolean;
}

type ModalPhase = "chatting" | "confirming" | "generating" | "complete";

export function MusicChatModalV2({
  open,
  onClose,
  onMusicGenerated,
  initialPrompt = "",
}: MusicChatModalV2Props) {
  // Agent instance
  const agentRef = useRef<MusicProducerAgentV2 | null>(null);

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [phase, setPhase] = useState<ModalPhase>("chatting");
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generation state
  const [taskId, setTaskId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedTracks, setGeneratedTracks] = useState<SunoGeneratedTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  // Confirmation state (human-in-the-loop)
  const [pendingAction, setPendingAction] = useState<PendingToolCall | null>(null);

  // Audio playback
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize on open
  useEffect(() => {
    if (open) {
      agentRef.current = createMusicProducerAgentV2({
        onTaskStarted: (id) => {
          setTaskId(id);
          setPhase("generating");
        },
      });

      setMessages([{
        role: "assistant",
        content: "مرحباً! 🎵 I'm your AI music producer. Tell me about the song you want to create - what genre, mood, language, or style are you going for?\n\nI specialize in Arabic/Khaliji music but can create any genre!",
      }]);
      setInputValue(initialPrompt);
      setPhase("chatting");
      setError(null);
      setTaskId(null);
      setGeneratedTracks([]);
      setGenerationProgress(0);

      // Fetch credits
      fetchCredits();
    }
  }, [open, initialPrompt]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Poll for completion when generating
  useEffect(() => {
    if (phase !== "generating" || !taskId) return;

    let cancelled = false;
    const pollInterval = 10000; // 10 seconds between polls
    let elapsed = 0;
    const maxWait = 10 * 60 * 1000; // 10 minutes total

    const poll = async () => {
      if (cancelled) return;

      try {
        // Update progress based on elapsed time
        elapsed += pollInterval;
        const progress = Math.min(90, (elapsed / maxWait) * 100 + 10);
        setGenerationProgress(progress);

        // Check if we've exceeded max wait time
        if (elapsed >= maxWait) {
          throw new Error("Music generation timed out. Please try again.");
        }

        // Use getTaskStatus for individual status checks instead of waitForCompletion
        const result = await getTaskStatus(taskId);

        if (cancelled) return;

        const tracks = result.tracks;
        if (result.status === "SUCCESS" && tracks && tracks.length > 0) {
          const firstTrack = tracks[0];
          if (firstTrack) {
            setGeneratedTracks(tracks);
            setSelectedTrackId(firstTrack.id);
            setGenerationProgress(100);
            setPhase("complete");

            // Add completion message
            setMessages(prev => [...prev, {
              role: "assistant",
              content: `🎉 Your song is ready! I've generated ${tracks.length} variation${tracks.length > 1 ? 's' : ''} for you. Listen and pick your favorite!`,
            }]);
          }
        } else if (result.status === "FAILED") {
          throw new Error(result.errorMessage || "Music generation failed");
        } else {
          // Still PENDING or PROCESSING - continue polling
          console.log(`[MusicChatV2] Status: ${result.status}, elapsed: ${elapsed / 1000}s`);
          setTimeout(poll, pollInterval);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Generation failed");
          setPhase("chatting");
        }
      }
    };

    // Start polling after initial delay
    const timer = setTimeout(poll, pollInterval);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, taskId]);

  // Cleanup audio
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.src = "";
      }
    };
  }, [audioElement]);

  const fetchCredits = async () => {
    try {
      const result = await getCredits();
      if (result.credits >= 0) {
        setCredits(result.credits);
      }
    } catch {
      // Ignore
    }
  };

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isThinking || !agentRef.current) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setError(null);

    // Add user message
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsThinking(true);

    try {
      const response = await agentRef.current.chat(userMessage);

      if (response.type === "error") {
        setError(response.error || response.message);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: response.message
        }]);
      } else if (response.type === "confirmation_required") {
        // Show confirmation UI
        console.log("[MusicChatV2] Received confirmation_required:", {
          message: response.message,
          pendingAction: response.pendingAction,
        });
        setMessages(prev => [...prev, {
          role: "assistant",
          content: response.message
        }]);
        setPendingAction(response.pendingAction || null);
        setPhase("confirming");
        console.log("[MusicChatV2] Set phase to confirming");
      } else if (response.type === "generating") {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: response.message,
          isGenerating: true,
        }]);
        // Phase change handled by callback
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: response.message
        }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsThinking(false);
    }
  }, [inputValue, isThinking]);

  const handlePlayTrack = useCallback((track: SunoGeneratedTrack) => {
    if (playingTrackId === track.id) {
      audioElement?.pause();
      setPlayingTrackId(null);
    } else {
      if (audioElement) audioElement.pause();
      const audio = new Audio(track.audio_url);
      audio.onended = () => setPlayingTrackId(null);
      audio.play();
      setAudioElement(audio);
      setPlayingTrackId(track.id);
    }
  }, [playingTrackId, audioElement]);

  const handleAddToTimeline = useCallback(() => {
    const track = generatedTracks.find(t => t.id === selectedTrackId);
    if (track && onMusicGenerated) {
      onMusicGenerated(track);
    }
    onClose();
  }, [generatedTracks, selectedTrackId, onMusicGenerated, onClose]);

  const handleReset = useCallback(() => {
    agentRef.current = createMusicProducerAgentV2();
    setMessages([{
      role: "assistant",
      content: "Let's create something new! 🎵 What kind of music would you like?",
    }]);
    setPhase("chatting");
    setTaskId(null);
    setGeneratedTracks([]);
    setPendingAction(null);
    setError(null);
  }, []);

  // Handle user confirming the pending action
  const handleConfirm = useCallback(async () => {
    if (!agentRef.current) return;

    setIsThinking(true);
    setError(null);

    try {
      const response = await agentRef.current.confirmAndExecute();

      if (response.type === "error") {
        setError(response.error || response.message);
        setPhase("chatting");
      } else if (response.type === "generating") {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: response.message,
          isGenerating: true,
        }]);
        // Phase change handled by callback (onTaskStarted)
      }

      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
      setPhase("chatting");
    } finally {
      setIsThinking(false);
    }
  }, []);

  // Handle user cancelling the pending action
  const handleCancelConfirmation = useCallback(async () => {
    if (!agentRef.current) return;

    agentRef.current.cancelPendingAction();
    setPendingAction(null);
    setPhase("chatting");

    // Get the agent to respond to the cancellation
    setIsThinking(true);
    try {
      const response = await agentRef.current.chat("I want to change something before generating.");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: response.message
      }]);
    } catch {
      // Ignore
    } finally {
      setIsThinking(false);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && phase !== "generating" && phase !== "confirming" && onClose()}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl bg-background border-border text-foreground max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MessageSquare className="w-5 h-5 text-cyan-400" />
            AI Music Producer
            {credits !== null && credits >= 0 && (
              <span className={cn(
                "ml-auto text-sm font-normal flex items-center gap-1.5",
                credits < 10 ? "text-amber-500" : "text-muted-foreground"
              )}>
                <Coins className="w-3.5 h-3.5" />
                {credits} credits
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Chat with AI to create your perfect song. I'll handle everything from lyrics to generation.
          </DialogDescription>
        </DialogHeader>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-[300px] max-h-[400px]">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                )}
              >
                {msg.content}
                {msg.isGenerating && (
                  <div className="mt-2 flex items-center gap-2 text-cyan-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="text-xs">Generating...</span>
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Confirmation UI (Human-in-the-Loop) */}
        {phase === "confirming" && pendingAction && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-cyan-400 mb-2">Ready to generate your song!</p>
                <div className="bg-background/50 rounded-md p-3 text-sm whitespace-pre-wrap font-mono">
                  {pendingAction.summary}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelConfirmation}
                disabled={isThinking}
              >
                Modify
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={isThinking}
                className="bg-cyan-500 hover:bg-cyan-600"
              >
                {isThinking ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Generate Now
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Generation Progress */}
        {phase === "generating" && (
          <div className="space-y-2 py-2">
            <div className="flex justify-between text-xs">
              <span className="text-cyan-400 font-medium flex items-center gap-2">
                <Sparkles className="w-3 h-3 animate-pulse" />
                Creating your song...
              </span>
              <span className="text-muted-foreground">{Math.round(generationProgress)}%</span>
            </div>
            <Progress value={generationProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              This usually takes 2-4 minutes. The AI is composing your music!
            </p>
          </div>
        )}

        {/* Generated Tracks */}
        {phase === "complete" && generatedTracks.length > 0 && (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-muted-foreground">Your Generated Tracks</p>
            <div className="space-y-2">
              {generatedTracks.map((track) => (
                <div
                  key={track.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
                    selectedTrackId === track.id
                      ? "border-cyan-500 bg-cyan-500/10"
                      : "border-border bg-card hover:border-cyan-500/50"
                  )}
                  onClick={() => setSelectedTrackId(track.id)}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={(e) => { e.stopPropagation(); handlePlayTrack(track); }}
                  >
                    {playingTrackId === track.id ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </Button>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {track.style && `${track.style} • `}
                      {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, "0")}
                    </p>
                  </div>
                  {selectedTrackId === track.id && <Check className="w-5 h-5 text-cyan-400 shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input - hidden during confirmation and generation */}
        {(phase === "chatting") && (
          <div className="shrink-0 pt-2 border-t border-border">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Describe your music..."
                className="flex-1"
                disabled={isThinking}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              />
              <Button onClick={handleSend} disabled={!inputValue.trim() || isThinking} className="bg-cyan-500 hover:bg-cyan-600">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 pt-2">
          {phase === "chatting" && (
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          )}

          {phase === "confirming" && (
            <Button variant="ghost" onClick={onClose} disabled={isThinking}>Cancel</Button>
          )}

          {phase === "generating" && (
            <Button variant="ghost" disabled>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </Button>
          )}

          {phase === "complete" && (
            <>
              <Button variant="ghost" onClick={handleReset}>Create Another</Button>
              <Button onClick={handleAddToTimeline} disabled={!selectedTrackId} className="bg-cyan-500 hover:bg-cyan-600">
                <Plus className="w-4 h-4 mr-2" />
                Add to Timeline
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MusicChatModalV2;
