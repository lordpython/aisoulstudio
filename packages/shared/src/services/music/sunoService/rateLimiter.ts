/**
 * Suno Service — Rate limiter (20 req / 10s sliding window)
 */

export class SunoRateLimiter {
  private requestTimestamps: number[] = [];
  private readonly maxRequests = 20;
  private readonly windowMs = 10000;

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < this.windowMs);

    if (this.requestTimestamps.length >= this.maxRequests) {
      const oldestTimestamp = this.requestTimestamps[0]!;
      const waitTime = this.windowMs - (now - oldestTimestamp) + 10;

      if (waitTime > 0) {
        console.log(`[Suno] Rate limit reached, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        const newNow = Date.now();
        this.requestTimestamps = this.requestTimestamps.filter(ts => newNow - ts < this.windowMs);
      }
    }

    this.requestTimestamps.push(Date.now());
  }

  getCurrentRequestCount(): number {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < this.windowMs);
    return this.requestTimestamps.length;
  }

  reset(): void {
    this.requestTimestamps = [];
  }
}

export const rateLimiter = new SunoRateLimiter();
