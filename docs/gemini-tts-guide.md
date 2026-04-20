# Gemini 3.1 Flash TTS — Best Practices & Integration Guide

## Overview

**Model:** `gemini-3.1-flash-tts-preview`

The Gemini 3.1 Flash TTS model is Google's latest text-to-speech model, optimized for low-latency, controllable speech generation. Unlike traditional TTS systems, it uses a large language model that understands **how** to say something, not just **what** to say.

Key capabilities:
- **Controllable delivery** — natural language prompts control style, tone, accent, pace, and emotion
- **Single-speaker and multi-speaker** — up to 2 distinct voices per request
- **30 prebuilt voices** — each with a distinct personality
- **80+ languages** — automatic language detection from input text
- **Audio tags** — inline modifiers like `[whispers]`, `[laughs]`, `[excitedly]`

## Supported Models

| Model | Single Speaker | Multi-Speaker | Notes |
|-------|---------------|---------------|-------|
| `gemini-3.1-flash-tts-preview` | Yes | Yes (max 2) | Latest, recommended |
| `gemini-2.5-flash-preview-tts` | Yes | Yes | Previous gen |
| `gemini-2.5-pro-preview-tts` | Yes | Yes | Higher quality, slower |

## Audio Format

All TTS models output **PCM audio** with these specs:
- **Sample rate:** 24,000 Hz
- **Channels:** 1 (mono)
- **Bit depth:** 16-bit signed integer (s16le)
- **Output:** Base64-encoded in `inlineData.data` field

Convert PCM to WAV by prepending a standard 44-byte RIFF/WAV header.

## Voice Options (30 voices)

| Voice | Personality | Voice | Personality |
|-------|------------|-------|-------------|
| Zephyr | Bright | Puck | Upbeat |
| Charon | Informative | Kore | Firm |
| Fenrir | Excitable | Leda | Youthful |
| Orus | Firm | Aoede | Breezy |
| Callirrhoe | Easy-going | Autonoe | Bright |
| Enceladus | Breathy | Iapetus | Clear |
| Umbriel | Easy-going | Algieba | Smooth |
| Despina | Smooth | Erinome | Clear |
| Algenib | Gravelly | Rasalgethi | Informative |
| Laomedeia | Upbeat | Achernar | Soft |
| Alnilam | Firm | Schedar | Even |
| Gacrux | Mature | Pulcherrima | Forward |
| Achird | Friendly | Zubenelgenubi | Casual |
| Vindemiatrix | Gentle | Sadachbia | Lively |
| Sadaltager | Knowledgeable | Sulafat | Warm |

Voice recommendations by use case:
- **Documentary/Narration:** Charon, Orus, Rasalgethi, Sadaltager
- **Energetic/Social:** Puck, Laomedeia, Fenrir, Sadachbia
- **Warm/Friendly:** Achird, Sulafat, Aoede, Vindemiatrix
- **Professional/Authoritative:** Kore, Alnilam, Schedar, Gacrux
- **Soft/Gentle:** Achernar, Vindemiatrix, Enceladus
- **Creative/Expressive:** Zephyr, Autonoe, Callirrhoe

## API Usage

### Single-Speaker (Node.js / `@google/genai`)

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });

const response = await ai.models.generateContent({
  model: "gemini-3.1-flash-tts-preview",
  contents: [{ parts: [{ text: "Say cheerfully: Have a wonderful day!" }] }],
  config: {
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: "Kore" },
      },
    },
  },
});

const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
const audioBuffer = Buffer.from(audioBase64, "base64");
// audioBuffer is raw PCM — prepend WAV header for playback
```

### Multi-Speaker (Node.js)

```typescript
const prompt = `TTS the following conversation between Joe and Jane:
Joe: How's it going today Jane?
Jane: Not too bad, how about you?`;

const response = await ai.models.generateContent({
  model: "gemini-3.1-flash-tts-preview",
  contents: [{ parts: [{ text: prompt }] }],
  config: {
    responseModalities: ["AUDIO"],
    speechConfig: {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          {
            speaker: "Joe",
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          {
            speaker: "Jane",
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
        ],
      },
    },
  },
});
```

### cURL

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts":[{"text": "Say cheerfully: Have a wonderful day!"}]
    }],
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "voiceConfig": {
          "prebuiltVoiceConfig": { "voiceName": "Kore" }
        }
      }
    }
  }' | jq -r '.candidates[0].content.parts[0].inlineData.data' | \
  base64 --decode > out.pcm

ffmpeg -f s16le -ar 24000 -ac 1 -i out.pcm out.wav
```

## Controlling Speech Style

### Audio Tags (Inline Modifiers)

Place tags in square brackets within your text to control delivery:

```
[excitedly] Hey there, welcome to the show!
[bored] Yeah, whatever...
[whispers] This is a secret.
[shouting] Pay attention!
```

