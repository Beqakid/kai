// ── TTS Provider Abstraction ──
// Phase 4: Real text-to-speech with Cloudflare Workers AI, OpenAI TTS, and ElevenLabs.

import { TTSProviderName, TTSVoiceConfig, Env } from '../types';
import { Errors } from '../errors';

/** Result from TTS synthesis */
export interface TTSSynthesisResult {
  audioData: ArrayBuffer | null; // Raw audio bytes
  audioFormat: string; // MIME type (e.g. 'audio/wav')
  audioUrl: string | null; // External URL (for providers that host audio)
  durationMs?: number;
}

/** Interface all TTS providers must implement */
export interface TTSProvider {
  readonly name: TTSProviderName;
  synthesize(params: {
    text: string;
    sessionId: string;
    voice: TTSVoiceConfig;
  }): Promise<TTSSynthesisResult>;
}

// ── Default voice config ──
export const DEFAULT_VOICE_CONFIG: TTSVoiceConfig = {
  voiceName: 'en_us-female',
  language: 'en',
  speed: 1.0,
};

/** Get voice config from env overrides or defaults */
export function getVoiceConfig(env: Env): TTSVoiceConfig {
  return {
    voiceName: env.KAI_TTS_VOICE || DEFAULT_VOICE_CONFIG.voiceName,
    language: env.KAI_TTS_LANGUAGE || DEFAULT_VOICE_CONFIG.language,
    speed: env.KAI_TTS_SPEED ? parseFloat(env.KAI_TTS_SPEED) : DEFAULT_VOICE_CONFIG.speed,
  };
}

// ── Mock TTS — returns null audio (silent) ──

export class MockTTSProvider implements TTSProvider {
  readonly name: TTSProviderName = 'mock';

  async synthesize(_params: { text: string; sessionId: string; voice: TTSVoiceConfig }): Promise<TTSSynthesisResult> {
    await new Promise((r) => setTimeout(r, 100));
    return {
      audioData: null,
      audioFormat: 'audio/wav',
      audioUrl: null,
    };
  }
}

// ── Cloudflare Workers AI TTS ──
// Uses @cf/myshell/melotts (MeloTTS) — multilingual, runs on Workers AI

export class CloudflareAITTSProvider implements TTSProvider {
  readonly name: TTSProviderName = 'cloudflare-ai';
  private ai: { run(model: string, input: Record<string, unknown>): Promise<unknown> };

  constructor(ai: Env['AI']) {
    if (!ai) {
      throw Errors.providerNotConfigured('Cloudflare AI TTS', 'AI binding not available. Add [ai] to wrangler.toml.');
    }
    this.ai = ai;
  }

  async synthesize(params: { text: string; sessionId: string; voice: TTSVoiceConfig }): Promise<TTSSynthesisResult> {
    try {
      // MeloTTS supports: en_us, en_br, es, fr, zh, ja, ko
      const langMap: Record<string, string> = {
        en: 'en_us',
        'en-us': 'en_us',
        'en-gb': 'en_br',
        es: 'es',
        fr: 'fr',
        zh: 'zh',
        ja: 'ja',
        ko: 'ko',
      };

      const lang = langMap[params.voice.language.toLowerCase()] || 'en_us';

      const result = await this.ai.run('@cf/myshell/melotts', {
        text: params.text,
        language: lang,
        // Speed control if supported
        ...(params.voice.speed && params.voice.speed !== 1.0 ? { speed: params.voice.speed } : {}),
      });

      // MeloTTS returns an ArrayBuffer of WAV audio
      if (result instanceof ArrayBuffer) {
        return {
          audioData: result,
          audioFormat: 'audio/wav',
          audioUrl: null,
          durationMs: estimateDurationMs(params.text),
        };
      }

      // Some models return a Response or ReadableStream
      if (result instanceof Response) {
        const buffer = await result.arrayBuffer();
        return {
          audioData: buffer,
          audioFormat: 'audio/wav',
          audioUrl: null,
          durationMs: estimateDurationMs(params.text),
        };
      }

      console.warn('Cloudflare AI TTS: unexpected result type, falling back to null audio');
      return { audioData: null, audioFormat: 'audio/wav', audioUrl: null };
    } catch (err) {
      console.error('Cloudflare AI TTS error:', err);
      // Graceful fallback — text will still be shown
      return { audioData: null, audioFormat: 'audio/wav', audioUrl: null };
    }
  }
}

