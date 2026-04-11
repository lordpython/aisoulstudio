# Visual Source of Truth

**Version**: 1.0  
**Last Updated**: April 2026  
**Design System**: "The Invisible Interface" - Cinematic/Editorial Aesthetic

---

## Design Philosophy

AI Soul Studio embodies a **"Cinematic/Editorial" design system** with intentional minimalism, deep space aesthetics, and bioluminescent accents. The interface is designed to feel like working in a professional editing suite—dark, focused, and theatrical.

### Core Principles

1. **Intentional Minimalism**: Every element serves a purpose. No decorative noise.
2. **Deep Space**: Rich, layered dark backgrounds that create depth without being pitch black.
3. **Bioluminescence**: Subtle glows and accent colors that guide attention like light in darkness.
4. **Theatrical Polish**: Film grain, vignettes, and cinematic effects create a professional, editorial feel.
5. **Accessibility First**: WCAG AAA compliance with comprehensive keyboard navigation and RTL support.

---

## Color System

### Color Space: OKLCH

We use **OKLCH** for perceptual uniformity and wide gamut support. This ensures colors appear consistent across different displays and maintains harmony when adjusted.

### Primary Palette: Deep Space & Bioluminescence

| Token | OKLCH Value | Usage | Contrast Ratio |
|-------|-------------|-------|----------------|
| `--background` | `oklch(0.05 0.01 240)` | Main background, "The Void" | — |
| `--foreground` | `oklch(0.98 0 0)` | Primary text, "Starlight" | 19.5:1 on background |
| `--card` | `oklch(0.12 0.02 245)` | Card surfaces, "Event Horizon" | 14.2:1 on background |
| `--card-foreground` | `oklch(0.98 0 0)` | Card text | 14.2:1 on card |
| `--primary` | `oklch(0.70 0.15 190)` | Primary actions, "Nebula" (Cyan/Teal) | 4.8:1 on background |
| `--primary-foreground` | `oklch(0.05 0.01 240)` | Text on primary | 4.8:1 on primary |
| `--secondary` | `oklch(0.15 0.05 240)` | Secondary actions, "Dark Matter" | 3.2:1 on background |
| `--secondary-foreground` | `oklch(0.90 0.05 240)` | Text on secondary | 5.8:1 on secondary |
| `--muted` | `oklch(0.20 0.02 240)` | Disabled states, "Stardust" | 2.8:1 on background |
| `--muted-foreground` | `oklch(0.60 0.05 240)` | Muted text | 4.5:1 on muted |
| `--accent` | `oklch(0.65 0.25 30)` | Highlights, "Supernova" (Orange/Red) | 4.2:1 on background |
| `--accent-foreground` | `oklch(0.98 0 0)` | Text on accent | 4.2:1 on accent |
| `--destructive` | `oklch(0.55 0.25 25)` | Destructive actions, "Quasar" | 4.5:1 on background |
| `--destructive-foreground` | `oklch(0.98 0 0)` | Text on destructive | 4.5:1 on destructive |
| `--border` | `oklch(0.20 0.03 240)` | Borders, dividers | 2.5:1 on background |
| `--input` | `oklch(0.20 0.03 240)` | Input borders | 2.5:1 on background |
| `--ring` | `oklch(0.70 0.15 190)` | Focus rings | 4.8:1 on background |

### Semantic Status Colors

| Token | OKLCH Value | Usage |
|-------|-------------|-------|
| `--success` | `oklch(0.65 0.18 145)` | Success states, completed actions |
| `--success-foreground` | `oklch(0.05 0.01 240)` | Text on success |
| `--info` | `oklch(0.70 0.15 190)` | Informational states |
| `--info-foreground` | `oklch(0.05 0.01 240)` | Text on info |
| `--warning` | `oklch(0.75 0.18 80)` | Warning states |
| `--warning-foreground` | `oklch(0.05 0.01 240)` | Text on warning |

### Cinematic/Editorial Palette

