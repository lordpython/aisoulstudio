/// <reference types="vitest" />
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";

// TEMPORARY: Filter out known Tailwind v4 PostCSS warning (upstream issue, cosmetic only)
// TODO: Remove this when Tailwind v4 fixes the PostCSS warning
// Issue: https://github.com/tailwindlabs/tailwindcss/issues/XXXX
const originalWarn = console.warn;
console.warn = (...args) => {
  const msg = args[0];
  if (
    typeof msg === "string" &&
    msg.includes("did not pass the `from` option")
  ) {
    // Known Tailwind v4 PostCSS warning - safe to suppress
    return;
  }
  originalWarn.apply(console, args);
};

export default defineConfig(({ mode }) => {
  // Load env from .env files
  // First load VITE_ prefixed vars (default behavior)
  const viteEnv = loadEnv(mode, ".", "VITE_");
  // Then load all vars including non-prefixed ones
  const allEnv = loadEnv(mode, ".", "");
  
  const isMobileBuild = process.env.CAPACITOR_BUILD === 'true';
  
  // Vertex AI configuration
  const vertexProject = allEnv.GOOGLE_CLOUD_PROJECT || "";
  const vertexLocation = allEnv.GOOGLE_CLOUD_LOCATION || "us-central1";
  
  // Debug: Log Vertex AI configuration (non-sensitive)
  console.log(`[Vite Config] Vertex AI Project: ${vertexProject || "NOT SET"}`);
  console.log(`[Vite Config] Vertex AI Location: ${vertexLocation}`);

  return {
    // Use relative paths for Capacitor mobile builds
    base: isMobileBuild ? './' : '/',
    server: {
      port: 3000,
      host: "localhost",
      // COOP/COEP headers for SharedArrayBuffer (FFmpeg WASM) - web only
      // These headers break mobile WebViews, so only apply in web dev mode
      headers: isMobileBuild ? {} : {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      // Proxy API requests to Express server (port 3001)
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },
    define: {
      "process.env.GOOGLE_CLOUD_PROJECT": JSON.stringify(vertexProject),
      "process.env.GOOGLE_CLOUD_LOCATION": JSON.stringify(vertexLocation),
      // Restore API keys for client-side LangChain agents that cannot easily use the proxy.
      // TODO: Refactor agents to run on server-side to remove this security risk.
      ...(mode === 'development' && {
        "process.env.VITE_GEMINI_API_KEY": JSON.stringify(
          allEnv.VITE_GEMINI_API_KEY || viteEnv.VITE_GEMINI_API_KEY || "",
        ),
        "process.env.VITE_DEAPI_API_KEY": JSON.stringify(
          allEnv.VITE_DEAPI_API_KEY || viteEnv.VITE_DEAPI_API_KEY || "",
        ),
        "process.env.DEAPI_API_KEY": JSON.stringify(allEnv.VITE_DEAPI_API_KEY || viteEnv.VITE_DEAPI_API_KEY || ""),
      }),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    optimizeDeps: {
      include: [
        // Force proper ESM interop for CJS modules used by langchain
        "camelcase",
        "decamelize",
      ],
      exclude: [
        "@ffmpeg/ffmpeg",
        "@ffmpeg/util",
      ],
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: [], // Add setup files if needed later
      include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      exclude: ['node_modules', 'dist', 'e2e/**'], // Exclude E2E tests (run with Playwright)
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-genai': ['@google/genai'],
            'vendor-motion': ['framer-motion'],
            'vendor-radix': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-select',
              '@radix-ui/react-scroll-area',
              '@radix-ui/react-slider',
              '@radix-ui/react-switch',
              '@radix-ui/react-progress',
            ],
          },
        },
      },
    },
  };
});
