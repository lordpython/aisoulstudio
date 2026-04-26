/**
 * Cost tracking for eval runs.
 *
 * Records per-call cost data so a full eval run reports its API spend.
 * Pricing is approximate (USD per 1M tokens, Jan 2026) and meant for
 * order-of-magnitude awareness, not billing reconciliation.
 */

interface ModelPricing {
  inputUsdPer1M: number;
  outputUsdPer1M: number;
}

// Best-effort pricing snapshot. Update when Google revises rates.
const PRICING: Record<string, ModelPricing> = {
  'gemini-3-flash-preview': { inputUsdPer1M: 0.075, outputUsdPer1M: 0.3 },
  'gemini-3.1-flash-tts-preview': { inputUsdPer1M: 0.075, outputUsdPer1M: 0.3 },
  'gemini-3.1-pro-preview': { inputUsdPer1M: 1.25, outputUsdPer1M: 5.0 },
  'imagen-4.0-fast-generate-001': { inputUsdPer1M: 0, outputUsdPer1M: 0 }, // priced per image
  'veo-3.1-fast-generate-preview': { inputUsdPer1M: 0, outputUsdPer1M: 0 }, // priced per second of video
};

const PER_IMAGE_USD = 0.02;
const PER_VIDEO_SECOND_USD = 0.5;

export interface CostEntry {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  videoSeconds?: number;
  durationMs: number;
  costUsd: number;
}

export class CostTracker {
  private entries: CostEntry[] = [];

  record(entry: Omit<CostEntry, 'costUsd'>): CostEntry {
    const pricing = PRICING[entry.model];
    let cost = 0;
    if (pricing) {
      cost += ((entry.inputTokens ?? 0) / 1_000_000) * pricing.inputUsdPer1M;
      cost += ((entry.outputTokens ?? 0) / 1_000_000) * pricing.outputUsdPer1M;
    }
    cost += (entry.imageCount ?? 0) * PER_IMAGE_USD;
    cost += (entry.videoSeconds ?? 0) * PER_VIDEO_SECOND_USD;

    const full: CostEntry = { ...entry, costUsd: cost };
    this.entries.push(full);
    return full;
  }

  totalUsd(): number {
    return this.entries.reduce((sum, e) => sum + e.costUsd, 0);
  }

  summary(): string {
    if (this.entries.length === 0) return '(no API calls recorded)';
    const byModel = new Map<string, { calls: number; cost: number }>();
    for (const e of this.entries) {
      const cur = byModel.get(e.model) ?? { calls: 0, cost: 0 };
      cur.calls += 1;
      cur.cost += e.costUsd;
      byModel.set(e.model, cur);
    }
    const lines = Array.from(byModel.entries()).map(
      ([model, { calls, cost }]) =>
        `  ${model}: ${calls} call${calls === 1 ? '' : 's'}, $${cost.toFixed(4)}`,
    );
    return [
      `total: $${this.totalUsd().toFixed(4)} across ${this.entries.length} call${this.entries.length === 1 ? '' : 's'}`,
      ...lines,
    ].join('\n');
  }
}

/** Module-level singleton so any helper can record without plumbing. */
export const costTracker = new CostTracker();
