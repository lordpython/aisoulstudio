/// <reference types="vitest" />
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import Sitemap from "vite-plugin-sitemap";

// TEMPORARY: Filter out known Tailwind v4 PostCSS warning (upstream issue, cosmetic only)
const originalWarn = console.warn;
console.warn = (...args) => {
  const msg = args[0];
  if (
    typeof msg === "string" &&
    msg.includes("did not pass the `from` option")
  ) {
    return;
  }
  originalWarn.apply(console, args);
};

export default defineConfig(({ mode }) => {
  // Load env from .env files at workspace root (two levels up from packages/frontend/)
  const viteEnv = loadEnv(mode, "../../", "VITE_");
  const allEnv = loadEnv(mode, "../../", "");

  const isMobileBuild = process.env.CAPACITOR_BUILD === "true";

  const vertexProject = allEnv.GOOGLE_CLOUD_PROJECT || "";
  const vertexLocation = allEnv.GOOGLE_CLOUD_LOCATION || "us-central1";

  console.log(`[Vite Config] Vertex AI Project: ${vertexProject || "NOT SET"}`);
  console.log(`[Vite Config] Vertex AI Location: ${vertexLocation}`);

  // Path to shared package source
  const sharedSrc = path.resolve(__dirname, "../shared/src");

  return {
    // Use relative paths for Capacitor mobile builds
    base: isMobileBuild ? "./" : "/",
    // Load .env files from workspace root (where the actual .env lives)
    envDir: path.resolve(__dirname, "../../"),
    server: {
      port: 3000,
      host: true,
      // Note: COOP/COEP headers for SharedArrayBuffer (FFmpeg WASM) are NOT set
      // in dev mode because they break Firebase Auth popups/iframes.
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
        },
      },
    },
    plugins: [
      react(),
      Sitemap({
        hostname: process.env.VITE_APP_URL || "https://yourdomain.com",
        dynamicRoutes: [
          "/",
          "/projects",
          "/studio",
          "/visualizer",
          "/signin",
        ],
        exclude: ["/404", "/api/*"],
        changefreq: "monthly",
        priority: 0.7,
        lastmod: new Date(),
        robots: [
          {
            userAgent: "*",
            allow: "/",
            disallow: ["/api/"],
          },
        ],
        readable: true,
      }),
    ],
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },
    define: {
      "process.env.GOOGLE_CLOUD_PROJECT": JSON.stringify(vertexProject),
      "process.env.GOOGLE_CLOUD_LOCATION": JSON.stringify(vertexLocation),
      // SECURITY WARNING: API keys exposed client-side in development mode.
      // This is required because LangChain agents in shared/src/services/agent/ run client-side.
      // 
      // TODO: Refactor to eliminate this security risk:
      //   1. Move agent logic (agentCore.ts, importTools.ts, enhancementTools.ts) to server
      //   2. Create /api/agent/* endpoints for agent operations
      //   3. Update frontend to call server endpoints instead of running agents directly
      //   4. Remove these client-side key definitions
      //
      // Note: Production builds do NOT expose these keys (mode !== "development" guard).
      "process.env.VITE_GEMINI_API_KEY": JSON.stringify(
        allEnv.VITE_GEMINI_API_KEY || viteEnv.VITE_GEMINI_API_KEY || "",
      ),
      "process.env.GOOGLE_API_KEY": JSON.stringify(
        allEnv.VITE_GEMINI_API_KEY || viteEnv.VITE_GEMINI_API_KEY || "",
      ),
      "process.env.VITE_DEAPI_API_KEY": JSON.stringify(
        allEnv.VITE_DEAPI_API_KEY || viteEnv.VITE_DEAPI_API_KEY || "",
      ),
      "process.env.DEAPI_API_KEY": JSON.stringify(
        allEnv.VITE_DEAPI_API_KEY || viteEnv.VITE_DEAPI_API_KEY || "",
      ),
    },
    resolve: {
      alias: [
        // Shared package aliases — must come BEFORE the catch-all "@" alias
        // Order matters: Vite uses the first matching alias
        { find: /^@\/services(.*)$/, replacement: `${sharedSrc}/services$1` },
        { find: /^@\/types(.*)$/, replacement: `${sharedSrc}/types$1` },
        { find: /^@\/constants(.*)$/, replacement: `${sharedSrc}/constants$1` },
        { find: /^@\/utils(.*)$/, replacement: `${sharedSrc}/utils$1` },
        { find: /^@\/lib(.*)$/, replacement: `${sharedSrc}/lib$1` },
        { find: /^@\/stores(.*)$/, replacement: `${sharedSrc}/stores$1` },
        // Catch-all: everything else (@/components, @/hooks, etc.) stays in frontend
        { find: "@", replacement: path.resolve(__dirname, ".") },
      ],
    },
    optimizeDeps: {
      exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: [],
      include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      exclude: ["node_modules", "dist", "e2e/**"],
    },
    build: {
      // Warn when any single chunk exceeds 600 kB (before compression)
      chunkSizeWarningLimit: 600,
      // Use terser for better dead-code elimination in production
      minify: "esbuild",
      // Inline small assets to reduce round-trips
      assetsInlineLimit: 4096,
      rollupOptions: {
        output: {
          // Content-hash file names for optimal long-term caching
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
          manualChunks(id) {
            // Vendor: Google Generative AI SDK
            if (id.includes("node_modules/@google/genai")) {
              return "vendor-genai";
            }
            // Vendor: Framer Motion
            if (id.includes("node_modules/framer-motion")) {
              return "vendor-motion";
            }
            // Vendor: Radix UI primitives — split per-package to allow granular loading
            if (id.includes("node_modules/@radix-ui")) {
              return "vendor-radix";
            }
            // Vendor: Firebase — large SDK (~345 kB) isolated so app chunks
            // that don't need Firebase don't pay its full bundle cost.
            if (
              id.includes("node_modules/firebase") ||
              id.includes("node_modules/@firebase")
            ) {
              return "vendor-firebase";
            }
            // Vendor: i18next — internationalization runtime
            if (id.includes("node_modules/i18next") || id.includes("node_modules/react-i18next")) {
              return "vendor-i18n";
            }
            // Vendor: Lucide icons — tree-shaken but still sizeable
            if (id.includes("node_modules/lucide-react")) {
              return "vendor-icons";
            }
            // Vendor: LangChain — AI orchestration, only used by agent paths
            if (id.includes("node_modules/@langchain") || id.includes("node_modules/langchain")) {
              return "vendor-langchain";
            }
            // Vendor: Capacitor — mobile runtime, never needed on web
            if (id.includes("node_modules/@capacitor")) {
              return "vendor-capacitor";
            }
            return undefined;
          },
        },
        // Tree-shake unused exports at build time
        treeshake: {
          preset: "recommended",
          moduleSideEffects: false,
        },
      },
    },
  };
});
