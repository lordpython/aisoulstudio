import { Capacitor } from '@capacitor/core';

/**
 * Platform detection utilities for Capacitor mobile apps
 */

/**
 * Check if running in a native mobile environment (Capacitor)
 */
export const isNative = (): boolean => {
    return Capacitor.isNativePlatform();
};

/**
 * Check if running on Android
 */
export const isAndroid = (): boolean => {
    return Capacitor.getPlatform() === 'android';
};

/**
 * Check if running on iOS
 */
export const isIOS = (): boolean => {
    return Capacitor.getPlatform() === 'ios';
};

/**
 * Check if running in a web browser (not native)
 */
export const isWeb = (): boolean => {
    return Capacitor.getPlatform() === 'web';
};

/**
 * Get the current platform name
 */
export const getPlatformName = (): 'android' | 'ios' | 'web' => {
    return Capacitor.getPlatform() as 'android' | 'ios' | 'web';
};

/**
 * Check if FFmpeg WASM is supported on current platform
 * FFmpeg WASM requires SharedArrayBuffer which is not available in mobile WebViews
 */
export const isFFmpegWasmSupported = (): boolean => {
    // WASM FFmpeg requires SharedArrayBuffer and specific headers
    // These are typically not available in mobile WebViews
    if (isNative()) {
        return false;
    }

    // Check for SharedArrayBuffer support (required for WASM threading)
    try {
        return typeof SharedArrayBuffer !== 'undefined';
    } catch {
        return false;
    }
};

/**
 * Get the recommended export engine based on platform capabilities
 */
export const getRecommendedExportEngine = (): 'cloud' | 'browser' => {
    if (isNative() || !isFFmpegWasmSupported()) {
        return 'cloud';
    }
    return 'browser';
};

/**
 * Check if the device has touch capability
 */
export const isTouchDevice = (): boolean => {
    return isNative() || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};
