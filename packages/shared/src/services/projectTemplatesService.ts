/**
 * Project Templates Service
 * 
 * Provides pre-built story templates with genre-specific starting points
 * and quick-start wizards for common video production workflows.
 */

import type { StoryState, ScreenplayScene } from '@/types';

export interface TemplateScene {
  sceneNumber: number;
  heading: string;
  action: string;
  setting?: string;
  emotionalBeat?: string;
  duration?: number;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  genre: string;
  category: 'narrative' | 'commercial' | 'educational' | 'social' | 'experimental';
  thumbnail?: string;
  estimatedDuration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  visualStyle: string;
  aspectRatio: string;
  templateScenes: TemplateScene[];
  suggestedVisualStyles: string[];
  suggestedAspectRatios: string[];
}

export interface QuickStartWizard {
  id: string;
  name: string;
  description: string;
  steps: WizardStep[];
  resultTemplate: string;
}

export interface WizardStep {
  id: string;
  title: string;
  description: string;
  type: 'text' | 'select' | 'multiselect' | 'number' | 'textarea';
  field: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
}

function generateId(): string {
  return `scene_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function convertTemplateToScreenplayScenes(scenes: TemplateScene[]): ScreenplayScene[] {
  return scenes.map(scene => ({
    id: generateId(),
    sceneNumber: scene.sceneNumber,
    heading: scene.heading,
    action: scene.action,
    dialogue: [],
    charactersPresent: [],
  }));
}

const TEMPLATES: ProjectTemplate[] = [
  // Narrative Templates
  {
    id: 'short-film-drama',
    name: 'Short Film - Drama',
    description: 'A compelling 3-5 minute dramatic short with emotional arc, character development, and cinematic visuals.',
    genre: 'Drama',
    category: 'narrative',
    estimatedDuration: '3-5 minutes',
    difficulty: 'intermediate',
    tags: ['drama', 'emotional', 'character-driven', 'cinematic'],
    visualStyle: 'Cinematic',
    aspectRatio: '16:9',
    suggestedVisualStyles: ['Cinematic', 'Film Noir', 'Golden Hour', 'Moody'],
    suggestedAspectRatios: ['16:9', '2.39:1'],
    templateScenes: [
      { sceneNumber: 1, heading: 'INT. LOCATION - DAY', action: 'Opening scene establishing the protagonist and their world.', emotionalBeat: 'Introduction', duration: 45 },
      { sceneNumber: 2, heading: 'EXT. LOCATION - DAY', action: 'The inciting incident that disrupts the protagonist\'s life.', emotionalBeat: 'Conflict', duration: 60 },
      { sceneNumber: 3, heading: 'INT. LOCATION - NIGHT', action: 'Rising tension and emotional confrontation.', emotionalBeat: 'Climax', duration: 90 },
      { sceneNumber: 4, heading: 'EXT. LOCATION - DAY', action: 'Resolution and character transformation.', emotionalBeat: 'Resolution', duration: 45 },
    ],
  },
  {
    id: 'horror-short',
    name: 'Horror Short',
    description: 'A tense 2-3 minute horror piece with atmospheric tension, jump scares, and unsettling imagery.',
    genre: 'Horror',
    category: 'narrative',
    estimatedDuration: '2-3 minutes',
    difficulty: 'intermediate',
    tags: ['horror', 'suspense', 'atmospheric', 'thriller'],
    visualStyle: 'Dark Cinematic',
    aspectRatio: '16:9',
    suggestedVisualStyles: ['Dark Cinematic', 'Desaturated', 'High Contrast', 'Gothic'],
    suggestedAspectRatios: ['16:9', '2.39:1'],
    templateScenes: [
      { sceneNumber: 1, heading: 'INT. DARK LOCATION - NIGHT', action: 'Establishing an unsettling atmosphere. Something feels wrong.', emotionalBeat: 'Unease', duration: 30 },
      { sceneNumber: 2, heading: 'INT. DARK LOCATION - NIGHT', action: 'Strange occurrences begin. Tension builds.', emotionalBeat: 'Dread', duration: 45 },
      { sceneNumber: 3, heading: 'INT. DARK LOCATION - NIGHT', action: 'The horror reveals itself. Peak terror moment.', emotionalBeat: 'Terror', duration: 60 },
      { sceneNumber: 4, heading: 'INT/EXT. LOCATION - NIGHT', action: 'Ambiguous ending leaving audience unsettled.', emotionalBeat: 'Lingering dread', duration: 30 },
    ],
  },
  {
    id: 'comedy-sketch',
    name: 'Comedy Sketch',
    description: 'A punchy 1-2 minute comedy sketch with setup, escalation, and punchline.',
    genre: 'Comedy',
    category: 'narrative',
    estimatedDuration: '1-2 minutes',
    difficulty: 'beginner',
    tags: ['comedy', 'humor', 'sketch', 'funny'],
    visualStyle: 'Bright',
    aspectRatio: '16:9',
    suggestedVisualStyles: ['Bright', 'Colorful', 'Sitcom', 'Casual'],
    suggestedAspectRatios: ['16:9', '9:16'],
    templateScenes: [
      { sceneNumber: 1, heading: 'INT. EVERYDAY LOCATION - DAY', action: 'Setup: Establish the normal situation and characters.', emotionalBeat: 'Setup', duration: 20 },
      { sceneNumber: 2, heading: 'INT. SAME LOCATION - DAY', action: 'Complication: Something absurd happens or is revealed.', emotionalBeat: 'Escalation', duration: 30 },
      { sceneNumber: 3, heading: 'INT. SAME LOCATION - DAY', action: 'Punchline: The comedic payoff that lands the joke.', emotionalBeat: 'Punchline', duration: 20 },
    ],
  },
  {
    id: 'sci-fi-concept',
    name: 'Sci-Fi Concept',
    description: 'A visually stunning 2-4 minute science fiction piece exploring futuristic themes.',
    genre: 'Science Fiction',
    category: 'narrative',
    estimatedDuration: '2-4 minutes',
    difficulty: 'advanced',
    tags: ['sci-fi', 'futuristic', 'technology', 'visionary'],
    visualStyle: 'Cyberpunk',
    aspectRatio: '2.39:1',
    suggestedVisualStyles: ['Cyberpunk', 'Clean Futuristic', 'Neon Noir', 'Blade Runner'],
    suggestedAspectRatios: ['2.39:1', '16:9'],
    templateScenes: [
      { sceneNumber: 1, heading: 'EXT. FUTURISTIC CITY - NIGHT', action: 'Establishing the world and its advanced technology.', emotionalBeat: 'Wonder', duration: 40 },
      { sceneNumber: 2, heading: 'INT. HIGH-TECH FACILITY - DAY', action: 'Introduction of the central concept or conflict.', emotionalBeat: 'Discovery', duration: 50 },
      { sceneNumber: 3, heading: 'EXT/INT. VARIOUS - DAY/NIGHT', action: 'The implications of the technology unfold.', emotionalBeat: 'Consequence', duration: 60 },
      { sceneNumber: 4, heading: 'EXT. FUTURISTIC VISTA - DAWN', action: 'Philosophical conclusion about humanity and technology.', emotionalBeat: 'Reflection', duration: 40 },
    ],
  },
  {
    id: 'fantasy-adventure',
    name: 'Fantasy Adventure',
    description: 'An epic 3-5 minute fantasy journey with magical elements and heroic moments.',
    genre: 'Fantasy',
    category: 'narrative',
    estimatedDuration: '3-5 minutes',
    difficulty: 'advanced',
    tags: ['fantasy', 'adventure', 'magic', 'epic'],
    visualStyle: 'Epic Fantasy',
    aspectRatio: '2.39:1',
    suggestedVisualStyles: ['Epic Fantasy', 'Painterly', 'Magical Realism', 'Lord of the Rings'],
    suggestedAspectRatios: ['2.39:1', '16:9'],
    templateScenes: [
      { sceneNumber: 1, heading: 'EXT. MAGICAL REALM - DAY', action: 'Establishing the magical world and its beauty.', emotionalBeat: 'Wonder', duration: 45 },
      { sceneNumber: 2, heading: 'INT. ANCIENT STRUCTURE - DAY', action: 'The hero receives their quest or calling.', emotionalBeat: 'Call to adventure', duration: 50 },
      { sceneNumber: 3, heading: 'EXT. PERILOUS TERRAIN - DAY', action: 'The hero faces trials and demonstrates courage.', emotionalBeat: 'Challenge', duration: 80 },
      { sceneNumber: 4, heading: 'EXT. TRIUMPHANT LOCATION - SUNSET', action: 'Victory and transformation of the hero.', emotionalBeat: 'Triumph', duration: 50 },
    ],
  },

  // Commercial Templates
  {
    id: 'product-showcase',
    name: 'Product Showcase',
    description: 'A sleek 30-60 second product video highlighting features and benefits.',
    genre: 'Commercial',
    category: 'commercial',
    estimatedDuration: '30-60 seconds',
    difficulty: 'beginner',
    tags: ['product', 'commercial', 'marketing', 'showcase'],
    visualStyle: 'Clean Minimal',
    aspectRatio: '16:9',
    suggestedVisualStyles: ['Clean Minimal', 'Premium', 'Tech Modern', 'Lifestyle'],
    suggestedAspectRatios: ['16:9', '1:1', '9:16'],
    templateScenes: [
      { sceneNumber: 1, heading: 'PRODUCT REVEAL', action: 'Dramatic reveal of the product from darkness to light.', emotionalBeat: 'Intrigue', duration: 10 },
      { sceneNumber: 2, heading: 'FEATURE HIGHLIGHTS', action: 'Showcase key features with dynamic camera movements.', emotionalBeat: 'Desire', duration: 20 },
      { sceneNumber: 3, heading: 'IN USE', action: 'Product in real-world use showing benefits.', emotionalBeat: 'Connection', duration: 15 },
      { sceneNumber: 4, heading: 'CALL TO ACTION', action: 'Final product shot with branding and CTA.', emotionalBeat: 'Action', duration: 10 },
    ],
  },
  {
    id: 'brand-story',
    name: 'Brand Story',
    description: 'An emotional 1-2 minute brand video connecting with audience values.',
    genre: 'Commercial',
    category: 'commercial',
    estimatedDuration: '1-2 minutes',
    difficulty: 'intermediate',
    tags: ['brand', 'story', 'emotional', 'values'],
    visualStyle: 'Cinematic',
    aspectRatio: '16:9',
    suggestedVisualStyles: ['Cinematic', 'Documentary', 'Warm', 'Authentic'],
    suggestedAspectRatios: ['16:9', '2.39:1'],
    templateScenes: [
      { sceneNumber: 1, heading: 'THE PROBLEM', action: 'Showing the challenge or need the audience faces.', emotionalBeat: 'Recognition', duration: 20 },
      { sceneNumber: 2, heading: 'THE JOURNEY', action: 'The brand\'s story and passion for solving the problem.', emotionalBeat: 'Trust', duration: 30 },
      { sceneNumber: 3, heading: 'THE SOLUTION', action: 'How the brand delivers value and changes lives.', emotionalBeat: 'Hope', duration: 30 },
      { sceneNumber: 4, heading: 'THE VISION', action: 'The future the brand is building with its customers.', emotionalBeat: 'Inspiration', duration: 20 },
    ],
  },

  // Social Media Templates
  {
    id: 'tiktok-reel',
    name: 'TikTok/Reels Video',
    description: 'A fast-paced 15-60 second vertical video optimized for social engagement.',
    genre: 'Social',
    category: 'social',
    estimatedDuration: '15-60 seconds',
    difficulty: 'beginner',
    tags: ['tiktok', 'reels', 'social', 'viral', 'short-form'],
    visualStyle: 'Trendy',
    aspectRatio: '9:16',
    suggestedVisualStyles: ['Trendy', 'Bold', 'High Energy', 'Aesthetic'],
    suggestedAspectRatios: ['9:16'],
    templateScenes: [
      { sceneNumber: 1, heading: 'HOOK', action: 'Grab attention in the first 3 seconds.', emotionalBeat: 'Curiosity', duration: 5 },
      { sceneNumber: 2, heading: 'CONTENT', action: 'Deliver the main message or entertainment.', emotionalBeat: 'Engagement', duration: 15 },
      { sceneNumber: 3, heading: 'PAYOFF', action: 'Satisfying ending that encourages sharing.', emotionalBeat: 'Satisfaction', duration: 10 },
    ],
  },

  // Educational Templates
  {
    id: 'explainer-video',
    name: 'Explainer Video',
    description: 'A clear 2-3 minute educational video breaking down complex topics.',
    genre: 'Educational',
    category: 'educational',
    estimatedDuration: '2-3 minutes',
    difficulty: 'intermediate',
    tags: ['educational', 'explainer', 'tutorial', 'informative'],
    visualStyle: 'Clean',
    aspectRatio: '16:9',
    suggestedVisualStyles: ['Clean', 'Illustrated', 'Infographic', 'Modern'],
    suggestedAspectRatios: ['16:9'],
    templateScenes: [
      { sceneNumber: 1, heading: 'INTRODUCTION', action: 'Introduce the topic and why it matters.', emotionalBeat: 'Interest', duration: 20 },
      { sceneNumber: 2, heading: 'THE PROBLEM', action: 'Explain the challenge or question being addressed.', emotionalBeat: 'Understanding', duration: 30 },
      { sceneNumber: 3, heading: 'THE EXPLANATION', action: 'Break down the concept step by step.', emotionalBeat: 'Clarity', duration: 60 },
      { sceneNumber: 4, heading: 'KEY TAKEAWAYS', action: 'Recap the main points and next steps.', emotionalBeat: 'Confidence', duration: 30 },
    ],
  },

  // Experimental Templates
  {
    id: 'music-video-concept',
    name: 'Music Video Concept',
    description: 'An artistic 3-4 minute visual narrative designed to accompany music.',
    genre: 'Music Video',
    category: 'experimental',
    estimatedDuration: '3-4 minutes',
    difficulty: 'advanced',
    tags: ['music', 'artistic', 'visual', 'experimental'],
    visualStyle: 'Artistic',
    aspectRatio: '16:9',
    suggestedVisualStyles: ['Artistic', 'Abstract', 'Neon', 'Dreamlike'],
    suggestedAspectRatios: ['16:9', '2.39:1', '1:1'],
    templateScenes: [
      { sceneNumber: 1, heading: 'INTRO/VERSE 1', action: 'Set the mood and introduce visual themes.', emotionalBeat: 'Atmosphere', duration: 45 },
      { sceneNumber: 2, heading: 'CHORUS 1', action: 'Visual explosion matching musical peak.', emotionalBeat: 'Energy', duration: 30 },
      { sceneNumber: 3, heading: 'VERSE 2/BRIDGE', action: 'Development of visual narrative and themes.', emotionalBeat: 'Evolution', duration: 60 },
      { sceneNumber: 4, heading: 'FINAL CHORUS/OUTRO', action: 'Peak visual moment and satisfying conclusion.', emotionalBeat: 'Climax', duration: 45 },
    ],
  },
  {
    id: 'documentary-mini',
    name: 'Mini Documentary',
    description: 'A thoughtful 3-5 minute documentary piece exploring a subject in depth.',
    genre: 'Documentary',
    category: 'experimental',
    estimatedDuration: '3-5 minutes',
    difficulty: 'advanced',
    tags: ['documentary', 'real', 'interview', 'investigative'],
    visualStyle: 'Documentary',
    aspectRatio: '16:9',
    suggestedVisualStyles: ['Documentary', 'Raw', 'Journalistic', 'Authentic'],
    suggestedAspectRatios: ['16:9', '2.39:1'],
    templateScenes: [
      { sceneNumber: 1, heading: 'COLD OPEN', action: 'Hook the viewer with intriguing footage or statement.', emotionalBeat: 'Intrigue', duration: 30 },
      { sceneNumber: 2, heading: 'CONTEXT', action: 'Provide background and context for the subject.', emotionalBeat: 'Understanding', duration: 60 },
      { sceneNumber: 3, heading: 'DEEP DIVE', action: 'Explore the subject through multiple perspectives.', emotionalBeat: 'Depth', duration: 120 },
      { sceneNumber: 4, heading: 'CONCLUSION', action: 'Leave the viewer with something to think about.', emotionalBeat: 'Reflection', duration: 40 },
    ],
  },
];

const QUICK_START_WIZARDS: QuickStartWizard[] = [
  {
    id: 'story-from-idea',
    name: 'Story from Idea',
    description: 'Turn your idea into a complete storyboard in minutes.',
    steps: [
      {
        id: 'idea',
        title: 'Your Story Idea',
        description: 'Describe your story in a few sentences.',
        type: 'textarea',
        field: 'idea',
        placeholder: 'A young inventor discovers a way to communicate with plants...',
        required: true,
        validation: { minLength: 20, maxLength: 500 },
      },
      {
        id: 'genre',
        title: 'Genre',
        description: 'What genre best fits your story?',
        type: 'select',
        field: 'genre',
        required: true,
        options: [
          { value: 'Drama', label: 'Drama' },
          { value: 'Comedy', label: 'Comedy' },
          { value: 'Horror', label: 'Horror' },
          { value: 'Science Fiction', label: 'Science Fiction' },
          { value: 'Fantasy', label: 'Fantasy' },
          { value: 'Thriller', label: 'Thriller' },
          { value: 'Romance', label: 'Romance' },
          { value: 'Documentary', label: 'Documentary' },
        ],
      },
      {
        id: 'duration',
        title: 'Target Duration',
        description: 'How long should the final video be?',
        type: 'select',
        field: 'duration',
        required: true,
        options: [
          { value: '30', label: '30 seconds' },
          { value: '60', label: '1 minute' },
          { value: '120', label: '2 minutes' },
          { value: '180', label: '3 minutes' },
          { value: '300', label: '5 minutes' },
        ],
      },
      {
        id: 'style',
        title: 'Visual Style',
        description: 'Choose the look and feel.',
        type: 'select',
        field: 'visualStyle',
        required: true,
        options: [
          { value: 'Cinematic', label: 'Cinematic' },
          { value: 'Anime', label: 'Anime' },
          { value: 'Photorealistic', label: 'Photorealistic' },
          { value: 'Illustrated', label: 'Illustrated' },
          { value: 'Painterly', label: 'Painterly' },
          { value: 'Minimalist', label: 'Minimalist' },
        ],
      },
    ],
    resultTemplate: 'short-film-drama',
  },
  {
    id: 'product-video',
    name: 'Product Video',
    description: 'Create a professional product showcase video.',
    steps: [
      {
        id: 'product',
        title: 'Product Name',
        description: 'What product are you showcasing?',
        type: 'text',
        field: 'productName',
        placeholder: 'UltraWidget Pro',
        required: true,
      },
      {
        id: 'features',
        title: 'Key Features',
        description: 'List the main features to highlight (one per line).',
        type: 'textarea',
        field: 'features',
        placeholder: 'Fast charging\nWater resistant\nCompact design',
        required: true,
      },
      {
        id: 'audience',
        title: 'Target Audience',
        description: 'Who is this video for?',
        type: 'text',
        field: 'audience',
        placeholder: 'Tech-savvy millennials',
        required: true,
      },
      {
        id: 'platform',
        title: 'Platform',
        description: 'Where will this video be published?',
        type: 'select',
        field: 'platform',
        required: true,
        options: [
          { value: 'youtube', label: 'YouTube (16:9)' },
          { value: 'instagram', label: 'Instagram Feed (1:1)' },
          { value: 'tiktok', label: 'TikTok/Reels (9:16)' },
          { value: 'website', label: 'Website (16:9)' },
        ],
      },
    ],
    resultTemplate: 'product-showcase',
  },
  {
    id: 'social-content',
    name: 'Social Media Content',
    description: 'Create engaging short-form content for social platforms.',
    steps: [
      {
        id: 'topic',
        title: 'Content Topic',
        description: 'What is your video about?',
        type: 'text',
        field: 'topic',
        placeholder: '5 productivity tips for remote workers',
        required: true,
      },
      {
        id: 'platform',
        title: 'Platform',
        description: 'Which platform is this for?',
        type: 'select',
        field: 'platform',
        required: true,
        options: [
          { value: 'tiktok', label: 'TikTok' },
          { value: 'instagram-reels', label: 'Instagram Reels' },
          { value: 'youtube-shorts', label: 'YouTube Shorts' },
        ],
      },
      {
        id: 'tone',
        title: 'Tone',
        description: 'What vibe should the video have?',
        type: 'select',
        field: 'tone',
        required: true,
        options: [
          { value: 'funny', label: 'Funny/Humorous' },
          { value: 'informative', label: 'Informative/Educational' },
          { value: 'inspiring', label: 'Inspiring/Motivational' },
          { value: 'aesthetic', label: 'Aesthetic/Calming' },
          { value: 'dramatic', label: 'Dramatic/Intense' },
        ],
      },
    ],
    resultTemplate: 'tiktok-reel',
  },
];

export function getAllTemplates(): ProjectTemplate[] {
  return TEMPLATES;
}

export function getTemplateById(id: string): ProjectTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: ProjectTemplate['category']): ProjectTemplate[] {
  return TEMPLATES.filter(t => t.category === category);
}

export function getTemplatesByGenre(genre: string): ProjectTemplate[] {
  return TEMPLATES.filter(t => t.genre.toLowerCase() === genre.toLowerCase());
}

export function getTemplatesByDifficulty(difficulty: ProjectTemplate['difficulty']): ProjectTemplate[] {
  return TEMPLATES.filter(t => t.difficulty === difficulty);
}

export function searchTemplates(query: string): ProjectTemplate[] {
  const lowerQuery = query.toLowerCase();
  return TEMPLATES.filter(t => 
    t.name.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.genre.toLowerCase().includes(lowerQuery) ||
    t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

export function getAllWizards(): QuickStartWizard[] {
  return QUICK_START_WIZARDS;
}

export function getWizardById(id: string): QuickStartWizard | undefined {
  return QUICK_START_WIZARDS.find(w => w.id === id);
}

export function applyTemplate(template: ProjectTemplate): Partial<StoryState> {
  return {
    currentStep: 'breakdown',
    genre: template.genre,
    visualStyle: template.visualStyle,
    aspectRatio: template.aspectRatio,
    breakdown: convertTemplateToScreenplayScenes(template.templateScenes),
  };
}

export function getTemplateCategories(): Array<{
  id: ProjectTemplate['category'];
  name: string;
  description: string;
  icon: string;
}> {
  return [
    { id: 'narrative', name: 'Narrative', description: 'Story-driven films and shorts', icon: '🎬' },
    { id: 'commercial', name: 'Commercial', description: 'Product and brand videos', icon: '💼' },
    { id: 'educational', name: 'Educational', description: 'Explainers and tutorials', icon: '📚' },
    { id: 'social', name: 'Social Media', description: 'Short-form content', icon: '📱' },
    { id: 'experimental', name: 'Experimental', description: 'Art and music videos', icon: '🎨' },
  ];
}
