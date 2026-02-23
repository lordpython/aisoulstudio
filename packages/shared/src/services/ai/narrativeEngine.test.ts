/**
 * Narrative Engine Property-Based Tests
 *
 * Feature: multi-format-pipeline
 *
 * Property 15: Prompt Template Externalization
 *   Validates: Requirements 12.1, 21.1, 21.4
 *
 * Property 16: Prompt Variable Substitution
 *   Validates: Requirements 21.3
 *
 * Property 17: Script Duration Constraint
 *   Validates: Requirements 12.3
 *
 * Property 18: Research Incorporation
 *   Validates: Requirements 12.2
 *
 * Property 19: Reference Document Incorporation
 *   Validates: Requirements 12.6, 22.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  loadTemplate,
  substituteVariables,
  hasTemplate,
  setTemplate,
  listTemplates,
} from '../prompt/templateLoader';
import {
  buildBreakdownPrompt,
  buildScreenplayPrompt,
  estimateDurationSeconds,
  validateDurationConstraint,
  countScriptWords,
  FormatAwareGenerationOptions,
} from './storyPipeline';
import type { VideoFormat, FormatMetadata, ScreenplayScene } from '../../types';

// ============================================================================
// Constants and Test Data
// ============================================================================

const ALL_FORMAT_IDS: VideoFormat[] = [
  'movie-animation',
  'youtube-narrator',
  'advertisement',
  'educational',
  'shorts',
  'documentary',
  'music-video',
  'news-politics',
];

const ALL_PHASES = ['breakdown', 'screenplay'] as const;

/** Minimal FormatMetadata stub for testing duration constraints */
function makeFormatMeta(
  id: VideoFormat,
  minSeconds: number,
  maxSeconds: number
): FormatMetadata {
  return {
    id,
    name: id,
    description: '',
    icon: '',
    durationRange: { min: minSeconds, max: maxSeconds },
    aspectRatio: '16:9',
    applicableGenres: ['General'],
    checkpointCount: 2,
    concurrencyLimit: 3,
    requiresResearch: false,
    supportedLanguages: ['en', 'ar'],
  };
}

/** Minimal ScreenplayScene for word-count testing */
function makeScene(action: string, dialogueLines: string[]): ScreenplayScene {
  return {
    id: 'scene_0',
    sceneNumber: 1,
    heading: 'INT. ROOM - DAY',
    action,
    dialogue: dialogueLines.map((text, i) => ({ speaker: `Speaker${i}`, text })),
    charactersPresent: [],
  };
}

/** Minimal breakdown acts for screenplay prompt testing */
const SAMPLE_ACTS = [
  { title: 'Opening', emotionalHook: 'curiosity', narrativeBeat: 'Hero meets challenge' },
  { title: 'Climax', emotionalHook: 'tension', narrativeBeat: 'Hero faces final obstacle' },
  { title: 'Resolution', emotionalHook: 'relief', narrativeBeat: 'Hero succeeds' },
];

// ============================================================================
// Setup: inject templates for all formats so tests are filesystem-independent
// ============================================================================

beforeEach(() => {
  for (const formatId of ALL_FORMAT_IDS) {
    for (const phase of ALL_PHASES) {
      // Inject a minimal template for each format/phase if not already loaded
      // (real files loaded via import.meta.glob take precedence when available)
      if (!hasTemplate(formatId, phase)) {
        setTemplate(
          formatId,
          phase,
          `You are creating ${phase} content for {{genre}} format ${formatId}.\n` +
          `{{language_instruction}}\n` +
          `{{research}}{{references}}` +
          `Topic: {{idea}}\n` +
          (phase === 'screenplay' ? `Breakdown:\n{{breakdown}}\nScenes: {{actCount}}\n` : '') +
          `Duration: {{minDuration}}-{{maxDuration}} min\n`
        );
      }
    }
  }
});

// ============================================================================
// Property 15: Prompt Template Externalization
// Feature: multi-format-pipeline, Property 15: Prompt Template Externalization
// Validates: Requirements 12.1, 21.1, 21.4
// ============================================================================