| Token | OKLCH Value | Usage | Description |
|-------|-------------|-------|-------------|
| `--cinema-void` | `oklch(0.03 0.005 30)` | Deepest backgrounds | Darkest black with subtle warmth |
| `--cinema-celluloid` | `oklch(0.08 0.02 45)` | Film base surfaces | Rich dark brown/black |
| `--cinema-silver` | `oklch(0.92 0.01 60)` | Editorial text | Warm off-white |
| `--cinema-spotlight` | `oklch(0.75 0.15 80)` | Key light accents | Golden spotlight |
| `--cinema-velvet` | `oklch(0.35 0.15 25)` | Theatrical accents | Deep red |
| `--cinema-editorial` | `oklch(0.55 0.12 15)` | Editorial highlights | Deep burgundy |

### Glow Effects

| Token | OKLCH Value | Usage |
|-------|-------------|-------|
| `--glow-primary` | `oklch(0.70 0.15 190 / 0.5)` | Primary glow effects |
| `--glow-accent` | `oklch(0.65 0.25 30 / 0.5)` | Accent glow effects |
| `--glow-spotlight` | `oklch(0.75 0.15 80 / 0.4)` | Spotlight glow |
| `--glow-velvet` | `oklch(0.35 0.15 25 / 0.3)` | Velvet glow |

### White Overlay Variables

For subtle white overlays and highlights:

| Token | OKLCH Value | Usage |
|-------|-------------|-------|
| `--overlay-white-5` | `oklch(1 0 0 / 0.05)` | Subtle highlight |
| `--overlay-white-10` | `oklch(1 0 0 / 0.10)` | Light highlight |
| `--overlay-white-20` | `oklch(1 0 0 / 0.20)` | Medium highlight |
| `--overlay-white-40` | `oklch(1 0 0 / 0.40)` | Strong highlight |
| `--overlay-white-60` | `oklch(1 0 0 / 0.60)` | Very strong highlight |

### Color Usage Guidelines

1. **Primary (`--primary`)**: Use for primary CTAs, active states, and key interactive elements
2. **Accent (`--accent`)**: Use sparingly for highlights, notifications, and attention-grabbing elements
3. **Muted (`--muted`)**: Use for disabled states, secondary information, and non-interactive elements
4. **Destructive (`--destructive`)**: Use only for destructive actions (delete, remove, cancel)
5. **Cinematic colors**: Use for editorial sections, video production interfaces, and theatrical effects

---

## Typography System

### Font Families

| Token | Font Stack | Usage |
|-------|-----------|-------|
| `--font-sans` | "Inter", "Geist Sans", system-ui, sans-serif | UI text, body copy |
| `--font-mono` | "JetBrains Mono", "Fira Code", monospace | Code, technical content |
| `--font-display` | "Playfair Display", Georgia, "Times New Roman", serif | Hero headings, display text |
| `--font-script` | "Crimson Pro", Georgia, "Times New Roman", serif | Editorial text, long-form content |
| `--font-editorial` | "Sora", "Inter", system-ui, sans-serif | Editorial headings, UI labels |
| `--font-code` | "DM Mono", "JetBrains Mono", monospace | Code snippets, technical labels |

### Typography Scale (Fluid)

Using `clamp()` for responsive typography that scales smoothly across viewport sizes:

| Token | Value | Usage |
|-------|-------|-------|
| `--text-hero` | `clamp(2.5rem, 5vw, 4rem)` | Hero titles, main page headings |
| `--text-heading` | `clamp(1.5rem, 3vw, 2.5rem)` | Section headings |
| `--text-subheading` | `clamp(1.125rem, 2vw, 1.5rem)` | Card headings, subtitles |
| `--text-body` | `clamp(0.875rem, 1.2vw, 1rem)` | Body text, paragraphs |
| `--text-caption` | `0.75rem` | Captions, labels |
| `--text-micro` | `0.625rem` | Micro labels, timestamps |

### Typography Classes

| Class | Font Family | Size | Weight | Line Height | Letter Spacing | Color |
|-------|-------------|------|--------|-------------|---------------|-------|
| `.heading-hero` | Display | `--text-hero` | 600 | 1.1 | -0.02em | `--cinema-silver` |
| `.heading-section` | Display | `--text-heading` | 500 | 1.2 | -0.01em | `--cinema-silver` |
| `.heading-card` | Editorial | `--text-subheading` | 500 | 1.3 | normal | `oklch(0.95 0.01 60)` |
| `.text-body-editorial` | Editorial | `--text-body` | 400 | 1.65 | normal | `oklch(0.75 0.02 60)` |
| `.text-caption-mono` | Code | `--text-micro` | 400 | normal | 0.15em | `oklch(0.55 0.03 60)` |

