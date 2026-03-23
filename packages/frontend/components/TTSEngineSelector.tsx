import { useEffect, useState } from 'react';
import type { TTSProvider, DeApiTtsModel } from '@/services/narratorService';
import { DEAPI_TTS_MODELS } from '@/services/narratorService';

interface TTSEngineSelectorProps {
  onSelect: (provider: TTSProvider, model?: DeApiTtsModel) => void;
  defaultProvider?: TTSProvider;
  defaultModel?: DeApiTtsModel;
}

export function TTSEngineSelector({ 
  onSelect, 
  defaultProvider = 'gemini',
  defaultModel = DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN
}: TTSEngineSelectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<TTSProvider>(defaultProvider);
  const [selectedModel, setSelectedModel] = useState<DeApiTtsModel>(defaultModel);

  useEffect(() => {
    setSelectedProvider(defaultProvider);
  }, [defaultProvider]);

  useEffect(() => {
    setSelectedModel(defaultModel);
  }, [defaultModel]);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value as TTSProvider;
    setSelectedProvider(provider);
    
    // Reset to default model when switching providers
    if (provider === 'deapi_qwen') {
      setSelectedModel(DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN);
      onSelect(provider, DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN);
    } else {
      onSelect(provider);
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const model = e.target.value as DeApiTtsModel;
    setSelectedModel(model);
    onSelect(selectedProvider, model);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-200">
          Voice Generation Engine
        </label>
        <select 
          value={selectedProvider} 
          onChange={handleProviderChange}
          className="p-2 bg-gray-900 border border-gray-700 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="gemini">Gemini 2.5 Flash (Standard)</option>
          <option value="deapi_qwen">Qwen3 VoiceDesign (Alternative)</option>
        </select>
        <p className="text-xs text-gray-400">
          {selectedProvider === 'gemini' 
            ? "Best for dramatic, multi-character narration with high-quality voice acting." 
            : "Best for custom voice design and bypassing Gemini rate limits."}
        </p>
      </div>

      {selectedProvider === 'deapi_qwen' && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-gray-200">
            DeAPI TTS Model
          </label>
          <select 
            value={selectedModel} 
            onChange={handleModelChange}
            className="p-2 bg-gray-900 border border-gray-700 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value={DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN}>
              Qwen3 VoiceDesign (12Hz 1.7B)
            </option>
            {/* Add more models here as they become available */}
          </select>
          <div className="text-xs text-gray-400 space-y-1">
            <p>• <strong>Qwen3 VoiceDesign:</strong> 12Hz model with voice design capabilities</p>
            <p>• Max 5000 characters, supports 9 languages</p>
            <p>• MP3 format, 24kHz sample rate</p>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
        <p className="font-medium mb-1">Quick Comparison:</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="font-medium text-blue-400">Gemini</p>
            <p>• Premium quality</p>
            <p>• Rate limited</p>
            <p>• WAV format</p>
          </div>
          <div>
            <p className="font-medium text-green-400">Qwen3</p>
            <p>• Voice design</p>
            <p>• Higher limits</p>
            <p>• MP3 format</p>
          </div>
        </div>
      </div>
    </div>
  );
}