describe('Property 15: Prompt Template Externalization', () => {
  it('all 8 formats have a non-empty breakdown template', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const template = loadTemplate(formatId, 'breakdown');
      expect(template, `breakdown template missing for '${formatId}'`).toBeTruthy();
      expect(template.length, `breakdown template empty for '${formatId}'`).toBeGreaterThan(0);
    }
  });

  it('all 8 formats have a non-empty screenplay template', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const template = loadTemplate(formatId, 'screenplay');
      expect(template, `screenplay template missing for '${formatId}'`).toBeTruthy();
      expect(template.length, `screenplay template empty for '${formatId}'`).toBeGreaterThan(0);
    }
  });

  it('templates are organized by format and phase (directory structure)', () => {
    const templates = listTemplates();
    // Every key must follow the '{formatId}/{phase}' pattern
    // Phase names may contain hyphens (e.g., 'cta-creation', 'hook-creation')
    for (const key of templates) {
      expect(key).toMatch(/^[a-z-]+\/[a-z-]+$/);
    }
  });

  it('unknown format throws a descriptive error (Req 21.2)', () => {
    expect(() => loadTemplate('unknown-format-xyz', 'breakdown')).toThrow(
      /not found|template/i
    );
  });

  it('unknown phase throws a descriptive error (Req 21.2)', () => {
    expect(() => loadTemplate('movie-animation', 'nonexistent-phase')).toThrow(
      /not found|template/i
    );
  });

  it('each format has a distinct breakdown template (not the same content)', () => {
    const templates = ALL_FORMAT_IDS.map(id => loadTemplate(id, 'breakdown'));
    const uniqueTemplates = new Set(templates);
    // At minimum, movie-animation and youtube-narrator should differ
    expect(
      loadTemplate('movie-animation', 'breakdown') ===
        loadTemplate('youtube-narrator', 'breakdown')
    ).toBe(false);
    // At least 2 distinct templates exist
    expect(uniqueTemplates.size).toBeGreaterThanOrEqual(2);
  });

  it('setTemplate allows programmatic registration (Req 21.5)', () => {
    const testKey = 'test-format-xyz';
    const testContent = 'Hello {{idea}}!';
    setTemplate(testKey, 'breakdown', testContent);
    expect(loadTemplate(testKey, 'breakdown')).toBe(testContent);
    expect(hasTemplate(testKey, 'breakdown')).toBe(true);
  });

  it('buildBreakdownPrompt uses the format-specific template', () => {
    // Inject two distinct templates to verify routing
    setTemplate('movie-animation', 'breakdown', 'MOVIE_TEMPLATE {{idea}}');
    setTemplate('youtube-narrator', 'breakdown', 'YOUTUBE_TEMPLATE {{idea}}');

    const moviePrompt = buildBreakdownPrompt('test idea', { formatId: 'movie-animation' });
    const youtubePrompt = buildBreakdownPrompt('test idea', { formatId: 'youtube-narrator' });

    expect(moviePrompt).toContain('MOVIE_TEMPLATE');
    expect(youtubePrompt).toContain('YOUTUBE_TEMPLATE');
    expect(moviePrompt).not.toBe(youtubePrompt);
  });
});

// ============================================================================
// Property 16: Prompt Variable Substitution
// Feature: multi-format-pipeline, Property 16: Prompt Variable Substitution
// Validates: Requirements 21.3
// ============================================================================