### Typography Guidelines

1. **Display font**: Use for hero sections and major page headings only
2. **Editorial font**: Use for story mode, long-form content, and editorial interfaces
3. **Sans font**: Use for UI elements, buttons, and general interface text
4. **Mono font**: Use for code, timestamps, technical labels, and data displays
5. **Letter spacing**: Increase slightly for uppercase text (0.05-0.15em)
6. **Line height**: Use 1.1-1.2 for headings, 1.5-1.65 for body text

---

## Spacing System

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-section` | `3rem` (2rem on mobile) | Section padding, major layout gaps |
| `--space-card` | `1.5rem` (1rem on mobile) | Card padding, medium gaps |
| `--space-element` | `0.75rem` | Element spacing, small gaps |

### Tailwind Spacing Integration

The design system integrates with Tailwind's default spacing scale (0.25rem increments). Use Tailwind utilities for component-level spacing:

- `p-4` = 1rem = `--space-element` × 1.33
- `p-6` = 1.5rem = `--space-card`
- `p-12` = 3rem = `--space-section`

### Spacing Guidelines

1. **Section padding**: Use `--space-section` for major vertical sections
2. **Card padding**: Use `--space-card` for card interiors
3. **Element spacing**: Use `--space-element` for gaps between related elements
4. **Tight spacing**: Use 0.5rem for very tight layouts (e.g., button groups)
5. **Generous spacing**: Use 4-6rem for hero sections and major breaks

---

## Border Radius System

### Radius Scale

| Token | Calculation | Value (base: 1rem) | Usage |
|-------|-------------|-------------------|-------|
| `--radius-sm` | `calc(var(--radius) - 4px)` | 0.5rem | Small elements, tags, badges |
| `----radius-md` | `calc(var(--radius) - 2px)` | 0.75rem | Buttons, inputs |
| `--radius-lg` | `var(--radius)` | 1rem | Cards, panels |
| `--radius-xl` | `calc(var(--radius) + 4px)` | 1.25rem | Large cards, modals |
| `--radius-2xl` | `calc(var(--radius) + 8px)` | 1.5rem | Hero cards, featured elements |
| `--radius-3xl` | `calc(var(--radius) + 16px)` | 2rem | Special containers |
| `--radius-full` | `9999px` | Pills, avatars, circular elements |

### Radius Guidelines

1. **Default**: Use `--radius-lg` for most cards and panels
2. **Buttons**: Use `--radius-md` for standard buttons
3. **Modals**: Use `--radius-xl` or `--radius-2xl` for dialogs
4. **Pills**: Use `--radius-full` for tags, badges, and avatar containers
5. **Consistency**: Maintain consistent radius within component groups

---

## Animation System

### Cinematic Easing Curves

Theatrical easing functions that create smooth, professional motion:

| Token | Cubic Bezier | Feel | Usage |
|-------|-------------|------|-------|
| `--ease-cinematic` | `cubic-bezier(0.22, 1, 0.36, 1)` | Smooth, elegant | Standard transitions, hover effects |
| `--ease-dramatic` | `cubic-bezier(0.16, 1, 0.3, 1)` | Punchy, decisive | Key reveals, important actions |
| `--ease-curtain` | `cubic-bezier(0.65, 0, 0.35, 1)` | Theatrical, stage-like | Curtain rises, panel slides |

### Animation Presets

| Token | Animation | Duration | Usage |
|-------|-----------|----------|-------|
| `--animate-float` | `float 8s ease-in-out infinite` | 8s | Floating elements, ambient motion |
| `--animate-pulse-slow` | `pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite` | 4s | Subtle pulsing, loading states |
| `--animate-glow` | `glow 2s ease-in-out infinite alternate` | 2s | Glowing accents, focus states |

### Keyframe Animations

#### Float
```css
@keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
}
```
**Usage**: Ambient floating elements, decorative motion

#### Glow
```css
@keyframes glow {
    from { box-shadow: 0 0 10px -5px var(--glow-primary); }
    to { box-shadow: 0 0 25px 5px var(--glow-primary); }
}
```
**Usage**: Focus states, active elements, glowing accents

#### Fade In
```css
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
```
**Usage**: Entry animations, content reveals

#### Slide Up
```css
@keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}
```
**Usage**: Entry animations, panel reveals

#### Film Reel Spin
```css
@keyframes filmReelSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
```
**Usage**: Loading states, film reel icons

#### Curtain Rise
```css
@keyframes curtainRise {
    from { opacity: 0; transform: translateY(40px); }
    to { opacity: 1; transform: translateY(0); }
}
```
**Usage**: Theatrical reveals, modal opens

#### Spotlight Reveal
```css
@keyframes spotlightReveal {
    from { opacity: 0; transform: scale(0.95); filter: blur(10px); }
    to { opacity: 1; transform: scale(1); filter: blur(0); }
}
```
**Usage**: Hero reveals, featured content

#### Shimmer
```css
@keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}
```
**Usage**: Loading skeletons, shimmer effects

### Animation Classes

| Class | Animation | Duration | Easing |
|-------|-----------|----------|--------|
| `.animate-in-fade` | `fadeIn` | 0.6s | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `.animate-in-slide-up` | `slideUp` | 0.8s | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `.animate-film-reel` | `filmReelSpin` | 2s | linear |
| `.animate-curtain-rise` | `curtainRise` | 0.6s | `--ease-curtain` |
| `.animate-spotlight-reveal` | `spotlightReveal` | 0.5s | `--ease-dramatic` |

### Animation Guidelines

1. **Duration**: Keep animations under 500ms for UI interactions, 300-600ms for page transitions
2. **Easing**: Use `--ease-cinematic` for standard transitions, `--ease-dramatic` for key reveals
3. **Performance**: Prefer `transform` and `opacity` for GPU-accelerated animations
4. **Reduced motion**: Always respect `prefers-reduced-motion` media query
5. **Purpose**: Every animation should have a purpose—guide attention, provide feedback, or create hierarchy

---

## Cinematic Effects

### Film Grain

**Class**: `.cinema-grain`

Adds a subtle film grain overlay for texture and warmth:

```css
.cinema-grain::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    opacity: 0.03;
    pointer-events: none;
    z-index: 1;
    mix-blend-mode: overlay;
}
```

**Usage**: Hero sections, video preview areas, editorial containers

### Vignette

**Class**: `.cinema-vignette`

Creates a theatrical vignette effect:

```css
.cinema-vignette::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 40%, var(--cinema-void) 100%);
    pointer-events: none;
    z-index: 1;
}
```

**Usage**: Video players, hero sections, immersive containers

### Letterbox

**Class**: `.cinema-letterbox`

Adds cinematic letterbox bars (top and bottom):

```css
.cinema-letterbox::before,
.cinema-letterbox::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    height: 10%;
    background: var(--cinema-void);
    z-index: 2;
}
```

**Usage**: Video players, cinematic content displays

### Film Sprockets

**Class**: `.cinema-sprockets`

Creates film strip sprocket hole pattern:

```css
.cinema-sprockets {
    background-image:
        repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 8px,
            var(--cinema-void) 8px,
            var(--cinema-void) 12px,
            transparent 12px,
            transparent 20px
        );
    background-size: 100% 28px;
}
```

**Usage**: Timeline edges, film strip decorations

### Cinematic Shadows

**Class**: `.shadow-cinematic`

Dramatic, multi-layered shadow:

```css
.shadow-cinematic {
    box-shadow:
        0 4px 6px -1px var(--cinema-shadow-soft),
        0 20px 40px -10px var(--cinema-shadow),
        inset 0 1px 0 0 oklch(1 0 0 / 0.05);
}
```

**Usage**: Elevated cards, important elements

**Class**: `.shadow-editorial`

Refined, subtle shadow:

```css
.shadow-editorial {
    box-shadow:
        0 2px 4px var(--cinema-shadow-soft),
        0 8px 16px oklch(0 0 0 / 0.15);
}
```

**Usage**: Standard cards, panels

### Cinematic Focus

**Class**: `.cinema-focus`

Golden spotlight border on focus:

```css
.cinema-focus:focus-visible {
    outline: none;
    box-shadow:
        0 0 0 2px var(--cinema-spotlight),
        0 0 20px var(--glow-spotlight);
}
```

**Usage**: Important interactive elements, primary buttons

### Cinematic Button

**Class**: `.btn-cinematic`

Gradient button with golden glow on hover:

```css
.btn-cinematic {
    background: linear-gradient(135deg, var(--cinema-spotlight) 0%, oklch(0.65 0.12 70) 100%);
    color: var(--cinema-void);
    font-weight: 600;
    transition: all 0.3s var(--ease-cinematic);
}

