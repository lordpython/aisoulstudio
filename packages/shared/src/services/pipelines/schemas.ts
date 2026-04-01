/**
 * Pipeline Schema Builders
 *
 * Composable Zod schema factories for format-specific pipelines.
 * Defines the base breakdown and screenplay field structures once,
 * then allows each format to extend with additional fields and
 * configure min/max constraints.
 */

import { z } from 'zod';

// ============================================================================
// Base field definitions (shared across all formats)
// ============================================================================

const baseActFields = {
  title: z.string(),
  emotionalHook: z.string(),
  narrativeBeat: z.string(),
};

const baseSceneFields = {
  heading: z.string(),
  action: z.string(),
  dialogue: z.array(z.object({
    speaker: z.string().max(30),
    text: z.string().min(1),
  })),
};

// ============================================================================
// Schema builders
// ============================================================================

export interface BreakdownSchemaOptions {
  /** Minimum number of acts */
  minActs: number;
  /** Maximum number of acts */
  maxActs: number;
  /** Additional fields to include in each act object */
  extraActFields?: Record<string, z.ZodTypeAny>;
}

export interface ScreenplaySchemaOptions {
  /** Minimum number of scenes */
  minScenes: number;
  /** Maximum number of scenes */
  maxScenes: number;
  /** Additional top-level fields on the screenplay object */
  extraFields?: Record<string, z.ZodTypeAny>;
}

/**
 * Build a breakdown Zod schema with configurable act count and optional extra fields.
 *
 * Base act fields: title, emotionalHook, narrativeBeat
 *
 * @example
 * // Documentary with chapterTitle
 * buildBreakdownSchema({ minActs: 4, maxActs: 8, extraActFields: { chapterTitle: z.string() } })
 *
 * @example
 * // Shorts with no extras
 * buildBreakdownSchema({ minActs: 2, maxActs: 3 })
 */
export function buildBreakdownSchema(opts: BreakdownSchemaOptions) {
  const actShape = opts.extraActFields
    ? { ...baseActFields, ...opts.extraActFields }
    : baseActFields;

  return z.object({
    acts: z.array(z.object(actShape)).min(opts.minActs).max(opts.maxActs),
  });
}

/**
 * Build a screenplay Zod schema with configurable scene count and optional extra fields.
 *
 * Base scene fields: heading, action, dialogue[{ speaker, text }]
 *
 * @example
 * // Advertisement with ctaText
 * buildScreenplaySchema({
 *   minScenes: 2, maxScenes: 5,
 *   extraFields: { ctaText: z.string().describe('A short call-to-action. Max 6 words.') },
 * })
 *
 * @example
 * // News/Politics with no extras
 * buildScreenplaySchema({ minScenes: 3, maxScenes: 7 })
 */
export function buildScreenplaySchema(opts: ScreenplaySchemaOptions) {
  const scenesField = z.array(z.object(baseSceneFields)).min(opts.minScenes).max(opts.maxScenes);

  const shape: Record<string, z.ZodTypeAny> = {
    scenes: scenesField,
    ...(opts.extraFields ?? {}),
  };

  return z.object(shape);
}