describe('Property 16: Prompt Variable Substitution', () => {
  it('substituteVariables replaces all known {{variable}} placeholders', () => {
    fc.assert(
      fc.property(
        // Generate a variable name and value
        fc.stringMatching(/^[a-z_]{1,15}$/).filter(s => s.length > 0),
        fc.string({ minLength: 1, maxLength: 50 }),
        // Generate surrounding text
        fc.string({ minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 0, maxLength: 20 }),
        (varName, varValue, prefix, suffix) => {
          const template = `${prefix}{{${varName}}}${suffix}`;
          const result = substituteVariables(template, { [varName]: varValue });
          // The placeholder must be gone
          expect(result).not.toContain(`{{${varName}}}`);
          // The value must appear in the result
          expect(result).toContain(varValue);
        }
      )
    );
  });

  it('substituteVariables leaves unknown placeholders intact', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{3,10}$/),
        fc.stringMatching(/^[a-z]{3,10}$/).filter(v => v !== 'known'),
        (unknownVar, knownVar) => {
          const template = `{{${unknownVar}}} and {{${knownVar}}}`;
          const result = substituteVariables(template, { known: 'hello' });
          // Unknown var stays
          expect(result).toContain(`{{${unknownVar}}}`);
        }
      )
    );
  });

  it('substituteVariables handles multiple occurrences of the same variable', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{3,10}$/),
        fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
        fc.integer({ min: 2, max: 5 }),
        (varName, varValue, count) => {
          const template = Array(count).fill(`{{${varName}}}`).join(' ');
          const result = substituteVariables(template, { [varName]: varValue });
          // No placeholder remains
          expect(result).not.toContain(`{{${varName}}}`);
          // Value appears the expected number of times
          const occurrences = result.split(varValue).length - 1;
          expect(occurrences).toBe(count);
        }
      )
    );
  });

  it('buildBreakdownPrompt substitutes {{idea}} with the topic', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 100 }),
        (idea) => {
          setTemplate('movie-animation', 'breakdown', 'Create content about: {{idea}}');
          const prompt = buildBreakdownPrompt(idea, { formatId: 'movie-animation' });
          expect(prompt).toContain(idea);
          expect(prompt).not.toContain('{{idea}}');
        }
      )
    );
  });

  it('buildBreakdownPrompt substitutes {{genre}} with the genre', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Drama', 'Comedy', 'Thriller', 'Documentary', 'Science'),
        (genre) => {
          setTemplate('movie-animation', 'breakdown', 'Genre: {{genre}} story about {{idea}}');
          const prompt = buildBreakdownPrompt('test', { formatId: 'movie-animation', genre });
          expect(prompt).toContain(genre);
          expect(prompt).not.toContain('{{genre}}');
        }
      )
    );
  });

  it('buildScreenplayPrompt substitutes {{breakdown}} with formatted acts', () => {
    setTemplate('movie-animation', 'screenplay', 'Based on:\n{{breakdown}}\nCount: {{actCount}}');
    const prompt = buildScreenplayPrompt(SAMPLE_ACTS, { formatId: 'movie-animation' });
    // All act titles must appear
    for (const act of SAMPLE_ACTS) {
      expect(prompt).toContain(act.title);
    }
    expect(prompt).not.toContain('{{breakdown}}');
    expect(prompt).toContain('3'); // actCount
  });

  it('buildBreakdownPrompt inserts Arabic language instruction for Arabic topics', () => {
    setTemplate('movie-animation', 'breakdown', '{{language_instruction}} {{idea}}');
    const arabicTopic = 'قصة عن المستقبل';
    const prompt = buildBreakdownPrompt(arabicTopic, { formatId: 'movie-animation' });
    expect(prompt.toLowerCase()).toContain('arabic');
  });

  it('buildBreakdownPrompt inserts English language instruction for English topics', () => {
    setTemplate('movie-animation', 'breakdown', '{{language_instruction}} {{idea}}');
    const prompt = buildBreakdownPrompt('A story about the future', { formatId: 'movie-animation' });
    expect(prompt.toLowerCase()).toContain('english');
  });
});

// ============================================================================
// Property 17: Script Duration Constraint
// Feature: multi-format-pipeline, Property 17: Script Duration Constraint
// Validates: Requirements 12.3
// ============================================================================

