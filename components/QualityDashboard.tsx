/**
 * QualityDashboard Component
 * 
 * Displays detailed quality metrics and insights for video production.
 * Helps users understand and improve AI output quality.
 */

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Clock,
  FileText,
  Image as ImageIcon,
  Volume2,
  Music,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ProductionQualityReport,
  SceneQualityMetrics,
  getHistoricalAverages,
} from "@/services/qualityMonitorService";

interface QualityDashboardProps {
  report: ProductionQualityReport;
  isOpen: boolean;
  onClose: () => void;
}

// Score color helper
function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-green-500/20 border-green-500/30";
  if (score >= 60) return "bg-yellow-500/20 border-yellow-500/30";
  return "bg-red-500/20 border-red-500/30";
}

// Quality badge component
function QualityBadge({ quality }: { quality: "poor" | "fair" | "good" | "excellent" }) {
  const config = {
    poor: { color: "bg-red-500/20 text-red-400", label: "Poor" },
    fair: { color: "bg-yellow-500/20 text-yellow-400", label: "Fair" },
    good: { color: "bg-blue-500/20 text-blue-400", label: "Good" },
    excellent: { color: "bg-green-500/20 text-green-400", label: "Excellent" },
  };
  
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-medium", config[quality].color)}>
      {config[quality].label}
    </span>
  );
}

