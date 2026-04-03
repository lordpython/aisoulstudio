/**
 * Narrator Service — Dialogue detection and speaker classification
 */

import { CHARACTER_VOICE_MAP } from "./voiceConfig";

export interface DialogueSegment {
    speaker: 'narrator' | 'male' | 'female' | 'elder' | 'youth' | 'mysterious';
    text: string;
    isDialogue: boolean;
}

export function detectDialogue(script: string): DialogueSegment[] {
    const segments: DialogueSegment[] = [];
    const dialoguePattern = /"([^"]+)"/g;
    const maleSpeakerPattern = /\b(he|man|boy|father|grandfather|king|lord|sir|mr|uncle|brother|son)\b/i;
    const femaleSpeakerPattern = /\b(she|woman|girl|mother|grandmother|queen|lady|mrs|miss|aunt|sister|daughter)\b/i;
    const elderPattern = /\b(old|elder|grandfather|grandmother|ancient|wise|sage)\b/i;
    const youthPattern = /\b(young|boy|girl|child|kid|youth|teen)\b/i;

    let lastIndex = 0;
    let match;

    while ((match = dialoguePattern.exec(script)) !== null) {
        const dialogueText = match[1];
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        if (matchStart > lastIndex) {
            const narrationText = script.slice(lastIndex, matchStart).trim();
            if (narrationText) {
                segments.push({ speaker: 'narrator', text: narrationText, isDialogue: false });
            }
        }

        const contextStart = Math.max(0, matchStart - 50);
        const contextEnd = Math.min(script.length, matchEnd + 50);
        const context = script.slice(contextStart, contextEnd);

        let speaker: DialogueSegment['speaker'] = 'narrator';
        if (elderPattern.test(context)) speaker = 'elder';
        else if (youthPattern.test(context)) speaker = 'youth';
        else if (femaleSpeakerPattern.test(context)) speaker = 'female';
        else if (maleSpeakerPattern.test(context)) speaker = 'male';

        segments.push({ speaker, text: dialogueText || "", isDialogue: true });
        lastIndex = matchEnd;
    }

    if (lastIndex < script.length) {
        const remainingText = script.slice(lastIndex).trim();
        if (remainingText) {
            segments.push({ speaker: 'narrator', text: remainingText, isDialogue: false });
        }
    }

    if (segments.length === 0) {
        segments.push({ speaker: 'narrator', text: script, isDialogue: false });
    }

    return segments;
}

export function hasDialogue(script: string): boolean {
    return /"[^"]+"/.test(script);
}