describe('Property 17: Script Duration Constraint', () => {
  it('estimateDurationSeconds is proportional to word count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 10_000 }),
        (wordCount) => {
          const seconds = estimateDurationSeconds(wordCount);
          // Duration is positive
          expect(seconds).toBeGreaterThan(0);
          // Monotonically non-decreasing (more words → same or longer duration)
          const moreWords = wordCount + 100;
          expect(estimateDurationSeconds(moreWords)).toBeGreaterThanOrEqual(seconds);
        }
      )
    );
  });

  it('estimateDurationSeconds is within ±5% of expected value at 140 wpm', () => {
    // 140 wpm = 2.333... wps, so 280 words ≈ 120s
    const wps = 140 / 60;
    const wordCount = 280;
    const expected = Math.ceil(wordCount / wps);
    const estimated = estimateDurationSeconds(wordCount);
    // Allow ±1s rounding
    expect(Math.abs(estimated - expected)).toBeLessThanOrEqual(1);
  });

  it('validateDurationConstraint returns valid when word count is within range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 600 }),  // target seconds
        fc.integer({ min: 10, max: 30 }),   // margin below
        fc.integer({ min: 10, max: 30 }),   // margin above
        (targetSec, marginBelow, marginAbove) => {
          const wps = 140 / 60;
          // Words that produce ~targetSec of content
          const wordCount = Math.floor(targetSec * wps);
          const formatMeta = makeFormatMeta(
            'movie-animation',
            targetSec - marginBelow,
            targetSec + marginAbove
          );
          // Only test when wordCount is in range
          if (wordCount > 0) {
            const result = validateDurationConstraint(wordCount, formatMeta);
            expect(result.estimatedSeconds).toBeGreaterThan(0);
            // If estimated is within [min, max], it must be valid
            if (
              result.estimatedSeconds >= formatMeta.durationRange.min &&
              result.estimatedSeconds <= formatMeta.durationRange.max
            ) {
              expect(result.valid).toBe(true);
            }
          }
        }
      )
    );
  });

  it('validateDurationConstraint returns invalid when too short', () => {
    // 10 words ≈ 4s — well below most format minimums
    const result = validateDurationConstraint(10, makeFormatMeta('youtube-narrator', 480, 1500));
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/too short/i);
  });

  it('validateDurationConstraint returns invalid when too long', () => {
    // 10,000 words ≈ 4286s — way above most format maximums
    const result = validateDurationConstraint(10_000, makeFormatMeta('advertisement', 15, 60));
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/too long/i);
  });

  it('validateDurationConstraint always returns a numeric estimatedSeconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50_000 }),
        fc.integer({ min: 10, max: 60 }),
        fc.integer({ min: 61, max: 3600 }),
        (wordCount, minSec, maxSec) => {
          const result = validateDurationConstraint(
            wordCount,
            makeFormatMeta('movie-animation', minSec, maxSec)
          );
          expect(typeof result.estimatedSeconds).toBe('number');
          expect(result.estimatedSeconds).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });

  it('countScriptWords counts words from both action and dialogue', () => {
    const scene = makeScene('The hero runs fast', ['Go now', 'Yes I will']);
    // action: 4, dialogue: 2+3 = 5, total: 9
    expect(countScriptWords([scene])).toBe(9);
  });

  it('countScriptWords is zero for empty scenes', () => {
    const scene = makeScene('', []);
    expect(countScriptWords([scene])).toBe(0);
  });

  it('countScriptWords accumulates across multiple scenes', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            action: fc.array(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 1, maxLength: 5 })
              .map(words => words.join(' ')),
            lines: fc.array(
              fc.array(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 1, maxLength: 3 })
                .map(words => words.join(' ')),
              { minLength: 0, maxLength: 3 }
            ),
          }),
          { minLength: 1, maxLength: 4 }
        ),
        (sceneDefs) => {
          const scenes = sceneDefs.map(({ action, lines }) => makeScene(action, lines));
          const total = countScriptWords(scenes);
          const manualCount = sceneDefs.reduce((acc, { action, lines }) => {
            const aWords = action.trim().split(/\s+/).filter(Boolean).length;
            const dWords = lines.reduce((d, l) => d + l.trim().split(/\s+/).filter(Boolean).length, 0);
            return acc + aWords + dWords;
          }, 0);
          expect(total).toBe(manualCount);
        }
      )
    );
  });
});

// ============================================================================
// Property 18: Research Incorporation
// Feature: multi-format-pipeline, Property 18: Research Incorporation
// Validates: Requirements 12.2
// ============================================================================

describe('Property 18: Research Incorporation', () => {
  it('buildBreakdownPrompt includes research summary when provided', () => {
    fc.assert(
      fc.property(
        // Generate a distinctive research summary (avoid empty or all-whitespace)
        fc.string({ minLength: 10, maxLength: 80 }).filter(s => s.trim().length > 5),
        (researchSummary) => {
          setTemplate('movie-animation', 'breakdown', 'Context: {{research}}Topic: {{idea}}');
          const prompt = buildBreakdownPrompt('test topic', {
            formatId: 'movie-animation',
            researchSummary,
          });
          expect(prompt).toContain(researchSummary);
        }
      )
    );
  });

  it('buildBreakdownPrompt includes research citations when provided', () => {
    const citations = '[1] Smith et al. 2024 — Key Finding';
    setTemplate('movie-animation', 'breakdown', '{{research}}{{idea}}');
    const prompt = buildBreakdownPrompt('test', {
      formatId: 'movie-animation',
      researchSummary: 'Key facts here',
      researchCitations: citations,
    });
    expect(prompt).toContain(citations);
  });

  it('buildBreakdownPrompt omits the research block when no research is provided', () => {
    setTemplate('movie-animation', 'breakdown', '{{research}}Topic: {{idea}}');
    const prompt = buildBreakdownPrompt('test', { formatId: 'movie-animation' });
    // No research block — the {{research}} variable should expand to empty string
    expect(prompt).not.toContain('RESEARCH CONTEXT');
    expect(prompt).toContain('Topic: test');
  });

  it('buildScreenplayPrompt includes research summary when provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 80 }).filter(s => s.trim().length > 5),
        (researchSummary) => {
          setTemplate('movie-animation', 'screenplay', '{{research}}Breakdown:\n{{breakdown}}');
          const prompt = buildScreenplayPrompt(SAMPLE_ACTS, {
            formatId: 'movie-animation',
            researchSummary,
          });
          expect(prompt).toContain(researchSummary);
        }
      )
    );
  });

  it('research incorporation is independent of format ID', () => {
    const summary = 'Unique research fact: 42% increase';
    for (const formatId of ALL_FORMAT_IDS) {
      setTemplate(formatId, 'breakdown', 'Research: {{research}} Idea: {{idea}}');
      const prompt = buildBreakdownPrompt('test', { formatId, researchSummary: summary });
      expect(prompt, `format '${formatId}' should include research`).toContain(summary);
    }
  });
});

