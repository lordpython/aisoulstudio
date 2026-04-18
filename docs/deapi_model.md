# DeAPI Models Reference

**Last Updated:** 2026-04-18
**Source Endpoint:** `GET https://api.deapi.ai/api/v1/client/models?per_page=70&page=1`
**Models Returned:** 21

## API Request

```bash
curl --request GET \
  --url 'https://api.deapi.ai/api/v1/client/models?per_page=70&page=1' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer <DEAPI_TOKEN>'
```

## Model Index

| Category | Models |
|---|---|
| Image generation | FLUX.1 Schnell 12B NF4, Z-Image-Turbo INT8, FLUX.2 Klein 4B BF16 |
| Image editing | Qwen-Image-Edit Plus NF4 |
| Image utilities | Ben2, RealESRGAN x4 |
| Video generation | LTX-Video-0.9.8 13B, LTX-2 19B Distilled FP8, LTX-2.3 22B Distilled INT8 |
| Video replacement | Wan2.2-Animate 14B INT8 |
| Text to speech | Kokoro, Chatterbox, Qwen3 TTS CustomVoice, Qwen3 TTS VoiceClone, Qwen3 TTS VoiceDesign |
| Transcription | Whisper Large V3 |
| OCR | Nanonets OCR S F16 |
| Embeddings | BGE M3 |
| Music generation | ACE-Step 1.5 Turbo, ACE-Step 1.5 Base, ACE-Step 1.5 XL Turbo INT8 |

## Image Generation

### FLUX.1 Schnell 12B NF4

- **Slug:** `Flux1schnell`
- **Inference Types:** `txt2img`
- **Limits:** 256-2048 width, 256-2048 height, resolution step 128, steps 1-10
- **Defaults:** 768x768, 4 steps, negative prompt supported
- **Features:** steps yes, guidance no, negative prompt yes
- **LoRAs:** Astro GHX Schnell, Test Token TST, Hide the Pain Harold, Gideon Greylock, Pepe FLUX Schnell, GamerHash Schnell, GamerCoin Schnell

### Z-Image-Turbo INT8

- **Slug:** `ZImageTurbo_INT8`
- **Inference Types:** `txt2img`
- **Limits:** 128-2048 width, 128-2048 height, resolution step 16, steps 1-50
- **Defaults:** 768x768, 8 steps, negative prompt supported
- **Features:** steps yes, guidance no, negative prompt yes

### FLUX.2 Klein 4B BF16

- **Slug:** `Flux_2_Klein_4B_BF16`
- **Inference Types:** `txt2img`, `img2img`
- **Limits:** 256-1536 width, 256-1536 height, resolution step 16, exactly 4 steps, up to 3 input images
- **Defaults:** 1024x1024, 4 steps
- **Features:** steps yes, guidance no, negative prompt no, custom output size yes

## Image Editing

### Qwen-Image-Edit Plus NF4

- **Slug:** `QwenImageEdit_Plus_NF4`
- **Inference Types:** `img2img`
- **Limits:** 256-1024 width, 256-1024 height, steps 1-50, max 1 input image
- **Defaults:** 768x768, 40 steps, prompt and negative prompt supported
- **Features:** guidance no, negative prompt yes, custom output size no

## Image Utilities

### Ben2

- **Slug:** `Ben2`
- **Inference Types:** `img-rmbg`
- **Limits:** 128-2048 width, 128-2048 height
- **Use Case:** background removal

### RealESRGAN x4

- **Slug:** `RealESRGAN_x4`
- **Inference Types:** `img-upscale`
- **Limits:** 128-2048 width, 128-2048 height
- **Use Case:** image upscaling

## Video Generation

### LTX-Video-0.9.8 13B

- **Slug:** `Ltxv_13B_0_9_8_Distilled_FP8`
- **Inference Types:** `img2video`, `txt2video`
- **Limits:** 256-768 width, 256-768 height, 30 fps only, 30-120 frames, 1 step
- **Defaults:** 512x512, 30 fps, 120 frames, 1 step
- **Features:** steps yes, guidance no, last frame yes, negative prompt yes

### LTX-2 19B Distilled FP8

- **Slug:** `Ltx2_19B_Dist_FP8`
- **Inference Types:** `img2video`, `txt2video`
- **Limits:** 512-1024 width, 512-1024 height, 24 fps only, 49-241 frames
- **Defaults:** 768x768, 24 fps, 120 frames
- **Features:** steps no, guidance no, last frame yes, negative prompt no

### LTX-2.3 22B Distilled INT8

- **Slug:** `Ltx2_3_22B_Dist_INT8`
- **Inference Types:** `img2video`, `txt2video`, `audio2video`
- **Limits:** 512-1024 width, 512-1024 height, 24 fps only, 49-241 frames, reference audio 1-11 seconds
- **Defaults:** 768x768, 24 fps, 120 frames
- **Features:** steps no, guidance no, last frame yes, negative prompt no

## Video Replacement

### Wan2.2-Animate 14B INT8

- **Slug:** `Wan2_2_Animate_14B_INT8`
- **Inference Types:** `video-replace`
- **Limits:** 256-852 width, 256-852 height, max video duration 8 seconds
- **Defaults:** 768x768
- **Features:** steps no, guidance no, negative prompt no

