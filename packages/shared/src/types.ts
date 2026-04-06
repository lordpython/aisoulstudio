/**
 * Types — Barrel re-export from domain-split modules
 *
 * All types are now organized in focused domain files under types/:
 *   media.ts     — Assets, images, videos, song data
 *   scene.ts     — Scenes, content plans, narration, characters, validation
 *   story.ts     — Screenplay, shots, storyboard workflow state
 *   pipeline.ts  — Video formats, pipeline phases, checkpoints
 *   assistant.ts — Conversation, intents, workflows
 *   audio.ts     — SFX, beat metadata, music generation
 *   layout.ts    — Zones, text animation, visualizer config
 *   assembly.ts  — Timeline clips, chapter markers, CTA markers
 *
 * This file re-exports everything so existing imports continue to work.
 */

export * from './types/index';
