/**
 * Quality Monitor Service
 * 
 * Tracks and analyzes video production quality metrics.
 * Provides insights for improving AI output and user experience.
 */

import { ContentPlan, Scene, NarrationSegment, ValidationResult } from "../types";
import { VideoSFXPlan } from "./sfxService";
import { VideoPurpose } from "../constants";

// --- Quality Metrics Types ---

export interface SceneQualityMetrics {
  sceneId: string;
  sceneName: string;
  
  // Timing metrics
  duration: number;
  narrationDuration: number | null;
  timingSync: number; // 0-100, how well narration matches scene duration
  wordsPerSecond: number;
  
  // Content metrics
  visualDescriptionLength: number;
  visualDescriptionQuality: "poor" | "fair" | "good" | "excellent";
  narrationWordCount: number;
  narrationQuality: "poor" | "fair" | "good" | "excellent";
  
  // SFX metrics
  hasSfx: boolean;
  sfxRelevance: number; // 0-100, how relevant the SFX is to scene
  hasAudioUrl: boolean;
  
  // Issues
  issues: string[];
  suggestions: string[];
}

export interface ProductionQualityReport {
  // Overall scores
  overallScore: number; // 0-100
  contentScore: number;
  timingScore: number;
  visualScore: number;
  audioScore: number;
  
  // Metadata
  title: string;
  videoPurpose: VideoPurpose;
  totalDuration: number;
  sceneCount: number;
  timestamp: Date;
  
  // Per-scene breakdown
  sceneMetrics: SceneQualityMetrics[];
  
  // Aggregated insights
  strengths: string[];
  weaknesses: string[];
  actionableImprovements: string[];
  
  // Technical metrics
  avgWordsPerSecond: number;
  avgSceneDuration: number;
  visualCoverage: number; // % of scenes with visuals
  audioCoverage: number; // % of scenes with narration
  sfxCoverage: number; // % of scenes with SFX
  
  // AI performance metrics
  aiSfxAccuracy: number; // % of AI-suggested SFX that were valid
  contentPlannerCreativity: "low" | "medium" | "high";
}

// --- Quality Analysis Functions ---

/**
 * Analyze visual description quality based on specificity and length.
 */
function analyzeVisualDescription(description: string): {
  quality: "poor" | "fair" | "good" | "excellent";
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 50;
  
  const length = description.length;
  const words = description.split(/\s+/).length;
  
  // Length scoring
  if (length < 30) {
    score -= 20;
    issues.push("Visual description too short - add more detail");
  } else if (length >= 80 && length <= 180) {
    score += 20;
  } else if (length > 200) {
    score -= 10;
    issues.push("Visual description may be truncated");
  }
  
  // Check for concrete visual elements
  const concreteKeywords = /color|light|shadow|close-up|wide shot|background|foreground|texture|movement|expression/i;
  if (concreteKeywords.test(description)) {
    score += 15;
  } else {
    issues.push("Add concrete visual elements (lighting, camera angle, colors)");
  }
  
  // Check for abstract/vague language
  const vagueKeywords = /beautiful|amazing|wonderful|nice|good|great|interesting/i;
  if (vagueKeywords.test(description)) {
    score -= 10;
    issues.push("Replace vague adjectives with specific visual details");
  }
  
  // Check for action/movement
  const actionKeywords = /moving|walking|running|flowing|rising|falling|spinning|floating/i;
  if (actionKeywords.test(description)) {
    score += 10;
  }
  
  score = Math.max(0, Math.min(100, score));
  
  const quality = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor";
  
  return { quality, score, issues };
}

/**
 * Analyze narration quality based on pacing and engagement.
 */
