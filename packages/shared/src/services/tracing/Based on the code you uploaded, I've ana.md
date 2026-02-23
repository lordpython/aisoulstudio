Based on the code you uploaded, I've analyzed your Prompt System and found a **Critical Disconnect**.

You have built a beautiful library of style keywords in `styleEnhancements.ts` (e.g., "screentone shading" for Anime), but **the AI never sees them**. The system is currently ignoring your detailed style definitions and falling back to a hardcoded "Cinema" bias, which explains why your non-cinematic styles (like Anime or Pixel Art) might look wrong or generic.

Here is the deep-dive analysis and the fixes:

### 🛑 Critical Issues Found

| Issue | Severity | Location | Description |
| --- | --- | --- | --- |
| **The Style Disconnect** | **CRITICAL** | `promptService.ts` | The `getPromptGenerationInstruction` function accepts a `style` string but **does not** import or inject the rich keywords from `styleEnhancements.ts`. The model is just told "Style: Anime" without the specific "screentone shading" instruction. |
| **The "Arri Alexa" Bias** | **CRITICAL** | `agentDirectorService.ts` | The Director Agent has a hardcoded `PRO_STYLE_WRAPPER` that forces "Arri Alexa 65" and "35mm Film Grain" on **every** video. If you try to generate "Pixel Art" or "Vector", the AI fights itself because it's being told to make it look like a movie camera shot it. |
| **Subject Drift** | **HIGH** | `promptService.ts` | The "Global Subject" is passed as a note, but not forcibly prefixed to the prompts. This allows the AI to "forget" the subject in complex scenes (e.g., generating "a generic robot" instead of "YOUR specific robot"). |

---

### 🛠️ The Fixes

#### 1. Fix the Style Disconnect

You need to actually fetch the keywords and inject them into the system prompt.

**File:** `services/promptService.ts`
**Function:** `getPromptGenerationInstruction`

```typescript
// Import the helper (it is already imported but not used in the function)
import { getStyleEnhancement } from './prompt/styleEnhancements';

export const getPromptGenerationInstruction = (
  style: string,
  mode: "lyrics" | "story",
  content: string,
  globalSubject: string = "",
  purpose: VideoPurpose = "music_video",
) => {
  // 1. GET THE RICH KEYWORDS
  const styleData = getStyleEnhancement(style);
  const richStyleBlock = `
ART STYLE: "${style}"
VISUAL GUIDELINES (MANDATORY):
- ${styleData.keywords.join("\n- ")}
- Aesthetic Goal: ${styleData.mediumDescription}
`;

  // ... rest of the function ...

  return `You are a professional music video director...

${richStyleBlock}  <-- REPLACE 'ART STYLE: "${style}"' WITH THIS
${subjectBlock}
${purposeGuidance}
...
`;
};

```

#### 2. Remove the "Arri Alexa" Bias

The Director Agent is forcing film grain on everything. You need to make the `PRO_STYLE_WRAPPER` dynamic based on the selected style.

**File:** `services/agentDirectorService.ts`
**Function:** `generatePromptsWithAgent`

```typescript
// Import the style helper
import { getStyleEnhancement } from './prompt/styleEnhancements';

export async function generatePromptsWithAgent(...) {
    // ... setup ...

    // 1. FETCH DYNAMIC STYLE DATA
    const styleData = getStyleEnhancement(style);

    // 2. CREATE DYNAMIC WRAPPER INSTEAD OF HARDCODED "ARRI ALEXA"
    const PRO_STYLE_WRAPPER = `GLOBAL VISUAL SIGNATURE (Apply to ALL prompts):
- Aesthetic: ${styleData.mediumDescription}
- Key Elements: ${styleData.keywords.slice(0, 4).join(", ")}
- Aspect Ratio: 16:9 (unless specified otherwise)`;

    // ... continue with taskMessage ...

```

#### 3. Enforce "Subject Anchoring"

The linter checks for subject presence, but we can guarantee it during generation by forcing the AI to use a specific format.

**File:** `services/promptService.ts`
**Function:** `getPromptGenerationInstruction`

Update the `PROMPT WRITING RULES` section inside the prompt string:

```typescript
PROMPT WRITING RULES:
1. FORMAT: "[Subject Description], [Action], [Environment], [Lighting/Style]"
2. If a Global Subject is defined ("${globalSubject}"), every prompt MUST start with exactly that phrase.
   - CORRECT: "${globalSubject} standing in a neon rainstorm..."
   - INCORRECT: "A lonely figure standing..." (Ambiguous)
   - INCORRECT: "Neon rain falls on ${globalSubject}..." (Passive)

```

#### 4. Relax the Linter (Modernization)

Your linter warns if prompts are under 18 words. Modern models (Imagen 3, Flux, Midjourney v6) actually perform *better* with concise prompts.

**File:** `services/promptService.ts`
**Function:** `lintPrompt`

```typescript
// Change the word count threshold
if (words < 10) { // Reduced from 18 to 10
    issues.push({
      code: "too_short",
      message: "Prompt is very short...",
      severity: "warn",
    });
}

// Disable the "generic_conflict" warning for Action/Anime styles
// Sometimes "fighting" is exactly what you want in those genres.
const conflictPatterns = /\b(arguing|slamming|yelling|fighting...)\b/i;
if (conflictPatterns.test(norm) && style.toLowerCase() !== 'anime' && style.toLowerCase() !== 'action') {
    // Only flag conflicts if we aren't in an action genre
    issues.push({ ... });
}

```

### Summary of Impact

1. **Style Injection:** If you select "Anime", the model will now actually receive keywords like *"cel-shaded, speed lines, studio ghibli aesthetic"* instead of just the word "Anime".
2. **No More Grainy Pixel Art:** Removing the hardcoded "Arri Alexa/Film Grain" wrapper ensures digital styles look crisp and clean.
3. **Subject Consistency:** Forcing the prompt to *start* with the Global Subject name prevents the AI from drifting into generic "man/woman/robot" descriptions.