// Score ring component
function ScoreRing({ score, label, size = "md" }: { score: number; label: string; size?: "sm" | "md" | "lg" }) {
  const sizeConfig = {
    sm: { ring: 40, stroke: 4, text: "text-sm", label: "text-xs" },
    md: { ring: 60, stroke: 5, text: "text-xl", label: "text-xs" },
    lg: { ring: 80, stroke: 6, text: "text-2xl", label: "text-sm" },
  };
  
  const config = sizeConfig[size];
  const radius = (config.ring - config.stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: config.ring, height: config.ring }}>
        <svg className="transform -rotate-90" width={config.ring} height={config.ring}>
          <circle
            cx={config.ring / 2}
            cy={config.ring / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={config.stroke}
            fill="none"
            className="text-white/10"
          />
          <circle
            cx={config.ring / 2}
            cy={config.ring / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={config.stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={getScoreColor(score)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-bold", config.text, getScoreColor(score))}>{score}</span>
        </div>
      </div>
      <span className={cn("text-slate-400", config.label)}>{label}</span>
    </div>
  );
}

export function QualityDashboard({ report, isOpen, onClose }: QualityDashboardProps) {
  const [expandedScene, setExpandedScene] = React.useState<string | null>(null);
  const historicalAverages = useMemo(() => getHistoricalAverages(), []);
  
  if (!isOpen) return null;
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-[#12121a] border border-white/10 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <div>
                <h2 className="font-semibold">Quality Report</h2>
                <p className="text-xs text-slate-400">{report.title}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="overflow-y-auto max-h-[calc(90vh-60px)] p-4 space-y-6">
            {/* Overall Scores */}
            <div className="grid grid-cols-5 gap-4">
              <div className="col-span-1 flex justify-center">
                <ScoreRing score={report.overallScore} label="Overall" size="lg" />
              </div>
              <div className="col-span-4 grid grid-cols-4 gap-4">
                <ScoreRing score={report.contentScore} label="Content" />
                <ScoreRing score={report.timingScore} label="Timing" />
                <ScoreRing score={report.visualScore} label="Visual" />
                <ScoreRing score={report.audioScore} label="Audio" />
              </div>
            </div>
            
            {/* Historical Trend */}
            {historicalAverages && (
              <div className={cn(
                "p-3 rounded-lg border flex items-center justify-between",
                historicalAverages.trend === "improving" ? "bg-green-500/10 border-green-500/20" :
                historicalAverages.trend === "declining" ? "bg-red-500/10 border-red-500/20" :
                "bg-slate-500/10 border-slate-500/20"
              )}>
                <div className="flex items-center gap-2">
                  {historicalAverages.trend === "improving" && <TrendingUp className="w-4 h-4 text-green-400" />}
                  {historicalAverages.trend === "declining" && <TrendingDown className="w-4 h-4 text-red-400" />}
                  {historicalAverages.trend === "stable" && <Minus className="w-4 h-4 text-slate-400" />}
                  <span className="text-sm">
                    Quality trend: <span className="font-medium capitalize">{historicalAverages.trend}</span>
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  Avg: {Math.round(historicalAverages.avgOverall)}/100
                </span>
              </div>
            )}
            
            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-2 gap-4">
              {/* Strengths */}
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="font-medium text-green-400">Strengths</span>
                </div>
                {report.strengths.length > 0 ? (
                  <ul className="space-y-1">
                    {report.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-green-400 mt-1">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">No notable strengths identified</p>
                )}
              </div>
              
              {/* Weaknesses */}
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="font-medium text-red-400">Areas to Improve</span>
                </div>
                {report.weaknesses.length > 0 ? (
                  <ul className="space-y-1">
                    {report.weaknesses.map((w, i) => (
                      <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-red-400 mt-1">•</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">No major issues found</p>
                )}
              </div>
            </div>
            
            {/* Actionable Improvements */}
            {report.actionableImprovements.length > 0 && (
              <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-cyan-400" />
                  <span className="font-medium text-cyan-400">Suggestions to Improve</span>
                </div>
                <ul className="space-y-2">
                  {report.actionableImprovements.map((imp, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-cyan-400 font-bold">{i + 1}.</span>
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Technical Metrics */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-center">
                <Clock className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                <div className="text-lg font-bold">{report.avgWordsPerSecond.toFixed(1)}</div>
                <div className="text-xs text-slate-400">Words/sec</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-center">
                <FileText className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                <div className="text-lg font-bold">{report.avgSceneDuration.toFixed(0)}s</div>
                <div className="text-xs text-slate-400">Avg Scene</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-center">
                <Volume2 className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                <div className="text-lg font-bold">{Math.round(report.audioCoverage)}%</div>
                <div className="text-xs text-slate-400">Audio Coverage</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-center">
                <Music className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                <div className="text-lg font-bold">{Math.round(report.sfxCoverage)}%</div>
                <div className="text-xs text-slate-400">SFX Coverage</div>
              </div>
            </div>
            
            {/* Per-Scene Breakdown */}
            <div>
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                Scene-by-Scene Analysis
              </h3>
              <div className="space-y-2">
                {report.sceneMetrics.map((scene, index) => (
                  <div
                    key={scene.sceneId}
                    className="rounded-lg border border-white/10 bg-white/5 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedScene(expandedScene === scene.sceneId ? null : scene.sceneId)}
                      className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 w-6">{index + 1}</span>
                        <span className="font-medium text-sm">{scene.sceneName}</span>
                        <QualityBadge quality={scene.visualDescriptionQuality} />
                        {scene.issues.length > 0 && (
                          <span className="text-xs text-yellow-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {scene.issues.length}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-400">{scene.duration}s</span>
                        <span className={cn("text-sm font-medium", getScoreColor(scene.timingSync))}>
                          {scene.timingSync}%
                        </span>
                        {expandedScene === scene.sceneId ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>
                    
                    <AnimatePresence>
                      {expandedScene === scene.sceneId && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-white/10"
                        >
                          <div className="p-3 space-y-3">
                            {/* Scene metrics */}
                            <div className="grid grid-cols-4 gap-2 text-xs">
                              <div className="p-2 rounded bg-white/5">
                                <div className="text-slate-400">Visual</div>
                                <div className="font-medium">{scene.visualDescriptionLength} chars</div>
                              </div>
                              <div className="p-2 rounded bg-white/5">
                                <div className="text-slate-400">Narration</div>
                                <div className="font-medium">{scene.narrationWordCount} words</div>
                              </div>
                              <div className="p-2 rounded bg-white/5">
                                <div className="text-slate-400">Pacing</div>
                                <div className="font-medium">{scene.wordsPerSecond.toFixed(1)} w/s</div>
                              </div>
                              <div className="p-2 rounded bg-white/5">
                                <div className="text-slate-400">SFX</div>
                                <div className="font-medium flex items-center gap-1">
                                  {scene.hasSfx ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                                      {scene.hasAudioUrl ? "Loaded" : "Pending"}
                                    </>
                                  ) : (
                                    <span className="text-slate-500">None</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Issues */}
                            {scene.issues.length > 0 && (
                              <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                                <div className="text-xs text-yellow-400 font-medium mb-1">Issues:</div>
                                <ul className="text-xs text-slate-300 space-y-1">
                                  {scene.issues.map((issue, i) => (
                                    <li key={i}>• {issue}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
            
            {/* AI Performance */}
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <h3 className="font-medium mb-2 text-purple-400">AI Performance</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">Content Creativity:</span>
                  <span className={cn(
                    "ml-2 font-medium capitalize",
                    report.contentPlannerCreativity === "high" ? "text-green-400" :
                    report.contentPlannerCreativity === "medium" ? "text-yellow-400" : "text-red-400"
                  )}>
                    {report.contentPlannerCreativity}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">SFX Suggestion Accuracy:</span>
                  <span className={cn(
                    "ml-2 font-medium",
                    report.aiSfxAccuracy >= 80 ? "text-green-400" :
                    report.aiSfxAccuracy >= 50 ? "text-yellow-400" : "text-red-400"
                  )}>
                    {Math.round(report.aiSfxAccuracy)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default QualityDashboard;