function analyzeNarration(script: string, duration: number): {
  quality: "poor" | "fair" | "good" | "excellent";
  score: number;
  wordsPerSecond: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 50;
  
  const words = script.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const wordsPerSecond = wordCount / duration;
  
  // Ideal speaking rate is 2.0-2.8 words/second
  if (wordsPerSecond < 1.5) {
    score -= 15;
    issues.push("Narration too sparse - add more content or reduce scene duration");
  } else if (wordsPerSecond > 3.2) {
    score -= 20;
    issues.push("Narration too dense - reduce words or increase scene duration");
  } else if (wordsPerSecond >= 2.0 && wordsPerSecond <= 2.8) {
    score += 20;
  }
  
  // Check for sentence variety
  const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = wordCount / Math.max(1, sentences.length);
  
  if (avgSentenceLength > 25) {
    score -= 10;
    issues.push("Sentences too long - break into shorter, punchier phrases");
  } else if (avgSentenceLength < 5) {
    score -= 5;
    issues.push("Sentences very short - consider combining for better flow");
  }
  
  // Check for engagement markers
  const engagementMarkers = /imagine|discover|witness|experience|journey|secret|reveal|transform/i;
  if (engagementMarkers.test(script)) {
    score += 15;
  }
  
  // Check for questions (engagement technique)
  if (/\?/.test(script)) {
    score += 5;
  }
  
  score = Math.max(0, Math.min(100, score));
  
  const quality = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor";
  
  return { quality, score, wordsPerSecond, issues };
}

/**
 * Analyze SFX relevance to scene content.
 */
function analyzeSfxRelevance(
  scene: Scene,
  sfxId: string | null,
  sfxName: string | null
): { relevance: number; issues: string[] } {
  if (!sfxId || !sfxName) {
    return { relevance: 0, issues: ["No SFX assigned to scene"] };
  }
  
  const issues: string[] = [];
  let relevance = 50;
  
  const sceneText = `${scene.visualDescription} ${scene.narrationScript} ${scene.name}`.toLowerCase();
  
  // Check keyword matches
  const sfxKeywordMap: Record<string, string[]> = {
    "desert-wind": ["desert", "sand", "dune", "sahara", "dry", "wind"],
    "desert-night": ["desert", "night", "stars", "quiet", "peaceful"],
    "ocean-waves": ["ocean", "sea", "beach", "wave", "water", "coast"],
    "forest-ambience": ["forest", "tree", "bird", "nature", "wood"],
    "rain-gentle": ["rain", "storm", "water", "cozy"],
    "thunderstorm": ["storm", "thunder", "lightning", "dramatic"],
    "city-traffic": ["city", "urban", "traffic", "street", "car"],
    "cafe-ambience": ["cafe", "coffee", "restaurant", "social"],
    "marketplace": ["market", "bazaar", "souk", "crowd", "vendor"],
    "eerie-ambience": ["horror", "scary", "ghost", "haunted", "dark", "eerie"],
    "mystical-drone": ["magic", "mystical", "fantasy", "ethereal", "ancient"],
    "whispers": ["ghost", "spirit", "whisper", "supernatural"],
    "heartbeat": ["tension", "suspense", "fear", "anxiety"],
    "tension-drone": ["tension", "suspense", "thriller", "dark"],
    "hopeful-pad": ["hope", "positive", "uplifting", "inspiring"],
    "epic-strings": ["epic", "dramatic", "emotional", "powerful"],
    "middle-eastern": ["arabic", "middle east", "oriental", "desert", "arabian"],
  };
  
  const keywords = sfxKeywordMap[sfxId] || [];
  const matches = keywords.filter(kw => sceneText.includes(kw));
  
  if (matches.length >= 2) {
    relevance = 90;
  } else if (matches.length === 1) {
    relevance = 70;
  } else {
    relevance = 40;
    issues.push(`SFX "${sfxName}" may not match scene content well`);
  }
  
  return { relevance, issues };
}

/**
 * Generate a comprehensive quality report for a production.
 */