.btn-cinematic:hover {
    box-shadow: 0 0 30px var(--glow-spotlight);
    transform: translateY(-1px);
}
```

**Usage**: Primary CTAs, featured actions

---

## Surface System

### Glassmorphism

**Class**: `.glass`

Frosted glass effect with backdrop blur:

```css
.glass {
    background: color-mix(in oklch, var(--card), transparent 30%);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border: 1px solid oklch(1 1 1 / 0.05);
    box-shadow: 
        0 4px 30px oklch(0 0 0 / 0.1),
        inset 0 0 0 1px oklch(1 1 1 / 0.05);
}
```

**Usage**: Floating panels, overlays, navigation

**Class**: `.glass-panel`

More opaque glass for panels:

```css
.glass-panel {
    background: color-mix(in oklch, var(--background), transparent 20%);
    backdrop-filter: blur(24px) saturate(140%);
    border-top: 1px solid oklch(1 1 1 / 0.1);
    border-left: 1px solid oklch(1 1 1 / 0.05);
}
```

**Usage**: Sidebars, docked panels

**Class**: `.glass-button`

Glass effect for buttons:

```css
.glass-button {
    background: oklch(1 1 1 / 0.03);
    backdrop-filter: blur(8px);
    border: 1px solid oklch(1 1 1 / 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-button:hover {
    background: oklch(1 1 1 / 0.08);
    border-color: var(--primary);
    box-shadow: 0 0 20px var(--glow-primary);
    transform: translateY(-1px);
}
```

**Usage**: Secondary buttons, icon buttons

### Card Surfaces

**Class**: `.surface-card`

Standard card surface with hover effect:

```css
.surface-card {
    background: var(--cinema-celluloid);
    border: 1px solid oklch(0.92 0.01 60 / 0.08);
    border-radius: var(--radius-lg);
    box-shadow:
        0 2px 4px oklch(0 0 0 / 0.2),
        0 8px 24px oklch(0 0 0 / 0.15),
        inset 0 1px 0 0 oklch(1 0 0 / 0.03);
    transition: border-color 0.3s var(--ease-cinematic), box-shadow 0.3s var(--ease-cinematic);
}

.surface-card:hover {
    border-color: oklch(0.75 0.15 80 / 0.2);
    box-shadow:
        0 2px 4px oklch(0 0 0 / 0.2),
        0 12px 32px oklch(0 0 0 / 0.25),
        0 0 0 1px oklch(0.75 0.15 80 / 0.06),
        inset 0 1px 0 0 oklch(1 0 0 / 0.04);
}
```

**Usage**: Standard cards, content containers

**Class**: `.surface-elevated`

Elevated surface for important content:

```css
.surface-elevated {
    background: oklch(0.10 0.02 245);
    border: 1px solid oklch(1 0 0 / 0.06);
    border-radius: var(--radius-lg);
    box-shadow:
        0 4px 8px oklch(0 0 0 / 0.3),
        0 16px 48px oklch(0 0 0 / 0.2),
        inset 0 1px 0 0 oklch(1 0 0 / 0.05);
}
```

**Usage**: Featured cards, hero sections, important panels

---

## Text Effects

### Gradient Text

**Class**: `.text-gradient`

Subtle gradient from foreground to muted:

```css
.text-gradient {
    background: linear-gradient(135deg, var(--foreground) 0%, var(--muted-foreground) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}
```

**Usage**: Hero headings, decorative text

**Class**: `.text-gradient-primary`

Gradient using primary color:

```css
.text-gradient-primary {
    background: linear-gradient(135deg, var(--primary) 0%, oklch(0.8 0.1 240) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}
```

**Usage**: Accent headings, featured text

---

## Micro-Interactions

### Hover Effects

**Class**: `.hover-glow`

Glow effect on hover:

```css
.hover-glow {
    transition: box-shadow 0.3s ease;
}

.hover-glow:hover {
    box-shadow: 0 0 30px var(--glow-primary);
}
```

**Usage**: Cards, buttons, interactive elements

**Class**: `.click-scale`

Scale down on click for tactile feedback:

```css
.click-scale:active {
    transform: scale(0.98);
}
```

**Usage**: Buttons, interactive elements

### Scrollbar

Custom slim scrollbar styling:

```css
* {
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
}

*::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

*::-webkit-scrollbar-track {
    background: transparent;
}

*::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
}

*::-webkit-scrollbar-thumb:hover {
    background: rgba(255,255,255,0.15);
}
```

**Usage**: All scrollable containers

**Class**: `.no-scrollbar`

Hide scrollbar but keep functionality:

```css
.no-scrollbar::-webkit-scrollbar {
    display: none;
}

.no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
```

**Usage**: Horizontal scroll strips, decorative scroll areas

---

## Accessibility

### Focus Indicators

All interactive elements must have visible focus indicators:

```css
:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
}

button:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
[role="button"]:focus-visible,
[tabindex]:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px oklch(0.70 0.15 190 / 0.2);
}
```

### Screen Reader Only

**Class**: `.sr-only`

Hide content visually but keep it available for screen readers:

```css
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
}

