import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.lyriclens.app',
    appName: 'LyricLens',
    webDir: 'dist',
    server: {
        // Allow loading resources from the web (for API calls)
        androidScheme: 'https',
    },
    plugins: {
        // Filesystem plugin configuration
        Filesystem: {
            // Enable reading from external storage on Android
        },
    },
    android: {
        // Allow mixed content for development
        allowMixedContent: true,
    },
    ios: {
        // iOS-specific settings
        contentInset: 'automatic',
    },
};

export default config;