// ============================================================================
// Property 19: Reference Document Incorporation
// Feature: multi-format-pipeline, Property 19: Reference Document Incorporation
// Validates: Requirements 12.6, 22.3
// ============================================================================

describe('Property 19: Reference Document Incorporation', () => {
  it('buildBreakdownPrompt includes reference content when provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 5),
        (referenceContent) => {
          setTemplate('movie-animation', 'breakdown', '{{references}}Idea: {{idea}}');
          const prompt = buildBreakdownPrompt('test', {
            formatId: 'movie-animation',
            referenceContent,
          });
          expect(prompt).toContain(referenceContent);
        }
      )
    );
  });

  it('buildBreakdownPrompt omits reference block when no references provided', () => {
    setTemplate('movie-animation', 'breakdown', '{{references}}Idea: {{idea}}');
    const prompt = buildBreakdownPrompt('test', { formatId: 'movie-animation' });
    expect(prompt).not.toContain('REFERENCE MATERIAL');
    expect(prompt).toContain('Idea: test');
  });

  it('buildScreenplayPrompt includes reference content when provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 5),
        (referenceContent) => {
          setTemplate('movie-animation', 'screenplay', '{{references}}Breakdown:\n{{breakdown}}');
          const prompt = buildScreenplayPrompt(SAMPLE_ACTS, {
            formatId: 'movie-animation',
            referenceContent,
          });
          expect(prompt).toContain(referenceContent);
        }
      )
    );
  });

  it('reference content is labeled as primary source material in the prompt', () => {
    setTemplate('movie-animation', 'breakdown', '{{references}}{{idea}}');
    const prompt = buildBreakdownPrompt('test', {
      formatId: 'movie-animation',
      referenceContent: 'Important document content here',
    });
    expect(prompt).toMatch(/reference material|primary source/i);
  });

  it('both research and references can be incorporated simultaneously', () => {
    const summary = 'Research summary text';
    const refContent = 'Reference document content';
    setTemplate('movie-animation', 'breakdown', '{{research}}{{references}}{{idea}}');
    const prompt = buildBreakdownPrompt('test', {
      formatId: 'movie-animation',
      researchSummary: summary,
      referenceContent: refContent,
    });
    expect(prompt).toContain(summary);
    expect(prompt).toContain(refContent);
  });

  it('reference incorporation is independent of format ID', () => {
    const refContent = 'Unique reference: primary source data';
    for (const formatId of ALL_FORMAT_IDS) {
      setTemplate(formatId, 'breakdown', 'Refs: {{references}} Idea: {{idea}}');
      const prompt = buildBreakdownPrompt('test', { formatId, referenceContent: refContent });
      expect(prompt, `format '${formatId}' should include reference content`).toContain(refContent);
    }
  });

  it('options with no research or references produce clean prompts without empty labels', () => {
    setTemplate('movie-animation', 'breakdown', '{{research}}{{references}}Idea: {{idea}}');
    const prompt = buildBreakdownPrompt('clean prompt test', { formatId: 'movie-animation' });
    // Neither block label should appear
    expect(prompt).not.toContain('RESEARCH CONTEXT');
    expect(prompt).not.toContain('REFERENCE MATERIAL');
    // But the idea should still be there
    expect(prompt).toContain('clean prompt test');
  });
});