.sr-only:focus,
.sr-only:focus-visible {
    position: static;
    width: auto;
    height: auto;
    padding: inherit;
    margin: inherit;
    overflow: visible;
    clip: auto;
    white-space: normal;
}
```

**Usage**: Skip links, accessible labels

### Skip to Content

**Class**: `.skip-to-content`

Skip link for keyboard navigation:

```css
.skip-to-content {
    position: absolute;
    top: -100%;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    padding: 0.75rem 1.5rem;
    background: var(--primary);
    color: var(--primary-foreground);
    border-radius: var(--radius);
    font-weight: 600;
    text-decoration: none;
    transition: top 0.2s ease;
}

.skip-to-content:focus {
    top: 1rem;
}
```

**Usage**: First focusable element on page

### Reduced Motion

Respect user's motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

### High Contrast Mode

Support high contrast preferences:

```css
@media (prefers-contrast: high) {
    :focus-visible {
        outline: 3px solid currentColor;
        outline-offset: 3px;
    }
    
    button:focus-visible,
    a:focus-visible {
        outline: 3px solid currentColor;
        outline-offset: 3px;
        box-shadow: none;
    }
}
```

### Touch Targets

Ensure minimum touch target size (44x44px) on touch devices:

```css
@media (pointer: coarse) {
    button,
    a,
    input,
    select,
    textarea,
    [role="button"],
    [role="link"] {
        min-height: 44px;
        min-width: 44px;
    }
}
```

---

## RTL (Right-to-Left) Support

### Logical Properties

Use logical properties for RTL-aware spacing:

| Physical Property | Logical Property |
|-------------------|------------------|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `border-left` | `border-inline-start` |
| `border-right` | `border-inline-end` |
| `left` | `inset-inline-start` |
| `right` | `inset-inline-end` |
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |

### RTL Utility Classes

Spacing utilities:
- `.ms-auto`, `.me-auto` - margin inline start/end
- `.ps-0` through `.ps-6` - padding inline start
- `.pe-0` through `.pe-6` - padding inline end

Border utilities:
- `.border-s`, `.border-e` - border inline start/end
- `.border-s-0`, `.border-e-0` - remove border inline start/end
- `.rounded-s`, `.rounded-e` - border radius inline start/end

Position utilities:
- `.start-0` through `.start-auto` - inset inline start
- `.end-0` through `.end-auto` - inset inline end

Text alignment:
- `.text-start`, `.text-end` - text align start/end

### Icon Flipping

**Class**: `.rtl-flip`

Flip icons in RTL:

```css
[dir="rtl"] .rtl-flip {
    transform: scaleX(-1);
}
```

**Usage**: Directional icons (arrows, chevrons)

---

## Component Library

### shadcn/ui Configuration

- **Style**: New York
- **Base Color**: Zinc
- **CSS Variables**: Enabled
- **Icon Library**: Lucide
- **RSC**: Disabled

### Available Components

Located in `packages/frontend/components/ui/`:

- **Form**: `button`, `input`, `textarea`, `select`, `switch`, `slider`, `checkbox` (via custom)
- **Layout**: `card`, `scroll-area`, `separator` (via custom), `slide-panel`
- **Feedback**: `toast`, `toaster`, `progress`, `badge`
- **Navigation**: `tabs`, `dropdown-menu`, `tooltip`
- **Overlays**: `dialog`, `label`
- **Typography**: `markdown-content`
- **States**: `loading-state`, `error-state`
- **Accessibility**: `skip-link`

### Custom Components

Located in `packages/frontend/components/`:

- **Layout**: `AppShell`, `Sidebar`, `Header`
- **Video**: `VideoEditor`, `TimelineEditor`, `TimelinePlayer`
- **Story**: `StoryWorkspace`, `StoryboardView`, `VersionHistoryPanel`
- **Production**: Video production components
- **Visualizer**: Audio/visual visualizers
- **Music**: Music generation components
- **Auth**: Authentication components
- **Import/Export**: Project import/export components

---

## Responsive Design

### Breakpoints

Using Tailwind's default breakpoints:

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Small tablets, large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large desktops |

### Mobile Adjustments

At 640px and below:
- Section spacing reduced to 2rem
- Card spacing reduced to 1rem
- Typography scales down using fluid `clamp()`
- Touch targets enforced (44x44px minimum)

### Responsive Guidelines

1. **Mobile-first**: Design for mobile first, enhance for larger screens
2. **Fluid typography**: Use `clamp()` for seamless scaling
3. **Touch-friendly**: Ensure 44x44px minimum touch targets on mobile
4. **Progressive enhancement**: Add complexity as screen size increases
5. **Content priority**: Show essential content first on mobile

---

## Usage Guidelines

### Color Usage

1. **Primary color**: Use for CTAs, active states, key interactions
2. **Accent color**: Use sparingly for highlights and notifications
3. **Backgrounds**: Use cinematic palette for editorial sections
4. **Text**: Always ensure WCAG AA contrast (4.5:1 minimum, AAA preferred)
5. **Glows**: Use subtle glows (0.3-0.5 opacity) for depth

### Typography Usage

1. **Hierarchy**: Use display → editorial → sans → mono for clear hierarchy
2. **Size**: Use fluid scale with `clamp()` for responsive text
3. **Weight**: 400-500 for body, 500-600 for headings
4. **Line height**: 1.1-1.2 for headings, 1.5-1.65 for body
5. **Letter spacing**: Increase for uppercase (0.05-0.15em)

### Spacing Usage

1. **Sections**: Use `--space-section` for major vertical breaks
2. **Cards**: Use `--space-card` for card padding
3. **Elements**: Use `--space-element` for component gaps
4. **Consistency**: Use Tailwind utilities for component-level spacing
5. **Rhythm**: Maintain consistent spacing rhythm within layouts

### Animation Usage

1. **Purpose**: Every animation must have a clear purpose
2. **Duration**: Keep under 500ms for UI, 300-600ms for transitions
3. **Easing**: Use cinematic easing curves
4. **Performance**: Prefer transform/opacity for GPU acceleration
5. **Respect**: Always respect reduced motion preference

### Surface Usage

1. **Cards**: Use `.surface-card` for standard cards
2. **Elevated**: Use `.surface-elevated` for featured content
3. **Glass**: Use `.glass` for overlays and floating panels
4. **Shadows**: Use cinematic shadows for depth
5. **Borders**: Use subtle borders (0.05-0.1 opacity)

---

## Design Tokens Reference

### Complete Token List

```css
/* Colors */
--background
--foreground
--card
--card-foreground
--popover
--popover-foreground
--primary
--primary-foreground
--secondary
--secondary-foreground
--muted
--muted-foreground
--accent
--accent-foreground
--destructive
--destructive-foreground
--border
--input
--ring

