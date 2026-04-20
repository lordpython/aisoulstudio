import { describe, it, expect } from 'vitest';
import {
  convertMarkersForGemini,
  convertMarkersToDirectorNote,
} from '../../packages/shared/src/services/audio-processing/deliveryMarkers';

describe('convertMarkersForGemini', () => {
  it('returns empty result for empty input', () => {
    expect(convertMarkersForGemini('')).toEqual({ inlineText: '', proseInstructions: '' });
  });

  it('passes through plain text unchanged', () => {
    const r = convertMarkersForGemini('Hello world.');
    expect(r.inlineText).toBe('Hello world.');
    expect(r.proseInstructions).toBe('');
  });

  it('maps [pause: long] to native [long pause] inline', () => {
    const r = convertMarkersForGemini('Before [pause: long] after.');
    expect(r.inlineText).toBe('Before [long pause] after.');
    expect(r.proseInstructions).toBe('');
  });

  it('maps [pause: short|medium|beat] to native [short pause]', () => {
    expect(convertMarkersForGemini('A [pause: short] B').inlineText).toBe('A [short pause] B');
    expect(convertMarkersForGemini('A [pause: medium] B').inlineText).toBe('A [short pause] B');
    expect(convertMarkersForGemini('A [pause: beat] B').inlineText).toBe('A [short pause] B');
  });

  it('keeps [breath] inline as-is', () => {
    expect(convertMarkersForGemini('[breath] hello').inlineText).toBe('[breath] hello');
  });

  it('converts [whisper]X[/whisper] to native [whisper] X', () => {
    const r = convertMarkersForGemini('She said, [whisper]don\'t tell anyone[/whisper], and ran.');
    expect(r.inlineText).toBe("She said, [whisper] don't tell anyone, and ran.");
    expect(r.proseInstructions).toBe('');
  });

  it('extracts [emphasis] to prose, keeps content inline', () => {
    const r = convertMarkersForGemini('The [emphasis]only[/emphasis] way.');
    expect(r.inlineText).toBe('The only way.');
    expect(r.proseInstructions).toBe('Emphasize "only".');
  });

  it('extracts [low-tone], [rising-tension], [slow] to prose', () => {
    const r = convertMarkersForGemini(
      '[low-tone]dark[/low-tone] and [rising-tension]tense[/rising-tension] and [slow]careful[/slow].'
    );
    expect(r.inlineText).toBe('dark and tense and careful.');
    expect(r.proseInstructions).toContain('Drop to a lower register for "dark"');
    expect(r.proseInstructions).toContain('Build rising tension through "tense"');
    expect(r.proseInstructions).toContain('Slow down delivery for "careful"');
  });

  it('handles a mixed realistic script', () => {
    const r = convertMarkersForGemini(
      '[breath] The [emphasis]rain[/emphasis] fell. [pause: long] Then, [whisper]silence[/whisper].'
    );
    expect(r.inlineText).toBe('[breath] The rain fell. [long pause] Then, [whisper] silence.');
    expect(r.proseInstructions).toBe('Emphasize "rain".');
  });

  it('is case-insensitive on marker tags', () => {
    const r = convertMarkersForGemini('[PAUSE: LONG] [Breath] [EMPHASIS]X[/EMPHASIS]');
    expect(r.inlineText).toBe('[long pause] [Breath] X');
    expect(r.proseInstructions).toBe('Emphasize "X".');
  });
});

describe('convertMarkersToDirectorNote (legacy)', () => {
  it('still extracts all markers to prose for backward compat', () => {
    const r = convertMarkersToDirectorNote('[breath] Hello [whisper]quiet[/whisper].');
    expect(r.cleanText).toBe('Hello quiet.');
    expect(r.directorInstructions).toContain('breath');
    expect(r.directorInstructions).toContain('Whisper');
  });
});