export function generateQualityReport(
  contentPlan: ContentPlan,
  narrationSegments: NarrationSegment[],
  sfxPlan: VideoSFXPlan | null,
  validation: ValidationResult | null,
  videoPurpose: VideoPurpose
): ProductionQualityReport {
  const sceneMetrics: SceneQualityMetrics[] = [];
  
  let totalTimingScore = 0;
  let totalVisualScore = 0;
  let totalNarrationScore = 0;
  let totalSfxRelevance = 0;
  let totalWordsPerSecond = 0;
  let scenesWithSfx = 0;
  let scenesWithAudio = 0;
  let aiSfxValid = 0;
  let aiSfxTotal = 0;
  
  const allIssues: string[] = [];
  const allSuggestions: string[] = [];
  
  // Analyze each scene
  contentPlan.scenes.forEach((scene, index) => {
    const narration = narrationSegments.find(n => n.sceneId === scene.id);
    const sfxScene = sfxPlan?.scenes.find(s => s.sceneId === scene.id);
    
    // Visual analysis
    const visualAnalysis = analyzeVisualDescription(scene.visualDescription);
    totalVisualScore += visualAnalysis.score;
    
    // Narration analysis
    const narrationAnalysis = analyzeNarration(scene.narrationScript, scene.duration);
    totalNarrationScore += narrationAnalysis.score;
    totalWordsPerSecond += narrationAnalysis.wordsPerSecond;
    
    // Timing sync
    let timingSync = 100;
    if (narration) {
      scenesWithAudio++;
      const diff = Math.abs(narration.audioDuration - scene.duration);
      timingSync = Math.max(0, 100 - (diff * 10));
    }
    totalTimingScore += timingSync;
    
    // SFX analysis
    let sfxRelevance = 0;
    let hasSfx = false;
    let hasAudioUrl = false;
    const sfxIssues: string[] = [];
    
    if (sfxScene?.ambientTrack) {
      hasSfx = true;
      scenesWithSfx++;
      hasAudioUrl = !!sfxScene.ambientTrack.audioUrl;
      
      const sfxAnalysis = analyzeSfxRelevance(
        scene,
        sfxScene.ambientTrack.id,
        sfxScene.ambientTrack.name
      );
      sfxRelevance = sfxAnalysis.relevance;
      sfxIssues.push(...sfxAnalysis.issues);
      totalSfxRelevance += sfxRelevance;
    }
    
    // Track AI SFX accuracy
    if (scene.ambientSfx) {
      aiSfxTotal++;
      if (sfxScene?.ambientTrack?.id === scene.ambientSfx) {
        aiSfxValid++;
      }
    }
    
    // Combine issues
    const sceneIssues = [
      ...visualAnalysis.issues,
      ...narrationAnalysis.issues,
      ...sfxIssues,
    ];
    
    if (timingSync < 80) {
      sceneIssues.push("Narration timing doesn't match scene duration");
    }
    
    allIssues.push(...sceneIssues.map(i => `Scene ${index + 1}: ${i}`));
    
    sceneMetrics.push({
      sceneId: scene.id,
      sceneName: scene.name,
      duration: scene.duration,
      narrationDuration: narration?.audioDuration || null,
      timingSync,
      wordsPerSecond: narrationAnalysis.wordsPerSecond,
      visualDescriptionLength: scene.visualDescription.length,
      visualDescriptionQuality: visualAnalysis.quality,
      narrationWordCount: scene.narrationScript.split(/\s+/).length,
      narrationQuality: narrationAnalysis.quality,
      hasSfx,
      sfxRelevance,
      hasAudioUrl,
      issues: sceneIssues,
      suggestions: [],
    });
  });
  
  const sceneCount = contentPlan.scenes.length;
  
  // Calculate aggregate scores
  const contentScore = Math.round((totalVisualScore + totalNarrationScore) / (sceneCount * 2));
  const timingScore = Math.round(totalTimingScore / sceneCount);
  const visualScore = Math.round(totalVisualScore / sceneCount);
  const audioScore = scenesWithAudio > 0 
    ? Math.round((totalNarrationScore / sceneCount + (scenesWithAudio / sceneCount) * 100) / 2)
    : 0;
  
  // Overall score (weighted average)
  const overallScore = Math.round(
    contentScore * 0.35 +
    timingScore * 0.25 +
    visualScore * 0.25 +
    audioScore * 0.15
  );
  
  // Generate insights
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const actionableImprovements: string[] = [];
  
  // Analyze strengths
  if (visualScore >= 75) strengths.push("Strong visual descriptions");
  if (timingScore >= 85) strengths.push("Excellent narration-scene timing sync");
  if (scenesWithSfx / sceneCount >= 0.8) strengths.push("Good SFX coverage");
  if (totalWordsPerSecond / sceneCount >= 2.0 && totalWordsPerSecond / sceneCount <= 2.8) {
    strengths.push("Optimal narration pacing");
  }
  
  // Analyze weaknesses
  if (visualScore < 60) weaknesses.push("Visual descriptions need more detail");
  if (timingScore < 70) weaknesses.push("Narration timing issues");
  if (scenesWithSfx / sceneCount < 0.5) weaknesses.push("Limited SFX coverage");
  if (totalWordsPerSecond / sceneCount > 3.0) weaknesses.push("Narration too fast");
  if (totalWordsPerSecond / sceneCount < 1.8) weaknesses.push("Narration too sparse");
  
  // Generate actionable improvements
  if (visualScore < 70) {
    actionableImprovements.push("Add specific visual elements: lighting, camera angles, colors, textures");
  }
  if (timingScore < 80) {
    actionableImprovements.push("Adjust scene durations to match narration length");
  }
  if (scenesWithSfx / sceneCount < 0.7) {
    actionableImprovements.push("Add ambient SFX to more scenes for immersion");
  }
  if (contentScore < 70) {
    actionableImprovements.push("Use more engaging language: questions, sensory words, action verbs");
  }
  
  // Determine creativity level
  const avgDescLength = sceneMetrics.reduce((sum, s) => sum + s.visualDescriptionLength, 0) / sceneCount;
  const hasVariedTones = new Set(contentPlan.scenes.map(s => s.emotionalTone)).size >= 2;
  const contentPlannerCreativity: "low" | "medium" | "high" = 
    avgDescLength > 120 && hasVariedTones ? "high" :
    avgDescLength > 80 ? "medium" : "low";
  
  return {
    overallScore,
    contentScore,
    timingScore,
    visualScore,
    audioScore,
    title: contentPlan.title,
    videoPurpose,
    totalDuration: contentPlan.totalDuration,
    sceneCount,
    timestamp: new Date(),
    sceneMetrics,
    strengths,
    weaknesses,
    actionableImprovements,
    avgWordsPerSecond: totalWordsPerSecond / sceneCount,
    avgSceneDuration: contentPlan.totalDuration / sceneCount,
    visualCoverage: 100, // Assuming all scenes have visuals
    audioCoverage: (scenesWithAudio / sceneCount) * 100,
    sfxCoverage: (scenesWithSfx / sceneCount) * 100,
    aiSfxAccuracy: aiSfxTotal > 0 ? (aiSfxValid / aiSfxTotal) * 100 : 100,
    contentPlannerCreativity,
  };
}