## Text To Speech

### Kokoro

- **Slug:** `Kokoro`
- **Inference Types:** `txt2audio`
- **Limits:** text 3-10001 chars, speed 0.5-2, sample rate 24000
- **Defaults:** lang `en-us`, speed `1`, voice `af_alloy`, format `mp3`

| Language | Voices |
|---|---|
| English (US) | Alloy (m), Aoede (f), Bella (f), Heart (f), Jessica (f), Kore (f), Nicole (f), Nova (f), River (f), Sarah (f), Sky (f), Adam (m), Echo (m), Eric (m), Fenrir (m), Liam (m), Michael (m), Onyx (m), Puck (m), Santa (m) |
| English (GB) | Alice (f), Emma (f), Isabella (f), Lily (f), Daniel (m), Fable (m), George (m), Lewis (m) |
| Spanish | Dora (f), Alex (m), Santa (m) |
| French | Siwis (f) |
| Hindi | Alpha (f), Beta (f), Omega (m), Psi (m) |
| Italian | Sara (f), Nicola (m) |
| Portuguese (BR) | Dora (f), Alex (m), Santa (m) |

### Chatterbox

- **Slug:** `Chatterbox`
- **Inference Types:** `txt2audio`
- **Limits:** text 10-2000 chars, speed fixed at 1, sample rate 24000
- **Defaults:** lang `en`, speed `1`, voice `default`, format `mp3`
- **Features:** voice clone no, custom voice yes, voice design no
- **Languages:** Arabic, Danish, German, Greek, English, Spanish, Finnish, French, Hebrew, Hindi, Italian, Japanese, Korean, Malay, Dutch, Norwegian, Polish, Portuguese, Russian, Swedish, Swahili, Turkish, Chinese

### Qwen3 TTS CustomVoice

- **Slug:** `Qwen3_TTS_12Hz_1_7B_CustomVoice`
- **Inference Types:** `txt2audio`
- **Limits:** text 10-5000 chars, speed fixed at 1, sample rate 24000
- **Defaults:** lang `English`, speed `1`, voice `Vivian`, format `mp3`
- **Features:** voice clone no, custom voice yes, voice design no
- **Languages:** Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian
- **Voices:** Vivian, Serena, Uncle_Fu, Dylan, Eric, Ryan, Aiden, Ono_Anna, Sohee

### Qwen3 TTS VoiceClone

- **Slug:** `Qwen3_TTS_12Hz_1_7B_Base`
- **Inference Types:** `txt2audio`
- **Limits:** text 10-5000 chars, speed fixed at 1, sample rate 24000, reference audio 5-15 seconds
- **Defaults:** lang `English`, speed `1`, voice `default`, format `mp3`
- **Features:** voice clone yes, custom voice no, voice design no
- **Languages:** English, Italian, Spanish, Portuguese, Russian, French, German, Korean, Japanese, Chinese

### Qwen3 TTS VoiceDesign

- **Slug:** `Qwen3_TTS_12Hz_1_7B_VoiceDesign`
- **Inference Types:** `txt2audio`
- **Limits:** text 10-5000 chars, speed fixed at 1, sample rate 24000
- **Defaults:** lang `English`, speed `1`, voice `default`, format `mp3`
- **Features:** voice clone no, custom voice no, voice design yes
- **Languages:** English, Italian, Spanish, Portuguese, Russian, French, German, Korean, Japanese, Chinese

## Music Generation

### ACE-Step 1.5 Turbo

- **Slug:** `AceStep_1_5_Turbo`
- **Inference Types:** `txt2music`
- **Limits:** BPM 50-200, caption 3-300 chars, duration 10-300 seconds, guidance fixed at 1, steps fixed at 8, reference audio 5-60 seconds

### ACE-Step 1.5 Base

- **Slug:** `AceStep_1_5_Base`
- **Inference Types:** `txt2music`
- **Limits:** BPM 50-200, caption 3-300 chars, duration 30-300 seconds, guidance 3-20, steps 5-100, reference audio 5-60 seconds

### ACE-Step 1.5 XL Turbo INT8

- **Slug:** `AceStep_1_5_XL_Turbo_INT8`
- **Inference Types:** `txt2music`
- **Limits:** BPM 50-200, caption 3-300 chars, duration 10-300 seconds, guidance fixed at 1, steps fixed at 8, reference audio 5-60 seconds

## Transcription, OCR, And Embeddings

### Whisper Large V3

- **Slug:** `WhisperLargeV3`
- **Inference Types:** `audio2text`, `video2text`, `audio_file2text`, `video_file2text`
- **Notes:** the API response did not include additional limits or defaults

### Nanonets OCR S F16

- **Slug:** `Nanonets_Ocr_S_F16`
- **Inference Types:** `img2txt`
- **Limits:** width 128-4096, height 127-4096

### BGE M3

- **Slug:** `Bge_M3_FP16`
- **Inference Types:** `txt2embedding`
- **Limits:** max input tokens 8192, max total tokens 245760

## Notes

- This document is a cleaned Markdown version of the raw DeAPI `/client/models` response.
- The source response returned a single page with `total: 21` models.
- Use slugs for API integration and the human-readable names for UI labels or documentation.