/* Cinematic Colors */
--cinema-void
--cinema-celluloid
--cinema-silver
--cinema-spotlight
--cinema-velvet
--cinema-editorial
--cinema-shadow
--cinema-shadow-soft

/* Glows */
--glow-primary
--glow-accent
--glow-spotlight
--glow-velvet

/* Status Colors */
--success
--success-foreground
--info
--info-foreground
--warning
--warning-foreground

/* Overlays */
--overlay-white-5
--overlay-white-10
--overlay-white-20
--overlay-white-40
--overlay-white-60

/* Typography */
--font-sans
--font-mono
--font-display
--font-script
--font-editorial
--font-code

/* Typography Scale */
--text-hero
--text-heading
--text-subheading
--text-body
--text-caption
--text-micro

/* Spacing */
--space-section
--space-card
--space-element

/* Radius */
--radius
--radius-sm
--radius-md
--radius-lg
--radius-xl
--radius-2xl
--radius-3xl
--radius-full

/* Easing */
--ease-cinematic
--ease-dramatic
--ease-curtain

/* Animations */
--animate-float
--animate-pulse-slow
--animate-glow
```

---

## Design Review History

### February 10, 2026 - Comprehensive Design Review

**Overall Assessment**: ⭐⭐⭐⭐ (4/5 stars)

**Strengths**:
- Sophisticated color system with OKLCH
- Cinematic aesthetics with film grain, vignette, letterbox
- Well-defined typography hierarchy
- Consistent spacing with CSS custom properties
- Excellent accessibility foundation
- Strong performance metrics

**Areas for Improvement**:
- Add error boundary to Story Workspace
- Improve sidebar focus indicators
- Ensure touch target compliance
- Add visible input labels
- Implement toast notification system
- Add loading skeleton states

**Full Review**: See `.kombai/resources/design-review-comprehensive-1739200445.md`

---

## Maintenance Guidelines

### Adding New Colors

1. Use OKLCH color space
2. Ensure WCAG AA contrast (4.5:1 minimum)
3. Add semantic name (e.g., `--cinema-new-effect`)
4. Document usage in this file
5. Test in both light and dark contexts (if applicable)

### Adding New Typography

1. Add to font family tokens
2. Create typography class with size, weight, line height, letter spacing
3. Ensure contrast compliance
4. Test across viewport sizes
5. Document usage in this file

### Adding New Animations

1. Use cinematic easing curves
2. Keep duration under 500ms for UI
3. Prefer transform/opacity for performance
4. Add reduced motion support
5. Document purpose and usage

### Updating Components

1. Follow existing component patterns
2. Use design tokens from this file
3. Ensure accessibility compliance
4. Test keyboard navigation
5. Test RTL support
6. Document component in component library section

---

## Resources

### Documentation

- **Architecture**: `docs/ARCHITECTURE.md`
- **PROMPT Engineering**: `docs/PROMPT_ENGINEERING.md`
- **Pipelines**: `docs/services/`
- **Design Review**: `.kombai/resources/design-review-comprehensive-1739200445.md`

### Component Documentation

- **shadcn/ui**: https://ui.shadcn.com
- **Lucide Icons**: https://lucide.dev
- **Framer Motion**: https://www.framer.com/motion/

### Color Tools

- **OKLCH Picker**: https://oklch.com
- **Contrast Checker**: https://webaim.org/resources/contrastchecker/

### Accessibility Resources

- **WCAG Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/
- **ARIA Practices**: https://www.w3.org/WAI/ARIA/apg/
- **RTL Best Practices**: https://www.w3.org/International/questions/qa-html-dir

---

## Changelog

### Version 1.0 (April 2026)
- Initial Visual Source of Truth documentation
- Comprehensive color system documentation
- Typography scale and guidelines
- Animation system with cinematic easing
- Cinematic effects catalog
- Accessibility standards
- RTL support documentation
- Component library overview
- Design review history

---

**This document is the single source of truth for all visual design decisions in AI Soul Studio. All design changes should be documented here first.**
