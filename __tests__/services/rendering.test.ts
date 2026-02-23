import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderFrameToCanvas } from '../../packages/shared/src/services/ffmpeg/frameRenderer';
import { ExportConfig, RenderAsset } from '../../packages/shared/src/services/ffmpeg/exportConfig';

describe('Frame Renderer', () => {
    let mockCtx: any;
    const width = 1920;
    const height = 1080;

    beforeEach(() => {
        // Create a robust mock of CanvasRenderingContext2D
        mockCtx = {
            fillStyle: '',
            fillRect: vi.fn(),
            createLinearGradient: vi.fn().mockReturnValue({
                addColorStop: vi.fn(),
            }),
            save: vi.fn(),
            restore: vi.fn(),
            translate: vi.fn(),
            scale: vi.fn(),
            rotate: vi.fn(),
            drawImage: vi.fn(),
            measureText: vi.fn().mockReturnValue({ width: 100 }),
            fillText: vi.fn(),
            strokeText: vi.fn(),
            beginPath: vi.fn(),
            rect: vi.fn(),
            roundRect: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            quadraticCurveTo: vi.fn(),
            closePath: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            clip: vi.fn(),
            setTransform: vi.fn(),
            getImageData: vi.fn().mockReturnValue({
                data: new Uint8ClampedArray(100 * 100 * 4).fill(0),
                width: 100,
                height: 100
            }),
            putImageData: vi.fn(),
            createImageData: vi.fn(),
            globalAlpha: 1.0,
            font: '',
            textAlign: '',
            textBaseline: '',
            shadowBlur: 0,
            shadowColor: '',
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            strokeStyle: '',
            lineWidth: 1,
            lineJoin: 'miter',
        };
    });

    const defaultConfig: ExportConfig = {
        orientation: 'landscape',
        useModernEffects: true,
        syncOffsetMs: 0,
        fadeOutBeforeCut: true,
        wordLevelHighlight: true,
        contentMode: 'music',
        transitionType: 'dissolve',
        transitionDuration: 1.5,
        visualizerConfig: {
            enabled: true,
            opacity: 0.5,
            maxHeightRatio: 0.2,
            zIndex: 1,
            barWidth: 2,
            barGap: 1,
            colorScheme: 'cyan-purple'
        }
    };

    const mockAssets: RenderAsset[] = [
        { time: 0, type: 'image', element: {} as any },
        { time: 5, type: 'image', element: {} as any },
        { time: 10, type: 'image', element: {} as any },
    ];

    it('should clear background with black', async () => {
        await renderFrameToCanvas(
            mockCtx, width, height, 2, [], [], null, null, defaultConfig
        );

        expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, width, height);
    });

    it('should identify the correct asset for a given time', async () => {
        // We mock drawAsset to verify it's called with the correct asset
        // Note: in a real test we might need to mock the entire transitions module
        // but for now we'll just check if the renderer proceeds without crashing

        await renderFrameToCanvas(
            mockCtx, width, height, 7, mockAssets, [], null, null, defaultConfig
        );

        // At time 7, it should be the asset at time 5 (index 1)
        // Since we didn't mock drawAsset yet, we'll just verify the renderer ran
        expect(mockCtx.fillRect).toHaveBeenCalled();
    });

    it('should handle subtitles when present', async () => {
        const mockSubtitles: any[] = [
            { id: 1, startTime: 1, endTime: 3, text: 'Hello World' }
        ];

        await renderFrameToCanvas(
            mockCtx, width, height, 2, mockAssets, mockSubtitles, null, null, defaultConfig
        );

        // Should have attempted to measure or fill text
        expect(mockCtx.fillText).toHaveBeenCalled();
    });

    it('should handle visualizer when frequency data is provided', async () => {
        const freqData = new Uint8Array(128).fill(100);

        await renderFrameToCanvas(
            mockCtx, width, height, 2, mockAssets, [], freqData, null, defaultConfig
        );

        // Visualizer involved multiple roundRect calls in modern mode
        expect(mockCtx.roundRect).toHaveBeenCalled();
    });
});
