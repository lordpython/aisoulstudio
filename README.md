# LyricLens

**AI-Powered Video Production Platform**

Transform audio files or text topics into polished, cinematic videos with synchronized subtitles, AI-generated visuals, and professional narration. LyricLens combines multiple AI services to create engaging video content through an intelligent multi-agent pipeline.

---

## 🎬 Features

### Core Capabilities

- **🎥 Production Mode**: Generate complete videos from text topics using AI
  - Multi-agent orchestration for content planning, narration, and visual generation
  - Scene-by-scene breakdown with emotional tone and cinematography
  - Professional narration with style director notes
  - Automatic visual consistency across scenes

- **🎵 Visualizer Mode**: Create lyric videos from audio files
  - Audio transcription and lyric analysis
  - Synchronized subtitle generation
  - Word-level karaoke highlighting
  - Real-time audio visualization

- **🎨 Timeline Editor**: Professional video editing interface
  - Multi-track editing (Video, Audio, SFX, Subtitles)
  - Keyboard shortcuts and accessibility support
  - Scene synchronization
  - Playback controls with seek and zoom

- **🎶 AI Music Generation**: Create custom music tracks
  - Full songs with lyrics via Suno AI
  - Instrumental tracks
  - Custom style and mood selection
  - Audio upload and remix capabilities

- **🌍 Multi-language Support**: English and Arabic with RTL support
  - Automatic language detection
  - Arabic text reshaping
  - Right-to-left layout support
  - Bilingual subtitle generation

### Advanced Features

- **🤖 Multi-Agent AI System**: Intelligent workflow orchestration
  - Supervisor agent coordinates subagents
  - Specialized agents for import, content, media, and export
  - RAG (Retrieval-Augmented Generation) system for studio assistance
  - Fallback to monolithic agent mode

- **🎭 Visual Generation**: Multiple AI providers
  - **Gemini Imagen 4**: Photorealistic image generation
  - **DeAPI**: Image-to-video animation (LTX Video model)
  - **Veo 3.1**: Direct video generation from prompts
  - Character seed tracking for visual consistency

- **🎬 Professional Cinematography**
  - Ken Burns effects (pan/zoom)
  - Scene transitions (Fade, Dissolve, Zoom, Slide)
  - Shot type selection (close-up, medium, wide, etc.)
  - Camera movement animations
  - Lighting mood control

- **🔊 Audio Production**
  - Multi-track audio mixing (Narration, Music, SFX)
  - Ambient sound effects from Freesound
  - Volume balancing and ducking
  - Background music integration

---

## 🛠 Tech Stack

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4, Radix UI (shadcn/ui)
- **State Management**: Zustand with persistence
- **Routing**: React Router v7
- **Animations**: Framer Motion
- **Internationalization**: i18next

### Backend
- **Runtime**: Node.js with Express 5
- **Media Processing**: FFmpeg (WASM for browser, native for server)
- **Video Export**: Dual-engine rendering (client-side WASM or server-side native)
- **YouTube Import**: yt-dlp integration

### AI & Services
- **AI Orchestration**: LangChain with Google GenAI
- **LLM**: Google Gemini 3 Flash Preview, Gemini 2.5 Flash
- **TTS**: Gemini 2.5 Flash TTS with multiple voice personas
- **Image Generation**: Imagen 4 (Gemini), FLUX.1-schnell / Z-Image-Turbo (DeAPI)
- **Video Generation**: Veo 3.1 (Gemini), LTX Video (DeAPI)
- **Music Generation**: Suno AI API
- **Sound Effects**: Freesound API
- **Storage**: Google Cloud Storage (optional)
- **Tracing**: LangSmith (optional)

### Testing
- **Unit/Integration**: Vitest with jsdom
- **E2E**: Playwright
- **Property-Based**: fast-check

### Mobile
- **Framework**: Capacitor 8
- **Platforms**: iOS and Android

---

## 📦 Installation

### Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **npm** or **pnpm**
- **FFmpeg** (for server-side processing)
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt-get install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- **yt-dlp** (optional, for YouTube import)
  - macOS: `brew install yt-dlp`
  - Ubuntu/Debian: `sudo apt-get install yt-dlp`
  - Windows: Download from [yt-dlp.github.io](https://github.com/yt-dlp/yt-dlp)

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lyriclens-clean
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```
   
   **Note**: If you encounter peer dependency conflicts (especially with `dotenv`), the project includes an `.npmrc` file that uses `legacy-peer-deps=true` to resolve these conflicts. This is safe because `dotenv@17` is backward compatible with `dotenv@16`.

3. **Configure environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   # Required
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   
   # Optional - AI Services
   VITE_DEAPI_API_KEY=your_deapi_key_here
   VITE_SUNO_API_KEY=your_suno_key_here
   VITE_FREESOUND_API_KEY=your_freesound_key_here
   VITE_LANGSMITH_API_KEY=your_langsmith_key_here
   
   # Optional - Google Cloud (for Vertex AI and GCS)
   GOOGLE_CLOUD_PROJECT=your_project_id
   GOOGLE_CLOUD_LOCATION=us-central1
   
   # Optional - Multi-Agent System
   VITE_USE_MULTI_AGENT=true  # Set to false for monolithic agent mode
   ```

4. **Get API Keys**
   - **Gemini API**: [Google AI Studio](https://aistudio.google.com/apikey)
   - **DeAPI**: [deapi.ai](https://deapi.ai/)
   - **Suno**: [sunoapi.org](https://sunoapi.org/)
   - **Freesound**: [freesound.org](https://freesound.org/help/developers/)
   - **LangSmith**: [smith.langchain.com](https://smith.langchain.com/)

---

## 🚀 Development

### Start Development Servers

```bash
# Start frontend dev server (port 3000)
npm run dev

# Start backend server (port 3001)
npm run server

# Or run both concurrently
npm run dev:all

# Start with network access (for mobile testing)
npm run dev:all:host
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

### Available Scripts

```bash
# Development
npm run dev              # Start Vite dev server
npm run dev:host         # Start with network access
npm run server           # Start Express backend
npm run dev:all          # Run both frontend and backend

# Testing
npm test                 # Run Vitest unit/integration tests
npm run test:ui          # Run tests in watch mode with UI
npm run test:run         # Run tests once
npm run test:e2e         # Run Playwright E2E tests
npm run test:e2e:ui      # Run E2E tests with UI
npm run test:all         # Run all tests

# Build
npm run build            # Production build
npm run preview          # Preview production build

# Mobile (Capacitor)
npm run cap:sync         # Sync web assets to native projects
npm run cap:android      # Open Android project
npm run cap:ios          # Open iOS project
npm run build:mobile     # Build and sync for mobile
```

---

## 📁 Project Structure

```
lyriclens-clean/
├── components/              # React UI components
│   ├── TimelineEditor/      # Professional timeline interface
│   ├── chat/                # AI chat interface
│   ├── layout/              # Layout components (Header, Sidebar, etc.)
│   ├── ui/                  # Radix UI primitives (shadcn/ui)
│   ├── visualizer/          # Visualizer-specific components
│   └── *.tsx                # Feature components
│
├── services/                # Business logic (no React dependencies)
│   ├── ai/                  # AI orchestration
│   │   ├── productionAgent.ts    # Main production agent
│   │   ├── studioAgent.ts        # Studio chat agent
│   │   ├── subagents/            # Specialized subagents
│   │   └── rag/                  # RAG system for knowledge base
│   ├── ffmpeg/              # Video export and rendering
│   │   ├── exporters.ts           # Export logic
│   │   ├── frameRenderer.ts       # Canvas-based rendering
│   │   └── textRenderer.ts        # Subtitle rendering
│   ├── agent/               # LangChain agent tools
│   ├── prompt/              # Prompt engineering utilities
│   └── *.ts                 # Service modules (gemini, deapi, suno, etc.)
│
├── hooks/                   # Custom React hooks
│   ├── useVideoProduction*.ts    # Video production workflow
│   ├── useLyricLens.ts           # Visualizer workflow
│   └── useTimeline*.ts           # Timeline editor hooks
│
├── stores/                  # Zustand state management
│   └── appStore.ts          # Unified global state with persistence
│
├── router/                  # React Router configuration
│   ├── index.tsx            # Route definitions
│   ├── RouteLayout.tsx      # Layout wrapper
│   └── guards/              # Route guards (unsaved changes, etc.)
│
├── screens/                  # Screen components
│   ├── HomeScreen.tsx       # Landing page
│   ├── StudioScreen.tsx     # Production workspace
│   ├── VisualizerScreen.tsx # Lyric video creator
│   └── SettingsScreen.tsx    # Settings and API keys
│
├── constants/               # App constants
│   ├── languages.ts         # Language definitions
│   ├── layout.ts            # Layout constants
│   └── video.ts             # Video-related constants
│
├── utils/                   # Utility functions
│   ├── audioAnalysis.ts     # Audio frequency analysis
│   ├── srtParser.ts         # Subtitle parsing
│   └── platformUtils.ts     # Platform detection
│
├── types/                   # TypeScript type definitions
│   ├── types.ts             # Core types
│   └── audio-editor.ts      # Audio editor types
│
├── lib/                     # Library utilities
│   └── utils.ts             # Shared utilities (cn, etc.)
│
├── i18n/                    # Internationalization
│   ├── index.ts             # i18next configuration
│   ├── useLanguage.ts       # Language hook
│   └── locales/             # Translation files
│       ├── en.json
│       └── ar.json
│
├── public/                  # Static assets
│   ├── favicon.ico
│   └── *.png                # Images
│
├── server/                  # Express backend
│   └── index.ts             # API routes and middleware
│
├── App.tsx                  # Root component
├── index.tsx                # Entry point
├── index.html               # HTML template
├── index.css                # Global styles (Tailwind)
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Dependencies and scripts
```

---

## 🎯 Key Features in Detail

### 1. Multi-Agent Production Pipeline

The production system uses a supervisor-subagent architecture:

- **Supervisor Agent**: Orchestrates the workflow and delegates tasks
- **Import Subagent**: Handles initial media/topic input and validation
- **Content Subagent**: Plans narrative structure, generates scenes, validates session IDs
- **Media Subagent**: Generates audio (TTS/Suno) and visuals (Gemini/DeAPI)
- **Enhancement/Export Subagent**: Handles audio mixing, effects, and final export

Toggle between multi-agent and monolithic modes via `VITE_USE_MULTI_AGENT` environment variable.

### 2. Studio Chat Interface

AI-powered conversational interface for video creation:

- Natural language video creation requests
- Intent parsing and workflow triggering
- Quick action buttons for common tasks
- Context-aware responses with RAG system
- Conversation history persistence

### 3. Timeline Editor

Professional video editing interface:

- **Multi-track editing**: Video, Audio, SFX, and Subtitle tracks
- **Keyboard shortcuts**: 
  - `Space`: Play/pause
  - `Arrow keys`: Seek
  - `Tab`: Navigate clips
- **Accessibility**: Full ARIA support and screen reader compatibility
- **Scene synchronization**: Timeline syncs with scene editor
- **Playback controls**: Play, pause, seek, zoom

### 4. Visual Generation

Multiple AI providers for flexible visual creation:

- **Gemini Imagen 4**: Photorealistic images with character seed tracking
- **DeAPI**: 
  - Text-to-image (FLUX.1-schnell, Z-Image-Turbo)
  - Image-to-video animation (LTX Video model)
- **Veo 3.1**: Direct video generation from prompts

### 5. Audio Production

Comprehensive audio capabilities:

- **Narration**: Gemini 2.5 Flash TTS with style director notes
- **Music**: Suno AI integration for custom tracks
- **SFX**: Freesound library integration
- **Mixing**: Multi-track audio mixing with volume balancing

---

## 🔌 API Integrations

### Server Endpoints

The Express server (port 3001) provides these endpoints:

#### Video Export
- `POST /api/export/init` - Initialize export session
- `POST /api/export/chunk` - Upload frame batches
- `POST /api/export/finalize` - Finalize and render video

#### YouTube Import
- `POST /api/import/youtube` - Download audio from YouTube URL

#### AI Generation (Proxied)
- `POST /api/gemini/proxy/generateContent` - Generate text content
- `POST /api/gemini/proxy/generateImages` - Generate images
- `POST /api/gemini/image` - Deprecated legacy image generation endpoint
- `POST /api/deapi/image` - Deprecated legacy DeAPI text-to-image endpoint
- `POST /api/deapi/animate` - Deprecated legacy DeAPI image-to-video endpoint
- `POST /api/deapi/img2video` - Full img2video with file upload
- `POST /api/director/generate` - Generate video prompts

#### Music (Suno)
- `POST /api/suno/proxy/*` - Proxy to Suno API
- `POST /api/suno/upload` - Upload audio for processing

#### Health Check
- `GET /api/health` - Server status

---

## 🧪 Testing

### Unit & Integration Tests

```bash
# Run all tests
npm test

# Watch mode with UI
npm run test:ui

# Run once
npm run test:run
```

Tests are located in the `test/` directory and use Vitest with jsdom.

### E2E Tests

```bash
# Run E2E tests (requires dev server)
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run specific test
npx playwright test e2e/timeline-full-integration.spec.ts --headed
```

E2E tests use Playwright and are located in the `e2e/` directory.

### Property-Based Tests

Complex logic is validated using fast-check for property-based testing, ensuring correctness across many inputs.

---

## 📱 Mobile Support

LyricLens supports iOS and Android via Capacitor:

```bash
# Build for mobile
npm run build:mobile

# Sync assets
npm run cap:sync

# Open native projects
npm run cap:ios      # Opens Xcode
npm run cap:android  # Opens Android Studio
```

**Note**: FFmpeg WASM doesn't work in mobile WebViews. Use server-side export via `/api/export` endpoints.

---

## 🚢 Build & Deploy

### Production Build

```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

The build output is in the `dist/` directory.

### Environment Variables for Production

Ensure all required API keys are set in your production environment:

```env
VITE_GEMINI_API_KEY=your_key
VITE_DEAPI_API_KEY=your_key  # Optional
VITE_SUNO_API_KEY=your_key   # Optional
VITE_FREESOUND_API_KEY=your_key  # Optional
```

### Deployment Considerations

- **Frontend**: Deploy `dist/` to any static hosting (Vercel, Netlify, etc.)
- **Backend**: Deploy Express server to Node.js hosting (Railway, Render, etc.)
- **FFmpeg**: Ensure FFmpeg is installed on the server
- **CORS**: Configure CORS for your frontend domain
- **Environment Variables**: Set all required API keys

---

## 🎨 Customization

### Styling

The app uses Tailwind CSS 4 with a custom design system. Modify `index.css` for global styles and theme variables.

### Internationalization

Add new languages by:
1. Creating a new JSON file in `i18n/locales/`
2. Adding language configuration in `constants/languages.ts`
3. Updating `i18n/index.ts` to include the new language

### Adding New AI Providers

1. Create a new service in `services/`
2. Add API proxy routes in `server/index.ts`
3. Integrate with the media subagent in `services/ai/subagents/mediaSubagent.ts`

---

## 🐛 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **FFmpeg not found** | Install FFmpeg and ensure it's in PATH |
| **API key errors** | Check `.env.local` file and restart dev server |
| **CORS errors** | Ensure backend server is running on port 3001 |
| **Video export fails** | Check browser console for errors, try server-side export |
| **Mobile export failing** | Use Cloud render engine—WebView lacks SharedArrayBuffer |
| **Arabic text garbled** | Ensure RTL rendering is enabled and Arabic reshaping is active |
| **Peer dependency conflicts** | The `.npmrc` file handles this automatically. If issues persist, use `npm install --legacy-peer-deps` |
| **npm audit warnings** | See `DEPENDENCY_NOTES.md` for details on known security issues and why they're not auto-fixed |

### Debug Mode

Enable verbose logging by setting:
```env
VITE_DEBUG=true
```

---

## 📚 Documentation

- **Architecture**: See `CODEBASE_DOCUMENTATION.md` (if present)
- **Workflow**: See `LYRICLENS-WORKFLOW.md` (if present)
- **Multi-Agent Guide**: See `MULTI_AGENT_GUIDE.md` (if present)
- **API Documentation**: See inline JSDoc comments in service files

---

## 🤝 Contributing

1. Follow the code style (TypeScript strict mode, ESLint rules)
2. Write tests for new features
3. Use property-based tests for complex logic
4. Add E2E tests for user workflows
5. Update documentation
6. Ensure accessibility (ARIA labels, keyboard navigation)

---

## 📄 License

[Your License Here]

---

## 🙏 Acknowledgments

- **Google Gemini** for AI capabilities
- **Suno AI** for music generation
- **DeAPI** for image-to-video animation
- **Freesound** for sound effects library
- **FFmpeg** for video processing
- **LangChain** for AI orchestration
- **Radix UI** for accessible components

---

## 📞 Support

For issues and questions:
- Open a GitHub issue
- Check existing documentation
- Review inline code comments

---

**Built with ❤️ using React, TypeScript, and AI**