Common tags:
- **Emotions:** `[amazed]`, `[curious]`, `[excited]`, `[panicked]`, `[sarcastic]`, `[serious]`, `[tired]`, `[trembling]`
- **Vocal actions:** `[cough]`, `[gasp]`, `[giggles]`, `[laughs]`, `[sighs]`, `[crying]`
- **Volume:** `[whispers]`, `[shouting]`
- **Pace:** `[very fast]`, `[very slow]`, `[one painfully slow word at a time]`
- **Creative:** `[like a cartoon dog]`, `[like dracula]`, `[mischievously]`, `[reluctantly]`

Tags can be combined: `[sarcastically, one painfully slow word at a time]`

For non-English transcripts, use **English audio tags** for best results.

### Advanced Prompting

For full performance direction, structure your prompt with these elements:

#### 1. Audio Profile — Define the character persona

```
# AUDIO PROFILE: Jaz R.
## "The Morning Hype"
```

#### 2. Scene — Set the environment and mood

```
## THE SCENE: The London Studio
It is 10:00 PM in a glass-walled studio overlooking the moonlit London skyline.
The red "ON AIR" tally light is blazing. Jaz is standing up, bouncing on the
balls of their heels to the rhythm of a thumping backing track.
```

#### 3. Director's Notes — Performance guidance (most important element)

```
### DIRECTOR'S NOTES
Style:
* The "Vocal Smile": You must hear the grin in the audio. Bright, sunny, inviting.
* Dynamics: High projection without shouting. Punchy consonants, elongated vowels.

Pace: Energetic, bouncing cadence. High-speed delivery with fluid transitions.

Accent: Brixton, London
```

#### 4. Transcript with Audio Tags

```
#### TRANSCRIPT
[excitedly] Yes, massive vibes in the studio! You are locked in and it is
absolutely popping off right now.
[shouting] Turn this up! Let's go!
```

### Full Advanced Prompt Example

```
# AUDIO PROFILE: Jaz R.
## "The Morning Hype"

## THE SCENE: The London Studio
It is 10:00 PM in a glass-walled studio overlooking the moonlit London skyline,
but inside, it is blindingly bright. The red "ON AIR" tally light is blazing.

### DIRECTOR'S NOTES
Style:
* The "Vocal Smile": Bright, sunny, and explicitly inviting tone.
* Punchy consonants and elongated vowels on excitement words.

Pace: Energetic, fast-paced delivery with fluid transitions — no dead air.

Accent: Estuary English from Brixton, London

#### TRANSCRIPT
[excitedly] Yes, massive vibes in the studio! You are locked in and it is
absolutely popping off in London right now.
[shouting] Turn this up! We've got the project roadmap landing in three,
two... let's go!
```

### Prompting Tips

- **Be descriptive:** "Infectious enthusiasm, like a massive exciting event" works better than "energetic"
- **Don't over-specify:** Too many strict rules limit the model's natural performance
- **Match voice to style:** Use Enceladus (breathy) for tired/bored, Puck (upbeat) for excited/happy
- **Keep prompt coherent:** Script and direction must align for a great performance
- **Give space:** Sometimes letting the model fill in gaps produces more natural results

## Limitations

- **Text-only input** — TTS models only accept text, no audio input
- **32k token context window** — per TTS session
- **No streaming** — TTS does not support streaming responses
- **Max 2 speakers** — for multi-speaker mode
- **Quality drift on long outputs** — split transcripts longer than a few minutes into chunks
- **Occasional 500 errors** — model may return text tokens instead of audio (~1% of requests). Implement retry logic.
- **Voice mismatch risk** — if prompt tone contradicts the selected voice personality, output may sound unnatural
- **Prompt classifier rejections** — vague prompts may trigger `PROHIBITED_CONTENT` or cause the model to read instructions aloud. Add a clear preamble: "Say the following:" and label where the transcript begins.

## Best Practices

### 1. Always Add a Clear Preamble

```
// GOOD — clear instruction to synthesize
"Say the following: Have a wonderful day!"
"Read aloud: The quick brown fox jumps over the lazy dog."

// BAD — vague, may be rejected or read instructions aloud
"Have a wonderful day!"
```

### 2. Implement Retry Logic

The model occasionally returns text tokens instead of audio, causing 500 errors. Always retry:

```typescript
const response = await withRetry(async () => {
  const result = await ai.models.generateContent({ /* ... */ });
  const audioData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!audioData?.data || !audioData?.mimeType) {
    throw new Error("No audio data in response");
  }
  return result;
}, 3, 2000); // 3 retries, 2s initial delay
```

### 3. Split Long Transcripts

For content longer than a few minutes, split into chunks and concatenate the PCM/WAV output:

