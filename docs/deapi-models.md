# DeAPI Models Reference

## Image Generation

### FLUX.1 Schnell 12B NF4
- **Slug:** `Flux1schnell`
- **Inference:** `txt2img`
- **Limits:** max 2048×2048, min 256×256, step 128, steps 1–10
- **Defaults:** 4 steps, 768×768
- **Features:** steps ✅, guidance ❌, negative_prompt ✅
- **LoRAs:**
  - Astro GHX Schnell
  - Test Token TST
  - Hide the Pain Harold
  - Gideon Greylock
  - Pepe FLUX Schnell
  - GamerHash Schnell
  - GamerCoin Schnell

### FLUX.2 Klein 4B BF16
- **Slug:** `Flux_2_Klein_4B_BF16`
- **Inference:** `txt2img`, `img2img`
- **Limits:** max 1536×1536, min 256×256, step 16, steps 4, max 3 input images
- **Defaults:** 4 steps, 1024×1024
- **Features:** steps ✅, guidance ❌, negative_prompt ❌, custom_output_size ✅

### Z-Image-Turbo INT8
- **Slug:** `ZImageTurbo_INT8`
- **Inference:** `txt2img`
- **Limits:** max 2048×2048, min 128×128, step 16, steps 1–50
- **Defaults:** 8 steps, 768×768
- **Features:** steps ✅, guidance ❌, negative_prompt ✅

## Image Editing

### Qwen-Image-Edit Plus NF4
- **Slug:** `QwenImageEdit_Plus_NF4`
- **Inference:** `img2img`
- **Limits:** max 1024×1024, min 256×256, steps 1–50, max 1 input image
- **Defaults:** 40 steps, 768×768
- **Features:** guidance ❌, negative_prompt ✅, custom_output_size ❌

## Image Utilities

### Ben2 (Background Removal)
- **Slug:** `Ben2`
- **Inference:** `img-rmbg`
- **Limits:** max 2048×2048, min 128×128

### RealESRGAN x4 (Upscale)
- **Slug:** `RealESRGAN_x4`
- **Inference:** `img-upscale`
- **Limits:** max 2048×2048, min 128×128

## Video Generation

### LTX-Video-0.9.8 13B
- **Slug:** `Ltxv_13B_0_9_8_Distilled_FP8`
- **Inference:** `img2video`, `txt2video`
- **Limits:** 30 fps, steps 1, 30–120 frames, max 768×768, min 256×256
- **Defaults:** 30 fps, 1 step, 512×512, 120 frames
- **Features:** steps ✅, guidance ❌, last_frame ✅, negative_prompt ✅

### LTX-2 19B Distilled FP8
- **Slug:** `Ltx2_19B_Dist_FP8`
- **Inference:** `img2video`, `txt2video`
- **Limits:** 24 fps, 49–241 frames, 512–1024 width/height
- **Defaults:** 24 fps, 768×768, 120 frames
- **Features:** steps ❌, guidance ❌, last_frame ✅, negative_prompt ❌

## Text-to-Speech

### Kokoro
- **Slug:** `Kokoro`
- **Inference:** `txt2audio`
- **Limits:** text 3–10001 chars, speed 0.5–2, sample rate 24000
- **Defaults:** `en-us`, speed 1, voice `af_alloy`, mp3

| Language | Voices |
|----------|--------|
| English (US) | Alloy (m), Aoede (f), Bella (f), Heart (f), Jessica (f), Kore (f), Nicole (f), Nova (f), River (f), Sarah (f), Sky (f), Adam (m), Echo (m), Eric (m), Fenrir (m), Liam (m), Michael (m), Onyx (m), Puck (m), Santa (m) |
| English (GB) | Alice (f), Emma (f), Isabella (f), Lily (f), Daniel (m), Fable (m), George (m), Lewis (m) |
| Spanish | Dora (f), Alex (m), Santa (m) |
| French | Siwis (f) |
| Hindi | Alpha (f), Beta (f), Omega (m), Psi (m) |
| Italian | Sara (f), Nicola (m) |
| Portuguese (BR) | Dora (f), Alex (m), Santa (m) |

### Chatterbox
- **Slug:** `Chatterbox`
- **Inference:** `txt2audio`
- **Limits:** text 10–2000 chars, speed 1, sample rate 24000
- **Defaults:** `en`, speed 1, voice `default`, mp3
- **Features:** voice_clone ❌, custom_voice ✅, voice_design ❌
- **Languages:** Arabic, Danish, German, Greek, English, Spanish, Finnish, French, Hebrew, Hindi *(truncated in source)*

## Other

### Whisper Large V3
- **Slug:** `WhisperLargeV3`
- **Inference:** `audio2text`, `video2text`, `audio_file2text`, `video_file2text`

### Nanonets OCR S F16
- **Slug:** `Nanonets_Ocr_S_F16`
- **Inference:** `img2txt`
- **Limits:** max 4096×4096, min 128×127

### BGE M3 (Embeddings)
- **Slug:** `Bge_M3_FP16`
- **Inference:** `txt2embedding`
- **Limits:** max 8192 input tokens, 245760 total tokens