// ── OpenAI TTS ──
// Uses OpenAI's /v1/audio/speech endpoint (tts-1 or tts-1-hd)

export class OpenAITTSProvider implements TTSProvider {
  readonly name: TTSProviderName = 'openai-tts';
  private apiKey: string;

  constructor(apiKey?: string) {
    if (!apiKey) {
      throw Errors.providerNotConfigured('OpenAI TTS', 'Set OPENAI_API_KEY secret.');
    }
    this.apiKey = apiKey;
  }

  async synthesize(params: { text: string; sessionId: string; voice: TTSVoiceConfig }): Promise<TTSSynthesisResult> {
    // OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
    // Default to 'nova' — clear, calm, assistant-like
    const voiceMap: Record<string, string> = {
      'en_us-female': 'nova',
      'en_us-male': 'onyx',
      nova: 'nova',
      alloy: 'alloy',
      echo: 'echo',
      fable: 'fable',
      onyx: 'onyx',
      shimmer: 'shimmer',
    };

    const voice = voiceMap[params.voice.voiceName] || 'nova';

    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: params.text,
          voice,
          response_format: 'mp3',
          speed: params.voice.speed ?? 1.0,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.error(`OpenAI TTS error ${response.status}: ${errBody}`);
        return { audioData: null, audioFormat: 'audio/mp3', audioUrl: null };
      }

      const buffer = await response.arrayBuffer();
      return {
        audioData: buffer,
        audioFormat: 'audio/mp3',
        audioUrl: null,
        durationMs: estimateDurationMs(params.text),
      };
    } catch (err) {
      console.error('OpenAI TTS error:', err);
      return { audioData: null, audioFormat: 'audio/mp3', audioUrl: null };
    }
  }
}

// ── ElevenLabs TTS ──
// Uses ElevenLabs v1 text-to-speech API

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name: TTSProviderName = 'elevenlabs';
  private apiKey: string;

  constructor(apiKey?: string) {
    if (!apiKey) {
      throw Errors.providerNotConfigured('ElevenLabs TTS', 'Set ELEVENLABS_API_KEY secret.');
    }
    this.apiKey = apiKey;
  }

  async synthesize(params: { text: string; sessionId: string; voice: TTSVoiceConfig }): Promise<TTSSynthesisResult> {
    // ElevenLabs voice IDs — default to "Rachel" (calm, clear)
    const voiceMap: Record<string, string> = {
      'en_us-female': '21m00Tcm4TlvDq8ikWAM', // Rachel
      'en_us-male': 'VR6AewLTigWG4xSOukaG', // Arnold
      rachel: '21m00Tcm4TlvDq8ikWAM',
      domi: 'AZnzlk1XvdvUeBnXmlld',
      bella: 'EXAVITQu4vr4xnSDxMaL',
    };

    const voiceId = voiceMap[params.voice.voiceName] || voiceMap['en_us-female'];

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: params.text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.6,
              similarity_boost: 0.75,
              speed: params.voice.speed ?? 1.0,
            },
          }),
        },
      );

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.error(`ElevenLabs TTS error ${response.status}: ${errBody}`);
        return { audioData: null, audioFormat: 'audio/mp3', audioUrl: null };
      }

      const buffer = await response.arrayBuffer();
      return {
        audioData: buffer,
        audioFormat: 'audio/mp3',
        audioUrl: null,
        durationMs: estimateDurationMs(params.text),
      };
    } catch (err) {
      console.error('ElevenLabs TTS error:', err);
      return { audioData: null, audioFormat: 'audio/mp3', audioUrl: null };
    }
  }
}

// ── Factory ──

export function getTTSProvider(name: TTSProviderName, env: Env): TTSProvider {
  switch (name) {
    case 'mock':
      return new MockTTSProvider();
    case 'cloudflare-ai':
      return new CloudflareAITTSProvider(env.AI);
    case 'openai-tts':
      return new OpenAITTSProvider(env.OPENAI_API_KEY);
    case 'elevenlabs':
      return new ElevenLabsTTSProvider(env.ELEVENLABS_API_KEY);
    default:
      throw Errors.unsupportedProvider('TTS', name);
  }
}

// ── Helpers ──

/** Rough estimate of speech duration from text length */
function estimateDurationMs(text: string): number {
  // Average speaking rate: ~150 words per minute
  const words = text.split(/\s+/).length;
  return Math.round((words / 150) * 60 * 1000);
}