/**
 * Get a summary string for quick display.
 */
export function getQualitySummary(report: ProductionQualityReport): string {
  const emoji = report.overallScore >= 80 ? "🌟" : report.overallScore >= 60 ? "✅" : "⚠️";
  return `${emoji} Quality: ${report.overallScore}/100 | Content: ${report.contentScore} | Timing: ${report.timingScore} | Visual: ${report.visualScore}`;
}

/**
 * Export report as JSON for analytics.
 */
export function exportReportAsJson(report: ProductionQualityReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Store report in localStorage for history tracking.
 */
export function saveReportToHistory(report: ProductionQualityReport): void {
  const historyKey = "lyriclens_quality_history";
  const existing = localStorage.getItem(historyKey);
  const history: ProductionQualityReport[] = existing ? JSON.parse(existing) : [];
  
  // Keep last 20 reports
  history.unshift(report);
  if (history.length > 20) {
    history.pop();
  }
  
  localStorage.setItem(historyKey, JSON.stringify(history));
}

/**
 * Get quality history from localStorage.
 */
export function getQualityHistory(): ProductionQualityReport[] {
  const historyKey = "lyriclens_quality_history";
  const existing = localStorage.getItem(historyKey);
  return existing ? JSON.parse(existing) : [];
}

/**
 * Calculate average scores from history.
 */
export function getHistoricalAverages(): {
  avgOverall: number;
  avgContent: number;
  avgTiming: number;
  avgVisual: number;
  trend: "improving" | "stable" | "declining";
} | null {
  const history = getQualityHistory();
  if (history.length < 2) return null;
  
  const avgOverall = history.reduce((sum, r) => sum + r.overallScore, 0) / history.length;
  const avgContent = history.reduce((sum, r) => sum + r.contentScore, 0) / history.length;
  const avgTiming = history.reduce((sum, r) => sum + r.timingScore, 0) / history.length;
  const avgVisual = history.reduce((sum, r) => sum + r.visualScore, 0) / history.length;
  
  // Calculate trend (compare recent 3 vs older 3)
  const recent = history.slice(0, 3);
  const older = history.slice(-3);
  const recentAvg = recent.reduce((sum, r) => sum + r.overallScore, 0) / recent.length;
  const olderAvg = older.reduce((sum, r) => sum + r.overallScore, 0) / older.length;
  
  const trend = recentAvg > olderAvg + 5 ? "improving" :
                recentAvg < olderAvg - 5 ? "declining" : "stable";
  
  return { avgOverall, avgContent, avgTiming, avgVisual, trend };
}