```typescript
const chunks = splitTranscript(fullText, MAX_CHUNK_CHARS);
const audioBlobs: Blob[] = [];

for (const chunk of chunks) {
  const blob = await synthesizeSpeech(chunk, voiceConfig);
  audioBlobs.push(blob);
}

const finalAudio = concatenateWavBlobs(audioBlobs);
```

### 4. Match Voice to Content Tone

Select a voice that naturally aligns with the desired delivery style:

| Content Type | Recommended Voice | Why |
|-------------|-------------------|-----|
| News/documentary | Charon, Orus | Informative, firm |
| Podcast/conversation | Puck, Achird | Upbeat, friendly |
| Dramatic narration | Fenrir, Sulafat | Excitable, warm |
| Educational | Leda, Iapetus | Youthful, clear |
| Meditation/calm | Vindemiatrix, Achernar | Gentle, soft |
| Commercial/promo | Zephyr, Sadachbia | Bright, lively |

### 5. Use Audio Tags Sparingly

Too many tags can make output sound unnatural. Use them for emphasis points, not every sentence:

```
// GOOD — strategic tag placement
"Welcome to the show. [excitedly] Today we have an incredible guest! \
[whispers] You won't believe what they said."

// BAD — over-tagged
"[cheerfully] Welcome [pause] to [excitedly] the show. [breath] \
Today [gasp] we have [enthusiastically] an incredible guest!"
```

### 6. PCM to WAV Conversion

The API returns raw PCM. Always convert to WAV for playback:

```typescript
function pcmToWav(pcmData: Uint8Array): Blob {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcmData.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, pcmData.length, true);

  const wav = new Uint8Array(44 + pcmData.length);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcmData, 44);
  return new Blob([wav], { type: "audio/wav" });
}
```

## Integration with AI Soul Studio

### Current Setup

The project uses `gemini-2.5-flash-preview-tts` (defined in `apiClient.ts:58`):

```typescript
TTS: "gemini-2.5-flash-preview-tts",
```

### Migration to 3.1 Flash TTS

To upgrade, update the model constant:

```typescript
// packages/shared/src/services/ai/apiClient.ts
TTS: "gemini-3.1-flash-tts-preview",
```

The existing `ttsCore.ts` already uses the correct API structure (`responseModalities: ["AUDIO"]`, `speechConfig` with `prebuiltVoiceConfig`), so no other code changes are needed for single-speaker mode.

### Multi-Speaker Support

The current codebase only supports single-speaker. To add multi-speaker for dialogue/character scenes:

```typescript
// New config option in NarratorConfig
interface MultiSpeakerConfig {
  speakers: Array<{
    name: string;
    voiceName: TTSVoice;
  }>;
}

// Updated synthesizeSpeech call
const response = await ai.models.generateContent({
  model: "gemini-3.1-flash-tts-preview",
  contents: [{ role: "user", parts: [{ text: dialoguePrompt }] }],
  config: {
    responseModalities: ["AUDIO"],
    speechConfig: {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: speakers.map(s => ({
          speaker: s.name,
          voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voiceName } },
        })),
      },
    },
  },
});
```

### New Voices to Consider

The project currently uses 8 voices. The 3.1 model adds 22 more. Notable additions:

| Voice | Personality | Use Case |
|-------|------------|----------|
| Achird | Friendly | Default friendly narration |
| Sulafat | Warm | Warm storytelling |
| Algieba | Smooth | Smooth audiobook narration |
| Vindemiatrix | Gentle | Meditation, calm content |
| Sadachbia | Lively | Energetic social content |
| Sadaltager | Knowledgeable | Educational content |
| Gacrux | Mature | Authority/trust content |
| Pulcherrima | Forward | Confident presentations |

## Supported Languages (80+)

The TTS models detect language automatically. Supported languages include:

Arabic (ar), Bangla (bn), Dutch (nl), English (en), French (fr), German (de), Hindi (hi), Indonesian (id), Italian (it), Japanese (ja), Korean (ko), Marathi (mr), Polish (pl), Portuguese (pt), Romanian (ro), Russian (ru), Spanish (es), Tamil (ta), Telugu (te), Thai (th), Turkish (tr), Ukrainian (uk), Vietnamese (vi), Chinese Mandarin (cmn), and 50+ more including Filipino, Finnish, Georgian, Greek, Gujarati, Hebrew, Hungarian, Javanese, Kannada, Lao, Latin, Latvian, Lithuanian, Malay, Malayalam, Mongolian, Nepali, Norwegian, Odia, Pashto, Persian, Punjabi, Serbian, Sindhi, Sinhala, Slovak, Slovenian, Swahili, Swedish, Urdu, and more.

## Sources

- [Gemini API Speech Generation Docs](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Interactions (Live)](https://ai.google.dev/gemini-api/docs/interactions)
